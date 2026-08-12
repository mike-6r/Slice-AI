import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Box,
  ClipboardList,
  FileText,
  FolderOpen,
  Globe2,
  Home,
  Image,
  Landmark,
  LayoutGrid,
  ListFilter,
  LogOut,
  Menu,
  PackageCheck,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Vault,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { logout } from "@/auth/actions";
import { canAccessCollectorWorkspace } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { Wordmark } from "@/components/layout/MainNavigation";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import type {
  CollectorWorkspaceAsset,
  CollectorWorkspaceOverview,
  CollectorWorkspaceStage,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

export const Route = createFileRoute("/collector-workspace")({
  head: () => ({ meta: [{ title: "Collector Workspace | Slice" }] }),
  component: CollectorWorkspacePage,
});

type WorkspaceSection =
  | "overview"
  | "collectibles"
  | "submissions"
  | "valuations"
  | "custody"
  | "market"
  | "performance"
  | "requests"
  | "documents"
  | "profile"
  | "activity"
  | "settings"
  | "asset";

const navigation: Array<{ id: WorkspaceSection; label: string; icon: typeof Home }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "collectibles", label: "My Collectibles", icon: LayoutGrid },
  { id: "submissions", label: "Submissions", icon: ClipboardList },
  { id: "valuations", label: "Valuations", icon: BadgeCheck },
  { id: "custody", label: "Custody & Vault", icon: Vault },
  { id: "market", label: "Market Listings", icon: BarChart3 },
  { id: "performance", label: "Performance", icon: BarChart3 },
  { id: "requests", label: "Requests", icon: Bell },
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "profile", label: "Public Profile", icon: Globe2 },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

function CollectorWorkspacePage() {
  return (
    <RoleWorkspaceGuard allows={canAccessCollectorWorkspace} title="Collector workspace">
      <CollectorWorkspace />
    </RoleWorkspaceGuard>
  );
}

function CollectorWorkspace() {
  const { repositories } = useAppServices();
  const client = useQueryClient();
  const [active, setActive] = useState<WorkspaceSection>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const overview = useQuery({
    queryKey: queryKeys.collectorWorkspace.overview,
    queryFn: repositories.collectorWorkspace.getOverview,
    staleTime: 30_000,
  });
  const updateProfile = useMutation({
    mutationFn: repositories.collectorWorkspace.updatePublicProfile,
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: queryKeys.collectorWorkspace.overview }),
  });

  if (overview.isLoading) return <WorkspaceState title="Loading your collector workspace" />;
  if (overview.isError || !overview.data)
    return (
      <WorkspaceState
        title="Collector workspace unavailable"
        detail="Your collector data could not be loaded safely. Please try again."
        retry={() => void overview.refetch()}
      />
    );

  const data = overview.data;
  const selected = data.assets.find((item) => item.id === selectedId) ?? null;
  const open = (section: WorkspaceSection, assetId?: string) => {
    setActive(section);
    if (assetId) setSelectedId(assetId);
    setMobileOpen(false);
  };
  const matchingAssets = filterAssets(data.assets, query);
  return (
    <div className="collector-workspace-shell">
      <aside className={`collector-workspace-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="collector-workspace-sidebar__brand">
          <Wordmark />
          <button className="collector-workspace-close" onClick={() => setMobileOpen(false)}>
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="collector-workspace-sidebar__label">Collector workspace</p>
        <nav className="collector-workspace-nav" aria-label="Collector workspace">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={active === id ? "is-active" : ""}
              onClick={() => open(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === "requests" && data.kpis.needsAttention > 0 ? (
                <em>{data.kpis.needsAttention}</em>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="collector-workspace-sidebar__account">
          <div className="collector-workspace-avatar">{initials(data.collector.displayName)}</div>
          <div>
            <strong>{data.collector.displayName}</strong>
            <span>
              {data.collector.username ? `@${data.collector.username}` : "Username not set"}
            </span>
          </div>
          <Link to="/dashboard" className="collector-workspace-sidebar__link">
            <Home aria-hidden="true" /> Switch to Investor
          </Link>
          <button className="collector-workspace-sidebar__link" onClick={() => void logout()}>
            <LogOut aria-hidden="true" /> Log out
          </button>
        </div>
      </aside>
      {mobileOpen ? (
        <button className="collector-workspace-scrim" onClick={() => setMobileOpen(false)} />
      ) : null}
      <main className="collector-workspace-main">
        <WorkspaceTopbar
          data={data}
          query={query}
          setQuery={setQuery}
          openMenu={() => setMobileOpen(true)}
          onOverview={() => open("overview")}
        />
        {active === "overview" ? (
          <Overview data={data} assets={matchingAssets} open={open} />
        ) : active === "collectibles" ? (
          <Collectibles data={data} assets={matchingAssets} open={open} />
        ) : active === "submissions" ? (
          <Submissions data={data} assets={matchingAssets} open={open} />
        ) : active === "valuations" ? (
          <Valuations assets={matchingAssets} open={open} />
        ) : active === "custody" ? (
          <Custody assets={matchingAssets} open={open} />
        ) : active === "market" ? (
          <MarketListings assets={matchingAssets} open={open} />
        ) : active === "performance" ? (
          <Performance data={data} />
        ) : active === "requests" ? (
          <Requests data={data} open={open} />
        ) : active === "documents" ? (
          <Documents assets={matchingAssets} open={open} />
        ) : active === "profile" ? (
          <PublicProfile data={data} save={updateProfile.mutate} saving={updateProfile.isPending} />
        ) : active === "activity" ? (
          <ActivityView data={data} />
        ) : active === "settings" ? (
          <SettingsView />
        ) : selected ? (
          <AssetManagement asset={selected} />
        ) : (
          <WorkspaceState title="Select a collectible" />
        )}
      </main>
    </div>
  );
}

function WorkspaceTopbar({
  data,
  query,
  setQuery,
  openMenu,
  onOverview,
}: {
  data: CollectorWorkspaceOverview;
  query: string;
  setQuery: (value: string) => void;
  openMenu: () => void;
  onOverview: () => void;
}) {
  return (
    <header className="collector-workspace-topbar">
      <button
        className="collector-workspace-menu"
        onClick={openMenu}
        aria-label="Open collector menu"
      >
        <Menu aria-hidden="true" />
      </button>
      <div className="collector-workspace-intro">
        <span>Collector workspace</span>
        <h1>{data.collector.displayName}</h1>
        <p>
          {data.collector.username ? `@${data.collector.username}` : "Username not set"}
          {data.collector.publicProfile?.isPublic ? (
            <Link to="/collector/$id" params={{ id: data.collector.publicProfile.slug }}>
              View public profile <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
        </p>
      </div>
      <label className="collector-workspace-search">
        <Search aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search collectibles, submissions, documents…"
        />
      </label>
      <div className="collector-workspace-topbar__meta">
        <span>
          <Archive aria-hidden="true" /> Collector since{" "}
          <strong>{date(data.collector.collectorSince)}</strong>
        </span>
        <span>
          <Globe2 aria-hidden="true" /> Country <strong>{data.collector.countryCode ?? "—"}</strong>
        </span>
        <button className="collector-workspace-overview-button" onClick={onOverview}>
          <Bell aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function Overview({
  data,
  assets,
  open,
}: {
  data: CollectorWorkspaceOverview;
  assets: CollectorWorkspaceAsset[];
  open: Open;
}) {
  return (
    <div className="collector-workspace-content">
      <section className="collector-kpis">
        <Kpi
          icon={PackageCheck}
          label="Total Collectibles"
          value={String(data.kpis.totalCollectibles)}
          detail="Associated submissions"
        />
        <Kpi
          icon={Landmark}
          label="Catalogue Value"
          value={money(data.kpis.referenceValue)}
          detail="Supported valuation / reference"
        />
        <Kpi
          icon={BarChart3}
          label="Market Live"
          value={String(data.kpis.marketLive)}
          detail="Published catalogue"
        />
        <Kpi
          icon={ClipboardList}
          label="In Review"
          value={String(data.kpis.inReview)}
          detail="Submitted, review or valuation"
        />
        <Kpi
          icon={Bell}
          label="Needs Attention"
          value={String(data.kpis.needsAttention)}
          detail="Collector actions required"
          attention
        />
      </section>
      <div className="collector-workspace-dashboard-grid">
        <div className="collector-workspace-dashboard-grid__main">
          <Pipeline data={data} open={open} />
          <section className="collector-panel">
            <PanelHeader
              title="Your Collectibles"
              action="View all collectibles"
              onClick={() => open("collectibles")}
            />
            <AssetGrid assets={assets.slice(0, 5)} open={open} />
          </section>
        </div>
        <div className="collector-workspace-dashboard-grid__side">
          <NeedsAttention data={data} open={open} />
          <RecentActivity data={data} open={open} />
        </div>
      </div>
      <div className="collector-workspace-analytics-grid">
        <Performance data={data} compact />
        <MarketSnapshot data={data} />
      </div>
    </div>
  );
}

function Pipeline({ data, open }: { data: CollectorWorkspaceOverview; open: Open }) {
  return (
    <section className="collector-panel collector-pipeline">
      <PanelHeader
        title="Pipeline Overview"
        action="View all submissions"
        onClick={() => open("submissions")}
      />
      <div className="collector-pipeline__stages">
        {data.pipeline.map((item) => {
          const state = stageCopy(item.stage);
          return (
            <button
              key={item.stage}
              onClick={() => open(item.stage === "MARKET_LIVE" ? "market" : "submissions")}
            >
              <span>
                <StageIcon stage={item.stage} />
              </span>
              <strong>{state.label}</strong>
              <em>{item.count}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NeedsAttention({ data, open }: { data: CollectorWorkspaceOverview; open: Open }) {
  return (
    <section className="collector-panel collector-attention">
      <PanelHeader
        title="Needs your attention"
        action="View all"
        onClick={() => open("requests")}
      />
      {data.attention.length ? (
        <ul>
          {data.attention.slice(0, 3).map((item) => (
            <AttentionRow key={item.id} item={item} open={open} />
          ))}
        </ul>
      ) : (
        <Empty detail="You're all caught up. No collector actions are currently required." />
      )}
    </section>
  );
}

function RecentActivity({ data, open }: { data: CollectorWorkspaceOverview; open: Open }) {
  return (
    <section className="collector-panel collector-activity-panel">
      <PanelHeader title="Recent Activity" action="View all" onClick={() => open("activity")} />
      {data.activity.length ? (
        <ul>
          {data.activity.slice(0, 5).map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <Empty detail="Activity will appear as your collector workflow progresses." />
      )}
    </section>
  );
}

function Collectibles({
  data,
  assets,
  open,
}: {
  data: CollectorWorkspaceOverview;
  assets: CollectorWorkspaceAsset[];
  open: Open;
}) {
  const [filter, setFilter] = useState<"ALL" | CollectorWorkspaceStage>("ALL");
  const filtered = filter === "ALL" ? assets : assets.filter((item) => item.stage === filter);
  return (
    <WorkspacePage
      title="My Collectibles"
      detail="Manage the customer-safe details, evidence and progress for your submitted collectibles."
    >
      <div className="collector-filterbar">
        <ListFilter aria-hidden="true" />
        {["ALL", ...data.pipeline.map((item) => item.stage)].map((stage) => (
          <button
            key={stage}
            className={filter === stage ? "is-active" : ""}
            onClick={() => setFilter(stage as typeof filter)}
          >
            {stage === "ALL" ? "All" : stageCopy(stage as CollectorWorkspaceStage).label}
          </button>
        ))}
      </div>
      <AssetGrid assets={filtered} open={open} full />
    </WorkspacePage>
  );
}

function Submissions({
  data,
  assets,
  open,
}: {
  data: CollectorWorkspaceOverview;
  assets: CollectorWorkspaceAsset[];
  open: Open;
}) {
  return (
    <WorkspacePage
      title="Submissions"
      detail="These records use the existing submission authority. Resume or edit only when the current status permits it."
    >
      <section className="collector-panel collector-data-list">
        {assets.length ? (
          assets.map((item) => (
            <button key={item.id} onClick={() => open("asset", item.id)}>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.category ?? "Collectible"} ·{" "}
                  {item.updatedAt ? date(item.updatedAt) : "No update date"}
                </span>
              </div>
              <StatusBadge stage={item.stage} />
              <ArrowRight aria-hidden="true" />
            </button>
          ))
        ) : (
          <Empty detail="No submissions match your current search." />
        )}
      </section>
    </WorkspacePage>
  );
}

function Valuations({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  const applicable = assets.filter((item) => item.referenceValue || item.marketResearch);
  return (
    <WorkspacePage
      title="Valuations"
      detail="External market references remain separate from staff-supported Slice valuations."
    >
      <section className="collector-panel collector-data-list">
        {applicable.length ? (
          applicable.map((item) => (
            <button key={item.id} onClick={() => open("asset", item.id)}>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.referenceValue?.source === "SLICE_SUPPORTED_VALUATION"
                    ? "Staff-supported valuation"
                    : "External market reference"}{" "}
                  · Updated {item.referenceValue ? date(item.referenceValue.asOf) : "unavailable"}
                </span>
              </div>
              <b>{money(item.referenceValue)}</b>
              <ArrowRight aria-hidden="true" />
            </button>
          ))
        ) : (
          <Empty detail="Valuation information will appear after supported evidence is available." />
        )}
      </section>
    </WorkspacePage>
  );
}

function Custody({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  const applicable = assets.filter(
    (item) => item.custody || ["CUSTODY", "VAULT_READY", "MARKET_LIVE"].includes(item.stage),
  );
  return (
    <WorkspacePage
      title="Custody & Vault"
      detail="Custody, inspection and vault readiness remain staff- and provider-controlled stages."
    >
      <section className="collector-panel collector-data-list">
        {applicable.length ? (
          applicable.map((item) => (
            <button key={item.id} onClick={() => open("asset", item.id)}>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.custody ? custodyLabel(item.custody.status) : "Custody status unavailable"}
                </span>
              </div>
              <StatusBadge stage={item.stage} />
              <ArrowRight aria-hidden="true" />
            </button>
          ))
        ) : (
          <Empty detail="No collectibles are currently in custody or vault workflow." />
        )}
      </section>
    </WorkspacePage>
  );
}

function MarketListings({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  const live = assets.filter((item) => item.market.isLive);
  return (
    <WorkspacePage
      title="Market Listings"
      detail="Only published collectibles appear here. Market data is derived from the existing public market authority."
    >
      <section className="collector-panel collector-data-list">
        {live.length ? (
          live.map((item) => (
            <button key={item.id} onClick={() => open("asset", item.id)}>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.market.ownersCount === null
                    ? "Owner count unavailable"
                    : `${item.market.ownersCount} owners`}{" "}
                  ·{" "}
                  {item.market.executionCount
                    ? `${item.market.executionCount} executions`
                    : "No recorded executions"}
                </span>
              </div>
              <b>{money(item.referenceValue)}</b>
              <ArrowRight aria-hidden="true" />
            </button>
          ))
        ) : (
          <Empty detail="Market listings will appear when a collectible is published and market live." />
        )}
      </section>
    </WorkspacePage>
  );
}

function Performance({
  data,
  compact = false,
}: {
  data: CollectorWorkspaceOverview;
  compact?: boolean;
}) {
  return (
    <section className={`collector-panel collector-performance ${compact ? "is-compact" : ""}`}>
      <PanelHeader title="Performance Overview" />
      <div className="collector-metric-grid">
        <Metric
          label="Catalogue value"
          value={money(data.analytics.catalogueReferenceValue)}
          detail="Supported valuation / reference"
        />
        <Metric
          label="Market Live value"
          value={money(data.analytics.marketLiveReferenceValue)}
          detail="Published catalogue reference"
        />
        <Metric
          label="Market Live assets"
          value={String(data.analytics.marketLiveAssets)}
          detail="Current published assets"
        />
        <Metric
          label="Owners"
          value={data.analytics.owners === null ? "Unavailable" : String(data.analytics.owners)}
          detail="Aggregate public market projection"
        />
      </div>
      {!compact ? (
        <p className="collector-panel__note">
          Historical returns are not shown because no authoritative performance series is available.
        </p>
      ) : null}
    </section>
  );
}

function MarketSnapshot({ data }: { data: CollectorWorkspaceOverview }) {
  return (
    <section className="collector-panel collector-market-snapshot">
      <PanelHeader title="Market Snapshot" />
      <div className="collector-metric-grid">
        <Metric
          label="Executions"
          value={data.analytics.trades === null ? "Unavailable" : String(data.analytics.trades)}
          detail="Across your live catalogue"
        />
        <Metric
          label="Volume"
          value={money(data.analytics.volume)}
          detail="Recorded executions only"
        />
        <Metric
          label="Units executed"
          value={data.analytics.executedUnits}
          detail="Aggregate execution units"
        />
        <Metric
          label="Owners"
          value={data.analytics.owners === null ? "Unavailable" : String(data.analytics.owners)}
          detail="Current market projection"
        />
      </div>
    </section>
  );
}

function Requests({ data, open }: { data: CollectorWorkspaceOverview; open: Open }) {
  return (
    <WorkspacePage
      title="Requests"
      detail="Requests are derived from current actionable workflow states; private staff notes are never shown."
    >
      <section className="collector-panel">
        {data.attention.length ? (
          <ul className="collector-request-list">
            {data.attention.map((item) => (
              <AttentionRow key={item.id} item={item} open={open} />
            ))}
          </ul>
        ) : (
          <Empty detail="You're all caught up. There are no active requests." />
        )}
      </section>
    </WorkspacePage>
  );
}

function Documents({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  const documents = assets.flatMap((asset) => asset.media.map((media) => ({ asset, media })));
  return (
    <WorkspacePage
      title="Documents"
      detail="Evidence is grouped by collectible. Secure storage paths and internal scan details stay private."
    >
      <section className="collector-panel collector-data-list">
        {documents.length ? (
          documents.map(({ asset, media }) => (
            <button key={media.id} onClick={() => open("asset", asset.id)}>
              <div>
                <strong>{media.filename}</strong>
                <span>
                  {asset.title} · {media.slot} · {media.status.replaceAll("_", " ")}
                </span>
              </div>
              <Image aria-hidden="true" />
              <ArrowRight aria-hidden="true" />
            </button>
          ))
        ) : (
          <Empty detail="No evidence documents are available for your current search." />
        )}
      </section>
    </WorkspacePage>
  );
}

function PublicProfile({
  data,
  save,
  saving,
}: {
  data: CollectorWorkspaceOverview;
  save: (input: {
    headline?: string | null;
    specialism?: string | null;
    isPublic?: boolean;
  }) => void;
  saving: boolean;
}) {
  const [headline, setHeadline] = useState(data.collector.publicProfile?.headline ?? "");
  const [specialism, setSpecialism] = useState(data.collector.publicProfile?.specialism ?? "");
  const [isPublic, setIsPublic] = useState(data.collector.publicProfile?.isPublic ?? false);
  return (
    <WorkspacePage
      title="Public Profile"
      detail="Your account username is the canonical collector identity. Profile visibility is managed separately."
    >
      <section className="collector-panel collector-profile-editor">
        <label>
          Display name
          <input value={data.collector.displayName} disabled />
        </label>
        <label>
          Username
          <input
            value={data.collector.username ? `@${data.collector.username}` : "Not set"}
            disabled
          />
        </label>
        <label>
          Collector bio
          <textarea
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            maxLength={500}
          />
        </label>
        <label>
          Specialties / categories
          <input
            value={specialism}
            onChange={(event) => setSpecialism(event.target.value)}
            placeholder="Pokémon TCG · Sports Cards"
          />
        </label>
        <label className="collector-profile-editor__toggle">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />{" "}
          Publish my collector profile
        </label>
        <div>
          <button
            className="collector-button collector-button--primary"
            disabled={saving}
            onClick={() =>
              save({ headline: headline || null, specialism: specialism || null, isPublic })
            }
          >
            {saving ? "Saving…" : "Save public profile"}
          </button>
          {data.collector.publicProfile?.isPublic ? (
            <Link
              className="collector-button"
              to="/collector/$id"
              params={{ id: data.collector.publicProfile.slug }}
            >
              Preview public profile <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </section>
    </WorkspacePage>
  );
}

function ActivityView({ data }: { data: CollectorWorkspaceOverview }) {
  return (
    <WorkspacePage title="Activity" detail="A customer-safe history of your collector workflow.">
      <section className="collector-panel collector-activity-panel">
        {data.activity.length ? (
          <ul>
            {data.activity.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <Empty detail="Activity will appear as your collector workflow progresses." />
        )}
      </section>
    </WorkspacePage>
  );
}

function SettingsView() {
  return (
    <WorkspacePage
      title="Collector Settings"
      detail="Account security and canonical profile settings remain in your Account center."
    >
      <section className="collector-panel collector-settings">
        <div>
          <strong>Account settings</strong>
          <span>Manage account profile, security, sessions and notifications in Account.</span>
          <Link to="/account" className="collector-button">
            Open account settings <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div>
          <strong>Public profile settings</strong>
          <span>Manage profile visibility and collector specialties in Public Profile.</span>
        </div>
      </section>
    </WorkspacePage>
  );
}

function AssetManagement({ asset }: { asset: CollectorWorkspaceAsset }) {
  return (
    <WorkspacePage
      title={asset.title}
      detail="Collector-side asset management uses current customer-safe submission and lifecycle data."
    >
      <section className="collector-asset-detail">
        <AssetCard asset={asset} open={() => undefined} />
        <div className="collector-asset-detail__panels">
          <DetailPanel title="Overview">
            <Detail label="Lifecycle status" value={stageCopy(asset.stage).label} />
            <Detail label="Supported value / reference" value={money(asset.referenceValue)} />
            <Detail
              label="Next action"
              value={
                asset.submissionStatus === "CHANGES_REQUESTED"
                  ? "Review the requested changes"
                  : "No collector action currently required"
              }
            />
          </DetailPanel>
          <DetailPanel title="Submission">
            <Detail label="Submission status" value={asset.submissionStatus.replaceAll("_", " ")} />
            <Detail
              label="Evidence"
              value={
                asset.media.length
                  ? `${asset.media.length} uploaded item${asset.media.length === 1 ? "" : "s"}`
                  : "No uploaded evidence"
              }
            />
            <Link to="/list" className="collector-button">
              Open submission flow <ArrowRight aria-hidden="true" />
            </Link>
          </DetailPanel>
          <DetailPanel title="Market Data">
            <Detail
              label="External market research"
              value={
                asset.marketResearch
                  ? `${asset.marketResearch.state} · ${date(asset.marketResearch.collectedAt)}`
                  : "Unavailable"
              }
            />
            <Detail
              label="Reference source"
              value={asset.referenceValue?.source ?? "Unavailable"}
            />
          </DetailPanel>
          <DetailPanel title="Media">
            <Detail
              label="Evidence status"
              value={
                asset.media.length
                  ? asset.media.map((item) => `${item.slot}: ${item.status}`).join(" · ")
                  : "No evidence"
              }
            />
          </DetailPanel>
          <DetailPanel title="Valuation">
            <Detail label="Current value" value={money(asset.referenceValue)} />
            <Detail
              label="Authority"
              value={
                asset.referenceValue?.source === "SLICE_SUPPORTED_VALUATION"
                  ? "Staff-supported Slice valuation"
                  : "External market reference only"
              }
            />
          </DetailPanel>
          <DetailPanel title="Custody">
            <Detail
              label="Custody state"
              value={
                asset.custody ? custodyLabel(asset.custody.status) : "Not currently in custody"
              }
            />
            <p>Custody completion and vault readiness remain staff-controlled.</p>
          </DetailPanel>
          <DetailPanel title="Market">
            <Detail
              label="Market state"
              value={asset.market.isLive ? "Market Live" : "Not market live"}
            />
            <Detail
              label="Owners"
              value={
                asset.market.ownersCount === null ? "Unavailable" : String(asset.market.ownersCount)
              }
            />
            {asset.slug && asset.market.isLive ? (
              <Link className="collector-button" to="/asset/$id" params={{ id: asset.slug }}>
                View public asset <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
          </DetailPanel>
          <DetailPanel title="Activity">
            <Detail label="Last updated" value={date(asset.updatedAt)} />
            <Detail label="Current workflow" value={stageCopy(asset.stage).label} />
          </DetailPanel>
        </div>
      </section>
    </WorkspacePage>
  );
}

function AssetGrid({
  assets,
  open,
  full = false,
}: {
  assets: CollectorWorkspaceAsset[];
  open: Open;
  full?: boolean;
}) {
  return assets.length ? (
    <div className={`collector-asset-grid ${full ? "is-full" : ""}`}>
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} open={open} />
      ))}
    </div>
  ) : (
    <Empty detail="No collectibles match your current search or filter." />
  );
}
function AssetCard({ asset, open }: { asset: CollectorWorkspaceAsset; open: Open }) {
  const media = asset.slug ? assetShowcaseMedia(asset.slug) : undefined;
  return (
    <button className="collector-asset-card" onClick={() => open("asset", asset.id)}>
      <div className="collector-asset-card__image">
        {media ? <img src={media.src} alt="" /> : <PackageCheck aria-hidden="true" />}
      </div>
      <strong>{asset.title}</strong>
      <span>
        {[asset.year, asset.set].filter(Boolean).join(" · ") || asset.category || "Collectible"}
      </span>
      <span>{asset.grade ?? "Grade unavailable"}</span>
      <b>{money(asset.referenceValue)}</b>
      <StatusBadge stage={asset.stage} />
    </button>
  );
}
function AttentionRow({
  item,
  open,
}: {
  item: CollectorWorkspaceOverview["attention"][number];
  open: Open;
}) {
  const media = item.slug ? assetShowcaseMedia(item.slug) : undefined;
  return (
    <li>
      <button onClick={() => open("asset", item.id)}>
        <span className="collector-attention__image">
          {media ? <img src={media.src} alt="" /> : <Bell aria-hidden="true" />}
        </span>
        <span>
          <strong>{item.title}</strong>
          <small>{item.grade ?? "Grade unavailable"}</small>
          <em>{item.reason}</em>
        </span>
        <StatusBadge stage={item.stage} />
        <ArrowRight aria-hidden="true" />
      </button>
    </li>
  );
}
function ActivityRow({ item }: { item: CollectorWorkspaceOverview["activity"][number] }) {
  return (
    <li>
      <span className="collector-activity-icon">
        <Activity aria-hidden="true" />
      </span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.detail}</small>
      </span>
      <time>{dateTime(item.occurredAt)}</time>
    </li>
  );
}
function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  attention = false,
}: {
  icon: typeof PackageCheck;
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <section className={`collector-kpi ${attention ? "is-attention" : ""}`}>
      <span>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
    </section>
  );
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function PanelHeader({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <header className="collector-panel__header">
      <h2>{title}</h2>
      {action ? (
        <button onClick={onClick}>
          {action} <ArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </header>
  );
}
function StatusBadge({ stage }: { stage: CollectorWorkspaceStage }) {
  return (
    <span className={`collector-status collector-status--${stage.toLowerCase()}`}>
      {stageCopy(stage).label}
    </span>
  );
}
function WorkspacePage({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="collector-workspace-content collector-workspace-content--page">
      <header className="collector-page-heading">
        <p>Collector workspace</p>
        <h2>{title}</h2>
        <span>{detail}</span>
      </header>
      {children}
    </div>
  );
}
function DetailPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="collector-detail-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <dl>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}
function Empty({ detail }: { detail: string }) {
  return <p className="collector-empty">{detail}</p>;
}
function WorkspaceState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail?: string;
  retry?: () => void;
}) {
  return (
    <main className="collector-workspace-state">
      <PackageCheck aria-hidden="true" />
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
      {retry ? (
        <button className="collector-button collector-button--primary" onClick={retry}>
          Try again
        </button>
      ) : null}
    </main>
  );
}

type Open = (section: WorkspaceSection, assetId?: string) => void;
const stageCopy = (stage: CollectorWorkspaceStage) =>
  ({
    DRAFT: { label: "Draft", icon: FileText },
    SUBMITTED: { label: "Submitted", icon: Upload },
    REVIEW: { label: "Review", icon: ClipboardList },
    VALUATION: { label: "Valuation", icon: BadgeCheck },
    CUSTODY: { label: "Custody", icon: Box },
    VAULT_READY: { label: "Vault Ready", icon: Vault },
    MARKET_LIVE: { label: "Market Live", icon: BarChart3 },
  })[stage];
function StageIcon({ stage }: { stage: CollectorWorkspaceStage }) {
  const Icon = stageCopy(stage).icon;
  return <Icon aria-hidden="true" />;
}
function filterAssets(assets: CollectorWorkspaceAsset[], query: string) {
  const value = query.trim().toLowerCase();
  return value
    ? assets.filter((item) =>
        [
          item.title,
          item.category,
          item.set,
          item.grade,
          item.submissionStatus,
          ...item.media.map((media) => media.filename),
        ]
          .filter(Boolean)
          .some((item) => String(item).toLowerCase().includes(value)),
      )
    : assets;
}
function money(value: { amountMinor: string; currency: string } | null) {
  if (!value) return "Unavailable";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: 0,
  }).format(Number(value.amountMinor) / 100);
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function initials(value: string) {
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function custodyLabel(status: string) {
  return (
    {
      EXPECTED: "Awaiting custody",
      RECEIVED: "Received",
      INSPECTED: "Inspection",
      SECURED: "Custody confirmed",
      RELEASE_PENDING: "Release pending",
      RELEASED: "Released",
      EXCEPTION: "Action required",
    }[status] ?? status.replaceAll("_", " ")
  );
}
