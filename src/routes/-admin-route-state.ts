export type AdminDestination = "home" | "customers" | "assets" | "money" | "platform";

export type LegacyAdminSection =
  | "control"
  | "users"
  | "moderation"
  | "intake"
  | "intakeLocations"
  | "collectibles"
  | "valuations"
  | "custody"
  | "assetOperations"
  | "memberships"
  | "compliance"
  | "payments"
  | "support"
  | "health"
  | "audit"
  | "flags"
  | "integrations"
  | "settings";

// Keep the historical values type-safe for deep links created before the
// simplification. `normalizeAdminSearch` always resolves them to one of the
// five permanent destinations.
export type AdminSection = AdminDestination | LegacyAdminSection;

export type AdminSearch = {
  section: AdminSection;
  view?: string;
  user?: string;
  assetRecord?: string;
  assetRecordKind?: "asset" | "submission";
  assetFocus?: string;
  asset?: string;
  submission?: string;
  record?: string;
  recordType?: string;
  cataloguePreview?: string;
  membership?: string;
  intake?: string;
  intakeTab?: string;
  location?: string;
  locationTab?: string;
  tab?: string;
  q?: string;
  plan?: string;
  type?: string;
  priority?: string;
  status?: string;
  evidence?: string;
  research?: string;
  readiness?: string;
  reviewer?: string;
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
  fixture?: string;
  billing?: string;
  usage?: string;
  needsAction?: string;
  category?: string;
  catalogueCategory?: string;
  grader?: string;
  physicalState?: string;
  custody?: string;
  verification?: string;
  valuation?: string;
  ownership?: string;
  market?: string;
  grading?: string;
  collector?: string;
  workType?: string;
  operationsStage?: string;
  operationsOffering?: string;
  operationsAttention?: string;
  operationsPriority?: string;
  operationsAssignee?: string;
  operationsSelected?: string;
  accountQ?: string;
  accountType?: string;
  accountStatus?: string;
  accountMembershipPlan?: string;
  accountMembershipStatus?: string;
  accountFinancialState?: string;
  accountComplianceState?: string;
  accountPayoutState?: string;
  accountRole?: string;
  accountAttention?: string;
  accountFixture?: string;
  accountJoinedFrom?: string;
  accountJoinedTo?: string;
  accountLastActive?: string;
  accountSort?: string;
  accountPage?: string;
  financeDataClass?: string;
  queueSeverity?: string;
  queueDomain?: string;
  queueActor?: string;
  queueOverdue?: string;
  queueAssignment?: string;
};

const navigableSections: AdminDestination[] = ["home", "customers", "assets", "money", "platform"];

function isAdminSection(value: unknown): value is AdminDestination {
  return typeof value === "string" && navigableSections.includes(value as AdminDestination);
}

export function normalizeAdminSection(value: unknown): AdminDestination {
  const section = String(value);
  if (
    section === "customers" ||
    [
      "users",
      "memberships",
      "compliance",
      "support",
      "restrictions",
      "cases",
      "escalations",
    ].includes(section)
  )
    return "customers";
  if (
    section === "assets" ||
    [
      "moderation",
      "intake",
      "intakeLocations",
      "collectibles",
      "assetOperations",
      "valuations",
      "custody",
      "marketplace",
    ].includes(section)
  )
    return "assets";
  if (section === "money" || section === "payments") return "money";
  if (
    section === "platform" ||
    [
      "health",
      "audit",
      "flags",
      "integrations",
      "settings",
      "system-health",
      "jobs",
      "webhooks",
      "feature-flags",
      "maintenance",
      "deployments",
    ].includes(section)
  )
    return "platform";
  return isAdminSection(value) ? value : "home";
}

export function isAdminNavItemActive(section: AdminSection, item: AdminSection) {
  return section === item;
}

function defaultView(section: unknown, tab: unknown): string {
  const value = String(section);
  const nestedTab = typeof tab === "string" ? tab : "";
  if (value === "home" || value === "control") return "action-queue";
  if (value === "customers" || value === "users") return "directory";
  if (value === "memberships") return "memberships";
  if (value === "compliance" || value === "restrictions") return "verification-compliance";
  if (value === "support" || value === "cases" || value === "escalations") return "support";
  if (value === "assets" || value === "moderation") return "pipeline";
  if (value === "intake" || value === "intakeLocations" || value === "custody")
    return "intake-custody";
  if (value === "collectibles" || value === "marketplace") return "catalogue";
  if (value === "assetOperations" || value === "valuations") return "valuation-launch";
  if (value === "money" || value === "payments") {
    if (["orders", "executions"].includes(nestedTab)) return "trading";
    if (nestedTab === "reconciliation") return "reconciliation";
    if (nestedTab === "adjustments") return "adjustments";
    return "wallets-movements";
  }
  if (value === "platform" || value === "health") {
    if (["jobs", "webhooks"].includes(nestedTab)) return "delivery";
    if (nestedTab === "integrations") return "integrations";
    if (["audit", "settings", "feature-flags"].includes(nestedTab)) return "audit-settings";
    return "health";
  }
  if (["audit", "flags", "settings", "feature-flags", "maintenance"].includes(value))
    return "audit-settings";
  if (value === "integrations") return "integrations";
  if (["jobs", "webhooks", "deployments"].includes(value)) return "delivery";
  return "action-queue";
}

function legacyTrustTab(value: unknown) {
  const mapping: Record<string, string> = {
    compliance: "compliance",
    restrictions: "restrictions",
    cases: "tickets",
    escalations: "escalations",
  };
  return typeof value === "string" ? mapping[value] : undefined;
}

function legacyPlatformTab(value: unknown) {
  const mapping: Record<string, string> = {
    "system-health": "health",
    jobs: "jobs",
    webhooks: "webhooks",
    integrations: "integrations",
    audit: "audit",
    "audit-logs": "audit",
    flags: "feature-flags",
    "feature-flags": "feature-flags",
    settings: "settings",
    maintenance: "settings",
    deployments: "jobs",
  };
  return typeof value === "string" ? mapping[value] : undefined;
}

export function normalizeAdminSearch(search: Record<string, unknown>): AdminSearch {
  const stringValue = (key: keyof Omit<AdminSearch, "section">) =>
    typeof search[key] === "string" ? search[key] : undefined;
  const nonEmptyValue = (key: keyof Omit<AdminSearch, "section">) =>
    typeof search[key] === "string" && search[key].length > 0 ? search[key] : undefined;
  const normalizedSection = normalizeAdminSection(search.section);
  const migratingLegacyLocation = Boolean(search.location) && normalizedSection === "assets";
  return {
    section: migratingLegacyLocation ? "platform" : normalizedSection,
    view: migratingLegacyLocation
      ? "audit-settings"
      : (nonEmptyValue("view") ?? defaultView(search.section, search.tab)),
    category: stringValue("category"),
    catalogueCategory: stringValue("catalogueCategory"),
    grader: stringValue("grader"),
    physicalState: stringValue("physicalState"),
    custody: stringValue("custody"),
    verification: stringValue("verification"),
    valuation: stringValue("valuation"),
    ownership: stringValue("ownership"),
    market: stringValue("market"),
    grading: stringValue("grading"),
    collector: stringValue("collector"),
    workType: stringValue("workType"),
    operationsStage: stringValue("operationsStage"),
    operationsOffering: stringValue("operationsOffering"),
    operationsAttention: stringValue("operationsAttention"),
    operationsPriority: stringValue("operationsPriority"),
    operationsAssignee: stringValue("operationsAssignee"),
    operationsSelected: nonEmptyValue("operationsSelected"),
    user: nonEmptyValue("user"),
    assetRecord: nonEmptyValue("assetRecord"),
    assetRecordKind:
      search.assetRecordKind === "asset" || search.assetRecordKind === "submission"
        ? search.assetRecordKind
        : undefined,
    assetFocus: nonEmptyValue("assetFocus"),
    asset: nonEmptyValue("asset"),
    submission: nonEmptyValue("submission"),
    record: nonEmptyValue("record"),
    recordType: nonEmptyValue("recordType"),
    cataloguePreview: nonEmptyValue("cataloguePreview"),
    membership: nonEmptyValue("membership"),
    intake: nonEmptyValue("intake"),
    intakeTab: nonEmptyValue("intakeTab"),
    location: nonEmptyValue("location"),
    locationTab: nonEmptyValue("locationTab"),
    tab:
      nonEmptyValue("tab") ?? legacyTrustTab(search.section) ?? legacyPlatformTab(search.section),
    q: nonEmptyValue("q"),
    plan: stringValue("plan"),
    type: stringValue("type"),
    priority: stringValue("priority"),
    status: stringValue("status"),
    evidence: stringValue("evidence"),
    research: stringValue("research"),
    readiness: stringValue("readiness"),
    reviewer: stringValue("reviewer"),
    submittedFrom: stringValue("submittedFrom"),
    submittedTo: stringValue("submittedTo"),
    sort: stringValue("sort"),
    sortDirection: stringValue("sortDirection"),
    page: stringValue("page"),
    pageSize: stringValue("pageSize"),
    vault: stringValue("vault"),
    carrier: stringValue("carrier"),
    dateFrom: stringValue("dateFrom"),
    dateTo: stringValue("dateTo"),
    fixture: stringValue("fixture"),
    billing: stringValue("billing"),
    usage: stringValue("usage"),
    needsAction: stringValue("needsAction"),
    accountQ: nonEmptyValue("accountQ"),
    accountType: stringValue("accountType"),
    accountStatus: stringValue("accountStatus"),
    accountMembershipPlan: stringValue("accountMembershipPlan"),
    accountMembershipStatus: stringValue("accountMembershipStatus"),
    accountFinancialState: stringValue("accountFinancialState"),
    accountComplianceState: stringValue("accountComplianceState"),
    accountPayoutState: stringValue("accountPayoutState"),
    accountRole: stringValue("accountRole"),
    accountAttention: stringValue("accountAttention"),
    accountFixture: stringValue("accountFixture"),
    accountJoinedFrom: stringValue("accountJoinedFrom"),
    accountJoinedTo: stringValue("accountJoinedTo"),
    accountLastActive: stringValue("accountLastActive"),
    accountSort: stringValue("accountSort"),
    accountPage: stringValue("accountPage"),
    financeDataClass: stringValue("financeDataClass"),
    queueSeverity: stringValue("queueSeverity"),
    queueDomain: stringValue("queueDomain"),
    queueActor: stringValue("queueActor"),
    queueOverdue: stringValue("queueOverdue"),
    queueAssignment: stringValue("queueAssignment"),
  };
}

export function compactAdminAccountFilters(filters: Record<string, string>) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim().length > 0));
}

export function pipelineSection(stage: string): AdminSection {
  void stage;
  return "assets";
}

export function operationsTab(stage: string) {
  return (
    (
      {
        verified: "verification",
        valued: "valuation",
        vaultReady: "vault-ready",
        marketReady: "market-ready",
        marketLive: "market-live",
      } as Record<string, string>
    )[stage] ?? "verification"
  );
}
