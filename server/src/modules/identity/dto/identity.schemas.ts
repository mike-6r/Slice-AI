import { z } from 'zod';
import { validatePasswordPolicy } from '../security/password-policy';
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const password = z
  .string()
  .refine(
    (value) => validatePasswordPolicy(value).valid,
    'Password does not meet policy.',
  );
export const usernamePattern = /^[a-z0-9_]{3,30}$/;
export const reservedUsernames = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'slice',
  'slicecollectable',
  'staff',
  'system',
  'api',
  'root',
]);
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .refine(
    (value) => usernamePattern.test(value),
    'Use 3–30 letters, numbers, or underscores.',
  )
  .refine(
    (value) => !reservedUsernames.has(value),
    'That username is reserved.',
  );
export const signupSchema = z
  .object({
    email: z.string().email().transform(normalizeEmail),
    password,
    displayName: z.string().trim().min(2).max(80),
    username: usernameSchema,
    // The server determines whether CAPTCHA and consent are required.  These
    // fields remain optional at DTO parse time so a production-safe canonical
    // error can be returned rather than silently substituting client defaults.
    captchaToken: z.string().trim().min(8).max(4096).optional(),
    consent: z
      .object({
        termsAccepted: z.literal(true),
        privacyAccepted: z.literal(true),
        termsVersion: z.string().trim().min(1).max(128),
        privacyVersion: z.string().trim().min(1).max(128),
      })
      .strict()
      .optional(),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z.string().email().transform(normalizeEmail),
    password: z.string().min(1).max(128),
  })
  .strict();
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict();
export const recentAuthSchema = z
  .object({ password: z.string().min(1).max(128) })
  .strict();
export const passwordResetRequestSchema = z
  .object({ email: z.string().email().transform(normalizeEmail) })
  .strict();
export const passwordResetConfirmSchema = z
  .object({ token: z.string().min(40).max(256), newPassword: password })
  .strict();
export const twoFactorCodeSchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const twoFactorChallengeSchema = z
  .object({
    challenge: z.string().min(40).max(256),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recoveryCode: z.string().min(12).max(64).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode), {
    message: 'Provide exactly one verification method.',
  });
export const twoFactorResendSchema = z
  .object({ challenge: z.string().min(40).max(256) })
  .strict();
export const twoFactorDisableSchema = z
  .object({
    method: z.enum(['TOTP', 'SMS']).optional(),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recoveryCode: z.string().min(12).max(64).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.method === 'SMS' ||
      Boolean(value.code) !== Boolean(value.recoveryCode),
    { message: 'Provide a current authenticator or recovery code.' },
  );
export const refreshSchema = z
  .object({ refreshToken: z.string().min(32).max(2048) })
  .strict();
export const logoutSchema = z.object({ sessionId: z.string().min(1) }).strict();
export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    username: usernameSchema.optional(),
    avatarReference: z.string().url().optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    timezone: z
      .string()
      .refine((v) => {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: v });
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
    preferredCurrency: z.enum(['GBP', 'USD', 'CAD', 'EUR']).optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    'At least one profile field is required.',
  );
export const usernameAvailabilitySchema = z
  .object({ username: usernameSchema })
  .strict();

const isIanaTimezone = (value: string) => {
  try {
    Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const preferencesUpdateSchema = z
  .object({
    timezone: z.string().min(1).max(64).refine(isIanaTimezone).optional(),
    locale: z.enum(['en-GB', 'en-US']).optional(),
    preferredCurrency: z.enum(['GBP', 'USD', 'CAD', 'EUR']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one preference is required.',
  });

export const activityQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export const dataExportSchema = z
  .object({ confirmation: z.literal('EXPORT_MY_DATA') })
  .strict();
export const deactivateAccountSchema = z
  .object({
    confirmation: z.literal('DEACTIVATE_MY_ACCOUNT'),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export const deletionRequestSchema = z
  .object({
    confirmation: z.literal('DELETE_MY_ACCOUNT'),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export const emptyObjectSchema = z.object({}).strict();
export const roleAssignmentSchema = z
  .object({
    role: z.enum([
      'USER',
      'SUPPORT',
      'COMPLIANCE_ANALYST',
      'ASSET_REVIEWER',
      'VAULT_OPERATOR',
      'FINANCE_OPERATOR',
      'ADMIN',
    ]),
  })
  .strict();
export const accountStatusChangeSchema = z
  .object({
    status: z.enum([
      'PENDING_REVIEW',
      'ACTIVE',
      'RESTRICTED',
      'SUSPENDED',
      'CLOSED',
    ]),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
