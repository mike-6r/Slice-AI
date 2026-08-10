import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../identity/auth/access-token.guard';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { OutboxOperationsService } from '../application/outbox-operations.service';

@Controller('admin')
@UseGuards(AccessTokenGuard, PermissionGuard)
@RequirePermission('admin.access')
export class OutboxOperationsController {
  constructor(
    private readonly operations: OutboxOperationsService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Get('outbox/status')
  status() { return this.operations.status(); }

  @Get('outbox/dead-letters')
  outbox(@Query('limit') limit?: string) {
    return this.operations.outboxDeadLetters(parseLimit(limit));
  }

  @Get('outbox/:eventId')
  detail(@Param('eventId') eventId: string) {
    return this.operations.outboxDetail(eventId);
  }

  @Get('notification-deliveries/dead-letters')
  deliveries(@Query('limit') limit?: string) {
    return this.operations.deliveryDeadLetters(parseLimit(limit));
  }

  @Post('outbox/:eventId/requeue')
  async requeueOutbox(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireKey(key);
    await this.enforce(req);
    return this.operations.requeueOutbox(eventId, {
      actor: req.actor!,
      requestId: req.requestId ?? 'unknown',
      idempotencyKey: key!,
    });
  }

  @Post('notification-deliveries/:deliveryId/requeue')
  async requeueDelivery(
    @Param('deliveryId') deliveryId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireKey(key);
    await this.enforce(req);
    return this.operations.requeueDelivery(deliveryId, {
      actor: req.actor!,
      requestId: req.requestId ?? 'unknown',
      idempotencyKey: key!,
    });
  }

  private async enforce(req: AuthenticatedRequest) {
    await this.limiter.enforce(
      'adminMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
  }

  private requireKey(value: string | undefined) {
    if (!value || !/^[\x21-\x7e]{1,128}$/.test(value))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
  }
}

function parseLimit(value: string | undefined) {
  if (value === undefined) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  return parsed;
}
