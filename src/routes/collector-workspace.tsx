import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Box,
  ClipboardList,
  CreditCard,
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
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { logout } from "@/auth/actions";
import { canAccessCollectorWorkspace } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { Wordmark } from "@/components/layout/MainNavigation";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import type {
  CollectorWorkspaceAsset,
  CollectorWorkspaceLifecycle,
  CollectorWorkspaceOverview,
  CollectorWorkspaceStage,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import type {
  CollectorSubscriptionProjection,
  CollectorWorkspaceRequest,
} from "@/data/repositories";
import { useCurrency } from "@/currency/CurrencyProvider";
import { asSupportedCurrency, formatDisplayMoney } from "@/currency/currency-presentation";
import { getCurrencyPresentation } from "@/currency/currency-store";
import { queryKeys } from "@/queries/keys";

export const Route = createFileRoute("/collector-workspace")({
  validateSearch: (search: Record<string, unknown>) => {
    const tab =
      typeof search.tab === "string" ? normalizeAssetDetailSection(search.tab) : undefined;
    return {
      ...(typeof search.collectible === "string" && search.collectible.length > 0
        ? { collectible: search.collectible.slice(0, 120) }
        : {}),
      ...(tab ? { tab } : {}),
    };
  },
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
  | "subscription"
  | "asset";

type AssetDetailSection =
  | "overview"
  | "details"
  | "history"
  | "submission"
  | "market-data"
  | "media"
  | "valuation"
  | "custody"
  | "market"
  | "activity";

type CollectorAssetDetail = {
  asset: CollectorWorkspaceAsset;
  requests: CollectorWorkspaceRequest[];
  lifecycle: CollectorWorkspaceLifecycle;
  activity: CollectorWorkspaceOverview["activity"];
};

const navigation: Array<{ id: WorkspaceSection; label: string; icon: typeof Home }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "collectibles", label: "My Collectibles", icon: LayoutGrid },
  { id: "submissions", label: "Submissions", icon: ClipboardList },
  { id: "requests", label: "Your Actions", icon: Bell },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "profile", label: "Public Profile", icon: Globe2 },
  { id: "settings", label: "Settings", icon: Settings },
];

function CollectorWorkspacePage() {
  useCurrency();
  return (
    <RoleWorkspaceGuard allows={canAccessCollectorWorkspace} title="Collector workspace">
      <CollectorWorkspace />
    </RoleWorkspaceGuard>
  );
}

function CollectorWorkspace() {
  const { repositories } = useAppServices();
  const client = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const routeSearch = Route.useSearch();
  const [active, setActive] = useState<WorkspaceSection>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(routeSearch.collectible ?? null);
  const [detailSection, setDetailSection] = useState<AssetDetailSection>(
    routeSearch.tab ?? "overview",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const overview = useQuery({
    queryKey: queryKeys.collectorWorkspace.overview,
    queryFn: repositories.collectorWorkspace.getOverview,
    staleTime: 30_000,
  });
  const collectibleDetail = useQuery({
    queryKey: queryKeys.collectorWorkspace.detail(selectedId),
    queryFn: () => repositories.collectorWorkspace.getCollectibleDetail(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 30_000,
  });
  const subscription = useQuery({
    queryKey: ["collector-workspace", "subscription"],
    queryFn: repositories.collectorWorkspace.getSubscription,
    enabled: active === "subscription" || active === "overview",
    staleTime: 60_000,
  });
  const subscriptionAction = useMutation({
    mutationFn: ({
      action,
      planCode,
    }: {
      action: "CHECKOUT" | "PORTAL" | "CHANGE_PLAN" | "CANCEL" | "RESUME";
      planCode?: "STARTER" | "PRO" | "ELITE";
    }) => repositories.collectorWorkspace.subscriptionAction(action, planCode),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["collector-workspace", "subscription"] }),
  });
  const deleteDraft = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      repositories.collectorWorkspace.deleteDraft(id, version),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.collectorWorkspace.overview });
      setSelectedId(null);
      setActive("collectibles");
    },
  });
  const updateProfile = useMutation({
    mutationFn: repositories.collectorWorkspace.updatePublicProfile,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.collectorWorkspace.overview });
      void client.invalidateQueries({ queryKey: queryKeys.collectors.all });
    },
  });

  useEffect(() => {
    if (!routeSearch.collectible) return;
    setSelectedId(routeSearch.collectible);
    setActive("asset");
    setDetailSection(routeSearch.tab ?? "overview");
  }, [routeSearch.collectible, routeSearch.tab]);

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
  const selected = selectedId
    ? (collectibleDetail.data?.asset ?? data.assets.find((item) => item.id === selectedId) ?? null)
    : null;

  const open = (section: WorkspaceSection, assetId?: string, tab?: AssetDetailSection) => {
    setActive(section);
    if (assetId) setSelectedId(assetId);
    const nextTab = tab ? normalizeAssetDetailSection(tab) : "overview";
    if (section === "asset") setDetailSection(nextTab);
    if (section === "asset" && assetId) {
      void navigate({
        search: { collectible: assetId, ...(nextTab !== "overview" ? { tab: nextTab } : {}) },
        replace: true,
      });
    } else if (routeSearch.collectible) {
      void navigate({ search: {}, replace: true });
    }
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
          <div className="collector-workspace-sidebar__identity">
            <div className="collector-workspace-avatar">
              {data.collector.avatarReference ? (
                <img src={data.collector.avatarReference} alt="" />
              ) : (
                initials(data.collector.displayName)
              )}
            </div>
            <div className="collector-workspace-sidebar__identity-copy">
              <strong title={data.collector.displayName}>{data.collector.displayName}</strong>
              <span
                title={data.collector.username ? `@${data.collector.username}` : "Username not set"}
              >
                {data.collector.username ? `@${data.collector.username}` : "Username not set"}
              </span>
            </div>
          </div>
          <div className="collector-workspace-sidebar__actions">
            <Link to="/dashboard" className="collector-workspace-sidebar__link">
              <Home aria-hidden="true" /> <span>Switch to Investor</span>
            </Link>
            <button className="collector-workspace-sidebar__link" onClick={() => void logout()}>
              <LogOut aria-hidden="true" /> <span>Log out</span>
            </button>
          </div>
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
          <Overview
            data={data}
            assets={matchingAssets}
            open={open}
            subscription={subscription.data}
          />
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
          <Performance data={data} open={open} />
        ) : active === "requests" ? (
          <Requests data={data} open={open} />
        ) : active === "subscription" ? (
          <SubscriptionPage
            data={subscription.data}
            loading={subscription.isLoading}
            action={subscriptionAction.mutate}
            actionPending={subscriptionAction.isPending}
            actionFailed={subscriptionAction.isError}
          />
        ) : active === "documents" ? (
          <Documents assets={matchingAssets} open={open} />
        ) : active === "profile" ? (
          <PublicProfile
            data={data}
            save={updateProfile.mutate}
            saving={updateProfile.isPending}
            saveFailed={updateProfile.isError}
          />
        ) : active === "activity" ? (
          <ActivityView data={data} />
        ) : active === "settings" ? (
          <SettingsView open={open} />
        ) : selected ? (
          <AssetManagement
            asset={selected}
            detail={collectibleDetail.data}
            membership={subscription.data}
            initialSection={detailSection}
            detailFailed={collectibleDetail.isError}
            deleting={deleteDraft.isPending}
            onDeleteDraft={(id, version) => deleteDraft.mutate({ id, version })}
            onSectionChange={(section) => open("asset", selected.id, section)}
          />
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
          placeholder="Filter your collectibles, submissions and evidence"
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
        <button
          className="collector-workspace-overview-button"
          onClick={onOverview}
          aria-label="Return to collector overview"
        >
          <Home aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function Overview({
  data,
  assets,
  open,
  subscription,
}: {
  data: CollectorWorkspaceOverview;
  assets: CollectorWorkspaceAsset[];
  open: Open;
  subscription?: import("@/data/repositories").CollectorSubscriptionProjection;
}) {
  return (
    <div className="collector-workspace-content">
      <div className="collector-workspace-overview-actions">
        <Link className="collector-button collector-button--primary" to="/list">
          List an Asset <ArrowRight aria-hidden="true" />
        </Link>
      </div>
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
      {subscription ? (
        <section className="collector-membership-strip" aria-label="Collector membership">
          <div>
            <span className="collector-advanced-card__eyebrow">Membership</span>
            <strong>{subscription.current?.displayName ?? "No active Collector plan"}</strong>
            <small>
              {subscription.current
                ? `${subscription.usage.activeCollectibles} / ${subscription.usage.maxActiveCollectibles ?? "No limit"} collectibles`
                : "Choose a plan to unlock Collector workspace capacity."}
            </small>
          </div>
          <button type="button" onClick={() => open("subscription")}>
            Manage plan <ArrowRight aria-hidden="true" />
          </button>
        </section>
      ) : null}
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
  if (assets.length) return <SubmissionRecords assets={assets} open={open} />;
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
  if (applicable.length) return <ValuationRecords assets={applicable} open={open} />;
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
  if (applicable.length) return <CustodyRecords assets={applicable} open={open} />;
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
  if (live.length) return <MarketListingRecords assets={live} open={open} />;
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

function SubmissionRecords({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  return (
    <WorkspacePage
      title="Submissions"
      detail="These records use the existing submission authority. Resume or edit only when the current status permits it."
    >
      <section className="collector-panel collector-record-list">
        {assets.map((asset) => (
          <WorkspaceRecordRow
            key={asset.id}
            asset={asset}
            label="Submission"
            detail={`${asset.category ?? "Collectible"} · Updated ${date(asset.updatedAt)}`}
            meta={submissionNextStep(asset)}
            onClick={() => open("asset", asset.id)}
          />
        ))}
      </section>
    </WorkspacePage>
  );
}

function ValuationRecords({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  return (
    <WorkspacePage
      title="Valuations"
      detail="External market references remain separate from staff-supported Slice valuations."
    >
      <section className="collector-advanced-list collector-valuation-list">
        {assets.map((asset) => {
          const market = marketResearchSummary(asset);
          return (
            <article key={asset.id} className="collector-advanced-card collector-valuation-card">
              <AssetThumbnail asset={asset} className="collector-advanced-card__image" />
              <div className="collector-advanced-card__identity">
                <span className="collector-advanced-card__eyebrow">
                  {asset.category ?? "Collectible"}
                </span>
                <h3>{asset.title}</h3>
                <p>{assetMetadata(asset)}</p>
                <StatusBadge stage={asset.stage} />
              </div>
              <dl className="collector-valuation-card__values">
                <div>
                  <dt>Slice-supported valuation</dt>
                  <dd>{money(asset.valuation.supportedValue)}</dd>
                  <small>
                    {asset.valuation.supportedValue
                      ? `Updated ${date(asset.valuation.supportedValue.asOf)}`
                      : "Slice valuation pending"}
                  </small>
                </div>
                <div>
                  <dt>External market reference</dt>
                  <dd>{market.saleRange ?? money(asset.valuation.externalReference)}</dd>
                  <small>
                    {market.updatedAt
                      ? `Research checked ${date(market.updatedAt)}`
                      : asset.valuation.externalReference
                        ? `Updated ${date(asset.valuation.externalReference.asOf)}`
                        : "No market reference available"}
                  </small>
                </div>
              </dl>
              <button
                className="collector-button"
                onClick={() => open("asset", asset.id, "valuation")}
              >
                View valuation <ArrowRight aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </section>
    </WorkspacePage>
  );
}

function CustodyRecords({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  return (
    <WorkspacePage
      title="Custody & Vault"
      detail="Custody, inspection and vault readiness remain staff- and provider-controlled stages."
    >
      <section className="collector-advanced-list collector-custody-list">
        {assets.map((asset) => (
          <article key={asset.id} className="collector-advanced-card collector-custody-card">
            <AssetThumbnail asset={asset} className="collector-advanced-card__image" />
            <div className="collector-advanced-card__identity">
              <span className="collector-advanced-card__eyebrow">Physical asset journey</span>
              <h3>{asset.title}</h3>
              <p>{assetMetadata(asset)}</p>
              <p className="collector-custody-card__status">
                {asset.custody ? custodyLabel(asset.custody.status) : "Custody workflow pending"}
                <small>
                  {asset.custody
                    ? `Updated ${date(asset.custody.updatedAt)}`
                    : "Staff-controlled stage"}
                </small>
              </p>
            </div>
            <CustodyTimeline asset={asset} />
            <div className="collector-advanced-card__actions">
              {asset.submissionStatus === "CHANGES_REQUESTED" ? (
                <strong className="collector-action-required">
                  Action required: review requested changes
                </strong>
              ) : null}
              <span>
                {asset.market.isLive ? "Published on the Slice market" : "Not market live"}
              </span>
              <button
                className="collector-button"
                onClick={() => open("asset", asset.id, "custody")}
              >
                View details <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </section>
    </WorkspacePage>
  );
}

function MarketListingRecords({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  const [sort, setSort] = useState<"value" | "owners" | "activity">("value");
  const sorted = [...assets].sort((a, b) => {
    if (sort === "owners") return (b.market.ownersCount ?? -1) - (a.market.ownersCount ?? -1);
    if (sort === "activity") return b.market.executionCount - a.market.executionCount;
    return Number(b.referenceValue?.amountMinor ?? 0) - Number(a.referenceValue?.amountMinor ?? 0);
  });
  return (
    <WorkspacePage
      title="Market Listings"
      detail="Only published collectibles appear here. Market data is derived from the existing public market authority."
    >
      <>
        <div className="collector-advanced-filterbar" aria-label="Sort market listings">
          <span>Sort by</span>
          {[
            ["value", "Highest value"],
            ["owners", "Most owners"],
            ["activity", "Most active"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={sort === value ? "is-active" : ""}
              onClick={() => setSort(value as typeof sort)}
            >
              {label}
            </button>
          ))}
        </div>
        <section className="collector-market-cards">
          {sorted.map((asset) => (
            <article key={asset.id} className="collector-market-card">
              <AssetThumbnail asset={asset} className="collector-market-card__image" />
              <div className="collector-market-card__identity">
                <span>Market live</span>
                <h3>{asset.title}</h3>
                <p>{assetMetadata(asset)}</p>
              </div>
              <dl className="collector-market-card__metrics">
                <div>
                  <dt>Reference value</dt>
                  <dd>{money(asset.referenceValue)}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{availability(asset)}</dd>
                </div>
                <div>
                  <dt>Owners</dt>
                  <dd>{asset.market.ownersCount ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Executions</dt>
                  <dd>{asset.market.executionCount || "None"}</dd>
                </div>
                <div>
                  <dt>Latest trade</dt>
                  <dd>{sharePrice(asset)}</dd>
                </div>
              </dl>
              {asset.slug ? (
                <Link className="collector-button" to="/asset/$id" params={{ id: asset.slug }}>
                  View market <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <button
                  className="collector-button"
                  onClick={() => open("asset", asset.id, "market")}
                >
                  View market <ArrowRight aria-hidden="true" />
                </button>
              )}
            </article>
          ))}
        </section>
      </>
    </WorkspacePage>
  );
}

function WorkspaceRecordRow({
  asset,
  label,
  detail,
  meta,
  value,
  onClick,
}: {
  asset: CollectorWorkspaceAsset;
  label: string;
  detail: string;
  meta?: string;
  value?: string;
  onClick: () => void;
}) {
  const media = asset.slug ? assetShowcaseMedia(asset.slug) : undefined;
  return (
    <button className="collector-record-row" onClick={onClick}>
      <span className="collector-record-row__image">
        {media ? <img src={media.src} alt="" /> : <PackageCheck aria-hidden="true" />}
      </span>
      <span className="collector-record-row__content">
        <small>{label}</small>
        <strong>{asset.title}</strong>
        <span>{detail}</span>
      </span>
      {meta ? <span className="collector-record-row__meta">{meta}</span> : null}
      {value ? <b>{value}</b> : null}
      <StatusBadge stage={asset.stage} />
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

function Performance({
  data,
  compact = false,
  open,
}: {
  data: CollectorWorkspaceOverview;
  compact?: boolean;
  open?: Open;
}) {
  const highestValue = [...data.assets]
    .filter((asset) => asset.referenceValue)
    .sort((a, b) => Number(b.referenceValue!.amountMinor) - Number(a.referenceValue!.amountMinor))
    .slice(0, 3);
  const mostActive = [...data.assets]
    .filter((asset) => asset.market.executionCount > 0)
    .sort((a, b) => b.market.executionCount - a.market.executionCount)
    .slice(0, 3);
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
        <div className="collector-performance-dashboard">
          <section className="collector-performance-history">
            <span>Performance history</span>
            <strong>Historical performance data isn't available yet.</strong>
            <p>Current catalogue and market activity are shown below.</p>
          </section>
          <Ranking
            title="Highest-value collectibles"
            assets={highestValue}
            metric={(asset) => money(asset.referenceValue)}
            open={open}
          />
          <Ranking
            title="Most active collectibles"
            assets={mostActive}
            metric={(asset) => `${asset.market.executionCount} executions`}
            open={open}
          />
        </div>
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
  const [filter, setFilter] = useState<"ALL" | "SUBMISSION" | "SHIPPING" | "INFORMATION">("ALL");
  const actions =
    filter === "ALL" ? data.attention : data.attention.filter((item) => item.category === filter);
  const required = actions.filter((item) => item.priority !== "REMINDER");
  const reminders = actions.filter((item) => item.priority === "REMINDER");
  return (
    <WorkspacePage
      title="Your Actions"
      detail="Complete these steps to keep your collectibles moving."
    >
      <div className="collector-actions-count">
        {data.actionSummary.waitingOnYou} items need your attention
      </div>
      <div className="collector-actions-layout">
        <div className="collector-actions-main">
          <div className="collector-actions-filterbar" role="tablist" aria-label="Filter actions">
            {(
              [
                ["ALL", "All"],
                ["SUBMISSION", "Submission"],
                ["SHIPPING", "Shipping"],
                ["INFORMATION", "Information"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? "is-active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <ActionSection
            title="Required now"
            count={required.length}
            actions={required}
            open={open}
            empty="You're all caught up. None of your collectibles need anything from you right now."
          />
          {reminders.length ? (
            <ActionSection
              title="Draft reminders"
              count={reminders.length}
              actions={reminders}
              open={open}
            />
          ) : null}
        </div>
        <aside className="collector-actions-rail">
          <ActionSummary summary={data.actionSummary} />
          <RecentActions activity={data.activity.slice(0, 5)} open={() => open("activity")} />
        </aside>
      </div>
    </WorkspacePage>
  );
}

function ActionSection({
  title,
  count,
  actions,
  open,
  empty,
}: {
  title: string;
  count: number;
  actions: CollectorWorkspaceOverview["attention"];
  open: Open;
  empty?: string;
}) {
  return (
    <section className="collector-actions-section">
      <div className="collector-actions-section__heading">
        <h2>{title}</h2>
        <span>{count}</span>
      </div>
      {actions.length ? (
        <div className="collector-actions-list">
          {actions.map((item) => (
            <ActionRow key={item.requestId} item={item} open={open} />
          ))}
        </div>
      ) : empty ? (
        <div className="collector-actions-empty">{empty}</div>
      ) : null}
    </section>
  );
}

function ActionRow({
  item,
  open,
}: {
  item: CollectorWorkspaceOverview["attention"][number];
  open: Open;
}) {
  const tab =
    item.targetRoute === "media"
      ? "media"
      : item.targetRoute === "custody"
        ? "custody"
        : "submission";
  return (
    <article className="collector-action-row">
      <AssetThumbnail asset={item} className="collector-action-row__image" />
      <div className="collector-action-row__identity">
        <span>{actionCategoryLabel(item.category)}</span>
        <h3>{item.title}</h3>
        <p>{assetMetadata(item)}</p>
        <small>Submission #{item.id.slice(-6).toUpperCase()}</small>
      </div>
      <div className="collector-action-row__message">
        <strong>{item.badge}</strong>
        <p>{item.reason}</p>
      </div>
      <div className="collector-action-row__cta">
        <time dateTime={item.updatedAt}>Updated {date(item.updatedAt)}</time>
        <button
          type="button"
          className={
            item.priority === "BLOCKING"
              ? "collector-button collector-button--primary"
              : "collector-button"
          }
          onClick={() => open("asset", item.id, tab)}
        >
          {item.actionLabel} <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function ActionSummary({ summary }: { summary: CollectorWorkspaceOverview["actionSummary"] }) {
  return (
    <section className="collector-panel collector-actions-summary">
      <PanelHeader title="Action summary" />
      <div>
        <strong>Waiting on you</strong>
        <span>{summary.waitingOnYou}</span>
        <small>Items that need your action</small>
      </div>
      <div>
        <strong>In progress</strong>
        <span>{summary.inProgress}</span>
        <small>Moving through the pipeline</small>
      </div>
      <div>
        <strong>Completed recently</strong>
        <span>{summary.completedRecently}</span>
        <small>Meaningful milestones</small>
      </div>
    </section>
  );
}

function RecentActions({
  activity,
  open,
}: {
  activity: CollectorWorkspaceOverview["activity"];
  open: () => void;
}) {
  return (
    <section className="collector-panel collector-recent-actions">
      <PanelHeader title="Recent activity" />
      {activity.length ? (
        <ul>
          {activity.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              <small>{date(item.occurredAt)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty detail="Your recent workflow milestones will appear here." />
      )}
      <button className="collector-button" onClick={open}>
        View all activity <ArrowRight aria-hidden="true" />
      </button>
    </section>
  );
}

function actionCategoryLabel(category: "SUBMISSION" | "SHIPPING" | "INFORMATION") {
  return {
    SUBMISSION: "Submission",
    SHIPPING: "Shipping",
    INFORMATION: "Information",
  }[category];
}

function Documents({ assets, open }: { assets: CollectorWorkspaceAsset[]; open: Open }) {
  const documents = assets.flatMap((asset) => asset.media.map((media) => ({ asset, media })));
  if (documents.length) return <DocumentGroups documents={documents} open={open} />;
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

function RequestCards({
  items,
  open,
}: {
  items: CollectorWorkspaceOverview["attention"];
  open: Open;
}) {
  return (
    <WorkspacePage
      title="Requests"
      detail="Requests are derived from current actionable workflow states; private staff notes are never shown."
    >
      <section className="collector-request-cards">
        {items.map((item) => {
          const media = item.slug ? assetShowcaseMedia(item.slug) : undefined;
          return (
            <button
              key={item.id}
              className="collector-request-card"
              onClick={() => open("asset", item.id, "submission")}
            >
              <span className="collector-request-card__image">
                {media ? <img src={media.src} alt="" /> : <Bell aria-hidden="true" />}
              </span>
              <span className="collector-request-card__content">
                <small>Action required</small>
                <strong>{item.title}</strong>
                <span>{item.reason}</span>
              </span>
              <StatusBadge stage={item.stage} />
              <span className="collector-button">
                Review request <ArrowRight aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </section>
    </WorkspacePage>
  );
}

function DocumentGroups({
  documents,
  open,
}: {
  documents: Array<{
    asset: CollectorWorkspaceAsset;
    media: CollectorWorkspaceAsset["media"][number];
  }>;
  open: Open;
}) {
  const groups = new Map<
    string,
    { asset: CollectorWorkspaceAsset; media: CollectorWorkspaceAsset["media"] }
  >();
  documents.forEach(({ asset, media }) => {
    const current = groups.get(asset.id) ?? { asset, media: [] };
    current.media.push(media);
    groups.set(asset.id, current);
  });
  return (
    <WorkspacePage
      title="Documents"
      detail="Evidence is grouped by collectible. Secure storage paths and internal scan details stay private."
    >
      <section className="collector-document-groups">
        {[...groups.values()].map(({ asset, media }) => (
          <article key={asset.id} className="collector-panel collector-document-group">
            <button
              className="collector-document-group__heading"
              onClick={() => open("asset", asset.id, "media")}
            >
              <AssetThumbnail asset={asset} />
              <span>
                <strong>{asset.title}</strong>
                <small>
                  {media.length} evidence item{media.length === 1 ? "" : "s"}
                </small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
            <ul>
              {media.map((item) => (
                <li key={item.id}>
                  <Image aria-hidden="true" />
                  <span>
                    <strong>{friendlyMediaLabel(item.slot)}</strong>
                    <small>
                      {item.status.replaceAll("_", " ")} · Updated {date(item.updatedAt)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </WorkspacePage>
  );
}

function PublicProfile({
  data: source,
  save,
  saving,
  saveFailed,
}: {
  data: CollectorWorkspaceOverview;
  save: (input: {
    headline?: string | null;
    specialism?: string | null;
    isPublic?: boolean;
  }) => void;
  saving: boolean;
  saveFailed: boolean;
}) {
  const data = source;
  const [headline, setHeadline] = useState(data.collector.publicProfile?.headline ?? "");
  const [specialism, setSpecialism] = useState(data.collector.publicProfile?.specialism ?? "");
  const [isPublic, setIsPublic] = useState(data.collector.publicProfile?.isPublic ?? false);
  return (
    <PublicProfileEditor
      data={data}
      headline={headline}
      specialism={specialism}
      isPublic={isPublic}
      saving={saving}
      saveFailed={saveFailed}
      setHeadline={setHeadline}
      setSpecialism={setSpecialism}
      setIsPublic={setIsPublic}
      save={save}
    />
  );
}

function PublicProfileEditor({
  data,
  headline,
  specialism,
  isPublic,
  saving,
  saveFailed,
  setHeadline,
  setSpecialism,
  setIsPublic,
  save,
}: {
  data: CollectorWorkspaceOverview;
  headline: string;
  specialism: string;
  isPublic: boolean;
  saving: boolean;
  saveFailed: boolean;
  setHeadline: (value: string) => void;
  setSpecialism: (value: string) => void;
  setIsPublic: (value: boolean) => void;
  save: (input: {
    headline?: string | null;
    specialism?: string | null;
    isPublic?: boolean;
  }) => void;
}) {
  return (
    <WorkspacePage
      title="Public Profile"
      detail="Your account username is the canonical collector identity. Profile visibility is managed separately."
    >
      <section className="collector-profile-layout">
        <div className="collector-panel collector-profile-editor">
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
          <label className="collector-profile-editor__wide">
            Collector bio
            <textarea
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              maxLength={500}
            />
          </label>
          <label className="collector-profile-editor__wide">
            Specialties / categories
            <input
              value={specialism}
              onChange={(event) => setSpecialism(event.target.value)}
              placeholder="Pokémon TCG · Sports Cards"
            />
          </label>
          <label className="collector-profile-editor__toggle collector-profile-editor__wide">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />{" "}
            Publish my collector profile
          </label>
          <div className="collector-profile-editor__wide">
            <button
              className="collector-button collector-button--primary"
              disabled={saving}
              onClick={() =>
                save({ headline: headline || null, specialism: specialism || null, isPublic })
              }
            >
              {saving ? "Saving…" : "Save public profile"}
            </button>
            {saveFailed ? (
              <p className="collector-form-error" role="alert">
                We couldn&apos;t save your public profile. Please try again.
              </p>
            ) : null}
          </div>
        </div>
        <aside className="collector-panel collector-profile-preview">
          <span className="collector-profile-preview__eyebrow">Live profile preview</span>
          <div className="collector-profile-preview__avatar">
            {initials(data.collector.displayName)}
          </div>
          <strong>{data.collector.displayName}</strong>
          <small>
            {data.collector.username ? `@${data.collector.username}` : "Username not set"}
          </small>
          <p>{headline || "Add a short collector bio to introduce your public profile."}</p>
          <span className="collector-profile-preview__specialism">
            {specialism || "No specialties added"}
          </span>
          {data.collector.publicProfile?.isPublic ? (
            <Link
              className="collector-button"
              to="/collector/$id"
              params={{ id: data.collector.publicProfile.slug }}
            >
              Preview public profile <ArrowRight aria-hidden="true" />
            </Link>
          ) : (
            <span className="collector-profile-preview__private">Private until you publish</span>
          )}
        </aside>
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

function SettingsView({ open }: { open: Open }) {
  return <SettingsCards open={open} />;
}

function SubscriptionPage({
  data,
  loading,
  action,
  actionPending,
  actionFailed,
}: {
  data?: import("@/data/repositories").CollectorSubscriptionProjection;
  loading: boolean;
  action: (input: {
    action: "CHECKOUT" | "PORTAL" | "CHANGE_PLAN" | "CANCEL" | "RESUME";
    planCode?: "STARTER" | "PRO" | "ELITE";
  }) => void;
  actionPending: boolean;
  actionFailed: boolean;
}) {
  if (loading || !data) return <WorkspaceState title="Loading your subscription" />;
  const current = data.current;
  const activePlan = current
    ? (data.plans.find((plan) => plan.code === current.code) ?? null)
    : null;
  return (
    <WorkspacePage
      title="Collector Membership"
      detail="Choose the capacity and tools that fit your collection."
    >
      {actionFailed ? (
        <div className="collector-membership-notice" role="status">
          Membership billing is temporarily unavailable. Your current plan and collection remain
          safe.
        </div>
      ) : null}
      <section className="collector-subscription-layout">
        <article className="collector-panel collector-subscription-current">
          <div className="collector-membership-plan-summary">
            <span className="collector-advanced-card__eyebrow">
              {activePlan?.recommended ? "Most popular" : "Collector workspace"}
            </span>
            <div className="collector-membership-plan-heading">
              <h2>{current?.displayName ?? "No active Collector plan"}</h2>
              {current ? (
                <span className="collector-membership-status">
                  {subscriptionStatus(current.status, current.cancelAtPeriodEnd)}
                </span>
              ) : null}
            </div>
            {activePlan ? (
              <strong className="collector-membership-price">
                {formatPlanPrice(activePlan.monthlyPriceMinor, activePlan.currency)}{" "}
                <small>/ month</small>
              </strong>
            ) : null}
            <p>
              {current
                ? `${current.cancelAtPeriodEnd ? "Cancels" : "Renews"} ${current.currentPeriodEnd ? date(current.currentPeriodEnd) : "with your billing cycle"}`
                : "Choose a plan to unlock Collector workspace capacity and new submissions."}
            </p>
            {!current ? (
              <button
                className="collector-button collector-button--primary"
                onClick={() => action({ action: "CHECKOUT", planCode: "PRO" })}
                disabled={actionPending}
              >
                Choose a plan <ArrowRight aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="collector-subscription-usage collector-subscription-usage--meters">
            <UsageMeter
              icon={PackageCheck}
              label="Active collectibles"
              value={data.usage.activeCollectibles}
              limit={data.usage.maxActiveCollectibles}
            />
            <UsageMeter
              icon={ClipboardList}
              label="Open submissions"
              value={data.usage.openSubmissions}
              limit={data.usage.maxOpenSubmissions}
            />
            <UsageMeter
              icon={BarChart3}
              label="Monthly submissions"
              value={data.usage.monthlySubmissionsUsed}
              limit={data.usage.maxMonthlySubmissions}
            />
          </div>
          <div className="collector-membership-capacity">
            {data.usage.remainingCatalogueCapacity === null
              ? "Catalogue capacity follows your membership"
              : `${data.usage.remainingCatalogueCapacity} catalogue slots remaining`}
          </div>
        </article>
        <BillingDetails data={data} action={action} actionPending={actionPending} />
      </section>
      <section className="collector-plan-grid">
        {data.plans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            current={current}
            action={action}
            actionPending={actionPending}
          />
        ))}
      </section>
      <section className="collector-panel collector-plan-compare">
        <PanelHeader title="Compare features" />
        <ComparisonTable plans={data.plans} />
      </section>
      <section className="collector-membership-bottom-grid">
        <article className="collector-panel collector-membership-info-card">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>Included on every plan</h3>
            <p>Core infrastructure and workflows are always included.</p>
            <ul>
              {[
                "Secure submission workflow",
                "Staff review",
                "Vault intake tracking",
                "Shipment tracking",
                "Collector profile",
                "Market research",
                "Custody status",
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </article>
        <article className="collector-panel collector-membership-info-card">
          <BadgeCheck aria-hidden="true" />
          <div>
            <h3>Membership standards</h3>
            <p>Your membership tier never changes our commitment to quality.</p>
            <p>
              Every submission and collectible is subject to the same Slice review, verification,
              custody and publication standards - regardless of your plan.
            </p>
          </div>
        </article>
      </section>
    </WorkspacePage>
  );
}

function BillingDetails({
  data,
  action,
  actionPending,
}: {
  data: import("@/data/repositories").CollectorSubscriptionProjection;
  action: (input: {
    action: "CHECKOUT" | "PORTAL" | "CHANGE_PLAN" | "CANCEL" | "RESUME";
    planCode?: "STARTER" | "PRO" | "ELITE";
  }) => void;
  actionPending: boolean;
}) {
  const current = data.current;
  return (
    <article className="collector-panel collector-membership-billing">
      <PanelHeader title="Billing & plan details" />
      <dl>
        <div>
          <dt>
            <CreditCard aria-hidden="true" /> Next billing date
          </dt>
          <dd>
            {data.billing.nextBillingDate ? date(data.billing.nextBillingDate) : "Not scheduled"}
          </dd>
        </div>
        <div>
          <dt>
            <CreditCard aria-hidden="true" /> Payment method
          </dt>
          <dd>
            {data.billing.paymentMethod
              ? `${data.billing.paymentMethod.brand} **** ${data.billing.paymentMethod.last4}`
              : "Managed securely by Slice billing"}
          </dd>
        </div>
      </dl>
      <p>Your subscription controls your catalogue capacity and workflow limits across Slice.</p>
      <div className="collector-membership-billing-actions">
        <button
          className="collector-button"
          onClick={() => action({ action: "PORTAL" })}
          disabled={actionPending || !data.billing.configured}
        >
          Manage billing <ArrowRight aria-hidden="true" />
        </button>
        <button
          className="collector-button"
          onClick={() =>
            action({
              action: "CHANGE_PLAN",
              planCode: current?.code === "STARTER" ? "PRO" : "ELITE",
            })
          }
          disabled={actionPending || !data.billing.configured}
        >
          Change plan <ArrowRight aria-hidden="true" />
        </button>
        <button
          className="collector-button"
          onClick={() => action({ action: current?.cancelAtPeriodEnd ? "RESUME" : "CANCEL" })}
          disabled={actionPending || !data.billing.configured}
        >
          {current?.cancelAtPeriodEnd ? "Resume membership" : "Cancel at period end"}{" "}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
      {!data.billing.configured ? (
        <small className="collector-membership-billing-note">
          Billing actions will be available when hosted membership billing is connected.
        </small>
      ) : null}
    </article>
  );
}

function PlanCard({
  plan,
  current,
  action,
  actionPending,
}: {
  plan: import("@/data/repositories").CollectorSubscriptionProjection["plans"][number];
  current: import("@/data/repositories").CollectorSubscriptionProjection["current"];
  action: (input: {
    action: "CHECKOUT" | "PORTAL" | "CHANGE_PLAN" | "CANCEL" | "RESUME";
    planCode?: "STARTER" | "PRO" | "ELITE";
  }) => void;
  actionPending: boolean;
}) {
  const isCurrent = current?.code === plan.code;
  return (
    <article className={`collector-plan-card ${isCurrent ? "is-current" : ""}`}>
      <div className="collector-plan-card__heading">
        <span className="collector-advanced-card__eyebrow">{plan.displayName}</span>
        {plan.recommended ? <em>Recommended</em> : null}
      </div>
      <strong className="collector-plan-card__price">
        {formatPlanPrice(plan.monthlyPriceMinor, plan.currency)} <small>/ month</small>
      </strong>
      <ul className="collector-subscription-features">
        {featureLabels(plan.entitlements).map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <button
        className={`collector-button ${isCurrent ? "collector-button--primary" : ""}`}
        disabled={isCurrent || actionPending}
        onClick={() => action({ action: "CHECKOUT", planCode: plan.code })}
      >
        {isCurrent
          ? "Current plan"
          : plan.code === "ELITE"
            ? "Upgrade"
            : `Choose ${plan.displayName.replace("Collector ", "")}`}{" "}
        <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

function ComparisonTable({
  plans,
}: {
  plans: import("@/data/repositories").CollectorSubscriptionProjection["plans"];
}) {
  const rows: Array<{ label: string; key: string; format?: (value: unknown) => string }> = [
    { label: "Active collectibles", key: "maxActiveCollectibles" },
    { label: "Monthly submissions", key: "monthlySubmissionLimit" },
    { label: "Concurrent intake", key: "maxConcurrentIntake" },
    {
      label: "Market research",
      key: "marketResearchTier",
      format: (value) =>
        typeof value === "string" ? value[0] + value.slice(1).toLowerCase() : "-",
    },
    {
      label: "Bulk import",
      key: "bulkImportEnabled",
      format: (value) => (value ? "Included" : "-"),
    },
    {
      label: "Analytics",
      key: "advancedAnalyticsEnabled",
      format: (value) => (value ? "Advanced" : "Standard"),
    },
    {
      label: "Catalogue export",
      key: "exportEnabled",
      format: (value) => (value ? "Included" : "-"),
    },
    {
      label: "Priority support",
      key: "prioritySupport",
      format: (value) => (value ? "Priority" : "Standard"),
    },
  ];
  return (
    <div className="collector-comparison-table" role="table">
      <div className="collector-comparison-row collector-comparison-row--header" role="row">
        <span>Feature</span>
        {plans.map((plan) => (
          <strong key={plan.code}>{plan.displayName}</strong>
        ))}
      </div>
      {rows.map((row) => (
        <div className="collector-comparison-row" role="row" key={row.key}>
          <span>{row.label}</span>
          {plans.map((plan) => {
            const value = plan.entitlements[row.key];
            return (
              <span key={plan.code}>{row.format ? row.format(value) : String(value ?? "-")}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function UsageMeter({
  icon: Icon,
  label,
  value,
  limit,
}: {
  icon: typeof PackageCheck;
  label: string;
  value: number;
  limit: number | null;
}) {
  const percentage = limit && limit > 0 ? Math.min(100, (value / limit) * 100) : 0;
  return (
    <div className="collector-usage-meter">
      <div className="collector-usage-meter__top">
        <Icon aria-hidden="true" />
        <span>{label}</span>
        <strong>
          {value} / {limit ?? "Plan required"}
        </strong>
      </div>
      <div
        className="collector-usage-meter__bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        aria-valuenow={limit === null ? undefined : value}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function LegacySubscriptionPage({
  data,
  loading,
}: {
  data?: import("@/data/repositories").CollectorSubscriptionProjection;
  loading: boolean;
}) {
  if (loading || !data) return <WorkspaceState title="Loading your subscription" />;
  const current = data.current;
  return (
    <WorkspacePage
      title="Subscription"
      detail="Your Collector plan controls catalogue capacity and optional tools. Trust, grading, custody and publication standards are the same on every plan."
    >
      <section className="collector-subscription-layout">
        <article className="collector-panel collector-subscription-current">
          <span className="collector-advanced-card__eyebrow">Your plan</span>
          <h2>{current?.displayName ?? "No active Collector plan"}</h2>
          <StatusBadge stage={current?.status === "ACTIVE" ? "MARKET_LIVE" : "DRAFT"} />
          <p>
            {current
              ? `${sentence(current.status)}${current.currentPeriodEnd ? ` · Renews ${date(current.currentPeriodEnd)}` : ""}`
              : "Choose a plan to unlock Collector workspace capacity."}
          </p>
          <div className="collector-subscription-usage">
            <Usage
              label="Active collectibles"
              value={data.usage.activeCollectibles}
              limit={numberEntitlement(current?.entitlements.maxActiveCollectibles)}
            />
            <Usage
              label="Open submissions"
              value={data.usage.openDrafts}
              limit={numberEntitlement(current?.entitlements.maxOpenDrafts)}
            />
            <Usage
              label="Monthly submissions"
              value={data.usage.monthlySubmissions}
              limit={numberEntitlement(current?.entitlements.monthlySubmissionLimit)}
            />
          </div>
          {!data.billing.configured ? (
            <small>
              Billing checkout is not configured in this environment. Plan state remains
              backend-authoritative.
            </small>
          ) : null}
        </article>
        <article className="collector-panel">
          <PanelHeader title="Plan features" />
          <ul className="collector-subscription-features">
            {featureLabels(current?.entitlements).map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
      </section>
      <section className="collector-panel collector-plan-compare">
        <PanelHeader title="Compare plans" />
        <div className="collector-plan-grid">
          {data.plans.map((plan) => (
            <article key={plan.code}>
              <span className="collector-advanced-card__eyebrow">{plan.displayName}</span>
              <strong>{formatPlanPrice(plan.monthlyPriceMinor, plan.currency)} / month</strong>
              <p>
                {numberEntitlement(plan.entitlements.maxActiveCollectibles)} active collectibles ·{" "}
                {numberEntitlement(plan.entitlements.monthlySubmissionLimit)} monthly submissions
              </p>
              <button className="collector-button" disabled={current?.code === plan.code}>
                {current?.code === plan.code ? "Current plan" : "Contact Slice to change plan"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </WorkspacePage>
  );
}

function Usage({ label, value, limit }: { label: string; value: number; limit: number | null }) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {value} / {limit ?? "—"}
      </strong>
    </div>
  );
}

function numberEntitlement(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function featureLabels(entitlements: Record<string, unknown> | undefined) {
  if (!entitlements) return ["Choose a plan to unlock capacity"];
  return [
    numberEntitlement(entitlements.maxActiveCollectibles)
      ? `${entitlements.maxActiveCollectibles} active collectibles`
      : null,
    entitlements.maxConcurrentIntake
      ? `${entitlements.maxConcurrentIntake} concurrent intake`
      : null,
    typeof entitlements.marketResearchTier === "string"
      ? `${String(entitlements.marketResearchTier).toLowerCase()} market research`
      : null,
    entitlements.bulkImportEnabled ? "Bulk link import" : "Standard market research",
    entitlements.advancedAnalyticsEnabled ? "Advanced analytics" : "Standard analytics",
    entitlements.exportEnabled ? "Catalogue export" : null,
    entitlements.prioritySupport ? "Priority support" : "Standard support",
  ].filter((item): item is string => Boolean(item));
}

function subscriptionStatus(status: string, cancelAtPeriodEnd: boolean) {
  if (cancelAtPeriodEnd) return "Cancels at period end";
  if (status === "PAST_DUE") return "Payment issue";
  if (status === "TRIALING") return "Trial active";
  if (status === "ACTIVE") return "Active";
  return "Membership paused";
}

function formatPlanPrice(value: string, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    Number(value) / 100,
  );
}

function AssetManagement({
  asset,
  detail,
  membership,
  initialSection,
  detailFailed,
  deleting,
  onDeleteDraft,
  onSectionChange,
}: {
  asset: CollectorWorkspaceAsset;
  detail?: CollectorAssetDetail;
  membership?: CollectorSubscriptionProjection;
  initialSection: AssetDetailSection;
  detailFailed: boolean;
  deleting: boolean;
  onDeleteDraft: (id: string, version: number) => void;
  onSectionChange: (section: AssetDetailSection) => void;
}) {
  return (
    <AssetManagementView
      asset={asset}
      detail={detail}
      membership={membership}
      initialSection={initialSection}
      detailFailed={detailFailed}
      deleting={deleting}
      onDeleteDraft={onDeleteDraft}
      onSectionChange={onSectionChange}
    />
  );
  /* legacy detail layout retained below temporarily for the existing detail content.
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
                asset.custody ? custodyLabel(asset.custody!.status) : "Not currently in custody"
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
              <Link className="collector-button" to="/asset/$id" params={{ id: asset.slug! }}>
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
  */
}

function SettingsCards({ open }: { open: Open }) {
  return (
    <WorkspacePage
      title="Collector Settings"
      detail="Account security and canonical profile settings remain in your Account center."
    >
      <section className="collector-settings-grid">
        <article className="collector-panel">
          <span className="collector-settings__icon">
            <Settings aria-hidden="true" />
          </span>
          <strong>Account settings</strong>
          <p>Manage account profile, security, sessions and notifications in Account.</p>
          <Link to="/account" className="collector-button">
            Open account settings <ArrowRight aria-hidden="true" />
          </Link>
        </article>
        <article className="collector-panel">
          <span className="collector-settings__icon">
            <Globe2 aria-hidden="true" />
          </span>
          <strong>Public profile settings</strong>
          <p>Manage profile visibility and collector specialties in your public profile.</p>
          <button className="collector-button" onClick={() => open("profile")}>
            Manage public profile <ArrowRight aria-hidden="true" />
          </button>
        </article>
        <article className="collector-panel">
          <span className="collector-settings__icon">
            <FileText aria-hidden="true" />
          </span>
          <strong>Submission support</strong>
          <p>Continue saved submissions and add requested evidence from the submission flow.</p>
          <Link to="/list" className="collector-button">
            Open submissions <ArrowRight aria-hidden="true" />
          </Link>
        </article>
      </section>
    </WorkspacePage>
  );
}

function AssetManagementView({
  asset,
  detail,
  membership,
  initialSection,
  detailFailed,
  deleting,
  onDeleteDraft,
  onSectionChange,
}: {
  asset: CollectorWorkspaceAsset;
  detail?: CollectorAssetDetail;
  membership?: CollectorSubscriptionProjection;
  initialSection: AssetDetailSection;
  detailFailed: boolean;
  deleting: boolean;
  onDeleteDraft: (id: string, version: number) => void;
  onSectionChange: (section: AssetDetailSection) => void;
}) {
  const sections: Array<{ id: AssetDetailSection; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
    { id: "media", label: "Media" },
    { id: "market", label: "Market" },
    { id: "history", label: "History" },
  ];
  const [section, setSection] = useState<AssetDetailSection>(initialSection);
  useEffect(() => setSection(initialSection), [asset.id, initialSection]);
  const market = marketResearchSummary(asset);
  const lifecycle = detail?.lifecycle ?? lifecycleFallback(asset, detail?.requests?.[0] ?? null);
  const content: Record<AssetDetailSection, ReactNode> = {
    overview: (
      <DetailOverview
        asset={asset}
        lifecycle={lifecycle}
        onAction={() =>
          onSectionChange(lifecycle.action?.targetRoute === "media" ? "media" : "details")
        }
      />
    ),
    details: <DetailsTab asset={asset} />,
    submission: <DetailsTab asset={asset} />,
    "market-data": <MarketTab asset={asset} market={market} />,
    media: <MediaDetail asset={asset} />,
    valuation: <DetailsTab asset={asset} />,
    custody: <DetailsTab asset={asset} />,
    market: <MarketTab asset={asset} market={market} />,
    activity: <HistoryTab asset={asset} activity={detail?.activity ?? []} />,
    history: <HistoryTab asset={asset} activity={detail?.activity ?? []} />,
  };
  return (
    <WorkspacePage
      title="My Collectibles"
      detail="A customer-safe view of your collectible and its Slice journey."
    >
      <div className="collector-detail-layout">
        <div className="collector-detail-main">
          <Link to="/collector-workspace" className="collector-detail-back">
            <ChevronLeft aria-hidden="true" /> My Collectibles
          </Link>
          <header className="collector-detail-heading">
            <div>
              <h1>{asset.title}</h1>
              <p>
                {[asset.category, asset.grader && normalizeGrade(asset.grader, asset.grade)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="collector-detail-heading__badges">
                <StatusBadge stage={asset.stage} />
                <span className="collector-detail-owned">Owned</span>
              </div>
            </div>
            <div className="collector-detail-heading__actions">
              {detailAction(asset)}
              <button
                className="collector-button collector-button--icon"
                aria-label="More collectible actions"
              >
                ···
              </button>
            </div>
          </header>
          <section className="collector-detail-summary-card">
            <AssetThumbnail asset={asset} className="collector-detail-summary-card__image" />
            <div className="collector-detail-summary-card__values">
              <DetailValue
                label="Slice-supported valuation"
                value={money(asset.valuation.supportedValue)}
              />
              <small>
                {asset.valuation.supportedValue
                  ? `Updated ${date(asset.valuation.supportedValue.asOf)}`
                  : "No supported valuation yet"}
              </small>
              <div className="collector-detail-summary-card__divider" />
              <DetailValue
                label="External reference"
                value={money(asset.valuation.externalReference)}
              />
              <small>
                {asset.valuation.externalReference
                  ? `Updated ${date(asset.valuation.externalReference.asOf)}`
                  : "No external reference available"}
              </small>
            </div>
            <dl className="collector-detail-identity-grid">
              {[
                ["Brand", asset.manufacturer],
                ["Year", asset.year?.toString()],
                ["Set", asset.set],
                ["Card number", asset.cardNumber ? `#${asset.cardNumber}` : null],
                ["Variant", asset.edition],
                ["Grader", asset.grader],
                ["Grade", normalizeGrade(asset.grader, asset.grade)],
                ["Certification", asset.certificationNumber],
              ].map(([label, value]) =>
                value ? (
                  <Detail key={String(label)} label={String(label)} value={String(value)} />
                ) : null,
              )}
            </dl>
          </section>
          <div className="collector-detail-tabs" role="tablist" aria-label="Collectible details">
            {sections.map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={section === id}
                className={section === id ? "is-active" : ""}
                onClick={() => {
                  setSection(id);
                  onSectionChange(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <DetailPanel title={sections.find((item) => item.id === section)?.label ?? "Details"}>
            {detailFailed ? (
              <p className="collector-form-error" role="alert">
                We couldn&apos;t load the latest detail update. Showing the current workspace
                summary.
              </p>
            ) : null}
            {content[section]}
            {asset.submissionStatus === "DRAFT" ? (
              <div className="collector-detail-danger-zone">
                <button
                  className="collector-button collector-button--danger"
                  disabled={deleting}
                  onClick={() => {
                    if (window.confirm("Delete this editable draft? This cannot be undone."))
                      onDeleteDraft(asset.id, asset.version);
                  }}
                >
                  <Trash2 aria-hidden="true" /> {deleting ? "Deleting draft…" : "Delete draft"}
                </button>
              </div>
            ) : null}
          </DetailPanel>
        </div>
        <aside className="collector-detail-rail">
          <DetailMarketRail asset={asset} />
          <DetailMilestone lifecycle={lifecycle} />
          <RelatedActions actions={detail?.requests ?? []} onSectionChange={onSectionChange} />
          <MembershipRail membership={membership} />
        </aside>
      </div>
    </WorkspacePage>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="collector-detail-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailOverview({
  asset,
  lifecycle,
  onAction,
}: {
  asset: CollectorWorkspaceAsset;
  lifecycle: CollectorWorkspaceLifecycle;
  onAction: () => void;
}) {
  return (
    <div className="collector-detail-overview">
      <section className="collector-detail-journey">
        <div className="collector-detail-section-heading">
          <h3>Collectible journey</h3>
          <span>{lifecycle.currentLabel}</span>
        </div>
        <ol>
          {lifecycle.steps.map((step) => (
            <li key={step.id} className={`is-${step.status.toLowerCase()}`}>
              <span>
                {step.status === "COMPLETED" ? "✓" : step.status === "ACTION_REQUIRED" ? "!" : "·"}
              </span>
              <strong>{step.label}</strong>
              {step.occurredAt ? <small>{date(step.occurredAt)}</small> : null}
            </li>
          ))}
        </ol>
        <div
          className={`collector-detail-current collector-detail-current--${lifecycle.currentStatus.toLowerCase()}`}
        >
          <span>
            {lifecycle.currentStatus === "ACTION_REQUIRED"
              ? "Action required"
              : lifecycle.currentStatus === "CURRENT"
                ? "Current status"
                : "Status"}
          </span>
          <strong>{lifecycle.currentLabel}</strong>
          <p>{lifecycle.currentDetail}</p>
          {lifecycle.action ? (
            <button className="collector-button collector-button--primary" onClick={onAction}>
              {lifecycle.action.label} <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </section>
      <section className="collector-detail-glance">
        <div className="collector-detail-section-heading">
          <h3>At a glance</h3>
        </div>
        <div className="collector-detail-glance__grid">
          <DetailValue
            label="Slice-supported valuation"
            value={money(asset.valuation.supportedValue)}
          />
          <DetailValue
            label="Custody status"
            value={asset.custody ? custodyLabel(asset.custody.status) : "Not yet in custody"}
          />
          <DetailValue
            label="Marketplace status"
            value={asset.market.isLive ? "Market live" : "Not market live"}
          />
          <DetailValue label="Shares available" value={availability(asset)} />
        </div>
      </section>
      <section className="collector-detail-next">
        <div className="collector-detail-section-heading">
          <h3>What happens next?</h3>
        </div>
        <strong>{lifecycle.nextMilestone.label}</strong>
        <p>{lifecycle.nextMilestone.detail}</p>
        {asset.market.isLive && asset.slug ? (
          <Link className="collector-button" to="/asset/$id" params={{ id: asset.slug }}>
            View market <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </section>
    </div>
  );
}

function DetailsTab({ asset }: { asset: CollectorWorkspaceAsset }) {
  return (
    <div className="collector-detail-tab-stack">
      <DetailPanel title="Collectible information">
        <div className="collector-detail-summary-grid">
          <Detail label="Category" value={asset.category ?? "Unavailable"} />
          <Detail label="Brand" value={asset.manufacturer ?? "Unavailable"} />
          <Detail label="Year" value={asset.year?.toString() ?? "Unavailable"} />
          <Detail label="Set" value={asset.set ?? "Unavailable"} />
          <Detail
            label="Card number"
            value={asset.cardNumber ? `#${asset.cardNumber}` : "Unavailable"}
          />
          <Detail label="Variant" value={asset.edition ?? "Unavailable"} />
          <Detail label="Grader" value={asset.grader ?? "Unavailable"} />
          <Detail label="Grade" value={normalizeGrade(asset.grader, asset.grade)} />
          <Detail label="Certification" value={asset.certificationNumber ?? "Unavailable"} />
        </div>
      </DetailPanel>
      <SubmissionDetail asset={asset} />
      <ValuationDetail asset={asset} market={marketResearchSummary(asset)} />
      <CustodyDetail asset={asset} />
    </div>
  );
}

function MarketTab({
  asset,
  market,
}: {
  asset: CollectorWorkspaceAsset;
  market: ReturnType<typeof marketResearchSummary>;
}) {
  return (
    <div className="collector-detail-tab-stack">
      <ValuationDetail asset={asset} market={market} />
      <MarketResearchDetail asset={asset} market={market} />
      <MarketDetail asset={asset} />
    </div>
  );
}

function HistoryTab({
  asset,
  activity,
}: {
  asset: CollectorWorkspaceAsset;
  activity: CollectorWorkspaceOverview["activity"];
}) {
  return (
    <div className="collector-detail-activity">
      {activity.length ? (
        <ul>
          {activity.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <Empty detail={`No customer-safe history is available for ${asset.title} yet.`} />
      )}
    </div>
  );
}

function DetailMarketRail({ asset }: { asset: CollectorWorkspaceAsset }) {
  return (
    <section className="collector-panel collector-detail-rail-card">
      <PanelHeader title="Current status" />
      <DetailRailRow
        label="Current status"
        value={asset.market.isLive ? "Market live" : stageCopy(asset.stage).label}
      />
      <DetailRailRow label="Shares available" value={availability(asset)} />
      <DetailRailRow
        label="Owners"
        value={asset.market.ownersCount === null ? "Unavailable" : String(asset.market.ownersCount)}
      />
      <DetailRailRow label="Executions" value={String(asset.market.executionCount)} />
      <DetailRailRow label="Latest trade" value={sharePrice(asset)} />
      {asset.slug && asset.market.isLive ? (
        <Link
          className="collector-button collector-button--primary"
          to="/asset/$id"
          params={{ id: asset.slug }}
        >
          View market <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

function DetailRailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="collector-detail-rail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailMilestone({ lifecycle }: { lifecycle: CollectorWorkspaceLifecycle }) {
  return (
    <section className="collector-panel collector-detail-rail-card">
      <PanelHeader title="Next milestone" />
      <strong className="collector-detail-milestone__label">{lifecycle.nextMilestone.label}</strong>
      <p>{lifecycle.nextMilestone.detail}</p>
    </section>
  );
}

function RelatedActions({
  actions,
  onSectionChange,
}: {
  actions: CollectorWorkspaceRequest[];
  onSectionChange: (section: AssetDetailSection) => void;
}) {
  return (
    <section className="collector-panel collector-detail-rail-card">
      <PanelHeader title="Related actions" />
      {actions.length ? (
        actions.map((action) => (
          <div className="collector-detail-related-action" key={action.id}>
            <strong>{action.actionLabel}</strong>
            <p>{action.reason}</p>
            <button
              className="collector-button"
              onClick={() => onSectionChange(action.targetRoute === "media" ? "media" : "details")}
            >
              {action.actionLabel} <ArrowRight aria-hidden="true" />
            </button>
          </div>
        ))
      ) : (
        <div className="collector-detail-no-action">
          <strong>No actions required</strong>
          <p>
            You&apos;re all caught up. We&apos;ll notify you if anything requires your attention.
          </p>
        </div>
      )}
    </section>
  );
}

function MembershipRail({ membership }: { membership?: CollectorSubscriptionProjection }) {
  const current = membership?.current;
  const remaining = membership?.usage.remainingCatalogueCapacity;
  if (!current || (remaining !== null && remaining !== undefined && remaining > 3)) return null;
  return (
    <section className="collector-panel collector-detail-rail-card">
      <PanelHeader title="Increase your limits" />
      <p>Upgrade your Collector membership to list more collectibles and access advanced tools.</p>
      <Link className="collector-button" to="/collector-workspace">
        Manage subscription <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

function SubmissionDetail({ asset }: { asset: CollectorWorkspaceAsset }) {
  const { repositories } = useAppServices();
  const client = useQueryClient();
  const canSelectVault = asset.submissionStatus === "APPROVED" && !asset.intake?.shipment;
  const vaults = useQuery({
    queryKey: ["collector-workspace", "vaults"],
    queryFn: repositories.collectorWorkspace.listVaults,
    enabled: canSelectVault,
  });
  const selectVault = useMutation({
    mutationFn: (vaultId: string) => repositories.collectorWorkspace.selectVault(asset.id, vaultId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.collectorWorkspace.overview });
      void client.invalidateQueries({ queryKey: queryKeys.collectorWorkspace.detail(asset.id) });
    },
  });
  const addShipment = useMutation({
    mutationFn: (input: { carrier: string; trackingNumber: string; shippedAt: string }) =>
      repositories.collectorWorkspace.addShipment(asset.id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.collectorWorkspace.overview });
      void client.invalidateQueries({ queryKey: queryKeys.collectorWorkspace.detail(asset.id) });
    },
  });
  return (
    <div className="collector-detail-summary-grid">
      <Detail label="Submission status" value={sentence(asset.submissionStatus)} />
      <Detail label="Last updated" value={date(asset.updatedAt)} />
      <Detail label="Collectible details" value={assetMetadata(asset)} />
      <Detail
        label="Evidence"
        value={
          asset.media.length
            ? `${asset.media.length} uploaded item${asset.media.length === 1 ? "" : "s"}`
            : "No evidence uploaded"
        }
      />
      <Detail label="Allowed action" value={submissionNextStep(asset)} />
      <Link to="/submissions/$id" params={{ id: asset.id }} className="collector-button">
        {asset.submissionStatus === "CHANGES_REQUESTED"
          ? "Review requested changes"
          : asset.stage === "DRAFT"
            ? "Continue submission"
            : "View submission"}{" "}
        <ArrowRight aria-hidden="true" />
      </Link>
      {canSelectVault ? (
        <div className="collector-intake-action">
          <strong>Choose a vault</strong>
          <small>
            {asset.intake
              ? `Current destination: ${asset.intake.vault.displayName}. You can change it until shipment starts.`
              : "Your submission has been accepted for physical intake. Select a customer-safe destination to continue."}
          </small>
          {vaults.data?.map((vault) => (
            <button
              key={vault.id}
              className="collector-button"
              disabled={selectVault.isPending}
              onClick={() => selectVault.mutate(vault.id)}
            >
              {vault.displayName} · {vault.countryCode}
              <ArrowRight aria-hidden="true" />
            </button>
          ))}
          {vaults.isFetched && !vaults.data?.length ? (
            <div className="collector-intake-empty" role="status">
              <strong>Shipping isn&apos;t available yet for this collectible.</strong>
              <small>
                Slice is preparing the receiving location for this Beta submission. We&apos;ll let
                you know when shipping is available.
              </small>
            </div>
          ) : null}
        </div>
      ) : null}
      {asset.intake?.status === "SHIPPING_REQUIRED" && !asset.intake.shipment ? (
        <ShipmentForm
          submitting={addShipment.isPending}
          onSubmit={(input) => addShipment.mutate(input)}
        />
      ) : null}
      {asset.intake?.shipment ? (
        <div className="collector-intake-status">
          <strong>
            {asset.intake.shipment.status === "DELIVERED" ? "Delivered to intake" : "In transit"}
          </strong>
          <span>
            {asset.intake.shipment.carrier} · {asset.intake.shipment.trackingNumber}
          </span>
          <small>
            {asset.intake.vault.displayName} · {asset.intake.intakeReference}
          </small>
          {asset.intake.shipment.status === "DELIVERED" && !asset.intake.receivedAt ? (
            <em>
              Waiting for Slice to confirm receipt. Carrier delivery is not custody confirmation.
            </em>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ShipmentForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (input: { carrier: string; trackingNumber: string; shippedAt: string }) => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  return (
    <form
      className="collector-intake-action"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ carrier, trackingNumber, shippedAt: new Date().toISOString() });
      }}
    >
      <strong>Add shipment details</strong>
      <input
        value={carrier}
        onChange={(event) => setCarrier(event.target.value)}
        placeholder="Carrier"
        required
      />
      <input
        value={trackingNumber}
        onChange={(event) => setTrackingNumber(event.target.value)}
        placeholder="Tracking number"
        required
      />
      <button className="collector-button collector-button--primary" disabled={submitting}>
        {submitting ? "Saving…" : "Mark as shipped"}
      </button>
    </form>
  );
}

function MarketResearchDetail({
  asset,
  market,
}: {
  asset: CollectorWorkspaceAsset;
  market: ReturnType<typeof marketResearchSummary>;
}) {
  return (
    <div className="collector-detail-market-research">
      <section className="collector-detail-market-summary">
        <span>Market summary</span>
        <div>
          <Detail label="Recent sale range" value={market.saleRange ?? "Unavailable"} />
          <Detail label="Median recent sale" value={market.median ?? "Unavailable"} />
          <Detail label="Current listings" value={market.listingRange ?? "Unavailable"} />
          <Detail
            label="Last checked"
            value={market.updatedAt ? date(market.updatedAt) : "Unavailable"}
          />
        </div>
      </section>
      <p className="collector-detail-note">
        External research is informational only and does not replace a Slice-supported valuation.
      </p>
      <div className="collector-detail-summary-grid">
        <Detail
          label="Research status"
          value={
            asset.marketResearch
              ? sentence(asset.marketResearch.state)
              : "No market research available"
          }
        />
        <Detail label="Exact comparable sales" value={market.exactComps ?? "Unavailable"} />
        <Detail label="Recent sales" value={market.saleCount ?? "Unavailable"} />
        <Detail label="Listings observed" value={market.listingCount ?? "Unavailable"} />
      </div>
      <p className="collector-detail-note">
        Individual comparable-sale and listing observations are not available in this collector
        projection.
      </p>
    </div>
  );
}

function MediaDetail({ asset }: { asset: CollectorWorkspaceAsset }) {
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowRight")
        setSelected((value) => (value === null ? 0 : (value + 1) % asset.media.length));
      if (event.key === "ArrowLeft")
        setSelected((value) =>
          value === null ? 0 : (value - 1 + asset.media.length) % asset.media.length,
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, asset.media.length]);
  if (!asset.media.length)
    return <Empty detail="No evidence has been uploaded for this collectible yet." />;
  const current = selected === null ? null : asset.media[selected];
  return (
    <>
      <div className="collector-media-gallery">
        {asset.media.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className="collector-media-tile"
            onClick={() => setSelected(index)}
            aria-label={`View ${friendlyMediaLabel(item.slot)}`}
          >
            <AssetThumbnail asset={asset} className="collector-media-tile__preview" />
            <strong>{friendlyMediaLabel(item.slot)}</strong>
            <small>
              {sentence(item.status)} · Uploaded {date(item.updatedAt)}
            </small>
            <em>Click to view full image</em>
          </button>
        ))}
      </div>
      {current ? (
        <div
          className="collector-media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={friendlyMediaLabel(current.slot)}
          onClick={() => setSelected(null)}
        >
          <button
            type="button"
            className="collector-media-lightbox__close"
            onClick={() => setSelected(null)}
          >
            <X aria-hidden="true" />
          </button>
          <button
            type="button"
            className="collector-media-lightbox__previous"
            onClick={(event) => {
              event.stopPropagation();
              setSelected((value) =>
                value === null ? 0 : (value - 1 + asset.media.length) % asset.media.length,
              );
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <AssetThumbnail asset={asset} className="collector-media-lightbox__image" />
          <div className="collector-media-lightbox__label">
            {friendlyMediaLabel(current.slot)} · {sentence(current.status)}
          </div>
          <button
            type="button"
            className="collector-media-lightbox__next"
            onClick={(event) => {
              event.stopPropagation();
              setSelected((value) => (value === null ? 0 : (value + 1) % asset.media.length));
            }}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function ValuationDetail({
  asset,
  market,
}: {
  asset: CollectorWorkspaceAsset;
  market: ReturnType<typeof marketResearchSummary>;
}) {
  return (
    <div className="collector-detail-valuation">
      <section className="collector-detail-valuation__primary">
        <span>Slice-supported valuation</span>
        <strong>{money(asset.valuation.supportedValue)}</strong>
        <p>
          {asset.valuation.supportedValue
            ? `Updated ${date(asset.valuation.supportedValue.asOf)}`
            : "Slice valuation pending. Market references remain informational until staff review is complete."}
        </p>
      </section>
      <div className="collector-detail-summary-grid">
        <Detail
          label="External market reference"
          value={market.saleRange ?? money(asset.valuation.externalReference)}
        />
        <Detail
          label="External reference date"
          value={
            market.updatedAt
              ? date(market.updatedAt)
              : asset.valuation.externalReference
                ? date(asset.valuation.externalReference.asOf)
                : "Unavailable"
          }
        />
        <Detail label="Current listings" value={market.listingRange ?? "Unavailable"} />
        <Detail
          label="Valuation status"
          value={asset.valuation.supportedValue ? "Supported" : "Pending"}
        />
      </div>
    </div>
  );
}

function CustodyDetail({ asset }: { asset: CollectorWorkspaceAsset }) {
  return (
    <div className="collector-detail-custody">
      <CustodyTimeline asset={asset} full />
      <div className="collector-detail-summary-grid">
        <Detail
          label="Current custody status"
          value={asset.custody ? custodyLabel(asset.custody.status) : "Not currently in custody"}
        />
        <Detail
          label="Last updated"
          value={asset.custody ? date(asset.custody.updatedAt) : "Unavailable"}
        />
        <Detail
          label="Vault readiness"
          value={
            ["VAULT_READY", "MARKET_LIVE"].includes(asset.stage)
              ? "Vault ready"
              : "Not yet confirmed"
          }
        />
        <Detail
          label="Market publication"
          value={asset.market.isLive ? "Published" : "Not published"}
        />
      </div>
      <p className="collector-detail-note">
        Custody and vault stages are controlled by Slice and its providers. Exact facility details
        remain private for security.
      </p>
    </div>
  );
}

function MarketDetail({ asset }: { asset: CollectorWorkspaceAsset }) {
  if (!asset.market.isLive) {
    return (
      <Empty
        detail={`${stageCopy(asset.stage).label} — this collectible is not available on the public market yet.`}
      />
    );
  }
  return (
    <div className="collector-detail-market">
      <div className="collector-detail-summary-grid">
        <Detail label="Reference value" value={money(asset.referenceValue)} />
        <Detail label="Shares available" value={availability(asset)} />
        <Detail
          label="Owners"
          value={
            asset.market.ownersCount === null ? "Unavailable" : String(asset.market.ownersCount)
          }
        />
        <Detail
          label="Executions"
          value={asset.market.executionCount ? String(asset.market.executionCount) : "None"}
        />
        <Detail label="Latest trade" value={sharePrice(asset)} />
        <Detail label="Market status" value="Market live" />
      </div>
      {asset.slug ? (
        <Link className="collector-button" to="/asset/$id" params={{ id: asset.slug }}>
          Open public market <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function ActivityDetail({
  asset,
  activity,
  requests,
}: {
  asset: CollectorWorkspaceAsset;
  activity: CollectorWorkspaceOverview["activity"];
  requests: CollectorWorkspaceRequest[];
}) {
  const related = activity.filter(Boolean);
  return (
    <div className="collector-detail-activity">
      {requests.length ? (
        <p className="collector-detail-note">
          {requests.length} open customer request{requests.length === 1 ? "" : "s"} related to this
          collectible.
        </p>
      ) : null}
      {related.length ? (
        <ul>
          {related.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <Empty detail={`No customer-safe activity is available for ${asset.title} yet.`} />
      )}
    </div>
  );
}

function CustodyTimeline({
  asset,
  full = false,
}: {
  asset: CollectorWorkspaceAsset;
  full?: boolean;
}) {
  const current = custodyProgress(asset);
  const steps = ["Received", "Verified", "Custody confirmed", "Vault ready", "Market live"];
  return (
    <ol
      className={`collector-custody-timeline ${full ? "is-full" : ""}`}
      aria-label="Custody lifecycle"
    >
      {steps.map((step, index) => (
        <li
          key={step}
          className={index < current ? "is-complete" : index === current ? "is-current" : ""}
        >
          <span>{index < current ? "✓" : index + 1}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  );
}

function Ranking({
  title,
  assets,
  metric,
  open,
}: {
  title: string;
  assets: CollectorWorkspaceAsset[];
  metric: (asset: CollectorWorkspaceAsset) => string;
  open?: Open;
}) {
  return (
    <section className="collector-ranking">
      <h3>{title}</h3>
      {assets.length ? (
        <ol>
          {assets.map((asset, index) => (
            <li key={asset.id}>
              <span>{index + 1}</span>
              <AssetThumbnail asset={asset} />
              <div>
                <strong>{asset.title}</strong>
                <small>{assetMetadata(asset)}</small>
              </div>
              <b>{metric(asset)}</b>
              {open ? (
                <button onClick={() => open("asset", asset.id, "overview")}>View</button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <Empty detail="No recorded current market activity is available yet." />
      )}
    </section>
  );
}

function detailAction(asset: CollectorWorkspaceAsset) {
  if (asset.slug && asset.market.isLive)
    return (
      <Link
        className="collector-button collector-button--primary"
        to="/asset/$id"
        params={{ id: asset.slug }}
      >
        View market <ArrowRight aria-hidden="true" />
      </Link>
    );
  return (
    <Link
      to="/submissions/$id"
      params={{ id: asset.id }}
      className="collector-button collector-button--primary"
    >
      {asset.submissionStatus === "CHANGES_REQUESTED"
        ? "Review request"
        : asset.stage === "DRAFT"
          ? "Continue submission"
          : "View submission"}{" "}
      <ArrowRight aria-hidden="true" />
    </Link>
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
  return (
    <button className="collector-asset-card" onClick={() => open("asset", asset.id)}>
      <AssetThumbnail asset={asset} className="collector-asset-card__image" />
      <strong>{asset.title}</strong>
      <span>
        {[asset.year, asset.set].filter(Boolean).join(" · ") || asset.category || "Collectible"}
      </span>
      <span>{asset.grade ?? "Grade unavailable"}</span>
      <b>{money(asset.referenceValue)}</b>
      <StatusBadge stage={asset.stage} />
      <span className="collector-asset-card__cta">
        Manage collectible <ArrowRight aria-hidden="true" />
      </span>
    </button>
  );
}

function AssetThumbnail({
  asset,
  className,
}: {
  asset: CollectorWorkspaceAsset;
  className?: string;
}) {
  const media = asset.slug ? assetShowcaseMedia(asset.slug) : undefined;
  return (
    <span className={className ?? "collector-asset-thumbnail"}>
      {media ? <img src={media.src} alt="" /> : <PackageCheck aria-hidden="true" />}
    </span>
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

type Open = (section: WorkspaceSection, assetId?: string, tab?: AssetDetailSection) => void;
const stageCopy = (stage: CollectorWorkspaceStage) =>
  ({
    DRAFT: { label: "Draft", icon: FileText },
    SUBMITTED: { label: "Submitted", icon: Upload },
    REVIEW: { label: "In Review", icon: ClipboardList },
    VALUATION: { label: "Valuation", icon: BadgeCheck },
    CUSTODY: { label: "Custody", icon: Box },
    VAULT_READY: { label: "Vault Ready", icon: Vault },
    MARKET_LIVE: { label: "Market Live", icon: BarChart3 },
  })[stage];
function isAssetDetailSection(value: string): value is AssetDetailSection {
  return [
    "overview",
    "details",
    "history",
    "submission",
    "market-data",
    "media",
    "valuation",
    "custody",
    "market",
    "activity",
  ].includes(value);
}
function normalizeAssetDetailSection(value: string): AssetDetailSection {
  if (value === "submission" || value === "valuation" || value === "custody") return "details";
  if (value === "market-data") return "market";
  if (value === "activity") return "history";
  return isAssetDetailSection(value) ? value : "overview";
}
function lifecycleFallback(
  asset: CollectorWorkspaceAsset,
  action: CollectorWorkspaceRequest | null,
): CollectorWorkspaceLifecycle {
  const marketLive = asset.market.isLive || asset.stage === "MARKET_LIVE";
  const hasIntake = Boolean(asset.intake);
  const hasShipment = Boolean(asset.intake?.shipment);
  const hasReceived =
    Boolean(asset.intake?.receivedAt) ||
    ["RECEIVED", "INSPECTED", "SECURED"].includes(asset.custody?.status ?? "");
  const hasVerified =
    ["INSPECTED", "SECURED"].includes(asset.custody?.status ?? "") ||
    ["VAULT_READY", "MARKET_LIVE"].includes(asset.stage);
  const done = (value: boolean, id: string, label: string) => ({
    id,
    label,
    status: value ? ("COMPLETED" as const) : ("UPCOMING" as const),
    occurredAt: null,
  });
  const actionId =
    action?.type === "CHOOSE_VAULT"
      ? "vault"
      : action?.type === "ADD_TRACKING"
        ? "shipped"
        : action
          ? "submitted"
          : null;
  const steps = [
    done(asset.submissionStatus !== "DRAFT" && actionId !== "submitted", "submitted", "Submitted"),
    done(
      ["APPROVED", "IN_REVIEW"].includes(asset.submissionStatus) || asset.stage !== "DRAFT",
      "accepted",
      "Accepted",
    ),
    done(hasIntake && actionId !== "vault", "vault", hasIntake ? "Vault selected" : "Choose vault"),
    done(hasShipment && actionId !== "shipped", "shipped", "Shipped"),
    done(hasReceived, "received", "Received"),
    done(hasVerified, "verified", "Verified"),
    done(Boolean(asset.valuation.supportedValue), "valued", "Valued"),
    done(["VAULT_READY", "MARKET_LIVE"].includes(asset.stage), "vault-ready", "Vault ready"),
    done(marketLive, "market-live", "Market live"),
  ];
  const currentIndex = actionId
    ? Math.max(
        0,
        steps.findIndex((step) => step.id === actionId),
      )
    : asset.stage === "DRAFT"
      ? 0
      : asset.stage === "CUSTODY"
        ? 5
        : asset.stage === "VALUATION"
          ? 6
          : asset.stage === "VAULT_READY"
            ? 7
            : marketLive
              ? 8
              : 1;
  const currentStatus: CollectorWorkspaceLifecycle["currentStatus"] = action
    ? "ACTION_REQUIRED"
    : "CURRENT";
  const normalizedSteps = steps.map((step, index) => ({
    ...step,
    status: index === currentIndex ? currentStatus : step.status,
  }));
  const currentLabel =
    action?.actionLabel ?? (marketLive ? "Market live" : stageCopy(asset.stage).label);
  const currentDetail =
    action?.reason ??
    (marketLive
      ? "Your collectible is verified, held in Slice custody, and currently available through the marketplace."
      : "Slice is moving your collectible through the authenticated workflow. No action is required from you right now.");
  return {
    currentStage: asset.stage,
    currentStatus,
    currentLabel,
    currentDetail,
    nextMilestone: action
      ? { label: action.actionLabel, detail: action.reason }
      : marketLive
        ? {
            label: "Ongoing",
            detail:
              "Your collectible is live on the marketplace. We'll notify you of any major updates.",
          }
        : {
            label: "Workflow update",
            detail: "We will notify you when the next milestone is reached.",
          },
    action: action
      ? {
          type: action.type,
          label: action.actionLabel,
          detail: action.reason,
          targetRoute: action.targetRoute,
        }
      : null,
    steps: normalizedSteps,
  };
}
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
function submissionNextStep(asset: CollectorWorkspaceAsset) {
  if (asset.submissionStatus === "CHANGES_REQUESTED") return "Review requested changes";
  if (asset.stage === "DRAFT") return "Finish your draft";
  if (asset.stage === "SUBMITTED" || asset.stage === "REVIEW") return "Awaiting staff review";
  if (asset.stage === "VALUATION") return "Valuation in progress";
  if (asset.stage === "CUSTODY") return "Custody in progress";
  if (asset.stage === "VAULT_READY") return "Awaiting market publication";
  return "No action required";
}
function friendlyMediaLabel(slot: string) {
  return `${slot.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())} evidence`;
}
function money(value: { amountMinor: string; currency: string } | null) {
  if (!value) return "Unavailable";
  const { currency, rates } = getCurrencyPresentation();
  return formatDisplayMoney(
    value.amountMinor,
    asSupportedCurrency(value.currency) ?? "GBP",
    currency,
    rates,
    {
      maximumFractionDigits: 0,
    },
  );
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
function sentence(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
function assetMetadata(asset: CollectorWorkspaceAsset) {
  return (
    [asset.year, asset.set, normalizeGrade(asset.grader, asset.grade)]
      .filter(Boolean)
      .join(" · ") || "Collectible details unavailable"
  );
}
function normalizeGrade(grader: string | null | undefined, grade: string | null | undefined) {
  if (!grade) return grader ?? "Unavailable";
  const numeric = Number(grade);
  const formatted = Number.isFinite(numeric) ? numeric.toString() : grade;
  return [grader, formatted].filter(Boolean).join(" ");
}
function availability(asset: CollectorWorkspaceAsset) {
  return asset.market.availabilityBps === null
    ? "Unavailable"
    : `${(asset.market.availabilityBps / 100).toFixed(asset.market.availabilityBps % 100 ? 2 : 0)}%`;
}
function sharePrice(asset: CollectorWorkspaceAsset) {
  if (!asset.market.latestSharePriceMinor) return "Unavailable";
  return `${money({ amountMinor: asset.market.latestSharePriceMinor, currency: asset.referenceValue?.currency ?? "GBP" })}/share`;
}
function custodyProgress(asset: CollectorWorkspaceAsset) {
  if (asset.market.isLive || asset.stage === "MARKET_LIVE") return 5;
  if (asset.stage === "VAULT_READY") return 4;
  if (asset.custody?.status === "SECURED") return 3;
  if (asset.custody?.status === "INSPECTED") return 2;
  if (asset.custody?.status === "RECEIVED") return 1;
  return 0;
}
function marketResearchSummary(asset: CollectorWorkspaceAsset) {
  const snapshot = asset.marketResearch?.snapshot ?? {};
  const record = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const string = (value: unknown) => (typeof value === "string" ? value : undefined);
  const number = (value: unknown) => (typeof value === "number" ? value : undefined);
  const sales = record(snapshot.sales);
  const listings = record(snapshot.listings);
  const formatRange = (summary?: Record<string, unknown>) => {
    const currency = string(summary?.currency);
    const low = string(summary?.lowMinor);
    const high = string(summary?.highMinor);
    if (!currency || !low || !high) return undefined;
    const lowValue = money({ amountMinor: low, currency });
    const highValue = money({ amountMinor: high, currency });
    return low === high ? lowValue : `${lowValue} – ${highValue}`;
  };
  const formatMedian = (summary?: Record<string, unknown>) => {
    const currency = string(summary?.currency);
    const median = string(summary?.medianMinor);
    return currency && median ? money({ amountMinor: median, currency }) : undefined;
  };
  const updatedAt = string(snapshot.updatedAt) ?? asset.marketResearch?.collectedAt;
  return {
    saleRange: formatRange(sales),
    listingRange: formatRange(listings),
    median: formatMedian(sales),
    updatedAt,
    exactComps: number(snapshot.exactCompCount)?.toString(),
    saleCount: number(sales?.count)?.toString(),
    listingCount: number(listings?.count)?.toString(),
  };
}
