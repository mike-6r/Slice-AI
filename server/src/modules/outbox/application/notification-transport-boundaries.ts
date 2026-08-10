import { Injectable } from '@nestjs/common';
import type { NotificationDeliveryChannel } from '@prisma/client';

export type NotificationChannelCapability = Readonly<{ channel: NotificationDeliveryChannel; configured: boolean; transport: 'NOT_IMPLEMENTED' }>;

/** Phase 3 deliberately advertises no usable transport until a later bounded worker adds one. */
@Injectable()
export class NotificationChannelCapabilityRegistry {
  get(channel: NotificationDeliveryChannel): NotificationChannelCapability {
    return { channel, configured: false, transport: 'NOT_IMPLEMENTED' };
  }
}

/** Logical destinations never become provider endpoints in the routing authority. */
export interface NotificationDestinationResolver {
  resolve(channel: NotificationDeliveryChannel, destinationKey: string): Promise<never>;
}
