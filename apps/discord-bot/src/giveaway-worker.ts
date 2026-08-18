import type { Giveaway, GiveawayCompletion } from './persistence/giveaway-repository.js';
import { GIVEAWAY_SYSTEM_ACTOR } from './giveaways.js';

export type GiveawaySchedulerRepository = {
  due(limit?: number): Promise<Giveaway[]>;
  pendingCompletionAnnouncements(limit?: number): Promise<Giveaway[]>;
  complete(id: string, guildId: string, actorDiscordId: string, automatic: boolean): Promise<GiveawayCompletion | null>;
};

/** Processes only due durable state. Discord-native relative timestamps remove any need for countdown-edit spam. */
export async function processDueGiveaways(repository: GiveawaySchedulerRepository, publishCompletion: (giveaway: Giveaway) => Promise<boolean>): Promise<{ scanned: number; completed: number; published: number }> {
  const due = await repository.due();
  let completed = 0;
  let published = 0;
  const completedIds = new Set<string>();
  for (const giveaway of due) {
    const result = await repository.complete(giveaway.id, giveaway.guildId, GIVEAWAY_SYSTEM_ACTOR, true);
    if (!result?.completedNow) continue;
    completed++;
    completedIds.add(result.giveaway.id);
    if (await publishCompletion(result.giveaway)) published++;
  }
  for (const giveaway of await repository.pendingCompletionAnnouncements()) if (!completedIds.has(giveaway.id) && await publishCompletion(giveaway)) published++;
  return { scanned: due.length, completed, published };
}
