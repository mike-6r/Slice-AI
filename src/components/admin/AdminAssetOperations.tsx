import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Landmark,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AssetOperationsBoardItem, AssetOperationsBoardResponse } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import {
  assetOperationsEmptyCopy,
  assetOperationsTabCount,
  assetOperationsTabs,
} from "./AdminAssetOperations.presentation";
import "@/styles/admin-operations.css";

type Props = {
  tab?: string;
  query: string;
  category: string;
  grader: string;
  stage: string;
  valuation: string;
  ownership: string;
  offering: string;
  market: string;
  workType: string;
  attention: string;
  sort: string;
  page: number;
  update: (patch: Record<string, string | undefined>) => void;
};

export function AdminAssetOperations(props: Props) {
  const services = useAppServices();
  const [search, setSearch] = useState(props.query);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedTab = assetOperationsTabs.some(([key]) => key === props.tab) ? props.tab! : "all";
  const board = useQuery({
    queryKey: [
      "admin",
      "asset-operations",
      selectedTab,
      props.query,
      props.category,
      props.grader,
      props.stage,
      props.valuation,
      props.ownership,
      props.offering,
      props.market,
      props.workType,
      props.attention,
      props.sort,
      props.page,
    ],
    queryFn: () =>
      services.repositories.lifecycle.getOperationsBoard({
        tab: selectedTab,
        q: props.query || undefined,
        category: props.category || undefined,
        grader: props.grader || undefined,
        stage: props.stage || undefined,
        valuation: props.valuation || undefined,
        ownership: props.ownership || undefined,
        offering: props.offering || undefined,
        market: props.market || undefined,
        workType: props.workType || undefined,
        attention: props.attention || undefined,
        sort: props.sort || "NEEDS_ACTION",
        page: props.page,
        pageSize: 25,
      }),
    staleTime: 15_000,
  });
  useEffect(() => setSearch(props.query), [props.query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = search.trim() || undefined;
      if (value !== (props.query || undefined)) props.update({ q: value, page: "1" });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [search, props]);
  const activeFilters = useMemo(
    () =>
      [
        props.category,
        props.grader,
        props.stage,
        props.valuation,
        props.ownership,
        props.offering,
        props.market,
        props.workType,
        props.attention,
      ].filter(Boolean).length,
    [
      props.category,
      props.grader,
      props.stage,
      props.valuation,
      props.ownership,
      props.offering,
      props.market,
      props.workType,
      props.attention,
    ],
  );
  const selectedItem =
    board.data?.items.find((item) => item.id === selected) ?? board.data?.items[0] ?? null;
  if (board.isLoading)
    return (
      <OperationsState
        title="Loading Asset Operations"
        detail="Reading the authoritative post-custody operations queue."
      />
    );
  if (board.isError || !board.data)
    return (
      <OperationsState
        title="Asset Operations unavailable"
        detail="The operations authority could not be loaded. No lifecycle state has been inferred."
        retry={() => void board.refetch()}
      />
    );
  return (
    <main className="asset-operations-page">
      <header className="asset-operations-header">
        <div>
          <p>
            Admin Console <span>›</span> Asset Operations
          </p>
          <h2>Asset Operations</h2>
          <span>
            Prepare secured collectibles for valuation, ownership, offering, launch, and market
            operations.
          </span>
        </div>
        <div>
          <a className="admin-ops-button" href="/admin?section=intake">
            Open Physical Intake <ExternalLink aria-hidden="true" />
          </a>
          <a className="admin-ops-button primary" href="/admin?section=collectibles">
            Open Collectibles <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </header>
      <Metrics counts={board.data.counts} />
      <section className="asset-operations-workspace">
        <nav className="asset-operations-tabs" aria-label="Asset Operations queue">
          {assetOperationsTabs.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={selectedTab === key ? "active" : ""}
              onClick={() => props.update({ tab: key, page: "1" })}
            >
              {label}
              <b>{assetOperationsTabCount(key, board.data.counts)}</b>
            </button>
          ))}
        </nav>
        <div className="asset-operations-tools">
          <label className="asset-operations-search">
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, asset ID, collector, submission or cert…"
            />
          </label>
          <label>
            Sort
            <select
              value={props.sort}
              onChange={(event) => props.update({ sort: event.target.value, page: "1" })}
            >
              <option value="NEEDS_ACTION">Needs action</option>
              <option value="UPDATED_DESC">Recently updated</option>
              <option value="NEWEST">Newest stage</option>
              <option value="STAGE_OLDEST">Oldest in stage</option>
              <option value="TITLE">Title</option>
              <option value="READY_FIRST">Ready for launch</option>
            </select>
          </label>
          <button
            type="button"
            className={filtersOpen ? "active" : ""}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal aria-hidden="true" /> More filters
            {activeFilters ? ` (${activeFilters})` : ""}
          </button>
          {activeFilters ? (
            <button
              type="button"
              onClick={() =>
                props.update({
                  category: undefined,
                  grader: undefined,
                  operationsStage: undefined,
                  valuation: undefined,
                  ownership: undefined,
                  operationsOffering: undefined,
                  market: undefined,
                  workType: undefined,
                  operationsAttention: undefined,
                  page: "1",
                })
              }
            >
              Clear
            </button>
          ) : null}
        </div>
        {filtersOpen ? <Filters {...props} /> : null}
        <div className="asset-operations-layout">
          <div className="asset-operations-table-wrap">
            <div className="asset-operations-grid asset-operations-grid--head" aria-hidden="true">
              <span>Collectible</span>
              <span>Physical prerequisites</span>
              <span>Valuation</span>
              <span>Ownership</span>
              <span>Offering</span>
              <span>Market</span>
              <span>Next action</span>
              <span>Attention / updated</span>
              <span />
            </div>
            <div className="asset-operations-table">
              {board.data.items.map((item) => (
                <OperationRow
                  item={item}
                  key={item.id}
                  selected={item.id === selectedItem?.id}
                  onSelect={() => setSelected(item.id)}
                  onOpen={() =>
                    props.update({ section: "assetOperations", asset: item.id, tab: "overview" })
                  }
                />
              ))}
              {!board.data.items.length ? (
                <EmptyQueue
                  filtered={Boolean(props.query || activeFilters || selectedTab !== "all")}
                />
              ) : null}
            </div>
            <Pagination data={board.data} page={props.page} update={props.update} />
          </div>
          <QueuePreview
            item={selectedItem}
            onOpen={() =>
              selectedItem &&
              props.update({ section: "assetOperations", asset: selectedItem.id, tab: "overview" })
            }
          />
        </div>
      </section>
    </main>
  );
}

function Metrics({ counts }: { counts: AssetOperationsBoardResponse["counts"] }) {
  const cards = [
    ["Needs action", counts.needsAction, CircleAlert, "amber"],
    ["Valuation pending", counts.valuationPending, WalletCards, "blue"],
    ["Ownership pending", counts.ownershipPending, Landmark, "violet"],
    ["Offering setup", counts.offeringSetup, Sparkles, "amber"],
    ["Ready for launch", counts.readyForLaunch, CheckCircle2, "mint"],
    ["Market live", counts.marketLive, TrendingUp, "mint"],
    ["Restrictions / exceptions", counts.restrictions, ShieldCheck, "red"],
  ] as const;
  return (
    <section className="asset-operations-metrics" aria-label="Asset Operations summary">
      {cards.map(([label, value, Icon, tone]) =>
        value ? (
          <article key={label} className={`asset-operations-metric ${tone}`}>
            <Icon aria-hidden="true" />
            <div>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          </article>
        ) : null,
      )}
      {!cards.some(([, value]) => value) ? (
        <article className="asset-operations-metric neutral">
          <Building2 aria-hidden="true" />
          <div>
            <span>Operations queue</span>
            <b>0</b>
            <small>No eligible post-custody assets</small>
          </div>
        </article>
      ) : null}
    </section>
  );
}

function Filters(props: Props) {
  const select = (key: string, value: string) =>
    props.update({ [key]: value || undefined, page: "1" });
  return (
    <div className="asset-operations-filters" aria-label="Asset Operations filters">
      <label>
        Category
        <select value={props.category} onChange={(event) => select("category", event.target.value)}>
          <option value="">All</option>
          <option value="pokemon">Pokémon</option>
          <option value="sports">Sports</option>
          <option value="watch">Watches</option>
        </select>
      </label>
      <label>
        Grading
        <select value={props.grader} onChange={(event) => select("grader", event.target.value)}>
          <option value="">All</option>
          <option value="PSA">PSA</option>
          <option value="BGS">BGS</option>
          <option value="CGC">CGC</option>
        </select>
      </label>
      <label>
        Stage
        <select
          value={props.stage}
          onChange={(event) => select("operationsStage", event.target.value)}
        >
          <option value="">All</option>
          <option value="VALUATION">Valuation</option>
          <option value="OWNERSHIP_SETUP">Ownership setup</option>
          <option value="OFFERING_SETUP">Offering setup</option>
          <option value="LAUNCH_READINESS">Launch readiness</option>
          <option value="READY_FOR_LAUNCH">Ready for launch</option>
          <option value="MARKET_LIVE">Market live</option>
          <option value="RESTRICTION">Restrictions</option>
        </select>
      </label>
      <label>
        Valuation
        <select
          value={props.valuation}
          onChange={(event) => select("valuation", event.target.value)}
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="VALUED">Valued</option>
        </select>
      </label>
      <label>
        Ownership
        <select
          value={props.ownership}
          onChange={(event) => select("ownership", event.target.value)}
        >
          <option value="">All</option>
          <option value="NOT_CONFIGURED">Not configured</option>
          <option value="PENDING_APPROVAL">Pending approval</option>
          <option value="CONFIGURED">Configured</option>
          <option value="ISSUED">Issued</option>
        </select>
      </label>
      <label>
        Offering
        <select
          value={props.offering}
          onChange={(event) => select("operationsOffering", event.target.value)}
        >
          <option value="">All</option>
          <option value="NOT_CREATED">Not created</option>
          <option value="DRAFT">Draft</option>
          <option value="AWAITING_APPROVAL">Awaiting approval</option>
          <option value="OPEN">Open</option>
          <option value="SOLD_OUT">Sold out</option>
        </select>
      </label>
      <label>
        Market
        <select value={props.market} onChange={(event) => select("market", event.target.value)}>
          <option value="">All</option>
          <option value="NOT_ELIGIBLE">Not eligible</option>
          <option value="READY_FOR_LAUNCH">Ready for launch</option>
          <option value="INITIAL_OFFERING">Initial offering</option>
          <option value="MARKET_LIVE">Market live</option>
          <option value="PAUSED">Paused</option>
        </select>
      </label>
      <label>
        Work type
        <select value={props.workType} onChange={(event) => select("workType", event.target.value)}>
          <option value="">All</option>
          <option value="PRODUCTION">Production</option>
          <option value="OWNER_DEMO">Owner demo</option>
          <option value="CONTROLLED_QA">Controlled QA</option>
        </select>
      </label>
      <label>
        Attention
        <select
          value={props.attention}
          onChange={(event) => select("operationsAttention", event.target.value)}
        >
          <option value="">All</option>
          <option value="REQUIRES_ATTENTION">Requires attention</option>
        </select>
      </label>
    </div>
  );
}

function OperationRow({
  item,
  selected,
  onSelect,
  onOpen,
}: {
  item: AssetOperationsBoardItem;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className={`asset-operations-grid asset-operations-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <button type="button" className="asset-operations-identity" onClick={onOpen}>
        <Thumbnail src={item.thumbnailUrl} />
        <span>
          <strong>{item.title}</strong>
          <small>
            {item.category.name}
            {item.category.set ? ` · ${item.category.set}` : ""}
            {item.grading.certNumber ? ` · Cert ${item.grading.certNumber}` : ""}
          </small>
          <em>{item.publicId}</em>
        </span>
      </button>
      <State
        state={
          item.physicalPrerequisiteSummary.complete
            ? "Complete"
            : item.physicalPrerequisiteSummary.state
        }
        detail={
          item.physicalPrerequisiteSummary.complete
            ? (item.physicalPrerequisiteSummary.location ?? "Custody secured")
            : sentence(item.entryBlockers[0] ?? "Physical prerequisite")
        }
        tone={item.physicalPrerequisiteSummary.complete ? "mint" : "muted"}
      />
      <State
        state={
          item.valuation.state === "VALUED"
            ? money(item.valuation.valueMinor, item.valuation.currency)
            : "Pending"
        }
        detail={item.valuation.state === "VALUED" ? "Staff valuation" : "No active valuation"}
        tone={item.valuation.state === "VALUED" ? "mint" : "amber"}
      />
      <State
        state={sentence(item.ownership.state)}
        detail={
          item.ownership.issuedUnits
            ? `${item.ownership.issuedUnits} units issued`
            : "No ownership issuance"
        }
        tone={item.ownership.state === "ISSUED" ? "mint" : "muted"}
      />
      <State
        state={sentence(item.offering.state)}
        detail={item.offering.offeringId ? "Initial Offering" : "Not created"}
        tone={item.offering.state === "OPEN" ? "mint" : "muted"}
      />
      <State
        state={sentence(item.market.state)}
        detail={
          item.market.tradingStatus ? sentence(item.market.tradingStatus) : "Publication authority"
        }
        tone={item.market.state === "MARKET_LIVE" ? "mint" : "muted"}
      />
      <div className="asset-operations-next">
        <strong>{item.nextAction.label}</strong>
        <small>{actorLabel(item.nextAction.actor)}</small>
      </div>
      <div className="asset-operations-attention">
        {item.attention.required ? (
          <>
            <span className={`attention-${item.attention.severity.toLowerCase()}`}>
              {item.attention.reasons[0]}
            </span>
            <small>
              <Clock3 aria-hidden="true" /> {item.ageDays}d in stage ·{" "}
              {relativeTime(item.updatedAt)}
            </small>
          </>
        ) : (
          <>
            <span className="attention-none">No escalation</span>
            <small>
              <Clock3 aria-hidden="true" /> {item.ageDays}d in stage ·{" "}
              {relativeTime(item.updatedAt)}
            </small>
          </>
        )}
      </div>
      <button
        type="button"
        className="asset-operations-open"
        onClick={onOpen}
        aria-label={`Open ${item.title}`}
      >
        <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}
function State({ state, detail, tone }: { state: string; detail: string; tone: string }) {
  return (
    <div className="asset-operations-state-cell">
      <span className={`state-${tone}`}>{state}</span>
      <small>{detail}</small>
    </div>
  );
}
function Thumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return !src || failed ? (
    <span className="asset-operations-thumb fallback">
      <ImageIcon aria-hidden="true" />
    </span>
  ) : (
    <img
      className="asset-operations-thumb"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
function QueuePreview({
  item,
  onOpen,
}: {
  item: AssetOperationsBoardItem | null;
  onOpen: () => void;
}) {
  if (!item) return null;
  return (
    <aside className="asset-operations-preview">
      <span>Selected asset</span>
      <h3>{item.title}</h3>
      <p>
        {item.publicId} · {item.workType.replaceAll("_", " ")}
      </p>
      <dl>
        <div>
          <dt>Physical prerequisites</dt>
          <dd>{item.physicalPrerequisiteSummary.complete ? "Complete" : "Blocked"}</dd>
        </div>
        <div>
          <dt>Launch readiness</dt>
          <dd>
            {item.launchReadiness.state === "READY"
              ? "Ready"
              : `${item.launchReadiness.blockers.length} blocker${item.launchReadiness.blockers.length === 1 ? "" : "s"}`}
          </dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{item.nextAction.label}</dd>
        </div>
      </dl>
      {item.launchReadiness.blockers.length ? (
        <ul>
          {item.launchReadiness.blockers.slice(0, 3).map((blocker) => (
            <li key={blocker}>{sentence(blocker)}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" onClick={onOpen}>
        Open Asset Operations <ArrowRight aria-hidden="true" />
      </button>
      <a href={`/admin?section=collectibles&asset=${encodeURIComponent(item.id)}`}>
        Open canonical collectible <ExternalLink aria-hidden="true" />
      </a>
    </aside>
  );
}
function Pagination({
  data,
  page,
  update,
}: {
  data: AssetOperationsBoardResponse;
  page: number;
  update: Props["update"];
}) {
  const start = data.pagination.total ? (page - 1) * data.pagination.pageSize + 1 : 0;
  return (
    <footer className="asset-operations-pagination">
      <span>
        Showing {start}–{Math.min(page * data.pagination.pageSize, data.pagination.total)} of{" "}
        {data.pagination.total}
      </span>
      <div>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => update({ page: String(page - 1) })}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <b>{page}</b>
        <button
          type="button"
          disabled={page >= data.pagination.totalPages}
          onClick={() => update({ page: String(page + 1) })}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
function EmptyQueue({ filtered }: { filtered: boolean }) {
  const copy = assetOperationsEmptyCopy(filtered);
  return (
    <div className="asset-operations-empty">
      <CheckCircle2 aria-hidden="true" />
      <h3>{copy.title}</h3>
      <p>{copy.detail}</p>
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
function sentence(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function actorLabel(actor: AssetOperationsBoardItem["nextAction"]["actor"]) {
  return actor === "NONE"
    ? "No assigned action"
    : `Next actor: ${actor === "STAFF" ? "Staff" : actor === "COLLECTOR" ? "Collector" : "System"}`;
}
function money(value: string | null, currency: string | null) {
  if (!value || !currency) return "Valued";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) / 100);
}
function relativeTime(value: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 24 ? `updated ${hours}h ago` : `updated ${Math.floor(hours / 24)}d ago`;
}
