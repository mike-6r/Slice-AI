import { DiscordManagedResourceType, DiscordSetupStatus, Prisma, PrismaClient } from '../../generated/prisma/index.js';

export const MANIFEST_VERSION = 2;
export type SetupStatus = 'NOT_CONFIGURED' | 'APPLIED' | 'PARTIAL' | 'ERROR';
export type ManagedResourceType = 'ROLE' | 'CATEGORY' | 'CHANNEL' | 'PANEL' | 'MESSAGE';
export type GuildConfig = { guildId: string; setupVersion: number; setupStatus: SetupStatus; updatedAt: Date };
export type ManagedResource = { guildId: string; resourceType: ManagedResourceType; logicalKey: string; discordId: string; expectedName: string; parentLogicalKey: string | null; setupVersion: number; metadata: Record<string, unknown> | null };
export type Panel = { guildId: string; logicalKey: string; channelId: string; messageId: string; templateKey: string; artworkKey: string | null; version: number };
export type NotificationPreference = { guildId: string; discordUserId: string; logicalKey: string; enabled: boolean };
export interface SetupRepository {
  getGuildConfig(guildId: string): Promise<GuildConfig | null>;
  upsertGuildConfig(config: Omit<GuildConfig, 'updatedAt'>): Promise<GuildConfig>;
  listGuildConfigs(): Promise<GuildConfig[]>;
  resetGuildData(guildId: string): Promise<void>;
  getResource(guildId: string, resourceType: ManagedResourceType, logicalKey: string): Promise<ManagedResource | null>;
  listResources(guildId: string): Promise<ManagedResource[]>;
  upsertResource(resource: ManagedResource): Promise<ManagedResource>;
  deleteResourceReference(guildId: string, resourceType: ManagedResourceType, logicalKey: string): Promise<void>;
  getPanel(guildId: string, logicalKey: string): Promise<Panel | null>;
  listPanels(guildId: string): Promise<Panel[]>;
  upsertPanel(panel: Panel): Promise<Panel>;
  setNotificationPreference(preference: NotificationPreference): Promise<NotificationPreference>;
  listNotificationPreferences(guildId: string, discordUserId: string): Promise<NotificationPreference[]>;
  listUserNotificationPreferences(discordUserId: string): Promise<NotificationPreference[]>;
  listGuildNotificationPreferences(guildId: string): Promise<NotificationPreference[]>;
  transaction<T>(action: () => Promise<T>): Promise<T>;
}
const status = (value: DiscordSetupStatus): SetupStatus => value;
const resourceType = (value: DiscordManagedResourceType): ManagedResourceType => value;
export class PrismaSetupRepository implements SetupRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async connect(): Promise<void> { await this.prisma.$connect(); }
  async disconnect(): Promise<void> { await this.prisma.$disconnect(); }
  async getGuildConfig(guildId: string): Promise<GuildConfig | null> { const row = await this.prisma.discordGuildConfig.findUnique({ where: { guildId } }); return row ? { guildId: row.guildId, setupVersion: row.setupVersion, setupStatus: status(row.setupStatus), updatedAt: row.updatedAt } : null; }
  async upsertGuildConfig(config: Omit<GuildConfig, 'updatedAt'>): Promise<GuildConfig> { const row = await this.prisma.discordGuildConfig.upsert({ where: { guildId: config.guildId }, create: { guildId: config.guildId, setupVersion: config.setupVersion, setupStatus: config.setupStatus }, update: { setupVersion: config.setupVersion, setupStatus: config.setupStatus } }); return { guildId: row.guildId, setupVersion: row.setupVersion, setupStatus: status(row.setupStatus), updatedAt: row.updatedAt }; }
  async listGuildConfigs(): Promise<GuildConfig[]> { const rows = await this.prisma.discordGuildConfig.findMany(); return rows.map((row) => ({ guildId: row.guildId, setupVersion: row.setupVersion, setupStatus: status(row.setupStatus), updatedAt: row.updatedAt })); }
  async resetGuildData(guildId: string): Promise<void> { await this.prisma.discordGuildConfig.deleteMany({ where: { guildId } }); }
  async getResource(guildId: string, type: ManagedResourceType, logicalKey: string): Promise<ManagedResource | null> { const row = await this.prisma.discordManagedResource.findUnique({ where: { guildId_resourceType_logicalKey: { guildId, resourceType: type, logicalKey } } }); return row ? mapResource(row) : null; }
  async listResources(guildId: string): Promise<ManagedResource[]> { return (await this.prisma.discordManagedResource.findMany({ where: { guildId } })).map(mapResource); }
  async upsertResource(resource: ManagedResource): Promise<ManagedResource> { const metadata = resource.metadata === null ? Prisma.JsonNull : resource.metadata as Prisma.InputJsonValue; const row = await this.prisma.discordManagedResource.upsert({ where: { guildId_resourceType_logicalKey: { guildId: resource.guildId, resourceType: resource.resourceType, logicalKey: resource.logicalKey } }, create: { ...resource, metadata }, update: { discordId: resource.discordId, expectedName: resource.expectedName, parentLogicalKey: resource.parentLogicalKey, setupVersion: resource.setupVersion, metadata } }); return mapResource(row); }
  async deleteResourceReference(guildId: string, type: ManagedResourceType, logicalKey: string): Promise<void> { await this.prisma.discordManagedResource.deleteMany({ where: { guildId, resourceType: type, logicalKey } }); }
  async getPanel(guildId: string, logicalKey: string): Promise<Panel | null> { const row = await this.prisma.discordPanel.findUnique({ where: { guildId_logicalKey: { guildId, logicalKey } } }); return row ? mapPanel(row) : null; }
  async listPanels(guildId: string): Promise<Panel[]> { return (await this.prisma.discordPanel.findMany({ where: { guildId } })).map(mapPanel); }
  async upsertPanel(panel: Panel): Promise<Panel> { const row = await this.prisma.discordPanel.upsert({ where: { guildId_logicalKey: { guildId: panel.guildId, logicalKey: panel.logicalKey } }, create: panel, update: { channelId: panel.channelId, messageId: panel.messageId, templateKey: panel.templateKey, artworkKey: panel.artworkKey, version: panel.version } }); return mapPanel(row); }
  async setNotificationPreference(preference: NotificationPreference): Promise<NotificationPreference> { const row = await this.prisma.discordNotificationPreference.upsert({ where: { guildId_discordUserId_logicalKey: { guildId: preference.guildId, discordUserId: preference.discordUserId, logicalKey: preference.logicalKey } }, create: preference, update: { enabled: preference.enabled } }); return { guildId: row.guildId, discordUserId: row.discordUserId, logicalKey: row.logicalKey, enabled: row.enabled }; }
  async listNotificationPreferences(guildId: string, discordUserId: string): Promise<NotificationPreference[]> { return (await this.prisma.discordNotificationPreference.findMany({ where: { guildId, discordUserId } })).map((row) => ({ guildId: row.guildId, discordUserId: row.discordUserId, logicalKey: row.logicalKey, enabled: row.enabled })); }
  async listUserNotificationPreferences(discordUserId: string): Promise<NotificationPreference[]> { return (await this.prisma.discordNotificationPreference.findMany({ where: { discordUserId } })).map((row) => ({ guildId: row.guildId, discordUserId: row.discordUserId, logicalKey: row.logicalKey, enabled: row.enabled })); }
  async listGuildNotificationPreferences(guildId: string): Promise<NotificationPreference[]> { return (await this.prisma.discordNotificationPreference.findMany({ where: { guildId } })).map((row) => ({ guildId: row.guildId, discordUserId: row.discordUserId, logicalKey: row.logicalKey, enabled: row.enabled })); }
  async transaction<T>(action: () => Promise<T>): Promise<T> { return action(); }
}
function mapResource(row: { guildId: string; resourceType: DiscordManagedResourceType; logicalKey: string; discordId: string; expectedName: string; parentLogicalKey: string | null; setupVersion: number; metadata: unknown }): ManagedResource { return { guildId: row.guildId, resourceType: resourceType(row.resourceType), logicalKey: row.logicalKey, discordId: row.discordId, expectedName: row.expectedName, parentLogicalKey: row.parentLogicalKey, setupVersion: row.setupVersion, metadata: (row.metadata as Record<string, unknown> | null) ?? null }; }
function mapPanel(row: { guildId: string; logicalKey: string; channelId: string; messageId: string; templateKey: string; artworkKey: string | null; version: number }): Panel { return row; }

/** Explicit test adapter. It is never constructed by the production runtime. */
export class InMemorySetupRepository implements SetupRepository {
  private configs = new Map<string, GuildConfig>(); private resources = new Map<string, ManagedResource>(); private panels = new Map<string, Panel>(); private preferences = new Map<string, NotificationPreference>();
  async getGuildConfig(guildId: string): Promise<GuildConfig | null> { return this.configs.get(guildId) ?? null; }
  async upsertGuildConfig(config: Omit<GuildConfig, 'updatedAt'>): Promise<GuildConfig> { const row = { ...config, updatedAt: new Date() }; this.configs.set(config.guildId, row); return row; }
  async listGuildConfigs(): Promise<GuildConfig[]> { return [...this.configs.values()]; }
  async resetGuildData(guildId: string): Promise<void> { this.configs.delete(guildId); for (const key of [...this.resources.keys()]) if (key.startsWith(`${guildId}:`)) this.resources.delete(key); for (const key of [...this.panels.keys()]) if (key.startsWith(`${guildId}:`)) this.panels.delete(key); for (const key of [...this.preferences.keys()]) if (key.startsWith(`${guildId}:`)) this.preferences.delete(key); }
  async getResource(guildId: string, type: ManagedResourceType, logicalKey: string): Promise<ManagedResource | null> { return this.resources.get(resourceKey(guildId, type, logicalKey)) ?? null; }
  async listResources(guildId: string): Promise<ManagedResource[]> { return [...this.resources.values()].filter((resource) => resource.guildId === guildId); }
  async upsertResource(resource: ManagedResource): Promise<ManagedResource> { this.resources.set(resourceKey(resource.guildId, resource.resourceType, resource.logicalKey), resource); return resource; }
  async deleteResourceReference(guildId: string, type: ManagedResourceType, logicalKey: string): Promise<void> { this.resources.delete(resourceKey(guildId, type, logicalKey)); }
  async getPanel(guildId: string, logicalKey: string): Promise<Panel | null> { return this.panels.get(panelKey(guildId, logicalKey)) ?? null; }
  async listPanels(guildId: string): Promise<Panel[]> { return [...this.panels.values()].filter((panel) => panel.guildId === guildId); }
  async upsertPanel(panel: Panel): Promise<Panel> { this.panels.set(panelKey(panel.guildId, panel.logicalKey), panel); return panel; }
  async setNotificationPreference(preference: NotificationPreference): Promise<NotificationPreference> { this.preferences.set(`${preference.guildId}:${preference.discordUserId}:${preference.logicalKey}`, preference); return preference; }
  async listNotificationPreferences(guildId: string, discordUserId: string): Promise<NotificationPreference[]> { return [...this.preferences.values()].filter((row) => row.guildId === guildId && row.discordUserId === discordUserId); }
  async listUserNotificationPreferences(discordUserId: string): Promise<NotificationPreference[]> { return [...this.preferences.values()].filter((row) => row.discordUserId === discordUserId); }
  async listGuildNotificationPreferences(guildId: string): Promise<NotificationPreference[]> { return [...this.preferences.values()].filter((row) => row.guildId === guildId); }
  async transaction<T>(action: () => Promise<T>): Promise<T> { return action(); }
}
const resourceKey = (guildId: string, type: ManagedResourceType, logicalKey: string) => `${guildId}:${type}:${logicalKey}`;
const panelKey = (guildId: string, logicalKey: string) => `${guildId}:${logicalKey}`;
