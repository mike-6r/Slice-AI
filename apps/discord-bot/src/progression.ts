import type { BotConfig } from './config.js';
import { type AchievementUnlock, type MemberProgression, PrismaProgressionRepository } from './persistence/progression-repository.js';
import { presentationConfig } from './presentation-config.js';

export type AchievementDefinition = { key: string; name: string; description: string; category: 'Community' | 'Level' | 'Reputation'; icon: string };
export const ACHIEVEMENTS: readonly AchievementDefinition[] = presentationConfig()['progression.yml'].achievements;
export type ProgressionResult = { progression: MemberProgression; leveledUp: boolean; unlocked: string[]; amount: number };
export function levelForXp(xp: number): number { return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1); }
export function xpForLevel(level: number): number { return 100 * Math.max(1, level) ** 2; }
export class AchievementService {
  constructor(private readonly repository: PrismaProgressionRepository) {}
  async evaluate(progression: MemberProgression): Promise<string[]> {
    const keys: string[] = [];
    if (progression.totalMessagesEligible >= 1) keys.push('FIRST_MESSAGE'); if (progression.totalMessagesEligible >= 50) keys.push('ACTIVE_MEMBER'); if (progression.totalMessagesEligible >= 250) keys.push('CONVERSATION_STARTER');
    for (const level of [5, 10, 25, 50]) if (progression.level >= level) keys.push(`LEVEL_${level}`);
    for (const [threshold, key] of [[5, 'HELPFUL_5'], [25, 'TRUSTED_25'], [100, 'COMMUNITY_PILLAR_100']] as const) if (progression.reputation >= threshold) keys.push(key);
    return this.repository.unlock(progression.guildId, progression.discordUserId, keys);
  }
}
export class MemberProgressionService {
  private readonly achievements: AchievementService;
  constructor(private readonly repository: PrismaProgressionRepository, private readonly config: Pick<BotConfig, 'XP_ENABLED' | 'XP_MESSAGE_MIN' | 'XP_MESSAGE_MAX' | 'XP_COOLDOWN_SECONDS' | 'XP_MIN_MESSAGE_LENGTH' | 'REPUTATION_ENABLED' | 'REPUTATION_COOLDOWN_HOURS' | 'DAILY_ENABLED' | 'DAILY_XP_REWARD'>) { this.achievements = new AchievementService(repository); }
  async awardMessageXp(input: { guildId: string; discordUserId: string; content: string; isBot: boolean; isSystem: boolean; isCommand: boolean; blocked: boolean }): Promise<ProgressionResult | null> { if (!this.config.XP_ENABLED || input.isBot || input.isSystem || input.isCommand || input.blocked || input.content.trim().length < this.config.XP_MIN_MESSAGE_LENGTH) return null; const now = new Date(); const min = Math.min(this.config.XP_MESSAGE_MIN, this.config.XP_MESSAGE_MAX); const max = Math.max(this.config.XP_MESSAGE_MIN, this.config.XP_MESSAGE_MAX); const amount = min + Math.floor(Math.random() * (max - min + 1)); const before = await this.repository.getOrCreate(input.guildId, input.discordUserId); const progression = await this.repository.awardMessageXpAt(input.guildId, input.discordUserId, amount, now, this.config.XP_COOLDOWN_SECONDS * 1000); if (!progression) return null; return { progression, leveledUp: progression.level > before.level, unlocked: await this.achievements.evaluate(progression), amount }; }
  async claimDaily(guildId: string, discordUserId: string): Promise<ProgressionResult | null> { if (!this.config.DAILY_ENABLED) return null; const before = await this.repository.getOrCreate(guildId, discordUserId); const progression = await this.repository.claimDaily(guildId, discordUserId, this.config.DAILY_XP_REWARD, new Date()); if (!progression) return null; return { progression, leveledUp: progression.level > before.level, unlocked: await this.achievements.evaluate(progression), amount: this.config.DAILY_XP_REWARD }; }
  async giveReputation(input: { guildId: string; giverDiscordUserId: string; receiverDiscordUserId: string; reason?: string }): Promise<{ progression: MemberProgression; unlocked: string[] } | null> { if (!this.config.REPUTATION_ENABLED || input.giverDiscordUserId === input.receiverDiscordUserId) return null; const progression = await this.repository.grantReputation(input.guildId, input.giverDiscordUserId, input.receiverDiscordUserId, input.reason, new Date(), this.config.REPUTATION_COOLDOWN_HOURS * 60 * 60 * 1000); if (!progression) return null; return { progression, unlocked: await this.achievements.evaluate(progression) }; }
  get(guildId: string, discordUserId: string): Promise<MemberProgression> { return this.repository.getOrCreate(guildId, discordUserId); }
  leaderboard(guildId: string, metric: 'xp' | 'reputation' = 'xp'): Promise<MemberProgression[]> { return this.repository.leaderboard(guildId, metric); }
  rank(guildId: string, discordUserId: string, metric: 'xp' | 'reputation' = 'xp'): Promise<number> { return this.repository.rank(guildId, discordUserId, metric); }
  achievementsFor(guildId: string, discordUserId: string): Promise<AchievementUnlock[]> { return this.repository.achievements(guildId, discordUserId); }
}
