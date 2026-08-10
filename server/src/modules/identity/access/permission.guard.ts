import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '../domain/identity.types';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { AuthorizationService } from './authorization.service';
import { REQUIRED_PERMISSION } from './permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const permission = this.reflector.getAllAndOverride<Permission>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.authorization.authorize(
      request.actor!,
      permission,
      undefined,
      undefined,
      request.requestId,
    );
    return true;
  }
}
