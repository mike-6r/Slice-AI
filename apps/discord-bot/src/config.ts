import { z } from 'zod';

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1), DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_DEV_GUILD_ID: z.string().min(1).optional(), SLICE_API_BASE_URL: z.string().url().optional(), SLICE_WEB_BASE_URL: z.string().url().optional(),
  SLICE_BOT_SERVICE_TOKEN: z.string().min(1).optional(), DATABASE_URL: z.string().url(),
  SLICE_DISCORD_DELIVERY_URL: z.string().url().optional(),
  OFFICIAL_DISCORD_INVITE_URL: z.string().url().optional(),
  AI_ENABLED: z.coerce.boolean().default(false),
  AI_PROVIDER: z.string().min(1).max(32).optional(),
  AI_MODEL: z.string().min(1).max(128).optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().min(500).max(20000).default(6000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(2000).default(400),
  AI_USER_COOLDOWN_SECONDS: z.coerce.number().int().min(5).max(3600).default(45),
  TICKET_INACTIVITY_ENABLED: z.coerce.boolean().default(true),
  TICKET_INACTIVITY_WARNING_HOURS: z.coerce.number().int().min(1).max(720).default(48),
  TICKET_INACTIVITY_CLOSE_HOURS: z.coerce.number().int().min(2).max(2160).default(120),
  TICKET_INACTIVITY_SCAN_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
  TICKET_INACTIVITY_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(50),
  XP_ENABLED: z.coerce.boolean().default(true),
  XP_MESSAGE_MIN: z.coerce.number().int().min(1).max(100).default(10),
  XP_MESSAGE_MAX: z.coerce.number().int().min(1).max(100).default(20),
  XP_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  XP_MIN_MESSAGE_LENGTH: z.coerce.number().int().min(1).max(1000).default(12),
  LEVEL_UP_ANNOUNCEMENTS_ENABLED: z.coerce.boolean().default(true),
  REPUTATION_ENABLED: z.coerce.boolean().default(true),
  REPUTATION_COOLDOWN_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  DAILY_ENABLED: z.coerce.boolean().default(true),
  DAILY_XP_REWARD: z.coerce.number().int().min(1).max(500).default(25),
  NOTIFICATION_ROLES_ENABLED: z.coerce.boolean().default(true),
  SUGGESTIONS_ENABLED: z.coerce.boolean().default(true),
  SUGGESTIONS_CHANNEL_LOGICAL_KEY: z.string().min(1).max(64).default('suggestions'),
  POLLS_ENABLED: z.coerce.boolean().default(true),
  POLL_MAX_OPTIONS: z.coerce.number().int().min(2).max(5).default(5),
  BIRTHDAYS_ENABLED: z.coerce.boolean().default(true),
  BIRTHDAY_ANNOUNCEMENTS_ENABLED: z.coerce.boolean().default(true),
  DAILY_CONVERSATION_ENABLED: z.coerce.boolean().default(true),
  DAILY_CONVERSATION_HOUR: z.coerce.number().int().min(0).max(23).default(10),
  WEEKLY_COMMUNITY_POST_ENABLED: z.coerce.boolean().default(true),
  WEEKLY_COMMUNITY_DAY: z.coerce.number().int().min(0).max(6).default(1),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3101),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});
export type BotConfig = z.infer<typeof envSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid Discord bot configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  return parsed.data;
}
