import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';

@Injectable()
export class TwoFactorCryptoService {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const material =
      config.twoFactorEncryptionKey ??
      'slice-local-two-factor-encryption-key-not-production';
    this.key = createHash('sha256').update(material).digest();
  }

  encrypt(secret: string, userId: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`two-factor:${userId}`));
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64url',
    );
  }

  decrypt(ciphertext: string, userId: string) {
    const raw = Buffer.from(ciphertext, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      raw.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(`two-factor:${userId}`));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
  }
}
