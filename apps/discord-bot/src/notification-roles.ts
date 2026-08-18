import { ActionRowBuilder, Guild, GuildMember, Role, StringSelectMenuBuilder } from 'discord.js';
import type { SetupRepository } from './persistence/setup-repository.js';
import { presentationConfig } from './presentation-config.js';

export const NOTIFICATION_CATALOG = presentationConfig()['notifications.yml'].roles.map((role) => [role.key, role.label] as const);
export const notificationRoleKeys = NOTIFICATION_CATALOG.map(([key]) => key);
export const CUSTOMER_NOTIFICATION_CATALOG = [
  ['customer-orders', 'Orders', 'Updates when your orders fill, cancel, or change.'],
  ['customer-collector-actions', 'Collector Actions', 'Important actions required for your submitted collectibles.'],
  ['customer-shipping', 'Shipping', 'Updates related to shipping and Slice intake.'],
  ['customer-membership', 'Membership', 'Preference saved — alerts will be available when membership events are supported.'],
  ['customer-support', 'Support', 'Preference saved — support updates are currently handled in your private ticket.'],
] as const;
export type CustomerNotificationKey = typeof CUSTOMER_NOTIFICATION_CATALOG[number][0];
export class NotificationRoleUnavailableError extends Error {}

export function notificationRoleIsSafe(guild: Guild, role: Role): boolean {
  const botHighest = guild.members.me?.roles.highest;
  return role.guild.id === guild.id && role.permissions.bitfield === 0n && role.editable && Boolean(botHighest && role.position < botHighest.position);
}

export function notificationMenu(selected: readonly string[] = []) { const settings = presentationConfig()['notifications.yml']; return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('slice:roles:notifications').setPlaceholder(settings.menu.placeholder).setMinValues(0).setMaxValues(NOTIFICATION_CATALOG.length).addOptions(NOTIFICATION_CATALOG.map(([value, label]) => ({ label, value, default: selected.includes(value) }))))]; }
export function customerNotificationMenu(selected: readonly string[] = []) { return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('slice:notifications:customer').setPlaceholder('Customer notification preferences').setMinValues(0).setMaxValues(CUSTOMER_NOTIFICATION_CATALOG.length).addOptions(CUSTOMER_NOTIFICATION_CATALOG.map(([value, label, description]) => ({ label, value, description, default: selected.includes(value) }))))]; }

/** Persisted preferences are authoritative; Discord roles are materialized state. */
export class NotificationRoleReconciliationService {
  constructor(private readonly repository: SetupRepository, private readonly report: (event: string, fields: Record<string, unknown>) => void) {}
  async update(guild: Guild, member: GuildMember, selected: ReadonlySet<string>): Promise<string[]> {
    for (const key of selected) await this.assertSelectable(guild, member.id, key);
    for (const key of notificationRoleKeys) await this.repository.setNotificationPreference({ guildId: guild.id, discordUserId: member.id, logicalKey: key, enabled: selected.has(key) });
    await this.reconcile(guild, member);
    return notificationRoleKeys.filter((key) => selected.has(key));
  }
  async reconcile(guild: Guild, member: GuildMember): Promise<void> {
    const preferences = new Map((await this.repository.listNotificationPreferences(guild.id, member.id)).map((row) => [row.logicalKey, row.enabled]));
    for (const key of notificationRoleKeys) {
      const resource = await this.repository.getResource(guild.id, 'ROLE', key);
      if (!resource) { this.report('notification.role_missing', { guildId: guild.id, userId: member.id, key }); continue; }
      const role = guild.roles.cache.get(resource.discordId);
      if (!role || !notificationRoleIsSafe(guild, role)) { this.report('notification.role_unsafe', { guildId: guild.id, userId: member.id, key }); continue; }
      const hasRole = member.roles.cache.has(resource.discordId); const enabled = preferences.get(key) === true;
      if (enabled === hasRole) continue;
      try { if (enabled) await member.roles.add(resource.discordId, 'Slice notification preference reconciliation'); else await member.roles.remove(resource.discordId, 'Slice notification preference reconciliation'); }
      catch (error) { this.report('notification.reconciliation_failed', { guildId: guild.id, userId: member.id, key, name: error instanceof Error ? error.name : 'unknown' }); }
    }
  }
  async selected(guildId: string, userId: string): Promise<string[]> { return (await this.repository.listNotificationPreferences(guildId, userId)).filter((row) => row.enabled && notificationRoleKeys.includes(row.logicalKey as typeof notificationRoleKeys[number])).map((row) => row.logicalKey); }
  async customerSelected(guildId: string, userId: string): Promise<CustomerNotificationKey[]> {
    const rows = await this.repository.listNotificationPreferences(guildId, userId);
    const known = new Map(rows.filter((row) => CUSTOMER_NOTIFICATION_CATALOG.some(([key]) => key === row.logicalKey)).map((row) => [row.logicalKey, row.enabled]));
    return CUSTOMER_NOTIFICATION_CATALOG.filter(([key]) => known.get(key) !== false).map(([key]) => key);
  }
  async updateCustomer(guildId: string, userId: string, selected: ReadonlySet<string>): Promise<CustomerNotificationKey[]> {
    for (const [key] of CUSTOMER_NOTIFICATION_CATALOG) await this.repository.setNotificationPreference({ guildId, discordUserId: userId, logicalKey: key, enabled: selected.has(key) });
    return CUSTOMER_NOTIFICATION_CATALOG.filter(([key]) => selected.has(key)).map(([key]) => key);
  }
  private async assertSelectable(guild: Guild, userId: string, key: string): Promise<void> {
    if (!notificationRoleKeys.includes(key as typeof notificationRoleKeys[number])) {
      this.report('notification.invalid_role_request', { guildId: guild.id, userId, key });
      throw new NotificationRoleUnavailableError('That preference is no longer available.');
    }
    const resource = await this.repository.getResource(guild.id, 'ROLE', key);
    const role = resource ? guild.roles.cache.get(resource.discordId) : undefined;
    if (!role || !notificationRoleIsSafe(guild, role)) {
      this.report('notification.role_unavailable', { guildId: guild.id, userId, key });
      throw new NotificationRoleUnavailableError('That preference is unavailable right now.');
    }
  }
}
