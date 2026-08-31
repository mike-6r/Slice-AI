import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Image as ImageIcon,
  MoreHorizontal,
  Rocket,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { AssetOperationsBoardItem, AssetOperationsBoardResponse } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import {
  assetOperationsBlockerSummary,
  assetOperationsEmptyCopy,
  assetOperationsHealthSegments,
  assetOperationsMarketPresentation,
  assetOperationsTabCount,
  assetOperationsTabs,
  resolveAssetOperationsSelection,
} from "./AdminAssetOperations.presentation";
import "@/styles/admin-operations.css";
import "@/styles/admin-asset-operations-reference.css";

type Props = {
  tab?: string;
  selectedId?: string;
  query: string;
  stage: string;
  market: string;
  workType: string;
  attention: string;
  assignee: string;
  sort: string;
  page: number;
  update: (patch: Record<string, string | undefined>) => void;
};

export function AdminAssetOperations(props: Props) {
  const services = useAppServices();
  const [search, setSearch] = useState(props.query);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [selected, setSelected] = useState<string | "closed" | null>(
    props.selectedId === "closed" ? "closed" : (props.selectedId ?? null),
  );
  const selectedTab = assetOperationsTabs.some(([key]) => key === props.tab) ? props.tab! : "all";
  const board = useQuery({
    queryKey: [
      "admin",
      "asset-operations",
      selectedTab,
      props.query,
      props.stage,
      props.market,
      props.workType,
      props.attention,
      props.assignee,
      props.sort,
      props.page,
    ],
    queryFn: () =>
      services.repositories.lifecycle.getOperationsBoard({
        tab: selectedTab,
        q: props.query || undefined,
        stage: props.stage || undefined,
        market: props.market || undefined,
        workType: props.workType || undefined,
        attention: props.attention || undefined,
        assignee: props.assignee || undefined,
        sort: props.sort || "NEEDS_ACTION",
        page: props.page,
        // Keeps the queue and its operational insights in one desktop view
        // while retaining true server-side pagination.
        pageSize: 6,
      }),
    staleTime: 15_000,
  });

  useEffect(() => setSearch(props.query), [props.query]);
  useEffect(() => {
    setSelected((current) => resolveAssetOperationsSelection(current, props.selectedId));
  }, [props.selectedId]);
  useEffect(() => {
    if (!viewMenuOpen) return;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewMenuOpen(false);
    };
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
  }, [viewMenuOpen]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = search.trim() || undefined;
      if (value !== (props.query || undefined)) props.update({ q: value, page: "1" });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [search, props]);

  const activeFilters = [
    props.stage,
    props.market,
    props.workType,
    props.attention,
    props.assignee,
  ].filter(Boolean).length;
  const selectedItem =
    selected === "closed"
      ? null
      : (board.data?.items.find((item) => item.id === selected) ?? board.data?.items[0] ?? null);

  if (board.isLoading) return <OperationsLoading />;
  if (board.isError || !board.data)
    return (
      <OperationsState
        title="Asset Operations unavailable"
        detail="The operations authority could not be loaded. No lifecycle state has been inferred."
        retry={() => void board.refetch()}
      />
    );

  const openItem = (item: AssetOperationsBoardItem) =>
    props.update({ section: "assetOperations", asset: item.id, tab: "overview" });
  const clear = () =>
    props.update({
      q: undefined,
      operationsStage: undefined,
      market: undefined,
      workType: undefined,
      operationsAttention: undefined,
      operationsPriority: undefined,
      operationsAssignee: undefined,
      tab: undefined,
      page: "1",
    });

  return (
    <main className="asset-operations-page asset-operations-page--reference">
      <header className="asset-operations-header">
        <div>
          <p>
            Admin Console <span>›</span> Asset Operations
          </p>
          <h2>Asset Operations</h2>
          <span>
            Manage post-receipt assets from valuation through launch and live market operations.
          </span>
        </div>
        <div className="asset-operations-header-actions">
          <a className="admin-ops-button" href="/admin?section=intake">
            <ArrowRight aria-hidden="true" /> Open Physical Intake
          </a>
          <div className="asset-operations-view-menu">
            <button
              type="button"
              className="admin-ops-button primary"
              aria-expanded={viewMenuOpen}
              aria-haspopup="menu"
              onClick={() => setViewMenuOpen((open) => !open)}
            >
              Operational views <ChevronDown aria-hidden="true" />
            </button>
            {viewMenuOpen ? (
              <div className="asset-operations-view-options" role="menu">
                <button
                  type="button"
                  onClick={() => {
                    props.update({ tab: "all", page: "1" });
                    setViewMenuOpen(false);
                  }}
                >
                  All active assets
                </button>
                <button
                  type="button"
                  onClick={() => {
                    props.update({ tab: "needs-action", page: "1" });
                    setViewMenuOpen(false);
                  }}
                >
                  Needs action
                </button>
                <button
                  type="button"
                  onClick={() => {
                    props.update({ tab: "ready-for-launch", page: "1" });
                    setViewMenuOpen(false);
                  }}
                >
                  Ready for launch
                </button>
                <button
                  type="button"
                  onClick={() => {
                    props.update({ tab: "market-live", page: "1" });
                    setViewMenuOpen(false);
                  }}
                >
                  Market live
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="asset-operations-desktop-layout">
        <div className="asset-operations-primary">
          <Metrics counts={board.data.counts} />
          <section className="asset-operations-workspace">
            <nav className="asset-operations-tabs" aria-label="Asset Operations queues">
              {assetOperationsTabs.map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={selectedTab === key ? "active" : ""}
                  onClick={() => props.update({ tab: key === "all" ? undefined : key, page: "1" })}
                >
                  {label}
                  <b>{assetOperationsTabCount(key, board.data.counts)}</b>
                </button>
              ))}
            </nav>
            <div className="asset-operations-tools asset-operations-tools--reference">
              <label className="asset-operations-search">
                <Search aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search collectible, collector, asset ID, cert…"
                  aria-label="Search Asset Operations"
                />
              </label>
              <Filter
                label="Stage"
                value={props.stage}
                onChange={(value) =>
                  props.update({ operationsStage: value || undefined, page: "1" })
                }
              >
                <option value="">All stages</option>
                <option value="PHYSICAL_PREREQUISITE">Physical prerequisites</option>
                <option value="VALUATION">Valuation</option>
                <option value="OWNERSHIP_SETUP">Ownership</option>
                <option value="OFFERING_SETUP">Offering setup</option>
                <option value="LAUNCH_READINESS">Launch readiness</option>
                <option value="READY_FOR_LAUNCH">Ready for launch</option>
                <option value="MARKET_LIVE">Market live</option>
                <option value="RESTRICTION">Restricted</option>
              </Filter>
              <Filter
                label="Market state"
                value={props.market}
                onChange={(value) => props.update({ market: value || undefined, page: "1" })}
              >
                <option value="">All market states</option>
                <option value="NOT_ELIGIBLE">Not live</option>
                <option value="INITIAL_OFFERING">Initial Offering</option>
                <option value="READY_FOR_LAUNCH">Launch review</option>
                <option value="MARKET_LIVE">Market live</option>
                <option value="PAUSED">Paused</option>
                <option value="RESTRICTED">Restricted</option>
              </Filter>
              <Filter
                label="Work type"
                value={props.workType}
                onChange={(value) => props.update({ workType: value || undefined, page: "1" })}
              >
                <option value="">All work types</option>
                <option value="PRODUCTION">Production</option>
                <option value="OWNER_DEMO">Owner demo</option>
                <option value="CONTROLLED_QA">Controlled QA</option>
              </Filter>
              <Filter
                label="Review"
                value={props.attention}
                onChange={(value) =>
                  props.update({ operationsAttention: value || undefined, page: "1" })
                }
              >
                <option value="">All review states</option>
                <option value="REQUIRES_ATTENTION">Review required</option>
              </Filter>
              <Filter
                label="Assignee"
                value={props.assignee}
                onChange={(value) =>
                  props.update({ operationsAssignee: value || undefined, page: "1" })
                }
              >
                <option value="">All assignees</option>
                <option value="UNASSIGNED">Unassigned</option>
                {board.data.filterOptions.assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.displayName}
                  </option>
                ))}
              </Filter>
              <Filter
                label="Sort"
                value={props.sort}
                onChange={(value) => props.update({ sort: value, page: "1" })}
              >
                <option value="NEEDS_ACTION">Sort: Needs action first</option>
                <option value="UPDATED_DESC">Recently updated</option>
                <option value="NEWEST">Newest stage</option>
                <option value="STAGE_OLDEST">Oldest in stage</option>
                <option value="TITLE">Title</option>
                <option value="READY_FIRST">Ready for launch</option>
              </Filter>
              <button
                type="button"
                className="asset-operations-clear"
                disabled={!activeFilters && !props.query}
                onClick={clear}
              >
                <X aria-hidden="true" /> Clear filters
              </button>
            </div>
            <div className="asset-operations-table-wrap" role="table" aria-label="Active assets">
              <div className="asset-operations-grid asset-operations-grid--head" role="row">
                <span role="columnheader">Collectible</span>
                <span role="columnheader">Stage</span>
                <span role="columnheader">Readiness / next action</span>
                <span role="columnheader">Offering progress</span>
                <span role="columnheader">Market state</span>
                <span role="columnheader">Assignee</span>
                <span role="columnheader">Review</span>
                <span role="columnheader">Updated</span>
                <span role="columnheader">Action</span>
              </div>
              <div className="asset-operations-table">
                {board.data.items.map((item) => (
                  <OperationRow
                    item={item}
                    key={item.id}
                    selected={item.id === selectedItem?.id}
                    onSelect={() => {
                      setSelected(item.id);
                      props.update({ operationsSelected: item.id });
                    }}
                    onOpen={() => openItem(item)}
                  />
                ))}
                {!board.data.items.length ? (
                  <EmptyQueue
                    filtered={Boolean(props.query || activeFilters || selectedTab !== "all")}
                  />
                ) : null}
              </div>
              <Pagination data={board.data} page={props.page} update={props.update} />
              <OperationalInsights
                data={board.data}
                onOpen={(itemId) =>
                  props.update({ section: "assetOperations", asset: itemId, tab: "overview" })
                }
                onReviewBlockers={() =>
                  props.update({
                    tab: "needs-action",
                    operationsAttention: "REQUIRES_ATTENTION",
                    page: "1",
                  })
                }
                onOpenOwnership={() => props.update({ tab: "ownership", page: "1" })}
              />
            </div>
          </section>
        </div>
        <QueuePreview
          item={selectedItem}
          onClose={() => {
            setSelected("closed");
            props.update({ operationsSelected: undefined });
          }}
          onOpen={() => selectedItem && openItem(selectedItem)}
        />
      </div>
    </main>
  );
}

function Metrics({ counts }: { counts: AssetOperationsBoardResponse["counts"] }) {
  const cards = [
    ["Active assets in operations", counts.all, Boxes, "neutral", "Across all stages"],
    ["Needs action", counts.needsAction, CircleAlert, "amber", "Requires immediate attention"],
    ["Ready for launch", counts.readyForLaunch, Rocket, "green", "Cleared for launch review"],
    ["Market live", counts.marketLive, TrendingUp, "mint", "Trading on marketplace"],
    ["Restricted", counts.restrictions, ShieldCheck, "amber", "Blocked or under review"],
    ["Exceptions", counts.exceptions, ShieldAlert, "red", "Policy or process exceptions"],
  ] as const;
  return (
    <section className="asset-operations-metrics" aria-label="Asset Operations summary">
      {cards.map(([label, value, Icon, tone, detail]) => (
        <article
          key={label}
          className={`asset-operations-metric ${tone} ${value === 0 ? "is-zero" : ""}`}
          title={`${label}: ${value}. ${detail}`}
        >
          <Icon aria-hidden="true" />
          <div>
            <span>{label}</span>
            <b>{value}</b>
            <small>{detail}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="asset-operations-filter">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" />
    </label>
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
  const progress = offeringProgress(item);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
  }, [menuOpen]);
  return (
    <article
      className={`asset-operations-grid asset-operations-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      aria-label={`Select ${item.title}`}
      aria-selected={selected}
      role="row"
    >
      <button
        type="button"
        className="asset-operations-identity"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <Thumbnail src={item.thumbnailUrl} alt={item.title} />
        <span>
          <strong title={item.title}>{item.title}</strong>
          <small title={item.category.set ?? item.category.name}>
            {item.category.name}
            {item.category.set ? ` · ${item.category.set}` : ""}
            {item.grading.certNumber ? ` · Cert ${item.grading.certNumber}` : ""}
          </small>
          <em title={`${item.publicId} — open the asset to copy the full ID`}>
            Asset ID: {shortIdentifier(item.publicId)}
          </em>
          <small
            title={
              item.collector?.username
                ? `@${item.collector.username}`
                : (item.collector?.displayName ?? "Unavailable")
            }
          >
            Collector:{" "}
            {item.collector?.username
              ? `@${item.collector.username}`
              : (item.collector?.displayName ?? "Unavailable")}
            {item.workType !== "PRODUCTION" ? ` · ${workTypeLabel(item.workType)}` : ""}
          </small>
        </span>
      </button>
      <State
        state={stageLabel(item.currentStage)}
        detail={tableStageDetail(item)}
        tone={stageTone(item.currentStage)}
      />
      <div className="asset-operations-next">
        <strong>{item.nextAction.label}</strong>
        <small>{tableNextActionDetail(item)}</small>
      </div>
      <div className="asset-operations-offering">
        <strong>{progress.label}</strong>
        <div>
          <i style={{ width: `${progress.percent}%` }} />
        </div>
        <small>{progress.detail}</small>
      </div>
      <State {...tableMarketPresentation(item)} />
      <div className="asset-operations-assignee">
        <span>{initials(item.assignee?.displayName ?? "Unassigned")}</span>
        <div>
          <strong>{item.assignee?.displayName ?? "Unassigned"}</strong>
          <small>{item.assignee ? "Assigned" : "No staff assignment"}</small>
        </div>
      </div>
      <Attention item={item} />
      <div className="asset-operations-updated">
        <strong>{relativeTime(item.updatedAt)}</strong>
        <small>{formatDate(item.updatedAt)}</small>
      </div>
      <div className="asset-operations-row-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="asset-operations-open"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`Actions for ${item.title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
        {menuOpen ? <RowActions item={item} onOpen={onOpen} /> : null}
      </div>
    </article>
  );
}

function RowActions({ item, onOpen }: { item: AssetOperationsBoardItem; onOpen: () => void }) {
  return (
    <div className="asset-operations-row-menu" role="menu">
      <button type="button" role="menuitem" onClick={onOpen}>
        Open Asset Operations
      </button>
      <a role="menuitem" href={`/admin?section=collectibles&asset=${encodeURIComponent(item.id)}`}>
        View Collectible
      </a>
      <a
        role="menuitem"
        href={`/admin?section=moderation&submission=${encodeURIComponent(item.sourceContext.submissionId)}`}
      >
        View source submission
      </a>
      {item.sourceContext.intakeId ? (
        <a
          role="menuitem"
          href={`/admin?section=intake&intake=${encodeURIComponent(item.sourceContext.intakeId)}`}
        >
          Open Physical Intake
        </a>
      ) : null}
      {item.collector ? (
        <a
          role="menuitem"
          href={`/admin?section=users&user=${encodeURIComponent(item.collector.id)}`}
        >
          View collector
        </a>
      ) : null}
      {item.market.state === "MARKET_LIVE" ? (
        <a role="menuitem" href={`/asset/${encodeURIComponent(item.slug)}`}>
          Open public listing
        </a>
      ) : null}
    </div>
  );
}

function State({ state, detail, tone }: { state: string; detail: string; tone: string }) {
  return (
    <div className="asset-operations-state-cell" title={`${state}: ${detail}`}>
      <span className={`state-${tone}`}>{state}</span>
      <small>{detail}</small>
    </div>
  );
}

function Attention({ item }: { item: AssetOperationsBoardItem }) {
  if (!item.attention.required) {
    return <span className="asset-operations-attention attention-none">—</span>;
  }
  return (
    <span className="asset-operations-attention attention-required">
      <i aria-hidden="true" /> Review required
    </span>
  );
}
function Thumbnail({ src, alt = "" }: { src: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false);
  return !src || failed ? (
    <span className="asset-operations-thumb fallback" role="img" aria-label="Media unavailable">
      <ImageIcon aria-hidden="true" />
    </span>
  ) : (
    <img
      className="asset-operations-thumb"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function QueuePreview({
  item,
  onClose,
  onOpen,
}: {
  item: AssetOperationsBoardItem | null;
  onClose: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(".asset-operations-view-options, .asset-operations-row-menu")
      )
        onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [item, onClose]);

  if (!item) return null;
  const progress = offeringProgress(item);
  const blockers = [
    ...new Set([
      ...item.entryBlockers,
      ...item.launchReadiness.blockers,
      ...(item.exception ? [item.exception.type] : []),
    ]),
  ];
  return (
    <>
      <button
        type="button"
        className="asset-operations-preview-backdrop"
        onClick={onClose}
        aria-label="Close selected asset drawer"
      />
      <aside className="asset-operations-preview" aria-label={`Selected asset: ${item.title}`}>
        <button
          type="button"
          className="asset-operations-preview-close"
          onClick={onClose}
          aria-label="Close selected asset"
        >
          <X aria-hidden="true" />
        </button>
        <span>Selected asset</span>
        <div className="asset-operations-preview-identity">
          <Thumbnail src={item.thumbnailUrl} alt={item.title} />
          <div>
            <h3 title={item.title}>{item.title}</h3>
            <p>
              {item.category.name}
              {item.grading.certNumber ? ` · Cert ${item.grading.certNumber}` : ""}
            </p>
            <strong title={item.publicId}>{item.publicId}</strong>
            <small>
              Collector:{" "}
              {item.collector?.username
                ? `@${item.collector.username}`
                : (item.collector?.displayName ?? "Unavailable")}
            </small>
          </div>
        </div>
        <div className="asset-operations-preview-stage">
          <span>Stage</span>
          <strong className={`state-${stageTone(item.currentStage)}`}>
            {stageLabel(item.currentStage)}
          </strong>
          <p>{stageDetail(item)}</p>
        </div>
        <PreviewSection
          title="Economic snapshot"
          rows={[
            ["Total Slices", item.ownership.totalUnits ?? item.offering.totalUnits ?? "—"],
            ["Units sold", progress.label === "Not launched" ? "—" : progress.label],
            ["Initial offer price", money(item.offering.pricePerUnitMinor, item.offering.currency)],
            ["Total valuation", money(item.valuation.valueMinor, item.valuation.currency)],
            ["Valuation state", sentence(item.valuation.state)],
          ]}
        />
        <BlockerPreview item={item} blockers={blockers} />
        <div className="asset-operations-preview-workflow">
          <span>Lifecycle / economic workflow</span>
          <div role="list" aria-label="Economic workflow progress">
            {workflowSteps(item).map(([label, tone], index) => (
              <div className={tone} key={label} role="listitem">
                <i>{index + 1}</i>
                <small>{label}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="asset-operations-preview-links">
          <span>Quick links</span>
          <button type="button" onClick={onOpen}>
            Open Asset Operations <ArrowRight aria-hidden="true" />
          </button>
          <a href={`/admin?section=collectibles&asset=${encodeURIComponent(item.id)}`}>
            View Collectible <ExternalLink aria-hidden="true" />
          </a>
          <a
            href={`/admin?section=moderation&submission=${encodeURIComponent(item.sourceContext.submissionId)}`}
          >
            View Source Submission <ExternalLink aria-hidden="true" />
          </a>
          {item.sourceContext.intakeId ? (
            <a
              href={`/admin?section=intake&intake=${encodeURIComponent(item.sourceContext.intakeId)}`}
            >
              Open Physical Intake <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {item.collector ? (
            <a href={`/admin?section=users&user=${encodeURIComponent(item.collector.id)}`}>
              View Collector <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {item.market.state === "MARKET_LIVE" ? (
            <a href={`/asset/${encodeURIComponent(item.slug)}`}>
              Open Public Listing <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function PreviewSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="asset-operations-preview-section">
      <span>{title}</span>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BlockerPreview({
  item,
  blockers,
}: {
  item: AssetOperationsBoardItem;
  blockers: string[];
}) {
  const primary = item.exception?.type ?? blockers[0];
  if (!primary) return <PreviewSection title="Blockers" rows={[["No active blockers", ""]]} />;

  return (
    <section className="asset-operations-preview-section asset-operations-preview-blocker">
      <span>Blockers</span>
      <a href="/admin?section=assetOperations&operationsAttention=REQUIRES_ATTENTION">
        <i aria-hidden="true" />
        <div>
          <strong>{blockerLabel(primary)}</strong>
          <small>{blockerExplanation(item, primary)}</small>
        </div>
        <ArrowRight aria-hidden="true" />
      </a>
    </section>
  );
}

function OperationalInsights({
  data,
  onOpen,
  onReviewBlockers,
  onOpenOwnership,
}: {
  data: AssetOperationsBoardResponse;
  onOpen: (itemId: string) => void;
  onReviewBlockers: () => void;
  onOpenOwnership: () => void;
}) {
  const health = data.insights.health;
  const classifiedTotal = health.onTrack + health.atRisk + health.blocked + health.exceptions;
  const total = Math.max(1, classifiedTotal);
  const healthSegments = assetOperationsHealthSegments(health);
  const maxBlockerCount = Math.max(1, ...data.insights.blockers.map((entry) => entry.count));
  const blockerSummary = assetOperationsBlockerSummary(
    data.counts.needsAction,
    data.insights.blockers,
  );
  return (
    <section className="asset-operations-insights" aria-label="Operational insights">
      <article>
        <span>Operational health</span>
        <div className="asset-operations-health-content">
          <div
            className="asset-operations-donut"
            role="img"
            aria-label={
              healthSegments.length
                ? `${data.counts.all} active assets; ${healthSegments.map((entry) => `${entry.label} ${entry.value}, ${entry.percent}%`).join("; ")}`
                : `${data.counts.all} active assets; no health classifications`
            }
            style={{
              background: classifiedTotal
                ? `conic-gradient(var(--accent) 0 ${(health.onTrack / total) * 100}%, #e8ae46 0 ${((health.onTrack + health.atRisk) / total) * 100}%, #ef8985 0 ${((health.onTrack + health.atRisk + health.blocked) / total) * 100}%, #9c6ad5 0 100%)`
                : "rgba(119, 143, 154, 0.24)",
            }}
          >
            <b>{data.counts.all}</b>
            <small>Active</small>
          </div>
          <dl>
            {healthSegments.map((entry) => (
              <div key={entry.key}>
                <dt>
                  <i className={`health-dot ${entry.key}`} aria-hidden="true" />
                  {entry.label}
                </dt>
                <dd>
                  {entry.value} <small>{entry.percent}%</small>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </article>
      <article>
        <span>Recent meaningful activity</span>
        <ul className="asset-operations-insight-list">
          {data.insights.recentlyUpdated.length ? (
            data.insights.recentlyUpdated.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => {
                    onOpen(record.id);
                  }}
                >
                  <strong>{record.title}</strong>
                  <small>
                    {activityDescription(
                      data.items.find((candidate) => candidate.id === record.id),
                      record.stage,
                    )}
                    <time dateTime={record.updatedAt}>{relativeTime(record.updatedAt)}</time>
                  </small>
                </button>
              </li>
            ))
          ) : (
            <li>
              <small>No operational records are available yet.</small>
            </li>
          )}
        </ul>
      </article>
      <article>
        <span>Blockers needing review</span>
        <div className="asset-operations-insight-stat">
          <strong className="asset-operations-insight-number">{blockerSummary.assets}</strong>
          <span>{blockerSummary.assets === 1 ? "Asset blocked" : "Assets blocked"}</span>
          <small>
            {blockerSummary.conditions} active blocking{" "}
            {blockerSummary.conditions === 1 ? "condition" : "conditions"}
          </small>
        </div>
        <ul className="asset-operations-insight-list">
          {data.insights.blockers.length ? (
            data.insights.blockers.map((blocker) => (
              <li className="asset-operations-blocker-reason" key={blocker.code}>
                <span>
                  <small title={sentence(blocker.code)}>{sentence(blocker.code)}</small>
                  <b>{blocker.count}</b>
                </span>
                <i aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.round((blocker.count / maxBlockerCount) * 100)}%`,
                    }}
                  />
                </i>
              </li>
            ))
          ) : (
            <li>
              <small>No active blockers.</small>
            </li>
          )}
        </ul>
        {data.insights.blockers.length ? (
          <button
            className="asset-operations-insight-action"
            type="button"
            onClick={onReviewBlockers}
          >
            Review blockers <ArrowRight aria-hidden="true" />
          </button>
        ) : null}
      </article>
      <article>
        <span>Assets awaiting ownership issuance</span>
        <strong className="asset-operations-insight-number violet">
          {data.insights.ownership.total}
        </strong>
        {data.insights.ownership.total ? (
          <dl>
            <div>
              <dt>Draft created</dt>
              <dd>{data.insights.ownership.draft}</dd>
            </div>
            <div>
              <dt>Pending review</dt>
              <dd>{data.insights.ownership.pending}</dd>
            </div>
            <div>
              <dt>Configured</dt>
              <dd>{data.insights.ownership.configured}</dd>
            </div>
          </dl>
        ) : (
          <p className="asset-operations-insight-empty">
            No assets are awaiting ownership issuance.
          </p>
        )}
        {data.insights.ownership.total ? (
          <button
            className="asset-operations-insight-action"
            type="button"
            onClick={onOpenOwnership}
          >
            Open ownership queue <ArrowRight aria-hidden="true" />
          </button>
        ) : null}
      </article>
    </section>
  );
}

function activityDescription(item: AssetOperationsBoardItem | undefined, stage: string) {
  if (item?.exception) return blockerLabel(item.exception.type);
  if (stage === "RESTRICTION") return "Restriction review updated";
  if (stage === "MARKET_LIVE") return "Market activity updated";
  if (stage === "READY_FOR_LAUNCH") return "Launch readiness updated";
  return `${stageLabel(stage)} status updated`;
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
        {data.pagination.total} assets
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

function OperationsLoading() {
  return (
    <main className="asset-operations-page asset-operations-page--reference">
      <div className="asset-operations-skeleton-header">
        <i />
        <b />
        <span />
      </div>
      <div className="asset-operations-desktop-layout" aria-label="Loading Asset Operations">
        <div className="asset-operations-primary">
          <div className="asset-operations-skeleton-metrics">
            {Array.from({ length: 6 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <section className="asset-operations-workspace asset-operations-skeleton-workspace">
            <i />
            <i />
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} />
            ))}
          </section>
        </div>
        <aside className="asset-operations-preview asset-operations-skeleton-preview">
          <i />
          <i />
          <i />
        </aside>
      </div>
    </main>
  );
}
function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    PHYSICAL_PREREQUISITE: "Physical blocked",
    OWNERSHIP_SETUP: "Ownership",
    OFFERING_SETUP: "Offering setup",
    LAUNCH_READINESS: "Launch review",
    READY_FOR_LAUNCH: "Ready for launch",
    MARKET_LIVE: "Market live",
    RESTRICTION: "Restricted",
  };
  return labels[stage] ?? sentence(stage);
}
function stageTone(stage: string) {
  return stage === "MARKET_LIVE" || stage === "READY_FOR_LAUNCH"
    ? "mint"
    : stage === "RESTRICTION"
      ? "red"
      : stage === "VALUATION"
        ? "blue"
        : "violet";
}
function stageDetail(item: AssetOperationsBoardItem) {
  return item.currentStage === "RESTRICTION"
    ? (item.exception?.summary ?? "Operational restriction requires review")
    : item.currentStage === "VALUATION"
      ? "Valuation needed"
      : item.currentStage === "MARKET_LIVE"
        ? "Live on marketplace"
        : item.launchReadiness.state === "READY"
          ? "Launch review ready"
          : item.nextAction.label;
}
function tableStageDetail(item: AssetOperationsBoardItem) {
  if (item.currentStage === "RESTRICTION") return "Physical conflict";
  if (item.currentStage === "VALUATION") return "Valuation needed";
  if (item.currentStage === "MARKET_LIVE") return "Live on marketplace";
  if (item.currentStage === "READY_FOR_LAUNCH") return "Ready for review";
  if (item.currentStage === "OWNERSHIP_SETUP") return "Ownership work";
  if (item.currentStage === "OFFERING_SETUP") return "Configure offering";
  return compactLabel(item.nextAction.label, "Review required");
}
function marketDetail(item: AssetOperationsBoardItem) {
  return item.market.state === "RESTRICTED"
    ? "Historical state conflict"
    : item.market.tradingStatus
      ? sentence(item.market.tradingStatus)
      : item.market.state === "MARKET_LIVE"
        ? "Trading"
        : "Not launched";
}
function tableMarketDetail(item: AssetOperationsBoardItem) {
  if (item.market.state === "RESTRICTED") return "Historical published state";
  if (item.market.state === "MARKET_LIVE") return "Trading";
  if (item.market.state === "READY_FOR_LAUNCH") return "Launch review";
  if (item.market.state === "INITIAL_OFFERING") return "Offering active";
  return "Not launched";
}
function tableMarketPresentation(item: AssetOperationsBoardItem) {
  return (
    assetOperationsMarketPresentation(item.market.state) ?? {
      state: sentence(item.market.state),
      detail: tableMarketDetail(item),
      tone: "muted",
    }
  );
}
function nextActionDetail(item: AssetOperationsBoardItem) {
  const reason =
    item.exception?.summary ?? item.attention.reasons[0] ?? item.launchReadiness.blockers[0];
  return reason
    ? sentence(reason)
    : item.nextAction.actor === "NONE"
      ? "Monitoring live market activity"
      : `Next actor: ${sentence(item.nextAction.actor)}`;
}
function tableNextActionDetail(item: AssetOperationsBoardItem) {
  if (item.currentStage === "RESTRICTION") return "Physical authority incomplete";
  if (item.currentStage === "VALUATION") return "Establish fair value";
  if (item.currentStage === "OWNERSHIP_SETUP") return "Review ownership structure";
  if (item.currentStage === "OFFERING_SETUP") return "Set terms and price";
  if (item.currentStage === "LAUNCH_READINESS") return "Final launch review";
  if (item.market.state === "MARKET_LIVE") return "Monitor market activity";
  return compactLabel(nextActionDetail(item), "Staff review required");
}
function offeringProgress(item: AssetOperationsBoardItem) {
  const offered = item.offering.offeredUnits;
  const sold = item.offering.soldUnits;
  if (!offered || sold === null) return { label: "Not launched", detail: "0%", percent: 0 };
  const percent = percentage(sold, offered);
  return { label: `${sold} / ${offered} sold`, detail: `${percent}%`, percent };
}
function workflowSteps(item: AssetOperationsBoardItem) {
  return [
    [
      "Valuation",
      item.valuation.state === "VALUED"
        ? "complete"
        : item.currentStage === "VALUATION"
          ? "current"
          : "blocked",
    ],
    [
      "Ownership",
      item.ownership.state === "ISSUED"
        ? "complete"
        : item.currentStage === "OWNERSHIP_SETUP"
          ? "current"
          : "blocked",
    ],
    [
      "Offering",
      ["OPEN", "PARTIALLY_FILLED", "SOLD_OUT"].includes(item.offering.state)
        ? "complete"
        : item.currentStage === "OFFERING_SETUP"
          ? "current"
          : "blocked",
    ],
    [
      "Launch",
      item.launchReadiness.state === "READY"
        ? "complete"
        : item.currentStage === "LAUNCH_READINESS"
          ? "current"
          : "blocked",
    ],
    ["Market", item.market.state === "MARKET_LIVE" ? "complete" : "blocked"],
  ] as Array<[string, string]>;
}
function percentage(value: string, total: string) {
  const denominator = Number(total);
  return denominator > 0
    ? Math.max(0, Math.min(100, Math.round((Number(value) / denominator) * 100)))
    : 0;
}
function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function shortIdentifier(value: string) {
  return value.length > 19 ? `${value.slice(0, 15)}…` : value;
}
function workTypeLabel(value: AssetOperationsBoardItem["workType"]) {
  return value === "OWNER_DEMO" ? "Demo" : "Controlled QA";
}
function compactLabel(value: string, fallback: string) {
  const normalized = sentence(value).replace(/\.$/, "");
  return normalized.length > 34 ? `${normalized.slice(0, 31)}…` : normalized || fallback;
}
function blockerLabel(value: string) {
  return value === "LIFECYCLE_PHYSICAL_MARKET_CONFLICT"
    ? "Physical authority conflict"
    : compactLabel(value, "Operational review required");
}
function blockerExplanation(item: AssetOperationsBoardItem, blocker: string) {
  if (blocker === "LIFECYCLE_PHYSICAL_MARKET_CONFLICT") {
    return "Published market state conflicts with incomplete verification or custody authority.";
  }
  return item.exception?.summary ?? "This operational blocker requires staff review.";
}
function sentence(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function money(value: string | null, currency: string | null) {
  if (!value || !currency) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) / 100);
}
function relativeTime(value: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
