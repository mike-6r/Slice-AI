import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from '../../finance/application/financial-ledger.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { AccountCapabilityService } from '../../identity/access/account-capability.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { ComplianceService } from './compliance.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { LocalTransactionScreeningAdapter } from './local-provider.adapters';
import { BlockchainAnalysisAdapter } from './blockchain-analysis.adapter';
import type { TransactionScreeningProvider } from '../domain/provider.types';
import { moneyMovementProviderCode } from '../domain/money-movement-provider';
import { providerTestFailurePoint } from './provider-test-failure-injection';
import { OutboxWriter } from '../../outbox/application/outbox-writer.service';
import { financialNotificationEvent, financialNotificationKind, formatGbpMinor, movementSettledEvent } from '../../outbox/domain/domain-event';
import { feeForBps, WITHDRAWAL_FEE_BPS } from '../../finance/domain/fee-policy';
import { BankConnectionService } from './external-provider-boundaries';
import {
  ConnectPayoutExternalTransferError,
  StripeConnectPayoutService,
} from './stripe-connect-payout.service';
import { WithdrawalPreflightService } from './withdrawal-preflight.service';

type MovementType = 'DEPOSIT' | 'WITHDRAWAL';

/**
 * Destination screening belongs to the local destination-based provider
 * adapter. Stripe withdrawals are bank payouts to a verified Connect account;
 * Stripe's connected-account requirements and Slice's compliance gates are the
 * authoritative controls for that destination.
 */
export function requiresDestinationScreening(
  providerMode: AppConfig['providerMode'],
) {
  return providerMode === 'local';
}

export function calculateWithdrawalVelocity(
  movements: ReadonlyArray<{ amountMinor: bigint; createdAt: Date }>,
  amount: bigint,
  now = new Date(),
) {
  const since24h = now.getTime() - 86_400_000;
  const since7d = now.getTime() - 7 * 86_400_000;
  return {
    total7d: movements
      .filter((item) => item.createdAt.getTime() >= since7d)
      .reduce((total, item) => total + item.amountMinor, amount),
    total24h: movements
      .filter((item) => item.createdAt.getTime() >= since24h)
      .reduce((total, item) => total + item.amountMinor, amount),
  };
}

export function calculateDepositVelocity(
  movements: ReadonlyArray<{ amountMinor: bigint; createdAt: Date }>,
  now = new Date(),
  rapidWindowSeconds?: number,
) {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const since7d = now.getTime() - 7 * 86_400_000;
  const rapidSince = rapidWindowSeconds === undefined
    ? null
    : now.getTime() - rapidWindowSeconds * 1000;
  return {
    dailyTotal: movements
      .filter((item) => item.createdAt >= dayStart)
      .reduce((total, item) => total + item.amountMinor, 0n),
    rolling7dTotal: movements
      .filter((item) => item.createdAt.getTime() >= since7d)
      .reduce((total, item) => total + item.amountMinor, 0n),
    dailyCount: movements.filter((item) => item.createdAt >= dayStart).length,
    rapidCount: rapidSince === null
      ? 0
      : movements.filter((item) => item.createdAt.getTime() >= rapidSince).length,
  };
}

export type DepositLimitCode = 'DEPOSIT_LIMIT_EXCEEDED' | 'DEPOSIT_DAILY_LIMIT_EXCEEDED' | 'DEPOSIT_ROLLING_LIMIT_EXCEEDED' | 'DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED' | 'DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED';
export function depositLimitMessage(code: DepositLimitCode): string {
  switch (code) {
    case 'DEPOSIT_LIMIT_EXCEEDED': return 'This deposit would exceed your current bank funding limit.';
    case 'DEPOSIT_DAILY_LIMIT_EXCEEDED': return 'You’ve reached your current daily bank funding limit.';
    case 'DEPOSIT_ROLLING_LIMIT_EXCEEDED': return 'This deposit would exceed your current rolling bank funding limit.';
    case 'DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED': return 'You’ve reached the current number of bank deposits allowed today.';
    case 'DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED': return 'Please wait a little before trying another bank deposit.';
  }
}

/**
 * Provider-neutral external money lifecycle. An intent never changes spendable
 * cash: only a verified completion posts the Document 013 journal exactly once.
 */
@Injectable()
export class WalletMovementService {
  private readonly screening: TransactionScreeningProvider;
  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
    private readonly compliance: ComplianceService,
    private readonly recentAuth: RecentAuthService,
    private readonly crypto: ProviderCryptoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly outbox: OutboxWriter = new OutboxWriter(),
    @Optional() private readonly capabilities?: AccountCapabilityService,
    @Optional() private readonly bankLinks?: BankConnectionService,
    @Optional() private readonly connectPayouts?: StripeConnectPayoutService,
    @Optional()
    private readonly withdrawalPreflight?: WithdrawalPreflightService,
  ) {
    this.screening =
      config.providerMode === 'local'
        ? new LocalTransactionScreeningAdapter()
        : new BlockchainAnalysisAdapter(config);
  }

  createDeposit(
    actor: Actor,
    amountMinor: string,
    requestId: string,
    key: string,
  ) {
    return this.createWithCapability(
      actor,
      'DEPOSIT',
      amountMinor,
      requestId,
      key,
    );
  }

  async createWithdrawal(
    actor: Actor,
    amountMinor: string,
    requestId: string,
    key: string,
    destinationReference = 'LOCAL_LOW_RISK',
    destinationChain?: string,
  ) {
    // Refresh the provider projection before evaluating the capability. This
    // prevents a previously READY Connect row from allowing a withdrawal
    // after Stripe has added a requirement or restricted payouts. The refresh
    // is read-only from Slice's financial perspective; no movement exists yet.
    if (this.config.providerMode !== 'local' && this.connectPayouts) {
      await this.connectPayouts.status(actor);
    }
    await this.capabilities?.require(actor, 'WITHDRAW_FUNDS');
    this.recentAuth.require(actor);
    // Stripe-mode withdrawals use the verified Connect account as the payout
    // destination. The blockchain adapter is only valid for the local
    // destination-based provider path; sending a bank payout through it
    // requires a blockchain chain and can reject an otherwise valid payout
    // before the Connect lifecycle starts.
    const screening = requiresDestinationScreening(this.config.providerMode)
      ? await this.screening.screen({
          address: destinationReference,
          currency: 'GBP',
          chain: destinationChain,
        })
      : { decision: 'ALLOW' as const };
    if (screening.decision !== 'ALLOW') {
      await this.db.$transaction(async (db) => {
        await db.complianceHold.create({
          data: {
            id: randomUUID(),
            userId: actor.userId,
            scope: 'WITHDRAWAL',
            reasonCode:
              screening.decision === 'MANUAL_REVIEW'
                ? 'KYT_MANUAL_REVIEW'
                : 'KYT_BLOCKED',
            source: 'SYSTEM',
          },
        });
        await createIdentityTransaction(db).audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'COMPLIANCE_HOLD_CREATED',
          resourceType: 'compliance-hold',
          resourceId: null,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata: {
            source: 'SYSTEM',
            scope: 'WITHDRAWAL',
            reasonCode:
              screening.decision === 'MANUAL_REVIEW'
                ? 'KYT_MANUAL_REVIEW'
                : 'KYT_BLOCKED',
          },
          createdAt: new Date(),
        });
      });
      throw new ConflictException({
        code:
          screening.decision === 'MANUAL_REVIEW'
            ? 'KYT_MANUAL_REVIEW'
            : 'KYT_BLOCKED',
        message: 'Withdrawal requires compliance review.',
      });
    }
    return this.create(actor, 'WITHDRAWAL', amountMinor, requestId, key);
  }

  private async createWithCapability(
    actor: Actor,
    type: MovementType,
    amountMinor: string,
    requestId: string,
    key: string,
  ) {
    await this.capabilities?.require(actor, 'DEPOSIT_FUNDS');
    return this.create(actor, type, amountMinor, requestId, key);
  }

  private async create(
    actor: Actor,
    type: MovementType,
    amountText: string,
    requestId: string,
    key: string,
  ) {
    const amountMinor = this.amount(amountText);
    const sliceFeeMinor =
      type === 'WITHDRAWAL' ? feeForBps(amountMinor, WITHDRAWAL_FEE_BPS) : 0n;
    const providerAmountMinor = amountMinor - sliceFeeMinor;
    await this.compliance.requireIdentityApproved(
      actor.userId,
      type === 'WITHDRAWAL' ? ['WITHDRAWAL'] : ['FUNDING'],
    );
    const hash = this.crypto.hash(key);
    const existing = await this.db.moneyMovement.findUnique({
      where: {
        userId_type_idempotencyKeyHash: {
          userId: actor.userId,
          type,
          idempotencyKeyHash: hash,
        },
      },
    });
    if (existing) return this.safe(existing, true);
    if (type === 'WITHDRAWAL' && this.config.providerMode !== 'local') {
      if (!this.withdrawalPreflight)
        throw new ConflictException({
          code: 'PROVIDER_LIQUIDITY_UNAVAILABLE',
          message:
            "Your funds are still settling with our payment provider and aren't ready for bank withdrawal yet.",
        });
      await this.withdrawalPreflight.assertWithdrawalCanStart(
        actor.userId,
        amountText,
      );
    }

    const movementResult = await this.db.$transaction(async (db) => {
      // Serialize withdrawal intents per user before reading velocity totals.
      // This prevents concurrent requests from both passing the same window
      // without inventing a new threshold or risk score.
      if (type === 'WITHDRAWAL' || type === 'DEPOSIT') {
        const existingBeforeLock = await db.moneyMovement.findUnique({
          where: {
            userId_type_idempotencyKeyHash: {
              userId: actor.userId,
              type,
              idempotencyKeyHash: hash,
            },
          },
        });
        if (existingBeforeLock)
          return { movement: existingBeforeLock, reused: true };
        const lockKey = type === 'WITHDRAWAL'
          ? `WALLET_WITHDRAWAL_VELOCITY:${actor.userId}`
          : `WALLET_DEPOSIT_VELOCITY:${actor.userId}`;
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      }
      const existingAfterLock = await db.moneyMovement.findUnique({
        where: {
          userId_type_idempotencyKeyHash: {
            userId: actor.userId,
            type,
            idempotencyKeyHash: hash,
          },
        },
      });
      if (existingAfterLock)
        return { movement: existingAfterLock, reused: true };
      if (type === 'WITHDRAWAL')
        await this.enforceWithdrawalLimits(db, actor.userId, amountMinor);
      if (type === 'DEPOSIT')
        await this.enforceDepositLimits(db, actor.userId, amountMinor);
      if (type === 'DEPOSIT') {
        // New accounts do not need a ledger row until they use cash. Lock the
        // user while lazily provisioning it so concurrent first deposits cannot
        // race past the composite account uniqueness constraint.
        await db.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId} FOR UPDATE`;
      }
      const bacsRiskHold =
        type === 'DEPOSIT' && this.ledger.bacsRiskHoldEnabled();
      const cashAccounts = await db.financialAccount.findMany({
        where: {
          ownerType: 'USER',
          ownerUserId: actor.userId,
          code: {
            in: bacsRiskHold
              ? ['BACS_RISK_HOLD']
              : ['CASH_AVAILABLE', 'COLLECTOR_PROCEEDS_AVAILABLE'],
          },
          currency: 'GBP',
          status: 'ACTIVE',
        },
        include: { balance: true },
      });
      const hasSufficientAvailable = (
        account: (typeof cashAccounts)[number],
      ) => {
        const balance = account.balance;
        if (!balance) return false;
        const authority = balance.postedCreditMinor - balance.postedDebitMinor;
        return authority - balance.reservedMinor >= amountMinor;
      };
      let cash =
        type === 'WITHDRAWAL'
          ? (cashAccounts.find(
              (account) =>
                account.code === 'COLLECTOR_PROCEEDS_AVAILABLE' &&
                hasSufficientAvailable(account),
            ) ??
            cashAccounts.find(
              (account) =>
                account.code === 'CASH_AVAILABLE' &&
                hasSufficientAvailable(account),
            ) ??
            cashAccounts.find((account) => account.code === 'CASH_AVAILABLE'))
          : cashAccounts.find((account) =>
              account.code === (bacsRiskHold ? 'BACS_RISK_HOLD' : 'CASH_AVAILABLE'),
            );
      if (!cash && type === 'DEPOSIT')
        cash = await this.ledger.depositCashAccount(
          db,
          actor.userId,
          bacsRiskHold,
        );
      if (!cash && type === 'WITHDRAWAL')
        throw new ConflictException({
          code: 'NO_WITHDRAWABLE_BALANCE',
          message: 'No posted GBP cash is available for withdrawal.',
        });
      if (!cash)
        throw new NotFoundException({
          code: 'FINANCIAL_ACCOUNT_NOT_FOUND',
          message: 'Cash account was not found.',
        });
      const created = await db.moneyMovement.create({
        data: {
          id: randomUUID(),
          userId: actor.userId,
          cashAccountId: cash.id,
          type,
          amountMinor,
          sliceFeeMinor,
          providerAmountMinor,
          currency: 'GBP',
          status: 'PENDING_PROVIDER',
          provider: moneyMovementProviderCode(this.config.providerMode),
          idempotencyKeyHash: hash,
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: created.id,
          toStatus: created.status,
          reasonCode: 'INTENT_CREATED',
        },
      });
      return { movement: created, reused: false };
    });
    const movement = movementResult.movement;
    if (movementResult.reused) return this.safe(movement, true);

    let providerLiquidityReservationId: string | null = null;
    let providerLiquidityConsumed = false;
    let cashReservationId: string | null = null;
    if (type === 'WITHDRAWAL') {
      try {
        await providerTestFailurePoint(
          'movement.withdrawal.before-reservation',
        );
        if (this.config.providerMode !== 'local') {
          providerLiquidityReservationId =
            await this.withdrawalPreflight!.reserveProviderLiquidity(
              movement.id,
              (movement.providerAmountMinor ?? movement.amountMinor).toString(),
            );
        }
        const reservation = await this.ledger.reserveCash(
          actor,
          {
            accountId: movement.cashAccountId,
            purposeType: 'EXTERNAL_WITHDRAWAL',
            purposeId: movement.id,
            amountMinor: amountText,
          },
          requestId,
          `provider-movement:${movement.id}:reserve`,
        );
        cashReservationId = reservation.reservationId;
        await this.db.moneyMovement.update({
          where: { id: movement.id },
          data: { reservationId: reservation.reservationId },
        });
      } catch (error) {
        await this.withdrawalPreflight?.releaseProviderLiquidity(
          providerLiquidityReservationId,
        );
        // Preserve append-only lifecycle history while making the failed intent
        // permanently non-spendable. If the movement-link update failed after
        // cash reservation, release that reservation in the same transaction.
        await this.db.$transaction(async (db) => {
          if (cashReservationId) {
            await this.ledger.releaseCashInTransaction(
              db,
              this.providerActor(actor.userId, movement.id),
              cashReservationId,
              requestId,
            );
          }
          await db.moneyMovement.update({
            where: { id: movement.id },
            data: {
              status: 'FAILED',
              failureCode: 'RESERVATION_REJECTED',
              version: { increment: 1 },
            },
          });
          await db.moneyMovementHistory.create({
            data: {
              id: randomUUID(),
              movementId: movement.id,
              fromStatus: 'PENDING_PROVIDER',
              toStatus: 'FAILED',
              reasonCode: 'RESERVATION_REJECTED',
            },
          });
        });
        throw error;
      }
    }

    await this.db.$transaction(async (db) => {
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'WALLET_MOVEMENT_CREATED',
        resourceType: 'money-movement',
        resourceId: movement.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { type, amountMinor: amountText },
        createdAt: new Date(),
      });
    });
    if (type === 'DEPOSIT' && this.config.providerMode !== 'local') {
      if (!this.bankLinks)
        throw new ConflictException({
          code: 'STRIPE_PROVIDER_UNAVAILABLE',
          message: 'Bank funding is not configured.',
        });
      try {
        const external = await this.bankLinks.createDepositPayment({
          userId: actor.userId,
          movementId: movement.id,
          amountMinor: amountText,
        });
        const providerHash = this.crypto.hash(external.providerReference);
        await this.db.$transaction(async (db) => {
          const current = await db.moneyMovement.findUniqueOrThrow({
            where: { id: movement.id },
          });
          await db.moneyMovement.update({
            where: { id: movement.id },
            data: {
              externalAccountId: external.externalAccountId,
              status: external.status,
              providerReferenceCiphertext: this.crypto.encrypt(
                external.providerReference,
                `movement:${movement.id}`,
              ),
              providerReferenceHash: providerHash,
              encryptionKeyVersion: this.crypto.keyVersion,
              failureCode: external.failureCode ?? null,
              version: { increment: 1 },
            },
          });
          await db.moneyMovementHistory.create({
            data: {
              id: randomUUID(),
              movementId: movement.id,
              fromStatus: current.status,
              toStatus: external.status,
              reasonCode: 'STRIPE_PAYMENT_INTENT_CREATED',
            },
          });
        });
      } catch (error) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode:
            error instanceof Error
              ? error.message.slice(0, 64)
              : 'STRIPE_PROVIDER_ERROR',
          requestId,
        });
        throw error;
      }
    }
    if (type === 'WITHDRAWAL' && this.config.providerMode !== 'local') {
      const cashAccount = await this.db.financialAccount.findUnique({
        where: { id: movement.cashAccountId },
        select: { code: true },
      });
      if (
        cashAccount?.code !== 'CASH_AVAILABLE' &&
        cashAccount?.code !== 'COLLECTOR_PROCEEDS_AVAILABLE'
      ) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode: 'EXTERNAL_WITHDRAWAL_NOT_CONFIGURED',
          requestId,
        });
        throw new ConflictException({
          code: 'EXTERNAL_WITHDRAWAL_NOT_CONFIGURED',
          message:
            'External withdrawals are not currently available for this cash balance.',
        });
      }
      if (!this.connectPayouts) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode: 'STRIPE_CONNECT_UNAVAILABLE',
          requestId,
        });
        throw new ConflictException({
          code: 'STRIPE_CONNECT_UNAVAILABLE',
          message: 'Payouts are not configured.',
        });
      }
      let providerOperationStarted = false;
      try {
        await this.connectPayouts.createPayout({
          userId: actor.userId,
          movementId: movement.id,
          amountMinor: (
            movement.providerAmountMinor ?? movement.amountMinor
          ).toString(),
        });
        providerOperationStarted = true;
        await this.withdrawalPreflight?.consumeProviderLiquidity(
          providerLiquidityReservationId,
        );
        providerLiquidityConsumed = true;
        await this.processingFromProvider({
          movementId: movement.id,
          requestId,
        });
      } catch (error) {
        if (
          error instanceof ConnectPayoutExternalTransferError ||
          providerOperationStarted
        ) {
          // Once a provider transfer/payout may exist, keep the movement and
          // reservation in review even if our own post-provider persistence
          // failed. Releasing capacity here could allow a duplicate payout.
          try {
            await this.withdrawalPreflight?.consumeProviderLiquidity(
              providerLiquidityReservationId,
            );
            providerLiquidityConsumed = true;
          } catch {
            // An active reservation is safer than releasing unknown provider
            // exposure. Reconciliation can resolve it after the provider read.
          }
          await this.holdFromProvider({
            movementId: movement.id,
            reasonCode:
              error instanceof ConnectPayoutExternalTransferError
                ? 'STRIPE_PAYOUT_REQUIRES_REVIEW'
                : 'PROVIDER_STATE_RECONCILIATION_REQUIRED',
            requestId,
          });
        } else {
          if (!providerLiquidityConsumed)
            await this.withdrawalPreflight?.releaseProviderLiquidity(
              providerLiquidityReservationId,
            );
          await this.failFromProvider({
            movementId: movement.id,
            reasonCode:
              error instanceof Error
                ? error.message.slice(0, 64)
                : 'STRIPE_PAYOUT_FAILED',
            requestId,
          });
        }
        throw error;
      }
    }
    return this.safe(
      await this.db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      }),
      false,
    );
  }

  async processingFromProvider(input: {
    movementId: string;
    requestId: string;
  }) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
      });
      if (
        [
          'SETTLED',
          'FAILED',
          'CANCELLED',
          'RETURNED',
          'REVERSED',
          'MANUAL_REVIEW',
          'HELD',
        ].includes(current.status)
      )
        return this.safe(current, true);
      if (current.status === 'PROCESSING') return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: current.id },
        data: { status: 'PROCESSING', version: { increment: 1 } },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: current.id,
          fromStatus: current.status,
          toStatus: 'PROCESSING',
          reasonCode: 'PROVIDER_PROCESSING',
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: current.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'PROCESSING' },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  /** Called only after verified, deduplicated provider confirmation. */
  async completeFromProvider(input: {
    movementId: string;
    providerReference: string;
    providerEventId: string;
    requestId: string;
  }) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const movement = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
        include: { cashAccount: { select: { code: true } } },
      });
      if (['SETTLED', 'HELD'].includes(movement.status))
        return this.safe(movement, true);
      if (
        !['PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW'].includes(
          movement.status,
        )
      ) {
        throw new ConflictException({
          code: 'MOVEMENT_TERMINAL',
          message: 'Money movement cannot be completed.',
        });
      }
      const referenceHash = this.crypto.hash(input.providerReference);
      const referenceOwner = await db.moneyMovement.findUnique({
        where: {
          provider_providerReferenceHash: {
            provider: movement.provider,
            providerReferenceHash: referenceHash,
          },
        },
      });
      if (referenceOwner && referenceOwner.id !== movement.id) {
        throw new ConflictException({
          code: 'PROVIDER_REFERENCE_CONFLICT',
          message: 'Provider reference is already mapped.',
        });
      }
      await providerTestFailurePoint('movement.complete.before-journal');
      const clearing = await this.clearingAccount();
      const withdrawalFeeAccount =
        movement.type === 'WITHDRAWAL' && movement.sliceFeeMinor > 0n
          ? await this.withdrawalFeeAccount(db)
          : null;
      const providerAmountMinor =
        movement.providerAmountMinor ?? movement.amountMinor;
      const actor = this.providerActor(movement.userId, movement.id);
      const riskHeld =
        movement.type === 'DEPOSIT' &&
        movement.cashAccount.code === 'BACS_RISK_HOLD';
      const journal = await this.ledger.postInTransaction(
        db,
        actor,
        {
          type:
            movement.type === 'DEPOSIT'
              ? 'EXTERNAL_DEPOSIT'
              : 'EXTERNAL_WITHDRAWAL',
          correlationId: `provider-movement:${movement.id}`,
          descriptionCode:
            movement.type === 'WITHDRAWAL' && movement.sliceFeeMinor > 0n
              ? 'WITHDRAWAL_PROVIDER_CONFIRMED_WITH_FEE'
              : `${movement.type}_PROVIDER_CONFIRMED`,
          lines:
            movement.type === 'DEPOSIT'
              ? [
                  {
                    accountId: clearing,
                    side: 'DEBIT',
                    amountMinor: movement.amountMinor.toString(),
                  },
                  {
                    accountId: movement.cashAccountId,
                    side: 'CREDIT',
                    amountMinor: movement.amountMinor.toString(),
                  },
                ]
              : [
                  {
                    accountId: movement.cashAccountId,
                    side: 'DEBIT',
                    amountMinor: movement.amountMinor.toString(),
                  },
                  {
                    accountId: clearing,
                    side: 'CREDIT',
                    amountMinor: providerAmountMinor.toString(),
                  },
                  ...(withdrawalFeeAccount
                    ? [
                        {
                          accountId: withdrawalFeeAccount,
                          side: 'CREDIT' as const,
                          amountMinor: movement.sliceFeeMinor.toString(),
                        },
                      ]
                    : []),
                ],
        },
        input.requestId,
        `provider-movement:${movement.id}:journal`,
      );
      if (movement.type === 'WITHDRAWAL' && movement.reservationId) {
        await this.ledger.consumeCashInTransaction(
          db,
          actor,
          movement.reservationId,
          input.requestId,
        );
      }
      await providerTestFailurePoint('movement.complete.after-journal');
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'SETTLED') return this.safe(current, true);
      const transitioned = await db.moneyMovement.updateMany({
        where: { id: movement.id, status: { notIn: ['SETTLED', 'HELD'] } },
        data: {
          status: riskHeld ? 'HELD' : 'SETTLED',
          ledgerTransactionId: journal.transactionId,
          providerReferenceCiphertext: this.crypto.encrypt(
            input.providerReference,
            `movement:${movement.id}`,
          ),
          providerReferenceHash: referenceHash,
          encryptionKeyVersion: this.crypto.keyVersion,
          settledAt: new Date(),
          failureCode: riskHeld ? 'BACS_RETURN_RISK_HOLD' : null,
          version: { increment: 1 },
        },
      });
      if (transitioned.count === 0) return this.safe(current, true);
      const updated = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: updated.status,
          reasonCode: riskHeld
            ? 'PROVIDER_CONFIRMED_BACS_RISK_HELD'
            : 'PROVIDER_CONFIRMED',
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: {
          status: 'SETTLED',
          reasonCode: riskHeld
            ? 'PROVIDER_CONFIRMED_BACS_RISK_HELD'
            : 'PROVIDER_CONFIRMED',
        },
        createdAt: new Date(),
      });
      if (riskHeld) {
        await this.outbox.append(db, financialNotificationEvent({
          kind: financialNotificationKind.depositClearing,
          title: 'Bank deposit clearing',
          body: `Your ${formatGbpMinor(updated.amountMinor)} bank deposit was confirmed and is clearing. It is visible in your Wallet, but it cannot be used for trading or withdrawals until Slice releases it under the current risk policy.`,
          resourceType: 'money-movement',
          resourceId: updated.id,
          aggregateType: 'money-movement',
          aggregateId: updated.id,
          amountMinor: updated.amountMinor.toString(),
          actorUserId: updated.userId,
          correlationId: input.requestId,
          occurredAt: updated.settledAt!,
          eventSuffix: 'clearing',
        }));
      } else {
        await this.outbox.append(
          db,
          movementSettledEvent({
            movementId: updated.id,
            type: updated.type,
            amountMinor: updated.amountMinor.toString(),
            currency: 'GBP',
            status: 'SETTLED',
            actorUserId: updated.userId,
            correlationId: input.requestId,
            occurredAt: updated.settledAt!,
          }),
        );
      }
      return this.safe(updated, false);
    });
  }

  async failFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const preflight = await this.db.moneyMovement.findUnique({
      where: { id: input.movementId },
      select: { status: true },
    });
    if (preflight?.status === 'HELD') {
      return this.returnFromProvider({
        movementId: input.movementId,
        reasonCode: input.reasonCode,
        requestId: input.requestId,
      });
    }
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const movement = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
      });
      if (['FAILED', 'CANCELLED'].includes(movement.status))
        return this.safe(movement, true);
      if (movement.status === 'SETTLED')
        throw new ConflictException({
          code: 'MOVEMENT_TERMINAL',
          message: 'A settled movement cannot fail.',
        });
      if (movement.type === 'WITHDRAWAL' && movement.reservationId) {
        await this.ledger.releaseCashInTransaction(
          db,
          this.providerActor(movement.userId, movement.id),
          movement.reservationId,
          input.requestId,
        );
      }
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'FAILED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: movement.status,
          toStatus: 'FAILED',
          reasonCode: input.reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'FAILED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  async cancelFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const movement = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
      });
      if (movement.status === 'CANCELLED') return this.safe(movement, true);
      if (movement.status === 'SETTLED' || movement.status === 'REVERSED')
        throw new ConflictException({
          code: 'MOVEMENT_TERMINAL',
          message: 'A terminal movement cannot be cancelled.',
        });
      await providerTestFailurePoint('movement.cancel.before-release');
      if (movement.type === 'WITHDRAWAL' && movement.reservationId) {
        await this.ledger.releaseCashInTransaction(
          db,
          this.providerActor(movement.userId, movement.id),
          movement.reservationId,
          input.requestId,
        );
      }
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'CANCELLED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'CANCELLED',
          reasonCode: input.reasonCode,
        },
      });
      return this.safe(updated, false);
    });
  }

  async holdFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (['FAILED', 'CANCELLED', 'RETURNED', 'REVERSED'].includes(movement.status))
      throw new ConflictException({
        code: 'MOVEMENT_TERMINAL',
        message: 'A terminal movement cannot be held.',
      });
    return this.db.$transaction(async (db) => {
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'MANUAL_REVIEW')
        return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'MANUAL_REVIEW',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      const existingHold = await db.complianceHold.findFirst({
        where: {
          movementId: updated.id,
          scope: 'EXTERNAL_MOVEMENT',
          status: 'ACTIVE',
        },
      });
      if (!existingHold) {
        const hold = await db.complianceHold.create({
          data: {
            id: randomUUID(),
            userId: updated.userId,
            movementId: updated.id,
            scope: 'EXTERNAL_MOVEMENT',
            reasonCode: input.reasonCode,
            source: 'PROVIDER',
          },
        });
        await createIdentityTransaction(db).audit.append({
          id: randomUUID(),
          actorUserId: null,
          actorType: 'SYSTEM',
          action: 'COMPLIANCE_HOLD_CREATED',
          resourceType: 'compliance-hold',
          resourceId: hold.id,
          requestId: input.requestId,
          sessionId: null,
          result: 'SUCCESS',
          metadata: {
            source: 'PROVIDER',
            scope: hold.scope,
            reasonCode: hold.reasonCode,
            provider: 'STRIPE',
          },
          createdAt: new Date(),
        });
      }
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'MANUAL_REVIEW',
          reasonCode: input.reasonCode,
        },
      });
      if (updated.type === 'DEPOSIT') {
        await this.outbox.append(db, financialNotificationEvent({
          kind: financialNotificationKind.depositUnderReview,
          title: 'Bank deposit under review',
          body: `Your ${formatGbpMinor(updated.amountMinor)} bank deposit is under review. It cannot be used for trading or withdrawals until the review is complete. We will notify you when the status changes.`,
          resourceType: 'money-movement',
          resourceId: updated.id,
          aggregateType: 'money-movement',
          aggregateId: updated.id,
          amountMinor: updated.amountMinor.toString(),
          actorUserId: updated.userId,
          correlationId: input.requestId,
          eventSuffix: 'review',
        }));
      }
      return this.safe(updated, false);
    });
  }

  async reverseFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (movement.status === 'REVERSED') return this.safe(movement, true);
    if (movement.status !== 'SETTLED' || !movement.ledgerTransactionId)
      throw new ConflictException({
        code: 'MOVEMENT_REVERSAL_UNAVAILABLE',
        message: 'Only settled movements can be reversed.',
      });
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'REVERSED') return this.safe(current, true);
      await this.ledger.reverseInTransaction(
        db,
        this.providerActor(movement.userId, movement.id),
        movement.ledgerTransactionId!,
        input.reasonCode,
        input.requestId,
        `provider-movement:${movement.id}:reversal`,
      );
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'REVERSED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'REVERSED',
          reasonCode: input.reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'REVERSED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  /**
   * A provider return is an append-only reversal with its own movement state.
   * The original settlement journal remains intact; any shortfall is surfaced
   * as a hold instead of being silently covered or fabricated.
   */
  async returnFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (movement.status === 'RETURNED') return this.safe(movement, true);
    if (!['SETTLED', 'HELD', 'MANUAL_REVIEW'].includes(movement.status) || !movement.ledgerTransactionId)
      throw new ConflictException({
        code: 'MOVEMENT_RETURN_UNAVAILABLE',
        message: 'Only provider-confirmed movements can be returned.',
      });
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'RETURNED') return this.safe(current, true);
      await this.ledger.protectReturnedFundsReservationsInTransaction(
        db,
        current.userId,
        current.id,
        input.requestId,
      );
      const release = await db.journalTransaction.findUnique({
        where: { correlationId: `bacs-risk-release:${movement.id}` },
        select: { id: true, status: true, reversal: { select: { id: true } } },
      });
      if (release && release.status !== 'REVERSED' && !release.reversal) {
        await this.ledger.reverseInTransaction(
          db,
          this.providerActor(movement.userId, movement.id),
          release.id,
          'BACS_RISK_HOLD_RELEASE_REVERSED',
          input.requestId,
          `provider-movement:${movement.id}:release-return`,
        );
      }
      await this.ledger.reverseInTransaction(
        db,
        this.providerActor(movement.userId, movement.id),
        movement.ledgerTransactionId!,
        input.reasonCode,
        input.requestId,
        `provider-movement:${movement.id}:return`,
      );
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'RETURNED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'RETURNED',
          reasonCode: input.reasonCode,
        },
      });
      const deficitMinor = await this.ledger.recordReturnedFundsDeficitInTransaction(
        db,
        updated.userId,
        updated.id,
        input.requestId,
        input.reasonCode,
      );
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'RETURNED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      const returnBody = deficitMinor > 0n
        ? `A ${formatGbpMinor(updated.amountMinor)} bank deposit was returned by your bank. Because some of those funds had already been used, your Slice account now has an outstanding balance of ${formatGbpMinor(deficitMinor)}. Buying and withdrawals are temporarily restricted until it is resolved.`
        : `A ${formatGbpMinor(updated.amountMinor)} bank deposit was returned by your bank. Those funds are no longer available in Slice. If you think this is incorrect, please contact support.`;
      await this.outbox.append(db, financialNotificationEvent({
        kind: financialNotificationKind.depositReturned,
        title: 'Bank deposit returned',
        body: returnBody,
        resourceType: 'money-movement',
        resourceId: updated.id,
        aggregateType: 'money-movement',
        aggregateId: updated.id,
        amountMinor: updated.amountMinor.toString(),
        outstandingMinor: deficitMinor.toString(),
        actorUserId: updated.userId,
        correlationId: input.requestId,
        eventSuffix: 'returned',
      }));
      return this.safe(updated, false);
    });
  }

  /*
    await this.ledger.reverse(
      this.providerActor(movement.userId, movement.id),
      movement.ledgerTransactionId,
      input.reasonCode,
      input.requestId,
      `provider-movement:${movement.id}:reversal`,
    );
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'REVERSED') return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'REVERSED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'REVERSED',
          reasonCode: input.reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'REVERSED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  /*
  /**
   * A provider return is an append-only reversal with its own movement state.
   * The original settlement journal remains intact; any shortfall is surfaced
   * as a hold instead of being silently covered or fabricated.
    *
  async returnFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (movement.status === 'RETURNED') return this.safe(movement, true);
    if (movement.status !== 'SETTLED' || !movement.ledgerTransactionId)
      throw new ConflictException({
        code: 'MOVEMENT_RETURN_UNAVAILABLE',
        message: 'Only settled movements can be returned.',
      });
    await this.ledger.reverse(
      this.providerActor(movement.userId, movement.id),
      movement.ledgerTransactionId,
      input.reasonCode,
      input.requestId,
      `provider-movement:${movement.id}:return`,
    );
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'RETURNED') return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'RETURNED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'RETURNED',
          reasonCode: input.reasonCode,
        },
      });
      const account = await db.financialAccount.findUnique({
        where: { id: updated.cashAccountId },
        include: { balance: true },
      });
      if (account?.balance) {
        const authority = accountAuthority(
          account.normalSide,
          account.balance.postedDebitMinor,
          account.balance.postedCreditMinor,
        );
        const available = authority - account.balance.reservedMinor;
        if (available < 0n) {
          await db.complianceHold.create({
            data: {
              id: randomUUID(),
              userId: updated.userId,
              movementId: updated.id,
              scope: 'ACCOUNT',
              reasonCode: 'RETURNED_FUNDS_DEFICIT',
              source: 'PROVIDER_RETURN',
            },
          });
          await createIdentityTransaction(db).audit.append({
            id: randomUUID(),
            actorUserId: null,
            actorType: 'SYSTEM',
            action: 'WALLET_RETURN_DEFICIT_DETECTED',
            resourceType: 'money-movement',
            resourceId: updated.id,
            requestId: input.requestId,
            sessionId: null,
            result: 'SUCCESS',
            metadata: { availableMinor: available.toString(), reasonCode: input.reasonCode },
            createdAt: new Date(),
          });
        }
      }
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'RETURNED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  */
  async list(userId: string, cursor?: string, limit = 20) {
    const rows = await this.db.moneyMovement.findMany({
      where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: {
        externalAccount: {
          select: {
            institutionName: true,
            accountName: true,
            accountMask: true,
            accountType: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((item) => this.safe(item, false)),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  private amount(value: string) {
    if (!/^\d+$/.test(value) || BigInt(value) <= 0n)
      throw new ConflictException({
        code: 'INVALID_MONEY_AMOUNT',
        message: 'Amount must be a positive GBP minor-unit integer.',
      });
    return BigInt(value);
  }

  private async enforceWithdrawalLimits(
    db: Prisma.TransactionClient,
    userId: string,
    amount: bigint,
  ) {
    const per = BigInt(this.config.withdrawalLimitPerMovementMinor);
    if (amount > per)
      throw new ConflictException({
        code: 'MOVEMENT_LIMIT_EXCEEDED',
        message: 'Withdrawal exceeds the configured per-movement limit.',
      });
    const since7d = new Date(Date.now() - 7 * 86_400_000);
    const movements = await db.moneyMovement.findMany({
      where: {
        userId,
        type: 'WITHDRAWAL',
        status: {
          in: [
            'PENDING_PROVIDER',
            'PROCESSING',
            'SETTLED',
            'MANUAL_REVIEW',
            'HELD',
          ],
        },
        createdAt: { gte: since7d },
      },
      select: { amountMinor: true, createdAt: true },
    });
    const { total24h, total7d } = calculateWithdrawalVelocity(
      movements,
      amount,
    );
    if (
      total24h > BigInt(this.config.withdrawalLimit24hMinor) ||
      total7d > BigInt(this.config.withdrawalLimit7dMinor)
    )
      throw new ConflictException({
        code: 'MOVEMENT_LIMIT_EXCEEDED',
        message: 'Withdrawal exceeds the configured velocity limit.',
      });
  }

  private async enforceDepositLimits(
    db: Prisma.TransactionClient,
    userId: string,
    amount: bigint,
  ) {
    const max = this.config.bacsDepositMaxMinor;
    if (max !== undefined && amount > BigInt(max))
      throw new ConflictException({
        code: 'DEPOSIT_LIMIT_EXCEEDED',
        message: depositLimitMessage('DEPOSIT_LIMIT_EXCEEDED'),
      });
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const since7d = new Date(now.getTime() - 7 * 86_400_000);
    const rapidSince = this.config.bacsDepositRapidWindowSeconds === undefined
      ? null
      : new Date(now.getTime() - this.config.bacsDepositRapidWindowSeconds * 1000);
    if (
      this.config.bacsDepositDailyLimitMinor === undefined &&
      this.config.bacsDepositRolling7dLimitMinor === undefined &&
      this.config.bacsDepositDailyCountLimit === undefined &&
      (rapidSince === null || this.config.bacsDepositRapidCountLimit === undefined)
    ) return;
    const rows = await db.moneyMovement.findMany({
      where: {
        userId,
        type: 'DEPOSIT',
        status: { notIn: ['FAILED', 'CANCELLED', 'RETURNED', 'REVERSED'] },
        createdAt: { gte: this.config.bacsDepositDailyLimitMinor !== undefined || this.config.bacsDepositDailyCountLimit !== undefined ? dayStart : since7d },
      },
      select: { amountMinor: true, createdAt: true },
    });
    const velocity = calculateDepositVelocity(
      rows,
      now,
      this.config.bacsDepositRapidWindowSeconds,
    );
    if (this.config.bacsDepositDailyLimitMinor !== undefined) {
      if (velocity.dailyTotal + amount > BigInt(this.config.bacsDepositDailyLimitMinor))
        throw new ConflictException({
          code: 'DEPOSIT_DAILY_LIMIT_EXCEEDED',
          message: depositLimitMessage('DEPOSIT_DAILY_LIMIT_EXCEEDED'),
        });
    }
    if (this.config.bacsDepositRolling7dLimitMinor !== undefined) {
      if (velocity.rolling7dTotal + amount > BigInt(this.config.bacsDepositRolling7dLimitMinor))
        throw new ConflictException({
          code: 'DEPOSIT_ROLLING_LIMIT_EXCEEDED',
          message: depositLimitMessage('DEPOSIT_ROLLING_LIMIT_EXCEEDED'),
        });
    }
    if (this.config.bacsDepositDailyCountLimit !== undefined) {
      if (velocity.dailyCount + 1 > this.config.bacsDepositDailyCountLimit)
        throw new ConflictException({
          code: 'DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED',
          message: depositLimitMessage('DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED'),
        });
    }
    if (rapidSince && this.config.bacsDepositRapidCountLimit !== undefined) {
      if (velocity.rapidCount + 1 > this.config.bacsDepositRapidCountLimit)
        throw new ConflictException({
          code: 'DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED',
          message: depositLimitMessage('DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED'),
        });
    }
  }

  private async lockMovement(id: string) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${id} FOR UPDATE`;
      return db.moneyMovement.findUniqueOrThrow({ where: { id } });
    });
  }

  private async clearingAccount() {
    return this.db.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('EXTERNAL_GBP_CLEARING'))`;
      const existing = await db.financialAccount.findFirst({
        where: {
          ownerType: 'CLEARING',
          code: 'EXTERNAL_GBP_CLEARING',
          currency: 'GBP',
        },
      });
      if (existing) return existing.id;
      return (
        await db.financialAccount.create({
          data: {
            id: randomUUID(),
            ownerType: 'CLEARING',
            accountType: 'ASSET',
            code: 'EXTERNAL_GBP_CLEARING',
            currency: 'GBP',
            normalSide: 'DEBIT',
          },
        })
      ).id;
    });
  }

  private async withdrawalFeeAccount(db: Prisma.TransactionClient) {
    const existing = await db.financialAccount.findFirst({
      where: {
        ownerType: 'PLATFORM',
        code: 'WITHDRAWAL_FEE_REVENUE',
        currency: 'GBP',
      },
    });
    if (existing) return existing.id;
    return (
      await db.financialAccount.create({
        data: {
          id: randomUUID(),
          ownerType: 'PLATFORM',
          accountType: 'REVENUE',
          code: 'WITHDRAWAL_FEE_REVENUE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
      })
    ).id;
  }

  private async updateStatus(
    id: string,
    status: 'FAILED',
    reasonCode: string,
    requestId: string,
  ) {
    return this.db.$transaction(async (db) => {
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id },
      });
      const updated = await db.moneyMovement.update({
        where: { id },
        data: { status, failureCode: reasonCode, version: { increment: 1 } },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: id,
          fromStatus: current.status,
          toStatus: status,
          reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: id,
        requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status, reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  private providerActor(userId: string, movementId: string): Actor {
    return {
      userId: userId as Actor['userId'],
      sessionId: `provider:${movementId}`,
      status: 'ACTIVE',
      roles: [],
      sessionRevokedAt: null,
      sessionRevocationReason: null,
      authenticatedAt: new Date(),
    };
  }

  private safe(
    item: {
      id: string;
      type: string;
      amountMinor: bigint;
      sliceFeeMinor?: bigint;
      providerAmountMinor?: bigint | null;
      currency: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      externalAccount?: {
        institutionName: string | null;
        accountName: string | null;
        accountMask: string | null;
        accountType: string;
      } | null;
      failureCode?: string | null;
    },
    replayed: boolean,
  ) {
    return {
      id: item.id,
      type: item.type,
      amountMinor: item.amountMinor.toString(),
      sliceFeeMinor: (item.sliceFeeMinor ?? 0n).toString(),
      providerAmountMinor: (
        item.providerAmountMinor ?? item.amountMinor
      ).toString(),
      currency: item.currency,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      replayed,
      sourceLabel: item.externalAccount
        ? `${item.externalAccount.institutionName ?? item.externalAccount.accountName ?? (item.externalAccount.accountType === 'bacs_debit' ? 'UK bank account' : 'Connected account')}${item.externalAccount.accountMask ? ` · •••• ${item.externalAccount.accountMask}` : ''}`
        : item.type === 'WITHDRAWAL'
          ? 'GBP wallet → payout destination'
          : 'GBP wallet',
      reference: `WLT-${item.id.slice(0, 8).toUpperCase()}`,
    };
  }
}
