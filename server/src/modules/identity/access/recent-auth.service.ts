import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { Actor } from '../auth/auth.service';

/** A reusable password-auth freshness boundary; MFA can become an additional factor later. */
@Injectable()
export class RecentAuthService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  require(actor: Actor): void {
    const ageMs = Date.now() - actor.authenticatedAt.getTime();
    if (ageMs > this.config.recentAuthWindowSeconds * 1000) {
      throw new ForbiddenException({
        code: 'RECENT_AUTH_REQUIRED',
        message: 'Recent authentication is required for this action.',
      });
    }
  }
}
