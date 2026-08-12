import { BadRequestException } from '@nestjs/common';
import { AccountPreferencesService } from './account-preferences.service';
import { CustomerActivityService } from './customer-activity.service';
import { activityQuerySchema, preferencesUpdateSchema } from '../dto/identity.schemas';

const actor = {
  userId: 'user-a', sessionId: 'session-a', status: 'ACTIVE', roles: [],
  sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date(),
} as never;

describe('account preferences and customer activity', () => {
  it('validates the supported, bounded preference shape', () => {
    expect(preferencesUpdateSchema.safeParse({ timezone: 'America/New_York', locale: 'en-US' }).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({ timezone: 'not/a-zone' }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({ currency: 'USD' }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('normalizes and persists only allowed preference fields', async () => {
    const updateProfile = jest.fn().mockResolvedValue({ profile: { timezone: 'America/New_York', locale: 'en-US' } });
    const uow = { withinTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ users: { updateProfile }, audit: { append: jest.fn() } }) };
    const service = new AccountPreferencesService(
      uow as never,
      { getProfile: jest.fn().mockResolvedValue(null) } as never,
      { run: async (_identity: unknown, _method: string, _route: string, _body: unknown, work: (tx: unknown) => Promise<unknown>) => ({ value: await work({ users: { updateProfile }, audit: { append: jest.fn() } }) }) } as never,
      { enforce: jest.fn() } as never,
    );
    await expect(service.get(actor)).resolves.toEqual({
      timezone: 'Europe/London',
      locale: 'en-GB',
      preferredCurrency: 'GBP',
    });
    await expect(
      service.update(
        actor,
        { timezone: 'America/New_York', locale: 'en-US' },
        '127.0.0.1',
        'request-a',
        'key-a',
      ),
    ).resolves.toEqual({
      timezone: 'America/New_York',
      locale: 'en-US',
      preferredCurrency: 'GBP',
    });
    expect(updateProfile).toHaveBeenCalledWith('user-a', { timezone: 'America/New_York', locale: 'en-US' });
  });

  it('returns only allowlisted activity and uses opaque references', async () => {
    const now = new Date('2026-08-09T12:00:00.000Z');
    const audit = { query: jest.fn().mockResolvedValue([
      { id: 'internal-audit-id', action: 'AUTH_LOGIN_SUCCEEDED', createdAt: now },
    ]) };
    const service = new CustomerActivityService(audit as never);
    const result = await service.list(actor, { limit: 20 });
    expect(audit.query).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'user-a', actions: expect.any(Array) }));
    expect(audit.query.mock.calls[0][0].actions).not.toContain('ACCESS_DENIED');
    expect(result.items).toEqual([expect.objectContaining({ type: 'LOGIN', metadata: {}, context: null })]);
    expect(JSON.stringify(result)).not.toContain('internal-audit-id');
  });

  it('rejects malformed activity cursors', async () => {
    const service = new CustomerActivityService({ query: jest.fn() } as never);
    await expect(service.list(actor, { cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
