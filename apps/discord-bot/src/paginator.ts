import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { SliceEmbed } from './embeds/slice-embed.js';

type PageSession = { ownerId: string; pages: EmbedBuilder[]; index: number; expiresAt: number };

/** Shared, owner-scoped paginator for public read-only command results. */
export class DiscordPaginator {
  private readonly sessions = new Map<string, PageSession>();
  create(ownerId: string, pages: EmbedBuilder[]) {
    const id = randomUUID();
    this.sessions.set(id, { ownerId, pages, index: 0, expiresAt: Date.now() + 15 * 60_000 });
    return this.payload(id, this.sessions.get(id)!);
  }
  async handle(interaction: ButtonInteraction): Promise<boolean> {
    if (!interaction.customId.startsWith('slice:page:')) return false;
    const [, , id, direction] = interaction.customId.split(':');
    const session = id ? this.sessions.get(id) : undefined;
    if (!session || session.expiresAt <= Date.now()) { if (id) this.sessions.delete(id); await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('Results expired', 'Run the command again to browse fresh results.')] }); return true; }
    if (session.ownerId !== interaction.user.id) { await interaction.reply({ ephemeral: true, embeds: [SliceEmbed.warning('These results belong to another member', 'Run the command yourself to browse its results.')] }); return true; }
    session.index = Math.min(Math.max(session.index + (direction === 'next' ? 1 : -1), 0), session.pages.length - 1);
    await interaction.update(this.payload(id!, session));
    return true;
  }
  private payload(id: string, session: PageSession) {
    const page = session.pages[session.index]!;
    const label = `Page ${session.index + 1}/${session.pages.length}`;
    const previous = new ButtonBuilder().setCustomId(`slice:page:${id}:previous`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(session.index === 0);
    const next = new ButtonBuilder().setCustomId(`slice:page:${id}:next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(session.index >= session.pages.length - 1);
    const indicator = new ButtonBuilder().setCustomId(`slice:page:${id}:current`).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(true);
    return { embeds: [page], components: session.pages.length > 1 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(previous, indicator, next)] : [] };
  }
}
