import * as argon2 from 'argon2';
import { z } from 'zod';
import type { PasswordHasher } from '../ports/security.ports';

const settingsSchema = z.object({
  memoryCost: z.number().int().min(19_456),
  timeCost: z.number().int().min(2),
  parallelism: z.number().int().min(1),
});
export type PasswordHashingSettings = z.infer<typeof settingsSchema>;

export const productionPasswordHashingSettings: PasswordHashingSettings = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
};
export const testPasswordHashingSettings: PasswordHashingSettings = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export class Argon2idPasswordHasher implements PasswordHasher {
  private readonly settings: PasswordHashingSettings;
  constructor(
    settings: PasswordHashingSettings = productionPasswordHashingSettings,
  ) {
    this.settings = settingsSchema.parse(settings);
  }
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, ...this.settings });
  }
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, this.settings);
    } catch {
      return true;
    }
  }
}
