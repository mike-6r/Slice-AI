import { Injectable } from '@nestjs/common';
import type { ProviderCode } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';

@Injectable()
export class ProviderReconciliationService {
  constructor(private readonly db: PrismaService, private readonly recentAuth: RecentAuthService) {}

  /** Read-only reconciliation: discrepancies are durable; authority is never repaired here. */
  async run(actor: Actor, provider: ProviderCode, requestId: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const movements = await db.moneyMovement.findMany({
        where: { provider },
        include: {
          ledgerTransaction: { include: { entries: true, reversal: true } },
          cashAccount: { include: { reservations: { where: { status: 'ACTIVE' } } } },
        },
      });
      const issues: Array<{ movementId: string | null; code: string; expectedMinor?: bigint; actualMinor?: bigint }> = [];
      for (const movement of movements) {
        if (movement.currency !== 'GBP') issues.push({ movementId: movement.id, code: 'PROVIDER_CURRENCY_MISMATCH' });
        const terminal = ['SETTLED', 'RETURNED', 'REVERSED'].includes(movement.status);
        if (terminal && !movement.ledgerTransactionId) issues.push({ movementId: movement.id, code: 'MISSING_JOURNAL', expectedMinor: movement.amountMinor });
        if (!terminal && movement.ledgerTransactionId) issues.push({ movementId: movement.id, code: 'SLICE_LEDGER_WITHOUT_PROVIDER_COMPLETION', actualMinor: movement.amountMinor });
        if (movement.ledgerTransaction && movement.ledgerTransaction.currency !== movement.currency) issues.push({ movementId: movement.id, code: 'CURRENCY_MISMATCH' });
        if (movement.ledgerTransaction) {
          const journalAmount = movement.ledgerTransaction.entries
            .filter((entry) => entry.accountId === movement.cashAccountId)
            .reduce((total, entry) => total + entry.amountMinor, 0n);
          if (journalAmount !== movement.amountMinor) issues.push({ movementId: movement.id, code: 'AMOUNT_MISMATCH', expectedMinor: movement.amountMinor, actualMinor: journalAmount });
        }
        if (terminal && !movement.providerReferenceHash) issues.push({ movementId: movement.id, code: 'STATUS_MISMATCH' });
        if (movement.status === 'RETURNED' && (!movement.ledgerTransaction?.reversal || movement.ledgerTransaction.status !== 'REVERSED')) issues.push({ movementId: movement.id, code: 'RETURN_REQUIRED' });
        const activeReservations = movement.cashAccount.reservations.filter((reservation) => reservation.purposeId === movement.id);
        if (movement.type === 'WITHDRAWAL' && !terminal && !['FAILED', 'CANCELLED'].includes(movement.status) && !activeReservations.length) issues.push({ movementId: movement.id, code: 'RESERVATION_MISMATCH', expectedMinor: movement.amountMinor });
        if (terminal && activeReservations.length) issues.push({ movementId: movement.id, code: 'RESERVATION_MISMATCH', actualMinor: activeReservations.reduce((total, reservation) => total + reservation.amountMinor, 0n) });
        const duplicatePostings = await db.journalTransaction.count({ where: { correlationId: `provider-movement:${movement.id}` } });
        if (duplicatePostings > 1) issues.push({ movementId: movement.id, code: 'DUPLICATE_POSTING' });
      }
      const providerCosts = await db.providerFinancialCost.findMany({
        where: { provider },
        select: { id: true, status: true, amountMinor: true, postedJournalTransactionId: true, relatedMovementId: true },
      });
      for (const cost of providerCosts) {
        if (cost.status === 'PENDING_EVIDENCE') {
          issues.push({ movementId: cost.relatedMovementId, code: 'PROVIDER_COST_EVIDENCE_PENDING', expectedMinor: cost.amountMinor ?? undefined });
        }
        if (cost.status === 'OBSERVED') {
          issues.push({ movementId: cost.relatedMovementId, code: 'PROVIDER_COST_MISSING_EXPENSE_JOURNAL', expectedMinor: cost.amountMinor ?? undefined });
        }
        if ((cost.status === 'POSTED' || cost.status === 'RECONCILED') && !cost.postedJournalTransactionId) {
          issues.push({ movementId: cost.relatedMovementId, code: 'PROVIDER_COST_MISSING_EXPENSE_JOURNAL', expectedMinor: cost.amountMinor ?? undefined });
        }
      }
      const codes = [...new Set(issues.map((item) => item.code))].sort();
      const run = await db.providerReconciliationRun.create({ data: { id: randomUUID(), provider, status: codes.length ? 'MISMATCH' : 'RECONCILED', actorUserId: actor.userId } });
      if (issues.length) await db.providerDiscrepancy.createMany({ data: issues.map((item) => ({ id: randomUUID(), runId: run.id, code: item.code, movementId: item.movementId, expectedMinor: item.expectedMinor, actualMinor: item.actualMinor })) });
      for (const issue of issues) {
        if (!issue.movementId) continue;
        const movement = movements.find((item) => item.id === issue.movementId)!;
        await db.providerIncident.create({ data: { id: randomUUID(), provider, severity: 'HIGH', code: issue.code, ownerUserId: actor.userId } });
        const existingHold = await db.complianceHold.findFirst({ where: { movementId: movement.id, scope: 'EXTERNAL_MOVEMENT', status: 'ACTIVE' } });
        if (!existingHold) {
          const hold = await db.complianceHold.create({ data: { id: randomUUID(), userId: movement.userId, movementId: movement.id, scope: 'EXTERNAL_MOVEMENT', reasonCode: issue.code, source: 'PROVIDER' } });
          await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: null, actorType: 'SYSTEM', action: 'COMPLIANCE_HOLD_CREATED', resourceType: 'compliance-hold', resourceId: hold.id, requestId, sessionId: null, result: 'SUCCESS', metadata: { source: 'PROVIDER', provider, scope: hold.scope, reasonCode: hold.reasonCode }, createdAt: new Date() });
        }
      }
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'PROVIDER_RECONCILED', resourceType: 'provider-reconciliation', resourceId: run.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { provider, status: run.status, mismatchCodes: codes }, createdAt: new Date() });
      return { id: run.id, provider, reconciled: run.status === 'RECONCILED', mismatchCodes: codes };
    });
  }
}
