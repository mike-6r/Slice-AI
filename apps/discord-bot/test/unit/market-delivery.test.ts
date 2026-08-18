import { describe, expect, it, vi } from 'vitest';
import { MarketDigestWorker } from '../../src/market-digest-worker.js';
import { marketDigestPayload } from '../../src/market-digest.js';
import { PriceAlertWorker, authoritativePrice, priceAlertPayload } from '../../src/price-alert-worker.js';

const asOf = '2026-08-18T09:00:00.000Z';
const asset = (slug: string, change24hBps = 125) => ({ publicId: slug, slug, title: slug.toUpperCase(), estimatedMarketValue: { minor: '12345', currency: 'GBP' }, change24hBps, source: 'SLICE_MARKET', asOf, dataStatus: 'LIVE' });
const summary = (dataStatus: 'LIVE' | 'DELAYED' | 'DEMO' = 'LIVE') => ({ totalEstimatedMarketValue: { minor: '100000', currency: 'GBP' }, volume24h: { minor: '25000', currency: 'GBP' }, activeAssetCount: 2, collectorCount: 3, source: 'SLICE_MARKET', asOf, dataStatus });
const routes = { marketplaceUrl: () => 'https://slice.example/marketplace' };

describe('authoritative market digest payload', () => {
  it('preserves backend ordering, source/as-of/status, and omits unsupported empty sections', () => {
    const payload = marketDigestPayload({ summary: summary(), gainers: [asset('first', 200), asset('second', 100)], losers: [] }, 3, routes.marketplaceUrl());
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.fields?.[0]?.value).toContain('FIRST');
    expect(embed.fields?.[0]?.value).toContain('SLICE_MARKET');
    expect(embed.fields).toHaveLength(1);
    expect(embed.description).toContain('As of:');
    expect(embed.description).toContain('Data status: **LIVE**');
  });

  it.each(['DEMO', 'DELAYED'] as const)('labels %s data visibly', (dataStatus) => {
    const payload = marketDigestPayload({ summary: summary(dataStatus), gainers: [], losers: [] }, 3);
    expect(payload.embeds[0]!.toJSON().title).toContain(dataStatus);
  });
});

describe('market digest worker', () => {
  function fixture(overrides: { summary?: unknown; claim?: boolean; roleId?: string | null } = {}) {
    const send = vi.fn(async () => ({ id: 'message', channelId: 'channel' }));
    const backend = { marketSummary: vi.fn(async () => ({ ok: true, value: overrides.summary ?? summary() })), movers: vi.fn(async (kind: string) => ({ ok: true, value: kind === 'gainers' ? [asset('gainer')] : [asset('loser', -75)] })) };
    const repository = { claimMarketDigest: vi.fn(async () => overrides.claim ?? true), completeMarketDigest: vi.fn(), failMarketDigest: vi.fn() };
    const setup = { listGuildConfigs: vi.fn(async () => [{ guildId: 'guild' }]), getResource: vi.fn(async (_guildId: string, type: string, key: string) => type === 'CHANNEL' && key === 'market-feed' ? { discordId: 'channel' } : overrides.roleId && type === 'ROLE' ? { discordId: overrides.roleId } : null) };
    const discord = { guilds: { fetch: vi.fn(async () => ({ channels: { fetch: vi.fn(async () => ({ id: 'channel', isTextBased: () => true, send })) } })) } };
    const report = vi.fn();
    const worker = new MarketDigestWorker(backend as never, repository as never, setup as never, discord as never, routes as never, { MARKET_DIGEST_ENABLED: true, MARKET_DIGEST_HOUR: 9, MARKET_DIGEST_MAX_ITEMS: 3, MARKET_DIGEST_MENTION_OPT_IN_ROLE: Boolean(overrides.roleId) }, report);
    return { worker, backend, repository, send, report };
  }

  it('posts once to the managed market channel and only mentions the opt-in role when configured', async () => {
    const state = fixture({ roleId: 'market-role' });
    await state.worker.scan(new Date(asOf));
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ content: '<@&market-role>', allowedMentions: expect.objectContaining({ roles: ['market-role'] }) }));
    expect(state.repository.completeMarketDigest).toHaveBeenCalledWith('guild', '2026-08-18', 'channel', 'message');
  });

  it('skips unavailable backend data and duplicate claims without posting backend errors', async () => {
    const unavailable = fixture({ summary: { ...summary(), dataStatus: 'UNAVAILABLE', asOf: null, source: 'NO_MARKET_DATA' } });
    await unavailable.worker.scan(new Date(asOf));
    expect(unavailable.send).not.toHaveBeenCalled();
    expect(unavailable.report).toHaveBeenCalledWith('market_digest.skipped', expect.any(Object));
    const duplicate = fixture({ claim: false }); await duplicate.worker.scan(new Date(asOf));
    expect(duplicate.send).not.toHaveBeenCalled();
  });

  it('contains a raw backend exception without posting it publicly', async () => {
    const state = fixture(); state.backend.marketSummary.mockRejectedValueOnce(new Error('private upstream detail'));
    await state.worker.scan(new Date(asOf));
    expect(state.send).not.toHaveBeenCalled();
    expect(state.report).toHaveBeenCalledWith('market_digest.skipped', { category: 'BACKEND_UNAVAILABLE' });
    expect(JSON.stringify(state.report.mock.calls)).not.toContain('private upstream detail');
  });
});

describe('private price-alert worker', () => {
  const alert = { id: 'alert', guildId: 'guild', discordUserId: 'member', assetId: 'asset', condition: 'PRICE_ABOVE', thresholdMinor: 100n, enabled: true };
  const delivery = { id: 'delivery', alertId: 'alert', idempotencyKey: 'key', assetTitle: 'Asset', observedMinor: 125n, currency: 'GBP', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: new Date(asOf), status: 'PENDING', attempts: 0, alert };
  function fixture(status: 'LIVE' | 'DEMO' | 'DELAYED' = 'LIVE') {
    const send = vi.fn(async () => ({ id: 'dm-message', channelId: 'dm-channel' }));
    const backend = { asset: vi.fn(async () => ({ ok: true, value: { ...asset('asset'), dataStatus: status } })) };
    const repository = { activeAlerts: vi.fn(async () => [alert, { ...alert, id: 'second' }]), recordAlertEvaluation: vi.fn(async () => 'UPDATED'), pendingPriceAlertDeliveries: vi.fn(async () => []), claimPriceAlertDelivery: vi.fn(async () => true), completePriceAlertDelivery: vi.fn() };
    const discord = { users: { fetch: vi.fn(async () => ({ send })) } };
    const report = vi.fn(); const worker = new PriceAlertWorker(backend as never, repository as never, discord as never, routes as never, { PRICE_ALERTS_ENABLED: true, PRICE_ALERT_BATCH_SIZE: 100, PRICE_ALERT_CONCURRENCY: 2 }, report);
    return { worker, backend, repository, send, report };
  }

  it('fetches each asset once, evaluates integer thresholds, and does not evaluate DEMO or DELAYED data', async () => {
    const live = fixture(); await live.worker.scan();
    expect(live.backend.asset).toHaveBeenCalledTimes(1);
    expect(live.repository.recordAlertEvaluation).toHaveBeenCalledTimes(2);
    expect(live.repository.recordAlertEvaluation).toHaveBeenCalledWith(expect.objectContaining({ observedMinor: 12345n, conditionMet: true, source: 'SLICE_MARKET', dataStatus: 'LIVE' }));
    for (const status of ['DEMO', 'DELAYED'] as const) { const state = fixture(status); await state.worker.scan(); expect(state.repository.recordAlertEvaluation).not.toHaveBeenCalled(); expect(state.report).toHaveBeenCalledWith('price_alert.skipped_data_status', expect.objectContaining({ dataStatus: status })); }
  });

  it('delivers only by DM and retries a known failed DM without replaying an uncertain successful send', async () => {
    const state = fixture(); state.repository.activeAlerts.mockResolvedValue([]); state.repository.pendingPriceAlertDeliveries.mockResolvedValueOnce([delivery]).mockResolvedValueOnce([delivery]).mockResolvedValueOnce([]); state.send.mockRejectedValueOnce({ code: 50000 });
    await state.worker.scan(); await state.worker.scan(); await state.worker.scan();
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.repository.completePriceAlertDelivery).toHaveBeenNthCalledWith(1, 'delivery', expect.objectContaining({ status: 'RETRYABLE_FAILURE' }));
    expect(state.repository.completePriceAlertDelivery).toHaveBeenNthCalledWith(2, 'delivery', expect.objectContaining({ status: 'DELIVERED', channelId: 'dm-channel' }));
    expect(priceAlertPayload(delivery, routes).allowedMentions).toEqual({ parse: [], users: [], roles: [], repliedUser: false });
  });

  it('isolates one unavailable asset while continuing the remaining bounded batch', async () => {
    const state = fixture();
    state.repository.activeAlerts.mockResolvedValue([alert, { ...alert, id: 'available-alert', assetId: 'available' }]);
    state.backend.asset.mockImplementation(async (assetId: string) => assetId === 'asset' ? Promise.reject(new Error('backend unavailable')) : ({ ok: true, value: asset('available') }));
    await state.worker.scan();
    expect(state.repository.recordAlertEvaluation).toHaveBeenCalledTimes(1);
    expect(state.report).toHaveBeenCalledWith('price_alert.asset_unavailable', { assetId: 'asset', category: 'BACKEND_UNAVAILABLE' });
  });

  it('rejects incomplete authoritative price records without inventing a fallback', () => {
    expect(authoritativePrice({ ...asset('missing'), estimatedMarketValue: null })).toBeNull();
    expect(authoritativePrice({ ...asset('unknown-source'), source: undefined })).toBeNull();
  });
});
