const sensitive = /token|secret|password|authorization|cookie|api[-_]?key/i;
export type LogFields = Record<string, unknown>;
function redact(value: unknown, key = ''): unknown {
  if (sensitive.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as LogFields).map(([k, v]) => [k, redact(v, k)]));
  return value;
}
export class Logger {
  info(event: string, fields: LogFields = {}): void { this.write('info', event, fields); }
  warn(event: string, fields: LogFields = {}): void { this.write('warn', event, fields); }
  error(event: string, fields: LogFields = {}): void { this.write('error', event, fields); }
  private write(level: string, event: string, fields: LogFields): void { process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...(redact(fields) as LogFields) })}\n`); }
}
