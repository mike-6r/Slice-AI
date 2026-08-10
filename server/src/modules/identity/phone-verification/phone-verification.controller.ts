import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard';
import { PhoneVerificationService } from './phone-verification.service';

const sendSchema = z.object({ phone: z.string().trim().min(3).max(32) }).strict();
const confirmSchema = sendSchema.extend({ code: z.string().regex(/^\d{6}$/) }).strict();
@Controller()
export class PhoneVerificationController {
  constructor(private readonly phone: PhoneVerificationService) {}
  @Get('me/phone-verification/status') @UseGuards(AccessTokenGuard)
  status(@Req() request: AuthenticatedRequest) { return this.phone.status(request.actor!); }
  @Post('me/phone-verification/send') @UseGuards(AccessTokenGuard)
  send(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.phone.send(request.actor!, parse(sendSchema, body).phone, request.ip ?? 'unknown', request.requestId ?? 'unknown');
  }
  @Post('me/phone-verification/confirm') @UseGuards(AccessTokenGuard)
  confirm(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(confirmSchema, body);
    return this.phone.confirm(request.actor!, input.phone, input.code, request.ip ?? 'unknown', request.requestId ?? 'unknown');
  }
}
function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Request validation failed.' });
  return result.data;
}
