import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { z } from 'zod';
import { map } from 'rxjs';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../identity/auth/access-token.guard';
import { NotificationRealtimePublisher } from '../application/notification-realtime.publisher';
import { NotificationService } from '../application/notification.service';
import {
  customerNotificationTopics,
  NotificationPreferenceService,
} from '../application/notification-preference.service';

const listQuery = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    unreadOnly: z.enum(['true', 'false']).optional(),
  })
  .strict();

const preferencesUpdate = z
  .object({
    preferences: z
      .array(
        z
          .object({
            topic: z.enum(customerNotificationTopics),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(customerNotificationTopics.length),
  })
  .strict();

@Controller('me/notifications')
@UseGuards(AccessTokenGuard)
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly realtime: NotificationRealtimePublisher,
    private readonly preferences: NotificationPreferenceService,
  ) {}

  @Get('preferences')
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.preferences.get(req.actor!.userId);
  }

  @Patch('preferences')
  async updatePreferences(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!key)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'An Idempotency-Key header is required.',
      });
    const input = preferencesUpdate.safeParse(body);
    if (!input.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return this.preferences.update(
      req.actor!,
      input.data.preferences,
      req.ip ?? 'unknown',
      req.requestId ?? 'unknown',
      key,
    );
  }

  @Get()
  async list(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const input = listQuery.safeParse(query);
    if (!input.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return this.notifications.list({
      userId: req.actor!.userId,
      cursor: input.data.cursor,
      limit: input.data.limit,
      unreadOnly: input.data.unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  async unreadCount(@Req() req: AuthenticatedRequest) {
    return {
      unreadCount: await this.notifications.unreadCount(req.actor!.userId),
    };
  }

  @Post('read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.actor!.userId);
  }

  @Post(':notificationId/read')
  markRead(
    @Param('notificationId') notificationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notifications.markRead(req.actor!.userId, notificationId);
  }

  @Sse('stream')
  stream(@Req() req: AuthenticatedRequest) {
    return this.realtime
      .subscribe(req.actor!.userId)
      .pipe(
        map((event): MessageEvent => ({ type: event.type, data: event.data })),
      );
  }
}
