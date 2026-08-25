import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { financeTestFailurePoint } from './finance-test-failure-injection';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { OutboxWriter } from '../../outbox/application/outbox-writer.service';
import { financialNotificationEvent, financialNotificationKind, formatGbpMinor } from '../../outbox/domain/domain-event';
import {
  accountAuthority,
  validateBalancedJournal,
  type JournalLine,
} from '../domain/journal';

type Db = Prisma.TransactionClient;

export function bacsReleaseAt(providerAvailableOn: Date, holdDays: number) {
  return new Date(providerAvailableOn.getTime() + holdDays * 86_400_000);
}

export function isBacsReleaseEligible(providerAvailableOn: Date, holdDays: number, now: Date) {
  return now.getTime() >= bacsReleaseAt(providerAvailableOn, holdDays).getTime();
}

type PostJournalInput = Readonly<{
  type:
    | 'DEMO_FUNDING'
    | 'EXTERNAL_DEPOSIT'
    | 'EXTERNAL_WITHDRAWAL'
    | 'CASH_RESERVATION'
    | 'CASH_RELEASE'
    | 'ADMIN_CORRECTION'
    | 'DISTRIBUTION'
    | 'PROVIDER_EXPENSE';
  correlationId: string;
  descriptionCode: string;
  lines: readonly JournalLine[];
}>;

@Injectable()
export class FinancialLedgerService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
    @Optional() private readonly outbox: OutboxWriter = new OutboxWriter(),
  ) {}

  /**
   * Bacs success is provider confirmation, not a product decision that the
   * money is safe to spend. The deposit account is therefore deliberately
   * separate from CASH_AVAILABLE while the explicit risk policy is unset.
   */
  bacsRiskHoldEnabled() {
    return this.config?.providerMode !== undefined &&
      this.config.providerMode !== 'local' &&
      this.config.stripeBankFundingRail === 'bacs_debit';
  }

  async depositCashAccount(
    db: Db,
    userId: string,
    bacsRiskHold = this.bacsRiskHoldEnabled(),
  ) {
    await db.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const code = bacsRiskHold ? 'BACS_RISK_HOLD' : 'CASH_AVAILABLE';
    const existing = await db.financialAccount.findFirst({
      where: {
        ownerType: 'USER',
        ownerUserId: userId,
        code,
        currency: 'GBP',
      },
      include: { balance: true },
    });
    if (existing) return existing;
    return db.financialAccount.create({
      data: {
        id: randomUUID(),
        ownerType: 'USER',
        ownerUserId: userId,
        accountType: 'LIABILITY',
        code,
        currency: 'GBP',
        normalSide: 'CREDIT',
      },
      include: { balance: true },
    });
  }

  /**
   * Lazy release is only enabled by an explicit configured policy. The
   * provider's available_on timestamp is evidence used by that policy; it is
   * not treated as proof that Bacs return/dispute risk has disappeared.
   */
  async releaseMaturedBacsDepositsForUser(
    userId: string,
    requestId = 'bacs-risk-policy',
    now = new Date(),
  ) {
    const holdDays = this.config?.bacsInternalTradeHoldDays;
    if (!this.bacsRiskHoldEnabled() || holdDays === undefined) return 0;
    const maturedBefore = new Date(now.getTime() - holdDays * 86_400_000);
    const candidates = await this.db.moneyMovement.findMany({
      where: {
        userId,
        type: 'DEPOSIT',
        status: 'HELD',
        providerAvailableOn: { lte: maturedBefore },
      },
      select: { id: true },
      orderBy: [{ providerAvailableOn: 'asc' }, { id: 'asc' }],
    });
    let released = 0;
    for (const candidate of candidates) {
      if (await this.releaseMaturedBacsDeposit(candidate.id, requestId, now))
        released += 1;
    }
    return released;
  }

  async releaseMaturedBacsDepositsForMovement(
    movementId: string,
    requestId = 'bacs-provider-evidence',
  ) {
    const movement = await this.db.moneyMovement.findUnique({
      where: { id: movementId },
      select: { userId: true },
    });
    return movement
      ? this.releaseMaturedBacsDepositsForUser(movement.userId, requestId)
      : 0;
  }

  private async releaseMaturedBacsDeposit(
    movementId: string,
    requestId: string,
    now: Date,
  ) {
    const holdDays = this.config?.bacsInternalTradeHoldDays;
    if (holdDays === undefined) return false;
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movementId} FOR UPDATE`;
      const movement = await db.moneyMovement.findUnique({
        where: { id: movementId },
        include: { cashAccount: true },
      });
      if (
        !movement ||
        movement.type !== 'DEPOSIT' ||
        movement.status !== 'HELD' ||
        movement.cashAccount.code !== 'BACS_RISK_HOLD' ||
        !movement.providerAvailableOn ||
        !isBacsReleaseEligible(movement.providerAvailableOn, holdDays, now)
      )
        return false;
      const cash = await this.depositCashAccount(db, movement.userId, false);
      const actor = this.systemActor(movement.userId, `bacs-release:${movement.id}`);
      await this.postInTransaction(
        db,
        actor,
        {
          type: 'CASH_RELEASE',
          correlationId: `bacs-risk-release:${movement.id}`,
          descriptionCode: 'BACS_RISK_HOLD_RELEASED',
          lines: [
            { accountId: movement.cashAccountId, side: 'DEBIT', amountMinor: movement.amountMinor.toString() },
            { accountId: cash.id, side: 'CREDIT', amountMinor: movement.amountMinor.toString() },
          ],
        },
        requestId,
        `bacs-risk-release:${movement.id}`,
      );
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: { status: 'SETTLED', failureCode: null, version: { increment: 1 } },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: movement.id,
          fromStatus: 'HELD',
          toStatus: 'SETTLED',
          reasonCode: 'BACS_RISK_HOLD_RELEASED',
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'BACS_RISK_HOLD_RELEASED',
        resourceType: 'money-movement',
        resourceId: movement.id,
        requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: {
          providerAvailableOn: movement.providerAvailableOn.toISOString(),
          holdDays,
        },
        createdAt: now,
      });
      await this.outbox.append(db, financialNotificationEvent({
        kind: financialNotificationKind.depositReleased,
        title: 'Bank deposit ready to use',
        body: `Your ${formatGbpMinor(movement.amountMinor)} bank deposit has cleared and is now available to use for Slice trading.`,
        resourceType: 'money-movement',
        resourceId: movement.id,
        aggregateType: 'money-movement',
        aggregateId: movement.id,
        amountMinor: movement.amountMinor.toString(),
        actorUserId: movement.userId,
        correlationId: requestId,
        occurredAt: now,
        eventSuffix: 'released',
      }));
      await this.recoverDeficitInTransaction(db, movement.userId, requestId, actor);
      void updated;
      return true;
    });
  }

  /**
   * Reclassifies a post-return shortfall into an explicit Slice receivable and
   * account restriction. The original deposit and reversal journals remain
   * immutable; this only makes the recovery obligation visible and balanced.
   */
  async recordReturnedFundsDeficitInTransaction(
    db: Db,
    userId: string,
    movementId: string,
    requestId: string,
    reasonCode: string,
  ) {
    const accounts = await db.financialAccount.findMany({
      where: {
        ownerType: 'USER',
        ownerUserId: userId,
        code: 'CASH_AVAILABLE',
        currency: 'GBP',
        status: 'ACTIVE',
      },
      include: { balance: true },
    });
    if (!accounts.length) return 0n;
    await this.lockAccounts(db, accounts.map((account) => account.id));
    const cash = accounts.find((account) => account.code === 'CASH_AVAILABLE');
    if (!cash) return 0n;
    const cashMinor = accountAuthority(
      cash.normalSide,
      cash.balance?.postedDebitMinor ?? 0n,
      cash.balance?.postedCreditMinor ?? 0n,
    );
    if (cashMinor >= 0n) return 0n;
    const deficitMinor = -cashMinor;
    const receivable = await this.deficitReceivableAccount(db);
    const actor = this.systemActor(userId, `bacs-deficit-reclass:${movementId}`);
    await this.postInTransaction(
      db,
      actor,
      {
        type: 'ADMIN_CORRECTION',
        correlationId: `bacs-deficit-reclass:${movementId}`,
        descriptionCode: 'RETURNED_FUNDS_DEFICIT_RECLASSIFIED',
        lines: [
          { accountId: receivable.id, side: 'DEBIT', amountMinor: deficitMinor.toString() },
          { accountId: cash.id, side: 'CREDIT', amountMinor: deficitMinor.toString() },
        ],
      },
      requestId,
      `bacs-deficit-reclass:${movementId}`,
    );
    const existing = await db.financialDeficit.findUnique({
      where: { sourceMovementId: movementId },
    });
    if (existing) return deficitMinor;
    const deficit = await db.financialDeficit.create({
      data: {
        id: randomUUID(),
        userId,
        sourceMovementId: movementId,
        currency: 'GBP',
        amountMinor: deficitMinor,
        reasonCode,
      },
    });
    const existingHold = await db.complianceHold.findFirst({
      where: {
        movementId,
        scope: 'ACCOUNT',
        reasonCode: 'RETURNED_FUNDS_DEFICIT',
        status: 'ACTIVE',
      },
    });
    let holdCreated = false;
    if (!existingHold) {
      await db.complianceHold.create({
        data: {
          id: randomUUID(),
          userId,
          movementId,
          scope: 'ACCOUNT',
          reasonCode: 'RETURNED_FUNDS_DEFICIT',
          source: 'PROVIDER_RETURN',
        },
      });
      holdCreated = true;
    }
    await createIdentityTransaction(db).audit.append({
      id: randomUUID(),
      actorUserId: null,
      actorType: 'SYSTEM',
      action: 'WALLET_RETURN_DEFICIT_CREATED',
      resourceType: 'financial-deficit',
      resourceId: movementId,
      requestId,
      sessionId: null,
      result: 'SUCCESS',
      metadata: { amountMinor: deficitMinor.toString(), reasonCode },
      createdAt: new Date(),
    });
    await this.outbox.append(db, financialNotificationEvent({
      kind: financialNotificationKind.deficitCreated,
      title: 'Outstanding balance created',
      body: `A returned bank deposit left an outstanding Slice balance of ${formatGbpMinor(deficitMinor)}. Buying and withdrawals are temporarily restricted until this balance is resolved. You can recover it with a verified bank deposit after that deposit clears.`,
      resourceType: 'financial-deficit',
      resourceId: deficit.id,
      aggregateType: 'financial-deficit',
      aggregateId: deficit.id,
      amountMinor: deficitMinor.toString(),
      outstandingMinor: deficitMinor.toString(),
      actorUserId: userId,
      correlationId: requestId,
      eventSuffix: 'created',
    }));
    if (holdCreated) {
      await this.outbox.append(db, financialNotificationEvent({
        kind: financialNotificationKind.restrictionsApplied,
        title: 'Some account actions are temporarily restricted',
        body: 'Buying, listings, offers, and withdrawals are temporarily restricted while your outstanding Slice balance is resolved. You can still sign in, view your portfolio and history, contact support, and use an approved recovery path.',
        resourceType: 'account',
        resourceId: userId,
        aggregateType: 'account',
        aggregateId: userId,
        amountMinor: deficitMinor.toString(),
        outstandingMinor: deficitMinor.toString(),
        actorUserId: userId,
        correlationId: requestId,
        eventSuffix: `deficit:${deficit.id}`,
      }));
    }
    return deficitMinor;
  }

  async protectReturnedFundsReservationsInTransaction(
    db: Db,
    userId: string,
    movementId: string,
    requestId: string,
  ) {
    const accounts = await db.financialAccount.findMany({
      where: {
        ownerType: 'USER',
        ownerUserId: userId,
        code: { in: ['CASH_AVAILABLE', 'COLLECTOR_PROCEEDS_AVAILABLE'] },
        currency: 'GBP',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!accounts.length) return 0;
    await this.lockAccounts(db, accounts.map((account) => account.id));
    const reservations = await db.cashReservation.count({
      where: {
        accountId: { in: accounts.map((account) => account.id) },
        status: 'ACTIVE',
      },
    });
    if (!reservations) return 0;
    const existingHold = await db.complianceHold.findFirst({
      where: {
        userId,
        scope: 'ACCOUNT',
        reasonCode: 'RETURNED_FUNDS_RESERVATION_REVIEW',
        status: 'ACTIVE',
      },
    });
    if (!existingHold) {
      const hold = await db.complianceHold.create({
        data: {
          id: randomUUID(),
          userId,
          movementId,
          scope: 'ACCOUNT',
          reasonCode: 'RETURNED_FUNDS_RESERVATION_REVIEW',
          source: 'PROVIDER_RETURN',
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_RETURN_RESERVATIONS_HELD',
        resourceType: 'compliance-hold',
        resourceId: hold.id,
        requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { activeReservationCount: reservations },
        createdAt: new Date(),
      });
    }
    return reservations;
  }

  private async recoverDeficitInTransaction(
    db: Db,
    userId: string,
    requestId: string,
    actor: Actor,
  ) {
    const deficit = await db.financialDeficit.findFirst({
      where: { userId, status: { in: ['OPEN', 'PARTIALLY_RECOVERED'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!deficit) return 0n;
    const cash = await db.financialAccount.findFirst({
      where: { ownerType: 'USER', ownerUserId: userId, code: 'CASH_AVAILABLE', currency: 'GBP', status: 'ACTIVE' },
      include: { balance: true },
    });
    if (!cash) return 0n;
    const cashAvailable = maxZero(
      accountAuthority(
        cash.normalSide,
        cash.balance?.postedDebitMinor ?? 0n,
        cash.balance?.postedCreditMinor ?? 0n,
      ) - (cash.balance?.reservedMinor ?? 0n),
    );
    const remaining = deficit.amountMinor - deficit.recoveredMinor;
    const recovery = cashAvailable < remaining ? cashAvailable : remaining;
    if (recovery <= 0n) return 0n;
    const receivable = await this.deficitReceivableAccount(db);
    await this.postInTransaction(
      db,
      actor,
      {
        type: 'ADMIN_CORRECTION',
        correlationId: `bacs-deficit-recovery:${deficit.id}:${deficit.recoveredMinor}`,
        descriptionCode: 'RETURNED_FUNDS_DEFICIT_RECOVERED',
        lines: [
          { accountId: cash.id, side: 'DEBIT', amountMinor: recovery.toString() },
          { accountId: receivable.id, side: 'CREDIT', amountMinor: recovery.toString() },
        ],
      },
      requestId,
      `bacs-deficit-recovery:${deficit.id}:${deficit.recoveredMinor}`,
    );
    const recoveredMinor = deficit.recoveredMinor + recovery;
    const recovered = recoveredMinor >= deficit.amountMinor;
    const updatedDeficit = await db.financialDeficit.update({
      where: { id: deficit.id },
      data: {
        recoveredMinor,
        status: recovered ? 'RECOVERED' : 'PARTIALLY_RECOVERED',
        resolvedAt: recovered ? new Date() : null,
      },
    });
    if (recovered) {
      await db.complianceHold.updateMany({
        where: { movementId: deficit.sourceMovementId, reasonCode: 'RETURNED_FUNDS_DEFICIT', status: 'ACTIVE' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
    }
    await this.outbox.append(db, financialNotificationEvent({
      kind: recovered ? financialNotificationKind.deficitResolved : financialNotificationKind.deficitPartiallyRecovered,
      title: recovered ? 'Outstanding balance resolved' : 'Outstanding balance partially recovered',
      body: recovered
        ? `Your outstanding Slice balance has been fully recovered. The temporary financial restrictions on your account have been removed.`
        : `${formatGbpMinor(recovery)} has been applied to your outstanding Slice balance. ${formatGbpMinor(updatedDeficit.amountMinor - updatedDeficit.recoveredMinor)} remains outstanding, so buying and withdrawals remain temporarily restricted.`,
      resourceType: 'financial-deficit',
      resourceId: updatedDeficit.id,
      aggregateType: 'financial-deficit',
      aggregateId: updatedDeficit.id,
      amountMinor: recovery.toString(),
      outstandingMinor: (updatedDeficit.amountMinor - updatedDeficit.recoveredMinor).toString(),
      actorUserId: userId,
      correlationId: requestId,
      eventSuffix: updatedDeficit.recoveredMinor.toString(),
    }));
    if (recovered) {
      await this.outbox.append(db, financialNotificationEvent({
        kind: financialNotificationKind.restrictionsRemoved,
        title: 'Account financial restrictions removed',
        body: 'Your outstanding Slice balance has been resolved. Buying and withdrawals are available again subject to the usual account, identity, and provider checks.',
        resourceType: 'account',
        resourceId: userId,
        aggregateType: 'account',
        aggregateId: userId,
        amountMinor: recovery.toString(),
        outstandingMinor: '0',
        actorUserId: userId,
        correlationId: requestId,
        eventSuffix: `deficit:${updatedDeficit.id}`,
      }));
    }
    return recovery;
  }

  async deficitReceivableAccount(db: Db) {
    const existing = await db.financialAccount.findFirst({
      where: { ownerType: 'PLATFORM', code: 'CUSTOMER_DEFICIT_RECEIVABLE', currency: 'GBP' },
    });
    if (existing) return existing;
    return db.financialAccount.create({
      data: {
        id: randomUUID(),
        ownerType: 'PLATFORM',
        accountType: 'ASSET',
        code: 'CUSTOMER_DEFICIT_RECEIVABLE',
        currency: 'GBP',
        normalSide: 'DEBIT',
      },
    });
  }

  /**
   * Application-only accounting primitive. Controllers never accept arbitrary
   * account lines; later finance templates call this after their policy checks.
   */
  async post(
    actor: Actor,
    input: PostJournalInput,
    requestId: string,
    idempotencyKey: string,
  ) {
    return this.db.$transaction((db) =>
      this.postInTransaction(db, actor, input, requestId, idempotencyKey),
    );
  }

  /**
   * Posts into a caller-owned transaction. Movement settlement uses this seam
   * so the external-clearing journal and reservation transition are atomic.
   */
  async postInTransaction(
    db: Db,
    actor: Actor,
    input: PostJournalInput,
    requestId: string,
    idempotencyKey: string,
  ) {
    this.recentAuth.require(actor);
    const lines = validateBalancedJournal('GBP', input.lines);
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `finance.post:${input.correlationId}`,
      key: idempotencyKey,
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');

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
      return acquired.record.response!.body as {
        transactionId: string;
        correlationId: string;
      };

    const accountIds = [...new Set(lines.map((line) => line.accountId))].sort();
    await this.lockAccounts(db, accountIds);
    const accounts = await db.financialAccount.findMany({
      where: { id: { in: accountIds } },
    });
    if (accounts.length !== accountIds.length)
      throw new NotFoundException({
        code: 'FINANCIAL_ACCOUNT_NOT_FOUND',
        message: 'A financial account was not found.',
      });
    for (const account of accounts) {
      if (account.currency !== 'GBP' || account.status !== 'ACTIVE')
        throw conflict(
          'FINANCIAL_ACCOUNT_UNAVAILABLE',
          'A financial account is unavailable for posting.',
        );
    }

    const existing = await db.journalTransaction.findUnique({
      where: { correlationId: input.correlationId },
    });
    if (existing)
      throw conflict(
        'FINANCIAL_CORRELATION_CONFLICT',
        'A journal transaction already uses this correlation.',
      );
    const transaction = await db.journalTransaction.create({
      data: {
        id: randomUUID(),
        type: input.type,
        currency: 'GBP',
        correlationId: input.correlationId,
        descriptionCode: input.descriptionCode,
        createdByUserId: actor.userId,
      },
    });
    await financeTestFailurePoint('journal.after-transaction');
    await db.journalEntry.createMany({
      data: lines.map((line, index) => ({
        id: randomUUID(),
        transactionId: transaction.id,
        sequence: index + 1,
        accountId: line.accountId,
        side: line.side,
        amountMinor: line.money.minor,
        currency: 'GBP',
      })),
    });
    for (const line of lines) await this.applyProjection(db, line);

    const result = {
      transactionId: transaction.id,
      correlationId: transaction.correlationId,
    };
    await tx.audit.append({
      id: randomUUID(),
      actorUserId: actor.userId,
      actorType: 'USER',
      action: 'FINANCE_JOURNAL_POSTED',
      resourceType: 'journal-transaction',
      resourceId: transaction.id,
      requestId,
      sessionId: actor.sessionId as never,
      result: 'SUCCESS',
      metadata: { transactionId: transaction.id, type: input.type },
      createdAt: new Date(),
    });
    await tx.idempotency.complete(
      identity,
      { status: 200, body: result },
      new Date(),
    );
    return result;
  }

  async walletForUser(userId: string) {
    await this.releaseMaturedBacsDepositsForUser(userId, 'wallet-projection');
    const accounts = await this.db.financialAccount.findMany({
      where: { ownerType: 'USER', ownerUserId: userId, currency: 'GBP' },
      include: { balance: true },
      orderBy: { code: 'asc' },
    });
    const accountIds = accounts.map((account) => account.id);
    const [pendingMovements, reservations, heldDeposits] = await Promise.all([
      this.db.moneyMovement.findMany({
        where: {
          userId,
          status: { in: ['CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW'] },
        },
        select: { type: true, amountMinor: true },
      }),
      accountIds.length
        ? this.db.cashReservation.findMany({
            where: { accountId: { in: accountIds }, status: 'ACTIVE' },
            select: { purposeType: true, amountMinor: true },
          })
        : Promise.resolve([]),
      this.db.moneyMovement.findMany({
        where: { userId, type: 'DEPOSIT', status: 'HELD', cashAccount: { code: 'BACS_RISK_HOLD' } },
        orderBy: [{ providerAvailableOn: 'asc' }, { id: 'asc' }],
        select: { id: true, amountMinor: true, providerAvailableOn: true, createdAt: true },
      }),
    ]);
    const pendingDeposits = pendingMovements.filter((movement) => movement.type === 'DEPOSIT');
    const pendingWithdrawals = pendingMovements.filter((movement) => movement.type === 'WITHDRAWAL');
    const pendingMinor = pendingDeposits
      .filter((movement) => movement.type === 'DEPOSIT')
      .reduce((total, movement) => total + movement.amountMinor, 0n);
    const pendingWithdrawalMinor = pendingWithdrawals.reduce((total, movement) => total + movement.amountMinor, 0n);
    const orderReservedMinor = reservations
      .filter((reservation) => reservation.purposeType === 'TRADING_ORDER')
      .reduce((total, reservation) => total + reservation.amountMinor, 0n);
    const withdrawalReservedMinor = reservations
      .filter((reservation) => reservation.purposeType === 'EXTERNAL_WITHDRAWAL')
      .reduce((total, reservation) => total + reservation.amountMinor, 0n);
    const riskHold = accounts.find((account) => account.code === 'BACS_RISK_HOLD');
    const riskHoldBalance = riskHold?.balance;
    const riskHeldMinor = riskHoldBalance
      ? maxZero(accountAuthority(
          riskHold.normalSide,
          riskHoldBalance.postedDebitMinor,
          riskHoldBalance.postedCreditMinor,
        ) - riskHoldBalance.reservedMinor)
      : 0n;
    const proceeds = accounts.find((account) => account.code === 'COLLECTOR_PROCEEDS_AVAILABLE');
    const proceedsBalance = proceeds?.balance;
    const collectorProceedsMinor = proceedsBalance
      ? accountAuthority(proceeds.normalSide, proceedsBalance.postedDebitMinor, proceedsBalance.postedCreditMinor)
      : 0n;
    const withdrawableSources = accounts
      .filter((account) =>
        account.code === 'CASH_AVAILABLE' ||
        account.code === 'COLLECTOR_PROCEEDS_AVAILABLE',
      )
      .map((account) => {
        const balance = account.balance;
        const posted = accountAuthority(
          account.normalSide,
          balance?.postedDebitMinor ?? 0n,
          balance?.postedCreditMinor ?? 0n,
        );
        const available = posted - (balance?.reservedMinor ?? 0n);
        return {
          code: account.code,
          availableMinor: (available > 0n ? available : 0n).toString(),
        };
      });
    const withdrawableMinor = withdrawableSources.reduce(
      (total, source) => total + BigInt(source.availableMinor),
      0n,
    );
    const tradeAvailableMinor = accounts
      .filter((account) =>
        account.code === 'CASH_AVAILABLE' ||
        account.code === 'COLLECTOR_PROCEEDS_AVAILABLE',
      )
      .reduce((total, account) => {
        const balance = account.balance;
        const posted = accountAuthority(
          account.normalSide,
          balance?.postedDebitMinor ?? 0n,
          balance?.postedCreditMinor ?? 0n,
        );
        return total + maxZero(posted - (balance?.reservedMinor ?? 0n));
      }, 0n);
    const totalMinor = accounts.reduce((total, account) => {
      const balance = account.balance;
      return total + accountAuthority(
        account.normalSide,
        balance?.postedDebitMinor ?? 0n,
        balance?.postedCreditMinor ?? 0n,
      );
    }, 0n);
    const reservedMinor = accounts.reduce(
      (total, account) => total + (account.balance?.reservedMinor ?? 0n),
      0n,
    );
    return {
      currency: 'GBP',
      totalMinor: totalMinor.toString(),
      reservedMinor: reservedMinor.toString(),
      availableMinor: (totalMinor - reservedMinor).toString(),
      pendingMinor: pendingMinor.toString(),
      pendingDepositCount: pendingDeposits.length,
      pendingWithdrawalMinor: pendingWithdrawalMinor.toString(),
      pendingWithdrawalCount: pendingWithdrawals.length,
      orderReservedMinor: orderReservedMinor.toString(),
      withdrawalReservedMinor: withdrawalReservedMinor.toString(),
      // This is the only customer-facing withdrawal amount. It is derived
      // from posted GBP cash accounts after active reservations; pending
      // provider movements have no posted balance and therefore cannot inflate
      // it.
      withdrawableMinor: withdrawableMinor.toString(),
      tradeAvailableMinor: tradeAvailableMinor.toString(),
      riskHeldMinor: riskHeldMinor.toString(),
      riskHeldDepositCount: accounts.some((account) => account.code === 'BACS_RISK_HOLD')
        ? await this.db.moneyMovement.count({ where: { userId, type: 'DEPOSIT', status: { in: ['HELD', 'MANUAL_REVIEW'] }, cashAccount: { code: 'BACS_RISK_HOLD' } } })
        : 0,
      riskHeldDeposits: heldDeposits.map((movement) => ({
        id: movement.id,
        amountMinor: movement.amountMinor.toString(),
        providerAvailableOn: movement.providerAvailableOn?.toISOString() ?? null,
        expectedReleaseAt: movement.providerAvailableOn && this.config?.bacsInternalTradeHoldDays !== undefined
          ? bacsReleaseAt(movement.providerAvailableOn, this.config.bacsInternalTradeHoldDays).toISOString()
          : null,
      })),
      withdrawableSources,
      collectorProceedsMinor: collectorProceedsMinor.toString(),
      collectorProceedsReservedMinor: (proceedsBalance?.reservedMinor ?? 0n).toString(),
      accounts: accounts.map((account) => {
        const balance = account.balance;
        const total = accountAuthority(
          account.normalSide,
          balance?.postedDebitMinor ?? 0n,
          balance?.postedCreditMinor ?? 0n,
        );
        const reserved = balance?.reservedMinor ?? 0n;
        return {
          code: account.code,
          totalMinor: total.toString(),
          reservedMinor: reserved.toString(),
          availableMinor: (total - reserved).toString(),
        };
      }),
    };
  }

  async walletInsightsForUser(userId: string, now = new Date()) {
    const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const rows = await this.db.moneyMovement.findMany({
      where: {
        userId,
        status: 'SETTLED',
        currency: 'GBP',
        settledAt: { gte: previousStart, lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) },
      },
      select: { type: true, amountMinor: true, settledAt: true },
    });
    const summarize = (from: Date, to: Date) => {
      const deposits = rows.filter((row) => row.type === 'DEPOSIT' && row.settledAt && row.settledAt >= from && row.settledAt < to)
        .reduce((total, row) => total + row.amountMinor, 0n);
      const withdrawals = rows.filter((row) => row.type === 'WITHDRAWAL' && row.settledAt && row.settledAt >= from && row.settledAt < to)
        .reduce((total, row) => total + row.amountMinor, 0n);
      return {
        totalDepositsMinor: deposits.toString(),
        totalWithdrawalsMinor: withdrawals.toString(),
        netMovementMinor: (deposits - withdrawals).toString(),
      };
    };
    const current = summarize(currentStart, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
    const previous = summarize(previousStart, currentStart);
    const previousHasData = previous.totalDepositsMinor !== '0' || previous.totalWithdrawalsMinor !== '0';
    return { period: 'month' as const, currency: 'GBP' as const, ...current, previousPeriod: previousHasData ? previous : null };
  }

  async transactionsForUser(userId: string, cursor?: string, limit = 20) {
    const accounts = await this.db.financialAccount.findMany({
      where: { ownerType: 'USER', ownerUserId: userId, currency: 'GBP' },
      select: { id: true },
    });
    if (!accounts.length) return { items: [], nextCursor: null };
    const before = cursor
      ? await this.db.journalEntry.findUnique({
          where: { id: cursor },
          select: { id: true, createdAt: true },
        })
      : null;
    const entries = await this.db.journalEntry.findMany({
      where: {
        accountId: { in: accounts.map((account) => account.id) },
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: { transaction: { select: { type: true, effectiveAt: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = entries.slice(0, limit);
    return {
      items: page.map((entry) => ({
        type: entry.transaction.type,
        side: entry.side,
        amountMinor: entry.amountMinor.toString(),
        effectiveAt: entry.transaction.effectiveAt.toISOString(),
      })),
      nextCursor: entries.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async reverse(
    actor: Actor,
    transactionId: string,
    reasonCode: string,
    requestId: string,
    idempotencyKey: string,
  ) {
    return this.db.$transaction((db) =>
      this.reverseInTransaction(
        db,
        actor,
        transactionId,
        reasonCode,
        requestId,
        idempotencyKey,
      ),
    );
  }

  /** Reversal primitive for a caller-owned movement transaction. */
  async reverseInTransaction(
    db: Db,
    actor: Actor,
    transactionId: string,
    reasonCode: string,
    requestId: string,
    idempotencyKey: string,
  ) {
    this.recentAuth.require(actor);
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `finance.reverse:${transactionId}`,
      key: idempotencyKey,
    };
    const requestHash = createHash('sha256')
      .update(`${transactionId}\n${reasonCode}`)
      .digest('hex');
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
        return acquired.record.response!.body as {
          transactionId: string;
          reversalId: string;
        };
      await db.$queryRaw`SELECT id FROM "JournalTransaction" WHERE id = ${transactionId} FOR UPDATE`;
      const original = await db.journalTransaction.findUnique({
        where: { id: transactionId },
        include: {
          entries: { orderBy: { sequence: 'asc' } },
          reversal: { select: { id: true } },
        },
      });
      if (!original)
        throw new NotFoundException({
          code: 'JOURNAL_TRANSACTION_NOT_FOUND',
          message: 'Journal transaction not found.',
        });
      if (original.reversal || original.status === 'REVERSED')
        throw conflict(
          'TRANSACTION_ALREADY_REVERSED',
          'Journal transaction has already been reversed.',
        );
      const accountIds = [
        ...new Set(original.entries.map((entry) => entry.accountId)),
      ].sort();
      await this.lockAccounts(db, accountIds);
      const reversal = await db.journalTransaction.create({
        data: {
          id: randomUUID(),
          type: 'REVERSAL',
          currency: original.currency,
          correlationId: `reversal:${original.id}`,
          descriptionCode: reasonCode,
          reversalOfId: original.id,
          createdByUserId: actor.userId,
        },
      });
      await financeTestFailurePoint('reversal.after-transaction');
      const reversedLines = original.entries.map((entry, index) => ({
        id: randomUUID(),
        transactionId: reversal.id,
        sequence: index + 1,
        accountId: entry.accountId,
        side: entry.side === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
        amountMinor: entry.amountMinor,
        currency: entry.currency,
      }));
      await db.journalEntry.createMany({ data: reversedLines });
      for (const line of reversedLines)
        await this.applyProjection(db, {
          accountId: line.accountId,
          side: line.side,
          money: { minor: line.amountMinor },
        });
      await db.journalTransaction.update({
        where: { id: original.id },
        data: { status: 'REVERSED' },
      });
      const result = { transactionId: original.id, reversalId: reversal.id };
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'FINANCE_JOURNAL_REVERSED',
        resourceType: 'journal-transaction',
        resourceId: original.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: {
          transactionId: original.id,
          reversalId: reversal.id,
          reasonCode,
        },
        createdAt: new Date(),
      });
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
  }

  /** Internal cash-control port; no public order or payment flow calls this in Document 013. */
  async reserveCash(
    actor: Actor,
    input: {
      accountId: string;
      purposeType: string;
      purposeId: string;
      amountMinor: string;
    },
    requestId: string,
    idempotencyKey: string,
  ) {
    this.recentAuth.require(actor);
    const amountMinor = validateBalancedJournal('GBP', [
      {
        accountId: input.accountId,
        side: 'DEBIT',
        amountMinor: input.amountMinor,
      },
      {
        accountId: input.accountId,
        side: 'CREDIT',
        amountMinor: input.amountMinor,
      },
    ])[0].money.minor;
    return this.mutateReservation(
      actor,
      'reserve',
      input,
      requestId,
      idempotencyKey,
      async (db, audit) => {
        await this.lockAccounts(db, [input.accountId]);
        const account = await this.userCashAccount(
          db,
          input.accountId,
          actor.userId,
        );
        const balance = await this.lockBalance(db, account.id);
        const total = accountAuthority(
          account.normalSide,
          balance?.postedDebitMinor ?? 0n,
          balance?.postedCreditMinor ?? 0n,
        );
        const reserved = balance?.reservedMinor ?? 0n;
        if (total - reserved < amountMinor)
          throw conflict(
            'INSUFFICIENT_AVAILABLE_FUNDS',
            'Insufficient available funds.',
          );
        const existing = await db.cashReservation.findUnique({
          where: {
            accountId_purposeType_purposeId: {
              accountId: account.id,
              purposeType: input.purposeType,
              purposeId: input.purposeId,
            },
          },
        });
        if (existing)
          throw conflict(
            'CASH_RESERVATION_TERMINAL',
            'A reservation already exists for this purpose.',
          );
        const reservation = await db.cashReservation.create({
          data: {
            id: randomUUID(),
            accountId: account.id,
            purposeType: input.purposeType,
            purposeId: input.purposeId,
            amountMinor,
          },
        });
        await financeTestFailurePoint('cash.reserve.after-create');
        await db.accountBalance.upsert({
          where: { accountId: account.id },
          create: { accountId: account.id, reservedMinor: amountMinor },
          update: {
            reservedMinor: { increment: amountMinor },
            version: { increment: 1 },
          },
        });
        const result = {
          reservationId: reservation.id,
          amountMinor: amountMinor.toString(),
          status: reservation.status,
        };
        await audit('FINANCE_CASH_RESERVED', {
          reservationId: reservation.id,
          amountMinor: result.amountMinor,
        });
        return result;
      },
    );
  }

  async releaseCash(
    actor: Actor,
    reservationId: string,
    requestId: string,
    idempotencyKey: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutateReservation(
      actor,
      'release',
      { reservationId },
      requestId,
      idempotencyKey,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "CashReservation" WHERE id = ${reservationId} FOR UPDATE`;
        const reservation = await db.cashReservation.findUnique({
          where: { id: reservationId },
        });
        if (!reservation)
          throw new NotFoundException({
            code: 'CASH_RESERVATION_NOT_FOUND',
            message: 'Cash reservation not found.',
          });
        await this.lockAccounts(db, [reservation.accountId]);
        await this.userCashAccount(db, reservation.accountId, actor.userId);
        await this.lockBalance(db, reservation.accountId);
        if (reservation.status !== 'ACTIVE')
          throw conflict(
            'CASH_RESERVATION_TERMINAL',
            'Cash reservation is not active.',
          );
        await db.cashReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });
        await financeTestFailurePoint('cash.release.after-update');
        await db.accountBalance.update({
          where: { accountId: reservation.accountId },
          data: {
            reservedMinor: { decrement: reservation.amountMinor },
            version: { increment: 1 },
          },
        });
        const result = {
          reservationId: reservation.id,
          status: 'RELEASED' as const,
        };
        await audit('FINANCE_CASH_RELEASED', {
          reservationId: reservation.id,
          amountMinor: reservation.amountMinor.toString(),
        });
        return result;
      },
    );
  }

  /**
   * Finalises a reservation after an external movement has been provider-confirmed.
   * It deliberately does not post cash: the caller must pair it with an
   * authoritative journal and can safely retry this operation by idempotency key.
   */
  async consumeCash(
    actor: Actor,
    reservationId: string,
    requestId: string,
    idempotencyKey: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutateReservation(
      actor,
      'consume',
      { reservationId },
      requestId,
      idempotencyKey,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "CashReservation" WHERE id = ${reservationId} FOR UPDATE`;
        const reservation = await db.cashReservation.findUnique({
          where: { id: reservationId },
        });
        if (!reservation)
          throw new NotFoundException({
            code: 'CASH_RESERVATION_NOT_FOUND',
            message: 'Cash reservation not found.',
          });
        await this.lockAccounts(db, [reservation.accountId]);
        await this.userCashAccount(db, reservation.accountId, actor.userId);
        await this.lockBalance(db, reservation.accountId);
        if (reservation.status === 'CONSUMED')
          return { reservationId: reservation.id, status: 'CONSUMED' as const };
        if (reservation.status !== 'ACTIVE')
          throw conflict(
            'CASH_RESERVATION_TERMINAL',
            'Cash reservation is not active.',
          );
        await db.cashReservation.update({
          where: { id: reservation.id },
          data: { status: 'CONSUMED' },
        });
        await db.accountBalance.update({
          where: { accountId: reservation.accountId },
          data: {
            reservedMinor: { decrement: reservation.amountMinor },
            version: { increment: 1 },
          },
        });
        const result = {
          reservationId: reservation.id,
          status: 'CONSUMED' as const,
        };
        await audit('FINANCE_CASH_RELEASED', {
          reservationId: reservation.id,
          amountMinor: reservation.amountMinor.toString(),
        });
        return result;
      },
    );
  }

  /**
   * Reservation release for a caller-owned transaction. This is intentionally
   * separate from the idempotent public command: a movement transition already
   * owns the idempotency boundary and must not open a nested transaction.
   */
  async releaseCashInTransaction(
    db: Db,
    actor: Actor,
    reservationId: string,
    requestId: string,
  ) {
    this.recentAuth.require(actor);
    await db.$queryRaw`SELECT id FROM "CashReservation" WHERE id = ${reservationId} FOR UPDATE`;
    const reservation = await db.cashReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation)
      throw new NotFoundException({
        code: 'CASH_RESERVATION_NOT_FOUND',
        message: 'Cash reservation not found.',
      });
    await this.lockAccounts(db, [reservation.accountId]);
    await this.userCashAccount(db, reservation.accountId, actor.userId);
    await this.lockBalance(db, reservation.accountId);
    if (reservation.status === 'RELEASED')
      return { reservationId, status: 'RELEASED' as const };
    if (reservation.status !== 'ACTIVE')
      throw conflict(
        'CASH_RESERVATION_TERMINAL',
        'Cash reservation is not active.',
      );
    await db.cashReservation.update({
      where: { id: reservation.id },
      data: { status: 'RELEASED' },
    });
    await db.accountBalance.update({
      where: { accountId: reservation.accountId },
      data: {
        reservedMinor: { decrement: reservation.amountMinor },
        version: { increment: 1 },
      },
    });
    await createIdentityTransaction(db).audit.append({
      id: randomUUID(),
      actorUserId: actor.userId,
      actorType: 'USER',
      action: 'FINANCE_CASH_RELEASED',
      resourceType: 'cash-reservation',
      resourceId: reservation.id,
      requestId,
      sessionId: actor.sessionId as never,
      result: 'SUCCESS',
      metadata: { reservationId: reservation.id, amountMinor: reservation.amountMinor.toString() },
      createdAt: new Date(),
    });
    return { reservationId, status: 'RELEASED' as const };
  }

  /** Consume a reservation without opening a nested transaction. */
  async consumeCashInTransaction(
    db: Db,
    actor: Actor,
    reservationId: string,
    requestId: string,
  ) {
    this.recentAuth.require(actor);
    await db.$queryRaw`SELECT id FROM "CashReservation" WHERE id = ${reservationId} FOR UPDATE`;
    const reservation = await db.cashReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation)
      throw new NotFoundException({
        code: 'CASH_RESERVATION_NOT_FOUND',
        message: 'Cash reservation not found.',
      });
    await this.lockAccounts(db, [reservation.accountId]);
    await this.userCashAccount(db, reservation.accountId, actor.userId);
    await this.lockBalance(db, reservation.accountId);
    if (reservation.status === 'CONSUMED')
      return { reservationId, status: 'CONSUMED' as const };
    if (reservation.status !== 'ACTIVE')
      throw conflict(
        'CASH_RESERVATION_TERMINAL',
        'Cash reservation is not active.',
      );
    await db.cashReservation.update({
      where: { id: reservation.id },
      data: { status: 'CONSUMED' },
    });
    await db.accountBalance.update({
      where: { accountId: reservation.accountId },
      data: {
        reservedMinor: { decrement: reservation.amountMinor },
        version: { increment: 1 },
      },
    });
    await createIdentityTransaction(db).audit.append({
      id: randomUUID(),
      actorUserId: actor.userId,
      actorType: 'USER',
      action: 'FINANCE_CASH_CONSUMED',
      resourceType: 'cash-reservation',
      resourceId: reservation.id,
      requestId,
      sessionId: actor.sessionId as never,
      result: 'SUCCESS',
      metadata: { reservationId: reservation.id, amountMinor: reservation.amountMinor.toString() },
      createdAt: new Date(),
    });
    return { reservationId, status: 'CONSUMED' as const };
  }

  private async lockAccounts(db: Db, accountIds: string[]) {
    await db.$queryRaw`SELECT id FROM "FinancialAccount" WHERE id IN (${Prisma.join(accountIds)}) ORDER BY id FOR UPDATE`;
  }

  private async lockBalance(db: Db, accountId: string) {
    await db.$queryRaw`SELECT "accountId" FROM "AccountBalance" WHERE "accountId" = ${accountId} FOR UPDATE`;
    return db.accountBalance.findUnique({ where: { accountId } });
  }

  private async userCashAccount(db: Db, accountId: string, userId: string) {
    const account = await db.financialAccount.findUnique({
      where: { id: accountId },
    });
    if (
      !account ||
      account.ownerType !== 'USER' ||
      account.ownerUserId !== userId ||
      account.currency !== 'GBP' ||
      account.status !== 'ACTIVE'
    )
      throw new NotFoundException({
        code: 'FINANCIAL_ACCOUNT_NOT_FOUND',
        message: 'Financial account not found.',
      });
    return account;
  }

  private async mutateReservation<T extends Record<string, unknown>>(
    actor: Actor,
    operation: 'reserve' | 'release' | 'consume',
    input: Record<string, unknown>,
    requestId: string,
    key: string,
    work: (
      db: Db,
      audit: (
      action:
        | 'FINANCE_CASH_RESERVED'
        | 'FINANCE_CASH_RELEASED'
        | 'FINANCE_CASH_CONSUMED',
        metadata: Record<string, unknown>,
      ) => Promise<void>,
    ) => Promise<T>,
  ) {
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `finance.cash.${operation}`,
      key,
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    return this.db.$transaction(async (db) => {
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
        return acquired.record.response!.body as T;
      const audit = (
        action:
          | 'FINANCE_CASH_RESERVED'
          | 'FINANCE_CASH_RELEASED'
          | 'FINANCE_CASH_CONSUMED',
        metadata: Record<string, unknown>,
      ) =>
        tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action,
          resourceType: 'cash-reservation',
          resourceId: String(metadata.reservationId),
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata,
          createdAt: new Date(),
        });
      const result = await work(db, audit);
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
    });
  }

  private async applyProjection(
    db: Db,
    line: {
      accountId: string;
      side: 'DEBIT' | 'CREDIT';
      money: { minor: bigint };
    },
  ) {
    const debit = line.side === 'DEBIT' ? line.money.minor : 0n;
    const credit = line.side === 'CREDIT' ? line.money.minor : 0n;
    await db.accountBalance.upsert({
      where: { accountId: line.accountId },
      create: {
        accountId: line.accountId,
        postedDebitMinor: debit,
        postedCreditMinor: credit,
      },
      update: {
        postedDebitMinor: { increment: debit },
        postedCreditMinor: { increment: credit },
        version: { increment: 1 },
      },
    });
  }

  private systemActor(userId: string, sessionId: string): Actor {
    return {
      userId: userId as Actor['userId'],
      sessionId,
      status: 'ACTIVE',
      roles: [],
      sessionRevokedAt: null,
      sessionRevocationReason: null,
      authenticatedAt: new Date(),
    };
  }
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

function maxZero(value: bigint) {
  return value > 0n ? value : 0n;
}
