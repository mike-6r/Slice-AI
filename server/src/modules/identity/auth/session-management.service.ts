import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RecentAuthService } from '../access/recent-auth.service';
import type { IdentitySession } from '../domain/identity.types';
import {
  IDENTITY_UNIT_OF_WORK,
  SESSION_REPOSITORY,
  type IdentityUnitOfWork,
  type SessionRepository,
} from '../ports/repositories';
import { Inject, Injectable } from '@nestjs/common';
import { AuthAbuseService } from './auth-abuse.service';
import type { Actor } from './auth.service';

export type CustomerSessionDto = {
  reference: string;
  currentSession: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  deviceLabel: string | null;
};

/** Self-service view and revocation over the existing persistent session authority. */
@Injectable()
export class SessionManagementService {
  constructor(
    @Inject(IDENTITY_UNIT_OF_WORK) private readonly uow: IdentityUnitOfWork,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly abuse: AuthAbuseService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async list(actor: Actor): Promise<{ sessions: CustomerSessionDto[] }> {
    const sessions = await this.sessions.listActiveByUser(actor.userId, new Date());
    return {
      sessions: sessions
        .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime())
        .map((session) => this.toDto(session, actor.sessionId)),
    };
  }

  async revoke(
    actor: Actor,
    reference: string,
    ip: string,
    requestId: string,
  ): Promise<{ currentSessionRevoked: boolean }> {
    await this.abuse.enforce('session-revoke', ip, actor.userId);
    const target = await this.findOwnSession(actor, reference);
    if (target.revokedAt || target.expiresAt <= new Date()) {
      return { currentSessionRevoked: false };
    }
    const now = new Date();
    let revoked = false;
    await this.uow.withinTransaction(async (tx) => {
      revoked = await tx.sessions.revoke(target.id, 'SESSION_REVOKED', now);
      if (revoked) {
        await tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'SESSION_REVOKED',
          resourceType: 'session',
          resourceId: target.publicId ?? null,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata: { currentSession: target.id === actor.sessionId },
          createdAt: now,
        });
      }
    });
    return { currentSessionRevoked: target.id === actor.sessionId && revoked };
  }

  async revokeOthers(
    actor: Actor,
    ip: string,
    requestId: string,
  ): Promise<{ revokedSessionCount: number }> {
    this.recentAuth.require(actor);
    await this.abuse.enforce('session-revoke-others', ip, actor.userId);
    const now = new Date();
    let revokedSessionCount = 0;
    await this.uow.withinTransaction(async (tx) => {
      revokedSessionCount = await tx.sessions.revokeAllExcept(
        actor.userId,
        actor.sessionId as never,
        'OTHER_SESSIONS_REVOKED',
        now,
      );
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'OTHER_SESSIONS_REVOKED',
        resourceType: 'session',
        resourceId: null,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { revokedSessionCount },
        createdAt: now,
      });
    });
    return { revokedSessionCount };
  }

  private async findOwnSession(actor: Actor, reference: string) {
    const session = await this.sessions.findByPublicId(reference);
    if (!session || session.userId !== actor.userId) {
      // Deliberately indistinguishable from a non-existent reference.
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found.',
      });
    }
    return session;
  }

  private toDto(session: IdentitySession, currentSessionId: string): CustomerSessionDto {
    if (!session.publicId) throw new Error('SESSION_PUBLIC_REFERENCE_MISSING');
    return {
      reference: session.publicId,
      currentSession: session.id === currentSessionId,
      createdAt: session.issuedAt.toISOString(),
      lastUsedAt: session.lastActivityAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      deviceLabel: labelForUserAgent(session.userAgent),
    };
  }
}

function labelForUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('Chrome/')
      ? 'Chrome'
      : userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('Safari/')
          ? 'Safari'
          : 'Browser';
  const platform = userAgent.includes('Windows')
    ? 'Windows'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : userAgent.includes('Android')
        ? 'Android'
        : userAgent.includes('Mac OS')
          ? 'macOS'
          : null;
  return platform ? `${browser} on ${platform}` : browser;
}
