import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { CatalogueService } from '../modules/catalogue/application/catalogue.service';
import { AccessControlService } from '../modules/identity/access/access-control.service';
import { AuthService, type Actor } from '../modules/identity/auth/auth.service';
import {
  EmailVerificationService,
  LocalTestEmailDelivery,
} from '../modules/identity/email-verification/email-verification.service';
import { LifecycleService } from '../modules/lifecycle/application/lifecycle.service';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { PortfolioLotService } from '../modules/finance/application/portfolio-lot.service';
import { OwnershipOperationsService } from '../modules/ownership/application/ownership-operations.service';
import { OwnershipService } from '../modules/ownership/application/ownership.service';
import { OwnershipPolicyService } from '../modules/ownership/application/ownership-policy.service';
import { ComplianceService } from '../modules/providers/application/compliance.service';
import { SubmissionService } from '../modules/submissions/application/submission.service';
import { LocalSubmissionStorage } from '../modules/submissions/infrastructure/local-submission-storage';
import { TradingService } from '../modules/trading/application/trading.service';
import { tradingPolicy } from '../modules/trading/domain/trading-policy';
import {
  ensureDemoAccount,
  ensureDemoFunding,
  runStagingDemoSetup,
} from './setup-staging-demo';
import {
  assertStagingDemoSafety,
  demoAccounts,
  requiredSecret,
} from './staging-demo-safety';

/** Roles owned by the dedicated Collector fixture. Review authority is separate. */
export const COLLECTOR_FIXTURE_ROLES = ['COLLECTOR'] as const;

type DemoAsset = Readonly<{
  key: string;
  title: string;
  category: string;
  manufacturer: string;
  set: string;
  year: number;
  cardNumber: string;
  subject: string;
  variant?: string;
  /** Slice-only illustrative ownership basis; never an external market quote. */
  illustrativeValueMinor: bigint;
  illustrativeAvailableBps: number;
  state: 'PUBLISHED';
  grading: Readonly<{
    companyCode: 'PSA' | 'BGS';
    grade: '9.50' | '10.00';
    label: 'Mint' | 'Gem Mint';
  }>;
  reference: Readonly<{
    source: string;
    observedAt: string;
    currentListing?: Readonly<{
      amountMinor: bigint;
      currency: 'GBP' | 'USD' | 'CAD';
      observedAt: string;
      source: string;
      externalReference: string;
      listingUrl: string;
      imageUrl: string;
    }>;
    recentCompletedSale?: Readonly<{
      amountMinor: bigint;
      currency: 'GBP' | 'USD' | 'CAD';
      observedAt: string;
      source: string;
      externalReference: string;
      listingUrl: string;
    }>;
  }>;
}>;

const retiredDemoAssetKeys = [
  'charizard',
  'pikachu',
  'blastoise',
  'jordan',
  'mantle',
  'dark-magician',
  'black-lotus',
  'one-piece',
  'luka',
  'rayquaza',
  'specialist-dark-magician',
  'specialist-black-lotus',
  'specialist-one-piece',
] as const;

const assets: readonly DemoAsset[] = [
  {
    key: 'umbreon-vmax-moonbreon',
    title: '2021 Pokemon Evolving Skies Umbreon VMAX Alternate Art',
    category: 'Pokémon TCG',
    manufacturer: 'The Pokémon Company',
    set: 'Evolving Skies',
    year: 2021,
    cardNumber: '215/203',
    subject: 'Umbreon VMAX',
    variant: 'Alternate Art Secret',
    illustrativeValueMinor: 427700n,
    illustrativeAvailableBps: 3200,
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
    reference: {
      source:
        'PriceCharting public eBay sale records; Cosmic Collectables UK listing',
      observedAt: '2026-08-12',
      currentListing: {
        amountMinor: 195000n,
        currency: 'GBP',
        observedAt: '2026-07-24',
        source: 'Cosmic Collectables UK',
        externalReference: 'PSA 102738334',
        listingUrl:
          'https://cosmiccollectables.co.uk/products/psa-pokemon-swsh-evolving-skies-215-203-umbreon-vmax-alt-art-psa-10',
        imageUrl:
          'https://cosmiccollectables.co.uk/cdn/shop/files/Z2FBIT06uE6J50sXtPNemA_1024x1024%402x.jpg?v=1740580550',
      },
      recentCompletedSale: {
        amountMinor: 427700n,
        currency: 'USD',
        observedAt: '2026-07-27',
        source: 'PriceCharting public eBay record',
        externalReference: 'PSA 10 comparable',
        listingUrl:
          'https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215',
      },
    },
  },
  {
    key: 'pikachu-grey-felt-hat',
    title: '2023 Pokemon Pikachu with Grey Felt Hat',
    category: 'Pokémon TCG',
    manufacturer: 'The Pokémon Company',
    set: 'Pokemon x Van Gogh Museum Promo',
    year: 2023,
    cardNumber: 'SVP 085',
    subject: 'Pikachu',
    variant: 'Van Gogh Museum Promo',
    illustrativeValueMinor: 235337n,
    illustrativeAvailableBps: 4100,
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
    reference: {
      source: 'eBay listing; PriceCharting public completed-sale record',
      observedAt: '2026-08-12',
      currentListing: {
        amountMinor: 47000n,
        currency: 'USD',
        observedAt: '2026-08-12',
        source: 'eBay',
        externalReference: 'eBay item 306504969037',
        listingUrl: 'https://www.ebay.com/itm/306504969037',
        imageUrl: 'https://i.ebayimg.com/images/g/PDYAAeSwQypozB9o/s-l1600.jpg',
      },
      recentCompletedSale: {
        amountMinor: 144050n,
        currency: 'USD',
        observedAt: '2026-07-24',
        source: 'PriceCharting Marketplace',
        externalReference: 'PriceCharting offer h6f67z',
        listingUrl:
          'https://www.pricecharting.com/offer/37wwhlfu2tncjlqinmoisb2ff4',
      },
    },
  },
  {
    key: 'charizard-ex-obsidian-flames',
    title: '2023 Pokemon Charizard ex Special Illustration Rare',
    category: 'Pokémon TCG',
    manufacturer: 'The Pokémon Company',
    set: 'Obsidian Flames',
    year: 2023,
    cardNumber: '223/197',
    subject: 'Charizard ex',
    variant: 'Special Illustration Rare',
    illustrativeValueMinor: 79900n,
    illustrativeAvailableBps: 5200,
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
    reference: {
      source: 'eBay listing; PriceCharting public completed-sale records',
      observedAt: '2026-08-12',
      currentListing: {
        amountMinor: 39999n,
        currency: 'USD',
        observedAt: '2026-08-12',
        source: 'eBay',
        externalReference: 'eBay item 116612500558',
        listingUrl: 'https://www.ebay.ca/itm/116612500558',
        imageUrl: 'https://i.ebayimg.com/images/g/iH0AAeSwDSJoLhDr/s-l1200.jpg',
      },
      recentCompletedSale: {
        amountMinor: 79000n,
        currency: 'USD',
        observedAt: '2026-07-24',
        source: 'PriceCharting public eBay record',
        externalReference: 'PSA 10 comparable',
        listingUrl:
          'https://www.pricecharting.com/game/pokemon-obsidian-flames/charizard-ex-223',
      },
    },
  },
  {
    key: 'victor-wembanyama-prizm-rookie',
    title: '2023-24 Panini Prizm Victor Wembanyama Rookie',
    category: 'Sports Cards',
    manufacturer: 'Panini',
    set: 'Panini Prizm Basketball',
    year: 2023,
    cardNumber: '136',
    subject: 'Victor Wembanyama',
    variant: 'Base Rookie',
    illustrativeValueMinor: 15250n,
    illustrativeAvailableBps: 6000,
    state: 'PUBLISHED',
    grading: { companyCode: 'BGS', grade: '9.50', label: 'Mint' },
    reference: {
      source:
        'Fanatics Collect listing image; SportsCardsPro public eBay reference',
      observedAt: '2026-08-12',
      currentListing: {
        amountMinor: 21500n,
        currency: 'USD',
        observedAt: '2026-07-27',
        source: 'eBay listing indexed by SportsCardsPro',
        externalReference: '2023-24 Panini Prizm #136 BGS 9.5',
        listingUrl:
          'https://www.sportscardspro.com/game/basketball-cards-2023-panini-prizm/victor-wembanyama-136',
        imageUrl:
          'https://cdn-vault.fanaticscollect.com/2024/6/13/bs1/large/v864147_2024061303010659R_3.jpg',
      },
      recentCompletedSale: {
        amountMinor: 27500n,
        currency: 'USD',
        observedAt: '2026-06-02',
        source: 'Collectibles.com recorded eBay result',
        externalReference: 'BGS 9.5 comparable',
        listingUrl:
          'https://collectibles.com/basketball-cards/ci-2023-panini-prizm-136-rc-victor-wembanyama?catalog_item_variation_id=20929933',
      },
    },
  },
  {
    key: 'connor-bedard-young-guns',
    title: '2023-24 Upper Deck Connor Bedard Young Guns Rookie',
    category: 'Sports Cards',
    manufacturer: 'Upper Deck',
    set: 'Upper Deck Series 2 Hockey',
    year: 2023,
    cardNumber: '451',
    subject: 'Connor Bedard',
    variant: 'Young Guns Rookie',
    illustrativeValueMinor: 49689n,
    illustrativeAvailableBps: 4700,
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
    reference: {
      source: 'Mintink product listing; eBay completed sale',
      observedAt: '2026-08-12',
      currentListing: {
        amountMinor: 75000n,
        currency: 'CAD',
        observedAt: '2026-08-12',
        source: 'Mintink',
        externalReference: 'PSA 97040794',
        listingUrl:
          'https://www.mintink.ca/products/2023-24-upper-deck-series-2-hockey-connor-bedard-young-guns-psa-13',
        imageUrl:
          'https://www.mintink.ca/cdn/shop/files/2023-24-Upper-Deck-Series-2-Hockey-Connor-Bedard-Young-Guns-PSA-10_-225250748.png',
      },
      recentCompletedSale: {
        amountMinor: 49689n,
        currency: 'USD',
        observedAt: '2025-06-09',
        source: 'eBay',
        externalReference: 'eBay item 365638362836',
        listingUrl: 'https://www.ebay.ca/itm/365638362836',
      },
    },
  },
  {
    key: 'cj-stroud-purple-pulsar-rookie',
    title: '2023 Panini Prizm C.J. Stroud Purple Pulsar Rookie',
    category: 'Sports Cards',
    manufacturer: 'Panini',
    set: 'Panini Prizm Football',
    year: 2023,
    cardNumber: '339',
    subject: 'C.J. Stroud',
    variant: 'Purple Pulsar',
    illustrativeValueMinor: 55000n,
    illustrativeAvailableBps: 3800,
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
    reference: {
      source: 'eBay listing; Sports Card Investor completed-sale record',
      observedAt: '2026-08-12',
      currentListing: {
        amountMinor: 55000n,
        currency: 'USD',
        observedAt: '2026-08-12',
        source: 'eBay',
        externalReference: 'eBay item 266918752662',
        listingUrl: 'https://www.ebay.com/itm/266918752662',
        imageUrl: 'https://i.ebayimg.com/images/g/C5UAAOSwQXNmn-5p/s-l1200.jpg',
      },
      recentCompletedSale: {
        amountMinor: 3667n,
        currency: 'USD',
        observedAt: '2026-07-24',
        source: 'Sports Card Investor',
        externalReference: 'Purple Pulsar PSA 10 comparable',
        listingUrl:
          'https://www.sportscardinvestor.com/cards/cj-stroud-football/2023-prizm-purple-pulsar-339',
      },
    },
  },
];

/*
 * Retired, tagged staging records are archived rather than deleted. This keeps
 * any audit references intact while ensuring the public catalogue contains
 * only the current modern reference set.
 */
async function archiveRetiredDemoAssets(db: PrismaService) {
  await db.asset.updateMany({
    where: {
      slug: { in: retiredDemoAssetKeys.map((key) => `slice-demo-${key}`) },
    },
    data: { status: 'ARCHIVED' },
  });
}

/**
 * Retire the old collector-only staging queue without touching customer data.
 * The current showcase submissions have stable certification identifiers; all
 * other submissions belonging to this dedicated demo account are cancelled so
 * they remain auditable but disappear from the active workspace projection.
 */
async function archiveRetiredDemoSubmissions(
  db: PrismaService,
  ownerUserId: string,
) {
  const currentCertificationNumbers = new Set(
    assets.map((asset) => `STG-${asset.key.toUpperCase()}`),
  );
  const submissions = await db.assetSubmission.findMany({
    where: { ownerUserId, status: { not: 'CANCELLED' } },
    select: { id: true, declaredMetadata: true },
  });
  const retiredIds = submissions
    .filter((submission) => {
      const metadata =
        submission.declaredMetadata &&
        typeof submission.declaredMetadata === 'object' &&
        !Array.isArray(submission.declaredMetadata)
          ? (submission.declaredMetadata as { certificationNumber?: unknown })
          : {};
      return !(
        typeof metadata.certificationNumber === 'string' &&
        currentCertificationNumbers.has(metadata.certificationNumber)
      );
    })
    .map((submission) => submission.id);
  if (!retiredIds.length) return;
  await db.assetSubmission.updateMany({
    where: { id: { in: retiredIds }, ownerUserId, status: { not: 'CANCELLED' } },
    data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } },
  });
}

/*
 * Historical fixture retained only as a source migration map. It is never
 * created or published by this setup.
 */
const retiredAssets: readonly unknown[] = [
  {
    key: 'charizard',
    title: '1999 Pokémon Base Set Charizard Holo',
    category: 'Pokémon',
    set: 'Base Set',
    year: 1999,
    valueMinor: 2458000n,
    historyProfile: 'UPWARD',
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
  },
  {
    key: 'pikachu',
    title: '2020 Pokémon Pikachu Illustrator',
    category: 'Pokémon',
    set: 'Promo Collection',
    year: 2020,
    valueMinor: 615000n,
    historyProfile: 'VOLATILE',
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '9.00', label: 'Mint' },
  },
  {
    key: 'blastoise',
    title: '1999 Pokémon Base Set Blastoise Holo',
    category: 'Pokémon',
    set: 'Base Set',
    year: 1999,
    valueMinor: 465000n,
    historyProfile: 'STABLE',
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '9.00', label: 'Mint' },
  },
  {
    key: 'jordan',
    title: '1986 Fleer Michael Jordan Rookie',
    category: 'Sports Cards',
    set: 'Fleer Basketball',
    year: 1986,
    valueMinor: 682000n,
    historyProfile: 'UPWARD',
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '8.00', label: 'Near Mint-Mint' },
  },
  {
    key: 'mantle',
    title: '1952 Topps Mickey Mantle',
    category: 'Sports Cards',
    set: 'Topps Baseball',
    year: 1952,
    valueMinor: 1285000n,
    historyProfile: 'DOWNWARD',
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '8.00', label: 'Near Mint-Mint' },
  },
  {
    key: 'dark-magician',
    title: '2002 Yu-Gi-Oh! Dark Magician',
    category: 'Yu-Gi-Oh!',
    set: 'Legend of Blue Eyes',
    year: 2002,
    valueMinor: 68000n,
    historyProfile: 'VOLATILE',
    state: 'CUSTODY',
    grading: { companyCode: 'BGS', grade: '9.00', label: 'Mint' },
  },
  {
    key: 'black-lotus',
    title: '1993 Magic: The Gathering Black Lotus',
    category: 'Magic: The Gathering',
    set: 'Unlimited Edition',
    year: 1993,
    valueMinor: 9200000n,
    historyProfile: 'VOLATILE',
    state: 'CHANGES_REQUESTED',
    grading: { companyCode: 'BGS', grade: '9.00', label: 'Mint' },
  },
  {
    key: 'one-piece',
    title: '2023 One Piece Manga Rare Shanks',
    category: 'One Piece',
    set: 'Romance Dawn',
    year: 2023,
    valueMinor: 365000n,
    historyProfile: 'UPWARD',
    state: 'SUBMITTED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
  },
  {
    key: 'luka',
    title: '2018 Panini Prizm Luka Dončić Rookie',
    category: 'Sports Cards',
    set: 'Panini Prizm',
    year: 2018,
    valueMinor: 285000n,
    historyProfile: 'STABLE',
    state: 'DRAFT',
    grading: { companyCode: 'PSA', grade: '9.00', label: 'Mint' },
  },
  {
    key: 'rayquaza',
    title: '2005 Pokémon Gold Star Rayquaza',
    category: 'Pokémon',
    set: 'EX Deoxys',
    year: 2005,
    valueMinor: 875000n,
    historyProfile: 'UPWARD',
    state: 'DRAFT',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
  },
  {
    key: 'specialist-dark-magician',
    owner: 'SECONDARY',
    title: '2002 Yu-Gi-Oh! Dark Magician',
    category: 'Yu-Gi-Oh!',
    set: 'Legend of Blue Eyes',
    year: 2002,
    valueMinor: 68000n,
    historyProfile: 'VOLATILE',
    state: 'PUBLISHED',
    grading: { companyCode: 'BGS', grade: '9.00', label: 'Mint' },
  },
  {
    key: 'specialist-black-lotus',
    owner: 'SECONDARY',
    title: '1993 Magic: The Gathering Black Lotus',
    category: 'Magic: The Gathering',
    set: 'Unlimited Edition',
    year: 1993,
    valueMinor: 9200000n,
    historyProfile: 'VOLATILE',
    state: 'PUBLISHED',
    grading: { companyCode: 'BGS', grade: '9.00', label: 'Mint' },
  },
  {
    key: 'specialist-one-piece',
    owner: 'SECONDARY',
    title: '2023 One Piece Manga Rare Shanks',
    category: 'One Piece',
    set: 'Romance Dawn',
    year: 2023,
    valueMinor: 365000n,
    historyProfile: 'UPWARD',
    state: 'PUBLISHED',
    grading: { companyCode: 'PSA', grade: '10.00', label: 'Gem Mint' },
  },
];
void retiredAssets;

/**
 * Stable identifiers for the explicitly named staging catalogue.  The market
 * health check imports these rather than duplicating the fixture definition,
 * which keeps its assertions aligned with the lifecycle fixture.
 */
export const stagingDemoAssetSlugs = assets.map(
  (asset) => `slice-demo-${asset.key}`,
);

export const publishedStagingDemoAssetSlugs = assets
  .filter((asset) => asset.state === 'PUBLISHED')
  .map((asset) => `slice-demo-${asset.key}`);

const fixturePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

/**
 * Every evidence slot must have its own digest. The submissions authority
 * deliberately rejects duplicate evidence hashes within a submission, so a
 * single shared 1px fixture cannot be used for both its front and back media.
 * Keeping the payload length stable also lets an interrupted local fixture run
 * finish a pending upload created by an earlier invocation.
 */
function fixtureMedia(identity: string) {
  const bytes = Buffer.from(fixturePng);
  let marker = 0;
  for (const character of identity)
    marker = (marker + character.charCodeAt(0)) % 251;
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] + marker + 1) % 256;
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

/** Deterministic staging history profile used only by the fixture test. It is
 * not presented as external market movement or valuation evidence. */
export function demoMarketHistoryAdjustmentBps(
  profile: 'UPWARD' | 'DOWNWARD' | 'STABLE' | 'VOLATILE',
  day: number,
) {
  if (profile === 'UPWARD') return -900 + day * 20;
  if (profile === 'DOWNWARD') return 900 - day * 20;
  if (profile === 'STABLE') return 0;
  return [0, 260, -180, 330, -300, 140, -220][day % 7];
}

/**
 * Staging-only fixture that deliberately uses D10/D11/D12 authority. It never
 * alters balances, creates provider state, or writes lifecycle fields directly.
 * Asset market history is a clearly-labelled staging market-data fixture.
 */
export async function runCollectorDemoSetup() {
  assertStagingDemoSafety();
  await runStagingDemoSetup();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(PrismaService);
    const auth = app.get(AuthService);
    const access = app.get(AccessControlService);
    const catalogue = app.get(CatalogueService);
    const submissions = app.get(SubmissionService);
    const storage = app.get(LocalSubmissionStorage);
    const lifecycle = app.get(LifecycleService);
    const ownership = app.get(OwnershipService);
    const ownershipPolicy = app.get(OwnershipPolicyService);
    const ownershipOps = app.get(OwnershipOperationsService);
    const ledger = app.get(FinancialLedgerService);
    const lots = app.get(PortfolioLotService);
    const compliance = app.get(ComplianceService);
    const trading = app.get(TradingService);
    const emailVerification = app.get(EmailVerificationService);
    const emailDelivery = app.get(LocalTestEmailDelivery, { strict: false });
    const config = app.get<AppConfig>(APP_CONFIG);
    const admin = await loginAdmin(auth);
    const investor = await loginActor(auth, demoAccounts.investor);
    const collector = await loginActor(auth, demoAccounts.collector);
    const collectorB = await ensureCollectorB(auth, access, db, admin, config);

    await ensureLocalEmailVerification(
      config,
      emailVerification,
      emailDelivery,
      collector,
    );
    await ensureLocalEmailVerification(
      config,
      emailVerification,
      emailDelivery,
      collectorB,
    );
    await ensureCollectorRoles(access, db, admin, collector.userId);
    await ensureCollectorRoles(access, db, admin, collectorB.userId);
    await ensureCollectorEntitlementsAndVaults(db);
    const collectorReviewer = await loginActor(auth, demoAccounts.collector);
    await archiveRetiredDemoAssets(db);
    await archiveRetiredDemoSubmissions(db, collector.userId);
    await db.publicCollectorProfile.upsert({
      where: { userId: collector.userId },
      create: {
        userId: collector.userId,
        slug: 'slice-demo-collector',
        headline:
          'Public showcase collector for modern Pokémon and sports-card reference listings.',
        specialism: 'Pokémon TCG · Sports Cards',
        isPublic: true,
        publishedAt: new Date(),
      },
      update: {
        headline:
          'Public showcase collector for modern Pokémon and sports-card reference listings.',
        specialism: 'Pokémon TCG · Sports Cards',
        isPublic: true,
        publishedAt: new Date(),
      },
    });
    await db.publicCollectorProfile.upsert({
      where: { userId: collectorB.userId },
      create: {
        userId: collectorB.userId,
        slug: 'slice-demo-specialist',
        headline:
          'Independent public collector focused on authenticated Yu-Gi-Oh!, Magic: The Gathering and One Piece cards.',
        specialism: 'Yu-Gi-Oh! · Magic: The Gathering · One Piece',
        isPublic: true,
        publishedAt: new Date(),
      },
      update: {
        headline:
          'Independent public collector focused on authenticated Yu-Gi-Oh!, Magic: The Gathering and One Piece cards.',
        specialism: 'Yu-Gi-Oh! · Magic: The Gathering · One Piece',
        isPublic: true,
        publishedAt: new Date(),
      },
    });

    const categoryIds = new Map<string, string>();
    for (const category of new Set(assets.map((asset) => asset.category))) {
      categoryIds.set(
        category,
        await ensureCategory(db, catalogue, admin, category),
      );
    }
    const gradeIds = await ensureDemoGrades(db, catalogue, admin);
    for (const spec of assets) {
      const owner = collector;
      const asset = await ensureAsset(
        db,
        catalogue,
        admin,
        spec,
        categoryIds.get(spec.category)!,
        gradeIds.get(`${spec.grading.companyCode}:${spec.grading.grade}`)!,
      );
      const submission = await ensureSubmission(
        db,
        submissions,
        storage,
        owner,
        admin,
        spec,
        asset.id,
        categoryIds.get(spec.category)!,
      );
      if (spec.state === 'PUBLISHED' || spec.state === 'CUSTODY') {
        await ensureAssetLifecycle(
          db,
          lifecycle,
          ownership,
          ownershipPolicy,
          ownershipOps,
          lots,
          admin,
          owner.userId,
          asset.id,
          spec,
          spec.state === 'PUBLISHED',
        );
        await ensureMarketReference(db, asset.id, spec);
        await ensureExternalReferenceEvidence(db, asset.id, admin.userId, spec);
      }
      void submission;
    }
    await ensureWorkspaceQueue(
      db,
      submissions,
      storage,
      collectorB,
      collectorReviewer,
      categoryIds.get('Pokémon TCG')!,
    );
    await ensureDemoWatchlists(db, investor.userId, collector.userId);
    const tradingFixture = await ensureTradingDemonstration({
      config,
      db,
      auth,
      access,
      admin,
      investor,
      collector,
      emailVerification,
      emailDelivery,
      ownershipOps,
      lots,
      ledger,
      compliance,
      trading,
    });
    const published = await db.asset.count({
      where: {
        submissions: { some: { ownerUserId: collector.userId } },
        status: 'PUBLISHED',
      },
    });
    const secondaryPublished = await db.asset.count({
      where: {
        submissions: { some: { ownerUserId: collectorB.userId } },
        status: 'PUBLISHED',
      },
    });
    const publicProfiles = await db.publicCollectorProfile.count({
      where: {
        isPublic: true,
        slug: { in: ['slice-demo-collector', 'slice-demo-specialist'] },
      },
    });
    const queue = await db.assetSubmission.count({
      where: { reviewerId: collectorReviewer.userId, status: 'IN_REVIEW' },
    });
    process.stdout.write(
      JSON.stringify({
        result: 'STAGING_COLLECTOR_DEMO_READY',
        collector: demoAccounts.collector.email,
        publicProfile: 'slice-demo-collector',
        publishedListings: published,
        secondaryCollector: {
          profile: 'slice-demo-specialist',
          publishedListings: secondaryPublished,
        },
        publicProfiles,
        reviewerAssignments: queue,
        assetCount: assets.length,
        trading: tradingFixture,
        media:
          'D10 evidence records are real; local object storage remains process-local and is not a durable public-thumbnail provider.',
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

async function loginAdmin(auth: AuthService) {
  const email = process.env.DEMO_SETUP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_SETUP_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      'DEMO_SETUP_ADMIN_EMAIL and DEMO_SETUP_ADMIN_PASSWORD are required.',
    );
  const session = await auth.login(
    { email, password },
    `collector-demo-admin-${randomUUID()}`,
    { userAgent: 'slice-staging-collector-demo' },
  );
  const actor = await auth.actor(session.accessToken);
  if (!actor.roles.includes('ADMIN'))
    throw new Error(
      'The configured demo setup account must be an active ADMIN.',
    );
  return actor;
}

async function loginActor(
  auth: AuthService,
  demo: (typeof demoAccounts)[keyof typeof demoAccounts],
) {
  const session = await auth.login(
    { email: demo.email, password: requiredSecret(demo.passwordEnv) },
    `collector-demo-login-${randomUUID()}`,
    { userAgent: 'slice-staging-collector-demo' },
  );
  return auth.actor(session.accessToken);
}

async function ensureCollectorEntitlementsAndVaults(db: PrismaService) {
  const plans = await db.collectorPlan.findMany({
    where: { code: { in: ['STARTER', 'PRO', 'ELITE'] }, active: true },
    select: { code: true },
  });
  if (plans.length !== 3) {
    throw new Error('Collector membership plans are missing. Apply the membership migration before running the demo setup.');
  }
  // Membership plans are migration-owned and membership state is Stripe-owned.
  // This fixture may provision vault reference data, but it must never create
  // or reactivate a fake paid subscription.
  const destinations = [
    ['Slice London Vault', 'London', 'GB', 'Ship using a tracked service. Include the intake reference on the outer packaging.', 'Slice Collectable\nIntake team\nLondon, United Kingdom'],
    ['Slice US East Intake', 'US East', 'US', 'Use protective packaging and a tracked service. Include the intake reference with your shipment.', 'Slice Collectable\nUS East Intake\nUnited States'],
  ] as const;
  for (const [displayName, region, countryCode, shippingInstructions, customerSafeAddress] of destinations) {
    await db.vaultIntakeLocation.upsert({ where: { id: `staging-${countryCode.toLowerCase()}-intake` }, create: { id: `staging-${countryCode.toLowerCase()}-intake`, displayName, region, countryCode, shippingInstructions, customerSafeAddress, acceptedCategories: [], operationallyApproved: false, acceptingShipments: false, environment: 'beta' }, update: { displayName, region, countryCode, shippingInstructions, customerSafeAddress, active: true, intakeAvailable: true, operationallyApproved: false, acceptingShipments: false, environment: 'beta' } });
  }
}

async function ensureCollectorB(
  auth: AuthService,
  access: AccessControlService,
  db: PrismaService,
  admin: Actor,
  config: AppConfig,
) {
  const demo = demoAccounts.collectorB;
  let user = await db.user.findUnique({
    where: { normalizedEmail: demo.email },
    select: { accountStatus: true },
  });
  if (!user) {
    await auth.signup(
      {
        email: demo.email,
        password: requiredSecret(demo.passwordEnv),
        displayName: demo.displayName,
        consent: config.signupConsent.required
          ? {
              termsAccepted: true,
              privacyAccepted: true,
              termsVersion: config.signupConsent.termsVersion!,
              privacyVersion: config.signupConsent.privacyVersion!,
            }
          : undefined,
      },
      `collector-b-signup-${randomUUID()}`,
      `collector-b-signup:${demo.email}`,
      { userAgent: 'slice-staging-collector-demo' },
    );
    user = { accountStatus: 'PENDING_REVIEW' };
  }
  let actor = await loginActor(auth, demo);
  if (user.accountStatus === 'PENDING_REVIEW') {
    await access.transitionStatus(
      admin,
      actor.userId,
      { toStatus: 'ACTIVE', reasonCode: 'STAGING_DEMO_COLLECTOR_B_ACTIVATION' },
      `collector-b-active-${randomUUID()}`,
      'collector-b-active',
    );
    actor = await loginActor(auth, demo);
  }
  await auth.updateProfile(
    actor,
    { displayName: demo.displayName, publicUsername: 'slice-demo-collector-b' },
    `collector-b-profile-${randomUUID()}`,
    `collector-b-profile:${demo.email}`,
  );
  return actor;
}

async function ensureLocalEmailVerification(
  config: AppConfig,
  service: EmailVerificationService,
  delivery: LocalTestEmailDelivery | undefined,
  actor: Actor,
) {
  const user = await (
    service as unknown as {
      status(actor: Actor): Promise<{ verified: boolean }>;
    }
  ).status(actor);
  if (user.verified) return;
  if (
    config.environment === 'production' ||
    config.emailDeliveryMode !== 'local_test' ||
    !delivery
  )
    throw new Error(
      'Collector fixture requires the configured local-test email delivery authority; it will not forge provider verification.',
    );
  await service.send(actor, '127.0.0.1', `collector-email-${randomUUID()}`);
  const token = delivery.tokenForTest(actor.userId);
  if (!token)
    throw new Error(
      'Local email verification delivery did not produce a token.',
    );
  await service.confirm(
    token,
    '127.0.0.1',
    `collector-email-confirm-${randomUUID()}`,
  );
}

async function ensureCollectorRoles(
  access: AccessControlService,
  db: PrismaService,
  admin: Actor,
  userId: string,
) {
  // A Collector fixture must never receive staff-review authority. Review
  // fixtures are provisioned separately by seed-browser-qa.ts.
  for (const role of COLLECTOR_FIXTURE_ROLES) {
    const current = await db.roleAssignment.findFirst({
      where: {
        userId,
        role,
        scopeType: 'GLOBAL',
        scopeId: '*',
        revokedAt: null,
      },
    });
    if (current) continue;
    await access.grantRole(
      admin,
      userId as never,
      {
        role,
        scopeType: 'GLOBAL',
        scopeId: '*',
      },
      `collector-role-${role.toLowerCase()}-${randomUUID()}`,
      `staging-demo-collector:${userId}:${role.toLowerCase()}`,
    );
  }
}

async function ensureCategory(
  db: PrismaService,
  catalogue: CatalogueService,
  admin: Actor,
  name: string,
) {
  const existing = await db.category.findFirst({
    where: { name, status: 'ACTIVE' },
  });
  if (existing) return existing.id;
  return (
    await catalogue.createCategory(
      admin,
      {
        name,
        slug: slug(name),
        description: `Staging showcase category for ${name}.`,
        status: 'ACTIVE',
      },
      `collector-category-${randomUUID()}`,
      `collector-category:${slug(name)}`,
    )
  ).id;
}

async function ensureAsset(
  db: PrismaService,
  catalogue: CatalogueService,
  admin: Actor,
  spec: DemoAsset,
  categoryId: string,
  gradeScaleEntryId: string,
) {
  const publicId = `stg_collector_${spec.key}`;
  const existing = await db.asset.findUnique({ where: { publicId } });
  if (existing) {
    const patch = {
      title: spec.title,
      shortName: spec.title,
      year: spec.year,
      manufacturer: spec.manufacturer,
      edition: spec.set,
      cardNumber: spec.cardNumber,
      description: showcaseDescription(spec),
      gradeScaleEntryId,
    };
    await catalogue.updateAsset(
      admin,
      existing.id,
      patch,
      `collector-asset-refresh-${randomUUID()}`,
      `collector-asset-refresh:${spec.key}:${createHash('sha256')
        .update(JSON.stringify(patch))
        .digest('hex')
        .slice(0, 16)}`,
    );
    return db.asset.findUniqueOrThrow({ where: { id: existing.id } });
  }
  const set =
    (await db.collectibleSet.findFirst({
      where: { categoryId, name: spec.set, status: 'ACTIVE' },
    })) ??
    (await catalogue.createSet(
      admin,
      {
        categoryId,
        name: spec.set,
        slug: `${slug(spec.category)}-${slug(spec.set)}`,
        manufacturer: spec.manufacturer,
        releaseYear: spec.year,
        status: 'ACTIVE',
      },
      `collector-set-${randomUUID()}`,
      `collector-set:${spec.category}:${spec.set}`,
    ));
  const created = await catalogue.createAsset(
    admin,
    {
      publicId,
      slug: `slice-demo-${spec.key}`,
      categoryId,
      setId: set.id,
      title: spec.title,
      shortName: spec.title,
      year: spec.year,
      manufacturer: spec.manufacturer,
      edition: spec.set,
      cardNumber: spec.cardNumber,
      description: showcaseDescription(spec),
      gradeScaleEntryId,
      certificationNumber: `STG-${spec.key.toUpperCase()}`,
    },
    `collector-asset-${randomUUID()}`,
    `collector-asset:${spec.key}`,
  );
  return db.asset.findUniqueOrThrow({ where: { id: created.id } });
}

function showcaseDescription(spec: DemoAsset) {
  return [
    'Staging showcase reference only.',
    `${spec.subject} · ${spec.set} · #${spec.cardNumber}.`,
    spec.variant ? `Variant: ${spec.variant}.` : undefined,
    'The displayed market observations and listing image are external references; Slice does not represent ownership of the pictured card.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The demo catalogue uses the same audited catalogue authority as operator
 * setup. It is deliberately idempotent so refresh repairs incomplete local
 * fixture runs without overwriting unrelated reference data.
 */
async function ensureDemoGrades(
  db: PrismaService,
  catalogue: CatalogueService,
  admin: Actor,
) {
  const ids = new Map<string, string>();
  const required = new Map(
    assets.map((asset) => [
      `${asset.grading.companyCode}:${asset.grading.grade}`,
      asset.grading,
    ]),
  );
  for (const grading of required.values()) {
    let company = await db.gradingCompany.findUnique({
      where: { code: grading.companyCode },
    });
    if (!company) {
      await catalogue.createCompany(
        admin,
        {
          code: grading.companyCode,
          name:
            grading.companyCode === 'PSA'
              ? 'Professional Sports Authenticator'
              : 'Beckett Grading Services',
          status: 'ACTIVE',
        },
        `collector-grade-company-${randomUUID()}`,
        `collector-grade-company:${grading.companyCode}`,
      );
      company = await db.gradingCompany.findUniqueOrThrow({
        where: { code: grading.companyCode },
      });
    }
    let grade = await db.gradeScaleEntry.findUnique({
      where: {
        companyId_grade: { companyId: company.id, grade: grading.grade },
      },
    });
    if (!grade) {
      await catalogue.createGrade(
        admin,
        {
          companyId: company.id,
          grade: grading.grade,
          label: grading.label,
          sortOrder: Math.round(Number(grading.grade) * 10),
          active: true,
        },
        `collector-grade-${randomUUID()}`,
        `collector-grade:${grading.companyCode}:${grading.grade}`,
      );
      grade = await db.gradeScaleEntry.findUniqueOrThrow({
        where: {
          companyId_grade: { companyId: company.id, grade: grading.grade },
        },
      });
    }
    ids.set(`${grading.companyCode}:${grading.grade}`, grade.id);
  }
  return ids;
}

async function ensureSubmission(
  db: PrismaService,
  service: SubmissionService,
  storage: LocalSubmissionStorage,
  owner: Actor,
  admin: Actor,
  spec: DemoAsset,
  assetId: string,
  categoryId: string,
) {
  const requestedState: string = spec.state;
  const certificationNumber = `STG-${spec.key.toUpperCase()}`;
  let submission = await db.assetSubmission.findFirst({
    where: { assetId, ownerUserId: owner.userId },
  });
  // Draft, submitted and changes-requested records are intentionally not
  // linked to a catalogue asset yet. Locate those fixtures by their stable,
  // explicit certification identifier so refresh remains idempotent.
  if (!submission) {
    const ownerSubmissions = await db.assetSubmission.findMany({
      where: { ownerUserId: owner.userId },
      orderBy: { createdAt: 'asc' },
    });
    submission =
      ownerSubmissions.find(
        (row) =>
          (row.declaredMetadata as { certificationNumber?: string } | null)
            ?.certificationNumber === certificationNumber,
      ) ?? null;
  }
  if (!submission) {
    const draft = await service.create(
      owner,
      {
        categoryId,
        declaredMetadata: {
          name: spec.title,
          manufacturer: spec.manufacturer,
          year: String(spec.year),
          certificationNumber,
          details: `${spec.reference.source}; reference observed ${spec.reference.observedAt}. This is a reference-only staging showcase, and the illustrative Slice ownership terms are not an external sale offer.`,
        },
      },
      `collector-submission-${randomUUID()}`,
      `collector-submission:${spec.key}`,
    );
    submission = await db.assetSubmission.findUniqueOrThrow({
      where: { id: draft.id },
    });
  }
  if (requestedState !== 'DRAFT' && submission.status === 'DRAFT') {
    const mediaBySlot = new Map(
      (
        await db.submissionMedia.findMany({
          where: { submissionId: submission.id, deletedAt: null },
        })
      ).map((media) => [media.slot, media]),
    );
    for (const slot of ['front', 'back']) {
      const fixture = fixtureMedia(`${spec.key}:${slot}`);
      let media = mediaBySlot.get(slot);
      if (media?.status === 'REJECTED') {
        const latest = await db.assetSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        });
        await service.deleteMedia(
          owner,
          submission.id,
          media.id,
          latest.version,
          `collector-media-delete-${randomUUID()}`,
          `collector-media-delete:${spec.key}:${slot}`,
        );
        media = undefined;
      }
      if (!media) {
        const intent = await service.uploadIntent(
          owner,
          submission.id,
          {
            slot,
            mimeType: 'image/png',
            sizeBytes: fixture.bytes.length,
            originalFilename: `${spec.key}-${slot}.png`,
          },
          `collector-media-${randomUUID()}`,
          `collector-media:${spec.key}:${slot}`,
        );
        media = await db.submissionMedia.findUniqueOrThrow({
          where: { id: intent.media.id },
        });
      }
      if (media.status !== 'SAFE') {
        storage.putForTest({
          key: media.objectKey,
          mimeType: 'image/png',
          sizeBytes: media.sizeBytes,
          sha256: fixture.sha256,
          magicMimeType: 'image/png',
          width: 1,
          height: 1,
        });
        const latest = await db.assetSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        });
        await service.completeMedia(
          owner,
          submission.id,
          media.id,
          { sha256: fixture.sha256, version: latest.version },
          `collector-media-complete-${randomUUID()}`,
          `collector-media-complete:${spec.key}:${slot}`,
        );
      }
    }
    const latest = await db.assetSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    await service.submit(
      owner,
      submission.id,
      latest.version,
      `collector-submit-${randomUUID()}`,
      `collector-submit:${spec.key}`,
    );
  }
  submission = await db.assetSubmission.findUniqueOrThrow({
    where: { id: submission.id },
  });
  if (
    requestedState === 'CHANGES_REQUESTED' &&
    submission.status === 'SUBMITTED'
  ) {
    await service.claim(
      admin,
      submission.id,
      `collector-claim-${randomUUID()}`,
      `collector-claim:${spec.key}`,
    );
    await service.decide(
      admin,
      submission.id,
      'CHANGES_REQUESTED',
      {
        reasonCode: 'EVIDENCE_REVIEW_REQUIRED',
        note: 'Staging fixture: evidence follow-up required.',
      },
      `collector-changes-${randomUUID()}`,
      `collector-changes:${spec.key}`,
    );
  }
  if (
    (requestedState === 'CUSTODY' || requestedState === 'PUBLISHED') &&
    submission.status === 'SUBMITTED'
  ) {
    await service.claim(
      admin,
      submission.id,
      `collector-claim-${randomUUID()}`,
      `collector-claim:${spec.key}`,
    );
    await service.decide(
      admin,
      submission.id,
      'APPROVED',
      {
        reasonCode: 'STAGING_DEMO_APPROVED',
        note: 'Staging fixture approved through D10 review.',
      },
      `collector-approve-${randomUUID()}`,
      `collector-approve:${spec.key}`,
    );
  }
  submission = await db.assetSubmission.findUniqueOrThrow({
    where: { id: submission.id },
  });
  // A prior invocation can succeed through review and then be interrupted
  // before the separate asset-link authority commits. Resume that exact
  // authority on refresh rather than leaving an approved submission unusable
  // for custody intake.
  if (
    (requestedState === 'CUSTODY' || requestedState === 'PUBLISHED') &&
    submission.status === 'APPROVED' &&
    submission.assetId !== assetId
  ) {
    await service.linkApprovedAsset(
      admin,
      submission.id,
      assetId,
      `collector-link-${randomUUID()}`,
      `collector-link:${spec.key}`,
    );
  }
  return db.assetSubmission.findUniqueOrThrow({ where: { id: submission.id } });
}

async function ensureAssetLifecycle(
  db: PrismaService,
  lifecycle: LifecycleService,
  ownership: OwnershipService,
  ownershipPolicy: OwnershipPolicyService,
  operations: OwnershipOperationsService,
  lots: PortfolioLotService,
  admin: Actor,
  collectorUserId: string,
  assetId: string,
  spec: DemoAsset,
  publish: boolean,
) {
  let custody = await db.vaultCustodyRecord.findUnique({ where: { assetId } });
  if (!custody)
    await lifecycle.handoff(
      admin,
      assetId,
      {
        providerCode: 'STAGING_DEMO_VAULT',
        facilityCode: 'STAGING_DEMO_FACILITY',
        providerRef: `collector-handoff:${spec.key}`,
      },
      `collector-handoff-${randomUUID()}`,
      `collector-handoff:${spec.key}`,
    );
  custody = await db.vaultCustodyRecord.findUniqueOrThrow({
    where: { assetId },
  });
  if (custody.status === 'EXPECTED')
    await lifecycle.custody(
      admin,
      assetId,
      { toStatus: 'RECEIVED', providerRef: `collector-custody-received:${spec.key}` },
      `collector-custody-${randomUUID()}`,
      `collector-custody-received:${spec.key}`,
    );
  custody = await db.vaultCustodyRecord.findUniqueOrThrow({
    where: { assetId },
  });
  if (custody.status === 'RECEIVED')
    await lifecycle.custody(
      admin,
      assetId,
      { toStatus: 'INSPECTED', providerRef: `collector-custody-inspected:${spec.key}` },
      `collector-custody-${randomUUID()}`,
      `collector-custody-inspected:${spec.key}`,
    );
  custody = await db.vaultCustodyRecord.findUniqueOrThrow({
    where: { assetId },
  });
  if (!publish) return;
  const valuation = await db.valuationDecision.findFirst({
    where: { assetId, status: 'ACTIVE' },
  });
  if (!valuation)
    await lifecycle.valuation(
      admin,
      assetId,
      {
        valueMinor: spec.illustrativeValueMinor,
        currency: 'GBP',
        confidence: 92,
        methodologyCode: 'ILLUSTRATIVE_STAGING_SHARE_BASIS',
        sourceType: 'STAGING_DEMO',
      },
      `collector-valuation-${randomUUID()}`,
      `collector-valuation:${spec.key}`,
    );
  const coverage = await db.insuranceCoverage.findFirst({
    where: { assetId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
  });
  if (!coverage)
    await lifecycle.coverage(
      admin,
      assetId,
      {
        insuredValueMinor: spec.illustrativeValueMinor,
        currency: 'GBP',
        effectiveAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 365 * 86400000),
        status: 'ACTIVE',
      },
      `collector-coverage-${randomUUID()}`,
      `collector-coverage:${spec.key}`,
    );
  custody = await db.vaultCustodyRecord.findUniqueOrThrow({ where: { assetId } });
  if (custody.status === 'INSPECTED')
    await lifecycle.custody(
      admin,
      assetId,
      { toStatus: 'SECURED', providerRef: `collector-custody-secured:${spec.key}` },
      `collector-custody-${randomUUID()}`,
      `collector-custody-secured:${spec.key}`,
    );
  const asset = await db.asset.findUniqueOrThrow({
    where: { id: assetId },
    include: { publication: true, ownershipSupply: true },
  });
  if (asset.status !== 'PUBLISHED' || asset.publication?.status !== 'PUBLISHED')
    await lifecycle.publish(
      admin,
      assetId,
      `collector-publish-${randomUUID()}`,
      `collector-publish:${spec.key}`,
    );
  const policy = await db.ownershipSupplyPolicy.findUnique({ where: { assetId } });
  if (!asset.ownershipSupply && !policy)
    await ownershipPolicy.propose(
      admin,
      assetId,
      { policyCode: 'STANDARD_COLLECTIBLE_V1', totalUnits: '1000', reason: 'Staging demo fixture policy.' },
      `collector-policy-propose-${randomUUID()}`,
      `collector-policy-propose:${spec.key}`,
    );
  const proposedPolicy = await db.ownershipSupplyPolicy.findUnique({ where: { assetId } });
  if (!asset.ownershipSupply && proposedPolicy?.status === 'PROPOSED')
    await ownershipPolicy.approve(
      admin,
      assetId,
      'Staging demo fixture policy approval.',
      `collector-policy-approve-${randomUUID()}`,
      `collector-policy-approve:${spec.key}`,
    );
  if (!asset.ownershipSupply)
    await ownership.issue(
      admin,
      assetId,
      '1000',
      `collector-issue-${randomUUID()}`,
      `collector-issue:${spec.key}`,
    );
  const account = await db.ownershipAccount.findFirst({
    where: { userId: collectorUserId, type: 'USER', status: 'ACTIVE' },
  });
  const position = account
    ? await db.ownershipPosition.findUnique({
        where: { assetId_accountId: { assetId, accountId: account.id } },
      })
    : null;
  const owned = position?.settledUnits ?? 0n;
  if (owned < 300n)
    await operations.transfer(
      admin,
      assetId,
      { toUserId: collectorUserId, units: (300n - owned).toString() },
      `collector-ownership-${randomUUID()}`,
      `collector-ownership:${spec.key}:${owned}`,
    );

  // The initial staging allocation is a real portfolio acquisition from the
  // demo fixture's perspective. Record its cost basis through the finance lot
  // service so collector holdings and portfolio snapshots can calculate P/L;
  // do not manufacture a value in the frontend.
  const lotSourceReference = `collector-ownership-lot:${spec.key}`;
  const existingLot = await db.portfolioLot.findUnique({
    where: { sourceReference: lotSourceReference },
    select: { id: true },
  });
  if (!existingLot) {
    const unitPrice = spec.illustrativeValueMinor / 1_000n;
    await lots.recordAcquisition(
      admin,
      {
        userId: collectorUserId,
        assetId,
        units: '300',
        totalCostMinor: (unitPrice * 300n).toString(),
        sourceReference: lotSourceReference,
      },
      `collector-ownership-lot:${spec.key}`,
      `collector-ownership-lot:${spec.key}`,
    );
  }
}

async function ensureMarketReference(
  db: PrismaService,
  assetId: string,
  spec: DemoAsset,
) {
  const asOf = new Date(`${spec.reference.observedAt}T12:00:00.000Z`);
  // The finance snapshot is deliberately an illustrative Slice ownership
  // basis. Public reference listings and completed sales remain in the asset
  // record's source-labelled copy; an external asking price is never treated
  // as Slice's market value.
  await db.assetMarketSnapshot.upsert({
    where: {
      assetId_source_asOf: { assetId, source: 'STAGING_DEMO_MARKET', asOf },
    },
    create: {
      assetId,
      asOf,
      source: 'STAGING_DEMO_MARKET',
      estimatedMarketValueMinor: spec.illustrativeValueMinor,
      currency: 'GBP',
      change24hBps: 0,
      availableBps: spec.illustrativeAvailableBps,
      ownersCount: null,
      watchersCount: null,
      confidence: null,
      status: 'DEMO',
    },
    update: {
      estimatedMarketValueMinor: spec.illustrativeValueMinor,
      change24hBps: 0,
      availableBps: spec.illustrativeAvailableBps,
      ownersCount: null,
      watchersCount: null,
      confidence: null,
      status: 'DEMO',
    },
  });
}

/**
 * Persist external listing and completed-sale observations independently from
 * the illustrative Slice share basis. These records are source-labelled and
 * are never used to synthesize a movement, confidence, or market valuation.
 */
async function ensureExternalReferenceEvidence(
  db: PrismaService,
  assetId: string,
  createdByUserId: string,
  spec: DemoAsset,
) {
  const persist = async (
    kind: 'CURRENT_LISTING' | 'RECENT_COMPLETED_SALE',
    observation: NonNullable<
      | DemoAsset['reference']['currentListing']
      | DemoAsset['reference']['recentCompletedSale']
    >,
  ) => {
    const sourceRef = JSON.stringify({
      source: observation.source,
      externalReference: observation.externalReference,
      listingUrl: observation.listingUrl,
      ...('imageUrl' in observation ? { imageUrl: observation.imageUrl } : {}),
    });
    const existing = await db.valuationEvidence.findFirst({
      where: { assetId, sourceType: `STAGING_${kind}`, sourceRef },
      select: { id: true },
    });
    const data = {
      observedAt: new Date(`${observation.observedAt}T12:00:00.000Z`),
      valueMinor: observation.amountMinor,
      currency: observation.currency,
      conditionBasis: kind,
      confidence: 0,
    };
    if (existing) {
      await db.valuationEvidence.update({ where: { id: existing.id }, data });
      return;
    }
    await db.valuationEvidence.create({
      data: {
        id: randomUUID(),
        assetId,
        sourceType: `STAGING_${kind}`,
        sourceRef,
        createdByUserId,
        ...data,
      },
    });
  };
  if (spec.reference.currentListing)
    await persist('CURRENT_LISTING', spec.reference.currentListing);
  if (spec.reference.recentCompletedSale)
    await persist('RECENT_COMPLETED_SALE', spec.reference.recentCompletedSale);
}

/**
 * Watchlist persistence is a first-class read-model table in the current
 * architecture (its HTTP owner uses the same idempotent upsert). These are
 * deliberately only the two permanent, explicitly named staging demo users.
 */
async function ensureDemoWatchlists(
  db: PrismaService,
  investorUserId: string,
  collectorUserId: string,
) {
  const published = await db.asset.findMany({
    where: {
      slug: {
        in: assets
          .filter((item) => item.state === 'PUBLISHED')
          .map((item) => `slice-demo-${item.key}`),
      },
    },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(published.map((item) => [item.slug, item.id]));
  const investorSlugs = [
    'slice-demo-umbreon-vmax-moonbreon',
    'slice-demo-pikachu-grey-felt-hat',
    'slice-demo-charizard-ex-obsidian-flames',
  ];
  const collectorSlugs = [
    'slice-demo-victor-wembanyama-prizm-rookie',
    'slice-demo-connor-bedard-young-guns',
    'slice-demo-umbreon-vmax-moonbreon',
  ];
  for (const [userId, slugs] of [
    [investorUserId, investorSlugs],
    [collectorUserId, collectorSlugs],
  ] as const) {
    for (const slug of slugs) {
      const assetId = bySlug.get(slug);
      if (assetId) {
        await db.watchlistItem.upsert({
          where: { userId_assetId: { userId, assetId } },
          create: { userId, assetId },
          update: {},
        });
      }
    }
  }
}

/**
 * Optional D14 showcase data. This remains fail-closed: it only writes an
 * order book when the running staging application expressly enables trading
 * and uses the existing LOCAL_TEST compliance adapter. It never enables those
 * controls, touches external providers, or changes a production environment.
 */
async function ensureTradingDemonstration(input: {
  config: AppConfig;
  db: PrismaService;
  auth: AuthService;
  access: AccessControlService;
  admin: Actor;
  investor: Actor;
  collector: Actor;
  emailVerification: EmailVerificationService;
  emailDelivery: LocalTestEmailDelivery | undefined;
  ownershipOps: OwnershipOperationsService;
  lots: PortfolioLotService;
  ledger: FinancialLedgerService;
  compliance: ComplianceService;
  trading: TradingService;
}) {
  if (!input.config.operationalFeatures.trading) {
    return {
      enabled: false,
      reason:
        'OPERATIONAL_TRADING_ENABLED is false; no D14 orders were created.',
    };
  }
  if (input.config.providerMode !== 'local') {
    return {
      enabled: false,
      reason:
        'Trading fixture requires PROVIDER_MODE=local so its existing LOCAL_TEST compliance authority can be exercised.',
    };
  }

  const marketMaker = await ensureDemoAccount(
    input.auth,
    input.access,
    input.db,
    input.config,
    input.admin,
    demoAccounts.marketMaker,
    'slice-demo-market-maker',
  );
  for (const actor of [input.investor, input.collector, marketMaker.actor]) {
    await ensureLocalEmailVerification(
      input.config,
      input.emailVerification,
      input.emailDelivery,
      actor,
    );
    await ensureLocalDemoCompliance(input.compliance, input.admin, actor);
  }
  await ensureDemoFunding(input.db, input.ledger, marketMaker.actor, {
    accountId: marketMaker.userId,
    label: 'market-maker',
    amountMinor: '30000000',
  });

  const published = await input.db.asset.findMany({
    where: {
      slug: {
        in: assets
          .filter((item) => item.state === 'PUBLISHED')
          .map((item) => `slice-demo-${item.key}`),
      },
      status: 'PUBLISHED',
    },
    select: { id: true, publicId: true, slug: true },
    orderBy: { slug: 'asc' },
  });
  for (const asset of published) {
    const spec = assets.find(
      (item) => `slice-demo-${item.key}` === asset.slug,
    )!;
    await input.db.tradingMarket.upsert({
      where: { assetId: asset.id },
      create: {
        assetId: asset.id,
        status: 'OPEN',
        tickSizeMinor: tradingPolicy.defaultTickSizeMinor,
        lotSizeUnits: tradingPolicy.defaultLotSizeUnits,
        minimumNotionalMinor: tradingPolicy.defaultMinimumNotionalMinor,
        makerFeeBps: tradingPolicy.fee.makerBps,
        takerFeeBps: tradingPolicy.fee.takerBps,
        selfTradePrevention: tradingPolicy.selfTradePrevention,
        tradingEnabled: true,
        feeScheduleVersion: tradingPolicy.fee.application,
      },
      update: { status: 'OPEN', tradingEnabled: true },
    });
    await ensureMarketMakerInventory(input, marketMaker.actor, asset.id, spec);
  }

  for (const asset of published.slice(0, 2)) {
    const spec = assets.find(
      (item) => `slice-demo-${item.key}` === asset.slug,
    )!;
    await ensureDemoExecution(
      input,
      marketMaker.actor,
      input.investor,
      asset,
      spec,
    );
  }
  await ensureDemoInvestorLots(input, published, input.investor.userId);
  for (const asset of published.slice(0, 3)) {
    const spec = assets.find(
      (item) => `slice-demo-${item.key}` === asset.slug,
    )!;
    await ensureDemoOrderBook(
      input,
      marketMaker.actor,
      input.collector,
      asset,
      spec,
    );
  }
  await ensureCancelledDemoOrder(input, input.investor, published[0]);

  const [orders, executions, notifications] = await Promise.all([
    input.db.tradingOrder.count({
      where: {
        userId: {
          in: [
            input.investor.userId,
            input.collector.userId,
            marketMaker.userId,
          ],
        },
      },
    }),
    input.db.tradingExecution.count({
      where: { assetId: { in: published.map((item) => item.id) } },
    }),
    input.db.notification.count({
      where: {
        userId: { in: [input.investor.userId, input.collector.userId] },
      },
    }),
  ]);
  return {
    enabled: true,
    marketMaker: demoAccounts.marketMaker.email,
    markets: published.length,
    orders,
    executions,
    notifications,
  };
}

async function ensureDemoInvestorLots(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  published: Array<{ id: string }>,
  investorUserId: string,
) {
  const executions = await input.db.tradingExecution.findMany({
    where: {
      assetId: { in: published.map((asset) => asset.id) },
      buyOrder: { userId: investorUserId },
    },
    select: {
      assetId: true,
      units: true,
      grossMinor: true,
      buyerFeeMinor: true,
      correlationId: true,
    },
  });
  for (const execution of executions) {
    const existing = await input.db.portfolioLot.findUnique({
      where: { sourceReference: execution.correlationId },
      select: { id: true },
    });
    if (existing) continue;
    await input.lots.recordAcquisition(
      input.admin,
      {
        userId: investorUserId,
        assetId: execution.assetId,
        units: execution.units.toString(),
        totalCostMinor: (execution.grossMinor + execution.buyerFeeMinor).toString(),
        sourceReference: execution.correlationId,
      },
      `staging-demo-investor-lot:${execution.correlationId}`,
      `staging-demo-investor-lot:${execution.correlationId}`,
    );
  }
}

async function ensureLocalDemoCompliance(
  compliance: ComplianceService,
  admin: Actor,
  actor: Actor,
) {
  const current = await compliance.self(actor.userId);
  if (current.status === 'APPROVED') return;
  await compliance.start(
    actor,
    `staging-demo-compliance-start:${actor.userId}`,
  );
  await compliance.ingestDecision(
    admin,
    actor.userId,
    'APPROVED',
    'STAGING_DEMO_LOCAL_COMPLIANCE_APPROVED',
    `staging-demo-local-compliance:${actor.userId}`,
    `staging-demo-compliance-decision:${actor.userId}`,
  );
}

async function ensureMarketMakerInventory(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  marketMaker: Actor,
  assetId: string,
  spec: DemoAsset,
) {
  const account = await input.db.ownershipAccount.findUnique({
    where: { userId: marketMaker.userId },
  });
  const position = account
    ? await input.db.ownershipPosition.findUnique({
        where: { assetId_accountId: { assetId, accountId: account.id } },
      })
    : null;
  const owned = position?.settledUnits ?? 0n;
  if (owned < 350n) {
    await input.ownershipOps.transfer(
      input.admin,
      assetId,
      { toUserId: marketMaker.userId, units: (350n - owned).toString() },
      `staging-demo-market-maker-allocation:${spec.key}:${owned}`,
      `staging-demo-market-maker-allocation:${spec.key}:${owned}`,
    );
  }
  const sourceReference = `staging-demo-market-maker-lot:${spec.key}`;
  const lot = await input.db.portfolioLot.findUnique({
    where: { sourceReference },
  });
  if (!lot) {
    const unitPrice = spec.illustrativeValueMinor / 1000n;
    await input.lots.recordAcquisition(
      marketMaker,
      {
        userId: marketMaker.userId,
        assetId,
        units: '350',
        totalCostMinor: (unitPrice * 350n).toString(),
        sourceReference,
      },
      `staging-demo-market-maker-lot:${spec.key}`,
      `staging-demo-market-maker-lot:${spec.key}`,
    );
  }
}

async function ensureDemoExecution(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  seller: Actor,
  buyer: Actor,
  asset: { id: string; publicId: string; slug: string },
  spec: DemoAsset,
) {
  const prior = await input.db.tradingExecution.findFirst({
    where: {
      assetId: asset.id,
      OR: [
        { buyOrder: { userId: buyer.userId } },
        { sellOrder: { userId: seller.userId } },
      ],
    },
    select: { id: true },
  });
  if (prior) return;
  const price = spec.illustrativeValueMinor / 1000n;
  await input.trading.place(
    seller,
    {
      assetId: asset.publicId,
      side: 'SELL',
      type: 'LIMIT',
      timeInForce: 'GTC',
      units: '20',
      limitPriceMinor: price.toString(),
    },
    `staging-demo-execution-sell:${spec.key}`,
    `staging-demo-execution-sell:${spec.key}`,
  );
  await input.trading.place(
    buyer,
    {
      assetId: asset.publicId,
      side: 'BUY',
      type: 'LIMIT',
      timeInForce: 'IOC',
      units: '20',
      limitPriceMinor: price.toString(),
    },
    `staging-demo-execution-buy:${spec.key}`,
    `staging-demo-execution-buy:${spec.key}`,
  );
}

async function ensureDemoOrderBook(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  seller: Actor,
  buyer: Actor,
  asset: { id: string; publicId: string; slug: string },
  spec: DemoAsset,
) {
  const price = spec.illustrativeValueMinor / 1000n;
  const orderBookUnits = 50n;
  const minimumBidPrice =
    (tradingPolicy.defaultMinimumNotionalMinor + orderBookUnits - 1n) /
    orderBookUnits;
  const levels = [
    { actor: seller, side: 'SELL' as const, price: price + 50n, key: 'ask' },
    {
      actor: buyer,
      side: 'BUY' as const,
      price: price > 50n ? price - 50n : minimumBidPrice,
      key: 'bid',
    },
  ];
  for (const level of levels) {
    const existing = await input.db.tradingOrder.findFirst({
      where: {
        userId: level.actor.userId,
        assetId: asset.id,
        side: level.side,
        limitPriceMinor: level.price,
        status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
      },
      select: { id: true },
    });
    if (!existing) {
      await input.trading.place(
        level.actor,
        {
          assetId: asset.publicId,
          side: level.side,
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: orderBookUnits.toString(),
          limitPriceMinor: level.price.toString(),
        },
        `staging-demo-book-${level.key}:${spec.key}`,
        `staging-demo-book-${level.key}:${spec.key}`,
      );
    }
  }
}

async function ensureCancelledDemoOrder(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  investor: Actor,
  asset: { id: string; publicId: string; slug: string } | undefined,
) {
  if (!asset) return;
  const existing = await input.db.tradingOrder.findFirst({
    where: { userId: investor.userId, assetId: asset.id, status: 'CANCELLED' },
    select: { id: true },
  });
  if (existing) return;
  const spec = assets.find((item) => `slice-demo-${item.key}` === asset.slug)!;
  const order = await input.trading.place(
    investor,
    {
      assetId: asset.publicId,
      side: 'BUY',
      type: 'LIMIT',
      timeInForce: 'GTC',
      units: '5',
      limitPriceMinor: (spec.illustrativeValueMinor / 2000n).toString(),
    },
    `staging-demo-cancel-open:${spec.key}`,
    `staging-demo-cancel-open:${spec.key}`,
  );
  await input.trading.cancel(
    investor,
    order.id,
    `staging-demo-cancel:${spec.key}`,
    `staging-demo-cancel:${spec.key}`,
  );
}

async function ensureWorkspaceQueue(
  db: PrismaService,
  submissions: SubmissionService,
  storage: LocalSubmissionStorage,
  owner: Actor,
  reviewer: Actor,
  categoryId: string,
) {
  for (let index = 1; index <= 5; index += 1) {
    const certificate = `STG-B-${index}`;
    let submission = (
      await db.assetSubmission.findMany({
        where: { ownerUserId: owner.userId },
        orderBy: { createdAt: 'asc' },
      })
    ).find(
      (row) =>
        (row.declaredMetadata as { certificationNumber?: string } | null)
          ?.certificationNumber === certificate,
    );
    if (!submission) {
      const draft = await submissions.create(
        owner,
        {
          categoryId,
          declaredMetadata: {
            name: `Collector B Evidence Review ${index}`,
            manufacturer: 'Pokémon',
            year: '2024',
            certificationNumber: certificate,
            details: 'Private staging workspace assignment.',
          },
        },
        `collector-b-submission-${randomUUID()}`,
        `collector-b-submission:${index}`,
      );
      submission = await db.assetSubmission.findUniqueOrThrow({
        where: { id: draft.id },
      });
      for (const slot of ['front', 'back']) {
        const fixture = fixtureMedia(`collector-b:${index}:${slot}`);
        const intent = await submissions.uploadIntent(
          owner,
          submission.id,
          {
            slot,
            mimeType: 'image/png',
            sizeBytes: fixture.bytes.length,
            originalFilename: `collector-b-${index}-${slot}.png`,
          },
          `collector-b-media-${randomUUID()}`,
          `collector-b-media:${index}:${slot}`,
        );
        storage.putForTest({
          key: intent.upload.objectKey,
          mimeType: 'image/png',
          sizeBytes: fixture.bytes.length,
          sha256: fixture.sha256,
          magicMimeType: 'image/png',
          width: 1,
          height: 1,
        });
        const latest = await db.assetSubmission.findUniqueOrThrow({
          where: { id: submission!.id },
        });
        await submissions.completeMedia(
          owner,
          submission!.id,
          intent.media.id,
          { sha256: fixture.sha256, version: latest.version },
          `collector-b-media-complete-${randomUUID()}`,
          `collector-b-media-complete:${index}:${slot}`,
        );
      }
      const latest = await db.assetSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      await submissions.submit(
        owner,
        submission.id,
        latest.version,
        `collector-b-submit-${randomUUID()}`,
        `collector-b-submit:${index}`,
      );
    }
    if (index <= 3 && submission.status === 'SUBMITTED')
      await submissions.claim(
        reviewer,
        submission.id,
        `collector-b-claim-${randomUUID()}`,
        `collector-b-claim:${index}`,
      );
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

if (require.main === module)
  void runCollectorDemoSetup().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Collector demo fixture failed.'}\n`,
    );
    process.exitCode = 1;
  });
