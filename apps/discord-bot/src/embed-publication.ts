import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type Client, type Guild } from 'discord.js';
import { renderEmbed, validateEmbed, type EmbedPayload, type LinkButton } from './embed-builder.js';
import type { Draft, PrismaEmbedRepository } from './persistence/embed-repository.js';

export type PublicationFailure = 'CHANNEL_MISSING' | 'PERMISSION_DENIED' | 'PAYLOAD_INVALID' | 'DISCORD_ERROR' | 'UNKNOWN_DELIVERY_STATE';
export class EmbedPublicationError extends Error { constructor(public readonly code: PublicationFailure, message: string) { super(message); } }

/** One controlled path for immediate and scheduled embed sends. */
export async function publishEmbed(input: { client: Client; guildId: string; draft: Draft; actorId: string; channelId: string; payload: EmbedPayload; buttons: LinkButton[]; repository: PrismaEmbedRepository }) {
  const errors = validateEmbed(input.payload, input.buttons); if (errors.length) throw new EmbedPublicationError('PAYLOAD_INVALID', errors[0]!);
  const guild = await input.client.guilds.fetch(input.guildId).catch(() => null); if (!guild) throw new EmbedPublicationError('CHANNEL_MISSING', 'The guild is unavailable.');
  const channel = await publishableChannel(guild, input.channelId); if (!channel) throw new EmbedPublicationError('PERMISSION_DENIED', 'The selected channel is unavailable or the bot cannot post embeds there.');
  let message: { id: string };
  try { message = await channel.send({ embeds: [renderEmbed(input.payload)], components: linkRows(input.buttons), allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } }); }
  catch { throw new EmbedPublicationError('DISCORD_ERROR', 'Discord did not confirm the publication.'); }
  try { const publication = await input.repository.publication(input.draft, input.actorId, channel.id, message.id); return { publication, channelId: channel.id, messageId: message.id }; }
  catch { throw new EmbedPublicationError('UNKNOWN_DELIVERY_STATE', 'Discord accepted the announcement but its durable receipt could not be confirmed.'); }
}

type PublishableChannel = { id: string; send: (payload: { embeds: ReturnType<typeof renderEmbed>[]; components: ReturnType<typeof linkRows>; allowedMentions: { parse: never[]; users: never[]; roles: never[]; repliedUser: boolean } }) => Promise<{ id: string }> };
export async function publishableChannel(guild: Guild, channelId: string): Promise<PublishableChannel | null> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !('send' in channel)) return null;
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null); const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return null;
  return channel as unknown as PublishableChannel;
}

function linkRows(buttons: LinkButton[]) {
  if (!buttons.length) return [];
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.map((button) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(button.label).setURL(button.url)))];
}
