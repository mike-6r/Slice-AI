import { NotFoundException } from '@nestjs/common';
import type { Actor } from './auth.service';
import { SessionManagementService } from './session-management.service';

const actor: Actor = {
  userId: 'user-a' as never,
  sessionId: 'internal-current-session',
  status: 'ACTIVE',
  roles: ['USER'],
  sessionRevokedAt: null,
  sessionRevocationReason: null,
  authenticatedAt: new Date('2026-08-09T12:00:00.000Z'),
};

const session = (
  id: string,
  publicId: string,
  lastActivityAt = new Date('2026-08-09T12:00:00.000Z'),
) => ({
  id: id as never,
  publicId,
  userId: actor.userId,
  tokenHash: 'not-exposed',
  familyId: 'family-a',
  replacedBySessionId: null,
  issuedAt: new Date('2026-08-09T11:00:00.000Z'),
  authenticatedAt: actor.authenticatedAt,
  recentAuthAt: null,
  expiresAt: new Date('2026-09-09T12:00:00.000Z'),
  revokedAt: null,
  revocationReason: null,
  lastActivityAt,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0',
  ipHash: 'not-exposed',
});

describe('SessionManagementService', () => {
  function setup(active = [session('internal-current-session', 'session_current')]) {
    const sessions = {
      listActiveByUser: jest.fn().mockResolvedValue(active),
      findByPublicId: jest.fn((reference: string) =>
        Promise.resolve(active.find((item) => item.publicId === reference) ?? null),
      ),
      revoke: jest.fn().mockResolvedValue(true),
      revokeAllExcept: jest.fn().mockResolvedValue(0),
    };
    const audit = { append: jest.fn().mockResolvedValue(undefined) };
    const uow = {
      withinTransaction: jest.fn((work) => work({ sessions, audit })),
    };
    const abuse = { enforce: jest.fn().mockResolvedValue(undefined) };
    const recentAuth = { require: jest.fn() };
    return {
      sessions,
      audit,
      abuse,
      recentAuth,
      service: new SessionManagementService(
        uow as never,
        sessions as never,
        abuse as never,
        recentAuth as never,
      ),
    };
  }

  it('returns only safe active sessions and marks the backend current session', async () => {
    const older = session(
      'internal-other-session',
      'session_other',
      new Date('2026-08-09T11:30:00.000Z'),
    );
    const { service } = setup([older, session('internal-current-session', 'session_current')]);

    const result = await service.list(actor);

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.find((item) => item.currentSession)).toMatchObject({
      reference: 'session_current',
      deviceLabel: 'Chrome on Windows',
    });
    expect(JSON.stringify(result)).not.toContain('internal-current-session');
    expect(JSON.stringify(result)).not.toContain('tokenHash');
    expect(JSON.stringify(result)).not.toContain('ipHash');
  });

  it('revokes an owned other session once and writes one audit event', async () => {
    const other = session('internal-other-session', 'session_other');
    const { service, sessions, audit, abuse } = setup([
      session('internal-current-session', 'session_current'),
      other,
    ]);

    await expect(
      service.revoke(actor, 'session_other', '198.51.100.10', 'request-1'),
    ).resolves.toEqual({ currentSessionRevoked: false });

    expect(abuse.enforce).toHaveBeenCalledWith(
      'session-revoke',
      '198.51.100.10',
      actor.userId,
    );
    expect(sessions.revoke).toHaveBeenCalledWith(
      other.id,
      'SESSION_REVOKED',
      expect.any(Date),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SESSION_REVOKED', resourceId: 'session_other' }),
    );
  });

  it('does not reveal or revoke an unlisted session reference', async () => {
    const { service, sessions } = setup();
    await expect(
      service.revoke(actor, 'session_someone_else', '198.51.100.10', 'request-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('preserves the current session when revoking every other active session', async () => {
    const { service, sessions, recentAuth, audit } = setup();
    sessions.revokeAllExcept.mockResolvedValue(2);

    await expect(
      service.revokeOthers(actor, '198.51.100.10', 'request-3'),
    ).resolves.toEqual({ revokedSessionCount: 2 });

    expect(recentAuth.require).toHaveBeenCalledWith(actor);
    expect(sessions.revokeAllExcept).toHaveBeenCalledWith(
      actor.userId,
      actor.sessionId,
      'OTHER_SESSIONS_REVOKED',
      expect.any(Date),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OTHER_SESSIONS_REVOKED' }),
    );
  });
});
