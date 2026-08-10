export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  needsRehash(hash: string): boolean;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export interface AccessTokenIssuer {
  issue(input: { subject: string; sessionId: string }): Promise<string>;
  verify(token: string): Promise<{ subject: string; sessionId: string } | null>;
}
export interface RefreshTokenGenerator {
  generate(): string;
  hash(token: string): Promise<string>;
  compare(hash: string, token: string): Promise<boolean>;
}
export interface EmailVerificationProvider {
  createVerificationChallenge(): Promise<{ token: string; expiresAt: Date }>;
  sendVerification(input: { email: string; token: string }): Promise<void>;
  verifyChallenge(token: string): Promise<boolean>;
}
export interface PasswordResetProvider {
  createResetChallenge(): Promise<{ token: string; expiresAt: Date }>;
  sendReset(input: { email: string; token: string }): Promise<void>;
  verifyResetChallenge(token: string): Promise<boolean>;
}
export interface Clock {
  now(): Date;
}
export interface RandomTokenGenerator {
  generateSecureToken(): string;
}
