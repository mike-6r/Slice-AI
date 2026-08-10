import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Guild, PermissionFlagsBits, type MessageEditOptions, type OverwriteResolvable } from 'discord.js';
import type { CreatedTicket, TicketDiscordBoundary } from './ticket-creation.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import type { LifecycleTicket } from './ticket-lifecycle.js';
import { presentationConfig } from './presentation-config.js';
import { ticketControlId, type TicketAction } from './ticket-routing.js';
export type TicketControlMessage = { edit(payload: MessageEditOptions): Promise<unknown> };

function lifecycleEmbed(ticket: LifecycleTicket) {
  const settings = presentationConfig()['tickets.yml']; const fields = settings.fields;
  return SliceEmbed.configured('tickets.yml', 'lifecycle', { ticket_id: ticket.id.slice(0, 8), status: ticket.status }).addFields(
    { name: fields.reference, value: ticket.id }, { name: fields.category, value: ticket.category, inline: true }, { name: fields.status, value: ticket.status, inline: true }, { name: fields.priority, value: ticket.priority, inline: true },
    { name: fields.creator, value: `<@${ticket.creatorId}>`, inline: true }, { name: fields.assignee, value: ticket.assignedStaffId ? `<@${ticket.assignedStaffId}>` : fields.unassigned, inline: true }, { name: fields.subject, value: ticket.subject || fields.no_subject },
    { name: fields.created, value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:f>`, inline: true }, { name: fields.updated, value: `<t:${Math.floor(ticket.updatedAt.getTime() / 1000)}:f>`, inline: true }
  );
}
export function ticketLifecycleEmbed(ticket: LifecycleTicket) { return lifecycleEmbed(ticket); }
export function ticketLifecycleComponents(ticket: Pick<LifecycleTicket, 'id' | 'status'>): ActionRowBuilder<ButtonBuilder>[] {
  const settings = presentationConfig()['tickets.yml']; const disabled = ticket.status === 'CLOSED'; const resolved = ticket.status === 'RESOLVED';
  const button = (action: TicketAction, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(ticketControlId(action, ticket.id)).setLabel(settings.controls[action]).setStyle(style).setDisabled(disabled || (resolved && action !== 'close'));
  const buttons = [button('claim'), button('waiting-user'), button('waiting-staff'), button('escalate'), button('priority'), button('transfer'), button('resolve', ButtonStyle.Success), button('close', ButtonStyle.Danger)];
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5)), new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(5))];
}
export async function refreshTicketMessage(message: TicketControlMessage, ticket: LifecycleTicket): Promise<void> { await message.edit({ embeds: [lifecycleEmbed(ticket)], components: ticketLifecycleComponents(ticket) }); }
export function createTicketDiscordBoundary(guild: Guild, supportCategoryId: string): TicketDiscordBoundary { return { async createPrivateChannel(input) { const overwrites: OverwriteResolvable[] = input.permissions.map((entry) => ({ id: entry.id === 'everyone' ? guild.roles.everyone.id : entry.id, allow: flags(entry.allow), deny: flags(entry.deny) })); const channel = await guild.channels.create({ name: input.name, type: ChannelType.GuildText, parent: supportCategoryId, permissionOverwrites: overwrites, reason: 'Slice AI support ticket' }); return { id: channel.id, name: channel.name, async sendOpening(ticket: CreatedTicket) { await channel.send({ embeds: [lifecycleEmbed({ ...ticket, creatorId: input.creatorId, assignedStaffId: undefined, status: 'OPEN', updatedAt: ticket.createdAt, lastActivityAt: ticket.createdAt })], components: ticketLifecycleComponents({ id: ticket.id, status: 'OPEN' }) }); }, async delete(reason: string) { await channel.delete(reason); } }; } }; }
function flags(values?: readonly string[]): bigint[] { return (values ?? []).map((value) => PermissionFlagsBits[value as keyof typeof PermissionFlagsBits]).filter((value): value is bigint => typeof value === 'bigint'); }
