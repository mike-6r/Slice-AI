import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileClock,
  Flag,
  Gauge,
  Globe2,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  PackageCheck,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { logout } from "@/auth/actions";
import { canAccessAdmin } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { Wordmark } from "@/components/layout/MainNavigation";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import type { AssetOperationSummary } from "@/domain/submission";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: isAdminSection(search.section) ? search.section : "control",
  }),
  head: () => ({ meta: [{ title: "Admin Console | Slice" }] }),
  component: AdminPage,
});

type AdminSection =
  | "control"
  | "users"
  | "moderation"
  | "compliance"
  | "payments"
  | "support"
  | "health"
  | "audit"
  | "flags"
  | "integrations"
  | "settings";

type AdminNavItem = { id: AdminSection; label: string; icon: typeof LayoutDashboard };

const navItems: AdminNavItem[] = [
  { id: "control", label: "Control Center", icon: LayoutDashboard },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "moderation", label: "Asset Moderation", icon: ClipboardCheck },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "payments", label: "Payments & Wallets", icon: WalletCards },
  { id: "support", label: "Support & Cases", icon: LifeBuoy },
  { id: "health", label: "System Health", icon: HeartPulse },
  { id: "audit", label: "Audit Logs", icon: FileClock },
  { id: "flags", label: "Feature Flags", icon: Flag },
  { id: "integrations", label: "Integrations", icon: SlidersHorizontal },
  { id: "settings", label: "Settings", icon: Settings },
];

function isAdminSection(value: unknown): value is AdminSection {
  return typeof value === "string" && navItems.some((item) => item.id === value);
}

function AdminPage() {
  return (
    <RoleWorkspaceGuard allows={canAccessAdmin} title="Admin Console">
      <AdminConsole />
    </RoleWorkspaceGuard>
  );
}

function AdminConsole() {
  const services = useAppServices();
  const navigate = useNavigate({ from: Route.fullPath });
  const { section } = Route.useSearch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const user = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    staleTime: 60_000,
  });
  const reviews = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: () => services.repositories.reviews.listQueue({ limit: 100 }),
    staleTime: 30_000,
  });
  const operations = useQuery({
    queryKey: ["admin", "operations"],
    queryFn: () => services.repositories.lifecycle.listOperations(),
    staleTime: 30_000,
  });
  const select = (next: AdminSection) => {
    void navigate({ search: { section: next }, replace: true });
    setMobileOpen(false);
  };
  const reviewItems = reviews.data?.items ?? [];
  const operationItems = operations.data ?? [];
  const attentionOperations = operationItems.filter(
    (item) => item.valuationStatus === "MISSING" || item.custodyStatus !== "SECURED",
  );

  return (
    <div className="admin-console-shell">
      <aside className={`admin-console-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="admin-console-brand">
          <Wordmark />
          <button
            type="button"
            className="admin-console-close"
            onClick={() => setMobileOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="admin-console-eyebrow">Admin Console</p>
        <nav className="admin-console-nav" aria-label="Admin Console">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={section === id ? "is-active" : ""}
              onClick={() => select(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-console-account">
          <div className="admin-console-avatar">{initials(user.data?.profile.displayName)}</div>
          <div className="min-w-0">
            <strong>{user.data?.profile.displayName ?? "Admin account"}</strong>
            <span>{user.data?.profile.username ? `@${user.data.profile.username}` : "Admin"}</span>
          </div>
          <small>Administrator</small>
          <Link to="/dashboard">
            <BriefcaseBusiness aria-hidden="true" /> Switch to Investor
          </Link>
          <button type="button" onClick={() => void logout()}>
            <LogOut aria-hidden="true" /> Log out
          </button>
        </div>
      </aside>
      {mobileOpen ? (
        <button
          type="button"
          className="admin-console-scrim"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <main className="admin-console-main">
        <header className="admin-console-topbar">
          <button
            type="button"
            className="admin-console-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open admin menu"
          >
            <Menu aria-hidden="true" />
          </button>
          <div>
            <p>Admin Console</p>
            <h1>{navItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <label className="admin-console-search">
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this workspace"
              aria-label="Search this workspace"
            />
          </label>
        </header>
        {section === "control" ? (
          <ControlCenter
            reviews={reviewItems}
            operations={operationItems}
            attentionOperations={attentionOperations}
            loading={reviews.isLoading || operations.isLoading}
            failed={reviews.isError || operations.isError}
            retry={() => {
              void reviews.refetch();
              void operations.refetch();
            }}
            select={select}
          />
        ) : section === "moderation" ? (
          <AssetModeration
            operations={operationItems}
            loading={operations.isLoading}
            failed={operations.isError}
            retry={() => void operations.refetch()}
          />
        ) : section === "users" ? (
          <UnavailablePage
            title="Users & Roles"
            detail="A safe admin user directory read is not exposed to this client yet."
            icon={Users}
          />
        ) : section === "compliance" ? (
          <UnavailablePage
            title="Compliance"
            detail="No admin-safe compliance case projection is available in this client yet."
            icon={ShieldCheck}
          />
        ) : section === "payments" ? (
          <UnavailablePage
            title="Payments & Wallets"
            detail="Ledger and provider movements remain authoritative on their existing pages; no balance editing is available here."
            icon={WalletCards}
          />
        ) : section === "support" ? (
          <UnavailablePage
            title="Support & Cases"
            detail="No support case backend is connected to this admin foundation yet."
            icon={LifeBuoy}
          />
        ) : section === "health" ? (
          <UnavailablePage
            title="System Health"
            detail="System health information couldn't be loaded from an admin-safe projection."
            icon={HeartPulse}
          />
        ) : section === "audit" ? (
          <UnavailablePage
            title="Audit Logs"
            detail="Audit records remain server-authoritative and are not exposed to this client foundation yet."
            icon={FileClock}
          />
        ) : section === "flags" ? (
          <UnavailablePage
            title="Feature Flags"
            detail="No authoritative feature flag read is configured for this environment."
            icon={Flag}
          />
        ) : section === "integrations" ? (
          <Integrations />
        ) : (
          <AdminSettings select={select} />
        )}
      </main>
    </div>
  );
}

function ControlCenter({
  reviews,
  operations,
  attentionOperations,
  loading,
  failed,
  retry,
  select,
}: {
  reviews: Array<{ id: string; status: string; submittedAt: string }>;
  operations: Array<{
    id: string;
    title: string;
    valuationStatus: string;
    custodyStatus: string;
    publicationStatus: string;
    updatedAt: string;
  }>;
  attentionOperations: typeof operations;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  select: (section: AdminSection) => void;
}) {
  if (loading)
    return (
      <AdminState title="Loading Control Center" detail="Reading safe operational projections." />
    );
  if (failed)
    return (
      <AdminState
        title="Control Center unavailable"
        detail="Operational reads could not be loaded safely."
        retry={retry}
      />
    );
  const counts = {
    submissions: reviews.length,
    valuation: operations.filter((item) => item.valuationStatus === "ACTIVE").length,
    custody: operations.filter((item) => item.custodyStatus !== "SECURED").length,
    market: operations.filter((item) => item.publicationStatus === "PUBLISHED").length,
  };
  return (
    <div className="admin-console-content">
      <section className="admin-console-heading">
        <div>
          <p className="admin-console-eyebrow">Control Center</p>
          <h2>Monitor Slice safely.</h2>
          <span>
            Review platform operations and work requiring attention from one focused console.
          </span>
        </div>
        <span className="admin-live-badge">
          <CheckCircle2 aria-hidden="true" /> Read-only foundation
        </span>
      </section>
      <div className="admin-kpi-grid">
        <AdminKpi icon={ClipboardCheck} label="Pending Reviews" value={reviews.length} />
        <AdminKpi icon={BadgeCheck} label="Valuations Active" value={counts.valuation} />
        <AdminKpi icon={PackageCheck} label="Custody Work" value={counts.custody} />
        <AdminKpi icon={BarChart3} label="Market Live" value={counts.market} />
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <AdminPanelHeading
            title="Needs Attention"
            action="Review assets"
            onClick={() => select("moderation")}
          />
          {reviews.length || attentionOperations.length ? (
            <div className="admin-attention-list">
              {reviews.slice(0, 4).map((item) => (
                <AdminAttention
                  key={item.id}
                  type="Asset review"
                  subject={`Submission ${shortId(item.id)}`}
                  detail={`${sentence(item.status)} · received ${date(item.submittedAt)}`}
                  tone="warning"
                />
              ))}
              {attentionOperations.slice(0, 4).map((item) => (
                <AdminAttention
                  key={item.id}
                  type="Lifecycle review"
                  subject={item.title}
                  detail={`Valuation ${sentence(item.valuationStatus)} · updated ${date(item.updatedAt)}`}
                  tone="neutral"
                />
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No assets currently require attention." />
          )}
        </section>
        <section className="admin-panel">
          <AdminPanelHeading title="System Status" />
          <div className="admin-status-list">
            <StatusRow label="API reads" status="Operational" icon={Gauge} />
            <StatusRow label="Database / queues" status="Unknown" icon={Database} />
            <StatusRow label="Notifications" status="Not exposed" icon={Activity} />
            <StatusRow label="Provider health" status="Not exposed" icon={Globe2} />
          </div>
        </section>
      </div>
      <section className="admin-panel">
        <AdminPanelHeading
          title="Operations Overview"
          action="Asset moderation"
          onClick={() => select("moderation")}
        />
        <div className="admin-pipeline">
          <PipelineStage label="Submissions" value={counts.submissions} icon={ClipboardCheck} />
          <PipelineStage label="Valuation" value={counts.valuation} icon={BadgeCheck} />
          <PipelineStage label="Custody" value={counts.custody} icon={Archive} />
          <PipelineStage
            label="Vault Ready"
            value={operations.filter((item) => item.custodyStatus === "SECURED").length}
            icon={Landmark}
          />
          <PipelineStage label="Market Live" value={counts.market} icon={BarChart3} />
        </div>
      </section>
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <AdminPanelHeading title="Recent Activity" />
          <AdminEmpty detail="No admin-safe activity projection is connected yet." />
        </section>
        <section className="admin-panel">
          <AdminPanelHeading title="Open Cases" />
          <AdminEmpty detail="No support or compliance case projection is available." />
        </section>
      </div>
    </div>
  );
}

function AssetModeration({
  operations,
  loading,
  failed,
  retry,
}: {
  operations: AssetOperationSummary[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  if (loading)
    return (
      <AdminState
        title="Loading asset moderation"
        detail="Retrieving staff-safe lifecycle records."
      />
    );
  if (failed)
    return (
      <AdminState
        title="Asset moderation unavailable"
        detail="Lifecycle records could not be loaded safely."
        retry={retry}
      />
    );
  return (
    <AdminPageSection
      title="Asset Moderation"
      detail="Inspect D10/D11 lifecycle projections. Actions remain in the existing authorized operations workspace."
    >
      {operations.length ? (
        <div className="admin-record-list">
          {operations.map((item) => (
            <article className="admin-record" key={item.id}>
              <span className="admin-record-icon">
                <PackageCheck aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong>{item.title}</strong>
                <small>
                  {sentence(item.catalogueStatus)} · Updated {date(item.updatedAt)}
                </small>
              </div>
              <span className="admin-record-status">{moderationStage(item)}</span>
              <ArrowRight aria-hidden="true" />
            </article>
          ))}
        </div>
      ) : (
        <AdminEmpty detail="No assets currently require attention." />
      )}
    </AdminPageSection>
  );
}

function Integrations() {
  return (
    <AdminPageSection
      title="Integrations"
      detail="Configuration summaries will appear when an admin-safe provider projection is connected."
    >
      <div className="admin-integration-grid">
        {["Payments", "Compliance", "Market data", "Email & notifications"].map((name) => (
          <article className="admin-integration" key={name}>
            <SlidersHorizontal aria-hidden="true" />
            <strong>{name}</strong>
            <span>Unknown · not exposed</span>
          </article>
        ))}
      </div>
    </AdminPageSection>
  );
}

function AdminSettings({ select }: { select: (section: AdminSection) => void }) {
  return (
    <AdminPageSection
      title="Admin Settings"
      detail="Keep platform-wide controls behind their authoritative backend workflows."
    >
      <div className="admin-settings-links">
        <button onClick={() => select("audit")}>
          <FileClock aria-hidden="true" /> Audit Logs <ArrowRight aria-hidden="true" />
        </button>
        <button onClick={() => select("integrations")}>
          <SlidersHorizontal aria-hidden="true" /> Integrations <ArrowRight aria-hidden="true" />
        </button>
        <button onClick={() => select("flags")}>
          <Flag aria-hidden="true" /> Feature Flags <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </AdminPageSection>
  );
}

function UnavailablePage({
  title,
  detail,
  icon: Icon,
}: {
  title: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <AdminPageSection title={title} detail={detail}>
      <AdminEmpty
        detail="This area is ready for an authoritative backend projection."
        icon={Icon}
      />
    </AdminPageSection>
  );
}

function AdminPageSection({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-console-content">
      <section className="admin-console-heading">
        <div>
          <p className="admin-console-eyebrow">Admin Console</p>
          <h2>{title}</h2>
          <span>{detail}</span>
        </div>
      </section>
      {children}
    </div>
  );
}

function AdminKpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: number;
}) {
  return (
    <section className="admin-kpi">
      <span>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>Current projection</em>
      </div>
    </section>
  );
}
function AdminPanelHeading({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <header className="admin-panel-heading">
      <h3>{title}</h3>
      {action && onClick ? (
        <button onClick={onClick}>
          {action} <ArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </header>
  );
}
function AdminAttention({
  type,
  subject,
  detail,
  tone,
}: {
  type: string;
  subject: string;
  detail: string;
  tone: "warning" | "neutral";
}) {
  return (
    <article className={`admin-attention admin-attention--${tone}`}>
      <AlertTriangle aria-hidden="true" />
      <div>
        <small>{type}</small>
        <strong>{subject}</strong>
        <span>{detail}</span>
      </div>
      <ArrowRight aria-hidden="true" />
    </article>
  );
}
function StatusRow({
  label,
  status,
  icon: Icon,
}: {
  label: string;
  status: string;
  icon: typeof Gauge;
}) {
  return (
    <div className="admin-status-row">
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{status}</strong>
    </div>
  );
}
function PipelineStage({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Archive;
}) {
  return (
    <div>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function AdminEmpty({
  detail,
  icon: Icon = ListChecks,
}: {
  detail: string;
  icon?: typeof ListChecks;
}) {
  return (
    <div className="admin-empty">
      <Icon aria-hidden="true" />
      <p>{detail}</p>
    </div>
  );
}
function AdminState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <main className="admin-console-state">
      <HeartPulse aria-hidden="true" />
      <h1>{title}</h1>
      <p>{detail}</p>
      {retry ? <button onClick={retry}>Try again</button> : null}
    </main>
  );
}
function moderationStage(item: {
  valuationStatus: string;
  custodyStatus: string;
  publicationStatus: string;
}) {
  if (item.publicationStatus === "PUBLISHED") return "Market Live";
  if (item.custodyStatus === "SECURED") return "Vault Ready";
  if (item.custodyStatus !== "MISSING") return "Custody";
  if (item.valuationStatus === "ACTIVE") return "Valuation";
  return "Needs Review";
}
function sentence(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
function shortId(value: string) {
  return value.slice(0, 8);
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}
function initials(value?: string) {
  return (value ?? "Admin")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
