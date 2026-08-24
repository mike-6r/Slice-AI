import { UnprocessableEntityException } from '@nestjs/common';
import {
  assertCertificationNumber,
  compareCertificationIdentity,
  normalizeCertificationNumber,
} from './grading-certification';

describe('grading certification authority', () => {
  it('normalizes separators without losing leading zeroes', () => {
    expect(normalizeCertificationNumber('  0012-34 #56 ')).toBe('00123456');
  });

  it('rejects empty or implausibly short certification numbers', () => {
    expect(() => assertCertificationNumber('')).toThrow(UnprocessableEntityException);
    expect(() => assertCertificationNumber('ab')).toThrow(UnprocessableEntityException);
    expect(assertCertificationNumber('PSA-001234')).toBe('PSA001234');
  });

  it('reports identity mismatches without claiming a provider lookup', () => {
    expect(
      compareCertificationIdentity(
        { companyCode: 'PSA', year: '2021', set: 'Evolving Skies', cardNumber: '215/203', grade: '10.00' },
        { companyCode: 'PSA', year: '2021', set: 'Evolving Skies', cardNumber: '215/203', grade: '9.00' },
      ),
    ).toEqual({ status: 'MISMATCH', mismatches: ['grade'] });
  });
});
