import type {
  CatalogueAsset,
  CatalogueCategory,
  CatalogueId,
  CollectibleSet,
  GradeScaleEntry,
  GradingCompany,
  PublicCatalogueAsset,
} from '../domain/catalogue.types';

export type Cursor = { id: string } | undefined;
export interface CatalogueRepository {
  listCategories(includeArchived?: boolean): Promise<CatalogueCategory[]>;
  findCategoryBySlug(slug: string): Promise<CatalogueCategory | null>;
  findCategoryById(id: CatalogueId): Promise<CatalogueCategory | null>;
  createCategory(
    input: Omit<CatalogueCategory, 'createdAt' | 'updatedAt'>,
  ): Promise<CatalogueCategory>;
  updateCategory(
    id: CatalogueId,
    input: Partial<
      Pick<
        CatalogueCategory,
        'name' | 'iconKey' | 'description' | 'status' | 'sortOrder'
      >
    >,
  ): Promise<CatalogueCategory>;
  listSets(
    categorySlug: string,
    cursor: Cursor,
    limit: number,
    includeArchived?: boolean,
  ): Promise<CollectibleSet[]>;
  findSetById(id: CatalogueId): Promise<CollectibleSet | null>;
  createSet(
    input: Omit<CollectibleSet, 'createdAt' | 'updatedAt'>,
  ): Promise<CollectibleSet>;
  updateSet(
    id: CatalogueId,
    input: Partial<
      Pick<
        CollectibleSet,
        'name' | 'manufacturer' | 'releaseYear' | 'edition' | 'status'
      >
    >,
  ): Promise<CollectibleSet>;
  listCompanies(includeArchived?: boolean): Promise<GradingCompany[]>;
  findCompanyByCode(code: string): Promise<GradingCompany | null>;
  findCompanyById(id: CatalogueId): Promise<GradingCompany | null>;
  createCompany(
    input: Omit<GradingCompany, 'createdAt' | 'updatedAt'>,
  ): Promise<GradingCompany>;
  updateCompany(
    id: CatalogueId,
    input: Partial<Pick<GradingCompany, 'name' | 'displayName' | 'verificationMode' | 'supportsCertVerification' | 'supportsAutomatedVerification' | 'officialVerificationUrl' | 'certificationFormat' | 'gradeScaleVersion' | 'status'>>,
  ): Promise<GradingCompany>;
  listGrades(
    code: string,
    includeInactive?: boolean,
  ): Promise<GradeScaleEntry[]>;
  findGrade(
    companyId: CatalogueId,
    grade: string,
  ): Promise<GradeScaleEntry | null>;
  findGradeById(id: string): Promise<GradeScaleEntry | null>;
  createGrade(input: GradeScaleEntry): Promise<GradeScaleEntry>;
  updateGrade(
    id: CatalogueId,
    input: Partial<
      Pick<GradeScaleEntry, 'label' | 'conditionLabel' | 'sortOrder' | 'active'>
    >,
  ): Promise<GradeScaleEntry>;
  createAsset(input: CatalogueAsset): Promise<CatalogueAsset>;
  findAssetBySlug(slug: string): Promise<CatalogueAsset | null>;
  findPublicAssetBySlug(slug: string): Promise<PublicCatalogueAsset | null>;
  findAssetById(id: CatalogueId): Promise<CatalogueAsset | null>;
  updateAsset(
    id: CatalogueId,
    input: Partial<
      Omit<
        CatalogueAsset,
        'id' | 'publicId' | 'slug' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<CatalogueAsset>;
}
export const CATALOGUE_REPOSITORY = Symbol('CATALOGUE_REPOSITORY');
