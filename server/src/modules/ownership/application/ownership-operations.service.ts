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
import { parseOwnershipUnits } from '../domain/ownership-units';
import { throwIfOwnershipTestFailure } from './ownership-test-failure';

type Db = Prisma.TransactionClient;

@Injectable()
export class OwnershipOperationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  transfer(
    actor: Actor,
    assetId: string,
    input: { fromUserId?: string; toUserId: string; units: string },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      assetId,
      'transfer',
      input,
      requestId,
      key,
      async (db, audit) => {
        const supply = await this.lockSupply(db, assetId);
        const units = parseOwnershipUnits(input.units);
        const from = input.fromUserId
          ? await this.userAccount(db, input.fromUserId)
          : await this.treasuryAccount(db, assetId);
        const to = await this.userAccount(db, input.toUserId);
        if (from.id === to.id)
          throw conflict(
            'OWNERSHIP_TRANSFER_INVALID',
            'Transfer accounts must differ.',
          );
        await this.lockPositions(db, assetId, [from.id, to.id]);
        const source = await this.position(db, assetId, from.id);
        if (source.settledUnits - source.reservedUnits < units)
          throw conflict(
            'INSUFFICIENT_AVAILABLE_UNITS',
            'Insufficient available ownership units.',
          );
        throwIfOwnershipTestFailure('transfer.after-validation');
        const destination = await db.ownershipPosition.upsert({
          where: { assetId_accountId: { assetId, accountId: to.id } },
          create: {
            id: randomUUID(),
            assetId,
            accountId: to.id,
            settledUnits: 0n,
            reservedUnits: 0n,
          },
          update: {},
        });
        await db.ownershipPosition.update({
          where: { id: source.id },
          data: {
            settledUnits: { decrement: units },
            version: { increment: 1 },
          },
        });
        await db.ownershipPosition.update({
          where: { id: destination.id },
          data: {
            settledUnits: { increment: units },
            version: { increment: 1 },
          },
        });
        const entry = await this.entry(db, supply, {
          entryType: 'TRANSFER',
          debitAccountId: from.id,
          creditAccountId: to.id,
          units,
          correlationId: `transfer:${key}`,
          actorUserId: actor.userId,
        });
        await audit('OWNERSHIP_TRANSFERRED', {
          assetId,
          units: units.toString(),
          sequence: entry.sequence.toString(),
        });
        return {
          assetId,
          units: units.toString(),
          sequence: entry.sequence.toString(),
        };
      },
    );
  }

  reserve(
    actor: Actor,
    assetId: string,
    input: {
      userId: string;
      units: string;
      purposeType: string;
      purposeId: string;
      expiresAt?: Date;
    },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      assetId,
      'reserve',
      input,
      requestId,
      key,
      async (db, audit) => {
        const supply = await this.lockSupply(db, assetId);
        const account = await this.userAccount(db, input.userId);
        await this.lockPositions(db, assetId, [account.id]);
        const position = await this.position(db, assetId, account.id);
        const units = parseOwnershipUnits(input.units);
        if (position.settledUnits - position.reservedUnits < units)
          throw conflict(
            'INSUFFICIENT_AVAILABLE_UNITS',
            'Insufficient available ownership units.',
          );
        const existing = await db.ownershipReservation.findUnique({
          where: {
            assetId_accountId_purposeType_purposeId: {
              assetId,
              accountId: account.id,
              purposeType: input.purposeType,
              purposeId: input.purposeId,
            },
          },
        });
        if (existing)
          throw conflict(
            'RESERVATION_TERMINAL',
            'A reservation already exists for this purpose.',
          );
        const reservation = await db.ownershipReservation.create({
          data: {
            id: randomUUID(),
            assetId,
            accountId: account.id,
            purposeType: input.purposeType,
            purposeId: input.purposeId,
            units,
            expiresAt: input.expiresAt,
            idempotencyRef: key,
          },
        });
        await db.ownershipPosition.update({
          where: { id: position.id },
          data: {
            reservedUnits: { increment: units },
            version: { increment: 1 },
          },
        });
        throwIfOwnershipTestFailure('reservation.after-position');
        const entry = await this.entry(db, supply, {
          entryType: 'RESERVE',
          debitAccountId: account.id,
          units,
          correlationId: `reserve:${reservation.id}`,
          actorUserId: actor.userId,
        });
        await audit('OWNERSHIP_RESERVED', {
          assetId,
          units: units.toString(),
          reservationId: reservation.id,
          sequence: entry.sequence.toString(),
        });
        return {
          reservationId: reservation.id,
          assetId,
          status: reservation.status,
          units: units.toString(),
          sequence: entry.sequence.toString(),
        };
      },
    );
  }

  release(actor: Actor, reservationId: string, requestId: string, key: string) {
    return this.mutate(
      actor,
      reservationId,
      'release',
      {},
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "OwnershipReservation" WHERE id = ${reservationId} FOR UPDATE`;
        const reservation = await db.ownershipReservation.findUnique({
          where: { id: reservationId },
        });
        if (!reservation)
          throw new NotFoundException({
            code: 'RESERVATION_NOT_FOUND',
            message: 'Reservation not found.',
          });
        const supply = await this.lockSupply(db, reservation.assetId);
        if (reservation.status !== 'ACTIVE')
          throw conflict(
            'RESERVATION_TERMINAL',
            'The reservation is not active.',
          );
        await this.lockPositions(db, reservation.assetId, [
          reservation.accountId,
        ]);
        const position = await this.position(
          db,
          reservation.assetId,
          reservation.accountId,
        );
        await db.ownershipPosition.update({
          where: { id: position.id },
          data: {
            reservedUnits: { decrement: reservation.units },
            version: { increment: 1 },
          },
        });
        await db.ownershipReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });
        throwIfOwnershipTestFailure('release.after-position');
        const entry = await this.entry(db, supply, {
          entryType: 'RELEASE',
          creditAccountId: reservation.accountId,
          units: reservation.units,
          correlationId: `release:${reservation.id}`,
          actorUserId: actor.userId,
        });
        await audit('OWNERSHIP_RESERVATION_RELEASED', {
          assetId: reservation.assetId,
          reservationId,
          sequence: entry.sequence.toString(),
        });
        return {
          reservationId,
          assetId: reservation.assetId,
          status: 'RELEASED',
          sequence: entry.sequence.toString(),
        };
      },
    );
  }

  correction(
    actor: Actor,
    assetId: string,
    input: {
      userId: string;
      units: string;
      direction: 'CREDIT' | 'DEBIT';
      reasonCode: string;
    },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      assetId,
      'correction',
      input,
      requestId,
      key,
      async (db, audit) => {
        const supply = await this.lockSupply(db, assetId);
        const user = await this.userAccount(db, input.userId);
        const treasury = await this.treasuryAccount(db, assetId);
        const debit = input.direction === 'CREDIT' ? treasury : user;
        const credit = input.direction === 'CREDIT' ? user : treasury;
        await this.lockPositions(db, assetId, [debit.id, credit.id]);
        const units = parseOwnershipUnits(input.units);
        const source = await this.position(db, assetId, debit.id);
        if (source.settledUnits - source.reservedUnits < units)
          throw conflict(
            'INSUFFICIENT_AVAILABLE_UNITS',
            'Insufficient available ownership units.',
          );
        throwIfOwnershipTestFailure('correction.after-validation');
        const destination = await db.ownershipPosition.upsert({
          where: { assetId_accountId: { assetId, accountId: credit.id } },
          create: { id: randomUUID(), assetId, accountId: credit.id },
          update: {},
        });
        await db.ownershipPosition.update({
          where: { id: source.id },
          data: {
            settledUnits: { decrement: units },
            version: { increment: 1 },
          },
        });
        await db.ownershipPosition.update({
          where: { id: destination.id },
          data: {
            settledUnits: { increment: units },
            version: { increment: 1 },
          },
        });
        const entry = await this.entry(db, supply, {
          entryType: 'CORRECTION',
          debitAccountId: debit.id,
          creditAccountId: credit.id,
          units,
          correlationId: `correction:${key}`,
          reasonCode: input.reasonCode,
          actorUserId: actor.userId,
        });
        await audit('OWNERSHIP_CORRECTED', {
          assetId,
          units: units.toString(),
          reasonCode: input.reasonCode,
          sequence: entry.sequence.toString(),
        });
        return {
          assetId,
          units: units.toString(),
          sequence: entry.sequence.toString(),
        };
      },
    );
  }

  reconcile(actor: Actor, assetId: string, requestId: string, key: string) {
    return this.mutate(
      actor,
      assetId,
      'reconcile',
      {},
      requestId,
      key,
      async (db, audit) => {
        const supply = await this.lockSupply(db, assetId);
        const [positions, issuedLedger] = await Promise.all([
          db.ownershipPosition.aggregate({
            where: { assetId },
            _sum: { settledUnits: true, reservedUnits: true },
          }),
          db.ownershipLedgerEntry.aggregate({
            where: { assetId, entryType: 'ISSUANCE' },
            _sum: { units: true },
          }),
        ]);
        const positionUnits = positions._sum.settledUnits ?? 0n;
        const reservedUnits = positions._sum.reservedUnits ?? 0n;
        const ledgerUnits = issuedLedger._sum.units ?? 0n;
        const mismatchCodes = [
          ...(positionUnits !== supply.issuedUnits
            ? ['POSITION_TOTAL_MISMATCH']
            : []),
          ...(ledgerUnits !== supply.issuedUnits
            ? ['LEDGER_ISSUANCE_MISMATCH']
            : []),
          ...(reservedUnits > positionUnits ? ['RESERVED_UNITS_INVALID'] : []),
        ];
        const status = mismatchCodes.length ? 'MISMATCH' : 'RECONCILED';
        const run = await db.ownershipReconciliationRun.create({
          data: {
            id: randomUUID(),
            assetId,
            status,
            expectedIssuedUnits: supply.issuedUnits,
            positionUnits,
            reservedUnits,
            ledgerUnits,
            mismatchCodes,
            actorUserId: actor.userId,
          },
        });
        await audit('OWNERSHIP_RECONCILED', { assetId, status, mismatchCodes });
        return {
          runId: run.id,
          assetId,
          status,
          mismatchCodes,
          issuedUnits: supply.issuedUnits.toString(),
          positionUnits: positionUnits.toString(),
          reservedUnits: reservedUnits.toString(),
        };
      },
    );
  }

  async ownPosition(actor: Actor, assetId: string) {
    const account = await this.db.ownershipAccount.findUnique({
      where: { userId: actor.userId },
    });
    if (!account)
      throw new NotFoundException({
        code: 'POSITION_NOT_FOUND',
        message: 'Ownership position not found.',
      });
    const position = await this.db.ownershipPosition.findUnique({
      where: { assetId_accountId: { assetId, accountId: account.id } },
    });
    if (!position)
      throw new NotFoundException({
        code: 'POSITION_NOT_FOUND',
        message: 'Ownership position not found.',
      });
    return {
      assetId,
      settledUnits: position.settledUnits.toString(),
      reservedUnits: position.reservedUnits.toString(),
      availableUnits: (
        position.settledUnits - position.reservedUnits
      ).toString(),
    };
  }

  /** Own-only projection addressed by the public market slug. */
  async ownMarketPosition(actor: Actor, slug: string) {
    const asset = await this.db.asset.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Resource not found.',
      });
    return this.ownPosition(actor, asset.id);
  }

  private async mutate<T extends Record<string, unknown>>(
    actor: Actor,
    assetId: string,
    operation: string,
    body: unknown,
    requestId: string,
    key: string,
    work: (
      db: Db,
      audit: (
        action: string,
        metadata: Record<string, unknown>,
      ) => Promise<void>,
    ) => Promise<T>,
  ) {
    this.recentAuth.require(actor);
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `ownership.${operation}:${assetId}`,
      key,
    };
    const hash = createHash('sha256')
      .update(`${operation}\n${JSON.stringify(body)}`)
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
          'The request key cannot be reused for this operation.',
        );
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as T;
      const audit = (action: string, metadata: Record<string, unknown>) =>
        tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action,
          resourceType: 'asset',
          resourceId: assetId,
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

  private async lockSupply(db: Db, assetId: string) {
    await db.$queryRaw`SELECT "assetId" FROM "OwnershipAssetSupply" WHERE "assetId" = ${assetId} FOR UPDATE`;
    const supply = await db.ownershipAssetSupply.findUnique({
      where: { assetId },
    });
    if (!supply)
      throw conflict(
        'OWNERSHIP_NOT_ISSUED',
        'Ownership has not been issued for this asset.',
      );
    if (supply.status !== 'ACTIVE')
      throw conflict('OWNERSHIP_FROZEN', 'Ownership supply is not active.');
    return supply;
  }
  private async lockPositions(db: Db, assetId: string, accountIds: string[]) {
    const ids = [...new Set(accountIds)].sort();
    await db.$queryRaw`SELECT "accountId" FROM "OwnershipPosition" WHERE "assetId" = ${assetId} AND "accountId" IN (${Prisma.join(ids)}) ORDER BY "accountId" FOR UPDATE`;
  }
  private async position(db: Db, assetId: string, accountId: string) {
    const position = await db.ownershipPosition.findUnique({
      where: { assetId_accountId: { assetId, accountId } },
    });
    if (!position)
      throw conflict(
        'INSUFFICIENT_AVAILABLE_UNITS',
        'Insufficient available ownership units.',
      );
    return position;
  }
  private async userAccount(db: Db, userId: string) {
    await db.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    return (
      (await db.ownershipAccount.findUnique({ where: { userId } })) ??
      db.ownershipAccount.create({
        data: { id: randomUUID(), type: 'USER', userId, status: 'ACTIVE' },
      })
    );
  }
  private async treasuryAccount(db: Db, assetId: string) {
    const account = await db.ownershipAccount.findFirst({
      where: { type: 'TREASURY', positions: { some: { assetId } } },
    });
    if (!account)
      throw conflict(
        'OWNERSHIP_INVARIANT_VIOLATION',
        'Ownership treasury is unavailable.',
      );
    return account;
  }
  private async entry(
    db: Db,
    supply: { assetId: string; nextSequence: bigint },
    data: {
      entryType: 'TRANSFER' | 'RESERVE' | 'RELEASE' | 'CORRECTION';
      debitAccountId?: string;
      creditAccountId?: string;
      units: bigint;
      correlationId: string;
      reasonCode?: string;
      actorUserId: string;
    },
  ) {
    const entry = await db.ownershipLedgerEntry.create({
      data: {
        id: randomUUID(),
        assetId: supply.assetId,
        sequence: supply.nextSequence,
        entryType: data.entryType,
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        units: data.units,
        correlationId: data.correlationId,
        reasonCode: data.reasonCode,
        actorUserId: data.actorUserId,
      },
    });
    await db.ownershipAssetSupply.update({
      where: { assetId: supply.assetId },
      data: { nextSequence: { increment: 1n } },
    });
    return entry;
  }
}

function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
