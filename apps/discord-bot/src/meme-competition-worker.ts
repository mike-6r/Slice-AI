import { type Client } from 'discord.js';
import { memeCompetitionPayload } from './commands/meme.js';
import { explicitReactionVotes, hasMemeMedia, MEME_COMPETITION_SYSTEM_ACTOR, type MemeVoteTally } from './meme-competition.js';
import { type MemeCompetition, type MemeCompletion, PrismaMemeCompetitionRepository } from './persistence/meme-competition-repository.js';

export async function resolveMemeCompetition(client: Client, repository: PrismaMemeCompetitionRepository, competition: MemeCompetition, actorDiscordId: string, automatic: boolean, voteEmoji: string): Promise<MemeCompletion | null> {
  const claimed = await repository.claimClose(competition.id, competition.guildId, automatic);
  if (!claimed) return null;
  const tallies = await tallyMemeVotes(client, claimed, voteEmoji);
  return repository.finalize(claimed.id, claimed.guildId, actorDiscordId, automatic, tallies);
}

export async function tallyMemeVotes(client: Client, competition: MemeCompetition, voteEmoji: string): Promise<MemeVoteTally[]> {
  const guild = await client.guilds.fetch(competition.guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(competition.channelId).catch(() => null) : null;
  if (!channel?.isTextBased() || !('messages' in channel)) return competition.submissions.map((submission) => ({ submissionId: submission.id, valid: false, voteCount: 0, invalidReason: 'Competition channel unavailable at close' }));
  return Promise.all(competition.submissions.map(async (submission) => {
    const message = await channel.messages.fetch(submission.messageId).catch(() => null);
    if (!message || message.author.bot || message.author.id !== submission.discordUserId || !hasMemeMedia(message)) return { submissionId: submission.id, valid: false, voteCount: 0, invalidReason: 'Submission message is deleted or no longer valid media' };
    const reaction = [...message.reactions.cache.values()].find((candidate) => candidate.emoji.name === voteEmoji || `${candidate.emoji.name ?? ''}:${candidate.emoji.id ?? ''}` === voteEmoji);
    const voters = reaction ? await reactionVoters(reaction) : null;
    return { submissionId: submission.id, valid: true, voteCount: reaction && voters ? explicitReactionVotes([{ emoji: reaction.emoji, voters }], voteEmoji, submission.discordUserId) : 0 };
  }));
}

async function reactionVoters(reaction: { users: { fetch(options: { limit: number; after?: string }): Promise<{ size: number; values(): IterableIterator<{ id: string; bot: boolean }>; lastKey(): string | undefined }> } }): Promise<Array<{ id: string; bot: boolean }> | null> {
  const voters: Array<{ id: string; bot: boolean }> = [];
  let after: string | undefined;
  while (true) {
    const page = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) }).catch(() => null);
    if (!page) return null;
    voters.push(...page.values());
    const next = page.lastKey();
    if (page.size < 100 || !next || next === after) return voters;
    after = next;
  }
}

export async function publishMemeOpening(client: Client, repository: PrismaMemeCompetitionRepository, competition: MemeCompetition, voteEmoji: string): Promise<boolean> {
  if (competition.announcementMessageId) return true;
  const guild = await client.guilds.fetch(competition.guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(competition.channelId).catch(() => null) : null;
  if (!channel?.isTextBased() || !('send' in channel)) return false;
  const message = await channel.send(memeCompetitionPayload(competition, voteEmoji));
  await repository.attachAnnouncementMessage(competition.id, message.id);
  return true;
}

export async function publishMemeResult(client: Client, repository: PrismaMemeCompetitionRepository, competition: MemeCompetition, voteEmoji: string): Promise<boolean> {
  if (!(await repository.claimResultAnnouncement(competition.id))) return false;
  try {
    const current = await repository.get(competition.id, competition.guildId);
    if (!current) throw new Error('Competition unavailable');
    const guild = await client.guilds.fetch(current.guildId).catch(() => null);
    const channel = guild ? await guild.channels.fetch(current.channelId).catch(() => null) : null;
    if (!channel?.isTextBased() || !('send' in channel)) throw new Error('Competition channel unavailable');
    const payload = memeCompetitionPayload(current, voteEmoji, 'result');
    const message = current.announcementMessageId && 'messages' in channel ? await channel.messages.fetch(current.announcementMessageId).catch(() => null) : null;
    if (message) await message.edit(payload);
    else {
      const posted = await channel.send(payload);
      await repository.attachAnnouncementMessage(current.id, posted.id);
    }
    await repository.finishResultAnnouncement(current.id);
    return true;
  } catch {
    await repository.releaseResultAnnouncement(competition.id);
    return false;
  }
}

export async function processDueMemeCompetitions(repository: Pick<PrismaMemeCompetitionRepository, 'due' | 'pendingResultAnnouncements'>, close: (competition: MemeCompetition) => Promise<MemeCompletion | null>, publish: (competition: MemeCompetition) => Promise<boolean>): Promise<{ scanned: number; closed: number; published: number }> {
  const due = await repository.due();
  let closed = 0;
  let published = 0;
  const handled = new Set<string>();
  for (const competition of due) {
    const result = await close(competition);
    if (!result?.closedNow) continue;
    closed += 1;
    handled.add(result.competition.id);
    if (await publish(result.competition)) published += 1;
  }
  for (const competition of await repository.pendingResultAnnouncements()) if (!handled.has(competition.id) && await publish(competition)) published += 1;
  return { scanned: due.length, closed, published };
}

export { MEME_COMPETITION_SYSTEM_ACTOR };
