export type BackendFailure = 'UNAUTHORIZED' | 'ACCOUNT_NOT_LINKED' | 'NOT_FOUND' | 'CONFLICT' | 'BACKEND_UNAVAILABLE' | 'RATE_LIMITED' | 'INVALID_REQUEST' | 'BACKEND_SEAM_REQUIRED';
export type BackendResult<T> = { ok: true; value: T } | { ok: false; code: BackendFailure; message: string };
export type Money = { minor: string; currency: string };
export type MarketAsset = { publicId: string; slug: string; title: string; shortName?: string | null; year?: number | null; manufacturer?: string | null; cardNumber?: string | null; conditionLabel?: string | null; category?: { slug?: string; name: string }; collectibleSet?: { slug?: string; name: string } | null; grading?: { companyCode: string; grade: string; label: string } | null; estimatedMarketValue?: Money | null; sliceValuation?: { amount: Money; confidence?: number; status?: string; approvedAt?: string } | null; marketReference?: { amount?: Money; provider?: string; asOf?: string; dataStatus?: string } | null; change24hBps?: number | null; availabilityBps?: number | null; ownersCount?: number | null; confidence?: number | null; dataStatus?: string; freshness?: string; asOf?: string | null; initialOffering?: { status: string; totalUnits: string; offeredUnits: string; retainedUnits: string; pricePerUnitMinor: string; currency: string; inventory?: { availableUnits: string } | null } | null; trading?: { status: string; enabled: boolean; hasExecutionHistory: boolean } | null; marketLifecycle?: { status?: string; label?: string } | null };
export type MarketAssetPage = { items: MarketAsset[]; nextCursor: string | null };
export type PublicCollector = { slug: string; headline: string | null; specialism: string | null; displayName: string | null; publishedListingCount: number; publishedListings: Array<{ publicId: string; slug: string; title: string; category: string; market: { estimatedValueMinor: string; currency: string; asOf: string; dataStatus: string } | null }> };
export type PublicCollectorPage = { items: PublicCollector[]; nextCursor: string | null };
export type PublicVaultEvent = { id: string; type: string; occurredAt: string; publicSummary: string; assetSlug: string };
export type PublicVaultSummary = { authority: string; eventCount: number };
export type MarketHistory = { assetSlug: string; range: string; points: Array<{ observedAt: string; estimatedMarketValue: Money; source: string; dataStatus: string }> };
export type DiscordLinkStatus =
  | { linked: false }
  | {
      linked: true;
      user: {
        username: string | null;
        displayName: string | null;
        roles: string[];
        preferredCurrency: string | null;
        collector: { enabled: boolean; membership: { planName: string; status: string; activeCollectibles: number; maxActiveCollectibles: number | null; monthlySubmissions: number; monthlyLimit: number | null; concurrentIntake: number; concurrentIntakeLimit: number | null; billingState: string; manageUrl: string } | null; openActionCount: number | null };
        portfolio: { available: boolean };
        orders: { available: boolean };
      };
    };
export type DiscordLinkChallenge = { challengeUrl: string; expiresAt: string };
export type CollectorAction = { id: string; title: string; grade: string | null; type: string; message: string; actionUrl: string };
export type AdminOperationsSummary = {
  counts: { pendingReviews: number; deliveredAwaitingReceipt: number; verificationQueue: number; valuationQueue: number; marketplaceReady: number; compliance: number; alerts: number };
  memberships: { pastDue: number };
  support: { available: boolean; open?: number };
};
export type MySliceSummary =
  | { linked: false }
  | {
      linked: true;
      identity: { username: string | null; displayName: string | null; preferredCurrency: 'GBP' | 'USD' | 'CAD' | 'EUR'; capabilities: { investor: boolean; collector: boolean } };
      portfolio: { currency: string; estimatedPortfolioValueMinor: string; estimatedHoldingsValueMinor: string; availableCashMinor: string; reservedCashMinor: string; holdings: number; valuationStatus: string } | null;
      orders: { openCount: number; recent: Array<{ assetTitle: string; assetSlug: string; side: string; status: string; remainingUnits: string; filledUnits: string; limitPriceMinor: string; currency: string }> } | null;
      collector: { collectibles: number; marketLive: number; inReview: number; openActionCount: number; membership: { planName: string; status: string; activeCollectibles: number; maxActiveCollectibles: number | null; monthlySubmissions: number; monthlyLimit: number | null; concurrentIntake: number; concurrentIntakeLimit: number | null } | null } | null;
    };
export type CustomerDiscordDelivery = { deliveryId: string; eventId: string; claimToken: string; discordUserId: string; category: 'ORDERS' | 'COLLECTOR_ACTIONS' | 'SHIPPING'; eventType: string; occurredAt: string; order?: { id: string; assetTitle: string; side: 'BUY' | 'SELL'; units: string; limitPriceMinor: string; currency: 'GBP'; status: 'OPEN' | 'CANCELLED' | 'PARTIALLY_FILLED' | 'FILLED' | 'EXPIRED' }; resource?: { submissionId: string; intakeId: string | null; title: string; status: string } };
export type CustomerDeliveryOutcome = 'DELIVERED' | 'SUPPRESSED' | 'RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE' | 'NON_RETRYABLE_FAILURE';

/** The only HTTP boundary for Discord reads and account-linking operations. */
export class SliceBackendClient {
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  private readonly recent = new Map<string, number>();
  constructor(private readonly options: { baseUrl?: string; serviceToken?: string; timeoutMs?: number }) {}

  async searchAssets(query: string): Promise<BackendResult<MarketAsset[]>> { const result = await this.searchAssetPage({ query, limit: 10 }); return result.ok ? { ok: true, value: result.value.items } : result; }
  async searchAssetPage(input: { query?: string; category?: string; set?: string; gradingCompany?: string; gradeMin?: number; gradeMax?: number; limit?: number; cursor?: string } = {}): Promise<BackendResult<MarketAssetPage>> { const query = new URLSearchParams(); for (const [key, value] of Object.entries({ ...input, limit: Math.min(Math.max(input.limit ?? 24, 1), 48) })) if (value !== undefined && value !== '') query.set(key, String(value)); return this.publicRead(`/market/assets?${query}`, marketAssetPage); }
  async asset(asset: string): Promise<BackendResult<MarketAsset>> { return this.publicRead(`/market/assets/${encodeURIComponent(asset)}`, marketAsset); }
  async history(asset: string): Promise<BackendResult<MarketHistory>> { return this.publicRead(`/market/assets/${encodeURIComponent(asset)}/history?range=30D`, (value) => value as MarketHistory); }
  async top(kind: 'gainers' | 'losers' | 'active'): Promise<BackendResult<MarketAsset[]>> { const result = await this.movers(kind); return result.ok ? { ok: true, value: result.value } : result; }
  async movers(kind: 'gainers' | 'losers' | 'active'): Promise<BackendResult<MarketAsset[]>> { return this.publicRead(`/market/movers?kind=${kind}&limit=24`, (value) => array(object(value).items).map(marketAsset).filter(present)); }
  async collectorDirectory(limit = 100): Promise<BackendResult<PublicCollectorPage>> { return this.publicRead(`/collectors?limit=${Math.min(Math.max(limit, 1), 100)}`, collectorPage); }
  async collector(slug: string): Promise<BackendResult<PublicCollector>> { return this.publicRead(`/collectors/${encodeURIComponent(slug)}`, publicCollector); }
  async vaultEvents(limit = 12): Promise<BackendResult<{ items: PublicVaultEvent[]; nextCursor: string | null }>> { return this.publicRead(`/vault/events?limit=${Math.min(Math.max(limit, 1), 100)}`, vaultEvents); }
  async vaultSummary(): Promise<BackendResult<PublicVaultSummary>> { return this.publicRead('/vault/summary', vaultSummary); }
  async recentSales(): Promise<BackendResult<never[]>> { return { ok: false, code: 'BACKEND_SEAM_REQUIRED', message: 'Recent-sale read delivery is not available to Discord yet.' }; }
  async createLinkChallenge(input: { discordUserId: string; discordUsername: string; discordDisplayName?: string | null; guildId?: string | null }): Promise<BackendResult<DiscordLinkChallenge>> { return this.serviceRequest('/discord/bot/link-challenges', 'POST', input, challenge); }
  async getLinkStatus(discordUserId: string): Promise<BackendResult<DiscordLinkStatus>> { return this.serviceRequest(`/discord/bot/links/${encodeURIComponent(discordUserId)}`, 'GET', undefined, linkStatus); }
  async getMySliceSummary(discordUserId: string): Promise<BackendResult<MySliceSummary>> { return this.serviceRequest(`/discord/bot/links/${encodeURIComponent(discordUserId)}/my-slice`, 'GET', undefined, mySliceSummary); }
  async unlink(discordUserId: string): Promise<BackendResult<{ disconnected: boolean }>> { return this.serviceRequest(`/discord/bot/links/${encodeURIComponent(discordUserId)}`, 'DELETE', undefined, disconnected); }
  async getCollectorActions(discordUserId: string): Promise<BackendResult<CollectorAction[]>> { return this.serviceRequest(`/discord/bot/links/${encodeURIComponent(discordUserId)}/collector-actions`, 'GET', undefined, collectorActions); }
  async getAdminOpsSummary(discordUserId: string): Promise<BackendResult<AdminOperationsSummary>> { return this.serviceRequest(`/discord/bot/admin/operations/${encodeURIComponent(discordUserId)}`, 'GET', undefined, adminOperations); }
  async pullCustomerDeliveries(limit = 25): Promise<BackendResult<CustomerDiscordDelivery[]>> { return this.serviceRequest(`/discord/bot/deliveries?limit=${Math.min(Math.max(limit, 1), 100)}`, 'GET', undefined, customerDeliveries); }
  async acknowledgeCustomerDelivery(deliveryId: string, claimToken: string, outcome: CustomerDeliveryOutcome): Promise<BackendResult<{ accepted: boolean }>> { return this.serviceRequest(`/discord/bot/deliveries/${encodeURIComponent(deliveryId)}/ack`, 'POST', { claimToken, outcome }, deliveryAcknowledgement); }
  async getPortfolioSummary(): Promise<BackendResult<never>> { return { ok: false, code: 'BACKEND_SEAM_REQUIRED', message: 'Portfolio delivery is not available to Discord yet.' }; }
  async getOrdersSummary(): Promise<BackendResult<never>> { return { ok: false, code: 'BACKEND_SEAM_REQUIRED', message: 'Order delivery is not available to Discord yet.' }; }

  private async publicRead<T>(path: string, parse: (value: unknown) => T | null): Promise<BackendResult<T>> {
    if (!this.options.baseUrl) return seam('Slice market read service is not configured for Discord yet.');
    const cached = this.cache.get(path);
    if (cached && cached.expires > Date.now()) return { ok: true, value: cached.value as T };
    if (!this.allow(path)) return { ok: false, code: 'RATE_LIMITED', message: 'Please retry this market query shortly.' };
    const result = await this.request(path, 'GET');
    if (!result.ok) return result;
    const value = parse(result.value);
    if (value === null) return { ok: false, code: 'BACKEND_UNAVAILABLE', message: 'Slice returned an invalid public response.' };
    this.cache.set(path, { expires: Date.now() + 30_000, value });
    return { ok: true, value };
  }

  private async serviceRequest<T>(path: string, method: 'GET' | 'POST' | 'DELETE', body: unknown, parse: (value: unknown) => T | null): Promise<BackendResult<T>> {
    if (!this.options.baseUrl || !this.options.serviceToken) return seam('Secure Slice account linking is not configured for Discord yet.');
    if (method === 'GET' && !this.allow(path)) return { ok: false, code: 'RATE_LIMITED', message: 'Please retry this Slice request shortly.' };
    const result = await this.request(path, method, body, true);
    if (!result.ok) return result;
    const value = parse(result.value);
    return value ? { ok: true, value } : { ok: false, code: 'BACKEND_UNAVAILABLE', message: 'Slice returned an invalid response.' };
  }

  private allow(key: string): boolean { const now = Date.now(); if ((this.recent.get(key) ?? 0) + 500 > now) return false; this.recent.set(key, now); return true; }
  private async request(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown, service = false): Promise<BackendResult<unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5_000);
    try {
      const configuredBaseUrl = this.options.baseUrl;
      if (!configuredBaseUrl) return seam('Slice market read service is not configured for Discord yet.');
      const baseUrl = configuredBaseUrl.endsWith('/') ? configuredBaseUrl : `${configuredBaseUrl}/`;
      const response = await fetch(new URL(path.replace(/^\//, ''), baseUrl), {
        method,
        headers: {
          ...(service && this.options.serviceToken ? { authorization: `Bearer ${this.options.serviceToken}` } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) return failure(response.status, service);
      return { ok: true, value: await response.json() };
    } catch { return { ok: false, code: 'BACKEND_UNAVAILABLE', message: 'Slice is temporarily unavailable. Try again shortly.' }; }
    finally { clearTimeout(timeout); }
  }
}

function seam<T>(message: string): BackendResult<T> { return { ok: false, code: 'BACKEND_SEAM_REQUIRED', message }; }
function failure(status: number, linked = false): BackendResult<never> { if (status === 401 || status === 403) return { ok: false, code: 'UNAUTHORIZED', message: 'This Slice request is not authorized.' }; if (status === 404) return { ok: false, code: linked ? 'ACCOUNT_NOT_LINKED' : 'NOT_FOUND', message: linked ? 'Connect your Slice account to use this feature.' : 'That Slice asset was not found.' }; if (status === 409) return { ok: false, code: 'CONFLICT', message: 'This Slice account is already connected elsewhere.' }; if (status === 429) return { ok: false, code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' }; if (status >= 400 && status < 500) return { ok: false, code: 'INVALID_REQUEST', message: 'That Slice request is invalid.' }; return { ok: false, code: 'BACKEND_UNAVAILABLE', message: 'Slice is temporarily unavailable. Try again shortly.' }; }
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function challenge(value: unknown): DiscordLinkChallenge | null { const item = object(value); return typeof item.challengeUrl === 'string' && typeof item.expiresAt === 'string' ? { challengeUrl: item.challengeUrl, expiresAt: item.expiresAt } : null; }
function disconnected(value: unknown): { disconnected: boolean } | null { const item = object(value); return typeof item.disconnected === 'boolean' ? { disconnected: item.disconnected } : null; }
function linkStatus(value: unknown): DiscordLinkStatus | null { const item = object(value); if (item.linked === false) return { linked: false }; if (item.linked === true && item.user && typeof item.user === 'object') return item as unknown as DiscordLinkStatus; return null; }
function collectorActions(value: unknown): CollectorAction[] | null { const item = object(value); return Array.isArray(item.actions) ? item.actions.filter((action): action is CollectorAction => { const row = object(action); return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.type === 'string' && typeof row.message === 'string' && typeof row.actionUrl === 'string' && (typeof row.grade === 'string' || row.grade === null); }) : null; }
function adminOperations(value: unknown): AdminOperationsSummary | null { const item = object(value); const counts = object(item.counts); const memberships = object(item.memberships); const support = object(item.support); const fields = ['pendingReviews', 'deliveredAwaitingReceipt', 'verificationQueue', 'valuationQueue', 'marketplaceReady', 'compliance', 'alerts']; if (!fields.every((key) => typeof counts[key] === 'number') || typeof memberships.pastDue !== 'number' || typeof support.available !== 'boolean') return null; return { counts: { pendingReviews: counts.pendingReviews as number, deliveredAwaitingReceipt: counts.deliveredAwaitingReceipt as number, verificationQueue: counts.verificationQueue as number, valuationQueue: counts.valuationQueue as number, marketplaceReady: counts.marketplaceReady as number, compliance: counts.compliance as number, alerts: counts.alerts as number }, memberships: { pastDue: memberships.pastDue as number }, support: { available: support.available as boolean, ...(typeof support.open === 'number' ? { open: support.open } : {}) } }; }
function mySliceSummary(value: unknown): MySliceSummary | null { const item = object(value); if (item.linked === false) return { linked: false }; const identity = object(item.identity); const capabilities = object(identity.capabilities); if (item.linked !== true || !['GBP', 'USD', 'CAD', 'EUR'].includes(String(identity.preferredCurrency)) || typeof capabilities.investor !== 'boolean' || typeof capabilities.collector !== 'boolean') return null; const portfolio = item.portfolio === null ? null : object(item.portfolio); const orders = item.orders === null ? null : object(item.orders); const collector = item.collector === null ? null : object(item.collector); if ((portfolio && (!minorFields(portfolio, ['estimatedPortfolioValueMinor', 'estimatedHoldingsValueMinor', 'availableCashMinor', 'reservedCashMinor']) || typeof portfolio.currency !== 'string' || typeof portfolio.holdings !== 'number' || typeof portfolio.valuationStatus !== 'string')) || (orders && (typeof orders.openCount !== 'number' || !Array.isArray(orders.recent))) || (collector && (typeof collector.collectibles !== 'number' || typeof collector.marketLive !== 'number' || typeof collector.inReview !== 'number' || typeof collector.openActionCount !== 'number'))) return null; return item as MySliceSummary; }
function customerDeliveries(value: unknown): CustomerDiscordDelivery[] | null { if (!Array.isArray(value)) return null; const valid = value.filter((entry): entry is CustomerDiscordDelivery => { const row = object(entry); const order = object(row.order); const resource = object(row.resource); const base = typeof row.deliveryId === 'string' && typeof row.eventId === 'string' && typeof row.claimToken === 'string' && typeof row.discordUserId === 'string' && typeof row.eventType === 'string' && typeof row.occurredAt === 'string'; if (row.category === 'ORDERS') return base && typeof order.id === 'string' && typeof order.assetTitle === 'string' && (order.side === 'BUY' || order.side === 'SELL') && typeof order.units === 'string' && /^-?\d+$/.test(String(order.limitPriceMinor)) && order.currency === 'GBP' && ['OPEN', 'CANCELLED', 'PARTIALLY_FILLED', 'FILLED', 'EXPIRED'].includes(String(order.status)); return base && (row.category === 'COLLECTOR_ACTIONS' || row.category === 'SHIPPING') && typeof resource.submissionId === 'string' && typeof resource.title === 'string' && typeof resource.status === 'string' && (typeof resource.intakeId === 'string' || resource.intakeId === null); }); return valid.length === value.length ? valid : null; }
function deliveryAcknowledgement(value: unknown): { accepted: boolean } | null { const row = object(value); return typeof row.accepted === 'boolean' ? { accepted: row.accepted } : null; }
function minorFields(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string' && /^-?\d+$/.test(value[key] as string)); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function money(value: unknown): Money | null { const row = object(value); return typeof row.currency === 'string' && typeof row.minor === 'string' && /^-?\d+$/.test(row.minor) ? { currency: row.currency, minor: row.minor } : null; }
function marketAsset(value: unknown): MarketAsset | null {
  const row = object(value); if (typeof row.publicId !== 'string' || typeof row.slug !== 'string' || typeof row.title !== 'string') return null;
  const category = object(row.category); const collectibleSet = object(row.collectibleSet); const grading = object(row.grading); const valuation = object(row.sliceValuation); const reference = object(row.marketReference); const offering = object(row.initialOffering); const inventory = object(offering.inventory); const trading = object(row.trading); const estimated = money(row.estimatedMarketValue); const valuationAmount = money(valuation.amount); const referenceAmount = money(reference.amount);
  return {
    publicId: row.publicId, slug: row.slug, title: row.title,
    ...(typeof row.shortName === 'string' || row.shortName === null ? { shortName: row.shortName } : {}), ...(typeof row.year === 'number' ? { year: row.year } : {}), ...(typeof row.manufacturer === 'string' || row.manufacturer === null ? { manufacturer: row.manufacturer } : {}), ...(typeof row.cardNumber === 'string' || row.cardNumber === null ? { cardNumber: row.cardNumber } : {}), ...(typeof row.conditionLabel === 'string' || row.conditionLabel === null ? { conditionLabel: row.conditionLabel } : {}),
    ...(typeof category.name === 'string' ? { category: { name: category.name, ...(typeof category.slug === 'string' ? { slug: category.slug } : {}) } } : {}), ...(typeof collectibleSet.name === 'string' ? { collectibleSet: { name: collectibleSet.name, ...(typeof collectibleSet.slug === 'string' ? { slug: collectibleSet.slug } : {}) } } : { collectibleSet: null }), ...(typeof grading.companyCode === 'string' && typeof grading.grade === 'string' && typeof grading.label === 'string' ? { grading: { companyCode: grading.companyCode, grade: grading.grade, label: grading.label } } : { grading: null }), ...(estimated ? { estimatedMarketValue: estimated } : { estimatedMarketValue: null }), ...(valuationAmount ? { sliceValuation: { amount: valuationAmount, ...(typeof valuation.confidence === 'number' ? { confidence: valuation.confidence } : {}), ...(typeof valuation.status === 'string' ? { status: valuation.status } : {}), ...(typeof valuation.approvedAt === 'string' ? { approvedAt: valuation.approvedAt } : {}) } } : { sliceValuation: null }), ...(referenceAmount ? { marketReference: { amount: referenceAmount, ...(typeof reference.provider === 'string' ? { provider: reference.provider } : {}), ...(typeof reference.asOf === 'string' ? { asOf: reference.asOf } : {}), ...(typeof reference.dataStatus === 'string' ? { dataStatus: reference.dataStatus } : {}) } } : { marketReference: null }),
    ...(typeof row.change24hBps === 'number' ? { change24hBps: row.change24hBps } : { change24hBps: null }), ...(typeof row.availabilityBps === 'number' ? { availabilityBps: row.availabilityBps } : { availabilityBps: null }), ...(typeof row.ownersCount === 'number' ? { ownersCount: row.ownersCount } : { ownersCount: null }), ...(typeof row.confidence === 'number' ? { confidence: row.confidence } : {}), ...(typeof row.dataStatus === 'string' ? { dataStatus: row.dataStatus } : {}), ...(typeof row.freshness === 'string' ? { freshness: row.freshness } : {}),
    ...(typeof offering.status === 'string' && typeof offering.totalUnits === 'string' && typeof offering.offeredUnits === 'string' && typeof offering.retainedUnits === 'string' && typeof offering.pricePerUnitMinor === 'string' && typeof offering.currency === 'string' ? { initialOffering: { status: offering.status, totalUnits: offering.totalUnits, offeredUnits: offering.offeredUnits, retainedUnits: offering.retainedUnits, pricePerUnitMinor: offering.pricePerUnitMinor, currency: offering.currency, inventory: typeof inventory.availableUnits === 'string' ? { availableUnits: inventory.availableUnits } : null } } : { initialOffering: null }), ...(typeof trading.status === 'string' && typeof trading.enabled === 'boolean' && typeof trading.hasExecutionHistory === 'boolean' ? { trading: { status: trading.status, enabled: trading.enabled, hasExecutionHistory: trading.hasExecutionHistory } } : { trading: null }),
  };
}
function marketAssetPage(value: unknown): MarketAssetPage | null { const row = object(value); if (typeof row.nextCursor !== 'string' && row.nextCursor !== null) return null; const items = array(row.items).map(marketAsset).filter(present); return items.length === array(row.items).length ? { items, nextCursor: row.nextCursor as string | null } : null; }
function publicCollector(value: unknown): PublicCollector | null { const row = object(value); if (typeof row.slug !== 'string' || typeof row.publishedListingCount !== 'number') return null; const listings = array(row.publishedListings).flatMap((entry) => { const item = object(entry); if (typeof item.publicId !== 'string' || typeof item.slug !== 'string' || typeof item.title !== 'string' || typeof item.category !== 'string') return []; const market = object(item.market); return [{ publicId: item.publicId, slug: item.slug, title: item.title, category: item.category, market: typeof market.estimatedValueMinor === 'string' && typeof market.currency === 'string' && typeof market.asOf === 'string' && typeof market.dataStatus === 'string' ? { estimatedValueMinor: market.estimatedValueMinor, currency: market.currency, asOf: market.asOf, dataStatus: market.dataStatus } : null }]; }); if (listings.length !== array(row.publishedListings).length || (typeof row.headline !== 'string' && row.headline !== null) || (typeof row.specialism !== 'string' && row.specialism !== null) || (typeof row.displayName !== 'string' && row.displayName !== null)) return null; return { slug: row.slug, headline: row.headline as string | null, specialism: row.specialism as string | null, displayName: row.displayName as string | null, publishedListingCount: row.publishedListingCount, publishedListings: listings }; }
function collectorPage(value: unknown): PublicCollectorPage | null { const row = object(value); if (typeof row.nextCursor !== 'string' && row.nextCursor !== null) return null; const items = array(row.items).map(publicCollector).filter(present); return items.length === array(row.items).length ? { items, nextCursor: row.nextCursor as string | null } : null; }
function vaultEvents(value: unknown): { items: PublicVaultEvent[]; nextCursor: string | null } | null { const row = object(value); if (typeof row.nextCursor !== 'string' && row.nextCursor !== null) return null; const items = array(row.items).flatMap((entry) => { const item = object(entry); return typeof item.id === 'string' && typeof item.type === 'string' && typeof item.occurredAt === 'string' && typeof item.publicSummary === 'string' && typeof item.assetSlug === 'string' ? [{ id: item.id, type: item.type, occurredAt: item.occurredAt, publicSummary: item.publicSummary, assetSlug: item.assetSlug }] : []; }); return items.length === array(row.items).length ? { items, nextCursor: row.nextCursor as string | null } : null; }
function vaultSummary(value: unknown): PublicVaultSummary | null { const row = object(value); return typeof row.authority === 'string' && typeof row.eventCount === 'number' ? { authority: row.authority, eventCount: row.eventCount } : null; }
function present<T>(value: T | null): value is T { return value !== null; }
