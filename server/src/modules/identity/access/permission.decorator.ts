import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../domain/identity.types';

export const REQUIRED_PERMISSION = 'requiredPermission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
