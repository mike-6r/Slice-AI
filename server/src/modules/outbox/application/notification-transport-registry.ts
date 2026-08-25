import { Injectable, Optional } from '@nestjs/common';
import type { NotificationDeliveryChannel } from '@prisma/client';
import { EmailNotificationTransport } from './email-notification.transport';
import { InAppNotificationTransport } from './in-app-notification.transport';
import type { NotificationTransport } from './notification-transport';
@Injectable()
export class NotificationTransportRegistry {
  constructor(private readonly inApp: InAppNotificationTransport, @Optional() private readonly email?: EmailNotificationTransport) {}
  get(channel: NotificationDeliveryChannel): NotificationTransport | undefined {
    if (channel === 'IN_APP') return this.inApp;
    if (channel === 'EMAIL') return this.email;
    return undefined;
  }
}
