import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { AuthorizationService } from '../../identity/access/authorization.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { FinancialLedgerService } from './financial-ledger.service';

type Db = Prisma.TransactionClient;

const ADJUSTMENT_EXPENSE_CODE = 'CUSTOMER_DEFICIT_ADJUSTMENT_EXPENSE';

/**
 * Controlled finance adjustment workflow. The only supported target is an
 * explicitly identified, open returned-funds deficit. Applying an adjustment
 * posts a balanced GBP journal and updates the append-only deficit projection;
 * no customer balance is ever patched directly.
 */
@Injectable()
export class FinancialAdjustmentService {
  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
    private readonly authorization: AuthorizationService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async list(actor: Actor, status?: string) {
    await this.authorization.authorize(actor, 'finance.read');
    const rows = await this.db.financialAdjustmentRequest.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return { items: rows.map((row) => this.safe(row)), pagination: { total: rows.length, limit: 100 } };
  }

  async create(
    actor: Actor,
    input: { userId: string; deficitId: string; amountMinor: string; reason: string },
    requestId: string,
    idempotencyKey: string,
  ) {
    await this.authorization.authorize(actor, 'finance.manage');
    this.recentAuth.require(actor);
    const amountMinor = this.amount(input.amountMinor);
    if (!input.reason.trim() || input.reason.trim().length < 12)
      throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_REASON_REQUIRED', message: 'A clear adjustment reason is required.' });
    const idempotencyKeyHash = this.hash(idempotencyKey);
    const requestHash = this.hash(JSON.stringify({ ...input, amountMinor: amountMinor.toString() }));
    return this.db.$transaction(async (db) => {
      const existing = await db.financialAdjustmentRequest.findUnique({ where: { idempotencyKeyHash } });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'The request key cannot be reused for a different adjustment.' });
        return { ...this.safe(existing), replayed: true };
      }
      const deficit = await db.financialDeficit.findUnique({ where: { id: input.deficitId } });
      if (!deficit || deficit.userId !== input.userId)
        throw new NotFoundException({ code: 'FINANCIAL_DEFICIT_NOT_FOUND', message: 'The selected outstanding balance was not found.' });
      const outstanding = deficit.amountMinor - deficit.recoveredMinor;
      if (deficit.currency !== 'GBP' || !['OPEN', 'PARTIALLY_RECOVERED'].includes(deficit.status) || amountMinor <= 0n || amountMinor > outstanding)
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_AMOUNT_INVALID', message: 'The adjustment must be a positive GBP amount no greater than the outstanding balance.' });
      const row = await db.financialAdjustmentRequest.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          deficitId: input.deficitId,
          initiatorUserId: actor.userId,
          status: 'DRAFT',
          currency: 'GBP',
          amountMinor,
          reason: input.reason.trim(),
          idempotencyKeyHash,
          requestHash,
          beforeOutstandingMinor: outstanding,
        },
      });
      await this.audit(db, actor, 'FINANCIAL_ADJUSTMENT_DRAFTED', row.id, requestId, {
        userId: input.userId,
        deficitId: input.deficitId,
        amountMinor: amountMinor.toString(),
      });
      return { ...this.safe(row), replayed: false };
    });
  }

  async submit(actor: Actor, id: string, requestId: string, idempotencyKey: string) {
    await this.authorization.authorize(actor, 'finance.manage');
    this.recentAuth.require(actor);
    const keyHash = this.hash(idempotencyKey);
    return this.db.$transaction(async (db) => {
      const row = await this.lock(db, id);
      if (row.submissionIdempotencyKeyHash === keyHash) return { ...this.safe(row), replayed: true };
      if (row.status !== 'DRAFT')
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_NOT_DRAFT', message: 'Only a draft adjustment can be submitted.' });
      if (row.initiatorUserId !== actor.userId)
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_INITIATOR_REQUIRED', message: 'Only the finance initiator can submit this adjustment.' });
      const updated = await db.financialAdjustmentRequest.update({
        where: { id },
        data: { status: 'PENDING_APPROVAL', submissionIdempotencyKeyHash: keyHash },
      });
      await this.audit(db, actor, 'FINANCIAL_ADJUSTMENT_SUBMITTED', id, requestId, {});
      return { ...this.safe(updated), replayed: false };
    });
  }

  async approve(actor: Actor, id: string, requestId: string, idempotencyKey: string) {
    await this.authorization.authorize(actor, 'finance.manage');
    this.recentAuth.require(actor);
    const approvalHash = this.hash(idempotencyKey);
    return this.db.$transaction(async (db) => {
      const row = await this.lock(db, id);
      if (row.approvalIdempotencyKeyHash === approvalHash) return { ...this.safe(row), replayed: true };
      if (row.initiatorUserId === actor.userId)
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_SECOND_APPROVER_REQUIRED', message: 'A second authorized finance operator must approve this adjustment.' });
      if (row.status !== 'PENDING_APPROVAL')
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_NOT_PENDING', message: 'Only a submitted adjustment can be approved.' });

      await db.$queryRaw`SELECT id FROM "FinancialDeficit" WHERE id = ${row.deficitId} FOR UPDATE`;
      const deficit = await db.financialDeficit.findUnique({ where: { id: row.deficitId } });
      if (!deficit || deficit.userId !== row.userId || deficit.currency !== 'GBP' || !['OPEN', 'PARTIALLY_RECOVERED'].includes(deficit.status))
        throw new ConflictException({ code: 'FINANCIAL_DEFICIT_NOT_AVAILABLE', message: 'The outstanding balance is no longer available for adjustment.' });
      const beforeOutstanding = deficit.amountMinor - deficit.recoveredMinor;
      if (row.amountMinor <= 0n || row.amountMinor > beforeOutstanding)
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_AMOUNT_INVALID', message: 'The adjustment exceeds the current outstanding balance.' });

      const expense = await this.adjustmentExpenseAccount(db);
      const receivable = await this.ledger.deficitReceivableAccount(db);
      const journal = await this.ledger.postInTransaction(
        db,
        actor,
        {
          type: 'ADMIN_CORRECTION',
          correlationId: `financial-adjustment:${row.id}`,
          descriptionCode: 'RETURNED_FUNDS_DEFICIT_FINANCE_ADJUSTMENT',
          lines: [
            { accountId: expense.id, side: 'DEBIT', amountMinor: row.amountMinor.toString() },
            { accountId: receivable.id, side: 'CREDIT', amountMinor: row.amountMinor.toString() },
          ],
        },
        requestId,
        `financial-adjustment:${row.id}`,
      );
      const afterOutstanding = beforeOutstanding - row.amountMinor;
      const recoveredMinor = deficit.recoveredMinor + row.amountMinor;
      const recovered = afterOutstanding === 0n;
      await db.financialDeficit.update({
        where: { id: deficit.id },
        data: {
          recoveredMinor,
          status: recovered ? 'RECOVERED' : 'PARTIALLY_RECOVERED',
          resolvedAt: recovered ? new Date() : null,
        },
      });
      let restrictionReleased = false;
      if (recovered) {
        const openDeficits = await db.financialDeficit.count({
          where: { userId: row.userId, status: { in: ['OPEN', 'PARTIALLY_RECOVERED'] } },
        });
        if (openDeficits === 0) {
          const released = await db.complianceHold.updateMany({
            where: { userId: row.userId, scope: 'ACCOUNT', reasonCode: 'RETURNED_FUNDS_DEFICIT', status: 'ACTIVE' },
            data: { status: 'RELEASED', releasedAt: new Date() },
          });
          restrictionReleased = released.count > 0;
        }
      }
      const approved = await db.financialAdjustmentRequest.update({
        where: { id: row.id },
        data: {
          status: 'APPROVED',
          approverUserId: actor.userId,
          approvalIdempotencyKeyHash: approvalHash,
          approvedAt: new Date(),
          beforeOutstandingMinor: beforeOutstanding,
          afterOutstandingMinor: afterOutstanding,
          restrictionReleased,
          journalTransactionId: journal.transactionId,
        },
      });
      await this.audit(db, actor, 'FINANCIAL_ADJUSTMENT_APPROVED', row.id, requestId, {
        initiatorUserId: row.initiatorUserId,
        beforeOutstandingMinor: beforeOutstanding.toString(),
        afterOutstandingMinor: afterOutstanding.toString(),
        journalTransactionId: journal.transactionId,
      });
      const applied = await db.financialAdjustmentRequest.update({
        where: { id: row.id },
        data: { status: 'APPLIED', appliedAt: new Date() },
      });
      await this.audit(db, actor, 'FINANCIAL_ADJUSTMENT_APPLIED', row.id, requestId, {
        restrictionReleased,
        journalTransactionId: journal.transactionId,
      });
      void approved;
      return { ...this.safe(applied), replayed: false };
    });
  }

  async reject(actor: Actor, id: string, reason: string, requestId: string, idempotencyKey: string) {
    await this.authorization.authorize(actor, 'finance.manage');
    this.recentAuth.require(actor);
    if (reason.trim().length < 12)
      throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_REJECTION_REASON_REQUIRED', message: 'A clear rejection reason is required.' });
    const rejectionHash = this.hash(idempotencyKey);
    return this.db.$transaction(async (db) => {
      const row = await this.lock(db, id);
      if (row.approvalIdempotencyKeyHash === rejectionHash) return { ...this.safe(row), replayed: true };
      if (row.initiatorUserId === actor.userId)
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_SECOND_REVIEWER_REQUIRED', message: 'A second authorized finance operator must review this adjustment.' });
      if (row.status !== 'PENDING_APPROVAL')
        throw new ConflictException({ code: 'FINANCIAL_ADJUSTMENT_NOT_PENDING', message: 'Only a submitted adjustment can be rejected.' });
      const updated = await db.financialAdjustmentRequest.update({
        where: { id },
        data: { status: 'REJECTED', approverUserId: actor.userId, approvalIdempotencyKeyHash: rejectionHash, rejectedAt: new Date(), rejectionReason: reason.trim() },
      });
      await this.audit(db, actor, 'FINANCIAL_ADJUSTMENT_REJECTED', id, requestId, { reason: reason.trim() });
      return { ...this.safe(updated), replayed: false };
    });
  }

  private async lock(db: Db, id: string) {
    await db.$queryRaw`SELECT id FROM "FinancialAdjustmentRequest" WHERE id = ${id} FOR UPDATE`;
    const row = await db.financialAdjustmentRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'FINANCIAL_ADJUSTMENT_NOT_FOUND', message: 'The finance adjustment was not found.' });
    return row;
  }

  private async adjustmentExpenseAccount(db: Db) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('CUSTOMER_DEFICIT_ADJUSTMENT_EXPENSE_GBP'))`;
    const existing = await db.financialAccount.findFirst({ where: { ownerType: 'PLATFORM', code: ADJUSTMENT_EXPENSE_CODE, currency: 'GBP' } });
    if (existing) return existing;
    return db.financialAccount.create({
      data: { id: randomUUID(), ownerType: 'PLATFORM', accountType: 'EXPENSE', code: ADJUSTMENT_EXPENSE_CODE, currency: 'GBP', normalSide: 'DEBIT' },
    });
  }

  private async audit(db: Db, actor: Actor, action: string, resourceId: string, requestId: string, metadata: Record<string, unknown>) {
    await createIdentityTransaction(db).audit.append({
      id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action, resourceType: 'financial-adjustment', resourceId, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata, createdAt: new Date(),
    });
  }

  private amount(value: string) {
    if (!/^\d+$/.test(value)) throw new ConflictException({ code: 'INVALID_MONEY_AMOUNT', message: 'Amount must be a positive GBP minor-unit integer.' });
    return BigInt(value);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private safe(row: {
    id: string; userId: string; deficitId: string; initiatorUserId: string; approverUserId: string | null;
    status: string; currency: string; amountMinor: bigint; reason: string; beforeOutstandingMinor: bigint;
    afterOutstandingMinor: bigint | null; restrictionReleased: boolean | null; requestedAt: Date; approvedAt: Date | null;
    appliedAt: Date | null; rejectedAt: Date | null; rejectionReason: string | null; journalTransactionId: string | null;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      deficitId: row.deficitId,
      initiatorUserId: row.initiatorUserId,
      approverUserId: row.approverUserId,
      status: row.status,
      currency: row.currency,
      amountMinor: row.amountMinor.toString(),
      reason: row.reason,
      beforeOutstandingMinor: row.beforeOutstandingMinor.toString(),
      afterOutstandingMinor: row.afterOutstandingMinor?.toString() ?? null,
      restrictionReleased: row.restrictionReleased,
      journalTransactionId: row.journalTransactionId,
      requestedAt: row.requestedAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      appliedAt: row.appliedAt?.toISOString() ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
    };
  }
}
