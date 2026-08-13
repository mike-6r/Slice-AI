import { createHash, randomUUID } from 'node:crypto';
import {
  TICKET_CATEGORIES,
  sanitizeTicketText,
  staffRolesForCategory,
  type TicketPriority,
} from './tickets.js';

export type TicketInput = {
  guildId: string;
  creatorDiscordId: string;
  category: string;
  subject: string;
  description: string;
  referenceId?: string;
  requestedUrgency?: string;
};
export type CreatedTicket = {
  id: string;
  guildId: string;
  channelId: string;
  channelName: string;
  category: string;
  subject: string;
  safeSummary: string;
  priority: TicketPriority;
  createdAt: Date;
};
export type PersistedTicket = CreatedTicket & {
  creatorDiscordId: string;
  referenceId?: string;
};
export type PermissionEntry = {
  id: string;
  allow?: readonly string[];
  deny?: readonly string[];
};
export interface TicketChannel {
  id: string;
  name: string;
  sendOpening(ticket: CreatedTicket): Promise<void>;
  delete(reason: string): Promise<void>;
}
export interface TicketDiscordBoundary {
  createPrivateChannel(input: {
    name: string;
    creatorId: string;
    permissions: PermissionEntry[];
  }): Promise<TicketChannel>;
}
export interface TicketRepository {
  findActive(guildId: string, creatorDiscordId: string): Promise<CreatedTicket[]>;
  create(ticket: PersistedTicket): Promise<void>;
  attachChannel(ticketId: string, guildId: string, channelId: string): Promise<boolean>;
  markProvisioningFailure(ticketId: string, reason: string): Promise<void>;
}
export interface TicketRoleResolver {
  getRoleId(guildId: string, logicalKey: string): Promise<string | null>;
}
export class TicketCreationError extends Error {}

export class TicketCreationService {
  constructor(
    private readonly repository: TicketRepository,
    private readonly discord: TicketDiscordBoundary,
    private readonly roles: TicketRoleResolver,
    private readonly maxActive = 3,
  ) {}

  async create(input: TicketInput): Promise<CreatedTicket> {
    validate(input);
    const existing = await this.repository.findActive(
      input.guildId,
      input.creatorDiscordId,
    );
    const same = existing.find((ticket) => ticket.category === input.category);
    if (same) {
      const destination = same.channelId
        ? `: <#${same.channelId}>`
        : '. Support is still preparing it; please do not open another.';
      throw new TicketCreationError(
        `An active ticket for this category already exists${destination}`,
      );
    }
    if (existing.length >= this.maxActive)
      throw new TicketCreationError(
        `You already have the maximum of ${this.maxActive} active tickets.`,
      );

    const id = randomUUID();
    const persisted: PersistedTicket = {
      id,
      guildId: input.guildId,
      channelId: '',
      channelName: `ticket-${id.replace(/-/g, '').slice(0, 6)}`,
      category: input.category,
      subject: sanitizeTicketText(input.subject),
      safeSummary: sanitizeTicketText(input.description),
      priority: priority(input.requestedUrgency),
      createdAt: new Date(),
      creatorDiscordId: input.creatorDiscordId,
      referenceId: input.referenceId
        ? sanitizeTicketText(input.referenceId)
        : undefined,
    };

    // Persist before Discord provisioning. A Discord outage therefore preserves
    // the support request rather than leaving an orphan channel as its authority.
    await this.repository.create(persisted);
    let channel: TicketChannel;
    try {
      channel = await this.discord.createPrivateChannel({
        name: persisted.channelName,
        creatorId: persisted.creatorDiscordId,
        permissions: await permissionMatrix(
          persisted.guildId,
          persisted.creatorDiscordId,
          persisted.category,
          this.roles,
        ),
      });
    } catch (error) {
      await this.repository.markProvisioningFailure(
        persisted.id,
        provisioningReason(error),
      );
      throw new TicketCreationError(
        "We couldn't open your support ticket right now. Please try again.",
      );
    }

    const attached = await this.repository.attachChannel(
      persisted.id,
      persisted.guildId,
      channel.id,
    );
    if (!attached) {
      await channel.delete('Slice ticket provisioning was superseded').catch(() => undefined);
      throw new TicketCreationError(
        'This support request is already being prepared. Please check My Tickets.',
      );
    }
    const ticket = { ...persisted, channelId: channel.id };
    try {
      await channel.sendOpening(ticket);
    } catch (error) {
      await this.repository.markProvisioningFailure(
        persisted.id,
        provisioningReason(error),
      );
      throw new TicketCreationError(
        "Your ticket was saved, but Discord couldn't finish preparing it. A staff member can recover it safely.",
      );
    }
    return ticket;
  }
}

export async function permissionMatrix(
  guildId: string,
  creatorId: string,
  category: string,
  roles: TicketRoleResolver,
): Promise<PermissionEntry[]> {
  const entries: PermissionEntry[] = [
    { id: 'everyone', deny: ['ViewChannel'] },
    {
      id: creatorId,
      allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'],
    },
  ];
  for (const key of staffRolesForCategory(category)) {
    const id = await roles.getRoleId(guildId, key);
    if (id)
      entries.push({
        id,
        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
      });
  }
  return entries;
}

function validate(input: TicketInput): void {
  if (!TICKET_CATEGORIES.includes(input.category as (typeof TICKET_CATEGORIES)[number]))
    throw new TicketCreationError('Invalid ticket category.');
  if (!input.subject.trim() || input.subject.length > 120)
    throw new TicketCreationError('Subject must be between 1 and 120 characters.');
  if (!input.description.trim() || input.description.length > 1800)
    throw new TicketCreationError('Description must be between 1 and 1800 characters.');
  if (input.referenceId && input.referenceId.length > 120)
    throw new TicketCreationError('Reference ID is too long.');
  if (
    input.requestedUrgency &&
    !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(
      input.requestedUrgency.toUpperCase(),
    )
  )
    throw new TicketCreationError('Invalid requested urgency.');
}

function priority(value?: string): TicketPriority {
  return value?.toUpperCase() === 'URGENT'
    ? 'HIGH'
    : value?.toUpperCase() === 'HIGH'
      ? 'NORMAL'
      : 'NORMAL';
}

function provisioningReason(error: unknown): string {
  return error instanceof Error ? error.name : 'Discord provisioning unavailable';
}

export function ticketChecksum(ticket: CreatedTicket): string {
  return createHash('sha256')
    .update(`${ticket.id}:${ticket.channelId}:${ticket.createdAt.toISOString()}`)
    .digest('hex');
}

export class InMemoryTicketRepository implements TicketRepository {
  readonly tickets = new Map<string, PersistedTicket>();
  events: string[] = [];
  async findActive(guildId: string, creatorDiscordId: string): Promise<CreatedTicket[]> {
    return [...this.tickets.values()]
      .filter(
        (ticket) =>
          ticket.guildId === guildId && ticket.creatorDiscordId === creatorDiscordId,
      )
      .map((ticket) => ({ id: ticket.id, guildId: ticket.guildId, channelId: ticket.channelId, channelName: ticket.channelName, category: ticket.category, subject: ticket.subject, safeSummary: ticket.safeSummary, priority: ticket.priority, createdAt: ticket.createdAt }));
  }
  async create(ticket: PersistedTicket): Promise<void> {
    this.tickets.set(ticket.id, ticket);
    this.events.push(`CREATED:${ticket.id}`);
  }
  async attachChannel(ticketId: string, guildId: string, channelId: string): Promise<boolean> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.guildId !== guildId || ticket.channelId) return false;
    this.tickets.set(ticketId, { ...ticket, channelId });
    this.events.push(`DISCORD_PROVISIONED:${ticketId}`);
    return true;
  }
  async markProvisioningFailure(ticketId: string): Promise<void> {
    this.events.push(`DISCORD_PROVISIONING_FAILED:${ticketId}`);
  }
}
