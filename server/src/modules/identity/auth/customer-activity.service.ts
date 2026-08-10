import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Actor } from './auth.service';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
  type AuditWrite,
} from '../ports/repositories';

const customerActions = [
  'AUTH_SIGNUP_SUCCEEDED',
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_PASSWORD_CHANGED',
  'EMAIL_VERIFICATION_SENT',
  'EMAIL_VERIFICATION_RESENT',
  'EMAIL_VERIFIED',
  'TWO_FACTOR_ENABLED',
  'TWO_FACTOR_DISABLED',
  'TWO_FACTOR_RECOVERY_CODES_REGENERATED',
  'SESSION_REVOKED',
  'OTHER_SESSIONS_REVOKED',
  'AUTH_PROFILE_UPDATED',
  'ACCOUNT_PREFERENCES_UPDATED',
  'DISCORD_ACCOUNT_LINKED',
  'DISCORD_ACCOUNT_UNLINKED',
  'PLAID_BANK_CONNECTED',
  'DATA_EXPORT_REQUESTED',
  'ACCOUNT_DEACTIVATED',
  'ACCOUNT_DELETION_REQUESTED',
  'ACCOUNT_DELETION_CANCELLED',
  'PHONE_VERIFICATION_SENT',
  'PHONE_VERIFICATION_RESENT',
  'PHONE_VERIFIED',
  'PHONE_CHANGED',
] as const;

type CustomerAction = (typeof customerActions)[number];

export type CustomerActivityItem = {
  reference: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
  context: null;
  metadata: Record<string, never>;
};

@Injectable()
export class CustomerActivityService {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly audit: AuditEventRepository,
  ) {}

  async list(
    actor: Actor,
    input: { cursor?: string; limit?: number },
  ): Promise<{ items: CustomerActivityItem[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const events = await this.audit.query({
      actorUserId: actor.userId,
      actions: customerActions,
      before: input.cursor ? decodeCursor(input.cursor) : undefined,
      limit: limit + 1,
    });
    const page = events.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toCustomerActivity),
      nextCursor: events.length > limit && last ? encodeCursor(last) : null,
    };
  }
}

function toCustomerActivity(event: AuditWrite): CustomerActivityItem {
  const item = activityCopy(event.action as CustomerAction);
  return {
    reference: `activity_${createHash('sha256').update(event.id).digest('base64url').slice(0, 24)}`,
    type: item.type,
    title: item.title,
    description: item.description,
    createdAt: event.createdAt.toISOString(),
    context: null,
    // Audit metadata is intentionally not part of the customer projection.
    metadata: {},
  };
}

function activityCopy(action: CustomerAction) {
  switch (action) {
    case 'AUTH_SIGNUP_SUCCEEDED': return { type: 'ACCOUNT_CREATED', title: 'Account created', description: 'Your Slice account was created.' };
    case 'AUTH_LOGIN_SUCCEEDED': return { type: 'LOGIN', title: 'Signed in', description: 'You signed in to your account.' };
    case 'AUTH_PASSWORD_CHANGED': return { type: 'PASSWORD_CHANGED', title: 'Password changed', description: 'Your account password was changed.' };
    case 'EMAIL_VERIFICATION_SENT':
    case 'EMAIL_VERIFICATION_RESENT': return { type: 'EMAIL_VERIFICATION_REQUESTED', title: 'Verification email sent', description: 'A verification email was requested for your account.' };
    case 'EMAIL_VERIFIED': return { type: 'EMAIL_VERIFIED', title: 'Email verified', description: 'Your email address was verified.' };
    case 'TWO_FACTOR_ENABLED': return { type: 'TWO_FACTOR_ENABLED', title: 'Two-factor authentication enabled', description: 'Two-factor authentication was enabled.' };
    case 'TWO_FACTOR_DISABLED': return { type: 'TWO_FACTOR_DISABLED', title: 'Two-factor authentication disabled', description: 'Two-factor authentication was disabled.' };
    case 'TWO_FACTOR_RECOVERY_CODES_REGENERATED': return { type: 'RECOVERY_CODES_REGENERATED', title: 'Recovery codes regenerated', description: 'New two-factor recovery codes were generated.' };
    case 'SESSION_REVOKED': return { type: 'SESSION_REVOKED', title: 'Session revoked', description: 'A signed-in session was revoked.' };
    case 'OTHER_SESSIONS_REVOKED': return { type: 'OTHER_SESSIONS_REVOKED', title: 'Other sessions revoked', description: 'Other signed-in sessions were revoked.' };
    case 'AUTH_PROFILE_UPDATED': return { type: 'PROFILE_UPDATED', title: 'Profile updated', description: 'Your profile information was updated.' };
    case 'ACCOUNT_PREFERENCES_UPDATED': return { type: 'PREFERENCES_UPDATED', title: 'Preferences updated', description: 'Your account preferences were updated.' };
    case 'DISCORD_ACCOUNT_LINKED': return { type: 'DISCORD_LINKED', title: 'Discord linked', description: 'A Discord account was linked.' };
    case 'DISCORD_ACCOUNT_UNLINKED': return { type: 'DISCORD_UNLINKED', title: 'Discord unlinked', description: 'Your Discord account was unlinked.' };
    case 'PLAID_BANK_CONNECTED': return { type: 'BANK_LINKED', title: 'Bank connected', description: 'A bank account was connected.' };
    case 'DATA_EXPORT_REQUESTED': return { type: 'DATA_EXPORT_REQUESTED', title: 'Data export requested', description: 'Your account data export was generated.' };
    case 'ACCOUNT_DEACTIVATED': return { type: 'ACCOUNT_DEACTIVATED', title: 'Account deactivated', description: 'Your account was deactivated.' };
    case 'ACCOUNT_DELETION_REQUESTED': return { type: 'DELETION_REQUESTED', title: 'Deletion requested', description: 'Your account deletion request was recorded.' };
    case 'ACCOUNT_DELETION_CANCELLED': return { type: 'DELETION_CANCELLED', title: 'Deletion request cancelled', description: 'Your account deletion request was cancelled.' };
    case 'PHONE_VERIFICATION_SENT':
    case 'PHONE_VERIFICATION_RESENT': return { type: 'PHONE_VERIFICATION_REQUESTED', title: 'Phone verification requested', description: 'A phone verification code was requested.' };
    case 'PHONE_VERIFIED': return { type: 'PHONE_VERIFIED', title: 'Phone verified', description: 'Your phone number was verified.' };
    case 'PHONE_CHANGED': return { type: 'PHONE_CHANGED', title: 'Phone changed', description: 'Your verified phone number was changed.' };
  }
}

function encodeCursor(event: AuditWrite) {
  return Buffer.from(`${event.createdAt.toISOString()}|${event.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const [createdAt, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const date = new Date(createdAt);
    if (extra || !id || Number.isNaN(date.getTime())) throw new Error('invalid');
    return { createdAt: date, id };
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  }
}
