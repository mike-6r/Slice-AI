import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';

const color = z.string().regex(/^#?[0-9a-fA-F]{6}$/, 'must be a six-digit hex color');
const template = z.string().max(4000).refine((value) => {
  const allowed = new Set(['user', 'username', 'level', 'xp', 'reputation', 'ticket_id', 'asset', 'price', 'quantity', 'status', 'reason', 'duration', 'count', 'rank', 'amount', 'streak', 'date', 'channel', 'reference', 'action']);
  return [...value.matchAll(/\{([^{}]+)\}/g)].every((match) => allowed.has(match[1]));
}, 'contains an unsupported placeholder');
const message = z.object({ eyebrow: template.optional(), title: template, description: template, color: z.enum(['info', 'success', 'warning', 'error', 'staff']).default('info'), footer: template.optional(), thumbnail: z.string().url().optional(), image: z.string().url().optional(), timestamp: z.boolean().default(true) });
const resourceRole = z.object({ key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(100), color, hoist: z.boolean().default(false), mentionable: z.boolean().default(false), staff: z.boolean().default(false), separator: z.boolean().default(false), permissions: z.array(z.string()).default([]) });
const resourceCategory = z.object({ key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(100), staff: z.boolean().default(false) });
const resourceChannel = z.object({ key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(100), category: z.string().regex(/^[a-z0-9-]+$/), type: z.enum(['text', 'forum']).default('text'), order: z.number().int().min(0).max(999).default(0), read_only: z.boolean().default(false), staff: z.boolean().default(false), slowmode: z.number().int().min(0).max(21600).default(0), topic: z.string().max(1024).optional() });
const newsSource = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(100), type: z.enum(['RSS', 'ATOM']), feed_url: z.string().url().refine((value) => value.startsWith('https://'), 'must use HTTPS'), domain: z.string().min(3).max(255).transform((value) => value.toLowerCase()), enabled: z.boolean().default(true), category: z.enum(['POKEMON_OFFICIAL', 'TCG_PRODUCT', 'TOURNAMENT', 'GRADING', 'AUCTION', 'INDUSTRY']), priority: z.enum(['major', 'routine']).default('routine') });
const schemas = {
  'config.yml': z.object({ version: z.number().int().positive(), reload: z.object({ enabled: z.boolean(), administrator_only: z.boolean() }) }),
  'branding.yml': z.object({ name: z.string().min(1), footer: z.object({ text: template, icon_url: z.string().url().optional() }), colors: z.object({ info: color, success: color, warning: color, error: color, staff: color }), images: z.object({ logo_url: z.string().url().optional(), thumbnail_url: z.string().url().optional(), banner_url: z.string().url().optional() }), emojis: z.record(z.string().min(1).max(64)) }),
  'setup.yml': z.object({ version: z.number().int().positive(), roles: z.array(resourceRole).min(1), categories: z.array(resourceCategory).min(1), channels: z.array(resourceChannel).min(1), panels: z.record(message) }),
  'onboarding.yml': z.object({ faq: z.record(template), messages: z.record(message) }),
  'tickets.yml': z.object({ categories: z.array(z.object({ key: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1), emoji: z.string().min(1), description: template })), support_panel: z.object({ placeholder: z.string().min(1).max(150), categories: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(25) }).optional(), timings: z.object({ inactivity_warning_hours: z.number().int().min(1).max(720), inactivity_close_hours: z.number().int().min(2).max(2160) }), controls: z.record(z.string().min(1).max(100)), fields: z.record(z.string().min(1).max(100)), messages: z.record(message) }),
  'moderation.yml': z.object({ log_channel_key: z.string().regex(/^[a-z0-9-]+$/), defaults: z.object({ reason: template, timeout_display: template }), automod: z.object({ spam_limit_per_minute: z.number().int().min(1).max(100), duplicate_limit: z.number().int().min(1).max(20), mention_limit: z.number().int().min(1).max(100) }), messages: z.record(message) }),
  'progression.yml': z.object({ xp: z.object({ minimum: z.number().int().min(1).max(100), maximum: z.number().int().min(1).max(100), cooldown_seconds: z.number().int().min(15).max(3600), minimum_message_length: z.number().int().min(1).max(1000) }), daily: z.object({ reward: z.number().int().min(1).max(500) }), reputation: z.object({ cooldown_hours: z.number().int().min(1).max(168) }), milestones: z.array(z.number().int().positive()), achievements: z.array(z.object({ key: z.string().regex(/^[A-Z0-9_]+$/), name: z.string(), description: template, category: z.enum(['Community', 'Level', 'Reputation']), icon: z.string().min(1) })), messages: z.record(message) }),
  'community.yml': z.object({ daily_prompts: z.array(template).min(1), weekly_prompts: z.array(template).min(1), messages: z.record(message) }),
  'notifications.yml': z.object({ menu: z.object({ placeholder: template, title: template, description: template }), roles: z.array(z.object({ key: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1), emoji: z.string().min(1), description: template })) }),
  'market.yml': z.object({ date_format: z.string().min(1).max(64), messages: z.record(message), labels: z.record(template) }),
  'ai.yml': z.object({ disclaimer: template, messages: z.record(message) }),
  'commands.yml': z.object({ descriptions: z.record(z.string().min(1).max(100)), options: z.record(z.string().min(1).max(100)), help_categories: z.record(template) }),
  'messages.yml': z.object({ common: z.record(message) })
  , 'news-sources.yml': z.object({ sources: z.array(newsSource).min(1).max(20) })
} as const;
type FileName = keyof typeof schemas;
export type PresentationConfig = { [K in FileName]: z.infer<(typeof schemas)[K]> };
let active: PresentationConfig | undefined;

function configDirectory(): string { return join(process.cwd(), 'config'); }
function loadFile<K extends FileName>(file: K): z.infer<(typeof schemas)[K]> {
  const path = join(configDirectory(), file);
  let source: string;
  try { source = readFileSync(path, 'utf8'); } catch { throw new Error(`Configuration error in ${file}: file is missing or unreadable.`); }
  const document = parseDocument(source, { prettyErrors: false });
  if (document.errors.length) throw new Error(`Configuration error in ${file}: ${document.errors.map((error) => error.message).join('; ')}`);
  const parsed = schemas[file].safeParse(document.toJS());
  if (!parsed.success) throw new Error(`Configuration error in ${file}: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`).join('; ')}`);
  return parsed.data;
}
function assertUnique(config: PresentationConfig): void {
  const duplicate = (items: Array<{ key: string }>) => items.find((item, index) => items.findIndex((candidate) => candidate.key === item.key) !== index)?.key;
  const role = duplicate(config['setup.yml'].roles); const category = duplicate(config['setup.yml'].categories); const channel = duplicate(config['setup.yml'].channels);
  if (role || category || channel) throw new Error(`Configuration error: duplicate logical key ${role ?? category ?? channel}.`);
  const source = duplicate(config['news-sources.yml'].sources.map((item) => ({ key: item.id })));
  if (source) throw new Error(`Configuration error in news-sources.yml: duplicate source ${source}.`);
  for (const definition of config['setup.yml'].roles.filter((roleDefinition) => roleDefinition.separator)) if (definition.hoist || definition.mentionable || definition.permissions.length || definition.color.toLowerCase().replace('#', '') !== '000000') throw new Error(`Configuration error in setup.yml: separator ${definition.key} must be neutral and permissionless.`);
  const roles = config['setup.yml'].roles;
  const roleByKey = new Map(roles.map((definition) => [definition.key, definition]));
  const requiredOrder = ['slice', 'separator-slice', 'separator-staff', 'owner', 'administrator', 'operations', 'support', 'separator-collectors', 'verified-collector', 'collector', 'separator-access', 'verified', 'separator-notifications', 'new-listings', 'price-alerts', 'rare-cards', 'auctions', 'giveaways', 'news', 'market-summary', 'platform-updates', 'separator-community', 'level-50', 'level-30', 'level-20', 'level-10', 'level-5', 'separator-system', 'restricted', 'muted'];
  if (roles.map((definition) => definition.key).join('|') !== requiredOrder.join('|')) throw new Error('Configuration error in setup.yml: role order must match the Slice premium role architecture.');
  const expectedSeparators = new Map([['separator-slice', '──────── SLICE ────────'], ['separator-staff', '──────── STAFF ────────'], ['separator-collectors', '──────── COLLECTORS ────────'], ['separator-access', '──────── ACCESS ────────'], ['separator-notifications', '──────── NOTIFICATIONS ────────'], ['separator-community', '──────── PROGRESSION ────────'], ['separator-system', '──────── SYSTEM ────────']]);
  for (const [key, name] of expectedSeparators) if (roleByKey.get(key)?.name !== name) throw new Error(`Configuration error in setup.yml: ${key} is missing or has the wrong cosmetic divider name.`);
  for (const key of ['owner', 'administrator', 'operations', 'support', 'verified-collector', 'collector']) if (!roleByKey.get(key)?.hoist) throw new Error(`Configuration error in setup.yml: ${key} must be hoisted for the member sidebar.`);
  for (const key of ['verified', 'restricted', 'muted', 'level-50', 'level-30', 'level-20', 'level-10', 'level-5']) if (roleByKey.get(key)?.hoist || roleByKey.get(key)?.mentionable || roleByKey.get(key)?.permissions.length) throw new Error(`Configuration error in setup.yml: ${key} must remain a non-privileged, non-hoisted role.`);
  const notificationKeys = config['notifications.yml'].roles.map((definition) => definition.key);
  for (const key of notificationKeys) {
    const definition = roleByKey.get(key);
    if (!definition || definition.hoist || definition.mentionable || definition.permissions.length || definition.color.toLowerCase().replace('#', '') !== '000000') throw new Error(`Configuration error in setup.yml: notification role ${key} must be a neutral, non-privileged self-service role.`);
  }
  if (roleByKey.get('slice')?.permissions.includes('Administrator')) throw new Error('Configuration error in setup.yml: Slice must not receive Discord Administrator.');
  for (const channelDefinition of config['setup.yml'].channels) if (!config['setup.yml'].categories.some((categoryDefinition) => categoryDefinition.key === channelDefinition.category)) throw new Error(`Configuration error in setup.yml: channels.${channelDefinition.key}.category does not exist.`);
  const permanentPanels = ['verify', 'welcome', 'announcements', 'my-slice', 'market-feed', 'roles', 'collector-workspace', 'list-a-collectible', 'create-a-ticket', 'operations', 'moderation-log', 'support-log', 'bot-log'];
  for (const key of permanentPanels) if (!config['setup.yml'].panels[key]) throw new Error(`Configuration error in setup.yml: panels.${key} is required for a permanent panel channel.`);
  const messageSets = [config['setup.yml'].panels, config['onboarding.yml'].messages, config['tickets.yml'].messages, config['moderation.yml'].messages, config['progression.yml'].messages, config['community.yml'].messages, config['market.yml'].messages, config['ai.yml'].messages, config['messages.yml'].common];
  for (const set of messageSets) for (const [key, item] of Object.entries(set)) {
    if (item.title.length > 256) throw new Error(`Configuration error: ${key} title exceeds Discord's 256-character limit.`);
    if (item.description.length > 4096) throw new Error(`Configuration error: ${key} description exceeds Discord's 4096-character limit.`);
    if (item.footer && item.footer.length > 2048) throw new Error(`Configuration error: ${key} footer exceeds Discord's 2048-character limit.`);
  }
  if (config['tickets.yml'].categories.length > 25) throw new Error('Configuration error in tickets.yml: category select exceeds Discord\'s 25-option limit.');
  if (config['notifications.yml'].roles.length > 25) throw new Error('Configuration error in notifications.yml: notification select exceeds Discord\'s 25-option limit.');
  for (const key of config['tickets.yml'].support_panel?.categories ?? []) if (!config['tickets.yml'].categories.some((categoryDefinition) => categoryDefinition.key === key)) throw new Error(`Configuration error in tickets.yml: support_panel category ${key} does not exist.`);
}
export function loadPresentationConfig(): PresentationConfig { const loaded = Object.fromEntries((Object.keys(schemas) as FileName[]).map((file) => [file, loadFile(file)])) as PresentationConfig; assertUnique(loaded); active = loaded; return loaded; }
export function presentationConfig(): PresentationConfig { return active ?? loadPresentationConfig(); }
export function reloadPresentationConfig(): PresentationConfig { return loadPresentationConfig(); }
export function renderTemplate(value: string, values: Record<string, string | number | undefined> = {}): string { return value.replace(/\{([^{}]+)\}/g, (_, key: string) => String(values[key] ?? '')); }
export function colorNumber(value: string): number { return Number.parseInt(value.replace('#', ''), 16); }
