export type AdminSection =
  | "control"
  | "users"
  | "moderation"
  | "intake"
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

export type AdminSearch = {
  section: AdminSection;
  user?: string;
  asset?: string;
  membership?: string;
  tab?: string;
  q?: string;
  plan?: string;
  type?: string;
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
  fixture?: string;
  billing?: string;
  usage?: string;
  needsAction?: string;
  category?: string;
  grader?: string;
};

const navigableSections: AdminSection[] = [
  "control",
  "users",
  "moderation",
  "intake",
  "collectibles",
  "assetOperations",
  "memberships",
  "payments",
  "support",
  "health",
];

function isAdminSection(value: unknown): value is AdminSection {
  return typeof value === "string" && navigableSections.includes(value as AdminSection);
}

export function normalizeAdminSection(value: unknown): AdminSection {
  if (["valuations", "custody", "marketplace"].includes(String(value))) return "collectibles";
  if (["compliance", "restrictions", "support", "cases", "escalations"].includes(String(value)))
    return "support";
  if (
    [
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
    ].includes(String(value))
  )
    return "health";
  return isAdminSection(value) ? value : "control";
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
  return {
    section: normalizeAdminSection(search.section),
    category: stringValue("category"),
    grader: stringValue("grader"),
    user: nonEmptyValue("user"),
    asset: nonEmptyValue("asset"),
    membership: nonEmptyValue("membership"),
    tab:
      nonEmptyValue("tab") ?? legacyTrustTab(search.section) ?? legacyPlatformTab(search.section),
    q: nonEmptyValue("q"),
    plan: stringValue("plan"),
    type: stringValue("type"),
    priority: stringValue("priority"),
    status: stringValue("status"),
    evidence: stringValue("evidence"),
    research: stringValue("research"),
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
  };
}

export function pipelineSection(stage: string): AdminSection {
  if (["draft", "submitted", "inReview"].includes(stage)) return "moderation";
  if (["accepted", "shipping", "received"].includes(stage)) return "intake";
  return "assetOperations";
}

export function operationsTab(stage: string) {
  return (
    ({
      verified: "verification",
      valued: "valuation",
      vaultReady: "vault-ready",
      marketReady: "market-ready",
      marketLive: "market-live",
    } as Record<string, string>)[stage] ?? "verification"
  );
}
