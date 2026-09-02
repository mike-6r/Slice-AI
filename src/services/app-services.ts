import type { AppRepositories } from "@/data/repositories";
import { basisPoints, minorUnits } from "@/domain";

/** Frontend preview helpers only. Authoritative market and settlement logic belongs on a backend. */
export class AssetService {
  constructor(private readonly repositories: AppRepositories) {}
  list = (input?: {
    category?: string;
    query?: string;
    set?: string;
    sort?: "estimatedMarketValue" | "change24h" | "title";
    cursor?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  }) => this.repositories.assets.listAssets(input);
  get = (id: import("@/domain").AssetId) => this.repositories.assets.getAssetById(id);
  featured = () => this.repositories.assets.getFeaturedAssets();
  trending = () => this.repositories.assets.getTrendingAssets();
}

export class MarketService {
  constructor(private readonly repositories: AppRepositories) {}
  summary = () => this.repositories.market.getMarketSummary();
  snapshot = () => this.repositories.market.getMarketSnapshot();
  movers = () => this.repositories.market.getMarketMovers();
  similar = (assetId: import("@/domain").AssetId, limit?: number) =>
    this.repositories.market.getSimilarAssets(assetId, limit);
  priceHistory = (assetId: import("@/domain").AssetId, range: import("@/domain").TimeRange) =>
    this.repositories.market.getPriceHistory(assetId, range);
  orderBook = (assetId: import("@/domain").AssetId) =>
    this.repositories.market.getOrderBook(assetId);
  recentTrades = (assetId: import("@/domain").AssetId) =>
    this.repositories.market.getRecentTrades(assetId);
}

export class PortfolioService {
  constructor(private readonly repositories: AppRepositories) {}
  portfolio = () => this.repositories.portfolio.getPortfolio();
  holdings = () => this.repositories.portfolio.getHoldings();
  holdingsPage = async (input?: {
    page?: number;
    pageSize?: number;
    q?: string;
    category?: string;
    sort?: import("@/domain").PortfolioHoldingSort;
  }) => {
    if (this.repositories.portfolio.getHoldingsPage)
      return this.repositories.portfolio.getHoldingsPage(input);
    const items = await this.repositories.portfolio.getHoldings();
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 10;
    return { items, page, pageSize, total: items.length, totalPages: items.length ? 1 : 0 };
  };
  lots = () => this.repositories.portfolio.getLots();
  transactions = (input?: { cursor?: string; limit?: number }) =>
    this.repositories.portfolio.getTransactions(input);
  performance = (range?: import("@/domain").PortfolioPerformanceRange) =>
    this.repositories.portfolio.getPerformance(range);
  walletInsights = (input?: { period?: import("@/domain").WalletInsightsPeriod }) =>
    this.repositories.portfolio.getWalletInsights(input);
}

export class TradingService {
  constructor(private readonly repositories: AppRepositories) {}
  previewOrder = (input: import("@/domain").TradingOrderInput) =>
    this.repositories.trading.previewOrder(input);
  previewOwnershipOrder = (input: import("@/domain").OwnershipPreviewInput) =>
    this.repositories.trading.previewOwnershipOrder(input);
  previewPublicOwnershipOrder = (input: import("@/domain").OwnershipPreviewInput) =>
    this.repositories.trading.previewPublicOwnershipOrder(input);
  ownershipMarketSummary = (assetSlug: string) =>
    this.repositories.trading.getOwnershipMarketSummary(assetSlug);
  placeOrder = (input: import("@/domain").TradingOrderInput) =>
    this.repositories.trading.placeOrder(input);
  cancelOrder = (orderId: string) => this.repositories.trading.cancelOrder(orderId);
  orders = (input?: {
    cursor?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
    q?: string;
    side?: import("@/domain").TradingOrderSide;
    status?: import("@/domain").TradingOrderStatus;
    assetClass?: string;
    from?: string;
  }) => this.repositories.trading.listOwnOrders(input);
  executions = (input?: { cursor?: string; limit?: number }) =>
    this.repositories.trading.listOwnExecutions(input);
  previewBuy = (assetId: import("@/domain").AssetId, units: number) =>
    this.repositories.trading.previewBuyOrder(assetId, units);
  previewSell = (assetId: import("@/domain").AssetId, units: number) =>
    this.repositories.trading.previewSellOrder(assetId, units);
  /** This creates a local simulation only; it never submits an order to a market. */
  createDemoOrder = (input: Parameters<AppRepositories["trading"]["createDemoOrder"]>[0]) =>
    this.repositories.trading.createDemoOrder(input);
}

export class OwnershipService {
  constructor(private readonly repositories: AppRepositories) {}
  watchlist = (userId: import("@/domain").UserId) =>
    this.repositories.ownership.getWatchlist(userId);
  toggleWatchlist = (userId: import("@/domain").UserId, assetId: import("@/domain").AssetId) =>
    this.repositories.ownership.toggleWatchlistAsset(userId, assetId);
  publicIssuance = (assetSlug: string) => this.repositories.ownership.getPublicIssuance(assetSlug);
  ownMarketPosition = (assetSlug: string) =>
    this.repositories.ownership.getOwnMarketPosition(assetSlug);
  availableBasisPoints(value: number) {
    return basisPoints(value);
  }
}

export class WalletService {
  constructor(private readonly repositories: AppRepositories) {}
  balances = (userId: import("@/domain").UserId) => this.repositories.wallet.getBalances(userId);
  transactions = (userId: import("@/domain").UserId) =>
    this.repositories.wallet.getTransactions(userId);
}

export class AccountService {
  constructor(private readonly repositories: AppRepositories) {}
  capabilities = () => this.repositories.account.getCapabilities();
  activity = (input?: { cursor?: string; limit?: number }) =>
    this.repositories.account.getActivity(input);
}

export class ProviderService {
  constructor(private readonly repositories: AppRepositories) {}
  compliance = () => this.repositories.providers.getCompliance();
  startCompliance = () => this.repositories.providers.startCompliance();
  createBankLinkCheckout = () => this.repositories.providers.createBankLinkCheckout();
  completeBankLink = (input: { checkoutSessionId: string }) =>
    this.repositories.providers.completeBankLink(input);
  bankConnections = () => this.repositories.providers.listBankConnections();
  requestBankDisconnectChallenge = (id: string) =>
    this.repositories.providers.requestBankDisconnectChallenge(id);
  disconnectBankConnection = (input: {
    id: string;
    confirmed: true;
    mfaCode?: string;
    mfaChallenge?: string;
  }) => this.repositories.providers.disconnectBankConnection(input);
  setDefaultBankConnection = (id: string) =>
    this.repositories.providers.setDefaultBankConnection(id);
  connectPayoutSetup = () => this.repositories.providers.getConnectPayoutSetup();
  feePolicy = () => this.repositories.providers.getFeePolicy();
  createConnectOnboarding = () => this.repositories.providers.createConnectOnboarding();
  refreshConnectOnboarding = () => this.repositories.providers.refreshConnectOnboarding();
  movements = (input?: { cursor?: string; limit?: number }) =>
    this.repositories.providers.listMovements(input);
  withdrawalPreflight = (input?: { amountMinor?: string }) =>
    this.repositories.providers.getWithdrawalPreflight(input);
  createDeposit = (amountMinor: string) => this.repositories.providers.createDeposit(amountMinor);
  createWithdrawal = (input: {
    amountMinor: string;
    destinationReference?: string;
    destinationChain?: string;
  }) => this.repositories.providers.createWithdrawal(input);
}

export class CollectorService {
  constructor(private readonly repositories: AppRepositories) {}
  list = () => this.repositories.collectors.listCollectors();
  get = (id: import("@/domain").UserId, input?: { page?: number; pageSize?: number }) =>
    this.repositories.collectors.getCollector(id, input);
  follow = (id: import("@/domain").UserId) => this.repositories.collectors.followCollector(id);
  unfollow = (id: import("@/domain").UserId) => this.repositories.collectors.unfollowCollector(id);
}

export class CommunityService {
  constructor(private readonly repositories: AppRepositories) {}
  discussions = (assetId: import("@/domain").AssetId) =>
    this.repositories.discussions.listDiscussions(assetId);
  proposal = (id: string) => this.repositories.proposals.getSaleProposal(id);
}

export interface AppServices {
  repositories: AppRepositories;
  assets: AssetService;
  market: MarketService;
  portfolio: PortfolioService;
  trading: TradingService;
  ownership: OwnershipService;
  wallet: WalletService;
  account: AccountService;
  providers: ProviderService;
  collectors: CollectorService;
  community: CommunityService;
}

export const createAppServices = (repositories: AppRepositories): AppServices => ({
  repositories,
  assets: new AssetService(repositories),
  market: new MarketService(repositories),
  portfolio: new PortfolioService(repositories),
  trading: new TradingService(repositories),
  ownership: new OwnershipService(repositories),
  wallet: new WalletService(repositories),
  account: new AccountService(repositories),
  providers: new ProviderService(repositories),
  collectors: new CollectorService(repositories),
  community: new CommunityService(repositories),
});

export const deriveImpliedAssetValue = (unitPriceMinor: number, totalUnits: number) =>
  minorUnits(unitPriceMinor * totalUnits);
