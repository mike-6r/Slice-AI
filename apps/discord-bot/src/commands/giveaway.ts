import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Client, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { SliceEmbed } from '../embeds/slice-embed.js';
import { GiveawayValidationError, MAX_GIVEAWAY_WINNERS, parseGiveawayDuration } from '../giveaways.js';
import { type Giveaway, PrismaGiveawayRepository } from '../persistence/giveaway-repository.js';
import { sanitizeTicketText } from '../tickets.js';

const CANCEL_TTL_MS = 10 * 60_000;
const cancelRequests = new Map<string, { giveawayId: string; guildId: string; actorId: string; expiresAt: number }>();

export const giveawayCommand = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Manage a Slice community giveaway')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName('start').setDescription('Start a community giveaway')
    .addStringOption((option) => option.setName('prize').setDescription('Prize or title').setRequired(true).setMaxLength(160))
    .addStringOption((option) => option.setName('description').setDescription('Optional community giveaway details').setMaxLength(1_000))
    .addStringOption((option) => option.setName('duration').setDescription('Duration such as 10m, 2h, or 3d').setRequired(true).setMaxLength(8))
    .addIntegerOption((option) => option.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(MAX_GIVEAWAY_WINNERS))
    .addChannelOption((option) => option.setName('channel').setDescription('Community channel (defaults to #general)').addChannelTypes(ChannelType.GuildText)))
  .addSubcommand((sub) => sub.setName('end').setDescription('End an active giveaway early').addStringOption((option) => option.setName('id').setDescription('Giveaway ID').setRequired(true).setMaxLength(64)))
  .addSubcommand((sub) => sub.setName('reroll').setDescription('Reroll completed giveaway winners').addStringOption((option) => option.setName('id').setDescription('Giveaway ID').setRequired(true).setMaxLength(64)).addIntegerOption((option) => option.setName('winners').setDescription('Number of reroll winners').setMinValue(1).setMaxValue(MAX_GIVEAWAY_WINNERS)).addStringOption((option) => option.setName('reason').setDescription('Optional audit reason').setMaxLength(300)))
  .addSubcommand((sub) => sub.setName('delete').setDescription('Cancel an active giveaway').addStringOption((option) => option.setName('id').setDescription('Giveaway ID').setRequired(true).setMaxLength(64)));

export function giveawayPayload(giveaway: Giveaway) {
  const end = `<t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:F> (<t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R>)`;
  const state = giveaway.status === 'OPEN' ? 'OPEN' : giveaway.status === 'ENDED' ? 'ENDED' : giveaway.status === 'CANCELLED' ? 'CANCELLED' : 'ENDING';
  const winnerText = giveaway.status === 'ENDED' ? winnerSummary(giveaway) : `${giveaway.winnerCount} winner${giveaway.winnerCount === 1 ? '' : 's'} will be selected.`;
  const body = [`**${giveaway.title}**`, giveaway.description ?? '', `**Winners:** ${winnerText}`, `**Ends:** ${end}`, `**Entries:** ${giveaway.entryCount}`, `**Status:** ${state}`].filter(Boolean).join('\n\n');
  const embed = giveaway.status === 'ENDED' ? SliceEmbed.success('Slice community giveaway · ENDED', body) : giveaway.status === 'CANCELLED' ? SliceEmbed.warning('Slice community giveaway · CANCELLED', body) : SliceEmbed.info('Slice community giveaway · OPEN', body);
  return { embeds: [embed], components: giveaway.status === 'OPEN' ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`slice:giveaway:enter:${giveaway.id}`).setLabel('Enter giveaway').setStyle(ButtonStyle.Primary))] : [] };
}

export async function handleGiveawayCommand(interaction: ChatInputCommandInteraction, repository: PrismaGiveawayRepository, defaultChannel: () => Promise<{ id: string; send(payload: object): Promise<{ id: string }> } | null>, publishCompletion: (giveaway: Giveaway) => Promise<boolean>, refresh: (giveaway: Giveaway) => Promise<boolean>): Promise<void> {
  if (!interaction.guildId || !interaction.guild || !hasGiveawayManagementPermission(interaction)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Giveaway management required', 'Only members with Discord Manage Server permission can manage giveaways.')] });
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'start') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const duration = parseGiveawayDuration(interaction.options.getString('duration', true));
      const target = interaction.options.getChannel('channel');
      const channel = target && 'isTextBased' in target && target.isTextBased() && 'send' in target ? target : await defaultChannel();
      if (!channel) return void await interaction.editReply({ embeds: [SliceEmbed.error('Giveaway unavailable', 'The community channel is not ready. Ask an administrator to run `/setup repair`.')] });
      const giveaway = await repository.create({ guildId: interaction.guildId, createdByDiscordUserId: interaction.user.id, title: safeText(interaction.options.getString('prize', true), 160), description: optionalText(interaction.options.getString('description'), 1_000), endsAt: new Date(Date.now() + duration), winnerCount: interaction.options.getInteger('winners', true) });
      try {
        const message = await channel.send(giveawayPayload(giveaway));
        const attached = await repository.attachMessage(giveaway.id, interaction.guildId, channel.id, message.id);
        await interaction.editReply({ embeds: [SliceEmbed.success('Giveaway started', `Giveaway \`${attached.id}\` is open in <#${channel.id}> and ends <t:${Math.floor(attached.endsAt.getTime() / 1000)}:R>.`)] });
      } catch (error) {
        await repository.cancel(giveaway.id, interaction.guildId, interaction.user.id);
        throw error;
      }
    } catch (error) {
      const message = error instanceof GiveawayValidationError ? error.message : 'The giveaway could not be posted. No active public giveaway was left running.';
      await interaction.editReply({ embeds: [SliceEmbed.error('Giveaway unavailable', message)] });
    }
    return;
  }
  const id = interaction.options.getString('id', true);
  if (subcommand === 'delete') return void await interaction.reply(cancelConfirmation(id, interaction.guildId, interaction.user.id));
  await interaction.deferReply({ ephemeral: true });
  if (subcommand === 'end') {
    const result = await repository.complete(id, interaction.guildId, interaction.user.id, false);
    if (!result) return void await interaction.editReply({ embeds: [SliceEmbed.error('Giveaway unavailable', 'That giveaway is not in this server.')] });
    const published = await publishCompletion(result.giveaway);
    return void await interaction.editReply({ embeds: [result.completedNow ? SliceEmbed.success('Giveaway ended', result.giveaway.winners.length ? 'Winners were selected from persisted community entries.' : 'No eligible entries were recorded, so no winners were selected.') : SliceEmbed.info('Giveaway already ended', 'The original result was preserved; no second winner set was chosen.'), ...(published ? [] : [SliceEmbed.warning('Public update pending', 'The result is persisted. The worker will retry the original message update safely.')])] });
  }
  try {
    const current = await repository.get(id, interaction.guildId);
    if (!current) return void await interaction.editReply({ embeds: [SliceEmbed.error('Giveaway unavailable', 'That giveaway is not in this server.')] });
    const rerolled = await repository.reroll(id, interaction.guildId, interaction.user.id, interaction.options.getInteger('winners') ?? current.winnerCount, optionalText(interaction.options.getString('reason'), 300));
    await refresh(rerolled);
    await interaction.editReply({ embeds: [SliceEmbed.success('Giveaway rerolled', 'A new winner set was selected from persisted entrants, excluding all prior winners.')] });
  } catch (error) {
    await interaction.editReply({ embeds: [SliceEmbed.error('Reroll unavailable', error instanceof GiveawayValidationError ? error.message : 'The giveaway could not be rerolled.')] });
  }
}

export async function handleGiveawayButton(interaction: ButtonInteraction, repository: PrismaGiveawayRepository, refresh: (giveaway: Giveaway) => Promise<boolean>): Promise<boolean> {
  const parts = interaction.customId.split(':');
  if (!interaction.guildId || !interaction.guild || parts[0] !== 'slice' || parts[1] !== 'giveaway') return false;
  if (parts[2] === 'enter') {
    const giveaway = parts[3];
    if (!giveaway) return false;
    const result = await repository.enter(giveaway, interaction.guildId, interaction.user.id);
    if (result === 'UNAVAILABLE') {
      await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Giveaway unavailable', 'This giveaway is closed, cancelled, expired, or not available in this server.')] });
      return true;
    }
    const current = await repository.get(giveaway, interaction.guildId);
    if (current) await refresh(current);
    await interaction.reply({ ephemeral: true, embeds: [result === 'ENTERED' ? SliceEmbed.success('You are entered', 'Your community giveaway entry is recorded once.') : SliceEmbed.info('You are already entered', 'Your existing entry remains active; duplicate clicks do not create extra entries.')] });
    return true;
  }
  if (parts[2] === 'cancel-dismiss') {
    await interaction.update({ embeds: [SliceEmbed.info('Giveaway unchanged', 'No giveaway state was changed.')], components: [] });
    return true;
  }
  if (parts[2] !== 'cancel') return false;
  const [giveawayId, nonce] = [parts[3], parts[4]];
  const request = nonce ? cancelRequests.get(nonce) : undefined;
  if (!giveawayId || !request || request.giveawayId !== giveawayId || request.guildId !== interaction.guildId || request.actorId !== interaction.user.id || request.expiresAt < Date.now()) {
    await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Cancellation expired', 'Run `/giveaway delete` again to confirm cancellation.')] });
    return true;
  }
  cancelRequests.delete(nonce!);
  if (!hasGiveawayManagementPermission(interaction)) { await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Giveaway management required', 'Only members with Discord Manage Server permission can cancel giveaways.')] }); return true; }
  const result = await repository.cancel(giveawayId, interaction.guildId, interaction.user.id);
  if (!result) { await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Giveaway unavailable', 'That giveaway is not in this server.')] }); return true; }
  const refreshed = await refresh(result.giveaway);
  await interaction.update({ embeds: [result.cancelledNow ? SliceEmbed.success('Giveaway cancelled', refreshed ? 'Entries are locked and the public entry control is disabled.' : 'Entries are locked. The worker-safe message update will be retried by an administrator action if needed.') : SliceEmbed.info('Giveaway unchanged', 'Only an active giveaway can be cancelled; historical results are retained.')], components: [] });
  return true;
}

export async function refreshGiveawayMessage(client: Client, giveaway: Giveaway): Promise<boolean> {
  if (!giveaway.channelId || !giveaway.messageId) return false;
  const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(giveaway.channelId).catch(() => null) : null;
  if (!channel?.isTextBased() || !('messages' in channel)) return false;
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) return false;
  await message.edit(giveawayPayload(giveaway));
  return true;
}

export async function publishGiveawayCompletion(client: Client, repository: PrismaGiveawayRepository, giveaway: Giveaway): Promise<boolean> {
  if (!(await repository.claimCompletionAnnouncement(giveaway.id))) return false;
  try {
    const current = await repository.get(giveaway.id, giveaway.guildId);
    if (!current || !(await refreshGiveawayMessage(client, current))) throw new Error('Giveaway message unavailable');
    await repository.finishCompletionAnnouncement(giveaway.id);
    return true;
  } catch {
    await repository.releaseCompletionAnnouncement(giveaway.id);
    return false;
  }
}

export function hasGiveawayManagementPermission(interaction: Pick<ChatInputCommandInteraction | ButtonInteraction, 'memberPermissions'>): boolean { return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true; }

function cancelConfirmation(giveawayId: string, guildId: string, actorId: string) {
  const nonce = crypto.randomUUID();
  cancelRequests.set(nonce, { giveawayId, guildId, actorId, expiresAt: Date.now() + CANCEL_TTL_MS });
  return { ephemeral: true, embeds: [SliceEmbed.warning('Confirm giveaway cancellation', 'This locks new entries, preserves the audit history, and disables the public entry control. It does not delete giveaway evidence.')], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`slice:giveaway:cancel:${giveawayId}:${nonce}`).setLabel('Cancel giveaway').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`slice:giveaway:cancel-dismiss:${nonce}`).setLabel('Keep giveaway').setStyle(ButtonStyle.Secondary))] };
}

function winnerSummary(giveaway: Giveaway): string {
  if (!giveaway.winners.length) return 'No eligible entries were recorded.';
  const original = giveaway.winners.filter((winner) => winner.selectionType === 'ORIGINAL').map((winner) => winner.discordUserId);
  const latestReroll = Math.max(0, ...giveaway.winners.filter((winner) => winner.selectionType === 'REROLL').map((winner) => winner.rerollSequence));
  const reroll = latestReroll ? giveaway.winners.filter((winner) => winner.selectionType === 'REROLL' && winner.rerollSequence === latestReroll).map((winner) => winner.discordUserId) : [];
  return [`Original: ${memberMentions(original) || 'none'}`, ...(reroll.length ? [`Reroll ${latestReroll}: ${memberMentions(reroll)}`] : [])].join('\n');
}
function memberMentions(ids: string[]): string { const shown = ids.slice(0, 20).map((id) => `<@${id}>`); return `${shown.join(', ')}${ids.length > shown.length ? ` and ${ids.length - shown.length} more` : ''}`; }
function safeText(value: string, maxLength: number): string { return sanitizeTicketText(value).replace(/@(everyone|here)/gi, '@​$1').replace(/<@!?&?\d+>/g, '[mention removed]').slice(0, maxLength).trim(); }
function optionalText(value: string | null, maxLength: number): string | undefined { const safe = value ? safeText(value, maxLength) : ''; return safe || undefined; }
