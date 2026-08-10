import { UnprocessableEntityException } from '@nestjs/common';
import type {
  CatalogueCategory,
  CollectibleSet,
  GradeScaleEntry,
  GradingCompany,
} from './catalogue.types';

export function ensureAssignableReference(
  category: CatalogueCategory,
  collectibleSet: CollectibleSet | null,
  company: GradingCompany | null,
  grade: GradeScaleEntry | null,
) {
  if (category.status !== 'ACTIVE')
    fail('REFERENCE_ARCHIVED', 'The category is archived.');
  if (
    collectibleSet &&
    (collectibleSet.status !== 'ACTIVE' ||
      collectibleSet.categoryId !== category.id)
  )
    fail(
      'INVALID_CATEGORY_SET',
      'The selected set is not valid for the category.',
    );
  if ((company === null) !== (grade === null))
    fail(
      'INVALID_GRADE',
      'A grading company and grade must be supplied together.',
    );
  if (company && company.status !== 'ACTIVE')
    fail('REFERENCE_ARCHIVED', 'The grading company is archived.');
  if (grade && (!grade.active || grade.companyId !== company!.id))
    fail('INVALID_GRADE', 'The selected grade is not valid.');
}

function fail(code: string, message: string): never {
  throw new UnprocessableEntityException({ code, message });
}
