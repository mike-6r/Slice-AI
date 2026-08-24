import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  CatalogueRepository,
  Cursor,
} from '../ports/catalogue.repositories';
import type {
  CatalogueAsset,
  CatalogueCategory,
  CatalogueId,
  CollectibleSet,
  GradeScaleEntry,
  GradingCompany,
  PublicCatalogueAsset,
} from '../domain/catalogue.types';

type Db = PrismaClient | Prisma.TransactionClient;

export class PrismaCatalogueRepository implements CatalogueRepository {
  constructor(private readonly db: Db) {}
  async listCategories(includeArchived = false) {
    return (
      await this.db.category.findMany({
        where: includeArchived ? {} : { status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      })
    ).map(category);
  }
  async findCategoryBySlug(slug: string) {
    const row = await this.db.category.findUnique({ where: { slug } });
    return row ? category(row) : null;
  }
  async findCategoryById(id: CatalogueId) {
    const row = await this.db.category.findUnique({ where: { id } });
    return row ? category(row) : null;
  }
  async createCategory(
    input: Omit<CatalogueCategory, 'createdAt' | 'updatedAt'>,
  ) {
    return category(
      await this.db.category.create({
        data: {
          id: input.id,
          slug: input.slug,
          name: input.name,
          iconKey: input.iconKey,
          description: input.description,
          status: input.status,
          sortOrder: input.sortOrder,
        },
      }),
    );
  }
  async updateCategory(
    id: CatalogueId,
    input: Partial<
      Pick<
        CatalogueCategory,
        'name' | 'iconKey' | 'description' | 'status' | 'sortOrder'
      >
    >,
  ) {
    return category(
      await this.db.category.update({ where: { id }, data: input }),
    );
  }
  async listSets(
    categorySlug: string,
    cursor: Cursor,
    limit: number,
    includeArchived = false,
  ) {
    return (
      await this.db.collectibleSet.findMany({
        where: {
          category: { slug: categorySlug },
          ...(includeArchived ? {} : { status: 'ACTIVE' }),
        },
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
        take: limit,
      })
    ).map(collectibleSet);
  }
  async findSetById(id: CatalogueId) {
    const row = await this.db.collectibleSet.findUnique({ where: { id } });
    return row ? collectibleSet(row) : null;
  }
  async createSet(input: Omit<CollectibleSet, 'createdAt' | 'updatedAt'>) {
    return collectibleSet(
      await this.db.collectibleSet.create({
        data: {
          id: input.id,
          categoryId: input.categoryId,
          slug: input.slug,
          name: input.name,
          manufacturer: input.manufacturer,
          releaseYear: input.releaseYear,
          edition: input.edition,
          status: input.status,
        },
      }),
    );
  }
  async updateSet(
    id: CatalogueId,
    input: Partial<
      Pick<
        CollectibleSet,
        'name' | 'manufacturer' | 'releaseYear' | 'edition' | 'status'
      >
    >,
  ) {
    return collectibleSet(
      await this.db.collectibleSet.update({ where: { id }, data: input }),
    );
  }
  async listCompanies(includeArchived = false) {
    return (
      await this.db.gradingCompany.findMany({
        where: includeArchived ? {} : { status: 'ACTIVE' },
        orderBy: { code: 'asc' },
      })
    ).map(company);
  }
  async findCompanyByCode(code: string) {
    const row = await this.db.gradingCompany.findUnique({ where: { code } });
    return row ? company(row) : null;
  }
  async findCompanyById(id: CatalogueId) {
    const row = await this.db.gradingCompany.findUnique({ where: { id } });
    return row ? company(row) : null;
  }
  async createCompany(input: Omit<GradingCompany, 'createdAt' | 'updatedAt'>) {
    return company(
      await this.db.gradingCompany.create({
        data: {
          id: input.id,
          code: input.code,
          name: input.name,
          displayName: input.displayName,
          verificationMode: input.verificationMode,
          supportsCertVerification: input.supportsCertVerification,
          supportsAutomatedVerification: input.supportsAutomatedVerification,
          officialVerificationUrl: input.officialVerificationUrl,
          certificationFormat: input.certificationFormat,
          gradeScaleVersion: input.gradeScaleVersion,
          status: input.status,
        },
      }),
    );
  }
  async updateCompany(
    id: CatalogueId,
    input: Partial<Pick<GradingCompany, 'name' | 'displayName' | 'verificationMode' | 'supportsCertVerification' | 'supportsAutomatedVerification' | 'officialVerificationUrl' | 'certificationFormat' | 'gradeScaleVersion' | 'status'>>,
  ) {
    return company(
      await this.db.gradingCompany.update({ where: { id }, data: input }),
    );
  }
  async listGrades(code: string, includeInactive = false) {
    return (
      await this.db.gradeScaleEntry.findMany({
        where: {
          company: { code },
          ...(includeInactive ? {} : { active: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      })
    ).map(grade);
  }
  async findGrade(companyId: CatalogueId, value: string) {
    const row = await this.db.gradeScaleEntry.findFirst({
      where: { companyId, grade: new Prisma.Decimal(value), active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return row ? grade(row) : null;
  }
  async findGradeById(id: string) {
    const row = await this.db.gradeScaleEntry.findUnique({ where: { id } });
    return row ? grade(row) : null;
  }
  async createGrade(input: GradeScaleEntry) {
    return grade(
      await this.db.gradeScaleEntry.create({
        data: {
          id: input.id,
          companyId: input.companyId,
          grade: new Prisma.Decimal(input.grade),
          label: input.label,
          conditionLabel: input.conditionLabel,
          designation: input.designation ?? '',
          legacy: input.legacy,
          gradeEra: input.gradeEra,
          scaleVersion: input.scaleVersion,
          sortOrder: input.sortOrder,
          active: input.active,
        },
      }),
    );
  }
  async updateGrade(
    id: CatalogueId,
    input: Partial<
      Pick<GradeScaleEntry, 'label' | 'conditionLabel' | 'sortOrder' | 'active'>
    >,
  ) {
    return grade(
      await this.db.gradeScaleEntry.update({ where: { id }, data: input }),
    );
  }
  async createAsset(input: CatalogueAsset) {
    return asset(
      await this.db.asset.create({
        data: assetData(input) as Prisma.AssetUncheckedCreateInput,
      }),
    );
  }
  async findAssetBySlug(slug: string) {
    const row = await this.db.asset.findUnique({ where: { slug } });
    return row ? asset(row) : null;
  }
  async findPublicAssetBySlug(
    slug: string,
  ): Promise<PublicCatalogueAsset | null> {
    const row = await this.db.asset.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: {
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
      },
    });
    if (!row || !row.publishedAt) return null;
    return {
      publicId: row.publicId,
      slug: row.slug,
      categorySlug: row.category.slug,
      setSlug: row.collectibleSet?.slug ?? null,
      title: row.title,
      shortName: row.shortName,
      year: row.year,
      manufacturer: row.manufacturer,
      edition: row.edition,
      cardNumber: row.cardNumber,
      description: row.description,
      grading: row.gradeScaleEntry
        ? {
            companyCode: row.gradeScaleEntry.company.code,
            grade: row.gradeScaleEntry.grade.toFixed(2),
            label: row.gradeScaleEntry.label,
          }
        : null,
      status: 'PUBLISHED',
      publishedAt: row.publishedAt.toISOString(),
    };
  }
  async findAssetById(id: CatalogueId) {
    const row = await this.db.asset.findUnique({ where: { id } });
    return row ? asset(row) : null;
  }
  async updateAsset(
    id: CatalogueId,
    input: Partial<
      Omit<
        CatalogueAsset,
        'id' | 'publicId' | 'slug' | 'createdAt' | 'updatedAt'
      >
    >,
  ) {
    return asset(
      await this.db.asset.update({
        where: { id },
        data: assetData(input) as Prisma.AssetUncheckedUpdateInput,
      }),
    );
  }
}

function category(row: {
  id: string;
  slug: string;
  name: string;
  iconKey: string | null;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): CatalogueCategory {
  return { ...row, id: row.id as CatalogueId, slug: row.slug as never };
}
function collectibleSet(row: {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  manufacturer: string | null;
  releaseYear: number | null;
  edition: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}): CollectibleSet {
  return {
    ...row,
    id: row.id as CatalogueId,
    categoryId: row.categoryId as CatalogueId,
    slug: row.slug as never,
  };
}
function company(row: {
  id: string;
  code: string;
  name: string;
  displayName: string;
  verificationMode: string;
  supportsCertVerification: boolean;
  supportsAutomatedVerification: boolean;
  officialVerificationUrl: string | null;
  certificationFormat: string | null;
  gradeScaleVersion: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}): GradingCompany {
  return { ...row, id: row.id as CatalogueId };
}
function grade(row: {
  id: string;
  companyId: string;
  grade: Prisma.Decimal;
  label: string;
  conditionLabel: string | null;
  designation: string;
  legacy: boolean;
  gradeEra: string | null;
  scaleVersion: string | null;
  sortOrder: number;
  active: boolean;
}): GradeScaleEntry {
  return {
    ...row,
    designation: row.designation || null,
    id: row.id as CatalogueId,
    companyId: row.companyId as CatalogueId,
    grade: row.grade.toFixed(2),
  };
}
function asset(row: {
  id: string;
  publicId: string;
  slug: string;
  categoryId: string;
  setId: string | null;
  title: string;
  shortName: string | null;
  year: number | null;
  manufacturer: string | null;
  edition: string | null;
  cardNumber: string | null;
  description: string | null;
  gradeScaleEntryId: string | null;
  certificationNumber: string | null;
  status: 'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}): CatalogueAsset {
  return {
    ...row,
    id: row.id as CatalogueId,
    slug: row.slug as never,
    categoryId: row.categoryId as CatalogueId,
    setId: row.setId as CatalogueId | null,
    gradeScaleEntryId: row.gradeScaleEntryId as CatalogueId | null,
  };
}
function assetData(input: Partial<CatalogueAsset>) {
  return {
    ...(input.id ? { id: input.id } : {}),
    ...(input.publicId ? { publicId: input.publicId } : {}),
    ...(input.slug ? { slug: input.slug } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.setId !== undefined ? { setId: input.setId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.shortName !== undefined ? { shortName: input.shortName } : {}),
    ...(input.year !== undefined ? { year: input.year } : {}),
    ...(input.manufacturer !== undefined
      ? { manufacturer: input.manufacturer }
      : {}),
    ...(input.edition !== undefined ? { edition: input.edition } : {}),
    ...(input.cardNumber !== undefined ? { cardNumber: input.cardNumber } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.gradeScaleEntryId !== undefined
      ? { gradeScaleEntryId: input.gradeScaleEntryId }
      : {}),
    ...(input.certificationNumber !== undefined
      ? { certificationNumber: input.certificationNumber }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.publishedAt !== undefined
      ? { publishedAt: input.publishedAt }
      : {}),
  };
}
