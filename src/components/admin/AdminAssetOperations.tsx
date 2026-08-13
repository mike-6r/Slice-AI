import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Filter, Grid2X2, List, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import type { AssetOperationsBoardItem, AssetOperationsBoardResponse } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import "@/styles/admin-operations.css";

const tabs = [
  ["verification", "Verification", "AWAITING_VERIFICATION"],
  ["valuation", "Valuation", "AWAITING_VALUATION"],
  ["custody", "Custody", "CUSTODY_PENDING"],
  ["vault-ready", "Vault Ready", "VAULT_READY"],
  ["market-ready", "Market Ready", "MARKET_READY"],
  ["market-live", "Market Live", "MARKET_LIVE"],
  ["exceptions", "Exceptions", "EXCEPTION"],
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
  const selectedTab = tabs.some(([id]) => id === tab) ? tab! : "verification";
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
        pageSize: 10,
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
  return (
    <main className="admin-operations-page">
      <header className="admin-operations-header">
        <div>
          <p className="admin-operations-breadcrumb">
            Asset Operations <span>›</span> Operations Board
          </p>
          <h2>Asset Operations</h2>
          <p>Manage the full lifecycle of physical assets from verification through market live.</p>
        </div>
        <div className="admin-operations-header-actions">
          <button type="button" className="admin-ops-button secondary" disabled>
            Export
          </button>
          <a className="admin-ops-button primary" href="/admin/vaults">
            Manage Vaults
          </a>
        </div>
      </header>
      <Kpis data={board.data} />
      <div className="admin-operations-layout">
        <section className="admin-operations-table-panel">
          <nav className="admin-operations-tabs" aria-label="Asset operation stages">
            {tabs.map(([id, label, stage]) => (
              <button
                type="button"
                className={selectedTab === id ? "active" : ""}
                key={id}
                onClick={() => update({ tab: id, page: "1" })}
              >
                {label}{" "}
                <b>
                  {stage === "AWAITING_VERIFICATION"
                    ? (board.data.counts.AWAITING_VERIFICATION ?? 0) +
                      (board.data.counts.VERIFICATION_IN_PROGRESS ?? 0)
                    : (board.data.counts[stage as keyof typeof board.data.counts] ?? 0)}
                </b>
              </button>
            ))}
          </nav>
          <div className="admin-operations-toolbar">
            <label className="admin-operations-search">
              <Search aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by collectible, collector, submission, cert..."
                aria-label="Search asset operations"
              />
            </label>
            <select
              value={category}
              onChange={(event) => update({ category: event.target.value || undefined, page: "1" })}
              aria-label="Category"
            >
              <option value="">Category: All</option>
              <option value="pokemon">Pokémon</option>
              <option value="sports">Sports</option>
              <option value="watch">Watch</option>
            </select>
            <select
              value={grader}
              onChange={(event) => update({ grader: event.target.value || undefined, page: "1" })}
              aria-label="Grader"
            >
              <option value="">Grader: All</option>
              <option value="PSA">PSA</option>
              <option value="BGS">BGS</option>
              <option value="CGC">CGC</option>
            </select>
            <select
              value={priority}
              onChange={(event) => update({ priority: event.target.value || undefined, page: "1" })}
              aria-label="Priority"
            >
              <option value="">Priority: All</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <button type="button" className="admin-ops-filter">
              <SlidersHorizontal aria-hidden="true" /> More Filters
            </button>
            <div className="admin-ops-view-buttons">
              <button type="button" className="active" aria-label="List view">
                <List aria-hidden="true" />
              </button>
              <button type="button" aria-label="Grid view">
                <Grid2X2 aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="admin-operations-table-wrap">
            <table className="admin-operations-table">
              <thead>
                <tr>
                  <th>Collectible</th>
                  <th>Collector</th>
                  <th>Grading</th>
                  <th>Category</th>
                  <th>Research</th>
                  <th>Priority</th>
                  <th>Stage date</th>
                  <th>Age</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {board.data.items.map((item) => (
                  <OperationRow
                    key={item.id}
                    item={item}
                    onOpen={() =>
                      update({
                        section: "assetOperations",
                        asset: item.id,
                        tab: item.recommendedDetailTab,
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!board.data.items.length ? (
            <div className="admin-operations-empty">
              No assets are currently in this operational stage.
            </div>
          ) : null}
          <footer className="admin-operations-pagination">
            <span>
              Showing{" "}
              {board.data.pagination.total
                ? (board.data.pagination.page - 1) * board.data.pagination.pageSize + 1
                : 0}{" "}
              to{" "}
              {Math.min(
                board.data.pagination.page * board.data.pagination.pageSize,
                board.data.pagination.total,
              )}{" "}
              of {board.data.pagination.total}
            </span>
            <div>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                ‹
              </button>
              <strong>{page}</strong>
              <button
                type="button"
                disabled={page >= board.data.pagination.totalPages}
                onClick={() => update({ page: String(page + 1) })}
              >
                ›
              </button>
              <select value={board.data.pagination.pageSize} disabled aria-label="Page size">
                <option>10 / page</option>
              </select>
            </div>
          </footer>
        </section>
        <OperationsRail data={board.data} onOpen={(stage) => update({ tab: stage, page: "1" })} />
      </div>
    </main>
  );
}

function Kpis({ data }: { data: AssetOperationsBoardResponse }) {
  const cards = [
    ["AWAITING_VERIFICATION", "Awaiting Verification"],
    ["AWAITING_VALUATION", "Awaiting Valuation"],
    ["CUSTODY_PENDING", "Custody Pending"],
    ["VAULT_READY", "Vault Ready"],
    ["MARKET_READY", "Market Ready"],
    ["MARKET_LIVE", "Market Live"],
    ["EXCEPTION", "Exceptions"],
  ] as const;
  return (
    <div className="admin-operations-kpis">
      {cards.map(([stage, label]) => (
        <div className={`admin-operations-kpi ${stage.toLowerCase()}`} key={stage}>
          <small>{label}</small>
          <strong>
            {stage === "AWAITING_VERIFICATION"
              ? data.counts.AWAITING_VERIFICATION + data.counts.VERIFICATION_IN_PROGRESS
              : data.counts[stage]}
          </strong>
          <span>
            {stage === "EXCEPTION"
              ? "Needs attention"
              : stage === "MARKET_LIVE"
                ? "Live on marketplace"
                : stage === "MARKET_READY"
                  ? "Ready to publish"
                  : "Current operational count"}
          </span>
        </div>
      ))}
    </div>
  );
}
function OperationRow({ item, onOpen }: { item: AssetOperationsBoardItem; onOpen: () => void }) {
  const age = Math.max(
    0,
    Math.floor((Date.now() - new Date(item.stageSince).getTime()) / 86_400_000),
  );
  return (
    <tr>
      <td>
        <button type="button" className="admin-operations-asset" onClick={onOpen}>
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" />
          ) : (
            <span className="admin-operations-thumb-fallback">◈</span>
          )}
          <span>
            <strong>{item.title}</strong>
            <small>
              {item.category.name} ·{" "}
              {item.grading.grade ? `${item.grading.company} ${item.grading.grade}` : "UnGraded"}
            </small>
          </span>
        </button>
      </td>
      <td>
        <strong>{item.collector?.displayName ?? "Unassigned"}</strong>
        <small>{item.collector?.username ? `@${item.collector.username}` : "—"}</small>
        {item.collector?.membership ? <em>{item.collector.membership}</em> : null}
      </td>
      <td>
        <strong>
          {item.grading.company ?? "—"} {item.grading.grade ?? ""}
        </strong>
        <small>{item.grading.certNumber ?? "Cert unavailable"}</small>
      </td>
      <td>
        <strong>{item.category.name}</strong>
        <small>{item.category.set ?? item.category.variant ?? "—"}</small>
      </td>
      <td>
        <span className={`admin-research ${item.research.status.toLowerCase()}`}>
          {sentence(item.research.status)}
        </span>
        <small>{item.research.asOf ? date(item.research.asOf) : "No snapshot"}</small>
      </td>
      <td>
        <span className={`admin-priority ${item.priority.toLowerCase()}`}>
          {item.priority === "HIGH" ? "↑" : item.priority === "LOW" ? "↓" : "→"}{" "}
          {sentence(item.priority)}
        </span>
      </td>
      <td>
        {item.submittedAt ? date(item.submittedAt) : "—"}
        <small>{sentence(item.currentStage)}</small>
      </td>
      <td className={age >= 7 ? "overdue" : ""}>{age}d ago</td>
      <td>
        <button
          type="button"
          className="admin-row-action"
          onClick={onOpen}
          aria-label={`Open ${item.title}`}
        >
          •••
        </button>
      </td>
    </tr>
  );
}
function OperationsRail({
  data,
  onOpen,
}: {
  data: AssetOperationsBoardResponse;
  onOpen: (stage: string) => void;
}) {
  const total = Object.values(data.counts).reduce((sum, value) => sum + value, 0);
  return (
    <aside className="admin-operations-rail">
      <section className="admin-operations-rail-card">
        <h3>Operations Overview</h3>
        <div className="admin-operations-ring">
          <strong>{total}</strong>
          <span>Assets</span>
        </div>
        {data.operationsOverview.slice(0, 7).map((entry) => (
          <button
            type="button"
            className="admin-stage-legend"
            key={entry.stage}
            onClick={() => onOpen(stageTab(entry.stage))}
          >
            <i />
            {entry.label} <b>{entry.count}</b>
          </button>
        ))}
      </section>
      <section className="admin-operations-rail-card">
        <h3>Stage Flow (Today)</h3>
        {data.stageFlowToday.length ? (
          data.stageFlowToday.slice(0, 6).map((entry) => (
            <div className="admin-stage-flow" key={entry.type}>
              <span>{entry.label}</span>
              <b>{entry.count}</b>
            </div>
          ))
        ) : (
          <p>No stage events recorded today.</p>
        )}
      </section>
      <section className="admin-operations-rail-card">
        <h3>Quick Actions</h3>
        <button type="button" onClick={() => onOpen("valuation")}>
          Request Research
        </button>
        <button type="button" onClick={() => onOpen("valuation")}>
          Set Valuation
        </button>
        <button type="button" onClick={() => onOpen("vault-ready")}>
          Move to Vault Ready
        </button>
        <button type="button" onClick={() => onOpen("market-ready")}>
          Publish to Market
        </button>
        <button type="button" disabled>
          Create Exception
        </button>
      </section>
      <section className="admin-operations-rail-card">
        <div className="admin-rail-heading">
          <h3>Recent Activity</h3>
          <span>View all</span>
        </div>
        {data.recentActivity.slice(0, 7).map((entry) => (
          <div className="admin-recent-activity" key={entry.id}>
            <strong>{entry.title}</strong>
            <small>
              {entry.reference || "System"} · {date(entry.occurredAt)}
            </small>
          </div>
        ))}
      </section>
    </aside>
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
function stageTab(stage: string) {
  return (
    (
      {
        AWAITING_VERIFICATION: "verification",
        VERIFICATION_IN_PROGRESS: "verification",
        AWAITING_VALUATION: "valuation",
        CUSTODY_PENDING: "custody",
        VAULT_READY: "vault-ready",
        MARKET_READY: "market-ready",
        MARKET_LIVE: "market-live",
        EXCEPTION: "exceptions",
      } as Record<string, string>
    )[stage] ?? "verification"
  );
}
function sentence(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function date(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
