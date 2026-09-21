import { ConflictException } from '@nestjs/common';

export function assertDropLockAllowsWorkflow(
  deploymentChannel: 'staging' | 'preview',
  lock: { dropId: string } | null,
  workflow: string,
): void {
  if (deploymentChannel !== 'preview' || !lock) return;
  throw new ConflictException({
    code: 'ASSET_COMMITTED_TO_DROP',
    message: `${workflow} is blocked while the asset is committed to a Drop.`,
  });
}
