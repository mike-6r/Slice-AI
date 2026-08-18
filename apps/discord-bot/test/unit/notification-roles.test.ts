import { describe, expect, it, vi } from 'vitest';
import type { Guild, GuildMember } from 'discord.js';
import { NotificationRoleReconciliationService, NotificationRoleUnavailableError } from '../../src/notification-roles.js';
import type { SetupRepository } from '../../src/persistence/setup-repository.js';

const notificationKeys = ['new-listings', 'price-alerts', 'rare-cards', 'auctions', 'giveaways', 'news', 'market-summary', 'platform-updates'];

function fixture(options: { elevated?: boolean; aboveBot?: boolean } = {}) {
  const rawGuild = { id: 'guild', roles: { cache: new Map() }, members: { me: { roles: { highest: { position: 10 } } } } };
  const guild = rawGuild as unknown as Guild;
  for (const key of notificationKeys) rawGuild.roles.cache.set(key, { id: key, guild, editable: true, position: options.aboveBot && key === 'new-listings' ? 10 : 1, permissions: { bitfield: options.elevated && key === 'new-listings' ? 8n : 0n } });
  const assigned = new Set<string>();
  const rawMember = { id: 'member', roles: { cache: { has: (id: string) => assigned.has(id) }, add: vi.fn(async (id: string) => { assigned.add(id); }), remove: vi.fn(async (id: string) => { assigned.delete(id); }) } };
  const member = rawMember as unknown as GuildMember;
  const preferences = new Map<string, boolean>();
  const rawRepository = {
    getResource: vi.fn(async (_guildId: string, type: string, key: string) => type === 'ROLE' && notificationKeys.includes(key) ? { discordId: key } : null),
    setNotificationPreference: vi.fn(async (row: { logicalKey: string; enabled: boolean }) => { preferences.set(row.logicalKey, row.enabled); }),
    listNotificationPreferences: vi.fn(async () => [...preferences].map(([logicalKey, enabled]) => ({ logicalKey, enabled }))),
  };
  const repository = rawRepository as unknown as SetupRepository;
  const report = vi.fn();
  return { guild, member, repository, report, assigned };
}

describe('notification role security', () => {
  it('grants and removes only configured preference roles', async () => {
    const state = fixture(); const service = new NotificationRoleReconciliationService(state.repository, state.report);
    await expect(service.update(state.guild, state.member, new Set(['new-listings']))).resolves.toEqual(['new-listings']);
    expect(state.assigned).toEqual(new Set(['new-listings']));
    await service.update(state.guild, state.member, new Set());
    expect(state.assigned).toEqual(new Set());
  });

  it('denies unknown and privileged role requests without changing member roles', async () => {
    const state = fixture(); const service = new NotificationRoleReconciliationService(state.repository, state.report);
    await expect(service.update(state.guild, state.member, new Set(['administrator']))).rejects.toBeInstanceOf(NotificationRoleUnavailableError);
    expect(state.assigned).toEqual(new Set());
    expect(state.report).toHaveBeenCalledWith('notification.invalid_role_request', expect.objectContaining({ key: 'administrator' }));
  });

  it('denies a notification role with elevated permissions or above the bot', async () => {
    for (const options of [{ elevated: true }, { aboveBot: true }]) {
      const state = fixture(options); const service = new NotificationRoleReconciliationService(state.repository, state.report);
      await expect(service.update(state.guild, state.member, new Set(['new-listings']))).rejects.toBeInstanceOf(NotificationRoleUnavailableError);
      expect(state.assigned).toEqual(new Set());
    }
  });
});
