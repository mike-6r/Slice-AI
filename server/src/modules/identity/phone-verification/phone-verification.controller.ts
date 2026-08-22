import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { PhoneVerificationService } from './phone-verification.service';

const sendSchema = z
  .object({
    phone: z.string().trim().min(3).max(32),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .strict();
const confirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
@Controller()
export class PhoneVerificationController {
  constructor(private readonly phone: PhoneVerificationService) {}
  @Get('me/phone-verification/status')
  @UseGuards(AccessTokenGuard)
  status(@Req() request: AuthenticatedRequest) {
    return this.phone.status(request.actor!);
  }
  @Post('me/phone-verification/send')
  @UseGuards(AccessTokenGuard)
  send(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(sendSchema, body);
    return this.phone.send(
      request.actor!,
      input.phone,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
      input.country,
    );
  }
  @Post('me/phone-verification/confirm')
  @UseGuards(AccessTokenGuard)
  confirm(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(confirmSchema, body);
    return this.phone.confirm(
      request.actor!,
      input.code,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }
  @Delete('me/phone-verification')
  @UseGuards(AccessTokenGuard)
  remove(@Req() request: AuthenticatedRequest) {
    return this.phone.remove(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }
}
function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  return result.data;
}
