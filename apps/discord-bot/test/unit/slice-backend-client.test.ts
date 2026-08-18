import { afterEach, describe, expect, it, vi } from 'vitest';
import { SliceBackendClient } from '../../src/slice-backend-client.js';

const client = () => new SliceBackendClient({ baseUrl: 'https://api.slice.example/api/v1/', serviceToken: 'service-secret' });

describe('SliceBackendClient account linking', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends Discord identity context only through the centralized authenticated client', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ challengeUrl: 'https://slice.example/account?discordLink=opaque', expiresAt: '2026-08-13T00:00:00.000Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().createLinkChallenge({ discordUserId: 'discord-user', discordUsername: 'member', guildId: 'guild' })).resolves.toMatchObject({ ok: true });
    expect(fetch.mock.calls[0]?.[0].toString()).toBe('https://api.slice.example/api/v1/discord/bot/link-challenges');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer service-secret' } });
  });

  it('maps link conflicts and backend failures to safe Discord messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 409 })));
    await expect(client().unlink('discord-user')).resolves.toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('reads collector actions only from the linked-user service endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ linked: true, actions: [{ id: 'action', title: 'Card', grade: '10', type: 'ADD_TRACKING', message: 'Add tracking', actionUrl: '/collector-workspace?collectible=card' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().getCollectorActions('discord-user')).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ type: 'ADD_TRACKING' })] });
    expect(fetch.mock.calls[0]?.[0].toString()).toContain('/discord/bot/links/discord-user/collector-actions');
  });

  it('reads the existing authorized Admin operations projection through the service boundary', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ counts: { pendingReviews: 1, deliveredAwaitingReceipt: 2, verificationQueue: 3, valuationQueue: 4, marketplaceReady: 5, compliance: 6, alerts: 7 }, memberships: { pastDue: 8 }, support: { available: true, open: 9 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().getAdminOpsSummary('discord-user')).resolves.toMatchObject({ ok: true, value: { counts: { deliveredAwaitingReceipt: 2 }, support: { open: 9 } } });
    expect(fetch.mock.calls[0]?.[0].toString()).toContain('/discord/bot/admin/operations/discord-user');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: 'Bearer service-secret' } });
  });

  it('reads My Slice only through the linked-user service endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ linked: true, identity: { username: 'collector', displayName: 'Collector', preferredCurrency: 'GBP', capabilities: { investor: true, collector: true } }, portfolio: null, orders: null, collector: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().getMySliceSummary('discord-user')).resolves.toMatchObject({ ok: true, value: { linked: true, identity: { username: 'collector' } } });
    expect(fetch.mock.calls[0]?.[0].toString()).toContain('/discord/bot/links/discord-user/my-slice');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: 'Bearer service-secret' } });
  });
});

describe('SliceBackendClient public market and Collector reads', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends supported public asset filters and projects only safe asset fields', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ publicId: 'asset-public-id', slug: 'charizard-base-set', title: 'Charizard', year: 1999, category: { slug: 'pokemon', name: 'Pokémon' }, collectibleSet: { slug: 'base-set', name: 'Base Set' }, grading: null, email: 'private@example.test', submissionId: 'private-submission', custodyReference: 'private-custody' }], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const result = await client().searchAssetPage({ query: 'Charizard', category: 'pokemon', set: 'base-set', gradingCompany: 'PSA', gradeMin: 9, gradeMax: 10 });
    expect(result).toMatchObject({ ok: true, value: { items: [{ slug: 'charizard-base-set' }] } });
    const request = new URL(fetch.mock.calls[0]?.[0].toString());
    expect(request.pathname).toBe('/api/v1/market/assets');
    expect(Object.fromEntries(request.searchParams)).toMatchObject({ query: 'Charizard', category: 'pokemon', set: 'base-set', gradingCompany: 'PSA', gradeMin: '9', gradeMax: '10' });
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(JSON.stringify(result)).not.toContain('private-submission');
    expect(JSON.stringify(result)).not.toContain('private-custody');
  });

  it('keeps public Collector profiles redacted and maps malformed public data safely', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ slug: 'public-collector', displayName: 'Public Collector', headline: null, specialism: 'Vintage cards', publishedListingCount: 1, publishedListings: [{ publicId: 'asset-public-id', slug: 'charizard-base-set', title: 'Charizard', category: 'Pokémon', market: null }], email: 'private@example.test', walletBalanceMinor: '99999', address: 'private address' }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ secret: 'not a market asset' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const first = await client().collector('public-collector');
    const second = await client().asset('bad-asset');
    expect(first).toMatchObject({ ok: true, value: { slug: 'public-collector', publishedListingCount: 1 } });
    expect(JSON.stringify(first)).not.toContain('private@example.test');
    expect(JSON.stringify(first)).not.toContain('99999');
    expect(JSON.stringify(first)).not.toContain('private address');
    expect(second).toMatchObject({ ok: false, code: 'BACKEND_UNAVAILABLE' });
  });

  it('uses the short public cache instead of repeatedly polling market data', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const read = client();
    await expect(read.searchAssetPage()).resolves.toMatchObject({ ok: true });
    await expect(read.searchAssetPage()).resolves.toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
