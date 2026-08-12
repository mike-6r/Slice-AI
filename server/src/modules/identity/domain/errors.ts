export type IdentityErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'REFRESH_REUSE_DETECTED'
  | 'FORBIDDEN'
  | 'INVALID_ACCOUNT_TRANSITION'
  | 'DUPLICATE_EMAIL'
  | 'DUPLICATE_USERNAME'
  | 'VALIDATION_FAILED'
  | 'IDENTITY_EMAIL_CONFLICT'
  | 'IDENTITY_NOT_FOUND'
  | 'SESSION_TOKEN_CONFLICT'
  | 'SESSION_NOT_FOUND'
  | 'ROLE_ASSIGNMENT_CONFLICT'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'PERSISTENCE_CONFLICT'
  | 'PERSISTENCE_UNAVAILABLE'
  | 'CORRUPT_PERSISTED_IDENTITY';
export const safeIdentityMessage = (code: IdentityErrorCode) =>
  ({
    INVALID_CREDENTIALS: 'Invalid email or password.',
    ACCOUNT_UNAVAILABLE: 'This account is unavailable.',
    SESSION_EXPIRED: 'Your session has expired.',
    SESSION_REVOKED: 'Your session is no longer valid.',
    REFRESH_REUSE_DETECTED: 'Your session is no longer valid.',
    FORBIDDEN: 'You do not have permission to perform that action.',
    INVALID_ACCOUNT_TRANSITION: 'The requested account change is not allowed.',
    DUPLICATE_EMAIL: 'Unable to create this account.',
    DUPLICATE_USERNAME: 'That username is unavailable.',
    VALIDATION_FAILED: 'Please correct the highlighted fields.',
    IDENTITY_EMAIL_CONFLICT: 'Unable to create this account.',
    IDENTITY_NOT_FOUND: 'The requested account was not found.',
    SESSION_TOKEN_CONFLICT: 'The request could not be completed.',
    SESSION_NOT_FOUND: 'Your session is no longer valid.',
    ROLE_ASSIGNMENT_CONFLICT: 'The requested role is already assigned.',
    IDEMPOTENCY_KEY_CONFLICT:
      'The request key cannot be reused for this operation.',
    PERSISTENCE_CONFLICT: 'The request could not be completed. Please retry.',
    PERSISTENCE_UNAVAILABLE: 'The service is temporarily unavailable.',
    CORRUPT_PERSISTED_IDENTITY: 'The request could not be completed.',
  })[code];

export class IdentityDomainError extends Error {
  constructor(
    readonly code: IdentityErrorCode,
    readonly retryable = false,
  ) {
    super(safeIdentityMessage(code));
    this.name = 'IdentityDomainError';
  }
}

export class RepositoryConflict extends IdentityDomainError {
  constructor(
    code: Extract<
      IdentityErrorCode,
      | 'IDENTITY_EMAIL_CONFLICT'
      | 'DUPLICATE_USERNAME'
      | 'SESSION_TOKEN_CONFLICT'
      | 'ROLE_ASSIGNMENT_CONFLICT'
      | 'IDEMPOTENCY_KEY_CONFLICT'
      | 'PERSISTENCE_CONFLICT'
    >,
    retryable = false,
  ) {
    super(code, retryable);
    this.name = 'RepositoryConflict';
  }
}

export class RepositoryNotFound extends IdentityDomainError {
  constructor(
    code: Extract<
      IdentityErrorCode,
      'IDENTITY_NOT_FOUND' | 'SESSION_NOT_FOUND'
    >,
  ) {
    super(code);
    this.name = 'RepositoryNotFound';
  }
}

export class RepositorySerializationFailure extends IdentityDomainError {
  constructor() {
    super('PERSISTENCE_CONFLICT', true);
    this.name = 'RepositorySerializationFailure';
  }
}
