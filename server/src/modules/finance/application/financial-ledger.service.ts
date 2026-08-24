import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { financeTestFailurePoint } from './finance-test-failure-injection';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import {
  accountAuthority,
  validateBalancedJournal,
  type JournalLine,
} from '../domain/journal';

type Db = Prisma.TransactionClient;

type PostJournalInput = Readonly<{
  type:
    | 'DEMO_FUNDING'
    | 'EXTERNAL_DEPOSIT'
    | 'EXTERNAL_WITHDRAWAL'
    | 'CASH_RESERVATION'
    | 'CASH_RELEASE'
    | 'ADMIN_CORRECTION'
    | 'DISTRIBUTION';
  correlationId: string;
  descriptionCode: string;
  lines: readonly JournalLine[];
}>;

@Injectable()
export class FinancialLedgerService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

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
    const accounts = await this.db.financialAccount.findMany({
      where: { ownerType: 'USER', ownerUserId: userId, currency: 'GBP' },
      include: { balance: true },
      orderBy: { code: 'asc' },
    });
    const accountIds = accounts.map((account) => account.id);
    const [pendingMovements, reservations] = await Promise.all([
      this.db.moneyMovement.findMany({
        where: {
          userId,
          status: { in: ['CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW', 'HELD'] },
        },
        select: { type: true, amountMinor: true },
      }),
      accountIds.length
        ? this.db.cashReservation.findMany({
            where: { accountId: { in: accountIds }, status: 'ACTIVE' },
            select: { purposeType: true, amountMinor: true },
          })
        : Promise.resolve([]),
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
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
