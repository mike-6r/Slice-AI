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
  assetOperationsEmptyCopy,
  assetOperationsTabCount,
  assetOperationsTabs,
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
  useEffect(
    () => setSelected(props.selectedId === "closed" ? "closed" : (props.selectedId ?? null)),
    [props.selectedId],
  );
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
              onClick={() => setViewMenuOpen((open) => !open)}
            >
              New operational view <ChevronDown aria-hidden="true" />
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
                  placeholder="Search collectible, collector, asset ID, submission, cert…"
                />
              </label>
              <Filter
                label="Stage"
                value={props.stage}
                onChange={(value) =>
                  props.update({ operationsStage: value || undefined, page: "1" })
                }
              >
                <option value="">Stage</option>
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
                <option value="">Market state</option>
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
                <option value="">Work type</option>
                <option value="PRODUCTION">Production</option>
                <option value="OWNER_DEMO">Owner demo</option>
                <option value="CONTROLLED_QA">Controlled QA</option>
              </Filter>
              <Filter
                label="Priority"
                value={props.attention}
                onChange={(value) =>
                  props.update({ operationsAttention: value || undefined, page: "1" })
                }
              >
                <option value="">Priority</option>
                <option value="REQUIRES_ATTENTION">Review required</option>
              </Filter>
              <Filter
                label="Assignee"
                value={props.assignee}
                onChange={(value) =>
                  props.update({ operationsAssignee: value || undefined, page: "1" })
                }
              >
                <option value="">Assignee</option>
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
            <div className="asset-operations-table-wrap">
              <div className="asset-operations-grid asset-operations-grid--head" aria-hidden="true">
                <span>Collectible</span>
                <span>Stage</span>
                <span>Readiness / next action</span>
                <span>Offering progress</span>
                <span>Market state</span>
                <span>Assignee</span>
                <span>Priority</span>
                <span>Updated</span>
                <span>Action</span>
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
                onOpen={openItem}
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
            props.update({ operationsSelected: "closed" });
          }}
          onOpen={() => selectedItem && openItem(selectedItem)}
        />
      </div>
    </main>
  );
}

function Metrics({ counts }: { counts: AssetOperationsBoardResponse["counts"] }) {
  const cards = [
    ["Active assets in operations", counts.all, Boxes, "mint", "Across all stages"],
    ["Needs action", counts.needsAction, CircleAlert, "amber", "Requires immediate attention"],
    ["Ready for launch", counts.readyForLaunch, Rocket, "green", "Cleared for launch review"],
    ["Market live", counts.marketLive, TrendingUp, "mint", "Trading on marketplace"],
    ["Restricted", counts.restrictions, ShieldCheck, "amber", "Blocked or under review"],
    ["Exceptions", counts.exceptions, ShieldAlert, "red", "Policy or process exceptions"],
  ] as const;
  return (
    <section className="asset-operations-metrics" aria-label="Asset Operations summary">
      {cards.map(([label, value, Icon, tone, detail]) => (
        <article key={label} className={`asset-operations-metric ${tone}`}>
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
  return (
    <article
      className={`asset-operations-grid asset-operations-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <button
        type="button"
        className="asset-operations-identity"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <Thumbnail src={item.thumbnailUrl} />
        <span>
          <strong>{item.title}</strong>
          <small>
            {item.category.name}
            {item.category.set ? ` · ${item.category.set}` : ""}
            {item.grading.certNumber ? ` · Cert ${item.grading.certNumber}` : ""}
          </small>
          <em>Asset ID: {shortIdentifier(item.publicId)}</em>
          <small>
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
      <State
        state={sentence(item.market.state)}
        detail={tableMarketDetail(item)}
        tone={
          item.market.state === "MARKET_LIVE"
            ? "mint"
            : item.market.state === "PAUSED" || item.market.state === "RESTRICTED"
              ? "red"
              : "muted"
        }
      />
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
    <div className="asset-operations-state-cell">
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
  onClose,
  onOpen,
}: {
  item: AssetOperationsBoardItem | null;
  onClose: () => void;
  onOpen: () => void;
}) {
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
    <aside className="asset-operations-preview">
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
        <Thumbnail src={item.thumbnailUrl} />
        <div>
          <h3>{item.title}</h3>
          <p>
            {item.category.name}
            {item.grading.certNumber ? ` · Cert ${item.grading.certNumber}` : ""}
          </p>
          <strong>{item.publicId}</strong>
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
          ["Units sold", progress.label],
          ["Initial offer price", money(item.offering.pricePerUnitMinor, item.offering.currency)],
          ["Total valuation", money(item.valuation.valueMinor, item.valuation.currency)],
          ["Valuation date", item.valuation.state === "VALUED" ? formatDate(item.stageSince) : "—"],
        ]}
      />
      <BlockerPreview item={item} blockers={blockers} />
      <div className="asset-operations-preview-workflow">
        <span>Lifecycle / economic workflow</span>
        <div>
          {workflowSteps(item).map(([label, tone], index) => (
            <div className={tone} key={label}>
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
  onOpen: (item: AssetOperationsBoardItem) => void;
  onReviewBlockers: () => void;
  onOpenOwnership: () => void;
}) {
  const health = data.insights.health;
  const total = Math.max(1, health.onTrack + health.atRisk + health.blocked + health.exceptions);
  const first = data.items[0];
  return (
    <section className="asset-operations-insights" aria-label="Operational insights">
      <article>
        <span>Operational insights</span>
        <div
          className="asset-operations-donut"
          style={{
            background: `conic-gradient(var(--accent) 0 ${(health.onTrack / total) * 100}%, #e8ae46 0 ${((health.onTrack + health.atRisk) / total) * 100}%, #ef8985 0 ${((health.onTrack + health.atRisk + health.blocked) / total) * 100}%, #8f63c7 0 100%)`,
          }}
        >
          <b>{data.counts.all}</b>
          <small>active</small>
        </div>
        <dl>
          <div>
            <dt>On track</dt>
            <dd>{health.onTrack}</dd>
          </div>
          <div>
            <dt>At risk</dt>
            <dd>{health.atRisk}</dd>
          </div>
          <div>
            <dt>Blocked</dt>
            <dd>{health.blocked}</dd>
          </div>
          <div>
            <dt>Exceptions</dt>
            <dd>{health.exceptions}</dd>
          </div>
        </dl>
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
                    const item = data.items.find((candidate) => candidate.id === record.id);
                    if (item) onOpen(item);
                  }}
                >
                  <strong>{record.title}</strong>
                  <small>
                    {stageLabel(record.stage)} · {relativeTime(record.updatedAt)}
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
        <strong className="asset-operations-insight-number">
          {data.insights.blockers.reduce((totalCount, blocker) => totalCount + blocker.count, 0)}
        </strong>
        <ul className="asset-operations-insight-list">
          {data.insights.blockers.length ? (
            data.insights.blockers.map((blocker) => (
              <li key={blocker.code}>
                <small>{sentence(blocker.code)}</small>
                <b>{blocker.count}</b>
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
        {first ? (
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
