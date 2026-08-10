import { Injectable } from '@nestjs/common';
import type { NotificationDeliveryChannel } from '@prisma/client';
import { InAppNotificationTransport } from './in-app-notification.transport';
import type { NotificationTransport } from './notification-transport';
@Injectable()
export class NotificationTransportRegistry {
  constructor(private readonly inApp: InAppNotificationTransport) {}
  get(channel: NotificationDeliveryChannel): NotificationTransport | undefined { return channel === 'IN_APP' ? this.inApp : undefined; }
}
