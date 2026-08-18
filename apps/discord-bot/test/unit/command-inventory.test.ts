import { describe, expect, it } from 'vitest';
import { discordCommandInventory } from '../../src/command-inventory.js';

describe('Discord command inventory', () => {
  it('keeps runtime and deployment registration sourced from one complete inventory', () => {
    const names = discordCommandInventory.map((command) => command.toJSON().name);
    expect(names).toEqual(expect.arrayContaining(['slice', 'warn', 'note', 'timeout', 'untimeout', 'ban', 'unban', 'modcase', 'modhistory', 'ops', 'asset', 'market', 'collector', 'vault', 'giveaway']));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(57);
  });
});
