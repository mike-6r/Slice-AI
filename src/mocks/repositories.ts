/** Local-only adapters. They simulate the future repository contracts and make no HTTP requests. */
import type { AppRepositories } from "@/data/repositories";
import { ApiError } from "@/api/http-client";
import type {
  Asset,
  AssetId,
  CollectorProfile,
  GradingCompany,
  Money,
  Order,
  OrderId,
  OrderPreview,
  OwnershipUnits,
  TimeRange,
  UserId,
} from "@/domain";
import { basisPoints, cryptoAmount, minorUnits, ownershipUnits, percentage } from "@/domain";
import { ASSETS, COLLECTORS, buyOrders, recentTrades, sellOrders } from "./market";

const DEMO_USER_ID = "demo-user" as UserId;
const now = () => new Date().toISOString() as import("@/domain").ISODateTime;
const gbp = (pounds: number): Money => ({
  amount: minorUnits(Math.round(pounds * 100)),
  currency: "GBP",
});
const asAssetId = (id: string) => id as AssetId;

const toAsset = (record: (typeof ASSETS)[number]): Asset => ({
  id: asAssetId(record.id),
  symbol: record.symbol,
  details: { title: record.name, category: categoryFor(record.category) },
  status: "listed",
  media: [{ id: `${record.id}-main`, url: record.img, alt: record.name, kind: "image", order: 0 }],
  grade: { company: record.grade.split(" ")[0] as GradingCompany, label: record.grade },
  certification: { company: record.grade.split(" ")[0] as GradingCompany, number: record.cert },
  verification: {
    id: `${record.id}-verification`,
    status: "verified",
    provider: "Demo verification",
  },
  vault: {
    facilityLabel: record.vaultStatus,
    status: "stored",
    insuredStatus: "active",
    updatedAt: now(),
  },
  ownershipAvailableBps: basisPoints(Math.round(record.available * 100)),
  marketValue: gbp(record.price),
  confidence: percentage(record.confidence),
});

const categoryFor = (legacyCategory: string): Asset["details"]["category"] => {
  const lower = legacyCategory.toLowerCase();
  if (lower.includes("pok")) return "pokemon";
  if (lower.includes("basketball")) return "basketball";
  if (lower.includes("football")) return "football";
  if (lower.includes("baseball")) return "baseball";
  if (lower.includes("magic")) return "magic";
  if (lower.includes("yu-gi")) return "yugioh";
  if (lower.includes("one piece")) return "one-piece";
  if (lower.includes("lorcana")) return "lorcana";
  return "other";
};

const mappedAssets = ASSETS.map(toAsset);
const orders: Order[] = [];
const watched = new Set<AssetId>();
const followed = new Set<UserId>();
const submissionDrafts: Array<import("@/domain").AssetSubmission> = [];
const submissionCategories = [
  { id: "mock-category-pokemon", slug: "pokemon", name: "Pokémon", description: "Trading cards" },
  {
    id: "mock-category-sports",
    slug: "sports",
    name: "Sports",
    description: "Sports collectibles",
  },
];

const findAsset = (id: AssetId) => mappedAssets.find((asset) => asset.id === id) ?? null;
const priceFor = (id: AssetId) => findAsset(id)?.marketValue ?? gbp(0);
const total = (money: Money, units: number) => gbp((money.amount / 100) * units);

export const mockRepositories: AppRepositories = {
  admin: {
    async getOverview() {
      return {
        users: { active: 0 },
        reviews: { pending: 0, changesRequested: 0 },
        assets: { valuationPending: 0, custodyActions: 0, vaultReady: 0 },
        complianceCases: 0,
        paymentExceptions: 0,
        providerAlerts: 0,
        generatedAt: now(),
      };
    },
    async getRiskOperations() {
      return {
        finance: { movements: [], wallets: [], reservations: [], reconciliation: [] },
        system: [],
        audit: [],
        integrations: [],
        webhooks: [],
      };
    },
    async getPlatformDashboard() {
      return {
        generatedAt: now(),
        overallHealth: "Unknown" as const,
        kpis: { failedJobs: 0, webhookFailures: 0, degradedProviders: 0, pendingChanges: null },
        systemHealth: [],
        providers: [],
        resources: [],
        alerts: [],
        recentActivity: [],
        featureFlags: { available: false, message: "Platform telemetry requires the API service." },
        settings: { available: false, message: "Platform settings require the API service." },
      };
    },
    async listPlatformRecords(input) {
      return {
        tab: input?.tab ?? "jobs",
        supported: false,
        message: "Platform operations records require the API service.",
        items: [],
        pagination: {
          page: input?.page ?? 1,
          pageSize: input?.pageSize ?? 10,
          total: 0,
          totalPages: 0,
        },
      };
    },
    async listCatalogueAssets(input) {
      return {
        items: [],
        pagination: {
          page: input?.page ?? 1,
          pageSize: input?.pageSize ?? 25,
          total: 0,
          totalPages: 1,
        },
      };
    },
    async getComplianceCase() {
      throw new Error("Admin compliance requires the API service.");
    },
    async getOperationsOverview() {
      return {
        kpis: {
          totalUsers: 0,
          collectors: 0,
          investors: 0,
          activeListings: 0,
          openOrders: 0,
          needsAttention: 0,
        },
        pipeline: [
          ["draft", "Draft"],
          ["submitted", "Submitted"],
          ["inReview", "In Review"],
          ["accepted", "Accepted"],
          ["shipping", "Shipping"],
          ["received", "Received"],
          ["verified", "Verified"],
          ["valued", "Valued"],
          ["vaultReady", "Vault Ready"],
          ["marketLive", "Market Live"],
        ].map(([id, label]) => ({ id, label, count: 0 })),
        attentionGroups: [],
        recentActivity: [],
        systemHealth: [],
        accountMix: { collectors: 0, investors: 0, staff: 0, admins: 0, overlapping: true },
        memberships: { starter: 0, pro: 0, elite: 0, trialing: 0, pastDue: 0, mrrMinor: "0" },
        support: {
          available: false,
          message: "Support case metrics are not connected to Slice Admin.",
        },
        counts: {
          pendingReviews: 0,
          collectorActionsWaiting: 0,
          acceptedAwaitingVault: 0,
          shipmentsInTransit: 0,
          deliveredAwaitingReceipt: 0,
          verificationQueue: 0,
          valuationQueue: 0,
          vaultReady: 0,
          marketplaceReady: 0,
          compliance: 0,
          payments: 0,
          alerts: 0,
        },
        needsAttention: [],
        generatedAt: now(),
      };
    },
    async listIntake() {
      const empty = {
        all: 0,
        accepted: 0,
        shipped: 0,
        delivered: 0,
        received: 0,
        verified: 0,
        readyForVault: 0,
        exceptions: 0,
      };
      return {
        items: [],
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
        counts: empty,
        overview: empty,
        recentActivity: [],
        filters: { vaults: [], carriers: [] },
      };
    },
    async confirmIntakeReceipt() {
      throw new Error("Physical intake requires the API service.");
    },
    async setIntakeDestinationApproval() {
      throw new Error("Intake destination approval requires the API service.");
    },
    async listMemberships() {
      return {
        items: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
        kpis: { active: 0, starter: 0, pro: 0, elite: 0, pastDue: 0, trialing: 0, total: 0 },
        statusOverview: {},
        planDistribution: {},
        recentActivity: [],
      };
    },
    async listUsers() {
      return {
        items: [],
        nextCursor: null,
        total: 0,
        summary: {
          totalUsers: 0,
          collectors: 0,
          investors: 0,
          staff: 0,
          admins: 0,
          suspended: 0,
          activeUsers: 0,
          restricted: 0,
          pastDueMemberships: 0,
          trialingMemberships: 0,
        },
      };
    },
    async getUser() {
      throw new Error("Admin user directory requires the API service.");
    },
    async transitionUserStatus() {
      throw new Error("Account status changes require the API service.");
    },
    async grantUserRole() {
      throw new Error("Role changes require the API service.");
    },
    async revokeUserRole() {
      throw new Error("Role changes require the API service.");
    },
    async listComplianceCases() {
      return { items: [] };
    },
    async getFinanceSummary() {
      return {
        currency: "GBP" as const,
        pendingMovements: 0,
        exceptions: 0,
        reconciliationMismatches: 0,
      };
    },
    async getFinanceDashboard() {
      return {
        currency: "GBP" as const,
        kpis: {
          totalCustomerCashMinor: "0",
          reservedFundsMinor: "0",
          pendingDepositsMinor: "0",
          pendingWithdrawalsMinor: "0",
          openOrders: 0,
          executionsToday: 0,
        },
        overview: {
          totalVolumeMinor: "0",
          buyVolumeMinor: "0",
          sellVolumeMinor: "0",
          totalFeesMinor: "0",
          netFeesMinor: "0",
          history: [],
        },
        orderSummary: { total: 0, buy: 0, sell: 0, open: 0 },
        executionSummary: { total: 0, buyInitiated: 0, sellInitiated: 0 },
        reconciliationSummary: [],
        recentActivity: [],
      };
    },
    async listFinanceRecords() {
      return {
        tab: "wallets",
        items: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      };
    },
    async getTrustSupportDashboard() {
      return {
        kpis: {
          openComplianceCases: 0,
          restrictedAccounts: 0,
          openTickets: 0,
          unassignedTickets: 0,
          escalations: 0,
        },
        overview: {
          complianceCases: 0,
          restrictedAccounts: 0,
          openTickets: 0,
          unassignedTickets: 0,
          escalations: 0,
        },
        recentActivity: [],
      };
    },
    async listTrustSupportRecords() {
      return {
        tab: "compliance",
        items: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      };
    },
    async getIntegrations() {
      return { providerIncidents: 0, failedWebhooks: 0, secrets: "redacted" as const };
    },
    async getCollectibleDetail() {
      throw new Error("Collectible admin detail requires the API service.");
    },
    async refreshMarketData() {
      throw new Error("Market data refresh requires the API service.");
    },
    async proposeOwnershipSupply() {
      throw new Error("Ownership supply policy requires the API service.");
    },
    async approveOwnershipSupply() {
      throw new Error("Ownership supply policy requires the API service.");
    },
    async issueOwnership() {
      throw new Error("Ownership issuance requires the API service.");
    },
    async activateTradingMarket() {
      throw new Error("Trading market activation requires the API service.");
    },
    async approveInitialOffering() {
      throw new Error("Initial offering approval requires the API service.");
    },
    async requestInitialOfferingChanges() {
      throw new Error("Initial offering review requires the API service.");
    },
    async openInitialOffering() {
      throw new Error("Initial offering opening requires the API service.");
    },
    async pauseInitialOffering() {
      throw new Error("Initial offering pause requires the API service.");
    },
    async cancelInitialOffering() {
      throw new Error("Initial offering cancellation requires the API service.");
    },
    async search() {
      return { items: [] };
    },
  },
  assets: {
    async listAssets(input) {
      const q = input?.query?.trim().toLowerCase();
      const items = mappedAssets.filter(
        (asset) =>
          (!input?.category || asset.details.category === input.category) &&
          (!q || `${asset.symbol} ${asset.details.title}`.toLowerCase().includes(q)),
      );
      return { items, hasMore: false, nextCursor: null };
    },
    async getAssetById(id) {
      return findAsset(id);
    },
    async searchAssets(query) {
      return (await this.listAssets({ query })).items;
    },
    async getFeaturedAssets() {
      return mappedAssets.slice(0, 3);
    },
    async getTrendingAssets() {
      return [...mappedAssets]
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 6);
    },
  },
  catalogue: {
    async listSubmissionCategories() {
      return submissionCategories;
    },
  },
  submissions: {
    async importReference() {
      return {
        status: "PROVIDER_UNAVAILABLE" as const,
        message: "Reference import requires the Slice API.",
        provider: null,
        identity: {},
        customerReference: null,
      };
    },
    async checkMarket() {
      throw new Error("External market research is unavailable in mock mode.");
    },
    async createDraft(input) {
      const submission: import("@/domain").AssetSubmission = {
        id: `mock-submission-${submissionDrafts.length + 1}`,
        status: "DRAFT",
        version: 1,
        categoryId: input.categoryId,
        setId: null,
        gradeScaleEntryId: null,
        declaredMetadata: input.declaredMetadata,
        submittedAt: null,
        reviewedAt: null,
        decisionCode: null,
        createdAt: now(),
        updatedAt: now(),
      };
      submissionDrafts.unshift(submission);
      return submission;
    },
    async listOwn() {
      return { items: submissionDrafts, nextCursor: null };
    },
    async getOwn(id) {
      const draft = submissionDrafts.find((item) => item.id === id);
      if (!draft) throw new Error("Submission not found");
      return { ...draft, media: [], marketResearch: null };
    },
    async updateDraft(id, input) {
      const index = submissionDrafts.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("Submission not found");
      const updated = {
        ...submissionDrafts[index],
        ...input,
        version: input.version + 1,
        updatedAt: now(),
      };
      submissionDrafts[index] = updated;
      return { ...updated, media: [], marketResearch: null };
    },
    async createMediaIntent() {
      throw new Error("Media uploads require the API storage provider.");
    },
    async removeMedia() {
      throw new Error("Media uploads require the API storage provider.");
    },
    async submit() {
      throw new Error("Submission review requires the API service.");
    },
    async cancel() {
      throw new Error("Submission review requires the API service.");
    },
    async getPreGrade() {
      return { current: null, history: [] };
    },
    async runPreGrade() {
      throw new Error("AI Pre-Grade requires the API service.");
    },
  },
  reviews: {
    async listQueue() {
      return {
        items: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        counts: {
          all: 0,
          highPriority: 0,
          awaitingEvidence: 0,
          researchPending: 0,
          readyToReview: 0,
        },
        summary: { highPriority: 0, awaitingEvidence: 0, researchPending: 0, readyToReview: 0 },
        nextCursor: null,
      };
    },
    async getDetail() {
      throw new Error("Review requires the API service.");
    },
    async claim() {
      throw new Error("Review requires the API service.");
    },
    async decide() {
      throw new Error("Review requires the API service.");
    },
    async saveNote() {
      throw new Error("Review requires the API service.");
    },
  },
  lifecycle: {
    async listOperations() {
      return [];
    },
    async getOperationsBoard() {
      throw new Error("Asset operations require the API service.");
    },
    async handoff() {
      throw new Error("Lifecycle operations require the API service.");
    },
    async transitionCustody() {
      throw new Error("Lifecycle operations require the API service.");
    },
    async recordValuation() {
      throw new Error("Lifecycle operations require the API service.");
    },
    async recordCoverage() {
      throw new Error("Lifecycle operations require the API service.");
    },
    async getReadiness() {
      throw new Error("Lifecycle operations require the API service.");
    },
    async publish() {
      throw new Error("Lifecycle operations require the API service.");
    },
  },
  market: {
    async getMarketSummary() {
      return {
        totalMarketValue: gbp(574_200_000),
        volume24h: gbp(1_240_000),
        activeAssets: mappedAssets.length,
        verifiedAssets: mappedAssets.length,
        activeCollectors: COLLECTORS.length,
      };
    },
    async getPriceHistory(assetId, range: TimeRange) {
      const record = ASSETS.find((asset) => asset.id === assetId);
      const length = { "24H": 16, "7D": 28, "30D": 42, "90D": 64, "1Y": 82, ALL: 90 }[range];
      return (record?.chart.slice(-length) ?? []).map((value, index) => ({
        timestamp: new Date(
          Date.now() - (length - index) * 86_400_000,
        ).toISOString() as import("@/domain").ISODateTime,
        value: gbp(value),
      }));
    },
    async getMarketMovers() {
      return [...mappedAssets]
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 5);
    },
    async getRecentTrades(assetId) {
      return recentTrades(priceFor(assetId).amount / 100).map((trade, index) => ({
        id: `demo-trade-${index}`,
        orderId: `demo-order-${index}` as OrderId,
        assetId,
        units: ownershipUnits(Math.round(trade.pct * 100)),
        pricePerUnit: gbp(trade.price),
        status: "simulated" as const,
        executedAt: now(),
      }));
    },
    async getOrderBook(assetId) {
      const p = priceFor(assetId).amount / 100;
      return {
        assetId,
        bids: buyOrders(p).map((row) => ({
          pricePerUnit: gbp(row.price),
          units: row.pct * 100,
          orderCount: 1,
        })),
        asks: sellOrders(p).map((row) => ({
          pricePerUnit: gbp(row.price),
          units: row.pct * 100,
          orderCount: 1,
        })),
        updatedAt: now(),
      };
    },
  },
  portfolio: {
    async getPortfolio() {
      return {
        currency: "GBP" as const,
        cash: {
          currency: "GBP" as const,
          totalMinor: "0",
          reservedMinor: "0",
          availableMinor: "0",
        },
        holdings: [],
        estimatedHoldingsValueMinor: null,
        estimatedPortfolioValueMinor: null,
        valuationStatus: "UNAVAILABLE" as const,
      };
    },
    async getHoldings() {
      return [];
    },
    async getLots() {
      return [];
    },
    async getTransactions() {
      return { items: [], nextCursor: null };
    },
    async getPerformance(range = "1M") {
      return {
        range,
        points: [],
        periodChangeMinor: null,
        periodChangeBps: null,
        netCashFlowMinor: "0",
        direction: "NEUTRAL" as const,
        freshness: "UNAVAILABLE",
      };
    },
  },
  collectors: {
    async listCollectors() {
      return COLLECTORS.map(
        (collector) =>
          ({
            userId: collector.id as UserId,
            handle: collector.handle,
            displayName: collector.name,
            focus: collector.focus,
            category: "mixed",
            followers: collector.followers,
            performance: {
              portfolioValue: gbp(collector.portfolioValue),
              annualReturn: percentage(collector.annualReturn),
              monthlyReturn: percentage(collector.monthlyReturn),
            },
            holdings: [],
          }) satisfies CollectorProfile,
      );
    },
    async getCollector(id) {
      return (await this.listCollectors()).find((collector) => collector.userId === id) ?? null;
    },
    async listPublicCollectors() {
      return { items: await this.listCollectors(), nextCursor: null };
    },
    async followCollector(id) {
      followed.add(id);
    },
    async unfollowCollector(id) {
      followed.delete(id);
    },
  },
  collectorWorkspace: {
    async getOverview() {
      return {
        collector: {
          displayName: "Demo collector",
          username: null,
          avatarReference: null,
          countryCode: "GB",
          collectorSince: now(),
          publicProfile: null,
        },
        kpis: {
          totalCollectibles: 0,
          referenceValue: null,
          marketLive: 0,
          inReview: 0,
          needsAttention: 0,
        },
        pipeline: [
          "DRAFT",
          "SUBMITTED",
          "REVIEW",
          "VALUATION",
          "CUSTODY",
          "VAULT_READY",
          "MARKET_LIVE",
        ].map((stage) => ({
          stage,
          count: 0,
        })) as import("@/domain").CollectorWorkspaceOverview["pipeline"],
        assets: [],
        attention: [],
        actionSummary: {
          waitingOnYou: 0,
          inProgress: 0,
          completedRecently: 0,
        },
        activity: [],
        analytics: {
          catalogueReferenceValue: null,
          marketLiveReferenceValue: null,
          marketLiveAssets: 0,
          trades: null,
          volume: null,
          executedUnits: "0",
          owners: null,
        },
      };
    },
    async updatePublicProfile() {
      return { slug: "demo-collector", headline: null, specialism: null, isPublic: false };
    },
    async getCollectibles() {
      return [];
    },
    async getCollectibleDetail() {
      throw new Error("Collector collectible not found");
    },
    async getInitialOfferingPreview() {
      throw new Error("Initial offering preview requires the API service.");
    },
    async getInitialOffering() {
      throw new Error("Initial offering requires the API service.");
    },
    async proposeInitialOffering() {
      throw new Error("Initial offering submission requires the API service.");
    },
    async updateInitialOffering() {
      throw new Error("Initial offering update requires the API service.");
    },
    async getRequests() {
      return [];
    },
    async getDocuments() {
      return [];
    },
    async search() {
      return { items: [] };
    },
    async getSubscription() {
      return {
        current: null,
        plans: [],
        usage: {
          activeCollectibles: 0,
          maxActiveCollectibles: null,
          openSubmissions: 0,
          maxOpenSubmissions: null,
          openDrafts: 0,
          maxOpenDrafts: null,
          monthlySubmissionsUsed: 0,
          maxMonthlySubmissions: null,
          concurrentIntake: 0,
          maxConcurrentIntake: null,
          remainingCatalogueCapacity: null,
          billingPeriodStart: now(),
          billingPeriodEnd: now(),
          monthlySubmissions: 0,
        },
        billing: { configured: false, provider: null, paymentMethod: null, nextBillingDate: null },
      };
    },
    async getPlans() {
      return [];
    },
    async subscriptionAction() {
      throw new Error("Membership billing is temporarily unavailable.");
    },
    async listVaults() {
      return [];
    },
    async selectVault() {
      return {};
    },
    async addShipment() {
      return {};
    },
    async deleteDraft(submissionId: string) {
      return { submissionId, deleted: true };
    },
  },
  ownership: {
    async getWatchlist(userId) {
      return { userId, assetIds: [...watched] };
    },
    async toggleWatchlistAsset(userId, assetId) {
      if (watched.has(assetId)) watched.delete(assetId);
      else watched.add(assetId);
      return { userId, assetIds: [...watched] };
    },
    async getPublicIssuance() {
      return null;
    },
    async getOwnMarketPosition() {
      return null;
    },
  },
  trading: {
    async getOwnershipMarketSummary(assetId) {
      return {
        assetId,
        totalSlices: "200",
        availableSlices: "100",
        availableOwnershipPercent: "50",
        ownershipIncrementPercent: "0.5",
        slicePriceMinor: "1000",
        impliedWholeValueMinor: "200000",
        externalReferenceMinor: "200000",
        onePercentSlices: "2",
        onePercentValueMinor: "2000",
        bestAskMinor: "1000",
        bestBidMinor: "980",
        hasImmediateLiquidity: true,
        marketStatus: "OPEN" as const,
      };
    },
    async previewOwnershipOrder(input) {
      const total = 200n;
      const parsed = Number(
        input.desiredOwnershipPercent ?? Number(input.desiredAmountMinor ?? "0") / 1000,
      );
      const slices = Number.isFinite(parsed)
        ? Math.max(0, Math.round((parsed / 100) * Number(total)))
        : 0;
      const priceMinor = 1000n;
      const requested = String(slices);
      return {
        assetId: input.assetId,
        side: input.side,
        requestedOwnershipPercent:
          input.desiredOwnershipPercent ?? `${(slices / Number(total)) * 100}`,
        requestedSlices: requested,
        ownershipIncrementPercent: "0.5",
        totalSlices: total.toString(),
        availableSlices: "100",
        availableOwnershipPercent: "50",
        ownedSlices: "0",
        ownedOwnershipPercent: "0",
        resultingOwnershipPercent: input.side === "BUY" ? `${(slices / Number(total)) * 100}` : "0",
        remainingOwnershipPercent: input.side === "SELL" ? "0" : null,
        slicePriceMinor: priceMinor.toString(),
        impliedWholeValueMinor: (priceMinor * total).toString(),
        externalReferenceMinor: (priceMinor * total).toString(),
        onePercentSlices: "2",
        onePercentValueMinor: (priceMinor * 2n).toString(),
        limitPriceMinor: input.limitPriceMinor ?? priceMinor.toString(),
        estimatedCostMinor: (priceMinor * BigInt(slices)).toString(),
        estimatedAveragePriceMinor: priceMinor.toString(),
        estimatedReservationMinor: (priceMinor * BigInt(slices)).toString(),
        feeMinor: "0",
        executableSlices: requested,
        openSlices: "0",
        availableCashMinor: "100000",
        cashShortfallMinor: null,
        maximumExceeded: slices > 100,
        bestMarketPriceMinor: priceMinor.toString(),
        worstExpectedPriceMinor: priceMinor.toString(),
        lowerSnap: null,
        upperSnap: null,
        hasImmediateLiquidity: true,
        marketStatus: "OPEN" as const,
        eligibility: "ELIGIBLE" as const,
        requestedAmountMinor: input.desiredAmountMinor ?? null,
        projectedRemainingAvailableIfFullyFilled:
          input.side === "BUY" ? String(Math.max(0, 100 - slices)) : null,
      };
    },
    async previewOrder(input) {
      const orderPreview = preview(
        input.assetId as AssetId,
        input.side === "BUY" ? "buy" : "sell",
        Number(input.units),
      );
      return {
        assetId: input.assetId,
        side: input.side,
        type: "LIMIT" as const,
        timeInForce: input.timeInForce,
        units: input.units,
        limitPriceMinor: input.limitPriceMinor,
        grossMinor: String(orderPreview.estimatedSubtotal.amount),
        feeMinor: String(orderPreview.estimatedFee.amount),
        feeApplication: "NOT_APPLIED",
        reservationMinor: input.side === "BUY" ? String(orderPreview.estimatedTotal.amount) : null,
        reservationUnits: input.side === "SELL" ? input.units : null,
        marketStatus: "OPEN" as const,
        eligibility: "ELIGIBLE" as const,
      };
    },
    async placeOrder(input) {
      const order = await this.createDemoOrder({
        userId: DEMO_USER_ID,
        assetId: input.assetId as AssetId,
        side: input.side === "BUY" ? "buy" : "sell",
        type: "limit",
        units: ownershipUnits(Number(input.units)),
        limitPrice: { amount: minorUnits(Number(input.limitPriceMinor)), currency: "GBP" },
      });
      return {
        id: order.id,
        assetId: order.assetId,
        assetSlug: null,
        side: input.side,
        type: "LIMIT" as const,
        timeInForce: input.timeInForce,
        status: "OPEN" as const,
        limitPriceMinor: input.limitPriceMinor,
        originalUnits: input.units,
        remainingUnits: input.units,
        filledUnits: "0",
        averageFillPriceMinor: null,
        createdAt: order.createdAt,
        closedAt: null,
      };
    },
    async cancelOrder(orderId) {
      const order = await this.cancelDemoOrder(orderId as OrderId);
      return {
        id: order.id,
        assetId: order.assetId,
        assetSlug: null,
        side: order.side === "buy" ? ("BUY" as const) : ("SELL" as const),
        type: "LIMIT" as const,
        timeInForce: "GTC" as const,
        status: "CANCELLED" as const,
        limitPriceMinor: String(order.limitPrice?.amount ?? 0),
        originalUnits: String(order.units),
        remainingUnits: String(order.units),
        filledUnits: "0",
        averageFillPriceMinor: null,
        createdAt: order.createdAt,
        closedAt: now(),
      };
    },
    async listOwnOrders() {
      return { items: [], nextCursor: null };
    },
    async listOwnExecutions() {
      return { items: [], nextCursor: null };
    },
    async previewBuyOrder(assetId, units) {
      return preview(assetId, "buy", units);
    },
    async previewSellOrder(assetId, units) {
      return preview(assetId, "sell", units);
    },
    async createDemoOrder(input) {
      const order = {
        ...input,
        id: `demo-order-${orders.length + 1}` as OrderId,
        status: "open" as const,
        createdAt: now(),
      };
      orders.push(order);
      return order;
    },
    async cancelDemoOrder(orderId) {
      const order = orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Demo order not found.");
      order.status = "cancelled";
      return order;
    },
    async listOrders(userId) {
      return orders.filter((order) => order.userId === userId);
    },
  },
  vault: {
    async getVaultAssetStatus(assetId) {
      const asset = findAsset(assetId);
      return asset?.vault ? { assetId, vault: asset.vault, custody: [] } : null;
    },
    async getPublicEvents() {
      return { items: [], nextCursor: null };
    },
    async getPublicSummary() {
      return { authority: "UNAVAILABLE_UNTIL_CUSTODY", eventCount: 0 };
    },
    async getPublicLive() {
      return {
        dataStatus: "LIVE_PUBLIC_PROJECTION" as const,
        windowStartedAt: new Date().toISOString(),
        metrics: {
          publicVaultEvents: 0,
          newlyPublished: 0,
          valuationsUpdated: 0,
          marketActivity: "0",
        },
        featuredAsset: null,
        recentEvents: [],
        recentlyReviewed: [],
        readiness: [],
        publishedAssets: [],
        marketActivity: [],
        categories: [],
        eventAssetCount: 0,
      };
    },
  },
  wallet: {
    async getBalances() {
      return [
        {
          asset: "USDC",
          available: cryptoAmount("1250.500000"),
          reserved: cryptoAmount("0"),
          fiatEquivalent: gbp(986.2),
        },
      ];
    },
    async getTransactions() {
      return [];
    },
  },
  // Explicit visual-development mode only. API mode always uses Document 016 endpoints.
  providers: {
    async getCompliance() {
      return {
        status: "NOT_STARTED" as const,
        identityState: "NOT_STARTED" as const,
        provider: "LOCAL_TEST" as const,
        expiresAt: null,
        updatedAt: null,
      };
    },
    async startCompliance() {
      return {
        status: "PENDING" as const,
        identityState: "REQUIRES_INPUT" as const,
        provider: "LOCAL_TEST" as const,
        sessionUrl: null,
      };
    },
    async createBankLinkCheckout() {
      throw new Error("Bank connection setup is unavailable in explicit mock mode.");
    },
    async completeBankLink() {
      throw new Error("Bank connection setup is unavailable in explicit mock mode.");
    },
    async listBankConnections() {
      return [];
    },
    async disconnectBankConnection() {
      return { disconnected: true, replayed: false };
    },
    async setDefaultBankConnection() {
      return { selected: true };
    },
    async getConnectPayoutSetup() {
      return {
        status: "NOT_STARTED" as const,
        requirementsSummary: null,
        onboardingUrl: null,
        expiresAt: null,
      };
    },
    async createConnectOnboarding() {
      throw new Error("Connect payout setup is unavailable in explicit mock mode.");
    },
    async refreshConnectOnboarding() {
      throw new Error("Connect payout setup is unavailable in explicit mock mode.");
    },
    async listMovements() {
      return { items: [], nextCursor: null };
    },
    async createDeposit(amountMinor) {
      return {
        id: `mock-deposit-${Date.now()}`,
        type: "DEPOSIT" as const,
        amountMinor,
        currency: "GBP" as const,
        status: "PENDING_PROVIDER" as const,
        createdAt: now(),
        updatedAt: now(),
        replayed: false,
      };
    },
    async createWithdrawal({ amountMinor }) {
      return {
        id: `mock-withdrawal-${Date.now()}`,
        type: "WITHDRAWAL" as const,
        amountMinor,
        currency: "GBP" as const,
        status: "PENDING_PROVIDER" as const,
        createdAt: now(),
        updatedAt: now(),
        replayed: false,
      };
    },
  },
  notifications: {
    async listNotifications() {
      return [];
    },
    async getUnreadCount() {
      return 0;
    },
    async markRead() {},
    async markAllRead() {},
  },
  discussions: {
    async listDiscussions() {
      return [];
    },
    async reactToDiscussion() {},
  },
  proposals: {
    async getSaleProposal() {
      return null;
    },
    async listSaleProposals() {
      return { items: [], nextCursor: null };
    },
    async createSaleProposal() {
      throw new ApiError("FEATURE_UNAVAILABLE", "Proposal creation is unavailable in mock mode.");
    },
    async openSaleProposal() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Governance administration is only available from the authoritative API.",
      );
    },
    async closeSaleProposal() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Governance administration is only available from the authoritative API.",
      );
    },
    async vote() {
      return { replayed: false };
    },
  },
  users: {
    async getCurrentUser() {
      return {
        id: DEMO_USER_ID,
        email: "demo@slice.example",
        createdAt: "2026-01-01T00:00:00.000Z",
        accountStatus: "ACTIVE",
        emailVerificationStatus: "UNVERIFIED" as const,
        roles: ["USER"],
        profile: {
          displayName: "Demo collector",
          username: null,
          usernameChangedAt: null,
          avatarReference: null,
          countryCode: "GB",
          preferredCurrency: "GBP" as const,
          timezone: "Europe/London",
        },
      };
    },
    async updateCurrentProfile() {},
    async getDiscordLink() {
      return {
        connected: false,
        configured: false,
        username: null,
        displayName: null,
        linkedAt: null,
      };
    },
    async beginDiscordLink() {
      throw new ApiError("FEATURE_UNAVAILABLE", "Discord linking requires the authoritative API.");
    },
    async consumeDiscordBotLink() {
      throw new ApiError("FEATURE_UNAVAILABLE", "Discord linking requires the authoritative API.");
    },
    async disconnectDiscordLink() {
      return { disconnected: false };
    },
  },
  auth: {
    async getSignupPolicy() {
      return {
        captcha: { required: false, siteKey: null, localTest: false },
        consent: { required: false, termsVersion: null, privacyVersion: null },
      };
    },
    async signup() {
      throw new ApiError("FEATURE_UNAVAILABLE", "Account creation requires the authoritative API.");
    },
    async usernameAvailability(username) {
      return { username, available: true };
    },
  },
  account: {
    async getCapabilities() {
      return {
        capabilities: [
          "BROWSE_MARKETS",
          "VIEW_PUBLIC_ASSETS",
          "VIEW_COLLECTORS",
          "VIEW_VAULT_LIVE",
          "VIEW_PORTFOLIO",
          "MANAGE_PROFILE",
          "MANAGE_ACCOUNT_SECURITY",
        ].map((capability) => ({ capability, allowed: true, reason: null, requirements: [] })),
      } as import("@/data/repositories").AccountRepository extends {
        getCapabilities(): Promise<infer T>;
      }
        ? T
        : never;
    },
    async grantCollectorBeta() {
      return { status: "APPROVED" as const, role: "COLLECTOR" as const, granted: true };
    },
    async getEmailVerification() {
      return { verified: false, verifiedAt: null };
    },
    async sendEmailVerification() {
      return { alreadyVerified: false, resendAvailableAt: null };
    },
    async confirmEmailVerification() {
      return { verified: true, verifiedAt: new Date().toISOString() };
    },
    async getPhoneVerification() {
      return { phone: null, verified: false, verifiedAt: null };
    },
    async sendPhoneVerification() {
      return { alreadyVerified: false, resendAvailableAt: null };
    },
    async confirmPhoneVerification(_phone: string, _code: string) {
      return { verified: true, verifiedAt: new Date().toISOString(), phone: "••••" };
    },
    async getTwoFactor() {
      return { enabled: false, enabledAt: null };
    },
    async beginTwoFactorEnrollment() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Two-factor enrollment requires the authoritative API.",
      );
    },
    async confirmTwoFactorEnrollment() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Two-factor enrollment requires the authoritative API.",
      );
    },
    async regenerateRecoveryCodes() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Recovery-code management requires the authoritative API.",
      );
    },
    async disableTwoFactor() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Two-factor management requires the authoritative API.",
      );
    },
    async listSessions() {
      return { sessions: [] };
    },
    async revokeSession() {
      return { currentSessionRevoked: false };
    },
    async revokeOtherSessions() {
      return { revokedSessionCount: 0 };
    },
    async getPreferences() {
      return {
        timezone: "Europe/London",
        locale: "en-GB" as const,
        preferredCurrency: "GBP" as const,
      };
    },
    async updatePreferences(
      input: Partial<{
        timezone: string;
        locale: "en-GB" | "en-US";
        preferredCurrency: import("@/data/repositories").SupportedCurrency;
      }>,
    ) {
      return {
        timezone: input.timezone ?? "Europe/London",
        locale: input.locale ?? "en-GB",
        preferredCurrency: input.preferredCurrency ?? "GBP",
      };
    },
    async getNotificationPreferences() {
      return {
        preferences: [
          { topic: "ORDER_UPDATES" as const, channel: "IN_APP" as const, enabled: true },
          { topic: "PORTFOLIO_UPDATES" as const, channel: "IN_APP" as const, enabled: true },
        ],
      };
    },
    async updateNotificationPreferences(preferences) {
      return {
        preferences: preferences.map((preference) => ({
          ...preference,
          channel: "IN_APP" as const,
        })),
      };
    },
    async getActivity() {
      return { items: [], nextCursor: null };
    },
    async requestDataExport() {
      return { exportedAt: new Date().toISOString(), format: "JSON" as const, data: {} };
    },
    async getDeletionRequest() {
      return null;
    },
    async requestDeletion() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Account lifecycle actions require the authoritative API.",
      );
    },
    async cancelDeletion() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Account lifecycle actions require the authoritative API.",
      );
    },
    async deactivate() {
      throw new ApiError(
        "FEATURE_UNAVAILABLE",
        "Account lifecycle actions require the authoritative API.",
      );
    },
    async changePassword() {
      throw new ApiError("FEATURE_UNAVAILABLE", "Password changes require the authoritative API.");
    },
  },
  currency: {
    async getRates() {
      return null;
    },
  },
};

function preview(assetId: AssetId, side: "buy" | "sell", unitCount: number): OrderPreview {
  const units = ownershipUnits(unitCount) as OwnershipUnits;
  const unitPrice = priceFor(assetId).amount / 10_000;
  const subtotal = total(gbp(unitPrice), unitCount);
  const fee = gbp(Math.round((subtotal.amount / 100) * 0.01));
  return {
    assetId,
    side,
    units,
    estimatedSubtotal: subtotal,
    estimatedFee: fee,
    estimatedTotal: gbp((subtotal.amount + (side === "buy" ? fee.amount : -fee.amount)) / 100),
    disclaimer:
      "Demo-only preview. Fees, availability, and settlement require backend confirmation.",
  };
}
