import {
  TestAccessTokenIssuer,
  TestClock,
  TestRedisStore,
  TestRefreshTokenGenerator,
} from '../../../../test/doubles/identity.doubles';
import { RedisUnavailableStore } from '../../../infrastructure/redis/redis.store';
import {
  Argon2idPasswordHasher,
  productionPasswordHashingSettings,
  testPasswordHashingSettings,
} from './argon2id-password-hasher';
import { validatePasswordPolicy } from './password-policy';

describe('password and offline security foundations', () => {
  const hasher = new Argon2idPasswordHasher(testPasswordHashingSettings);
  it('uses salted Argon2id hashes and verifies safely', async () => {
    const a = await hasher.hash('correct horse battery staple');
    const b = await hasher.hash('correct horse battery staple');
    expect(a).not.toContain('correct horse');
    expect(a).not.toBe(b);
    await expect(
      hasher.verify(a, 'correct horse battery staple'),
    ).resolves.toBe(true);
    await expect(hasher.verify(a, 'wrong password')).resolves.toBe(false);
    await expect(hasher.verify('malformed', 'wrong password')).resolves.toBe(
      false,
    );
    const weak = new Argon2idPasswordHasher({
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    expect(
      new Argon2idPasswordHasher(productionPasswordHashingSettings).needsRehash(
        await weak.hash('correct horse battery staple'),
      ),
    ).toBe(true);
  });
  it('enforces the password policy without trimming valid characters', () => {
    expect(validatePasswordPolicy(' '.repeat(12)).valid).toBe(false);
    expect(validatePasswordPolicy('short').valid).toBe(false);
    expect(validatePasswordPolicy('x'.repeat(129)).valid).toBe(false);
    expect(validatePasswordPolicy('  valid password  ').valid).toBe(true);
  });
  it('keeps test doubles explicit and deterministic', async () => {
    const issuer = new TestAccessTokenIssuer();
    await expect(
      issuer.verify(await issuer.issue({ subject: 'u', sessionId: 's' })),
    ).resolves.toEqual({ subject: 'u', sessionId: 's' });
    const refresh = new TestRefreshTokenGenerator();
    expect(
      await refresh.compare(
        await refresh.hash(refresh.generate()),
        refresh.generate(),
      ),
    ).toBe(true);
    const clock = new TestClock(new Date(0));
    expect(clock.now().getTime()).toBe(0);
    const redis = new TestRedisStore();
    await redis.increment('counter');
    expect(await redis.get('counter')).toBe('1');
  });
  it('does not silently fall back when Redis is unavailable', async () => {
    await expect(new RedisUnavailableStore().get('key')).rejects.toThrow(
      'Redis is not configured',
    );
  });
});
