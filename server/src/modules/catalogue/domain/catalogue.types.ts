export type CatalogueId = string & { readonly __catalogueId: unique symbol };
export type CatalogueSlug = string & {
  readonly __catalogueSlug: unique symbol;
};
export type CatalogueStatus = 'ACTIVE' | 'ARCHIVED';
export type AssetCatalogueStatus =
  'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'PUBLISHED' | 'ARCHIVED';

/** Shared wire primitives. Catalogue deliberately publishes no price or ownership fields. */
export type Money = { minor: string; currency: 'GBP' };
export type BasisPoints = number & { readonly __basisPoints: unique symbol };
export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CatalogueCategory = {
  id: CatalogueId;
  slug: CatalogueSlug;
  name: string;
  iconKey: string | null;
  description: string | null;
  status: CatalogueStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};
export type CollectibleSet = {
  id: CatalogueId;
  categoryId: CatalogueId;
  slug: CatalogueSlug;
  name: string;
  manufacturer: string | null;
  releaseYear: number | null;
  edition: string | null;
  status: CatalogueStatus;
  createdAt: Date;
  updatedAt: Date;
};
export type GradingCompany = {
  id: CatalogueId;
  code: string;
  name: string;
  displayName: string;
  verificationMode: string;
  supportsCertVerification: boolean;
  supportsAutomatedVerification: boolean;
  officialVerificationUrl: string | null;
  certificationFormat: string | null;
  gradeScaleVersion: string;
  status: CatalogueStatus;
  createdAt: Date;
  updatedAt: Date;
};
export type GradeScaleEntry = {
  id: CatalogueId;
  companyId: CatalogueId;
  grade: string;
  label: string;
  conditionLabel: string | null;
  designation: string | null;
  legacy: boolean;
  gradeEra: string | null;
  scaleVersion: string | null;
  sortOrder: number;
  active: boolean;
};
export type CatalogueAsset = {
  id: CatalogueId;
  publicId: string;
  slug: CatalogueSlug;
  categoryId: CatalogueId;
  setId: CatalogueId | null;
  title: string;
  shortName: string | null;
  year: number | null;
  manufacturer: string | null;
  edition: string | null;
  cardNumber: string | null;
  description: string | null;
  gradeScaleEntryId: CatalogueId | null;
  certificationNumber: string | null;
  status: AssetCatalogueStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type PublicCategory = Pick<
  CatalogueCategory,
  'slug' | 'name' | 'iconKey' | 'description'
>;
export type PublicSet = Pick<
  CollectibleSet,
  'slug' | 'name' | 'manufacturer' | 'releaseYear' | 'edition'
>;
export type PublicGradingCompany = Pick<
  GradingCompany,
  | 'code'
  | 'name'
  | 'displayName'
  | 'verificationMode'
  | 'supportsCertVerification'
  | 'supportsAutomatedVerification'
  | 'officialVerificationUrl'
  | 'certificationFormat'
  | 'gradeScaleVersion'
>;
export type PublicGrade = Pick<
  GradeScaleEntry,
  'id' | 'grade' | 'label' | 'conditionLabel' | 'designation' | 'legacy' | 'gradeEra' | 'scaleVersion'
>;
/** Intentionally metadata-only; SD-001 forbids an implied authoritative price contract. */
export type PublicCatalogueAsset = {
  publicId: string;
  slug: string;
  categorySlug: string;
  setSlug: string | null;
  title: string;
  shortName: string | null;
  year: number | null;
  manufacturer: string | null;
  edition: string | null;
  cardNumber: string | null;
  description: string | null;
  grading: { companyCode: string; grade: string; label: string | null } | null;
  status: 'PUBLISHED';
  publishedAt: string;
};

export const slugify = (value: string): CatalogueSlug =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') as CatalogueSlug;

export function parseCursor(
  value: string | undefined,
): { id: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { id?: unknown };
    return typeof parsed.id === 'string' && parsed.id.length > 0
      ? { id: parsed.id }
      : undefined;
  } catch {
    return undefined;
  }
}
export const encodeCursor = (id: string) =>
  Buffer.from(JSON.stringify({ id })).toString('base64url');
