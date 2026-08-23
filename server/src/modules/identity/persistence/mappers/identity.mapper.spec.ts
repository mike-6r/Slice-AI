import {
  mapIdentitySession,
  mapIdentityUser,
  toPublicIdentityUser,
} from './identity.mapper';

describe('identity persistence mappers', () => {
  const record = {
    id: 'user-1',
    email: 'user@example.test',
    normalizedEmail: 'user@example.test',
    passwordHash: 'argon2id$private',
    emailVerifiedAt: null,
    accountStatus: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    lastLoginAt: null,
    profile: {
      displayName: 'User',
      publicUsername: null,
      usernameChangedAt: null,
      avatarReference: null,
      countryCode: 'GB',
      preferredCurrency: 'GBP',
      timezone: 'Europe/London',
    },
  };

  it('maps validated persistence records and never exposes private fields publicly', () => {
    const user = mapIdentityUser(record);
    const publicUser = toPublicIdentityUser(user, ['USER']);

    expect(publicUser).toMatchObject({
      id: 'user-1',
      emailVerificationStatus: 'UNVERIFIED',
      roles: ['USER'],
    });
    expect(JSON.stringify(publicUser)).not.toContain('passwordHash');
    expect(JSON.stringify(publicUser)).not.toContain('normalizedEmail');
  });

  it('rejects corrupt enum values and invalid session records', () => {
    expect(() =>
      mapIdentityUser({ ...record, accountStatus: 'UNKNOWN' }),
    ).toThrow('CORRUPT_PERSISTED_IDENTITY');
    expect(() =>
      mapIdentitySession({
        id: 'session-1',
        publicId: 'session_public-1',
        userId: 'user-1',
        tokenHash: 'private',
        familyId: 'family-1',
        replacedBySessionId: null,
        issuedAt: new Date(),
        authenticatedAt: new Date(),
        recentAuthAt: null,
        expiresAt: new Date(),
        revokedAt: null,
        revocationReason: 'NOT_A_REASON',
        lastActivityAt: new Date(),
        userAgent: null,
        ipHash: null,
      }),
    ).toThrow('CORRUPT_PERSISTED_IDENTITY');
  });
});
