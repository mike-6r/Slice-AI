import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { handleCommunityCommand } from '../../src/commands/community.js';
import { handleProgressionCommand } from '../../src/commands/progression.js';
import type { PrismaCommunityRepository } from '../../src/persistence/community-repository.js';
import type { MemberProgressionService } from '../../src/progression.js';

const config = { SUGGESTIONS_ENABLED: true, SUGGESTIONS_CHANNEL_LOGICAL_KEY: 'suggestions', POLLS_ENABLED: true, POLL_MAX_OPTIONS: 5, BIRTHDAYS_ENABLED: true };

function communityInteraction(commandName: 'suggestion' | 'poll', permitted: boolean) {
  const reply = vi.fn(async () => undefined);
  return { commandName, guildId: 'guild-a', user: { id: 'member-a' }, memberPermissions: { has: (permission: bigint) => permitted && permission === PermissionFlagsBits.ManageGuild }, options: { getInteger: vi.fn(), getString: vi.fn(), getSubcommand: vi.fn() }, reply } as unknown as ChatInputCommandInteraction & { reply: typeof reply };
}

describe('community command authorization', () => {
  it.each(['suggestion', 'poll'] as const)('rejects a community member invoking /%s management', async (commandName) => {
    const interaction = communityInteraction(commandName, false);
    const repository = { suggestionByReference: vi.fn(), createPoll: vi.fn() } as unknown as PrismaCommunityRepository;

    await handleCommunityCommand(interaction, repository, config, vi.fn(), vi.fn(), vi.fn());

    expect(interaction.reply).toHaveBeenCalledOnce();
    expect(repository.suggestionByReference).not.toHaveBeenCalled();
    expect(repository.createPoll).not.toHaveBeenCalled();
  });
});

describe('reputation target scope', () => {
  it('rejects a resolved Discord user who is not a member of the invoking guild', async () => {
    const reply = vi.fn(async () => undefined);
    const giveReputation = vi.fn();
    const interaction = {
      commandName: 'rep', guildId: 'guild-a', user: { id: 'giver', username: 'giver' }, guild: { members: { fetch: vi.fn(async () => { throw new Error('Unknown Member'); }) } },
      options: { getUser: vi.fn(() => ({ id: 'external-user', bot: false, username: 'external' })), getString: vi.fn() }, reply,
    } as unknown as ChatInputCommandInteraction;

    await handleProgressionCommand(interaction, { giveReputation } as unknown as MemberProgressionService);

    expect(giveReputation).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledOnce();
  });
});
