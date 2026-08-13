import { afterEach, describe, expect, it, vi } from 'vitest';
import { SliceBackendClient } from '../../src/slice-backend-client.js';

const client = () => new SliceBackendClient({ baseUrl: 'https://api.slice.example/api/v1/', serviceToken: 'service-secret' });

describe('SliceBackendClient account linking', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends Discord identity context only through the centralized authenticated client', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ challengeUrl: 'https://slice.example/account?discordLink=opaque', expiresAt: '2026-08-13T00:00:00.000Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().createLinkChallenge({ discordUserId: 'discord-user', discordUsername: 'member', guildId: 'guild' })).resolves.toMatchObject({ ok: true });
    expect(fetch.mock.calls[0]?.[0].toString()).toBe('https://api.slice.example/discord/bot/link-challenges');
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
