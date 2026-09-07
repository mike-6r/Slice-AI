import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BadgeCheck,
  BanknoteArrowDown,
  CalendarClock,
  CreditCard,
  CircleAlert,
  Clock3,
  Landmark,
  Layers3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Unplug,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from "@stripe/stripe-js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type {
  BankConnection,
  AccountCapability,
  ComplianceSession,
  ComplianceSummary,
  ConnectPayoutSetup,
  CardFundingOptions,
  CardFundingSession,
  FeePolicy,
  PortfolioSummary,
  WalletInsights,
  WalletInsightsPeriod,
  WalletMovementPage,
  WalletMovementType,
  WalletMovementView,
  WithdrawalPreflight,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { queryKeys } from "@/queries/keys";
import { CapabilityRequiredDialog } from "@/components/account/CapabilityRequiredDialog";
import { KpiIconTile } from "@/components/ui/KpiIconTile";
import {
  filterWalletMovements,
  formatWalletMoney,
  parseWalletGbp,
  walletAccessPresentation,
  type WalletMovementFilter,
} from "./-wallet-presentation";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet | Slice" }] }),
  component: Wallet,
});

type WalletMovementRequest = {
  action: WalletMovementType;
  amount: string;
};

type DepositRail = "BACS_DIRECT_DEBIT" | "CARD";

export function Wallet() {
  useCurrency();
  const services = useAppServices();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<WalletMovementType>("DEPOSIT");
  const [depositRail, setDepositRail] = useState<DepositRail>("BACS_DIRECT_DEBIT");
  const [movementFilter, setMovementFilter] = useState<WalletMovementFilter>("ALL");
  const [capabilityDialog, setCapabilityDialog] = useState<AccountCapability | null>(null);
  const [withdrawalReviewAmount, setWithdrawalReviewAmount] = useState<string | null>(null);
  const [recentAuthAmount, setRecentAuthAmount] = useState<string | null>(null);
  const [recentAuthPassword, setRecentAuthPassword] = useState("");
  const [cardFundingSession, setCardFundingSession] = useState<CardFundingSession | null>(null);
  const [timelineMovement, setTimelineMovement] = useState<WalletMovementView | null>(null);
  const portfolio = useQuery({
    queryKey: queryKeys.portfolio.summary,
    queryFn: services.portfolio.portfolio,
    enabled: isAuthenticated,
  });
  const compliance = useQuery({
    queryKey: queryKeys.providers.compliance,
    queryFn: services.providers.compliance,
    enabled: isAuthenticated,
  });
  const movements = useQuery({
    queryKey: queryKeys.providers.movements(),
    queryFn: () => services.providers.movements({ limit: 20 }),
    enabled: isAuthenticated,
  });
  const banks = useQuery({
    queryKey: queryKeys.providers.bankConnections,
    queryFn: services.providers.bankConnections,
    enabled: isAuthenticated,
  });
  const connectPayout = useQuery({
    queryKey: queryKeys.providers.connectPayoutSetup,
    queryFn: services.providers.connectPayoutSetup,
    enabled: isAuthenticated,
  });
  const feePolicy = useQuery({
    queryKey: queryKeys.providers.feePolicy,
    queryFn: services.providers.feePolicy,
    enabled: isAuthenticated,
  });
  const cardFundingOptions = useQuery({
    queryKey: ["providers", "card-funding-options"],
    queryFn: services.providers.cardFundingOptions,
    enabled: isAuthenticated,
  });
  const withdrawalOverview = useQuery({
    queryKey: queryKeys.providers.withdrawalPreflight(),
    queryFn: () => services.providers.withdrawalPreflight(),
    enabled: isAuthenticated,
  });
  const requestedWithdrawalMinor = parseWalletGbp(amount);
  const withdrawalPreflight = useQuery({
    queryKey: queryKeys.providers.withdrawalPreflight(requestedWithdrawalMinor ?? "0"),
    queryFn: () =>
      services.providers.withdrawalPreflight({
        amountMinor: requestedWithdrawalMinor ?? "0",
      }),
    enabled: isAuthenticated && action === "WITHDRAWAL" && Boolean(requestedWithdrawalMinor),
  });
  const capabilities = useQuery({
    queryKey: queryKeys.account.capabilities,
    queryFn: services.account.capabilities,
    enabled: isAuthenticated,
  });
  const refreshWallet = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.summary });
    void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.insights });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.compliance });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.movements() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.bankConnections });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.connectPayoutSetup });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.feePolicy });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.withdrawalPreflight() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.account.capabilities });
  };
  const verification = useMutation({
    mutationFn: services.providers.startCompliance,
    onSuccess: (result) => {
      refreshWallet();
      if (result.sessionUrl) {
        window.location.assign(result.sessionUrl);
        return;
      }
      toast.success(
        result.status === "PENDING" ? "Verification started." : "Verification status updated.",
      );
    },
  });
  const movement = useMutation({
    mutationFn: async ({
      action: requestedAction,
      amount: requestedAmount,
    }: WalletMovementRequest) => {
      const amountMinor = parseWalletGbp(requestedAmount);
      if (!amountMinor || BigInt(amountMinor) <= 0n) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "Enter a positive GBP amount with no more than two decimal places.",
        );
      }
      return requestedAction === "DEPOSIT"
        ? services.providers.createDeposit(amountMinor)
        : services.providers.createWithdrawal({
            amountMinor,
          });
    },
    onSuccess: (result) => {
      setAmount("");
      refreshWallet();
      toast.success(`${result.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} request created.`);
    },
    onError: (error, variables) => {
      if (
        variables.action === "WITHDRAWAL" &&
        error instanceof ApiError &&
        error.code === "RECENT_AUTH_REQUIRED"
      ) {
        setRecentAuthPassword("");
        setRecentAuthAmount(variables.amount);
      }
    },
  });
  const cardFunding = useMutation({
    mutationFn: async ({
      amount: requestedAmount,
      savePaymentMethod,
    }: {
      amount: string;
      savePaymentMethod: boolean;
    }) => {
      const amountMinor = parseWalletGbp(requestedAmount);
      if (!amountMinor || BigInt(amountMinor) <= 0n) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "Enter a positive GBP amount with no more than two decimal places.",
        );
      }
      return services.providers.createCardDeposit({ amountMinor, savePaymentMethod });
    },
    onSuccess: (session) => {
      setCardFundingSession(session);
      refreshWallet();
    },
  });
  const recentAuth = useMutation({
    mutationFn: (password: string) => services.repositories.account.confirmRecentAuth(password),
    onSuccess: () => {
      const retryAmount = recentAuthAmount;
      setRecentAuthAmount(null);
      setRecentAuthPassword("");
      if (retryAmount) {
        movement.mutate({ action: "WITHDRAWAL", amount: retryAmount });
      }
    },
  });

  const authRequired =
    (!isAuthenticated && !portfolio.data) ||
    (portfolio.error instanceof ApiError && portfolio.error.status === 401);
  if (authRequired) return <WalletAccessRequired />;

  return (
    <main className="wallet-page">
      <div className="page-shell wallet-shell">
        <WalletHeading />
        <WalletKpis query={portfolio} withdrawal={withdrawalOverview} />
        <section className="wallet-row wallet-row--primary" aria-label="Wallet access and actions">
          <ConnectedBankPanel
            query={banks}
            connectPayout={connectPayout}
            refreshWallet={refreshWallet}
          />
          <MoveMoneyPanel
            action={action}
            setAction={setAction}
            depositRail={depositRail}
            setDepositRail={setDepositRail}
            amount={amount}
            setAmount={setAmount}
            compliance={compliance}
            banks={banks}
            movement={movement}
            capability={capabilities.data?.capabilities.find(
              (item) =>
                item.capability === (action === "DEPOSIT" ? "DEPOSIT_FUNDS" : "WITHDRAW_FUNDS"),
            )}
            feePolicy={feePolicy}
            cardFundingOptions={cardFundingOptions.data?.card}
            cardFundingBusy={cardFunding.isPending}
            withdrawalPreflight={withdrawalPreflight}
            onCapabilityRequired={setCapabilityDialog}
            onReviewWithdrawal={setWithdrawalReviewAmount}
            onStartCardFunding={(savePaymentMethod) =>
              cardFunding.mutate({ amount, savePaymentMethod })
            }
          />
          <AccountStatusPanel
            query={compliance}
            banks={banks}
            capabilities={capabilities.data?.capabilities}
            verification={verification}
            connectPayout={connectPayout}
            onCreateConnect={services.providers.createConnectOnboarding}
          />
        </section>
        <section
          className="wallet-row wallet-row--history"
          aria-label="Wallet history and insights"
        >
          <MovementsPanel
            query={movements}
            filter={movementFilter}
            setFilter={setMovementFilter}
            onTimelineSelect={setTimelineMovement}
          />
          <div className="wallet-side-stack">
            <SettlementTimelinePanel
              portfolio={portfolio}
              compliance={compliance}
              banks={banks}
              movements={movements}
              selectedMovement={timelineMovement}
            />
            <WalletInsightsPanel />
          </div>
        </section>
        <CapabilityRequiredDialog
          decision={capabilityDialog}
          onClose={() => setCapabilityDialog(null)}
        />
        {withdrawalReviewAmount ? (
          <WithdrawalReviewDialog
            amount={withdrawalReviewAmount}
            feePolicy={feePolicy.data}
            busy={movement.isPending}
            onClose={() => setWithdrawalReviewAmount(null)}
            onConfirm={() => {
              const requestedAmount = withdrawalReviewAmount;
              setWithdrawalReviewAmount(null);
              movement.mutate({ action: "WITHDRAWAL", amount: requestedAmount });
            }}
          />
        ) : null}
        {recentAuthAmount ? (
          <RecentAuthDialog
            password={recentAuthPassword}
            busy={recentAuth.isPending || movement.isPending}
            error={recentAuth.error}
            onPasswordChange={setRecentAuthPassword}
            onClose={() => {
              if (recentAuth.isPending || movement.isPending) return;
              setRecentAuthAmount(null);
              setRecentAuthPassword("");
            }}
            onConfirm={() => recentAuth.mutate(recentAuthPassword)}
          />
        ) : null}
        {cardFundingSession ? (
          <CardFundingDialog
            session={cardFundingSession}
            onClose={() => setCardFundingSession(null)}
            onConfirmed={() => {
              setCardFundingSession(null);
              setAmount("");
              refreshWallet();
              toast.success(
                "Card payment submitted. Your Wallet updates after Stripe confirms the payment.",
              );
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function PayoutSetupPanel({
  query,
  refreshWallet,
  onCreate,
}: {
  query: UseQueryResult<ConnectPayoutSetup>;
  refreshWallet: () => void;
  onCreate: () => Promise<ConnectPayoutSetup>;
}) {
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const onboarding = useMutation({
    mutationFn: onCreate,
    onSuccess: (result) => {
      refreshWallet();
      setOnboardingUrl(result.onboardingUrl);
      if (!result.onboardingUrl) toast.error("Payout setup did not return a secure provider link.");
    },
    onError: () => toast.error("Payout setup could not be started."),
  });
  const status = query.data?.status ?? "NOT_STARTED";
  const ready = status === "READY";
  const title = ready
    ? "Payouts ready"
    : status === "NOT_STARTED"
      ? "Set up withdrawals"
      : "Finish payout setup";
  const detail = ready
    ? "Your eligible Slice cash can be withdrawn through your connected payout account."
    : "Stripe securely collects the identity and bank details required to send a withdrawal. Slice never collects those details directly.";
  return (
    <WalletPanel title={title} icon={<ArrowUpFromLine />} className="wallet-panel--payouts">
      <div className="wallet-panel__body">
        <StatusPill status={status} />
        <p className="mt-3 text-sm text-slate-600">{detail}</p>
        {!ready && onboardingUrl ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Your secure payout setup is ready to continue.
            </p>
            <a
              className="wallet-verify-button"
              href={onboardingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Continue to Stripe
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        ) : null}
        {!ready && !onboardingUrl ? (
          <button
            className="wallet-verify-button mt-4"
            type="button"
            onClick={() => onboarding.mutate()}
            disabled={onboarding.isPending || query.isLoading}
          >
            {onboarding.isPending
              ? "Opening secure setup…"
              : status === "NOT_STARTED"
                ? "Set up withdrawals"
                : "Continue setup"}
            <ArrowRight aria-hidden="true" />
          </button>
        ) : null}
        {query.isError ? <InlineError error={query.error} /> : null}
      </div>
    </WalletPanel>
  );
}

function WalletHeading() {
  return (
    <header className="wallet-heading">
      <h1>Wallet</h1>
      <p>Cash, funding, verification, and money movement infrastructure.</p>
    </header>
  );
}

function WalletKpis({
  query,
  withdrawal,
}: {
  query: UseQueryResult<PortfolioSummary>;
  withdrawal: UseQueryResult<WithdrawalPreflight>;
}) {
  if (query.isLoading) return <WalletKpiSkeletons />;
  if (query.isError || !query.data) {
    return (
      <section className="wallet-kpis wallet-kpis--error">
        <WalletPanel>
          <PanelError
            message="Unable to load wallet balances."
            retry={() => void query.refetch()}
          />
        </WalletPanel>
      </section>
    );
  }
  const cash = query.data.cash;
  return (
    <section className="wallet-kpis" aria-label="Cash summary">
      <WalletKpi
        icon={Layers3}
        label="Available to trade"
        value={formatWalletMoney(
          withdrawal.data?.tradeAvailableMinor ?? cash.tradeAvailableMinor ?? cash.availableMinor,
        )}
        detail="Available for Slice investing and trading"
        featured
      />
      <WalletKpi
        icon={Clock3}
        label="Pending deposits"
        value={formatWalletMoney(cash.riskHeldMinor ?? "0")}
        detail={
          cash.riskHeldDeposits?.find((deposit) => deposit.expectedReleaseAt)?.expectedReleaseAt
            ? "Expected after " +
              formatShortDate(
                cash.riskHeldDeposits.find((deposit) => deposit.expectedReleaseAt)!
                  .expectedReleaseAt!,
              )
            : "Recent Bacs cash held while the bank debit clears"
        }
      />
      <WalletKpi
        icon={ArrowDownToLine}
        label="Available to withdraw"
        value={formatWalletMoney(withdrawal.data?.withdrawableMinor ?? "0")}
        detail={
          withdrawal.data?.providerLiquidityStatus === "AVAILABLE"
            ? "Eligible for bank payout"
            : "Provider liquidity check required"
        }
      />
      <WalletKpi
        icon={LockKeyhole}
        label="Reserved cash"
        value={formatWalletMoney(cash.reservedMinor)}
        detail={countDetail(cash.pendingWithdrawalCount, "withdrawal", "Orders and withdrawals")}
      />
      <WalletKpi
        icon={BanknoteArrowDown}
        label="Total wallet balance"
        value={formatWalletMoney(cash.totalMinor)}
        detail="Across all cash states"
      />
    </section>
  );
}

function WalletKpi({
  icon,
  label,
  value,
  detail,
  featured = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  featured?: boolean;
}) {
  return (
    <article className={`wallet-kpi${featured ? " wallet-kpi--featured" : ""}`}>
      <KpiIconTile icon={icon} />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function countDetail(count: number | undefined, singular: string, fallback: string) {
  if (count === undefined) return fallback;
  return `${count} ${singular}${count === 1 ? "" : "s"} ${fallback}`;
}

function WalletKpiSkeletons() {
  return (
    <section className="wallet-kpis" aria-label="Loading cash summary">
      {[0, 1, 2, 3, 4].map((item) => (
        <article key={item} className="wallet-kpi wallet-kpi--loading">
          <div className="customer-skeleton size-10" />
          <div className="min-w-0 flex-1">
            <div className="customer-skeleton h-3 w-24" />
            <div className="customer-skeleton mt-3 h-7 w-32" />
            <div className="customer-skeleton mt-3 h-3 w-28" />
          </div>
        </article>
      ))}
    </section>
  );
}

function ConnectedBankPanel({
  query,
  connectPayout,
  refreshWallet,
}: {
  query: UseQueryResult<BankConnection[]>;
  connectPayout: UseQueryResult<ConnectPayoutSetup>;
  refreshWallet: () => void;
}) {
  const connectedBanks = query.data?.filter((bank) => bank.status === "CONNECTED") ?? [];
  return (
    <WalletPanel
      title="Payment methods & payouts"
      icon={<WalletCards />}
      className="wallet-panel--bank"
    >
      <div className="wallet-panel__body wallet-bank-panel-body">
        {query.isLoading ? <RowsSkeleton rows={2} /> : null}
        {query.isError ? (
          <PanelError
            message="Unable to load bank connections."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && connectedBanks.length ? (
          <ul className="wallet-banks">
            {connectedBanks.map((connection) => (
              <BankConnectionRow
                key={connection.id}
                connection={connection}
                refreshWallet={refreshWallet}
              />
            ))}
          </ul>
        ) : null}
        {!query.isLoading && !query.isError && !connectedBanks.length ? <BankEmpty /> : null}
        <BankConnectionControl hasConnected={connectedBanks.length > 0} />
        <div className="wallet-payout-method-summary">
          <div>
            <span aria-hidden="true">
              <ArrowUpFromLine />
            </span>
            <p>
              <strong>Verified payout account</strong>
              <small>
                Standard GBP bank payout only. Faster delivery is never shown unless Stripe
                explicitly returns it as eligible.
              </small>
            </p>
            <StatusPill status={connectPayout.data?.status ?? "NOT_STARTED"} />
          </div>
          <p>
            Payout account identity and bank details are collected securely by Stripe, not by
            Slice.
          </p>
        </div>
        <div className="wallet-bank-reassurance" aria-label="Bank connection safeguards">
          <span>
            <ShieldCheck />
            Secure connection
          </span>
          <span>
            <LockKeyhole />
            Encrypted provider references
          </span>
          <span>
            <BadgeCheck />
            Protected connection
          </span>
        </div>
      </div>
    </WalletPanel>
  );
}

function BankEmpty() {
  return (
    <div className="wallet-bank-empty">
      <span className="wallet-bank-empty__icon" aria-hidden="true">
        <Landmark />
      </span>
      <div>
        <strong>No UK bank method connected</strong>
        <p>Set up a Bacs Direct Debit mandate securely with Stripe to fund from your bank.</p>
      </div>
    </div>
  );
}

function BankConnectionRow({
  connection,
  refreshWallet,
}: {
  connection: BankConnection;
  refreshWallet: () => void;
}) {
  const services = useAppServices();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectStage, setDisconnectStage] = useState<"confirm" | "recent-auth" | "mfa">(
    "confirm",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<string | undefined>();
  const [mfaMethod, setMfaMethod] = useState<"TOTP" | "SMS" | null>(null);
  const [mfaPhone, setMfaPhone] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  const closeDisconnect = (force = false) => {
    if (!force && (disconnectMutation.isPending || recentAuth.isPending || challenge.isPending))
      return;
    setDisconnectOpen(false);
    setDisconnectStage("confirm");
    setConfirmed(false);
    setPassword("");
    setMfaCode("");
    setMfaChallenge(undefined);
    setMfaMethod(null);
    setMfaPhone(null);
    setFlowError(null);
  };
  const action = useMutation({
    mutationFn: () => services.providers.setDefaultBankConnection(connection.id),
    onSuccess: () => {
      refreshWallet();
      toast.success("Default funding account updated.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Bank account action failed."),
  });
  const challenge = useMutation({
    mutationFn: () => services.providers.requestBankDisconnectChallenge(connection.id),
    onSuccess: (result) => {
      setMfaMethod(result.method);
      setMfaChallenge(result.challenge ?? undefined);
      setMfaPhone(result.phone);
      setDisconnectStage("mfa");
    },
    onError: (error) =>
      setFlowError(
        error instanceof ApiError ? error.message : "Security verification is unavailable.",
      ),
  });
  const disconnectMutation = useMutation({
    mutationFn: (input: { mfaCode?: string; mfaChallenge?: string }) =>
      services.providers.disconnectBankConnection({ id: connection.id, confirmed: true, ...input }),
    onSuccess: (result) => {
      refreshWallet();
      toast.success(
        result.pendingMovementCount
          ? `Bank disconnected. ${result.pendingMovementCount} pending movement${result.pendingMovementCount === 1 ? "" : "s"} will continue safely.`
          : "Bank disconnected safely.",
      );
      closeDisconnect(true);
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setFlowError("We could not disconnect this bank safely. Please try again.");
        return;
      }
      if (error.code === "RECENT_AUTH_REQUIRED") {
        setDisconnectStage("recent-auth");
        setFlowError(null);
      } else if (error.code === "MFA_REQUIRED") {
        setFlowError(null);
        challenge.mutate();
      } else if (error.code === "BANK_DEFAULT_REPLACEMENT_REQUIRED") {
        setFlowError("Make another connected bank the default before disconnecting this one.");
      } else {
        setFlowError(error.message);
      }
    },
  });
  const recentAuth = useMutation({
    mutationFn: () => services.repositories.account.confirmRecentAuth(password),
    onSuccess: () => {
      setPassword("");
      setFlowError(null);
      disconnectMutation.mutate({
        mfaCode: mfaCode || undefined,
        mfaChallenge,
      });
    },
    onError: (error) =>
      setFlowError(error instanceof ApiError ? error.message : "Recent authentication failed."),
  });
  const beginDisconnect = () => {
    setDisconnectOpen(true);
    setDisconnectStage("confirm");
    setConfirmed(false);
    setFlowError(null);
  };
  const label = connection.institutionName ?? connection.accountName ?? "Connected account";
  return (
    <>
      <li className="wallet-bank-card">
        <span className="wallet-bank-icon">
          <Landmark aria-hidden="true" />
        </span>
        <div>
          <strong>{label}</strong>
          <p>
            {connection.accountType === "bacs_debit" ? "UK bank account" : connection.accountType}
            {connection.accountMask ? ` · •••• ${connection.accountMask}` : ""}
          </p>
        </div>
        <aside>
          <StatusPill status={connection.status} />
          <small>{connection.isDefault ? "Default funding account" : "Connected bank"}</small>
          <div className="wallet-bank-actions">
            {!connection.isDefault && connection.status === "CONNECTED" ? (
              <button type="button" onClick={() => action.mutate()} disabled={action.isPending}>
                {action.isPending ? "Updating…" : "Make default"}
              </button>
            ) : null}
            {connection.status === "CONNECTED" ? (
              <button
                type="button"
                className="wallet-bank-disconnect"
                onClick={beginDisconnect}
                disabled={disconnectMutation.isPending}
                aria-label={`Disconnect ${label}`}
              >
                <Unplug aria-hidden="true" />
                <span>Disconnect</span>
              </button>
            ) : null}
          </div>
        </aside>
        <div className="wallet-bank-card__meta">
          <span>
            <BadgeCheck aria-hidden="true" />
            {connection.accountName ?? "Account holder"}
          </span>
          <span>Funding via Bacs Direct Debit · Managed securely by Stripe</span>
        </div>
        <dl className="wallet-bank-card__facts">
          <div>
            <dt>Bank</dt>
            <dd>{label}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd>
              {connection.accountType === "bacs_debit"
                ? "Personal Current Account"
                : connection.accountType}
            </dd>
          </div>
          <div>
            <dt>Connected on</dt>
            <dd>{formatShortDate(connection.updatedAt)}</dd>
          </div>
        </dl>
      </li>
      {disconnectOpen ? (
        <BankDisconnectDialog
          label={label}
          mask={connection.accountMask}
          stage={disconnectStage}
          confirmed={confirmed}
          setConfirmed={setConfirmed}
          password={password}
          setPassword={setPassword}
          mfaCode={mfaCode}
          setMfaCode={setMfaCode}
          mfaMethod={mfaMethod}
          mfaPhone={mfaPhone}
          flowError={
            flowError ?? (challenge.error instanceof ApiError ? challenge.error.message : null)
          }
          busy={disconnectMutation.isPending || recentAuth.isPending || challenge.isPending}
          onClose={closeDisconnect}
          onConfirm={() => disconnectMutation.mutate({})}
          onRecentAuth={() => recentAuth.mutate()}
          onMfa={() => disconnectMutation.mutate({ mfaCode, mfaChallenge })}
        />
      ) : null}
    </>
  );
}

function BankDisconnectDialog({
  label,
  mask,
  stage,
  confirmed,
  setConfirmed,
  password,
  setPassword,
  mfaCode,
  setMfaCode,
  mfaMethod,
  mfaPhone,
  flowError,
  busy,
  onClose,
  onConfirm,
  onRecentAuth,
  onMfa,
}: {
  label: string;
  mask?: string | null;
  stage: "confirm" | "recent-auth" | "mfa";
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  password: string;
  setPassword: (value: string) => void;
  mfaCode: string;
  setMfaCode: (value: string) => void;
  mfaMethod: "TOTP" | "SMS" | null;
  mfaPhone: string | null;
  flowError: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRecentAuth: () => void;
  onMfa: () => void;
}) {
  return (
    <div className="wallet-bank-dialog-backdrop" role="presentation">
      <section
        className="wallet-bank-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-disconnect-title"
      >
        <header>
          <div>
            <p className="page-kicker">Bank security</p>
            <h2 id="bank-disconnect-title">
              {stage === "confirm"
                ? "Disconnect this bank account?"
                : stage === "recent-auth"
                  ? "Confirm it’s really you"
                  : "Verify this bank change"}
            </h2>
          </div>
          <button
            type="button"
            className="wallet-bank-dialog__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <p className="wallet-bank-dialog__account">
          {label} {mask ? `· •••• ${mask}` : ""}
        </p>
        {stage === "confirm" ? (
          <>
            <p className="wallet-bank-dialog__intro">
              Disconnecting removes this account from new deposits. Slice keeps your movement
              history safe and does not cancel anything already processing.
            </p>
            <ul className="wallet-bank-dialog__consequences">
              <li>No new deposits can use this account.</li>
              <li>Pending deposits continue to settle normally.</li>
              <li>Withdrawals and payouts are not cancelled.</li>
              <li>You’ll need another verified bank before depositing again.</li>
            </ul>
            <label className="wallet-bank-dialog__check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>I understand these consequences and want to disconnect this bank.</span>
            </label>
            {flowError ? <p className="wallet-bank-dialog__error">{flowError}</p> : null}
            <footer>
              <button
                type="button"
                className="wallet-bank-dialog__secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wallet-bank-dialog__danger"
                onClick={onConfirm}
                disabled={!confirmed || busy}
              >
                {busy ? "Checking…" : "Continue"}
              </button>
            </footer>
          </>
        ) : null}
        {stage === "recent-auth" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRecentAuth();
            }}
          >
            <p className="wallet-bank-dialog__intro">
              For your protection, sign in again before changing a connected bank account.
            </p>
            <label className="wallet-bank-dialog__field">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                required
              />
            </label>
            {flowError ? <p className="wallet-bank-dialog__error">{flowError}</p> : null}
            <footer>
              <button
                type="button"
                className="wallet-bank-dialog__secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="wallet-bank-dialog__danger"
                disabled={!password || busy}
              >
                {busy ? "Checking…" : "Confirm identity"}
              </button>
            </footer>
          </form>
        ) : null}
        {stage === "mfa" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onMfa();
            }}
          >
            <p className="wallet-bank-dialog__intro">
              {mfaMethod === "SMS"
                ? `Enter the security code sent to ${mfaPhone ?? "your verified phone"}.`
                : "Enter the current code from your authenticator app."}
            </p>
            <label className="wallet-bank-dialog__field">
              {mfaMethod === "SMS" ? "SMS security code" : "Authenticator code"}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                autoFocus
                required
              />
            </label>
            {flowError ? <p className="wallet-bank-dialog__error">{flowError}</p> : null}
            <footer>
              <button
                type="button"
                className="wallet-bank-dialog__secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="wallet-bank-dialog__danger"
                disabled={!mfaCode || busy}
              >
                {busy ? "Verifying…" : "Verify and disconnect"}
              </button>
            </footer>
          </form>
        ) : null}
      </section>
    </div>
  );
}

function MoveMoneyPanel({
  action,
  setAction,
  depositRail,
  setDepositRail,
  amount,
  setAmount,
  compliance,
  banks,
  movement,
  capability,
  feePolicy,
  cardFundingOptions,
  cardFundingBusy,
  withdrawalPreflight,
  onCapabilityRequired,
  onReviewWithdrawal,
  onStartCardFunding,
}: {
  action: WalletMovementType;
  setAction: (value: WalletMovementType) => void;
  depositRail: DepositRail;
  setDepositRail: (value: DepositRail) => void;
  amount: string;
  setAmount: (value: string) => void;
  compliance: UseQueryResult<ComplianceSummary>;
  banks: UseQueryResult<BankConnection[]>;
  movement: ReturnType<typeof useMutation<WalletMovementView, Error, WalletMovementRequest>>;
  capability: AccountCapability | undefined;
  feePolicy: UseQueryResult<FeePolicy>;
  cardFundingOptions: CardFundingOptions | undefined;
  cardFundingBusy: boolean;
  withdrawalPreflight: UseQueryResult<WithdrawalPreflight>;
  onCapabilityRequired: (decision: AccountCapability) => void;
  onReviewWithdrawal: (amount: string) => void;
  onStartCardFunding: (savePaymentMethod: boolean) => void;
}) {
  const [savePaymentMethod, setSavePaymentMethod] = useState(false);
  const providerReady = compliance.data?.status === "APPROVED";
  const bankAvailable = Boolean(banks.data?.some((bank) => bank.status === "CONNECTED"));
  const isCardDeposit = action === "DEPOSIT" && depositRail === "CARD";
  const cardAvailable = cardFundingOptions?.available === true;
  const capabilityBlocked = Boolean(capability && !capability.allowed && !isCardDeposit);
  const domainBlocked =
    !capabilityBlocked &&
    (!providerReady ||
      (action === "DEPOSIT" && !isCardDeposit && !bankAvailable) ||
      (isCardDeposit && !cardAvailable));
  const disabledReason =
    capability && !capability.allowed
      ? isCardDeposit
        ? !providerReady
          ? "Complete verification to continue."
          : !cardAvailable
            ? (cardFundingOptions?.reason ?? "Card funding is currently unavailable.")
            : null
        : capabilityInlineReason(capability)
      : !providerReady
        ? "Complete verification to continue."
        : action === "DEPOSIT" && !isCardDeposit && !bankAvailable
          ? "Set up a UK bank mandate before requesting a deposit."
          : isCardDeposit && !cardAvailable
            ? (cardFundingOptions?.reason ?? "Card funding is currently unavailable.")
          : null;
  const requestedAmountMinor = parseWalletGbp(amount);
  const withdrawalBlocked =
    action === "WITHDRAWAL" &&
    Boolean(requestedAmountMinor) &&
    (withdrawalPreflight.isError ||
      withdrawalPreflight.isLoading ||
      withdrawalPreflight.data?.customerEligibilityStatus !== "AVAILABLE" ||
      withdrawalPreflight.data?.providerLiquidityStatus !== "AVAILABLE" ||
      BigInt(withdrawalPreflight.data?.withdrawableMinor ?? "0") <
        BigInt(requestedAmountMinor ?? "0"));
  const withdrawalBlockReason =
    action !== "WITHDRAWAL" || !requestedAmountMinor
      ? null
      : withdrawalPreflight.isError
        ? "We couldn't verify payout liquidity. Try again shortly."
        : withdrawalPreflight.isLoading
          ? "Checking provider settlement and payout liquidity…"
          : withdrawalPreflight.data?.customerEligibilityStatus === "MATURITY_PENDING"
            ? "Funds are settling. Expected withdrawal availability: " +
              formatShortDate(withdrawalPreflight.data.nextAvailabilityAt)
            : withdrawalPreflight.data?.providerLiquidityStatus !== "AVAILABLE"
              ? "Bank withdrawals are temporarily unavailable while provider settlement completes" +
                (withdrawalPreflight.data?.nextAvailabilityAt
                  ? "; expected after " +
                    formatShortDate(withdrawalPreflight.data.nextAvailabilityAt)
                  : ".")
              : "The requested amount is above your current withdrawal eligibility.";
  return (
    <WalletPanel title="Move money" icon={<ArrowDownToLine />} className="wallet-panel--move">
      <div className="wallet-panel__body">
        <div className="wallet-move-tabs" role="tablist" aria-label="Money movement type">
          {(["DEPOSIT", "WITHDRAWAL"] as const).map((type) => (
            <button
              key={type}
              role="tab"
              aria-selected={action === type}
              type="button"
              className={action === type ? "is-active" : ""}
              onClick={() => setAction(type)}
            >
              {type === "DEPOSIT" ? "Deposit" : "Withdraw"}
            </button>
          ))}
        </div>
        {action === "DEPOSIT" ? (
          <div className="wallet-funding-rails" role="radiogroup" aria-label="Funding method">
            <button
              type="button"
              role="radio"
              aria-checked={depositRail === "BACS_DIRECT_DEBIT"}
              className={depositRail === "BACS_DIRECT_DEBIT" ? "is-active" : ""}
              onClick={() => setDepositRail("BACS_DIRECT_DEBIT")}
            >
              <Landmark aria-hidden="true" />
              <span>
                <strong>UK bank</strong>
                <small>Free · Bacs Direct Debit</small>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={depositRail === "CARD"}
              className={depositRail === "CARD" ? "is-active" : ""}
              onClick={() => setDepositRail("CARD")}
              disabled={cardFundingOptions?.available === false}
            >
              <CreditCard aria-hidden="true" />
              <span>
                <strong>Debit or credit card</strong>
                <small>
                  {cardFundingOptions?.available
                    ? "Secure checkout · Stripe"
                    : "Unavailable in this environment"}
                </small>
              </span>
            </button>
          </div>
        ) : null}
        <form
          className="wallet-move-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (capability && !capability.allowed && !isCardDeposit) {
              onCapabilityRequired(capability);
              return;
            }
            if (domainBlocked) return;
            if (action === "WITHDRAWAL") {
              const amountMinor = parseWalletGbp(amount);
              if (!amountMinor || BigInt(amountMinor) <= 0n) {
                movement.mutate({ action: "WITHDRAWAL", amount });
                return;
              }
              onReviewWithdrawal(amount);
              return;
            }
            if (isCardDeposit) {
              onStartCardFunding(savePaymentMethod);
              return;
            }
            movement.mutate({ action: "DEPOSIT", amount });
          }}
        >
          <label>
            Amount (GBP)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="£0.00"
            />
          </label>
          {action === "DEPOSIT" ? (
            <dl className="wallet-move-terms">
              <div>
                <dt>Est. arrival</dt>
                <dd>{isCardDeposit ? "After Stripe confirms" : "1–2 business days"}</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd>{isCardDeposit ? "Shown before you confirm" : "FREE"}</dd>
              </div>
              <div>
                <dt>Min. deposit</dt>
                <dd>£1.00</dd>
              </div>
              <div>
                <dt>Max. deposit</dt>
                <dd>{isCardDeposit ? "Set by your card issuer" : "£25,000.00"}</dd>
              </div>
            </dl>
          ) : null}
          {action === "WITHDRAWAL" ? (
            <p>
              Withdrawals use your verified payout account. Slice does not collect bank details in
              this form, and eligible cash remains reserved until the provider confirms the payout.
            </p>
          ) : isCardDeposit ? (
            <>
              <p>
                Your card details and any 3D Secure check are handled by Stripe. Slice receives
                only the provider payment outcome, never your card number or security code.
              </p>
              <label className="wallet-card-save">
                <input
                  type="checkbox"
                  checked={savePaymentMethod}
                  onChange={(event) => setSavePaymentMethod(event.target.checked)}
                />
                <span>Save this card with Stripe for a future on-session payment.</span>
              </label>
            </>
          ) : (
            <p>
              Bacs deposits can remain held while the bank debit clears. Held cash is visible in
              your total, but cannot be used to buy or withdraw until Slice&apos;s configured risk
              policy releases it.
            </p>
          )}
          {feePolicy.data && action === "WITHDRAWAL" && parseWalletGbp(amount) ? (
            <p className="wallet-move-fee">
              You send: {formatWalletMoney(parseWalletGbp(amount)!)}
              {" · "}You receive: {formatWalletMoney(withdrawalNetMinor(feePolicy.data, amount))}
            </p>
          ) : null}
          {feePolicy.data ? (
            <p className="wallet-move-fee">
              Slice fee: {formatMovementFee(feePolicy.data, action, amount)}
              {(
                action === "DEPOSIT"
                  ? feePolicy.data.deposit.providerFeeSeparate
                  : feePolicy.data.withdrawal.providerFeeSeparate
              )
                ? " Provider fees, if any, are separate from Slice fees."
                : ""}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              domainBlocked ||
              withdrawalBlocked ||
              movement.isPending ||
              cardFundingBusy
            }
          >
            {movement.isPending || cardFundingBusy
              ? "Submitting…"
              : action === "DEPOSIT"
                ? amount
                  ? isCardDeposit
                    ? `Continue to secure card payment`
                    : `Deposit ${formatWalletMoney(parseWalletGbp(amount) ?? "0")}`
                  : "Deposit"
                : "Request withdrawal"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
        <p
          className={`${disabledReason ? "wallet-move-note is-locked" : "wallet-move-note"} wallet-move-security-note`}
        >
          {disabledReason ??
            withdrawalBlockReason ??
            (action === "DEPOSIT"
              ? isCardDeposit
                ? "Your card payment remains pending until Stripe sends a verified confirmation."
                : "Deposits are protected by Stripe and our bank partners."
              : "Your request will appear in wallet history once it is accepted.")}
        </p>
        {movement.error ? <InlineError error={movement.error} /> : null}
        {cardFundingBusy ? <p className="wallet-move-note">Preparing Stripe’s secure payment form…</p> : null}
        {movement.data ? (
          <p className="wallet-move-success">
            {movement.data.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} request created —{" "}
            {friendlyStatus(movement.data.status)}.
          </p>
        ) : null}
      </div>
    </WalletPanel>
  );
}

function WithdrawalReviewDialog({
  amount,
  feePolicy,
  busy,
  onClose,
  onConfirm,
}: {
  amount: string;
  feePolicy: FeePolicy | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const amountMinor = parseWalletGbp(amount);
  const feeMinor =
    feePolicy && amountMinor
      ? feeMinorForPolicy(amountMinor, feePolicy.withdrawal.sliceFeeBps)
      : null;
  const netMinor = feePolicy && amountMinor ? withdrawalNetMinor(feePolicy, amount) : null;
  const canConfirm = Boolean(feePolicy && amountMinor && feeMinor !== null && netMinor !== null);
  return (
    <div className="wallet-bank-dialog-backdrop" role="presentation">
      <section
        className="wallet-bank-dialog wallet-withdrawal-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdrawal-review-title"
      >
        <header>
          <div>
            <p className="page-kicker">Review withdrawal</p>
            <h2 id="withdrawal-review-title">Check the details before you continue</h2>
          </div>
          <button
            type="button"
            className="wallet-bank-dialog__close"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </header>
        <p className="wallet-bank-dialog__intro">
          Your withdrawal will be sent in GBP to your verified Stripe payout account. Slice will
          reserve the gross amount until the provider confirms the payout.
        </p>
        <dl className="wallet-withdrawal-review__summary">
          <div>
            <dt>Withdrawal amount</dt>
            <dd>{amountMinor ? formatWalletMoney(amountMinor) : "—"}</dd>
          </div>
          <div>
            <dt>Slice fee</dt>
            <dd>{feeMinor !== null ? formatWalletMoney(feeMinor) : "Loading…"}</dd>
          </div>
          <div>
            <dt>Estimated payout</dt>
            <dd>{netMinor !== null ? formatWalletMoney(netMinor) : "Loading…"}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>GBP</dd>
          </div>
        </dl>
        <p className="wallet-bank-dialog__intro">
          The exact fee is calculated by Slice’s GBP withdrawal policy. Provider fees, if any, are
          separate.
        </p>
        <footer>
          <button
            type="button"
            className="wallet-bank-dialog__secondary"
            onClick={onClose}
            disabled={busy}
          >
            Back
          </button>
          <button
            type="button"
            className="wallet-bank-dialog__danger"
            onClick={onConfirm}
            disabled={!canConfirm || busy}
          >
            {busy ? "Submitting…" : "Request withdrawal"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CardFundingDialog({
  session,
  onClose,
  onConfirmed,
}: {
  session: CardFundingSession;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);
    void (async () => {
      const stripe = await loadStripe(session.cardFunding.publishableKey);
      if (!active) return;
      if (!stripe || !mountRef.current) {
        setError("Stripe’s secure card form could not be loaded. Please try again.");
        return;
      }
      const elements = stripe.elements({
        clientSecret: session.cardFunding.clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#27d9b0",
            colorBackground: "#0a151a",
            colorText: "#e8f4f1",
            colorDanger: "#ff7f89",
            borderRadius: "6px",
          },
        },
      });
      const paymentElement = elements.create("payment", { layout: "tabs" });
      paymentElement.mount(mountRef.current);
      stripeRef.current = stripe;
      elementsRef.current = elements;
      paymentElementRef.current = paymentElement;
      setReady(true);
    })();
    return () => {
      active = false;
      paymentElementRef.current?.destroy();
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [session.cardFunding.clientSecret, session.cardFunding.publishableKey]);

  const confirm = async () => {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: new URL("/wallet?cardFunding=return", window.location.origin).toString(),
        },
        redirect: "if_required",
      });
      if (result.error) {
        setError(
          "Stripe could not confirm this card payment. Check the card details or try another card.",
        );
        return;
      }
      if (
        result.paymentIntent?.status === "succeeded" ||
        result.paymentIntent?.status === "processing"
      ) {
        onConfirmed();
        return;
      }
      setError("Complete any required bank authentication to finish this card payment.");
    } catch {
      setError("Stripe could not confirm this card payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wallet-bank-dialog-backdrop" role="presentation">
      <section
        className="wallet-bank-dialog wallet-card-funding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-funding-title"
      >
        <header>
          <div>
            <p className="page-kicker">Secure card payment</p>
            <h2 id="card-funding-title">Fund your Wallet with Stripe</h2>
          </div>
          <button
            type="button"
            className="wallet-bank-dialog__close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close secure card payment"
          >
            ×
          </button>
        </header>
        <div className="wallet-card-funding-summary">
          <span>Amount</span>
          <strong>{formatWalletMoney(session.movement.amountMinor)}</strong>
          <small>
            {session.movement.reference ?? `WLT-${session.movement.id.slice(0, 8).toUpperCase()}`}
          </small>
        </div>
        <p className="wallet-bank-dialog__intro">
          Card details and any 3D Secure step are handled directly by Stripe. Slice does not see
          or store your card number or CVC.
        </p>
        <div ref={mountRef} className="wallet-stripe-payment-element" aria-live="polite">
          {!ready ? <span>Loading Stripe’s secure form…</span> : null}
        </div>
        {error ? <p className="wallet-bank-dialog__error">{error}</p> : null}
        <footer>
          <button
            type="button"
            className="wallet-bank-dialog__secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="wallet-bank-dialog__danger"
            onClick={() => void confirm()}
            disabled={!ready || submitting}
          >
            {submitting ? "Confirming…" : `Pay ${formatWalletMoney(session.movement.amountMinor)}`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function RecentAuthDialog({
  password,
  busy,
  error,
  onPasswordChange,
  onClose,
  onConfirm,
}: {
  password: string;
  busy: boolean;
  error: unknown;
  onPasswordChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="wallet-bank-dialog-backdrop" role="presentation">
      <section
        className="wallet-bank-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdrawal-auth-title"
      >
        <header>
          <div>
            <p className="page-kicker">Security check</p>
            <h2 id="withdrawal-auth-title">Confirm it’s really you</h2>
          </div>
          <button
            type="button"
            className="wallet-bank-dialog__close"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <p className="wallet-bank-dialog__intro">
            For your protection, sign in again before we request this withdrawal. Your password is
            sent securely to Slice and is not stored in the withdrawal request.
          </p>
          <label className="wallet-bank-dialog__field">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoFocus
              required
            />
          </label>
          {error ? (
            <p className="wallet-bank-dialog__error">
              {error instanceof ApiError ? error.message : "Recent authentication failed."}
            </p>
          ) : null}
          <footer>
            <button
              type="button"
              className="wallet-bank-dialog__secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="wallet-bank-dialog__danger"
              disabled={!password || busy}
            >
              {busy ? "Checking…" : "Confirm identity"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function capabilityInlineReason(capability: AccountCapability) {
  switch (capability.reason) {
    case "IDENTITY_VERIFICATION_REQUIRED":
      return "Identity verification required.";
    case "COMPLIANCE_REVIEW_REQUIRED":
      return "Verification is under review.";
    case "BANK_ACCOUNT_REQUIRED":
      return "Connect a UK bank account before requesting a deposit.";
    case "PAYOUT_ACCOUNT_REQUIRED":
      return "Complete payout setup before withdrawing available cash.";
    case "PAYOUT_ACCOUNT_REVIEW_REQUIRED":
      return "Payout setup is still under review.";
    case "COLLECTOR_PAYOUTS_REQUIRED":
      return "Complete payout setup before requesting a withdrawal.";
    case "NO_WITHDRAWABLE_BALANCE":
      return "No funds are available to withdraw. Settled cash reserved for orders is excluded.";
    case "DEPOSITS_UNAVAILABLE":
      return "Deposits are temporarily unavailable in this environment.";
    case "WITHDRAWALS_UNAVAILABLE":
      return "Withdrawals are temporarily unavailable in this environment.";
    case "TRADING_UNAVAILABLE":
      return "Trading is temporarily unavailable in this environment.";
    default:
      return "Complete the required account step to continue.";
  }
}

function AccountStatusPanel({
  query,
  banks,
  capabilities,
  verification,
  connectPayout,
  onCreateConnect,
}: {
  query: UseQueryResult<ComplianceSummary>;
  banks: UseQueryResult<BankConnection[]>;
  capabilities?: AccountCapability[];
  verification: UseMutationResult<ComplianceSession, Error, void>;
  connectPayout: UseQueryResult<ConnectPayoutSetup>;
  onCreateConnect: () => Promise<ConnectPayoutSetup>;
}) {
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [onboardingError, setOnboardingError] = useState<Error | null>(null);
  const connected = banks.data?.some((bank) => bank.status === "CONNECTED") ?? false;
  const capabilityAccess = capabilities?.filter(
    (item) => item.capability === "DEPOSIT_FUNDS" || item.capability === "WITHDRAW_FUNDS",
  );
  const access = capabilityAccess?.length
    ? capabilityAccess.some((item) => !item.allowed)
      ? {
          status: "RESTRICTED",
          detail: "Complete the required account steps before moving money",
        }
      : {
          status: "AVAILABLE",
          detail: "Deposit and withdrawal requests are available",
        }
    : walletAccessPresentation(query.data?.status, connected);
  return (
    <WalletPanel
      title="Verification & account status"
      icon={<ShieldCheck />}
      className="wallet-panel--status"
    >
      <div className="wallet-panel__body">
        {query.isLoading || banks.isLoading ? <RowsSkeleton rows={3} /> : null}
        {query.isError || !query.data ? (
          <PanelError
            message="Unable to load verification status."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !banks.isLoading && !query.isError && query.data ? (
          <>
            <dl className="wallet-provider-status">
              <StatusRow
                icon={<BadgeCheck />}
                label="Identity verification"
                detail={complianceDetail(query.data.status)}
                status={query.data.status}
              />
              <StatusRow
                icon={<Landmark />}
                label="Bank connection"
                detail={
                  connected ? "Ready for GBP deposits" : "Set up a UK bank mandate to add GBP funds"
                }
                status={connected ? "CONNECTED" : "NOT_CONNECTED"}
              />
              <StatusRow
                icon={<LockKeyhole />}
                label="Wallet access"
                detail={access.detail}
                status={access.status}
              />
              <StatusRow
                icon={<ArrowUpFromLine />}
                label="Payout readiness"
                detail={
                  connectPayout.isLoading
                    ? "Loading payout status"
                    : payoutDetail(connectPayout.data?.status)
                }
                status={
                  connectPayout.isLoading
                    ? "LOADING"
                    : (connectPayout.data?.status ?? "UNAVAILABLE")
                }
              />
            </dl>
            {query.data.status !== "APPROVED" &&
            query.data.status !== "REVIEW" &&
            query.data.capability !== "NOT_CONFIGURED" &&
            query.data.capability !== "NOT_REQUIRED_IN_CURRENT_BETA" ? (
              <button
                type="button"
                className="wallet-verify-button"
                disabled={verification.isPending}
                onClick={() => verification.mutate()}
              >
                <ShieldCheck aria-hidden="true" />
                {verification.isPending
                  ? "Opening verification…"
                  : query.data.status === "PENDING"
                    ? "Continue verification"
                    : query.data.status === "REJECTED"
                      ? "Try verification again"
                      : "Start verification"}
                <ArrowRight aria-hidden="true" />
              </button>
            ) : null}
            {verification.error ? <InlineError error={verification.error} /> : null}
            {connectPayout.data && connectPayout.data.status !== "READY" ? (
              <>
                <p className="wallet-payout-setup-copy">
                  Complete a one-time payout setup with Stripe so we can send withdrawals to your
                  bank.
                </p>
                <p className="wallet-payout-prefill-note">
                  We’ll reuse the verified account information we already have where possible.
                  Stripe may still ask you to review or confirm certain details and your payout
                  bank.
                </p>
                {onboardingUrl ? (
                  <div className="wallet-payout-handoff">
                    <p className="wallet-payout-handoff__message">
                      Your secure payout setup is ready to continue.
                    </p>
                    <a
                      className="wallet-verify-button wallet-verify-button--secondary"
                      href={onboardingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ArrowUpFromLine aria-hidden="true" />
                      Continue to Stripe
                      <ArrowRight aria-hidden="true" />
                    </a>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="wallet-verify-button wallet-verify-button--secondary"
                    disabled={onboardingPending || connectPayout.isFetching}
                    onClick={() => {
                      setOnboardingPending(true);
                      setOnboardingError(null);
                      void onCreateConnect()
                        .then((result) => {
                          setOnboardingUrl(result.onboardingUrl);
                          if (!result.onboardingUrl) {
                            toast.error("Payout setup did not return a secure provider link.");
                          }
                          return connectPayout.refetch();
                        })
                        .catch((error: unknown) => {
                          const normalized =
                            error instanceof Error
                              ? error
                              : new Error("Unable to open payout setup.");
                          setOnboardingError(normalized);
                          toast.error(normalized.message);
                        })
                        .finally(() => setOnboardingPending(false));
                    }}
                  >
                    <ArrowUpFromLine aria-hidden="true" />
                    {onboardingPending || connectPayout.isFetching
                      ? "Preparing payout setup…"
                      : connectPayout.data.status === "RESTRICTED"
                        ? "Update payout details"
                        : "Set up withdrawals"}
                    <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </>
            ) : null}
            {onboardingError ? <InlineError error={onboardingError} /> : null}
          </>
        ) : null}
      </div>
    </WalletPanel>
  );
}

function StatusRow({
  icon,
  label,
  detail,
  status,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  status: string;
}) {
  return (
    <div>
      <dt>
        <span aria-hidden="true">{icon}</span>
        <span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
      </dt>
      <dd>
        <StatusPill status={status} />
        <ArrowRight aria-hidden="true" />
      </dd>
    </div>
  );
}

function MovementsPanel({
  query,
  filter,
  setFilter,
  onTimelineSelect,
}: {
  query: UseQueryResult<WalletMovementPage>;
  filter: WalletMovementFilter;
  setFilter: (value: WalletMovementFilter) => void;
  onTimelineSelect: (item: WalletMovementView) => void;
}) {
  const items = filterWalletMovements(query.data?.items ?? [], filter);
  const [selected, setSelected] = useState<WalletMovementView | null>(null);
  return (
    <WalletPanel
      title="Movement history"
      icon={<ArrowDownToLine />}
      className="wallet-panel--movements"
      action={<span>{query.data?.items.length ? `${query.data.items.length} recent` : ""}</span>}
    >
      <div className="wallet-panel__body">
        <div
          className="wallet-movement-filters"
          role="tablist"
          aria-label="Wallet movement categories"
        >
          {(["ALL", "DEPOSIT", "WITHDRAWAL"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={filter === type}
              className={filter === type ? "is-active" : ""}
              onClick={() => setFilter(type)}
            >
              {type === "ALL" ? "All" : type === "DEPOSIT" ? "Deposits" : "Withdrawals"}
            </button>
          ))}
        </div>
        {query.isLoading ? <RowsSkeleton rows={4} /> : null}
        {query.isError ? (
          <PanelError
            message="Unable to load money movements."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && items.length ? (
          <div
            className="wallet-table-wrap"
            tabIndex={0}
            aria-label="Money movements; scroll horizontally on smaller screens"
          >
            <table className="wallet-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Source / destination</th>
                  <th>Reference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <MovementRow
                    key={item.id}
                    item={item}
                    onSelect={(selectedItem) => {
                      setSelected(selectedItem);
                      onTimelineSelect(selectedItem);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!query.isLoading && !query.isError && !items.length ? (
          <PanelEmpty
            icon={<Clock3 />}
            title="No movements yet"
            detail="Your deposits and withdrawals will appear here."
            action={
              <Link to="/how-it-works">
                Learn how it works <ArrowRight aria-hidden="true" />
              </Link>
            }
          />
        ) : null}
      </div>
      {selected ? <MovementDetail item={selected} onClose={() => setSelected(null)} /> : null}
    </WalletPanel>
  );
}

function MovementRow({
  item,
  onSelect,
}: {
  item: WalletMovementView;
  onSelect: (item: WalletMovementView) => void;
}) {
  return (
    <tr className="wallet-movement-row" onClick={() => onSelect(item)}>
      <td>{formatDate(item.createdAt)}</td>
      <td>
        <span className={`wallet-movement-icon is-${item.type.toLowerCase()}`}>
          {item.type === "DEPOSIT" ? (
            <ArrowDownToLine aria-hidden="true" />
          ) : (
            <ArrowUpFromLine aria-hidden="true" />
          )}
        </span>
        {item.type === "DEPOSIT" ? "Deposit" : "Withdrawal"}
      </td>
      <td className={item.type === "DEPOSIT" ? "is-credit" : "is-debit"}>
        {item.type === "DEPOSIT" ? "+" : "-"}
        {formatWalletMoney(item.amountMinor)}
      </td>
      <td>{item.sourceLabel ?? "GBP wallet"}</td>
      <td>
        <button type="button" className="wallet-reference" onClick={() => onSelect(item)}>
          {item.reference ?? `WLT-${item.id.slice(0, 8).toUpperCase()}`}
        </button>
      </td>
      <td>
        <StatusPill status={item.status} />
      </td>
    </tr>
  );
}

function WalletInsightsPanel() {
  const services = useAppServices();
  const [period, setPeriod] = useState<WalletInsightsPeriod>("30d");
  const insights = useQuery({
    queryKey: [...queryKeys.portfolio.insights, period],
    queryFn: () => services.portfolio.walletInsights({ period }),
  });
  return (
    <WalletPanel
      title="Wallet insights"
      icon={<Layers3 />}
      className="wallet-panel--insights"
      action={
        <label className="wallet-insights-period">
          <span className="sr-only">Insight period</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as WalletInsightsPeriod)}
          >
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
          </select>
        </label>
      }
    >
      {" "}
      <div className="wallet-panel__body">
        {insights.isLoading ? <RowsSkeleton rows={2} /> : null}
        {insights.isError ? (
          <PanelError
            message="Unable to load wallet insights."
            retry={() => void insights.refetch()}
          />
        ) : null}
        {!insights.isLoading &&
        !insights.isError &&
        insights.data &&
        hasSettledWalletData(insights.data) ? (
          <dl className="wallet-insight-summary">
            <Insight
              label="Total deposits"
              value={formatWalletMoney(insights.data.totalDepositsMinor)}
              change={insightChange(insights.data, "totalDepositsMinor", period)}
            />
            <Insight
              label="Total withdrawals"
              value={formatWalletMoney(insights.data.totalWithdrawalsMinor)}
              change={insightChange(insights.data, "totalWithdrawalsMinor", period)}
            />
            <Insight
              label="Net movement"
              value={formatWalletMoney(insights.data.netMovementMinor)}
              change={insightChange(insights.data, "netMovementMinor", period)}
            />
            <Insight
              label="Settled movements"
              value={String(insights.data.settledMovementCount ?? 0)}
              change={
                insights.data.settledMovementCount ? "100% completed" : "No settled movements"
              }
            />
          </dl>
        ) : null}
        {!insights.isLoading &&
        !insights.isError &&
        insights.data &&
        !hasSettledWalletData(insights.data) ? (
          <PanelEmpty
            icon={<Layers3 />}
            title="No settled movement data yet"
            detail="Settled deposits and withdrawals will appear here for the selected period."
          />
        ) : null}
      </div>
    </WalletPanel>
  );
}

function MovementDetail({ item, onClose }: { item: WalletMovementView; onClose: () => void }) {
  const services = useAppServices();
  const detail = useQuery({
    queryKey: ["providers", "movement", item.id],
    queryFn: () => services.providers.movement(item.id),
  });
  const movement = detail.data ?? item;
  return (
    <div className="wallet-detail-backdrop" role="presentation" onClick={onClose}>
      <section
        className="wallet-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="wallet-detail__head">
          <div>
            <p className="page-kicker">Movement detail</p>
            <h3 id="movement-detail-title">
              {movement.type === "DEPOSIT" ? "Deposit" : "Withdrawal"}
            </h3>
          </div>
          <button type="button" aria-label="Close movement detail" onClick={onClose}>
            ×
          </button>
        </div>
        <dl className="wallet-detail__grid">
          <div>
            <dt>Amount</dt>
            <dd>
              {movement.type === "DEPOSIT" ? "+" : "−"}
              {formatWalletMoney(movement.amountMinor)}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusPill status={movement.status} />
            </dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{movement.reference ?? `WLT-${movement.id.slice(0, 8).toUpperCase()}`}</dd>
          </div>
          <div>
            <dt>Requested</dt>
            <dd>{formatDate(movement.createdAt)}</dd>
          </div>
          <div>
            <dt>Source / destination</dt>
            <dd>{movement.sourceLabel ?? "GBP wallet"}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>GBP</dd>
          </div>
        </dl>
        <div className="wallet-detail__sections">
          <section>
            <p className="wallet-detail__section-label">Funding and settlement</p>
            <dl className="wallet-detail__facts">
              <div>
                <dt>Method</dt>
                <dd>{movementRailLabel(movement.rail, movement.type)}</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>{movement.availability?.label ?? "Waiting for provider confirmation"}</dd>
              </div>
              {movement.availability?.availableOn ? (
                <div>
                  <dt>Provider availability</dt>
                  <dd>{formatDate(movement.availability.availableOn)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Provider</dt>
                <dd>
                  {movement.provider
                    ? `${movement.provider.name} · ${movement.provider.status}`
                    : "Provider status pending"}
                </dd>
              </div>
            </dl>
          </section>
          <section>
            <p className="wallet-detail__section-label">Fees and payout</p>
            <dl className="wallet-detail__facts">
              <div>
                <dt>Slice fee</dt>
                <dd>{formatWalletMoney(movement.fees?.sliceFeeMinor ?? movement.sliceFeeMinor ?? "0")}</dd>
              </div>
              <div>
                <dt>Provider fee</dt>
                <dd>
                  {movement.fees?.providerFeeStatus === "KNOWN" && movement.fees.providerFeeMinor
                    ? formatWalletMoney(movement.fees.providerFeeMinor)
                    : "Pending provider evidence"}
                </dd>
              </div>
              <div>
                <dt>{movement.type === "WITHDRAWAL" ? "Net payout" : "Provider net"}</dt>
                <dd>{formatWalletMoney(movement.fees?.netPayoutMinor ?? movement.amountMinor)}</dd>
              </div>
              <div>
                <dt>Provider reference</dt>
                <dd>{movement.provider?.reference ?? "Available after provider creates it"}</dd>
              </div>
            </dl>
          </section>
          {movement.failure ? (
            <section className="wallet-detail__outcome is-warning">
              <p className="wallet-detail__section-label">What happened</p>
              <strong>{movement.failure.title}</strong>
              <p>{movement.failure.detail}</p>
              <dl>
                <div>
                  <dt>Money status</dt>
                  <dd>{movement.failure.moneyDisposition}</dd>
                </div>
                <div>
                  <dt>Next step</dt>
                  <dd>{movement.failure.nextStep}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {movement.timeline?.length ? (
            <section className="wallet-detail__lifecycle">
              <p className="wallet-detail__section-label">Verified movement updates</p>
              <ol>
                {movement.timeline.map((event) => (
                  <li key={`${event.occurredAt}-${event.status}`}>
                    <span>
                      <strong>{event.label}</strong>
                      <small>{formatDate(event.occurredAt)}</small>
                    </span>
                    <StatusPill status={event.status} />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
        {detail.isError ? (
          <p className="wallet-detail__note">
            The latest provider detail could not be loaded. Your ledger history remains available.
          </p>
        ) : (
          <p className="wallet-detail__note">
            Provider updates are verified before Slice changes wallet balances.
          </p>
        )}
      </section>
    </div>
  );
}

function SettlementTimelinePanel({
  portfolio,
  compliance,
  banks,
  movements,
  selectedMovement,
}: {
  portfolio: UseQueryResult<PortfolioSummary>;
  compliance: UseQueryResult<ComplianceSummary>;
  banks: UseQueryResult<BankConnection[]>;
  movements: UseQueryResult<WalletMovementPage>;
  selectedMovement: WalletMovementView | null;
}) {
  void portfolio;
  void compliance;
  void banks;
  const relevant =
    selectedMovement ??
    movements.data?.items.find((item) =>
      ["PENDING_PROVIDER", "PROCESSING", "HELD", "MANUAL_REVIEW"].includes(item.status),
    ) ??
    movements.data?.items[0];
  const steps = settlementStepsFor(relevant);
  return (
    <WalletPanel
      title={relevant ? "Movement timeline" : "Settlement timeline"}
      icon={<CalendarClock />}
      className="wallet-panel--timeline"
    >
      <div className="wallet-timeline" aria-label="Wallet settlement timeline">
        {relevant ? (
          <p className="wallet-timeline__context">
            {movementRailLabel(relevant.rail, relevant.type)} ·{" "}
            {relevant.reference ?? `WLT-${relevant.id.slice(0, 8).toUpperCase()}`}
          </p>
        ) : null}
        {steps.map((step, index) => (
          <div key={step.label} className={`wallet-timeline__step is-${step.state}`}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <small>
              {step.state === "complete"
                ? "Complete"
                : step.state === "active"
                  ? "In progress"
                  : "Next"}
            </small>
          </div>
        ))}
      </div>
    </WalletPanel>
  );
}

function Insight({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <small className="wallet-insight-change">{change}</small>
    </div>
  );
}

function insightChange(
  insights: WalletInsights,
  field: "totalDepositsMinor" | "totalWithdrawalsMinor" | "netMovementMinor",
  period: WalletInsightsPeriod,
) {
  const previous = insights.previousPeriod?.[field];
  if (previous === undefined || previous === "0") return "New in period";
  const current = BigInt(insights[field]);
  const prior = BigInt(previous);
  const delta = current - prior;
  const basisPoints = (delta * 10_000n) / (prior < 0n ? -prior : prior);
  const sign = basisPoints >= 0n ? "↑" : "↓";
  const absolute = basisPoints < 0n ? -basisPoints : basisPoints;
  const whole = absolute / 100n;
  const decimal = absolute % 100n;
  const rounded =
    decimal % 10n >= 5n ? `${whole}.${decimal / 10n + 1n}` : `${whole}.${decimal / 10n}`;
  return `${sign} ${rounded}% vs prev. ${period === "30d" ? "30 days" : "month"}`;
}

function hasSettledWalletData(insights: WalletInsights) {
  return (
    insights.totalDepositsMinor !== "0" ||
    insights.totalWithdrawalsMinor !== "0" ||
    insights.netMovementMinor !== "0" ||
    insights.previousPeriod !== null
  );
}

function WalletActivityPanel({ query }: { query: UseQueryResult<WalletMovementPage> }) {
  const items = query.data?.items.slice(0, 3) ?? [];
  return (
    <WalletPanel
      title="Recent wallet activity"
      icon={<CalendarClock />}
      className="wallet-panel--activity"
    >
      {" "}
      <div className="wallet-panel__body">
        {query.isLoading ? <RowsSkeleton rows={2} /> : null}
        {query.isError ? (
          <PanelError
            message="Unable to load wallet activity."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && items.length ? (
          <ul className="wallet-activity">
            {items.map((item) => (
              <li key={item.id}>
                <span className={item.type === "DEPOSIT" ? "is-deposit" : "is-withdrawal"}>
                  {item.type === "DEPOSIT" ? <ArrowDownToLine /> : <ArrowUpFromLine />}
                </span>
                <div>
                  <strong>
                    {item.type === "DEPOSIT" ? "Deposit" : "Withdrawal"}{" "}
                    {friendlyStatus(item.status).toLowerCase()}
                  </strong>
                  <p>{formatDate(item.updatedAt)}</p>
                </div>
                <span className={item.type === "DEPOSIT" ? "is-credit" : "is-debit"}>
                  {item.type === "DEPOSIT" ? "+" : "-"}
                  {formatWalletMoney(item.amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {!query.isLoading && !query.isError && !items.length ? (
          <PanelEmpty
            icon={<CalendarClock />}
            title="No recent activity"
            detail="Your recent wallet connections and updates will show here."
          />
        ) : null}
      </div>
    </WalletPanel>
  );
}

function BankConnectionControl({ hasConnected }: { hasConnected: boolean }) {
  const services = useAppServices();
  const [isConnecting, setIsConnecting] = useState(false);

  async function connect() {
    setIsConnecting(true);
    try {
      const session = await services.providers.createBankLinkCheckout();
      window.location.assign(session.checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bank connection failed.");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="wallet-bank-connect">
      <button type="button" onClick={() => void connect()} disabled={isConnecting}>
        <Landmark aria-hidden="true" />
        {isConnecting ? "Opening secure UK bank setup…" : "Add bank"}
        <ArrowRight aria-hidden="true" />
      </button>
      {hasConnected ? (
        <button
          type="button"
          className="wallet-bank-connect__secondary"
          onClick={() => void connect()}
          disabled={isConnecting}
        >
          Replace bank
        </button>
      ) : null}
      <p className="wallet-bank-connect__note">
        {hasConnected
          ? "Bank details are securely managed by Stripe."
          : "You’ll finish securely on Stripe’s hosted checkout. Slice never receives your account or sort code."}
      </p>
    </div>
  );
}

function WalletPanel({
  title,
  icon,
  action,
  className = "",
  children,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`wallet-panel ${className}`}>
      <div className="wallet-panel__head">
        {title ? (
          <h2>
            {icon ? <span aria-hidden="true">{icon}</span> : null}
            {title}
          </h2>
        ) : null}
        {action ?? null}
      </div>
      {children}
    </section>
  );
}
function StatusPill({ status }: { status: string }) {
  const isGood = ["APPROVED", "CONNECTED", "SETTLED", "AVAILABLE"].includes(status);
  const isAttention = [
    "CREATED",
    "PENDING",
    "PROCESSING",
    "HELD",
    "MANUAL_REVIEW",
    "EXPIRED",
    "NOT_CONNECTED",
    "NOT_STARTED",
    "REVIEW",
    "RESTRICTED",
  ].includes(status);
  return (
    <span className={`wallet-status ${isGood ? "is-good" : isAttention ? "is-attention" : ""}`}>
      {friendlyStatus(status)}
    </span>
  );
}
function PanelEmpty({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="wallet-empty">
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {action ? <span>{action}</span> : null}
      </div>
    </div>
  );
}
function PanelError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="wallet-panel__error">
      <p>{message}</p>
      <button type="button" onClick={retry}>
        <RefreshCw aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
function InlineError({ error }: { error: unknown }) {
  return (
    <p className="wallet-inline-error">
      <CircleAlert aria-hidden="true" />
      {error instanceof ApiError
        ? error.message
        : "We could not complete that request. Please try again."}
    </p>
  );
}
function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-label="Loading panel data">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="customer-skeleton h-11" />
      ))}
    </div>
  );
}
function WalletAccessRequired() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center">
        <WalletCards className="mx-auto size-8 text-accent" aria-hidden="true" />
        <p className="page-kicker mt-5">Wallet</p>
        <h1 className="page-title mt-3">Sign in to view your wallet</h1>
        <p className="mx-auto mt-4 max-w-xl text-subtle">
          Cash balances, bank connections, and money movements are available only to your
          authenticated session.
        </p>
        <Link
          to="/login"
          className="primary-action mt-6 inline-flex rounded-lg px-5 py-3 text-sm font-semibold text-background"
        >
          Sign in
        </Link>
      </section>
    </main>
  );
}
function complianceDetail(status: string) {
  return (
    (
      {
        NOT_STARTED: "Verify your identity to unlock wallet features",
        PENDING: "Your verification is being reviewed",
        APPROVED: "Identity verification complete",
        REVIEW: "Your verification needs attention",
        REJECTED: "Verification could not be completed",
      } as Record<string, string>
    )[status] ?? "Verification status unavailable"
  );
}

function payoutDetail(status: string | undefined) {
  return (
    (
      {
        NOT_STARTED: "Connect a payout account to receive withdrawals",
        ACTION_REQUIRED: "Finish the required payout account steps",
        UNDER_REVIEW: "Stripe is reviewing your payout account",
        READY: "Eligible cash can be paid out",
        RESTRICTED: "Payouts are restricted until account requirements are resolved",
        DISABLED: "Payouts are disabled for this account",
      } as Record<string, string>
    )[status ?? "NOT_STARTED"] ?? "Payout status unavailable"
  );
}
function formatMovementFee(policy: FeePolicy, action: WalletMovementType, amount: string) {
  const bps = action === "DEPOSIT" ? policy.deposit.sliceFeeBps : policy.withdrawal.sliceFeeBps;
  if (bps === 0) return "none";
  const amountMinor = parseWalletGbp(amount);
  if (!amountMinor) return `${bps / 100}%`;
  return `${formatWalletMoney(feeMinorForPolicy(amountMinor, bps))} (${bps / 100}%)`;
}
function withdrawalNetMinor(policy: FeePolicy, amount: string) {
  const amountMinor = parseWalletGbp(amount);
  if (!amountMinor) return "0";
  return (
    BigInt(amountMinor) - BigInt(feeMinorForPolicy(amountMinor, policy.withdrawal.sliceFeeBps))
  ).toString();
}
function feeMinorForPolicy(amountMinor: string, bps: number) {
  return ((BigInt(amountMinor) * BigInt(bps)) / 10_000n).toString();
}
function friendlyStatus(status: string) {
  const labels: Record<string, string> = {
    CREATED: "Pending",
    PENDING_PROVIDER: "Pending settlement",
    PROCESSING: "Processing",
    SETTLED: "Completed",
    CANCELLED: "Canceled",
    MANUAL_REVIEW: "Needs review",
    HELD: "Clearing",
    REVERSED: "Reversed",
  };
  if (labels[status]) return labels[status];
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function movementRailLabel(
  rail: WalletMovementView["rail"],
  type: WalletMovementType,
) {
  if (rail === "CARD") return "Stripe card payment";
  if (rail === "BACS_DIRECT_DEBIT") return "UK bank · Bacs Direct Debit";
  if (rail === "CONNECT_STANDARD_PAYOUT") return "Stripe Connect · standard payout";
  return type === "WITHDRAWAL" ? "Verified payout account" : "Funding movement";
}

function settlementStepsFor(item: WalletMovementView | undefined) {
  if (!item) {
    return [
      { label: "Choose a funding method", state: "next" },
      { label: "Request a movement", state: "next" },
      { label: "Provider confirmation", state: "next" },
      { label: "Wallet availability", state: "next" },
    ] as const;
  }
  const completed = item.status === "SETTLED";
  const processing = ["PENDING_PROVIDER", "PROCESSING", "HELD", "MANUAL_REVIEW"].includes(
    item.status,
  );
  const terminalIssue = ["FAILED", "CANCELLED", "RETURNED", "REVERSED"].includes(item.status);
  const stateFor = (position: number) =>
    terminalIssue
      ? position === 0
        ? "complete"
        : position === 1
          ? "active"
          : "next"
      : completed
        ? "complete"
        : processing && position === 1
          ? "active"
          : processing && position === 0
            ? "complete"
            : "next";
  if (item.type === "WITHDRAWAL") {
    return [
      { label: "Withdrawal requested", state: stateFor(0) },
      { label: "Wallet cash reserved", state: stateFor(1) },
      { label: "Provider payout processing", state: completed ? "complete" : processing ? "active" : "next" },
      { label: "Payout confirmed", state: completed ? "complete" : "next" },
    ] as const;
  }
  return [
    {
      label: item.rail === "CARD" ? "Secure card payment created" : "Bank deposit requested",
      state: stateFor(0),
    },
    { label: "Provider payment confirmation", state: completed ? "complete" : processing ? "active" : "next" },
    {
      label: item.rail === "BACS_DIRECT_DEBIT" ? "Funds clearing" : "Wallet credit recorded",
      state: item.status === "HELD" || item.status === "SETTLED" ? "complete" : "next",
    },
    {
      label: "Available to trade or withdraw",
      state: completed ? "complete" : "next",
    },
  ] as const;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string | null) {
  if (!value) return "provider confirmation";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "provider confirmation";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}
