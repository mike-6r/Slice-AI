import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { SliceEmbed } from '../embeds/slice-embed.js';
import { hasMemeMedia } from '../meme-competition.js';
import { type MemeCompetition, PrismaMemeCompetitionRepository } from '../persistence/meme-competition-repository.js';

export const memeCommand = new SlashCommandBuilder()
  .setName('meme')
  .setDescription('Join or manage the weekly Slice meme competition')
  .addSubcommand((sub) => sub.setName('submit').setDescription('Register your media message in the active weekly competition').addStringOption((option) => option.setName('message').setDescription('Message ID of your meme in this channel').setRequired(true).setMaxLength(22)))
  .addSubcommand((sub) => sub.setName('status').setDescription('View the active weekly meme competition'))
  .addSubcommand((sub) => sub.setName('end').setDescription('Close the active competition early'))
  .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancel the active competition without an XP award'));

export function memeCompetitionPayload(competition: MemeCompetition, voteEmoji: string, mode: 'open' | 'result' = 'open') {
  const ends = `<t:${Math.floor(competition.endsAt.getTime() / 1_000)}:F> (<t:${Math.floor(competition.endsAt.getTime() / 1_000)}:R>)`;
  if (mode === 'open') return { embeds: [SliceEmbed.info('Weekly Meme Competition', ['Post one original meme or GIF in this channel, then register it with `/meme submit message:<message-id>`.', `Vote with ${voteEmoji}; bot and self-votes do not count.`, `**Ends:** ${ends}`, `**Winner reward:** ${competition.rewardXp} XP`, `**Competition ID:** \`${competition.id}\``].join('\n\n'))] };
  if (competition.status === 'AWARDED' && competition.winnerDiscordUserId && competition.winningSubmissionId) {
    const winner = competition.submissions.find((submission) => submission.id === competition.winningSubmissionId);
    const link = winner ? `https://discord.com/channels/${competition.guildId}/${winner.channelId}/${winner.messageId}` : null;
    return { embeds: [SliceEmbed.success('Weekly Meme Competition · WINNER', [`<@${competition.winnerDiscordUserId}> wins **${competition.rewardXp} XP**.`, winner ? `**Votes:** ${winner.finalVoteCount ?? 0}\n**Winning meme:** [Open submission](${link})` : 'The winning submission reference is unavailable.', `Closed: <t:${Math.floor((competition.closedAt ?? new Date()).getTime() / 1_000)}:R>`].join('\n\n'))] };
  }
  return { embeds: [SliceEmbed.info('Weekly Meme Competition · CLOSED', 'No valid meme submission was available at close, so no XP was awarded this week.')] };
}

export async function handleMemeCommand(interaction: ChatInputCommandInteraction, repository: PrismaMemeCompetitionRepository, voteEmoji: string, close: (competition: MemeCompetition, actorDiscordId: string, automatic: boolean) => Promise<{ competition: MemeCompetition; closedNow: boolean } | null>): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Guild only', 'Weekly meme competitions are available in a Slice server.')] });
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'status') {
    const competition = await repository.active(interaction.guildId);
    return void await interaction.reply({ ephemeral: true, embeds: [competition ? memeCompetitionPayload(competition, voteEmoji) .embeds[0] : SliceEmbed.info('Weekly Meme Competition', 'There is no active weekly meme competition right now.')] });
  }
  if (subcommand === 'submit') return void await submit(interaction, repository, voteEmoji);
  if (!hasMemeManagementPermission(interaction)) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.error('Meme competition management required', 'Only members with Discord Manage Server permission can close or cancel the weekly competition.')] });
  const competition = await repository.active(interaction.guildId);
  if (!competition) return void await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.info('Meme competition unavailable', 'There is no open weekly meme competition to manage.')] });
  if (subcommand === 'cancel') {
    const cancelled = await repository.cancel(competition.id, interaction.guildId, interaction.user.id);
    return void await interaction.reply({ ephemeral: true, embeds: [cancelled ? SliceEmbed.success('Meme competition cancelled', 'Submissions are closed and no XP will be awarded for this competition.') : SliceEmbed.info('Meme competition unchanged', 'Only an open competition can be cancelled.')] });
  }
  await interaction.deferReply({ ephemeral: true });
  const completed = await close(competition, interaction.user.id, false);
  await interaction.editReply({ embeds: [completed?.closedNow ? SliceEmbed.success('Meme competition closed', 'The winner result and any XP award were persisted before announcement.') : SliceEmbed.info('Meme competition unchanged', 'This competition is already closing or closed.')] });
}

async function submit(interaction: ChatInputCommandInteraction, repository: PrismaMemeCompetitionRepository, voteEmoji: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const competition = await repository.active(interaction.guildId!);
  if (!competition || competition.status !== 'OPEN' || competition.channelId !== interaction.channelId || competition.endsAt <= new Date()) return void await interaction.editReply({ embeds: [SliceEmbed.warning('Submission unavailable', 'Post and register your meme in the active competition channel before it closes.')] });
  const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
  if (!member || member.user.bot || member.isCommunicationDisabled()) return void await interaction.editReply({ embeds: [SliceEmbed.warning('Submission unavailable', 'Restricted or automated accounts cannot submit to the weekly meme competition.')] });
  const messageId = interaction.options.getString('message', true).trim();
  if (!/^\d{15,22}$/.test(messageId)) return void await interaction.editReply({ embeds: [SliceEmbed.error('Invalid message ID', 'Use the Discord message ID for your media post in this competition channel.')] });
  const channel = await interaction.guild!.channels.fetch(competition.channelId).catch(() => null);
  if (!channel?.isTextBased() || !('messages' in channel)) return void await interaction.editReply({ embeds: [SliceEmbed.error('Competition unavailable', 'The configured community channel is unavailable.')] });
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || message.author.bot || message.author.id !== interaction.user.id || !hasMemeMedia(message)) return void await interaction.editReply({ embeds: [SliceEmbed.warning('Valid media required', 'Submit one of your existing image or GIF messages from this competition channel. Plain text is not an entry.')] });
  const result = await repository.registerSubmission({ competitionId: competition.id, guildId: interaction.guildId!, channelId: channel.id, messageId, discordUserId: interaction.user.id });
  const response = result === 'REGISTERED' ? SliceEmbed.success('Meme submitted', `Your meme is registered. Community members can vote with ${voteEmoji} until the competition closes.`) : result === 'ALREADY_SUBMITTED' ? SliceEmbed.info('Meme already submitted', 'Each member can register one active meme per weekly competition.') : result === 'DUPLICATE_MESSAGE' ? SliceEmbed.info('Message already registered', 'That Discord message is already registered as a meme submission.') : SliceEmbed.warning('Submission unavailable', 'The competition has closed or the message does not belong to its current channel.');
  await interaction.editReply({ embeds: [response] });
}

export function hasMemeManagementPermission(interaction: Pick<ChatInputCommandInteraction, 'memberPermissions'>): boolean { return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true; }
