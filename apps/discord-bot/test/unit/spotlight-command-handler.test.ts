import { describe, expect, it } from 'vitest';
import { handleSpotlightCommand } from '../../src/spotlight-command-handler.js';

const interaction = (sub: string, options: Record<string, string> = {}, manager = false) => {
  const replies: unknown[] = [];
  return { replies, value: { guildId: 'guild-1', guild: {}, user: { id: 'discord-owner' }, memberPermissions: { has: () => manager }, options: { getSubcommand: () => sub, getString: (key: string, required?: boolean) => options[key] ?? (required ? 'missing' : null), getChannel: () => ({ id: 'channel-1' }) }, reply: async (payload: unknown) => { replies.push(payload); } } };
};

describe('Spotlight public-data guardrails', () => {
  it('blocks a Collector request when the authoritative projection is no longer public', async () => {
    const target = interaction('collector', { collector: 'private-collector' });
    await handleSpotlightCommand(target.value as never, { cooldown: async () => false } as never, { collectorSpotlightEligibility: async () => ({ ok: true, value: { eligible: false } }) } as never, {} as never, {} as never);
    expect(target.replies).toHaveLength(1);
  });

  it('requires staff permission before a Featured Collectible request can be created', async () => {
    const target = interaction('collectible', { asset: 'public-asset' });
    await handleSpotlightCommand(target.value as never, {} as never, {} as never, {} as never, {} as never);
    expect(target.replies).toHaveLength(1);
  });
});
