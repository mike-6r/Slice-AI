import type { LifecycleActor, LifecycleTicket } from './ticket-lifecycle.js';
import { TicketLifecycleService } from './ticket-lifecycle.js';

export type InactivityPolicy = { enabled: boolean; warningHours: number; closeHours: number; batchSize: number };
export interface InactivityRepository { listWarningCandidates(before: Date, limit: number): Promise<LifecycleTicket[]>; listCloseCandidates(before: Date, limit: number): Promise<LifecycleTicket[]>; get(id: string, guildId: string): Promise<LifecycleTicket | null>; markWarning(ticket: LifecycleTicket, at: Date): Promise<boolean>; }
export interface InactivityNotifier { warn(ticket: LifecycleTicket): Promise<void>; closed(ticket: LifecycleTicket): Promise<void> }
export class TicketInactivityService {
  constructor(private readonly repository: InactivityRepository, private readonly lifecycle: TicketLifecycleService, private readonly notifier: InactivityNotifier, private readonly policy: InactivityPolicy, private readonly systemActor: LifecycleActor = { id: 'slice-ticket-maintenance', staff: true, admin: true, eligible: true }) {}
  async scan(now = new Date()): Promise<{ warned: number; closed: number }> {
    if (!this.policy.enabled) return { warned: 0, closed: 0 };
    let warned = 0; let closed = 0;
    for (const candidate of await this.repository.listWarningCandidates(new Date(now.getTime() - this.policy.warningHours * 3_600_000), this.policy.batchSize)) { const current = await this.repository.get(candidate.id, candidate.guildId); if (!current || current.status !== 'WAITING_USER' || current.lastActivityAt > new Date(now.getTime() - this.policy.warningHours * 3_600_000)) continue; if (await this.repository.markWarning(current, now)) { await this.notifier.warn(current); warned++; } }
    for (const candidate of await this.repository.listCloseCandidates(new Date(now.getTime() - this.policy.closeHours * 3_600_000), this.policy.batchSize)) { const current = await this.repository.get(candidate.id, candidate.guildId); if (!current || current.status !== 'WAITING_USER' || !current.inactivityWarnedAt || current.inactivityWarnedAt > new Date(now.getTime() - this.policy.closeHours * 3_600_000)) continue; const result = await this.lifecycle.close(current.id, current.guildId, this.systemActor, { expectedStatus: 'WAITING_USER', reason: 'INACTIVITY' }); if (result.changed) { await this.notifier.closed(result.ticket); closed++; } }
    return { warned, closed };
  }
}
