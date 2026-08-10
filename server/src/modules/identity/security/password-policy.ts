export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordPolicyDecision {
  valid: boolean;
  code?: 'PASSWORD_REQUIRED' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG';
}

/** Passwords are never trimmed: whitespace can be intentional password-manager output. */
export function validatePasswordPolicy(
  password: string,
): PasswordPolicyDecision {
  if (password.length === 0 || password.trim().length === 0)
    return { valid: false, code: 'PASSWORD_REQUIRED' };
  if (password.length < PASSWORD_MIN_LENGTH)
    return { valid: false, code: 'PASSWORD_TOO_SHORT' };
  if (password.length > PASSWORD_MAX_LENGTH)
    return { valid: false, code: 'PASSWORD_TOO_LONG' };
  return { valid: true };
}
