import { PrismaClient } from '@prisma/client';

/** Versioned, non-economic reference data only. It creates no assets, prices, or ownership. */
export const CATALOGUE_REFERENCE_SEED_VERSION = 'catalogue-reference-v2';

export async function seedCatalogueReference(prisma: PrismaClient) {
  const categories = [
    {
      slug: 'pokemon-tcg',
      name: 'Pokémon TCG',
      iconKey: 'pokemon',
      description: 'Pokémon trading cards, including modern and vintage sets.',
      sortOrder: 10,
    },
    {
      slug: 'sports-cards',
      name: 'Sports Cards',
      iconKey: 'sports',
      description: 'Baseball, basketball, football, hockey, soccer, and other sports cards.',
      sortOrder: 20,
    },
    {
      slug: 'trading-card-games',
      name: 'Trading Card Games',
      iconKey: 'tcg',
      description: 'Collectible card games not yet assigned to a dedicated game category.',
      sortOrder: 30,
    },
    {
      slug: 'magic-the-gathering',
      name: 'Magic: The Gathering',
      iconKey: 'magic',
      description: 'Magic: The Gathering cards across sets, formats, and treatments.',
      sortOrder: 40,
    },
    {
      slug: 'yu-gi-oh-tcg',
      name: 'Yu-Gi-Oh! TCG',
      iconKey: 'yu-gi-oh',
      description: 'Yu-Gi-Oh! trading cards, rarities, and tournament releases.',
      sortOrder: 50,
    },
    {
      slug: 'one-piece-card-game',
      name: 'One Piece Card Game',
      iconKey: 'one-piece',
      description: 'One Piece Card Game booster sets, leaders, and promos.',
      sortOrder: 60,
    },
    {
      slug: 'disney-lorcana',
      name: 'Disney Lorcana',
      iconKey: 'lorcana',
      description: 'Disney Lorcana cards, enchanted treatments, and promos.',
      sortOrder: 70,
    },
    {
      slug: 'digimon-card-game',
      name: 'Digimon Card Game',
      iconKey: 'digimon',
      description: 'Digimon Card Game sets, alternate arts, and tournament promos.',
      sortOrder: 80,
    },
    {
      slug: 'dragon-ball-super-card-game',
      name: 'Dragon Ball Super Card Game',
      iconKey: 'dragon-ball',
      description: 'Dragon Ball Super Card Game and Fusion World collectibles.',
      sortOrder: 90,
    },
    {
      slug: 'flesh-and-blood',
      name: 'Flesh and Blood',
      iconKey: 'flesh-and-blood',
      description: 'Flesh and Blood trading cards, cold foils, and promos.',
      sortOrder: 100,
    },
    {
      slug: 'non-sport-entertainment',
      name: 'Non-Sport & Entertainment Cards',
      iconKey: 'non-sport',
      description: 'Film, television, music, gaming, and other entertainment cards.',
      sortOrder: 110,
    },
    {
      slug: 'comics',
      name: 'Comics',
      iconKey: 'comics',
      description: 'Comic books, key issues, and graded comic collectibles.',
      sortOrder: 120,
    },
    {
      slug: 'memorabilia',
      name: 'Memorabilia',
      iconKey: 'memorabilia',
      description: 'Authenticated signed items, equipment, and display pieces.',
      sortOrder: 130,
    },
  ];
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
  // These early staging aliases are retained for historical asset lineage,
  // but the dedicated catalogue entries above are the choices for new work.
  await prisma.category.updateMany({
    where: { slug: { in: ['one-piece', 'poke-mon', 'yu-gi-oh'] } },
    data: { status: 'ARCHIVED' },
  });
  const companies = [
    ['PSA', 'Professional Sports Authenticator', 'PSA', 'https://www.psacard.com/cert', 'PSA cert number'],
    ['BGS', 'Beckett Grading Services', 'Beckett (BGS)', 'https://www.beckett.com/grading/card-lookup', 'Beckett cert number'],
    ['BVG', 'Beckett Vintage Grading', 'Beckett (BVG)', 'https://www.beckett.com/grading/card-lookup', 'Beckett cert number'],
    ["BCCG", "Beckett Collector's Club Grading", 'Beckett (BCCG)', 'https://www.beckett.com/grading/card-lookup', 'Beckett cert number'],
    ['CGC', 'CGC Cards', 'CGC Cards', 'https://www.cgccards.com/certlookup/', 'CGC cert number'],
    ['SGC', 'Sportscard Guaranty', 'SGC', 'https://www.gosgc.com/certlookup', 'SGC cert number'],
    ['TAG', 'TAG Grading', 'TAG', 'https://taggrading.com/', 'TAG cert number'],
    ['ACE', 'ACE Grading', 'ACE', 'https://acegrading.com/', 'ACE cert number'],
  ] as const;
  const registry = new Map<string, Awaited<ReturnType<typeof prisma.gradingCompany.upsert>>>();
  for (const [code, name, displayName, officialVerificationUrl, certificationFormat] of companies) {
    const company = await prisma.gradingCompany.upsert({
      where: { code },
      update: {
        name,
        displayName,
        verificationMode: 'MANUAL_OFFICIAL_LOOKUP',
        supportsCertVerification: true,
        supportsAutomatedVerification: false,
        officialVerificationUrl,
        certificationFormat,
        gradeScaleVersion: code === 'PSA' || code === 'BGS' ? 'maintained-v1' : 'pending-official-confirmation',
        status: 'ACTIVE',
      },
      create: {
        code,
        name,
        displayName,
        verificationMode: 'MANUAL_OFFICIAL_LOOKUP',
        supportsCertVerification: true,
        supportsAutomatedVerification: false,
        officialVerificationUrl,
        certificationFormat,
        gradeScaleVersion: code === 'PSA' || code === 'BGS' ? 'maintained-v1' : 'pending-official-confirmation',
      },
    });
    registry.set(code, company);
  }

  const scales: Record<string, Array<[string, string, string | null, number, boolean, string | null]>> = {
    PSA: [
      ['10.00', 'GEM-MT', 'Gem Mint', 10, false, null], ['9.00', 'MINT', 'Mint', 20, false, null],
      ['8.50', 'NM-MT+', 'Near Mint-Mint Plus', 30, false, null], ['8.00', 'NM-MT', 'Near Mint-Mint', 40, false, null],
      ['7.50', 'NM+', 'Near Mint Plus', 50, false, null], ['7.00', 'NM', 'Near Mint', 60, false, null],
      ['6.50', 'EX-MT+', 'Excellent-Mint Plus', 70, false, null], ['6.00', 'EX-MT', 'Excellent-Mint', 80, false, null],
      ['5.50', 'EX+', 'Excellent Plus', 90, false, null], ['5.00', 'EX', 'Excellent', 100, false, null],
      ['4.50', 'VG-EX+', 'Very Good-Excellent Plus', 110, false, null], ['4.00', 'VG-EX', 'Very Good-Excellent', 120, false, null],
      ['3.50', 'VG+', 'Very Good Plus', 130, false, null], ['3.00', 'VG', 'Very Good', 140, false, null],
      ['2.50', 'GOOD+', 'Good Plus', 150, false, null], ['2.00', 'GOOD', 'Good', 160, false, null],
      ['1.50', 'FAIR', 'Fair', 170, false, null], ['1.00', 'POOR', 'Poor', 180, false, null],
    ],
    BGS: [
      ['10.00', 'Pristine', 'Pristine', 10, false, 'PRISTINE'], ['9.50', 'Gem Mint', 'Gem Mint', 20, false, null],
      ['9.00', 'Mint', 'Mint', 30, false, null], ['8.50', 'NM-MT+', 'Near Mint-Mint Plus', 40, false, null],
      ['8.00', 'NM-MT', 'Near Mint-Mint', 50, false, null], ['7.50', 'NM+', 'Near Mint Plus', 60, false, null],
      ['7.00', 'NM', 'Near Mint', 70, false, null], ['6.50', 'EX-MT+', 'Excellent-Mint Plus', 80, false, null],
      ['6.00', 'EX-MT', 'Excellent-Mint', 90, false, null], ['5.50', 'EX+', 'Excellent Plus', 100, false, null],
      ['5.00', 'EX', 'Excellent', 110, false, null], ['4.50', 'VG-EX+', 'Very Good-Excellent Plus', 120, false, null],
      ['4.00', 'VG-EX', 'Very Good-Excellent', 130, false, null], ['3.50', 'VG+', 'Very Good Plus', 140, false, null],
      ['3.00', 'VG', 'Very Good', 150, false, null], ['2.50', 'GOOD+', 'Good Plus', 160, false, null],
      ['2.00', 'GOOD', 'Good', 170, false, null], ['1.50', 'FAIR', 'Fair', 180, false, null], ['1.00', 'POOR', 'Poor', 190, false, null],
    ],
    CGC: [
      ['10.00', 'Pristine', 'Pristine', 10, false, 'PRISTINE'], ['10.00', 'Gem Mint', 'Gem Mint', 20, false, 'GEM_MINT'],
      ['9.50', 'Mint+', 'Mint Plus', 30, false, null], ['9.00', 'Mint', 'Mint', 40, false, null],
      ['8.50', 'NM/Mint+', 'Near Mint-Mint Plus', 50, false, null], ['8.00', 'NM/Mint', 'Near Mint-Mint', 60, false, null],
      ['7.50', 'Near Mint+', 'Near Mint Plus', 70, false, null], ['7.00', 'Near Mint', 'Near Mint', 80, false, null],
      ['6.00', 'Excellent', 'Excellent', 90, false, null], ['5.00', 'Very Good', 'Very Good', 100, false, null],
      ['9.50', 'Mint+', 'Mint Plus', 110, true, 'LEGACY'], ['10.00', 'Perfect', 'Perfect', 120, true, 'LEGACY'],
    ],
  };
  for (const [code, entries] of Object.entries(scales)) {
    const company = registry.get(code)!;
    if (code === 'BGS') {
      // The pre-authority seed incorrectly treated BGS 10 as a generic Gem
      // Mint score. Retire that ambiguous entry before adding Pristine.
      await prisma.gradeScaleEntry.updateMany({
        where: { companyId: company.id, grade: '10.00', designation: '' },
        data: { active: false },
      });
    }
    for (const [grade, label, conditionLabel, sortOrder, legacy, designation] of entries) {
      const existing = await prisma.gradeScaleEntry.findFirst({
        where: { companyId: company.id, grade, designation: designation ?? '' },
      });
      const data = { grade, label, conditionLabel, designation: designation ?? '', legacy, gradeEra: legacy ? 'LEGACY' : 'CURRENT', scaleVersion: company.gradeScaleVersion, sortOrder, active: true };
      if (existing) await prisma.gradeScaleEntry.update({ where: { id: existing.id }, data });
      else await prisma.gradeScaleEntry.create({ data: { companyId: company.id, ...data } });
    }
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedCatalogueReference(prisma)
    .then(() => console.log(`${CATALOGUE_REFERENCE_SEED_VERSION} applied`))
    .finally(() => prisma.$disconnect());
}
