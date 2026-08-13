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
});
