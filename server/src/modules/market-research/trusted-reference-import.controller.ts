import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/auth/access-token.guard';
import { ControlRateLimitService } from '../identity/access/control-rate-limit.service';
import { TrustedReferenceImportService } from './trusted-reference-import.service';

const input = z.object({ url: z.string().trim().min(1).max(2048) }).strict();

@Controller('collectibles')
export class TrustedReferenceImportController {
  constructor(
    private readonly imports: TrustedReferenceImportService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Post('import-reference')
  @UseGuards(AccessTokenGuard)
  async identify(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = input.safeParse(body);
    if (!parsed.success)
      return {
        status: 'COULD_NOT_IDENTIFY',
        message:
          "We couldn't reliably identify this collectible from the link.",
        provider: null,
        identity: {},
        customerReference: null,
      };
    await this.limiter.enforce(
      'referenceImport',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.imports.identifyLive(parsed.data.url);
  }
}
