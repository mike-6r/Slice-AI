import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Guild, PermissionFlagsBits, type MessageEditOptions, type OverwriteResolvable } from 'discord.js';
import type { CreatedTicket, TicketDiscordBoundary } from './ticket-creation.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import type { LifecycleTicket } from './ticket-lifecycle.js';
import { presentationConfig } from './presentation-config.js';
import { ticketControlId } from './ticket-routing.js';
export type TicketControlMessage = { edit(payload: MessageEditOptions): Promise<unknown> };

function lifecycleEmbed(ticket: LifecycleTicket & { safeSummary?: string }) {
  const settings = presentationConfig()['tickets.yml']; const fields = settings.fields;
  const embed = SliceEmbed.configured('tickets.yml', 'lifecycle', { ticket_id: ticket.id.slice(0, 8), status: ticket.status }).addFields(
    { name: fields.reference, value: ticket.id }, { name: fields.category, value: ticket.category, inline: true }, { name: fields.status, value: ticket.status, inline: true }, { name: fields.priority, value: ticket.priority, inline: true },
    { name: fields.creator, value: `<@${ticket.creatorId}>`, inline: true }, { name: fields.assignee, value: ticket.assignedStaffId ? `<@${ticket.assignedStaffId}>` : fields.unassigned, inline: true }, { name: fields.subject, value: ticket.subject || fields.no_subject },
    { name: fields.created, value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:f>`, inline: true }, { name: fields.updated, value: `<t:${Math.floor(ticket.updatedAt.getTime() / 1000)}:f>`, inline: true }
  );
  if (ticket.safeSummary) embed.addFields({ name: 'Details', value: ticket.safeSummary });
  return embed;
}
export function ticketLifecycleEmbed(ticket: LifecycleTicket) { return lifecycleEmbed(ticket); }
export function ticketLifecycleComponents(ticket: Pick<LifecycleTicket, 'id' | 'status'>): ActionRowBuilder<ButtonBuilder>[] {
  const settings = presentationConfig()['tickets.yml']; const disabled = ticket.status === 'CLOSED';
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(ticketControlId('close', ticket.id)).setLabel(settings.controls.close).setStyle(ButtonStyle.Danger).setDisabled(disabled))];
}
export async function refreshTicketMessage(message: TicketControlMessage, ticket: LifecycleTicket): Promise<void> { await message.edit({ embeds: [lifecycleEmbed(ticket)], components: ticketLifecycleComponents(ticket) }); }
export async function refreshTicketHeader(guild: Guild, ticket: LifecycleTicket): Promise<void> { const channel = await guild.channels.fetch(ticket.channelId).catch(() => null); if (!channel?.isTextBased() || !('messages' in channel)) return; const messages = await channel.messages.fetch({ limit: 50 }); const header = messages.find((message) => message.components.some((row) => 'components' in row && row.components.some((component) => 'customId' in component && component.customId === ticketControlId('close', ticket.id)))); if (header) await refreshTicketMessage(header, ticket); }
export async function lockTicketChannel(guild: Guild, ticket: LifecycleTicket): Promise<void> { const channel = await guild.channels.fetch(ticket.channelId).catch(() => null); if (!channel || !('permissionOverwrites' in channel)) return; await channel.permissionOverwrites.edit(ticket.creatorId, { SendMessages: false, AttachFiles: false }, { reason: 'Slice ticket closed; preserving read-only history' }); }
export function createTicketDiscordBoundary(guild: Guild, supportCategoryId: string): TicketDiscordBoundary { return { async createPrivateChannel(input) { const overwrites: OverwriteResolvable[] = input.permissions.map((entry) => ({ id: entry.id === 'everyone' ? guild.roles.everyone.id : entry.id, allow: flags(entry.allow), deny: flags(entry.deny) })); const channel = await guild.channels.create({ name: input.name, type: ChannelType.GuildText, parent: supportCategoryId, permissionOverwrites: overwrites, reason: 'Slice AI support ticket' }); return { id: channel.id, name: channel.name, async sendOpening(ticket: CreatedTicket) { await channel.send({ embeds: [lifecycleEmbed({ ...ticket, creatorId: input.creatorId, assignedStaffId: undefined, status: 'OPEN', updatedAt: ticket.createdAt, lastActivityAt: ticket.createdAt })], components: ticketLifecycleComponents({ id: ticket.id, status: 'OPEN' }) }); }, async delete(reason: string) { await channel.delete(reason); } }; } }; }
function flags(values?: readonly string[]): bigint[] { return (values ?? []).map((value) => PermissionFlagsBits[value as keyof typeof PermissionFlagsBits]).filter((value): value is bigint => typeof value === 'bigint'); }
