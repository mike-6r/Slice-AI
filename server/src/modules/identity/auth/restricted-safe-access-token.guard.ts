import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './access-token.guard';
import { AuthService } from './auth.service';

/** Only endpoints explicitly using this guard may read/logout a restricted session. */
@Injectable()
export class RestrictedSafeAccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const value = request.header('authorization');
    if (!value?.startsWith('Bearer ')) await this.auth.actor('');
    request.actor = await this.auth.actor(value!.slice(7), {
      allowRestrictedRevokedSession: true,
    });
    return true;
  }
}
