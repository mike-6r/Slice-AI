import type { ActorContext, Permission, UserId } from './identity.types';
export interface PolicyRequest {
  actor: ActorContext;
  action: Permission;
  resourceOwnerId?: UserId;
  targetUserId?: UserId;
  targetRoles?: string[];
}
export interface PolicyDecision {
  allowed: boolean;
  code: string;
  message: string;
  auditAction: string;
  requiredConditions?: string[];
}
export function evaluatePolicy(input: PolicyRequest): PolicyDecision {
  const { actor, action } = input;
  const own = Boolean(actor.userId && input.resourceOwnerId === actor.userId);
  const admin = actor.roles.includes('ADMIN');
  if (
    actor.accountStatus === 'DEACTIVATED' ||
    actor.accountStatus === 'SUSPENDED' ||
    actor.accountStatus === 'CLOSED'
  )
    return deny('ACCOUNT_UNAVAILABLE', action);
  if (actor.accountStatus === 'RESTRICTED') {
    if (action === 'profile.read.self' || action === 'session.revoke.self') {
      return own ? allow(action) : deny('ACCOUNT_RESTRICTED', action);
    }
    return deny('ACCOUNT_RESTRICTED', action);
  }
  if (action === 'profile.read.self' || action === 'profile.update.self')
    return own ? allow(action) : deny('FORBIDDEN', action);
  if (action === 'session.revoke.self')
    return own ? allow(action) : deny('FORBIDDEN', action);
  if (action === 'user.read.support' || action === 'users.read')
    return actor.roles.includes('SUPPORT') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (action === 'admin.console.read' || action === 'system.read')
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (action === 'users.roles.manage' || action === 'users.status.manage')
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (
    action === 'role.assign' ||
    action === 'role.remove' ||
    action === 'account.status.change' ||
    action === 'admin.access' ||
    action === 'audit.read' ||
    action === 'catalogue.manage'
  ) {
    if (!admin) return deny('FORBIDDEN', action);
    if (
      input.targetUserId === actor.userId &&
      input.targetRoles?.includes('ADMIN')
    )
      return deny('UNSAFE_SELF_ESCALATION', action);
    return allow(action);
  }
  if (action === 'submission.review')
    return actor.roles.includes('ASSET_REVIEWER') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (action === 'valuation.manage' || action === 'valuations.manage')
    return actor.roles.includes('COMPLIANCE_ANALYST') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (action === 'custody.manage')
    return actor.roles.includes('VAULT_OPERATOR') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (
    action === 'insurance.manage' ||
    action === 'publication.manage' ||
    action === 'publishing.manage'
  )
    return actor.roles.includes('COMPLIANCE_ANALYST') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (action === 'ownership.issue' || action === 'ownership.manage')
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (
    action === 'finance.manage' ||
    action === 'finance.read' ||
    action === 'finance.adjust'
  )
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (action === 'trading.manage')
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (action === 'compliance.read')
    return actor.roles.includes('COMPLIANCE_ANALYST') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (action === 'compliance.manage' || action === 'provider.manage')
    return actor.roles.includes('COMPLIANCE_ANALYST') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (action === 'support.manage')
    return actor.roles.includes('SUPPORT') || admin
      ? allow(action)
      : deny('FORBIDDEN', action);
  if (action === 'feature_flags.read' || action === 'integrations.read')
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (action === 'feature_flags.manage' || action === 'integrations.manage')
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (
    action === 'community.moderate' ||
    action === 'governance.manage' ||
    action === 'distribution.manage'
  )
    return admin ? allow(action) : deny('FORBIDDEN', action);
  if (action === 'session.revoke.other')
    return admin ? allow(action) : deny('FORBIDDEN', action);
  return deny('FORBIDDEN', action);
}
function allow(action: Permission): PolicyDecision {
  return {
    allowed: true,
    code: 'ALLOWED',
    message: 'Allowed.',
    auditAction: action,
  };
}
function deny(code: string, action: Permission): PolicyDecision {
  return {
    allowed: false,
    code,
    message:
      code === 'ACCOUNT_UNAVAILABLE'
        ? 'This account cannot perform that action.'
        : 'You do not have permission to perform that action.',
    auditAction: `${action}.denied`,
  };
}
