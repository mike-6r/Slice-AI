/* eslint-disable @typescript-eslint/no-require-imports -- Stripe v22 is CommonJS in the Nest build. */
import { PrismaClient } from '@prisma/client';
import Stripe = require('stripe');
import { randomUUID } from 'node:crypto';
import { assertTestDatabaseUrl, type AppConfig } from '../config/app-config';
import { ProviderCryptoService } from '../modules/providers/application/provider-crypto.service';
import { STRIPE_API_VERSION } from '../modules/providers/application/stripe-provider.client';

type BalanceLine = { availableMinor: string; pendingMinor: string };

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const movementId = process.env.SLICE_SANDBOX_MOVEMENT_ID;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

function requireSandbox() {
  if (process.env.PROVIDER_MODE !== 'stripe_sandbox') {
    throw new Error('qa:stripe-withdrawal-trace only runs with PROVIDER_MODE=stripe_sandbox.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('qa:stripe-withdrawal-trace is permanently unavailable in production.');
  }
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required.');
  assertTestDatabaseUrl(databaseUrl);
  if (!stripeSecretKey?.startsWith('sk_test_')) {
    throw new Error('A Stripe test-mode secret key is required.');
  }
  if (!movementId) throw new Error('SLICE_SANDBOX_MOVEMENT_ID is required.');
}

function balanceLine(balance: Stripe.Balance): BalanceLine {
  const sum = (entries: Array<{ amount: number; currency: string }>) =>
    entries
      .filter((entry) => entry.currency.toLowerCase() === 'gbp')
      .reduce(
        (total, entry) =>
          Number.isSafeInteger(entry.amount) ? total + BigInt(entry.amount) : total,
        0n,
      )
      .toString();
  return {
    availableMinor: sum(balance.available),
    pendingMinor: sum(balance.pending),
  };
}

function nullableId(value: Stripe.Response<Stripe.Transfer | Stripe.Payout> | null) {
  return value?.id ?? null;
}

function traceStatus(input: {
  movementStatus: string;
  payoutStatus: string | null;
  ledgerTransactionId: string | null;
}) {
  if (input.payoutStatus === 'PAID' && input.movementStatus === 'SETTLED') {
    return input.ledgerTransactionId ? 'PASS' : 'FAIL_MISSING_LEDGER_POSTING';
  }
  if (['FAILED', 'CANCELED', 'MANUAL_REVIEW'].includes(input.payoutStatus ?? '')) {
    return ['HELD', 'MANUAL_REVIEW', 'FAILED', 'CANCELLED'].includes(input.movementStatus)
      ? 'REVIEW_REQUIRED'
      : 'FAIL_PROVIDER_TERMINAL_STATE_NOT_REFLECTED';
  }
  return 'PENDING_PROVIDER_FINALITY';
}

async function ensureAvailablePlatformLiquidity(
  stripe: Stripe,
  minimumMinor: bigint,
) {
  const before = await stripe.balance.retrieve();
  const availableBefore = BigInt(balanceLine(before).availableMinor);
  if (availableBefore >= minimumMinor) {
    return { fundedPaymentIntentId: null, before: balanceLine(before), after: balanceLine(before) };
  }
  if (process.env.SLICE_SANDBOX_FUND_PLATFORM !== 'true') {
    throw new Error(
      'Stripe platform liquidity is below SLICE_SANDBOX_MIN_PLATFORM_AVAILABLE_MINOR. Set SLICE_SANDBOX_FUND_PLATFORM=true with a Stripe test PaymentMethod reference to fund it explicitly.',
    );
  }
  const paymentMethod = process.env.SLICE_SANDBOX_PLATFORM_FUNDING_PAYMENT_METHOD;
  if (!paymentMethod?.startsWith('pm_')) {
    throw new Error('SLICE_SANDBOX_PLATFORM_FUNDING_PAYMENT_METHOD must be a Stripe test PaymentMethod reference.');
  }
  const neededMinor = minimumMinor - availableBefore;
  if (neededMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Requested sandbox liquidity exceeds Stripe’s safe integer amount range.');
  }
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: Number(neededMinor),
      currency: 'gbp',
      payment_method: paymentMethod,
      confirm: true,
      payment_method_types: ['card'],
      metadata: { slice_sandbox_liquidity_test: 'true' },
    },
    { idempotencyKey: `slice-sandbox-platform-liquidity:${randomUUID()}` },
  );
  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Sandbox liquidity PaymentIntent ${paymentIntent.id} finished as ${paymentIntent.status}; no available-balance claim was made.`);
  }
  const after = await stripe.balance.retrieve();
  return {
    fundedPaymentIntentId: paymentIntent.id,
    before: balanceLine(before),
    after: balanceLine(after),
  };
}

async function main() {
  requireSandbox();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const crypto = new ProviderCryptoService({
    providerEncryptionKey: process.env.PROVIDER_ENCRYPTION_KEY,
  } as AppConfig);
  const stripe = new Stripe(stripeSecretKey!, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: { name: 'Slice sandbox withdrawal trace' },
  });

  await db.$connect();
  try {
    const movement = await db.moneyMovement.findUnique({
      where: { id: movementId! },
      include: {
        cashAccount: { include: { balance: true } },
        connectPayout: {
          include: {
            connectAccount: {
              select: { id: true, externalAccountIdCiphertext: true },
            },
            balanceSnapshots: {
              orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    if (!movement || movement.type !== 'WITHDRAWAL') {
      throw new Error('SLICE_SANDBOX_MOVEMENT_ID must identify an existing withdrawal movement.');
    }
    if (movement.provider !== 'STRIPE_SANDBOX') {
      throw new Error('The selected movement is not a Stripe sandbox withdrawal.');
    }
    const connectPayout = movement.connectPayout;
    if (!connectPayout) throw new Error('No Connect payout record exists for the selected withdrawal.');

    const minimumLiquidity = BigInt(
      process.env.SLICE_SANDBOX_MIN_PLATFORM_AVAILABLE_MINOR ?? '0',
    );
    if (minimumLiquidity < 0n) {
      throw new Error('SLICE_SANDBOX_MIN_PLATFORM_AVAILABLE_MINOR must be non-negative.');
    }
    const liquidity = await ensureAvailablePlatformLiquidity(stripe, minimumLiquidity);
    const externalAccountId = crypto.decrypt(
      connectPayout.connectAccount.externalAccountIdCiphertext,
      `connect-account:${connectPayout.connectAccount.id}`,
    );
    const transferId = connectPayout.externalTransferIdCiphertext
      ? crypto.decrypt(
          connectPayout.externalTransferIdCiphertext,
          `connect-transfer:${connectPayout.id}`,
        )
      : null;
    const payoutId = connectPayout.externalPayoutIdCiphertext
      ? crypto.decrypt(
          connectPayout.externalPayoutIdCiphertext,
          `connect-payout:${connectPayout.id}`,
        )
      : null;
    const [platformNow, connectedNow, transfer, payout] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.balance.retrieve({}, { stripeAccount: externalAccountId }),
      transferId ? stripe.transfers.retrieve(transferId) : Promise.resolve(null),
      payoutId
        ? stripe.payouts.retrieve(payoutId, {}, { stripeAccount: externalAccountId })
        : Promise.resolve(null),
    ]);
    const cashBalance = movement.cashAccount.balance;
    const customerCashAfterMinor = cashBalance
      ? (movement.cashAccount.normalSide === 'CREDIT'
          ? cashBalance.postedCreditMinor - cashBalance.postedDebitMinor
          : cashBalance.postedDebitMinor - cashBalance.postedCreditMinor
        ).toString()
      : null;
    const trace = {
      testOnly: true,
      movement: {
        id: movement.id,
        status: movement.status,
        grossMinor: movement.amountMinor.toString(),
        sliceFeeMinor: movement.sliceFeeMinor.toString(),
        netProviderPayoutMinor: (movement.providerAmountMinor ?? movement.amountMinor).toString(),
        ledgerTransactionId: movement.ledgerTransactionId,
        customerCashAfterMinor,
      },
      platformLiquidity: liquidity,
      stripe: {
        platformNow: balanceLine(platformNow),
        connectedNow: balanceLine(connectedNow),
        transfer: transfer
          ? { id: nullableId(transfer), amountMinor: transfer.amount.toString(), status: transfer.reversed ? 'REVERSED' : 'SUCCEEDED' }
          : null,
        payout: payout
          ? {
              id: nullableId(payout),
              amountMinor: payout.amount.toString(),
              status: payout.status,
              arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
              failureCode: payout.failure_code ?? null,
            }
          : null,
      },
      capturedBalanceSnapshots: connectPayout.balanceSnapshots.map((snapshot) => ({
        stage: snapshot.stage,
        platform: {
          availableMinor: snapshot.platformAvailableMinor.toString(),
          pendingMinor: snapshot.platformPendingMinor.toString(),
        },
        connected: {
          availableMinor: snapshot.connectedAvailableMinor.toString(),
          pendingMinor: snapshot.connectedPendingMinor.toString(),
        },
        capturedAt: snapshot.capturedAt.toISOString(),
      })),
      reconciliation: traceStatus({
        movementStatus: movement.status,
        payoutStatus: connectPayout.status,
        ledgerTransactionId: movement.ledgerTransactionId,
      }),
    };
    process.stdout.write(`${JSON.stringify(trace)}\n`);
    if (trace.reconciliation.startsWith('FAIL')) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
