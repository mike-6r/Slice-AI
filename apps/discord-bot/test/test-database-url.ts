import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function configuredValue(): string | undefined {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const path = resolve(process.cwd(), '../../server/.env');
  try {
    const match = readFileSync(path, 'utf8').match(/^\s*TEST_DATABASE_URL\s*=\s*(.+?)\s*$/m);
    return match?.[1]?.replace(/^['"]|['"]$/g, '');
  } catch {
    return undefined;
  }
}

export function testDatabaseUrl(): string {
  const value = configuredValue();
  if (!value) throw new Error('TEST_DATABASE_URL is required for integration tests.');
  let database: string;
  try {
    database = decodeURIComponent(new URL(value).pathname).replace(/^\/+/, '');
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (database !== 'slice_test') throw new Error('Integration tests may run only against the slice_test database.');
  return value;
}
