import { randomInt } from 'node:crypto';

export const GIVEAWAY_SYSTEM_ACTOR = 'system:giveaway-worker';
export const MAX_GIVEAWAY_WINNERS = 20;
export const MIN_GIVEAWAY_DURATION_MS = 60_000;
export const MAX_GIVEAWAY_DURATION_MS = 30 * 24 * 60 * 60_000;

export class GiveawayValidationError extends Error {}

/** Accepts compact community-friendly durations such as 10m, 2h, or 3d. */
export function parseGiveawayDuration(input: string): number {
  const match = /^\s*(\d{1,4})\s*([mhd])\s*$/i.exec(input);
  if (!match) throw new GiveawayValidationError('Use a duration such as 10m, 2h, or 3d.');
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  const duration = amount * multiplier;
  if (!Number.isSafeInteger(duration) || duration < MIN_GIVEAWAY_DURATION_MS || duration > MAX_GIVEAWAY_DURATION_MS) throw new GiveawayValidationError('Giveaway duration must be between 1 minute and 30 days.');
  return duration;
}

/**
 * Partial Fisher-Yates shuffle backed by cryptographic randomInt. Input order
 * has no meaning: every unique entrant has the same chance of selection.
 */
export function selectGiveawayWinners(entrantIds: readonly string[], requested: number, nextInt: (maxExclusive: number) => number = randomInt): string[] {
  const entrants = [...new Set(entrantIds)];
  if (!Number.isInteger(requested) || requested < 1) throw new GiveawayValidationError('Winner count must be at least one.');
  if (requested > entrants.length) throw new GiveawayValidationError('Winner count cannot exceed eligible entrants.');
  for (let index = 0; index < requested; index++) {
    const selected = index + nextInt(entrants.length - index);
    [entrants[index], entrants[selected]] = [entrants[selected]!, entrants[index]!];
  }
  return entrants.slice(0, requested);
}
