/** Test-only doubles. They are intentionally not exported by production modules or selected at runtime. */
import type {
  AccessTokenIssuer,
  Clock,
  EmailVerificationProvider,
  PasswordHasher,
  PasswordResetProvider,
  RandomTokenGenerator,
  RefreshTokenGenerator,
} from '../../src/modules/identity/ports/security.ports';
import type { RedisStore } from '../../src/infrastructure/redis/redis.store';
export class TestPasswordHasher implements PasswordHasher {
  async hash(value: string) {
    return `test-hash:${value}`;
  }
  async verify(hash: string, value: string) {
    return hash === `test-hash:${value}`;
  }
  needsRehash() {
    return false;
  }
}
export class TestAccessTokenIssuer implements AccessTokenIssuer {
  async issue(input: { subject: string; sessionId: string }) {
    return `test-access:${input.subject}:${input.sessionId}`;
  }
  async verify(token: string) {
    const p = token.split(':');
    return p[0] === 'test-access' && p.length === 3
      ? { subject: p[1], sessionId: p[2] }
      : null;
  }
}
export class TestRefreshTokenGenerator implements RefreshTokenGenerator {
  constructor(private readonly token = 'test-refresh-token') {}
  generate() {
    return this.token;
  }
  async hash(value: string) {
    return `test-refresh-hash:${value}`;
  }
  async compare(hash: string, value: string) {
    return hash === `test-refresh-hash:${value}`;
  }
}
export class TestClock implements Clock {
  constructor(private value: Date) {}
  now() {
    return this.value;
  }
  set(value: Date) {
    this.value = value;
  }
}
export class TestRandomTokenGenerator implements RandomTokenGenerator {
  constructor(private readonly token = 'test-only-random-token') {}
  generateSecureToken() {
    return this.token;
  }
}
export class TestEmailVerificationProvider implements EmailVerificationProvider {
  async createVerificationChallenge() {
    return { token: 'test-verification-token', expiresAt: new Date(0) };
  }
  async sendVerification() {}
  async verifyChallenge(token: string) {
    return token === 'test-verification-token';
  }
}
export class TestPasswordResetProvider implements PasswordResetProvider {
  async createResetChallenge() {
    return { token: 'test-reset-token', expiresAt: new Date(0) };
  }
  async sendReset() {}
  async verifyResetChallenge(token: string) {
    return token === 'test-reset-token';
  }
}
export class TestRedisStore implements RedisStore {
  private readonly values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
  async exists(key: string) {
    return this.values.has(key);
  }
  async expire() {}
  async increment(key: string) {
    const next = Number(this.values.get(key) ?? 0) + 1;
    this.values.set(key, String(next));
    return next;
  }
}
