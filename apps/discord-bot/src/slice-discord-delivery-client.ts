export type DiscordDelivery = { deliveryId: string; eventId: string; destinationKey: 'discord.market_feed' | 'discord.recent_sales' | 'discord.new_listings' | 'discord.price_alerts' | 'discord.platform_updates'; eventType: 'trade.completed'; schemaVersion: 1; payload: { assetTitle: string; priceMinor: string; currency: string; units?: string; occurredAt: string } };
export type DeliveryPull = { status: 'READY'; deliveries: DiscordDelivery[] } | { status: 'BACKEND_SEAM_REQUIRED'; message: string } | { status: 'UNAUTHORIZED' | 'BACKEND_UNAVAILABLE'; message: string };
/** D17 HTTP-only consumer boundary. No D17 tables are queried by the Discord bot. */
export class SliceDiscordDeliveryClient {
  constructor(private readonly options: { url?: string; serviceToken?: string }) {}
  async pull(): Promise<DeliveryPull> { if (!this.options.url) return { status: 'BACKEND_SEAM_REQUIRED', message: 'D17 has no Discord delivery-consumer endpoint configured.' }; return { status: 'BACKEND_SEAM_REQUIRED', message: 'D17 Discord delivery-consumer endpoint contract is not published yet.' }; }
  async acknowledge(deliveryId: string, outcome: 'DELIVERED' | 'RETRYABLE_FAILURE' | 'NON_RETRYABLE_FAILURE' | 'DESTINATION_UNAVAILABLE'): Promise<DeliveryPull> { void deliveryId; void outcome; return this.pull(); }
}
