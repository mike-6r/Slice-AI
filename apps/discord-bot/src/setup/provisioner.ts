import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Guild, PermissionFlagsBits, StringSelectMenuBuilder, type GuildBasedChannel, type Role } from 'discord.js';
import { renderArtwork } from '../artwork.js';
import { SliceEmbed } from '../embeds/slice-embed.js';
import { colorNumber, presentationConfig, renderTemplate } from '../presentation-config.js';
import { CATEGORY_DEFINITIONS, CHANNEL_DEFINITIONS, LEGACY_CATEGORY_NAMES, LEGACY_CHANNEL_NAMES, LEGACY_ROLE_NAMES, PANEL_CHANNELS, ROLE_DEFINITIONS, SLICE_DISCORD_SETUP_VERSION } from './manifest.js';
import type { ManagedResource, ManagedResourceType, SetupRepository } from '../persistence/setup-repository.js';

export type ReconciliationPlan = { missingRoles: number; missingCategories: number; missingChannels: number; renamed: number; moved: number; permissionDrift: number; staleReferences: number; missingPanels: number; ambiguous: string[]; updateAvailable: boolean; artworkMissing: number };
export type ResetPlan = { managedRoles: number; managedCategories: number; managedChannels: number; panels: number; ticketChannels: number; setupMetadata: boolean };
export type ResetResult = { deletedRoles: number; deletedCategories: number; deletedChannels: number; deletedPanels: number; deletedTicketChannels: number };
export class AmbiguousManagedResourceError extends Error { constructor(readonly keys: string[]) { super(`Ambiguous Slice-managed resources: ${keys.join(', ')}`); } }
export class SetupProvisioner {
  constructor(private readonly repository: SetupRepository, private readonly artworkDir: string) {}
  async inspect(guild: Guild): Promise<ReconciliationPlan> {
    await guild.roles.fetch(); await guild.channels.fetch(); const config = await this.repository.getGuildConfig(guild.id); const plan: ReconciliationPlan = { missingRoles: 0, missingCategories: 0, missingChannels: 0, renamed: 0, moved: 0, permissionDrift: 0, staleReferences: 0, missingPanels: 0, ambiguous: [], updateAvailable: Boolean(config && config.setupVersion < SLICE_DISCORD_SETUP_VERSION), artworkMissing: 0 };
    for (const spec of ROLE_DEFINITIONS) this.inspectRole(guild, await this.repository.getResource(guild.id, 'ROLE', spec.key), spec.name, plan);
    for (const spec of CATEGORY_DEFINITIONS) await this.inspectCategory(guild, await this.repository.getResource(guild.id, 'CATEGORY', spec.key), spec.name, spec.staff === true, plan);
    for (const spec of CHANNEL_DEFINITIONS) await this.inspectChannel(guild, await this.repository.getResource(guild.id, 'CHANNEL', spec.key), spec, plan);
    for (const key of PANEL_CHANNELS) { const panel = await this.repository.getPanel(guild.id, key); const channelRef = await this.repository.getResource(guild.id, 'CHANNEL', key); const channel = channelRef ? await this.channel(guild, channelRef.discordId) : undefined; const message = panel && channel?.isTextBased() && 'messages' in channel ? await channel.messages.fetch(panel.messageId).catch(() => null) : null; if (!panel || !message) plan.missingPanels++; }
    return plan;
  }
  async apply(guild: Guild): Promise<{ created: number; updated: number; plan: ReconciliationPlan }> {
    const plan = await this.inspect(guild); if (plan.ambiguous.length) throw new AmbiguousManagedResourceError(plan.ambiguous); let created = 0; let updated = 0;
    await this.repository.transaction(async () => {
      await this.repository.upsertGuildConfig({ guildId: guild.id, setupVersion: SLICE_DISCORD_SETUP_VERSION, setupStatus: 'PARTIAL' });
      for (const spec of ROLE_DEFINITIONS) { const result = await this.ensureRole(guild, spec); created += result.created; updated += result.updated; }
      for (const spec of CATEGORY_DEFINITIONS) { const result = await this.ensureCategory(guild, spec.key, spec.name, spec.staff === true); created += result.created; updated += result.updated; }
      for (const spec of CHANNEL_DEFINITIONS) { const result = await this.ensureChannel(guild, spec); created += result.created; updated += result.updated; }
      await this.migrateTicketChannels(guild); await this.arrangeStructure(guild);
      for (const key of PANEL_CHANNELS) { const result = await this.publishPanel(guild, key); created += result.created; updated += result.updated; }
      await this.generateArtwork(); await this.repository.upsertGuildConfig({ guildId: guild.id, setupVersion: SLICE_DISCORD_SETUP_VERSION, setupStatus: 'APPLIED' });
    });
    return { created, updated, plan };
  }
  async status(guild: Guild): Promise<{ plan: ReconciliationPlan; version: number; configured: boolean }> { const config = await this.repository.getGuildConfig(guild.id); return { plan: await this.inspect(guild), version: config?.setupVersion ?? 0, configured: Boolean(config) }; }
  async inspectReset(guild: Guild): Promise<ResetPlan> { await guild.roles.fetch(); await guild.channels.fetch(); const resources = await this.repository.listResources(guild.id); const panels = await this.repository.listPanels(guild.id); const scan = this.scanGuild(guild, resources); return { managedRoles: scan.roleIds.size, managedCategories: scan.categoryIds.size, managedChannels: scan.channelIds.size, panels: panels.length, ticketChannels: scan.ticketIds.size, setupMetadata: Boolean(await this.repository.getGuildConfig(guild.id) || resources.length || panels.length || scan.roleIds.size || scan.categoryIds.size || scan.channelIds.size || scan.ticketIds.size) }; }
  async reset(guild: Guild): Promise<ResetResult> { await guild.roles.fetch(); await guild.channels.fetch(); const resources = await this.repository.listResources(guild.id); const panels = await this.repository.listPanels(guild.id); const scan = this.scanGuild(guild, resources); let deletedPanels = 0; let deletedTicketChannels = 0; let deletedChannels = 0; let deletedCategories = 0; let deletedRoles = 0;
    for (const panel of panels) { const channel = await this.channel(guild, panel.channelId); if (channel?.isTextBased() && 'messages' in channel) { const message = await channel.messages.fetch(panel.messageId).catch(() => null); if (message) { await message.delete(); deletedPanels++; } } }
    for (const id of scan.ticketIds) if (await this.deleteChannel(guild, id)) deletedTicketChannels++;
    for (const id of scan.channelIds) if (await this.deleteChannel(guild, id)) deletedChannels++;
    for (const id of scan.categoryIds) if (await this.deleteChannel(guild, id)) deletedCategories++;
    for (const id of scan.roleIds) { const role = await this.role(guild, id); if (role && role.id !== guild.id) { await role.delete('Slice setup reset'); deletedRoles++; } }
    await this.repository.resetGuildData(guild.id);
    return { deletedRoles, deletedCategories, deletedChannels, deletedPanels, deletedTicketChannels };
  }
  async startupAudit(guild: Guild): Promise<ReconciliationPlan> { return this.inspect(guild); }
  async generateArtwork(): Promise<void> { for (const [name, title] of [['welcome', 'Welcome to Slice'], ['verification', 'Your Slice account'], ['roles', 'Choose notifications'], ['my-slice', 'My Slice'], ['collector-workspace', 'Collector Workspace'], ['marketplace', 'Marketplace'], ['support', 'Support'], ['roadmap', 'Roadmap'], ['operations', 'Staff / Operations']] as const) await renderArtwork(this.artworkDir, name, title); }
  private inspectRole(guild: Guild, record: ManagedResource | null, name: string, plan: ReconciliationPlan): void { const current = record ? guild.roles.cache.get(record.discordId) : undefined; if (current) { if (current.name !== name) plan.renamed++; return; } if (record) plan.staleReferences++; const candidates = guild.roles.cache.filter((role) => role.name === name); if (candidates.size > 1) plan.ambiguous.push(`role:${name}`); else plan.missingRoles++; }
  private async inspectCategory(guild: Guild, record: ManagedResource | null, name: string, staff: boolean, plan: ReconciliationPlan): Promise<void> { const current = record ? guild.channels.cache.get(record.discordId) : undefined; if (current?.type === ChannelType.GuildCategory) { if (current.name !== name) plan.renamed++; if (staff && await this.staffPermissionDrift(current, guild)) plan.permissionDrift++; return; } if (record) plan.staleReferences++; const candidates = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory && channel.name === name); if (candidates.size > 1) plan.ambiguous.push(`category:${name}`); else plan.missingCategories++; }
  private async inspectChannel(guild: Guild, record: ManagedResource | null, spec: (typeof CHANNEL_DEFINITIONS)[number], plan: ReconciliationPlan): Promise<void> { const current = record ? guild.channels.cache.get(record.discordId) : undefined; const parent = await this.repository.getResource(guild.id, 'CATEGORY', spec.category); if (current?.type === ChannelType.GuildText) { if (current.name !== spec.name) plan.renamed++; if (current.parentId !== parent?.discordId) plan.moved++; if ((spec.staff && await this.staffPermissionDrift(current, guild)) || (spec.readOnly && this.readOnlyPermissionDrift(current, guild))) plan.permissionDrift++; return; } if (record) plan.staleReferences++; const candidates = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText && channel.name === spec.name && channel.parentId === parent?.discordId); if (candidates.size > 1) plan.ambiguous.push(`channel:${spec.key}`); else plan.missingChannels++; }
  private async ensureRole(guild: Guild, spec: (typeof ROLE_DEFINITIONS)[number]): Promise<{ created: number; updated: number }> { const existing = await this.repository.getResource(guild.id, 'ROLE', spec.key); let role = existing ? await this.role(guild, existing.discordId) : undefined; let created = 0; if (!role) { const names = [spec.name, ...(LEGACY_ROLE_NAMES[spec.key] ?? [])]; const candidates = guild.roles.cache.filter((candidate) => names.includes(candidate.name)); if (candidates.size > 1) throw new AmbiguousManagedResourceError([`role:${spec.key}`]); role = candidates.first() ?? await guild.roles.create({ name: spec.name, color: spec.color, hoist: spec.hoist ?? false, mentionable: spec.mentionable ?? false, permissions: spec.permissions ?? [], reason: 'Slice AI setup' }); created = candidates.size ? 0 : 1; } await role.edit({ name: spec.name, color: spec.color, hoist: spec.hoist ?? false, mentionable: spec.mentionable ?? false, reason: 'Slice AI setup reconciliation' }); if (spec.permissions) await role.setPermissions(spec.permissions, 'Slice AI role permission reconciliation'); await this.upsertResource(guild.id, 'ROLE', spec.key, role.id, spec.name, null); return { created, updated: 1 }; }
  private async ensureCategory(guild: Guild, key: string, name: string, staff: boolean): Promise<{ created: number; updated: number }> { const existing = await this.repository.getResource(guild.id, 'CATEGORY', key); let category = existing ? await this.channel(guild, existing.discordId) : undefined; let created = 0; if (!category || category.type !== ChannelType.GuildCategory) { const names = [name, ...(LEGACY_CATEGORY_NAMES[key] ?? [])]; const candidates = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory && names.includes(channel.name)); if (candidates.size > 1) throw new AmbiguousManagedResourceError([`category:${key}`]); category = candidates.first() ?? await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: 'Slice AI setup' }); created = candidates.size ? 0 : 1; } await category.edit({ name, reason: 'Slice AI setup reconciliation' }); await this.applyCategoryPermissions(category, guild, key, staff); await this.upsertResource(guild.id, 'CATEGORY', key, category.id, name, null); return { created, updated: 1 }; }
  private async ensureChannel(guild: Guild, spec: (typeof CHANNEL_DEFINITIONS)[number]): Promise<{ created: number; updated: number }> { const existing = await this.repository.getResource(guild.id, 'CHANNEL', spec.key); const parent = await this.repository.getResource(guild.id, 'CATEGORY', spec.category); if (!parent) throw new Error(`Missing managed parent category ${spec.category}`); let channel = existing ? await this.channel(guild, existing.discordId) : undefined; let created = 0; if (!channel || channel.type !== ChannelType.GuildText) { const names = [spec.name, ...(LEGACY_CHANNEL_NAMES[spec.key] ?? [])]; const candidates = guild.channels.cache.filter((candidate) => candidate.type === ChannelType.GuildText && names.includes(candidate.name) && (candidate.parentId === parent.discordId || this.parentCategoryMatches(guild, candidate.parentId, spec.category))); if (candidates.size > 1) throw new AmbiguousManagedResourceError([`channel:${spec.key}`]); channel = candidates.first() ?? await guild.channels.create({ name: spec.name, type: ChannelType.GuildText, parent: parent.discordId, topic: `Slice AI managed channel • ${spec.key}`, rateLimitPerUser: spec.slowmode ?? 0, reason: 'Slice AI setup' }); created = candidates.size ? 0 : 1; } await channel.edit({ name: spec.name, parent: parent.discordId, topic: `Slice AI managed channel • ${spec.key}`, rateLimitPerUser: spec.slowmode ?? 0, reason: 'Slice AI setup reconciliation' }); await this.applyChannelPermissions(channel, guild, spec); await this.upsertResource(guild.id, 'CHANNEL', spec.key, channel.id, spec.name, spec.category); return { created, updated: 1 }; }
  private async publishPanel(guild: Guild, key: typeof PANEL_CHANNELS[number]): Promise<{ created: number; updated: number }> { const channelRef = await this.repository.getResource(guild.id, 'CHANNEL', key); const channel = channelRef ? await this.channel(guild, channelRef.discordId) : undefined; if (!channel?.isTextBased() || !('messages' in channel)) throw new Error(`Missing panel channel ${key}`); const panel = await this.repository.getPanel(guild.id, key); const previous = panel ? await channel.messages.fetch(panel.messageId).catch(() => null) : null; const payload = panelPayload(key); const message = previous ? await previous.edit(payload) : await channel.send(payload); await this.repository.upsertPanel({ guildId: guild.id, logicalKey: key, channelId: channel.id, messageId: message.id, templateKey: key, artworkKey: `${key}-banner`, version: SLICE_DISCORD_SETUP_VERSION }); return { created: previous ? 0 : 1, updated: previous ? 1 : 0 }; }
  private async upsertResource(guildId: string, type: ManagedResourceType, logicalKey: string, discordId: string, expectedName: string, parentLogicalKey: string | null): Promise<void> { await this.repository.upsertResource({ guildId, resourceType: type, logicalKey, discordId, expectedName, parentLogicalKey, setupVersion: SLICE_DISCORD_SETUP_VERSION, metadata: null }); }
  private async role(guild: Guild, id: string): Promise<Role | undefined> { return (await guild.roles.fetch(id).catch(() => undefined)) ?? undefined; }
  private async channel(guild: Guild, id: string): Promise<GuildBasedChannel | undefined> { return (await guild.channels.fetch(id).catch(() => undefined)) ?? undefined; }
  private parentCategoryMatches(guild: Guild, parentId: string | null, key: string): boolean { if (!parentId) return false; const parent = guild.channels.cache.get(parentId); if (parent?.type !== ChannelType.GuildCategory) return false; const names = [CATEGORY_DEFINITIONS.find((spec) => spec.key === key)?.name ?? '', ...(LEGACY_CATEGORY_NAMES[key] ?? [])]; return names.includes(parent.name); }
  private async roleId(guild: Guild, key: string): Promise<string | null> { return (await this.repository.getResource(guild.id, 'ROLE', key))?.discordId ?? null; }
  private async applyCategoryPermissions(category: GuildBasedChannel, guild: Guild, key: string, _staff: boolean): Promise<void> {
    if (!('permissionOverwrites' in category)) return;
    await category.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }, { reason: 'Slice premium server visibility gate' });
    if (['slice', 'collectors', 'community', 'support'].includes(key)) {
      const verified = await this.roleId(guild, 'verified');
      if (verified) await category.permissionOverwrites.edit(verified, { ViewChannel: true, ReadMessageHistory: true }, { reason: 'Slice verified member access' });
    }
    if (key === 'private-support') {
      for (const roleKey of ['owner', 'administrator', 'operations', 'support', 'slice']) { const id = await this.roleId(guild, roleKey); if (id) await category.permissionOverwrites.edit(id, { ViewChannel: true, ReadMessageHistory: true }, { reason: 'Slice private support access' }); }
    }
  }
  private async applyChannelPermissions(channel: GuildBasedChannel, guild: Guild, spec: (typeof CHANNEL_DEFINITIONS)[number]): Promise<void> {
    if (!('permissionOverwrites' in channel)) return;
    const everyone = guild.roles.everyone.id;
    const allow = async (key: string, permissions: Record<string, boolean>) => { const id = await this.roleId(guild, key); if (id) await channel.permissionOverwrites.edit(id, permissions, { reason: 'Slice premium server permission reconciliation' }); };
    const denyChat = { SendMessages: false, AddReactions: false, CreatePublicThreads: false, CreatePrivateThreads: false };
    if (spec.key === 'verify') {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: true, ReadMessageHistory: true, ...denyChat }, { reason: 'Slice verification gate' });
      await allow('verified', { ViewChannel: false });
      await allow('slice', { ViewChannel: true, SendMessages: true, ManageMessages: true, UseApplicationCommands: true });
      for (const key of ['owner', 'administrator', 'support']) await allow(key, { ViewChannel: true, ReadMessageHistory: true });
      return;
    }
    await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason: 'Slice verified-member visibility gate' });
    if (['welcome', 'announcements', 'my-slice', 'market-feed', 'collector-workspace', 'list-a-collectible', 'create-a-ticket'].includes(spec.key)) {
      await allow('verified', { ViewChannel: true, ReadMessageHistory: true, ...denyChat });
      for (const key of ['owner', 'administrator', 'support', 'slice']) await allow(key, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true, ManageThreads: true });
      if (spec.key === 'my-slice') await allow('verified', { ViewChannel: true, ReadMessageHistory: true, UseApplicationCommands: true, ...denyChat });
      if (spec.key === 'create-a-ticket') await allow('verified', { ViewChannel: true, ReadMessageHistory: true, ...denyChat });
      return;
    }
    if (['general', 'collecting'].includes(spec.key)) { await allow('verified', { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true }); return; }
    if (spec.key === 'operations' || spec.key === 'bot-log') { for (const key of ['owner', 'administrator', 'slice']) await allow(key, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true, ManageThreads: true }); return; }
    if (spec.key === 'moderation-log') { for (const key of ['owner', 'administrator', 'operations', 'slice']) await allow(key, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true }); return; }
    if (spec.key === 'support-log') { for (const key of ['owner', 'administrator', 'support', 'slice']) await allow(key, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true, ManageThreads: true }); }
  }
  private async migrateTicketChannels(guild: Guild): Promise<void> { const target = await this.repository.getResource(guild.id, 'CATEGORY', 'private-support'); if (!target) return; const publicSupport = await this.repository.getResource(guild.id, 'CATEGORY', 'support'); const legacyParentIds = new Set([publicSupport?.discordId, target.discordId].filter((id): id is string => Boolean(id))); for (const channel of guild.channels.cache.values()) if (channel.type === ChannelType.GuildText && channel.name.startsWith('ticket-') && legacyParentIds.has(channel.parentId ?? '') && channel.parentId !== target.discordId) await channel.setParent(target.discordId, { lockPermissions: false, reason: 'Slice private support migration' }); }
  private async arrangeStructure(guild: Guild): Promise<void> {
    const categoryIds = (await Promise.all(CATEGORY_DEFINITIONS.map(async (spec, order) => ({ key: spec.key, row: await this.repository.getResource(guild.id, 'CATEGORY', spec.key), order })))).flatMap(({ key, row, order }) => row ? [{ key, id: row.discordId, order }] : []);
    const positions: Array<{ channel: string; position: number }> = []; let position = 0;
    for (const category of categoryIds) { positions.push({ channel: category.id, position: position++ }); const channels = CHANNEL_DEFINITIONS.filter((spec) => spec.category === category.key).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); for (const spec of channels) { const row = await this.repository.getResource(guild.id, 'CHANNEL', spec.key); if (row) positions.push({ channel: row.discordId, position: position++ }); } }
    if (positions.length) await guild.channels.setPositions(positions).catch(() => undefined);
    const roleOrder = ['owner', 'slice', 'administrator', 'operations', 'support', 'verified-collector', 'collector', 'verified', 'slice-member']; const roles = (await Promise.all(roleOrder.map(async (key) => ({ key, role: await this.repository.getResource(guild.id, 'ROLE', key) })))).flatMap(({ role }) => role ? [role.discordId] : []); const top = Math.max(1, (guild.members.me?.roles.highest.position ?? guild.roles.cache.size) - 1); if (roles.length) await guild.roles.setPositions(roles.map((role, index) => ({ role, position: Math.max(1, top - index) }))).catch(() => undefined);
  }
  private scanGuild(guild: Guild, resources: ManagedResource[]): { roleIds: Set<string>; categoryIds: Set<string>; channelIds: Set<string>; ticketIds: Set<string> } {
    const storedRoleIds = new Set(resources.filter((resource) => resource.resourceType === 'ROLE').map((resource) => resource.discordId));
    const storedCategoryIds = new Set(resources.filter((resource) => resource.resourceType === 'CATEGORY').map((resource) => resource.discordId));
    const storedChannelIds = new Set(resources.filter((resource) => resource.resourceType === 'CHANNEL').map((resource) => resource.discordId));
    const categoryNames = new Map<string, string>();
    for (const spec of CATEGORY_DEFINITIONS) { categoryNames.set(this.normalizedName(spec.name), spec.key); for (const alias of LEGACY_CATEGORY_NAMES[spec.key] ?? []) categoryNames.set(this.normalizedName(alias), spec.key); }
    const categories = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory && (storedCategoryIds.has(channel.id) || categoryNames.has(this.normalizedName(channel.name))));
    const categoryIds = new Set(categories.keys());
    const categoryKeyById = new Map<string, string>();
    for (const category of categories.values()) categoryKeyById.set(category.id, categoryNames.get(this.normalizedName(category.name)) ?? resources.find((resource) => resource.resourceType === 'CATEGORY' && resource.discordId === category.id)?.logicalKey ?? '');
    const knownChannels = new Map<string, string[]>();
    for (const spec of CHANNEL_DEFINITIONS) knownChannels.set(spec.key, [spec.name, ...(LEGACY_CHANNEL_NAMES[spec.key] ?? [])]);
    const knownMarkerKeys = new Set(CHANNEL_DEFINITIONS.map((spec) => spec.key));
    const channelIds = new Set<string>();
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildText) continue;
      const managedTopic = Boolean(channel.topic && channel.topic.startsWith('Slice AI managed channel • ') && knownMarkerKeys.has(channel.topic.slice('Slice AI managed channel • '.length)));
      const matchingSpec = [...knownChannels.entries()].find(([, names]) => names.includes(channel.name));
      const managedByLocation = Boolean(matchingSpec && categoryIds.has(channel.parentId ?? '') && categoryKeyById.get(channel.parentId ?? '') === CHANNEL_DEFINITIONS.find((spec) => spec.key === matchingSpec[0])?.category);
      if (storedChannelIds.has(channel.id) || managedTopic || managedByLocation) channelIds.add(channel.id);
    }
    const supportCategoryIds = new Set([...categoryKeyById.entries()].filter(([, key]) => key === 'support' || key === 'private-support').map(([id]) => id));
    const ticketIds = new Set(guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText && supportCategoryIds.has(channel.parentId ?? '') && channel.name.startsWith('ticket-')).keys());
    for (const id of ticketIds) channelIds.delete(id);
    const roleIds = new Set(guild.roles.cache.filter((role) => role.id !== guild.id && (storedRoleIds.has(role.id) || ROLE_DEFINITIONS.some((spec) => spec.name === role.name))).keys());
    return { roleIds, categoryIds, channelIds, ticketIds };
  }
  private normalizedName(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
  private async deleteChannel(guild: Guild, id: string): Promise<boolean> { const channel = await this.channel(guild, id); if (!channel) return false; await channel.delete('Slice setup reset'); return true; }
  private staffRoleIds(guildId: string): Promise<string[]> { return Promise.all(['owner', 'administrator', 'operations', 'support', 'slice'].map((key) => this.repository.getResource(guildId, 'ROLE', key))).then((rows) => rows.flatMap((row) => row ? [row.discordId] : [])); }
  private async applyStaffPermissions(channel: GuildBasedChannel, guild: Guild, staff: boolean): Promise<void> {
    if (!staff || !('permissionOverwrites' in channel)) return;
    await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }, { reason: 'Slice AI staff channel access' });
    for (const roleId of await this.staffRoleIds(guild.id)) await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, ReadMessageHistory: true }, { reason: 'Slice AI staff channel access' });
  }
  private async applyReadOnlyPermissions(channel: GuildBasedChannel, guild: Guild, readOnly: boolean): Promise<void> {
    if (!readOnly || !('permissionOverwrites' in channel)) return;
    await channel.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false }, { reason: 'Slice AI read-only panel' });
  }
  private async staffPermissionDrift(channel: GuildBasedChannel, guild: Guild): Promise<boolean> {
    if (!('permissionOverwrites' in channel)) return true;
    const everyone = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (!everyone?.deny.has(PermissionFlagsBits.ViewChannel)) return true;
    return (await this.staffRoleIds(guild.id)).some((roleId) => !channel.permissionOverwrites.cache.get(roleId)?.allow.has(PermissionFlagsBits.ViewChannel));
  }
  private readOnlyPermissionDrift(channel: GuildBasedChannel, guild: Guild): boolean {
    if (!('permissionOverwrites' in channel)) return true;
    return !channel.permissionOverwrites.cache.get(guild.roles.everyone.id)?.deny.has(PermissionFlagsBits.SendMessages);
  }
}
function panelPayload(key: typeof PANEL_CHANNELS[number]) { return { embeds: [panelEmbed(key)], components: panelComponents(key) }; }
function panelEmbed(key: string): EmbedBuilder {
  const config = presentationConfig();
  const panel = config['setup.yml'].panels[key];
  if (!panel) return SliceEmbed.info('Slice support', 'Open a private ticket for account, marketplace, or technical help.');
  const branding = config['branding.yml'];
  const embed = new EmbedBuilder().setColor(colorNumber(branding.colors[panel.color])).setTitle(renderTemplate(panel.title)).setDescription(renderTemplate(panel.description)).setFooter({ text: panel.footer ? renderTemplate(panel.footer) : branding.footer.text });
  if (panel.thumbnail) embed.setThumbnail(panel.thumbnail); else if (branding.images.thumbnail_url) embed.setThumbnail(branding.images.thumbnail_url);
  if (panel.image) embed.setImage(panel.image);
  if (panel.timestamp !== false) embed.setTimestamp();
  return embed;
}
function panelComponents(key: string) {
  const config = presentationConfig();
  if (key === 'welcome' || key === 'verify') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:connect').setLabel('Connect account').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:onboarding:verify').setLabel('Verify identity').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:support').setLabel('Get support').setStyle(ButtonStyle.Secondary))];
  if (key === 'start-here') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:connect').setLabel('Connect account').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:onboarding:verify').setLabel('Verify identity').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:faq').setLabel('Open FAQ').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:support').setLabel('Get support').setStyle(ButtonStyle.Secondary))];
  if (key === 'my-slice') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:my-slice').setLabel('My Account').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:onboarding:portfolio').setLabel('Portfolio').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:orders').setLabel('Orders').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:transactions').setLabel('Transactions').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:marketplace').setLabel('Marketplace').setStyle(ButtonStyle.Secondary))];
  if (key === 'collector-workspace') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:collector-workspace').setLabel('Collector Workspace').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:onboarding:your-actions').setLabel('Your Actions').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:membership').setLabel('Membership').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:list').setLabel('List an Asset').setStyle(ButtonStyle.Secondary))];
  if (key === 'staff') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:staff:ops').setLabel('Open Operations').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:onboarding:admin-console').setLabel('Open Admin Console').setStyle(ButtonStyle.Secondary))];
  if (key === 'operations') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:staff:asset-operations').setLabel('Open Asset Operations').setStyle(ButtonStyle.Primary))];
  if (key === 'compliance-alerts') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:staff:physical-intake').setLabel('Open Physical Intake').setStyle(ButtonStyle.Primary))];
  if (key === 'support-log') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:ticket:open').setLabel('Open Ticket').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:staff:support-queue').setLabel('Open Trust & Support').setStyle(ButtonStyle.Secondary))];
  if (key === 'bot-log') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:staff:system-alerts').setLabel('Open Platform Operations').setStyle(ButtonStyle.Primary))];
  if (key === 'roles') return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('slice:roles:notifications').setPlaceholder(config['notifications.yml'].menu.placeholder).setMinValues(0).setMaxValues(config['notifications.yml'].roles.length).addOptions(config['notifications.yml'].roles.map((role) => ({ label: role.label, value: role.key, description: role.description, emoji: role.emoji }))))];
  if (key === 'create-a-ticket') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:ticket:open').setLabel('Open Ticket').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:ticket:mine').setLabel('My Tickets').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:faq').setLabel('Help / FAQ').setStyle(ButtonStyle.Secondary))];
  if (key === 'faq') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:faq').setLabel('Browse FAQ').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('slice:onboarding:support').setLabel('Open support').setStyle(ButtonStyle.Primary))];
  if (key === 'support-information' || key === 'known-issues') return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('slice:onboarding:support').setLabel('Open support').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('slice:onboarding:faq').setLabel('Read FAQ').setStyle(ButtonStyle.Secondary))];
  return [];
}
