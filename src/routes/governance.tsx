import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  FileText,
  Gavel,
  Landmark,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type { ProposalStatus, SaleProposalSummary } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  calculateGovernance,
  scopeItems,
  type GovernanceMetrics,
  type ProposalScope,
  weightedParticipation,
  weightedVote,
} from "./-governance-presentation";

export const Route = createFileRoute("/governance")({
  head: () => ({ meta: [{ title: "Governance | Slice" }] }),
  component: Governance,
});

export function Governance() {
  const services = useAppServices();
  const session = useSession();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<ProposalScope>("FOR_YOU");
  const [assetId, setAssetId] = useState("");
  const [offerMinor, setOfferMinor] = useState("");

  const currentUser = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    enabled: session.isAuthenticated,
  });
  const proposals = useInfiniteQuery({
    queryKey: queryKeys.governance.proposals(undefined, false),
    enabled: session.isAuthenticated,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      services.repositories.proposals.listSaleProposals({ cursor: pageParam, limit: 40 }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const holdings = useQuery({
    queryKey: queryKeys.portfolio.holdings,
    queryFn: () => services.repositories.portfolio.getHoldings(),
    enabled: session.isAuthenticated,
  });
  const create = useMutation({
    mutationFn: () =>
      services.repositories.proposals.createSaleProposal(assetId as never, offerMinor),
    onSuccess: async () => {
      setOfferMinor("");
      await queryClient.invalidateQueries({ queryKey: ["governance", "proposals"] });
    },
  });
  const lifecycle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "open" | "close" }) =>
      action === "open"
        ? services.repositories.proposals.openSaleProposal(id)
        : services.repositories.proposals.closeSaleProposal(id),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["governance", "proposals"] });
    },
  });

  if (!session.isAuthenticated) return <GovernanceAccessRequired />;

  const items = proposals.data?.pages.flatMap((page) => page.items) ?? [];
  const governance = calculateGovernance(items);
  const visibleItems = scopeItems(items, scope);
  const hasOwnedAssets = (holdings.data?.length ?? 0) > 0;
  const canManageGovernance = currentUser.data?.roles.includes("ADMIN") ?? false;

  return (
    <main className="governance-page">
      <div className="page-shell governance-shell">
        <header className="governance-hero">
          <div>
            <p className="page-kicker">Governance</p>
            <h1>
              Shape the future of <span>Slice.</span>
            </h1>
            <p>
              Review eligible asset-sale proposals, vote with your recorded ownership weight, and
              follow each proposal through its authoritative governance state.
            </p>
            <div className="governance-hero__actions">
              <button
                type="button"
                className="governance-primary-action"
                onClick={() => {
                  setScope("ACTIVE");
                  document.getElementById("governance-proposals")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                View active proposals <ArrowRight aria-hidden="true" />
              </button>
              <a href="#how-governance-works" className="governance-secondary-action">
                Learn how governance works <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </div>
          <GovernanceEligibility loading={proposals.isLoading} data={governance} />
        </header>

        {proposals.isError ? (
          <GovernanceError retry={() => void proposals.refetch()} />
        ) : (
          <>
            <GovernanceKpis loading={proposals.isLoading} data={governance} />
            <section className="governance-layout" aria-label="Governance proposal discovery">
              <ProposalBoard
                scope={scope}
                setScope={setScope}
                items={visibleItems}
                loading={proposals.isLoading}
                hasMore={proposals.hasNextPage}
                loadingMore={proposals.isFetchingNextPage}
                loadMore={() => void proposals.fetchNextPage()}
                lifecycle={
                  canManageGovernance
                    ? {
                        pendingId: lifecycle.isPending ? lifecycle.variables?.id : undefined,
                        onOpen: (id) => lifecycle.mutate({ id, action: "open" }),
                        onClose: (id) => lifecycle.mutate({ id, action: "close" }),
                        error: lifecycle.isError
                          ? safeMessage(
                              lifecycle.error,
                              "The authorised lifecycle action could not be completed.",
                            )
                          : null,
                      }
                    : undefined
                }
              />
              <aside className="governance-layout__side">
                <YourVoteActivity items={items} loading={proposals.isLoading} />
                <GovernanceAbout />
              </aside>
            </section>
          </>
        )}

        <ProposalCreation
          holdings={holdings}
          hasOwnedAssets={hasOwnedAssets}
          assetId={assetId}
          setAssetId={setAssetId}
          offerMinor={offerMinor}
          setOfferMinor={setOfferMinor}
          create={create}
        />

        <section id="how-governance-works" className="governance-information-strip">
          <CircleHelp aria-hidden="true" />
          <p>
            Recorded ownership snapshots determine voting eligibility and weight for supported
            asset-sale proposals. Votes are private to your authenticated governance record.
          </p>
          <Link to="/how-it-works">
            Learn how voting works <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}

function GovernanceEligibility({ loading, data }: { loading: boolean; data: GovernanceMetrics }) {
  return (
    <section className="governance-eligibility" aria-label="Governance eligibility">
      <div className="governance-eligibility__seal" aria-hidden="true">
        <Scale />
      </div>
      <div className="governance-eligibility__copy">
        <p>Your governance eligibility</p>
        {loading ? (
          <span className="customer-skeleton h-7 w-28" />
        ) : (
          <strong>{data.eligible}</strong>
        )}
        <span>{loading ? "Loading proposal eligibility" : "Eligible proposal snapshots"}</span>
      </div>
      <div className="governance-eligibility__rules">
        <p>Voting rules</p>
        <strong>Ownership snapshot</strong>
        <span>Weight is assessed separately for each proposal.</span>
      </div>
    </section>
  );
}

function GovernanceKpis({ loading, data }: { loading: boolean; data: GovernanceMetrics }) {
  const cards = [
    { label: "Listed proposals", value: data.listed, detail: "Loaded safely", icon: <FileText /> },
    {
      label: "Active proposals",
      value: data.active,
      detail: "Voting currently open",
      icon: <CalendarClock />,
    },
    {
      label: "Finalised proposals",
      value: data.finalised,
      detail: "Closed governance states",
      icon: <BadgeCheck />,
    },
    {
      label: "Awaiting your vote",
      value: data.awaiting,
      detail: "Eligible ownership snapshots",
      icon: <Vote />,
    },
    {
      label: "Your recorded votes",
      value: data.voted,
      detail: "Current votes on open proposals",
      icon: <CheckCircle2 />,
    },
  ];
  return (
    <section className="governance-kpis" aria-label="Governance proposal metrics">
      {cards.map((card) => (
        <article key={card.label} className="governance-kpi">
          <span aria-hidden="true">{card.icon}</span>
          <div>
            <p>{card.label}</p>
            {loading ? <i className="customer-skeleton h-7 w-10" /> : <strong>{card.value}</strong>}
            <small>{card.detail}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

function ProposalBoard({
  scope,
  setScope,
  items,
  loading,
  hasMore,
  loadingMore,
  loadMore,
  lifecycle,
}: {
  scope: ProposalScope;
  setScope: (scope: ProposalScope) => void;
  items: SaleProposalSummary[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  lifecycle?: ProposalLifecycle;
}) {
  const tabs: { value: ProposalScope; label: string }[] = [
    { value: "FOR_YOU", label: "For you" },
    { value: "ACTIVE", label: "Active" },
    { value: "CLOSED", label: "Closed" },
    { value: "ALL", label: "All proposals" },
  ];
  return (
    <section id="governance-proposals" className="governance-panel governance-panel--proposals">
      <header className="governance-panel__head">
        <div>
          <h2>Sale proposals</h2>
          <p>Safe, ownership-weighted governance state.</p>
        </div>
        <span className="governance-panel__count">{loading ? "…" : items.length}</span>
      </header>
      <div className="governance-tabs" role="tablist" aria-label="Proposal categories">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={scope === tab.value}
            className={scope === tab.value ? "is-active" : ""}
            onClick={() => setScope(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="governance-table-wrap" tabIndex={0} aria-label="Sale proposals table">
        <table className="governance-table">
          <thead>
            <tr>
              <th>Proposal</th>
              <th>Status</th>
              <th>Time remaining</th>
              <th>Weighted vote</th>
              <th>Participation</th>
              <th aria-label="Proposal action" />
            </tr>
          </thead>
          <tbody>
            {loading ? <ProposalRowsSkeleton /> : null}
            {!loading &&
              items.map((item) => <ProposalRow key={item.id} item={item} lifecycle={lifecycle} />)}
            {!loading && !items.length ? <ProposalEmptyRow /> : null}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <button
          type="button"
          className="governance-load-more"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Loading proposals…" : "Load more proposals"}{" "}
          <ArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

function ProposalRow({
  item,
  lifecycle,
}: {
  item: SaleProposalSummary;
  lifecycle?: ProposalLifecycle;
}) {
  const vote = weightedVote(item);
  const participation = weightedParticipation(item);
  const action = proposalAction(item);
  return (
    <tr>
      <td>
        <div className="governance-proposal">
          <span aria-hidden="true">
            <Landmark />
          </span>
          <div>
            <strong>{item.asset.title}</strong>
            <small>Proposed sale: {formatGbpMinor(item.offerMinor)}</small>
          </div>
        </div>
      </td>
      <td>
        <span className={`governance-status is-${item.status.toLowerCase()}`}>
          {statusLabel(item.status)}
        </span>
        <small className="governance-viewer-state">{viewerStateLabel(item.viewerState)}</small>
      </td>
      <td>
        <span className="governance-time">{timeLabel(item)}</span>
      </td>
      <td>
        <div className="governance-vote-split" aria-label={vote.accessibleLabel}>
          <span>{vote.approveLabel}</span>
          <span>{vote.rejectLabel}</span>
          <i>
            <b style={{ width: `${vote.approvePercent}%` }} />
          </i>
        </div>
      </td>
      <td>
        <div className="governance-participation" aria-label={participation.accessibleLabel}>
          <span>{participation.label}</span>
          <i>
            <b style={{ width: `${participation.percent}%` }} />
          </i>
        </div>
      </td>
      <td>
        <div className="governance-row-actions">
          <Link
            to="/sell-proposal/$id"
            params={{ id: item.id }}
            aria-label={`${action} ${item.asset.title}`}
          >
            {action} <ArrowRight aria-hidden="true" />
          </Link>
          {lifecycle && (item.status === "DRAFT" || item.status === "OPEN") ? (
            <button
              type="button"
              disabled={lifecycle.pendingId === item.id}
              onClick={() =>
                item.status === "DRAFT" ? lifecycle.onOpen(item.id) : lifecycle.onClose(item.id)
              }
            >
              {item.status === "DRAFT" ? "Open" : "Close"}
            </button>
          ) : null}
        </div>
        {lifecycle?.error ? (
          <span role="alert" className="governance-row-error">
            Action failed
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function YourVoteActivity({ items, loading }: { items: SaleProposalSummary[]; loading: boolean }) {
  const activity = items.filter((item) => item.ownVote !== null);
  return (
    <section className="governance-panel governance-panel--activity">
      <header className="governance-panel__head">
        <div>
          <h2>Your vote activity</h2>
          <p>Private to your account</p>
        </div>
      </header>
      {loading ? (
        <ActivitySkeleton />
      ) : activity.length ? (
        <ul className="governance-activity">
          {activity.slice(0, 5).map((item) => (
            <li key={item.id}>
              <span
                className={item.ownVote === "APPROVE" ? "is-approve" : "is-reject"}
                aria-hidden="true"
              >
                {item.ownVote === "APPROVE" ? <CheckCircle2 /> : <LockKeyhole />}
              </span>
              <div>
                <strong>You voted {item.ownVote?.toLowerCase()}</strong>
                <p>{item.asset.title}</p>
              </div>
              <Link
                to="/sell-proposal/$id"
                params={{ id: item.id }}
                aria-label={`View ${item.asset.title}`}
              >
                <ArrowRight />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <PanelEmpty
          icon={<Vote />}
          title="No recent governance activity"
          detail="Your recorded votes will appear here when an open proposal includes your ownership snapshot."
        />
      )}
    </section>
  );
}

function GovernanceAbout() {
  return (
    <section className="governance-panel governance-panel--about">
      <span aria-hidden="true">
        <ShieldCheck />
      </span>
      <div>
        <h2>About governance</h2>
        <p>
          Slice uses recorded ownership snapshots to determine eligibility and voting weight on
          supported asset-sale proposals.
        </p>
        <a href="#how-governance-works">
          Learn how it works <ArrowRight aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function ProposalCreation({
  holdings,
  hasOwnedAssets,
  assetId,
  setAssetId,
  offerMinor,
  setOfferMinor,
  create,
}: {
  holdings: ReturnType<typeof useQuery>;
  hasOwnedAssets: boolean;
  assetId: string;
  setAssetId: (value: string) => void;
  offerMinor: string;
  setOfferMinor: (value: string) => void;
  create: ReturnType<
    typeof useMutation<
      { proposalId: string; status: ProposalStatus; replayed: boolean },
      Error,
      void
    >
  >;
}) {
  return (
    <section className="governance-creation" aria-labelledby="governance-creation-title">
      <div>
        <p className="page-kicker">Eligible owners</p>
        <h2 id="governance-creation-title">Propose an asset sale</h2>
        <p>
          Draft proposals remain subject to existing asset, ownership, and governance eligibility
          checks.
        </p>
      </div>
      {holdings.isLoading ? (
        <span className="text-sm text-subtle">Loading your eligible holdings…</span>
      ) : null}
      {holdings.isError ? (
        <span className="text-sm text-negative">
          Holdings are unavailable, so proposal creation cannot be shown.
        </span>
      ) : null}
      {!holdings.isLoading && !holdings.isError && !hasOwnedAssets ? (
        <span className="text-sm text-subtle">No current holding is available to propose.</span>
      ) : null}
      {hasOwnedAssets ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (assetId && /^\d+$/.test(offerMinor) && BigInt(offerMinor) > 0n) create.mutate();
          }}
        >
          <label>
            Asset
            <select value={assetId} onChange={(event) => setAssetId(event.target.value)} required>
              <option value="">Select an owned asset</option>
              {(
                holdings.data as
                  { assetId: string; title: string; availableUnits: string }[] | undefined
              )?.map((holding) => (
                <option key={holding.assetId} value={holding.assetId}>
                  {holding.title} ({holding.availableUnits} available units)
                </option>
              ))}
            </select>
          </label>
          <label>
            Proposed gross amount (GBP minor units)
            <input
              inputMode="numeric"
              pattern="[0-9]+"
              value={offerMinor}
              onChange={(event) => setOfferMinor(event.target.value)}
              placeholder="e.g. 10000"
              required
            />
          </label>
          <button
            type="submit"
            disabled={
              create.isPending || !assetId || !/^\d+$/.test(offerMinor) || offerMinor === "0"
            }
          >
            Create draft <ArrowRight aria-hidden="true" />
          </button>
        </form>
      ) : null}
      {create.isError ? (
        <p role="alert">{safeMessage(create.error, "The proposal draft could not be created.")}</p>
      ) : null}
      {create.isSuccess ? (
        <Link to="/sell-proposal/$id" params={{ id: create.data.proposalId }}>
          Open your proposal draft <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

function GovernanceError({ retry }: { retry: () => void }) {
  return (
    <section className="governance-panel governance-error">
      <ShieldCheck aria-hidden="true" />
      <div>
        <h2>Governance is unavailable</h2>
        <p>Proposal summaries could not be loaded safely.</p>
        <button type="button" onClick={retry}>
          Retry
        </button>
      </div>
    </section>
  );
}

function GovernanceAccessRequired() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center">
        <Gavel className="mx-auto size-8 text-accent" aria-hidden="true" />
        <p className="page-kicker mt-5">Governance</p>
        <h1 className="page-title mt-3">Sign in for governance</h1>
        <p className="mx-auto mt-4 max-w-xl text-subtle">
          Proposal discovery, ownership eligibility, and weighted voting are available only to an
          authenticated account.
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

function ProposalRowsSkeleton() {
  return (
    <>
      {[0, 1, 2, 3].map((row) => (
        <tr key={row} className="governance-table__skeleton">
          <td colSpan={6}>
            <span className="customer-skeleton h-12 w-full" />
          </td>
        </tr>
      ))}
    </>
  );
}
function ActivitySkeleton() {
  return (
    <div className="space-y-3 px-5 pb-5" aria-label="Loading private vote activity">
      {[0, 1, 2].map((row) => (
        <div key={row} className="customer-skeleton h-11" />
      ))}
    </div>
  );
}
function ProposalEmptyRow() {
  return (
    <tr className="governance-table__empty">
      <td colSpan={6}>
        <Vote aria-hidden="true" />
        <div>
          <strong>No proposals in this view.</strong>
          <p>
            Open, eligible, and finalised proposal state will appear here when it is available to
            your account.
          </p>
        </div>
      </td>
    </tr>
  );
}
function PanelEmpty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="governance-empty">
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

type ProposalLifecycle = {
  pendingId?: string;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  error: string | null;
};
function proposalAction(item: SaleProposalSummary) {
  if (item.status !== "OPEN") return "View result";
  if (item.viewerState === "ELIGIBLE") return "Vote";
  if (item.viewerState === "ALREADY_VOTED") return "Change vote";
  return "View";
}
function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}
function viewerStateLabel(state: string) {
  return state.replaceAll("_", " ").toLowerCase();
}
function timeLabel(item: SaleProposalSummary) {
  if (item.status !== "OPEN")
    return item.closedAt ? `Closed ${formatDate(item.closedAt)}` : statusLabel(item.status);
  if (!item.closesAt) return "Close time unavailable";
  const difference = new Date(item.closesAt).getTime() - Date.now();
  if (difference <= 0) return "Closing";
  const hours = Math.floor(difference / 3_600_000);
  const days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h remaining` : `${Math.max(1, hours)}h remaining`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}
function formatGbpMinor(value: string) {
  const amount = BigInt(value);
  return `£${(amount / 100n).toLocaleString("en-GB")}.${(amount % 100n).toString().padStart(2, "0")}`;
}
function safeMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
