import { PrismaClient } from '@prisma/client';

/** Versioned, non-economic reference data only. It creates no assets, prices, or ownership. */
export const CATALOGUE_REFERENCE_SEED_VERSION = 'catalogue-reference-v1';

export async function seedCatalogueReference(prisma: PrismaClient) {
  const categories = [
    {
      slug: 'pokemon-tcg',
      name: 'Pokémon TCG',
      iconKey: 'pokemon',
      sortOrder: 10,
    },
    {
      slug: 'sports-cards',
      name: 'Sports Cards',
      iconKey: 'sports',
      sortOrder: 20,
    },
    {
      slug: 'trading-card-games',
      name: 'Trading Card Games',
      iconKey: 'tcg',
      sortOrder: 30,
    },
  ];
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
  const psa = await prisma.gradingCompany.upsert({
    where: { code: 'PSA' },
    update: { name: 'Professional Sports Authenticator', status: 'ACTIVE' },
    create: { code: 'PSA', name: 'Professional Sports Authenticator' },
  });
  const bgs = await prisma.gradingCompany.upsert({
    where: { code: 'BGS' },
    update: { name: 'Beckett Grading Services', status: 'ACTIVE' },
    create: { code: 'BGS', name: 'Beckett Grading Services' },
  });
  for (const company of [psa, bgs]) {
    for (const [grade, label, sortOrder] of [
      ['10.00', 'Gem Mint', 10],
      ['9.00', 'Mint', 20],
      ['8.00', 'Near Mint-Mint', 30],
    ] as const) {
      await prisma.gradeScaleEntry.upsert({
        where: { companyId_grade: { companyId: company.id, grade } },
        update: { label, sortOrder, active: true },
        create: { companyId: company.id, grade, label, sortOrder },
      });
    }
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedCatalogueReference(prisma)
    .then(() => console.log(`${CATALOGUE_REFERENCE_SEED_VERSION} applied`))
    .finally(() => prisma.$disconnect());
}
