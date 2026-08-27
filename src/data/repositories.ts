import type {
  Asset,
  AssetId,
  CollectorProfile,
  CollectorDirectoryPage,
  CollectorDirectorySort,
  DiscussionMessage,
  MarketSummary,
  SimilarAsset,
  Notification,
  Order,
  OrderBook,
  OrderPreview,
  TradingExecutionPage,
  TradingOrderInput,
  TradingOrderPage,
  TradingOrderSide,
  TradingOrderStatus,
  TradingOrderPreview,
  OwnershipOrderPreview,
  OwnershipPreviewInput,
  TradingOrderView,
  OwnershipMarketSummary,
  PortfolioHolding,
  PortfolioLot,
  PortfolioSummary,
  PortfolioPerformance,
  PortfolioPerformanceRange,
  WalletInsights,
  PortfolioTransactionPage,
  ComplianceSession,
  ComplianceSummary,
  BankConnection,
  BankConnectionCheckoutSession,
  ConnectPayoutSetup,
  WithdrawalPreflight,
  FeePolicy,
  PriceAlert,
  SaleProposal,
  SaleProposalPage,
  AssetSubmission,
  AssetOperationSummary,
  CreateSubmissionDraft,
  CollectibleReferenceImport,
  GradeOption,
  GradingCompanyOption,
  SubmissionCategory,
  SubmissionDetail,
  RawCardPreGradeResponse,
  SubmissionReviewDetail,
  SubmissionReviewQueueResponse,
  SubmissionReviewSummary,
  ReviewQueueReadinessState,
  PublicationReadiness,
  UpdateSubmissionDraft,
  TimeRange,
  UserId,
  VaultAssetStatus,
  WalletBalance,
  WalletMovementPage,
  WalletMovementView,
  WalletTransaction,
  AccountCapability,
  IdentityDetailsProjection,
  Watchlist,
  MarketLifecycleProjection,
} from "@/domain";

export type SupportedCurrency = "GBP" | "USD" | "CAD" | "EUR";
export type CurrencyRates = {
  baseCurrency: "GBP";
  rates: Record<SupportedCurrency, number>;
  asOf: string;
  fetchedAt: string;
  source: string;
  cached: boolean;
};

export interface AssetRepository {
  listAssets(input?: {
    category?: string;
    query?: string;
    set?: string;
    sort?: "estimatedMarketValue" | "change24h" | "title";
    cursor?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  }): Promise<{ items: Asset[]; hasMore: boolean; nextCursor: string | null }>;
  getAssetById(id: AssetId): Promise<Asset | null>;
  searchAssets(query: string): Promise<Asset[]>;
  getFeaturedAssets(): Promise<Asset[]>;
  getTrendingAssets(): Promise<Asset[]>;
}
export interface CatalogueRepository {
  listSubmissionCategories(): Promise<SubmissionCategory[]>;
  listGradingCompanies(): Promise<GradingCompanyOption[]>;
  listGrades(companyCode: string): Promise<GradeOption[]>;
}
export interface SubmissionRepository {
  importReference(input: { url: string }): Promise<CollectibleReferenceImport>;
  createDraft(input: CreateSubmissionDraft): Promise<AssetSubmission>;
  checkMarket(input: {
    categoryId: string;
    declaredMetadata: CreateSubmissionDraft["declaredMetadata"];
    refresh?: boolean;
  }): Promise<import("@/domain").MarketResearchSnapshot>;
  listOwn(input?: { cursor?: string; limit?: number }): Promise<{
    items: AssetSubmission[];
    nextCursor: string | null;
  }>;
  getOwn(id: string): Promise<SubmissionDetail>;
  updateDraft(id: string, input: UpdateSubmissionDraft): Promise<SubmissionDetail>;
  createMediaIntent(id: string, input: { slot: string; file: File }): Promise<SubmissionDetail>;
  removeMedia(id: string, mediaId: string, version: number): Promise<SubmissionDetail>;
  submit(id: string, version: number): Promise<SubmissionDetail>;
  cancel(id: string, version: number): Promise<SubmissionDetail>;
  getPreGrade(id: string): Promise<RawCardPreGradeResponse>;
  runPreGrade(id: string): Promise<RawCardPreGradeResponse["current"]>;
  verifyCertification(id: string, certificationNumber: string): Promise<SubmissionDetail>;
}
export interface SubmissionReviewRepository {
  listQueue(input?: {
    cursor?: string;
    limit?: number;
    q?: string;
    priority?: "HIGH" | "MEDIUM" | "LOW";
    status?: string;
    evidence?: "complete" | "missing" | "partial";
    research?: "completed" | "in_progress" | "pending" | "unavailable" | "not_requested";
    readiness?: ReviewQueueReadinessState;
    testFixture?: "include" | "only" | "exclude";
    grader?: string;
    submittedFrom?: string;
    submittedTo?: string;
    sort?: "submitted" | "priority" | "collector" | "research" | "evidence";
    sortDirection?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  }): Promise<SubmissionReviewQueueResponse>;
  getDetail(id: string): Promise<SubmissionReviewDetail>;
  claim(id: string): Promise<{ submissionId: string; status: string }>;
  release(id: string): Promise<{ submissionId: string; status: string; version: number }>;
  saveCondition(
    id: string,
    input: { condition: string; note?: string },
  ): Promise<{ submissionId: string; staffCondition: string; updatedAt: string }>;
  saveValuation(
    id: string,
    input: {
      valueMinor: string;
      currency: "GBP";
      basis: string;
      confidence?: number;
      note?: string;
    },
  ): Promise<{ submissionId: string; valueMinor: string | null; updatedAt: string }>;
  decide(
    id: string,
    decision: "CHANGES_REQUESTED" | "APPROVED" | "REJECTED",
    input: {
      reasonCode: string;
      note?: string;
      requestedItems?: string[];
      customerMessage?: string;
    },
  ): Promise<AssetSubmission>;
  saveNote(id: string, note: string): Promise<{ submissionId: string; updatedAt: string }>;
  manualVerifyCertification(
    id: string,
    input: {
      verifiedIdentity: Record<string, unknown>;
      verifiedGrade: string;
      verifiedLabel?: string;
      designation?: string;
      providerReference?: string;
    },
  ): Promise<unknown>;
  canonicalize(id: string): Promise<{
    submissionId: string;
    assetId: string;
    publicId: string;
    slug: string;
    title: string;
    replayed: boolean;
  }>;
}
export interface AssetLifecycleRepository {
  listOperations(): Promise<AssetOperationSummary[]>;
  getOperationsBoard(input?: {
    tab?: string;
    q?: string;
    category?: string;
    grader?: string;
    priority?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AssetOperationsBoardResponse>;
  handoff(
    assetId: string,
    input: { providerCode: string; facilityCode: string; providerRef: string },
  ): Promise<{ assetId: string; custodyStatus: string }>;
  transitionCustody(
    assetId: string,
    toStatus: string,
    providerRef?: string,
  ): Promise<{ assetId: string; custodyStatus: string }>;
  recordValuation(
    assetId: string,
    input: { valueMinor: string; confidence: number; methodologyCode: string; sourceType: string },
  ): Promise<unknown>;
  recordCoverage(
    assetId: string,
    input: {
      insuredValueMinor: string;
      effectiveAt: string;
      expiresAt: string;
      status: "PENDING" | "ACTIVE";
    },
  ): Promise<unknown>;
  getReadiness(assetId: string): Promise<PublicationReadiness>;
  publish(assetId: string): Promise<unknown>;
}

export type AdminOverview = {
  users: { active: number };
  reviews: { pending: number; changesRequested: number };
  assets: { valuationPending: number; custodyActions: number; vaultReady: number };
  complianceCases: number;
  paymentExceptions: number;
  providerAlerts: number;
  generatedAt: string;
};

export type AdminUserSummary = {
  id: string;
  displayName: string;
  username: string | null;
  email: string;
  primaryType: "INVESTOR" | "COLLECTOR" | "STAFF" | "ADMIN";
  accountStatus: string;
  accountStateReason: string | null;
  financialState: string;
  financialExceptionCount: number | null;
  financialAmountMinor: string | null;
  bacsHeldMinor: string | null;
  complianceState: string;
  complianceReason: string | null;
  payoutState: string;
  payoutReason: string | null;
  attention: {
    required: boolean;
    level: "NONE" | "ATTENTION" | "BLOCKING" | "RESTRICTED";
    domain: "ACCESS" | "FINANCIAL" | "COMPLIANCE" | "PAYOUT" | null;
    reason: string | null;
    nextAction: string | null;
  };
  fixture: "NORMAL" | "DEMO";
  roles: Array<{
    id: string;
    role: string;
    scopeType: string;
    scopeId: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  lastActivityAt: string | null;
  membership: {
    plan: "STARTER" | "PRO" | "ELITE" | null;
    status: string | null;
  };
};

export type AdminAccountsSummary = {
  totalUsers: number;
  collectors: number;
  investors: number;
  staff: number;
  admins: number;
  suspended: number;
  needsReview: number;
  activeUsers: number;
  restricted: number;
  financialExceptions: number | null;
  pastDueMemberships: number;
  trialingMemberships: number;
};

export type AdminUserDetail = AdminUserSummary & {
  semanticRoles: string[];
  profile: {
    displayName: string | null;
    publicUsername: string | null;
    countryCode: string | null;
    timezone: string | null;
    preferredCurrency: string | null;
  } | null;
  statusHistory: Array<{
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    actorUserId: string | null;
    createdAt: string;
  }>;
  counts: {
    submissions: number;
    complianceCases: number;
    financialAccounts: number;
    moneyMovements: number;
    auditEvents: number;
  };
  collector: {
    publicDirectory: {
      slug: string;
      isPublic: boolean;
      isFeatured: boolean;
      featuredAt: string | null;
      publishedAt: string | null;
    } | null;
    subscription: {
      plan: string;
      status: string;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    } | null;
    activeIntakes: number;
  } | null;
  identity: {
    phone: string | null;
    country: string | null;
    discord: {
      connected: boolean;
      username: string | null;
      displayName: string | null;
      linkedAt: string | null;
    };
    twoFactorEnabled: boolean;
  };
  complianceSummary: {
    kycStatus: string;
    kytStatus: string;
    provider: string | null;
    lastReviewAt: string | null;
    caseCount: number;
  };
  portfolioSummary: {
    totalValueMinor: string | null;
    totalInvestedMinor: string | null;
    totalWithdrawnMinor: string | null;
    totalAssets: number;
    activeListings: number;
    openOrders: number;
    currency: string;
  };
  walletSummary: {
    availableMinor: string;
    reservedMinor: string;
    pendingMinor: string;
    totalMinor: string;
    currency: string;
  } | null;
  recentOrders: Array<{
    id: string;
    side: string;
    assetTitle: string;
    units: string;
    limitPriceMinor: string;
    currency: string;
    status: string;
    updatedAt: string;
  }>;
  collectorOverview: {
    assets: Array<{ id: string; title: string; slug: string; units: string }>;
    additionalAssets: number;
    activeIntakes: number;
    submissions: number;
  } | null;
  activitySnapshot: Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    actor: string | null;
    actorType: string;
    result: string;
    occurredAt: string;
  }>;
  permissions: {
    finance: boolean;
    compliance: boolean;
    manageRoles: boolean;
    manageStatus: boolean;
  };
  financialDetails: {
    state: string;
    availableMinor: string | null;
    reservedMinor: string | null;
    pendingMinor: string | null;
    totalMinor: string | null;
    bacsHeldMinor: string | null;
    deficitMinor: string | null;
    deficitStatus: string | null;
    withdrawalHoldUntil: string | null;
    returnedDepositCount: number;
    manualReviewDepositCount: number;
  } | null;
  payoutDetails: {
    state: string;
    status: string | null;
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
    transfersCapability: string | null;
    lastSyncedAt: string | null;
  } | null;
  activeHolds: Array<{
    scope: string;
    reasonCode: string;
    source: string;
    status: string;
    createdAt: string;
    releasedAt: string | null;
  }>;
};

export type AdminAccountHistoryResponse = {
  items: AdminUserDetail["activitySnapshot"];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AdminComplianceCase = {
  id: string;
  provider: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; displayName: string; username: string | null };
};

export type AdminComplianceDetail = AdminComplianceCase & {
  providerStatus: string;
  identity?: {
    state: string;
    provider: string;
    verifiedAt: string | null;
    safeFailureCode: string | null;
  };
  riskReview?: { status: string; activeHoldCount: number };
  connectPayoutReadiness?: Array<{
    provider: string;
    environment: string;
    status: string;
    requirementsSummary: unknown;
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
    transfersCapability: string | null;
    lastSyncedAt: string | null;
  }>;
  decisions: Array<{
    status: string;
    reasonCode: string;
    actorUserId: string | null;
    createdAt: string;
  }>;
  restrictions: Array<{
    scope: string;
    reasonCode: string;
    source: string;
    status: string;
    createdAt: string;
    releasedAt: string | null;
  }>;
  audit: Array<{ action: string; result: string; createdAt: string }>;
};

export type AdminRiskOperations = {
  finance: {
    movements: Array<{
      id: string;
      user: { displayName: string; username: string | null };
      type: string;
      amountMinor: string;
      currency: string;
      provider: string;
      status: string;
      referenceAvailable: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    wallets: Array<{
      id: string;
      owner: string;
      availableMinor: string;
      reservedMinor: string;
      currency: string;
      status: string;
      updatedAt: string;
    }>;
    reservations: Array<{
      id: string;
      owner: string;
      amountMinor: string;
      currency: string;
      purposeType: string;
      status: string;
      createdAt: string;
    }>;
    reconciliation: Array<{
      id: string;
      scope: string;
      status: string;
      currency: string;
      debitMinor: string;
      creditMinor: string;
      mismatchCodes: string[];
      createdAt: string;
    }>;
  };
  system: Array<{
    name: string;
    status:
      "Operational" | "Degraded" | "Unavailable" | "Unknown" | "BETA_DISABLED" | "NOT_CONFIGURED";
    summary: string;
    lastCheckedAt: string;
  }>;
  audit: Array<{
    id: string;
    actor: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    result: string;
    createdAt: string;
  }>;
  integrations: Array<{
    name: string;
    status:
      "Operational" | "Degraded" | "Unavailable" | "Unknown" | "BETA_DISABLED" | "NOT_CONFIGURED";
    configured: boolean;
    summary: string;
    failedEvents: number;
  }>;
  webhooks: Array<{
    id: string;
    provider: string;
    eventType: string;
    status: string;
    attempts: number;
    receivedAt: string;
    updatedAt: string;
    error: string | null;
  }>;
};

export type AdminPlatformDashboard = {
  generatedAt: string;
  overallHealth:
    | "Healthy"
    | "Degraded"
    | "Unavailable"
    | "Unknown"
    | "Operational"
    | "Operational with limitations";
  kpis: {
    failedJobs: number;
    webhookFailures: number;
    degradedProviders: number;
    pendingChanges: number | null;
  };
  systemHealth: AdminRiskOperations["system"];
  providers: AdminRiskOperations["integrations"];
  resources: Array<{ label: string; value: string; status: string }>;
  alerts: Array<{
    id: string;
    title: string;
    detail: string;
    severity: string;
    occurredAt: string;
  }>;
  recentActivity: AdminRiskOperations["audit"];
  featureFlags: { available: boolean; message: string };
  settings: { available: boolean; message: string };
};

export type AdminPlatformRecord = {
  id: string;
  kind: "job" | "webhook" | "integration" | "audit";
  [key: string]: unknown;
};

export type AdminPlatformRecordsResponse = {
  tab: string;
  supported: boolean;
  message: string | null;
  items: AdminPlatformRecord[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type AdminFinanceSummary = {
  currency: "GBP";
  pendingMovements: number;
  exceptions: number;
  reconciliationMismatches: number;
  platformRevenue?: {
    grossRevenueMinor: string;
    providerExpensesMinor: string;
    estimatedNetContributionMinor: string;
    eligibleSettlementMinor: string;
    pendingProviderCostCount: number;
  };
};

export type AdminFinanceDashboard = {
  currency: "GBP";
  kpis: {
    totalCustomerCashMinor: string;
    reservedFundsMinor: string;
    pendingDepositsMinor: string;
    pendingWithdrawalsMinor: string;
    openOrders: number;
    executionsToday: number;
    platformGrossRevenueMinor?: string;
    platformProviderExpensesMinor?: string;
    platformEstimatedNetContributionMinor?: string;
    platformEligibleSettlementMinor?: string;
    providerCostsPendingEvidence?: number;
  };
  platformRevenue?: {
    grossRevenueMinor: string;
    providerExpensesMinor: string;
    estimatedNetContributionMinor: string;
    eligibleSettlementMinor: string;
    knownProviderCostsMinor: string;
    pendingProviderCostCount: number;
    externalSettlement: { status: string; destination: string | null };
  };
  payoutLiquidity?: {
    currency: "GBP";
    providerMode: string;
    providerAvailableMinor: string | null;
    providerPendingMinor: string | null;
    customerCashLiabilityMinor: string;
    withdrawalEligibleLiabilityMinor: string;
    settlingMinor: string;
    activeReservationMinor: string;
    payoutLiquidityCoverageBps: number | null;
    providerLiquidityStatus: "AVAILABLE" | "INSUFFICIENT" | "UNAVAILABLE" | "NOT_APPLICABLE";
    nextAvailabilityAt: string | null;
    checkedAt: string;
    warning: boolean;
  };
  overview: {
    totalVolumeMinor: string;
    buyVolumeMinor: string;
    sellVolumeMinor: string;
    totalFeesMinor: string;
    netFeesMinor: string;
    history: Array<{ date: string; volumeMinor: string }>;
  };
  orderSummary: { total: number; buy: number; sell: number; open: number };
  executionSummary: { total: number; buyInitiated: number; sellInitiated: number };
  reconciliationSummary: Array<{
    status: string;
    amountMinor: string;
    count: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    amountMinor: string | null;
    occurredAt: string;
  }>;
};

export type AdminFinanceRecord = {
  id: string;
  kind: "wallet" | "movement" | "order" | "execution" | "reconciliation" | "adjustment";
  [key: string]: unknown;
};

export type AdminFinanceRecordsResponse = {
  tab: string;
  items: AdminFinanceRecord[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type AdminTrustSupportDashboard = {
  kpis: {
    openComplianceCases: number;
    restrictedAccounts: number;
    openTickets: number;
    unassignedTickets: number;
    escalations: number;
  };
  overview: {
    complianceCases: number;
    restrictedAccounts: number;
    openTickets: number;
    unassignedTickets: number;
    escalations: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    occurredAt: string;
  }>;
};

export type AdminTrustSupportRecord = {
  id: string;
  kind: "compliance" | "restriction" | "ticket" | "escalation";
  [key: string]: unknown;
};

export type AdminTrustSupportRecordsResponse = {
  tab: string;
  items: AdminTrustSupportRecord[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type AdminIntegrationsSummary = {
  providerIncidents: number;
  failedWebhooks: number;
  secrets: "redacted";
};

export type AdminOperationsOverview = {
  kpis: {
    totalUsers: number;
    collectors: number;
    investors: number;
    activeListings: number;
    openOrders: number;
    needsAttention: number;
  };
  pipeline: Array<{ id: string; label: string; count: number }>;
  attentionGroups: Array<{
    id: string;
    label: string;
    count: number;
    description: string;
    severity: string;
    section: string;
  }>;
  recentActivity: Array<{ id: string; title: string; context: string; occurredAt: string }>;
  systemHealth: Array<{ name: string; status: string; summary: string }>;
  accountMix: {
    collectors: number;
    investors: number;
    staff: number;
    admins: number;
    overlapping: boolean;
  };
  memberships: {
    starter: number;
    pro: number;
    elite: number;
    trialing: number;
    pastDue: number;
    mrrMinor: string;
  };
  support: { available: boolean; message: string; open?: number };
  counts: {
    pendingReviews: number;
    collectorActionsWaiting: number;
    acceptedAwaitingVault: number;
    shipmentsInTransit: number;
    deliveredAwaitingReceipt: number;
    verificationQueue: number;
    valuationQueue: number;
    vaultReady: number;
    marketplaceReady: number;
    compliance: number;
    payments: number;
    alerts: number;
  };
  needsAttention: Array<{
    id: string;
    type: string;
    subject: string;
    collector: string;
    stage: string;
    reason: string;
    age: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    waitingOn: "COLLECTOR" | "SLICE";
    target: "reviews" | "intake" | "valuations" | "custody";
  }>;
  controlCenter?: AdminControlCenter;
  generatedAt: string;
};

export type AdminControlCenter = {
  summary: {
    needsAction: { count: number; subtitle: string; severity: string; target: string };
    financialRisk: {
      count: number | null;
      subtitle: string;
      severity: string;
      target: string;
      access: "FULL" | "LIMITED";
    };
    staffDecisions: { count: number; subtitle: string; severity: string; target: string };
    platformIncidents: { count: number; subtitle: string; severity: string; target: string };
  };
  priorityWork: Array<{
    id: string;
    severity: string;
    type: string;
    title: string;
    context: string;
    age: string;
    owner: string | null;
    actionLabel: string;
    target: string;
    reference: string | null;
  }>;
  platformHealth: Array<{
    name: string;
    status: string;
    summary: string;
    lastCheckedAt: string | null;
  }>;
  financialOperations: {
    available: boolean;
    access: "FULL" | "LIMITED";
    message: string | null;
    currency: "GBP";
    customerCashLiabilityMinor: string | null;
    bacsRiskHeldMinor: string | null;
    withdrawalEligibleMinor: string | null;
    providerAvailableMinor: string | null;
    providerPendingMinor: string | null;
    payoutLiquidityCoverageBps: number | null;
    openDeficitsCount: number | null;
    openDeficitsMinor: string | null;
    returnsManualReviewCount: number | null;
    dualControlApprovals: number | null;
    providerLiquidityStatus: string | null;
    warning: boolean | null;
  };
  pipeline: Array<{
    id: string;
    label: string;
    count: number;
    oldestAt: string | null;
    oldestAge: string | null;
    overdueCount: number | null;
    target: string;
  }>;
  importantActivity: Array<{
    id: string;
    title: string;
    summary: string;
    actor: string | null;
    occurredAt: string;
    target: string;
  }>;
  openCases: Array<{
    id: string;
    type: string;
    severity: string;
    subject: string;
    age: string;
    owner: string | null;
    nextAction: string;
  }>;
  lastRefreshedAt: string;
};

export type AdminIntakeRow = {
  id: string;
  submissionId: string;
  assetId: string | null;
  intakeReference: string | null;
  title: string;
  thumbnailUrl: string | null;
  category: string | null;
  variant: string | null;
  grader: string | null;
  grade: string | null;
  itemCount: number;
  collector: { id: string; displayName: string; username: string | null };
  membership: string | null;
  submissionStatus: string;
  stage: string;
  stageReason: string;
  currentStageSince: string;
  vault: {
    id: string;
    displayName: string;
    region: string;
    countryCode: string;
    code: string | null;
  } | null;
  shipment: {
    carrier: string;
    trackingNumber: string;
    status: string;
    shippedAt: string;
    deliveredAt: string | null;
  } | null;
  receipt: { confirmedAt: string; confirmedById: string } | null;
  updatedAt: string;
  nextAction: string;
  allowedActions: string[];
  issues: Array<{ code: string; label: string; severity: "LOW" | "MEDIUM" | "HIGH" }>;
  testFixture: boolean;
  carrierState: {
    status: string;
    lastUpdatedAt: string | null;
    source: "MANUAL" | "PROVIDER";
  } | null;
  verification: {
    status: string;
    identityMatch: boolean | null;
    certificationMatch: boolean | null;
    gradeMatch: boolean | null;
    variantMatch: boolean | null;
    startedAt: string | null;
    completedAt: string | null;
    note: string | null;
  } | null;
  custodyHistory: Array<{
    action: string;
    occurredAt: string;
    actorUserId: string | null;
    metadata: unknown;
  }>;
  valuationStatus: string | null;
  custodyStatus: string | null;
  demoIntake: {
    id: string;
    status: string;
    destinationLabel: string;
    simulatedReceiptAt: string;
    verifiedAt: string;
    custodyAt: string;
  } | null;
  exception: { code: string; label: string; severity: "LOW" | "MEDIUM" | "HIGH" } | null;
};

export type AdminIntakeOverview = {
  all: number;
  accepted: number;
  shipped: number;
  delivered: number;
  received: number;
  verification: number;
  verified: number;
  readyForVault: number;
  exceptions: number;
  needsAction: number;
  oldestAt: string | null;
  oldestAtByStage: Record<string, string | null>;
};
export type AdminIntakeResponse = {
  items: AdminIntakeRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  counts: AdminIntakeOverview;
  overview: AdminIntakeOverview;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    reference: string;
    occurredAt: string;
  }>;
  filters: {
    vaults: Array<{
      id: string;
      displayName: string;
      code: string | null;
      operationallyApproved?: boolean;
      acceptingShipments?: boolean;
      environment?: string;
      region?: string;
      countryCode?: string;
    }>;
    carriers: string[];
    fixtureModes?: Array<"NORMAL" | "TEST" | "ALL">;
  };
};

export type AdminMembershipRow = {
  id: string;
  collector: { id: string; displayName: string; username: string | null; email: string };
  plan: { code: string; displayName: string; monthlyPriceMinor: string; currency: string };
  membership: {
    planId: string;
    planName: string;
    status: string;
    source: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
    providerConfigured: boolean;
    billingState: string;
    betaEntitlement: boolean;
  };
  usage: {
    activeCollectibles: number;
    activeCollectiblesLimit: number | null;
    activeCollectiblesPercent: number | null;
    monthlySubmissions: number;
    monthlySubmissionsLimit: number | null;
    monthlySubmissionsPercent: number | null;
    concurrentIntake: number;
    concurrentIntakeLimit: number | null;
    concurrentIntakeAtLimit: boolean;
    billingPeriodStart: string;
    billingPeriodEnd: string;
  };
  usageHealth: "NORMAL" | "AT_LIMIT" | "OVER_LIMIT";
  billing: {
    nextBillingDate: string | null;
    health: string;
    configured: boolean;
    provider: string | null;
    lastSyncAt: string | null;
  };
  entitlements: Record<string, unknown>;
  overLimit: boolean;
  warnings: string[];
  eligibleActions: string[];
  needsAction: boolean;
  nextChange: { kind: string; at: string | null; label: string };
  testFixture: boolean;
  events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    source: string;
    occurredAt: string;
  }>;
  updatedAt: string;
};

export type AdminMembershipDirectoryResponse = {
  items: AdminMembershipRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  kpis: {
    active: number;
    starter: number;
    pro: number;
    elite: number;
    pastDue: number;
    trialing: number;
    total: number;
  };
  statusOverview: Record<string, number>;
  planDistribution: Record<string, number>;
  capabilities: {
    providerConfigured: boolean;
    provider: string | null;
    canExport: boolean;
    usageThresholds: "EXACT_ONLY" | "AT_LIMIT_ONLY";
  };
  recentActivity: Array<{
    id: string;
    title: string;
    reference: string | null;
    occurredAt: string;
  }>;
};

export type AdminMembershipDetailResponse = {
  id: string;
  collector: {
    id: string;
    displayName: string;
    username: string | null;
    email: string;
    accountStatus: string;
    joinedAt: string;
    lastLoginAt: string | null;
  };
  membership: {
    status: string;
    source: { kind: string; label: string; detail: string | null };
    createdAt: string;
    memberSince: string;
    testFixture: boolean;
    cancelAtPeriodEnd: boolean;
  };
  plan: {
    id: string;
    code: string;
    displayName: string;
    description: string;
    monthlyPriceMinor: string;
    currency: string;
    billingInterval: string;
    versionUpdatedAt: string;
    active: boolean;
  };
  period: {
    start: string | null;
    end: string | null;
    daysRemaining: number | null;
    source: string;
    label: string;
  };
  nextChange: { kind: string; label: string; at: string | null };
  billing: {
    provider: string | null;
    providerLabel: string;
    configured: boolean;
    state: string;
    paymentSetup: string;
    paymentSetupLabel: string;
    lastSyncAt: string | null;
    syncState: string;
    providerReferenceAvailable: boolean;
  };
  entitlements: {
    source: string;
    sourceLabel: string;
    features: Array<{ key: string; label: string; enabled: boolean }>;
    limits: Array<{
      key: string;
      label: string;
      limit: number;
      used: number | null;
      remaining: number | null;
      tracking: string;
    }>;
    overrides: { supported: boolean; items: unknown[]; message: string };
  };
  usage: {
    health: "NORMAL" | "AT_LIMIT" | "OVER_LIMIT";
    billingPeriodStart: string;
    billingPeriodEnd: string;
    tracked: AdminMembershipDetailResponse["entitlements"]["limits"];
    unavailable: string[];
  };
  account: {
    status: string;
    testFixture: boolean;
    financeState: string;
    complianceState: string;
  };
  issues: Array<{
    code: string;
    severity: "INFO" | "WARNING" | "ERROR";
    label: string;
    detail: string;
  }>;
  allowedActions: string[];
  history: Array<{
    id: string;
    category: string;
    event: string;
    detail: string;
    performedBy: string;
    occurredAt: string;
  }>;
  capabilities: {
    billingConfigured: boolean;
    auditAvailable: boolean;
    overridesSupported: boolean;
  };
};

export type AdminSearchResult = {
  entityType: "USER" | "COLLECTIBLE" | "SUBMISSION" | "CASE";
  id: string;
  title: string;
  subtitle: string;
  target: string;
};

export type AssetOperationsBoardItem = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  collector: {
    id: string;
    displayName: string;
    username: string | null;
    membership: string | null;
  } | null;
  grading: {
    company: string | null;
    grade: string | null;
    certNumber: string | null;
    gradeDate: string | null;
  };
  category: { name: string; set: string | null; variant: string | null };
  research: {
    status: "COMPLETED" | "IN_PROGRESS" | "UNAVAILABLE" | "NOT_REQUESTED";
    asOf: string | null;
  };
  currentStage:
    | "AWAITING_VERIFICATION"
    | "VERIFICATION_IN_PROGRESS"
    | "AWAITING_VALUATION"
    | "CUSTODY_PENDING"
    | "VAULT_READY"
    | "MARKET_READY"
    | "MARKET_LIVE"
    | "EXCEPTION";
  stageSince: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  exception: {
    type: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    openedAt: string;
    summary: string;
    detailTab: string;
  } | null;
  recommendedDetailTab: string;
  submittedAt: string | null;
  sourceContext: {
    submissionId: string;
    receivedAt: string | null;
    receiptConfirmedAt: string;
    vault: string;
  };
  assignee: { id: string; displayName: string } | null;
  blockers: string[];
  readiness: { status: "BLOCKED" | "READY"; blockingCodes: string[] };
  nextAction: string;
  eligibleActions: string[];
  ageDays: number;
  marketLifecycle?: MarketLifecycleProjection;
};
export type AssetOperationsBoardResponse = {
  items: AssetOperationsBoardItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  counts: Record<AssetOperationsBoardItem["currentStage"], number>;
  operationsOverview: Array<{
    stage: AssetOperationsBoardItem["currentStage"];
    label: string;
    count: number;
  }>;
  stageFlowToday: Array<{ type: string; label: string; count: number }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    reference: string;
    occurredAt: string;
  }>;
};

export type AdminCollectibleDetail = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  media: { slot: string; filename: string; status: string; url: string | null }[];
  identity: {
    category: string;
    categorySlug: string;
    set: string | null;
    year: number | null;
    manufacturer: string | null;
    cardNumber: string | null;
    language: string | null;
    rarity: string | null;
    variant: string | null;
    edition: string | null;
  };
  grading: {
    company: string;
    grade: string;
    label: string;
    certificationNumber: string | null;
    gradingDate: string | null;
    population: number | null;
    popHigher: number | null;
  } | null;
  valuation: {
    current: {
      minor: string;
      currency: string;
      asOf: string;
      method: string;
      actor: string | null;
    } | null;
    history: Array<{
      id: string;
      minor: string;
      currency: string;
      asOf: string;
      method: string;
      status: string;
    }>;
    marketReference: {
      currentListing: {
        minor: string;
        currency: string;
        source: string;
        url: string;
        imageUrl?: string;
        observedAt: string;
      } | null;
      recentSale: {
        minor: string;
        currency: string;
        source: string;
        url: string;
        imageUrl?: string;
        observedAt: string;
      } | null;
    };
  };
  ownership: {
    totalUnits: string | null;
    issuedUnits: string | null;
    availableUnits: string | null;
    ownerCount: number | null;
    holders?: Array<{
      accountId: string;
      userId: string | null;
      displayName: string;
      username: string | null;
      units: string;
      percentage: number | null;
    }>;
  };
  treasuryLiquidity: {
    settledUnits: string;
    reservedUnits: string;
    availableUnits: string;
    openSellOrders: number;
    listedUnits: string;
    partiallyFilledUnits: string;
    marketStatus: string;
    listings: Array<{
      id: string;
      originalUnits: string;
      filledUnits: string;
      remainingUnits: string;
      limitPriceMinor: string;
      status: string;
      createdAt: string;
    }>;
  } | null;
  issuance: {
    assetId: string;
    status: string;
    policy: {
      code: string;
      label: string;
      minimumUnits: string;
      maximumUnits: string;
      defaultUnits: string;
      candidates: string[];
      rounding: string;
    };
    valuation: { minor: string; currency: string; asOf: string; method: string } | null;
    insurance: { active: boolean; expiresAt: string | null };
    proposed: {
      id: string;
      status: string;
      policyCode: string;
      units: string;
      pricePerUnitMinor: string;
      remainderMinor: string;
      valuationMinor: string;
      valuationCurrency: string;
      reason: string;
      proposedAt: string;
      approvedAt: string | null;
    } | null;
    previews: Array<{
      units: string;
      pricePerUnitMinor: string | null;
      remainderMinor: string | null;
      impliedWholeValueMinor: string | null;
      currency: string | null;
    }>;
    readiness: { ready: boolean; blockers: string[] };
    supply: { status: string; totalUnits: string; issuedUnits: string } | null;
  } | null;
  enrichment?: {
    media: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "NOT_APPLICABLE";
    auditHistory: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "NOT_APPLICABLE";
    ownershipIssuance: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "NOT_APPLICABLE";
    collectorAcceptedCount: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "NOT_APPLICABLE";
    initialOfferingProceeds: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "NOT_APPLICABLE";
  };
  lifecycle: {
    current: string;
    legacy?: boolean;
    stages: Array<{
      key: string;
      label: string;
      state: "complete" | "current" | "upcoming" | "exception";
      at: string | null;
    }>;
  };
  marketLifecycle?: MarketLifecycleProjection;
  collector: {
    id: string;
    displayName: string;
    username: string | null;
    memberSince: string;
    submissions: number;
    accepted: number | null;
  } | null;
  intake: {
    id: string;
    status: string;
    vault: string | null;
    tracking: string | null;
    carrier: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    receivedAt: string | null;
    receiptConfirmedAt: string | null;
    exception: boolean;
  } | null;
  verification: {
    status: string;
    verifiedBy: string | null;
    verifiedAt: string | null;
    decision: string | null;
    note: string | null;
  };
  custody: {
    status: string;
    controlledBetaPhysicalBypass?: boolean;
    location: string | null;
    receivedAt: string | null;
    securedAt: string | null;
    history: Array<{ status: string; at: string }>;
  };
  market: {
    publication: string;
    trading: { status: string; tradingEnabled: boolean } | null;
    asking: { minor: string; currency: string } | null;
    reference: {
      provider: string;
      externalId: string;
      minor: string;
      currency: string;
      observedAt: string;
      nextRefreshAt: string | null;
      status: string;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastFailureCode: string | null;
      historyStartedAt: string | null;
      movement24hBps: number | null;
      movement7dBps: number | null;
      movement30dBps: number | null;
      movement90dBps: number | null;
      movement1yBps: number | null;
      observationCount: number;
    } | null;
    floor: { minor: string; currency: string } | null;
    salesAverage: { minor: string; currency: string } | null;
    salesCount: number;
    lastUpdated: string | null;
    readiness: { status: string; blockingCodes: string[] };
  };
  recentSales: Array<{
    id: string;
    date: string;
    grade: string | null;
    minor: string;
    currency: string;
    source: string;
    url: string | null;
  }>;
  metrics: Array<{ label: string; value: string }>;
  activity: Array<{
    id: string;
    action: string;
    actor: string;
    detail: string | null;
    occurredAt: string;
  }>;
  submissions: Array<{
    id: string;
    status: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewer: string | null;
    decision: string | null;
    note: string | null;
  }>;
  evidence: Array<{ slot: string; filename: string; status: string; url: string | null }>;
  initialOffering: {
    offeringId: string;
    status: string;
    totalUnits: string;
    offeredUnits: string;
    retainedUnits: string;
    offeredPercentageBps: number;
    retainedPercentageBps: number;
    pricePerUnitMinor: string;
    grossOfferingMinor: string;
    feeMinor: string;
    netOfferingMinor: string;
    currency: string;
    feeScheduleVersion: string;
    feeBps: number;
    changeRequestReason: string | null;
    approvedAt: string | null;
    openedAt: string | null;
    issuedAt: string | null;
    closedAt: string | null;
    inventory: {
      offeredUnits: string;
      availableUnits: string;
      reservedUnits: string;
      settledUnits: string;
    } | null;
    proceeds: {
      postedMinor: string;
      reservedMinor: string;
      availableMinor: string;
      currency: string;
    };
    collector: { id: string; displayName: string; username: string | null };
    readiness: { custody: boolean; insurance: boolean; publication: boolean; market: boolean };
    valuation: { minor: string; currency: string; asOf: string } | null;
    supplyPolicy: { status: string; units: string; pricePerUnitMinor: string } | null;
  } | null;
};

export type AdminCatalogueAsset = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  status: string;
  thumbnailUrl: string | null;
  identity: {
    category: string;
    year: number | null;
    manufacturer: string | null;
    set: string | null;
    cardNumber: string | null;
    edition: string | null;
    grading: {
      company: string;
      code: string;
      grade: string;
      label: string;
      certStatus: string;
    } | null;
  };
  provenance: {
    submissionId: string;
    submissionStatus: string;
    submittedAt: string | null;
    collector: string;
    username: string | null;
  } | null;
  testFixture: boolean;
  mediaState: string;
  verificationState: string;
  valuationState: string;
  custodyState: string;
  lineage: {
    submissionId: string | null;
    intakeId: string | null;
    reviewState: string | null;
  };
  valuation: { minor: string; currency: string; decidedAt: string } | null;
  nextAction: string;
  blockers: string[];
  marketReadiness: string;
  publicationState: string;
  ownership: { ownerCount: number; totalUnits: string | null; issuedUnits: string | null };
  marketLifecycle?: MarketLifecycleProjection;
  updatedAt: string;
};

export type AdminCatalogueResponse = {
  items: AdminCatalogueAsset[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: {
    total: number;
    inCustody: number;
    verificationPending: number;
    valuationPending: number;
    marketLive: number;
    exceptions: number;
    ownerPositions: number;
  };
  filterOptions?: {
    categories: string[];
    collectors: string[];
    gradingCompanies: string[];
  };
};

export type InitialOfferingProjection = {
  offeringId: string;
  assetId: string;
  status: string;
  totalUnits: string;
  offeredUnits: string;
  retainedUnits: string;
  offeredPercentageBps: number;
  retainedPercentageBps: number;
  pricePerUnitMinor: string;
  grossOfferingMinor: string;
  feeMinor: string;
  netOfferingMinor: string;
  currency: string;
  feeScheduleVersion: string;
  feeBps: number;
  changeRequestReason: string | null;
  approvedAt: string | null;
  openedAt: string | null;
  issuedAt: string | null;
  closedAt: string | null;
  inventory: {
    offeredUnits: string;
    availableUnits: string;
    reservedUnits: string;
    settledUnits: string;
  } | null;
  proceeds?: {
    postedMinor: string;
    reservedMinor: string;
    availableMinor: string;
    currency: string;
  };
};

export type InitialOfferingPreview = Omit<
  InitialOfferingProjection,
  | "offeringId"
  | "assetId"
  | "status"
  | "changeRequestReason"
  | "approvedAt"
  | "openedAt"
  | "issuedAt"
  | "closedAt"
  | "inventory"
  | "proceeds"
> & { valuationMinor: string; feePolicyStatus: string };

export interface AdminRepository {
  getOverview(): Promise<AdminOverview>;
  getRiskOperations(): Promise<AdminRiskOperations>;
  getPlatformDashboard(): Promise<AdminPlatformDashboard>;
  listPlatformRecords(input?: {
    tab?: string;
    q?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPlatformRecordsResponse>;
  getComplianceCase(id: string): Promise<AdminComplianceDetail>;
  getOperationsOverview(): Promise<AdminOperationsOverview>;
  listCatalogueAssets(input?: {
    q?: string;
    status?: string;
    category?: string;
    physicalState?: string;
    verification?: string;
    valuation?: string;
    market?: string;
    grading?: string;
    collector?: string;
    fixture?: "NORMAL" | "TEST" | "ALL";
    needsAction?: boolean;
    sort?: string;
    sortDirection?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  }): Promise<AdminCatalogueResponse>;
  listIntake(input?: {
    status?: string;
    q?: string;
    vaultId?: string;
    carrier?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    sortDirection?: "asc" | "desc";
    fixture?: "NORMAL" | "TEST" | "ALL";
    limit?: number;
  }): Promise<AdminIntakeResponse>;
  setIntakeDestinationApproval(
    id: string,
    input: { operationallyApproved: boolean; acceptingShipments: boolean; reason: string },
  ): Promise<{
    id: string;
    displayName: string;
    operationallyApproved: boolean;
    acceptingShipments: boolean;
    audited: boolean;
  }>;
  confirmIntakeReceipt(
    id: string,
    input?: {
      packageCondition?: string;
      checklist?: Record<string, boolean>;
      notes?: string;
    },
  ): Promise<{ intakeId: string; status: string; confirmedAt: string }>;
  completeStagingDemoPhysicalIntake(
    submissionId: string,
    input: { assetId: string; reason: string },
  ): Promise<{ demoIntakeId: string; status: string; replayed: boolean }>;
  startIntakeVerification(
    id: string,
  ): Promise<{ intakeId: string; status: string; startedAt: string }>;
  completeIntakeVerification(
    id: string,
    input: {
      identityMatch: boolean;
      certificationMatch?: boolean | null;
      gradeMatch?: boolean | null;
      variantMatch?: boolean | null;
      note?: string;
    },
  ): Promise<{ intakeId: string; status: string; completedAt: string }>;
  createIntakeException(
    id: string,
    input: { code: string; severity: "LOW" | "MEDIUM" | "HIGH"; notes: string },
  ): Promise<{ id: string; code: string; severity: string }>;
  resolveIntakeException(
    id: string,
    exceptionId: string,
    input: { note: string },
  ): Promise<{ id: string; resolvedAt: string }>;
  listMemberships(input?: {
    status?: string;
    plan?: string;
    q?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    sortDirection?: "asc" | "desc";
    billing?: string;
    usage?: string;
    fixture?: "NORMAL" | "TEST" | "ALL";
    needsAction?: boolean;
  }): Promise<AdminMembershipDirectoryResponse>;
  getMembershipDetail(id: string): Promise<AdminMembershipDetailResponse>;
  listUsers(input?: {
    q?: string;
    role?: string;
    status?: string;
    type?: string;
    membershipPlan?: string;
    membershipStatus?: string;
    financialState?: string;
    complianceState?: string;
    payoutState?: string;
    attention?: string;
    fixture?: string;
    joinedFrom?: string;
    joinedTo?: string;
    lastActiveWindow?: string;
    sort?: string;
    sortDirection?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    cursor?: string;
    limit?: number;
  }): Promise<{
    items: AdminUserSummary[];
    nextCursor: string | null;
    total: number;
    summary: AdminAccountsSummary;
  }>;
  getUser(id: string): Promise<AdminUserDetail>;
  getUserHistory(input: {
    id: string;
    category?:
      | "ALL"
      | "SECURITY"
      | "FINANCIAL"
      | "TRADING"
      | "COMPLIANCE"
      | "ACCOUNT"
      | "COLLECTOR"
      | "ADMIN"
      | "PROVIDER";
    page?: number;
    pageSize?: number;
  }): Promise<AdminAccountHistoryResponse>;
  transitionUserStatus(
    id: string,
    input: { toStatus: string; reasonCode: string; restore?: boolean },
  ): Promise<{ userId: string; accountStatus: string }>;
  grantUserRole(
    id: string,
    input: { role: string; scopeType?: "GLOBAL"; scopeId?: "*" },
  ): Promise<{ assignmentId: string; userId: string; role: string }>;
  revokeUserRole(
    id: string,
    assignmentId: string,
  ): Promise<{ assignmentId: string; userId: string; revoked: boolean }>;
  setCollectorFeatured(
    slug: string,
    featured: boolean,
  ): Promise<{ slug: string; isFeatured: boolean; featuredAt: string | null }>;
  listComplianceCases(input?: { limit?: number }): Promise<{ items: AdminComplianceCase[] }>;
  getFinanceSummary(): Promise<AdminFinanceSummary>;
  getFinanceDashboard(): Promise<AdminFinanceDashboard>;
  listFinanceRecords(input?: {
    tab?: string;
    q?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminFinanceRecordsResponse>;
  getTrustSupportDashboard(): Promise<AdminTrustSupportDashboard>;
  listTrustSupportRecords(input?: {
    tab?: string;
    q?: string;
    status?: string;
    type?: string;
    severity?: string;
    priority?: string;
    scope?: string;
    source?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminTrustSupportRecordsResponse>;
  getIntegrations(): Promise<AdminIntegrationsSummary>;
  search(query: string, limit?: number): Promise<{ items: AdminSearchResult[] }>;
  getCollectibleDetail(id: string, tab?: string): Promise<AdminCollectibleDetail>;
  refreshMarketData(id: string): Promise<{
    assetId: string;
    queued: number;
    cooldownUntil: string | null;
  }>;
  proposeOwnershipSupply(
    id: string,
    input: { policyCode: string; totalUnits: string; reason: string },
  ): Promise<{
    assetId: string;
    status: string;
    units: string;
    pricePerUnitMinor: string;
    remainderMinor: string;
  }>;
  approveOwnershipSupply(
    id: string,
    reason: string,
  ): Promise<{
    assetId: string;
    status: string;
    units: string;
    pricePerUnitMinor: string;
    remainderMinor: string;
  }>;
  issueOwnership(
    id: string,
    totalUnits: string,
  ): Promise<{
    assetId: string;
    status: string;
    totalUnits: string;
    issuedUnits: string;
    availableUnits: string;
    issuedAt: string;
    sequence: string;
  }>;
  activateTradingMarket(id: string): Promise<{ assetId: string; status: string }>;
  approveInitialOffering(id: string, reason: string): Promise<InitialOfferingProjection>;
  requestInitialOfferingChanges(id: string, reason: string): Promise<InitialOfferingProjection>;
  openInitialOffering(id: string): Promise<InitialOfferingProjection>;
  pauseInitialOffering(id: string): Promise<InitialOfferingProjection>;
  cancelInitialOffering(id: string): Promise<InitialOfferingProjection>;
}

export interface MarketRepository {
  getMarketSummary(): Promise<MarketSummary>;
  getMarketSnapshot(): Promise<import("@/domain").MarketSnapshot>;
  getSimilarAssets(assetId: AssetId, limit?: number): Promise<SimilarAsset[]>;
  getPriceHistory(assetId: AssetId, range: TimeRange): Promise<import("@/domain").PriceHistory>;
  getMarketMovers(): Promise<Asset[]>;
  getRecentTrades(assetId: AssetId): Promise<import("@/domain").Trade[]>;
  getOrderBook(assetId: AssetId): Promise<OrderBook>;
}

export interface PortfolioRepository {
  getPortfolio(): Promise<PortfolioSummary>;
  getHoldings(): Promise<PortfolioHolding[]>;
  getHoldingsPage?(input?: {
    page?: number;
    pageSize?: number;
    q?: string;
    category?: string;
    sort?: import("@/domain").PortfolioHoldingSort;
  }): Promise<import("@/domain").PortfolioHoldingPage>;
  getLots(): Promise<PortfolioLot[]>;
  getTransactions(input?: { cursor?: string; limit?: number }): Promise<PortfolioTransactionPage>;
  getPerformance(range?: PortfolioPerformanceRange): Promise<PortfolioPerformance>;
  getWalletInsights(): Promise<WalletInsights>;
}

export interface CollectorRepository {
  listCollectors(): Promise<CollectorProfile[]>;
  listPublicCollectors(input?: {
    cursor?: string;
    limit?: number;
    q?: string;
    specialty?: string;
    sort?: CollectorDirectorySort;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  }): Promise<CollectorDirectoryPage>;
  getCollector(id: UserId): Promise<CollectorProfile | null>;
  followCollector(id: UserId): Promise<void>;
  unfollowCollector(id: UserId): Promise<void>;
}
export interface CollectorWorkspaceRepository {
  getOverview(): Promise<import("@/domain").CollectorWorkspaceOverview>;
  getCollectibles(): Promise<import("@/domain").CollectorWorkspaceAsset[]>;
  getCollectibleDetail(id: string): Promise<{
    asset: import("@/domain").CollectorWorkspaceAsset;
    requests: Array<CollectorWorkspaceRequest>;
    lifecycle: import("@/domain").CollectorWorkspaceLifecycle;
    activity: Array<{
      id: string;
      type: string;
      title: string;
      detail: string;
      occurredAt: string;
    }>;
  }>;
  getInitialOfferingPreview(
    assetId: string,
    percentageBps: number,
  ): Promise<InitialOfferingPreview>;
  getInitialOffering(assetId: string): Promise<InitialOfferingProjection>;
  proposeInitialOffering(assetId: string, offeredUnits: string): Promise<InitialOfferingProjection>;
  updateInitialOffering(
    offeringId: string,
    offeredUnits: string,
  ): Promise<InitialOfferingProjection>;
  getRequests(): Promise<Array<CollectorWorkspaceRequest>>;
  getDocuments(): Promise<Array<CollectorWorkspaceDocument>>;
  search(query: string): Promise<{
    items: Array<{ entityType: string; title: string; subtitle: string; route: string }>;
  }>;
  updatePublicProfile(input: {
    headline?: string | null;
    specialism?: string | null;
    isPublic?: boolean;
  }): Promise<{
    slug: string;
    headline: string | null;
    specialism: string | null;
    isPublic: boolean;
  }>;
  getSubscription(): Promise<CollectorSubscriptionProjection>;
  getPlans(): Promise<CollectorPlanProjection[]>;
  subscriptionAction(
    action: "CHECKOUT" | "PORTAL" | "CHANGE_PLAN" | "CANCEL" | "RESUME",
    planCode?: "STARTER" | "PRO" | "ELITE",
  ): Promise<CollectorMembershipActionResult>;
  listVaults(): Promise<CollectorVaultProjection[]>;
  selectVault(submissionId: string, vaultId: string): Promise<unknown>;
  addShipment(
    submissionId: string,
    input: { carrier: string; trackingNumber: string; shippedAt: string; notes?: string },
  ): Promise<unknown>;
  deleteDraft(
    submissionId: string,
    version: number,
  ): Promise<{ submissionId: string; deleted: boolean }>;
}

export type CollectorSubscriptionProjection = {
  current: {
    id: string;
    code: "STARTER" | "PRO" | "ELITE";
    displayName: string;
    description: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    entitlements: Record<string, unknown>;
    provider: string | null;
    paymentMethod: {
      brand: string;
      last4: string;
      expiryMonth?: number;
      expiryYear?: number;
    } | null;
  } | null;
  plans: Array<{
    code: "STARTER" | "PRO" | "ELITE";
    displayName: string;
    description: string;
    monthlyPriceMinor: string;
    currency: string;
    billingInterval: string;
    entitlements: Record<string, unknown>;
    recommended: boolean;
    availability: string;
  }>;
  usage: {
    activeCollectibles: number;
    maxActiveCollectibles: number | null;
    openSubmissions: number;
    maxOpenSubmissions: number | null;
    openDrafts: number;
    maxOpenDrafts: number | null;
    monthlySubmissionsUsed: number;
    maxMonthlySubmissions: number | null;
    concurrentIntake: number;
    maxConcurrentIntake: number | null;
    remainingCatalogueCapacity: number | null;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    monthlySubmissions: number;
  };
  billing: {
    configured: boolean;
    provider: string | null;
    paymentMethod: {
      brand: string;
      last4: string;
      expiryMonth?: number;
      expiryYear?: number;
    } | null;
    nextBillingDate: string | null;
  };
};

export type CollectorMembershipActionResult = {
  action: "CHECKOUT" | "PORTAL" | "CHANGE_PLAN" | "CANCEL" | "RESUME";
  status: "REDIRECT" | "PROCESSING" | "COMPLETED";
  checkoutUrl?: string;
  portalUrl?: string;
  planCode?: "STARTER" | "PRO" | "ELITE";
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export type CollectorPlanProjection = {
  id: "STARTER" | "PRO" | "ELITE";
  code: "STARTER" | "PRO" | "ELITE";
  displayName: string;
  description: string;
  monthlyPriceMinor: string;
  currency: string;
  billingInterval: string;
  entitlements: Record<string, unknown>;
  recommended: boolean;
  availability: string;
};

export type CollectorVaultProjection = {
  id: string;
  displayName: string;
  region: string;
  countryCode: string;
  acceptedCategories: unknown;
  shippingInstructions: string;
  customerSafeAddress: string;
};

export type CollectorWorkspaceRequest = {
  id: string;
  submissionId: string;
  collectibleId: string | null;
  destination: string;
  status: "OPEN";
  type:
    | "CHOOSE_VAULT"
    | "ADD_REQUIRED_EVIDENCE"
    | "CHANGES_REQUESTED"
    | "ADD_TRACKING"
    | "SHIPPING_EXCEPTION"
    | "PROVIDE_INFORMATION";
  category: "SUBMISSION" | "SHIPPING" | "INFORMATION";
  priority: "BLOCKING" | "IMPORTANT" | "REMINDER";
  reason: string;
  badge: string;
  action: string;
  actionLabel: string;
  targetRoute: string;
  asset: import("@/domain").CollectorWorkspaceAsset;
};

export type CollectorWorkspaceDocument = {
  id: string;
  submissionId: string;
  collectibleId: string | null;
  title: string;
  slot: string;
  label: string;
  filename: string;
  status: string;
  uploadedAt: string;
};

export interface OwnershipRepository {
  getWatchlist(userId: UserId): Promise<Watchlist>;
  toggleWatchlistAsset(userId: UserId, assetId: AssetId): Promise<Watchlist>;
  getPublicIssuance(assetSlug: string): Promise<{
    status: string;
    totalUnits: string;
    issuedUnits: string;
    issuedAt: string | null;
  } | null>;
  getOwnMarketPosition(assetSlug: string): Promise<{
    settledUnits: string;
    reservedUnits: string;
    availableUnits: string;
  } | null>;
}
export interface TradingRepository {
  /** Document 014 authority. API mode must use these operations, not local demos. */
  previewOrder(input: TradingOrderInput): Promise<TradingOrderPreview>;
  previewOwnershipOrder(input: OwnershipPreviewInput): Promise<OwnershipOrderPreview>;
  previewPublicOwnershipOrder(input: OwnershipPreviewInput): Promise<OwnershipOrderPreview>;
  getOwnershipMarketSummary(assetSlug: string): Promise<OwnershipMarketSummary>;
  placeOrder(input: TradingOrderInput): Promise<TradingOrderView>;
  cancelOrder(orderId: string): Promise<TradingOrderView>;
  listOwnOrders(input?: {
    cursor?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
    q?: string;
    side?: TradingOrderSide;
    status?: TradingOrderStatus;
    assetClass?: string;
    from?: string;
  }): Promise<TradingOrderPage>;
  listOwnExecutions(input?: { cursor?: string; limit?: number }): Promise<TradingExecutionPage>;
  // Explicit mock-mode compatibility for unrelated legacy routes only.
  previewBuyOrder(assetId: AssetId, units: number): Promise<OrderPreview>;
  previewSellOrder(assetId: AssetId, units: number): Promise<OrderPreview>;
  createDemoOrder(input: Omit<Order, "id" | "createdAt" | "status">): Promise<Order>;
  cancelDemoOrder(orderId: import("@/domain").OrderId): Promise<Order>;
  listOrders(userId: UserId): Promise<Order[]>;
}
export interface VaultRepository {
  getVaultAssetStatus(assetId: AssetId): Promise<VaultAssetStatus | null>;
  getPublicEvents(input?: { cursor?: string; limit?: number; signal?: AbortSignal }): Promise<{
    items: Array<{
      id: string;
      type: string;
      occurredAt: string;
      publicSummary: string;
      assetSlug: string;
    }>;
    nextCursor: string | null;
  }>;
  getPublicSummary(): Promise<{ authority: string; eventCount: number }>;
  getPublicLive(): Promise<VaultLiveProjection>;
}
export type VaultLiveAsset = {
  publicId: string;
  slug: string;
  title: string;
  shortName: string | null;
  year: number | null;
  category: { slug: string; name: string };
  collectibleSet: { slug: string; name: string } | null;
  grading: { companyCode: string; grade: string; label: string } | null;
  market: {
    estimatedValueMinor: string;
    currency: string;
    change24hBps: number;
    availableBps: number | null;
    ownersCount: number | null;
    confidence: number | null;
    asOf: string;
    dataStatus: string;
  } | null;
};
export type VaultLiveProjection = {
  dataStatus: "LIVE_PUBLIC_PROJECTION";
  windowStartedAt: string;
  metrics: {
    publicVaultEvents: number;
    newlyPublished: number;
    valuationsUpdated: number;
    marketActivity: string;
  };
  featuredAsset: VaultLiveAsset | null;
  recentEvents: Array<{
    id: string;
    publicLabel: string;
    occurredAt: string;
    publicSummary: string;
    asset: VaultLiveAsset;
  }>;
  recentlyReviewed: VaultLiveAsset[];
  readiness: VaultLiveAsset[];
  publishedAssets: VaultLiveAsset[];
  marketActivity: Array<{
    asset: VaultLiveAsset;
    units: string;
    latestPriceMinor: string;
    occurredAt: string;
  }>;
  categories: Array<{ slug: string; name: string }>;
  eventAssetCount: number;
};
export interface WalletRepository {
  getBalances(userId: UserId): Promise<WalletBalance[]>;
  getTransactions(userId: UserId): Promise<WalletTransaction[]>;
}
export interface ProviderRepository {
  getCompliance(): Promise<ComplianceSummary>;
  startCompliance(): Promise<ComplianceSession>;
  getIdentityDetails(): Promise<IdentityDetailsProjection>;
  createBankLinkCheckout(): Promise<BankConnectionCheckoutSession>;
  completeBankLink(input: {
    checkoutSessionId: string;
  }): Promise<{ connections: BankConnection[]; replayed: boolean }>;
  listBankConnections(): Promise<BankConnection[]>;
  requestBankDisconnectChallenge(id: string): Promise<{
    required: boolean;
    method: "TOTP" | "SMS" | null;
    challenge: string | null;
    phone: string | null;
    expiresAt: string | null;
  }>;
  disconnectBankConnection(input: {
    id: string;
    confirmed: true;
    mfaCode?: string;
    mfaChallenge?: string;
  }): Promise<{ disconnected: boolean; replayed: boolean; pendingMovementCount?: number }>;
  setDefaultBankConnection(id: string): Promise<{ selected: boolean }>;
  getConnectPayoutSetup(): Promise<ConnectPayoutSetup>;
  getFeePolicy(): Promise<FeePolicy>;
  createConnectOnboarding(): Promise<ConnectPayoutSetup>;
  refreshConnectOnboarding(): Promise<ConnectPayoutSetup>;
  getWithdrawalPreflight(input?: { amountMinor?: string }): Promise<WithdrawalPreflight>;
  listMovements(input?: { cursor?: string; limit?: number }): Promise<WalletMovementPage>;
  createDeposit(amountMinor: string): Promise<WalletMovementView>;
  createWithdrawal(input: {
    amountMinor: string;
    destinationReference?: string;
    destinationChain?: string;
  }): Promise<WalletMovementView>;
}
export interface NotificationRepository {
  listNotifications(userId: UserId): Promise<Notification[]>;
  getUnreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}
export interface DiscussionRepository {
  listDiscussions(assetId: AssetId): Promise<DiscussionMessage[]>;
  reactToDiscussion(id: string, emoji: string): Promise<void>;
}
export interface SaleProposalRepository {
  getSaleProposal(id: string): Promise<SaleProposal | null>;
  listSaleProposals(input?: {
    status?: SaleProposal["status"];
    assetId?: AssetId;
    viewerRelevant?: boolean;
    cursor?: string;
    limit?: number;
  }): Promise<SaleProposalPage>;
  createSaleProposal(
    assetId: AssetId,
    offerMinor: string,
  ): Promise<{ proposalId: string; status: SaleProposal["status"]; replayed: boolean }>;
  openSaleProposal(
    id: string,
  ): Promise<{ proposalId: string; status: SaleProposal["status"]; replayed: boolean }>;
  closeSaleProposal(
    id: string,
  ): Promise<{ proposalId: string; status: SaleProposal["status"]; replayed: boolean }>;
  vote(id: string, choice: "APPROVE" | "REJECT"): Promise<{ replayed: boolean }>;
}
export interface UserRepository {
  getCurrentUser(): Promise<{
    id: string;
    email: string;
    createdAt: string;
    accountStatus: string;
    emailVerificationStatus: "VERIFIED" | "UNVERIFIED";
    roles: string[];
    profile: {
      displayName: string;
      username: string | null;
      usernameChangedAt: string | null;
      avatarReference: string | null;
      countryCode: string;
      preferredCurrency: SupportedCurrency;
      timezone: string;
    };
  }>;
  updateCurrentProfile(input: {
    displayName?: string;
    username?: string;
    countryCode?: string;
    timezone?: string;
  }): Promise<void>;
  getDiscordLink(): Promise<{
    connected: boolean;
    configured: boolean;
    username: string | null;
    displayName: string | null;
    linkedAt: string | null;
  }>;
  beginDiscordLink(): Promise<{ authorizationUrl: string }>;
  consumeDiscordBotLink(challenge: string): Promise<{ connected: boolean }>;
  disconnectDiscordLink(): Promise<{ disconnected: boolean }>;
}

/** Public and session-establishing identity contracts. Policy values are supplied
 * by the server so consent and CAPTCHA requirements cannot drift in the client. */
export interface AuthRepository {
  getSignupPolicy(): Promise<{
    captcha: {
      required: boolean;
      siteKey: string | null;
      localTest: boolean;
    };
    consent: {
      required: boolean;
      termsVersion: string | null;
      privacyVersion: string | null;
    };
  }>;
  signup(
    input: {
      displayName: string;
      username: string;
      email: string;
      password: string;
      captchaToken?: string;
      consent?: {
        termsAccepted: true;
        privacyAccepted: true;
        termsVersion: string;
        privacyVersion: string;
      };
    },
    idempotencyKey?: string,
  ): Promise<{ accessToken: string }>;
  usernameAvailability(username: string): Promise<{ username: string; available: boolean }>;
}

/** Safe self-service account contracts.  These deliberately contain no tokens,
 * internal identifiers, audit metadata, or provider credentials. */
export interface AccountRepository {
  getCapabilities(): Promise<{ capabilities: AccountCapability[] }>;
  grantCollectorBeta(): Promise<{
    status: "APPROVED";
    role: "COLLECTOR";
    granted: boolean;
    assignmentId?: string;
  }>;
  getEmailVerification(): Promise<{ verified: boolean; verifiedAt: string | null }>;
  sendEmailVerification(): Promise<{ alreadyVerified: boolean; resendAvailableAt: string | null }>;
  confirmEmailVerification(token: string): Promise<{ verified: boolean; verifiedAt: string }>;
  getPhoneVerification(): Promise<{
    phone: string | null;
    pendingPhone?: string | null;
    verified: boolean;
    verifiedAt: string | null;
    canResend?: boolean;
    resendAvailableAt: string | null;
  }>;
  sendPhoneVerification(
    phone: string,
    country?: string,
  ): Promise<{ alreadyVerified: boolean; resendAvailableAt: string | null }>;
  confirmPhoneVerification(
    code: string,
  ): Promise<{ verified: boolean; verifiedAt: string; phone: string }>;
  removePhoneVerification(): Promise<{ removed: boolean }>;
  getTwoFactor(): Promise<{
    enabled: boolean;
    enabledAt: string | null;
    method?: "TOTP" | "SMS" | null;
    methods?: Array<"TOTP" | "SMS">;
    phoneVerified?: boolean;
    phone?: string | null;
  }>;
  beginTwoFactorEnrollment(): Promise<{
    issuer: string;
    accountLabel: string;
    manualEntryKey: string;
    otpauthUri: string;
    expiresAt: string;
  }>;
  confirmTwoFactorEnrollment(code: string): Promise<{ recoveryCodes: string[] }>;
  beginSmsTwoFactorEnrollment(): Promise<{
    phone: string;
    resendAvailableAt: string;
  }>;
  confirmSmsTwoFactorEnrollment(code: string): Promise<{ recoveryCodes: string[] }>;
  regenerateRecoveryCodes(): Promise<{ recoveryCodes: string[] }>;
  disableTwoFactor(input: {
    method?: "TOTP" | "SMS";
    code?: string;
    recoveryCode?: string;
  }): Promise<{ disabled: boolean }>;
  confirmRecentAuth(password: string): Promise<{ confirmedAt: string }>;
  listSessions(): Promise<{
    sessions: Array<{
      reference: string;
      currentSession: boolean;
      createdAt: string;
      lastUsedAt: string;
      expiresAt: string;
      deviceLabel: string | null;
    }>;
  }>;
  revokeSession(reference: string): Promise<{ currentSessionRevoked: boolean }>;
  revokeOtherSessions(): Promise<{ revokedSessionCount: number }>;
  getPreferences(): Promise<{
    timezone: string;
    locale: "en-GB" | "en-US";
    preferredCurrency: SupportedCurrency;
  }>;
  updatePreferences(
    input: Partial<{
      timezone: string;
      locale: "en-GB" | "en-US";
      preferredCurrency: SupportedCurrency;
    }>,
  ): Promise<{ timezone: string; locale: "en-GB" | "en-US"; preferredCurrency: SupportedCurrency }>;
  getNotificationPreferences(): Promise<{
    preferences: Array<{
      topic: "ORDER_UPDATES" | "PORTFOLIO_UPDATES";
      channel: "IN_APP";
      enabled: boolean;
    }>;
  }>;
  updateNotificationPreferences(
    preferences: Array<{
      topic: "ORDER_UPDATES" | "PORTFOLIO_UPDATES";
      enabled: boolean;
    }>,
  ): Promise<{
    preferences: Array<{
      topic: "ORDER_UPDATES" | "PORTFOLIO_UPDATES";
      channel: "IN_APP";
      enabled: boolean;
    }>;
  }>;
  getActivity(input?: { cursor?: string; limit?: number }): Promise<{
    items: Array<{
      reference: string;
      type: string;
      title: string;
      description: string;
      createdAt: string;
    }>;
    nextCursor: string | null;
  }>;
  requestDataExport(): Promise<{ exportedAt: string; format: "JSON"; data: unknown }>;
  getDeletionRequest(): Promise<{
    status: string;
    requestedAt: string;
    updatedAt: string;
    cancelledAt: string | null;
    blockedReason: string | null;
    canCancel: boolean;
  } | null>;
  requestDeletion(input: { reason?: string }): Promise<{
    status: string;
    requestedAt: string;
    updatedAt: string;
    cancelledAt: string | null;
    blockedReason: string | null;
    canCancel: boolean;
  }>;
  cancelDeletion(): Promise<{
    status: string;
    requestedAt: string;
    updatedAt: string;
    cancelledAt: string | null;
    blockedReason: string | null;
    canCancel: boolean;
  }>;
  deactivate(input: { reason?: string }): Promise<{ accountStatus: string; deactivatedAt: string }>;
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ changed: boolean }>;
}

export interface AppRepositories {
  assets: AssetRepository;
  catalogue: CatalogueRepository;
  submissions: SubmissionRepository;
  reviews: SubmissionReviewRepository;
  lifecycle: AssetLifecycleRepository;
  admin: AdminRepository;
  market: MarketRepository;
  portfolio: PortfolioRepository;
  collectors: CollectorRepository;
  collectorWorkspace: CollectorWorkspaceRepository;
  ownership: OwnershipRepository;
  trading: TradingRepository;
  vault: VaultRepository;
  wallet: WalletRepository;
  providers: ProviderRepository;
  notifications: NotificationRepository;
  discussions: DiscussionRepository;
  proposals: SaleProposalRepository;
  users: UserRepository;
  auth: AuthRepository;
  account: AccountRepository;
  currency?: { getRates(): Promise<CurrencyRates | null> };
}
