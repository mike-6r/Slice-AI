import { createHash } from 'node:crypto';
export type IdempotencyState = 'PROCESSING' | 'COMPLETED' | 'FAILED';
export interface IdempotencyRecord {
  key: string;
  fingerprint: string;
  state: IdempotencyState;
  expiresAt: Date;
}
export const fingerprintRequest = (
  method: string,
  path: string,
  body: unknown,
) =>
  createHash('sha256').update(stableJson({ method, path, body })).digest('hex');
export function evaluateIdempotency(
  record: IdempotencyRecord | undefined,
  fingerprint: string,
  now: Date,
) {
  if (!record || record.expiresAt <= now) return 'FIRST' as const;
  if (record.fingerprint !== fingerprint) return 'CONFLICT' as const;
  return record.state === 'COMPLETED'
    ? ('REPLAY_RESULT' as const)
    : record.state === 'PROCESSING'
      ? ('IN_PROGRESS' as const)
      : ('RETRY_ALLOWED' as const);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
