import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  twoFactorCodeSchema,
  twoFactorDisableSchema,
} from '../dto/identity.schemas';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { TwoFactorService } from './two-factor.service';

@Controller('me/2fa')
@UseGuards(AccessTokenGuard)
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get('status')
  status(@Req() request: AuthenticatedRequest) {
    return this.twoFactor.status(request.actor!);
  }

  @Post('enroll')
  enroll(@Req() request: AuthenticatedRequest) {
    return this.twoFactor.beginEnrollment(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }

  @Post('confirm')
  confirm(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(twoFactorCodeSchema, body);
    return this.twoFactor.confirmEnrollment(
      request.actor!,
      input.code,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }

  @Post('sms/enroll')
  smsEnroll(@Req() request: AuthenticatedRequest) {
    return this.twoFactor.beginSmsEnrollment(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }

  @Post('sms/confirm')
  smsConfirm(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(twoFactorCodeSchema, body);
    return this.twoFactor.confirmSmsEnrollment(
      request.actor!,
      input.code,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }

  @Post('recovery-codes/regenerate')
  regenerate(@Req() request: AuthenticatedRequest) {
    return this.twoFactor.regenerateRecoveryCodes(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }

  @Post('disable')
  disable(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(twoFactorDisableSchema, body);
    return this.twoFactor.disable(
      request.actor!,
      input,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  return parsed.data!;
}
