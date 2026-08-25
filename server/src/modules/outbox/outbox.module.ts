import { Module } from '@nestjs/common';
import { OutboxHandlerRegistry } from './application/outbox-handler';
import { NotificationDeliveryService } from './application/notification-delivery.service';
import { NotificationRoutingService } from './application/notification-routing.service';
import { NotificationChannelCapabilityRegistry } from './application/notification-transport-boundaries';
import { InAppNotificationTransport } from './application/in-app-notification.transport';
import { NotificationTransportRegistry } from './application/notification-transport-registry';
import { NotificationDeliveryWorkerRepository } from './application/notification-delivery-worker.repository';
import { NotificationDeliveryWorkerService } from './application/notification-delivery-worker.service';
import { DiscordNotificationDeliveryService } from './application/discord-notification-delivery.service';
import { OutboxWorkerRepository } from './application/outbox-worker.repository';
import { OutboxWorkerService } from './application/outbox-worker.service';
import { OutboxWriter } from './application/outbox-writer.service';
import { OutboxOperationsService } from './application/outbox-operations.service';
import { OutboxOperationsController } from './http/outbox-operations.controller';
import { NotificationModule } from '../notifications/notification.module';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { EmailDeliveryModule } from '../identity/email-delivery/email-delivery.module';
import { EmailNotificationTransport } from './application/email-notification.transport';

@Module({
  imports: [NotificationModule, AuthModule, AccessControlModule, EmailDeliveryModule],
  controllers: [OutboxOperationsController],
  providers: [OutboxWriter, OutboxOperationsService, NotificationDeliveryService, NotificationRoutingService, NotificationChannelCapabilityRegistry, InAppNotificationTransport, EmailNotificationTransport, NotificationTransportRegistry, NotificationDeliveryWorkerRepository, NotificationDeliveryWorkerService, DiscordNotificationDeliveryService, OutboxHandlerRegistry, OutboxWorkerRepository, OutboxWorkerService],
  exports: [OutboxWriter, OutboxWorkerRepository, OutboxWorkerService, DiscordNotificationDeliveryService],
})
export class OutboxModule {}
