import type { TicketSlaAlertKind } from './persistence/advanced-ticket-repository.js';

export type SlaTicket = { id: string; guildId: string; creatorDiscordId: string; category: string; createdAt: Date; firstStaffResponseAt: Date | null; firstResponseDueAt: Date | null; resolutionDueAt: Date | null };
export interface TicketSlaRepository { listSlaAlertCandidates(now: Date, limit: number): Promise<SlaTicket[]>; markSlaAlert(ticketId: string, guildId: string, kind: TicketSlaAlertKind, at?: Date): Promise<boolean>; }
export interface TicketSlaNotifier { alert(ticket: SlaTicket, kind: TicketSlaAlertKind): Promise<void>; }

/** Bounded, idempotent SLA scanning. Markers are claimed before Discord delivery. */
export class TicketSlaService {
  constructor(private readonly repository: TicketSlaRepository, private readonly notifier: TicketSlaNotifier, private readonly atRiskPercent = 75, private readonly batchSize = 100) {}
  async scan(now = new Date()): Promise<{ risk: number; breached: number }> {
    let risk = 0; let breached = 0;
    for (const ticket of await this.repository.listSlaAlertCandidates(now, this.batchSize)) {
      for (const kind of this.alertsFor(ticket, now)) {
        if (!(await this.repository.markSlaAlert(ticket.id, ticket.guildId, kind, now))) continue;
        try { await this.notifier.alert(ticket, kind); if (kind.endsWith('RISK')) risk++; else breached++; } catch { /* marker prevents repeated alert storms; ticket work remains authoritative */ }
      }
    }
    return { risk, breached };
  }
  alertsFor(ticket: SlaTicket, now: Date): TicketSlaAlertKind[] {
    const alerts: TicketSlaAlertKind[] = [];
    if (!ticket.firstStaffResponseAt && ticket.firstResponseDueAt) { const kind = slaKind(ticket.createdAt, ticket.firstResponseDueAt, now, this.atRiskPercent, 'FIRST_RESPONSE'); if (kind) alerts.push(kind); }
    if (ticket.resolutionDueAt) { const kind = slaKind(ticket.createdAt, ticket.resolutionDueAt, now, this.atRiskPercent, 'RESOLUTION'); if (kind) alerts.push(kind); }
    return alerts;
  }
}
function slaKind(opened: Date, due: Date, now: Date, threshold: number, prefix: 'FIRST_RESPONSE' | 'RESOLUTION'): TicketSlaAlertKind | null {
  if (now >= due) return `${prefix}_BREACH` as TicketSlaAlertKind;
  const riskAt = opened.getTime() + (due.getTime() - opened.getTime()) * (threshold / 100);
  return now.getTime() >= riskAt ? `${prefix}_RISK` as TicketSlaAlertKind : null;
}
