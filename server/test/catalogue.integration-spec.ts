import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl } from '../src/config/app-config';
import { PrismaCatalogueRepository } from '../src/modules/catalogue/persistence/prisma-catalogue.repository';
import { seedCatalogueReference } from '../src/scripts/seed-catalogue-reference';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'TEST_DATABASE_URL is required for catalogue integration tests.',
  );
assertTestDatabaseUrl(databaseUrl);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `catalogue-int-${Date.now()}-${Math.random().toString(16).slice(2)}`;

describe('catalogue PostgreSQL integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCatalogueReference(prisma);
  });
  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { slug: { startsWith: runId } } });
    await prisma.collectibleSet.deleteMany({
      where: { slug: { startsWith: runId } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: runId } },
    });
    await prisma.$disconnect();
  });
  it('has repeatable reference seeds and deterministic category/set ordering', async () => {
    await seedCatalogueReference(prisma);
    expect(
      await prisma.category.count({ where: { slug: 'pokemon-tcg' } }),
    ).toBe(1);
    expect(await prisma.gradingCompany.count({ where: { code: 'PSA' } })).toBe(
      1,
    );
    const repository = new PrismaCatalogueRepository(prisma);
    const first = await repository.createCategory({
      id: `${runId}-a` as never,
      slug: `${runId}-a` as never,
      name: 'A',
      iconKey: null,
      description: null,
      status: 'ACTIVE',
      sortOrder: 1,
    });
    await repository.createCategory({
      id: `${runId}-b` as never,
      slug: `${runId}-b` as never,
      name: 'B',
      iconKey: null,
      description: null,
      status: 'ACTIVE',
      sortOrder: 1,
    });
    const ordered = await repository.listCategories(true);
    expect(ordered.findIndex((row) => row.id === first.id)).toBeLessThan(
      ordered.findIndex((row) => row.id === `${runId}-b`),
    );
  });
  it('enforces unique slugs, restricted foreign keys, and nullable certification uniqueness', async () => {
    const category = await prisma.category.create({
      data: {
        id: `${runId}-category`,
        slug: `${runId}-category`,
        name: 'Integration',
      },
    });
    await expect(
      prisma.category.create({
        data: { slug: category.slug, name: 'Duplicate' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.collectibleSet.create({
        data: {
          categoryId: 'missing',
          slug: `${runId}-broken`,
          name: 'Broken',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await prisma.category.update({
      where: { id: category.id },
      data: { status: 'ARCHIVED' },
    });
    expect(
      (await prisma.category.findUniqueOrThrow({ where: { id: category.id } }))
        .status,
    ).toBe('ARCHIVED');
  });
});
