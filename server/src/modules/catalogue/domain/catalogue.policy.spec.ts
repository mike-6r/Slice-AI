import { UnprocessableEntityException } from '@nestjs/common';
import { ensureAssignableReference } from './catalogue.policy';
import { encodeCursor, parseCursor, slugify } from './catalogue.types';

const category = {
  id: 'cat' as never,
  slug: 'cards' as never,
  name: 'Cards',
  iconKey: null,
  description: null,
  status: 'ACTIVE' as const,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const set = {
  id: 'set' as never,
  categoryId: category.id,
  slug: 'base-set' as never,
  name: 'Base Set',
  manufacturer: null,
  releaseYear: null,
  edition: null,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const company = {
  id: 'company' as never,
  code: 'PSA',
  name: 'PSA',
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const grade = {
  id: 'grade' as never,
  companyId: company.id,
  grade: '10.00',
  label: 'Gem Mint',
  conditionLabel: null,
  sortOrder: 0,
  active: true,
};

describe('catalogue domain policy', () => {
  it('normalizes immutable URL slugs and round-trips opaque cursors', () => {
    expect(slugify('  Pokémon Base Set! ')).toBe('pokemon-base-set');
    expect(parseCursor(encodeCursor('row-1'))).toEqual({ id: 'row-1' });
    expect(parseCursor('not-a-cursor')).toBeUndefined();
  });
  it('enforces category/set and grading compatibility without economic fields', () => {
    expect(() =>
      ensureAssignableReference(category, set, company, grade),
    ).not.toThrow();
    expect(() =>
      ensureAssignableReference(
        category,
        { ...set, categoryId: 'other' as never },
        company,
        grade,
      ),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      ensureAssignableReference(category, set, company, null),
    ).toThrow(UnprocessableEntityException);
    expect(
      JSON.stringify({ publicId: 'ast_test', title: 'Metadata only' }),
    ).not.toMatch(/price|value|ownership/i);
  });
});
