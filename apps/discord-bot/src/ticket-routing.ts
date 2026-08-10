import { TicketLifecycleError, TicketLifecycleService, type LifecycleActor, type LifecycleTicket } from './ticket-lifecycle.js';
import type { TicketPriority } from './tickets.js';

export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const TICKET_ACTIONS = ['claim', 'waiting-user', 'waiting-staff', 'escalate', 'priority', 'transfer', 'resolve', 'close'] as const;
export type TicketAction = typeof TICKET_ACTIONS[number];
export type TicketRouteAction = Exclude<TicketAction, 'priority' | 'transfer' | 'resolve' | 'close'> | 'priority-submit' | 'transfer-submit' | 'resolve-confirm' | 'close-confirm';

export type TicketControl = { action: TicketAction | 'resolve-confirm' | 'close-confirm' | 'cancel'; ticketId: string };
export type TicketLookup = { get(id: string, guildId: string): Promise<LifecycleTicket | null>; findByChannel(guildId: string, channelId: string): Promise<LifecycleTicket | null> };
export type TicketAuthorization = { actor(ticket: LifecycleTicket, actorId: string): Promise<LifecycleActor>; target(ticket: LifecycleTicket, targetId: string): Promise<LifecycleActor> };
export type TicketRouteContext = { guildId: string | null; channelId: string | null; actorId: string; ticketId?: string };
export type TicketRouteResult = { ok: boolean; changed: boolean; message: string; ticket?: LifecycleTicket; escalationTarget?: string };

export function ticketControlId(action: TicketControl['action'], ticketId: string): string { return `slice:ticket:${action}:${ticketId}`; }
export function parseTicketControlId(customId: string): TicketControl | null {
  const match = /^slice:ticket:(claim|waiting-user|waiting-staff|escalate|priority|transfer|resolve|close|resolve-confirm|close-confirm|cancel):([A-Za-z0-9_-]+)$/.exec(customId);
  return match ? { action: match[1] as TicketControl['action'], ticketId: match[2] } : null;
}
export function isTicketPriority(value: string): value is TicketPriority { return (TICKET_PRIORITIES as readonly string[]).includes(value); }

export class TicketInteractionRouter {
  constructor(private readonly lifecycle: TicketLifecycleService, private readonly tickets: TicketLookup, private readonly authorization: TicketAuthorization) {}

  async authorize(context: TicketRouteContext): Promise<TicketRouteResult> {
    const ticket = await this.resolve(context);
    if (!ticket) return unavailable();
    const actor = await this.authorization.actor(ticket, context.actorId);
    if (!actor.staff) return forbidden();
    return { ok: true, changed: false, message: 'Ticket action is authorized.', ticket };
  }

  async execute(action: TicketRouteAction, context: TicketRouteContext, options: { priority?: string; targetId?: string } = {}): Promise<TicketRouteResult> {
    const authorized = await this.authorize(context);
    if (!authorized.ok || !authorized.ticket || !context.guildId || !context.ticketId) return authorized;
    const actor = await this.authorization.actor(authorized.ticket, context.actorId);
    try {
      let result: { changed: boolean; ticket: LifecycleTicket };
      let escalationTarget: string | undefined;
      switch (action) {
        case 'claim': result = await this.lifecycle.claim(context.ticketId, context.guildId, actor); break;
        case 'waiting-user': result = await this.lifecycle.status(context.ticketId, context.guildId, actor, 'WAITING_USER'); break;
        case 'waiting-staff': result = await this.lifecycle.status(context.ticketId, context.guildId, actor, 'WAITING_STAFF'); break;
        case 'priority-submit':
          if (!options.priority || !isTicketPriority(options.priority)) return { ok: false, changed: false, message: 'Choose a listed ticket priority.' };
          result = await this.lifecycle.priority(context.ticketId, context.guildId, actor, options.priority);
          break;
        case 'transfer-submit':
          if (!options.targetId) return { ok: false, changed: false, message: 'Choose an eligible staff member.' };
          result = await this.lifecycle.transfer(context.ticketId, context.guildId, actor, await this.authorization.target(authorized.ticket, options.targetId));
          break;
        case 'escalate': {
          const escalation = await this.lifecycle.escalate(context.ticketId, context.guildId, actor);
          result = escalation;
          escalationTarget = escalation.target;
          break;
        }
        case 'resolve-confirm': result = await this.lifecycle.resolve(context.ticketId, context.guildId, actor); break;
        case 'close-confirm': result = await this.lifecycle.close(context.ticketId, context.guildId, actor); break;
      }
      const ticket = await this.tickets.get(context.ticketId, context.guildId);
      if (!ticket || ticket.channelId !== context.channelId) return unavailable();
      return { ok: true, changed: result.changed, message: result.changed ? 'Ticket updated.' : 'No ticket change was needed.', ticket, escalationTarget };
    } catch (error) {
      if (error instanceof TicketLifecycleError) return { ok: false, changed: false, message: 'This ticket action is no longer available. Refresh and try again.' };
      throw error;
    }
  }

  async executeForChannel(action: TicketRouteAction, context: Omit<TicketRouteContext, 'ticketId'>, options: { priority?: string; targetId?: string } = {}): Promise<TicketRouteResult> {
    if (!context.guildId || !context.channelId) return unavailable();
    const ticket = await this.tickets.findByChannel(context.guildId, context.channelId);
    return ticket ? this.execute(action, { ...context, ticketId: ticket.id }, options) : unavailable();
  }

  private async resolve(context: TicketRouteContext): Promise<LifecycleTicket | null> {
    if (!context.guildId || !context.channelId || !context.ticketId) return null;
    const ticket = await this.tickets.get(context.ticketId, context.guildId);
    return ticket?.channelId === context.channelId ? ticket : null;
  }
}

const unavailable = (): TicketRouteResult => ({ ok: false, changed: false, message: 'This ticket control is unavailable.' });
const forbidden = (): TicketRouteResult => ({ ok: false, changed: false, message: 'You are not authorized to manage this ticket.' });
