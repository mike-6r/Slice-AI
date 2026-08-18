import { randomInt } from 'node:crypto';

export const MEME_COMPETITION_SYSTEM_ACTOR = 'system:meme-competition';
export const WEEKLY_MEME_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export class MemeCompetitionValidationError extends Error {}

export type MemeMediaMessage = {
  content?: string;
  attachments: { values(): IterableIterator<{ contentType?: string | null; name?: string | null; url?: string | null }> };
  embeds?: Iterable<{ image?: { url?: string | null } | null; thumbnail?: { url?: string | null } | null; video?: { url?: string | null } | null }>;
};

export type MemeVoteReaction = {
  emoji: { name?: string | null; id?: string | null };
  voters: Iterable<{ id: string; bot: boolean }>;
};

export type MemeVoteTally = { submissionId: string; valid: boolean; voteCount: number; invalidReason?: string };
export type MemeCandidate = { submissionId: string; discordUserId: string; voteCount: number };

const imageExtension = /\.(?:apng|avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;

export function hasMemeMedia(message: MemeMediaMessage): boolean {
  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith('image/') || imageExtension.test(attachment.name ?? '') || imageExtension.test(attachment.url ?? '')) return true;
  }
  for (const embed of message.embeds ?? []) {
    if ([embed.image?.url, embed.thumbnail?.url, embed.video?.url].some((url) => Boolean(url && imageExtension.test(url)))) return true;
  }
  return imageExtension.test(message.content ?? '');
}

export function explicitReactionVotes(reactions: Iterable<MemeVoteReaction>, voteEmoji: string, submissionOwnerId: string): number {
  const reaction = [...reactions].find((candidate) => reactionKey(candidate.emoji) === voteEmoji || candidate.emoji.name === voteEmoji);
  if (!reaction) return 0;
  return new Set([...reaction.voters].filter((user) => !user.bot && user.id !== submissionOwnerId).map((user) => user.id)).size;
}

export function selectMemeWinner(candidates: readonly MemeCandidate[], choose: (maxExclusive: number) => number = randomInt): MemeCandidate | null {
  const valid = candidates.filter((candidate) => Number.isSafeInteger(candidate.voteCount) && candidate.voteCount >= 0);
  if (!valid.length) return null;
  const high = Math.max(...valid.map((candidate) => candidate.voteCount));
  const tied = valid.filter((candidate) => candidate.voteCount === high).sort((left, right) => left.submissionId.localeCompare(right.submissionId));
  return tied[choose(tied.length)] ?? null;
}

export function reactionKey(emoji: { name?: string | null; id?: string | null }): string {
  return emoji.id && emoji.name ? `${emoji.name}:${emoji.id}` : emoji.name ?? '';
}
