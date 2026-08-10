import { evaluateAccountStatusTransition } from './account-status';
import { redactAuditMetadata, sanitizeAuditMetadata } from './audit';
import { evaluateIdempotency, fingerprintRequest } from './idempotency';
import { evaluatePolicy } from './policy';
import { canRefreshSession, evaluateRefreshTokenReuse } from './session';
import { profileUpdateSchema, signupSchema } from '../dto/identity.schemas';
import type { ActorContext } from './identity.types';
const admin: ActorContext = {
  actorType: 'USER' as const,
  roles: ['ADMIN'],
  accountStatus: 'ACTIVE' as const,
  userId: 'a' as ActorContext['userId'],
};
describe('offline identity rules', () => {
  it('requires an administrator and reason for status changes', () =>
    expect(
      evaluateAccountStatusTransition({
        current: 'ACTIVE',
        requested: 'SUSPENDED',
        actor: admin,
        reason: 'risk review',
        at: new Date(),
      }).allowed,
    ).toBe(true));
  it('blocks suspended actors', () =>
    expect(
      evaluatePolicy({
        actor: { ...admin, accountStatus: 'SUSPENDED' },
        action: 'admin.access',
      }).allowed,
    ).toBe(false));
  it('blocks restricted actors except explicitly safe self actions', () => {
    expect(
      evaluatePolicy({
        actor: { ...admin, accountStatus: 'RESTRICTED' },
        action: 'admin.access',
      }).allowed,
    ).toBe(false);
    expect(
      evaluatePolicy({
        actor: { ...admin, accountStatus: 'RESTRICTED' },
        action: 'profile.read.self',
        resourceOwnerId: admin.userId,
      }).allowed,
    ).toBe(true);
  });
  it('blocks unsafe admin self escalation', () =>
    expect(
      evaluatePolicy({
        actor: admin,
        action: 'role.assign',
        targetUserId: admin.userId,
        targetRoles: ['ADMIN'],
      }).code,
    ).toBe('UNSAFE_SELF_ESCALATION'));
  it('rejects revoked and expired refresh sessions', () => {
    const session = {
      expiresAt: new Date(Date.now() + 1_000),
      status: 'ROTATED' as const,
      familyId: 'f',
    };
    expect(evaluateRefreshTokenReuse(session)).toBe(true);
    expect(canRefreshSession(session, 'ACTIVE', new Date())).toBe(false);
  });
  it('redacts nested sensitive metadata', () =>
    expect(
      redactAuditMetadata({
        token: 'x',
        nested: { passwordHash: 'y', safe: 1 },
      }),
    ).toEqual({
      token: '[REDACTED]',
      nested: { passwordHash: '[REDACTED]', safe: 1 },
    }));
  it('rejects sensitive or unexpected metadata before persistence, including nested arrays', () => {
    expect(() =>
      sanitizeAuditMetadata('AUTH_PROFILE_UPDATED', {
        changedFields: [{ safe: 'refresh-token-secret' }],
      }),
    ).toThrow('AUDIT_METADATA_NOT_PERMITTED');
    expect(() =>
      sanitizeAuditMetadata('ROLE_GRANTED', {
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignmentId: 'a',
      }),
    ).not.toThrow();
  });
  it('identifies idempotency conflicts', () => {
    const f = fingerprintRequest('POST', '/signup', {
      email: 'a@example.test',
    });
    expect(
      evaluateIdempotency(
        {
          key: 'k',
          fingerprint: 'other',
          state: 'PROCESSING',
          expiresAt: new Date(Date.now() + 1_000),
        },
        f,
        new Date(),
      ),
    ).toBe('CONFLICT');
  });
  it('hashes semantically identical nested request bodies consistently', () => {
    expect(
      fingerprintRequest('POST', '/profile', {
        profile: { timezone: 'Europe/London', displayName: 'Sam' },
      }),
    ).toBe(
      fingerprintRequest('POST', '/profile', {
        profile: { displayName: 'Sam', timezone: 'Europe/London' },
      }),
    );
  });
  it('validates allowed profile input and rejects server fields', () => {
    expect(profileUpdateSchema.safeParse({ displayName: 'Sam' }).success).toBe(
      true,
    );
    expect(
      profileUpdateSchema.safeParse({ accountStatus: 'ACTIVE' }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({
        email: 'USER@EXAMPLE.TEST',
        password: 'ValidPassword12',
        displayName: 'Sam',
      }).data?.email,
    ).toBe('user@example.test');
  });
});
