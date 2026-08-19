import { describe, expect, it } from 'vitest';
import { DEFAULT_TICKET_FORMS, INTAKE_SAFETY_WARNING, normalizedForm, validateAnswers, validateForm } from '../../src/advanced-ticket-forms.js';
import { TicketSlaService, type SlaTicket } from '../../src/ticket-sla.js';

describe('advanced ticket intake forms', () => {
  it('ships category-specific safe default forms', () => {
    for (const category of ['account-issues', 'investment-issues', 'withdrawal', 'deposit', 'report-user', 'partnership', 'general-support']) expect(DEFAULT_TICKET_FORMS[category]).toBeTruthy();
    expect(INTAKE_SAFETY_WARNING).toContain('passwords');
  });
  it('validates required, optional, select, boolean, and disabled fields', () => {
    const fields = [{ key: 'short', label: 'Short', type: 'SHORT_TEXT' as const, required: true, minLength: 2, maxLength: 5, order: 2, enabled: true }, { key: 'select', label: 'Select', type: 'SELECT' as const, required: true, options: ['One', 'Two'], order: 1, enabled: true }, { key: 'bool', label: 'Boolean', type: 'BOOLEAN' as const, required: true, order: 3, enabled: true }, { key: 'hidden', label: 'Hidden', type: 'LONG_TEXT' as const, required: true, order: 4, enabled: false }];
    expect(normalizedForm(fields).map((field) => field.key)).toEqual(['select', 'short', 'bool']);
    expect(validateAnswers(fields, { select: 'Bad', short: 'x', bool: 'yes' }).errors).toHaveLength(3);
    const accepted = validateAnswers(fields, { select: 'One', short: 'okay', bool: 'true' }); expect(accepted.errors).toEqual([]); expect(accepted.answers).toHaveLength(3);
  });
  it('bounds form configuration and preserves distinct stable keys', () => {
    expect(validateForm([])).toContain('A form must contain 1 to 20 fields.');
    expect(validateForm([{ key: 'invalid key', label: '', type: 'SHORT_TEXT', required: true, order: 1, enabled: true }])).not.toEqual([]);
  });
});

describe('ticket SLA scanning', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const ticket = (overrides: Partial<SlaTicket> = {}): SlaTicket => ({ id: 'ticket-1', guildId: 'guild-1', creatorDiscordId: 'member-1', category: 'general-support', createdAt: new Date('2026-08-19T08:00:00.000Z'), firstStaffResponseAt: null, firstResponseDueAt: new Date('2026-08-19T12:00:00.000Z'), resolutionDueAt: new Date('2026-08-20T08:00:00.000Z'), ...overrides });
  it('calculates at-risk and breach states without treating bots as a response', () => {
    const service = new TicketSlaService({ listSlaAlertCandidates: async () => [], markSlaAlert: async () => true }, { alert: async () => {} });
    expect(service.alertsFor(ticket(), new Date('2026-08-19T11:30:00.000Z'))).toContain('FIRST_RESPONSE_RISK');
    expect(service.alertsFor(ticket(), now)).toContain('FIRST_RESPONSE_BREACH');
    expect(service.alertsFor(ticket({ firstStaffResponseAt: now }), now)).not.toContain('FIRST_RESPONSE_BREACH');
  });
  it('claims alert markers before delivery so repeated scans do not alert twice', async () => {
    let claimed = false; const sent: string[] = []; const service = new TicketSlaService({ listSlaAlertCandidates: async () => [ticket()], markSlaAlert: async () => { if (claimed) return false; claimed = true; return true; } }, { alert: async (_ticket, kind) => { sent.push(kind); } });
    await service.scan(now); await service.scan(now); expect(sent).toEqual(['FIRST_RESPONSE_BREACH']);
  });
});
