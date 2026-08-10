import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';

@Injectable()
export class ProviderCryptoService {
  private readonly key: Buffer;
  readonly keyVersion = 'v1';
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // Local/test data is disposable; production cannot start with this fallback.
    const material = config.providerEncryptionKey ?? 'slice-local-provider-encryption-key-not-production';
    this.key = createHash('sha256').update(material).digest();
  }
  hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  encrypt(value: string, context: string) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context)); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }
  decrypt(value: string, context: string) {
    const raw = Buffer.from(value, 'base64url'); const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
}
