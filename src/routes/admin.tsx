import { useMutation, useQuery } from "@tanstack/react-query";
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
import { AdminCollectibleDetail } from "@/components/admin/AdminCollectibleDetail";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import type { AssetOperationSummary, SubmissionReviewQueueResponse } from "@/domain/submission";
import type {
  AdminAccountsSummary,
  AdminComplianceCase,
  AdminOverview,
  AdminIntakeRow,
  AdminIntakeResponse,
  AdminMembershipRow,
  AdminOperationsOverview,
  AdminUserDetail,
  AdminUserSummary,
} from "@/data/repositories";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    section: isAdminSection(search.section) ? search.section : "control",
    user: typeof search.user === "string" && search.user.length > 0 ? search.user : undefined,
    asset: typeof search.asset === "string" && search.asset.length > 0 ? search.asset : undefined,
    tab: typeof search.tab === "string" && search.tab.length > 0 ? search.tab : undefined,
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    priority: typeof search.priority === "string" ? search.priority : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    evidence: typeof search.evidence === "string" ? search.evidence : undefined,
    research: typeof search.research === "string" ? search.research : undefined,
    submittedFrom: typeof search.submittedFrom === "string" ? search.submittedFrom : undefined,
    submittedTo: typeof search.submittedTo === "string" ? search.submittedTo : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
    sortDirection: typeof search.sortDirection === "string" ? search.sortDirection : undefined,
    page: typeof search.page === "string" ? search.page : undefined,
    pageSize: typeof search.pageSize === "string" ? search.pageSize : undefined,
    vault: typeof search.vault === "string" ? search.vault : undefined,
    carrier: typeof search.carrier === "string" ? search.carrier : undefined,
    dateFrom: typeof search.dateFrom === "string" ? search.dateFrom : undefined,
    dateTo: typeof search.dateTo === "string" ? search.dateTo : undefined,
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

type AdminSearch = {
  section: AdminSection;
  user?: string;
  asset?: string;
  tab?: string;
  q?: string;
  priority?: string;
  status?: string;
  evidence?: string;
  research?: string;
  submittedFrom?: string;
  submittedTo?: string;
  sort?: string;
  sortDirection?: string;
  page?: string;
  pageSize?: string;
  vault?: string;
  carrier?: string;
  dateFrom?: string;
  dateTo?: string;
};

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
  const navigate = useNavigate({ from: Route.fullPath });
  const {
    section,
    tab: selectedUserTab,
    asset: selectedAsset,
    q: reviewQuery,
    priority: reviewPriority,
    status: reviewStatus,
    evidence: reviewEvidence,
    research: reviewResearch,
    submittedFrom: reviewSubmittedFrom,
    submittedTo: reviewSubmittedTo,
    sort: reviewSort,
    sortDirection: reviewSortDirection,
    page: reviewPageParam,
    pageSize: reviewPageSizeParam,
    vault: intakeVault,
    carrier: intakeCarrier,
    dateFrom: intakeDateFrom,
    dateTo: intakeDateTo,
  } = Route.useSearch();
  const { user: selectedUser } = Route.useSearch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [accountSearchInput, setAccountSearchInput] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountPage, setAccountPage] = useState(1);
  const [accountSort, setAccountSort] = useState("joined");
  const [accountSortDirection, setAccountSortDirection] = useState<"asc" | "desc">("desc");
  const [accountFilters, setAccountFilters] = useState({
    type: "",
    status: "",
    membershipPlan: "",
    membershipStatus: "",
    role: "",
    joinedFrom: "",
    joinedTo: "",
    lastActiveWindow: "",
  });
  const [accountDraft, setAccountDraft] = useState(accountFilters);
  const [accountFiltersOpen, setAccountFiltersOpen] = useState(false);
  const [complianceFilter, setComplianceFilter] = useState("All");
  const [selectedComplianceCase, setSelectedComplianceCase] = useState<string | undefined>();
  const [reviewSearchInput, setReviewSearchInput] = useState(reviewQuery ?? "");
  useEffect(() => {
    const timer = window.setTimeout(() => setAccountSearch(accountSearchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [accountSearchInput]);
  useEffect(() => {
    setAccountPage(1);
  }, [accountSearch, accountFilters, accountSort, accountSortDirection]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    setReviewSearchInput(reviewQuery ?? "");
  }, [reviewQuery]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = reviewSearchInput.trim() || undefined;
      if (next === reviewQuery) return;
      void navigate({
        search: (current) => ({ ...current, q: next, page: "1" }),
        replace: true,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [navigate, reviewQuery, reviewSearchInput]);
  const user = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    staleTime: 60_000,
  });
  const reviews = useQuery({
    queryKey: [
      "admin",
      "reviews",
      reviewQuery,
      reviewPriority,
      reviewStatus,
      reviewEvidence,
      reviewResearch,
      reviewSubmittedFrom,
      reviewSubmittedTo,
      reviewSort,
      reviewSortDirection,
      reviewPageParam,
      reviewPageSizeParam,
    ],
    queryFn: () =>
      services.repositories.reviews.listQueue(
        section === "moderation"
          ? {
              q: reviewQuery,
              priority: ["HIGH", "MEDIUM", "LOW"].includes(reviewPriority ?? "")
                ? (reviewPriority as "HIGH" | "MEDIUM" | "LOW")
                : undefined,
              status: ["SUBMITTED", "IN_REVIEW"].includes(reviewStatus ?? "")
                ? (reviewStatus as "SUBMITTED" | "IN_REVIEW")
                : undefined,
              evidence: ["complete", "missing", "partial"].includes(reviewEvidence ?? "")
                ? (reviewEvidence as "complete" | "missing" | "partial")
                : undefined,
              research: [
                "completed",
                "in_progress",
                "pending",
                "unavailable",
                "not_requested",
              ].includes(reviewResearch ?? "")
                ? (reviewResearch as
                    "completed" | "in_progress" | "pending" | "unavailable" | "not_requested")
                : undefined,
              submittedFrom: reviewSubmittedFrom,
              submittedTo: reviewSubmittedTo,
              sort: ["submitted", "priority", "collector", "research", "evidence"].includes(
                reviewSort ?? "",
              )
                ? (reviewSort as "submitted" | "priority" | "collector" | "research" | "evidence")
                : undefined,
              sortDirection: ["asc", "desc"].includes(reviewSortDirection ?? "")
                ? (reviewSortDirection as "asc" | "desc")
                : undefined,
              page: Math.max(1, Number(reviewPageParam ?? 1)),
              pageSize: Math.min(100, Math.max(1, Number(reviewPageSizeParam ?? 10))),
            }
          : { limit: 100 },
      ),
    enabled: section === "control" || section === "moderation",
    staleTime: 30_000,
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
    queryKey: [
      "admin",
      "intake",
      reviewQuery,
      reviewStatus,
      intakeVault,
      intakeCarrier,
      intakeDateFrom,
      intakeDateTo,
      reviewPageParam,
    ],
    queryFn: () =>
      services.repositories.admin.listIntake(
        section === "intake"
          ? {
              q: reviewQuery,
              status: reviewStatus,
              vaultId: intakeVault,
              carrier: intakeCarrier,
              dateFrom: intakeDateFrom,
              dateTo: intakeDateTo,
              page: Math.max(1, Number(reviewPageParam ?? 1)),
              pageSize: 10,
            }
          : { limit: 100 },
      ),
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
    queryKey: [
      "admin",
      "users",
      accountSearch,
      accountFilters,
      accountPage,
      accountSort,
      accountSortDirection,
    ],
    queryFn: () =>
      services.repositories.admin.listUsers({
        q: accountSearch || undefined,
        ...accountFilters,
        sort: accountSort,
        sortDirection: accountSortDirection,
        page: accountPage,
        pageSize: 10,
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
    void navigate({
      search: { section: next, user: undefined, asset: undefined, tab: undefined },
      replace: true,
    });
    setMobileOpen(false);
  };
  const updateReviewSearch = (patch: Partial<AdminSearch>) => {
    void navigate({
      search: (current) => ({ ...current, section: "moderation", ...patch }),
      replace: true,
    });
  };
  const openUser = (id: string) => {
    void navigate({ search: { section: "users", user: id, tab: undefined }, replace: true });
  };
  const reviewItems =
    reviews.data?.items.map((item) => ({
      id: item.id,
      status: item.reviewState,
      submittedAt: item.submittedAt,
    })) ?? [];
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
                    search={{ section: "users", user: result.id, tab: undefined }}
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                    }}
                  >
                    {content}
                  </Link>
                ) : result.entityType === "COLLECTIBLE" ? (
                  <Link
                    key={`${result.entityType}-${result.id}`}
                    to="/admin"
                    search={{ section: "marketplace", asset: result.id, tab: "overview" }}
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
          <ReviewQueue
            data={reviews.data}
            loading={reviews.isLoading}
            failed={reviews.isError}
            retry={() => void reviews.refetch()}
            searchInput={reviewSearchInput}
            setSearchInput={setReviewSearchInput}
            filters={{
              priority: reviewPriority ?? "",
              status: reviewStatus ?? "",
              evidence: reviewEvidence ?? "",
              research: reviewResearch ?? "",
              submittedFrom: reviewSubmittedFrom ?? "",
              submittedTo: reviewSubmittedTo ?? "",
              sort: reviewSort ?? "submitted",
              sortDirection: reviewSortDirection ?? "asc",
              page: Math.max(1, Number(reviewPageParam ?? 1)),
              pageSize: Math.min(100, Math.max(1, Number(reviewPageSizeParam ?? 10))),
            }}
            updateSearch={updateReviewSearch}
          />
        ) : section === "intake" ? (
          <PhysicalIntakeWorkspace
            data={intake.data}
            loading={intake.isLoading}
            failed={intake.isError}
            retry={() => void intake.refetch()}
            search={reviewQuery ?? ""}
            status={reviewStatus ?? ""}
            vault={intakeVault ?? ""}
            carrier={intakeCarrier ?? ""}
            dateFrom={intakeDateFrom ?? ""}
            dateTo={intakeDateTo ?? ""}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            updateSearch={(next) =>
              void navigate({
                search: (current) => ({ ...current, ...next, page: next.page ?? "1" }),
                replace: true,
              })
            }
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
        ) : section === "marketplace" && selectedAsset ? (
          <AdminCollectibleDetail
            assetId={selectedAsset}
            tab={selectedUserTab}
            onTab={(next) =>
              void navigate({ search: (current) => ({ ...current, tab: next }), replace: true })
            }
            onBack={() =>
              void navigate({
                search: (current) => ({ ...current, asset: undefined, tab: undefined }),
                replace: true,
              })
            }
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
          <AccountsWorkspace
            users={users.data?.items ?? []}
            loading={users.isLoading}
            failed={users.isError}
            retry={() => void users.refetch()}
            selected={userDetail.data}
            selectedLoading={userDetail.isLoading}
            selectedFailed={userDetail.isError}
            userTab={selectedUserTab}
            setUserTab={(tab) => {
              void navigate({
                search: { section: "users", user: selectedUser, tab },
                replace: true,
              });
            }}
            openUser={openUser}
            clearUser={() => select("users")}
            page={accountPage}
            total={users.data?.total ?? 0}
            summary={users.data?.summary}
            search={accountSearchInput}
            setSearch={setAccountSearchInput}
            filters={accountFilters}
            draftFilters={accountDraft}
            setDraftFilters={(value) => setAccountDraft(value as typeof accountDraft)}
            applyFilters={() => {
              setAccountFilters(accountDraft);
              setAccountPage(1);
            }}
            clearFilters={() => {
              const cleared = {
                type: "",
                status: "",
                membershipPlan: "",
                membershipStatus: "",
                role: "",
                joinedFrom: "",
                joinedTo: "",
                lastActiveWindow: "",
              };
              setAccountDraft(cleared);
              setAccountFilters(cleared);
              setAccountSearchInput("");
              setAccountPage(1);
            }}
            setType={(value) => {
              const next =
                value === "SUSPENDED"
                  ? { ...accountFilters, type: "", status: "SUSPENDED" }
                  : { ...accountFilters, type: value, status: "" };
              setAccountFilters(next);
              setAccountDraft(next);
            }}
            setPage={setAccountPage}
            sort={accountSort}
            setSort={(value) => {
              setAccountSort(value);
              setAccountSortDirection(value === "joined" ? "desc" : "desc");
            }}
            filtersOpen={accountFiltersOpen}
            setFiltersOpen={setAccountFiltersOpen}
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
  data,
  loading,
  failed,
  retry,
  search,
  status,
  vault,
  carrier,
  dateFrom,
  dateTo,
  page,
  updateSearch,
}: {
  data: AdminIntakeResponse | undefined;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  search: string;
  status: string;
  vault: string;
  carrier: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  updateSearch: (next: Record<string, string | undefined>) => void;
}) {
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
    <PhysicalIntakeBoard
      data={data}
      search={search}
      status={status}
      vault={vault}
      carrier={carrier}
      dateFrom={dateFrom}
      dateTo={dateTo}
      page={page}
      updateSearch={updateSearch}
    />
  );
}

const intakeTabs = [
  ["", "All", "all"],
  ["ACCEPTED_AWAITING_VAULT", "Accepted", "accepted"],
  ["IN_TRANSIT", "Shipped", "shipped"],
  ["DELIVERED_AWAITING_RECEIPT", "Delivered", "delivered"],
  ["RECEIVED", "Received", "received"],
  ["VERIFIED", "Verified", "verified"],
  ["VAULT_READY", "Ready for Vault", "readyForVault"],
  ["EXCEPTION", "Exceptions", "exceptions"],
] as const;

function PhysicalIntakeBoard({
  data,
  search,
  status,
  vault,
  carrier,
  dateFrom,
  dateTo,
  page,
  updateSearch,
}: {
  data: AdminIntakeResponse | undefined;
  search: string;
  status: string;
  vault: string;
  carrier: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  updateSearch: (next: Record<string, string | undefined>) => void;
}) {
  const services = useAppServices();
  const [draftSearch, setDraftSearch] = useState(search);
  const [receiptRow, setReceiptRow] = useState<AdminIntakeRow | null>(null);
  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftSearch.trim() !== search) updateSearch({ q: draftSearch.trim() || undefined });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftSearch, search, updateSearch]);
  const receipt = useMutation({
    mutationFn: (id: string) => services.repositories.admin.confirmIntakeReceipt(id),
    onSuccess: () => {
      setReceiptRow(null);
      updateSearch({ page: "1" });
    },
  });
  const overview = data?.overview ?? {
    all: 0,
    accepted: 0,
    shipped: 0,
    delivered: 0,
    received: 0,
    verified: 0,
    readyForVault: 0,
    exceptions: 0,
  };
  const countFor = (key: (typeof intakeTabs)[number][2]) =>
    overview[key as keyof typeof overview] ?? 0;
  return (
    <AdminPageSection
      title="Physical Intake"
      detail="Manage physical receipts, shipping, and custody intake workflow."
    >
      <div className="physical-intake-header-actions">
        <button type="button" className="admin-inline-action" disabled>
          Export
        </button>
        <button type="button" className="admin-inline-action" disabled>
          Intake settings
        </button>
      </div>
      <div className="physical-intake-kpis">
        {[
          ["Accepted", overview.accepted, "Awaiting vault selection", "is-blue"],
          ["Shipped", overview.shipped, "In transit to us", "is-amber"],
          ["Carrier Delivered", overview.delivered, "Awaiting receipt", "is-purple"],
          ["Received by Slice", overview.received, "Awaiting verification", "is-teal"],
          ["Verified", overview.verified, "Ready for valuation", "is-green"],
          ["Ready for Vault", overview.readyForVault, "Ready for custody", "is-blue"],
        ].map(([title, value, detail, tone]) => (
          <div className={`physical-intake-kpi ${tone}`} key={title as string}>
            <span className="physical-intake-kpi-icon">◇</span>
            <div>
              <small>{title}</small>
              <strong>{value}</strong>
              <em>{detail}</em>
            </div>
          </div>
        ))}
      </div>
      <div className="physical-intake-layout mt-4">
        <section className="physical-intake-table-panel">
          <nav className="physical-intake-tabs" aria-label="Intake stages">
            {intakeTabs.map(([value, labelText, key]) => (
              <button
                type="button"
                className={(!status && !value) || status === value ? "is-active" : ""}
                key={key}
                onClick={() => updateSearch({ status: value || undefined, page: "1" })}
              >
                {labelText} <strong>{countFor(key)}</strong>
              </button>
            ))}
          </nav>
          <div className="physical-intake-toolbar">
            <label className="physical-intake-search">
              <Search aria-hidden="true" />
              <input
                aria-label="Search intake"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Search by collector, item, submission ID, tracking..."
              />
            </label>
            <select
              aria-label="Status"
              value={status}
              onChange={(event) =>
                updateSearch({ status: event.target.value || undefined, page: "1" })
              }
            >
              <option value="">Status: All</option>
              {intakeTabs.slice(1).map(([value, labelText]) => (
                <option value={value} key={value}>
                  {labelText}
                </option>
              ))}
            </select>
            <select
              aria-label="Vault"
              value={vault}
              onChange={(event) =>
                updateSearch({ vault: event.target.value || undefined, page: "1" })
              }
            >
              <option value="">Vault: All</option>
              {data?.filters.vaults.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
            <select
              aria-label="Carrier"
              value={carrier}
              onChange={(event) =>
                updateSearch({ carrier: event.target.value || undefined, page: "1" })
              }
            >
              <option value="">Carrier: All</option>
              {data?.filters.carriers.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="admin-inline-action"
              onClick={() =>
                updateSearch({
                  status: undefined,
                  vault: undefined,
                  carrier: undefined,
                  dateFrom: undefined,
                  dateTo: undefined,
                  q: undefined,
                  page: "1",
                })
              }
            >
              Clear filters
            </button>
          </div>
          <div className="physical-intake-date-filter">
            <label>
              Accepted / stage from
              <input
                type="date"
                value={dateFrom}
                onChange={(event) =>
                  updateSearch({ dateFrom: event.target.value || undefined, page: "1" })
                }
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={dateTo}
                onChange={(event) =>
                  updateSearch({ dateTo: event.target.value || undefined, page: "1" })
                }
              />
            </label>
          </div>
          {data?.items.length ? (
            <div className="admin-table-wrap physical-intake-table-wrap">
              <table className="admin-table physical-intake-table">
                <thead>
                  <tr>
                    <th>Intake ID</th>
                    <th>Submission</th>
                    <th>Collector</th>
                    <th>Item</th>
                    <th>Vault</th>
                    <th>Status</th>
                    <th>Tracking</th>
                    <th>Expected / Received</th>
                    <th>Age</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <PhysicalIntakeRow
                      row={row}
                      key={row.id}
                      onReceipt={() => setReceiptRow(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <AdminEmpty
              detail={
                search || status || vault || carrier || dateFrom || dateTo
                  ? "No intake records match these filters."
                  : "No physical intake records."
              }
            />
          )}
          <div className="physical-intake-pagination">
            <span>
              Showing{" "}
              {data?.items.length ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0}{" "}
              to{" "}
              {Math.min(
                (data?.pagination.page ?? 0) * (data?.pagination.pageSize ?? 0),
                data?.pagination.total ?? 0,
              )}{" "}
              of {data?.pagination.total ?? 0} intakes
            </span>
            <div>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => updateSearch({ page: String(page - 1) })}
              >
                ‹
              </button>
              <strong>{page}</strong>
              <button
                type="button"
                disabled={!data || page >= data.pagination.totalPages}
                onClick={() => updateSearch({ page: String(page + 1) })}
              >
                ›
              </button>
            </div>
          </div>
        </section>
        <aside className="physical-intake-rail">
          <section className="admin-panel physical-intake-overview">
            <h3>Intake Overview</h3>
            <div className="physical-intake-ring">
              <strong>{overview.all}</strong>
              <span>Total</span>
            </div>
            {intakeTabs.slice(1).map(([value, labelText, key]) => (
              <div className="physical-intake-overview-row" key={value}>
                <span>{labelText}</span>
                <strong>
                  {countFor(key)} (
                  {overview.all ? Math.round((countFor(key) / overview.all) * 100) : 0}%)
                </strong>
              </div>
            ))}
          </section>
          <section className="admin-panel">
            <div className="physical-intake-rail-heading">
              <h3>Filters</h3>
              <button
                type="button"
                onClick={() =>
                  updateSearch({
                    status: undefined,
                    vault: undefined,
                    carrier: undefined,
                    dateFrom: undefined,
                    dateTo: undefined,
                    q: undefined,
                    page: "1",
                  })
                }
              >
                Clear all
              </button>
            </div>
            <p className="admin-safe-note">
              Use the shared filters above to keep the board and counts in sync.
            </p>
          </section>
          <section className="admin-panel">
            <h3>Quick Actions</h3>
            <button type="button" className="physical-intake-quick" disabled>
              Accept to intake <small>Acceptance is controlled by Submission Review</small>
            </button>
            {data?.items.find((item) => item.stage === "DELIVERED_AWAITING_RECEIPT") ? (
              <button
                type="button"
                className="physical-intake-quick"
                onClick={() =>
                  setReceiptRow(
                    data.items.find((item) => item.stage === "DELIVERED_AWAITING_RECEIPT") ?? null,
                  )
                }
              >
                Confirm receipt
              </button>
            ) : null}
          </section>
          <section className="admin-panel">
            <div className="physical-intake-rail-heading">
              <h3>Recent Activity</h3>
            </div>
            {data?.recentActivity.map((item) => (
              <div className="physical-intake-activity" key={item.id}>
                <span>●</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.reference} · {date(item.occurredAt)}
                  </small>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </div>
      {receiptRow ? (
        <div
          className="physical-intake-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-title"
        >
          <div className="admin-panel">
            <h2 id="receipt-title">Confirm Slice receipt</h2>
            <p>
              This confirms that Slice has physically received the collectible. Carrier delivery
              does not confirm receipt.
            </p>
            <dl>
              <div>
                <dt>Collectible</dt>
                <dd>{receiptRow.title}</dd>
              </div>
              <div>
                <dt>Collector</dt>
                <dd>{receiptRow.collector.displayName}</dd>
              </div>
              <div>
                <dt>Vault</dt>
                <dd>{receiptRow.vault?.displayName ?? "Not selected"}</dd>
              </div>
              <div>
                <dt>Tracking</dt>
                <dd>
                  {receiptRow.shipment
                    ? `${receiptRow.shipment.carrier} · ${receiptRow.shipment.trackingNumber}`
                    : "Not available"}
                </dd>
              </div>
            </dl>
            <div className="physical-intake-modal-actions">
              <button
                type="button"
                className="admin-inline-action"
                onClick={() => setReceiptRow(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={receipt.isPending}
                onClick={() => receipt.mutate(receiptRow.id)}
              >
                {receipt.isPending ? "Confirming…" : "Confirm receipt"}
              </button>
            </div>
            {receipt.isError ? (
              <p className="text-negative">
                This item may already be received or is not eligible for confirmation.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminPageSection>
  );
}

function PhysicalIntakeRow({ row, onReceipt }: { row: AdminIntakeRow; onReceipt: () => void }) {
  return (
    <tr>
      <td>
        <strong>{row.intakeReference ?? shortId(row.id)}</strong>
        <small>{shortId(row.submissionId)}</small>
      </td>
      <td>
        <Link
          to="/operations/submissions"
          search={{ submission: row.submissionId, tab: "Overview" }}
        >
          <strong>{shortId(row.submissionId)}</strong>
        </Link>
        <small>
          {row.category ?? "Collectible"} · {row.itemCount} items
        </small>
      </td>
      <td>
        <strong>{row.collector.displayName}</strong>
        <small>
          {row.collector.username ? `@${row.collector.username}` : ""}
          {row.membership ? ` · ${row.membership}` : ""}
        </small>
      </td>
      <td>
        <strong>{row.title}</strong>
        <small>
          {[row.variant, row.grader && row.grade ? `${row.grader} ${row.grade}` : row.grader]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </td>
      <td>
        {row.vault ? (
          <>
            <strong>{row.vault.displayName}</strong>
            <small>{row.vault.code}</small>
          </>
        ) : (
          "Awaiting vault"
        )}
      </td>
      <td>
        <span className={`admin-status-pill physical-intake-status-${row.stage.toLowerCase()}`}>
          {sentence(row.stage)}
        </span>
        <small>{row.nextAction}</small>
      </td>
      <td>
        {row.shipment ? (
          <>
            <strong>{row.shipment.carrier}</strong>
            <small>{row.shipment.trackingNumber}</small>
            {row.shipment.status !== "DELIVERED" &&
            safeTrackingUrl(row.shipment.carrier, row.shipment.trackingNumber) ? (
              <a
                href={
                  safeTrackingUrl(row.shipment.carrier, row.shipment.trackingNumber) ?? undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                Track ↗
              </a>
            ) : null}
          </>
        ) : (
          "—"
        )}
      </td>
      <td>
        {row.shipment?.deliveredAt ? (
          <>
            <small>Delivered</small>
            {date(row.shipment.deliveredAt)}
          </>
        ) : row.receipt ? (
          <>
            <small>Received</small>
            {date(row.receipt.confirmedAt)}
          </>
        ) : (
          "—"
        )}
      </td>
      <td>{age(row.currentStageSince)}</td>
      <td>
        {row.stage === "DELIVERED_AWAITING_RECEIPT" ? (
          <button type="button" className="admin-inline-action" onClick={onReceipt}>
            Receipt
          </button>
        ) : (
          <span className="text-subtle">{row.nextAction}</span>
        )}
      </td>
    </tr>
  );
}

function age(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 2880) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
function safeTrackingUrl(carrier: string, tracking: string): string | null {
  const encoded = encodeURIComponent(tracking);
  const normalized = carrier.toLowerCase();
  if (normalized.includes("ups")) return `https://www.ups.com/track?tracknum=${encoded}`;
  if (normalized.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  if (normalized.includes("usps"))
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
  if (normalized.includes("royal"))
    return `https://www.royalmail.com/track-your-item#/tracking-results/${encoded}`;
  return null;
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

type ReviewQueueFilters = {
  priority: string;
  status: string;
  evidence: string;
  research: string;
  submittedFrom: string;
  submittedTo: string;
  sort: string;
  sortDirection: string;
  page: number;
  pageSize: number;
};

function ReviewQueue({
  data,
  loading,
  failed,
  retry,
  searchInput,
  setSearchInput,
  filters,
  updateSearch,
}: {
  data: SubmissionReviewQueueResponse | undefined;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  searchInput: string;
  setSearchInput: (value: string) => void;
  filters: ReviewQueueFilters;
  updateSearch: (patch: Partial<AdminSearch>) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const items = data?.items ?? [];
  const counts = data?.counts ?? {
    all: 0,
    highPriority: 0,
    awaitingEvidence: 0,
    researchPending: 0,
    readyToReview: 0,
  };
  const totalPages = data?.pagination.totalPages ?? 1;
  const tab =
    filters.priority === "HIGH"
      ? "high"
      : filters.evidence === "missing"
        ? "evidence"
        : filters.research === "pending" || filters.research === "in_progress"
          ? "research"
          : filters.evidence === "complete" && filters.status === "SUBMITTED"
            ? "ready"
            : "all";
  const selectTab = (next: "all" | "high" | "evidence" | "research" | "ready") => {
    updateSearch({
      priority: next === "high" ? "HIGH" : undefined,
      evidence: next === "evidence" ? "missing" : next === "ready" ? "complete" : undefined,
      research: next === "research" ? "pending" : undefined,
      status: next === "ready" ? "SUBMITTED" : undefined,
      page: "1",
    });
    setSelected([]);
  };
  const toggleSelected = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const toggleAll = () => setSelected(allSelected ? [] : items.map((item) => item.id));
  const clearFilters = () => {
    setSearchInput("");
    updateSearch({
      q: undefined,
      priority: undefined,
      status: undefined,
      evidence: undefined,
      research: undefined,
      submittedFrom: undefined,
      submittedTo: undefined,
      sort: "submitted",
      sortDirection: "asc",
      page: "1",
    });
  };
  if (loading)
    return (
      <AdminPageSection
        title="Review Queue"
        detail="Loading the authorized submission review queue."
      >
        <div className="admin-review-queue-skeleton" aria-label="Loading review queue">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </AdminPageSection>
    );
  if (failed)
    return (
      <AdminState
        title="We couldn't load the review queue"
        detail="The queue could not be loaded safely."
        retry={retry}
      />
    );
  return (
    <div className="admin-review-queue">
      <div className="admin-review-queue-heading">
        <div>
          <p className="admin-breadcrumb">
            Submissions <span>›</span> Review Queue
          </p>
          <h2>Review Queue</h2>
          <p>Review and evaluate submissions before acceptance into Slice.</p>
        </div>
      </div>
      <div className="admin-review-kpis">
        <ReviewKpi
          icon={ClipboardCheck}
          label="Total in queue"
          value={counts.all}
          detail="Current reviewable submissions"
        />
        <ReviewKpi
          icon={AlertTriangle}
          label="High priority"
          value={counts.highPriority}
          detail="Operational age rule"
          tone="warning"
        />
        <ReviewKpi
          icon={Archive}
          label="Awaiting evidence"
          value={counts.awaitingEvidence}
          detail="Missing required evidence"
          tone="purple"
        />
        <ReviewKpi
          icon={BarChart3}
          label="Research pending"
          value={counts.researchPending}
          detail="Research not complete"
          tone="blue"
        />
        <ReviewKpi
          icon={CheckCircle2}
          label="Ready to review"
          value={counts.readyToReview}
          detail="Evidence complete"
          tone="positive"
        />
      </div>
      <div className="admin-review-queue-layout">
        <section className="admin-panel admin-review-table-panel">
          <div className="admin-review-tabs" role="tablist" aria-label="Review queue filters">
            <ReviewTab
              active={tab === "all"}
              label="All"
              count={counts.all}
              onClick={() => selectTab("all")}
            />
            <ReviewTab
              active={tab === "high"}
              label="High Priority"
              count={counts.highPriority}
              onClick={() => selectTab("high")}
            />
            <ReviewTab
              active={tab === "evidence"}
              label="Awaiting Evidence"
              count={counts.awaitingEvidence}
              onClick={() => selectTab("evidence")}
            />
            <ReviewTab
              active={tab === "research"}
              label="Research Pending"
              count={counts.researchPending}
              onClick={() => selectTab("research")}
            />
            <ReviewTab
              active={tab === "ready"}
              label="Ready to Review"
              count={counts.readyToReview}
              onClick={() => selectTab("ready")}
            />
          </div>
          <div className="admin-review-toolbar">
            <label className="admin-review-search">
              <Search aria-hidden="true" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by collector, card, submission ID..."
                aria-label="Search review queue"
              />
            </label>
            <ReviewSelect
              label="Priority"
              value={filters.priority}
              options={[
                ["", "Priority: All"],
                ["HIGH", "High"],
                ["MEDIUM", "Medium"],
                ["LOW", "Low"],
              ]}
              onChange={(value) => updateSearch({ priority: value || undefined, page: "1" })}
            />
            <ReviewSelect
              label="Status"
              value={filters.status}
              options={[
                ["", "Status: All"],
                ["SUBMITTED", "Submitted"],
                ["IN_REVIEW", "In Review"],
              ]}
              onChange={(value) => updateSearch({ status: value || undefined, page: "1" })}
            />
            <ReviewSelect
              label="Evidence"
              value={filters.evidence}
              options={[
                ["", "Evidence: All"],
                ["complete", "Complete"],
                ["missing", "Missing Required"],
                ["partial", "Partial"],
              ]}
              onChange={(value) => updateSearch({ evidence: value || undefined, page: "1" })}
            />
          </div>
          <div className="admin-review-table-wrap">
            <table className="admin-review-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all visible submissions"
                    />
                  </th>
                  <th>Submission</th>
                  <th>Collector</th>
                  <th>Card / Item</th>
                  <th>Evidence</th>
                  <th>Research</th>
                  <th>Priority</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`Select ${item.submissionReference}`}
                        />
                      </td>
                      <td>
                        <div className="admin-review-submission-cell">
                          <span className="admin-review-thumb">
                            {item.thumbnailUrl ? (
                              <img src={item.thumbnailUrl} alt="" />
                            ) : (
                              <Archive aria-hidden="true" />
                            )}
                          </span>
                          <span>
                            <strong>{item.submissionReference}</strong>
                            <small>
                              {item.category} · {item.evidence.itemCount} item
                              {item.evidence.itemCount === 1 ? "" : "s"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="admin-review-collector">
                          <strong>{item.collector.displayName}</strong>
                          <small>
                            {item.collector.username
                              ? `@${item.collector.username}`
                              : "No username"}
                          </small>
                          {item.collector.membership ? <em>{item.collector.membership}</em> : null}
                        </div>
                      </td>
                      <td>
                        <div className="admin-review-collectible">
                          <strong>{item.collectible.title}</strong>
                          <small>
                            {[
                              item.collectible.variant,
                              item.collectible.set,
                              item.collectible.cardNumber,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Identity details pending"}
                          </small>
                          <small>
                            {[item.collectible.grader, item.collectible.grade]
                              .filter(Boolean)
                              .join(" ") || "Grade not provided"}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div
                          className={`admin-review-evidence admin-review-evidence--${item.evidence.status.toLowerCase()}`}
                        >
                          <strong>{item.evidence.percent}%</strong>
                          <small>
                            {item.evidence.status === "COMPLETE"
                              ? "Complete"
                              : `Missing (${item.evidence.missingRequired})`}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div
                          className={`admin-review-research admin-review-research--${item.research.status.toLowerCase()}`}
                        >
                          <strong>{reviewResearchLabel(item.research.status)}</strong>
                          <small>
                            {item.research.observedAt ? date(item.research.observedAt) : "—"}
                          </small>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`admin-review-priority admin-review-priority--${item.priority.toLowerCase()}`}
                        >
                          {item.priority === "HIGH" ? "↑" : item.priority === "MEDIUM" ? "↑" : "↓"}{" "}
                          {sentence(item.priority)}
                        </span>
                      </td>
                      <td>
                        <span className="admin-review-submitted">
                          {reviewDateTime(item.submittedAt)}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="admin-review-action"
                          to="/operations/submissions"
                          search={{ submission: item.id, tab: undefined }}
                        >
                          Review <ArrowRight aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>
                      <AdminEmpty
                        detail={
                          searchInput || filters.priority || filters.evidence || filters.research
                            ? "No submissions match these filters."
                            : "No submissions currently need review."
                        }
                      />
                      {searchInput || filters.priority || filters.evidence || filters.research ? (
                        <button
                          type="button"
                          className="admin-inline-action"
                          onClick={clearFilters}
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="admin-review-pagination">
            <span>
              Showing {items.length ? (filters.page - 1) * filters.pageSize + 1 : 0} to{" "}
              {Math.min(filters.page * filters.pageSize, data?.pagination.total ?? 0)} of{" "}
              {data?.pagination.total ?? 0} submissions
            </span>
            <div>
              <button
                type="button"
                disabled={filters.page <= 1}
                onClick={() => updateSearch({ page: String(filters.page - 1) })}
              >
                ‹
              </button>
              <strong>{filters.page}</strong>
              <button
                type="button"
                disabled={filters.page >= totalPages}
                onClick={() => updateSearch({ page: String(filters.page + 1) })}
              >
                ›
              </button>
              <ReviewSelect
                label="Page size"
                value={String(filters.pageSize)}
                options={[
                  ["10", "10 / page"],
                  ["25", "25 / page"],
                  ["50", "50 / page"],
                ]}
                onChange={(value) => updateSearch({ pageSize: value, page: "1" })}
              />
            </div>
          </div>
        </section>
        <aside className="admin-review-rail">
          <section className="admin-panel">
            <AdminPanelHeading title="Queue Summary" />
            <div className="admin-review-summary">
              <strong>{counts.all}</strong>
              <span>Total</span>
            </div>
            <ReviewSummaryBar
              label="High Priority"
              value={counts.highPriority}
              total={counts.all}
              tone="warning"
            />
            <ReviewSummaryBar
              label="Awaiting Evidence"
              value={counts.awaitingEvidence}
              total={counts.all}
              tone="purple"
            />
            <ReviewSummaryBar
              label="Research Pending"
              value={counts.researchPending}
              total={counts.all}
              tone="blue"
            />
            <ReviewSummaryBar
              label="Ready to Review"
              value={counts.readyToReview}
              total={counts.all}
              tone="positive"
            />
            <small className="admin-muted">
              Categories can overlap; counts are intentionally not presented as exclusive
              percentages.
            </small>
          </section>
          <section className="admin-panel">
            <AdminPanelHeading title="Filters" action="Clear all" onClick={clearFilters} />
            <label className="admin-review-side-field">
              Search
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Collector, card, ID..."
                aria-label="Filter review queue"
              />
            </label>
            <label className="admin-review-side-field">
              Priority
              <ReviewSelect
                label="Filter priority"
                value={filters.priority}
                options={[
                  ["", "All priorities"],
                  ["HIGH", "High"],
                  ["MEDIUM", "Medium"],
                  ["LOW", "Low"],
                ]}
                onChange={(value) => updateSearch({ priority: value || undefined, page: "1" })}
              />
            </label>
            <label className="admin-review-side-field">
              Status
              <ReviewSelect
                label="Filter status"
                value={filters.status}
                options={[
                  ["", "All statuses"],
                  ["SUBMITTED", "Submitted"],
                  ["IN_REVIEW", "In Review"],
                ]}
                onChange={(value) => updateSearch({ status: value || undefined, page: "1" })}
              />
            </label>
            <label className="admin-review-side-field">
              Evidence completeness
              <ReviewSelect
                label="Filter evidence completeness"
                value={filters.evidence}
                options={[
                  ["", "All levels"],
                  ["complete", "Complete"],
                  ["missing", "Missing required"],
                  ["partial", "Partial"],
                ]}
                onChange={(value) => updateSearch({ evidence: value || undefined, page: "1" })}
              />
            </label>
            <label className="admin-review-side-field">
              Market Research
              <ReviewSelect
                label="Market research"
                value={filters.research}
                options={[
                  ["", "All states"],
                  ["completed", "Completed"],
                  ["in_progress", "In Progress"],
                  ["pending", "Pending"],
                  ["unavailable", "Unavailable"],
                  ["not_requested", "Not Requested"],
                ]}
                onChange={(value) => updateSearch({ research: value || undefined, page: "1" })}
              />
            </label>
            <label className="admin-review-side-field">
              Submitted date
              <div className="admin-review-date-fields">
                <input
                  type="date"
                  value={filters.submittedFrom}
                  onChange={(event) =>
                    updateSearch({ submittedFrom: event.target.value || undefined, page: "1" })
                  }
                  aria-label="Submitted from"
                />
                <input
                  type="date"
                  value={filters.submittedTo}
                  onChange={(event) =>
                    updateSearch({ submittedTo: event.target.value || undefined, page: "1" })
                  }
                  aria-label="Submitted to"
                />
              </div>
            </label>
            <label className="admin-review-side-field">
              Sort by
              <ReviewSelect
                label="Sort by"
                value={filters.sort}
                options={[
                  ["submitted", "Submitted"],
                  ["priority", "Priority"],
                  ["collector", "Collector"],
                  ["research", "Research"],
                  ["evidence", "Evidence"],
                ]}
                onChange={(value) => updateSearch({ sort: value, page: "1" })}
              />
            </label>
            <label className="admin-review-side-field">
              Direction
              <ReviewSelect
                label="Sort direction"
                value={filters.sortDirection}
                options={[
                  ["asc", "Oldest first"],
                  ["desc", "Newest first"],
                ]}
                onChange={(value) => updateSearch({ sortDirection: value, page: "1" })}
              />
            </label>
          </section>
          <section className="admin-panel">
            <AdminPanelHeading title="Quick Actions" />
            {selected[0] ? (
              <Link
                className="admin-detail-action"
                to="/operations/submissions"
                search={{ submission: selected[0], tab: undefined }}
              >
                <ClipboardCheck aria-hidden="true" /> Open selected review
              </Link>
            ) : (
              <button type="button" className="admin-detail-action" disabled>
                <ClipboardCheck aria-hidden="true" /> Select submissions to review
              </button>
            )}
            <p className="admin-safe-note">
              Bulk accept/reject and evidence requests are not available without a structured batch
              workflow.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ReviewKpi({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  return (
    <article className={`admin-review-kpi admin-review-kpi--${tone ?? "default"}`}>
      <span>
        <Icon aria-hidden="true" />
      </span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{detail}</em>
    </article>
  );
}

function ReviewTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? "is-active" : ""}
      onClick={onClick}
    >
      {label} ({count})
    </button>
  );
}

function ReviewSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  );
}

function ReviewSummaryBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  return (
    <div className="admin-review-summary-row">
      <span>
        <i className={`admin-review-dot admin-review-dot--${tone}`} />
        {label}
      </span>
      <strong>
        {value}
        {total ? ` (${Math.round((value / total) * 100)}%)` : ""}
      </strong>
    </div>
  );
}

function reviewResearchLabel(status: string) {
  return (
    {
      COMPLETED: "Completed",
      IN_PROGRESS: "In Progress",
      PENDING: "Pending",
      UNAVAILABLE: "Unavailable",
      NOT_REQUESTED: "Not Requested",
    }[status] ?? "Pending"
  );
}

function reviewDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function AccountsWorkspace({
  users,
  loading,
  failed,
  retry,
  selected,
  selectedLoading,
  selectedFailed,
  userTab,
  setUserTab,
  openUser,
  clearUser,
  page,
  total,
  summary,
  search,
  setSearch,
  filters,
  draftFilters,
  setDraftFilters,
  applyFilters,
  clearFilters,
  setType,
  setPage,
  sort,
  setSort,
  filtersOpen,
  setFiltersOpen,
}: {
  users: AdminUserSummary[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  selected?: AdminUserDetail;
  selectedLoading: boolean;
  selectedFailed: boolean;
  userTab?: string;
  setUserTab: (value: string) => void;
  openUser: (id: string) => void;
  clearUser: () => void;
  page: number;
  total: number;
  summary?: AdminAccountsSummary;
  search: string;
  setSearch: (value: string) => void;
  filters: Record<string, string>;
  draftFilters: Record<string, string>;
  setDraftFilters: (value: Record<string, string>) => void;
  applyFilters: () => void;
  clearFilters: () => void;
  setType: (value: string) => void;
  setPage: (value: number) => void;
  sort: string;
  setSort: (value: string) => void;
  filtersOpen: boolean;
  setFiltersOpen: (value: boolean) => void;
}) {
  if (selected || selectedLoading || selectedFailed) {
    return (
      <UserDetailExperience
        user={selected}
        loading={selectedLoading}
        failed={selectedFailed}
        retry={retry}
        back={clearUser}
        tab={userTab}
        setTab={setUserTab}
      />
    );
  }
  const updateDraft = (key: string, value: string) =>
    setDraftFilters({ ...draftFilters, [key]: value });
  const tabActive = (value: string) =>
    value === "SUSPENDED"
      ? filters.status === "SUSPENDED"
      : filters.type === value && !filters.status;
  return (
    <div className="admin-console-content admin-accounts-content">
      <section className="admin-console-heading">
        <div>
          <p className="admin-console-eyebrow">Admin Panel</p>
          <h2>Users &amp; Accounts</h2>
          <span>
            View and manage all platform users across collectors, investors, staff and admins.
          </span>
        </div>
      </section>
      <div className="admin-kpi-grid admin-kpi-grid--six">
        <AdminKpi icon={Users} label="Total users" value={summary ? summary.totalUsers : "—"} />
        <AdminKpi icon={Users} label="Collectors" value={summary ? summary.collectors : "—"} />
        <AdminKpi
          icon={BriefcaseBusiness}
          label="Investors"
          value={summary ? summary.investors : "—"}
        />
        <AdminKpi icon={ShieldCheck} label="Staff" value={summary ? summary.staff : "—"} />
        <AdminKpi icon={Crown} label="Admins" value={summary ? summary.admins : "—"} />
        <AdminKpi
          icon={AlertTriangle}
          label="Suspended"
          value={summary ? summary.suspended : "—"}
        />
      </div>
      {loading ? (
        <AdminState
          title="Loading platform accounts"
          detail="Reading the admin-safe account directory."
        />
      ) : failed ? (
        <AdminState
          title="We couldn't load platform accounts"
          detail="The account directory could not be loaded safely."
          retry={retry}
        />
      ) : (
        <div className="admin-accounts-layout">
          <section className="admin-panel admin-accounts-table-panel">
            <div className="admin-account-tabs" role="tablist" aria-label="Account types">
              {[
                ["", "All Users"],
                ["COLLECTOR", "Collectors"],
                ["INVESTOR", "Investors"],
                ["STAFF", "Staff"],
                ["ADMIN", "Admins"],
                ["SUSPENDED", "Suspended"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabActive(value)}
                  className={tabActive(value) ? "is-active" : ""}
                  key={label}
                  onClick={() => {
                    if (value === "SUSPENDED") {
                      setType("SUSPENDED");
                      setDraftFilters({ ...draftFilters, type: "", status: "SUSPENDED" });
                    } else {
                      setType(value);
                      setDraftFilters({ ...draftFilters, type: value, status: "" });
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="admin-account-toolbar">
              <label className="admin-account-search">
                <Search aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by username, email, name or ID..."
                />
              </label>
              <select
                aria-label="Type"
                value={draftFilters.type}
                onChange={(event) => updateDraft("type", event.target.value)}
              >
                <option value="">Type: All</option>
                <option value="COLLECTOR">Collector</option>
                <option value="INVESTOR">Investor</option>
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin</option>
              </select>
              <select
                aria-label="Status"
                value={draftFilters.status}
                onChange={(event) => updateDraft("status", event.target.value)}
              >
                <option value="">Status: All</option>
                <option value="ACTIVE">Active</option>
                <option value="RESTRICTED">Restricted</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DEACTIVATED">Deactivated</option>
                <option value="PENDING_REVIEW">Pending review</option>
              </select>
              <select
                aria-label="Membership"
                value={draftFilters.membershipPlan}
                onChange={(event) => updateDraft("membershipPlan", event.target.value)}
              >
                <option value="">Membership: All</option>
                <option value="STARTER">Starter</option>
                <option value="PRO">Pro</option>
                <option value="ELITE">Elite</option>
              </select>
              <select
                aria-label="Role"
                value={draftFilters.role}
                onChange={(event) => updateDraft("role", event.target.value)}
              >
                <option value="">Role: All</option>
                <option value="COLLECTOR">Collector</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPPORT">Support</option>
                <option value="ASSET_REVIEWER">Asset reviewer</option>
              </select>
              <button
                type="button"
                className="admin-filter-more"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <ListChecks aria-hidden="true" /> More Filters
              </button>
            </div>
            <div className="admin-account-table-heading">
              <strong>Accounts</strong>
              <label>
                Sort{" "}
                <select
                  aria-label="Sort accounts"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="joined">Joined</option>
                  <option value="lastActive">Last active</option>
                  <option value="username">Username</option>
                </select>
              </label>
            </div>
            {users.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table admin-accounts-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Type</th>
                      <th>Roles</th>
                      <th>Membership</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Last active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const activeRoles = user.roles.filter((role) => role.role !== "USER");
                      return (
                        <tr key={user.id}>
                          <td>
                            <div className="admin-user-cell">
                              <span className="admin-user-avatar">
                                {initials(user.displayName)}
                              </span>
                              <span>
                                <strong>{user.displayName}</strong>
                                <small>
                                  {user.username ? `@${user.username}` : "Username unavailable"}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="admin-type-badge">{sentence(user.primaryType)}</span>
                          </td>
                          <td>
                            <div className="admin-tag-list">
                              {activeRoles.length ? (
                                activeRoles.map((role) => (
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
                            {user.membership.plan ? (
                              <span>
                                {sentence(user.membership.plan)}
                                {user.membership.status && user.membership.status !== "ACTIVE" ? (
                                  <small className="admin-membership-status">
                                    {" "}
                                    · {sentence(user.membership.status)}
                                  </small>
                                ) : null}
                              </span>
                            ) : (
                              <span className="admin-muted">—</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`admin-status-pill admin-status-pill--${user.accountStatus.toLowerCase()}`}
                            >
                              {sentence(user.accountStatus)}
                            </span>
                          </td>
                          <td>{date(user.createdAt)}</td>
                          <td>{user.lastActivityAt ? date(user.lastActivityAt) : "Unavailable"}</td>
                          <td>
                            <button
                              type="button"
                              className="admin-inline-action"
                              aria-label={`View ${user.displayName}`}
                              onClick={() => openUser(user.id)}
                            >
                              <ArrowRight aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <AdminEmpty detail="No accounts match these filters." icon={Users} />
            )}
            <div className="admin-pagination">
              <span>
                {total
                  ? `Showing ${(page - 1) * 10 + 1} to ${Math.min(page * 10, total)} of ${total} users`
                  : "No accounts match these filters."}
              </span>
              <span className="admin-pagination-controls">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <strong>{page}</strong>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page * 10 >= total}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </span>
            </div>
          </section>
          <aside className={`admin-accounts-rail ${filtersOpen ? "is-open" : ""}`}>
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <h3>Filter by</h3>
                <button type="button" onClick={clearFilters}>
                  Clear all
                </button>
              </div>
              <label className="admin-rail-field">
                Search
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Username, email or ID..."
                />
              </label>
              <label className="admin-rail-field">
                Type
                <select
                  value={draftFilters.type}
                  onChange={(event) => updateDraft("type", event.target.value)}
                >
                  <option value="">All types</option>
                  <option value="COLLECTOR">Collector</option>
                  <option value="INVESTOR">Investor</option>
                  <option value="STAFF">Staff</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              <label className="admin-rail-field">
                Status
                <select
                  value={draftFilters.status}
                  onChange={(event) => updateDraft("status", event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="RESTRICTED">Restricted</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DEACTIVATED">Deactivated</option>
                  <option value="PENDING_REVIEW">Pending review</option>
                </select>
              </label>
              <label className="admin-rail-field">
                Membership
                <select
                  value={draftFilters.membershipPlan}
                  onChange={(event) => updateDraft("membershipPlan", event.target.value)}
                >
                  <option value="">All memberships</option>
                  <option value="STARTER">Starter</option>
                  <option value="PRO">Pro</option>
                  <option value="ELITE">Elite</option>
                </select>
              </label>
              <label className="admin-rail-field">
                Billing status
                <select
                  value={draftFilters.membershipStatus}
                  onChange={(event) => updateDraft("membershipStatus", event.target.value)}
                >
                  <option value="">All billing states</option>
                  <option value="ACTIVE">Active</option>
                  <option value="TRIALING">Trialing</option>
                  <option value="PAST_DUE">Past due</option>
                  <option value="CANCEL_AT_PERIOD_END">Canceling</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </label>
              <label className="admin-rail-field">
                Role
                <select
                  value={draftFilters.role}
                  onChange={(event) => updateDraft("role", event.target.value)}
                >
                  <option value="">All roles</option>
                  <option value="COLLECTOR">Collector</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPPORT">Support</option>
                  <option value="ASSET_REVIEWER">Asset reviewer</option>
                </select>
              </label>
              <div className="admin-rail-field">
                <span>Joined</span>
                <div className="admin-date-range">
                  <input
                    type="date"
                    value={draftFilters.joinedFrom}
                    onChange={(event) => updateDraft("joinedFrom", event.target.value)}
                  />
                  <input
                    type="date"
                    value={draftFilters.joinedTo}
                    onChange={(event) => updateDraft("joinedTo", event.target.value)}
                  />
                </div>
              </div>
              <label className="admin-rail-field">
                Last active
                <select
                  value={draftFilters.lastActiveWindow}
                  onChange={(event) => updateDraft("lastActiveWindow", event.target.value)}
                >
                  <option value="">Any time</option>
                  <option value="1">Last 24 hours</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="inactive">Inactive 30+ days</option>
                </select>
              </label>
              <button type="button" className="admin-apply-filters" onClick={applyFilters}>
                Apply filters
              </button>
            </section>
            <section className="admin-panel admin-account-summary">
              <div className="admin-panel-heading">
                <h3>Summary</h3>
              </div>
              <StatusRow
                label="Active users"
                status={String(summary?.activeUsers ?? 0)}
                icon={CheckCircle2}
              />
              <StatusRow
                label="Restricted"
                status={String(summary?.restricted ?? 0)}
                icon={AlertTriangle}
              />
              <StatusRow
                label="Suspended"
                status={String(summary?.suspended ?? 0)}
                icon={ShieldCheck}
              />
              <StatusRow
                label="Past due memberships"
                status={String(summary?.pastDueMemberships ?? 0)}
                icon={AlertTriangle}
              />
              <StatusRow
                label="Trialing memberships"
                status={String(summary?.trialingMemberships ?? 0)}
                icon={Crown}
              />
            </section>
          </aside>
        </div>
      )}
    </div>
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

function UserDetailExperience({
  user,
  loading,
  failed,
  retry,
  back,
  tab,
  setTab,
}: {
  user?: AdminUserDetail;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  back: () => void;
  tab?: string;
  setTab: (value: string) => void;
}) {
  if (loading)
    return (
      <AdminState title="Loading user" detail="Reading identity and safe account projections." />
    );
  if (failed || !user)
    return (
      <AdminState
        title="We couldn't load this account"
        detail="The account detail could not be loaded safely."
        retry={retry}
      />
    );
  const tabs = [
    "Overview",
    "Roles & Access",
    ...(user.primaryType === "INVESTOR" ||
    user.portfolioSummary.totalAssets ||
    user.portfolioSummary.openOrders
      ? ["Investor"]
      : []),
    ...(user.collectorOverview ? ["Collector"] : []),
    "Wallet",
    "Orders",
    "Compliance",
    "Support",
    "Activity",
    "Audit",
  ];
  const activeTab = tabs.includes(tab ?? "") ? tab! : "Overview";
  const money = (value: string | null, currency = "GBP") =>
    value === null
      ? "Unavailable"
      : `${currency === "GBP" ? "£" : currency + " "}${formatMinor(value)}`;
  const renderOverview = () => (
    <>
      <div className="admin-detail-overview-grid">
        <section className="admin-panel">
          <AdminPanelHeading title="Account Summary" />
          <DetailRow
            label="Total Portfolio Value"
            value={money(user.portfolioSummary.totalValueMinor, user.portfolioSummary.currency)}
          />
          <DetailRow label="Total Assets" value={String(user.portfolioSummary.totalAssets)} />
          <DetailRow label="Active Listings" value={String(user.portfolioSummary.activeListings)} />
          <DetailRow label="Open Orders" value={String(user.portfolioSummary.openOrders)} />
          <DetailRow
            label="Total Invested"
            value={money(user.portfolioSummary.totalInvestedMinor, user.portfolioSummary.currency)}
          />
          <DetailRow
            label="Total Withdrawn"
            value={money(user.portfolioSummary.totalWithdrawnMinor, user.portfolioSummary.currency)}
          />
        </section>
        <section className="admin-panel">
          <AdminPanelHeading title="Wallet Summary" />
          <DetailRow
            label="Available Cash"
            value={
              user.walletSummary
                ? money(user.walletSummary.availableMinor, user.walletSummary.currency)
                : "Unavailable"
            }
            tone="positive"
          />
          <DetailRow
            label="Reserved"
            value={
              user.walletSummary
                ? money(user.walletSummary.reservedMinor, user.walletSummary.currency)
                : "Unavailable"
            }
            tone="warning"
          />
          <DetailRow
            label="Pending"
            value={
              user.walletSummary
                ? money(user.walletSummary.pendingMinor, user.walletSummary.currency)
                : "Unavailable"
            }
            tone="info"
          />
          <DetailRow
            label="Total Balance"
            value={
              user.walletSummary
                ? money(user.walletSummary.totalMinor, user.walletSummary.currency)
                : "Unavailable"
            }
          />
          <p className="admin-safe-note">
            Read-only D13 wallet projection. Balance editing is not available here.
          </p>
        </section>
        <section className="admin-panel">
          <AdminPanelHeading
            title="Recent Orders"
            action="View all"
            onClick={() => setTab("Orders")}
          />
          {user.recentOrders.length ? (
            <div className="admin-record-list">
              {user.recentOrders.map((order) => (
                <article className="admin-record" key={order.id}>
                  <span
                    className={`admin-order-side admin-order-side--${order.side.toLowerCase()}`}
                  >
                    {sentence(order.side)}
                  </span>
                  <div className="min-w-0">
                    <strong>{order.assetTitle}</strong>
                    <small>
                      {order.units} shares @ {money(order.limitPriceMinor, order.currency)}
                    </small>
                  </div>
                  <span className="admin-record-status">{sentence(order.status)}</span>
                </article>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No open orders." icon={WalletCards} />
          )}
          <button type="button" className="admin-detail-link" onClick={() => setTab("Orders")}>
            View all orders <ArrowRight aria-hidden="true" />
          </button>
        </section>
      </div>
      <div className="admin-detail-lower-grid">
        <section className="admin-panel">
          <AdminPanelHeading
            title="Compliance Overview"
            action="View compliance"
            onClick={() => setTab("Compliance")}
          />
          <DetailRow
            label="KYC Status"
            value={sentence(user.complianceSummary.kycStatus)}
            tone="positive"
          />
          <DetailRow
            label="KYT Status"
            value={sentence(user.complianceSummary.kytStatus)}
            tone="positive"
          />
          <DetailRow label="Country" value={user.identity.country ?? "Unavailable"} />
          <DetailRow label="Provider" value={user.complianceSummary.provider ?? "Unavailable"} />
          <DetailRow
            label="Last Review"
            value={
              user.complianceSummary.lastReviewAt
                ? date(user.complianceSummary.lastReviewAt)
                : "Unavailable"
            }
          />
        </section>
        <section className="admin-panel">
          <AdminPanelHeading
            title="Support Overview"
            action="View support"
            onClick={() => setTab("Support")}
          />
          <AdminEmpty
            detail="Support ticket metrics are not connected to Admin User Detail."
            icon={LifeBuoy}
          />
        </section>
        <section className="admin-panel">
          <AdminPanelHeading
            title="Collector Overview"
            action={user.collectorOverview ? "View all" : undefined}
            onClick={user.collectorOverview ? () => setTab("Collector") : undefined}
          />
          {user.collectorOverview ? (
            <>
              <div className="admin-detail-assets">
                {user.collectorOverview.assets.map((asset) => (
                  <div className="admin-detail-asset" key={asset.id}>
                    <span>{initials(asset.title)}</span>
                    <strong>{asset.title}</strong>
                    <small>{asset.units} units</small>
                  </div>
                ))}
                {user.collectorOverview.additionalAssets ? (
                  <div className="admin-detail-asset admin-detail-asset--more">
                    <strong>+{user.collectorOverview.additionalAssets}</strong>
                    <small>More assets</small>
                  </div>
                ) : null}
              </div>
              <p className="admin-safe-note">
                {user.collectorOverview.submissions} submissions ·{" "}
                {user.collectorOverview.activeIntakes} active intakes
              </p>
            </>
          ) : (
            <AdminEmpty
              detail="This user does not currently have Collector access."
              icon={Archive}
            />
          )}
        </section>
      </div>
    </>
  );
  const renderTab = () => {
    if (activeTab === "Overview") return renderOverview();
    if (activeTab === "Roles & Access")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Roles & Access" />
          {user.roles.length ? (
            <div className="admin-detail-role-list">
              {user.roles.map((role) => (
                <div key={role.id}>
                  <span className="admin-tag">{sentence(role.role)}</span>
                  <small>
                    Granted {date(role.createdAt)} · {role.scopeType}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No active roles assigned." icon={ShieldCheck} />
          )}
          <p className="admin-safe-note">
            Role grants and revocations use protected backend workflows. No inline mutation is
            available in this read-only detail view.
          </p>
        </section>
      );
    if (activeTab === "Investor")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Investor Overview" />
          <DetailRow label="Portfolio assets" value={String(user.portfolioSummary.totalAssets)} />
          <DetailRow label="Open orders" value={String(user.portfolioSummary.openOrders)} />
          <DetailRow
            label="Invested"
            value={money(user.portfolioSummary.totalInvestedMinor, user.portfolioSummary.currency)}
          />
          <p className="admin-safe-note">
            Investor portfolio and trading history remain authoritative in their D13/D14 workspaces.
          </p>
        </section>
      );
    if (activeTab === "Collector")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Collector Workspace" />
          {user.collectorOverview ? (
            <>
              <DetailRow
                label="Membership"
                value={
                  user.collector?.subscription
                    ? `${user.collector.subscription.plan} · ${sentence(user.collector.subscription.status)}`
                    : "No Collector membership"
                }
              />
              <DetailRow label="Submissions" value={String(user.collectorOverview.submissions)} />
              <DetailRow
                label="Active intake"
                value={String(user.collectorOverview.activeIntakes)}
              />
              <div className="admin-detail-assets">
                {user.collectorOverview.assets.map((asset) => (
                  <div className="admin-detail-asset" key={asset.id}>
                    <strong>{asset.title}</strong>
                    <small>{asset.units} units</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <AdminEmpty
              detail="This user does not currently have Collector access."
              icon={Archive}
            />
          )}
        </section>
      );
    if (activeTab === "Wallet")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Wallet & Finance" />
          {user.walletSummary ? (
            <>
              <DetailRow
                label="Available"
                value={money(user.walletSummary.availableMinor, user.walletSummary.currency)}
                tone="positive"
              />
              <DetailRow
                label="Reserved"
                value={money(user.walletSummary.reservedMinor, user.walletSummary.currency)}
                tone="warning"
              />
              <DetailRow
                label="Pending"
                value={money(user.walletSummary.pendingMinor, user.walletSummary.currency)}
                tone="info"
              />
              <p className="admin-safe-note">
                Ledger history is immutable and financial corrections must use the
                compensating-entry workflow.
              </p>
            </>
          ) : (
            <AdminEmpty
              detail="Wallet information is temporarily unavailable."
              icon={WalletCards}
            />
          )}
        </section>
      );
    if (activeTab === "Orders")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Orders & Executions" />
          {user.recentOrders.length ? (
            <div className="admin-record-list">
              {user.recentOrders.map((order) => (
                <article className="admin-record" key={order.id}>
                  <span
                    className={`admin-order-side admin-order-side--${order.side.toLowerCase()}`}
                  >
                    {sentence(order.side)}
                  </span>
                  <div className="min-w-0">
                    <strong>{order.assetTitle}</strong>
                    <small>
                      {order.units} shares @ {money(order.limitPriceMinor, order.currency)} ·{" "}
                      {date(order.updatedAt)}
                    </small>
                  </div>
                  <span className="admin-record-status">{sentence(order.status)}</span>
                </article>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No orders for this user." icon={WalletCards} />
          )}
        </section>
      );
    if (activeTab === "Compliance")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Compliance" />
          <DetailRow
            label="KYC"
            value={sentence(user.complianceSummary.kycStatus)}
            tone="positive"
          />
          <DetailRow
            label="KYT"
            value={sentence(user.complianceSummary.kytStatus)}
            tone="positive"
          />
          <DetailRow label="Provider" value={user.complianceSummary.provider ?? "Unavailable"} />
          <DetailRow label="Cases" value={String(user.complianceSummary.caseCount)} />
          <p className="admin-safe-note">
            Provider truth is preserved; sensitive evidence and secrets are not exposed.
          </p>
        </section>
      );
    if (activeTab === "Support")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Support" />
          <AdminEmpty
            detail="Support ticket metrics are not connected to Admin User Detail."
            icon={LifeBuoy}
          />
        </section>
      );
    if (activeTab === "Activity" || activeTab === "Audit")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title={activeTab} />
          {user.activitySnapshot.length ? (
            <div className="admin-record-list">
              {user.activitySnapshot.map((activity) => (
                <article className="admin-record" key={activity.id}>
                  <Activity aria-hidden="true" />
                  <div className="min-w-0">
                    <strong>{sentence(activity.action)}</strong>
                    <small>
                      {activity.resourceType} · {date(activity.occurredAt)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <AdminEmpty
              detail={`No ${activeTab.toLowerCase()} records are available for this user.`}
              icon={FileClock}
            />
          )}
        </section>
      );
    return null;
  };
  return (
    <div className="admin-console-content admin-user-detail-content">
      <button type="button" className="admin-back-link" onClick={back}>
        <ChevronLeft aria-hidden="true" /> Users &amp; Accounts
      </button>
      <section className="admin-user-detail-heading">
        <div>
          <p className="admin-console-eyebrow">Users &amp; Accounts · User Detail</p>
          <h2>{user.displayName}</h2>
          <span>
            {user.username ? `@${user.username}` : "Username unavailable"} ·{" "}
            {sentence(user.primaryType)} · Member since {date(user.createdAt)}
          </span>
        </div>
        <div className="admin-user-detail-actions">
          <span
            className={`admin-status-pill admin-status-pill--${user.accountStatus.toLowerCase()}`}
          >
            {sentence(user.accountStatus)}
          </span>
          <button type="button" className="admin-inline-action" onClick={() => setTab("Audit")}>
            View audit log <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </section>
      <section className="admin-panel admin-user-identity-card">
        <div className="admin-user-identity-avatar">{initials(user.displayName)}</div>
        <div>
          <h3>Contact</h3>
          <p>{user.email}</p>
          <p>{user.identity.phone ?? "Phone unavailable"}</p>
          <p>{user.identity.country ?? "Country unavailable"}</p>
        </div>
        <div>
          <h3>Account info</h3>
          <p>User ID · {shortId(user.id)}</p>
          <p>{user.username ? `@${user.username}` : "Username unavailable"}</p>
          <p>
            Discord ·{" "}
            {user.identity.discord.connected
              ? `Connected${user.identity.discord.username ? ` · ${user.identity.discord.username}` : ""}`
              : "Not connected"}
          </p>
          <p>2FA · {user.identity.twoFactorEnabled ? "Enabled" : "Disabled"}</p>
        </div>
        <div>
          <h3>KYC / Compliance</h3>
          <p>KYC · {sentence(user.complianceSummary.kycStatus)}</p>
          <p>KYT · {sentence(user.complianceSummary.kytStatus)}</p>
          <p>
            Last review ·{" "}
            {user.complianceSummary.lastReviewAt
              ? date(user.complianceSummary.lastReviewAt)
              : "Unavailable"}
          </p>
        </div>
        <div>
          <h3>Membership</h3>
          <p>
            {user.collector?.subscription
              ? user.collector.subscription.plan
              : "No Collector membership"}
          </p>
          <p>{user.collector?.subscription ? sentence(user.collector.subscription.status) : "—"}</p>
        </div>
      </section>
      <nav className="admin-tabs admin-user-detail-tabs" aria-label="User detail sections">
        {tabs.map((item) => (
          <button
            type="button"
            className={activeTab === item ? "is-active" : ""}
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="admin-user-detail-main">
        <main>{renderTab()}</main>
        <aside className="admin-user-detail-rail">
          <section className="admin-panel">
            <AdminPanelHeading title="User Actions" />
            <button
              type="button"
              className="admin-detail-action"
              onClick={() => user.collectorOverview && setTab("Collector")}
              disabled={!user.collectorOverview}
            >
              <Archive aria-hidden="true" /> View Collector Workspace
            </button>
            <button
              type="button"
              className="admin-detail-action"
              onClick={() => setTab("Roles & Access")}
            >
              <ShieldCheck aria-hidden="true" /> View Roles &amp; Access
            </button>
            <button type="button" className="admin-detail-action" onClick={() => setTab("Audit")}>
              <FileClock aria-hidden="true" /> View Audit Log
            </button>
            <p className="admin-safe-note">
              High-risk actions require their protected backend workflow and are not performed
              inline.
            </p>
          </section>
          <section className="admin-panel">
            <AdminPanelHeading
              title="Activity Snapshot"
              action="View all"
              onClick={() => setTab("Activity")}
            />
            {user.activitySnapshot.length ? (
              user.activitySnapshot.slice(0, 5).map((activity) => (
                <div className="admin-activity-row" key={activity.id}>
                  <Activity aria-hidden="true" />
                  <span>{sentence(activity.action)}</span>
                  <small>{date(activity.occurredAt)}</small>
                </div>
              ))
            ) : (
              <AdminEmpty detail="No recent activity." icon={Clock3} />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning" | "info";
}) {
  return (
    <div className="admin-detail-row">
      <span>{label}</span>
      <strong className={tone ? `is-${tone}` : ""}>{value}</strong>
    </div>
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
