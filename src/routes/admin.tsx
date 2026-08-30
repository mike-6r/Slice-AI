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
  Download,
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
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { logout } from "@/auth/actions";
import { canAccessAdmin } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { Wordmark } from "@/components/layout/MainNavigation";
import { AdminCollectibleDetail } from "@/components/admin/AdminCollectibleDetail";
import { AdminCollectibleCatalogue } from "@/components/admin/AdminCollectibleCatalogue";
import { AdminAssetOperations } from "@/components/admin/AdminAssetOperations";
import { AdminAssetOperationsDetail } from "@/components/admin/AdminAssetOperationsDetail";
import { AdminMemberships } from "@/components/admin/AdminMemberships";
import { AdminMembershipDetail } from "@/components/admin/AdminMembershipDetail";
import { AdminFinanceTrading } from "@/components/admin/AdminFinanceTrading";
import { AdminTrustSupport } from "@/components/admin/AdminTrustSupport";
import { AdminPlatformOperations } from "@/components/admin/AdminPlatformOperations";
import { AdminReviewMedia } from "@/components/admin/AdminReviewMedia";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  compactAdminAccountFilters,
  normalizeAdminSearch,
  operationsTab,
  pipelineSection,
  type AdminSearch,
  type AdminSection,
} from "./-admin-route-state";
import type { AssetOperationSummary, SubmissionReviewQueueResponse } from "@/domain/submission";
import type {
  AdminAccountsSummary,
  AdminComplianceCase,
  AdminOverview,
  AdminIntakeRow,
  AdminIntakeResponse,
  AdminOperationsOverview,
  AdminUserDetail,
  AdminUserSummary,
} from "@/data/repositories";

export const Route = createFileRoute("/admin")({
  validateSearch: normalizeAdminSearch,
  head: () => ({ meta: [{ title: "Admin Console | Slice" }] }),
  component: AdminPage,
});

type AdminNavItem = { id: AdminSection; label: string; icon: typeof LayoutDashboard };

const navItems: AdminNavItem[] = [
  { id: "control", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Accounts", icon: Users },
  { id: "moderation", label: "Review Queue", icon: ClipboardCheck },
  { id: "intake", label: "Physical Intake", icon: Inbox },
  { id: "collectibles", label: "Collectibles", icon: Tag },
  { id: "assetOperations", label: "Asset Operations", icon: Gauge },
  { id: "memberships", label: "Memberships", icon: Crown },
  { id: "payments", label: "Finance & Trading", icon: WalletCards },
  { id: "support", label: "Trust & Support", icon: LifeBuoy },
  { id: "health", label: "Platform Operations", icon: HeartPulse },
];

const adminNavGroups: Array<{ label: string; items: AdminNavItem[] }> = [
  { label: "Workspace", items: navItems.slice(0, 1) },
  { label: "Operations", items: navItems.slice(1, 6) },
  { label: "Business", items: navItems.slice(6, 9) },
  { label: "Platform", items: navItems.slice(9) },
];

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
    membership: selectedMembership,
    intake: selectedIntake,
    intakeTab,
    q: reviewQuery,
    plan: membershipPlan,
    type: trustTypeParam,
    priority: reviewPriority,
    status: reviewStatus,
    evidence: reviewEvidence,
    research: reviewResearch,
    readiness: reviewReadiness,
    reviewer: reviewReviewer,
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
    fixture: intakeFixture,
    billing: membershipBilling,
    usage: membershipUsage,
    needsAction: membershipNeedsAction,
    category: operationsCategory,
    catalogueCategory,
    grader: operationsGrader,
    physicalState: cataloguePhysicalState,
    verification: catalogueVerification,
    valuation: catalogueValuation,
    market: catalogueMarket,
    grading: catalogueGrading,
    collector: catalogueCollector,
    accountQ,
    accountType,
    accountStatus,
    accountMembershipPlan,
    accountMembershipStatus,
    accountFinancialState,
    accountComplianceState,
    accountPayoutState,
    accountRole,
    accountAttention,
    accountFixture,
    accountJoinedFrom,
    accountJoinedTo,
    accountLastActive,
    accountSort: accountSortParam,
    accountPage: accountPageParam,
    priority: operationsPriority,
  } = Route.useSearch();
  const { user: selectedUser } = Route.useSearch();
  const membershipStatus = [
    "INCOMPLETE",
    "ACTIVE",
    "PAST_DUE",
    "CANCELLED",
    "CANCEL_AT_PERIOD_END",
    "TRIALING",
    "SUSPENDED",
    "EXPIRED",
  ].includes(reviewStatus ?? "")
    ? reviewStatus
    : undefined;
  const membershipPlanFilter = ["STARTER", "PRO", "ELITE"].includes(membershipPlan ?? "")
    ? membershipPlan
    : undefined;
  const financeTabs = [
    "wallets",
    "movements",
    "orders",
    "executions",
    "reconciliation",
    "adjustments",
  ];
  const financeTab = financeTabs.includes(selectedUserTab ?? "") ? selectedUserTab! : "wallets";
  const financeStatuses: Record<string, string[]> = {
    wallets: ["ACTIVE", "FROZEN", "CLOSED"],
    movements: [
      "CREATED",
      "PENDING_PROVIDER",
      "PROCESSING",
      "SETTLED",
      "FAILED",
      "CANCELLED",
      "REVERSED",
      "MANUAL_REVIEW",
      "HELD",
    ],
    orders: [
      "PENDING_RESERVATION",
      "OPEN",
      "PARTIALLY_FILLED",
      "FILLED",
      "CANCELLED",
      "EXPIRED",
      "REJECTED",
    ],
    executions: ["SETTLED", "FAILED"],
    reconciliation: ["RECONCILED", "MISMATCH"],
    adjustments: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "APPLIED", "REJECTED"],
  };
  const financeStatus = financeStatuses[financeTab]?.includes(reviewStatus ?? "")
    ? reviewStatus
    : undefined;
  const trustTabs = ["compliance", "restrictions", "tickets", "escalations"];
  const trustTab = trustTabs.includes(selectedUserTab ?? "") ? selectedUserTab! : "compliance";
  const trustStatuses: Record<string, string[]> = {
    compliance: ["PENDING", "REVIEW", "MANUAL_REVIEW", "SUSPENDED"],
    restrictions: ["ACTIVE", "RELEASED"],
    tickets: [
      "OPEN",
      "CLAIMED",
      "WAITING_USER",
      "WAITING_STAFF",
      "ESCALATED",
      "RESOLVED",
      "CLOSED",
    ],
    escalations: ["ESCALATED"],
  };
  const trustStatus = trustStatuses[trustTab]?.includes(reviewStatus ?? "")
    ? reviewStatus
    : undefined;
  const trustType =
    trustTab === "compliance" && ["KYC", "KYT"].includes(trustTypeParam ?? "")
      ? trustTypeParam
      : undefined;
  const trustPriority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(reviewPriority ?? "")
    ? reviewPriority
    : undefined;
  const platformTabs = [
    "health",
    "jobs",
    "webhooks",
    "integrations",
    "audit",
    "feature-flags",
    "settings",
  ];
  const platformTab = platformTabs.includes(selectedUserTab ?? "") ? selectedUserTab! : "health";
  const platformStatuses: Record<string, string[]> = {
    jobs: ["PENDING", "PROCESSING", "DELIVERED", "FAILED", "DEAD_LETTER"],
    webhooks: ["ACCEPTED", "PROCESSING", "PROCESSED", "FAILED", "REJECTED"],
    integrations: [
      "Operational",
      "Degraded",
      "Unavailable",
      "Unknown",
      "BETA_DISABLED",
      "NOT_CONFIGURED",
    ],
  };
  const platformStatus = platformStatuses[platformTab]?.includes(reviewStatus ?? "")
    ? reviewStatus
    : undefined;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [accountSearchInput, setAccountSearchInput] = useState(accountQ ?? "");
  const [accountSearch, setAccountSearch] = useState(accountQ ?? "");
  const [accountPage, setAccountPage] = useState(Math.max(1, Number(accountPageParam ?? 1)));
  const [accountPageSize, setAccountPageSize] = useState<10 | 25 | 50 | 100>(10);
  const [accountSort, setAccountSort] = useState(accountSortParam ?? "joined");
  const [accountSortDirection, setAccountSortDirection] = useState<"asc" | "desc">("desc");
  const [accountFilters, setAccountFilters] = useState({
    type: accountType ?? "",
    status: accountStatus ?? "",
    membershipPlan: accountMembershipPlan ?? "",
    membershipStatus: accountMembershipStatus ?? "",
    financialState: accountFinancialState ?? "",
    complianceState: accountComplianceState ?? "",
    payoutState: accountPayoutState ?? "",
    attention: accountAttention ?? "",
    fixture: accountFixture ?? "",
    role: accountRole ?? "",
    joinedFrom: accountJoinedFrom ?? "",
    joinedTo: accountJoinedTo ?? "",
    lastActiveWindow: accountLastActive ?? "",
  });
  const [accountDraft, setAccountDraft] = useState(accountFilters);
  const [accountFiltersOpen, setAccountFiltersOpen] = useState(false);
  const [complianceFilter, setComplianceFilter] = useState("All");
  const [selectedComplianceCase, setSelectedComplianceCase] = useState<string | undefined>();
  const [reviewSearchInput, setReviewSearchInput] = useState(reviewQuery ?? "");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = accountSearchInput.trim();
      setAccountSearch(next);
      if (next === accountQ) return;
      void navigate({
        search: (current) => ({ ...current, accountQ: next || undefined, accountPage: "1" }),
        replace: true,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [accountQ, accountSearchInput, navigate]);
  useEffect(() => {
    const nextFilters = {
      type: accountType ?? "",
      status: accountStatus ?? "",
      membershipPlan: accountMembershipPlan ?? "",
      membershipStatus: accountMembershipStatus ?? "",
      financialState: accountFinancialState ?? "",
      complianceState: accountComplianceState ?? "",
      payoutState: accountPayoutState ?? "",
      attention: accountAttention ?? "",
      fixture: accountFixture ?? "",
      role: accountRole ?? "",
      joinedFrom: accountJoinedFrom ?? "",
      joinedTo: accountJoinedTo ?? "",
      lastActiveWindow: accountLastActive ?? "",
    };
    setAccountSearchInput(accountQ ?? "");
    setAccountSearch(accountQ ?? "");
    setAccountPage(Math.max(1, Number(accountPageParam ?? 1)));
    setAccountSort(accountSortParam ?? "joined");
    setAccountSortDirection(accountSortParam === "username" ? "asc" : "desc");
    setAccountFilters(nextFilters);
    setAccountDraft(nextFilters);
  }, [
    accountAttention,
    accountComplianceState,
    accountFinancialState,
    accountFixture,
    accountJoinedFrom,
    accountJoinedTo,
    accountLastActive,
    accountMembershipPlan,
    accountMembershipStatus,
    accountPageParam,
    accountPayoutState,
    accountQ,
    accountRole,
    accountSortParam,
    accountStatus,
    accountType,
  ]);
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
      reviewReadiness,
      reviewReviewer,
      reviewSubmittedFrom,
      reviewSubmittedTo,
      reviewSort,
      reviewSortDirection,
      reviewPageParam,
      reviewPageSizeParam,
      intakeFixture,
      operationsGrader,
    ],
    queryFn: () =>
      services.repositories.reviews.listQueue(
        section === "moderation"
          ? {
              q: reviewQuery,
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
              readiness: ["READY", "NEEDS_EVIDENCE", "MANUAL_REVIEW", "BLOCKED"].includes(
                reviewReadiness ?? "",
              )
                ? (reviewReadiness as "READY" | "NEEDS_EVIDENCE" | "MANUAL_REVIEW" | "BLOCKED")
                : undefined,
              priority: ["high", "medium", "low"].includes(reviewPriority ?? "")
                ? (reviewPriority as "high" | "medium" | "low")
                : undefined,
              reviewer: ["unclaimed", "mine", "claimed"].includes(reviewReviewer ?? "")
                ? (reviewReviewer as "unclaimed" | "mine" | "claimed")
                : undefined,
              testFixture: ["include", "only"].includes(intakeFixture ?? "")
                ? (intakeFixture as "include" | "only")
                : "exclude",
              grader: operationsGrader,
              submittedFrom: reviewSubmittedFrom,
              submittedTo: reviewSubmittedTo,
              sort: ["submitted"].includes(reviewSort ?? "")
                ? (reviewSort as "submitted")
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
      intakeFixture,
      reviewSort,
      reviewPageParam,
      selectedIntake,
    ],
    queryFn: () =>
      services.repositories.admin.listIntake(
        section === "intake"
          ? {
              q: selectedIntake ?? reviewQuery,
              status: selectedIntake ? undefined : reviewStatus,
              vaultId: selectedIntake ? undefined : intakeVault,
              carrier: selectedIntake ? undefined : intakeCarrier,
              dateFrom: selectedIntake ? undefined : intakeDateFrom,
              dateTo: selectedIntake ? undefined : intakeDateTo,
              workType: (selectedIntake
                ? "ALL"
                : ["ALL", "PRODUCTION", "DEMO_QA"].includes(intakeFixture ?? "")
                  ? intakeFixture
                  : "ALL") as "ALL" | "PRODUCTION" | "DEMO_QA",
              sort: reviewSort === "oldest-in-stage" ? "OLDEST_IN_STAGE" : "RECENTLY_UPDATED",
              page: selectedIntake ? 1 : Math.max(1, Number(reviewPageParam ?? 1)),
              pageSize: 10,
            }
          : { limit: 100 },
      ),
    enabled: section === "intake",
    staleTime: 30_000,
  });
  const memberships = useQuery({
    queryKey: [
      "admin",
      "memberships",
      reviewQuery,
      membershipPlanFilter,
      membershipStatus,
      membershipBilling,
      membershipUsage,
      intakeFixture,
      membershipNeedsAction,
      reviewPageParam,
      reviewSort,
      reviewSortDirection,
    ],
    queryFn: () =>
      services.repositories.admin.listMemberships({
        q: reviewQuery,
        plan: membershipPlanFilter,
        status: membershipStatus,
        page: Math.max(1, Number(reviewPageParam ?? 1)),
        pageSize: Math.min(100, Math.max(1, Number(reviewPageSizeParam ?? 10))),
        sort: reviewSort,
        sortDirection: reviewSortDirection === "asc" ? "asc" : "desc",
        billing: membershipBilling,
        usage: membershipUsage,
        fixture: ["NORMAL", "TEST", "ALL"].includes(intakeFixture ?? "")
          ? (intakeFixture as "NORMAL" | "TEST" | "ALL")
          : "ALL",
        needsAction: membershipNeedsAction === "true",
      }),
    enabled: section === "memberships" && !selectedMembership,
    staleTime: 30_000,
  });
  const membershipDetail = useQuery({
    queryKey: ["admin", "membership-detail", selectedMembership],
    queryFn: () => services.repositories.admin.getMembershipDetail(selectedMembership!),
    enabled: section === "memberships" && Boolean(selectedMembership),
    staleTime: 30_000,
  });
  const financeDashboard = useQuery({
    queryKey: ["admin", "finance", "dashboard"],
    queryFn: () => services.repositories.admin.getFinanceDashboard(),
    enabled: section === "payments",
    staleTime: 20_000,
  });
  const financeRecords = useQuery({
    queryKey: [
      "admin",
      "finance",
      "records",
      financeTab,
      reviewQuery,
      financeStatus,
      reviewPageParam,
      reviewPageSizeParam,
    ],
    queryFn: () =>
      services.repositories.admin.listFinanceRecords({
        tab: financeTab,
        q: reviewQuery,
        status: financeStatus,
        page: Math.max(1, Number(reviewPageParam ?? 1)),
        pageSize: Math.min(100, Math.max(1, Number(reviewPageSizeParam ?? 10))),
      }),
    enabled: section === "payments",
    staleTime: 20_000,
  });
  const trustSupportDashboard = useQuery({
    queryKey: ["admin", "trust-support", "dashboard"],
    queryFn: () => services.repositories.admin.getTrustSupportDashboard(),
    enabled: section === "support",
    staleTime: 20_000,
  });
  const trustSupportRecords = useQuery({
    queryKey: [
      "admin",
      "trust-support",
      "records",
      trustTab,
      reviewQuery,
      trustStatus,
      trustType,
      trustPriority,
      reviewPageParam,
      reviewPageSizeParam,
    ],
    queryFn: () =>
      services.repositories.admin.listTrustSupportRecords({
        tab: trustTab,
        q: reviewQuery,
        status: trustStatus,
        type: trustType,
        priority: trustPriority,
        page: Math.max(1, Number(reviewPageParam ?? 1)),
        pageSize: Math.min(100, Math.max(1, Number(reviewPageSizeParam ?? 10))),
      }),
    enabled: section === "support",
    staleTime: 20_000,
  });
  const riskOperations = useQuery({
    queryKey: ["admin", "risk-operations"],
    queryFn: () => services.repositories.admin.getRiskOperations(),
    enabled: ["control", "compliance"].includes(section),
    staleTime: 30_000,
  });
  const platformDashboard = useQuery({
    queryKey: ["admin", "platform", "dashboard"],
    queryFn: () => services.repositories.admin.getPlatformDashboard(),
    enabled: section === "health",
    staleTime: 20_000,
  });
  const platformRecords = useQuery({
    queryKey: [
      "admin",
      "platform",
      "records",
      platformTab,
      reviewQuery,
      platformStatus,
      reviewPageParam,
      reviewPageSizeParam,
    ],
    queryFn: () =>
      services.repositories.admin.listPlatformRecords({
        tab: platformTab,
        q: reviewQuery,
        status: platformStatus,
        page: Math.max(1, Number(reviewPageParam ?? 1)),
        pageSize: Math.min(100, Math.max(1, Number(reviewPageSizeParam ?? 10))),
      }),
    enabled: section === "health" && platformTab !== "health",
    staleTime: 20_000,
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
      accountPageSize,
      accountSort,
      accountSortDirection,
    ],
    queryFn: () =>
      services.repositories.admin.listUsers({
        q: accountSearch || undefined,
        ...compactAdminAccountFilters(accountFilters),
        sort: accountSort,
        sortDirection: accountSortDirection,
        page: accountPage,
        pageSize: accountPageSize,
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
  const select = (next: AdminSection, tab?: string) => {
    void navigate({
      search: { section: next, user: undefined, asset: undefined, tab },
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
          {adminNavGroups.map((group) => (
            <div className="admin-console-nav-group" key={group.label}>
              <span className="admin-console-nav-label">{group.label}</span>
              {group.items.map(({ id, label, icon: Icon }) => (
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
            </div>
          ))}
        </nav>
        <div className="admin-console-account">
          <div className="admin-console-avatar">{initials(user.data?.profile.displayName)}</div>
          <div className="min-w-0">
            <strong>{user.data?.profile.displayName ?? "Admin account"}</strong>
            <span>{user.data?.profile.username ? `@${user.data.profile.username}` : "Admin"}</span>
          </div>
          <small>Administrator</small>
          <Link to="/portfolio">
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
      <main
        className={`admin-console-main${section === "users" ? " admin-console-main--accounts" : ""}`}
      >
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
                    search={{ section: "assetOperations", asset: result.id, tab: "overview" }}
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
          <ControlCenterRevamp
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
              grader: operationsGrader ?? "",
              status: reviewStatus ?? "",
              evidence: reviewEvidence ?? "",
              research: reviewResearch ?? "",
              readiness: reviewReadiness ?? "",
              reviewer: reviewReviewer ?? "",
              fixture: intakeFixture ?? "",
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
            fixture={intakeFixture ?? "ALL"}
            sort={reviewSort ?? "recently-updated"}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            selectedIntake={selectedIntake}
            intakeTab={intakeTab}
            openIntake={(submissionId) =>
              void navigate({
                search: (current) => ({
                  ...current,
                  section: "intake",
                  intake: submissionId,
                  intakeTab: "overview",
                }),
              })
            }
            closeIntake={() =>
              void navigate({
                search: (current) => ({ ...current, intake: undefined, intakeTab: undefined }),
              })
            }
            selectIntakeTab={(nextTab) =>
              void navigate({
                search: (current) => ({ ...current, intakeTab: nextTab }),
                replace: true,
              })
            }
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
        ) : section === "assetOperations" && selectedAsset ? (
          <AdminAssetOperationsDetail
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
        ) : section === "collectibles" && selectedAsset ? (
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
        ) : section === "collectibles" ? (
          <AdminCollectibleCatalogue
            query={reviewQuery ?? ""}
            status={reviewStatus ?? ""}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            filters={{
              category: catalogueCategory ?? "",
              physicalState: cataloguePhysicalState ?? "",
              verification: catalogueVerification ?? "",
              valuation: catalogueValuation ?? "",
              market: catalogueMarket ?? "",
              grading: catalogueGrading ?? "",
              collector: catalogueCollector ?? "",
              fixture: (intakeFixture as "NORMAL" | "TEST" | "ALL" | undefined) ?? "NORMAL",
              sort: reviewSort ?? "updated",
            }}
            update={(patch) =>
              void navigate({
                search: (current) => {
                  if (!("category" in patch)) return { ...current, ...patch };
                  const { category, ...remainingPatch } = patch;
                  return { ...current, ...remainingPatch, catalogueCategory: category };
                },
                replace: true,
              })
            }
            onOpen={(assetId) =>
              void navigate({
                search: (current) => ({ ...current, section: "collectibles", asset: assetId }),
                replace: true,
              })
            }
          />
        ) : section === "assetOperations" ? (
          <AdminAssetOperations
            tab={selectedUserTab}
            query={reviewQuery ?? ""}
            category={operationsCategory ?? ""}
            grader={operationsGrader ?? ""}
            priority={operationsPriority ?? ""}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            update={(patch) =>
              void navigate({ search: (current) => ({ ...current, ...patch }), replace: true })
            }
          />
        ) : section === "memberships" && selectedMembership ? (
          <AdminMembershipDetail
            data={membershipDetail.data}
            loading={membershipDetail.isLoading}
            failed={membershipDetail.isError}
            retry={() => void membershipDetail.refetch()}
            back={() =>
              void navigate({
                search: (current) => ({ ...current, membership: undefined }),
                replace: true,
              })
            }
            openAccount={() =>
              void navigate({
                search: (current) => ({
                  ...current,
                  section: "users",
                  user: membershipDetail.data?.collector.id,
                  membership: undefined,
                  tab: "membership",
                }),
                replace: true,
              })
            }
            openAudit={() =>
              void navigate({
                search: (current) => ({
                  ...current,
                  section: "health",
                  tab: "audit",
                  q: selectedMembership,
                  membership: undefined,
                }),
                replace: true,
              })
            }
          />
        ) : section === "memberships" ? (
          <AdminMemberships
            data={memberships.data}
            loading={memberships.isLoading}
            failed={memberships.isError}
            retry={() => void memberships.refetch()}
            query={reviewQuery ?? ""}
            plan={membershipPlanFilter ?? ""}
            status={membershipStatus ?? ""}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            sort={reviewSort ?? "updated"}
            sortDirection={reviewSortDirection === "asc" ? "asc" : "desc"}
            billing={membershipBilling ?? ""}
            usage={membershipUsage ?? ""}
            fixture={intakeFixture ?? "ALL"}
            needsAction={membershipNeedsAction === "true"}
            selectedId={selectedMembership}
            update={(patch) =>
              void navigate({
                search: (current) => ({ ...current, ...patch }),
                replace: true,
              })
            }
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
            pageSize={accountPageSize}
            setPageSize={(value) => {
              const nextPageSize = Number(value);
              if (
                nextPageSize !== 10 &&
                nextPageSize !== 25 &&
                nextPageSize !== 50 &&
                nextPageSize !== 100
              ) {
                return;
              }
              setAccountPageSize(nextPageSize);
              setAccountPage(1);
              void navigate({
                search: (current) => ({ ...current, accountPage: "1" }),
                replace: true,
              });
            }}
            total={users.data?.total ?? 0}
            summary={users.data?.summary}
            search={accountSearchInput}
            setSearch={setAccountSearchInput}
            filters={accountFilters}
            draftFilters={accountDraft}
            setDraftFilters={(value) => setAccountDraft(value as typeof accountDraft)}
            setFilters={(value) => {
              const next = value as typeof accountFilters;
              setAccountFilters(next);
              void navigate({
                search: (current) => ({
                  ...current,
                  ...accountFilterSearch(next),
                  accountPage: "1",
                }),
                replace: true,
              });
            }}
            applyFilters={() => {
              setAccountFilters(accountDraft);
              setAccountPage(1);
              void navigate({
                search: (current) => ({
                  ...current,
                  ...accountFilterSearch(accountDraft),
                  accountPage: "1",
                }),
                replace: true,
              });
            }}
            clearFilters={() => {
              const cleared = {
                type: "",
                status: "",
                membershipPlan: "",
                membershipStatus: "",
                financialState: "",
                complianceState: "",
                payoutState: "",
                attention: "",
                fixture: "",
                role: "",
                joinedFrom: "",
                joinedTo: "",
                lastActiveWindow: "",
              };
              setAccountDraft(cleared);
              setAccountFilters(cleared);
              setAccountSearchInput("");
              setAccountPage(1);
              void navigate({
                search: (current) => ({
                  ...current,
                  ...accountFilterSearch(cleared),
                  accountQ: undefined,
                  accountPage: "1",
                }),
                replace: true,
              });
            }}
            setType={(value) => {
              const next =
                value === "SUSPENDED"
                  ? { ...accountFilters, type: "", status: "SUSPENDED" }
                  : { ...accountFilters, type: value, status: "" };
              setAccountFilters(next);
              setAccountDraft(next);
              void navigate({
                search: (current) => ({
                  ...current,
                  ...accountFilterSearch(next),
                  accountPage: "1",
                }),
                replace: true,
              });
            }}
            setPage={(value) => {
              setAccountPage(value);
              void navigate({
                search: (current) => ({ ...current, accountPage: String(value) }),
                replace: true,
              });
            }}
            sort={accountSort}
            setSort={(value) => {
              setAccountSort(value);
              setAccountSortDirection(value === "username" ? "asc" : "desc");
              void navigate({
                search: (current) => ({ ...current, accountSort: value, accountPage: "1" }),
                replace: true,
              });
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
          <AdminFinanceTrading
            dashboard={financeDashboard.data}
            records={financeRecords.data}
            dashboardLoading={financeDashboard.isLoading}
            recordsLoading={financeRecords.isLoading}
            failed={financeDashboard.isError || financeRecords.isError}
            retry={() => {
              void financeDashboard.refetch();
              void financeRecords.refetch();
            }}
            tab={financeTab}
            query={reviewQuery ?? ""}
            status={financeStatus ?? ""}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            update={(patch) =>
              void navigate({
                search: (current) => ({ ...current, ...patch }),
                replace: true,
              })
            }
          />
        ) : section === "support" ? (
          <AdminTrustSupport
            dashboard={trustSupportDashboard.data}
            records={trustSupportRecords.data}
            dashboardLoading={trustSupportDashboard.isLoading}
            recordsLoading={trustSupportRecords.isLoading}
            failed={trustSupportRecords.isError}
            retry={() => {
              void trustSupportDashboard.refetch();
              void trustSupportRecords.refetch();
            }}
            tab={trustTab}
            query={reviewQuery ?? ""}
            status={trustStatus ?? ""}
            type={trustType ?? ""}
            priority={trustPriority ?? ""}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            update={(patch) =>
              void navigate({ search: (current) => ({ ...current, ...patch }), replace: true })
            }
          />
        ) : section === "health" ? (
          <AdminPlatformOperations
            dashboard={platformDashboard.data}
            records={platformRecords.data}
            dashboardLoading={platformDashboard.isLoading}
            recordsLoading={platformRecords.isLoading}
            failed={platformDashboard.isError || platformRecords.isError}
            retry={() => {
              void platformDashboard.refetch();
              void platformRecords.refetch();
            }}
            tab={platformTab}
            query={reviewQuery ?? ""}
            status={platformStatus ?? ""}
            page={Math.max(1, Number(reviewPageParam ?? 1))}
            update={(patch) =>
              void navigate({ search: (current) => ({ ...current, ...patch }), replace: true })
            }
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
  fixture,
  sort,
  page,
  selectedIntake,
  intakeTab,
  openIntake,
  closeIntake,
  selectIntakeTab,
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
  fixture: string;
  sort: string;
  page: number;
  selectedIntake: string | undefined;
  intakeTab: string | undefined;
  openIntake: (submissionId: string) => void;
  closeIntake: () => void;
  selectIntakeTab: (tab: string) => void;
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
      fixture={fixture}
      sort={sort}
      page={page}
      selectedIntake={selectedIntake}
      intakeTab={intakeTab}
      openIntake={openIntake}
      closeIntake={closeIntake}
      selectIntakeTab={selectIntakeTab}
      updateSearch={updateSearch}
    />
  );
}

const intakeTabs = [
  ["", "All", "all"],
  ["NEEDS_ACTION", "Needs action", "needsAction"],
  ["AWAITING_DESTINATION", "Awaiting destination", "awaitingDestination"],
  ["AWAITING_SHIPMENT", "Awaiting shipment", "accepted"],
  ["AWAITING_DROP_OFF", "Awaiting drop-off", "awaitingDropOff"],
  ["IN_TRANSIT", "In transit", "shipped"],
  ["RECEIVED", "Received", "received"],
  ["VERIFICATION", "Verification", "verification"],
  ["READY", "Ready", "readyForVault"],
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
  fixture,
  sort,
  page,
  selectedIntake,
  intakeTab,
  openIntake,
  closeIntake,
  selectIntakeTab,
  updateSearch,
}: {
  data: AdminIntakeResponse | undefined;
  search: string;
  status: string;
  vault: string;
  carrier: string;
  dateFrom: string;
  dateTo: string;
  fixture: string;
  sort: string;
  page: number;
  selectedIntake: string | undefined;
  intakeTab: string | undefined;
  openIntake: (submissionId: string) => void;
  closeIntake: () => void;
  selectIntakeTab: (tab: string) => void;
  updateSearch: (next: Record<string, string | undefined>) => void;
}) {
  const services = useAppServices();
  const verificationStart = useMutation({
    mutationFn: (id: string) => services.repositories.admin.startIntakeVerification(id),
    onSuccess: () => updateSearch({ page: "1" }),
  });
  const [draftSearch, setDraftSearch] = useState(search);
  const [receiptRow, setReceiptRow] = useState<AdminIntakeRow | null>(null);
  const [demoRow, setDemoRow] = useState<AdminIntakeRow | null>(null);
  const [showDestinations, setShowDestinations] = useState(false);
  const [fixtureMode, setFixtureMode] = useState<"ALL" | "PRODUCTION" | "DEMO_QA">(
    (["ALL", "PRODUCTION", "DEMO_QA"].includes(fixture) ? fixture : "ALL") as
      "ALL" | "PRODUCTION" | "DEMO_QA",
  );
  const receiptChecklist = {
    packageReceived: true,
    correctIntakeReference: true,
    correctCollectible: true,
    visibleConditionAcceptable: true,
    tamperDamageChecked: true,
    trackingMatches: true,
  };
  const packageCondition = "UNKNOWN";
  const [approvalReason, setApprovalReason] = useState("");
  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftSearch.trim() !== search)
        updateSearch({ q: draftSearch.trim() || undefined, fixture: fixtureMode });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftSearch, search, updateSearch, fixtureMode]);
  const receipt = useMutation({
    mutationFn: (id: string) =>
      services.repositories.admin.confirmIntakeReceipt(id, {
        packageCondition,
        checklist: receiptChecklist,
      }),
    onSuccess: () => {
      setReceiptRow(null);
      updateSearch({ page: "1" });
    },
  });
  const demoIntake = useMutation({
    mutationFn: (row: AdminIntakeRow) =>
      services.repositories.admin.completeStagingDemoPhysicalIntake(row.submissionId, {
        assetId: row.assetId ?? "",
        reason:
          "Owner-demo staging simulation: canonical identity, PSA certification and grade match verified without a real shipment or production vault receipt.",
      }),
    onSuccess: () => {
      setDemoRow(null);
      updateSearch({ page: "1" });
    },
  });
  const destinationApproval = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      services.repositories.admin.setIntakeDestinationApproval(id, {
        operationallyApproved: approved,
        acceptingShipments: approved,
        acceptingInPerson: approved,
        reason: approvalReason.trim(),
      }),
    onSuccess: () => {
      setApprovalReason("");
      updateSearch({ page: "1" });
    },
  });
  const overview = data?.overview ?? {
    all: 0,
    awaitingDestination: 0,
    accepted: 0,
    awaitingDropOff: 0,
    shipped: 0,
    delivered: 0,
    received: 0,
    verification: 0,
    verified: 0,
    readyForVault: 0,
    exceptions: 0,
    needsAction: 0,
    oldestAt: null,
    oldestAtByStage: {},
  };
  const countFor = (key: (typeof intakeTabs)[number][2]) =>
    Number(overview[key as keyof typeof overview] ?? 0);
  const rows = data?.items ?? [];
  const selectedRow = selectedIntake
    ? rows.find((row) => row.submissionId === selectedIntake)
    : undefined;
  const intakeDetail = useQuery({
    queryKey: ["admin", "intake-detail", selectedIntake],
    queryFn: () => services.repositories.admin.getIntakeDetail(selectedIntake!),
    enabled: Boolean(selectedIntake),
  });
  const detailRow = intakeDetail.data?.row ?? selectedRow;
  if (selectedIntake && detailRow) {
    return (
      <PhysicalIntakeDetailPage
        row={detailRow}
        tab={intakeTab}
        onClose={closeIntake}
        onSelectTab={selectIntakeTab}
        onReceipt={() => receipt.mutate(detailRow.id)}
        onStartVerification={() => verificationStart.mutate(detailRow.id)}
        onCompleteDemoIntake={() => demoIntake.mutate(detailRow)}
        receiptPending={receipt.isPending}
        receiptFailed={receipt.isError}
        demoPending={demoIntake.isPending}
        demoFailed={demoIntake.isError}
        verificationStarting={verificationStart.isPending}
      />
    );
  }
  if (selectedIntake) {
    return (
      <AdminPageSection
        title="Physical Intake"
        detail="The requested intake could not be found in the authorized intake projection."
      >
        <section className="physical-intake-detail-not-found admin-panel">
          <p className="admin-console-eyebrow">
            {intakeDetail.isLoading ? "Loading intake" : "Intake unavailable"}
          </p>
          <h2>
            {intakeDetail.isLoading
              ? "Loading the authoritative intake detail…"
              : "That intake is no longer available in this view."}
          </h2>
          <p>
            {intakeDetail.isLoading
              ? "The detail workspace is fetching the current server-side intake projection."
              : "It may have been removed from the current authorized projection. Return to Physical Intake to choose a record from the live queue."}
          </p>
          <button type="button" className="admin-secondary-button" onClick={closeIntake}>
            Back to Physical Intake
          </button>
        </section>
      </AdminPageSection>
    );
  }
  return (
    <AdminPageSection
      title="Physical Intake"
      detail="Track incoming collectibles from approved submission through physical receipt and verification."
    >
      <div className="physical-intake-header-actions">
        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => setShowDestinations((value) => !value)}
        >
          Receiving destinations
        </button>
        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => updateSearch({ status: "EXCEPTION", page: "1" })}
        >
          View exceptions
        </button>
      </div>
      <div className="physical-intake-summary" aria-label="Intake lifecycle summary">
        {[
          ["Awaiting destination", overview.awaitingDestination, "AWAITING_DESTINATION"],
          ["Awaiting shipment", overview.accepted, "AWAITING_SHIPMENT"],
          ["Awaiting drop-off", overview.awaitingDropOff ?? 0, "AWAITING_DROP_OFF"],
          ["In transit", overview.shipped, "IN_TRANSIT"],
          ["Carrier delivered", overview.delivered, "DELIVERED_AWAITING_RECEIPT"],
          ["Received", overview.received, "RECEIVED"],
          ["Verifying", overview.verification, "VERIFICATION"],
          ["Exceptions", overview.exceptions, "EXCEPTION"],
        ].map(([label, value, stage]) => (
          <button
            type="button"
            key={label as string}
            onClick={() => updateSearch({ status: stage as string, page: "1" })}
          >
            <span>{label}</span>
            <strong>{value}</strong>
            <small>
              {label === "Exceptions"
                ? "Needs resolution"
                : data?.overview.oldestAtByStage[stage as string]
                  ? `Oldest ${age(data.overview.oldestAtByStage[stage as string]!)}`
                  : "No active work"}
            </small>
          </button>
        ))}
      </div>
      <section className="physical-intake-workbench">
        <nav className="physical-intake-tabs" aria-label="Intake stages">
          {intakeTabs.map(([value, labelText, key]) => (
            <button
              type="button"
              className={(!status && !value) || status === value ? "is-active" : ""}
              key={key}
              onClick={() => updateSearch({ status: value || undefined, page: "1" })}
            >
              <span>{labelText}</span>
              <strong>{countFor(key)}</strong>
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
              placeholder="Search collectible, collector, reference or tracking…"
            />
          </label>
          <select
            aria-label="Destination"
            value={vault}
            onChange={(event) =>
              updateSearch({ vault: event.target.value || undefined, page: "1" })
            }
          >
            <option value="">Destination: All</option>
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
          <select
            aria-label="Fixture visibility"
            value={fixtureMode}
            onChange={(event) => {
              const mode = event.target.value as "ALL" | "PRODUCTION" | "DEMO_QA";
              setFixtureMode(mode);
              updateSearch({ fixture: mode, page: "1" });
            }}
          >
            <option value="ALL">Work type: All</option>
            <option value="PRODUCTION">Work type: Production</option>
            <option value="DEMO_QA">Work type: Demo / QA</option>
          </select>
          <select
            aria-label="Sort intake"
            value={sort}
            onChange={(event) => updateSearch({ sort: event.target.value, page: "1" })}
          >
            <option value="recently-updated">Recently updated</option>
            <option value="oldest-in-stage">Oldest in stage</option>
          </select>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() =>
              updateSearch({
                status: undefined,
                vault: undefined,
                carrier: undefined,
                dateFrom: undefined,
                dateTo: undefined,
                q: undefined,
                fixture: "ALL",
                sort: "recently-updated",
                page: "1",
              })
            }
          >
            Clear filters
          </button>
        </div>
        <div className="physical-intake-date-filter">
          <label>
            Stage from{" "}
            <input
              type="date"
              value={dateFrom}
              onChange={(event) =>
                updateSearch({ dateFrom: event.target.value || undefined, page: "1" })
              }
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={dateTo}
              onChange={(event) =>
                updateSearch({ dateTo: event.target.value || undefined, page: "1" })
              }
            />
          </label>
        </div>
        {rows.length ? (
          <div className="admin-table-wrap physical-intake-table-wrap">
            <table className="admin-table physical-intake-table">
              <thead>
                <tr>
                  <th>Collectible</th>
                  <th>Collector</th>
                  <th>Stage</th>
                  <th>Destination</th>
                  <th>Shipment</th>
                  <th>Age</th>
                  <th>Issues</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PhysicalIntakeRow
                    row={row}
                    key={row.id}
                    onOpen={() => openIntake(row.submissionId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <AdminEmpty
            detail={
              search || status || vault || carrier || dateFrom || dateTo
                ? "No packages match these filters."
                : "No packages in this stage yet. Shipments will appear here when collectors provide tracking."
            }
          />
        )}
        <div className="physical-intake-pagination">
          <span>
            Showing{" "}
            {rows.length
              ? (data?.pagination.page ?? 1) * (data?.pagination.pageSize ?? 0) -
                (data?.pagination.pageSize ?? 0) +
                1
              : 0}
            –
            {Math.min(
              (data?.pagination.page ?? 0) * (data?.pagination.pageSize ?? 0),
              data?.pagination.total ?? 0,
            )}{" "}
            of {data?.pagination.total ?? 0}
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
      {showDestinations ? (
        <section className="physical-intake-destinations admin-panel">
          <div className="physical-intake-section-heading">
            <div>
              <p className="admin-console-eyebrow">Operations configuration</p>
              <h3>Receiving destinations</h3>
              <p>Only approved, operator-controlled destinations can accept the delivery methods shown.</p>
            </div>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => setShowDestinations(false)}
            >
              Close
            </button>
          </div>
          <input
            className="admin-text-input"
            value={approvalReason}
            onChange={(event) => setApprovalReason(event.target.value)}
            placeholder="Reason required for approval or pause"
            aria-label="Destination approval reason"
          />
          {data?.filters.vaults.map((item) => (
            <div className="physical-intake-destination" key={item.id}>
              <div>
                <strong>{item.displayName}</strong>
                <small>
                  {item.region}, {item.countryCode}
                </small>
              </div>
              <span
                className={
                  item.operationallyApproved && (item.acceptingShipments || item.acceptingInPerson)
                    ? "admin-status-pill is-green"
                    : "admin-status-pill is-amber"
                }
              >
                {item.operationallyApproved && (item.acceptingShipments || item.acceptingInPerson)
                  ? `${item.locationType?.replaceAll("_", " ") ?? "Approved location"} · ${[
                      item.acceptingShipments ? "Shipping" : "",
                      item.acceptingInPerson ? "In person" : "",
                    ].filter(Boolean).join(" + ")}`
                  : "Paused"}
              </span>
              <button
                type="button"
                className="admin-secondary-button"
                disabled={approvalReason.trim().length < 3 || destinationApproval.isPending}
                onClick={() =>
                  destinationApproval.mutate({
                    id: item.id,
                    approved: !(item.operationallyApproved && (item.acceptingShipments || item.acceptingInPerson)),
                  })
                }
              >
                {item.operationallyApproved && (item.acceptingShipments || item.acceptingInPerson)
                  ? "Pause intake"
                  : "Approve & resume"}
              </button>
            </div>
          ))}
        </section>
      ) : null}
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
      {demoRow ? (
        <div
          className="physical-intake-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-intake-title"
        >
          <div className="admin-panel">
            <p className="admin-console-eyebrow">Staging demo authority</p>
            <h2 id="demo-intake-title">Complete Demo Intake</h2>
            <p>
              Staging simulation only. This records a simulated receipt, verification, and custody
              state for demonstration purposes. It does not represent a real shipment or production
              vault receipt.
            </p>
            <dl>
              <div>
                <dt>Collectible</dt>
                <dd>{demoRow.title}</dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>Demo Intake Complete · Demo Verified · Demo Custody</dd>
              </div>
            </dl>
            <div className="physical-intake-modal-actions">
              <button
                type="button"
                className="admin-inline-action"
                onClick={() => setDemoRow(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={demoIntake.isPending}
                onClick={() => demoIntake.mutate(demoRow)}
              >
                {demoIntake.isPending ? "Completing…" : "Complete demo intake"}
              </button>
            </div>
            {demoIntake.isError ? (
              <p className="text-negative">
                The demo authority could not be completed. No production receipt or custody was
                recorded.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminPageSection>
  );
}

function PhysicalIntakeRow({ row, onOpen }: { row: AdminIntakeRow; onOpen: () => void }) {
  return (
    <tr>
      <td>
        <div className="physical-intake-identity">
          <PhysicalIntakeThumbnail src={row.thumbnailUrl} />
          <div>
            <strong>
              {row.title}{" "}
              {row.workType !== "PRODUCTION" ? (
                <em className="physical-intake-fixture-badge">
                  {row.workType === "OWNER_DEMO"
                    ? "DEMO"
                    : row.workType === "CONTROLLED_QA"
                      ? "CONTROLLED"
                      : "TEST"}
                </em>
              ) : null}
            </strong>
            <small>
              {[row.variant, row.grader && row.grade ? `${row.grader} ${row.grade}` : row.grader]
                .filter(Boolean)
                .join(" · ") ||
                row.category ||
                "Collectible"}
            </small>
            <small className="physical-intake-reference">
              {row.intakeReference ?? `SLICE-${shortId(row.id)}`}
            </small>
          </div>
        </div>
      </td>
      <td>
        <strong>{row.collector.displayName}</strong>
        <small>{row.collector.username ? `@${row.collector.username}` : "Collector account"}</small>
      </td>
      <td>
        <span className={`admin-status-pill physical-intake-status-${row.stage.toLowerCase()}`}>
          {row.stageLabel}
        </span>
        <small>{row.stageReason}</small>
      </td>
      <td>
        <strong>{row.vault?.displayName ?? "Destination required"}</strong>
        <small>
          {row.vault ? `${row.vault.region}, ${row.vault.countryCode}` : "Review submission"}
        </small>
        <small>{row.vault ? "Approved destination" : ""}</small>
      </td>
      <td>
        {row.shipment ? (
          <>
            <strong>{row.shipment.carrier}</strong>
            <small>{row.shipment.trackingNumber}</small>
            {safeTrackingUrl(row.shipment.carrier, row.shipment.trackingNumber) ? (
              <a
                href={
                  safeTrackingUrl(row.shipment.carrier, row.shipment.trackingNumber) ?? undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                Open tracking ↗
              </a>
            ) : null}
          </>
        ) : (
          <>
            <strong>
              {row.deliveryMethod === "IN_PERSON"
                ? "In-person drop-off"
                : row.stage === "AWAITING_DESTINATION"
                  ? "Not ready to ship"
                  : "No shipment"}
            </strong>
            <small>
              {row.deliveryMethod === "IN_PERSON"
                ? "No carrier or tracking required"
                : row.stage === "AWAITING_DESTINATION"
                  ? "Destination selection required"
                  : "Collector adds tracking"}
            </small>
          </>
        )}
      </td>
      <td>{age(row.currentStageSince)}</td>
      <td>
        {row.issues.length ? (
          <span
            className={`physical-intake-issue physical-intake-issue-${row.issues[0].severity.toLowerCase()}`}
          >
            {row.issues[0].label}
            {row.issues.length > 1 ? ` +${row.issues.length - 1}` : ""}
          </span>
        ) : (
          <span className="physical-intake-no-issue">No blockers</span>
        )}
      </td>
      <td>
        <div className="physical-intake-row-actions">
          <button type="button" className="admin-secondary-button" onClick={onOpen}>
            Open intake
          </button>
        </div>
      </td>
    </tr>
  );
}

function PhysicalIntakeThumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className="physical-intake-thumbnail-placeholder" aria-label="Preview unavailable">
        <PackageCheck />
      </span>
    );
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function PhysicalIntakeEvidence({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <p className="admin-safe-note">
        Front evidence is not available in the authorized intake projection.
      </p>
    );
  return (
    <img
      className="physical-intake-evidence"
      src={src}
      alt={`${title} front evidence`}
      onError={() => setFailed(true)}
    />
  );
}

const intakeDetailTabs = [
  ["overview", "Overview"],
  ["shipment", "Shipment"],
  ["verification", "Verification"],
  ["history", "History"],
] as const;

type IntakeDetailTab = (typeof intakeDetailTabs)[number][0];

function normalizeIntakeDetailTab(value: string | undefined): IntakeDetailTab {
  return intakeDetailTabs.some(([tab]) => tab === value) ? (value as IntakeDetailTab) : "overview";
}

function intakeWorkTypeLabel(workType: AdminIntakeRow["workType"]) {
  if (workType === "OWNER_DEMO") return "Demo";
  if (workType === "CONTROLLED_QA") return "Controlled QA";
  if (workType === "AUTOMATED_TEST") return "Automated test";
  return "Production";
}

function intakeStageTone(row: AdminIntakeRow) {
  if (row.exception || row.stage === "EXCEPTION") return "is-red";
  if (["AWAITING_DESTINATION", "AWAITING_DROP_OFF", "DELIVERED_AWAITING_RECEIPT"].includes(row.stage))
    return "is-amber";
  if (["VERIFIED", "VAULT_READY", "DEMO_CUSTODY"].includes(row.stage)) return "is-green";
  return "is-blue";
}

function intakeStepState(
  row: AdminIntakeRow,
  step: IntakeDetailTab | "destination" | "delivery" | "receipt" | "custody",
) {
  if (row.exception && step !== "history") return "blocked";
  const complete = {
    destination: Boolean(row.vault || row.demoIntake),
    shipment: row.deliveryMethod === "IN_PERSON" || Boolean(row.shipment || row.demoIntake),
    delivery: row.deliveryMethod === "IN_PERSON" || Boolean(row.shipment?.deliveredAt || row.demoIntake),
    receipt: Boolean(row.receipt || row.demoIntake),
    verification: Boolean(
      row.verification?.completedAt ||
      row.demoIntake ||
      ["VERIFIED", "VAULT_READY"].includes(row.stage),
    ),
    custody: Boolean(row.custodyStatus || row.demoIntake),
  };
  if (complete[step as keyof typeof complete]) return "complete";
  const activeStep = !complete.destination
    ? "destination"
    : !complete.shipment
      ? "shipment"
      : !complete.delivery
        ? "delivery"
        : !complete.receipt
          ? "receipt"
          : !complete.verification
            ? "verification"
            : "custody";
  return activeStep === step ? "current" : "future";
}

function IntakeDetailAction({
  row,
  onReceipt,
  onStartVerification,
  onCompleteDemoIntake,
  verificationStarting,
}: {
  row: AdminIntakeRow;
  onReceipt: () => void;
  onStartVerification: () => void;
  onCompleteDemoIntake: () => void;
  verificationStarting: boolean;
}) {
  if (row.allowedActions.includes("COMPLETE_DEMO_INTAKE"))
    return (
      <button type="button" className="button-primary" onClick={onCompleteDemoIntake}>
        Complete demo intake
      </button>
    );
  if (row.allowedActions.includes("CONFIRM_RECEIPT"))
    return (
      <button type="button" className="button-primary" onClick={onReceipt}>
        {row.deliveryMethod === "IN_PERSON" ? "Confirm in-person receipt" : "Confirm physical receipt"}
      </button>
    );
  if (row.allowedActions.includes("START_VERIFICATION"))
    return (
      <button
        type="button"
        className="button-primary"
        disabled={verificationStarting}
        onClick={onStartVerification}
      >
        {verificationStarting ? "Starting…" : "Start verification"}
      </button>
    );
  if (row.stage === "AWAITING_DESTINATION")
    return (
      <button
        type="button"
        className="button-primary"
        disabled
        title="The collector selects an approved destination from their workspace."
      >
        Await collector destination
      </button>
    );
  return null;
}

function PhysicalIntakeDetailPage({
  row,
  tab,
  onClose,
  onSelectTab,
  onReceipt,
  onStartVerification,
  onCompleteDemoIntake,
  receiptPending,
  receiptFailed,
  demoPending,
  demoFailed,
  verificationStarting,
}: {
  row: AdminIntakeRow;
  tab: string | undefined;
  onClose: () => void;
  onSelectTab: (tab: IntakeDetailTab) => void;
  onReceipt: () => void;
  onStartVerification: () => void;
  onCompleteDemoIntake: () => void;
  receiptPending: boolean;
  receiptFailed: boolean;
  demoPending: boolean;
  demoFailed: boolean;
  verificationStarting: boolean;
}) {
  const [confirmation, setConfirmation] = useState<"receipt" | "demo" | null>(null);
  const activeTab = normalizeIntakeDetailTab(tab);
  const steps = row.deliveryMethod === "IN_PERSON" ? [
    ["destination", "Destination"],
    ["delivery", "Drop-off"],
    ["receipt", "Receipt"],
    ["verification", "Verification"],
    ["custody", "Custody"],
  ] as const : [
    ["destination", "Destination"],
    ["shipment", "Shipment"],
    ["delivery", "Delivery"],
    ["receipt", "Receipt"],
    ["verification", "Verification"],
    ["custody", "Custody"],
  ] as const;
  const identity = [
    row.variant,
    row.grader && row.grade ? `${row.grader} ${row.grade}` : row.grader,
  ]
    .filter(Boolean)
    .join(" · ");
  const statusTone = intakeStageTone(row);
  const actionDescription = row.stageReason || "No further action is currently available.";
  return (
    <section className="physical-intake-detail-page" aria-label="Physical intake detail">
      <div className="physical-intake-detail-breadcrumb">
        <span>Physical Intake</span>
        <ChevronRight aria-hidden="true" />
        <strong>Intake #{row.intakeReference ?? shortId(row.id)}</strong>
      </div>
      <button type="button" className="physical-intake-back-link" onClick={onClose}>
        <ChevronLeft aria-hidden="true" /> Back to Physical Intake
      </button>

      <article className="physical-intake-detail-hero admin-panel">
        <header className="physical-intake-detail-identity">
          <PhysicalIntakeThumbnail src={row.thumbnailUrl} />
          <div>
            <div className="physical-intake-title-row">
              <h1>{row.title}</h1>
              {row.testFixture ? (
                <span className="physical-intake-fixture-badge">
                  {intakeWorkTypeLabel(row.workType)}
                </span>
              ) : null}
            </div>
            <p>{identity || row.category || "Collectible"}</p>
            {row.assetId ? <small>Asset · {shortId(row.assetId)}</small> : null}
          </div>
          <span className={`admin-status-pill ${statusTone}`}>{row.stageLabel}</span>
        </header>
        <div className="physical-intake-detail-metadata">
          <div>
            <span>Collector</span>
            <strong>{row.collector.displayName}</strong>
            {row.collector.username ? <small>@{row.collector.username}</small> : null}
          </div>
          <div>
            <span>Work type</span>
            <strong>{intakeWorkTypeLabel(row.workType)}</strong>
          </div>
          <div>
            <span>Intake ID</span>
            <strong>{row.intakeReference ?? shortId(row.id)}</strong>
          </div>
          <div>
            <span>Last updated</span>
            <strong>{date(row.updatedAt)}</strong>
          </div>
          <div>
            <span>Current stage</span>
            <strong>{row.stageLabel}</strong>
          </div>
          <div>
            <span>Delivery</span>
            <strong>{row.deliveryMethod === "IN_PERSON" ? "In-person drop-off" : "Ship to location"}</strong>
          </div>
        </div>
        <ol className="physical-intake-stepper" aria-label="Physical intake lifecycle">
          {steps.map(([step, label], index) => {
            const state = intakeStepState(row, step);
            return (
              <li className={`is-${state}`} key={step}>
                <span>{index + 1}</span>
                <strong>{label}</strong>
                <small>
                  {state === "complete"
                    ? "Complete"
                    : state === "current"
                      ? row.stageLabel
                      : state === "blocked"
                        ? "Blocked"
                        : "Not started"}
                </small>
              </li>
            );
          })}
        </ol>
      </article>

      <nav className="physical-intake-detail-tabs" aria-label="Intake detail tabs">
        {intakeDetailTabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={activeTab === value ? "is-active" : ""}
            onClick={() => onSelectTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="physical-intake-detail-layout">
        <main className="physical-intake-detail-primary">
          {activeTab === "overview" ? <IntakeOverviewTab row={row} /> : null}
          {activeTab === "shipment" ? <IntakeShipmentTab row={row} /> : null}
          {activeTab === "verification" ? <IntakeVerificationTab row={row} /> : null}
          {activeTab === "history" ? <IntakeHistoryTab row={row} /> : null}
        </main>
        <aside className="physical-intake-detail-rail">
          <section
            className={`physical-intake-next-action-card ${row.exception ? "is-blocked" : ""}`}
          >
            <p>Next action</p>
            <h2>{row.nextAction}</h2>
            <span>{actionDescription}</span>
            <IntakeDetailAction
              row={row}
              onReceipt={() => setConfirmation("receipt")}
              onStartVerification={onStartVerification}
              onCompleteDemoIntake={() => setConfirmation("demo")}
              verificationStarting={verificationStarting}
            />
            {row.stage === "AWAITING_DESTINATION" ? (
              <small>
                The collector must select an approved receiving destination from their workspace.
              </small>
            ) : null}
          </section>
          <IntakeDetailFacts row={row} statusTone={statusTone} />
          <IntakeDetailStatus row={row} />
          <section className="physical-intake-detail-card physical-intake-detail-links-card">
            <h2>Quick links</h2>
            <Link
              to="/operations/submissions"
              search={{ submission: row.submissionId, tab: "Overview" }}
            >
              View submission <span>↗</span>
            </Link>
            {row.assetId ? (
              <Link
                to="/admin"
                search={{ section: "assetOperations", asset: row.assetId, tab: "overview" }}
              >
                Open collectible <span>↗</span>
              </Link>
            ) : null}
            <Link to="/admin" search={{ section: "users", user: row.collector.id }}>
              View collector profile <span>↗</span>
            </Link>
          </section>
        </aside>
      </div>
      {confirmation ? (
        <div className="physical-intake-modal" role="dialog" aria-modal="true">
          <div className="admin-panel">
            <p className="admin-console-eyebrow">
              {confirmation === "demo" ? "Staging demo authority" : "Physical authority"}
            </p>
            <h2>{confirmation === "demo" ? "Complete Demo Intake" : "Confirm Slice receipt"}</h2>
            <p>
              {confirmation === "demo"
                ? "Staging simulation only. This uses the existing guarded demo authority and does not create a production shipment, receipt, or vault custody record."
                : row.deliveryMethod === "IN_PERSON"
                  ? "This records an authorised staff-confirmed in-person physical receipt. No carrier or tracking record is created."
                  : "This confirms that Slice has physically received the collectible. Carrier delivery alone does not confirm receipt."}
            </p>
            <div className="physical-intake-modal-actions">
              <button
                type="button"
                className="admin-inline-action"
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={confirmation === "demo" ? demoPending : receiptPending}
                onClick={() => {
                  if (confirmation === "demo") onCompleteDemoIntake();
                  else onReceipt();
                  setConfirmation(null);
                }}
              >
                {confirmation === "demo"
                  ? demoPending
                    ? "Completing…"
                    : "Complete demo intake"
                  : receiptPending
                    ? "Confirming…"
                    : "Confirm receipt"}
              </button>
            </div>
            {(confirmation === "demo" ? demoFailed : receiptFailed) ? (
              <p className="text-negative">
                The authorized intake action could not be completed. No additional frontend state
                was created.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function IntakeDetailFacts({ row, statusTone }: { row: AdminIntakeRow; statusTone: string }) {
  return (
    <section className="physical-intake-detail-card">
      <h2>Intake details</h2>
      <dl className="physical-intake-detail-facts">
        <div>
          <dt>Stage</dt>
          <dd>
            <span className={`admin-status-pill ${statusTone}`}>{row.stageLabel}</span>
          </dd>
        </div>
        <div>
          <dt>Work type</dt>
          <dd>{intakeWorkTypeLabel(row.workType)}</dd>
        </div>
        <div>
          <dt>Production work</dt>
          <dd>{row.workType === "PRODUCTION" ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Intake state</dt>
          <dd>{row.submissionStatus === "APPROVED" ? "Open" : sentence(row.submissionStatus)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{row.deliveryMethod === "IN_PERSON" ? "In-person drop-off" : "Shipment"}</dd>
        </div>
        {row.demoIntake ? (
          <div>
            <dt>Demo authority</dt>
            <dd>Simulated only</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function IntakeDetailStatus({ row }: { row: AdminIntakeRow }) {
  return (
    <section className="physical-intake-detail-card">
      <h2>Current status</h2>
      <dl className="physical-intake-detail-facts">
        <div>
          <dt>Blockers</dt>
          <dd>{row.issues.length ? row.issues.map((issue) => issue.label).join(", ") : "None"}</dd>
        </div>
        <div>
          <dt>Waiting on</dt>
          <dd>{row.nextActor === "NONE" ? "No one" : sentence(row.nextActor)}</dd>
        </div>
        <div>
          <dt>Time in current stage</dt>
          <dd>{age(row.currentStageSince)}</dd>
        </div>
      </dl>
    </section>
  );
}

function IntakeOverviewTab({ row }: { row: AdminIntakeRow }) {
  const destinationConfirmed = Boolean(row.vault || row.demoIntake);
  return (
    <>
      <section className="physical-intake-workflow-card admin-panel">
        <header>
          <PackageCheck aria-hidden="true" />
          <h2>Receiving destination</h2>
        </header>
        <div className="physical-intake-workflow-split">
          <div className="physical-intake-empty-workflow">
            <Truck aria-hidden="true" />
            <h3>{destinationConfirmed ? "Destination confirmed" : "No destination confirmed"}</h3>
            <p>
              {destinationConfirmed
                ? "The authoritative receiving destination is shown here."
                : "A receiving destination must be confirmed before shipping instructions can be issued."}
            </p>
            {destinationConfirmed ? (
              <strong>{row.demoIntake?.destinationLabel ?? row.vault?.displayName}</strong>
            ) : (
              <button type="button" className="admin-secondary-button" disabled>
                Await collector destination
              </button>
            )}
          </div>
          <div className="physical-intake-destination-summary">
            <p>Receiving destination</p>
            {row.vault ? (
              <>
                <strong>{row.vault.displayName}</strong>
                <span>
                  {row.vault.region}, {row.vault.countryCode}
                </span>
              </>
            ) : row.demoIntake ? (
              <>
                <strong>{row.demoIntake.destinationLabel}</strong>
                <span>Staging simulation only</span>
              </>
            ) : (
              <span>The collector has not selected an approved destination yet.</span>
            )}
          </div>
        </div>
      </section>
      <IntakeShipmentCard row={row} />
      <IntakeReceiptCard row={row} />
    </>
  );
}

function IntakeShipmentCard({ row }: { row: AdminIntakeRow }) {
  const shipment = row.shipment;
  return (
    <section className="physical-intake-workflow-card admin-panel">
      <header>
        <Truck aria-hidden="true" />
        <h2>{row.deliveryMethod === "IN_PERSON" ? "In-person drop-off" : "Shipment"}</h2>
      </header>
      <div className="physical-intake-shipment-card">
        <div>
          <strong>
            {row.deliveryMethod === "IN_PERSON"
              ? "Awaiting in-person drop-off"
              : shipment
              ? sentence(shipment.status)
              : row.vault
                ? "Awaiting shipment"
                : "Waiting for destination"}
          </strong>
          <p>
            {row.deliveryMethod === "IN_PERSON"
              ? "The collector will bring the collectible directly to the approved location. No carrier or tracking number is required."
              : shipment
              ? "Carrier and tracking are shown from the authoritative intake record."
              : row.vault
                ? "The collector has not provided tracking yet."
                : "Shipping instructions will be available once a destination is confirmed."}
          </p>
        </div>
        {row.deliveryMethod === "IN_PERSON" ? null : <dl>
          <div>
            <dt>Carrier</dt>
            <dd>{shipment?.carrier ?? "—"}</dd>
          </div>
          <div>
            <dt>Tracking number</dt>
            <dd>{shipment?.trackingNumber ?? "—"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{shipment ? sentence(shipment.status) : "Not started"}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{row.carrierState?.lastUpdatedAt ? date(row.carrierState.lastUpdatedAt) : "—"}</dd>
          </div>
        </dl>}
      </div>
    </section>
  );
}

function IntakeReceiptCard({ row }: { row: AdminIntakeRow }) {
  return (
    <section className="physical-intake-workflow-card admin-panel">
      <header>
        <PackageCheck aria-hidden="true" />
        <h2>Physical receipt</h2>
      </header>
      <div className="physical-intake-shipment-card">
        <div>
          <strong>
            {row.receipt
              ? "Received by Slice"
              : row.demoIntake
                ? "Demo receipt recorded"
                : "Not received"}
          </strong>
          <p>
            {row.receipt
              ? "Physical receipt has been recorded by an authorized Slice operator."
              : row.demoIntake
                ? "This is a staging-only simulated receipt, not a production custody record."
                : "This item has not been physically received by Slice staff."}
          </p>
        </div>
        <dl>
          <div>
            <dt>Received by</dt>
            <dd>{row.receipt ? shortId(row.receipt.confirmedById) : "—"}</dd>
          </div>
          <div>
            <dt>Received at</dt>
            <dd>
              {row.receipt
                ? date(row.receipt.confirmedAt)
                : row.demoIntake
                  ? date(row.demoIntake.simulatedReceiptAt)
                  : "—"}
            </dd>
          </div>
          <div>
            <dt>Package condition</dt>
            <dd>—</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>—</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function IntakeShipmentTab({ row }: { row: AdminIntakeRow }) {
  return (
    <>
      <IntakeOverviewTab row={row} />
    </>
  );
}

function IntakeVerificationTab({ row }: { row: AdminIntakeRow }) {
  const verification = row.verification;
  const checks = [
    ["Identity comparison", verification?.identityMatch],
    ["Certification comparison", verification?.certificationMatch],
    ["Grade comparison", verification?.gradeMatch],
    ["Variant comparison", verification?.variantMatch],
  ] as const;
  return (
    <section className="physical-intake-workflow-card admin-panel">
      <header>
        <ShieldCheck aria-hidden="true" />
        <h2>Verification</h2>
      </header>
      <div className="physical-intake-verification-layout">
        <div>
          <p className="admin-console-eyebrow">Verification status</p>
          <h3>{verification ? sentence(verification.status) : "Not started"}</h3>
          <p>
            {verification?.note ??
              "No verification note is available in the authorized intake projection."}
          </p>
          <dl className="physical-intake-check-list">
            {checks.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={value === true ? "is-pass" : value === false ? "is-fail" : ""}>
                  {value === true ? "Match" : value === false ? "Mismatch" : "Not recorded"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="admin-console-eyebrow">Evidence</p>
          <PhysicalIntakeEvidence src={row.thumbnailUrl} title={row.title} />
          <p className="admin-safe-note">
            Evidence is private and shown only to authorized operators.
          </p>
        </div>
      </div>
    </section>
  );
}

function IntakeHistoryTab({ row }: { row: AdminIntakeRow }) {
  if (!row.custodyHistory.length)
    return (
      <section className="physical-intake-workflow-card admin-panel">
        <header>
          <Clock3 aria-hidden="true" />
          <h2>Intake history</h2>
        </header>
        <div className="physical-intake-empty-history">
          <p>No intake-specific audit history is available in the authorized projection.</p>
        </div>
      </section>
    );
  return (
    <section className="physical-intake-workflow-card admin-panel">
      <header>
        <Clock3 aria-hidden="true" />
        <h2>Intake history</h2>
      </header>
      <ol className="physical-intake-history-list">
        {row.custodyHistory
          .slice()
          .reverse()
          .map((event) => (
            <li key={`${event.action}-${event.occurredAt}`}>
              <span aria-hidden="true" />
              <div>
                <strong>{sentence(event.action)}</strong>
                <small>
                  {event.actorUserId ? `Actor ${shortId(event.actorUserId)} · ` : ""}
                  {date(event.occurredAt)}
                </small>
                {event.metadata ? (
                  <details>
                    <summary>Technical detail</summary>
                    <code>{JSON.stringify(event.metadata)}</code>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
      </ol>
    </section>
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
  select: (section: AdminSection, tab?: string) => void;
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
      <section className="admin-console-heading admin-console-heading--overview">
        <div>
          <p className="admin-console-eyebrow">Control Center</p>
          <h2>Monitor Slice safely.</h2>
          <span>
            A calm view of what needs a decision, what is moving, and what is healthy across the
            platform.
          </span>
        </div>
        <div className="admin-overview-heading-meta">
          <span className="admin-live-badge">
            <CheckCircle2 aria-hidden="true" /> Beta operations
          </span>
          <small>
            {operational?.generatedAt
              ? `Projection refreshed ${date(operational.generatedAt)}`
              : "Waiting for first projection"}
          </small>
        </div>
      </section>
      <div className="admin-kpi-grid admin-kpi-grid--overview">
        <AdminMetric
          icon={AlertTriangle}
          label="Needs attention"
          value={operational?.kpis.needsAttention ?? 0}
          detail={`${operational?.counts.pendingReviews ?? 0} reviews · ${operational?.counts.collectorActionsWaiting ?? 0} collector actions`}
          tone={(operational?.kpis.needsAttention ?? 0) > 0 ? "warning" : "positive"}
        />
        <AdminMetric
          icon={ClipboardCheck}
          label="Pending reviews"
          value={operational?.counts.pendingReviews ?? pendingReviews}
          detail="Authorised staff decisions"
        />
        <AdminMetric
          icon={Truck}
          label="Physical intake"
          value={
            (operational?.counts.shipmentsInTransit ?? 0) +
            (operational?.counts.acceptedAwaitingVault ?? 0) +
            (operational?.counts.deliveredAwaitingReceipt ?? 0)
          }
          detail="Accepted, moving, or awaiting receipt"
        />
        <AdminMetric
          icon={WalletCards}
          label="Open orders"
          value={operational?.kpis.openOrders ?? 0}
          detail="Pending reservation or execution"
        />
      </div>
      <div className="admin-quick-actions-bar" aria-label="Quick actions">
        <span>Quick actions</span>
        <button type="button" onClick={() => select("moderation")}>
          <ClipboardCheck aria-hidden="true" /> Review queue <ArrowRight aria-hidden="true" />
        </button>
        <button type="button" onClick={() => select("intake")}>
          <Inbox aria-hidden="true" /> Intake board <ArrowRight aria-hidden="true" />
        </button>
        <button type="button" onClick={() => select("users")}>
          <Users aria-hidden="true" /> Accounts <ArrowRight aria-hidden="true" />
        </button>
        <button type="button" onClick={() => select("health", "audit")}>
          <FileClock aria-hidden="true" /> Audit log <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-panel--attention">
          <AdminPanelHeading
            title="Needs attention"
            action="Open review queue"
            onClick={() => select("moderation")}
          />
          {operational?.needsAttention.length ? (
            <div className="admin-attention-list">
              {operational.needsAttention.slice(0, 5).map((item) => (
                <AdminAttention
                  key={`${item.id}-${item.target}`}
                  type={adminAttentionLabel(item)}
                  subject={item.subject}
                  detail={`${item.reason} · ${item.age} old`}
                  tone={item.severity === "HIGH" ? "warning" : "neutral"}
                  actionLabel={item.waitingOn === "COLLECTOR" ? "View collector" : "Review"}
                  onAction={() => select(adminAttentionSection(item.target))}
                />
              ))}
            </div>
          ) : pendingReviews || attentionOperations.length ? (
            <div className="admin-attention-list">
              {reviews.slice(0, 5).map((item) => (
                <AdminAttention
                  key={item.id}
                  type="Review required"
                  subject={`Submission ${shortId(item.id)}`}
                  detail={`${sentence(item.status)} · received ${date(item.submittedAt)}`}
                  tone="warning"
                  actionLabel="Review"
                  onAction={() => select("moderation")}
                />
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No operational work is waiting right now." />
          )}
        </section>
        <section className="admin-panel admin-panel--status">
          <AdminPanelHeading title="System Status" />
          <div className="admin-status-list">
            {operational?.systemHealth.length ? (
              operational.systemHealth
                .filter((item) =>
                  ["API", "Database", "Background Jobs", "Market data", "Webhooks"].includes(
                    item.name,
                  ),
                )
                .map((item) => (
                  <StatusRow
                    key={item.name}
                    label={item.name}
                    status={item.status}
                    summary={item.summary}
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
      <section className="admin-panel admin-panel--pipeline">
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
              onClick={() => select(pipelineSection(stage.id), operationsTab(stage.id))}
            />
          ))}
        </div>
      </section>
      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-panel--activity">
          <AdminPanelHeading title="Recent Activity" />
          {operational?.recentActivity.length ? (
            <div className="admin-record-list">
              {operational.recentActivity.slice(0, 5).map((item) => (
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
        <section className="admin-panel admin-panel--cases">
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
      <div className="admin-dashboard-grid admin-dashboard-grid--two">
        <section className="admin-panel admin-panel--insight">
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
        <section className="admin-panel admin-panel--insight">
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
      </div>
    </div>
  );
}

function ControlCenterRevamp({
  loading,
  failed,
  retry,
  select,
  operational,
}: Parameters<typeof ControlCenter>[0]) {
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
  const center = operational?.controlCenter;
  if (!center)
    return (
      <AdminState
        title="Control Center projection needs refresh"
        detail="This release does not include the operational control-center projection yet."
        retry={retry}
      />
    );
  const open = (target: string) => select(controlCenterSection(target));
  const summaryCards = [
    {
      key: "needsAction",
      label: "Needs Action",
      icon: AlertTriangle,
      item: center.summary.needsAction,
    },
    {
      key: "financialRisk",
      label: "Financial Risk",
      icon: WalletCards,
      item: center.summary.financialRisk,
    },
    {
      key: "staffDecisions",
      label: "Staff Decisions",
      icon: ClipboardCheck,
      item: center.summary.staffDecisions,
    },
    {
      key: "platformIncidents",
      label: "Platform Incidents",
      icon: HeartPulse,
      item: center.summary.platformIncidents,
    },
  ] as const;
  return (
    <div className="admin-console-content admin-control-center">
      <section className="admin-console-heading admin-console-heading--overview">
        <div>
          <p className="admin-console-eyebrow">Control Center</p>
          <h2>Operate Slice with clarity.</h2>
          <span>
            A compact view of human decisions, customer-money risk, platform health, and pipeline
            pressure.
          </span>
        </div>
        <div className="admin-overview-heading-meta">
          <span className="admin-live-badge">
            <CheckCircle2 aria-hidden="true" /> Read-only projection
          </span>
          <small>Last refreshed {age(center.lastRefreshedAt)}</small>
        </div>
      </section>
      <div className="admin-quick-actions-bar" aria-label="Quick actions">
        <span>Quick actions</span>
        <button type="button" onClick={() => select("moderation")}>
          <ClipboardCheck aria-hidden="true" /> Review queue <ArrowRight aria-hidden="true" />
        </button>
        <button type="button" onClick={() => select("intake")}>
          <Inbox aria-hidden="true" /> Intake board <ArrowRight aria-hidden="true" />
        </button>
        <button type="button" onClick={() => select("users")}>
          <Users aria-hidden="true" /> Accounts <ArrowRight aria-hidden="true" />
        </button>
        <button type="button" onClick={() => select("health", "audit")}>
          <FileClock aria-hidden="true" /> Audit log <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <div className="admin-control-summary-grid">
        {summaryCards.map(({ key, label, icon: Icon, item }) => (
          <button
            type="button"
            className={`admin-control-summary admin-control-summary--${item.severity.toLowerCase()}`}
            key={key}
            onClick={() => open(item.target)}
          >
            <span className="admin-control-summary-icon">
              <Icon aria-hidden="true" />
            </span>
            <span className="admin-control-summary-copy">
              <small>{label}</small>
              <strong>{item.count ?? "—"}</strong>
              <em>{item.subtitle}</em>
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="admin-control-workspace-grid">
        <section className="admin-panel admin-control-queue">
          <AdminPanelHeading
            title="Priority work queue"
            action="View full queue"
            onClick={() => open("moderation")}
          />
          {center.priorityWork.length ? (
            <div className="admin-priority-list">
              {center.priorityWork.slice(0, 8).map((item) => (
                <article className="admin-priority-row" key={item.id}>
                  <span
                    className={`admin-priority-severity is-${item.severity.toLowerCase()}`}
                    aria-label={`${item.severity} severity`}
                  />
                  <div className="admin-priority-type">{item.type}</div>
                  <div className="admin-priority-main">
                    <strong title={item.title}>{item.title}</strong>
                    <small>{item.context}</small>
                  </div>
                  <div className="admin-priority-age">{item.age}</div>
                  <div className="admin-priority-owner">{item.owner ?? "Unassigned"}</div>
                  <button type="button" onClick={() => open(item.target)}>
                    {item.actionLabel}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No priority work is waiting." />
          )}
        </section>
        <section className="admin-panel admin-control-health">
          <AdminPanelHeading
            title="Platform health"
            action="Platform operations"
            onClick={() => open("health")}
          />
          <div className="admin-status-list">
            {center.platformHealth.length ? (
              center.platformHealth.map((item) => (
                <StatusRow
                  key={item.name}
                  label={item.name === "Payment Provider" ? "Stripe provider" : item.name}
                  status={item.status}
                  summary={item.summary}
                  icon={
                    item.name === "Database"
                      ? Database
                      : item.name === "Market data"
                        ? Globe2
                        : item.name === "Webhooks"
                          ? Activity
                          : Gauge
                  }
                />
              ))
            ) : (
              <AdminEmpty detail="Telemetry unavailable." />
            )}
          </div>
          <div className="admin-control-health-footer">
            <span>Open incidents</span>
            <strong>{center.summary.platformIncidents.count}</strong>
            <small>Projection health, not a guarantee of availability.</small>
          </div>
        </section>
      </div>
      <section className="admin-panel admin-finance-band">
        <AdminPanelHeading
          title="Financial operations · GBP"
          action="Open Finance"
          onClick={() => open("payments")}
        />
        {center.financialOperations.access === "LIMITED" ? (
          <p className="admin-finance-limited">{center.financialOperations.message}</p>
        ) : null}
        <div className="admin-finance-grid">
          <ControlFinanceMetric
            label="Customer cash liabilities"
            value={center.financialOperations.customerCashLiabilityMinor}
          />
          <ControlFinanceMetric
            label="Bacs risk-held"
            value={center.financialOperations.bacsRiskHeldMinor}
          />
          <ControlFinanceMetric
            label="Withdrawal-eligible"
            value={center.financialOperations.withdrawalEligibleMinor}
          />
          <ControlFinanceMetric
            label="Stripe available"
            value={center.financialOperations.providerAvailableMinor}
          />
          <ControlFinanceMetric
            label="Stripe pending"
            value={center.financialOperations.providerPendingMinor}
          />
          <ControlFinanceMetric
            label="Open deficits"
            value={center.financialOperations.openDeficitsMinor}
            detail={
              center.financialOperations.openDeficitsCount === null
                ? undefined
                : `${center.financialOperations.openDeficitsCount} open`
            }
          />
          <ControlFinanceMetric
            label="Returns / manual review"
            value={
              center.financialOperations.returnsManualReviewCount === null
                ? null
                : String(center.financialOperations.returnsManualReviewCount)
            }
            count
          />
          <ControlFinanceMetric
            label="Dual-control approvals"
            value={
              center.financialOperations.dualControlApprovals === null
                ? null
                : String(center.financialOperations.dualControlApprovals)
            }
            count
          />
        </div>
        {center.financialOperations.warning ? (
          <div className="admin-finance-warning">
            <AlertTriangle aria-hidden="true" /> Payout liquidity is below eligible withdrawals.{" "}
            <button type="button" onClick={() => open("payments")}>
              Open Finance <ArrowRight aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </section>
      <section className="admin-panel admin-pipeline-panel">
        <AdminPanelHeading title="Asset lifecycle pipeline" />
        <div className="admin-pipeline-detailed">
          {center.pipeline.map((stage) => (
            <button
              type="button"
              className={stage.overdueCount ? "is-bottleneck" : ""}
              key={stage.id}
              onClick={() => open(stage.target)}
            >
              <span>{stage.label}</span>
              <strong>{stage.count}</strong>
              <small>{stage.oldestAge ? `Oldest ${stage.oldestAge}` : "No active items"}</small>
              {stage.overdueCount !== null ? <em>{stage.overdueCount} overdue</em> : null}
            </button>
          ))}
        </div>
      </section>
      <div className="admin-control-lower-grid">
        <section className="admin-panel">
          <AdminPanelHeading
            title="Important activity"
            action="View audit log"
            onClick={() => open("health")}
          />
          {center.importantActivity.length ? (
            <div className="admin-control-activity-list">
              {center.importantActivity.slice(0, 6).map((item) => (
                <button type="button" key={item.id} onClick={() => open(item.target)}>
                  <Activity aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.summary}
                      {item.actor ? ` · by ${item.actor}` : ""}
                    </small>
                  </span>
                  <time>{age(item.occurredAt)}</time>
                </button>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No important recent activity." />
          )}
        </section>
        <section className="admin-panel">
          <AdminPanelHeading
            title="Open cases"
            action="Open compliance"
            onClick={() => open("compliance")}
          />
          {center.openCases.length ? (
            <div className="admin-control-cases">
              {center.openCases.slice(0, 5).map((item) => (
                <button type="button" key={item.id} onClick={() => open("compliance")}>
                  <span>
                    <small>
                      {sentence(item.type)} · {item.severity}
                    </small>
                    <strong>{item.subject}</strong>
                    <em>
                      {item.age} · {item.nextAction}
                    </em>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No open compliance cases." />
          )}
        </section>
      </div>
    </div>
  );
}

function ControlFinanceMetric({
  label,
  value,
  detail,
  count = false,
}: {
  label: string;
  value: string | null;
  detail?: string;
  count?: boolean;
}) {
  return (
    <div className="admin-finance-metric">
      <span>{label}</span>
      <strong>{value === null ? "Unavailable" : count ? value : `£${formatMinor(value)}`}</strong>
      <small>
        {detail ?? (value === null ? "Not exposed to this role" : "Authoritative projection")}
      </small>
    </div>
  );
}

type ReviewQueueFilters = {
  priority: string;
  grader: string;
  status: string;
  readiness: string;
  evidence: string;
  research: string;
  reviewer: string;
  fixture: string;
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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const items = data?.items ?? [];
  const counts = data?.counts ?? {
    all: 0,
    awaitingEvidence: 0,
    researchPending: 0,
    readyToReview: 0,
    blocked: 0,
    highPriority: 0,
    claimed: 0,
    unclaimed: 0,
  };
  const totalPages = data?.pagination.totalPages ?? 1;
  const tab =
    filters.priority === "high"
      ? "priority"
      : filters.reviewer === "claimed"
        ? "claimed"
        : filters.evidence === "missing"
          ? "evidence"
          : filters.research === "pending" || filters.research === "in_progress"
            ? "research"
            : filters.readiness === "READY"
              ? "ready"
              : "all";
  const selectTab = (next: "all" | "evidence" | "research" | "ready" | "claimed" | "priority") => {
    updateSearch({
      readiness: next === "ready" ? "READY" : undefined,
      evidence: next === "evidence" ? "missing" : undefined,
      research: next === "research" ? "pending" : undefined,
      reviewer: next === "claimed" ? "claimed" : undefined,
      priority: next === "priority" ? "high" : undefined,
      page: "1",
    });
  };
  const clearFilters = () => {
    setSearchInput("");
    updateSearch({
      q: undefined,
      priority: undefined,
      status: undefined,
      readiness: undefined,
      evidence: undefined,
      research: undefined,
      reviewer: undefined,
      fixture: undefined,
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
            Admin Console <span>/</span> Review Queue
          </p>
          <h2>Review Queue</h2>
          <p>Review submissions, verify evidence, and approve for canonicalization.</p>
        </div>
        <button type="button" className="admin-review-refresh" onClick={retry}>
          <RefreshCw aria-hidden="true" /> Refresh
        </button>
      </div>
      <div className="admin-review-kpis" aria-label="Review queue summary">
        <ReviewKpi
          icon={Inbox}
          label="Awaiting Review"
          value={counts.all}
          detail="Submissions in queue"
        />
        <ReviewKpi
          icon={CheckCircle2}
          label="Ready for Decision"
          value={counts.readyToReview}
          detail="Required checks complete"
          tone="positive"
        />
        <ReviewKpi
          icon={FileClock}
          label="Needs Evidence"
          value={counts.awaitingEvidence}
          detail="Missing required items"
          tone="warning"
        />
        <ReviewKpi
          icon={Search}
          label="Research Pending"
          value={counts.researchPending}
          detail="Reference research outstanding"
          tone="purple"
        />
        <ReviewKpi
          icon={Users}
          label="Claimed by Staff"
          value={counts.claimed}
          detail="Reviews in progress"
          tone="blue"
        />
        <ReviewKpi
          icon={AlertTriangle}
          label="High Priority"
          value={counts.highPriority}
          detail="Blocked or aged 48+ hours"
          tone="danger"
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
              active={tab === "evidence"}
              label="Needs Evidence"
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
              label="Ready"
              count={counts.readyToReview}
              onClick={() => selectTab("ready")}
            />
            <ReviewTab
              active={tab === "claimed"}
              label="Claimed"
              count={counts.claimed}
              onClick={() => selectTab("claimed")}
            />
            <ReviewTab
              active={tab === "priority"}
              label="High Priority"
              count={counts.highPriority}
              onClick={() => selectTab("priority")}
            />
          </div>
          <div className="admin-review-toolbar">
            <label className="admin-review-search">
              <Search aria-hidden="true" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by collector, card, submission ID, set, cert..."
                aria-label="Search review queue"
              />
            </label>
            <ReviewSelect
              label="Readiness"
              value={filters.readiness}
              options={[
                ["", "Readiness: All"],
                ["READY", "Ready to claim"],
                ["NEEDS_EVIDENCE", "Needs evidence"],
                ["MANUAL_REVIEW", "Claimed review"],
                ["BLOCKED", "Blocked"],
              ]}
              onChange={(value) => updateSearch({ readiness: value || undefined, page: "1" })}
            />
            <ReviewSelect
              label="Priority"
              value={filters.priority}
              options={[
                ["", "Priority: All"],
                ["high", "High"],
                ["medium", "Medium"],
                ["low", "Low"],
              ]}
              onChange={(value) => updateSearch({ priority: value || undefined, page: "1" })}
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
            <ReviewSelect
              label="Research"
              value={filters.research}
              options={[
                ["", "Research: All"],
                ["completed", "Matched"],
                ["pending", "Needs review"],
                ["unavailable", "Unavailable"],
                ["not_requested", "Not requested"],
              ]}
              onChange={(value) => updateSearch({ research: value || undefined, page: "1" })}
            />
            <ReviewSelect
              label="Reviewer"
              value={filters.reviewer}
              options={[
                ["", "Reviewer: All"],
                ["unclaimed", "Unclaimed"],
                ["mine", "Claimed by me"],
                ["claimed", "Claimed"],
              ]}
              onChange={(value) => updateSearch({ reviewer: value || undefined, page: "1" })}
            />
            <button
              type="button"
              className="admin-review-more-filters"
              aria-expanded={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden="true" /> More filters
              {Number(Boolean(filters.grader)) +
                Number(Boolean(filters.fixture)) +
                Number(Boolean(filters.status)) +
                Number(Boolean(filters.submittedFrom || filters.submittedTo)) >
              0 ? (
                <strong>
                  {Number(Boolean(filters.grader)) +
                    Number(Boolean(filters.fixture)) +
                    Number(Boolean(filters.status)) +
                    Number(Boolean(filters.submittedFrom || filters.submittedTo))}
                </strong>
              ) : null}
            </button>
            <button type="button" className="admin-review-clear-filters" onClick={clearFilters}>
              <X aria-hidden="true" /> Clear filters
            </button>
          </div>
          {moreFiltersOpen ? (
            <div className="admin-review-advanced-filters">
              <ReviewSelect
                label="Submission status"
                value={filters.status}
                options={[
                  ["", "Status: All"],
                  ["SUBMITTED", "Submitted"],
                  ["IN_REVIEW", "In review"],
                ]}
                onChange={(value) => updateSearch({ status: value || undefined, page: "1" })}
              />
              <ReviewSelect
                label="Grading company"
                value={filters.grader}
                options={[
                  ["", "Grading: All"],
                  ["PSA", "PSA"],
                  ["BGS", "BGS"],
                  ["CGC", "CGC"],
                ]}
                onChange={(value) => updateSearch({ grader: value || undefined, page: "1" })}
              />
              <ReviewSelect
                label="Demo records"
                value={filters.fixture}
                options={[
                  ["", "Production records"],
                  ["include", "Include demo"],
                  ["only", "Demo only"],
                ]}
                onChange={(value) => updateSearch({ fixture: value || undefined, page: "1" })}
              />
            </div>
          ) : null}
          <div className="admin-review-table-wrap">
            <table className="admin-review-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Row selection</span>
                  </th>
                  <th>Submission</th>
                  <th>Collector</th>
                  <th>Readiness</th>
                  <th>Evidence</th>
                  <th>Research</th>
                  <th>Reviewer</th>
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
                        <input type="checkbox" aria-label={`Select ${item.collectible.title}`} />
                      </td>
                      <td>
                        <div className="admin-review-submission-cell">
                          <span className="admin-review-thumb">
                            <AdminReviewMedia
                              src={item.thumbnailUrl}
                              alt=""
                              fallback={<small>Preview unavailable</small>}
                            />
                          </span>
                          <span>
                            <strong>{item.collectible.title}</strong>
                            <small>
                              {[
                                item.collectible.year,
                                item.collectible.set ?? item.category,
                                item.collectible.cardNumber
                                  ? `#${item.collectible.cardNumber}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                            <small>
                              {[item.collectible.grader, item.collectible.grade]
                                .filter(Boolean)
                                .join(" ") || "Ungraded"}{" "}
                              · Submission {shortId(item.submissionReference)}
                            </small>
                            {item.testFixture ? (
                              <em className="admin-review-fixture-badge">TEST / DEMO</em>
                            ) : null}
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
                        <div
                          className={`admin-review-readiness admin-review-readiness--${item.readinessState.toLowerCase()}`}
                        >
                          <strong>{reviewReadinessLabel(item.readinessState)}</strong>
                          <small>{item.readinessReason}</small>
                        </div>
                      </td>
                      <td>
                        <div
                          className={`admin-review-evidence admin-review-evidence--${item.evidence.status.toLowerCase()}`}
                        >
                          <strong>
                            {item.evidence.presentRequired} / {item.evidence.required} required
                          </strong>
                          <small>
                            {item.evidence.status === "COMPLETE"
                              ? "Complete"
                              : item.evidence.missingRequired === 1
                                ? "1 required item missing"
                                : `${item.evidence.missingRequired} required items missing`}
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
                        <div
                          className={`admin-review-reviewer admin-review-reviewer--${item.reviewer.state.toLowerCase()}`}
                        >
                          <strong>{reviewerLabel(item.reviewer)}</strong>
                          <small>{reviewerDetail(item.reviewer)}</small>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`admin-review-priority admin-review-priority--${item.priority.toLowerCase()}`}
                        >
                          {reviewPriorityLabel(item.priority)}
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
                          {reviewActionLabel(item)} <ArrowRight aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10}>
                      <AdminEmpty
                        detail={
                          searchInput ||
                          filters.priority ||
                          filters.status ||
                          filters.readiness ||
                          filters.evidence ||
                          filters.research ||
                          filters.reviewer ||
                          filters.grader ||
                          filters.fixture
                            ? "No submissions match these filters."
                            : "No submissions currently need review."
                        }
                      />
                      {searchInput ||
                      filters.priority ||
                      filters.status ||
                      filters.readiness ||
                      filters.evidence ||
                      filters.research ||
                      filters.reviewer ||
                      filters.grader ||
                      filters.fixture ? (
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
    <AdminSelect
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="admin-review-select"
    />
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

function reviewReadinessLabel(state: string) {
  return (
    {
      READY: "Ready to claim",
      NEEDS_EVIDENCE: "Needs evidence",
      MANUAL_REVIEW: "Review in progress",
      BLOCKED: "Blocked",
    }[state] ?? "Needs review"
  );
}

function reviewPriorityLabel(priority: string) {
  return (
    {
      HIGH: "High",
      MEDIUM: "Medium",
      LOW: "Low",
    }[priority] ?? "Low"
  );
}

function reviewerLabel(reviewer: SubmissionReviewQueueResponse["items"][number]["reviewer"]) {
  return (
    {
      UNCLAIMED: "Unclaimed",
      CLAIMED_BY_ME: "You",
      CLAIMED_BY_OTHER: reviewer.displayName ?? "Staff reviewer",
      SELF_REVIEW_RESTRICTED: "Self-review restricted",
    }[reviewer.state] ?? "Unclaimed"
  );
}

function reviewerDetail(reviewer: SubmissionReviewQueueResponse["items"][number]["reviewer"]) {
  return (
    {
      UNCLAIMED: "Available to claim",
      CLAIMED_BY_ME: "Continue this review",
      CLAIMED_BY_OTHER: "Claim held by staff",
      SELF_REVIEW_RESTRICTED: "Another reviewer is required",
    }[reviewer.state] ?? ""
  );
}

function reviewActionLabel(item: SubmissionReviewQueueResponse["items"][number]) {
  if (item.reviewer.state === "SELF_REVIEW_RESTRICTED") return "View";
  if (item.reviewer.state === "CLAIMED_BY_ME") return "Continue review";
  if (item.reviewer.state === "CLAIMED_BY_OTHER") return "Open review";
  if (item.readinessState === "NEEDS_EVIDENCE") return "View evidence";
  if (item.readinessState === "BLOCKED") return "Resolve blocker";
  return "Claim & review";
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
  pageSize,
  setPageSize,
  total,
  summary,
  search,
  setSearch,
  filters,
  draftFilters,
  setDraftFilters,
  applyFilters,
  clearFilters,
  setFilters,
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
  pageSize: 10 | 25 | 50 | 100;
  setPageSize: (value: string) => void;
  total: number;
  summary?: AdminAccountsSummary;
  search: string;
  setSearch: (value: string) => void;
  filters: Record<string, string>;
  draftFilters: Record<string, string>;
  setDraftFilters: (value: Record<string, string>) => void;
  applyFilters: () => void;
  clearFilters: () => void;
  setFilters: (value: Record<string, string>) => void;
  setType: (value: string) => void;
  setPage: (value: number) => void;
  sort: string;
  setSort: (value: string) => void;
  filtersOpen: boolean;
  setFiltersOpen: (value: boolean) => void;
}) {
  if (selected || selectedLoading || selectedFailed) {
    return (
      <ConsolidatedUserDetailExperience
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
  const activeFilterCount =
    Object.values(filters).filter((value) => value.trim().length > 0).length +
    (search.trim().length > 0 ? 1 : 0);
  const exportCurrentPage = () => {
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = users.map((user) => [
      user.displayName,
      user.email,
      user.username ?? "",
      uniqueRoleAssignments(user.roles)
        .filter((role) => role.role !== "USER")
        .map((role) => sentence(role.role))
        .join("; "),
      accountStatusLabel(user.accountStatus),
      financialStateLabel(user.financialState),
      complianceStateLabel(user.complianceState),
      payoutStateLabel(user.payoutState),
      user.lastActivityAt ?? "",
      user.createdAt,
    ]);
    const csv = [
      [
        "Account",
        "Email",
        "Username",
        "Access",
        "Account state",
        "Financial state",
        "Compliance",
        "Payouts",
        "Last activity",
        "Joined",
      ],
      ...rows,
    ]
      .map((row) => row.map(quote).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `slice-accounts-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginationPages = Array.from(
    new Set(
      [1, 2, 3, totalPages - 1, totalPages].filter((value) => value > 0 && value <= totalPages),
    ),
  );
  const tabActive = (value: string) =>
    value === "NEEDS_REVIEW"
      ? filters.attention === "REQUIRED"
      : value === "RESTRICTED"
        ? filters.status === "RESTRICTED"
        : value === "SUSPENDED"
          ? filters.status === "SUSPENDED"
          : filters.type === value && !filters.status;
  const selectTab = (value: string) => {
    const next = {
      ...filters,
      type: ["COLLECTOR", "INVESTOR", "STAFF", "ADMIN"].includes(value) ? value : "",
      status:
        value === "SUSPENDED" || value === "RESTRICTED"
          ? ({ SUSPENDED: "SUSPENDED", RESTRICTED: "RESTRICTED" }[value] ?? "")
          : "",
      attention: value === "NEEDS_REVIEW" ? "REQUIRED" : "",
    };
    setFilters(next);
    setDraftFilters(next);
    setPage(1);
  };
  const selectSummary = (key: string) => {
    const next = {
      ...filters,
      type: "",
      status: "",
      financialState: key === "finance" ? "EXCEPTION" : "",
      attention: key === "review" ? "REQUIRED" : "",
    };
    if (key === "restricted") next.status = "RESTRICTED";
    if (key === "suspended") next.status = "SUSPENDED";
    setFilters(next);
    setDraftFilters(next);
    setPage(1);
  };
  const cards = [
    {
      key: "total",
      label: "Total accounts",
      value: summary?.totalUsers ?? "—",
      detail: "All registered accounts",
      icon: Users,
      tone: "mint",
    },
    {
      key: "review",
      label: "Needs review",
      value: summary?.needsReview ?? "—",
      detail: "Authoritative staff attention",
      icon: Clock3,
      tone: "amber",
    },
    {
      key: "restricted",
      label: "Restricted",
      value: summary?.restricted ?? "—",
      detail: "Restricted access",
      icon: ShieldCheck,
      tone: "red",
    },
    {
      key: "finance",
      label: "Financial exceptions",
      value: summary?.financialExceptions ?? "—",
      detail:
        summary?.financialExceptions === null
          ? "Finance visibility limited"
          : "Requires financial attention",
      icon: AlertTriangle,
      tone: "amber",
    },
    {
      key: "suspended",
      label: "Suspended",
      value: summary?.suspended ?? "—",
      detail: "Suspended accounts",
      icon: UserRound,
      tone: "slate",
    },
  ] as const;
  return (
    <div className="admin-console-content admin-accounts-content admin-accounts-revamp">
      <section className="admin-console-heading admin-accounts-heading">
        <div>
          <p className="admin-console-eyebrow">Admin Console / Accounts</p>
          <h2>Accounts</h2>
          <span>Manage account access, financial state, compliance and platform permissions.</span>
        </div>
        <button type="button" className="admin-accounts-export" onClick={exportCurrentPage}>
          <Download aria-hidden="true" /> Export
        </button>
      </section>
      <section className="admin-accounts-summary-grid" aria-label="Operational account summary">
        {cards.map(({ key, label, value, detail, icon: Icon, tone }) => (
          <button
            type="button"
            className={`admin-accounts-summary-card admin-accounts-summary-card--${tone}`}
            key={key}
            onClick={() => selectSummary(key)}
            disabled={key === "finance" && summary?.financialExceptions === null}
          >
            <span className="admin-accounts-summary-icon">
              <Icon aria-hidden="true" />
            </span>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          </button>
        ))}
      </section>
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
        <section className="admin-panel admin-accounts-table-panel admin-accounts-revamp-panel">
          <div className="admin-accounts-directory-toolbar">
            <div
              className="admin-account-tabs admin-accounts-revamp-tabs"
              role="tablist"
              aria-label="Account categories"
            >
              {[
                ["", "All Accounts"],
                ["COLLECTOR", "Collectors"],
                ["INVESTOR", "Investors"],
                ["STAFF", "Staff"],
                ["ADMIN", "Admins"],
                ["NEEDS_REVIEW", "Needs Review"],
                ["RESTRICTED", "Restricted"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabActive(value)}
                  className={tabActive(value) ? "is-active" : ""}
                  key={label}
                  onClick={() => selectTab(value)}
                >
                  {label}
                  {value === "NEEDS_REVIEW" && summary?.needsReview ? (
                    <b>{summary.needsReview}</b>
                  ) : null}
                  {value === "RESTRICTED" && summary?.restricted ? (
                    <b>{summary.restricted}</b>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="admin-accounts-toolbar-actions">
              <button
                type="button"
                className="admin-clear-filters"
                disabled={activeFilterCount === 0}
                onClick={clearFilters}
              >
                <X aria-hidden="true" /> Clear filters
              </button>
              <button
                type="button"
                className="admin-filter-more"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal aria-hidden="true" /> More filters
                {activeFilterCount ? <b>{activeFilterCount}</b> : null}
              </button>
            </div>
          </div>
          <div className="admin-accounts-filter-bar">
            <label className="admin-account-search">
              <Search aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users, email, username or ID..."
              />
            </label>
            <AdminSelect
              label="Account state"
              value={draftFilters.status}
              onChange={(value) => updateDraft("status", value)}
              options={[
                ["", "Account state: All"],
                ["ACTIVE", "Active"],
                ["PENDING_REVIEW", "Pending review"],
                ["RESTRICTED", "Restricted"],
                ["SUSPENDED", "Suspended"],
              ]}
            />
            {summary?.financialExceptions !== null ? (
              <AdminSelect
                label="Financial state"
                value={draftFilters.financialState}
                onChange={(value) => updateDraft("financialState", value)}
                options={[
                  ["", "Financial state: All"],
                  ["EXCEPTION", "Financial exception"],
                  ["CLEAR", "Clear"],
                  ["BANK_CLEARING", "Bank clearing"],
                  ["MANUAL_REVIEW", "Manual review"],
                  ["FINANCIAL_DEFICIT", "Financial deficit"],
                  ["RETURNED_DEPOSIT", "Returned deposit"],
                  ["WITHDRAWAL_HOLD", "Withdrawal hold"],
                ]}
              />
            ) : null}
            <AdminSelect
              label="Compliance"
              value={draftFilters.complianceState}
              onChange={(value) => updateDraft("complianceState", value)}
              options={[
                ["", "Compliance: All"],
                ["VERIFIED", "Verified"],
                ["REVIEW_REQUIRED", "Review required"],
                ["INCOMPLETE", "Not complete"],
                ["RESTRICTED", "Restricted"],
              ]}
            />
            <AdminSelect
              label="Payouts"
              value={draftFilters.payoutState}
              onChange={(value) => updateDraft("payoutState", value)}
              options={[
                ["", "Payouts: All"],
                ["READY", "Ready"],
                ["NOT_CONFIGURED", "Not configured"],
                ["SETUP_IN_PROGRESS", "Setup in progress"],
                ["UNDER_REVIEW", "Under review"],
                ["ACTION_REQUIRED", "Action required"],
                ["RESTRICTED", "Restricted"],
              ]}
            />
            <AdminSelect
              label="Role"
              value={draftFilters.role}
              onChange={(value) => updateDraft("role", value)}
              options={[
                ["", "Role: All"],
                ["COLLECTOR", "Collector"],
                ["ADMIN", "Admin"],
                ["SUPPORT", "Support"],
                ["ASSET_REVIEWER", "Asset reviewer"],
              ]}
            />
            <AdminSelect
              label="Membership"
              value={draftFilters.membershipPlan}
              onChange={(value) => updateDraft("membershipPlan", value)}
              options={[
                ["", "Membership: All"],
                ["STARTER", "Starter"],
                ["PRO", "Pro"],
                ["ELITE", "Elite"],
              ]}
            />
          </div>
          {filtersOpen ? (
            <section
              className="admin-account-advanced-filters admin-accounts-revamp-advanced"
              aria-label="More account filters"
            >
              <div>
                <strong>More filters</strong>
                <span>Use only dimensions backed by account telemetry.</span>
              </div>
              <AdminSelect
                label="Billing status"
                value={draftFilters.membershipStatus}
                onChange={(value) => updateDraft("membershipStatus", value)}
                options={[
                  ["", "Billing: All"],
                  ["ACTIVE", "Active"],
                  ["TRIALING", "Trialing"],
                  ["PAST_DUE", "Past due"],
                  ["SUSPENDED", "Suspended"],
                  ["EXPIRED", "Expired"],
                ]}
              />
              <AdminSelect
                label="Last active"
                value={draftFilters.lastActiveWindow}
                onChange={(value) => updateDraft("lastActiveWindow", value)}
                options={[
                  ["", "Last active: Any time"],
                  ["1", "Last 24 hours"],
                  ["7", "Last 7 days"],
                  ["30", "Last 30 days"],
                  ["inactive", "Inactive 30+ days"],
                ]}
              />
              <AdminSelect
                label="Fixture"
                value={draftFilters.fixture}
                onChange={(value) => updateDraft("fixture", value)}
                options={[
                  ["", "Fixture: All"],
                  ["NORMAL", "Normal"],
                  ["DEMO", "Demo"],
                ]}
              />
              <div className="admin-date-range">
                <input
                  aria-label="Joined from"
                  type="date"
                  value={draftFilters.joinedFrom}
                  onChange={(event) => updateDraft("joinedFrom", event.target.value)}
                />
                <input
                  aria-label="Joined to"
                  type="date"
                  value={draftFilters.joinedTo}
                  onChange={(event) => updateDraft("joinedTo", event.target.value)}
                />
              </div>
              <button type="button" className="admin-apply-filters" onClick={applyFilters}>
                Apply filters
              </button>
              <button type="button" className="admin-clear-filters" onClick={clearFilters}>
                Clear all
              </button>
            </section>
          ) : null}
          <div className="admin-accounts-table-heading">
            <label>
              <span>Sort by</span>
              <AdminSelect
                label="Sort accounts"
                value={sort}
                onChange={setSort}
                options={[
                  ["joined", "Newest accounts"],
                  ["lastActive", "Recent sign-in"],
                  ["username", "Name A–Z"],
                ]}
              />
            </label>
            <span className="admin-accounts-match-count">
              {total} account{total === 1 ? "" : "s"} match the current view
            </span>
          </div>
          {users.length ? (
            <div className="admin-table-wrap admin-accounts-revamp-table-wrap">
              <table className="admin-table admin-accounts-table admin-accounts-revamp-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Access</th>
                    <th>Account state</th>
                    <th>Financial state</th>
                    <th>Compliance</th>
                    <th>Payouts</th>
                    <th>Last activity</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const activeRoles = uniqueRoleAssignments(user.roles).filter(
                      (role) => role.role !== "USER",
                    );
                    return (
                      <tr
                        key={user.id}
                        className={`admin-account-row admin-account-row--${accountTone(user)}`}
                      >
                        <td data-label="User">
                          <button
                            type="button"
                            className="admin-account-user-button"
                            onClick={() => openUser(user.id)}
                          >
                            <span className="admin-user-avatar">{initials(user.displayName)}</span>
                            <span>
                              <strong>{user.displayName}</strong>
                              <small>
                                {user.username ? `@${user.username} · ${user.email}` : user.email}
                              </small>
                              <small>ID: {shortId(user.id)}</small>
                              {user.fixture === "DEMO" ? (
                                <em className="admin-beta-badge">DEMO</em>
                              ) : null}
                            </span>
                          </button>
                        </td>
                        <td data-label="Access">
                          <div className="admin-account-access">
                            {(activeRoles.length ? activeRoles : [{ role: user.primaryType }]).map(
                              (role, index) => (
                                <span className="admin-type-badge" key={`${role.role}-${index}`}>
                                  {sentence(role.role)}
                                </span>
                              ),
                            )}
                          </div>
                        </td>
                        <td data-label="Account state">
                          <AccountStateCell
                            label={accountStatusLabel(user.accountStatus)}
                            reason={user.accountStateReason}
                            tone={accountStatusTone(user.accountStatus)}
                          />
                        </td>
                        <td data-label="Financial state">
                          <AccountStateCell
                            label={financialStateLabel(user.financialState)}
                            reason={financialStateDetail(user)}
                            tone={financialStateTone(user.financialState)}
                          />
                        </td>
                        <td data-label="Compliance">
                          <AccountStateCell
                            label={complianceStateLabel(user.complianceState)}
                            reason={user.complianceReason ? sentence(user.complianceReason) : null}
                            tone={complianceStateTone(user.complianceState)}
                          />
                        </td>
                        <td data-label="Payouts">
                          <AccountStateCell
                            label={payoutStateLabel(user.payoutState)}
                            reason={user.payoutReason}
                            tone={payoutStateTone(user.payoutState)}
                          />
                        </td>
                        <td
                          data-label="Last activity"
                          title={
                            user.lastActivityAt
                              ? new Date(user.lastActivityAt).toISOString()
                              : "No completed sign-in has been recorded."
                          }
                        >
                          {user.lastActivityAt ? (
                            <span className="admin-account-activity">
                              <strong>{relativeDate(user.lastActivityAt)}</strong>
                              <small>Signed in</small>
                            </span>
                          ) : (
                            <span className="admin-muted">No sign-in recorded</span>
                          )}
                        </td>
                        <td data-label="Joined">{fullDate(user.createdAt)}</td>
                        <td data-label="Actions">
                          <button
                            type="button"
                            className="admin-open-account admin-open-account--compact"
                            aria-label={`Open account for ${user.displayName}`}
                            onClick={() => openUser(user.id)}
                          >
                            Open <ArrowRight aria-hidden="true" />
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
                ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} accounts`
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
              {paginationPages.map((candidate, index) => (
                <Fragment key={candidate}>
                  {index > 0 && candidate - paginationPages[index - 1] > 1 ? <i>…</i> : null}
                  <button
                    type="button"
                    className={candidate === page ? "is-active" : ""}
                    aria-label={`Page ${candidate}`}
                    onClick={() => setPage(candidate)}
                  >
                    {candidate}
                  </button>
                </Fragment>
              ))}
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </span>
            <label className="admin-accounts-page-size">
              Rows per page
              <AdminSelect
                label="Rows per page"
                value={String(pageSize)}
                onChange={setPageSize}
                options={[
                  ["10", "10"],
                  ["25", "25"],
                  ["50", "50"],
                  ["100", "100"],
                ]}
              />
            </label>
          </div>
        </section>
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
    "Access",
    ...(user.primaryType === "INVESTOR" ||
    user.portfolioSummary.totalAssets ||
    user.portfolioSummary.openOrders
      ? ["Investor"]
      : []),
    "Collector",
    "Finance",
    "Compliance",
    "Activity",
    "Audit",
  ];
  const normalizedTab =
    tab === "Roles & Access" ? "Access" : tab === "Wallet" || tab === "Orders" ? "Finance" : tab;
  const activeTab = tabs.includes(normalizedTab ?? "") ? normalizedTab! : "Overview";
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
            onClick={() => setTab("Finance")}
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
          <button type="button" className="admin-detail-link" onClick={() => setTab("Finance")}>
            View finance activity <ArrowRight aria-hidden="true" />
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
    if (activeTab === "Access")
      return (
        <div className="admin-detail-overview-grid">
          <UserRoleManagement user={user} retry={retry} />
          <AccountStatusManagement user={user} retry={retry} />
        </div>
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
        <div className="admin-detail-overview-grid">
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
          <CollectorDirectoryManagement user={user} retry={retry} />
        </div>
      );
    if (activeTab === "Finance")
      return (
        <section className="admin-panel">
          <AdminPanelHeading title="Finance" />
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
              <h4 className="admin-subsection-heading">Recent orders</h4>
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
                          {order.units} ownership units ·{" "}
                          {money(order.limitPriceMinor, order.currency)} · {date(order.updatedAt)}
                        </small>
                      </div>
                      <span className="admin-record-status">{sentence(order.status)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <AdminEmpty detail="No orders recorded for this account." icon={WalletCards} />
              )}
            </>
          ) : (
            <AdminEmpty
              detail="Wallet information is temporarily unavailable."
              icon={WalletCards}
            />
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
            label="Transaction monitoring"
            value={
              user.complianceSummary.kytStatus === "UNKNOWN"
                ? "Not configured"
                : sentence(user.complianceSummary.kytStatus)
            }
          />
          <DetailRow
            label="Verification source"
            value={user.complianceSummary.provider ? "Internal verification" : "Not configured"}
          />
          <DetailRow label="Cases" value={String(user.complianceSummary.caseCount)} />
          <p className="admin-safe-note">
            Provider truth is preserved; sensitive evidence and secrets are not exposed.
          </p>
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
        <ChevronLeft aria-hidden="true" /> Accounts
      </button>
      <section className="admin-user-detail-heading admin-detail-header">
        <div className="admin-detail-identity">
          <div className="admin-user-identity-avatar">{initials(user.displayName)}</div>
          <div>
            <p className="admin-console-eyebrow">Users &amp; Accounts · Account Control Center</p>
            <h2>{user.displayName}</h2>
            <span>
              {user.username ? `@${user.username}` : "Username unavailable"} · {user.email}
            </span>
            <div className="admin-detail-chips">
              <span>{sentence(user.primaryType)}</span>
              {user.fixture === "DEMO" ? <span>Demo account</span> : null}
              <span>{user.collectorOverview ? "Collector access" : "Investor access"}</span>
              <span>Joined {date(user.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="admin-user-detail-actions">
          <span
            className={`admin-status-pill admin-status-pill--${user.accountStatus.toLowerCase()}`}
          >
            {sentence(user.accountStatus)}
          </span>
          <button
            type="button"
            className="admin-detail-action admin-detail-action--compact"
            onClick={() => setTab("Access")}
          >
            <Settings aria-hidden="true" /> Manage account
          </button>
          <button
            type="button"
            className="admin-detail-action admin-detail-action--compact"
            onClick={() => setTab("Audit")}
          >
            <FileClock aria-hidden="true" /> Audit log
          </button>
        </div>
      </section>
      <section className="admin-detail-summary" aria-label="Account summary">
        <div>
          <span>Verification</span>
          <strong>{sentence(user.complianceSummary.kycStatus)}</strong>
        </div>
        <div>
          <span>Collector</span>
          <strong>{user.collectorOverview ? "Enabled" : "Not enabled"}</strong>
        </div>
        <div>
          <span>Membership</span>
          <strong>
            {user.collector?.subscription ? user.collector.subscription.plan : "Not applicable"}
          </strong>
        </div>
        <div>
          <span>Last active</span>
          <strong>{user.lastActivityAt ? date(user.lastActivityAt) : "Not tracked"}</strong>
        </div>
        <div>
          <span>User ID</span>
          <strong title={user.id}>{shortId(user.id)}…</strong>
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
      </div>
    </div>
  );
}

function ConsolidatedUserDetailExperience({
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
  const [historyFilter, setHistoryFilter] = useState("All");
  const [historyPage, setHistoryPage] = useState(1);
  const services = useAppServices();
  const legacyTabMap: Record<string, string> = {
    Access: "Operations",
    "Roles & Access": "Operations",
    Investor: "Overview",
    Collector: "Overview",
    Finance: "Operations",
    Wallet: "Operations",
    Orders: "Operations",
    Compliance: "Operations",
    Activity: "History",
    Audit: "History",
  };
  const requestedTab = tab ? (legacyTabMap[tab] ?? tab) : "Overview";
  const activeTab = ["Overview", "Operations", "History"].includes(requestedTab)
    ? requestedTab
    : "Overview";
  const history = useQuery({
    queryKey: ["admin", "user", user?.id, "history", historyFilter, historyPage],
    queryFn: () =>
      services.repositories.admin.getUserHistory({
        id: user!.id,
        category: historyFilter.toUpperCase() as
          | "ALL"
          | "SECURITY"
          | "FINANCIAL"
          | "TRADING"
          | "COMPLIANCE"
          | "ACCOUNT"
          | "COLLECTOR"
          | "ADMIN"
          | "PROVIDER",
        page: historyPage,
        pageSize: 20,
      }),
    enabled: Boolean(user) && (activeTab === "Overview" || activeTab === "History"),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (tab && tab !== activeTab) setTab(activeTab);
  }, [activeTab, setTab, tab]);

  if (loading)
    return (
      <AdminState title="Loading account" detail="Reading identity and operational projections." />
    );
  if (failed || !user)
    return (
      <AdminState
        title="We couldn't load this account"
        detail="The account detail could not be loaded safely."
        retry={retry}
      />
    );

  const roles = uniqueRoleAssignments(user.roles);
  const money = (value: string | null, currency = "GBP") =>
    value === null
      ? "Unavailable"
      : `${currency === "GBP" ? "£" : currency + " "}${formatMinor(value)}`;
  const relative = (value: string) => {
    const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1_440)}d ago`;
  };
  const stateTone = (value: string) => {
    if (["CLEAR", "VERIFIED", "READY", "ACTIVE"].includes(value)) return "positive";
    if (["UNAVAILABLE", "UNKNOWN"].includes(value)) return "muted";
    if (["RESTRICTED", "SUSPENDED", "FINANCIAL_DEFICIT", "RETURNED_DEPOSIT"].includes(value))
      return "critical";
    return "warning";
  };
  const stateText = (value: string) =>
    value === "UNAVAILABLE"
      ? "Unavailable"
      : value === "NOT_CONFIGURED"
        ? "Not configured"
        : value === "SETUP_IN_PROGRESS"
          ? "Setup in progress"
          : value === "NOT_REQUIRED"
            ? "Not currently required"
            : sentence(value);
  const stateCell = (label: string, value: string, detail: string) => (
    <div
      className={`admin-account-detail-state-cell admin-account-detail-state-cell--${stateTone(value)}`}
    >
      <span className="admin-account-detail-state-label">{label}</span>
      <strong>{stateText(value)}</strong>
      <small>{detail}</small>
    </div>
  );
  const activityTitle = (action: string) =>
    action
      .replaceAll(".", " ")
      .replaceAll("-", " ")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  const historyCategory = (action: string, resourceType: string) => {
    const value = `${action} ${resourceType}`.toLowerCase();
    if (
      value.includes("security") ||
      value.includes("login") ||
      value.includes("2fa") ||
      value.includes("password") ||
      value.includes("session")
    )
      return "Security";
    if (
      value.includes("finance") ||
      value.includes("money") ||
      value.includes("payout") ||
      value.includes("deposit") ||
      value.includes("withdraw") ||
      value.includes("wallet")
    )
      return "Financial";
    if (
      value.includes("order") ||
      value.includes("trade") ||
      value.includes("listing") ||
      value.includes("market")
    )
      return "Trading";
    if (
      value.includes("compliance") ||
      value.includes("identity") ||
      value.includes("kyc") ||
      value.includes("kyb")
    )
      return "Compliance";
    if (value.includes("collector") || value.includes("submission") || value.includes("intake"))
      return "Collector";
    if (
      value.includes("admin") ||
      value.includes("role") ||
      value.includes("permission") ||
      value.includes("audit")
    )
      return "Admin";
    return "Account";
  };
  const statusEvents = user.statusHistory.map((entry) => ({
    id: `status-${entry.createdAt}-${entry.toStatus}`,
    action: "ACCOUNT_STATUS_CHANGED",
    resourceType: "account",
    resourceId: user.id,
    actor: entry.actorUserId ? shortId(entry.actorUserId) : "System",
    actorType: entry.actorUserId ? "USER" : "SYSTEM",
    result: "SUCCESS",
    occurredAt: entry.createdAt,
    detail: entry.reason ?? `Status changed to ${sentence(entry.toStatus)}.`,
  }));
  const auditEvents = user.activitySnapshot.map((activity) => ({
    ...activity,
    detail: activity.resourceId
      ? `${activity.resourceType} · ${shortId(activity.resourceId)}`
      : activity.resourceType,
  }));
  const historyEvents = [...auditEvents, ...statusEvents].sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
  const historyFilters = [
    "All",
    "Security",
    "Financial",
    "Trading",
    "Compliance",
    "Account",
    "Collector",
    "Admin",
    "Provider",
  ];
  const attention = user.attention.required
    ? [
        [
          user.attention.domain ?? "Account",
          user.attention.reason ?? "Staff attention is required.",
        ],
      ]
    : [];
  const finance = user.financialDetails;
  const renderOverview = () => (
    <div className="admin-account-detail-stack">
      <section className="admin-account-detail-state-grid" aria-label="Account operating state">
        {stateCell(
          "Account state",
          user.accountStatus,
          user.accountStateReason ?? "No restrictions",
        )}
        {stateCell(
          "Access",
          user.primaryType,
          `${roles.length} active role${roles.length === 1 ? "" : "s"}`,
        )}
        {stateCell(
          "Financial state",
          user.financialState,
          user.permissions.finance
            ? finance?.bacsHeldMinor && finance.bacsHeldMinor !== "0"
              ? `${money(finance.bacsHeldMinor)} bank clearing`
              : "No active financial exception"
            : "Finance access required",
        )}
        {stateCell(
          "Compliance",
          user.complianceState,
          user.permissions.compliance
            ? (user.complianceReason ?? "No current case context")
            : "Compliance access required",
        )}
        {stateCell("Payouts", user.payoutState, user.payoutReason ?? "Payout capability ready")}
      </section>

      <div className="admin-account-detail-grid admin-account-detail-grid--dashboard">
        <section className="admin-account-detail-panel">
          <AdminPanelHeading
            title="Needs attention"
            action={attention.length ? "Open operations" : undefined}
            onClick={attention.length ? () => setTab("Operations") : undefined}
          />
          {attention.length ? (
            <div className="admin-account-detail-issues">
              {attention.map(([label, detail]) => (
                <div className="admin-account-detail-issue" key={`${label}-${detail}`}>
                  <AlertTriangle aria-hidden="true" />
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-account-detail-healthy-strip">
              <BadgeCheck aria-hidden="true" /> No active issues
            </div>
          )}
        </section>

        <section className="admin-account-detail-panel">
          <AdminPanelHeading
            title="Roles & access"
            action="Manage"
            onClick={() => setTab("Operations")}
          />
          <div className="admin-account-detail-compact-roles">
            {roles.length ? (
              roles.slice(0, 4).map((role) => (
                <div key={role.id}>
                  <strong>{sentence(role.role)}</strong>
                  <span>{role.scopeType}</span>
                </div>
              ))
            ) : (
              <span className="admin-muted">No elevated roles assigned.</span>
            )}
          </div>
          <button type="button" className="admin-detail-link" onClick={() => setTab("Operations")}>
            Manage roles <ArrowRight aria-hidden="true" />
          </button>
        </section>

        <section className="admin-account-detail-panel">
          <AdminPanelHeading
            title="Identity & account access"
            action="Review"
            onClick={() => setTab("Operations")}
          />
          <div className="admin-account-detail-identity-list">
            <DetailRow label="Phone" value={user.identity.phone ?? "Not verified"} />
            <DetailRow
              label="Two-factor authentication"
              value={user.identity.twoFactorEnabled ? "Enabled" : "Not enabled"}
              tone={user.identity.twoFactorEnabled ? "positive" : undefined}
            />
            <DetailRow label="Country" value={user.identity.country ?? "Unavailable"} />
            <DetailRow label="Timezone" value={user.profile?.timezone ?? "Unavailable"} />
            <DetailRow
              label="Discord"
              value={user.identity.discord.connected ? "Connected" : "Not connected"}
              tone={user.identity.discord.connected ? "positive" : undefined}
            />
          </div>
          <button type="button" className="admin-detail-link" onClick={() => setTab("Operations")}>
            Review identity settings <ArrowRight aria-hidden="true" />
          </button>
        </section>

        <section className="admin-account-detail-panel">
          <AdminPanelHeading
            title="Recent activity"
            action={historyEvents.length ? "View history" : undefined}
            onClick={historyEvents.length ? () => setTab("History") : undefined}
          />
          {historyEvents.length ? (
            <div className="admin-account-detail-activity-list">
              {historyEvents.slice(0, 5).map((event) => (
                <div className="admin-account-detail-activity" key={event.id}>
                  <Activity aria-hidden="true" />
                  <span>
                    <strong>{activityTitle(event.action)}</strong>
                    <small>
                      {event.actor ?? "System"} · {relative(event.occurredAt)}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmpty detail="No meaningful activity is available." icon={FileClock} />
          )}
        </section>
      </div>

      <div className="admin-account-detail-grid admin-account-detail-grid--supporting">
        <section className="admin-account-detail-panel">
          <AdminPanelHeading
            title="Finance & payouts"
            action="Open Finance"
            onClick={() => setTab("Operations")}
          />
          <div className="admin-account-detail-metrics">
            <DetailRow
              label="Available cash"
              value={money(user.permissions.finance ? (finance?.availableMinor ?? null) : null)}
            />
            <DetailRow label="Payout readiness" value={payoutStateLabel(user.payoutState)} />
            <DetailRow
              label="Reserved"
              value={money(user.permissions.finance ? (finance?.reservedMinor ?? null) : null)}
            />
            <DetailRow
              label="Payouts enabled"
              value={
                user.permissions.finance
                  ? user.payoutDetails?.payoutsEnabled
                    ? "Yes"
                    : "No"
                  : "Unavailable"
              }
            />
            <DetailRow
              label="Provider pending"
              value={money(user.permissions.finance ? (finance?.pendingMinor ?? null) : null)}
            />
            <DetailRow
              label="Funding bank"
              value={
                user.permissions.finance
                  ? user.payoutDetails?.status
                    ? "Protected connection"
                    : "Not connected"
                  : "Unavailable"
              }
            />
            <DetailRow
              label="Financial deficit"
              value={money(user.permissions.finance ? (finance?.deficitMinor ?? null) : null)}
            />
            <DetailRow
              label="Withdrawal hold"
              value={
                user.permissions.finance
                  ? finance?.withdrawalHoldUntil
                    ? date(finance.withdrawalHoldUntil)
                    : "None"
                  : "Unavailable"
              }
            />
          </div>
        </section>

        <section className="admin-account-detail-panel">
          <AdminPanelHeading
            title="Compliance summary"
            action="Open workspace"
            onClick={() => setTab("Operations")}
          />
          <div className="admin-account-detail-metrics">
            <DetailRow label="KYC status" value={stateText(user.complianceSummary.kycStatus)} />
            <DetailRow
              label="Open cases"
              value={
                user.permissions.compliance
                  ? String(user.complianceSummary.caseCount)
                  : "Unavailable"
              }
            />
            <DetailRow
              label="Transaction monitoring"
              value={stateText(user.complianceSummary.kytStatus)}
            />
            <DetailRow
              label="Active holds"
              value={user.permissions.compliance ? String(user.activeHolds.length) : "Unavailable"}
            />
            <DetailRow label="Review state" value={complianceStateLabel(user.complianceState)} />
            <DetailRow
              label="Last review"
              value={
                user.permissions.compliance
                  ? user.complianceSummary.lastReviewAt
                    ? relative(user.complianceSummary.lastReviewAt)
                    : "Not available"
                  : "Unavailable"
              }
            />
          </div>
        </section>

        <section className="admin-account-detail-panel">
          <AdminPanelHeading
            title="Account participation"
            action="Open operations"
            onClick={() => setTab("Operations")}
          />
          <div className="admin-account-detail-metrics">
            <DetailRow
              label="Collector submissions"
              value={String(user.collectorOverview?.submissions ?? 0)}
            />
            <DetailRow label="Portfolio assets" value={String(user.portfolioSummary.totalAssets)} />
            <DetailRow
              label="Active intake"
              value={String(user.collectorOverview?.activeIntakes ?? 0)}
            />
            <DetailRow label="Open orders" value={String(user.portfolioSummary.openOrders)} />
            <DetailRow
              label="Active listings"
              value={String(user.portfolioSummary.activeListings)}
            />
            <DetailRow
              label="Invested total"
              value={money(
                user.permissions.finance ? user.portfolioSummary.totalInvestedMinor : null,
                user.portfolioSummary.currency,
              )}
            />
            <DetailRow
              label="Membership"
              value={
                user.collector?.subscription
                  ? `${user.collector.subscription.plan} · ${sentence(user.collector.subscription.status)}`
                  : "No membership"
              }
            />
            <DetailRow
              label="Directory"
              value={user.collector?.publicDirectory?.isPublic ? "Published" : "Not published"}
            />
          </div>
        </section>
      </div>

      {renderHistory()}
    </div>
  );

  const renderOperations = () => (
    <div className="admin-account-detail-stack">
      <div className="admin-account-detail-grid admin-account-detail-grid--operations">
        <UserRoleManagement user={user} retry={retry} />
        <section className="admin-account-detail-panel">
          <AdminPanelHeading title="Identity & account access" />
          <DetailRow label="Phone" value={user.identity.phone ?? "Not verified"} />
          <DetailRow
            label="Two-factor authentication"
            value={user.identity.twoFactorEnabled ? "Enabled" : "Not enabled"}
          />
          <DetailRow label="Country" value={user.identity.country ?? "Unavailable"} />
          <DetailRow label="Timezone" value={user.profile?.timezone ?? "Unavailable"} />
          <DetailRow
            label="Discord"
            value={user.identity.discord.connected ? "Connected" : "Not connected"}
          />
          <p className="admin-safe-note">
            Sensitive identity evidence is kept in the authoritative verification workspace.
          </p>
        </section>
      </div>

      <section className="admin-account-detail-panel">
        <AdminPanelHeading title="Financial summary" />
        {user.permissions.finance && finance ? (
          <div className="admin-account-detail-finance-grid">
            <DetailRow label="Available cash" value={money(finance.availableMinor)} />
            <DetailRow label="Reserved" value={money(finance.reservedMinor)} />
            <DetailRow label="Provider pending" value={money(finance.pendingMinor)} />
            <DetailRow label="Bacs risk-held" value={money(finance.bacsHeldMinor)} />
            <DetailRow label="Financial deficit" value={money(finance.deficitMinor)} />
            <DetailRow
              label="Returns / manual review"
              value={`${finance.returnedDepositCount} / ${finance.manualReviewDepositCount}`}
            />
            <DetailRow
              label="Withdrawal hold"
              value={finance.withdrawalHoldUntil ? date(finance.withdrawalHoldUntil) : "None"}
            />
            <DetailRow label="Payout state" value={payoutStateLabel(user.payoutState)} />
          </div>
        ) : (
          <AdminEmpty
            detail="Finance details are restricted to authorized Finance operators."
            icon={WalletCards}
          />
        )}
        <p className="admin-safe-note">Financial balances are managed in Finance.</p>
      </section>

      <div className="admin-account-detail-grid admin-account-detail-grid--operations">
        <section className="admin-account-detail-panel">
          <AdminPanelHeading title="Compliance operations" />
          {user.permissions.compliance ? (
            <>
              <DetailRow label="State" value={complianceStateLabel(user.complianceState)} />
              <DetailRow label="KYC" value={sentence(user.complianceSummary.kycStatus)} />
              <DetailRow
                label="Transaction monitoring"
                value={sentence(user.complianceSummary.kytStatus)}
              />
              <DetailRow label="Open cases" value={String(user.complianceSummary.caseCount)} />
              <DetailRow label="Active holds" value={String(user.activeHolds.length)} />
            </>
          ) : (
            <AdminEmpty
              detail="Compliance details are restricted to authorized Compliance staff."
              icon={ShieldCheck}
            />
          )}
          <p className="admin-safe-note">
            Evidence and provider secrets are not displayed on the account surface.
          </p>
        </section>
        <section className="admin-account-detail-panel">
          <AdminPanelHeading title="Payout & bank operations" />
          {user.permissions.finance ? (
            <>
              <DetailRow label="Payout readiness" value={payoutStateLabel(user.payoutState)} />
              <DetailRow
                label="Connect status"
                value={
                  user.payoutDetails?.status ? sentence(user.payoutDetails.status) : "Not connected"
                }
              />
              <DetailRow
                label="Payouts enabled"
                value={user.payoutDetails?.payoutsEnabled ? "Yes" : "No"}
              />
              <DetailRow
                label="Transfers capability"
                value={user.payoutDetails?.transfersCapability ?? "Unavailable"}
              />
              <DetailRow
                label="Funding bank"
                value={user.payoutDetails?.status ? "Protected bank connection" : "Not connected"}
              />
            </>
          ) : (
            <AdminEmpty
              detail="Payout details are restricted to authorized Finance operators."
              icon={Landmark}
            />
          )}
          <p className="admin-safe-note">
            Bank account numbers and provider identifiers are intentionally hidden.
          </p>
        </section>
      </div>

      {user.collectorOverview ? (
        <div className="admin-account-detail-grid admin-account-detail-grid--operations">
          <section className="admin-account-detail-panel">
            <AdminPanelHeading title="Collector operations" />
            <DetailRow
              label="Membership"
              value={
                user.collector?.subscription
                  ? `${user.collector.subscription.plan} · ${sentence(user.collector.subscription.status)}`
                  : "No membership"
              }
            />
            <DetailRow label="Active intake" value={String(user.collectorOverview.activeIntakes)} />
            <DetailRow label="Submissions" value={String(user.collectorOverview.submissions)} />
            <DetailRow
              label="Directory profile"
              value={user.collector?.publicDirectory?.slug ?? "Not created"}
            />
          </section>
          <CollectorDirectoryManagement user={user} retry={retry} />
        </div>
      ) : null}

      <section className="admin-account-detail-panel admin-account-detail-controls">
        <div>
          <strong>Account controls</strong>
          <span>Access changes require a reason and are recorded in account history.</span>
        </div>
        <AccountStatusManagement user={user} retry={retry} />
      </section>
    </div>
  );

  const renderHistory = () => (
    <section className="admin-account-detail-panel admin-account-detail-history">
      <div className="admin-account-detail-history-heading">
        <div>
          <h3>Immutable account history</h3>
          <span>
            Meaningful account, security, financial, trading, compliance, Collector, provider, and
            admin events.
          </span>
        </div>
        <div
          className="admin-account-detail-history-filters"
          role="group"
          aria-label="History filters"
        >
          {historyFilters.map((filter) => (
            <button
              type="button"
              className={historyFilter === filter ? "is-active" : ""}
              key={filter}
              onClick={() => {
                setHistoryFilter(filter);
                setHistoryPage(1);
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
      {history.isLoading ? (
        <AdminState
          title="Loading account history"
          detail="Reading the immutable account timeline."
        />
      ) : history.isError ? (
        <AdminState
          title="Account history is unavailable"
          detail="The account record is still available. Retry the timeline when the service recovers."
          retry={() => void history.refetch()}
        />
      ) : history.data?.items.length ? (
        <div className="admin-table-wrap admin-account-detail-history-table-wrap">
          <table className="admin-table admin-account-detail-history-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Category</th>
                <th>Actor</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {history.data.items.map((event) => (
                <tr key={event.id}>
                  <td>
                    <time dateTime={event.occurredAt}>
                      {new Date(event.occurredAt).toLocaleString()}
                    </time>
                  </td>
                  <td>{activityTitle(event.action)}</td>
                  <td>
                    <span className="admin-account-detail-category">
                      {historyCategory(event.action, event.resourceType)}
                    </span>
                  </td>
                  <td>{event.actor ?? "System"}</td>
                  <td>
                    {event.resourceId
                      ? `${event.resourceType} · ${shortId(event.resourceId)}…`
                      : event.resourceType}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty
          detail={`No ${historyFilter.toLowerCase()} history is available for this account.`}
          icon={FileClock}
        />
      )}
      {history.data && history.data.totalPages > 1 ? (
        <div className="admin-pagination" aria-label="History pagination">
          <button
            type="button"
            disabled={history.data.page <= 1}
            onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
          >
            Previous
          </button>
          <span>
            Page {history.data.page} of {history.data.totalPages}
          </span>
          <button
            type="button"
            disabled={history.data.page >= history.data.totalPages}
            onClick={() => setHistoryPage((page) => Math.min(history.data!.totalPages, page + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );

  return (
    <div className="admin-console-content admin-user-detail-content admin-account-detail-content">
      <nav className="admin-account-detail-breadcrumb" aria-label="Account navigation">
        <button type="button" className="admin-back-link" onClick={back}>
          <ChevronLeft aria-hidden="true" /> Accounts
        </button>
        <span aria-hidden="true">›</span>
        <strong>{user.displayName}</strong>
      </nav>
      <section className="admin-account-detail-header">
        <div className="admin-detail-identity">
          <div className="admin-user-identity-avatar">{initials(user.displayName)}</div>
          <div className="admin-account-detail-identity-copy">
            <p className="admin-console-eyebrow">Accounts · Operational account detail</p>
            <h2>{user.displayName}</h2>
            <span>
              {user.username ? `@${user.username}` : "Username unavailable"} · {user.email}
            </span>
            <div className="admin-detail-chips">
              {user.semanticRoles.map((role) => (
                <span key={role}>{sentence(role)}</span>
              ))}
              {user.fixture === "DEMO" ? <span>Demo account</span> : null}
            </div>
          </div>
        </div>
        <div className="admin-account-detail-header-actions">
          <span
            className={`admin-status-pill admin-status-pill--${user.accountStatus.toLowerCase()}`}
          >
            {accountStatusLabel(user.accountStatus)}
          </span>
          <button
            type="button"
            className="admin-account-detail-header-action"
            onClick={() => setTab("Operations")}
          >
            <Settings aria-hidden="true" /> Manage account
          </button>
          <button
            type="button"
            className="admin-account-detail-header-action"
            onClick={() => setTab("History")}
          >
            <FileClock aria-hidden="true" /> View history
          </button>
        </div>
        <div className="admin-account-detail-header-meta">
          <span>
            Joined <strong>{date(user.createdAt)}</strong>
          </span>
          <span>
            Last meaningful activity{" "}
            <strong>
              {user.lastActivityAt ? relative(user.lastActivityAt) : "No sign-in recorded"}
            </strong>
          </span>
          <span>
            User ID <strong>{shortId(user.id)}…</strong>{" "}
            <button type="button" onClick={() => void navigator.clipboard?.writeText(user.id)}>
              Copy
            </button>
          </span>
        </div>
      </section>
      <div className="admin-user-detail-main admin-account-detail-main">
        <main>
          {activeTab === "Overview"
            ? renderOverview()
            : activeTab === "Operations"
              ? renderOperations()
              : renderHistory()}
        </main>
      </div>
    </div>
  );
}

const adminAssignableRoles = [
  ["COLLECTOR", "Collector"],
  ["SUPPORT", "Support"],
  ["COMPLIANCE_ANALYST", "Compliance analyst"],
  ["ASSET_REVIEWER", "Asset reviewer"],
  ["VAULT_OPERATOR", "Vault operator"],
  ["FINANCE_OPERATOR", "Finance operator"],
  ["ADMIN", "Administrator"],
] as const;

function CollectorDirectoryManagement({
  user,
  retry,
}: {
  user: AdminUserDetail;
  retry: () => void;
}) {
  const services = useAppServices();
  const currentUser = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    staleTime: 60_000,
  });
  const directory = user.collector?.publicDirectory ?? null;
  const canManage = currentUser.data?.roles.includes("ADMIN") ?? false;
  const feature = useMutation({
    mutationFn: (featured: boolean) =>
      services.repositories.admin.setCollectorFeatured(directory!.slug, featured),
    onSuccess: retry,
  });
  return (
    <section className="admin-panel">
      <AdminPanelHeading title="Collectors directory" />
      {directory ? (
        <>
          <DetailRow label="Directory profile" value={directory.slug} />
          <DetailRow
            label="Published profile"
            value={directory.isPublic ? "Available" : "Not marked public"}
          />
          <DetailRow
            label="Featured status"
            value={directory.isFeatured ? "Featured" : "Not featured"}
          />
          {canManage ? (
            <button
              type="button"
              className="admin-detail-action"
              disabled={feature.isPending}
              onClick={() => {
                const next = !directory.isFeatured;
                if (
                  window.confirm(
                    `${next ? "Feature" : "Remove"} ${user.displayName} in the public Collector directory? This change is audited.`,
                  )
                ) {
                  feature.mutate(next);
                }
              }}
            >
              {feature.isPending
                ? "Saving…"
                : directory.isFeatured
                  ? "Remove from featured"
                  : "Feature Collector"}
            </button>
          ) : (
            <p className="admin-safe-note">Only Administrators can change featured placement.</p>
          )}
          {feature.isError ? (
            <p className="admin-safe-note" role="alert">
              Featured placement was not saved. No directory state was changed.
            </p>
          ) : null}
        </>
      ) : (
        <AdminEmpty
          detail="This Collector has no public directory profile yet. Create the profile from the Collector workspace before featuring it."
          icon={Users}
        />
      )}
      <p className="admin-safe-note">
        Featured placement changes presentation only. It does not change Collector roles,
        submissions, ownership, pricing, or trading.
      </p>
    </section>
  );
}

function UserRoleManagement({ user, retry }: { user: AdminUserDetail; retry: () => void }) {
  const services = useAppServices();
  const currentUser = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    staleTime: 60_000,
  });
  const canManageRoles =
    user.permissions.manageRoles && (currentUser.data?.roles.includes("ADMIN") ?? false);
  const [role, setRole] = useState("COLLECTOR");
  const grant = useMutation({
    mutationFn: () =>
      services.repositories.admin.grantUserRole(user.id, {
        role,
        scopeType: "GLOBAL",
        scopeId: "*",
      }),
    onSuccess: retry,
  });
  const revoke = useMutation({
    mutationFn: (assignmentId: string) =>
      services.repositories.admin.revokeUserRole(user.id, assignmentId),
    onSuccess: retry,
  });
  const uniqueRoles = Array.from(
    new Map(
      user.roles
        .filter((assignment) => assignment.role !== "USER")
        .map((assignment) => [
          `${assignment.role}:${assignment.scopeType}:${assignment.scopeId ?? ""}`,
          assignment,
        ]),
    ).values(),
  );
  const roleDescriptions: Record<string, string> = {
    COLLECTOR: "Can submit and manage eligible collectibles.",
    SUPPORT: "Can respond to customer support workflows.",
    COMPLIANCE_ANALYST: "Can review compliance cases.",
    ASSET_REVIEWER: "Can review collectible submissions.",
    VAULT_OPERATOR: "Can manage authorized physical intake operations.",
    FINANCE_OPERATOR: "Can access protected finance operations.",
    ADMIN: "Full administrative access according to policy.",
  };
  return (
    <section className="admin-panel">
      <AdminPanelHeading title="Roles & Access" />
      {uniqueRoles.length ? (
        <div className="admin-detail-role-list">
          {uniqueRoles.map((assignment) => (
            <div className="admin-role-row" key={assignment.id}>
              <div>
                <strong>{sentence(assignment.role)}</strong>
                <small>{roleDescriptions[assignment.role] ?? "Active account capability."}</small>
                <span>
                  Granted {date(assignment.createdAt)} · {assignment.scopeType}
                </span>
              </div>
              {canManageRoles ? (
                <button
                  type="button"
                  className="admin-inline-action"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Revoke ${sentence(assignment.role)} from ${user.displayName}? This removes the active assignment and is recorded in the audit log.`,
                      )
                    )
                      revoke.mutate(assignment.id);
                  }}
                >
                  Revoke role
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <AdminEmpty detail="No active roles assigned." icon={ShieldCheck} />
      )}
      {canManageRoles ? (
        <div className="admin-detail-action-form admin-role-add-form">
          <AdminSelect
            label="Role to add"
            value={role}
            onChange={setRole}
            options={adminAssignableRoles as unknown as Array<[string, string]>}
          />
          <button
            type="button"
            className="admin-detail-action"
            disabled={grant.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Grant ${sentence(role)} to ${user.displayName}? This is an audited privilege change and may require recent authentication.`,
                )
              )
                grant.mutate();
            }}
          >
            {grant.isPending ? "Adding…" : "+ Add role"}
          </button>
        </div>
      ) : (
        <p className="admin-safe-note admin-role-readonly-note">
          Roles are read-only for your workspace. Only an Administrator can add or remove access, so
          no role-change request will be sent.
        </p>
      )}
      {canManageRoles && (grant.isError || revoke.isError) ? (
        <p className="admin-safe-note" role="alert">
          The role change was not saved. Refresh the account and confirm your permission before
          retrying.
        </p>
      ) : null}
      <p className="admin-safe-note">Role changes are recorded in account history.</p>
    </section>
  );
}

function AccountStatusManagement({ user, retry }: { user: AdminUserDetail; retry: () => void }) {
  const services = useAppServices();
  const currentUser = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    staleTime: 60_000,
  });
  const canManageStatus =
    user.permissions.manageStatus && (currentUser.data?.roles.includes("ADMIN") ?? false);
  const [nextStatus, setNextStatus] = useState("");
  const [reason, setReason] = useState("");
  const transition = useMutation({
    mutationFn: () =>
      services.repositories.admin.transitionUserStatus(user.id, {
        toStatus: nextStatus,
        reasonCode: reason.trim(),
        restore: nextStatus === "ACTIVE",
      }),
    onSuccess: () => {
      setNextStatus("");
      setReason("");
      retry();
    },
  });
  const allowedStatuses: Record<string, Array<[string, string]>> = {
    PENDING_REVIEW: [["ACTIVE", "Activate"]],
    ACTIVE: [
      ["RESTRICTED", "Restrict account"],
      ["SUSPENDED", "Suspend account"],
      ["DEACTIVATED", "Deactivate account"],
    ],
    RESTRICTED: [
      ["ACTIVE", "Remove restriction"],
      ["SUSPENDED", "Suspend account"],
      ["DEACTIVATED", "Deactivate account"],
    ],
    SUSPENDED: [
      ["ACTIVE", "Reactivate account"],
      ["DEACTIVATED", "Deactivate account"],
    ],
    DEACTIVATED: [["ACTIVE", "Reactivate account"]],
    CLOSED: [],
  };
  const options = allowedStatuses[user.accountStatus] ?? [];
  return (
    <section className="admin-panel admin-status-panel">
      <AdminPanelHeading title="Account status" />
      <div className="admin-current-status">
        <span>Current status</span>
        <strong>{sentence(user.accountStatus)}</strong>
      </div>
      {options.length && canManageStatus ? (
        <div className="admin-status-form">
          <AdminSelect
            label="Change status"
            value={nextStatus}
            onChange={setNextStatus}
            options={[["", "Choose a new status"], ...options]}
          />
          <label>
            <span>
              Reason <em>(required)</em>
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this account status is changing"
              rows={3}
            />
          </label>
          <button
            type="button"
            className="admin-detail-action"
            disabled={!nextStatus || reason.trim().length < 3 || transition.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `${options.find(([value]) => value === nextStatus)?.[1] ?? "Change account status"} for ${user.displayName}? The previous state, next state, reason, actor and request ID will be audited.`,
                )
              )
                transition.mutate();
            }}
          >
            {transition.isPending ? "Saving…" : "Update account status"}
          </button>
        </div>
      ) : (
        <p className="admin-safe-note">
          No further status transitions are permitted for this account.
        </p>
      )}
      {transition.isError ? (
        <p className="admin-safe-note" role="alert">
          The status change was refused. No changes were saved; refresh the account before retrying.
        </p>
      ) : null}
      <p className="admin-safe-note">
        Suspension, restriction and closure can revoke sessions according to policy. Self-lockout
        and last-admin protections remain server-enforced.
      </p>
    </section>
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
            <AdminKpi
              icon={ShieldCheck}
              label="Identity"
              value={sentence(detail.identity?.state ?? detail.status)}
            />
            <AdminKpi
              icon={AlertTriangle}
              label="Risk review"
              value={sentence(detail.riskReview?.status ?? "Not reported")}
            />
            <AdminKpi
              icon={Users}
              label="Payout readiness"
              value={
                detail.connectPayoutReadiness?.[0]
                  ? sentence(detail.connectPayoutReadiness[0].status)
                  : "Not started"
              }
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

function AdminMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: number | string;
  detail: string;
  tone?: "default" | "warning" | "positive";
}) {
  return (
    <section className={`admin-kpi admin-kpi--${tone}`}>
      <span>
        <Icon aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
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
  actionLabel,
  onAction,
}: {
  type: string;
  subject: string;
  detail: string;
  tone: "warning" | "neutral";
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article className={`admin-attention admin-attention--${tone}`}>
      <AlertTriangle aria-hidden="true" />
      <div>
        <small>{type}</small>
        <strong>{subject}</strong>
        <span>{detail}</span>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="admin-inline-action" onClick={onAction}>
          {actionLabel} <ArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}
function StatusRow({
  label,
  status,
  icon: Icon,
  summary,
}: {
  label: string;
  status: string;
  icon: typeof Gauge;
  summary?: string;
}) {
  return (
    <div className="admin-status-row" title={summary}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong className={`admin-status-badge admin-status-badge--${adminStatusTone(status)}`}>
        {adminStatusLabel(status)}
      </strong>
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
      <span title={`${label}: ${value} items`}>{adminPipelineLabel(label)}</span>
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

function adminStatusLabel(status: string) {
  const normalized = status.trim().toUpperCase();
  const known: Record<string, string> = {
    OPERATIONAL: "Operational",
    DEGRADED: "Degraded",
    UNKNOWN: "Telemetry unavailable",
    BETA_DISABLED: "Beta disabled",
    NOT_CONFIGURED: "Not configured",
  };
  return known[normalized] ?? sentence(status);
}

function adminStatusTone(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "OPERATIONAL") return "positive";
  if (["DEGRADED", "BETA_DISABLED", "NOT_CONFIGURED"].includes(normalized)) return "warning";
  return "muted";
}

function adminPipelineLabel(label: string) {
  return label.replace("In Review", "Review").replace("Market Live", "Live");
}

function adminAttentionSection(target: string): AdminSection {
  if (target === "reviews") return "moderation";
  if (target === "intake") return "intake";
  if (target === "valuations" || target === "custody") return "assetOperations";
  return "control";
}

function controlCenterSection(target: string): AdminSection {
  const sections: Record<string, AdminSection> = {
    moderation: "moderation",
    reviews: "moderation",
    intake: "intake",
    valuations: "assetOperations",
    custody: "assetOperations",
    assetOperations: "assetOperations",
    collectibles: "collectibles",
    compliance: "compliance",
    payments: "payments",
    integrations: "integrations",
    health: "health",
  };
  return sections[target] ?? "control";
}

function adminAttentionLabel(item: { type: string; waitingOn: string }) {
  const owner = item.waitingOn === "COLLECTOR" ? "collector" : "Slice";
  return `${sentence(item.type)} · ${owner} action`;
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
function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function relativeDate(value: string) {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : date(value);
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

function uniqueRoleAssignments(roles: AdminUserSummary["roles"]): AdminUserSummary["roles"] {
  return Array.from(
    new Map(
      roles.map((assignment) => [
        `${assignment.role}:${assignment.scopeType}:${assignment.scopeId ?? ""}`,
        assignment,
      ]),
    ).values(),
  );
}

function accountStatusLabel(value: string) {
  return value === "PENDING_REVIEW" ? "Pending review" : sentence(value);
}
function accountStatusTone(value: string) {
  return value === "RESTRICTED" || value === "SUSPENDED"
    ? "critical"
    : value === "PENDING_REVIEW"
      ? "warning"
      : "positive";
}
function financialStateLabel(value: string) {
  return value === "FINANCIAL_REVIEW"
    ? "Financial review"
    : value === "UNAVAILABLE"
      ? "Unavailable"
      : sentence(value);
}
function financialStateTone(value: string) {
  return value === "CLEAR"
    ? "positive"
    : value === "BANK_CLEARING"
      ? "warning"
      : value === "UNAVAILABLE"
        ? "muted"
        : "critical";
}
function financialStateDetail(user: AdminUserSummary) {
  if (user.financialState === "FINANCIAL_DEFICIT" && user.financialAmountMinor)
    return `${formatAccountMinor(user.financialAmountMinor)} outstanding`;
  if (user.financialState === "BANK_CLEARING" && user.bacsHeldMinor)
    return `${formatAccountMinor(user.bacsHeldMinor)} held`;
  if (user.financialExceptionCount && user.financialExceptionCount > 1)
    return `+${user.financialExceptionCount - 1} more issue${user.financialExceptionCount > 2 ? "s" : ""}`;
  return user.financialState === "CLEAR"
    ? null
    : user.financialState === "UNAVAILABLE"
      ? "Finance access required"
      : "Requires attention";
}
function complianceStateLabel(value: string) {
  return value === "REVIEW_REQUIRED"
    ? "Review"
    : value === "UNAVAILABLE"
      ? "Unavailable"
      : sentence(value);
}
function complianceStateTone(value: string) {
  return value === "VERIFIED" ? "positive" : value === "UNAVAILABLE" ? "muted" : "warning";
}
function payoutStateLabel(value: string) {
  return value === "NOT_CONFIGURED"
    ? "Not configured"
    : value === "SETUP_IN_PROGRESS"
      ? "Setup in progress"
      : value === "ACTION_REQUIRED"
        ? "Action required"
        : value === "UNDER_REVIEW"
          ? "Under review"
          : sentence(value);
}
function payoutStateTone(value: string) {
  return value === "READY"
    ? "positive"
    : value === "RESTRICTED" || value === "ACTION_REQUIRED"
      ? "critical"
      : value === "NOT_CONFIGURED" || value === "UNDER_REVIEW"
        ? "muted"
        : "warning";
}
function accountTone(user: AdminUserSummary) {
  return user.attention.level === "RESTRICTED" || user.attention.level === "BLOCKING"
    ? "critical"
    : user.attention.level === "ATTENTION"
      ? "warning"
      : "normal";
}
function formatAccountMinor(value: string) {
  const negative = value.startsWith("-");
  const digits = value.replace(/^-/, "").padStart(3, "0");
  return `${negative ? "-" : ""}£${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function accountFilterSearch(filters: Record<string, string>) {
  return {
    accountType: filters.type || undefined,
    accountStatus: filters.status || undefined,
    accountMembershipPlan: filters.membershipPlan || undefined,
    accountMembershipStatus: filters.membershipStatus || undefined,
    accountFinancialState: filters.financialState || undefined,
    accountComplianceState: filters.complianceState || undefined,
    accountPayoutState: filters.payoutState || undefined,
    accountRole: filters.role || undefined,
    accountAttention: filters.attention || undefined,
    accountFixture: filters.fixture || undefined,
    accountJoinedFrom: filters.joinedFrom || undefined,
    accountJoinedTo: filters.joinedTo || undefined,
    accountLastActive: filters.lastActiveWindow || undefined,
  };
}

function AccountStateCell({
  label,
  reason,
  tone,
}: {
  label: string;
  reason: string | null;
  tone: string;
}) {
  return (
    <span
      className={`admin-account-state-cell admin-account-state-cell--${tone}`}
      title={reason ?? label}
    >
      <span className="admin-account-state-dot" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {reason ? <small>{reason}</small> : null}
      </span>
    </span>
  );
}

function AdminSelect({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  className?: string;
}) {
  return (
    <label className={`admin-select ${className}`}>
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
