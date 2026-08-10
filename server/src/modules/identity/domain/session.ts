import type { AccountStatus, SessionRevocationReason } from './identity.types';
export interface SessionState {
  expiresAt: Date;
  revokedAt?: Date;
  status: 'ACTIVE' | 'ROTATED' | 'REVOKED';
  familyId: string;
}
export const isSessionExpired = (session: SessionState, now: Date) =>
  session.expiresAt <= now;
export const shouldRejectForAccountStatus = (status: AccountStatus) =>
  status === 'DEACTIVATED' ||
  status === 'RESTRICTED' ||
  status === 'SUSPENDED' ||
  status === 'CLOSED';
export function canRefreshSession(
  session: SessionState,
  status: AccountStatus,
  now: Date,
) {
  return (
    !session.revokedAt &&
    session.status === 'ACTIVE' &&
    !isSessionExpired(session, now) &&
    !shouldRejectForAccountStatus(status)
  );
}
export function evaluateRefreshTokenReuse(session: SessionState) {
  return session.status === 'ROTATED' || Boolean(session.revokedAt);
}
export const shouldRevokeSessionFamily = (session: SessionState) =>
  evaluateRefreshTokenReuse(session);
export function createSessionRevocationDecision(
  reason: SessionRevocationReason,
) {
  return {
    revokeFamily:
      reason === 'REFRESH_REPLAY' ||
      reason === 'RESTRICTED' ||
      reason === 'SUSPENDED' ||
      reason === 'CLOSED',
    reason,
  };
}
