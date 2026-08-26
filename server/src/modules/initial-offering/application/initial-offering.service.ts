import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { OutboxWriter } from '../../outbox/application/outbox-writer.service';
import { eventType, initialOfferingLifecycleEvent, orderLifecycleEvent } from '../../outbox/domain/domain-event';
import { assertInitialOfferingTransition, calculateInitialOfferingPreview, initialOfferingFeePolicy, isInitialOfferingSupplyPolicyReady, unitsForPercentage, validateOfferingTerms } from '../domain/initial-offering';
import { hasStagingDemoPhysicalReadiness } from '../../lifecycle/domain/staging-demo-physical.policy';

type Db = Prisma.TransactionClient;
type TransitionTarget = 'PAUSED' | 'CANCELLED' | 'EXPIRED';

@Injectable()
export class InitialOfferingService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    private readonly outbox: OutboxWriter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async propose(actor: Actor, assetId: string, offeredUnitsWire: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    const offeredUnits = parseUnits(offeredUnitsWire);
    return this.mutate(actor, `propose:${assetId}`, { assetId, offeredUnits: offeredUnits.toString() }, requestId, key, async (db, audit, idempotencyRecordId) => {
      const asset = await this.authoritativeAsset(db, assetId, actor.userId);
      const policy = asset.ownershipSupplyPolicy;
      const decision = asset.valuationDecisions[0];
      const submission = asset.submissions[0];
      if (!submission) fail('APPROVED_SUBMISSION_REQUIRED', 'An approved collector submission is required.');
      if (!policy || !isInitialOfferingSupplyPolicyReady(policy.status)) fail('SUPPLY_POLICY_NOT_APPROVED', 'An approved supply policy is required before proposing an offering.');
      if (!decision) fail('VALUATION_REQUIRED', 'An active valuation is required before proposing an offering.');
      if (asset.initialOffering) fail('INITIAL_OFFERING_ALREADY_EXISTS', 'This asset already has an authoritative initial offering.');
      const terms = validateOfferingTerms({
        totalUnits: policy.proposedUnits,
        offeredUnits,
        pricePerUnitMinor: policy.pricePerUnitMinor,
        currency: policy.valuationCurrency,
        approvedCurrency: policy.valuationCurrency,
      });
      const offering = await db.initialOffering.create({
        data: {
          id: randomUUID(),
          assetId,
          originatingCollectorUserId: submission.ownerUserId,
          beneficiaryUserId: submission.ownerUserId,
          ownershipSupplyPolicyId: policy.id,
          valuationDecisionId: decision.id,
          currency: policy.valuationCurrency,
          totalUnits: policy.proposedUnits,
          offeredUnits,
          retainedUnits: terms.retainedUnits,
          pricePerUnitMinor: policy.pricePerUnitMinor,
          grossOfferingMinor: terms.grossOfferingMinor,
          feeScheduleVersion: initialOfferingFeePolicy.version,
          feeBps: initialOfferingFeePolicy.feeBps,
          status: 'AWAITING_APPROVAL',
        },
      });
      await this.appendLifecycle(db, offering, eventType.initialOfferingCreated, requestId, actor.userId);
      await audit('INITIAL_OFFERING_CREATED', { offeringId: offering.id, assetId, offeredUnits: offeredUnits.toString(), retainedUnits: terms.retainedUnits.toString(), idempotencyRecordId });
      return this.projectionFromRecord(offering);
    });
  }

  async collectorPreview(actor: Actor, assetId: string, percentageBps: number) {
    this.recentAuth.require(actor);
    const asset = await this.authoritativeAsset(this.db, assetId, actor.userId);
    const policy = asset.ownershipSupplyPolicy;
    const decision = asset.valuationDecisions[0];
    if (!asset.submissions[0]) fail('APPROVED_SUBMISSION_REQUIRED', 'An approved collector submission is required.');
    if (!policy || !isInitialOfferingSupplyPolicyReady(policy.status)) fail('SUPPLY_POLICY_NOT_APPROVED', 'An approved supply policy is required before configuring an offering.');
    if (!decision) fail('VALUATION_REQUIRED', 'An active valuation is required before configuring an offering.');
    const offeredUnits = unitsForPercentage(policy.proposedUnits, percentageBps);
    if (offeredUnits <= 0n) fail('OFFERING_TOO_SMALL', 'Choose a percentage that creates at least one ownership unit.');
    const preview = calculateInitialOfferingPreview({ totalUnits: policy.proposedUnits, valuationMinor: decision.valueMinor, offeredUnits, pricePerUnitMinor: policy.pricePerUnitMinor, currency: policy.valuationCurrency, feeBps: initialOfferingFeePolicy.feeBps });
    return {
      totalUnits: preview.totalUnits.toString(),
      valuationMinor: preview.valuationMinor.toString(),
      offeredUnits: preview.offeredUnits.toString(),
      retainedUnits: preview.retainedUnits.toString(),
      offeredPercentageBps: preview.offeredPercentageBps,
      retainedPercentageBps: preview.retainedPercentageBps,
      pricePerUnitMinor: preview.pricePerUnitMinor.toString(),
      grossOfferingMinor: preview.grossOfferingMinor.toString(),
      feeMinor: preview.feeMinor.toString(),
      netOfferingMinor: preview.netOfferingMinor.toString(),
      currency: preview.currency,
      feeScheduleVersion: initialOfferingFeePolicy.version,
      feeBps: initialOfferingFeePolicy.feeBps,
      feePolicyStatus: 'CONFIGURED' as const,
    };
  }

  async update(actor: Actor, offeringId: string, offeredUnitsWire: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    const offeredUnits = parseUnits(offeredUnitsWire);
    return this.mutate(actor, `update:${offeringId}`, { offeringId, offeredUnits: offeredUnits.toString() }, requestId, key, async (db, audit) => {
      const offering = await db.initialOffering.findUnique({ where: { id: offeringId }, include: { asset: { include: { ownershipSupplyPolicy: true, valuationDecisions: { where: { status: 'ACTIVE' }, orderBy: { decidedAt: 'desc' }, take: 1 }, publication: true, custodyRecord: true, controlledBetaBypass: true, stagingDemoPhysicalIntake: true, insuranceCoverage: { where: { status: 'ACTIVE', effectiveAt: { lte: new Date() }, expiresAt: { gt: new Date() } }, take: 1 } } } } });
      if (!offering || offering.originatingCollectorUserId !== actor.userId) throw new NotFoundException({ code: 'INITIAL_OFFERING_NOT_FOUND', message: 'Offering not found.' });
      if (offering.status !== 'AWAITING_APPROVAL' && offering.status !== 'CHANGES_REQUESTED') fail('OFFERING_IMMUTABLE', 'Offering terms cannot change after approval.');
      const policy = offering.asset.ownershipSupplyPolicy;
      const decision = offering.asset.valuationDecisions[0];
      if (!policy || !isInitialOfferingSupplyPolicyReady(policy.status) || policy.id !== offering.ownershipSupplyPolicyId) fail('SUPPLY_POLICY_NOT_APPROVED', 'The approved supply policy is no longer available.');
      if (!decision || decision.id !== offering.valuationDecisionId || decision.valueMinor !== policy.valuationMinor || decision.currency !== offering.currency) fail('VALUATION_CHANGED', 'The approved valuation has changed; request a new offering review.');
      const terms = validateOfferingTerms({ totalUnits: policy.proposedUnits, offeredUnits, pricePerUnitMinor: policy.pricePerUnitMinor, currency: policy.valuationCurrency, approvedCurrency: policy.valuationCurrency });
      const updated = await db.initialOffering.update({ where: { id: offeringId }, data: { offeredUnits, retainedUnits: terms.retainedUnits, grossOfferingMinor: terms.grossOfferingMinor, status: 'AWAITING_APPROVAL', changeRequestReason: null } });
      await this.appendLifecycle(db, updated, eventType.initialOfferingUpdated, requestId, actor.userId);
      await audit('INITIAL_OFFERING_UPDATED', { offeringId, offeredUnits: offeredUnits.toString(), retainedUnits: terms.retainedUnits.toString() });
      return this.projectionFromRecord(updated);
    });
  }

  async collectorProjection(actor: Actor, assetId: string) {
    this.recentAuth.require(actor);
    const offering = await this.db.initialOffering.findUnique({ where: { assetId }, include: { inventory: true } });
    if (!offering || offering.originatingCollectorUserId !== actor.userId) throw new NotFoundException({ code: 'INITIAL_OFFERING_NOT_FOUND', message: 'Offering not found.' });
    return this.projection(offering);
  }

  async requestChanges(actor: Actor, offeringId: string, reason: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(actor, `changes:${offeringId}`, { offeringId, reason }, requestId, key, async (db, audit) => {
      const offering = await db.initialOffering.findUnique({ where: { id: offeringId } });
      if (!offering) throw new NotFoundException({ code: 'INITIAL_OFFERING_NOT_FOUND', message: 'Offering not found.' });
      if (offering.originatingCollectorUserId === actor.userId) fail('OFFERING_SELF_REVIEW', 'The originating collector cannot review their own offering.');
      assertInitialOfferingTransition(offering.status, 'CHANGES_REQUESTED');
      const updated = await db.initialOffering.update({ where: { id: offeringId }, data: { status: 'CHANGES_REQUESTED', changeRequestReason: reason.trim() } });
      await this.appendLifecycle(db, updated, eventType.initialOfferingChangesRequested, requestId, actor.userId);
      await audit('INITIAL_OFFERING_CHANGES_REQUESTED', { offeringId, reason: reason.trim() });
      return this.projectionFromRecord(updated);
    });
  }

  async adminProjection(offeringId: string) {
    const offering = await this.db.initialOffering.findUnique({ where: { id: offeringId }, include: { inventory: true, originatingCollector: { select: { id: true, profile: { select: { displayName: true, publicUsername: true } } } }, asset: { include: { ownershipSupplyPolicy: true, valuationDecisions: { where: { status: 'ACTIVE' }, orderBy: { decidedAt: 'desc' }, take: 1 }, publication: true, custodyRecord: true, controlledBetaBypass: true, stagingDemoPhysicalIntake: true, insuranceCoverage: { where: { status: 'ACTIVE', effectiveAt: { lte: new Date() }, expiresAt: { gt: new Date() } }, take: 1 }, tradingMarket: true } } } });
    if (!offering) throw new NotFoundException({ code: 'INITIAL_OFFERING_NOT_FOUND', message: 'Offering not found.' });
    const base = await this.projection(offering);
    return { ...base, collector: { id: offering.originatingCollector.id, displayName: offering.originatingCollector.profile?.displayName ?? 'Collector', username: offering.originatingCollector.profile?.publicUsername ?? null }, readiness: { custody: offering.asset.custodyRecord?.status === 'SECURED' || Boolean(offering.asset.controlledBetaBypass) || hasStagingDemoPhysicalReadiness(this.config.isBeta, offering.asset.stagingDemoPhysicalIntake), insurance: offering.asset.insuranceCoverage.length === 1, publication: offering.asset.publication?.status === 'PUBLISHED', market: offering.asset.tradingMarket?.status === 'OPEN' && offering.asset.tradingMarket.tradingEnabled }, valuation: offering.asset.valuationDecisions[0] ? { minor: offering.asset.valuationDecisions[0].valueMinor.toString(), currency: offering.asset.valuationDecisions[0].currency, asOf: offering.asset.valuationDecisions[0].decidedAt.toISOString() } : null, supplyPolicy: offering.asset.ownershipSupplyPolicy ? { status: offering.asset.ownershipSupplyPolicy.status, units: offering.asset.ownershipSupplyPolicy.proposedUnits.toString(), pricePerUnitMinor: offering.asset.ownershipSupplyPolicy.pricePerUnitMinor.toString() } : null };
  }

  async approve(actor: Actor, offeringId: string, reason: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(actor, `approve:${offeringId}`, { offeringId, reason }, requestId, key, async (db, audit) => {
      const offering = await db.initialOffering.findUnique({ where: { id: offeringId }, include: { asset: { include: { ownershipSupplyPolicy: true, valuationDecisions: { where: { status: 'ACTIVE' }, orderBy: { decidedAt: 'desc' }, take: 1 }, publication: true, custodyRecord: true, controlledBetaBypass: true, stagingDemoPhysicalIntake: true, insuranceCoverage: { where: { status: 'ACTIVE', effectiveAt: { lte: new Date() }, expiresAt: { gt: new Date() } }, take: 1 } } } } });
      if (!offering) throw new NotFoundException({ code: 'INITIAL_OFFERING_NOT_FOUND', message: 'Offering not found.' });
      if (offering.originatingCollectorUserId === actor.userId) fail('OFFERING_SELF_APPROVAL', 'The originating collector cannot approve their own offering.');
      assertInitialOfferingTransition(offering.status, 'APPROVED');
      const policy = offering.asset.ownershipSupplyPolicy;
      const decision = offering.asset.valuationDecisions[0];
      if (!policy || !isInitialOfferingSupplyPolicyReady(policy.status) || policy.id !== offering.ownershipSupplyPolicyId) fail('SUPPLY_POLICY_NOT_APPROVED', 'The linked supply policy is not approved.');
      if (!decision || decision.id !== offering.valuationDecisionId || decision.valueMinor !== policy.valuationMinor || decision.currency !== offering.currency) fail('VALUATION_CHANGED', 'The linked valuation is no longer authoritative.');
      if (offering.asset.status !== 'PUBLISHED' || offering.asset.publication?.status !== 'PUBLISHED') fail('ASSET_NOT_PUBLISHED', 'The asset must be published before approval.');
      if (offering.asset.custodyRecord?.status !== 'SECURED' && !offering.asset.controlledBetaBypass && !hasStagingDemoPhysicalReadiness(this.config.isBeta, offering.asset.stagingDemoPhysicalIntake)) fail('CUSTODY_NOT_SECURED', 'The asset must be secured before approval.');
      if (offering.asset.insuranceCoverage.length !== 1) fail('INSURANCE_REQUIRED', 'Active insurance is required before an offering can be approved.');
      const updated = await db.initialOffering.update({ where: { id: offeringId }, data: { status: 'APPROVED', approvedAt: new Date() } });
      await this.appendLifecycle(db, updated, eventType.initialOfferingApproved, requestId, actor.userId);
      await audit('INITIAL_OFFERING_APPROVED', { offeringId, reason: reason.trim() });
      return this.projectionFromRecord(updated);
    });
  }

  async open(actor: Actor, offeringId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(actor, `open:${offeringId}`, { offeringId }, requestId, key, async (db, audit) => {
      const offering = await db.initialOffering.findUnique({ where: { id: offeringId }, include: { inventory: { include: { account: true } }, asset: { include: { ownershipSupply: true, tradingMarket: true } } } });
      if (!offering) throw new NotFoundException({ code: 'INITIAL_OFFERING_NOT_FOUND', message: 'Offering not found.' });
      if (offering.status !== 'APPROVED' && offering.status !== 'PAUSED') fail('INITIAL_OFFERING_NOT_READY', 'Only an approved or paused offering can be opened.');
      const inventory = offering.inventory ?? await this.allocateIssuedOwnershipForOffering(db, offering, key);
      if (!inventory || inventory.account.type !== 'INITIAL_OFFERING') fail('INITIAL_OFFERING_INVENTORY_MISSING', 'Initial offering inventory is not available.');
      if (!offering.asset.ownershipSupply || offering.asset.ownershipSupply.issuedUnits !== offering.totalUnits) fail('OWNERSHIP_NOT_ISSUED', 'Ownership must be issued before opening the offering.');
      const market = offering.asset.tradingMarket;
      if (!market || market.status !== 'OPEN' || !market.tradingEnabled) fail('MARKET_NOT_OPEN', 'An open trading market is required before opening the offering.');
      const position = await db.ownershipPosition.findUnique({ where: { assetId_accountId: { assetId: offering.assetId, accountId: inventory.accountId } } });
      if (!position || position.settledUnits - position.reservedUnits < offering.offeredUnits) fail('INITIAL_OFFERING_INVENTORY_UNAVAILABLE', 'The offering inventory is not available.');
      const existingOrder = await db.tradingOrder.findFirst({ where: { initialOfferingId: offering.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } } });
      if (existingOrder) return this.projectionFromRecord(offering);
      const order = await db.tradingOrder.create({ data: { id: randomUUID(), principalType: 'INITIAL_OFFERING', channel: 'INITIAL_OFFERING', principalId: offering.id, initialOfferingId: offering.id, actorUserId: actor.userId, assetId: offering.assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', status: 'OPEN', limitPriceMinor: offering.pricePerUnitMinor, originalUnits: offering.offeredUnits, remainingUnits: offering.offeredUnits, filledUnits: 0n, prioritySequence: market.nextPrioritySequence, ownershipReservationId: randomUUID() } });
      await db.ownershipReservation.create({ data: { id: order.ownershipReservationId!, assetId: offering.assetId, accountId: inventory.accountId, purposeType: 'INITIAL_OFFERING', purposeId: offering.id, units: offering.offeredUnits, idempotencyRef: key } });
      await db.ownershipPosition.update({ where: { id: position.id }, data: { reservedUnits: { increment: offering.offeredUnits }, version: { increment: 1 } } });
      await db.initialOfferingInventory.update({ where: { id: inventory.id }, data: { availableUnits: 0n, reservedUnits: offering.offeredUnits } });
      await db.tradingMarket.update({ where: { assetId: offering.assetId }, data: { nextPrioritySequence: { increment: 1n }, version: { increment: 1 } } });
      await db.orderStatusHistory.create({ data: { id: randomUUID(), orderId: order.id, fromStatus: null, toStatus: 'OPEN', reasonCode: 'INITIAL_OFFERING_OPENED' } });
      await this.outbox.append(db, orderLifecycleEvent({ eventType: eventType.orderOpened, orderId: order.id, assetId: offering.assetId, side: 'SELL', units: offering.offeredUnits.toString(), status: 'OPEN', actorUserId: actor.userId, correlationId: requestId, occurredAt: order.createdAt }));
      const updated = await db.initialOffering.update({ where: { id: offering.id }, data: { status: 'OPEN', openedAt: offering.openedAt ?? new Date() } });
      await this.appendLifecycle(db, updated, eventType.initialOfferingOpened, requestId, actor.userId);
      await audit('INITIAL_OFFERING_OPENED', { offeringId, orderId: order.id, offeredUnits: offering.offeredUnits.toString() });
      return this.projectionFromRecord(updated);
    });
  }

  /**
   * Supports the valid lifecycle where ownership was issued before a collector
   * created an initial offering. Issuance created Treasury ownership because
   * no offering existed yet; opening the approved offering is the authoritative
   * point to allocate the issued units into retained collector ownership and
   * Initial Offering inventory.
   */
  private async allocateIssuedOwnershipForOffering(
    db: Db,
    offering: {
      id: string;
      assetId: string;
      beneficiaryUserId: string;
      totalUnits: bigint;
      offeredUnits: bigint;
      retainedUnits: bigint;
      asset: { ownershipSupply: { nextSequence: bigint; issuedUnits: bigint } | null };
    },
    idempotencyRecordId: string,
  ) {
    if (!offering.asset.ownershipSupply || offering.asset.ownershipSupply.issuedUnits !== offering.totalUnits) {
      fail('OWNERSHIP_NOT_ISSUED', 'Ownership must be issued before opening the offering.');
    }
    if (offering.offeredUnits + offering.retainedUnits !== offering.totalUnits) {
      fail('INITIAL_OFFERING_ALLOCATION_INVALID', 'Offering allocation must equal the issued supply.');
    }

    const existing = await db.initialOfferingInventory.findUnique({ where: { offeringId: offering.id }, include: { account: true } });
    if (existing) return existing;

    const treasury = await db.ownershipAccount.findFirst({ where: { type: 'TREASURY', positions: { some: { assetId: offering.assetId } } } });
    if (!treasury) fail('OWNERSHIP_TREASURY_MISSING', 'Issued ownership Treasury is unavailable.');
    const treasuryPosition = await db.ownershipPosition.findUnique({ where: { assetId_accountId: { assetId: offering.assetId, accountId: treasury.id } } });
    if (!treasuryPosition || treasuryPosition.settledUnits - treasuryPosition.reservedUnits < offering.totalUnits) {
      fail('INITIAL_OFFERING_ALLOCATION_UNAVAILABLE', 'Issued ownership is not available for this offering.');
    }

    const collector = (await db.ownershipAccount.findUnique({ where: { userId: offering.beneficiaryUserId } })) ?? await db.ownershipAccount.create({ data: { id: randomUUID(), type: 'USER', userId: offering.beneficiaryUserId, status: 'ACTIVE' } });
    if (collector.type !== 'USER') fail('OWNERSHIP_ACCOUNT_INVALID', 'Collector ownership account is unavailable.');
    const inventoryAccount = await db.ownershipAccount.create({ data: { id: randomUUID(), type: 'INITIAL_OFFERING', status: 'ACTIVE' } });

    await db.ownershipPosition.upsert({
      where: { assetId_accountId: { assetId: offering.assetId, accountId: collector.id } },
      create: { id: randomUUID(), assetId: offering.assetId, accountId: collector.id, settledUnits: offering.retainedUnits, reservedUnits: 0n },
      update: { settledUnits: { increment: offering.retainedUnits }, version: { increment: 1 } },
    });
    await db.ownershipPosition.create({ data: { id: randomUUID(), assetId: offering.assetId, accountId: inventoryAccount.id, settledUnits: offering.offeredUnits, reservedUnits: 0n } });
    await db.ownershipPosition.update({ where: { id: treasuryPosition.id }, data: { settledUnits: { decrement: offering.totalUnits }, version: { increment: 1 } } });

    const sequence = offering.asset.ownershipSupply.nextSequence;
    await db.ownershipLedgerEntry.create({ data: { id: randomUUID(), assetId: offering.assetId, sequence, entryType: 'TRANSFER', debitAccountId: treasury.id, creditAccountId: collector.id, units: offering.retainedUnits, correlationId: `initial-offering:${offering.id}:collector`, idempotencyRecordId, reasonCode: 'INITIAL_OFFERING_ALLOCATION', metadata: { schemaVersion: 1, channel: 'INITIAL_OFFERING' }, actorUserId: null } });
    await db.ownershipLedgerEntry.create({ data: { id: randomUUID(), assetId: offering.assetId, sequence: sequence + 1n, entryType: 'TRANSFER', debitAccountId: treasury.id, creditAccountId: inventoryAccount.id, units: offering.offeredUnits, correlationId: `initial-offering:${offering.id}:inventory`, idempotencyRecordId, reasonCode: 'INITIAL_OFFERING_ALLOCATION', metadata: { schemaVersion: 1, channel: 'INITIAL_OFFERING' }, actorUserId: null } });
    await db.ownershipAssetSupply.update({ where: { assetId: offering.assetId }, data: { nextSequence: { increment: 2n } } });

    return db.initialOfferingInventory.create({ data: { id: randomUUID(), offeringId: offering.id, assetId: offering.assetId, accountId: inventoryAccount.id, beneficiaryUserId: offering.beneficiaryUserId, offeredUnits: offering.offeredUnits, availableUnits: offering.offeredUnits, reservedUnits: 0n, settledUnits: 0n }, include: { account: true } });
  }

  async transition(actor: Actor, offeringId: string, target: TransitionTarget, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(actor, `${target.toLowerCase()}:${offeringId}`, { offeringId, target }, requestId, key, async (db, audit) => {
      const offering = await db.initialOffering.findUnique({ where: { id: offeringId }, include: { inventory: true } });
      if (!offering) throw new NotFoundException({ code: 'INITIAL_OFFERING_NOT_FOUND', message: 'Offering not found.' });
      assertInitialOfferingTransition(offering.status, target);
      if (offering.inventory && (target === 'PAUSED' || target === 'CANCELLED' || target === 'EXPIRED')) await this.releaseOpenOrder(db, offering, target === 'PAUSED' ? 'INITIAL_OFFERING_PAUSED' : 'INITIAL_OFFERING_CANCELLED');
      const updated = await db.initialOffering.update({ where: { id: offeringId }, data: { status: target, closedAt: target === 'CANCELLED' || target === 'EXPIRED' ? new Date() : null } });
      const event = target === 'PAUSED' ? eventType.initialOfferingPaused : target === 'CANCELLED' ? eventType.initialOfferingCancelled : eventType.initialOfferingExpired;
      await this.appendLifecycle(db, updated, event, requestId, actor.userId);
      await audit(`INITIAL_OFFERING_${target}`, { offeringId });
      return this.projectionFromRecord(updated);
    });
  }

  private async authoritativeAsset(db: Db, assetId: string, ownerUserId: string) {
    const asset = await db.asset.findUnique({ where: { id: assetId }, include: { publication: true, custodyRecord: true, controlledBetaBypass: true, stagingDemoPhysicalIntake: true, insuranceCoverage: { where: { status: 'ACTIVE', effectiveAt: { lte: new Date() }, expiresAt: { gt: new Date() } }, take: 1 }, ownershipSupplyPolicy: true, valuationDecisions: { where: { status: 'ACTIVE' }, orderBy: { decidedAt: 'desc' }, take: 1 }, submissions: { where: { ownerUserId, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 1 }, initialOffering: true } });
    if (!asset) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Asset not found.' });
    if (asset.status !== 'PUBLISHED' || asset.publication?.status !== 'PUBLISHED') fail('ASSET_NOT_PUBLISHED', 'The asset must be published before an offering can be proposed.');
    if (asset.custodyRecord?.status !== 'SECURED' && !asset.controlledBetaBypass && !hasStagingDemoPhysicalReadiness(this.config.isBeta, asset.stagingDemoPhysicalIntake)) fail('CUSTODY_NOT_SECURED', 'The asset must be secured before an offering can be proposed.');
    if (asset.insuranceCoverage.length !== 1) fail('INSURANCE_REQUIRED', 'Active insurance is required before an offering can be proposed.');
    return asset;
  }

  private async releaseOpenOrder(db: Db, offering: { id: string; assetId: string; inventory: { id: string; accountId: string } | null }, reasonCode: string) {
    const order = await db.tradingOrder.findFirst({ where: { initialOfferingId: offering.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } } });
    const inventory = offering.inventory;
    if (!order || !order.ownershipReservationId || !inventory) return;
    const units = order.remainingUnits;
    if (units > 0n) {
      await db.ownershipPosition.update({ where: { assetId_accountId: { assetId: offering.assetId, accountId: inventory.accountId } }, data: { reservedUnits: { decrement: units }, version: { increment: 1 } } });
      await db.initialOfferingInventory.update({ where: { id: inventory.id }, data: { reservedUnits: { decrement: units }, availableUnits: { increment: units } } });
    }
    await db.ownershipReservation.update({ where: { id: order.ownershipReservationId }, data: { status: 'RELEASED', units: 0n } });
    await db.tradingOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED', closedAt: new Date(), version: { increment: 1 } } });
    await db.orderStatusHistory.create({ data: { id: randomUUID(), orderId: order.id, fromStatus: order.status, toStatus: 'CANCELLED', reasonCode } });
  }

  private async appendLifecycle(db: Db, offering: { id: string; assetId: string; status: string; offeredUnits: bigint; retainedUnits: bigint }, type: string, correlationId: string, actorUserId?: string) {
    await this.outbox.append(db, initialOfferingLifecycleEvent({ eventType: type, offeringId: offering.id, assetId: offering.assetId, status: offering.status, offeredUnits: offering.offeredUnits.toString(), retainedUnits: offering.retainedUnits.toString(), correlationId, actorUserId }));
  }

  private projectionFromRecord(offering: { id: string; assetId: string; status: string; totalUnits: bigint; offeredUnits: bigint; retainedUnits: bigint; pricePerUnitMinor: bigint; grossOfferingMinor: bigint; currency: string; feeScheduleVersion: string; feeBps: number; approvedAt: Date | null; openedAt: Date | null; issuedAt: Date | null; closedAt: Date | null; changeRequestReason?: string | null }) {
    return { offeringId: offering.id, assetId: offering.assetId, status: offering.status, totalUnits: offering.totalUnits.toString(), offeredUnits: offering.offeredUnits.toString(), retainedUnits: offering.retainedUnits.toString(), offeredPercentageBps: Number((offering.offeredUnits * 10_000n) / offering.totalUnits), retainedPercentageBps: Number((offering.retainedUnits * 10_000n) / offering.totalUnits), pricePerUnitMinor: offering.pricePerUnitMinor.toString(), grossOfferingMinor: offering.grossOfferingMinor.toString(), feeMinor: (offering.grossOfferingMinor * BigInt(offering.feeBps) / 10_000n).toString(), netOfferingMinor: (offering.grossOfferingMinor - (offering.grossOfferingMinor * BigInt(offering.feeBps) / 10_000n)).toString(), currency: offering.currency, feeScheduleVersion: offering.feeScheduleVersion, feeBps: offering.feeBps, changeRequestReason: offering.changeRequestReason ?? null, approvedAt: offering.approvedAt?.toISOString() ?? null, openedAt: offering.openedAt?.toISOString() ?? null, issuedAt: offering.issuedAt?.toISOString() ?? null, closedAt: offering.closedAt?.toISOString() ?? null };
  }

  private async projection(offering: { id: string; assetId: string; beneficiaryUserId: string; status: string; totalUnits: bigint; offeredUnits: bigint; retainedUnits: bigint; pricePerUnitMinor: bigint; grossOfferingMinor: bigint; currency: string; feeScheduleVersion: string; feeBps: number; approvedAt: Date | null; openedAt: Date | null; issuedAt: Date | null; closedAt: Date | null; inventory: { offeredUnits: bigint; availableUnits: bigint; reservedUnits: bigint; settledUnits: bigint } | null }) {
    const account = await this.db.financialAccount.findFirst({ where: { ownerType: 'USER', ownerUserId: offering.beneficiaryUserId, code: 'COLLECTOR_PROCEEDS_AVAILABLE', currency: offering.currency }, include: { balance: true } });
    const base = this.projectionFromRecord(offering);
    return { ...base, inventory: offering.inventory ? { offeredUnits: offering.inventory.offeredUnits.toString(), availableUnits: offering.inventory.availableUnits.toString(), reservedUnits: offering.inventory.reservedUnits.toString(), settledUnits: offering.inventory.settledUnits.toString() } : null, proceeds: account?.balance ? { postedMinor: (account.balance.postedCreditMinor - account.balance.postedDebitMinor).toString(), reservedMinor: account.balance.reservedMinor.toString(), availableMinor: (account.balance.postedCreditMinor - account.balance.postedDebitMinor - account.balance.reservedMinor).toString(), currency: offering.currency } : { postedMinor: '0', reservedMinor: '0', availableMinor: '0', currency: offering.currency } };
  }

  private async mutate<T extends Record<string, unknown>>(actor: Actor, scope: string, body: unknown, requestId: string, key: string, work: (db: Db, audit: (action: string, metadata: Record<string, unknown>) => Promise<void>, idempotencyRecordId: string) => Promise<T>) {
    const identity: IdempotencyIdentity = { actorScope: `user:${actor.userId}`, scope: `initial-offering.${scope}`, key };
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(identity, requestHash, new Date(Date.now() + 86_400_000));
      if (acquired.state === 'FINGERPRINT_CONFLICT') fail('IDEMPOTENCY_KEY_CONFLICT', 'The request key cannot be reused.');
      if (acquired.state === 'EXISTING_IN_PROGRESS') fail('PERSISTENCE_CONFLICT', 'The request is already in progress.');
      if (acquired.state === 'EXISTING_COMPLETED') return acquired.record.response!.body as T;
      const audit = (action: string, metadata: Record<string, unknown>) => tx.audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action, resourceType: 'initial-offering', resourceId: String((body as Record<string, unknown>).offeringId ?? (body as Record<string, unknown>).assetId ?? scope), requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata, createdAt: new Date() });
      const result = await work(db, audit, acquired.record.id);
      await tx.idempotency.complete(identity, { status: 200, body: result }, new Date());
      return result;
    });
  }
}

function parseUnits(value: string) {
  if (!/^\d+$/.test(value)) fail('UNITS_INVALID', 'Units must be a non-negative integer.');
  const units = BigInt(value);
  if (units <= 0n) fail('UNITS_INVALID', 'Units must be positive.');
  return units;
}

function fail(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
