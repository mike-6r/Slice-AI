import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';

const color = z.string().regex(/^#?[0-9a-fA-F]{6}$/, 'must be a six-digit hex color');
const template = z.string().max(4000).refine((value) => {
  const allowed = new Set(['user', 'username', 'level', 'xp', 'reputation', 'ticket_id', 'asset', 'price', 'quantity', 'status', 'reason', 'duration', 'count', 'rank', 'amount', 'streak', 'date', 'channel', 'reference', 'action']);
  return [...value.matchAll(/\{([^{}]+)\}/g)].every((match) => allowed.has(match[1]));
}, 'contains an unsupported placeholder');
const message = z.object({ title: template, description: template, color: z.enum(['info', 'success', 'warning', 'error', 'staff']).default('info'), footer: template.optional(), thumbnail: z.string().url().optional(), image: z.string().url().optional(), timestamp: z.boolean().default(true) });
const resourceRole = z.object({ key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(100), color, hoist: z.boolean().default(false), mentionable: z.boolean().default(false), staff: z.boolean().default(false) });
const resourceCategory = z.object({ key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(100), staff: z.boolean().default(false) });
const resourceChannel = z.object({ key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().regex(/^[a-z0-9-_]+$/).max(100), category: z.string().regex(/^[a-z0-9-]+$/), type: z.enum(['text', 'forum']).default('text'), order: z.number().int().min(0).max(999).default(0), read_only: z.boolean().default(false), staff: z.boolean().default(false), topic: z.string().max(1024).optional() });
const schemas = {
  'config.yml': z.object({ version: z.number().int().positive(), reload: z.object({ enabled: z.boolean(), administrator_only: z.boolean() }) }),
  'branding.yml': z.object({ name: z.string().min(1), footer: z.object({ text: template, icon_url: z.string().url().optional() }), colors: z.object({ info: color, success: color, warning: color, error: color, staff: color }), images: z.object({ logo_url: z.string().url().optional(), thumbnail_url: z.string().url().optional(), banner_url: z.string().url().optional() }), emojis: z.record(z.string().min(1).max(64)) }),
  'setup.yml': z.object({ version: z.number().int().positive(), roles: z.array(resourceRole).min(1), categories: z.array(resourceCategory).min(1), channels: z.array(resourceChannel).min(1), panels: z.record(message) }),
  'onboarding.yml': z.object({ faq: z.record(template), messages: z.record(message) }),
  'tickets.yml': z.object({ categories: z.array(z.object({ key: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1), emoji: z.string().min(1), description: template })), timings: z.object({ inactivity_warning_hours: z.number().int().min(1).max(720), inactivity_close_hours: z.number().int().min(2).max(2160) }), controls: z.record(z.string().min(1).max(100)), fields: z.record(z.string().min(1).max(100)), messages: z.record(message) }),
  'moderation.yml': z.object({ log_channel_key: z.string().regex(/^[a-z0-9-]+$/), defaults: z.object({ reason: template, timeout_display: template }), automod: z.object({ spam_limit_per_minute: z.number().int().min(1).max(100), duplicate_limit: z.number().int().min(1).max(20), mention_limit: z.number().int().min(1).max(100) }), messages: z.record(message) }),
  'progression.yml': z.object({ xp: z.object({ minimum: z.number().int().min(1).max(100), maximum: z.number().int().min(1).max(100), cooldown_seconds: z.number().int().min(15).max(3600), minimum_message_length: z.number().int().min(1).max(1000) }), daily: z.object({ reward: z.number().int().min(1).max(500) }), reputation: z.object({ cooldown_hours: z.number().int().min(1).max(168) }), milestones: z.array(z.number().int().positive()), achievements: z.array(z.object({ key: z.string().regex(/^[A-Z0-9_]+$/), name: z.string(), description: template, category: z.enum(['Community', 'Level', 'Reputation']), icon: z.string().min(1) })), messages: z.record(message) }),
  'community.yml': z.object({ daily_prompts: z.array(template).min(1), weekly_prompts: z.array(template).min(1), messages: z.record(message) }),
  'notifications.yml': z.object({ menu: z.object({ placeholder: template, title: template, description: template }), roles: z.array(z.object({ key: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1), emoji: z.string().min(1), description: template })) }),
  'market.yml': z.object({ date_format: z.string().min(1).max(64), messages: z.record(message), labels: z.record(template) }),
  'ai.yml': z.object({ disclaimer: template, messages: z.record(message) }),
  'commands.yml': z.object({ descriptions: z.record(z.string().min(1).max(100)), options: z.record(z.string().min(1).max(100)), help_categories: z.record(template) }),
  'messages.yml': z.object({ common: z.record(message) })
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
  for (const channelDefinition of config['setup.yml'].channels) if (!config['setup.yml'].categories.some((categoryDefinition) => categoryDefinition.key === channelDefinition.category)) throw new Error(`Configuration error in setup.yml: channels.${channelDefinition.key}.category does not exist.`);
}
export function loadPresentationConfig(): PresentationConfig { const loaded = Object.fromEntries((Object.keys(schemas) as FileName[]).map((file) => [file, loadFile(file)])) as PresentationConfig; assertUnique(loaded); active = loaded; return loaded; }
export function presentationConfig(): PresentationConfig { return active ?? loadPresentationConfig(); }
export function reloadPresentationConfig(): PresentationConfig { return loadPresentationConfig(); }
export function renderTemplate(value: string, values: Record<string, string | number | undefined> = {}): string { return value.replace(/\{([^{}]+)\}/g, (_, key: string) => String(values[key] ?? '')); }
export function colorNumber(value: string): number { return Number.parseInt(value.replace('#', ''), 16); }
