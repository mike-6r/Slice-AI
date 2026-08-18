import type { Client } from 'discord.js';
import type { BotConfig } from './config.js';
import { SliceCustomerRouteBuilder } from './customer-routes.js';
import { marketDigestPayload, digestIsPublishable } from './market-digest.js';
import { PrismaDiscordDeliveryRepository } from './persistence/discord-delivery-repository.js';
import type { SetupRepository } from './persistence/setup-repository.js';
import { SliceBackendClient } from './slice-backend-client.js';

export class MarketDigestWorker {
  constructor(private readonly backend: SliceBackendClient, private readonly repository: PrismaDiscordDeliveryRepository, private readonly setup: SetupRepository, private readonly discord: Client, private readonly routes: SliceCustomerRouteBuilder, private readonly config: Pick<BotConfig, 'MARKET_DIGEST_ENABLED' | 'MARKET_DIGEST_HOUR' | 'MARKET_DIGEST_MAX_ITEMS' | 'MARKET_DIGEST_MENTION_OPT_IN_ROLE'>, private readonly report: (event: string, fields: Record<string, unknown>) => void) {}

  async scan(now = new Date()): Promise<void> {
    if (!this.config.MARKET_DIGEST_ENABLED || now.getUTCHours() !== this.config.MARKET_DIGEST_HOUR) return;
    let summary; let gainers; let losers;
    try { [summary, gainers, losers] = await Promise.all([this.backend.marketSummary(), this.backend.movers('gainers'), this.backend.movers('losers')]); }
    catch { return void this.report('market_digest.skipped', { category: 'BACKEND_UNAVAILABLE' }); }
    if (!summary.ok || !digestIsPublishable(summary.value)) return void this.report('market_digest.skipped', { category: summary.ok ? 'UNAVAILABLE_DATA' : summary.code });
    if (!gainers.ok) return void this.report('market_digest.skipped', { category: gainers.code });
    if (!losers.ok) return void this.report('market_digest.skipped', { category: losers.code });
    const periodKey = now.toISOString().slice(0, 10);
    let guilds: Awaited<ReturnType<SetupRepository['listGuildConfigs']>>;
    try { guilds = await this.setup.listGuildConfigs(); } catch { return void this.report('market_digest.skipped', { category: 'SETUP_UNAVAILABLE' }); }
    for (const configured of guilds) {
      try { await this.publishGuild(configured.guildId, periodKey, summary.value, gainers.value, losers.value); }
      catch { this.report('market_digest.publish_failed', { guildId: configured.guildId, category: 'PERSISTENCE_UNAVAILABLE' }); }
    }
  }

  private async publishGuild(guildId: string, periodKey: string, summary: Parameters<typeof marketDigestPayload>[0]['summary'], gainers: Parameters<typeof marketDigestPayload>[0]['gainers'], losers: Parameters<typeof marketDigestPayload>[0]['losers']): Promise<void> {
    const channelResource = await this.setup.getResource(guildId, 'CHANNEL', 'market-feed');
    if (!channelResource) return void this.report('market_digest.skipped', { category: 'CHANNEL_UNAVAILABLE', guildId });
    const claimed = await this.repository.claimMarketDigest({ guildId, periodKey, source: summary.source, dataStatus: summary.dataStatus, asOf: new Date(summary.asOf!) });
    if (!claimed) return;
    try {
      const guild = await this.discord.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelResource.discordId);
      if (!channel?.isTextBased() || !('send' in channel)) throw new Error('CHANNEL_UNAVAILABLE');
      const payload = marketDigestPayload({ summary, gainers, losers }, this.config.MARKET_DIGEST_MAX_ITEMS, this.routes.marketplaceUrl());
      let roleId: string | null = null;
      if (this.config.MARKET_DIGEST_MENTION_OPT_IN_ROLE) roleId = (await this.setup.getResource(guildId, 'ROLE', 'market-summary'))?.discordId ?? null;
      const message = await channel.send(roleId ? { ...payload, content: `<@&${roleId}>`, allowedMentions: { parse: [], users: [], roles: [roleId], repliedUser: false } } : payload);
      try { await this.repository.completeMarketDigest(guildId, periodKey, channel.id, message.id); } catch { this.report('market_digest.receipt_uncertain', { guildId, periodKey }); }
    } catch (error) {
      const code = error instanceof Error && error.message === 'CHANNEL_UNAVAILABLE' ? 'CHANNEL_UNAVAILABLE' : 'DISCORD_SEND_FAILED';
      await this.repository.failMarketDigest(guildId, periodKey, code);
      this.report('market_digest.publish_failed', { guildId, category: code });
    }
  }
}
