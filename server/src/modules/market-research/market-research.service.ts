import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Inject } from '@nestjs/common';
import type { Actor } from '../identity/auth/auth.service';

export type MarketResearchInput = {
  categoryId: string;
  declaredMetadata: Record<string, unknown>;
  refresh?: boolean;
};
export function marketResearchIdentityHash(input: {
  categoryId: string;
  declaredMetadata: Record<string, unknown>;
}) {
  return hashIdentity(canonicalIdentity({ ...input }));
}

type Identity = {
  categoryId: string;
  name: string;
  manufacturer: string | null;
  set: string | null;
  year: string | null;
  cardNumber: string | null;
  language: string | null;
  grader: string | null;
  grade: string | null;
  variant: string | null;
};
type Observation = {
  providerCode: string;
  externalReferenceId: string;
  externalUrl: string;
  observationType: 'SALE' | 'LISTING' | 'PRICE_GUIDE';
  originalTitle: string;
  amountMinor: bigint;
  currency: string;
  observedAt: Date;
  soldAt?: Date;
  grader?: string;
  grade?: string;
  variant?: string;
};
type MatchedObservation = Observation & {
  matchQuality: 'EXACT' | 'STRONG' | 'WEAK' | 'REJECTED';
  exclusionReason?: string;
  included: boolean;
};

/** Provider-neutral whole-collectible market research. It intentionally does
 * not read or write Slice's fractional trading or D11 valuation records. */
@Injectable()
export class CollectibleMarketResearchService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async research(actor: Actor, input: MarketResearchInput, requestId: string) {
    const identity = canonicalIdentity(input);
    const identityHash = hashIdentity(identity);
    if (!input.refresh) {
      const cached = await this.db.submissionMarketResearch.findFirst({
        where: {
          ownerUserId: actor.userId,
          identityHash,
          submissionId: null,
          expiresAt: { gt: new Date() },
        },
        include: { observations: { orderBy: { observedAt: 'desc' } } },
        orderBy: { collectedAt: 'desc' },
      });
      if (cached) return researchProjection(cached);
    }

    // Production fails closed until a permitted provider adapter and its
    // credentials have been explicitly configured. No staging references leak.
    if (this.config.environment === 'production') {
      return this.unavailable(
        actor.userId,
        identity,
        identityHash,
        requestId,
        'No approved external market provider is configured.',
      );
    }
    const raw = stagingReferenceObservations(identity);
    const observations = raw.map((item) => classifyObservation(identity, item));
    const now = new Date();
    const aggregate = aggregateSnapshot(observations, now);
    const created = await this.db.submissionMarketResearch.create({
      data: {
        id: randomUUID(),
        ownerUserId: actor.userId,
        identityHash,
        identity: identity as unknown as Prisma.InputJsonValue,
        state: aggregate.state,
        dataQuality: aggregate.dataQuality,
        sourceCoverage:
          aggregate.sourceCoverage as unknown as Prisma.InputJsonValue,
        providerFailures: [] as Prisma.InputJsonValue,
        snapshot: aggregate.snapshot as unknown as Prisma.InputJsonValue,
        collectedAt: now,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
        observations: {
          create: observations.map((item) => ({
            id: randomUUID(),
            providerCode: item.providerCode,
            externalReferenceId: item.externalReferenceId,
            externalUrl: item.externalUrl,
            observationType: item.observationType,
            originalTitle: item.originalTitle,
            amountMinor: item.amountMinor,
            currency: item.currency,
            observedAt: item.observedAt,
            soldAt: item.soldAt,
            grader: item.grader,
            grade: item.grade,
            variant: item.variant,
            matchQuality: item.matchQuality,
            exclusionReason: item.exclusionReason,
            includedInSnapshot: item.included,
          })),
        },
      },
      include: { observations: { orderBy: { observedAt: 'desc' } } },
    });
    await this.audit(
      actor,
      'MARKET_RESEARCH_COMPLETED',
      created.id,
      requestId,
      {
        state: aggregate.state,
        sourceCount: aggregate.sourceCoverage.available,
      },
    );
    return researchProjection(created);
  }

  async attachToSubmission(
    ownerUserId: string,
    researchId: string | undefined,
    submissionId: string,
  ) {
    if (!researchId) return;
    const record = await this.db.submissionMarketResearch.findFirst({
      where: { id: researchId, ownerUserId, submissionId: null },
    });
    if (!record)
      throw new ServiceUnavailableException({
        code: 'MARKET_RESEARCH_UNAVAILABLE',
        message: 'The saved market research could not be attached.',
      });
    await this.db.submissionMarketResearch.update({
      where: { id: researchId },
      data: { submissionId },
    });
  }

  private async unavailable(
    ownerUserId: string,
    identity: Identity,
    identityHash: string,
    requestId: string,
    reason: string,
  ) {
    const now = new Date();
    const created = await this.db.submissionMarketResearch.create({
      data: {
        id: randomUUID(),
        ownerUserId,
        identityHash,
        identity: identity as unknown as Prisma.InputJsonValue,
        state: 'UNAVAILABLE',
        dataQuality: null,
        sourceCoverage: {
          available: 0,
          unavailable: 1,
        } as Prisma.InputJsonValue,
        providerFailures: [
          { provider: 'EXTERNAL_MARKET', reason },
        ] as Prisma.InputJsonValue,
        snapshot: {
          sales: null,
          listings: null,
          exactCompCount: 0,
          strongCompCount: 0,
          rejectedCompCount: 0,
        } as Prisma.InputJsonValue,
        collectedAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
      include: { observations: true },
    });
    await this.db.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: ownerUserId,
        actorType: 'USER',
        action: 'MARKET_RESEARCH_UNAVAILABLE',
        resourceType: 'market-research',
        resourceId: created.id,
        requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { reason },
        createdAt: now,
      },
    });
    return researchProjection(created);
  }
  private audit(
    actor: Actor,
    action: string,
    resourceId: string,
    requestId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.db.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action,
        resourceType: 'market-research',
        resourceId,
        requestId,
        sessionId: actor.sessionId,
        result: 'SUCCESS',
        metadata: metadata as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  }
}

function canonicalIdentity(input: MarketResearchInput): Identity {
  const metadata = input.declaredMetadata;
  const reference =
    metadata.customerReference &&
    typeof metadata.customerReference === 'object' &&
    !Array.isArray(metadata.customerReference)
      ? (metadata.customerReference as Record<string, unknown>)
      : null;
  const extracted =
    reference?.extractedIdentity &&
    typeof reference.extractedIdentity === 'object' &&
    !Array.isArray(reference.extractedIdentity)
      ? (reference.extractedIdentity as Record<string, unknown>)
      : null;
  const read = (key: string) =>
    typeof metadata[key] === 'string' && metadata[key].trim()
      ? metadata[key].trim()
      : typeof extracted?.[key] === 'string' && extracted[key].trim()
        ? (extracted[key] as string).trim()
        : null;
  const name = read('name');
  if (!name)
    throw new ServiceUnavailableException({
      code: 'MARKET_IDENTITY_INCOMPLETE',
      message: 'Add the collectible name before checking the market.',
    });
  return {
    categoryId: input.categoryId,
    name,
    manufacturer: read('manufacturer'),
    set: read('set'),
    year: read('year'),
    cardNumber: read('cardNumber'),
    language: read('language'),
    grader: read('grader'),
    grade: read('grade'),
    variant: read('variant'),
  };
}
function hashIdentity(identity: Identity) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(identity).map(([k, v]) => [k, normalize(v ?? '')]),
        ),
      ),
    )
    .digest('hex');
}
function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function classifyObservation(
  identity: Identity,
  item: Observation,
): MatchedObservation {
  const haystack = normalize(`${item.originalTitle} ${item.variant ?? ''}`);
  const required = [identity.name, identity.cardNumber]
    .filter(Boolean)
    .map((part) => normalize(part!));
  const wrong =
    /\b(proxy|replica|reprint|custom|empty slab|lot|bundle|damaged)\b/i.test(
      item.originalTitle,
    );
  const identityMatch = required.every((part) => haystack.includes(part));
  const expectedGraded = Boolean(identity.grader || identity.grade);
  const graderMatch =
    !expectedGraded ||
    (normalize(item.grader ?? '') === normalize(identity.grader ?? '') &&
      normalize(item.grade ?? '') === normalize(identity.grade ?? ''));
  const rawMismatch = expectedGraded && !item.grader;
  const quality: MatchedObservation['matchQuality'] =
    wrong || !identityMatch || rawMismatch
      ? 'REJECTED'
      : graderMatch
        ? 'EXACT'
        : item.grader
          ? 'WEAK'
          : 'REJECTED';
  return {
    ...item,
    matchQuality: quality,
    exclusionReason:
      quality === 'REJECTED'
        ? wrong
          ? 'Excluded: proxy, lot, custom, empty slab, or damaged reference.'
          : rawMismatch
            ? 'Excluded: raw reference cannot be an exact graded comparable.'
            : 'Excluded: collectible identity does not match.'
        : quality === 'WEAK'
          ? 'Different grader or grade; retained as secondary context.'
          : undefined,
    included: quality === 'EXACT',
  };
}
function aggregateSnapshot(observations: MatchedObservation[], now: Date) {
  const exactSales = observations.filter(
    (o) =>
      o.observationType === 'SALE' && o.included && o.matchQuality === 'EXACT',
  );
  const strongSales = observations.filter(
    (o) =>
      o.observationType === 'SALE' && o.included && o.matchQuality === 'STRONG',
  );
  const sales = exactSales.length ? exactSales : strongSales;
  const listings = observations.filter(
    (o) => o.observationType === 'LISTING' && o.included,
  );
  const summary = (items: MatchedObservation[]) => {
    if (!items.length) return null;
    const sorted = [...items].sort((a, b) =>
      Number(a.amountMinor - b.amountMinor),
    );
    const amounts = sorted.map((item) => item.amountMinor);
    const sameCurrency =
      new Set(sorted.map((item) => item.currency)).size === 1;
    if (!sameCurrency) return { count: items.length, mixedCurrency: true };
    const midpoint = Math.floor(amounts.length / 2);
    const median =
      amounts.length % 2
        ? amounts[midpoint]
        : (amounts[midpoint - 1] + amounts[midpoint]) / 2n;
    return {
      count: items.length,
      currency: sorted[0].currency,
      lowMinor: amounts[0].toString(),
      highMinor: amounts.at(-1)!.toString(),
      medianMinor: median.toString(),
      latestMinor: sorted.at(-1)!.amountMinor.toString(),
      latestAt:
        sorted.at(-1)!.soldAt?.toISOString() ??
        sorted.at(-1)!.observedAt.toISOString(),
    };
  };
  const sourceCount = new Set(
    observations
      .filter((o) => o.included)
      .map((o) => o.providerCode.replace(/^STAGING_REFERENCE_DATA:/, '')),
  ).size;
  const dataQuality =
    exactSales.length >= 5 && sourceCount >= 2
      ? 'HIGH'
      : exactSales.length >= 2
        ? 'MEDIUM'
        : exactSales.length
          ? 'LOW'
          : null;
  const state = sales.length
    ? sales.length === 1
      ? 'LIMITED'
      : 'FOUND'
    : 'NO_MATCHES';
  return {
    state,
    dataQuality,
    sourceCoverage: { available: sourceCount, unavailable: 0 },
    snapshot: {
      sales: summary(sales),
      listings: summary(listings),
      exactCompCount: exactSales.length,
      strongCompCount: strongSales.length,
      rejectedCompCount: observations.filter(
        (o) => o.matchQuality === 'REJECTED',
      ).length,
      updatedAt: now.toISOString(),
    },
  };
}
function stagingReferenceObservations(identity: Identity): Observation[] {
  const key = normalize(`${identity.name} ${identity.cardNumber ?? ''}`);
  const matches = STAGING_REFERENCE_CARDS.find((entry) =>
    entry.match.every((term) => key.includes(normalize(term))),
  );
  return matches
    ? matches.observations.map((item) => ({
        ...item,
        observedAt: new Date(item.observedAt),
        soldAt: item.soldAt ? new Date(item.soldAt) : undefined,
        amountMinor: BigInt(item.amountMinor),
      }))
    : [];
}
const STAGING_REFERENCE_CARDS: Array<{
  match: string[];
  observations: Array<
    Omit<Observation, 'amountMinor' | 'observedAt' | 'soldAt'> & {
      amountMinor: string;
      observedAt: string;
      soldAt?: string;
    }
  >;
}> = [
  {
    match: ['umbreon', '215'],
    observations: refs(
      'Umbreon VMAX #215/203 Evolving Skies PSA 10',
      'PSA',
      '10',
      'GBP',
      ['110000', '114000', '116500', '119000', '121000'],
      ['124500', '129500'],
      'https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215',
      'https://www.ebay.com/sch/i.html?_nkw=umbreon+vmax+215+psa+10',
    ),
  },
  {
    match: ['pikachu', '085'],
    observations: refs(
      'Pikachu with Grey Felt Hat #085 PSA 10',
      'PSA',
      '10',
      'GBP',
      ['21500', '22000', '22800', '23200', '24000'],
      ['25900', '27500'],
      'https://www.pricecharting.com/game/pokemon-scarlet-&-violet-promo/pikachu-with-grey-felt-hat-85',
      'https://www.ebay.com/sch/i.html?_nkw=pikachu+grey+felt+hat+psa+10',
    ),
  },
  {
    match: ['charizard', '223'],
    observations: refs(
      'Charizard ex #223 Obsidian Flames PSA 10',
      'PSA',
      '10',
      'GBP',
      ['5100', '5400', '5600', '5850', '6000'],
      ['6500', '6950'],
      'https://www.pricecharting.com/game/pokemon-obsidian-flames/charizard-ex-223',
      'https://www.ebay.com/sch/i.html?_nkw=charizard+ex+223+psa+10',
    ),
  },
  {
    match: ['wembanyama', '136'],
    observations: refs(
      'Victor Wembanyama Prizm #136 BGS 9.5',
      'BGS',
      '9.5',
      'GBP',
      ['23000', '24000', '24800', '25500', '26300'],
      ['28500', '29900'],
      'https://www.sportscardspro.com/game/basketball-cards-2023-panini-prizm/victor-wembanyama-136',
      'https://www.fanaticscollect.com/',
    ),
  },
  {
    match: ['bedard', '451'],
    observations: refs(
      'Connor Bedard Young Guns #451 PSA 10',
      'PSA',
      '10',
      'GBP',
      ['3800', '4000', '4200', '4400', '4600'],
      ['4950', '5200'],
      'https://www.pricecharting.com/game/hockey-2023-upper-deck/connor-bedard-451',
      'https://www.ebay.com/sch/i.html?_nkw=connor+bedard+451+psa+10',
    ),
  },
  {
    match: ['stroud', '339'],
    observations: refs(
      'C.J. Stroud Purple Pulsar #339 PSA 10',
      'PSA',
      '10',
      'GBP',
      ['3200', '3400', '3550', '3700', '3900'],
      ['4250', '4500'],
      'https://www.sportscardinvestor.com/cards/cj-stroud-football/2023-panini-prizm-purple-pulsar-339',
      'https://www.ebay.com/sch/i.html?_nkw=cj+stroud+purple+pulsar+339+psa+10',
    ),
  },
];
function refs(
  title: string,
  grader: string,
  grade: string,
  currency: string,
  sales: string[],
  listings: string[],
  saleUrl: string,
  listingUrl: string,
) {
  const base = Date.now();
  return [
    ...sales.map((amountMinor, index) => ({
      providerCode:
        index % 2
          ? 'STAGING_REFERENCE_DATA:PRICECHARTING'
          : 'STAGING_REFERENCE_DATA:EBAY',
      externalReferenceId: `sale-${index + 1}`,
      externalUrl: index % 2 ? saleUrl : listingUrl,
      observationType: 'SALE' as const,
      originalTitle: title,
      amountMinor,
      currency,
      observedAt: new Date(base - (index + 1) * 3 * 86_400_000).toISOString(),
      soldAt: new Date(base - (index + 1) * 3 * 86_400_000).toISOString(),
      grader,
      grade,
    })),
    ...listings.map((amountMinor, index) => ({
      providerCode: index
        ? 'STAGING_REFERENCE_DATA:EBAY'
        : 'STAGING_REFERENCE_DATA:PRICECHARTING',
      externalReferenceId: `listing-${index + 1}`,
      externalUrl: index ? listingUrl : saleUrl,
      observationType: 'LISTING' as const,
      originalTitle: title,
      amountMinor,
      currency,
      observedAt: new Date(base - (index + 1) * 86_400_000).toISOString(),
      grader,
      grade,
    })),
    {
      providerCode: 'STAGING_REFERENCE_DATA',
      externalReferenceId: 'raw-excluded',
      externalUrl: saleUrl,
      observationType: 'SALE' as const,
      originalTitle: `${title} raw lot`,
      amountMinor: '100',
      currency,
      observedAt: new Date(base - 86_400_000).toISOString(),
    },
  ];
}
function researchProjection(research: {
  id: string;
  state: string;
  dataQuality: string | null;
  identity: Prisma.JsonValue;
  sourceCoverage: Prisma.JsonValue;
  providerFailures: Prisma.JsonValue;
  snapshot: Prisma.JsonValue;
  collectedAt: Date;
  observations: Array<{
    providerCode: string;
    externalReferenceId: string;
    externalUrl: string | null;
    observationType: string;
    originalTitle: string;
    amountMinor: bigint;
    currency: string;
    observedAt: Date;
    soldAt: Date | null;
    grader: string | null;
    grade: string | null;
    variant: string | null;
    matchQuality: string;
    exclusionReason: string | null;
    includedInSnapshot: boolean;
  }>;
}) {
  return {
    id: research.id,
    state: research.state,
    dataQuality: research.dataQuality,
    identity: research.identity,
    sourceCoverage: research.sourceCoverage,
    providerFailures: research.providerFailures,
    snapshot: research.snapshot,
    collectedAt: research.collectedAt.toISOString(),
    observations: research.observations.map((item) => ({
      ...item,
      amountMinor: item.amountMinor.toString(),
      observedAt: item.observedAt.toISOString(),
      soldAt: item.soldAt?.toISOString() ?? null,
    })),
  };
}
