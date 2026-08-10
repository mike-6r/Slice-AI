import type { Guild } from 'discord.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import type { ModerationCase, ModerationTransport } from './moderation.js';
import type { SetupRepository } from './persistence/setup-repository.js';
import { presentationConfig, renderTemplate } from './presentation-config.js';

export function parseModerationDuration(value: string, now = new Date()): Date {
  const match = /^(\d+)(m|h|d)$/i.exec(value.trim());
  if (!match) throw new Error('Invalid timeout duration.');
  const amount = Number.parseInt(match[1]!, 10); const unit = match[2]!.toLowerCase(); const milliseconds = amount * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 60_000 || milliseconds > 28 * 86_400_000) throw new Error('Invalid timeout duration.');
  return new Date(now.getTime() + milliseconds);
}

export function createDiscordModerationTransport(guild: Guild, repository: SetupRepository): ModerationTransport {
  return {
    enforce: async (record) => {
      if (record.action === 'WARN' || record.action === 'NOTE') return;
      if (record.action === 'UNBAN') { await guild.members.unban(record.targetDiscordUserId, record.reason); return; }
      const member = await guild.members.fetch(record.targetDiscordUserId);
      if (record.action === 'TIMEOUT') await member.timeout(record.expiresAt?.getTime() ?? null, record.reason);
      else if (record.action === 'UNTIMEOUT') await member.timeout(null, record.reason);
      else if (record.action === 'BAN') await member.ban({ reason: record.reason });
    },
    log: async (record: ModerationCase) => {
      const settings = presentationConfig()['moderation.yml'];
      const ref = await repository.getResource(guild.id, 'CHANNEL', settings.log_channel_key);
      if (!ref) return;
      const channel = await guild.channels.fetch(ref.discordId);
      if (!channel?.isTextBased() || !('send' in channel)) return;
      const template = settings.messages.case;
      await channel.send({ embeds: [SliceEmbed.staff(renderTemplate(template.title, { count: record.caseNumber }), renderTemplate(template.description, { action: record.action, user: record.targetDiscordUserId, status: record.status, reason: record.reason }))] });
    }
  };
}
