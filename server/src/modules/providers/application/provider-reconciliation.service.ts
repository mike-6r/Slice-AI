import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';

@Injectable()
export class ProviderReconciliationService {
  constructor(private readonly db: PrismaService, private readonly recentAuth: RecentAuthService) {}

  /** Read-only reconciliation: discrepancies are durable; authority is never repaired here. */
  async run(actor: Actor, provider: 'BRIDGE', requestId: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const movements = await db.moneyMovement.findMany({ where: { provider }, include: { ledgerTransaction: true } });
      const issues: Array<{ movementId: string | null; code: string; expectedMinor?: bigint; actualMinor?: bigint }> = [];
      for (const movement of movements) {
        if (movement.currency !== 'GBP') issues.push({ movementId: movement.id, code: 'PROVIDER_CURRENCY_MISMATCH' });
        if (movement.status === 'SETTLED' && !movement.ledgerTransactionId) issues.push({ movementId: movement.id, code: 'PROVIDER_COMPLETED_LEDGER_MISSING', expectedMinor: movement.amountMinor });
        if (!['SETTLED', 'REVERSED'].includes(movement.status) && movement.ledgerTransactionId) issues.push({ movementId: movement.id, code: 'SLICE_LEDGER_WITHOUT_PROVIDER_COMPLETION', actualMinor: movement.amountMinor });
        if (movement.ledgerTransaction && movement.ledgerTransaction.currency !== movement.currency) issues.push({ movementId: movement.id, code: 'PROVIDER_JOURNAL_CURRENCY_MISMATCH' });
        if (movement.status === 'SETTLED' && !movement.providerReferenceHash) issues.push({ movementId: movement.id, code: 'PROVIDER_REFERENCE_MISSING' });
      }
      const codes = [...new Set(issues.map((item) => item.code))].sort();
      const run = await db.providerReconciliationRun.create({ data: { id: randomUUID(), provider, status: codes.length ? 'MISMATCH' : 'RECONCILED', actorUserId: actor.userId } });
      if (issues.length) await db.providerDiscrepancy.createMany({ data: issues.map((item) => ({ id: randomUUID(), runId: run.id, code: item.code, movementId: item.movementId, expectedMinor: item.expectedMinor, actualMinor: item.actualMinor })) });
      for (const issue of issues) {
        if (!issue.movementId) continue;
        const movement = movements.find((item) => item.id === issue.movementId)!;
        await db.providerIncident.create({ data: { id: randomUUID(), provider, severity: 'HIGH', code: issue.code, ownerUserId: actor.userId } });
        await db.complianceHold.create({ data: { id: randomUUID(), userId: movement.userId, movementId: movement.id, scope: 'EXTERNAL_MOVEMENT', reasonCode: issue.code, source: 'PROVIDER_RECONCILIATION' } });
      }
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'PROVIDER_RECONCILED', resourceType: 'provider-reconciliation', resourceId: run.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { provider, status: run.status, mismatchCodes: codes }, createdAt: new Date() });
      return { id: run.id, provider, reconciled: run.status === 'RECONCILED', mismatchCodes: codes };
    });
  }
}
