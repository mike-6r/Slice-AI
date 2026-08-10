import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { parseOwnershipUnits } from '../../ownership/domain/ownership-units';
import { allocateFifoLots } from '../domain/fifo';
import { parsePositiveMoneyMinor } from '../domain/money';
import { financeTestFailurePoint } from './finance-test-failure-injection';

type Db = Prisma.TransactionClient;

@Injectable()
export class PortfolioLotService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async recordAcquisition(
    actor: Actor,
    input: {
      userId: string;
      assetId: string;
      units: string;
      totalCostMinor: string;
      sourceReference: string;
      acquiredAt?: Date;
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    const units = parseOwnershipUnits(input.units);
    const totalCostMinor = parsePositiveMoneyMinor(input.totalCostMinor);
    return this.mutate(
      actor,
      'acquisition',
      input,
      requestId,
      key,
      async (db, audit) => {
        await this.lockUserLots(db, input.userId, input.assetId);
        const existing = await db.portfolioLot.findUnique({
          where: { sourceReference: input.sourceReference },
        });
        if (existing)
          throw conflict(
            'PORTFOLIO_LOT_SOURCE_CONFLICT',
            'Lot source has already been recorded.',
          );
        const lot = await db.portfolioLot.create({
          data: {
            id: randomUUID(),
            userId: input.userId,
            assetId: input.assetId,
            acquiredUnits: units,
            remainingUnits: units,
            totalCostMinor,
            currency: 'GBP',
            sourceReference: input.sourceReference,
            acquiredAt: input.acquiredAt ?? new Date(),
          },
        });
        const result = {
          lotId: lot.id,
          assetId: lot.assetId,
          remainingUnits: lot.remainingUnits.toString(),
          totalCostMinor: lot.totalCostMinor.toString(),
        };
        await audit('FINANCE_LOT_ACQUIRED', {
          lotId: lot.id,
          assetId: lot.assetId,
          units: units.toString(),
        });
        return result;
      },
    );
  }

  async recordDisposal(
    actor: Actor,
    input: {
      userId: string;
      assetId: string;
      units: string;
      grossProceedsMinor: string;
      sourceReference: string;
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    const units = parseOwnershipUnits(input.units);
    const grossProceedsMinor = parsePositiveMoneyMinor(
      input.grossProceedsMinor,
    );
    return this.mutate(
      actor,
      'disposal',
      input,
      requestId,
      key,
      async (db, audit) => {
        await this.lockUserLots(db, input.userId, input.assetId);
        const prior = await db.lotDisposal.findUnique({
          where: { sourceReference: input.sourceReference },
        });
        if (prior)
          throw conflict(
            'PORTFOLIO_DISPOSAL_SOURCE_CONFLICT',
            'Disposal source has already been recorded.',
          );
        const lots = await db.portfolioLot.findMany({
          where: {
            userId: input.userId,
            assetId: input.assetId,
            status: 'OPEN',
          },
          include: { disposals: { select: { allocatedCostMinor: true } } },
          orderBy: [{ acquiredAt: 'asc' }, { id: 'asc' }],
        });
        if (lots.length === 0)
          throw new NotFoundException({
            code: 'PORTFOLIO_LOT_NOT_FOUND',
            message: 'No open portfolio lots exist.',
          });
        await financeTestFailurePoint('lot.disposal.after-lock');
        const allocations = allocateFifoLots(
          lots.map((lot) => ({
            id: lot.id,
            acquiredAt: lot.acquiredAt,
            acquiredUnits: lot.acquiredUnits,
            remainingUnits: lot.remainingUnits,
            totalCostMinor: lot.totalCostMinor,
            allocatedCostMinor: lot.disposals.reduce(
              (sum, disposal) => sum + disposal.allocatedCostMinor,
              0n,
            ),
          })),
          units,
        );
        let allocatedProceeds = 0n;
        let allocatedCost = 0n;
        for (let index = 0; index < allocations.length; index += 1) {
          const allocation = allocations[index];
          const proceeds =
            index === allocations.length - 1
              ? grossProceedsMinor - allocatedProceeds
              : (grossProceedsMinor * allocation.units) / units;
          allocatedProceeds += proceeds;
          allocatedCost += allocation.allocatedCostMinor;
          const lot = lots.find((item) => item.id === allocation.lotId)!;
          const remainingUnits = lot.remainingUnits - allocation.units;
          await db.portfolioLot.update({
            where: { id: lot.id },
            data: {
              remainingUnits,
              status: remainingUnits === 0n ? 'CLOSED' : 'OPEN',
            },
          });
          await db.lotDisposal.create({
            data: {
              id: randomUUID(),
              lotId: lot.id,
              sourceReference: `${input.sourceReference}:${index + 1}`,
              units: allocation.units,
              allocatedCostMinor: allocation.allocatedCostMinor,
              proceedsMinor: proceeds,
              feeMinor: 0n,
              realizedPnlMinor: proceeds - allocation.allocatedCostMinor,
            },
          });
        }
        const result = {
          assetId: input.assetId,
          units: units.toString(),
          costBasisMinor: allocatedCost.toString(),
          grossProceedsMinor: grossProceedsMinor.toString(),
          realizedPnlMinor: (grossProceedsMinor - allocatedCost).toString(),
        };
        await audit('FINANCE_LOT_DISPOSED', {
          assetId: input.assetId,
          units: units.toString(),
          costBasisMinor: result.costBasisMinor,
        });
        return result;
      },
    );
  }

  private async lockUserLots(db: Db, userId: string, assetId: string) {
    await db.$queryRaw`SELECT id FROM "PortfolioLot" WHERE "userId" = ${userId} AND "assetId" = ${assetId} ORDER BY "acquiredAt", id FOR UPDATE`;
  }

  private async mutate<T extends Record<string, unknown>>(
    actor: Actor,
    operation: string,
    input: Record<string, unknown>,
    requestId: string,
    key: string,
    work: (
      db: Db,
      audit: (
        action: 'FINANCE_LOT_ACQUIRED' | 'FINANCE_LOT_DISPOSED',
        metadata: Record<string, unknown>,
      ) => Promise<void>,
    ) => Promise<T>,
  ) {
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `finance.lot.${operation}`,
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
        action: 'FINANCE_LOT_ACQUIRED' | 'FINANCE_LOT_DISPOSED',
        metadata: Record<string, unknown>,
      ) =>
        tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action,
          resourceType: 'portfolio-lot',
          resourceId: String(metadata.lotId ?? metadata.assetId),
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
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
