export type BackendFailure = 'UNAUTHORIZED' | 'ACCOUNT_NOT_LINKED' | 'NOT_FOUND' | 'CONFLICT' | 'BACKEND_UNAVAILABLE' | 'RATE_LIMITED' | 'INVALID_REQUEST' | 'BACKEND_SEAM_REQUIRED';
export type BackendResult<T> = { ok: true; value: T } | { ok: false; code: BackendFailure; message: string };
export type Money = { minor: string; currency: string };
export type MarketAsset = { publicId: string; slug: string; title: string; shortName?: string | null; year?: number | null; category?: { name: string }; collectibleSet?: { name: string } | null; grading?: { companyCode: string; grade: string; label: string } | null; estimatedMarketValue?: Money | null; change24hBps?: number | null; availabilityBps?: number | null; ownersCount?: number | null; confidence?: number | null; dataStatus?: string; asOf?: string | null };
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
export type CustomerDiscordDelivery = { deliveryId: string; eventId: string; claimToken: string; discordUserId: string; category: 'ORDERS'; eventType: 'order.opened' | 'order.cancelled'; occurredAt: string; order: { id: string; assetTitle: string; side: 'BUY' | 'SELL'; units: string; limitPriceMinor: string; currency: 'GBP'; status: 'OPEN' | 'CANCELLED' } };
export type CustomerDeliveryOutcome = 'DELIVERED' | 'SUPPRESSED' | 'RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE' | 'NON_RETRYABLE_FAILURE';

/** The only HTTP boundary for Discord reads and account-linking operations. */
export class SliceBackendClient {
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  private readonly recent = new Map<string, number>();
  constructor(private readonly options: { baseUrl?: string; serviceToken?: string; timeoutMs?: number }) {}

  async searchAssets(query: string): Promise<BackendResult<MarketAsset[]>> { return this.publicRead(`/market/assets?query=${encodeURIComponent(query)}&limit=10`, (value) => object(value).items as MarketAsset[]); }
  async asset(asset: string): Promise<BackendResult<MarketAsset>> { return this.publicRead(`/market/assets/${encodeURIComponent(asset)}`, (value) => value as MarketAsset); }
  async history(asset: string): Promise<BackendResult<MarketHistory>> { return this.publicRead(`/market/assets/${encodeURIComponent(asset)}/history?range=30D`, (value) => value as MarketHistory); }
  async top(kind: 'gainers' | 'losers' | 'active'): Promise<BackendResult<MarketAsset[]>> { return this.publicRead(`/market/movers?kind=${kind}&limit=10`, (value) => object(value).items as MarketAsset[]); }
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

  private async publicRead<T>(path: string, parse: (value: unknown) => T): Promise<BackendResult<T>> {
    if (!this.options.baseUrl) return seam('Slice market read service is not configured for Discord yet.');
    const cached = this.cache.get(path);
    if (cached && cached.expires > Date.now()) return { ok: true, value: cached.value as T };
    if (!this.allow(path)) return { ok: false, code: 'RATE_LIMITED', message: 'Please retry this market query shortly.' };
    const result = await this.request(path, 'GET');
    if (!result.ok) return result;
    const value = parse(result.value);
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
      const response = await fetch(new URL(path, this.options.baseUrl), {
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
function customerDeliveries(value: unknown): CustomerDiscordDelivery[] | null { if (!Array.isArray(value)) return null; const valid = value.filter((entry): entry is CustomerDiscordDelivery => { const row = object(entry); const order = object(row.order); return typeof row.deliveryId === 'string' && typeof row.eventId === 'string' && typeof row.claimToken === 'string' && typeof row.discordUserId === 'string' && row.category === 'ORDERS' && (row.eventType === 'order.opened' || row.eventType === 'order.cancelled') && typeof row.occurredAt === 'string' && typeof order.id === 'string' && typeof order.assetTitle === 'string' && (order.side === 'BUY' || order.side === 'SELL') && typeof order.units === 'string' && /^-?\d+$/.test(String(order.limitPriceMinor)) && order.currency === 'GBP' && (order.status === 'OPEN' || order.status === 'CANCELLED'); }); return valid.length === value.length ? valid : null; }
function deliveryAcknowledgement(value: unknown): { accepted: boolean } | null { const row = object(value); return typeof row.accepted === 'boolean' ? { accepted: row.accepted } : null; }
function minorFields(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string' && /^-?\d+$/.test(value[key] as string)); }
