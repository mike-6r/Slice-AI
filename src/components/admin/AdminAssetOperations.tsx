import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Filter,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AssetOperationsBoardItem, AssetOperationsBoardResponse } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import "@/styles/admin-operations.css";

const tabs = [
  ["all", "All active"],
  ["needs-action", "Needs action"],
  ["verification", "Verification"],
  ["valuation", "Valuation"],
  ["custody", "Custody"],
  ["vault-ready", "Vault ready"],
  ["market-ready", "Market ready"],
  ["market-live", "Market live"],
  ["exceptions", "Exceptions"],
] as const;

export function AdminAssetOperations({
  tab,
  query,
  category,
  grader,
  priority,
  page,
  update,
}: {
  tab?: string;
  query: string;
  category: string;
  grader: string;
  priority: string;
  page: number;
  update: (patch: Record<string, string | undefined>) => void;
}) {
  const services = useAppServices();
  const [search, setSearch] = useState(query);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(category || grader || priority));
  const selectedTab = tabs.some(([id]) => id === tab) ? tab! : "all";
  const board = useQuery({
    queryKey: ["admin", "asset-operations", selectedTab, query, category, grader, priority, page],
    queryFn: () =>
      services.repositories.lifecycle.getOperationsBoard({
        tab: selectedTab,
        q: query || undefined,
        category: category || undefined,
        grader: grader || undefined,
        priority: priority || undefined,
        page,
        pageSize: 12,
      }),
    staleTime: 20_000,
  });
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = search.trim() || undefined;
      if (value !== (query || undefined)) update({ q: value, page: "1" });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [search, query, update]);
  if (board.isLoading)
    return (
      <OperationsState
        title="Loading Asset Operations"
        detail="Reading the post-intake lifecycle projection."
      />
    );
  if (board.isError || !board.data)
    return (
      <OperationsState
        title="Asset Operations unavailable"
        detail="The operational projection could not be loaded safely."
        retry={() => void board.refetch()}
      />
    );
  const data = board.data;
  const totalActive = Object.values(data.counts).reduce((sum, value) => sum + value, 0);
  const needsAction = totalActive - (data.counts.MARKET_LIVE ?? 0);
  return (
    <main className="admin-operations-page">
      <header className="admin-operations-header">
        <div>
          <p className="admin-operations-breadcrumb">
            Admin Console <span>›</span> Asset Operations
          </p>
          <h2>Post-receipt asset operations</h2>
          <p>
            Move physical collectibles from verified receipt to a market-ready, publishable state.
          </p>
        </div>
        <div className="admin-operations-header-actions">
          <a className="admin-ops-button secondary" href="/admin?section=intake">
            Open Physical Intake <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </header>
      <section className="admin-operations-intro" aria-label="Operations workflow">
        <div>
          <span className="admin-operations-intro__eyebrow">Authoritative work queue</span>
          <strong>{totalActive} assets in post-receipt operations</strong>
          <p>
            Only assets with an approved submission and a confirmed physical receipt enter this
            queue.
          </p>
        </div>
        <div className="admin-operations-intro__summary">
          <div>
            <span>Needs action</span>
            <b>{needsAction}</b>
          </div>
          <div>
            <span>Market live</span>
            <b>{data.counts.MARKET_LIVE ?? 0}</b>
          </div>
          <div>
            <span>Exceptions</span>
            <b className="is-alert">{data.counts.EXCEPTION ?? 0}</b>
          </div>
        </div>
      </section>
      <section className="admin-operations-workspace">
        <nav className="admin-operations-tabs" aria-label="Asset operation stages">
          {tabs.map(([id, label]) => (
            <button
              type="button"
              className={selectedTab === id ? "active" : ""}
              key={id}
              onClick={() => update({ tab: id, page: "1" })}
            >
              {label} <b>{countFor(id, data.counts)}</b>
            </button>
          ))}
        </nav>
        <div className="admin-operations-toolbar">
          <label className="admin-operations-search">
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search collectible, collector, submission, cert..."
              aria-label="Search asset operations"
            />
          </label>
          <button
            type="button"
            className={`admin-ops-filter ${filtersOpen ? "active" : ""}`}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter aria-hidden="true" /> Filters{" "}
            {activeFilterCount({ category, grader, priority })
              ? `(${activeFilterCount({ category, grader, priority })})`
              : ""}
          </button>
        </div>
        {filtersOpen ? (
          <div className="admin-operations-filters" aria-label="Asset operation filters">
            <label>
              Category
              <select
                value={category}
                onChange={(event) =>
                  update({ category: event.target.value || undefined, page: "1" })
                }
              >
                <option value="">All categories</option>
                <option value="pokemon">Pokémon</option>
                <option value="sports">Sports</option>
                <option value="watch">Watch</option>
              </select>
            </label>
            <label>
              Grader
              <select
                value={grader}
                onChange={(event) => update({ grader: event.target.value || undefined, page: "1" })}
              >
                <option value="">All graders</option>
                <option value="PSA">PSA</option>
                <option value="BGS">BGS</option>
                <option value="CGC">CGC</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) =>
                  update({ priority: event.target.value || undefined, page: "1" })
                }
              >
                <option value="">All priorities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </label>
            <button
              type="button"
              className="admin-ops-clear"
              onClick={() =>
                update({ category: undefined, grader: undefined, priority: undefined, page: "1" })
              }
            >
              Clear filters
            </button>
          </div>
        ) : null}
        <div className="admin-operations-queue-head" aria-hidden="true">
          <span>Collectible</span>
          <span>Workflow status</span>
          <span>Owner & source</span>
          <span>Next action</span>
          <span>Age</span>
          <span />
        </div>
        <div className="admin-operations-queue">
          {data.items.map((item) => (
            <OperationRow
              key={item.id}
              item={item}
              onOpen={() => update({ section: "assetOperations", asset: item.id, tab: "overview" })}
            />
          ))}
        </div>
        {!data.items.length ? <EmptyQueue /> : null}
        <footer className="admin-operations-pagination">
          <span>
            Showing{" "}
            {data.pagination.total ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0}–
            {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of{" "}
            {data.pagination.total}
          </span>
          <div>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1) })}
            >
              Previous
            </button>
            <strong>Page {page}</strong>
            <button
              type="button"
              disabled={page >= data.pagination.totalPages}
              onClick={() => update({ page: String(page + 1) })}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

function OperationRow({ item, onOpen }: { item: AssetOperationsBoardItem; onOpen: () => void }) {
  return (
    <article className="admin-operation-row">
      <button type="button" className="admin-operation-identity" onClick={onOpen}>
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" />
        ) : (
          <span className="admin-operation-thumb-fallback">
            <ImageIcon aria-hidden="true" />
          </span>
        )}
        <span>
          <strong>{item.title}</strong>
          <small>
            {item.category.name}
            {item.category.set ? ` · ${item.category.set}` : ""}
            {item.category.variant ? ` · ${item.category.variant}` : ""}
          </small>
          <em>{item.publicId}</em>
        </span>
      </button>
      <div className="admin-operation-stage">
        <span className={`admin-stage-badge ${item.currentStage.toLowerCase()}`}>
          {stageLabel(item.currentStage)}
        </span>
        {item.marketLifecycle ? (
          <span className="admin-stage-badge admin-stage-badge--market">
            {item.marketLifecycle.admin.publicState}
          </span>
        ) : null}
        <small>
          {item.readiness.status === "READY" ? (
            <>
              <CheckCircle2 aria-hidden="true" /> Ready to publish
            </>
          ) : (
            <>
              <CircleAlert aria-hidden="true" /> {item.blockers.length} blocker
              {item.blockers.length === 1 ? "" : "s"}
            </>
          )}
        </small>
        {item.marketLifecycle ? <small>{item.marketLifecycle.admin.internalState}</small> : null}
      </div>
      <div className="admin-operation-owner">
        <strong>{item.collector?.displayName ?? "Collector unavailable"}</strong>
        <small>
          {item.collector?.username ? `@${item.collector.username}` : "No public username"}
        </small>
        <span>Receipt · {item.sourceContext.vault}</span>
      </div>
      <div className="admin-operation-next">
        <strong>{item.nextAction}</strong>
        {item.exception ? (
          <small className="is-alert">{item.exception.summary}</small>
        ) : (
          <small>
            {item.blockers.slice(0, 2).map(sentence).join(" · ") || "No blockers recorded"}
          </small>
        )}
      </div>
      <div className={`admin-operation-age ${item.ageDays >= 7 ? "is-overdue" : ""}`}>
        <Clock3 aria-hidden="true" />
        <strong>{item.ageDays}d</strong>
        <small>in stage</small>
      </div>
      <button
        type="button"
        className="admin-operation-open"
        onClick={onOpen}
        aria-label={`Open operation for ${item.title}`}
      >
        <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

function EmptyQueue() {
  return (
    <div className="admin-operations-empty">
      <CheckCircle2 aria-hidden="true" />
      <h3>No assets in this queue</h3>
      <p>
        Only approved submissions with a confirmed physical receipt appear in Asset Operations.
        Review incoming shipments in Physical Intake first.
      </p>
      <a href="/admin?section=intake">
        Open Physical Intake <ArrowRight aria-hidden="true" />
      </a>
    </div>
  );
}
function OperationsState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <section className="admin-operations-state">
      <h2>{title}</h2>
      <p>{detail}</p>
      {retry ? (
        <button type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}
function countFor(tab: string, counts: AssetOperationsBoardResponse["counts"]) {
  if (tab === "all") return Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (tab === "needs-action")
    return Object.entries(counts)
      .filter(([stage]) => stage !== "MARKET_LIVE")
      .reduce((sum, [, value]) => sum + value, 0);
  if (tab === "verification")
    return (counts.AWAITING_VERIFICATION ?? 0) + (counts.VERIFICATION_IN_PROGRESS ?? 0);
  return counts[stageForTab(tab)] ?? 0;
}
function stageForTab(tab: string): AssetOperationsBoardItem["currentStage"] {
  return (
    (
      {
        valuation: "AWAITING_VALUATION",
        custody: "CUSTODY_PENDING",
        "vault-ready": "VAULT_READY",
        "market-ready": "MARKET_READY",
        "market-live": "MARKET_LIVE",
        exceptions: "EXCEPTION",
      } as const
    )[tab as "valuation"] ?? "AWAITING_VERIFICATION"
  );
}
function activeFilterCount(filters: { category: string; grader: string; priority: string }) {
  return Object.values(filters).filter(Boolean).length;
}
function stageLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function sentence(value: string) {
  return stageLabel(value);
}
