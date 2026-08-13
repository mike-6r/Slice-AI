import type {
  Asset,
  AssetId,
  CollectorProfile,
  DiscussionMessage,
  MarketSummary,
  Notification,
  Order,
  OrderBook,
  OrderPreview,
  TradingExecutionPage,
  TradingOrderInput,
  TradingOrderPage,
  TradingOrderPreview,
  TradingOrderView,
  PortfolioHolding,
  PortfolioLot,
  PortfolioSummary,
  PortfolioTransactionPage,
  ComplianceSession,
  ComplianceSummary,
  BankConnection,
  PlaidLinkToken,
  PriceAlert,
  PricePoint,
  SaleProposal,
  SaleProposalPage,
  AssetSubmission,
  AssetOperationSummary,
  CreateSubmissionDraft,
  CollectibleReferenceImport,
  SubmissionCategory,
  SubmissionDetail,
  SubmissionReviewDetail,
  SubmissionReviewQueueResponse,
  SubmissionReviewSummary,
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
  Watchlist,
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
    signal?: AbortSignal;
  }): Promise<{ items: Asset[]; hasMore: boolean; nextCursor: string | null }>;
  getAssetById(id: AssetId): Promise<Asset | null>;
  searchAssets(query: string): Promise<Asset[]>;
  getFeaturedAssets(): Promise<Asset[]>;
  getTrendingAssets(): Promise<Asset[]>;
}
export interface CatalogueRepository {
  listSubmissionCategories(): Promise<SubmissionCategory[]>;
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
    submittedFrom?: string;
    submittedTo?: string;
    sort?: "submitted" | "priority" | "collector" | "research" | "evidence";
    sortDirection?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  }): Promise<SubmissionReviewQueueResponse>;
  getDetail(id: string): Promise<SubmissionReviewDetail>;
  claim(id: string): Promise<{ submissionId: string; status: string }>;
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
}
export interface AssetLifecycleRepository {
  listOperations(): Promise<AssetOperationSummary[]>;
  handoff(assetId: string): Promise<{ assetId: string; custodyStatus: string }>;
  transitionCustody(
    assetId: string,
    toStatus: string,
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
  activeUsers: number;
  restricted: number;
  pastDueMemberships: number;
  trialingMemberships: number;
};

export type AdminUserDetail = AdminUserSummary & {
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
    totalInvestedMinor: string;
    totalWithdrawnMinor: string;
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
  activitySnapshot: Array<{ id: string; action: string; resourceType: string; occurredAt: string }>;
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
    status: "Operational" | "Degraded" | "Unavailable" | "Unknown";
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
    status: "Operational" | "Degraded" | "Unavailable" | "Unknown";
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

export type AdminFinanceSummary = {
  currency: "GBP";
  pendingMovements: number;
  exceptions: number;
  reconciliationMismatches: number;
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
  generatedAt: string;
};

export type AdminIntakeRow = {
  id: string;
  submissionId: string;
  intakeReference: string | null;
  title: string;
  category: string | null;
  variant: string | null;
  grader: string | null;
  grade: string | null;
  itemCount: number;
  collector: { id: string; displayName: string; username: string | null };
  membership: string | null;
  submissionStatus: string;
  stage: string;
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
  valuationStatus: string | null;
  custodyStatus: string | null;
  exception: { code: string; label: string; severity: "LOW" | "MEDIUM" | "HIGH" } | null;
};

export type AdminIntakeOverview = {
  all: number;
  accepted: number;
  shipped: number;
  delivered: number;
  received: number;
  verified: number;
  readyForVault: number;
  exceptions: number;
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
    vaults: Array<{ id: string; displayName: string; code: string | null }>;
    carriers: string[];
  };
};

export type AdminMembershipRow = {
  id: string;
  collector: { id: string; displayName: string; username: string | null; email: string };
  plan: { code: string; displayName: string; monthlyPriceMinor: string; currency: string };
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: {
    activeCollectibles: number;
    activeCollectiblesLimit: number | null;
    monthlySubmissions: number;
    monthlySubmissionsLimit: number | null;
    concurrentIntake: number;
    concurrentIntakeLimit: number | null;
    billingPeriodStart: string;
    billingPeriodEnd: string;
  };
  submissionCount: number;
  updatedAt: string;
};

export type AdminSearchResult = {
  entityType: "USER" | "COLLECTIBLE" | "SUBMISSION" | "CASE";
  id: string;
  title: string;
  subtitle: string;
  target: string;
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
  };
  lifecycle: {
    current: string;
    stages: Array<{
      key: string;
      label: string;
      state: "complete" | "current" | "upcoming" | "exception";
      at: string | null;
    }>;
  };
  collector: {
    id: string;
    displayName: string;
    username: string | null;
    memberSince: string;
    submissions: number;
    accepted: number;
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
    location: string | null;
    receivedAt: string | null;
    securedAt: string | null;
    history: Array<{ status: string; at: string }>;
  };
  market: {
    publication: string;
    asking: { minor: string; currency: string } | null;
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
};

export interface AdminRepository {
  getOverview(): Promise<AdminOverview>;
  getRiskOperations(): Promise<AdminRiskOperations>;
  getComplianceCase(id: string): Promise<AdminComplianceDetail>;
  getOperationsOverview(): Promise<AdminOperationsOverview>;
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
    limit?: number;
  }): Promise<AdminIntakeResponse>;
  confirmIntakeReceipt(
    id: string,
  ): Promise<{ intakeId: string; status: string; confirmedAt: string }>;
  listMemberships(input?: {
    status?: string;
    q?: string;
    limit?: number;
  }): Promise<{ items: AdminMembershipRow[] }>;
  listUsers(input?: {
    q?: string;
    role?: string;
    status?: string;
    type?: string;
    membershipPlan?: string;
    membershipStatus?: string;
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
  listComplianceCases(input?: { limit?: number }): Promise<{ items: AdminComplianceCase[] }>;
  getFinanceSummary(): Promise<AdminFinanceSummary>;
  getIntegrations(): Promise<AdminIntegrationsSummary>;
  search(query: string, limit?: number): Promise<{ items: AdminSearchResult[] }>;
  getCollectibleDetail(id: string, tab?: string): Promise<AdminCollectibleDetail>;
}

export interface MarketRepository {
  getMarketSummary(): Promise<MarketSummary>;
  getPriceHistory(assetId: AssetId, range: TimeRange): Promise<PricePoint[]>;
  getMarketMovers(): Promise<Asset[]>;
  getRecentTrades(assetId: AssetId): Promise<import("@/domain").Trade[]>;
  getOrderBook(assetId: AssetId): Promise<OrderBook>;
}

export interface PortfolioRepository {
  getPortfolio(): Promise<PortfolioSummary>;
  getHoldings(): Promise<PortfolioHolding[]>;
  getLots(): Promise<PortfolioLot[]>;
  getTransactions(input?: { cursor?: string; limit?: number }): Promise<PortfolioTransactionPage>;
}

export interface CollectorRepository {
  listCollectors(): Promise<CollectorProfile[]>;
  listPublicCollectors(input?: {
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<{ items: CollectorProfile[]; nextCursor: string | null }>;
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
  ): Promise<never>;
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
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    entitlements: Record<string, unknown>;
    provider: string | null;
  } | null;
  plans: Array<{
    code: "STARTER" | "PRO" | "ELITE";
    displayName: string;
    monthlyPriceMinor: string;
    currency: string;
    entitlements: Record<string, unknown>;
    recommended: boolean;
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

export type CollectorPlanProjection = {
  id: "STARTER" | "PRO" | "ELITE";
  displayName: string;
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
  placeOrder(input: TradingOrderInput): Promise<TradingOrderView>;
  cancelOrder(orderId: string): Promise<TradingOrderView>;
  listOwnOrders(input?: { cursor?: string; limit?: number }): Promise<TradingOrderPage>;
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
  createBankLinkToken(): Promise<PlaidLinkToken>;
  exchangeBankLinkPublicToken(
    publicToken: string,
  ): Promise<{ connections: BankConnection[]; replayed: boolean }>;
  listBankConnections(): Promise<BankConnection[]>;
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
  getEmailVerification(): Promise<{ verified: boolean; verifiedAt: string | null }>;
  sendEmailVerification(): Promise<{ alreadyVerified: boolean; resendAvailableAt: string | null }>;
  confirmEmailVerification(token: string): Promise<{ verified: boolean; verifiedAt: string }>;
  getPhoneVerification(): Promise<{
    phone: string | null;
    verified: boolean;
    verifiedAt: string | null;
  }>;
  sendPhoneVerification(
    phone: string,
  ): Promise<{ alreadyVerified: boolean; resendAvailableAt: string | null }>;
  confirmPhoneVerification(
    phone: string,
    code: string,
  ): Promise<{ verified: boolean; verifiedAt: string; phone: string }>;
  getTwoFactor(): Promise<{ enabled: boolean; enabledAt: string | null }>;
  beginTwoFactorEnrollment(): Promise<{
    issuer: string;
    accountLabel: string;
    manualEntryKey: string;
    otpauthUri: string;
  }>;
  confirmTwoFactorEnrollment(code: string): Promise<{ recoveryCodes: string[] }>;
  regenerateRecoveryCodes(): Promise<{ recoveryCodes: string[] }>;
  disableTwoFactor(input: { code?: string; recoveryCode?: string }): Promise<{ disabled: boolean }>;
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
