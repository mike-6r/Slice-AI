import { PrismaClient } from '../../generated/prisma/index.js';
export type ProfileVisibility = 'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE';
export class PrismaInvestorProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async visibility(guildId: string, discordUserId: string): Promise<ProfileVisibility> { const row = await this.prisma.discordInvestorProfilePreference.findUnique({ where: { guildId_discordUserId: { guildId, discordUserId } } }); return (row?.visibility ?? 'MEMBERS_ONLY') as ProfileVisibility; }
  async setVisibility(guildId: string, discordUserId: string, visibility: ProfileVisibility): Promise<void> { await this.prisma.discordInvestorProfilePreference.upsert({ where: { guildId_discordUserId: { guildId, discordUserId } }, create: { guildId, discordUserId, visibility }, update: { visibility } }); }
}
