import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Crown,
  Database,
  FileClock,
  Flag,
  Gauge,
  Globe2,
  HeartPulse,
  Landmark,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  PackageCheck,
  Truck,
  Search,
  Tag,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { logout } from "@/auth/actions";
import { canAccessAdmin } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { Wordmark } from "@/components/layout/MainNavigation";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import type { AssetOperationSummary } from "@/domain/submission";
import type {
  AdminComplianceCase,
  AdminOverview,
  AdminIntakeRow,
  AdminMembershipRow,
  AdminOperationsOverview,
  AdminUserDetail,
  AdminUserSummary,
} from "@/data/repositories";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: isAdminSection(search.section) ? search.section : "control",
    user: typeof search.user === "string" && search.user.length > 0 ? search.user : undefined,
  }),
  head: () => ({ meta: [{ title: "Admin Console | Slice" }] }),
  component: AdminPage,
});

type AdminSection =
  | "control"
  | "users"
  | "moderation"
  | "intake"
  | "valuations"
  | "custody"
  | "marketplace"
  | "memberships"
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
  { id: "users", label: "Users & Collectors", icon: Users },
  { id: "moderation", label: "Asset Review", icon: ClipboardCheck },
  { id: "intake", label: "Physical Intake", icon: Inbox },
  { id: "valuations", label: "Valuations", icon: BadgeCheck },
  { id: "custody", label: "Custody & Vaults", icon: Landmark },
  { id: "marketplace", label: "Marketplace Ops", icon: BarChart3 },
  { id: "memberships", label: "Collector Memberships", icon: Crown },
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

function pipelineSection(stage: string): AdminSection {
  if (["draft", "submitted", "inReview"].includes(stage)) return "moderation";
  if (["accepted", "shipping", "received"].includes(stage)) return "intake";
  if (stage === "verified" || stage === "valued") return "valuations";
  if (stage === "vaultReady") return "custody";
  return "marketplace";
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
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { section } = Route.useSearch();
  const { user: selectedUser } = Route.useSearch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userStatus, setUserStatus] = useState("");
  const [complianceFilter, setComplianceFilter] = useState("All");
  const [selectedComplianceCase, setSelectedComplianceCase] = useState<string | undefined>();
  const [usersCursor, setUsersCursor] = useState<string | undefined>();
  useEffect(() => setUsersCursor(undefined), [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  const user = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    staleTime: 60_000,
  });
  const reviews = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: () => services.repositories.reviews.listQueue({ limit: 100 }),
    enabled: section === "control" || section === "moderation",
    staleTime: 30_000,
  });
  const reviewDecision = useMutation({
    mutationFn: async ({
      id,
      decision,
    }: {
      id: string;
      decision: "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";
    }) => {
      await services.repositories.reviews.claim(id);
      return services.repositories.reviews.decide(id, decision, { reasonCode: "STAFF_REVIEW" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "operations", "overview"] });
    },
  });
  const operations = useQuery({
    queryKey: ["admin", "operations"],
    queryFn: () => services.repositories.lifecycle.listOperations(),
    enabled: section === "control" || section === "moderation",
    staleTime: 30_000,
  });
  const operational = useQuery({
    queryKey: ["admin", "operations", "overview"],
    queryFn: () => services.repositories.admin.getOperationsOverview(),
    enabled: ["control", "intake", "valuations", "custody", "marketplace"].includes(section),
    staleTime: 30_000,
  });
  const intake = useQuery({
    queryKey: ["admin", "intake"],
    queryFn: () => services.repositories.admin.listIntake({ limit: 100 }),
    enabled: section === "intake",
    staleTime: 30_000,
  });
  const memberships = useQuery({
    queryKey: ["admin", "memberships"],
    queryFn: () => services.repositories.admin.listMemberships({ limit: 100 }),
    enabled: section === "memberships",
    staleTime: 30_000,
  });
  const riskOperations = useQuery({
    queryKey: ["admin", "risk-operations"],
    queryFn: () => services.repositories.admin.getRiskOperations(),
    enabled: ["control", "compliance", "payments", "health", "audit", "integrations"].includes(
      section,
    ),
    staleTime: 30_000,
  });
  const complianceDetail = useQuery({
    queryKey: ["admin", "compliance", selectedComplianceCase],
    queryFn: () => services.repositories.admin.getComplianceCase(selectedComplianceCase!),
    enabled: section === "compliance" && Boolean(selectedComplianceCase),
    staleTime: 30_000,
  });
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => services.repositories.admin.getOverview(),
    enabled: section === "control" || section === "compliance",
    staleTime: 30_000,
  });
  const users = useQuery({
    queryKey: ["admin", "users", search, userRole, userStatus, usersCursor],
    queryFn: () =>
      services.repositories.admin.listUsers({
        q: search || undefined,
        role: userRole || undefined,
        status: userStatus || undefined,
        cursor: usersCursor,
        limit: 20,
      }),
    enabled: section === "users",
    staleTime: 30_000,
  });
  const userDetail = useQuery({
    queryKey: ["admin", "user", selectedUser],
    queryFn: () => services.repositories.admin.getUser(selectedUser!),
    enabled: section === "users" && Boolean(selectedUser),
    staleTime: 30_000,
  });
  const compliance = useQuery({
    queryKey: ["admin", "compliance"],
    queryFn: () => services.repositories.admin.listComplianceCases({ limit: 50 }),
    enabled: section === "compliance",
    staleTime: 30_000,
  });
  const globalSearch = useQuery({
    queryKey: ["admin", "search", search],
    queryFn: () => services.repositories.admin.search(search, 8),
    enabled: search.trim().length >= 2,
    staleTime: 15_000,
  });
  const select = (next: AdminSection) => {
    void navigate({ search: { section: next, user: undefined }, replace: true });
    setMobileOpen(false);
  };
  const openUser = (id: string) => {
    void navigate({ search: { section: "users", user: id }, replace: true });
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
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search this workspace"
              aria-label="Search this workspace"
            />
          </label>
          {globalSearch.data?.items.length ? (
            <div className="admin-search-results" role="listbox" aria-label="Admin search results">
              {globalSearch.data.items.map((result) => {
                const content = (
                  <>
                    <small>{sentence(result.entityType)}</small>
                    <strong>{result.title}</strong>
                    <span>{result.subtitle}</span>
                  </>
                );
                return result.entityType === "USER" ? (
                  <Link
                    key={`${result.entityType}-${result.id}`}
                    to="/admin"
                    search={{ section: "users", user: result.id }}
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <a
                    key={`${result.entityType}-${result.id}`}
                    href={result.target}
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                    }}
                  >
                    {content}
                  </a>
                );
              })}
            </div>
          ) : null}
        </header>
        {section === "control" ? (
          <ControlCenter
            reviews={reviewItems}
            operations={operationItems}
            attentionOperations={attentionOperations}
            loading={
              reviews.isLoading ||
              operations.isLoading ||
              overview.isLoading ||
              operational.isLoading ||
              riskOperations.isLoading
            }
            failed={
              reviews.isError ||
              operations.isError ||
              overview.isError ||
              operational.isError ||
              riskOperations.isError
            }
            retry={() => {
              void reviews.refetch();
              void operations.refetch();
              void overview.refetch();
              void operational.refetch();
              void riskOperations.refetch();
            }}
            select={select}
            overview={overview.data}
            operational={operational.data}
            risk={riskOperations.data}
          />
        ) : section === "moderation" ? (
          <AssetModeration
            reviews={reviewItems}
            operations={operationItems}
            loading={operations.isLoading || reviews.isLoading}
            failed={operations.isError || reviews.isError}
            retry={() => {
              void operations.refetch();
              void reviews.refetch();
            }}
            deciding={reviewDecision.isPending}
            decisionError={reviewDecision.isError}
            decide={(id, decision) => reviewDecision.mutate({ id, decision })}
          />
        ) : section === "intake" ? (
          <PhysicalIntakeWorkspace
            rows={intake.data?.items ?? []}
            loading={intake.isLoading}
            failed={intake.isError}
            retry={() => void intake.refetch()}
          />
        ) : section === "valuations" ? (
          <OperationsQueueWorkspace
            title="Valuations"
            detail="Review assets that need a supported valuation decision before readiness."
            icon={BadgeCheck}
            rows={operationItems.filter((item) => item.valuationStatus === "MISSING")}
            loading={operations.isLoading}
            failed={operations.isError}
            retry={() => void operations.refetch()}
          />
        ) : section === "custody" ? (
          <OperationsQueueWorkspace
            title="Custody & Vaults"
            detail="Track the authoritative custody and vault readiness projection."
            icon={Landmark}
            rows={operationItems.filter((item) => item.custodyStatus !== "SECURED")}
            loading={operations.isLoading}
            failed={operations.isError}
            retry={() => void operations.refetch()}
          />
        ) : section === "marketplace" ? (
          <OperationsQueueWorkspace
            title="Marketplace Ops"
            detail="Publication remains blocked until the existing lifecycle readiness authority says it is ready."
            icon={BarChart3}
            rows={operationItems.filter((item) => item.publicationStatus !== "PUBLISHED")}
            loading={operations.isLoading}
            failed={operations.isError}
            retry={() => void operations.refetch()}
          />
        ) : section === "memberships" ? (
          <MembershipsWorkspace
            rows={memberships.data?.items ?? []}
            loading={memberships.isLoading}
            failed={memberships.isError}
            retry={() => void memberships.refetch()}
          />
        ) : section === "users" ? (
          <UsersWorkspace
            users={users.data?.items ?? []}
            loading={users.isLoading}
            failed={users.isError}
            retry={() => void users.refetch()}
            selected={userDetail.data}
            selectedLoading={userDetail.isLoading}
            selectedFailed={userDetail.isError}
            openUser={openUser}
            clearUser={() => select("users")}
            nextCursor={users.data?.nextCursor ?? null}
            nextPage={(cursor) => setUsersCursor(cursor)}
            role={userRole}
            status={userStatus}
            setRole={setUserRole}
            setStatus={setUserStatus}
          />
        ) : section === "compliance" ? (
          <ComplianceWorkspace
            cases={compliance.data?.items ?? []}
            loading={compliance.isLoading || overview.isLoading}
            failed={compliance.isError || overview.isError}
            retry={() => {
              void compliance.refetch();
              void overview.refetch();
            }}
            overview={overview.data}
            filter={complianceFilter}
            setFilter={setComplianceFilter}
            risk={riskOperations.data}
            detail={complianceDetail.data}
            detailLoading={complianceDetail.isLoading}
            detailFailed={complianceDetail.isError}
            openDetail={setSelectedComplianceCase}
            closeDetail={() => setSelectedComplianceCase(undefined)}
          />
        ) : section === "payments" ? (
          <PaymentsWorkspace
            loading={riskOperations.isLoading}
            failed={riskOperations.isError}
            retry={() => void riskOperations.refetch()}
            risk={riskOperations.data}
            riskLoading={riskOperations.isLoading}
            riskFailed={riskOperations.isError}
            retryRisk={() => void riskOperations.refetch()}
          />
        ) : section === "support" ? (
          <UnavailablePage
            title="Support & Cases"
            detail="No support case backend is connected to this admin foundation yet."
            icon={LifeBuoy}
          />
        ) : section === "health" ? (
          <SystemHealthWorkspace
            risk={riskOperations.data}
            loading={riskOperations.isLoading}
            failed={riskOperations.isError}
            retry={() => void riskOperations.refetch()}
          />
        ) : section === "audit" ? (
          <AuditWorkspace
            risk={riskOperations.data}
            loading={riskOperations.isLoading}
            failed={riskOperations.isError}
            retry={() => void riskOperations.refetch()}
          />
        ) : section === "flags" ? (
          <UnavailablePage
            title="Feature Flags"
            detail="No authoritative feature flag read is configured for this environment."
            icon={Flag}
          />
        ) : section === "integrations" ? (
          <Integrations
            risk={riskOperations.data}
            riskLoading={riskOperations.isLoading}
            riskFailed={riskOperations.isError}
            retryRisk={() => void riskOperations.refetch()}
          />
        ) : (
          <AdminSettings select={select} />
        )}
      </main>
    </div>
  );
}

function PhysicalIntakeWorkspace({
  rows,
  loading,
  failed,
  retry,
}: {
  rows: AdminIntakeRow[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const [filter, setFilter] = useState("All");
  const visible = rows.filter((row) => filter === "All" || row.stage === filter);
  if (loading)
    return (
      <AdminState title="Loading physical intake" detail="Reading vault and shipment operations." />
    );
  if (failed)
    return (
      <AdminState
        title="Physical intake unavailable"
        detail="The intake projection could not be loaded safely."
        retry={retry}
      />
    );
  return (
    <AdminPageSection
      title="Physical Intake"
      detail="Delivered is not received. Receipt confirmation remains a staff-authorised, audited action in the existing collector workflow."
    >
      <div className="admin-filter-row">
        {[
          "All",
          "VAULT_SELECTED",
          "SHIPPING_REQUIRED",
          "IN_TRANSIT",
          "DELIVERED_AWAITING_RECEIPT",
          "RECEIVED",
          "VERIFICATION",
          "VAULT_READY",
        ].map((value) => (
          <button
            type="button"
            className={`admin-filter-chip ${filter === value ? "is-active" : ""}`}
            key={value}
            onClick={() => setFilter(value)}
          >
            {sentence(value)}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Collectible</th>
                <th>Collector</th>
                <th>Stage</th>
                <th>Vault</th>
                <th>Shipment</th>
                <th>Next action</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.title}</strong>
                    <small>{shortId(row.submissionId)}</small>
                  </td>
                  <td>
                    {row.collector.displayName}
                    <small>{row.collector.username ? `@${row.collector.username}` : ""}</small>
                  </td>
                  <td>
                    <span className="admin-status-pill">{sentence(row.stage)}</span>
                  </td>
                  <td>
                    {row.vault
                      ? `${row.vault.displayName} · ${row.vault.countryCode}`
                      : "Not selected"}
                  </td>
                  <td>
                    {row.shipment
                      ? `${row.shipment.carrier} · ${row.shipment.status}`
                      : "Not shipped"}
                  </td>
                  <td>{row.nextAction}</td>
                  <td>{date(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty detail="No intake records match this stage." />
      )}
    </AdminPageSection>
  );
}

function OperationsQueueWorkspace({
  title,
  detail,
  icon: Icon,
  rows,
  loading,
  failed,
  retry,
}: {
  title: string;
  detail: string;
  icon: typeof BadgeCheck;
  rows: AssetOperationSummary[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  if (loading)
    return (
      <AdminState
        title={`Loading ${title.toLowerCase()}`}
        detail="Reading the authoritative operations projection."
      />
    );
  if (failed)
    return (
      <AdminState
        title={`${title} unavailable`}
        detail="The operations projection could not be loaded safely."
        retry={retry}
      />
    );
  return (
    <AdminPageSection title={title} detail={detail}>
      {rows.length ? (
        <div className="admin-record-list">
          {rows.map((row) => (
            <article className="admin-record" key={row.id}>
              <span className="admin-record-icon">
                <Icon aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong>{row.title}</strong>
                <small>
                  {sentence(row.valuationStatus)} valuation · {sentence(row.custodyStatus)} custody
                  · {sentence(row.publicationStatus)} publication · {date(row.updatedAt)}
                </small>
              </div>
              <span className="admin-record-status">{moderationStage(row)}</span>
            </article>
          ))}
        </div>
      ) : (
        <AdminEmpty detail="No records currently require work." />
      )}
    </AdminPageSection>
  );
}

function MembershipsWorkspace({
  rows,
  loading,
  failed,
  retry,
}: {
  rows: AdminMembershipRow[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  if (loading)
    return (
      <AdminState
        title="Loading collector memberships"
        detail="Reading subscription and entitlement projections."
      />
    );
  if (failed)
    return (
      <AdminState
        title="Collector memberships unavailable"
        detail="The membership projection could not be loaded safely."
        retry={retry}
      />
    );
  return (
    <AdminPageSection
      title="Collector Memberships"
      detail="Plan, status and usage are shown from the backend subscription authority. Provider identifiers and payment secrets stay redacted."
    >
      {rows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Collector</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Usage</th>
                <th>Period end</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.collector.displayName}</strong>
                    <small>
                      {row.collector.username ? `@${row.collector.username}` : row.collector.email}
                    </small>
                  </td>
                  <td>{row.plan.displayName}</td>
                  <td>
                    <span className="admin-status-pill">{sentence(row.status)}</span>
                  </td>
                  <td>
                    <strong>
                      {row.usage.activeCollectibles} / {row.usage.activeCollectiblesLimit ?? "—"}{" "}
                      active
                    </strong>
                    <small>
                      {row.usage.monthlySubmissions} / {row.usage.monthlySubmissionsLimit ?? "—"}{" "}
                      monthly · {row.usage.concurrentIntake} /{" "}
                      {row.usage.concurrentIntakeLimit ?? "—"} intake
                    </small>
                  </td>
                  <td>
                    {row.currentPeriodEnd ? date(row.currentPeriodEnd) : "—"}
                    {row.cancelAtPeriodEnd ? " · Cancels" : ""}
                  </td>
                  <td>{date(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty detail="No collector memberships found." />
      )}
    </AdminPageSection>
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
  overview,
  operational,
  risk,
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
  overview?: import("@/data/repositories").AdminOverview;
  operational?: AdminOperationsOverview;
  risk?: import("@/data/repositories").AdminRiskOperations;
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
    submissions: overview?.reviews.pending ?? reviews.length,
    valuation:
      overview?.assets.valuationPending ??
      operations.filter((item) => item.valuationStatus === "ACTIVE").length,
    custody:
      overview?.assets.custodyActions ??
      operations.filter((item) => item.custodyStatus !== "SECURED").length,
    market: operations.filter((item) => item.publicationStatus === "PUBLISHED").length,
  };
  const pendingReviews = overview?.reviews.pending ?? reviews.length;
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
      <div className="admin-kpi-grid admin-kpi-grid--six">
        <AdminKpi icon={Users} label="Total users" value={operational?.kpis.totalUsers ?? 0} />
        <AdminKpi
          icon={ClipboardCheck}
          label="Collectors"
          value={operational?.kpis.collectors ?? 0}
        />
        <AdminKpi
          icon={BriefcaseBusiness}
          label="Investors"
          value={operational?.kpis.investors ?? 0}
        />
        <AdminKpi
          icon={Tag}
          label="Active listings"
          value={operational?.kpis.activeListings ?? 0}
        />
        <AdminKpi
          icon={WalletCards}
          label="Open orders"
          value={operational?.kpis.openOrders ?? 0}
        />
        <AdminKpi
          icon={AlertTriangle}
          label="Needs attention"
          value={operational?.kpis.needsAttention ?? 0}
        />
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <AdminPanelHeading
            title="Needs Immediate Attention"
            action="Review assets"
            onClick={() => select("moderation")}
          />
          {operational?.attentionGroups.length ? (
            <div className="admin-attention-groups">
              {operational.attentionGroups.slice(0, 5).map((item) => (
                <button
                  type="button"
                  className="admin-attention-group"
                  key={item.id}
                  onClick={() => select(isAdminSection(item.section) ? item.section : "control")}
                >
                  <span className="admin-attention-group__count">{item.count}</span>
                  <span className="min-w-0">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
          {operational?.needsAttention.length || pendingReviews || attentionOperations.length ? (
            <div className="admin-attention-list">
              {operational?.needsAttention.slice(0, 8).map((item) => (
                <AdminAttention
                  key={`${item.id}-${item.target}`}
                  type={`${item.type} · waiting on ${item.waitingOn === "COLLECTOR" ? "collector" : "Slice"}`}
                  subject={item.subject}
                  detail={`${item.stage} · ${item.reason} · ${item.age} old`}
                  tone={item.severity === "HIGH" ? "warning" : "neutral"}
                />
              ))}
              {risk?.webhooks.slice(0, 3).map((event) => (
                <AdminAttention
                  key={`webhook-${event.id}`}
                  type="Webhook failure"
                  subject={`${event.provider} · ${event.eventType}`}
                  detail={`${event.attempts} attempts · ${event.error ?? "Safe failure summary unavailable"}`}
                  tone="warning"
                />
              ))}
              {risk?.finance.reconciliation
                .filter((run) => run.status === "MISMATCH")
                .slice(0, 3)
                .map((run) => (
                  <AdminAttention
                    key={`reconciliation-${run.id}`}
                    type="Reconciliation exception"
                    subject={run.scope}
                    detail={`${run.mismatchCodes.join(", ") || "Mismatch requires inspection"} · ${date(run.createdAt)}`}
                    tone="warning"
                  />
                ))}
              {!operational?.needsAttention.length ? null : (
                <div className="admin-attention-divider" />
              )}
              {reviews.slice(0, 4).map((item) => (
                <AdminAttention
                  key={item.id}
                  type="Asset review"
                  subject={`Submission ${shortId(item.id)}`}
                  detail={`${sentence(item.status)} · received ${date(item.submittedAt)}`}
                  tone="warning"
                />
              ))}
              {!reviews.length && pendingReviews ? (
                <AdminAttention
                  type="Asset review"
                  subject={`${pendingReviews} review${pendingReviews === 1 ? "" : "s"} pending`}
                  detail="Open Asset Moderation to inspect the authoritative queue."
                  tone="warning"
                />
              ) : null}
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
            {operational?.systemHealth.length ? (
              operational.systemHealth.map((item) => (
                <StatusRow
                  key={item.name}
                  label={item.name}
                  status={item.status}
                  icon={
                    item.name === "Database"
                      ? Database
                      : item.name === "Notifications"
                        ? Activity
                        : item.name === "Market data"
                          ? Globe2
                          : Gauge
                  }
                />
              ))
            ) : (
              <AdminEmpty detail="No system health telemetry is available." />
            )}
          </div>
        </section>
      </div>
      <section className="admin-panel">
        <AdminPanelHeading title="Platform Pipeline" />
        <div className="admin-pipeline admin-pipeline--full">
          {operational?.pipeline.map((stage) => (
            <PipelineStage
              key={stage.id}
              label={stage.label}
              value={stage.count}
              icon={
                stage.id === "marketLive"
                  ? BarChart3
                  : stage.id === "vaultReady"
                    ? Landmark
                    : ClipboardCheck
              }
              onClick={() => select(pipelineSection(stage.id))}
            />
          ))}
        </div>
      </section>
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <AdminPanelHeading title="Recent Activity" />
          {operational?.recentActivity.length ? (
            <div className="admin-record-list">
              {operational.recentActivity.map((item) => (
                <article className="admin-record" key={item.id}>
                  <span className="admin-record-icon">
                    <Activity aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <strong>{item.title}</strong>
                    <small>
                      {item.context} · {date(item.occurredAt)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No recent platform activity." />
          )}
        </section>
        <section className="admin-panel">
          <AdminPanelHeading
            title="Open Cases"
            action="Open compliance"
            onClick={() => select("compliance")}
          />
          {overview?.complianceCases ? (
            <AdminAttention
              type="Compliance"
              subject={`${overview.complianceCases} case${overview.complianceCases === 1 ? "" : "s"} need review`}
              detail="Open the compliance workspace for normalized case details."
              tone="warning"
            />
          ) : (
            <AdminEmpty detail="No open compliance cases." />
          )}
        </section>
      </div>
      <div className="admin-dashboard-grid admin-dashboard-grid--four">
        <section className="admin-panel">
          <AdminPanelHeading title="Account Mix" />
          <div className="admin-mix-list">
            <StatusRow
              label="Collectors"
              status={String(operational?.accountMix.collectors ?? 0)}
              icon={Users}
            />
            <StatusRow
              label="Investors"
              status={String(operational?.accountMix.investors ?? 0)}
              icon={BriefcaseBusiness}
            />
            <StatusRow
              label="Staff"
              status={String(operational?.accountMix.staff ?? 0)}
              icon={ShieldCheck}
            />
            <StatusRow
              label="Admins"
              status={String(operational?.accountMix.admins ?? 0)}
              icon={Crown}
            />
          </div>
          <small className="admin-muted">Counts may overlap by capability.</small>
        </section>
        <section className="admin-panel">
          <AdminPanelHeading
            title="Membership & Billing"
            action="Open memberships"
            onClick={() => select("memberships")}
          />
          <div className="admin-mix-list">
            <StatusRow
              label="Starter"
              status={String(operational?.memberships.starter ?? 0)}
              icon={Crown}
            />
            <StatusRow
              label="Pro"
              status={String(operational?.memberships.pro ?? 0)}
              icon={Crown}
            />
            <StatusRow
              label="Elite"
              status={String(operational?.memberships.elite ?? 0)}
              icon={Crown}
            />
            <StatusRow
              label="Past due"
              status={String(operational?.memberships.pastDue ?? 0)}
              icon={AlertTriangle}
            />
          </div>
        </section>
        <section className="admin-panel">
          <AdminPanelHeading title="Support & Cases" />
          <AdminEmpty
            detail={operational?.support.message ?? "Support case metrics are unavailable."}
            icon={LifeBuoy}
          />
        </section>
        <section className="admin-panel">
          <AdminPanelHeading title="Quick Actions" />
          <div className="admin-settings-links admin-quick-actions">
            <button type="button" onClick={() => select("moderation")}>
              <ClipboardCheck aria-hidden="true" /> Review Queue
            </button>
            <button type="button" onClick={() => select("intake")}>
              <Inbox aria-hidden="true" /> Intake Board
            </button>
            <button type="button" onClick={() => select("audit")}>
              <FileClock aria-hidden="true" /> Audit Logs
            </button>
            <button type="button" onClick={() => select("users")}>
              <Users aria-hidden="true" /> All Accounts
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function AssetModeration({
  reviews,
  operations,
  loading,
  failed,
  retry,
  deciding,
  decisionError,
  decide,
}: {
  reviews: Array<{ id: string; status: string; submittedAt: string }>;
  operations: AssetOperationSummary[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  deciding: boolean;
  decisionError: boolean;
  decide: (id: string, decision: "CHANGES_REQUESTED" | "APPROVED" | "REJECTED") => void;
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
      title="Asset Review"
      detail="D10 review actions use the existing claim and decision authority. Approval only advances intake eligibility; it does not confirm custody, valuation, readiness or publication."
    >
      <section className="admin-panel">
        <AdminPanelHeading title="Review queue" />
        {decisionError ? (
          <p className="admin-safe-note" role="alert">
            This review action could not be completed. Refresh the queue and confirm the current
            workflow state before trying again.
          </p>
        ) : null}
        {reviews.length ? (
          <div className="admin-record-list">
            {reviews.map((review) => (
              <article className="admin-record" key={review.id}>
                <span className="admin-record-icon">
                  <ClipboardCheck aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <strong>Submission {shortId(review.id)}</strong>
                  <small>
                    {sentence(review.status)} · received {date(review.submittedAt)}
                  </small>
                </div>
                <div className="admin-record-actions">
                  <button
                    className="admin-inline-action"
                    disabled={deciding}
                    onClick={() => decide(review.id, "CHANGES_REQUESTED")}
                  >
                    Request changes
                  </button>
                  <button
                    className="admin-inline-action"
                    disabled={deciding}
                    onClick={() => decide(review.id, "APPROVED")}
                  >
                    Accept for intake
                  </button>
                  <button
                    className="admin-inline-action"
                    disabled={deciding}
                    onClick={() => decide(review.id, "REJECTED")}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmpty detail="No submissions are waiting for review." />
        )}
      </section>
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
            </article>
          ))}
        </div>
      ) : (
        <AdminEmpty detail="No assets currently require attention." />
      )}
    </AdminPageSection>
  );
}

function UsersWorkspace({
  users,
  loading,
  failed,
  retry,
  selected,
  selectedLoading,
  selectedFailed,
  openUser,
  clearUser,
  nextCursor,
  nextPage,
  role,
  status,
  setRole,
  setStatus,
}: {
  users: AdminUserSummary[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  selected?: AdminUserDetail;
  selectedLoading: boolean;
  selectedFailed: boolean;
  openUser: (id: string) => void;
  clearUser: () => void;
  nextCursor: string | null;
  nextPage: (cursor: string) => void;
  role: string;
  status: string;
  setRole: (value: string) => void;
  setStatus: (value: string) => void;
}) {
  if (selected || selectedLoading || selectedFailed) {
    return (
      <UserDetail
        user={selected}
        loading={selectedLoading}
        failed={selectedFailed}
        retry={retry}
        back={clearUser}
      />
    );
  }
  return (
    <AdminPageSection
      title="Users & Roles"
      detail="Search the account directory and inspect access safely. Role and status mutations remain protected backend workflows."
    >
      {loading ? (
        <AdminState title="Loading users" detail="Reading the admin-safe user projection." />
      ) : failed ? (
        <AdminState
          title="Users unavailable"
          detail="The user directory could not be loaded safely."
          retry={retry}
        />
      ) : (
        <>
          <div className="admin-filter-row">
            {[
              ["", "All"],
              ["INVESTOR", "Investor"],
              ["COLLECTOR", "Collector"],
              ["STAFF", "Staff"],
              ["ADMIN", "Admin"],
            ].map(([value, label]) => (
              <button
                className={`admin-filter-chip ${role === value ? "is-active" : ""}`}
                key={value || "all"}
                onClick={() => setRole(value)}
              >
                {label}
              </button>
            ))}
            {[
              ["", "All status"],
              ["RESTRICTED", "Restricted"],
              ["SUSPENDED", "Suspended"],
            ].map(([value, label]) => (
              <button
                className={`admin-filter-chip ${status === value ? "is-active" : ""}`}
                key={value || "all-status"}
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {users.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Activity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="admin-user-cell">
                          <span className="admin-record-icon">
                            <UserRound aria-hidden="true" />
                          </span>
                          <span>
                            <strong>{user.displayName}</strong>
                            <small>{user.username ? `@${user.username}` : "No username"}</small>
                          </span>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <div className="admin-tag-list">
                          {user.roles.length ? (
                            user.roles.map((role) => (
                              <span className="admin-tag" key={role.id}>
                                {sentence(role.role)}
                              </span>
                            ))
                          ) : (
                            <span className="admin-muted">Investor</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`admin-status-pill admin-status-pill--${user.accountStatus.toLowerCase()}`}
                        >
                          {sentence(user.accountStatus)}
                        </span>
                      </td>
                      <td>{date(user.createdAt)}</td>
                      <td>{user.lastActivityAt ? date(user.lastActivityAt) : "—"}</td>
                      <td>
                        <button className="admin-inline-action" onClick={() => openUser(user.id)}>
                          Open <ArrowRight aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <AdminEmpty detail="No users match these filters." icon={Users} />
          )}
          <div className="admin-pagination">
            <span>{users.length ? `${users.length} users shown` : "No results"}</span>
            <button disabled={!nextCursor} onClick={() => nextCursor && nextPage(nextCursor)}>
              Next page <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </AdminPageSection>
  );
}

function UserDetail({
  user,
  loading,
  failed,
  retry,
  back,
}: {
  user?: AdminUserDetail;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  back: () => void;
}) {
  const [tab, setTab] = useState("Overview");
  if (loading)
    return <AdminState title="Loading user" detail="Reading account and access projections." />;
  if (failed || !user)
    return (
      <AdminState
        title="User unavailable"
        detail="This user detail could not be loaded safely."
        retry={retry}
      />
    );
  const tabs = [
    "Overview",
    "Roles & Access",
    "Account",
    "Submissions",
    "Compliance",
    "Wallet & Finance",
    "Activity",
    "Audit",
  ];
  return (
    <div className="admin-console-content">
      <button className="admin-back-link" onClick={back}>
        <ChevronLeft aria-hidden="true" /> Users & Roles
      </button>
      <section className="admin-user-hero">
        <span className="admin-user-avatar">
          <UserRound aria-hidden="true" />
        </span>
        <div>
          <p className="admin-console-eyebrow">User operations hub</p>
          <h2>{user.displayName}</h2>
          <span>
            {user.username ? `@${user.username} · ` : ""}
            {user.email} · ID {shortId(user.id)}
          </span>
        </div>
        <span
          className={`admin-status-pill admin-status-pill--${user.accountStatus.toLowerCase()}`}
        >
          {sentence(user.accountStatus)}
        </span>
      </section>
      <nav className="admin-tabs" aria-label="User detail sections">
        {tabs.map((item) => (
          <button
            className={tab === item ? "is-active" : ""}
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === "Overview" ? (
        <>
          <div className="admin-kpi-grid admin-kpi-grid--compact">
            <AdminKpi
              icon={ShieldCheck}
              label="Account status"
              value={user.accountStatus === "ACTIVE" ? 1 : 0}
            />
            <AdminKpi icon={Users} label="Active roles" value={user.roles.length} />
            <AdminKpi
              icon={ClipboardCheck}
              label="Open submissions"
              value={user.counts.submissions}
            />
            <AdminKpi
              icon={ShieldCheck}
              label="Compliance cases"
              value={user.counts.complianceCases}
            />
            <AdminKpi
              icon={Crown}
              label="Active intakes"
              value={user.collector?.activeIntakes ?? 0}
            />
          </div>
          {user.collector ? (
            <section className="admin-panel">
              <AdminPanelHeading title="Collector membership" />
              <p className="admin-safe-note">
                {user.collector.subscription
                  ? `${user.collector.subscription.plan} · ${sentence(user.collector.subscription.status)}${user.collector.subscription.cancelAtPeriodEnd ? " · Cancels at period end" : ""}`
                  : "No active membership subscription"}
              </p>
            </section>
          ) : null}
        </>
      ) : tab === "Roles & Access" ? (
        <section className="admin-panel">
          <AdminPanelHeading title="Current roles" />
          <div className="admin-tag-list">
            {user.roles.length ? (
              user.roles.map((role) => (
                <span className="admin-tag" key={role.id}>
                  {sentence(role.role)}
                </span>
              ))
            ) : (
              <AdminEmpty detail="No elevated roles assigned." />
            )}
          </div>
          <p className="admin-safe-note">
            Role changes require protected server authorization, recent authentication, and any
            configured approval workflow.
          </p>
        </section>
      ) : tab === "Account" ? (
        <section className="admin-panel">
          <AdminPanelHeading title="Account status history" />
          <div className="admin-record-list">
            {user.statusHistory.length ? (
              user.statusHistory.map((entry) => (
                <article className="admin-record" key={`${entry.createdAt}-${entry.toStatus}`}>
                  <Clock3 aria-hidden="true" />
                  <div>
                    <strong>{sentence(entry.toStatus)}</strong>
                    <small>
                      {entry.reason ?? "No reason supplied"} · {date(entry.createdAt)}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <AdminEmpty detail="No status changes recorded." />
            )}
          </div>
        </section>
      ) : (
        <section className="admin-panel">
          <AdminPanelHeading title={tab} />
          <AdminEmpty
            detail={`${tab} data is kept in its authoritative workspace and is not duplicated in this summary.`}
          />
        </section>
      )}
    </div>
  );
}

function ComplianceWorkspace({
  cases,
  loading,
  failed,
  retry,
  overview,
  filter,
  setFilter,
  risk,
  detail,
  detailLoading,
  detailFailed,
  openDetail,
  closeDetail,
}: {
  cases: AdminComplianceCase[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  overview?: AdminOverview;
  filter: string;
  setFilter: (value: string) => void;
  risk?: import("@/data/repositories").AdminRiskOperations;
  detail?: import("@/data/repositories").AdminComplianceDetail;
  detailLoading: boolean;
  detailFailed: boolean;
  openDetail: (id: string) => void;
  closeDetail: () => void;
}) {
  const visibleCases = cases.filter((item) => {
    const value = `${item.type} ${item.provider} ${item.status}`.toLowerCase();
    if (filter === "All") return true;
    if (filter === "Resolved") return ["APPROVED", "REJECTED", "EXPIRED"].includes(item.status);
    if (filter === "Provider Issue") return value.includes("provider");
    if (filter === "Manual Review") return value.includes("manual");
    return value.includes(filter.toLowerCase().replace(" / ", " "));
  });
  return (
    <AdminPageSection
      title="Compliance"
      detail="Review normalized case status without exposing provider payloads or secrets."
    >
      <div className="admin-kpi-grid admin-kpi-grid--compact">
        <AdminKpi
          icon={ShieldCheck}
          label="Open cases"
          value={overview?.complianceCases ?? cases.length}
        />
        <AdminKpi
          icon={AlertTriangle}
          label="Needs review"
          value={cases.filter((item) => item.status !== "APPROVED").length}
        />
        <AdminKpi
          icon={Users}
          label="Restricted users"
          value={cases.filter((item) => item.status === "SUSPENDED").length}
        />
        <AdminKpi icon={Globe2} label="Provider issues" value={overview?.providerAlerts ?? 0} />
      </div>
      <div className="admin-filter-row">
        {["All", "Identity / KYC", "KYT", "Manual Review", "Provider Issue", "Resolved"].map(
          (label) => (
            <button
              className={`admin-filter-chip ${filter === label ? "is-active" : ""}`}
              key={label}
              onClick={() => setFilter(label)}
            >
              {label}
            </button>
          ),
        )}
      </div>
      {loading ? (
        <AdminState title="Loading compliance" detail="Reading safe case projections." />
      ) : failed ? (
        <AdminState
          title="Compliance unavailable"
          detail="Cases could not be loaded safely."
          retry={retry}
        />
      ) : visibleCases.length ? (
        <div className="admin-record-list">
          {visibleCases.map((item) => (
            <article className="admin-record admin-record--case" key={item.id}>
              <span className="admin-record-icon">
                <ShieldCheck aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong>{sentence(item.type)}</strong>
                <small>
                  {item.user.displayName} {item.user.username ? `· @${item.user.username}` : ""}
                </small>
                <small>
                  {item.provider} · updated {date(item.updatedAt)}
                </small>
              </div>
              <span className="admin-status-pill">{sentence(item.status)}</span>
              <button className="admin-inline-action" onClick={() => openDetail(item.id)}>
                Open detail <ArrowRight aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <AdminEmpty
          detail={filter === "All" ? "No open compliance cases." : "No cases match these filters."}
          icon={ShieldCheck}
        />
      )}
      {detailLoading ? (
        <AdminState
          title="Loading case detail"
          detail="Reading normalized provider and restriction history."
        />
      ) : detailFailed ? (
        <AdminState
          title="Case detail unavailable"
          detail="The case detail could not be loaded safely."
        />
      ) : detail ? (
        <section className="admin-panel">
          <AdminPanelHeading
            title={detail.user.displayName}
            action="Close detail"
            onClick={closeDetail}
          />
          <div className="admin-kpi-grid admin-kpi-grid--compact">
            <AdminKpi
              icon={ShieldCheck}
              label="Provider status"
              value={sentence(detail.providerStatus)}
            />
            <AdminKpi icon={AlertTriangle} label="Decisions" value={detail.decisions.length} />
            <AdminKpi icon={Users} label="Restrictions" value={detail.restrictions.length} />
            <AdminKpi icon={FileClock} label="Audit events" value={detail.audit.length} />
          </div>
          <div className="admin-record-list">
            <article className="admin-record">
              <div className="min-w-0">
                <strong>Summary</strong>
                <small>
                  {sentence(detail.type)} · {sentence(detail.status)} · {detail.provider} · updated{" "}
                  {date(detail.updatedAt)}
                </small>
              </div>
            </article>
            <article className="admin-record">
              <div className="min-w-0">
                <strong>Provider status</strong>
                <small>
                  {detail.providerStatus === "Unknown"
                    ? "Provider information is temporarily unavailable."
                    : `Normalized provider state: ${sentence(detail.providerStatus)}`}
                </small>
              </div>
            </article>
            {detail.restrictions.map((restriction) => (
              <article
                className="admin-record"
                key={`${restriction.createdAt}-${restriction.scope}`}
              >
                <div className="min-w-0">
                  <strong>Restriction · {sentence(restriction.scope)}</strong>
                  <small>
                    {sentence(restriction.status)} · {restriction.reasonCode} · source{" "}
                    {restriction.source} · {date(restriction.createdAt)}
                  </small>
                </div>
              </article>
            ))}
            {detail.decisions.map((decision) => (
              <article
                className="admin-record"
                key={`${decision.createdAt}-${decision.reasonCode}`}
              >
                <div className="min-w-0">
                  <strong>Decision · {sentence(decision.status)}</strong>
                  <small>
                    {decision.reasonCode} · actor{" "}
                    {decision.actorUserId ? shortId(decision.actorUserId) : "System"} ·{" "}
                    {date(decision.createdAt)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </AdminPageSection>
  );
}

function PaymentsWorkspace({
  loading,
  failed,
  retry,
  risk,
  riskLoading,
  riskFailed,
  retryRisk,
}: {
  loading: boolean;
  failed: boolean;
  retry: () => void;
  risk?: import("@/data/repositories").AdminRiskOperations;
  riskLoading: boolean;
  riskFailed: boolean;
  retryRisk: () => void;
}) {
  return (
    <AdminPageSection
      title="Payments & Wallets"
      detail="GBP finance operations summary. Ledger authority remains in the existing finance workflows; balances are never edited here."
    >
      {loading || riskLoading ? (
        <AdminState
          title="Loading finance operations"
          detail="Reading authoritative movement counts."
        />
      ) : failed || riskFailed ? (
        <AdminState
          title="Finance unavailable"
          detail="The finance projection could not be loaded safely."
          retry={() => {
            retry();
            retryRisk();
          }}
        />
      ) : (
        <>
          <div className="admin-kpi-grid">
            <AdminKpi
              icon={WalletCards}
              label="Pending movements"
              value={
                risk?.finance.movements.filter((item) =>
                  ["CREATED", "PENDING_PROVIDER", "PROCESSING"].includes(item.status),
                ).length ?? 0
              }
            />
            <AdminKpi
              icon={AlertTriangle}
              label="Provider exceptions"
              value={
                risk?.finance.movements.filter((item) =>
                  ["FAILED", "MANUAL_REVIEW", "HELD"].includes(item.status),
                ).length ?? 0
              }
            />
            <AdminKpi
              icon={RefreshCw}
              label="Reconciliation mismatches"
              value={
                risk?.finance.reconciliation.filter((item) => item.status === "MISMATCH").length ??
                0
              }
            />
            <AdminKpi icon={Landmark} label="Ledger currency" value="GBP" />
          </div>
          <div className="admin-filter-row">
            {["Movements", "Wallets", "Reservations", "Reconciliation", "Adjustments"].map(
              (label) => (
                <span className="admin-filter-chip" key={label}>
                  {label}
                </span>
              ),
            )}
          </div>
          <section className="admin-panel">
            <AdminPanelHeading title="Movements" />
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {risk?.finance.movements.length
                    ? risk.finance.movements.map((movement) => (
                        <tr key={movement.id}>
                          <td>
                            {movement.user.displayName}
                            <small>
                              {movement.user.username ? `@${movement.user.username}` : ""}
                            </small>
                          </td>
                          <td>{sentence(movement.type)}</td>
                          <td>
                            £{formatMinor(movement.amountMinor)} {movement.currency}
                          </td>
                          <td>{sentence(movement.provider)}</td>
                          <td>
                            <span className="admin-status-pill">{sentence(movement.status)}</span>
                          </td>
                          <td>{movement.referenceAvailable ? "Available" : "Unknown"}</td>
                          <td>{date(movement.updatedAt)}</td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>
            {risk?.finance.movements.length ? null : (
              <AdminEmpty detail="No movements currently require attention." icon={WalletCards} />
            )}
          </section>
          <section className="admin-panel">
            <AdminPanelHeading title="Wallets & reservations" />
            <div className="admin-record-list">
              {risk?.finance.wallets.slice(0, 8).map((wallet) => (
                <article className="admin-record" key={wallet.id}>
                  <div className="min-w-0">
                    <strong>{wallet.owner}</strong>
                    <small>
                      Available £{formatMinor(wallet.availableMinor)} · reserved £
                      {formatMinor(wallet.reservedMinor)} · {wallet.currency} ·{" "}
                      {sentence(wallet.status)}
                    </small>
                  </div>
                  <span className="admin-muted">Read only</span>
                </article>
              ))}
              {risk?.finance.reservations.slice(0, 8).map((reservation) => (
                <article className="admin-record" key={reservation.id}>
                  <div className="min-w-0">
                    <strong>Reservation · {reservation.owner}</strong>
                    <small>
                      £{formatMinor(reservation.amountMinor)} {reservation.currency} ·{" "}
                      {sentence(reservation.purposeType)} · {sentence(reservation.status)}
                    </small>
                  </div>
                  <span className="admin-muted">Read only</span>
                </article>
              ))}
            </div>
            {!risk?.finance.wallets.length && !risk?.finance.reservations.length ? (
              <AdminEmpty detail="No wallet or reservation records are available." />
            ) : null}
            <p className="admin-safe-note">
              No balance editing is available. Any correction must use the audited D13
              compensating-entry workflow.
            </p>
          </section>
          <section className="admin-panel">
            <AdminPanelHeading title="Reconciliation" />
            <div className="admin-record-list">
              {risk?.finance.reconciliation.map((run) => (
                <article className="admin-record" key={run.id}>
                  <div className="min-w-0">
                    <strong>
                      {run.scope} · {sentence(run.status)}
                    </strong>
                    <small>
                      Debit £{formatMinor(run.debitMinor)} · credit £{formatMinor(run.creditMinor)}{" "}
                      ·{" "}
                      {run.mismatchCodes.length
                        ? run.mismatchCodes.join(", ")
                        : "No mismatch codes"}{" "}
                      · {date(run.createdAt)}
                    </small>
                  </div>
                  <span className="admin-muted">Inspect</span>
                </article>
              ))}
            </div>
            {!risk?.finance.reconciliation.length ? (
              <AdminEmpty detail="No reconciliation exceptions." icon={RefreshCw} />
            ) : null}
          </section>
        </>
      )}
    </AdminPageSection>
  );
}

function Integrations({
  risk,
  riskLoading,
  riskFailed,
  retryRisk,
}: {
  risk?: import("@/data/repositories").AdminRiskOperations;
  riskLoading: boolean;
  riskFailed: boolean;
  retryRisk: () => void;
}) {
  if (riskLoading)
    return (
      <AdminState title="Loading integrations" detail="Reading provider-safe status summaries." />
    );
  if (riskFailed)
    return (
      <AdminState
        title="Provider status unavailable"
        detail="Integration health could not be loaded safely."
        retry={retryRisk}
      />
    );
  return (
    <AdminPageSection
      title="Integrations"
      detail="Provider status is only shown where the backend can determine it. Secrets and private credentials remain redacted."
    >
      <div className="admin-integration-grid">
        {risk?.integrations.length ? (
          risk.integrations.map((integration) => (
            <article className="admin-integration" key={integration.name}>
              <SlidersHorizontal aria-hidden="true" />
              <strong>{integration.name}</strong>
              <small>{integration.summary}</small>
              <span className="admin-status-pill">{integration.status}</span>
              <span>
                {integration.configured ? "Configured" : "Configuration not exposed"}
                {integration.failedEvents ? ` · ${integration.failedEvents} failed events` : ""}
              </span>
            </article>
          ))
        ) : (
          <AdminEmpty detail="No integration status records are available." />
        )}
      </div>
      <section className="admin-panel">
        <AdminPanelHeading title="Webhook failures" />
        <div className="admin-record-list">
          {risk?.webhooks.map((event) => (
            <article className="admin-record" key={event.id}>
              <div className="min-w-0">
                <strong>
                  {event.provider} / {event.eventType}
                </strong>
                <small>
                  {sentence(event.status)} / {event.attempts} attempts /{" "}
                  {event.error ?? "Safe failure summary unavailable"} / {date(event.receivedAt)}
                </small>
              </div>
              <span className="admin-muted">Idempotent replay only</span>
            </article>
          ))}
        </div>
        {!risk?.webhooks.length ? (
          <AdminEmpty detail="No webhook failures currently need attention." />
        ) : null}
      </section>
    </AdminPageSection>
  );
}

function SystemHealthWorkspace({
  risk,
  loading,
  failed,
  retry,
}: {
  risk?: import("@/data/repositories").AdminRiskOperations;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  if (loading)
    return (
      <AdminState
        title="Loading system health"
        detail="Checking configured operational telemetry."
      />
    );
  if (failed)
    return (
      <AdminState
        title="System health unavailable"
        detail="Health projections could not be loaded safely."
        retry={retry}
      />
    );
  return (
    <AdminPageSection
      title="System Health"
      detail="Only backend-observed checks are shown. Missing telemetry remains Unknown."
    >
      <div className="admin-record-list">
        {risk?.system.map((item) => (
          <article className="admin-record" key={item.name}>
            <span className="admin-record-icon">
              <HeartPulse aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <strong>{item.name}</strong>
              <small>
                {item.status} / {item.summary} / checked {date(item.lastCheckedAt)}
              </small>
            </div>
            <span className="admin-record-status">{item.status}</span>
          </article>
        ))}
      </div>
    </AdminPageSection>
  );
}

function AuditWorkspace({
  risk,
  loading,
  failed,
  retry,
}: {
  risk?: import("@/data/repositories").AdminRiskOperations;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  if (loading)
    return <AdminState title="Loading audit logs" detail="Reading append-only audit events." />;
  if (failed)
    return (
      <AdminState
        title="Audit logs unavailable"
        detail="Audit records could not be loaded safely."
        retry={retry}
      />
    );
  return (
    <AdminPageSection
      title="Audit Logs"
      detail="Append-only operational history. Audit entries cannot be edited or deleted from Admin."
    >
      {risk?.audit.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {risk.audit.map((entry) => (
                <tr key={entry.id}>
                  <td>{date(entry.createdAt)}</td>
                  <td>{entry.actor}</td>
                  <td>{sentence(entry.action)}</td>
                  <td>
                    {entry.resourceType} {entry.resourceId ? shortId(entry.resourceId) : ""}
                  </td>
                  <td>
                    <span className="admin-status-pill">{sentence(entry.result)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty detail="No audit entries match these filters." icon={FileClock} />
      )}
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
  value: number | string;
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
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof Archive;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div>{content}</div>
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
function formatMinor(value: string) {
  const sign = value.startsWith("-") ? "-" : "";
  const digits = value.replace(/^-/, "").padStart(3, "0");
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
function initials(value?: string) {
  return (value ?? "Admin")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
