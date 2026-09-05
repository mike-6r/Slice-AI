import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { Actor } from '../../identity/auth/auth.service';
import type {
  AuditWrite,
  IdempotencyIdentity,
} from '../../identity/ports/repositories';
import { ensureAssignableReference } from '../domain/catalogue.policy';
import {
  encodeCursor,
  parseCursor,
  slugify,
  type AssetCatalogueStatus,
  type CatalogueAsset,
  type CatalogueCategory,
  type CatalogueId,
  type CatalogueStatus,
  type CollectibleSet,
  type GradeScaleEntry,
  type GradingCompany,
} from '../domain/catalogue.types';
import {
  CATALOGUE_REPOSITORY,
  type CatalogueRepository,
} from '../ports/catalogue.repositories';
import { PrismaCatalogueRepository } from '../persistence/prisma-catalogue.repository';

type CategoryInput = {
  slug?: string;
  name: string;
  iconKey?: string | null;
  description?: string | null;
  sortOrder?: number;
  status?: CatalogueStatus;
};
type SetInput = {
  categoryId: string;
  slug?: string;
  name: string;
  manufacturer?: string | null;
  releaseYear?: number | null;
  edition?: string | null;
  status?: CatalogueStatus;
};
type CompanyInput = { code: string; name: string; status?: CatalogueStatus };
type GradeInput = {
  companyId: string;
  grade: string;
  label: string;
  conditionLabel?: string | null;
  sortOrder?: number;
  active?: boolean;
};
type AssetInput = {
  publicId?: string;
  slug?: string;
  categoryId: string;
  setId?: string | null;
  title: string;
  shortName?: string | null;
  year?: number | null;
  manufacturer?: string | null;
  edition?: string | null;
  cardNumber?: string | null;
  description?: string | null;
  gradeScaleEntryId?: string | null;
  certificationNumber?: string | null;
  status?: AssetCatalogueStatus;
};

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOGUE_REPOSITORY)
    private readonly catalogue: CatalogueRepository,
  ) {}

  async categories() {
    return (await this.catalogue.listCategories()).map(
      ({ id, slug, name, iconKey, description }) => ({
        id,
        slug,
        name,
        iconKey,
        description,
      }),
    );
  }
  async adminCategories() {
    return (await this.catalogue.listCategories(true)).map(adminCategory);
  }
  async sets(categorySlug: string, cursor: string | undefined, limit: number) {
    if (!parseCursor(cursor) && cursor)
      throw new ConflictException({
        code: 'VALIDATION_FAILED',
        message: 'The cursor is invalid.',
      });
    const rows = await this.catalogue.listSets(
      categorySlug,
      parseCursor(cursor),
      limit + 1,
    );
    const page = rows
      .slice(0, limit)
      .map(({ slug, name, manufacturer, releaseYear, edition }) => ({
        slug,
        name,
        manufacturer,
        releaseYear,
        edition,
      }));
    return {
      items: page,
      hasMore: rows.length > limit,
      nextCursor:
        rows.length > limit ? encodeCursor(rows[limit - 1]!.id) : null,
    };
  }
  async companies() {
    return (await this.catalogue.listCompanies()).map(
      ({
        code,
        name,
        displayName,
        verificationMode,
        supportsCertVerification,
        supportsAutomatedVerification,
        officialVerificationUrl,
        certificationFormat,
        gradeScaleVersion,
      }) => ({
        code,
        name,
        displayName,
        verificationMode,
        supportsCertVerification,
        supportsAutomatedVerification,
        officialVerificationUrl,
        certificationFormat,
        gradeScaleVersion,
      }),
    );
  }
  async grades(code: string) {
    return (await this.catalogue.listGrades(code)).map(
      ({ id, grade, label, conditionLabel, designation, legacy, gradeEra, scaleVersion }) => ({
        id,
        grade,
        label,
        conditionLabel,
        designation,
        legacy,
        gradeEra,
        scaleVersion,
      }),
    );
  }
  async publishedAsset(slug: string) {
    const asset = await this.catalogue.findPublicAssetBySlug(slug);
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_PUBLIC',
        message: 'Resource not found.',
      });
    return asset;
  }

  async createCategory(
    actor: Actor,
    input: CategoryInput,
    requestId: string,
    key: string,
  ) {
    const slug = this.slug(input.slug, input.name);
    return this.mutate(
      actor,
      'catalogue.category.create',
      'POST',
      '/v1/admin/categories',
      { ...input, slug },
      requestId,
      key,
      async (repo, audit) => {
        const result = await repo.createCategory({
          id: randomUUID() as CatalogueId,
          slug,
          name: input.name,
          iconKey: input.iconKey ?? null,
          description: input.description ?? null,
          status: input.status ?? 'ACTIVE',
          sortOrder: input.sortOrder ?? 0,
        });
        await audit(
          this.audit(
            'CATALOGUE_CATEGORY_CREATED',
            actor,
            'category',
            result.id,
            requestId,
            { slug: result.slug, status: result.status },
          ),
        );
        return adminCategory(result);
      },
    );
  }
  async updateCategory(
    actor: Actor,
    id: string,
    input: Partial<CategoryInput>,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      'catalogue.category.update',
      'PATCH',
      `/v1/admin/categories/${id}`,
      input,
      requestId,
      key,
      async (repo, audit) => {
        const before = await repo.findCategoryById(id as CatalogueId);
        if (!before) this.notFound();
        const result = await repo.updateCategory(
          before!.id,
          pick(input, [
            'name',
            'iconKey',
            'description',
            'status',
            'sortOrder',
          ]),
        );
        await audit(
          this.audit(
            'CATALOGUE_CATEGORY_UPDATED',
            actor,
            'category',
            result.id,
            requestId,
            {
              changedFields: Object.keys(input),
              fromStatus: before!.status,
              toStatus: result.status,
            },
          ),
        );
        return adminCategory(result);
      },
    );
  }
  async createSet(
    actor: Actor,
    input: SetInput,
    requestId: string,
    key: string,
  ) {
    const slug = this.slug(input.slug, input.name);
    return this.mutate(
      actor,
      'catalogue.set.create',
      'POST',
      '/v1/admin/sets',
      { ...input, slug },
      requestId,
      key,
      async (repo, audit) => {
        const category = await repo.findCategoryById(
          input.categoryId as CatalogueId,
        );
        if (!category) this.notFound();
        if (category!.status !== 'ACTIVE')
          throw new ConflictException({
            code: 'REFERENCE_ARCHIVED',
            message: 'The category is archived.',
          });
        const result = await repo.createSet({
          id: randomUUID() as CatalogueId,
          categoryId: category!.id,
          slug,
          name: input.name,
          manufacturer: input.manufacturer ?? null,
          releaseYear: input.releaseYear ?? null,
          edition: input.edition ?? null,
          status: input.status ?? 'ACTIVE',
        });
        await audit(
          this.audit(
            'CATALOGUE_SET_CREATED',
            actor,
            'set',
            result.id,
            requestId,
            {
              slug: result.slug,
              categoryId: result.categoryId,
              status: result.status,
            },
          ),
        );
        return adminSet(result);
      },
    );
  }
  async updateSet(
    actor: Actor,
    id: string,
    input: Partial<SetInput>,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      'catalogue.set.update',
      'PATCH',
      `/v1/admin/sets/${id}`,
      input,
      requestId,
      key,
      async (repo, audit) => {
        const before = await repo.findSetById(id as CatalogueId);
        if (!before) this.notFound();
        const result = await repo.updateSet(
          before!.id,
          pick(input, [
            'name',
            'manufacturer',
            'releaseYear',
            'edition',
            'status',
          ]),
        );
        await audit(
          this.audit(
            'CATALOGUE_SET_UPDATED',
            actor,
            'set',
            result.id,
            requestId,
            {
              changedFields: Object.keys(input),
              fromStatus: before!.status,
              toStatus: result.status,
            },
          ),
        );
        return adminSet(result);
      },
    );
  }
  async createCompany(
    actor: Actor,
    input: CompanyInput,
    requestId: string,
    key: string,
  ) {
    const code = input.code.trim().toUpperCase();
    return this.mutate(
      actor,
      'catalogue.company.create',
      'POST',
      '/v1/admin/grading-companies',
      { ...input, code },
      requestId,
      key,
      async (repo, audit) => {
        const result = await repo.createCompany({
          id: randomUUID() as CatalogueId,
          code,
          name: input.name,
          displayName: input.name,
          verificationMode: 'MANUAL_OFFICIAL_LOOKUP',
          supportsCertVerification: true,
          supportsAutomatedVerification: false,
          officialVerificationUrl: null,
          certificationFormat: null,
          gradeScaleVersion: 'unconfirmed-v1',
          status: input.status ?? 'ACTIVE',
        });
        await audit(
          this.audit(
            'CATALOGUE_GRADING_COMPANY_CREATED',
            actor,
            'grading-company',
            result.id,
            requestId,
            { code: result.code, status: result.status },
          ),
        );
        return adminCompany(result);
      },
    );
  }
  async updateCompany(
    actor: Actor,
    id: string,
    input: Partial<CompanyInput>,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      'catalogue.company.update',
      'PATCH',
      `/v1/admin/grading-companies/${id}`,
      input,
      requestId,
      key,
      async (repo, audit) => {
        const before = await repo.findCompanyById(id as CatalogueId);
        if (!before) this.notFound();
        const result = await repo.updateCompany(
          before!.id,
          pick(input, ['name', 'status']),
        );
        await audit(
          this.audit(
            'CATALOGUE_GRADING_COMPANY_UPDATED',
            actor,
            'grading-company',
            result.id,
            requestId,
            {
              changedFields: Object.keys(input),
              fromStatus: before!.status,
              toStatus: result.status,
            },
          ),
        );
        return adminCompany(result);
      },
    );
  }
  async createGrade(
    actor: Actor,
    input: GradeInput,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      'catalogue.grade.create',
      'POST',
      '/v1/admin/grades',
      input,
      requestId,
      key,
      async (repo, audit) => {
        const company = await repo.findCompanyById(
          input.companyId as CatalogueId,
        );
        if (!company) this.notFound();
        if (company!.status !== 'ACTIVE')
          throw new ConflictException({
            code: 'REFERENCE_ARCHIVED',
            message: 'The grading company is archived.',
          });
        const result = await repo.createGrade({
          id: randomUUID() as CatalogueId,
          companyId: company!.id,
          grade: decimal(input.grade),
          label: input.label,
          conditionLabel: input.conditionLabel ?? null,
          designation: null,
          legacy: false,
          gradeEra: null,
          scaleVersion: null,
          sortOrder: input.sortOrder ?? 0,
          active: input.active ?? true,
        });
        await audit(
          this.audit(
            'CATALOGUE_GRADE_CREATED',
            actor,
            'grade-scale-entry',
            result.id,
            requestId,
            {
              companyId: result.companyId,
              grade: result.grade,
              active: result.active,
            },
          ),
        );
        return adminGrade(result);
      },
    );
  }
  async updateGrade(
    actor: Actor,
    id: string,
    input: Partial<GradeInput>,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      'catalogue.grade.update',
      'PATCH',
      `/v1/admin/grades/${id}`,
      input,
      requestId,
      key,
      async (repo, audit) => {
        const existing = await this.prisma.gradeScaleEntry.findUnique({
          where: { id },
        });
        if (!existing) this.notFound();
        const result = await repo.updateGrade(
          id as CatalogueId,
          pick(input, ['label', 'conditionLabel', 'sortOrder', 'active']),
        );
        await audit(
          this.audit(
            'CATALOGUE_GRADE_UPDATED',
            actor,
            'grade-scale-entry',
            result.id,
            requestId,
            { changedFields: Object.keys(input), active: result.active },
          ),
        );
        return adminGrade(result);
      },
    );
  }
  async createAsset(
    actor: Actor,
    input: AssetInput,
    requestId: string,
    key: string,
  ) {
    const slug = this.slug(input.slug, input.title);
    return this.mutate(
      actor,
      'catalogue.asset.create',
      'POST',
      '/v1/admin/catalogue/assets',
      { ...input, slug },
      requestId,
      key,
      async (repo, audit) => {
        const category = await repo.findCategoryById(
          input.categoryId as CatalogueId,
        );
        if (!category) this.notFound();
        const set = input.setId
          ? await repo.findSetById(input.setId as CatalogueId)
          : null;
        if (input.setId && !set) this.invalidSet();
        const grade = input.gradeScaleEntryId
          ? await repo.findGradeById(input.gradeScaleEntryId as CatalogueId)
          : null;
        if (input.gradeScaleEntryId && !grade) this.invalidGrade();
        const company = grade
          ? await repo.findCompanyById(grade.companyId)
          : null;
        ensureAssignableReference(category!, set, company, grade);
        if (input.status && input.status !== 'DRAFT') this.invalidLifecycle();
        const now = new Date();
        const result = await repo.createAsset({
          id: randomUUID() as CatalogueId,
          publicId:
            input.publicId?.trim() || `ast_${randomUUID().replace(/-/g, '')}`,
          slug,
          categoryId: category!.id,
          setId: set?.id ?? null,
          title: input.title,
          shortName: input.shortName ?? null,
          year: input.year ?? null,
          manufacturer: input.manufacturer ?? null,
          edition: input.edition ?? null,
          cardNumber: input.cardNumber ?? null,
          description: input.description ?? null,
          gradeScaleEntryId: grade?.id ?? null,
          certificationNumber: input.certificationNumber ?? null,
          status: 'DRAFT',
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
        });
        await audit(
          this.audit(
            'CATALOGUE_ASSET_CREATED',
            actor,
            'asset',
            result.id,
            requestId,
            {
              publicId: result.publicId,
              slug: result.slug,
              status: result.status,
            },
          ),
        );
        return adminAsset(result);
      },
    );
  }
  async updateAsset(
    actor: Actor,
    id: string,
    input: Partial<AssetInput>,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      'catalogue.asset.update',
      'PATCH',
      `/v1/admin/catalogue/assets/${id}`,
      input,
      requestId,
      key,
      async (repo, audit) => {
        const before = await repo.findAssetById(id as CatalogueId);
        if (!before) this.notFound();
        const category = input.categoryId
          ? await repo.findCategoryById(input.categoryId as CatalogueId)
          : await repo.findCategoryById(before!.categoryId);
        if (!category) this.notFound();
        const setId = input.setId === undefined ? before!.setId : input.setId;
        const set = setId ? await repo.findSetById(setId as CatalogueId) : null;
        if (setId && !set) this.invalidSet();
        const gradeId =
          input.gradeScaleEntryId === undefined
            ? before!.gradeScaleEntryId
            : input.gradeScaleEntryId;
        const grade = gradeId ? await repo.findGradeById(gradeId) : null;
        if (gradeId && !grade) this.invalidGrade();
        const company = grade
          ? await repo.findCompanyById(grade.companyId)
          : null;
        ensureAssignableReference(category!, set, company, grade);
        if (
          input.status &&
          input.status !== 'ARCHIVED' &&
          input.status !== before!.status
        )
          this.invalidLifecycle();
        const status = input.status ?? before!.status;
        const result = await repo.updateAsset(before!.id, {
          ...pick(input, [
            'categoryId',
            'setId',
            'title',
            'shortName',
            'year',
            'manufacturer',
            'edition',
            'cardNumber',
            'description',
            'gradeScaleEntryId',
            'certificationNumber',
          ]),
          categoryId: category!.id,
          setId: set?.id ?? null,
          gradeScaleEntryId: grade?.id ?? null,
          status,
          publishedAt: before!.publishedAt,
        });
        await audit(
          this.audit(
            'CATALOGUE_ASSET_UPDATED',
            actor,
            'asset',
            result.id,
            requestId,
            {
              changedFields: Object.keys(input),
              fromStatus: before!.status,
              toStatus: result.status,
            },
          ),
        );
        return adminAsset(result);
      },
    );
  }

  private async mutate<T extends Record<string, unknown>>(
    actor: Actor,
    scope: string,
    method: string,
    path: string,
    body: unknown,
    requestId: string,
    key: string,
    action: (
      repository: CatalogueRepository,
      audit: (write: AuditWrite) => Promise<void>,
    ) => Promise<T>,
  ): Promise<T> {
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope,
      key,
    };
    const requestHash = createHash('sha256')
      .update(`${method}\n${path}\n${JSON.stringify(body)}`)
      .digest('hex');
    try {
      return await this.prisma.$transaction(async (db) => {
        const identityTx = createIdentityTransaction(db);
        const acquired = await identityTx.idempotency.acquire(
          identity,
          requestHash,
          new Date(Date.now() + 86_400_000),
        );
        if (acquired.state === 'FINGERPRINT_CONFLICT')
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_CONFLICT',
            message: 'The request key cannot be reused for this operation.',
          });
        if (acquired.state === 'EXISTING_IN_PROGRESS')
          throw new ConflictException({
            code: 'PERSISTENCE_CONFLICT',
            message: 'The request is already in progress. Please retry.',
          });
        if (acquired.state === 'EXISTING_COMPLETED')
          return acquired.record.response!.body as T;
        const result = await action(
          new PrismaCatalogueRepository(db),
          (write) => identityTx.audit.append(write),
        );
        await identityTx.idempotency.complete(
          identity,
          { status: 200, body: result },
          new Date(),
        );
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = String(error.meta?.target ?? '');
        throw new ConflictException({
          code: target.includes('certification')
            ? 'CERTIFICATION_CONFLICT'
            : 'SLUG_CONFLICT',
          message: 'The requested identifier already exists.',
        });
      }
      throw error;
    }
  }
  private slug(provided: string | undefined, name: string) {
    const value = slugify(provided ?? name);
    if (!value || value.length > 96)
      throw new ConflictException({
        code: 'VALIDATION_FAILED',
        message: 'A valid slug is required.',
      });
    return value;
  }
  private notFound(): never {
    throw new NotFoundException({
      code: 'CATALOGUE_NOT_FOUND',
      message: 'Resource not found.',
    });
  }
  private invalidSet(): never {
    throw new UnprocessableEntityException({
      code: 'INVALID_CATEGORY_SET',
      message: 'The selected set is not valid for the category.',
    });
  }
  private invalidGrade(): never {
    throw new UnprocessableEntityException({
      code: 'INVALID_GRADE',
      message: 'The selected grade is not valid.',
    });
  }
  private invalidLifecycle(): never {
    throw new ConflictException({
      code: 'INVALID_STATUS_TRANSITION',
      message: 'Asset publication is not available in the catalogue phase.',
    });
  }
  private audit(
    action: string,
    actor: Actor,
    resourceType: string,
    resourceId: string,
    requestId: string,
    metadata: Record<string, unknown>,
  ): AuditWrite {
    return {
      id: randomUUID(),
      actorUserId: actor.userId,
      actorType: 'USER',
      action,
      resourceType,
      resourceId,
      requestId,
      sessionId: actor.sessionId as never,
      result: 'SUCCESS',
      metadata,
      createdAt: new Date(),
    };
  }
}
function decimal(value: string) {
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(value))
    throw new ConflictException({
      code: 'INVALID_GRADE',
      message: 'The selected grade is invalid.',
    });
  return Number(value).toFixed(2);
}
function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  ) as Partial<Pick<T, K>>;
}
function adminCategory(value: CatalogueCategory) {
  return {
    id: value.id,
    slug: value.slug,
    name: value.name,
    iconKey: value.iconKey,
    description: value.description,
    status: value.status,
    sortOrder: value.sortOrder,
  };
}
function adminSet(value: CollectibleSet) {
  return {
    id: value.id,
    categoryId: value.categoryId,
    slug: value.slug,
    name: value.name,
    manufacturer: value.manufacturer,
    releaseYear: value.releaseYear,
    edition: value.edition,
    status: value.status,
  };
}
function adminCompany(value: GradingCompany) {
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    status: value.status,
  };
}
function adminGrade(value: GradeScaleEntry) {
  return {
    id: value.id,
    companyId: value.companyId,
    grade: value.grade,
    label: value.label,
    conditionLabel: value.conditionLabel,
    sortOrder: value.sortOrder,
    active: value.active,
  };
}
function adminAsset(value: CatalogueAsset) {
  return {
    id: value.id,
    publicId: value.publicId,
    slug: value.slug,
    categoryId: value.categoryId,
    setId: value.setId,
    title: value.title,
    shortName: value.shortName,
    year: value.year,
    manufacturer: value.manufacturer,
    edition: value.edition,
    cardNumber: value.cardNumber,
    description: value.description,
    gradeScaleEntryId: value.gradeScaleEntryId,
    status: value.status,
  };
}
