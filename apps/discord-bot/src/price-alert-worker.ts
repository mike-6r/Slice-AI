import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import type { BotConfig } from './config.js';
import { SliceCustomerRouteBuilder } from './customer-routes.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import { money } from './market-digest.js';
import { PrismaDiscordDeliveryRepository, type PriceAlertDelivery } from './persistence/discord-delivery-repository.js';
import { SliceBackendClient, type MarketAsset } from './slice-backend-client.js';

export class PriceAlertWorker {
  constructor(private readonly backend: SliceBackendClient, private readonly repository: PrismaDiscordDeliveryRepository, private readonly discord: Client, private readonly routes: SliceCustomerRouteBuilder, private readonly config: Pick<BotConfig, 'PRICE_ALERTS_ENABLED' | 'PRICE_ALERT_BATCH_SIZE' | 'PRICE_ALERT_CONCURRENCY'>, private readonly report: (event: string, fields: Record<string, unknown>) => void) {}

  async scan(): Promise<void> {
    if (!this.config.PRICE_ALERTS_ENABLED) return;
    let alerts;
    try { alerts = await this.repository.activeAlerts(this.config.PRICE_ALERT_BATCH_SIZE); }
    catch { return void this.report('price_alert.scan_failed', { category: 'PERSISTENCE_UNAVAILABLE' }); }
    const grouped = new Map<string, typeof alerts>();
    for (const alert of alerts) grouped.set(alert.assetId, [...(grouped.get(alert.assetId) ?? []), alert]);
    await bounded([...grouped.entries()], this.config.PRICE_ALERT_CONCURRENCY, async ([assetId, assetAlerts]) => {
      let result;
      try { result = await this.backend.asset(assetId); }
      catch { return void this.report('price_alert.asset_unavailable', { assetId, category: 'BACKEND_UNAVAILABLE' }); }
      if (!result.ok) return void this.report('price_alert.asset_unavailable', { assetId, category: result.code });
      const price = authoritativePrice(result.value);
      if (!price) return void this.report('price_alert.asset_unavailable', { assetId, category: 'MISSING_AUTHORITATIVE_PRICE' });
      if (price.dataStatus !== 'LIVE') return void this.report('price_alert.skipped_data_status', { assetId, dataStatus: price.dataStatus });
      for (const alert of assetAlerts) {
        const conditionMet = alert.condition === 'PRICE_ABOVE' ? price.minor >= alert.thresholdMinor : price.minor <= alert.thresholdMinor;
        try {
          const evaluation = await this.repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: price.title, observedMinor: price.minor, currency: price.currency, source: price.source, dataStatus: price.dataStatus, observedAt: price.asOf, conditionMet });
          if (evaluation === 'CURRENCY_MISMATCH') this.report('price_alert.currency_mismatch', { alertId: alert.id, assetId });
        } catch { this.report('price_alert.evaluation_failed', { alertId: alert.id, assetId, category: 'PERSISTENCE_UNAVAILABLE' }); }
      }
    });
    let deliveries;
    try { deliveries = await this.repository.pendingPriceAlertDeliveries(this.config.PRICE_ALERT_BATCH_SIZE); }
    catch { return void this.report('price_alert.scan_failed', { category: 'PERSISTENCE_UNAVAILABLE' }); }
    await bounded(deliveries, this.config.PRICE_ALERT_CONCURRENCY, async (delivery) => {
      try { await this.deliver(delivery); }
      catch { this.report('price_alert.delivery_failed', { alertId: delivery.alertId, category: 'PERSISTENCE_UNAVAILABLE' }); }
    });
  }

  private async deliver(delivery: PriceAlertDelivery): Promise<void> {
    if (!(await this.repository.claimPriceAlertDelivery(delivery.id))) return;
    let message: { channelId: string; id: string };
    try {
      const user = await this.discord.users.fetch(delivery.alert.discordUserId);
      message = await user.send(priceAlertPayload(delivery, this.routes));
    } catch (error) {
      const code = discordFailure(error);
      await this.repository.completePriceAlertDelivery(delivery.id, { status: code === 'DESTINATION_UNAVAILABLE' ? 'DESTINATION_UNAVAILABLE' : 'RETRYABLE_FAILURE', failureCode: code });
      return void this.report('price_alert.delivery_failed', { alertId: delivery.alertId, category: code });
    }
    try { await this.repository.completePriceAlertDelivery(delivery.id, { status: 'DELIVERED', channelId: message.channelId, messageId: message.id }); } catch { this.report('price_alert.delivery_uncertain', { alertId: delivery.alertId }); }
  }
}

export function priceAlertPayload(delivery: PriceAlertDelivery, routes: SliceCustomerRouteBuilder) {
  const direction = delivery.alert.condition === 'PRICE_ABOVE' ? 'Target reached above' : 'Target reached below';
  const target = money(delivery.alert.thresholdMinor, delivery.currency); const current = money(delivery.observedMinor, delivery.currency); const url = routes.marketplaceUrl();
  return { embeds: [SliceEmbed.info('Price Alert', `**${delivery.assetTitle}**\n${direction}: **${target}**\nCurrent: **${current}**\nAs of: <t:${Math.floor(delivery.observedAt.getTime() / 1000)}:F>\nSource: **${delivery.source}** · Data status: **${delivery.dataStatus}**`)], components: url ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('View on Slice').setStyle(ButtonStyle.Link).setURL(url))] : [], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } };
}

export function authoritativePrice(asset: MarketAsset): { title: string; minor: bigint; currency: string; source: string; asOf: Date; dataStatus: string } | null { const value = asset.estimatedMarketValue; const asOf = asset.asOf ?? asset.sliceValuation?.approvedAt; if (!value || !asset.source || !asOf || !asset.dataStatus || !/^\d+$/.test(value.minor)) return null; const parsed = new Date(asOf); return Number.isNaN(parsed.getTime()) ? null : { title: asset.title, minor: BigInt(value.minor), currency: value.currency, source: asset.source, asOf: parsed, dataStatus: asset.dataStatus }; }
async function bounded<T>(items: T[], concurrency: number, action: (item: T) => Promise<void>): Promise<void> { let cursor = 0; await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => { while (cursor < items.length) { const item = items[cursor++]; if (item !== undefined) await action(item); } })); }
function discordFailure(error: unknown): 'DESTINATION_UNAVAILABLE' | 'RETRYABLE_FAILURE' { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 50007 ? 'DESTINATION_UNAVAILABLE' : 'RETRYABLE_FAILURE'; }
