import { PrismaClient } from '../../generated/prisma/index.js';
export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'RETRYABLE_FAILURE' | 'NON_RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE';
export type PriceAlertCondition = 'PRICE_ABOVE' | 'PRICE_BELOW';
export type PriceAlertDeliveryStatus = 'PENDING' | 'SENDING' | 'DELIVERED' | 'RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE';
export type PriceAlertDelivery = { id: string; alertId: string; idempotencyKey: string; assetTitle: string; observedMinor: bigint; currency: string; source: string; dataStatus: string; observedAt: Date; status: PriceAlertDeliveryStatus; attempts: number; alert: { id: string; guildId: string; discordUserId: string; assetId: string; condition: string; thresholdMinor: bigint; enabled: boolean } };
export class PrismaDiscordDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async receipt(input: { guildId: string; deliveryId: string; eventId: string; destination: string }) { return this.prisma.discordDeliveryReceipt.upsert({ where: { backendDeliveryId: input.deliveryId }, create: { guildId: input.guildId, backendDeliveryId: input.deliveryId, backendEventId: input.eventId, logicalDestination: input.destination }, update: {} }); }
  async complete(deliveryId: string, status: DeliveryStatus, channelId?: string, messageId?: string, failureCode?: string): Promise<void> { await this.prisma.discordDeliveryReceipt.update({ where: { backendDeliveryId: deliveryId }, data: { status, discordChannelId: channelId, discordMessageId: messageId, failureCode } }); }
  async delivered(deliveryId: string): Promise<boolean> { const row = await this.prisma.discordDeliveryReceipt.findUnique({ where: { backendDeliveryId: deliveryId } }); return row?.status === 'DELIVERED'; }
  async createAlert(input: { guildId: string; discordUserId: string; assetId: string; condition: PriceAlertCondition; thresholdMinor: bigint; currency: string; lastEvaluatedMinor: bigint; lastConditionMet: boolean; lastObservedAt: Date; lastSource: string; lastDataStatus: string }): Promise<void> { await this.prisma.discordPriceAlert.create({ data: input }); }
  async listAlerts(guildId: string, discordUserId: string) { return this.prisma.discordPriceAlert.findMany({ where: { guildId, discordUserId, enabled: true }, orderBy: { createdAt: 'desc' }, take: 25 }); }
  async removeAlert(guildId: string, discordUserId: string, id: string): Promise<boolean> { const result = await this.prisma.discordPriceAlert.updateMany({ where: { id, guildId, discordUserId }, data: { enabled: false } }); return result.count === 1; }
  async activeAlerts(take: number) { return this.prisma.discordPriceAlert.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' }, take: Math.min(Math.max(take, 1), 200) }); }
  async recordAlertEvaluation(input: { alertId: string; assetTitle: string; observedMinor: bigint; currency: string; source: string; dataStatus: string; observedAt: Date; conditionMet: boolean }): Promise<'BASELINED' | 'UPDATED' | 'TRIGGERED' | 'STALE' | 'CURRENCY_MISMATCH'> {
    return this.prisma.$transaction(async (db) => {
      const alert = await db.discordPriceAlert.findUnique({ where: { id: input.alertId } });
      if (!alert || !alert.enabled) return 'STALE';
      if (alert.currency && alert.currency !== input.currency) return 'CURRENCY_MISMATCH';
      if (alert.lastObservedAt && input.observedAt <= alert.lastObservedAt) return 'STALE';
      const baselined = alert.lastConditionMet === null;
      const triggered = !baselined && alert.lastConditionMet === false && input.conditionMet;
      await db.discordPriceAlert.update({ where: { id: alert.id }, data: { currency: alert.currency ?? input.currency, lastEvaluatedMinor: input.observedMinor, lastConditionMet: input.conditionMet, lastObservedAt: input.observedAt, lastSource: input.source, lastDataStatus: input.dataStatus, ...(triggered ? { lastTriggeredAt: new Date() } : {}) } });
      if (!triggered) return baselined ? 'BASELINED' : 'UPDATED';
      try {
        await db.discordPriceAlertDelivery.create({ data: { alertId: alert.id, idempotencyKey: `${alert.id}:${input.observedAt.toISOString()}:entered`, assetTitle: input.assetTitle, observedMinor: input.observedMinor, currency: input.currency, source: input.source, dataStatus: input.dataStatus, observedAt: input.observedAt } });
        return 'TRIGGERED';
      } catch (error) {
        if (isUniqueConstraint(error)) return 'UPDATED';
        throw error;
      }
    });
  }
  async pendingPriceAlertDeliveries(take: number): Promise<PriceAlertDelivery[]> {
    return (await this.prisma.discordPriceAlertDelivery.findMany({
      where: { status: { in: ['PENDING', 'RETRYABLE_FAILURE'] }, alert: { enabled: true } },
      include: { alert: { select: { id: true, guildId: true, discordUserId: true, assetId: true, condition: true, thresholdMinor: true, enabled: true } } },
      orderBy: { createdAt: 'asc' }, take: Math.min(Math.max(take, 1), 200),
    })) as PriceAlertDelivery[];
  }
  async claimPriceAlertDelivery(id: string): Promise<boolean> { const changed = await this.prisma.discordPriceAlertDelivery.updateMany({ where: { id, status: { in: ['PENDING', 'RETRYABLE_FAILURE'] } }, data: { status: 'SENDING', claimedAt: new Date(), attempts: { increment: 1 }, failureCode: null } }); return changed.count === 1; }
  async completePriceAlertDelivery(id: string, input: { status: Extract<PriceAlertDeliveryStatus, 'DELIVERED' | 'RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE'>; channelId?: string; messageId?: string; failureCode?: string }): Promise<void> { await this.prisma.discordPriceAlertDelivery.update({ where: { id }, data: { status: input.status, ...(input.status === 'DELIVERED' ? { deliveredAt: new Date(), discordChannelId: input.channelId, discordMessageId: input.messageId } : { failureCode: input.failureCode }) } }); }
  async claimMarketDigest(input: { guildId: string; periodKey: string; source: string; dataStatus: string; asOf: Date }): Promise<boolean> {
    try {
      await this.prisma.discordMarketDigestRun.create({ data: { ...input, status: 'PUBLISHING' } });
      return true;
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const changed = await this.prisma.discordMarketDigestRun.updateMany({ where: { guildId: input.guildId, periodKey: input.periodKey, status: 'RETRYABLE_FAILURE' }, data: { status: 'PUBLISHING', source: input.source, dataStatus: input.dataStatus, asOf: input.asOf, failureCode: null } });
      return changed.count === 1;
    }
  }
  async completeMarketDigest(guildId: string, periodKey: string, channelId: string, messageId: string): Promise<void> { await this.prisma.discordMarketDigestRun.update({ where: { guildId_periodKey: { guildId, periodKey } }, data: { status: 'POSTED', channelId, messageId, failureCode: null } }); }
  async failMarketDigest(guildId: string, periodKey: string, failureCode: string): Promise<void> { await this.prisma.discordMarketDigestRun.updateMany({ where: { guildId, periodKey, status: 'PUBLISHING' }, data: { status: 'RETRYABLE_FAILURE', failureCode } }); }
}
function isUniqueConstraint(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'; }
