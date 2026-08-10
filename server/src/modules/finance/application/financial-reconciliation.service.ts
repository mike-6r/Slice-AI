import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { createHash, randomUUID } from 'node:crypto';
import { financeTestFailurePoint } from './finance-test-failure-injection';

@Injectable()
export class FinancialReconciliationService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  /** Records discrepancies only. Repair requires a separately-authorized correction. */
  async run(actor: Actor, requestId: string, key: string) {
    this.recentAuth.require(actor);
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: 'finance.reconcile:global',
      key,
    };
    const hash = createHash('sha256')
      .update('finance-reconcile-global')
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
        return acquired.record.response!.body as ReconciliationResult;
      const [entryTotals, balances, reservationTotals, lots] =
        await Promise.all([
          db.journalEntry.groupBy({
            by: ['accountId', 'side'],
            _sum: { amountMinor: true },
          }),
          db.accountBalance.findMany({
            include: { account: { select: { normalSide: true } } },
          }),
          db.cashReservation.groupBy({
            by: ['accountId'],
            where: { status: 'ACTIVE' },
            _sum: { amountMinor: true },
          }),
          db.portfolioLot.findMany({
            include: {
              disposals: { select: { units: true, allocatedCostMinor: true } },
            },
          }),
        ]);
      const totals = new Map<string, { debit: bigint; credit: bigint }>();
      for (const row of entryTotals) {
        const current = totals.get(row.accountId) ?? { debit: 0n, credit: 0n };
        current[row.side === 'DEBIT' ? 'debit' : 'credit'] =
          row._sum.amountMinor ?? 0n;
        totals.set(row.accountId, current);
      }
      const reserved = new Map(
        reservationTotals.map((row) => [
          row.accountId,
          row._sum.amountMinor ?? 0n,
        ]),
      );
      const mismatchCodes: string[] = [];
      let projectionMismatchCount = 0;
      const balancesByAccount = new Map(
        balances.map((balance) => [balance.accountId, balance]),
      );
      for (const accountId of totals.keys()) {
        if (!balancesByAccount.has(accountId)) projectionMismatchCount += 1;
      }
      for (const balance of balances) {
        const expected = totals.get(balance.accountId) ?? {
          debit: 0n,
          credit: 0n,
        };
        if (
          expected.debit !== balance.postedDebitMinor ||
          expected.credit !== balance.postedCreditMinor
        ) {
          projectionMismatchCount += 1;
        }
        if ((reserved.get(balance.accountId) ?? 0n) !== balance.reservedMinor) {
          mismatchCodes.push('CASH_RESERVATION_PROJECTION_MISMATCH');
        }
      }
      if (projectionMismatchCount)
        mismatchCodes.push('BALANCE_PROJECTION_MISMATCH');
      const lotMismatchCount = lots.filter((lot) => {
        const disposed = lot.disposals.reduce(
          (sum, disposal) => sum + disposal.units,
          0n,
        );
        const cost = lot.disposals.reduce(
          (sum, disposal) => sum + disposal.allocatedCostMinor,
          0n,
        );
        return (
          lot.remainingUnits !== lot.acquiredUnits - disposed ||
          cost > lot.totalCostMinor
        );
      }).length;
      if (lotMismatchCount) mismatchCodes.push('PORTFOLIO_LOT_MISMATCH');
      const globalDebits = entryTotals
        .filter((row) => row.side === 'DEBIT')
        .reduce((sum, row) => sum + (row._sum.amountMinor ?? 0n), 0n);
      const globalCredits = entryTotals
        .filter((row) => row.side === 'CREDIT')
        .reduce((sum, row) => sum + (row._sum.amountMinor ?? 0n), 0n);
      if (globalDebits !== globalCredits)
        mismatchCodes.push('JOURNAL_UNBALANCED');
      const codes = [...new Set(mismatchCodes)].sort();
      const run = await db.financialReconciliationRun.create({
        data: {
          id: randomUUID(),
          scope: 'GLOBAL',
          status: codes.length ? 'MISMATCH' : 'RECONCILED',
          currency: 'GBP',
          debitMinor: globalDebits,
          creditMinor: globalCredits,
          mismatchCodes: {
            codes,
            projectionMismatchCount,
            lotMismatchCount,
          } as Prisma.InputJsonValue,
          actorUserId: actor.userId,
        },
      });
      await financeTestFailurePoint('reconciliation.after-run');
      const result = {
        reconciliationId: run.id,
        reconciled: codes.length === 0,
        mismatchCodes: codes,
        journalDebitMinor: globalDebits.toString(),
        journalCreditMinor: globalCredits.toString(),
        projectionMismatchCount,
        lotMismatchCount,
      };
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'FINANCE_RECONCILED',
        resourceType: 'financial-reconciliation',
        resourceId: run.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: {
          reconciliationId: run.id,
          status: run.status,
          mismatchCodes: codes,
        },
        createdAt: new Date(),
      });
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
    });
  }
}

type ReconciliationResult = {
  reconciliationId: string;
  reconciled: boolean;
  mismatchCodes: string[];
  journalDebitMinor: string;
  journalCreditMinor: string;
  projectionMismatchCount: number;
  lotMismatchCount: number;
};

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
