import { Injectable } from '@nestjs/common';
import { type NotificationDelivery } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationDeliveryWorkerRepository } from './notification-delivery-worker.repository';

export type DiscordOrderDelivery = Readonly<{
  deliveryId: string; eventId: string; claimToken: string; discordUserId: string;
  category: 'ORDERS'; eventType: 'order.opened' | 'order.cancelled' | 'order.partiallyfilled' | 'order.filled' | 'order.expired'; occurredAt: string;
  order: { id: string; assetTitle: string; side: 'BUY' | 'SELL'; units: string; limitPriceMinor: string; currency: 'GBP'; status: 'OPEN' | 'CANCELLED' | 'PARTIALLY_FILLED' | 'FILLED' | 'EXPIRED' };
}>;
export type DiscordResourceDelivery = Readonly<{ deliveryId: string; eventId: string; claimToken: string; discordUserId: string; category: 'COLLECTOR_ACTIONS' | 'SHIPPING'; eventType: string; occurredAt: string; resource: { submissionId: string; intakeId: string | null; title: string; status: string } }>;
export type DiscordCustomerDelivery = DiscordOrderDelivery | DiscordResourceDelivery;
export type DiscordDeliveryOutcome = 'DELIVERED' | 'SUPPRESSED' | 'RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE' | 'NON_RETRYABLE_FAILURE';

/** The Discord bot consumes these claims over its service-authenticated HTTP
 * boundary. All recipient and order facts are re-resolved here, immediately
 * before external delivery, from the Slice authority. */
@Injectable()
export class DiscordNotificationDeliveryService {
  constructor(private readonly db: PrismaService, private readonly repository: NotificationDeliveryWorkerRepository) {}

  async pull(limit = 25): Promise<DiscordCustomerDelivery[]> {
    const now = new Date();
    const claims = await this.repository.claimDiscordPrivateBatch('discord-bot', limit, 60_000, now);
    const deliveries: DiscordCustomerDelivery[] = [];
    for (const claim of claims) {
      const resolved = await this.resolve(claim);
      if (resolved) deliveries.push(resolved);
      else await this.repository.suppress(claim.id, claim.claimToken, now, 'RECIPIENT_OR_EVENT_NO_LONGER_ELIGIBLE');
    }
    return deliveries;
  }

  async acknowledge(deliveryId: string, claimToken: string, outcome: DiscordDeliveryOutcome) {
    const row = await this.db.notificationDelivery.findUnique({ where: { deliveryId } });
    if (!row || row.claimToken !== claimToken || row.status !== 'PROCESSING') return { accepted: false };
    const now = new Date();
    if (outcome === 'DELIVERED') return { accepted: await this.repository.success(row.id, claimToken, now) };
    if (outcome === 'SUPPRESSED' || outcome === 'DESTINATION_UNAVAILABLE' || outcome === 'NON_RETRYABLE_FAILURE') return { accepted: await this.repository.suppress(row.id, claimToken, now, outcome) };
    const delay = Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, row.attempts - 1));
    const terminal = row.attempts >= 5;
    return { accepted: await this.repository.failure(row.id, claimToken, now, 'DISCORD_DM_RETRYABLE_FAILURE', terminal, new Date(now.getTime() + delay)) };
  }

  private async resolve(row: NotificationDelivery & { claimToken: string }): Promise<DiscordCustomerDelivery | null> {
    if (!row.destinationKey.startsWith('user:')) return null;
    const payload = row.payload as Record<string, unknown>;
    const userId = row.destinationKey.slice('user:'.length);
    if (row.topic === 'COLLECTOR_ACTIONS' || row.topic === 'SHIPPING') return this.resolveResource(row, payload, userId);
    if (row.topic !== 'ORDER_UPDATES') return null;
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
    const eventType = typeof payload.eventType === 'string' ? payload.eventType : null;
    const expectedStatus = ['OPEN', 'CANCELLED', 'PARTIALLY_FILLED', 'FILLED', 'EXPIRED'].includes(String(payload.status)) ? payload.status as DiscordOrderDelivery['order']['status'] : null;
    if (!orderId || !['order.opened', 'order.cancelled', 'order.partiallyfilled', 'order.filled', 'order.expired'].includes(String(eventType)) || !expectedStatus) return null;
    const [link, order] = await Promise.all([
      this.db.discordAccountLink.findUnique({ where: { userId }, select: { discordUserId: true, user: { select: { accountStatus: true } } } }),
      this.db.tradingOrder.findFirst({ where: { id: orderId, userId }, select: { id: true, side: true, originalUnits: true, limitPriceMinor: true, status: true, asset: { select: { title: true } } } }),
    ]);
    if (!link || link.user.accountStatus !== 'ACTIVE' || !order) return null;
    return { deliveryId: row.deliveryId, eventId: String(payload.eventId ?? row.outboxEventId), claimToken: row.claimToken, discordUserId: link.discordUserId, category: 'ORDERS', eventType: eventType as DiscordOrderDelivery['eventType'], occurredAt: typeof payload.occurredAt === 'string' ? payload.occurredAt : row.createdAt.toISOString(), order: { id: order.id, assetTitle: order.asset.title, side: order.side, units: typeof payload.units === 'string' ? payload.units : order.originalUnits.toString(), limitPriceMinor: typeof payload.priceMinor === 'string' ? payload.priceMinor : order.limitPriceMinor.toString(), currency: 'GBP', status: expectedStatus } };
  }
  private async resolveResource(row: NotificationDelivery & { claimToken: string }, payload: Record<string, unknown>, userId: string): Promise<DiscordResourceDelivery | null> {
    const submissionId = typeof payload.submissionId === 'string' ? payload.submissionId : null;
    const category = row.topic === 'COLLECTOR_ACTIONS' ? 'COLLECTOR_ACTIONS' : 'SHIPPING';
    if (!submissionId || typeof payload.eventType !== 'string' || typeof payload.status !== 'string') return null;
    const [link, submission] = await Promise.all([this.db.discordAccountLink.findUnique({ where: { userId }, select: { discordUserId: true, user: { select: { accountStatus: true } } } }), this.db.assetSubmission.findFirst({ where: { id: submissionId, ownerUserId: userId }, select: { id: true, declaredMetadata: true, asset: { select: { title: true } } } })]);
    if (!link || link.user.accountStatus !== 'ACTIVE' || !submission) return null;
    const metadata = submission.declaredMetadata as Record<string, unknown> | null;
    const title = submission.asset?.title ?? (typeof metadata?.name === 'string' ? metadata.name.slice(0, 120) : 'Your collectible');
    return { deliveryId: row.deliveryId, eventId: String(payload.eventId ?? row.outboxEventId), claimToken: row.claimToken, discordUserId: link.discordUserId, category, eventType: payload.eventType, occurredAt: typeof payload.occurredAt === 'string' ? payload.occurredAt : row.createdAt.toISOString(), resource: { submissionId, intakeId: typeof payload.intakeId === 'string' ? payload.intakeId : null, title, status: payload.status } };
  }
}
