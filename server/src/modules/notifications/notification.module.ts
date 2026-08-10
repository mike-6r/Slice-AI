import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { NotificationRealtimePublisher } from './application/notification-realtime.publisher';
import { NotificationPreferenceService } from './application/notification-preference.service';
import { NotificationService } from './application/notification.service';
import { NotificationController } from './http/notification.controller';

@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRealtimePublisher,
    NotificationPreferenceService,
  ],
  exports: [NotificationRealtimePublisher],
})
export class NotificationModule {}
