const sensitiveKey =
  /authorization|cookie|password|token|secret|api[-_]?key|client[-_]?secret|payment|card|bank/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }

  return value;
}
