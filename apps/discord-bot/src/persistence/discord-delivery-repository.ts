import { PrismaClient } from '../../generated/prisma/index.js';
export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'RETRYABLE_FAILURE' | 'NON_RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE';
export class PrismaDiscordDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async receipt(input: { guildId: string; deliveryId: string; eventId: string; destination: string }) { return this.prisma.discordDeliveryReceipt.upsert({ where: { backendDeliveryId: input.deliveryId }, create: { guildId: input.guildId, backendDeliveryId: input.deliveryId, backendEventId: input.eventId, logicalDestination: input.destination }, update: {} }); }
  async complete(deliveryId: string, status: DeliveryStatus, channelId?: string, messageId?: string, failureCode?: string): Promise<void> { await this.prisma.discordDeliveryReceipt.update({ where: { backendDeliveryId: deliveryId }, data: { status, discordChannelId: channelId, discordMessageId: messageId, failureCode } }); }
  async delivered(deliveryId: string): Promise<boolean> { const row = await this.prisma.discordDeliveryReceipt.findUnique({ where: { backendDeliveryId: deliveryId } }); return row?.status === 'DELIVERED'; }
  async createAlert(input: { guildId: string; discordUserId: string; assetId: string; condition: 'PRICE_ABOVE' | 'PRICE_BELOW'; thresholdMinor: bigint }): Promise<void> { await this.prisma.discordPriceAlert.create({ data: input }); }
  async listAlerts(guildId: string, discordUserId: string) { return this.prisma.discordPriceAlert.findMany({ where: { guildId, discordUserId, enabled: true }, orderBy: { createdAt: 'desc' }, take: 25 }); }
  async removeAlert(guildId: string, discordUserId: string, id: string): Promise<boolean> { const result = await this.prisma.discordPriceAlert.updateMany({ where: { id, guildId, discordUserId }, data: { enabled: false } }); return result.count === 1; }
}
