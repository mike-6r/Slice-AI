import { describe, expect, it } from 'vitest';
import { SliceEmbed } from '../../src/embeds/slice-embed.js';
import { DiscordPaginator } from '../../src/paginator.js';

describe('DiscordPaginator', () => {
  it('uses owner-scoped controls and disables pagination at the first page', () => {
    const paginator = new DiscordPaginator();
    const payload = paginator.create('owner', [SliceEmbed.info('One', 'First'), SliceEmbed.info('Two', 'Second')]);
    const row = payload.components[0]?.toJSON();
    expect(row?.components.map((component) => component.disabled)).toEqual([true, true, false]);
    expect(row?.components[0]?.custom_id).toMatch(/^slice:page:[\w-]+:previous$/);
    expect(row?.components[2]?.custom_id).toMatch(/^slice:page:[\w-]+:next$/);
  });

  it('does not let another Discord member turn someone else’s page', async () => {
    const paginator = new DiscordPaginator();
    const payload = paginator.create('owner', [SliceEmbed.info('One', 'First'), SliceEmbed.info('Two', 'Second')]);
    const next = payload.components[0]!.toJSON().components[2]!.custom_id!;
    const reply = async () => undefined;
    const interaction = { customId: next, user: { id: 'other' }, reply, update: async () => undefined };
    await expect(paginator.handle(interaction as never)).resolves.toBe(true);
  });
});
