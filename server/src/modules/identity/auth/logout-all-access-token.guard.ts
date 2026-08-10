import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './access-token.guard';

@Injectable()
export class LogoutAllAccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const value = request.header('authorization');
    if (!value?.startsWith('Bearer ')) {
      await this.auth.actor('');
    }
    request.actor = await this.auth.logoutAllActor(
      value!.slice(7),
      request.header('idempotency-key'),
    );
    return true;
  }
}
