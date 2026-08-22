import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../access/recent-auth.service';
import { AuthAbuseService } from './auth-abuse.service';
import type { Actor } from './auth.service';
import { sanitizeAuditMetadata } from '../domain/audit';

type Db = PrismaClient | Prisma.TransactionClient;
type DeletionStatus = 'REQUESTED' | 'UNDER_REVIEW' | 'BLOCKED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
const activeDeletionStatuses: DeletionStatus[] = ['REQUESTED', 'UNDER_REVIEW', 'BLOCKED', 'APPROVED', 'PROCESSING'];
const openOrderStatuses = ['PENDING_RESERVATION', 'OPEN', 'PARTIALLY_FILLED'] as const;
const pendingWithdrawalStatuses = ['CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'HELD', 'MANUAL_REVIEW'] as const;

@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    private readonly abuse: AuthAbuseService,
  ) {}

  async exportData(actor: Actor, ip: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('data-export', ip, actor.userId);
    return this.idempotent(actor, 'account.data-export', key, { version: 1 }, async (tx) => {
      const data = await this.safeExport(tx, actor.userId);
      await this.audit(tx, actor, 'DATA_EXPORT_REQUESTED', 'account-data-export', null, requestId, {});
      return { exportedAt: new Date().toISOString(), format: 'JSON', data };
    });
  }

  async deactivate(
    actor: Actor,
    input: { reason?: string },
    ip: string,
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('account-deactivate', ip, actor.userId);
    return this.idempotent(actor, 'account.deactivate', key, input, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { accountStatus: true } });
      if (user.accountStatus === 'DEACTIVATED') return { accountStatus: 'DEACTIVATED', deactivatedAt: new Date().toISOString() };
      const blockers = await this.obligations(tx, actor.userId, false);
      if (blockers.length) this.blockDeactivation(blockers);
      const now = new Date();
      await tx.user.update({ where: { id: actor.userId }, data: { accountStatus: 'DEACTIVATED' } });
      await tx.accountStatusHistory.create({ data: { id: randomUUID(), userId: actor.userId, fromStatus: user.accountStatus, toStatus: 'DEACTIVATED', reason: 'SELF_DEACTIVATION', actorUserId: actor.userId, createdAt: now } });
      await tx.session.updateMany({ where: { userId: actor.userId, revokedAt: null }, data: { revokedAt: now, revocationReason: 'DEACTIVATED' } });
      await this.audit(tx, actor, 'ACCOUNT_DEACTIVATED', 'user', actor.userId, requestId, { reasonCode: input.reason ? 'CUSTOMER_REQUESTED_WITH_REASON' : 'CUSTOMER_REQUESTED' }, now);
      return { accountStatus: 'DEACTIVATED', deactivatedAt: now.toISOString() };
    });
  }

  async requestDeletion(
    actor: Actor,
    input: { reason?: string },
    ip: string,
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('deletion-request', ip, actor.userId);
    try {
      return await this.idempotent(actor, 'account.deletion-request', key, input, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
        const existing = await tx.accountDeletionRequest.findFirst({ where: { userId: actor.userId, status: { in: activeDeletionStatuses } }, orderBy: { createdAt: 'desc' } });
        if (existing) return this.deletionDto(existing);
        const blockers = await this.obligations(tx, actor.userId, true);
        const now = new Date();
        const request = await tx.accountDeletionRequest.create({ data: { userId: actor.userId, status: blockers.length ? 'BLOCKED' : 'REQUESTED', reason: input.reason ?? null, blockedReason: blockers[0] ?? null, requestedAt: now } });
        await this.audit(tx, actor, 'ACCOUNT_DELETION_REQUESTED', 'account-deletion-request', request.id, requestId, { status: request.status, blockedReasonCode: request.blockedReason ?? 'NONE' }, now);
        return this.deletionDto(request);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.db.accountDeletionRequest.findFirst({ where: { userId: actor.userId, status: { in: activeDeletionStatuses } }, orderBy: { createdAt: 'desc' } });
      if (!existing) throw error;
      return this.deletionDto(existing);
    }
  }

  async deletionStatus(actor: Actor) {
    const request = await this.db.accountDeletionRequest.findFirst({ where: { userId: actor.userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return request ? this.deletionDto(request) : null;
  }

  async cancelDeletion(actor: Actor, ip: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('deletion-cancel', ip, actor.userId);
    return this.idempotent(actor, 'account.deletion-request.cancel', key, {}, async (tx) => {
      const request = await tx.accountDeletionRequest.findFirst({ where: { userId: actor.userId, status: { in: ['REQUESTED', 'UNDER_REVIEW', 'BLOCKED'] } }, orderBy: { createdAt: 'desc' } });
      if (!request) throw new ConflictException({ code: 'DELETION_REQUEST_NOT_CANCELLABLE', message: 'There is no deletion request that can be cancelled.' });
      const now = new Date();
      const updated = await tx.accountDeletionRequest.updateMany({ where: { id: request.id, status: { in: ['REQUESTED', 'UNDER_REVIEW', 'BLOCKED'] } }, data: { status: 'CANCELLED', cancelledAt: now } });
      if (updated.count !== 1) throw new ConflictException({ code: 'DELETION_REQUEST_NOT_CANCELLABLE', message: 'There is no deletion request that can be cancelled.' });
      const cancelled = await tx.accountDeletionRequest.findUniqueOrThrow({ where: { id: request.id } });
      await this.audit(tx, actor, 'ACCOUNT_DELETION_CANCELLED', 'account-deletion-request', request.id, requestId, {}, now);
      return this.deletionDto(cancelled);
    });
  }

  private async safeExport(db: Db, userId: string) {
    const [user, notificationPreferences, discord, banks, sessions, lots, positions, orders, movements, votes, submissions] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true, twoFactor: { select: { enabledAt: true } }, smsTwoFactor: { select: { enabledAt: true } } } }),
      db.notificationPreference.findMany({ where: { userId }, select: { channel: true, topic: true, enabled: true, updatedAt: true } }),
      db.discordAccountLink.findUnique({ where: { userId }, select: { username: true, displayName: true, linkedAt: true } }),
      db.externalFinancialAccount.findMany({ where: { userId }, select: { institutionName: true, accountName: true, accountMask: true, currency: true, accountType: true, status: true, updatedAt: true } }),
      db.session.findMany({ where: { userId }, select: { publicId: true, issuedAt: true, lastActivityAt: true, expiresAt: true, revokedAt: true, userAgent: true }, take: 100, orderBy: { issuedAt: 'desc' } }),
      db.portfolioLot.findMany({ where: { userId }, include: { asset: { select: { publicId: true, title: true } } }, take: 250, orderBy: { acquiredAt: 'desc' } }),
      db.ownershipPosition.findMany({ where: { account: { userId } }, include: { supply: { include: { asset: { select: { publicId: true, title: true } } } } }, take: 250 }),
      db.tradingOrder.findMany({ where: { userId }, include: { asset: { select: { publicId: true, title: true } } }, take: 250, orderBy: { createdAt: 'desc' } }),
      db.moneyMovement.findMany({ where: { userId }, select: { type: true, amountMinor: true, currency: true, status: true, createdAt: true, updatedAt: true, settledAt: true }, take: 250, orderBy: { createdAt: 'desc' } }),
      db.proposalVote.findMany({ where: { castByUserId: userId }, select: { choice: true, weightUnits: true, createdAt: true, proposal: { select: { status: true } } }, take: 250, orderBy: { createdAt: 'desc' } }),
      db.assetSubmission.findMany({ where: { ownerUserId: userId }, select: { status: true, submittedAt: true, createdAt: true, asset: { select: { publicId: true, title: true } } }, take: 250, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      account: { email: user.email, accountStatus: user.accountStatus, emailVerifiedAt: iso(user.emailVerifiedAt), createdAt: user.createdAt.toISOString(), profile: user.profile ? { displayName: user.profile.displayName, publicUsername: user.profile.publicUsername, avatarReference: user.profile.avatarReference, countryCode: user.profile.countryCode } : null },
      preferences: { timezone: user.profile?.timezone ?? 'Europe/London', locale: user.profile?.locale ?? 'en-GB', notificationPreferences: notificationPreferences.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })) },
      security: { twoFactorEnabled: Boolean(user.twoFactor?.enabledAt || user.smsTwoFactor?.enabledAt), sessions: sessions.map((item) => ({ reference: item.publicId, issuedAt: item.issuedAt.toISOString(), lastUsedAt: item.lastActivityAt.toISOString(), expiresAt: item.expiresAt.toISOString(), revokedAt: iso(item.revokedAt), deviceLabel: safeDeviceLabel(item.userAgent) })) },
      linkedAccounts: { discord: discord ? { username: discord.username, displayName: discord.displayName, linkedAt: discord.linkedAt.toISOString() } : null, banks: banks.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })) },
      portfolio: { holdings: positions.map((item) => ({ asset: item.supply.asset, settledUnits: item.settledUnits.toString(), reservedUnits: item.reservedUnits.toString() })), lots: lots.map((item) => ({ asset: item.asset, acquiredUnits: item.acquiredUnits.toString(), remainingUnits: item.remainingUnits.toString(), totalCostMinor: item.totalCostMinor.toString(), currency: item.currency, acquiredAt: item.acquiredAt.toISOString() })) },
      trading: { orders: orders.map((item) => ({ asset: item.asset, side: item.side, type: item.type, status: item.status, limitPriceMinor: item.limitPriceMinor.toString(), originalUnits: item.originalUnits.toString(), remainingUnits: item.remainingUnits.toString(), filledUnits: item.filledUnits.toString(), createdAt: item.createdAt.toISOString() })) },
      wallet: { movements: movements.map((item) => ({ type: item.type, amountMinor: item.amountMinor.toString(), currency: item.currency, status: item.status, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), settledAt: iso(item.settledAt) })) },
      governance: { votes: votes.map((item) => ({ proposal: { status: item.proposal.status }, choice: item.choice, weightUnits: item.weightUnits.toString(), createdAt: item.createdAt.toISOString() })) },
      submissions: submissions.map((item) => ({ status: item.status, submittedAt: iso(item.submittedAt), createdAt: item.createdAt.toISOString(), asset: item.asset })),
    };
  }

  private async obligations(db: Db, userId: string, forDeletion: boolean): Promise<string[]> {
    const [openOrders, pendingWithdrawals, activeHolds, activeReservations, activeOwnershipReservations, activeSubmissions] = await Promise.all([
      db.tradingOrder.count({ where: { userId, status: { in: [...openOrderStatuses] } } }),
      db.moneyMovement.count({ where: { userId, type: 'WITHDRAWAL', status: { in: [...pendingWithdrawalStatuses] } } }),
      db.complianceHold.count({ where: { userId, status: 'ACTIVE' } }),
      db.cashReservation.count({ where: { account: { ownerUserId: userId }, status: 'ACTIVE' } }),
      db.ownershipReservation.count({ where: { position: { account: { userId } }, status: 'ACTIVE' } }),
      db.assetSubmission.count({ where: { ownerUserId: userId, status: { in: ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED'] } } }),
    ]);
    const codes: string[] = [];
    if (openOrders) codes.push('OPEN_ORDERS');
    if (pendingWithdrawals) codes.push('PENDING_WITHDRAWALS');
    if (activeHolds) codes.push('ACTIVE_COMPLIANCE_HOLD');
    if (activeReservations || activeOwnershipReservations) codes.push('ACTIVE_RESERVATIONS');
    if (activeSubmissions) codes.push('ACTIVE_SUBMISSIONS');
    if (!forDeletion) return codes;
    const [positions, balances] = await Promise.all([
      db.ownershipPosition.count({ where: { account: { userId }, settledUnits: { gt: 0 } } }),
      db.accountBalance.findMany({ where: { account: { ownerUserId: userId } }, select: { postedDebitMinor: true, postedCreditMinor: true, account: { select: { normalSide: true } } } }),
    ]);
    if (positions) codes.push('OWNERSHIP_HOLDINGS_REMAIN');
    if (balances.some((item) => item.postedDebitMinor !== item.postedCreditMinor)) codes.push('CASH_BALANCE_REMAINS');
    return codes;
  }

  private blockDeactivation(blockers: string[]): never {
    throw new ConflictException({ code: 'DEACTIVATION_BLOCKED', message: 'Resolve active account obligations before deactivating.', blockers });
  }

  private deletionDto(request: { status: string; requestedAt: Date; updatedAt: Date; cancelledAt: Date | null; blockedReason: string | null }) {
    return { status: request.status, requestedAt: request.requestedAt.toISOString(), updatedAt: request.updatedAt.toISOString(), blockedReason: request.blockedReason, canCancel: ['REQUESTED', 'UNDER_REVIEW', 'BLOCKED'].includes(request.status), cancelledAt: iso(request.cancelledAt) };
  }

  private async idempotent<T extends Record<string, unknown>>(actor: Actor, scope: string, key: string, body: unknown, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const identity = { actorScope: `user:${actor.userId}`, scope, key };
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({ where: { actorScope_scope_key: identity } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'This idempotency key is already associated with a different request.' });
          if (existing.status === 'COMPLETED' && existing.responseBody) return existing.responseBody as T;
          throw new ConflictException({ code: 'IDEMPOTENCY_IN_PROGRESS', message: 'This request is already being processed.' });
        }
        await tx.idempotencyRecord.create({ data: { ...identity, requestHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
        const result = await work(tx);
        await tx.idempotencyRecord.update({ where: { actorScope_scope_key: identity }, data: { status: 'COMPLETED', responseStatus: 200, responseBody: result as Prisma.InputJsonValue, completedAt: new Date() } });
        return result;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw error;
    }
  }

  private async audit(tx: Prisma.TransactionClient, actor: Actor, action: string, resourceType: string, resourceId: string | null, requestId: string, metadata: Record<string, unknown>, createdAt = new Date()) {
    await tx.auditEvent.create({ data: { id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action, resourceType, resourceId, requestId, sessionId: actor.sessionId, result: 'SUCCESS', metadata: sanitizeAuditMetadata(action, metadata) as Prisma.InputJsonValue, createdAt } });
  }
}

function iso(value: Date | null) { return value?.toISOString() ?? null; }
function safeDeviceLabel(userAgent: string | null) {
  if (!userAgent) return null;
  const browser = userAgent.includes('Edg/') ? 'Edge' : userAgent.includes('Chrome/') ? 'Chrome' : userAgent.includes('Firefox/') ? 'Firefox' : userAgent.includes('Safari/') ? 'Safari' : 'Browser';
  const platform = userAgent.includes('Windows') ? 'Windows' : /iPhone|iPad/.test(userAgent) ? 'iOS' : userAgent.includes('Android') ? 'Android' : userAgent.includes('Mac OS') ? 'macOS' : null;
  return platform ? `${browser} on ${platform}` : browser;
}
