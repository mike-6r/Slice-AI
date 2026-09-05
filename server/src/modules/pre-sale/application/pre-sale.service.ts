import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PreSaleReservationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { FinancialLedgerService } from '../../finance/application/financial-ledger.service';
import { InitialOfferingService } from '../../initial-offering/application/initial-offering.service';
import { TradingService } from '../../trading/application/trading.service';
import { OutboxWriter } from '../../outbox/application/outbox-writer.service';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { financialNotificationEvent, financialNotificationKind } from '../../outbox/domain/domain-event';

type Db = Prisma.TransactionClient;
const ACTIVE: PreSaleReservationStatus[] = ['ACTIVE', 'CONVERTING'];
const DAY = 86_400_000;

@Injectable()
export class PreSaleService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    private readonly ledger: FinancialLedgerService,
    private readonly offerings: InitialOfferingService,
    private readonly trading: TradingService,
    private readonly outbox: OutboxWriter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async open(actor: Actor, assetId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const offering = await db.initialOffering.findUnique({
        where: { assetId },
        include: {
          asset: {
            include: {
              operationalControl: true,
              ownershipSupply: true,
              submissions: { where: { status: 'APPROVED' }, orderBy: { updatedAt: 'desc' }, take: 1, include: { intake: true } },
              tradingMarket: true,
            },
          },
          preSale: true,
        },
      });
      if (!offering) throw notFound('INITIAL_OFFERING_NOT_FOUND', 'Configure the provisional Pre-Sale terms before launching.');
      // A configured Pre-Sale is created in DRAFT. It still needs to move to
      // ACTIVE when the admin launches it; returning the draft here made the
      // request look successful while leaving the authoritative record closed.
      if (offering.preSale && offering.preSale.status !== 'DRAFT')
        return this.projectionForId(offering.preSale.id, db);
      if (offering.status === 'DRAFT' && !offering.valuationDecisionId && !offering.ownershipSupplyPolicyId) {
        if (offering.asset.operationalControl?.status === 'FROZEN') fail('ASSET_OPERATIONS_FROZEN', 'Asset operations are frozen.');
        if (!offering.asset.submissions[0]) fail('APPROVED_SUBMISSION_REQUIRED', 'An approved submission is required before Pre-Sale.');
        if (!offering.asset.submissions[0].intake) fail('INTAKE_PATH_REQUIRED', 'A physical intake path must be selected before Pre-Sale.');
        const now = new Date();
        const deadlineAt = new Date(now.getTime() + this.deadlineDays() * DAY);
        const row = offering.preSale
          ? await db.preSale.update({
              where: { id: offering.preSale.id },
              data: {
                status: 'ACTIVE',
                openedAt: now,
                deadlineAt,
                physicalStatus: this.physicalStatus(offering.asset),
                openedByUserId: actor.userId,
                version: { increment: 1 },
              },
            })
          : await db.preSale.create({ data: { id: randomUUID(), assetId: offering.assetId, initialOfferingId: offering.id, status: 'ACTIVE', openedAt: now, deadlineAt, physicalStatus: this.physicalStatus(offering.asset), openedByUserId: actor.userId } });
        await this.audit(db, row, 'PRE_SALE_OPENED', 'ADMIN', actor.userId, 'Launched configured provisional Pre-Sale', offering.preSale ? { status: 'DRAFT' } : null, { status: row.status, openedAt: now.toISOString(), deadlineAt: row.deadlineAt!.toISOString() }, key);
        return this.projectionForId(row.id, db);
      }
      if (offering.status !== 'APPROVED') fail('PRESALE_OFFERING_NOT_APPROVED', 'Only an approved Initial Offering can enter Pre-Sale.');
      if (!offering.asset.ownershipSupply || offering.asset.ownershipSupply.issuedUnits !== offering.totalUnits) fail('OWNERSHIP_NOT_ISSUED', 'Ownership must be issued before Pre-Sale.');
      if (!offering.asset.tradingMarket || offering.asset.tradingMarket.status !== 'OPEN' || !offering.asset.tradingMarket.tradingEnabled) fail('MARKET_NOT_OPEN', 'An open market is required before Pre-Sale.');
      if (offering.asset.operationalControl?.status === 'FROZEN') fail('ASSET_OPERATIONS_FROZEN', 'Asset operations are frozen.');
      if (!offering.asset.submissions[0]) fail('APPROVED_SUBMISSION_REQUIRED', 'An approved submission is required before Pre-Sale.');
      if (!offering.asset.submissions[0].intake) fail('INTAKE_PATH_REQUIRED', 'A physical intake path must be selected before Pre-Sale.');
      await this.offerings.prepareInventoryForPreSale(db, offering.id);
      const now = new Date();
      const row = await db.preSale.create({
        data: {
          id: randomUUID(), assetId: offering.assetId, initialOfferingId: offering.id,
          status: 'ACTIVE', openedAt: now, deadlineAt: new Date(now.getTime() + this.deadlineDays() * DAY),
          physicalStatus: this.physicalStatus(offering.asset), openedByUserId: actor.userId,
        },
      });
      await this.audit(db, row, 'PRE_SALE_OPENED', 'ADMIN', actor.userId, 'Opened Pre-Sale', null, { status: row.status, openedAt: now.toISOString(), deadlineAt: row.deadlineAt!.toISOString() }, key);
      return this.projectionForId(row.id, db);
    });
  }

  async reserve(actor: Actor, slug: string, unitsWire: string, confirmation: 'RESERVE_CONDITIONAL_POSITION', requestId: string, key: string) {
    this.recentAuth.require(actor);
    if (confirmation !== 'RESERVE_CONDITIONAL_POSITION') throw new ConflictException({ code: 'PRESALE_CONFIRMATION_REQUIRED', message: 'Explicit confirmation of the conditional Pre-Sale terms is required.' });
    const units = parseUnits(unitsWire);
    return this.db.$transaction(async (db) => {
      const existing = await db.preSaleReservation.findUnique({ where: { idempotencyKey: key } });
      if (existing) return this.customerReservation(existing.id, actor.userId, db);
      const asset = await db.asset.findFirst({
        where: { OR: [{ slug }, { publicId: slug }, { id: slug }] },
        include: { preSale: { include: { initialOffering: { include: { inventory: true } } } } },
      });
      if (!asset?.preSale) throw notFound('PRESALE_NOT_FOUND', 'This Pre-Sale is not available.');
      await db.$queryRaw`SELECT id FROM "PreSale" WHERE id = ${asset.preSale.id} FOR UPDATE`;
      const sale = await db.preSale.findUnique({ where: { id: asset.preSale.id }, include: { initialOffering: { include: { inventory: true } } } });
      if (!sale || sale.status !== 'ACTIVE') fail('PRESALE_NOT_ACTIVE', 'This Pre-Sale is not accepting new reservations.');
      if (!sale.deadlineAt || sale.deadlineAt <= new Date()) fail('PRESALE_DEADLINE_PASSED', 'The Pre-Sale deadline has passed.');
      const offered = sale.initialOffering.offeredUnits;
      const aggregate = await db.preSaleReservation.aggregate({ where: { preSaleId: sale.id, status: { in: ACTIVE } }, _sum: { units: true } });
      const reserved = aggregate._sum.units ?? 0n;
      if (reserved + units > offered) fail('PRESALE_INVENTORY_UNAVAILABLE', 'There are not enough Slices available to reserve.');
      const id = randomUUID();
      const gross = units * sale.initialOffering.pricePerUnitMinor;
      const cashAccount = await this.ledger.depositCashAccount(db, actor.userId, false);
      const market = await db.tradingMarket.findUnique({ where: { assetId: sale.assetId }, select: { takerFeeBps: true } });
      const reserveAmount = gross + ((gross * BigInt(market?.takerFeeBps ?? 0)) / 10_000n);
      const cash = await this.ledger.reserveCashInTransaction(db, actor, { accountId: cashAccount.id, purposeType: 'PRE_SALE', purposeId: id, amountMinor: reserveAmount }, requestId);
      const row = await db.preSaleReservation.create({ data: { id, preSaleId: sale.id, buyerUserId: actor.userId, assetId: sale.assetId, units, pricePerUnitMinor: sale.initialOffering.pricePerUnitMinor, grossMinor: gross, cashReservationId: cash.id, idempotencyKey: key } });
      await this.audit(db, sale, 'RESERVATION_CREATED', 'CUSTOMER', actor.userId, 'Customer confirmed and reserved Slices', null, { reservationId: row.id, units: units.toString(), grossMinor: gross.toString(), confirmation }, key);
      await this.notify(db, actor.userId, row.assetId, 'Pre-Sale reservation created', `Your ${units} Slice Pre-Sale reservation is pending physical verification.`, row.id, requestId, 'reservation');
      return this.customerReservation(row.id, actor.userId, db);
    });
  }

  async publicDetail(slug: string) {
    const row = await this.db.preSale.findFirst({ where: { asset: { OR: [{ slug }, { publicId: slug }] }, status: { in: ['ACTIVE', 'PAUSED', 'FINALIZING'] } } });
    if (!row) throw notFound('PRESALE_NOT_FOUND', 'This Pre-Sale is not available.');
    return this.projectionForId(row.id, this.db);
  }

  async customerList(userId: string) {
    const rows = await this.db.preSaleReservation.findMany({ where: { buyerUserId: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return Promise.all(rows.map((row) => this.customerReservation(row.id, userId, this.db)));
  }

  async customerDetail(userId: string, id: string) {
    return this.customerReservation(id, userId, this.db);
  }

  async adminDetail(assetId: string) {
    const row = await this.db.preSale.findFirst({ where: { asset: { OR: [{ id: assetId }, { publicId: assetId }, { slug: assetId }] } } });
    if (row) return this.projectionForId(row.id, this.db, true);
    return this.setupProjection(assetId);
  }

  async configure(actor: Actor, assetId: string, input: { estimatedValueMinor?: string; offeredPercentageBps?: number; totalUnits?: string; pricePerUnitMinor?: string; currency?: string; reason: string }, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const asset = await db.asset.findFirst({ where: { OR: [{ id: assetId }, { publicId: assetId }, { slug: assetId }] }, include: { operationalControl: true, ownershipSupplyPolicy: true, valuationDecisions: { where: { status: 'ACTIVE' }, orderBy: { decidedAt: 'desc' }, take: 1 }, initialOffering: { include: { preSale: true } }, submissions: { where: { status: 'APPROVED' }, orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, ownerUserId: true, declaredMetadata: true, intake: { select: { id: true } } } } } });
      if (!asset) throw notFound('ASSET_NOT_FOUND', 'Asset not found.');
      if (!asset.submissions[0]) fail('APPROVED_SUBMISSION_REQUIRED', 'An approved submission is required before configuring Pre-Sale.');
      if (!asset.submissions[0].intake) fail('INTAKE_PATH_REQUIRED', 'Select a physical intake location before configuring Pre-Sale.');
      if (asset.operationalControl?.status === 'FROZEN') fail('ASSET_OPERATIONS_FROZEN', 'Asset operations are frozen.');
      if (asset.initialOffering?.preSale && asset.initialOffering.preSale.status !== 'DRAFT') fail('PRESALE_ALREADY_LAUNCHED', 'Only a draft Pre-Sale can be reconfigured.');
      if (asset.initialOffering && asset.initialOffering.status !== 'DRAFT') fail('INITIAL_OFFERING_ALREADY_EXISTS', 'An active Initial Offering cannot be replaced by provisional Pre-Sale terms.');
      const metadata = isRecord(asset.submissions[0].declaredMetadata) ? asset.submissions[0].declaredMetadata : {};
      const estimate = input.estimatedValueMinor ?? stringValue(metadata.collectorExpectedValueMinor);
      const totalUnits = parseUnits(input.totalUnits ?? stringValue(metadata.collectorExpectedSupply) ?? asset.ownershipSupplyPolicy?.proposedUnits.toString() ?? '1000');
      const currency = input.currency ?? stringValue(metadata.collectorExpectedCurrency) ?? 'GBP';
      const preference = input.offeredPercentageBps ?? percentageBps(metadata.offerIntentPercent) ?? 10_000;
      if (!Number.isInteger(preference) || preference < 1 || preference > 10_000) fail('PRESALE_TERMS_INVALID', 'Offered percentage must be between 0.01% and 100%.');
      const price = input.pricePerUnitMinor ?? (estimate ? (BigInt(estimate) / totalUnits).toString() : null);
      if (!price || BigInt(price) <= 0n) fail('PRESALE_PRICE_REQUIRED', 'Enter a provisional estimate or price per Slice.');
      const offeredUnits = (totalUnits * BigInt(preference)) / 10_000n;
      if (offeredUnits <= 0n) fail('PRESALE_TERMS_INVALID', 'The offered percentage must produce at least one Slice.');
      const reason = input.reason.trim();
      const offering = asset.initialOffering ?? await db.initialOffering.create({ data: { id: randomUUID(), assetId: asset.id, originatingCollectorUserId: asset.submissions[0].ownerUserId, beneficiaryUserId: asset.submissions[0].ownerUserId, ownershipSupplyPolicyId: null, valuationDecisionId: null, currency, totalUnits, offeredUnits, retainedUnits: totalUnits - offeredUnits, pricePerUnitMinor: BigInt(price), grossOfferingMinor: offeredUnits * BigInt(price), feeScheduleVersion: 'PROVISIONAL_PRESALE', feeBps: 0, status: 'DRAFT' } });
      const sale = asset.initialOffering?.preSale ?? await db.preSale.create({ data: { id: randomUUID(), assetId: asset.id, initialOfferingId: offering.id, status: 'DRAFT', physicalStatus: 'AWAITING_INTAKE' } });
      if (asset.initialOffering) await db.initialOffering.update({ where: { id: offering.id }, data: { currency, totalUnits, offeredUnits, retainedUnits: totalUnits - offeredUnits, pricePerUnitMinor: BigInt(price), grossOfferingMinor: offeredUnits * BigInt(price), feeScheduleVersion: 'PROVISIONAL_PRESALE', feeBps: 0 } });
      await this.audit(db, sale, 'PRE_SALE_CONFIGURED', 'ADMIN', actor.userId, reason, null, { totalUnits: totalUnits.toString(), offeredUnits: offeredUnits.toString(), offeredPercentageBps: preference, pricePerUnitMinor: price, currency }, key);
      return this.projectionForId(sale.id, db, true);
    });
  }

  async pause(actor: Actor, assetId: string, reason: string, requestId: string, key: string) { return this.control(actor, assetId, 'PAUSED', reason, requestId, key); }
  async resume(actor: Actor, assetId: string, reason: string, requestId: string, key: string) { return this.control(actor, assetId, 'ACTIVE', reason, requestId, key); }

  async extend(actor: Actor, assetId: string, deadlineAt: string, reason: string, incidentReference: string | undefined, requestId: string, key: string) {
    this.recentAuth.require(actor);
    const next = new Date(deadlineAt);
    if (Number.isNaN(next.getTime())) throw new ConflictException({ code: 'DEADLINE_INVALID', message: 'A valid UTC deadline is required.' });
    return this.db.$transaction(async (db) => {
      const sale = await this.lockSale(db, assetId);
      if (!sale.deadlineAt || next <= sale.deadlineAt || next.getTime() > sale.deadlineAt.getTime() + 90 * DAY) fail('DEADLINE_EXTENSION_INVALID', 'The new deadline must be later and no more than 90 days beyond the current deadline.');
      const updated = await db.preSale.update({ where: { id: sale.id }, data: { deadlineAt: next, version: { increment: 1 } } });
      await this.audit(db, updated, 'DEADLINE_EXTENDED', 'ADMIN', actor.userId, reason, { deadlineAt: sale.deadlineAt.toISOString() }, { deadlineAt: next.toISOString() }, incidentReference ?? key);
      return this.projectionForId(updated.id, db, true);
    });
  }

  async cancel(actor: Actor, assetId: string, reason: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction((db) => this.cancelInTransaction(db, assetId, reason, 'ADMIN', actor.userId, requestId, key));
  }

  async finalize(actor: Actor, assetId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const sale = await this.lockSale(db, assetId, true);
      const authority = await this.physicalAuthority(db, sale.assetId);
      if (!authority.received || !authority.verified || !authority.secured || authority.exceptions) fail('PRESALE_FINALIZATION_BLOCKED', 'Receipt, verification, custody, and exception checks must all pass before finalization.');
      const active = await db.preSaleReservation.findMany({ where: { preSaleId: sale.id, status: 'ACTIVE' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      const total = active.reduce((sum, row) => sum + row.units, 0n);
      if (!total) { await db.preSale.update({ where: { id: sale.id }, data: { status: 'CONVERTED', completedAt: new Date(), physicalStatus: 'CUSTODY_ESTABLISHED', version: { increment: 1 } } }); return this.projectionForId(sale.id, db, true); }
      const inventory = sale.initialOffering.inventory;
      if (!inventory) fail('PRESALE_INVENTORY_MISSING', 'Offering inventory is unavailable.');
      const market = await db.tradingMarket.findUnique({ where: { assetId: sale.assetId } });
      if (!market || market.status !== 'OPEN' || !market.tradingEnabled) fail('MARKET_NOT_OPEN', 'The market must be open to finalize.');
      await db.preSale.update({ where: { id: sale.id }, data: { status: 'FINALIZING', physicalStatus: 'CUSTODY_ESTABLISHED', version: { increment: 1 } } });
      await db.ownershipPosition.update({ where: { assetId_accountId: { assetId: sale.assetId, accountId: inventory.accountId } }, data: { reservedUnits: { increment: total }, version: { increment: 1 } } });
      await db.initialOfferingInventory.update({ where: { offeringId: sale.initialOffering.id }, data: { availableUnits: { decrement: total }, reservedUnits: { increment: total } } });
      const sellId = randomUUID();
      const ownReservation = await db.ownershipReservation.create({ data: { id: randomUUID(), assetId: sale.assetId, accountId: inventory.accountId, purposeType: 'TRADING_ORDER', purposeId: sellId, units: total, idempotencyRef: key } });
      const seller = await db.tradingOrder.create({ data: { id: sellId, principalType: 'INITIAL_OFFERING', channel: 'INITIAL_OFFERING', principalId: sale.initialOffering.id, initialOfferingId: sale.initialOffering.id, actorUserId: actor.userId, assetId: sale.assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', status: 'OPEN', limitPriceMinor: sale.initialOffering.pricePerUnitMinor, originalUnits: total, remainingUnits: total, filledUnits: 0n, prioritySequence: market.nextPrioritySequence, ownershipReservationId: ownReservation.id } });
      await db.orderStatusHistory.create({ data: { id: randomUUID(), orderId: seller.id, fromStatus: null, toStatus: 'OPEN', reasonCode: 'PRESALE_FINALIZATION_STARTED' } });
      for (const row of active) {
        await db.preSaleReservation.update({ where: { id: row.id }, data: { status: 'CONVERTING', version: { increment: 1 } } });
        const buyId = randomUUID();
        const buyer = await db.tradingOrder.create({ data: { id: buyId, userId: row.buyerUserId, principalType: 'USER', channel: 'INITIAL_OFFERING', principalId: row.buyerUserId, initialOfferingId: sale.initialOffering.id, actorUserId: row.buyerUserId, assetId: sale.assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', status: 'OPEN', limitPriceMinor: row.pricePerUnitMinor, originalUnits: row.units, remainingUnits: row.units, filledUnits: 0n, prioritySequence: market.nextPrioritySequence + BigInt(active.indexOf(row) + 1), cashReservationId: row.cashReservationId } });
        await db.orderStatusHistory.create({ data: { id: randomUUID(), orderId: buyer.id, fromStatus: null, toStatus: 'OPEN', reasonCode: 'PRESALE_RESERVATION_CONVERTING' } });
        await this.trading.settlePreSaleExecution(db, buyer.id, seller.id, actor, requestId);
        await db.preSaleReservation.update({ where: { id: row.id }, data: { status: 'CONVERTED', convertedAt: new Date(), version: { increment: 1 } } });
      }
      await db.preSale.update({ where: { id: sale.id }, data: { status: 'CONVERTED', completedAt: new Date(), version: { increment: 1 } } });
      await this.audit(db, sale, 'FINALIZATION_COMPLETED', 'ADMIN', actor.userId, 'Pre-Sale converted into Initial Offering executions', { status: 'FINALIZING' }, { status: 'CONVERTED' }, key);
      return this.projectionForId(sale.id, db, true);
    });
  }

  async expireDue(now = new Date()) {
    const due = await this.db.preSale.findMany({ where: { status: { in: ['ACTIVE', 'PAUSED'] }, deadlineAt: { lte: now } }, select: { assetId: true } });
    for (const row of due) await this.db.$transaction((db) => this.cancelInTransaction(db, row.assetId, 'Physical intake deadline expired.', 'SYSTEM', undefined, 'presale-deadline-worker', `deadline:${row.assetId}:${now.toISOString().slice(0, 10)}`));
    return due.length;
  }

  async syncPhysicalStatuses() {
    const rows = await this.db.preSale.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED', 'FINALIZING'] } },
      include: {
        asset: {
          include: {
            custodyRecord: true,
            submissions: {
              where: { status: 'APPROVED' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              include: { intake: { include: { shipment: true, receipt: true, verification: true } } },
            },
          },
        },
      },
    });
    let updated = 0;
    for (const row of rows) {
      const physicalStatus = this.physicalStatus(row.asset);
      if (physicalStatus !== row.physicalStatus) {
        await this.db.preSale.update({ where: { id: row.id }, data: { physicalStatus } });
        updated += 1;
      }
    }
    return updated;
  }

  private async control(actor: Actor, assetId: string, status: 'ACTIVE' | 'PAUSED', reason: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const sale = await this.lockSale(db, assetId);
      if ((status === 'PAUSED' && sale.status !== 'ACTIVE') || (status === 'ACTIVE' && sale.status !== 'PAUSED')) fail('PRESALE_INVALID_TRANSITION', 'The Pre-Sale is not in the expected state.');
      const updated = await db.preSale.update({ where: { id: sale.id }, data: { status, pauseReason: status === 'PAUSED' ? reason : null, version: { increment: 1 } } });
      await this.audit(db, updated, status === 'PAUSED' ? 'PRE_SALE_PAUSED' : 'PRE_SALE_RESUMED', 'ADMIN', actor.userId, reason, { status: sale.status }, { status }, key);
      return this.projectionForId(updated.id, db, true);
    });
  }

  private async cancelInTransaction(db: Db, assetId: string, reason: string, source: string, actorUserId: string | undefined, requestId: string, key: string) {
    const sale = await this.lockSale(db, assetId);
    if (sale.status === 'CANCELLED') return this.projectionForId(sale.id, db, true);
    if (sale.status === 'CONVERTED') fail('PRESALE_ALREADY_CONVERTED', 'A converted Pre-Sale cannot be cancelled.');
    const reservations = await db.preSaleReservation.findMany({ where: { preSaleId: sale.id, status: { in: ACTIVE } } });
    for (const row of reservations) {
      if (row.cashReservationId) await this.ledger.releaseCashReservationInTransaction(db, row.cashReservationId, requestId, reason);
      await db.preSaleReservation.update({ where: { id: row.id }, data: { status: 'RELEASED', releasedAt: new Date(), releaseReason: reason, version: { increment: 1 } } });
      await this.notify(db, row.buyerUserId, row.assetId, 'Pre-Sale cancelled', `${reason} Your reserved Slice cash has been released.`, row.id, requestId, 'cancelled');
    }
    const updated = await db.preSale.update({ where: { id: sale.id }, data: { status: 'CANCELLED', cancellationReason: reason, cancellationAt: new Date(), version: { increment: 1 } } });
    await this.audit(db, updated, 'PRE_SALE_CANCELLED', source, actorUserId, reason, { status: sale.status }, { status: updated.status, reason }, key);
    return this.projectionForId(updated.id, db, true);
  }

  private async lockSale(db: Db, assetId: string, includeInventory = false) {
    const sale = await db.preSale.findFirst({ where: { asset: { OR: [{ id: assetId }, { publicId: assetId }, { slug: assetId }] } }, include: { initialOffering: { include: { inventory: includeInventory } } } });
    if (!sale) throw notFound('PRESALE_NOT_FOUND', 'Pre-Sale not found.');
    await db.$queryRaw`SELECT id FROM "PreSale" WHERE id = ${sale.id} FOR UPDATE`;
    return db.preSale.findUniqueOrThrow({ where: { id: sale.id }, include: { initialOffering: { include: { inventory: includeInventory } } } });
  }

  private async projectionForId(id: string, db: Db, admin = false) {
    const row = await db.preSale.findUnique({ where: { id }, include: { initialOffering: { include: { inventory: true } }, asset: { include: { submissions: { where: { status: 'APPROVED' }, orderBy: { updatedAt: 'desc' }, take: 1, include: { intake: { include: { shipment: true, receipt: true, verification: true, exceptions: { where: { resolvedAt: null } } } } } }, custodyRecord: true } }, reservations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }, auditEvents: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 } } });
    if (!row) throw notFound('PRESALE_NOT_FOUND', 'Pre-Sale not found.');
    const active = row.reservations.filter((item) => ACTIVE.includes(item.status));
    const reservedUnits = active.reduce((sum, item) => sum + item.units, 0n);
    const physical = this.physicalStatus(row.asset);
    const metadata = isRecord(row.asset.submissions[0]?.declaredMetadata) ? row.asset.submissions[0].declaredMetadata : {};
    const offeredPercentageBps = row.initialOffering.totalUnits ? Number((row.initialOffering.offeredUnits * 10_000n) / row.initialOffering.totalUnits) : 0;
    const draftBlockers = row.status === 'DRAFT'
      ? [
          ...(row.initialOffering.totalUnits > 0n ? [] : ['PRESALE_SUPPLY_REQUIRED']),
          ...(row.initialOffering.offeredUnits > 0n && row.initialOffering.offeredUnits <= row.initialOffering.totalUnits ? [] : ['PRESALE_INVENTORY_INVALID']),
          ...(row.initialOffering.pricePerUnitMinor > 0n ? [] : ['PRESALE_PRICE_REQUIRED']),
        ]
      : [];
    const totalUnits = row.initialOffering.totalUnits;
    const sliceOwnershipPercentageBps = totalUnits > 0n ? Number(10_000n / totalUnits) : 0;
    const collectorRetainedPercentageBps = Math.max(0, 10_000 - offeredPercentageBps);
    return { id: row.id, asset: { id: row.asset.publicId, slug: row.asset.slug, title: row.asset.title }, status: row.status, openedAt: row.openedAt?.toISOString() ?? null, deadlineAt: row.deadlineAt?.toISOString() ?? null, physicalStatus: physical, reservedUnits: reservedUnits.toString(), reservedPercentageBps: row.initialOffering.offeredUnits ? Number((reservedUnits * 10_000n) / row.initialOffering.offeredUnits) : 0, offeredUnits: row.initialOffering.offeredUnits.toString(), availableUnits: (row.initialOffering.offeredUnits - reservedUnits).toString(), pricePerUnitMinor: row.initialOffering.pricePerUnitMinor.toString(), currency: row.initialOffering.currency, reservationCount: active.length, sliceOwnershipPercentageBps, collectorRetainedPercentageBps, disclosure: 'Slice has not yet physically received and verified this collectible. Your reservation remains conditional until physical intake, verification, and custody are complete. If the deadline is missed, your reserved funds will be released or refunded.', nextStep: physical === 'CUSTODY_ESTABLISHED' ? 'Finalization pending' : 'Awaiting physical intake', collectorEstimateMinor: stringValue(metadata.collectorExpectedValueMinor), offeredPercentageBps, totalSupply: totalUnits.toString(), readiness: { ready: draftBlockers.length === 0, blockers: draftBlockers }, commands: { canConfigurePreSale: row.status === 'DRAFT', canLaunchPreSale: row.status === 'DRAFT' && draftBlockers.length === 0, canEditPreSaleTerms: row.status === 'DRAFT', canPausePreSale: row.status === 'ACTIVE', canResumePreSale: row.status === 'PAUSED', canCancelPreSale: !['CANCELLED', 'CONVERTED'].includes(row.status), canExtendPreSale: ['ACTIVE', 'PAUSED'].includes(row.status), canFinalizePreSale: physical === 'CUSTODY_ESTABLISHED' && !['CANCELLED', 'CONVERTED'].includes(row.status) }, reservations: admin ? row.reservations.map((item) => ({ id: item.id, buyerUserId: item.buyerUserId, units: item.units.toString(), grossMinor: item.grossMinor.toString(), status: item.status, createdAt: item.createdAt.toISOString() })) : undefined, history: admin ? row.auditEvents.map((item) => ({ action: item.action, source: item.source, reason: item.reason, actorUserId: item.actorUserId, createdAt: item.createdAt.toISOString(), before: item.beforeState, after: item.afterState, reference: item.reference })) : undefined };
  }

  private async setupProjection(assetId: string) {
    const asset = await this.db.asset.findFirst({ where: { OR: [{ id: assetId }, { publicId: assetId }, { slug: assetId }] }, include: { submissions: { where: { status: 'APPROVED' }, orderBy: { updatedAt: 'desc' }, take: 1, include: { intake: true } }, ownershipSupplyPolicy: true } });
    if (!asset) throw notFound('ASSET_NOT_FOUND', 'Asset not found.');
    const submission = asset.submissions[0];
    const metadata = isRecord(submission?.declaredMetadata) ? submission.declaredMetadata : {};
    const totalSupply = stringValue(metadata.collectorExpectedSupply) ?? asset.ownershipSupplyPolicy?.proposedUnits.toString() ?? '1000';
    const estimate = stringValue(metadata.collectorExpectedValueMinor);
    const preference = percentageBps(metadata.offerIntentPercent) ?? 10_000;
    const price = estimate ? (BigInt(estimate) / BigInt(totalSupply)).toString() : null;
    const blockers = [
      !submission ? 'APPROVED_SUBMISSION_REQUIRED' : null,
      submission && !submission.intake ? 'INTAKE_PATH_REQUIRED' : null,
      'PRESALE_TERMS_REQUIRED',
    ].filter((value): value is string => Boolean(value));
    const totalUnitsBigInt = BigInt(totalSupply);
    return { id: null, asset: { id: asset.publicId, slug: asset.slug, title: asset.title }, status: 'NOT_CONFIGURED', openedAt: null, deadlineAt: null, physicalStatus: 'AWAITING_INTAKE', reservedUnits: '0', reservedPercentageBps: 0, offeredUnits: ((totalUnitsBigInt * BigInt(preference)) / 10_000n).toString(), availableUnits: ((totalUnitsBigInt * BigInt(preference)) / 10_000n).toString(), pricePerUnitMinor: price, currency: stringValue(metadata.collectorExpectedCurrency) ?? 'GBP', reservationCount: 0, sliceOwnershipPercentageBps: totalUnitsBigInt > 0n ? Number(10_000n / totalUnitsBigInt) : 0, collectorRetainedPercentageBps: Math.max(0, 10_000 - preference), disclosure: 'Configure provisional terms first. Pre-Sale reservations remain conditional until physical intake, verification, and custody are complete.', nextStep: 'Configure provisional Pre-Sale terms', collectorEstimateMinor: estimate, offeredPercentageBps: preference, totalSupply, readiness: { ready: false, blockers }, commands: { canConfigurePreSale: Boolean(submission?.intake), canLaunchPreSale: false, canEditPreSaleTerms: false, canPausePreSale: false, canResumePreSale: false, canCancelPreSale: false, canExtendPreSale: false, canFinalizePreSale: false } };
  }

  private async customerReservation(id: string, userId: string, db: Db | PrismaService) {
    const row = await db.preSaleReservation.findFirst({ where: { id, buyerUserId: userId }, include: { preSale: { include: { asset: true, initialOffering: true } } } });
    if (!row) throw notFound('PRESALE_RESERVATION_NOT_FOUND', 'Reservation not found.');
    const totalUnits = row.preSale.initialOffering.totalUnits;
    return { id: row.id, asset: { slug: row.preSale.asset.slug, title: row.preSale.asset.title }, units: row.units.toString(), totalUnits: totalUnits.toString(), sliceOwnershipPercentageBps: totalUnits > 0n ? Number(10_000n / totalUnits) : 0, pricePerUnitMinor: row.pricePerUnitMinor.toString(), grossMinor: row.grossMinor.toString(), status: row.status, createdAt: row.createdAt.toISOString(), deadlineAt: row.preSale.deadlineAt?.toISOString() ?? null, physicalStatus: row.preSale.physicalStatus, disclosure: 'Final ownership is created only after Slice receives, verifies, and secures the collectible.' };
  }

  private async physicalAuthority(db: Db, assetId: string) {
    const asset = await db.asset.findUnique({ where: { id: assetId }, include: { custodyRecord: true, submissions: { where: { status: 'APPROVED' }, orderBy: { updatedAt: 'desc' }, take: 1, include: { intake: { include: { receipt: true, verification: true, exceptions: { where: { resolvedAt: null } } } } } } } });
    const intake = asset?.submissions[0]?.intake;
    return { received: Boolean(intake?.receipt), verified: intake?.verification?.status === 'VERIFIED', secured: asset?.custodyRecord?.status === 'SECURED', exceptions: Boolean(intake?.exceptions.length) };
  }

  private physicalStatus(asset: { custodyRecord?: { status: string } | null; submissions?: Array<{ intake?: unknown | null }> }) {
    const intake = asset.submissions?.[0]?.intake as { receipt?: unknown; verification?: { status: string } | null; shipment?: { status: string } | null } | null | undefined;
    if (asset.custodyRecord?.status === 'SECURED') return 'CUSTODY_ESTABLISHED';
    if (intake?.verification?.status === 'VERIFIED') return 'VERIFIED';
    if (intake?.receipt) return 'RECEIVED_BY_SLICE';
    if (intake?.shipment?.status === 'DELIVERED') return 'CARRIER_DELIVERED';
    if (intake?.shipment?.status === 'IN_TRANSIT') return 'IN_TRANSIT';
    return 'AWAITING_INTAKE';
  }

  private async audit(db: Db, sale: { id: string }, action: string, source: string, actorUserId: string | undefined, reason: string, beforeState: unknown, afterState: unknown, reference?: string) {
    await db.preSaleAuditEvent.create({ data: { id: randomUUID(), preSaleId: sale.id, action, source, actorUserId: actorUserId ?? null, reason, beforeState: beforeState ?? {}, afterState: afterState ?? {}, reference: reference ?? null } });
    await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: (actorUserId ?? null) as never, actorType: actorUserId ? 'USER' : 'SYSTEM', action, resourceType: 'pre-sale', resourceId: sale.id, requestId: reference ?? action, sessionId: null, result: 'SUCCESS', metadata: { reason }, createdAt: new Date() });
  }

  private async notify(db: Db, userId: string, assetId: string, title: string, body: string, resourceId: string, requestId: string, suffix: string) {
    await this.outbox.append(db, financialNotificationEvent({ kind: financialNotificationKind.preSaleUpdate, title, body, resourceType: 'account', resourceId: userId, aggregateType: 'account', aggregateId: userId, actorUserId: userId, correlationId: requestId, eventSuffix: `presale:${assetId}:${resourceId}:${suffix}` }));
  }

  private deadlineDays() { return this.config.preSaleDeadlineDays ?? 14; }
}

function parseUnits(value: string) { if (!/^\d+$/.test(value)) fail('UNITS_INVALID', 'Units must be a positive integer.'); const units = BigInt(value); if (units <= 0n) fail('UNITS_INVALID', 'Units must be a positive integer.'); return units; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringValue(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function percentageBps(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 && number <= 100 ? Math.round(number * 100) : null; }
function fail(code: string, message: string): never { throw new ConflictException({ code, message }); }
function notFound(code: string, message: string): never { throw new NotFoundException({ code, message }); }
