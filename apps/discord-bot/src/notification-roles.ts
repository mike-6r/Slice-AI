import { ActionRowBuilder, Guild, GuildMember, StringSelectMenuBuilder } from 'discord.js';
import type { SetupRepository } from './persistence/setup-repository.js';
import { presentationConfig } from './presentation-config.js';

export const NOTIFICATION_CATALOG = presentationConfig()['notifications.yml'].roles.map((role) => [role.key, role.label] as const);
export const notificationRoleKeys = NOTIFICATION_CATALOG.map(([key]) => key);

export function notificationMenu(selected: readonly string[] = []) { const settings = presentationConfig()['notifications.yml']; return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('slice:roles:notifications').setPlaceholder(settings.menu.placeholder).setMinValues(0).setMaxValues(NOTIFICATION_CATALOG.length).addOptions(NOTIFICATION_CATALOG.map(([value, label]) => ({ label, value, default: selected.includes(value) }))))]; }

/** Persisted preferences are authoritative; Discord roles are materialized state. */
export class NotificationRoleReconciliationService {
  constructor(private readonly repository: SetupRepository, private readonly report: (event: string, fields: Record<string, unknown>) => void) {}
  async update(guild: Guild, member: GuildMember, selected: ReadonlySet<string>): Promise<string[]> {
    for (const key of notificationRoleKeys) await this.repository.setNotificationPreference({ guildId: guild.id, discordUserId: member.id, logicalKey: key, enabled: selected.has(key) });
    await this.reconcile(guild, member);
    return notificationRoleKeys.filter((key) => selected.has(key));
  }
  async reconcile(guild: Guild, member: GuildMember): Promise<void> {
    const preferences = new Map((await this.repository.listNotificationPreferences(guild.id, member.id)).map((row) => [row.logicalKey, row.enabled]));
    for (const key of notificationRoleKeys) {
      const resource = await this.repository.getResource(guild.id, 'ROLE', key);
      if (!resource) { this.report('notification.role_missing', { guildId: guild.id, userId: member.id, key }); continue; }
      const hasRole = member.roles.cache.has(resource.discordId); const enabled = preferences.get(key) === true;
      if (enabled === hasRole) continue;
      try { if (enabled) await member.roles.add(resource.discordId, 'Slice notification preference reconciliation'); else await member.roles.remove(resource.discordId, 'Slice notification preference reconciliation'); }
      catch (error) { this.report('notification.reconciliation_failed', { guildId: guild.id, userId: member.id, key, name: error instanceof Error ? error.name : 'unknown' }); }
    }
  }
  async selected(guildId: string, userId: string): Promise<string[]> { return (await this.repository.listNotificationPreferences(guildId, userId)).filter((row) => row.enabled && notificationRoleKeys.includes(row.logicalKey as typeof notificationRoleKeys[number])).map((row) => row.logicalKey); }
}
