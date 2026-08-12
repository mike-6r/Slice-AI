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
  SubmissionCategory,
  SubmissionDetail,
  SubmissionReviewDetail,
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
  listQueue(input?: { cursor?: string; limit?: number }): Promise<{
    items: SubmissionReviewSummary[];
    nextCursor: string | null;
  }>;
  getDetail(id: string): Promise<SubmissionReviewDetail>;
  claim(id: string): Promise<{ submissionId: string; status: string }>;
  decide(
    id: string,
    decision: "CHANGES_REQUESTED" | "APPROVED" | "REJECTED",
    input: { reasonCode: string; note?: string },
  ): Promise<AssetSubmission>;
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
}

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
      preferredCurrency: "GBP";
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
  getPreferences(): Promise<{ timezone: string; locale: "en-GB" | "en-US" }>;
  updatePreferences(
    input: Partial<{ timezone: string; locale: "en-GB" | "en-US" }>,
  ): Promise<{ timezone: string; locale: "en-GB" | "en-US" }>;
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
}
