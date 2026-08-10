import type { LifecycleTicket } from './ticket-lifecycle.js';
import { sanitizeTicketText } from './tickets.js';

export type TranscriptStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED';
export type TranscriptRecord = { ticketId: string; status: TranscriptStatus; content: string; messageCount: number; failureReason?: string; deliveryChannelId?: string; deliveredAt?: Date };
export type TranscriptSource = LifecycleTicket & { safeSummary: string; events: { type: string; actorDiscordId?: string; metadata?: Record<string, unknown> | null; createdAt: Date }[] };
export type TranscriptMessage = { id: string; createdAt: Date; authorId: string; authorLabel: string; content: string; bot: boolean; attachments: { name: string; url?: string }[] };
export interface TranscriptRepository { getTranscriptSource(ticketId: string, guildId: string): Promise<TranscriptSource | null>; getTranscript(ticketId: string): Promise<TranscriptRecord | null>; saveTranscript(record: TranscriptRecord, retryFailed: boolean): Promise<TranscriptRecord>; markTranscriptDelivered(ticketId: string, channelId: string): Promise<void>; }
export interface TicketHistory { read(ticket: TranscriptSource): Promise<{ messages: TranscriptMessage[]; partial: boolean }> }

export class TicketTranscriptService {
  constructor(private readonly repository: TranscriptRepository) {}
  async generate(ticketId: string, guildId: string, history: TicketHistory, retryFailed = false): Promise<{ transcript: TranscriptRecord; reused: boolean }> {
    const ticket = await this.repository.getTranscriptSource(ticketId, guildId);
    if (!ticket || ticket.status !== 'CLOSED') throw new Error('Closed ticket unavailable.');
    const existing = await this.repository.getTranscript(ticket.id);
    if (existing && (existing.status !== 'FAILED' || !retryFailed)) return { transcript: existing, reused: true };
    try {
      const snapshot = await history.read(ticket);
      const transcript: TranscriptRecord = { ticketId: ticket.id, status: snapshot.partial ? 'PARTIAL' : 'COMPLETE', content: renderTranscript(ticket, snapshot.messages, snapshot.partial), messageCount: snapshot.messages.length };
      return { transcript: await this.repository.saveTranscript(transcript, retryFailed), reused: false };
    } catch {
      const transcript: TranscriptRecord = { ticketId: ticket.id, status: 'FAILED', content: `# Slice ticket transcript\n\nTicket: ${ticket.id}\n\nTranscript capture could not read Discord history. Retry from staff tooling.`, messageCount: 0, failureReason: 'Discord history unavailable' };
      return { transcript: await this.repository.saveTranscript(transcript, true), reused: false };
    }
  }
}

export function renderTranscript(ticket: TranscriptSource, messages: TranscriptMessage[], partial: boolean): string {
  const lines = ['# Slice ticket transcript', '', `Reference: ${ticket.id}`, `Category: ${ticket.category}`, `Subject: ${sanitizeTicketText(ticket.subject)}`, `Creator: <@${ticket.creatorId}>`, `Assignee: ${ticket.assignedStaffId ? `<@${ticket.assignedStaffId}>` : 'Unassigned'}`, `Status: ${ticket.status}`, `Priority: ${ticket.priority}`, `Created: ${ticket.createdAt.toISOString()}`, `Resolved: ${ticket.resolvedAt?.toISOString() ?? 'Not resolved'}`, `Closed: ${ticket.closedAt?.toISOString() ?? 'Not closed'}`, `History completeness: ${partial ? 'PARTIAL' : 'COMPLETE'}`, '', '## Lifecycle history'];
  for (const event of ticket.events) lines.push(`- ${event.createdAt.toISOString()} — ${event.type} — ${event.actorDiscordId ? `<@${event.actorDiscordId}>` : 'system'}`);
  lines.push('', '## Discord messages');
  for (const message of [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) { lines.push(`### ${message.createdAt.toISOString()} — ${message.authorLabel} (${message.bot ? 'bot' : `<@${message.authorId}>`})`, sanitizeTicketText(message.content) || '_No text content_'); for (const attachment of message.attachments) lines.push(`Attachment: ${sanitizeTicketText(attachment.name)}${attachment.url ? ` (${safeUrl(attachment.url)})` : ''}`); lines.push(''); }
  return lines.join('\n').slice(0, 200_000);
}
function safeUrl(value: string): string { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return '[unavailable]'; } }
