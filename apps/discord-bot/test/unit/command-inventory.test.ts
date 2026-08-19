import { describe, expect, it } from 'vitest';
import { discordCommandInventory } from '../../src/command-inventory.js';

describe('Discord command inventory', () => {
  it('keeps runtime and deployment registration sourced from one complete inventory', () => {
    const names = discordCommandInventory.map((command) => command.toJSON().name);
    expect(names).toEqual(expect.arrayContaining(['slice', 'warn', 'note', 'timeout', 'untimeout', 'ban', 'unban', 'modcase', 'modhistory', 'ops', 'ticket', 'tickets', 'ticket-config', 'analytics', 'asset', 'market', 'collector', 'vault', 'giveaway', 'meme', 'embed', 'schedule', 'spotlight']));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(64);
    for (const command of discordCommandInventory.map((entry) => entry.toJSON())) {
      for (const subcommand of command.options?.filter((option) => option.type === 1) ?? []) {
        const required = subcommand.options?.filter((option) => option.required) ?? [];
        const optional = subcommand.options?.filter((option) => !option.required) ?? [];
        expect(subcommand.options).toEqual([...required, ...optional]);
      }
    }
  });
});
