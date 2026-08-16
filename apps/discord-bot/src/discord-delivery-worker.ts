import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client } from 'discord.js';
import { SliceCustomerRouteBuilder } from './customer-routes.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import type { SetupRepository } from './persistence/setup-repository.js';
import { PrismaDiscordDeliveryRepository } from './persistence/discord-delivery-repository.js';
import { SliceBackendClient, type CustomerDiscordDelivery, type CustomerDeliveryOutcome } from './slice-backend-client.js';

/** Extends the existing bot worker; it never reads D17 tables directly or
 * derives customer state. The API claims durable deliveries for it. */
export class DiscordDeliveryWorker {
  constructor(private readonly backend: SliceBackendClient, private readonly receipts: PrismaDiscordDeliveryRepository, private readonly setup: SetupRepository, private readonly discord: Client, private readonly routes: SliceCustomerRouteBuilder, private readonly report: (event: string, fields: Record<string, unknown>) => void) {}

  async scan(): Promise<void> {
    const response = await this.backend.pullCustomerDeliveries();
    if (!response.ok) { this.report('discord_delivery.unavailable', { status: response.code }); return; }
    for (const delivery of response.value) await this.process(delivery);
  }

  private async process(delivery: CustomerDiscordDelivery): Promise<void> {
    // Recheck the canonical link immediately before the external side effect;
    // a claim is not proof that a user is still linked or eligible.
    const link = await this.backend.getLinkStatus(delivery.discordUserId);
    if (!link.ok || !link.value.linked) return void await this.acknowledge(delivery, 'SUPPRESSED');
    if (!(await this.preferenceEnabled(delivery.discordUserId, 'customer-orders'))) return void await this.acknowledge(delivery, 'SUPPRESSED');
    const receipt = await this.receipts.receipt({ guildId: 'dm', deliveryId: delivery.deliveryId, eventId: delivery.eventId, destination: `dm:${delivery.discordUserId}` });
    if (receipt.status === 'DELIVERED') return void await this.acknowledge(delivery, 'DELIVERED');
    try {
      const user = await this.discord.users.fetch(delivery.discordUserId);
      const message = await user.send(orderPayload(delivery, this.routes));
      await this.receipts.complete(delivery.deliveryId, 'DELIVERED', message.channelId, message.id);
      await this.acknowledge(delivery, 'DELIVERED');
    } catch (error) {
      const code = discordFailure(error);
      this.report('discord_delivery.send_failed', { deliveryId: delivery.deliveryId, code });
      await this.receipts.complete(delivery.deliveryId, code === 'DESTINATION_UNAVAILABLE' ? 'DESTINATION_UNAVAILABLE' : 'RETRYABLE_FAILURE', undefined, undefined, code);
      await this.acknowledge(delivery, code === 'DESTINATION_UNAVAILABLE' ? 'DESTINATION_UNAVAILABLE' : 'RETRYABLE_FAILURE');
    }
  }

  private async preferenceEnabled(discordUserId: string, key: string): Promise<boolean> {
    const rows = await this.setup.listUserNotificationPreferences(discordUserId);
    // Existing users default to enabled until they make an explicit choice.
    // An explicit OFF in any configured Discord context safely suppresses DMs.
    return !rows.some((row) => row.logicalKey === key && row.enabled === false);
  }

  private async acknowledge(delivery: CustomerDiscordDelivery, outcome: CustomerDeliveryOutcome): Promise<void> {
    const result = await this.backend.acknowledgeCustomerDelivery(delivery.deliveryId, delivery.claimToken, outcome);
    if (!result.ok || !result.value.accepted) this.report('discord_delivery.ack_failed', { deliveryId: delivery.deliveryId, outcome, code: result.ok ? 'NOT_ACCEPTED' : result.code });
  }
}

export function orderPayload(delivery: CustomerDiscordDelivery, routes: SliceCustomerRouteBuilder) {
  const cancelled = delivery.order.status === 'CANCELLED';
  const heading = cancelled ? 'Order cancelled' : 'Order opened';
  const detail = cancelled ? 'Your order has been cancelled.' : `Your ${delivery.order.side.toLowerCase()} order is now open.`;
  const price = money(delivery.order.limitPriceMinor, delivery.order.currency);
  const url = routes.orderUrl(delivery.order.id);
  return { embeds: [SliceEmbed.info(heading, `**${delivery.order.assetTitle}**\n${detail}\n${delivery.order.units} ownership unit${delivery.order.units === '1' ? '' : 's'} at **${price}**`)], components: url ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('View Order').setStyle(ButtonStyle.Link).setURL(url))] : [], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } };
}
function money(minor: string, currency: string) { const value = BigInt(minor); const whole = value / 100n; const fraction = (value < 0n ? -value : value) % 100n; return `${currency} ${whole.toString()}.${fraction.toString().padStart(2, '0')}`; }
function discordFailure(error: unknown): 'DESTINATION_UNAVAILABLE' | 'RETRYABLE_FAILURE' { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 50007 ? 'DESTINATION_UNAVAILABLE' : 'RETRYABLE_FAILURE'; }
