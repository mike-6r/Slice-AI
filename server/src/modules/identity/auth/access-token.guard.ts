import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type Actor } from './auth.service';

export type AuthenticatedRequest = Request & {
  actor?: Actor;
  requestId?: string;
};
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const value = request.header('authorization');
    if (!value?.startsWith('Bearer ')) {
      await this.auth.actor('');
    }
    request.actor = await this.auth.actor(value!.slice(7));
    return true;
  }
}
