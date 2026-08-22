import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '../dto/identity.schemas';

const confirmSchema = z.object({ token: z.string().min(40).max(256) }).strict();
@Controller()
export class EmailVerificationController {
  constructor(
    private readonly email: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
  ) {}
  @Get('me/email-verification/status')
  @UseGuards(AccessTokenGuard)
  status(@Req() request: AuthenticatedRequest) {
    return this.email.status(request.actor!);
  }
  @Post('me/email-verification/send')
  @UseGuards(AccessTokenGuard)
  send(@Req() request: AuthenticatedRequest) {
    return this.email.send(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }
  @Post('auth/email-verification/confirm')
  confirm(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return this.email.confirm(
      parsed.data.token,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }

  @Post('auth/password-reset/request')
  @HttpCode(202)
  requestPasswordReset(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(passwordResetRequestSchema, body);
    return this.passwordReset.request(
      input.email,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }

  @Post('auth/password-reset/confirm')
  confirmPasswordReset(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(passwordResetConfirmSchema, body);
    return this.passwordReset.confirm(
      input.token,
      input.newPassword,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: result.error.flatten().fieldErrors,
    });
  return result.data;
}
