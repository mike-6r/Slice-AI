import { z } from 'zod';
export const opaqueIdSchema = z.string().min(1).max(128);
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const moneySchema = z
  .object({ amount: z.number().int(), currency: z.literal('GBP') })
  .strict();
export const cryptoAmountSchema = z
  .object({
    asset: z.literal('USDC'),
    amount: z.string().regex(/^\d+(?:\.\d+)?$/),
  })
  .strict();
export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        fieldErrors: z.record(z.array(z.string())).optional(),
      })
      .strict(),
    requestId: opaqueIdSchema,
    path: z.string(),
    timestamp: isoTimestampSchema,
  })
  .strict();
export const paginationSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), nextCursor: z.string().nullable() }).strict();
export const publicProfileSchema = z
  .object({
    displayName: z.string(),
    username: z.string().nullable(),
    usernameChangedAt: isoTimestampSchema.nullable(),
    avatarReference: z.string().nullable(),
    countryCode: z.string(),
    preferredCurrency: z.enum(['GBP', 'USD', 'CAD', 'EUR']),
    timezone: z.string(),
  })
  .strict();
export const publicUserSchema = z
  .object({
    id: opaqueIdSchema,
    email: z.string().email(),
    createdAt: isoTimestampSchema,
    emailVerificationStatus: z.enum(['UNVERIFIED', 'VERIFIED']),
    accountStatus: z.enum([
      'PENDING_REVIEW',
      'ACTIVE',
      'RESTRICTED',
      'SUSPENDED',
      'CLOSED',
    ]),
    profile: publicProfileSchema,
    roles: z.array(z.string()),
  })
  .strict();
export const publicSessionSchema = z
  .object({
    id: opaqueIdSchema,
    issuedAt: isoTimestampSchema,
    expiresAt: isoTimestampSchema,
    lastActivityAt: isoTimestampSchema,
    userAgent: z.string().nullable(),
  })
  .strict();
export const identityErrorHttpStatus: Record<string, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_UNAVAILABLE: 403,
  EMAIL_ALREADY_REGISTERED: 409,
  USERNAME_UNAVAILABLE: 409,
  USERNAME_CHANGE_COOLDOWN: 409,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  REFRESH_REUSE_DETECTED: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_ACCOUNT_TRANSITION: 409,
  ROLE_ALREADY_ASSIGNED: 409,
  ROLE_NOT_ASSIGNED: 404,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
};
export function toPublicUser(record: {
  id: string;
  email: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  accountStatus: string;
  profile: {
    displayName: string;
    publicUsername: string | null;
    usernameChangedAt: Date | null;
    avatarReference: string | null;
    countryCode: string;
    preferredCurrency: string;
    timezone: string;
  };
  roles: string[];
}) {
  return {
    id: record.id,
    email: record.email,
    createdAt: record.createdAt.toISOString(),
    emailVerificationStatus: record.emailVerifiedAt ? 'VERIFIED' : 'UNVERIFIED',
    accountStatus: record.accountStatus,
    profile: {
      displayName: record.profile.displayName,
      username: record.profile.publicUsername,
      usernameChangedAt:
        record.profile.usernameChangedAt?.toISOString() ?? null,
      avatarReference: record.profile.avatarReference,
      countryCode: record.profile.countryCode,
      preferredCurrency:
        record.profile.preferredCurrency === 'USD' ||
        record.profile.preferredCurrency === 'CAD' ||
        record.profile.preferredCurrency === 'EUR'
          ? record.profile.preferredCurrency
          : 'GBP',
      timezone: record.profile.timezone,
    },
    roles: record.roles,
  };
}
