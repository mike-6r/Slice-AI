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
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type {
  BankConnection,
  AccountCapability,
  ComplianceSession,
  ComplianceSummary,
  PortfolioSummary,
  WalletMovementPage,
  WalletMovementType,
  WalletMovementView,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import { CapabilityRequiredDialog } from "@/components/account/CapabilityRequiredDialog";
import {
  filterWalletMovements,
  formatWalletMoney,
  parseWalletGbp,
  settledMovementFlow,
  walletAccessPresentation,
  type WalletMovementFilter,
} from "./-wallet-presentation";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet | Slice" }] }),
  component: Wallet,
});

export function Wallet() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
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
  const capabilities = useQuery({
    queryKey: queryKeys.account.capabilities,
    queryFn: services.account.capabilities,
    enabled: isAuthenticated,
  });
  const refreshWallet = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.summary });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.compliance });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.movements() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.providers.bankConnections });
  };
  const verification = useMutation({
    mutationFn: services.providers.startCompliance,
    onSuccess: (result) => {
      refreshWallet();
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
            destinationReference: destination.trim() || undefined,
          });
    },
    onSuccess: (result) => {
      setAmount("");
      setDestination("");
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
            destination={destination}
            setDestination={setDestination}
            compliance={compliance}
            banks={banks}
            movement={movement}
            capability={capabilities.data?.capabilities.find(
              (item) =>
                item.capability === (action === "DEPOSIT" ? "DEPOSIT_FUNDS" : "WITHDRAW_FUNDS"),
            )}
            onCapabilityRequired={setCapabilityDialog}
          />
          <AccountStatusPanel query={compliance} banks={banks} verification={verification} />
        </section>
        <section
          className="wallet-row wallet-row--history"
          aria-label="Wallet history and insights"
        >
          <MovementsPanel query={movements} filter={movementFilter} setFilter={setMovementFilter} />
          <div className="wallet-side-stack">
            <WalletInsightsPanel query={movements} />
            <WalletActivityPanel query={movements} />
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

function WalletHeading() {
  return (
    <header className="wallet-heading">
      <p className="page-kicker">Wallet</p>
      <h1>Cash and money movements</h1>
      <p>Manage your cash, connect your bank, and track your wallet activity.</p>
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
        icon={<WalletCards />}
        label="Available cash"
        value={formatWalletMoney(cash.availableMinor)}
        detail="Available to invest"
      />
      <WalletKpi
        icon={<LockKeyhole />}
        label="Reserved cash"
        value={formatWalletMoney(cash.reservedMinor)}
        detail="Reserved for supported activity"
      />
      <WalletKpi
        icon={<Layers3 />}
        label="Total cash"
        value={formatWalletMoney(cash.totalMinor)}
        detail="Available + reserved"
      />
      <WalletKpi
        icon={<BanknoteArrowDown />}
        label="Cash change (30D)"
        value="Unavailable"
        detail="Cash history unavailable"
      />
    </section>
  );
}

function WalletKpi({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="wallet-kpi">
      <span className="wallet-kpi__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
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
              <BankConnectionRow key={connection.id} connection={connection} />
            ))}
          </ul>
        ) : null}
        {!query.isLoading && !query.isError && !query.data?.length ? <BankEmpty /> : null}
        <PlaidLinkControl refreshWallet={refreshWallet} />
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
      <div>
        <strong>No bank connected</strong>
        <p>Connect your bank securely to add funds, withdraw, and manage your wallet.</p>
        <span className="wallet-bank-empty__halo" aria-hidden="true">
          <Landmark />
          <i />
        </span>
      </div>
    </div>
  );
}

function BankConnectionRow({ connection }: { connection: BankConnection }) {
  const label = connection.institutionName ?? connection.accountName ?? "Connected account";
  return (
    <li>
      <span className="wallet-bank-icon">
        <Landmark aria-hidden="true" />
      </span>
      <div>
        <strong>{label}</strong>
        <p>
          {connection.accountType}
          {connection.accountMask ? ` · •••• ${connection.accountMask}` : ""}
        </p>
      </div>
      <aside>
        <StatusPill status={connection.status} />
        <small>Bank connection</small>
      </aside>
    </li>
  );
}

function MoveMoneyPanel({
  action,
  setAction,
  amount,
  setAmount,
  destination,
  setDestination,
  compliance,
  banks,
  movement,
  capability,
  onCapabilityRequired,
}: {
  action: WalletMovementType;
  setAction: (value: WalletMovementType) => void;
  amount: string;
  setAmount: (value: string) => void;
  destination: string;
  setDestination: (value: string) => void;
  compliance: UseQueryResult<ComplianceSummary>;
  banks: UseQueryResult<BankConnection[]>;
  movement: ReturnType<typeof useMutation<WalletMovementView, Error, void>>;
  capability: AccountCapability | undefined;
  onCapabilityRequired: (decision: AccountCapability) => void;
}) {
  const providerReady = compliance.data?.status === "APPROVED";
  const bankAvailable = Boolean(banks.data?.some((bank) => bank.status === "CONNECTED"));
  const capabilityBlocked = Boolean(capability && !capability.allowed);
  const domainBlocked =
    !capabilityBlocked && (!providerReady || (action === "WITHDRAWAL" && !bankAvailable));
  const disabledReason =
    capability && !capability.allowed
      ? "Complete account setup to continue."
      : !providerReady
        ? "Complete verification to continue."
        : action === "WITHDRAWAL" && !bankAvailable
          ? "Connect a bank before requesting a withdrawal."
          : null;
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
          <label>
            Amount (GBP)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="£0.00"
            />
          </label>
          {action === "WITHDRAWAL" ? (
            <label>
              Destination reference
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Enter a permitted destination"
              />
            </label>
          ) : (
            <p>Deposit requests are confirmed before they affect your wallet balance.</p>
          )}
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

function AccountStatusPanel({
  query,
  banks,
  verification,
}: {
  query: UseQueryResult<ComplianceSummary>;
  banks: UseQueryResult<BankConnection[]>;
  verification: UseMutationResult<ComplianceSession, Error, void>;
}) {
  const connected = banks.data?.some((bank) => bank.status === "CONNECTED") ?? false;
  const access = walletAccessPresentation(query.data?.status, connected);
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
                  connected
                    ? "Ready for supported withdrawals"
                    : "Connect a bank to add or withdraw funds"
                }
                status={connected ? "CONNECTED" : "NOT_CONNECTED"}
              />
              <StatusRow
                icon={<LockKeyhole />}
                label="Wallet access"
                detail={access.detail}
                status={access.status}
              />
            </dl>
            {query.data.status !== "APPROVED" ? (
              <button
                type="button"
                className="wallet-verify-button"
                disabled={verification.isPending}
                onClick={() => verification.mutate()}
              >
                <ShieldCheck aria-hidden="true" />
                {verification.isPending ? "Starting verification…" : "Start verification"}
                <ArrowRight aria-hidden="true" />
              </button>
            ) : null}
            {verification.error ? <InlineError error={verification.error} /> : null}
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
                  <th>Type</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <MovementRow key={item.id} item={item} />
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
    </WalletPanel>
  );
}

function MovementRow({ item }: { item: WalletMovementView }) {
  return (
    <tr>
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
      <td>
        <StatusPill status={item.status} />
      </td>
      <td className={item.type === "DEPOSIT" ? "is-credit" : "is-debit"}>
        {item.type === "DEPOSIT" ? "+" : "-"}
        {formatWalletMoney(item.amountMinor)}
      </td>
      <td>{formatDate(item.createdAt)}</td>
    </tr>
  );
}

function WalletInsightsPanel({ query }: { query: UseQueryResult<WalletMovementPage> }) {
  const flow = query.data ? settledMovementFlow(query.data.items) : null;
  const net = flow ? BigInt(flow.inflowMinor) - BigInt(flow.outflowMinor) : null;
  return (
    <WalletPanel title="Wallet insights" icon={<Layers3 />} className="wallet-panel--insights">
      {" "}
      <div className="wallet-panel__body">
        {query.isLoading ? <RowsSkeleton rows={2} /> : null}
        {query.isError ? (
          <PanelError
            message="Unable to load wallet insights."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && flow ? (
          <dl className="wallet-insight-summary">
            <Insight label="Total deposited" value={formatWalletMoney(flow.inflowMinor)} />
            <Insight label="Total withdrawn" value={formatWalletMoney(flow.outflowMinor)} />
            <Insight label="Net cash flow" value={formatWalletMoney(net!.toString())} />
          </dl>
        ) : null}
        {!query.isLoading && !query.isError && !flow ? (
          <PanelEmpty
            icon={<Layers3 />}
            title="Wallet insights unavailable"
            detail="Settled money movements are needed to show wallet insights."
          />
        ) : null}
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

function PlaidLinkControl({ refreshWallet }: { refreshWallet: () => void }) {
  const services = useAppServices();
  const [token, setToken] = useState<string | null>(null);
  const tokenRequest = useMutation({
    mutationFn: services.providers.createBankLinkToken,
    onSuccess: (result) => setToken(result.linkToken),
  });
  const exchange = useMutation({
    mutationFn: services.providers.exchangeBankLinkPublicToken,
    onSuccess: (result) => {
      setToken(null);
      refreshWallet();
      toast.success(result.replayed ? "Bank connection already saved." : "Bank account connected.");
    },
  });
  const { open, ready, error } = usePlaidLink({
    token,
    onSuccess: (publicToken) => exchange.mutate(publicToken),
    onExit: (linkError) => {
      setToken(null);
      if (linkError) toast.error("Bank Link could not complete. No bank account was connected.");
    },
  });
  useEffect(() => {
    if (token && ready) open();
  }, [open, ready, token]);
  const currentError = tokenRequest.error ?? exchange.error;
  return (
    <div className="wallet-bank-connect">
      <button
        type="button"
        disabled={tokenRequest.isPending || exchange.isPending || Boolean(token && !ready)}
        onClick={() => tokenRequest.mutate()}
      >
        <Landmark aria-hidden="true" />
        {tokenRequest.isPending
          ? "Preparing secure connection…"
          : exchange.isPending
            ? "Saving connection…"
            : "Connect bank"}
        <ArrowRight aria-hidden="true" />
      </button>
      {currentError || error ? <InlineError error={currentError ?? error} /> : null}
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
function friendlyStatus(status: string) {
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
