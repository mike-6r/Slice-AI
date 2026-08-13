import { PermissionFlagsBits, type Guild } from 'discord.js';
import type { SetupRepository } from './persistence/setup-repository.js';
import type { TicketAuthorization } from './ticket-routing.js';
import type { LifecycleActor, LifecycleTicket } from './ticket-lifecycle.js';
import { staffRolesForCategory } from './tickets.js';
import { ROLE_DEFINITIONS } from './setup/manifest.js';

const STAFF_ROLE_KEYS = ROLE_DEFINITIONS.filter((role) => role.staff).map((role) => role.key);

export function createDiscordTicketAuthorization(guild: Guild, repository: SetupRepository): TicketAuthorization {
  const resolve = async (ticket: LifecycleTicket, userId: string): Promise<LifecycleActor> => {
    const member = await guild.members.fetch(userId);
    const roleIds = new Set(member.roles.cache.keys());
    const heldKeys = new Set<string>();
    for (const key of STAFF_ROLE_KEYS) {
      const resource = await repository.getResource(ticket.guildId, 'ROLE', key);
      if (resource && roleIds.has(resource.discordId)) heldKeys.add(key);
    }
    const admin = member.permissions.has(PermissionFlagsBits.Administrator) || heldKeys.has('owner') || heldKeys.has('administrator');
    const staff = admin || heldKeys.size > 0;
    const eligible = admin || staffRolesForCategory(ticket.category).some((key) => heldKeys.has(key));
    return { id: userId, staff, admin, eligible, owner: ticket.creatorId === userId };
  };
  return { actor: resolve, target: resolve };
}
