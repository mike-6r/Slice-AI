import type { AppConfig } from '../../../config/app-config';
import { TwoFactorCryptoService } from './two-factor-crypto.service';
import {
  generateTotpForTest,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './two-factor.service';
import { authenticator } from 'otplib';

describe('two-factor cryptographic primitives', () => {
  const config = {
    environment: 'test',
    twoFactorEncryptionKey: 'two-factor-unit-test-key-that-is-long-enough',
  } as AppConfig;

  it('encrypts a TOTP secret with user-bound authenticated encryption', async () => {
    const crypto = new TwoFactorCryptoService(config);
    const secret = authenticator.generateSecret(20);
    const ciphertext = crypto.encrypt(secret, 'user-a');
    expect(ciphertext).not.toContain(secret);
    expect(crypto.decrypt(ciphertext, 'user-a')).toBe(secret);
    expect(() => crypto.decrypt(ciphertext, 'user-b')).toThrow();
    expect(await generateTotpForTest(secret)).toMatch(/^\d{6}$/);
  });

  it('normalizes human-entered recovery codes before hashing', () => {
    expect(normalizeRecoveryCode('ab12-cd34 ef56')).toBe('AB12CD34EF56');
    expect(hashRecoveryCode('ab12-cd34')).toBe(hashRecoveryCode('AB12CD34'));
    expect(hashRecoveryCode('ab12-cd34')).toMatch(/^[a-f0-9]{64}$/);
  });
});
