import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  Prisma,
  type TradingOrder,
  type TradingOrderStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { AccountCapabilityService } from '../../identity/access/account-capability.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { accountAuthority } from '../../finance/domain/journal';
import { allocateFifoLots } from '../../finance/domain/fifo';
import {
  normalizeLimitOrder,
  checkedGross,
  crosses,
  makerPrice,
} from '../domain/order';
import {
  assertMarketPolicy,
  feeMinor,
  tradingPolicy,
} from '../domain/trading-policy';
import { tradingTestFailurePoint } from './trading-test-failure-injection';
import { OutboxWriter } from '../../outbox/application/outbox-writer.service';
import {
  eventType,
  orderLifecycleEvent,
  tradeCompletedEvent,
} from '../../outbox/domain/domain-event';

type Db = Prisma.TransactionClient;
type OrderInput = {
  assetId: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT';
  timeInForce: 'GTC' | 'IOC';
  units: string;
  limitPriceMinor: string;
};
type OwnershipPreviewInput = {
  assetId: string;
  side: 'BUY' | 'SELL';
  desiredOwnershipPercent: string;
  limitPriceMinor?: string;
  timeInForce: 'GTC' | 'IOC';
};

const activeStatuses = ['OPEN', 'PARTIALLY_FILLED'] as const;

@Injectable()
export class TradingService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    private readonly outbox: OutboxWriter = new OutboxWriter(),
    @Optional() private readonly capabilities?: AccountCapabilityService,
  ) {}

  async preview(actor: Actor, input: OrderInput) {
    const market = await this.marketForInput(input.assetId);
    const normalized = normalizeLimitOrder({ ...input, ...market });
    const grossMinor = checkedGross(
      normalized.limitPriceMinor,
      normalized.units,
    );
    if (grossMinor < market.minimumNotionalMinor)
      throw conflict(
        'INVALID_ORDER_NOTIONAL',
        'Order does not satisfy the market minimum notional.',
      );
    const policyFeeMinor = feeMinor(
      grossMinor,
      normalized.side === 'BUY' ? market.takerFeeBps : market.makerFeeBps,
    );
    return {
      assetId: input.assetId,
      side: normalized.side,
      type: 'LIMIT',
      timeInForce: normalized.timeInForce,
      units: normalized.units.toString(),
      limitPriceMinor: normalized.limitPriceMinor.toString(),
      grossMinor: grossMinor.toString(),
      feeMinor: policyFeeMinor.toString(),
      feeApplication: tradingPolicy.fee.application,
      reservationMinor:
        normalized.side === 'BUY'
          ? (grossMinor + feeMinor(grossMinor, market.takerFeeBps)).toString()
          : null,
      reservationUnits:
        normalized.side === 'SELL' ? normalized.units.toString() : null,
      marketStatus: market.status,
      eligibility: actor.status === 'ACTIVE' ? 'ELIGIBLE' : 'INELIGIBLE',
    };
  }

  /**
   * Converts a customer-facing whole-collectible percentage into exact D14
   * ownership units and projects executable liquidity without creating an
   * order. The place() path still revalidates every value at reservation time.
   */
  async previewOwnership(actor: Actor, input: OwnershipPreviewInput) {
    const assetId = await this.resolveAssetId(input.assetId);
    const market = await this.marketForInput(assetId);
    const supply = await this.db.ownershipAssetSupply.findUnique({
      where: { assetId },
      select: { totalUnits: true, issuedUnits: true, status: true },
    });
    if (!supply || supply.status !== 'ACTIVE' || supply.totalUnits < 1n)
      throw conflict('OWNERSHIP_NOT_TRADABLE', 'Ownership issuance is not active for this asset.');

    const [asks, bids, snapshot, account, cashAccount] = await Promise.all([
      this.bookLevels(assetId, 'SELL', 100, 'asc'),
      this.bookLevels(assetId, 'BUY', 100, 'desc'),
      this.db.assetMarketSnapshot.findFirst({
        where: { assetId, status: 'LIVE' },
        orderBy: { asOf: 'desc' },
        select: { estimatedMarketValueMinor: true },
      }),
      this.db.ownershipAccount.findUnique({ where: { userId: actor.userId } }),
      this.db.financialAccount.findFirst({
        where: { ownerType: 'USER', ownerUserId: actor.userId, code: 'CASH_AVAILABLE', currency: 'GBP' },
        include: { balance: true },
      }),
    ]);
    const position = account
      ? await this.db.ownershipPosition.findUnique({ where: { assetId_accountId: { assetId, accountId: account.id } } })
      : null;
    const total = supply.totalUnits;
    const owned = position?.settledUnits ?? 0n;
    const availableOwned = position ? position.settledUnits - position.reservedUnits : 0n;
    const levels = input.side === 'BUY' ? asks : bids;
    const available = input.side === 'BUY'
      ? levels.reduce((sum, level) => sum + BigInt(level.units), 0n)
      : (availableOwned > 0n ? availableOwned : 0n);
    const bestBookPrice = levels[0] ? BigInt(levels[0].priceMinor) : null;
    const fallbackPrice = snapshot && total > 0n ? snapshot.estimatedMarketValueMinor / total : null;
    const marketPrice = bestBookPrice ?? fallbackPrice;
    const limitPrice = input.limitPriceMinor ? BigInt(input.limitPriceMinor) : marketPrice;
    const requestedBps = parseOwnershipBps(input.desiredOwnershipPercent);
    const numerator = requestedBps * total;
    const lowerSlices = numerator / 10_000n;
    const exact = numerator % 10_000n === 0n;
    const upperSlices = exact ? lowerSlices : lowerSlices + 1n;
    const requestedSlices = exact ? lowerSlices : null;
    const maximumExceeded = requestedSlices !== null && available > 0n && requestedSlices > available;
    const executable = requestedSlices && limitPrice
      ? executableProjection(levels, input.side, requestedSlices, limitPrice)
      : { units: 0n, gross: 0n, worst: null };
    const open = requestedSlices ? requestedSlices - executable.units : 0n;
    const grossAtLimit = requestedSlices && limitPrice ? requestedSlices * limitPrice : null;
    const fee = grossAtLimit === null ? null : feeMinor(grossAtLimit, input.side === 'BUY' ? market.takerFeeBps : market.makerFeeBps);
    const cashTotal = cashAccount?.balance
      ? accountAuthority(cashAccount.normalSide, cashAccount.balance.postedDebitMinor, cashAccount.balance.postedCreditMinor) - cashAccount.balance.reservedMinor
      : null;
    const onePercentSlices = total % 100n === 0n ? total / 100n : null;
    const onePercentValue = onePercentSlices !== null && marketPrice !== null ? onePercentSlices * marketPrice : null;
    return {
      assetId: input.assetId,
      side: input.side,
      requestedOwnershipPercent: input.desiredOwnershipPercent,
      requestedSlices: requestedSlices?.toString() ?? null,
      ownershipIncrementPercent: formatOwnershipPercent(1n, total),
      totalSlices: total.toString(),
      availableSlices: available.toString(),
      availableOwnershipPercent: formatOwnershipPercent(available, total),
      ownedSlices: owned.toString(),
      ownedOwnershipPercent: formatOwnershipPercent(owned, total),
      slicePriceMinor: marketPrice?.toString() ?? null,
      impliedWholeValueMinor: marketPrice === null ? null : (marketPrice * total).toString(),
      externalReferenceMinor: snapshot?.estimatedMarketValueMinor.toString() ?? null,
      onePercentSlices: onePercentSlices?.toString() ?? null,
      onePercentValueMinor: onePercentValue?.toString() ?? null,
      limitPriceMinor: limitPrice?.toString() ?? null,
      estimatedCostMinor: requestedSlices && limitPrice
        ? (executable.gross + (open > 0n && limitPrice ? open * limitPrice : 0n)).toString()
        : null,
      estimatedAveragePriceMinor: requestedSlices && requestedSlices > 0n && limitPrice
        ? ((executable.gross + (open > 0n ? open * limitPrice : 0n)) / requestedSlices).toString()
        : null,
      estimatedReservationMinor: grossAtLimit === null || fee === null ? null : (grossAtLimit + fee).toString(),
      feeMinor: fee?.toString() ?? null,
      executableSlices: executable.units.toString(),
      openSlices: open.toString(),
      bestMarketPriceMinor: bestBookPrice?.toString() ?? null,
      worstExpectedPriceMinor: executable.worst?.toString() ?? null,
      lowerSnap: { slices: lowerSlices.toString(), ownershipPercent: formatOwnershipPercent(lowerSlices, total) },
      upperSnap: exact ? null : { slices: upperSlices.toString(), ownershipPercent: formatOwnershipPercent(upperSlices, total) },
      hasImmediateLiquidity: executable.units > 0n,
      marketStatus: market.status,
      eligibility: actor.status === 'ACTIVE' ? 'ELIGIBLE' : 'INELIGIBLE',
      availableCashMinor: cashTotal?.toString() ?? null,
      cashShortfallMinor:
        input.side === 'BUY' && cashTotal !== null && grossAtLimit !== null && fee !== null && grossAtLimit + fee > cashTotal
          ? (grossAtLimit + fee - cashTotal).toString()
          : null,
      maximumExceeded,
    };
  }

  async publicOwnershipSummary(slug: string) {
    const asset = await this.db.asset.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Resource not found.' });
    const [market, supply, asks, bids, snapshot] = await Promise.all([
      this.db.tradingMarket.findUnique({ where: { assetId: asset.id } }),
      this.db.ownershipAssetSupply.findUnique({ where: { assetId: asset.id }, select: { totalUnits: true, status: true } }),
      this.bookLevels(asset.id, 'SELL', 100, 'asc'),
      this.bookLevels(asset.id, 'BUY', 100, 'desc'),
      this.db.assetMarketSnapshot.findFirst({ where: { assetId: asset.id, status: 'LIVE' }, orderBy: { asOf: 'desc' }, select: { estimatedMarketValueMinor: true } }),
    ]);
    const total = supply?.totalUnits ?? 0n;
    const available = asks.reduce((sum, level) => sum + BigInt(level.units), 0n);
    const bestAsk = asks[0] ? BigInt(asks[0].priceMinor) : null;
    const bestBid = bids[0] ? BigInt(bids[0].priceMinor) : null;
    const slicePrice = bestAsk ?? bestBid ?? (snapshot && total > 0n ? snapshot.estimatedMarketValueMinor / total : null);
    const onePercentSlices = total > 0n && total % 100n === 0n ? total / 100n : null;
    return {
      assetId: asset.id,
      totalSlices: total.toString(),
      availableSlices: available.toString(),
      availableOwnershipPercent: formatOwnershipPercent(available, total),
      ownershipIncrementPercent: formatOwnershipPercent(1n, total),
      slicePriceMinor: slicePrice?.toString() ?? null,
      impliedWholeValueMinor: slicePrice === null ? null : (slicePrice * total).toString(),
      externalReferenceMinor: snapshot?.estimatedMarketValueMinor.toString() ?? null,
      onePercentSlices: onePercentSlices?.toString() ?? null,
      onePercentValueMinor: onePercentSlices !== null && slicePrice !== null ? (onePercentSlices * slicePrice).toString() : null,
      bestAskMinor: bestAsk?.toString() ?? null,
      bestBidMinor: bestBid?.toString() ?? null,
      hasImmediateLiquidity: available > 0n,
      marketStatus: market?.status ?? 'CLOSED',
    };
  }

  async place(actor: Actor, input: OrderInput, requestId: string, key: string) {
    await this.capabilities?.require(
      actor,
      input.side === 'BUY' ? 'PLACE_BUY_ORDER' : 'PLACE_SELL_ORDER',
    );
    if (actor.status !== 'ACTIVE')
      throw conflict(
        'COMPLIANCE_REQUIRED',
        'Trading is unavailable for this account.',
      );
    // Public catalogue routes intentionally expose `Asset.publicId`, while
    // trading persists the canonical asset primary key.  Resolve the public
    // identifier at this authority boundary so a browser never needs a
    // database-only identifier to submit an order.
    const assetId = await this.resolveAssetId(input.assetId);
    const canonicalInput = { ...input, assetId };
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: 'trading.order.place',
      key,
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(canonicalInput))
      .digest('hex');
    const placed = await this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        requestHash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw conflict(
          'IDEMPOTENCY_KEY_CONFLICT',
          'The request key cannot be reused.',
        );
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return {
          ...(acquired.record.response!.body as { orderId: string }),
          replayed: true,
        };

      const market = await this.lockMarket(db, canonicalInput.assetId);
      const normalized = normalizeLimitOrder({ ...canonicalInput, ...market });
      await this.assertTradable(
        db,
        actor.userId,
        canonicalInput.assetId,
        market.status,
      );
      const orderId = randomUUID();
      const gross = checkedGross(normalized.limitPriceMinor, normalized.units);
      if (gross < market.minimumNotionalMinor)
        throw conflict(
          'INVALID_ORDER_NOTIONAL',
          'Order does not satisfy the market minimum notional.',
        );
      const priority = market.nextPrioritySequence;
      let cashReservationId: string | undefined;
      let ownershipReservationId: string | undefined;
      if (normalized.side === 'BUY') {
        const maximumFee = feeMinor(gross, market.takerFeeBps);
        cashReservationId = await this.reserveCash(
          db,
          actor.userId,
          orderId,
          gross + maximumFee,
        );
      } else {
        ownershipReservationId = await this.reserveUnits(
          db,
          actor.userId,
          canonicalInput.assetId,
          orderId,
          normalized.units,
        );
      }
      await tradingTestFailurePoint('order.after-reservation');
      const order = await db.tradingOrder.create({
        data: {
          id: orderId,
          userId: actor.userId,
          assetId: canonicalInput.assetId,
          side: normalized.side,
          type: 'LIMIT',
          timeInForce: normalized.timeInForce,
          status: 'OPEN',
          limitPriceMinor: normalized.limitPriceMinor,
          originalUnits: normalized.units,
          remainingUnits: normalized.units,
          filledUnits: 0n,
          prioritySequence: priority,
          cashReservationId,
          ownershipReservationId,
          idempotencyRecordId: acquired.record.id,
        },
      });
      await tradingTestFailurePoint('order.after-insert');
      await db.tradingMarket.update({
        where: { assetId: canonicalInput.assetId },
        data: {
          nextPrioritySequence: { increment: 1n },
          version: { increment: 1 },
        },
      });
      await this.history(db, order.id, null, 'OPEN', 'ORDER_OPENED');
      await this.outbox.append(
        db,
        orderLifecycleEvent({
          eventType: eventType.orderOpened,
          orderId: order.id,
          assetId: order.assetId,
          side: order.side,
          units: order.originalUnits.toString(),
          status: 'OPEN',
          actorUserId: actor.userId,
          correlationId: requestId,
          occurredAt: order.createdAt,
        }),
      );
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'TRADING_ORDER_OPENED',
        resourceType: 'trading-order',
        resourceId: order.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: {
          assetId: canonicalInput.assetId,
          side: order.side,
          units: order.originalUnits.toString(),
          limitPriceMinor: order.limitPriceMinor.toString(),
        },
        createdAt: new Date(),
      });
      const result = { orderId: order.id };
      await tx.idempotency.complete(
        identity,
        { status: 201, body: result },
        new Date(),
      );
      await tradingTestFailurePoint('order.before-commit');
      return { ...result, replayed: false };
    });
    if (!placed.replayed)
      await this.matchMarket(canonicalInput.assetId, actor, requestId);
    if (!placed.replayed && input.timeInForce === 'IOC')
      await this.cancelIocRemainder(placed.orderId);
    return this.orderForUser(actor.userId, placed.orderId);
  }

  async cancel(actor: Actor, orderId: string, requestId: string, key: string) {
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `trading.order.cancel:${orderId}`,
      key,
    };
    const hash = createHash('sha256').update(orderId).digest('hex');
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw conflict(
          'IDEMPOTENCY_KEY_CONFLICT',
          'The request key cannot be reused.',
        );
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body;
      const order = await this.lockOrder(db, orderId);
      if (order.userId !== actor.userId)
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found.',
        });
      if (
        !activeStatuses.includes(
          order.status as (typeof activeStatuses)[number],
        )
      )
        throw conflict('ORDER_NOT_CANCELLABLE', 'Order cannot be cancelled.');
      const updated = await this.closeOrder(
        db,
        order,
        'CANCELLED',
        'ORDER_CANCELLED',
      );
      await tradingTestFailurePoint('cancel.after-order-update');
      await this.releaseRemainder(db, order);
      await this.outbox.append(
        db,
        orderLifecycleEvent({
          eventType: eventType.orderCancelled,
          orderId: updated.id,
          assetId: updated.assetId,
          side: updated.side,
          units: updated.originalUnits.toString(),
          status: 'CANCELLED',
          actorUserId: actor.userId,
          correlationId: requestId,
          occurredAt: updated.updatedAt,
        }),
      );
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'TRADING_ORDER_CANCELLED',
        resourceType: 'trading-order',
        resourceId: order.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { assetId: order.assetId },
        createdAt: new Date(),
      });
      const result = this.publicOrder(updated);
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
    });
  }

  /**
   * Bounded internal sweep. GTC/IOC placement does not assign a TTL; only an
   * explicitly configured/persisted expiry timestamp is eligible. Repeated
   * sweeps are therefore a stable no-op after the first terminal transition.
   */
  async expireOrders(now: Date, limit = 100, requestId = 'trading-expiry') {
    const candidates = await this.db.tradingOrder.findMany({
      where: {
        status: { in: [...activeStatuses] },
        expiresAt: { lte: now },
      },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true },
    });
    let expired = 0;
    for (const candidate of candidates) {
      const didExpire = await this.db.$transaction(async (db) => {
        const order = await this.lockOrder(db, candidate.id);
        if (
          !activeStatuses.includes(
            order.status as (typeof activeStatuses)[number],
          ) ||
          !order.expiresAt ||
          order.expiresAt > now
        )
          return false;
        const updated = await this.closeOrder(
          db,
          order,
          'EXPIRED',
          'ORDER_EXPIRED',
        );
        await tradingTestFailurePoint('expiry.after-order-update');
        await this.releaseRemainder(db, order);
        const tx = createIdentityTransaction(db);
        await tx.audit.append({
          id: randomUUID(),
          actorUserId: null,
          actorType: 'SYSTEM',
          action: 'TRADING_ORDER_EXPIRED',
          resourceType: 'trading-order',
          resourceId: updated.id,
          requestId,
          sessionId: null,
          result: 'SUCCESS',
          metadata: { assetId: order.assetId },
          createdAt: new Date(),
        });
        return true;
      });
      if (didExpire) expired += 1;
    }
    return { expired };
  }

  async matchMarket(
    assetId: string,
    actor: Actor,
    requestId: string,
    maxExecutions = 100,
  ) {
    const executions: Array<{ executionId: string }> = [];
    for (let count = 0; count < maxExecutions; count += 1) {
      const execution = await this.db.$transaction(async (db) => {
        const market = await this.lockMarket(db, assetId);
        if (market.status !== 'OPEN') return null;
        const [buy, sell] = await Promise.all([
          db.tradingOrder.findFirst({
            where: {
              assetId,
              side: 'BUY',
              status: { in: [...activeStatuses] },
            },
            orderBy: [{ limitPriceMinor: 'desc' }, { prioritySequence: 'asc' }],
          }),
          db.tradingOrder.findFirst({
            where: {
              assetId,
              side: 'SELL',
              status: { in: [...activeStatuses] },
            },
            orderBy: [{ limitPriceMinor: 'asc' }, { prioritySequence: 'asc' }],
          }),
        ]);
        if (
          !buy ||
          !sell ||
          !crosses(buy.limitPriceMinor, sell.limitPriceMinor)
        )
          return null;
        const [firstId, secondId] = [buy.id, sell.id].sort();
        await db.$queryRaw`SELECT id FROM "TradingOrder" WHERE id IN (${Prisma.join([firstId, secondId])}) ORDER BY id FOR UPDATE`;
        const locked = await db.tradingOrder.findMany({
          where: { id: { in: [buy.id, sell.id] } },
        });
        const lockedBuy = locked.find((order) => order.id === buy.id)!;
        const lockedSell = locked.find((order) => order.id === sell.id)!;
        if (
          !activeStatuses.includes(
            lockedBuy.status as (typeof activeStatuses)[number],
          ) ||
          !activeStatuses.includes(
            lockedSell.status as (typeof activeStatuses)[number],
          ) ||
          !crosses(lockedBuy.limitPriceMinor, lockedSell.limitPriceMinor)
        )
          return null;
        await tradingTestFailurePoint('execution.after-lock');
        if (lockedBuy.userId === lockedSell.userId) {
          const taker =
            (lockedBuy.prioritySequence ?? 0n) >
            (lockedSell.prioritySequence ?? 0n)
              ? lockedBuy
              : lockedSell;
          await this.releaseRemainder(db, taker);
          await this.closeOrder(db, taker, 'CANCELLED', 'SELF_TRADE_PREVENTED');
          return { executionId: '' };
        }
        return this.settleExecution(
          db,
          market,
          lockedBuy,
          lockedSell,
          actor,
          requestId,
        );
      });
      if (!execution) break;
      if (execution.executionId) executions.push(execution);
    }
    return { executions };
  }

  async ownOrders(userId: string, cursor?: string, limit = 20) {
    const rows = await this.db.tradingOrder.findMany({
      // Archived assets remain in the audit ledger, but are no longer part of
      // a customer's active catalogue or current Orders workspace.
      where: {
        userId,
        asset: { status: 'PUBLISHED' },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: { asset: { select: { slug: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => this.publicOrder(row, row.asset.slug)),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** Compact, customer-safe D14 projection for authenticated companion
   * surfaces. Trading mutations remain exclusively in the web workflow. */
  async customerOpenOrderSummary(userId: string) {
    const where = {
      userId,
      status: { in: [...activeStatuses] },
      asset: { status: 'PUBLISHED' as const },
    };
    const [openCount, rows] = await Promise.all([
      this.db.tradingOrder.count({ where }),
      this.db.tradingOrder.findMany({
      where: {
        userId,
        status: { in: [...activeStatuses] },
        asset: { status: 'PUBLISHED' },
      },
      include: { asset: { select: { slug: true, title: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
      }),
    ]);
    return {
      openCount,
      recent: rows.map((row) => ({
        assetTitle: row.asset.title,
        assetSlug: row.asset.slug,
        side: row.side,
        status: row.status,
        remainingUnits: row.remainingUnits.toString(),
        filledUnits: row.filledUnits.toString(),
        limitPriceMinor: row.limitPriceMinor.toString(),
        currency: 'GBP' as const,
      })),
    };
  }

  async ownExecutions(userId: string, cursor?: string, limit = 20) {
    const before = cursor ? this.executionCursor(cursor, userId) : undefined;
    const rows = await this.db.tradingExecution.findMany({
      where: {
        AND: [
          {
            OR: [{ buyOrder: { userId } }, { sellOrder: { userId } }],
          },
          { asset: { status: 'PUBLISHED' } },
          ...(before
            ? [
                {
                  OR: [
                    { executedAt: { lt: before.executedAt } },
                    { executedAt: before.executedAt, id: { lt: before.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        asset: { select: { slug: true } },
        buyOrder: { select: { userId: true } },
      },
      orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        executionId: row.id,
        assetSlug: row.asset.slug,
        side: row.buyOrder.userId === userId ? 'BUY' : 'SELL',
        units: row.units.toString(),
        priceMinor: row.priceMinor.toString(),
        feeMinor:
          row.buyOrder.userId === userId
            ? row.buyerFeeMinor.toString()
            : row.sellerFeeMinor.toString(),
        settlementStatus: row.settlementStatus,
        marketSequence: row.marketSequence.toString(),
        executedAt: row.executedAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && page.at(-1)
          ? this.encodeExecutionCursor(page.at(-1)!, userId)
          : null,
    };
  }

  async orderForUser(userId: string, orderId: string) {
    const order = await this.db.tradingOrder.findFirst({
      where: { id: orderId, userId },
      include: { asset: { select: { slug: true } } },
    });
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    return this.publicOrder(order, order.asset.slug);
  }

  async publicBook(slug: string, depth: number) {
    const asset = await this.db.asset.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Resource not found.',
      });
    const market = await this.db.tradingMarket.findUnique({
      where: { assetId: asset.id },
    });
    if (!market)
      return {
        status: 'CLOSED',
        marketSequence: '0',
        bids: [],
        asks: [],
        asOf: new Date().toISOString(),
      };
    const [bids, asks] = await Promise.all([
      this.bookLevels(asset.id, 'BUY', depth, 'desc'),
      this.bookLevels(asset.id, 'SELL', depth, 'asc'),
    ]);
    return {
      status: market.status,
      marketSequence: (market.nextExecutionSequence - 1n).toString(),
      bids,
      asks,
      asOf: market.updatedAt.toISOString(),
    };
  }

  async recentTrades(slug: string, cursor?: string, limit = 20) {
    const asset = await this.db.asset.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Resource not found.',
      });
    const rows = await this.db.tradingExecution.findMany({
      where: { assetId: asset.id, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        priceMinor: row.priceMinor.toString(),
        units: row.units.toString(),
        executedAt: row.executedAt.toISOString(),
        marketSequence: row.marketSequence.toString(),
      })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async setMarketStatus(
    actor: Actor,
    assetId: string,
    status: 'OPEN' | 'HALTED' | 'CLOSED',
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `trading.market.${status}:${assetId}`,
      key,
    };
    const hash = createHash('sha256')
      .update(`${assetId}\n${status}`)
      .digest('hex');
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw conflict(
          'IDEMPOTENCY_KEY_CONFLICT',
          'The request key cannot be reused.',
        );
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as {
          assetId: string;
          status: string;
        };
      const market = await this.lockMarket(db, assetId);
      const updated = await db.tradingMarket.update({
        where: { assetId },
        data: { status, version: { increment: 1 } },
      });
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'TRADING_MARKET_STATUS_CHANGED',
        resourceType: 'trading-market',
        resourceId: assetId,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { assetId, fromStatus: market.status, toStatus: status },
        createdAt: new Date(),
      });
      const result = { assetId, status: updated.status };
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
    });
  }

  private async settleExecution(
    db: Db,
    market: {
      assetId: string;
      nextExecutionSequence: bigint;
      makerFeeBps: number;
      takerFeeBps: number;
    },
    buy: TradingOrder,
    sell: TradingOrder,
    actor: Actor,
    requestId: string,
  ) {
    const units =
      buy.remainingUnits < sell.remainingUnits
        ? buy.remainingUnits
        : sell.remainingUnits;
    const price = makerPrice({
      buyPriority: buy.prioritySequence!,
      sellPriority: sell.prioritySequence!,
      buyPriceMinor: buy.limitPriceMinor,
      sellPriceMinor: sell.limitPriceMinor,
    });
    const gross = checkedGross(price, units);
    const buyIsMaker = buy.prioritySequence! < sell.prioritySequence!;
    const buyerFee = feeMinor(
      gross,
      buyIsMaker ? market.makerFeeBps : market.takerFeeBps,
    );
    const sellerFee = feeMinor(
      gross,
      buyIsMaker ? market.takerFeeBps : market.makerFeeBps,
    );
    const sequence = market.nextExecutionSequence;
    const correlationId = `trade:${market.assetId}:${sequence}`;
    await this.settleOwnership(
      db,
      market.assetId,
      sell.userId,
      buy.userId,
      sell,
      units,
      correlationId,
    );
    await tradingTestFailurePoint('execution.after-ownership');
    await this.settleCash(
      db,
      buy.userId,
      sell.userId,
      buy,
      units,
      gross,
      buyerFee,
      sellerFee,
      market.takerFeeBps,
      correlationId,
    );
    await tradingTestFailurePoint('execution.after-cash');
    await this.disposeSellerLots(
      db,
      sell.userId,
      market.assetId,
      units,
      gross,
      sellerFee,
      correlationId,
    );
    await this.createBuyerLot(
      db,
      buy.userId,
      market.assetId,
      units,
      gross + buyerFee,
      correlationId,
    );
    const execution = await db.tradingExecution.create({
      data: {
        id: randomUUID(),
        assetId: market.assetId,
        buyOrderId: buy.id,
        sellOrderId: sell.id,
        makerOrderId: buyIsMaker ? buy.id : sell.id,
        takerOrderId: buyIsMaker ? sell.id : buy.id,
        priceMinor: price,
        units,
        grossMinor: gross,
        buyerFeeMinor: buyerFee,
        sellerFeeMinor: sellerFee,
        marketSequence: sequence,
        correlationId,
      },
    });
    await tradingTestFailurePoint('execution.after-execution-create');
    await this.outbox.append(
      db,
      tradeCompletedEvent({
        executionId: execution.id,
        assetId: execution.assetId,
        units: execution.units.toString(),
        priceMinor: execution.priceMinor.toString(),
        grossMinor: execution.grossMinor.toString(),
        currency: 'GBP',
        correlationId: execution.correlationId,
        occurredAt: execution.executedAt,
      }),
    );
    await tradingTestFailurePoint('execution.after-outbox-append');
    await db.tradingMarket.update({
      where: { assetId: market.assetId },
      data: {
        nextExecutionSequence: { increment: 1n },
        version: { increment: 1 },
      },
    });
    await this.applyFill(db, buy, units, price);
    await this.applyFill(db, sell, units, price);
    await tradingTestFailurePoint('execution.after-order-updates');
    const tx = createIdentityTransaction(db);
    await tx.audit.append({
      id: randomUUID(),
      actorUserId: actor.userId,
      actorType: 'SYSTEM',
      action: 'TRADING_EXECUTION_SETTLED',
      resourceType: 'trading-execution',
      resourceId: execution.id,
      requestId,
      sessionId: null,
      result: 'SUCCESS',
      metadata: {
        assetId: market.assetId,
        units: units.toString(),
        priceMinor: price.toString(),
        marketSequence: sequence.toString(),
      },
      createdAt: new Date(),
    });
    return { executionId: execution.id };
  }

  private async applyFill(
    db: Db,
    order: TradingOrder,
    units: bigint,
    price: bigint,
  ) {
    const priorRemaining = BigInt(order.remainingUnits);
    const priorFilled = BigInt(order.filledUnits);
    const priorAverage = BigInt(order.averageFillPriceMinor ?? 0);
    const remaining = priorRemaining - units;
    const filled = priorFilled + units;
    const weighted = (priorAverage * priorFilled + price * units) / filled;
    const status = remaining === 0n ? 'FILLED' : 'PARTIALLY_FILLED';
    const updated = await db.tradingOrder.update({
      where: { id: order.id },
      data: {
        remainingUnits: remaining,
        filledUnits: filled,
        averageFillPriceMinor: weighted,
        status,
        closedAt: remaining === 0n ? new Date() : null,
        version: { increment: 1 },
      },
    });
    await this.history(db, order.id, order.status, status, 'EXECUTION_SETTLED');
    if (remaining === 0n) await this.markReservationConsumed(db, updated);
  }

  private async reserveCash(
    db: Db,
    userId: string,
    orderId: string,
    amount: bigint,
  ) {
    const account = await this.cashAccount(db, userId);
    await this.lockFinancialAccounts(db, [account.id]);
    const balance = await this.lockBalance(db, account.id);
    const total = accountAuthority(
      account.normalSide,
      balance?.postedDebitMinor ?? 0n,
      balance?.postedCreditMinor ?? 0n,
    );
    if (total - (balance?.reservedMinor ?? 0n) < amount)
      throw conflict('INSUFFICIENT_FUNDS', 'Insufficient available funds.');
    const reservation = await db.cashReservation.create({
      data: {
        id: randomUUID(),
        accountId: account.id,
        purposeType: 'TRADING_ORDER',
        purposeId: orderId,
        amountMinor: amount,
      },
    });
    await db.accountBalance.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, reservedMinor: amount },
      update: {
        reservedMinor: { increment: amount },
        version: { increment: 1 },
      },
    });
    return reservation.id;
  }

  private async reserveUnits(
    db: Db,
    userId: string,
    assetId: string,
    orderId: string,
    units: bigint,
  ) {
    const account = await this.ownershipAccount(db, userId);
    await this.lockPositions(db, assetId, [account.id]);
    const position = await db.ownershipPosition.findUnique({
      where: { assetId_accountId: { assetId, accountId: account.id } },
    });
    if (!position || position.settledUnits - position.reservedUnits < units)
      throw conflict(
        'INSUFFICIENT_OWNERSHIP',
        'Insufficient available ownership units.',
      );
    const reservation = await db.ownershipReservation.create({
      data: {
        id: randomUUID(),
        assetId,
        accountId: account.id,
        purposeType: 'TRADING_ORDER',
        purposeId: orderId,
        units,
      },
    });
    await db.ownershipPosition.update({
      where: { id: position.id },
      data: { reservedUnits: { increment: units }, version: { increment: 1 } },
    });
    return reservation.id;
  }

  private async settleCash(
    db: Db,
    buyerId: string,
    sellerId: string,
    order: TradingOrder,
    units: bigint,
    gross: bigint,
    buyerFee: bigint,
    sellerFee: bigint,
    maximumBuyerFeeBps: number,
    correlationId: string,
  ) {
    const [buyer, seller, fees] = await Promise.all([
      this.cashAccount(db, buyerId),
      this.cashAccount(db, sellerId),
      this.feeAccount(db),
    ]);
    await this.lockFinancialAccounts(db, [buyer.id, seller.id, fees.id]);
    const reserveReduction =
      checkedGross(order.limitPriceMinor, units) +
      feeMinor(checkedGross(order.limitPriceMinor, units), maximumBuyerFeeBps);
    const reservation = await db.cashReservation.findUnique({
      where: { id: order.cashReservationId! },
    });
    if (!reservation || reservation.status !== 'ACTIVE')
      throw conflict('SETTLEMENT_CONFLICT', 'Cash reservation is unavailable.');
    const buyerBalance = await this.lockBalance(db, buyer.id);
    if ((buyerBalance?.reservedMinor ?? 0n) < reserveReduction)
      throw conflict(
        'SETTLEMENT_INVARIANT_VIOLATION',
        'Cash reservation invariant failed.',
      );
    await db.accountBalance.update({
      where: { accountId: buyer.id },
      data: {
        reservedMinor: { decrement: reserveReduction },
        postedDebitMinor: { increment: gross + buyerFee },
        version: { increment: 1 },
      },
    });
    await db.accountBalance.upsert({
      where: { accountId: seller.id },
      create: { accountId: seller.id, postedCreditMinor: gross - sellerFee },
      update: {
        postedCreditMinor: { increment: gross - sellerFee },
        version: { increment: 1 },
      },
    });
    if (buyerFee + sellerFee > 0n)
      await db.accountBalance.upsert({
        where: { accountId: fees.id },
        create: { accountId: fees.id, postedCreditMinor: buyerFee + sellerFee },
        update: {
          postedCreditMinor: { increment: buyerFee + sellerFee },
          version: { increment: 1 },
        },
      });
    const journal = await db.journalTransaction.create({
      data: {
        id: randomUUID(),
        type: 'TRADE_SETTLEMENT',
        currency: 'GBP',
        correlationId,
        descriptionCode: 'TRADING_EXECUTION_WITH_FEE',
        createdByUserId: buyerId,
      },
    });
    await db.journalEntry.createMany({
      data: [
        {
          id: randomUUID(),
          transactionId: journal.id,
          sequence: 1,
          accountId: buyer.id,
          side: 'DEBIT',
          amountMinor: gross + buyerFee,
          currency: 'GBP',
        },
        {
          id: randomUUID(),
          transactionId: journal.id,
          sequence: 2,
          accountId: seller.id,
          side: 'CREDIT',
          amountMinor: gross - sellerFee,
          currency: 'GBP',
        },
        ...(buyerFee + sellerFee > 0n
          ? [
              {
                id: randomUUID(),
                transactionId: journal.id,
                sequence: 3,
                accountId: fees.id,
                side: 'CREDIT' as const,
                amountMinor: buyerFee + sellerFee,
                currency: 'GBP',
              },
            ]
          : []),
      ],
    });
  }

  private async settleOwnership(
    db: Db,
    assetId: string,
    sellerId: string,
    buyerId: string,
    order: TradingOrder,
    units: bigint,
    correlationId: string,
  ) {
    const [seller, buyer] = await Promise.all([
      this.ownershipAccount(db, sellerId),
      this.ownershipAccount(db, buyerId),
    ]);
    await this.lockPositions(db, assetId, [seller.id, buyer.id]);
    const sellerPosition = await db.ownershipPosition.findUnique({
      where: { assetId_accountId: { assetId, accountId: seller.id } },
    });
    if (
      !sellerPosition ||
      sellerPosition.settledUnits < units ||
      sellerPosition.reservedUnits < units
    )
      throw conflict(
        'SETTLEMENT_CONFLICT',
        'Ownership reservation is unavailable.',
      );
    const buyerPosition = await db.ownershipPosition.upsert({
      where: { assetId_accountId: { assetId, accountId: buyer.id } },
      create: { id: randomUUID(), assetId, accountId: buyer.id },
      update: {},
    });
    await db.ownershipPosition.update({
      where: { id: sellerPosition.id },
      data: {
        settledUnits: { decrement: units },
        reservedUnits: { decrement: units },
        version: { increment: 1 },
      },
    });
    await db.ownershipPosition.update({
      where: { id: buyerPosition.id },
      data: { settledUnits: { increment: units }, version: { increment: 1 } },
    });
    const supply = await db.ownershipAssetSupply.findUnique({
      where: { assetId },
    });
    if (!supply)
      throw conflict(
        'SETTLEMENT_INVARIANT_VIOLATION',
        'Ownership supply is unavailable.',
      );
    await db.ownershipLedgerEntry.create({
      data: {
        id: randomUUID(),
        assetId,
        sequence: supply.nextSequence,
        entryType: 'TRANSFER',
        debitAccountId: seller.id,
        creditAccountId: buyer.id,
        units,
        correlationId,
        actorUserId: sellerId,
      },
    });
    await db.ownershipAssetSupply.update({
      where: { assetId },
      data: { nextSequence: { increment: 1n } },
    });
  }

  private async disposeSellerLots(
    db: Db,
    userId: string,
    assetId: string,
    units: bigint,
    gross: bigint,
    fee: bigint,
    correlation: string,
  ) {
    await db.$queryRaw`SELECT id FROM "PortfolioLot" WHERE "userId" = ${userId} AND "assetId" = ${assetId} ORDER BY "acquiredAt", id FOR UPDATE`;
    const lots = await db.portfolioLot.findMany({
      where: { userId, assetId, status: 'OPEN' },
      include: { disposals: { select: { allocatedCostMinor: true } } },
      orderBy: [{ acquiredAt: 'asc' }, { id: 'asc' }],
    });
    const allocations = allocateFifoLots(
      lots.map((lot) => ({
        id: lot.id,
        acquiredAt: lot.acquiredAt,
        acquiredUnits: lot.acquiredUnits,
        remainingUnits: lot.remainingUnits,
        totalCostMinor: lot.totalCostMinor,
        allocatedCostMinor: lot.disposals.reduce(
          (sum, item) => sum + item.allocatedCostMinor,
          0n,
        ),
      })),
      units,
    );
    let allocatedProceeds = 0n;
    let allocatedFees = 0n;
    for (const [index, allocation] of allocations.entries()) {
      const isLast = index === allocations.length - 1;
      const proceedsMinor = isLast
        ? gross - allocatedProceeds
        : (gross * allocation.units) / units;
      const feeMinorForLot = isLast
        ? fee - allocatedFees
        : (fee * allocation.units) / units;
      allocatedProceeds += proceedsMinor;
      allocatedFees += feeMinorForLot;
      const lot = lots.find((item) => item.id === allocation.lotId)!;
      const remaining = lot.remainingUnits - allocation.units;
      await db.portfolioLot.update({
        where: { id: lot.id },
        data: {
          remainingUnits: remaining,
          status: remaining === 0n ? 'CLOSED' : 'OPEN',
        },
      });
      await db.lotDisposal.create({
        data: {
          id: randomUUID(),
          lotId: lot.id,
          sourceReference: `${correlation}:${index + 1}`,
          units: allocation.units,
          allocatedCostMinor: allocation.allocatedCostMinor,
          proceedsMinor,
          feeMinor: feeMinorForLot,
          realizedPnlMinor:
            proceedsMinor - feeMinorForLot - allocation.allocatedCostMinor,
        },
      });
    }
  }

  private async createBuyerLot(
    db: Db,
    userId: string,
    assetId: string,
    units: bigint,
    gross: bigint,
    sourceReference: string,
  ) {
    await db.portfolioLot.create({
      data: {
        id: randomUUID(),
        userId,
        assetId,
        acquiredUnits: units,
        remainingUnits: units,
        totalCostMinor: gross,
        currency: 'GBP',
        sourceReference,
      },
    });
  }

  private async markReservationConsumed(db: Db, order: TradingOrder) {
    if (order.side === 'BUY' && order.cashReservationId)
      await db.cashReservation.update({
        where: { id: order.cashReservationId },
        data: { status: 'CONSUMED' },
      });
    if (order.side === 'SELL' && order.ownershipReservationId)
      await db.ownershipReservation.update({
        where: { id: order.ownershipReservationId },
        data: { status: 'CONSUMED' },
      });
  }

  private async releaseRemainder(db: Db, order: TradingOrder) {
    if (order.remainingUnits === 0n) return;
    if (order.side === 'BUY') {
      const market = await db.tradingMarket.findUnique({
        where: { assetId: order.assetId },
        select: { takerFeeBps: true },
      });
      if (!market)
        throw conflict(
          'SETTLEMENT_INVARIANT_VIOLATION',
          'Trading market is unavailable.',
        );
      const gross = checkedGross(order.limitPriceMinor, order.remainingUnits);
      const amount = gross + feeMinor(gross, market.takerFeeBps);
      const reservation = await db.cashReservation.findUnique({
        where: { id: order.cashReservationId! },
      });
      if (reservation?.status === 'ACTIVE') {
        await this.lockBalance(db, reservation.accountId);
        await db.accountBalance.update({
          where: { accountId: reservation.accountId },
          data: {
            reservedMinor: { decrement: amount },
            version: { increment: 1 },
          },
        });
        await db.cashReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });
      }
    } else {
      const reservation = await db.ownershipReservation.findUnique({
        where: { id: order.ownershipReservationId! },
      });
      if (reservation?.status === 'ACTIVE') {
        const position = await db.ownershipPosition.findUnique({
          where: {
            assetId_accountId: {
              assetId: reservation.assetId,
              accountId: reservation.accountId,
            },
          },
        });
        if (!position || position.reservedUnits < order.remainingUnits)
          throw conflict(
            'SETTLEMENT_INVARIANT_VIOLATION',
            'Ownership reservation invariant failed.',
          );
        await db.ownershipPosition.update({
          where: { id: position.id },
          data: {
            reservedUnits: { decrement: order.remainingUnits },
            version: { increment: 1 },
          },
        });
        await db.ownershipReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });
      }
    }
  }

  private async cancelIocRemainder(orderId: string) {
    await this.db.$transaction(async (db) => {
      const order = await this.lockOrder(db, orderId);
      if (
        !activeStatuses.includes(
          order.status as (typeof activeStatuses)[number],
        )
      )
        return;
      await this.releaseRemainder(db, order);
      await this.closeOrder(db, order, 'CANCELLED', 'IOC_REMAINDER_CANCELLED');
    });
  }

  private async closeOrder(
    db: Db,
    order: TradingOrder,
    status: 'CANCELLED' | 'EXPIRED' | 'REJECTED',
    reason: string,
  ) {
    const updated = await db.tradingOrder.update({
      where: { id: order.id },
      data: { status, closedAt: new Date(), version: { increment: 1 } },
    });
    await this.history(db, order.id, order.status, status, reason);
    return updated;
  }

  private async bookLevels(
    assetId: string,
    side: 'BUY' | 'SELL',
    depth: number,
    direction: 'asc' | 'desc',
  ) {
    const rows = await this.db.tradingOrder.groupBy({
      by: ['limitPriceMinor'],
      where: { assetId, side, status: { in: [...activeStatuses] } },
      _sum: { remainingUnits: true },
      orderBy: { limitPriceMinor: direction },
      take: depth,
    });
    return rows.map((row) => ({
      priceMinor: row.limitPriceMinor.toString(),
      units: (row._sum.remainingUnits ?? 0n).toString(),
    }));
  }

  private publicOrder(order: TradingOrder, assetSlug?: string) {
    return {
      id: order.id,
      assetId: order.assetId,
      assetSlug: assetSlug ?? null,
      side: order.side,
      type: order.type,
      timeInForce: order.timeInForce,
      status: order.status,
      limitPriceMinor: order.limitPriceMinor.toString(),
      originalUnits: order.originalUnits.toString(),
      remainingUnits: order.remainingUnits.toString(),
      filledUnits: order.filledUnits.toString(),
      averageFillPriceMinor: order.averageFillPriceMinor?.toString() ?? null,
      createdAt: order.createdAt.toISOString(),
      closedAt: order.closedAt?.toISOString() ?? null,
    };
  }

  private async marketForInput(assetId: string) {
    const canonicalAssetId = await this.resolveAssetId(assetId);
    const market = await this.db.tradingMarket.findUnique({
      where: { assetId: canonicalAssetId },
    });
    if (!market)
      throw conflict('MARKET_NOT_OPEN', 'Trading market is not open.');
    assertMarketPolicy(market);
    return market;
  }
  private async resolveAssetId(value: string) {
    const asset = await this.db.asset.findFirst({
      where: { OR: [{ id: value }, { publicId: value }] },
      select: { id: true },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Resource not found.',
      });
    return asset.id;
  }
  private encodeExecutionCursor(
    execution: { id: string; executedAt: Date },
    userId: string,
  ) {
    return Buffer.from(
      JSON.stringify({
        scope: 'trading.executions.v1',
        userId,
        executedAt: execution.executedAt.toISOString(),
        id: execution.id,
      }),
    ).toString('base64url');
  }
  private executionCursor(cursor: string, userId: string) {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as {
        scope?: string;
        userId?: string;
        executedAt?: string;
        id?: string;
      };
      const executedAt = new Date(parsed.executedAt ?? '');
      if (
        parsed.scope !== 'trading.executions.v1' ||
        parsed.userId !== userId ||
        !parsed.id ||
        Number.isNaN(executedAt.getTime())
      )
        throw new Error('invalid');
      return { id: parsed.id, executedAt };
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'Cursor is invalid.',
      });
    }
  }
  private async lockMarket(db: Db, assetId: string) {
    await db.$queryRaw`SELECT "assetId" FROM "TradingMarket" WHERE "assetId" = ${assetId} FOR UPDATE`;
    const market = await db.tradingMarket.findUnique({ where: { assetId } });
    if (!market)
      throw conflict('MARKET_NOT_OPEN', 'Trading market is not open.');
    assertMarketPolicy(market);
    return market;
  }
  private async assertTradable(
    db: Db,
    userId: string,
    assetId: string,
    marketStatus: string,
  ) {
    if (marketStatus !== 'OPEN')
      throw conflict('MARKET_NOT_OPEN', 'Trading market is not open.');
    const [user, asset, supply] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.asset.findUnique({ where: { id: assetId } }),
      db.ownershipAssetSupply.findUnique({ where: { assetId } }),
    ]);
    if (user?.accountStatus !== 'ACTIVE')
      throw conflict(
        'COMPLIANCE_REQUIRED',
        'Trading is unavailable for this account.',
      );
    if (asset?.status !== 'PUBLISHED' || supply?.status !== 'ACTIVE')
      throw conflict('ASSET_NOT_TRADABLE', 'Asset is not tradable.');
  }
  private async lockOrder(db: Db, id: string) {
    await db.$queryRaw`SELECT id FROM "TradingOrder" WHERE id = ${id} FOR UPDATE`;
    const order = await db.tradingOrder.findUnique({ where: { id } });
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    return order;
  }
  private async history(
    db: Db,
    orderId: string,
    fromStatus: TradingOrderStatus | null,
    toStatus: TradingOrderStatus,
    reasonCode: string,
  ) {
    await db.orderStatusHistory.create({
      data: { id: randomUUID(), orderId, fromStatus, toStatus, reasonCode },
    });
  }
  private async cashAccount(db: Db, userId: string) {
    await this.lockUsers(db, [userId]);
    return (
      (await db.financialAccount.findFirst({
        where: {
          ownerType: 'USER',
          ownerUserId: userId,
          code: 'CASH_AVAILABLE',
          currency: 'GBP',
        },
      })) ??
      db.financialAccount.create({
        data: {
          id: randomUUID(),
          ownerType: 'USER',
          ownerUserId: userId,
          accountType: 'LIABILITY',
          code: 'CASH_AVAILABLE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
      })
    );
  }
  private async feeAccount(db: Db) {
    return (
      (await db.financialAccount.findFirst({
        where: {
          ownerType: 'PLATFORM',
          code: 'TRADING_FEE_REVENUE',
          currency: 'GBP',
        },
      })) ??
      db.financialAccount.create({
        data: {
          id: randomUUID(),
          ownerType: 'PLATFORM',
          accountType: 'REVENUE',
          code: 'TRADING_FEE_REVENUE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
      })
    );
  }
  private async ownershipAccount(db: Db, userId: string) {
    await this.lockUsers(db, [userId]);
    return (
      (await db.ownershipAccount.findUnique({ where: { userId } })) ??
      db.ownershipAccount.create({
        data: { id: randomUUID(), type: 'USER', userId, status: 'ACTIVE' },
      })
    );
  }
  private async lockUsers(db: Db, userIds: string[]) {
    const ids = [...new Set(userIds)].sort();
    await db.$queryRaw`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  }
  private async lockPositions(db: Db, assetId: string, accountIds: string[]) {
    const ids = [...new Set(accountIds)].sort();
    await db.$queryRaw`SELECT "accountId" FROM "OwnershipPosition" WHERE "assetId" = ${assetId} AND "accountId" IN (${Prisma.join(ids)}) ORDER BY "accountId" FOR UPDATE`;
  }
  private async lockFinancialAccounts(db: Db, accountIds: string[]) {
    const ids = [...new Set(accountIds)].sort();
    await db.$queryRaw`SELECT id FROM "FinancialAccount" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  }
  private async lockBalance(db: Db, accountId: string) {
    await db.$queryRaw`SELECT "accountId" FROM "AccountBalance" WHERE "accountId" = ${accountId} FOR UPDATE`;
    return db.accountBalance.findUnique({ where: { accountId } });
  }
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

function parseOwnershipBps(value: string) {
  const [whole, fraction = ''] = value.split('.');
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  if (bps < 0n || bps > 10_000n) throw conflict('INVALID_OWNERSHIP_PERCENT', 'Ownership percentage must be between 0% and 100%.');
  return bps;
}

function formatOwnershipPercent(units: bigint, total: bigint) {
  if (total < 1n) return '0';
  const scaled = (units * 10_000n * 10_000n) / total;
  const whole = scaled / 10_000n;
  const fraction = (scaled % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function executableProjection(
  levels: Array<{ priceMinor: string; units: string }>,
  side: 'BUY' | 'SELL',
  requested: bigint,
  limit: bigint,
) {
  let remaining = requested;
  let units = 0n;
  let gross = 0n;
  let worst: bigint | null = null;
  for (const level of levels) {
    const price = BigInt(level.priceMinor);
    if ((side === 'BUY' && price > limit) || (side === 'SELL' && price < limit)) break;
    const fill = remaining < BigInt(level.units) ? remaining : BigInt(level.units);
    if (fill <= 0n) break;
    units += fill;
    gross += fill * price;
    worst = price;
    remaining -= fill;
    if (remaining === 0n) break;
  }
  return { units, gross, worst };
}
