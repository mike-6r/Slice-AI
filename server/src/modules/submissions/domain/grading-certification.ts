import { UnprocessableEntityException } from '@nestjs/common';

export type CertificationIdentity = {
  year?: string | null;
  set?: string | null;
  cardNumber?: string | null;
  name?: string | null;
  variant?: string | null;
  language?: string | null;
  companyCode?: string | null;
  grade?: string | null;
};

/**
 * Canonicalizes a cert for duplicate protection without changing the value
 * shown to the collector. Separators are ignored, leading zeroes are kept,
 * and no provider-specific prefix is guessed.
 */
export function normalizeCertificationNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function assertCertificationNumber(value: unknown): string {
  if (typeof value !== 'string')
    throw new UnprocessableEntityException({
      code: 'CERTIFICATION_NUMBER_REQUIRED',
      message: 'Enter the certification number shown on the slab label.',
    });
  const normalized = normalizeCertificationNumber(value);
  if (normalized.length < 3 || normalized.length > 80) {
    throw new UnprocessableEntityException({
      code: 'CERTIFICATION_NUMBER_INVALID',
      message: 'Enter a valid certification number from the slab label.',
    });
  }
  return normalized;
}

export function compareCertificationIdentity(
  expected: CertificationIdentity,
  verified: CertificationIdentity,
) {
  const fields: Array<keyof CertificationIdentity> = [
    'year',
    'set',
    'cardNumber',
    'name',
    'variant',
    'language',
    'companyCode',
    'grade',
  ];
  const mismatches = fields.filter((field) => {
    const left = normalizeIdentityValue(expected[field]);
    const right = normalizeIdentityValue(verified[field]);
    return Boolean(left && right && left !== right);
  });
  return {
    status: mismatches.length ? ('MISMATCH' as const) : ('MATCH' as const),
    mismatches,
  };
}

function normalizeIdentityValue(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
