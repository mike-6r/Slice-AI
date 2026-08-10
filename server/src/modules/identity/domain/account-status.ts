import type { AccountStatus, ActorContext } from './identity.types';
export interface StatusTransitionRequest {
  current: AccountStatus;
  requested: AccountStatus;
  actor: ActorContext;
  reason: string;
  at: Date;
  explicitRestoration?: boolean;
}
export interface StatusTransitionDecision {
  allowed: boolean;
  code: string;
  sessionsMustRevoke: boolean;
  administrativeApprovalRequired: boolean;
  auditAction: string;
}
const allowed: Record<AccountStatus, AccountStatus[]> = {
  PENDING_REVIEW: ['ACTIVE', 'DEACTIVATED', 'RESTRICTED', 'SUSPENDED', 'CLOSED'],
  ACTIVE: ['DEACTIVATED', 'RESTRICTED', 'SUSPENDED', 'CLOSED'],
  DEACTIVATED: ['ACTIVE', 'CLOSED'],
  RESTRICTED: ['ACTIVE', 'DEACTIVATED', 'SUSPENDED', 'CLOSED'],
  SUSPENDED: ['ACTIVE', 'DEACTIVATED', 'CLOSED'],
  CLOSED: [],
};
export function evaluateAccountStatusTransition(
  input: StatusTransitionRequest,
): StatusTransitionDecision {
  const admin = input.actor.roles.includes('ADMIN');
  if (!input.reason.trim())
    return {
      allowed: false,
      code: 'REASON_REQUIRED',
      sessionsMustRevoke: false,
      administrativeApprovalRequired: true,
      auditAction: 'account.status.change.denied',
    };
  if (!allowed[input.current].includes(input.requested))
    return {
      allowed: false,
      code: 'INVALID_ACCOUNT_TRANSITION',
      sessionsMustRevoke: false,
      administrativeApprovalRequired: true,
      auditAction: 'account.status.change.denied',
    };
  if (
    !admin ||
    (input.current === 'SUSPENDED' &&
      input.requested === 'ACTIVE' &&
      !input.explicitRestoration)
  )
    return {
      allowed: false,
      code: 'ADMIN_APPROVAL_REQUIRED',
      sessionsMustRevoke: false,
      administrativeApprovalRequired: true,
      auditAction: 'account.status.change.denied',
    };
  return {
    allowed: true,
    code: 'ALLOWED',
    sessionsMustRevoke:
      input.requested === 'RESTRICTED' ||
      input.requested === 'SUSPENDED' ||
      input.requested === 'CLOSED',
    administrativeApprovalRequired: false,
    auditAction: 'account.status.changed',
  };
}
