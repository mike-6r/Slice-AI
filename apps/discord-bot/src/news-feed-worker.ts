import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import type { BotConfig } from './config.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import { approvedNewsSources, candidateFrom, parseFeed, SafeNewsFeedClient, type NewsSource } from './news-feed.js';
import { PrismaNewsRepository, type PendingNewsDelivery } from './persistence/news-repository.js';
import type { SetupRepository } from './persistence/setup-repository.js';

export class NewsFeedWorker {
  private running = false;
  constructor(private readonly feeds: SafeNewsFeedClient, private readonly repository: PrismaNewsRepository, private readonly setup: SetupRepository, private readonly discord: Client, private readonly config: Pick<BotConfig, 'NEWS_FEED_ENABLED' | 'NEWS_FEED_CONCURRENCY' | 'NEWS_FEED_BOOTSTRAP_HOURS' | 'NEWS_FEED_MENTION_OPT_IN_ROLE'>, private readonly report: (event: string, fields: Record<string, unknown>) => void) {}
  async scan(now = new Date()): Promise<void> {
    if (!this.config.NEWS_FEED_ENABLED || this.running) return; this.running = true;
    try {
      const sources = approvedNewsSources().filter((source) => source.enabled);
      await bounded(sources, this.config.NEWS_FEED_CONCURRENCY, (source) => this.pollSource(source, now));
      await bounded(await this.repository.pendingDeliveries(50), this.config.NEWS_FEED_CONCURRENCY, (delivery) => this.deliver(delivery));
    } catch { this.report('news_feed.scan_failed', { category: 'PERSISTENCE_UNAVAILABLE' }); }
    finally { this.running = false; }
  }
  private async pollSource(source: NewsSource, now: Date): Promise<void> {
    try {
      const state = await this.repository.sourceState(source.id); if (state.nextPollAt && state.nextPollAt > now) return;
      const fetched = await this.feeds.fetch(source, state);
      if (fetched.retryAfterMs) { await this.repository.sourceFailure(source.id, fetched.retryAfterMs); return void this.report('news_feed.source_backoff', { sourceId: source.id, category: 'RATE_LIMITED' }); }
      if (fetched.kind === 'NOT_MODIFIED') return void await this.repository.sourceSuccess(source.id, fetched);
      const minimum = new Date(now.getTime() - this.config.NEWS_FEED_BOOTSTRAP_HOURS * 3_600_000);
      for (const item of parseFeed(fetched.xml ?? '')) { const candidate = candidateFrom(source, item); if (!candidate || candidate.publishedAt < minimum || candidate.publishedAt > new Date(now.getTime() + 5 * 60_000)) continue; const stored = await this.repository.upsertCandidate(candidate); if (stored.created) await this.route(stored.item.id, candidate.priority); }
      await this.repository.sourceSuccess(source.id, fetched);
    } catch { await this.repository.sourceFailure(source.id, 30 * 60_000); this.report('news_feed.source_failed', { sourceId: source.id, category: 'SOURCE_UNAVAILABLE' }); }
  }
  private async route(newsItemId: string, priority: string): Promise<void> { for (const guild of await this.setup.listGuildConfigs()) { const key = priority === 'major' ? 'announcements' : 'collecting'; const resource = await this.setup.getResource(guild.guildId, 'CHANNEL', key); if (resource) await this.repository.ensureDelivery(guild.guildId, resource.discordId, newsItemId); } }
  private async deliver(delivery: PendingNewsDelivery): Promise<void> {
    if (!(await this.repository.claimDelivery(delivery.id))) return;
    let message: { id: string };
    try {
      const guild = await this.discord.guilds.fetch(delivery.guildId); const channel = await guild.channels.fetch(delivery.channelId);
      if (!channel?.isTextBased() || !('send' in channel)) throw new Error('CHANNEL_UNAVAILABLE');
      const roleId = this.config.NEWS_FEED_MENTION_OPT_IN_ROLE ? (await this.setup.getResource(delivery.guildId, 'ROLE', 'news'))?.discordId ?? null : null;
      message = await channel.send(newsPayload(delivery, roleId));
    } catch (error) { await this.repository.failed(delivery.id, error instanceof Error && error.message === 'CHANNEL_UNAVAILABLE' ? 'CHANNEL_UNAVAILABLE' : 'DISCORD_SEND_FAILED'); return void this.report('news_feed.delivery_failed', { deliveryId: delivery.id, category: 'DISCORD_SEND_FAILED' }); }
    try { await this.repository.delivered(delivery.id, message.id); } catch { await this.repository.uncertain(delivery.id); this.report('news_feed.delivery_uncertain', { deliveryId: delivery.id }); }
  }
}

export function newsPayload(delivery: PendingNewsDelivery, roleId: string | null) { const item = delivery.newsItem; const published = Math.floor(item.publishedAt.getTime() / 1_000); return { content: roleId ? `<@&${roleId}>` : undefined, embeds: [SliceEmbed.info(item.title, `**${item.category.replace(/_/g, ' ')} · ${item.sourceId}**\n\n${item.summary}\n\nPublished: <t:${published}:F>\nSource: ${item.sourceId}`)], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Read more').setStyle(ButtonStyle.Link).setURL(item.canonicalUrl))], allowedMentions: { parse: [], users: [], roles: roleId ? [roleId] : [], repliedUser: false } }; }
async function bounded<T>(items: T[], concurrency: number, action: (item: T) => Promise<void>): Promise<void> { let index = 0; await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => { while (index < items.length) { const item = items[index++]; if (item !== undefined) await action(item); } })); }
