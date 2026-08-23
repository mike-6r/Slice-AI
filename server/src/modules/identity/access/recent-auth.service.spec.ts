import { ForbiddenException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import type { Actor } from '../auth/auth.service';
import { RecentAuthService } from './recent-auth.service';

const actor = (authenticatedAt: Date, recentAuthAt?: Date | null): Actor => ({
  userId: 'user-1' as never,
  sessionId: 'session-1',
  status: 'ACTIVE',
  roles: ['USER'],
  sessionRevokedAt: null,
  sessionRevocationReason: null,
  authenticatedAt,
  recentAuthAt,
});

describe('RecentAuthService', () => {
  const service = new RecentAuthService({
    recentAuthWindowSeconds: 300,
  } as AppConfig);

  it('uses the session-bound password confirmation timestamp', () => {
    expect(() =>
      service.require(
        actor(new Date(Date.now() - 86_400_000), new Date(Date.now() - 60_000)),
      ),
    ).not.toThrow();
  });

  it('rejects a stale session-bound confirmation', () => {
    expect(() =>
      service.require(
        actor(new Date(Date.now() - 60_000), new Date(Date.now() - 301_000)),
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps legacy sessions safe by falling back to the original authentication time', () => {
    expect(() =>
      service.require(actor(new Date(Date.now() - 301_000))),
    ).toThrow(ForbiddenException);
  });
});
