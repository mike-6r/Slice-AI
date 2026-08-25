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
  CircleAlert,
  Clock3,
  Landmark,
  Layers3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type {
  BankConnection,
  AccountCapability,
  ComplianceSession,
  ComplianceSummary,
  ConnectPayoutSetup,
  FeePolicy,
  PortfolioSummary,
  WalletInsights,
  WalletMovementPage,
  WalletMovementType,
  WalletMovementView,
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

export function Wallet() {
  useCurrency();
  const services = useAppServices();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<WalletMovementType>("DEPOSIT");
  const [movementFilter, setMovementFilter] = useState<WalletMovementFilter>("ALL");
  const [capabilityDialog, setCapabilityDialog] = useState<AccountCapability | null>(null);
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
    mutationFn: async () => {
      const amountMinor = parseWalletGbp(amount);
      if (!amountMinor || BigInt(amountMinor) <= 0n) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "Enter a positive GBP amount with no more than two decimal places.",
        );
      }
      return action === "DEPOSIT"
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
  });

  const authRequired =
    (!isAuthenticated && !portfolio.data) ||
    (portfolio.error instanceof ApiError && portfolio.error.status === 401);
  if (authRequired) return <WalletAccessRequired />;

  return (
    <main className="wallet-page">
      <div className="page-shell wallet-shell">
        <WalletHeading />
        <WalletKpis query={portfolio} />
        <section className="wallet-row wallet-row--primary" aria-label="Wallet access and actions">
          <ConnectedBankPanel query={banks} refreshWallet={refreshWallet} />
          <MoveMoneyPanel
            action={action}
            setAction={setAction}
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
            onCapabilityRequired={setCapabilityDialog}
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
          <MovementsPanel query={movements} filter={movementFilter} setFilter={setMovementFilter} />
          <div className="wallet-side-stack">
            <SettlementTimelinePanel
              portfolio={portfolio}
              compliance={compliance}
              banks={banks}
              movements={movements}
            />
            <WalletInsightsPanel />
          </div>
        </section>
        <CapabilityRequiredDialog
          decision={capabilityDialog}
          onClose={() => setCapabilityDialog(null)}
        />
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
      <p className="page-kicker">Wallet</p>
      <h1>Wallet</h1>
      <p>Cash, funding, verification, and money movement infrastructure.</p>
    </header>
  );
}

function WalletKpis({ query }: { query: UseQueryResult<PortfolioSummary> }) {
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
        icon={WalletCards}
        label="Withdrawable cash"
        value={formatWalletMoney(cash.withdrawableMinor ?? cash.availableMinor)}
        detail="Posted cash not reserved"
      />
      <WalletKpi
        icon={ArrowDownToLine}
        label="Pending deposits"
        value={formatWalletMoney(cash.pendingMinor ?? "0")}
        detail={countDetail(cash.pendingDepositCount, "deposit", "processing")}
      />
      <WalletKpi
        icon={ArrowUpFromLine}
        label="Pending withdrawals"
        value={formatWalletMoney(cash.pendingWithdrawalMinor ?? "0")}
        detail={countDetail(cash.pendingWithdrawalCount, "withdrawal", "pending")}
      />
      <WalletKpi
        icon={LockKeyhole}
        label="Reserved cash"
        value={formatWalletMoney(cash.reservedMinor)}
        detail="Reserved for orders"
      />
      <WalletKpi
        icon={Layers3}
        label="Total wallet balance"
        value={formatWalletMoney(cash.totalMinor)}
        detail="Across all cash states"
        featured
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
      {[0, 1, 2, 3].map((item) => (
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
  refreshWallet,
}: {
  query: UseQueryResult<BankConnection[]>;
  refreshWallet: () => void;
}) {
  return (
    <WalletPanel title="Connected bank" icon={<Landmark />} className="wallet-panel--bank">
      <div className="wallet-panel__body wallet-bank-panel-body">
        {query.isLoading ? <RowsSkeleton rows={2} /> : null}
        {query.isError ? (
          <PanelError
            message="Unable to load bank connections."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && query.data?.length ? (
          <ul className="wallet-banks">
            {query.data.map((connection) => (
              <BankConnectionRow
                key={connection.id}
                connection={connection}
                refreshWallet={refreshWallet}
              />
            ))}
          </ul>
        ) : null}
        {!query.isLoading && !query.isError && !query.data?.length ? <BankEmpty /> : null}
        <BankConnectionControl
          hasConnected={Boolean(query.data?.some((bank) => bank.status === "CONNECTED"))}
        />
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
        <strong>No bank connected</strong>
        <p>Set up a UK bank mandate securely with Stripe Bacs Direct Debit before adding funds.</p>
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
                onClick={beginDisconnect}
                disabled={disconnectMutation.isPending}
              >
                Disconnect
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
  amount,
  setAmount,
  compliance,
  banks,
  movement,
  capability,
  feePolicy,
  onCapabilityRequired,
}: {
  action: WalletMovementType;
  setAction: (value: WalletMovementType) => void;
  amount: string;
  setAmount: (value: string) => void;
  compliance: UseQueryResult<ComplianceSummary>;
  banks: UseQueryResult<BankConnection[]>;
  movement: ReturnType<typeof useMutation<WalletMovementView, Error, void>>;
  capability: AccountCapability | undefined;
  feePolicy: UseQueryResult<FeePolicy>;
  onCapabilityRequired: (decision: AccountCapability) => void;
}) {
  const providerReady = compliance.data?.status === "APPROVED";
  const bankAvailable = Boolean(banks.data?.some((bank) => bank.status === "CONNECTED"));
  const capabilityBlocked = Boolean(capability && !capability.allowed);
  const domainBlocked =
    !capabilityBlocked && (!providerReady || (action === "DEPOSIT" && !bankAvailable));
  const disabledReason =
    capability && !capability.allowed
      ? capabilityInlineReason(capability)
      : !providerReady
        ? "Complete verification to continue."
        : action === "DEPOSIT" && !bankAvailable
          ? "Set up a UK bank mandate before requesting a deposit."
          : null;
  const fundingBank =
    banks.data?.find((bank) => bank.status === "CONNECTED" && bank.isDefault) ??
    banks.data?.find((bank) => bank.status === "CONNECTED");
  const fundingBankLabel = fundingBank
    ? `${fundingBank.institutionName ?? fundingBank.accountName ?? "Connected bank"}${fundingBank.accountMask ? ` · •••• ${fundingBank.accountMask}` : ""}`
    : "Connect a UK bank first";
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
        <form
          className="wallet-move-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (capability && !capability.allowed) {
              onCapabilityRequired(capability);
              return;
            }
            if (domainBlocked) return;
            movement.mutate();
          }}
        >
          {action === "DEPOSIT" ? (
            <div className={`wallet-funding-selector${fundingBank ? " is-ready" : ""}`}>
              <span className="wallet-funding-selector__label">From</span>
              <span className="wallet-funding-selector__value">
                <Landmark aria-hidden="true" />
                {fundingBankLabel}
              </span>
              {fundingBank ? <ArrowRight aria-hidden="true" /> : null}
            </div>
          ) : null}
          <label>
            Amount (GBP)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="£0.00"
            />
          </label>
          <p className="wallet-move-currency-note">
            Deposits and withdrawals settle in GBP. Any converted value shown below is for display
            only.
          </p>
          {action === "WITHDRAWAL" ? (
            <p>
              Withdrawals use your verified payout account. Slice does not collect bank details in
              this form, and eligible cash remains reserved until the provider confirms the payout.
            </p>
          ) : (
            <p>
              Bacs deposits remain pending until Stripe confirms settlement. They never add
              provisional cash.
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
          <button type="submit" disabled={domainBlocked || movement.isPending}>
            {movement.isPending
              ? "Submitting…"
              : action === "DEPOSIT"
                ? "Request deposit"
                : "Request withdrawal"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
        <p className={disabledReason ? "wallet-move-note is-locked" : "wallet-move-note"}>
          {disabledReason ?? "Your request will appear in wallet history once it is accepted."}
        </p>
        {movement.error ? <InlineError error={movement.error} /> : null}
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
}: {
  query: UseQueryResult<WalletMovementPage>;
  filter: WalletMovementFilter;
  setFilter: (value: WalletMovementFilter) => void;
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
                  <MovementRow key={item.id} item={item} onSelect={setSelected} />
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
  const insights = useQuery({
    queryKey: queryKeys.portfolio.insights,
    queryFn: services.portfolio.walletInsights,
  });
  return (
    <WalletPanel title="Wallet insights" icon={<Layers3 />} className="wallet-panel--insights">
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
            />
            <Insight
              label="Total withdrawals"
              value={formatWalletMoney(insights.data.totalWithdrawalsMinor)}
            />
            <Insight
              label="Net movement"
              value={formatWalletMoney(insights.data.netMovementMinor)}
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
            detail="Settled deposits and withdrawals will appear here month by month."
          />
        ) : null}
      </div>
    </WalletPanel>
  );
}

function MovementDetail({ item, onClose }: { item: WalletMovementView; onClose: () => void }) {
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
            <h3 id="movement-detail-title">{item.type === "DEPOSIT" ? "Deposit" : "Withdrawal"}</h3>
          </div>
          <button type="button" aria-label="Close movement detail" onClick={onClose}>
            ×
          </button>
        </div>
        <dl className="wallet-detail__grid">
          <div>
            <dt>Amount</dt>
            <dd>
              {item.type === "DEPOSIT" ? "+" : "−"}
              {formatWalletMoney(item.amountMinor)}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusPill status={item.status} />
            </dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{item.reference ?? `WLT-${item.id.slice(0, 8).toUpperCase()}`}</dd>
          </div>
          <div>
            <dt>Requested</dt>
            <dd>{formatDate(item.createdAt)}</dd>
          </div>
          <div>
            <dt>Source / destination</dt>
            <dd>{item.sourceLabel ?? "GBP wallet"}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>GBP</dd>
          </div>
        </dl>
        <p className="wallet-detail__note">
          Provider updates are verified before Slice changes wallet balances.
        </p>
      </section>
    </div>
  );
}

function SettlementTimelinePanel({
  portfolio,
  compliance,
  banks,
  movements,
}: {
  portfolio: UseQueryResult<PortfolioSummary>;
  compliance: UseQueryResult<ComplianceSummary>;
  banks: UseQueryResult<BankConnection[]>;
  movements: UseQueryResult<WalletMovementPage>;
}) {
  const latestDeposit = movements.data?.items.find((item) => item.type === "DEPOSIT");
  const cashAvailable =
    portfolio.data?.cash.availableMinor !== undefined &&
    BigInt(portfolio.data.cash.availableMinor) > 0n;
  const steps = [
    {
      label: "Setup bank",
      state: banks.data?.some((bank) => bank.status === "CONNECTED") ? "complete" : "next",
    },
    {
      label: "Verify identity",
      state:
        compliance.data?.status === "APPROVED"
          ? "complete"
          : compliance.data?.status === "PENDING"
            ? "active"
            : "next",
    },
    {
      label: "Deposit pending",
      state:
        latestDeposit?.status === "SETTLED"
          ? "complete"
          : latestDeposit &&
              ["CREATED", "PENDING_PROVIDER", "PROCESSING", "MANUAL_REVIEW", "HELD"].includes(
                latestDeposit.status,
              )
            ? "active"
            : "next",
    },
    { label: "Funds available", state: cashAvailable ? "complete" : "next" },
    {
      label: "Invest / withdraw",
      state: cashAvailable && compliance.data?.status === "APPROVED" ? "next" : "next",
    },
  ] as const;
  return (
    <WalletPanel
      title="Settlement timeline"
      icon={<CalendarClock />}
      className="wallet-panel--timeline"
    >
      <div className="wallet-timeline" aria-label="Wallet settlement timeline">
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

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <small>Settled movements</small>
    </div>
  );
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
        {isConnecting
          ? "Opening secure UK bank setup…"
          : hasConnected
            ? "Add another bank"
            : "Set up a UK bank"}
        <ArrowRight aria-hidden="true" />
      </button>
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
    REVERSED: "Reversed",
  };
  if (labels[status]) return labels[status];
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
