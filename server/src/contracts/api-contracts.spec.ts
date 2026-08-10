import {
  cryptoAmountSchema,
  errorEnvelopeSchema,
  identityErrorHttpStatus,
  isoTimestampSchema,
  moneySchema,
  opaqueIdSchema,
  paginationSchema,
  toPublicUser,
} from './api-contracts';
describe('wire contracts', () => {
  it('uses safe money, crypto, IDs, timestamps and pagination', () => {
    expect(
      moneySchema.safeParse({ amount: 1.5, currency: 'GBP' }).success,
    ).toBe(false);
    expect(
      cryptoAmountSchema.safeParse({ asset: 'USDC', amount: 1.2 }).success,
    ).toBe(false);
    expect(opaqueIdSchema.safeParse('').success).toBe(false);
    expect(isoTimestampSchema.safeParse('2026-01-01').success).toBe(false);
    expect(
      paginationSchema(opaqueIdSchema).safeParse({
        data: ['a'],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });
  it('keeps internal identity fields out of public responses', () => {
    const value = toPublicUser({
      id: 'u',
      email: 'user@example.test',
      createdAt: new Date('2026-06-12T00:00:00.000Z'),
      emailVerifiedAt: null,
      accountStatus: 'ACTIVE',
      profile: {
        displayName: 'User',
        publicUsername: null,
        avatarReference: null,
        countryCode: 'GB',
        preferredCurrency: 'USD',
        timezone: 'Europe/London',
      },
      roles: ['USER'],
    });
    expect(value).not.toHaveProperty('normalizedEmail');
    expect(JSON.stringify(value)).not.toContain('password');
  });
  it('uses request IDs and safe HTTP error mappings', () => {
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: 'FORBIDDEN', message: 'No.' },
        requestId: 'c1b32d9e-4920-4a5a-bd56-4d98663cd0f4',
        path: '/api/v1/example',
        timestamp: '2026-08-05T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(identityErrorHttpStatus.DEPENDENCY_UNAVAILABLE).toBe(503);
  });
});
