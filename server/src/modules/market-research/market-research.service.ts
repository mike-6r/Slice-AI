import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Inject } from '@nestjs/common';
import type { Actor } from '../identity/auth/auth.service';
import { MarketProviderRegistry } from '../market/market-provider.registry';
import { freshnessState } from '../market/market-refresh.service';
import type { MarketIdentity, ProviderObservation } from '../market/market-provider.ports';

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
  edition: string | null;
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
    private readonly providers: MarketProviderRegistry,
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

    const raw = await this.collectProviderObservations(identity, input);
    if (raw === null) {
      if (this.config.isBeta || this.config.environment === 'production') {
        return this.unavailable(
          actor.userId,
          identity,
          identityHash,
          requestId,
          'No approved external market provider is configured.',
        );
      }
      // Development/test-only references remain available for deterministic
      // local UI work. They are never used when APP_ENV=beta.
      return this.persistResearch(
        actor,
        identity,
        identityHash,
        requestId,
        stagingReferenceObservations(identity).map((item) =>
          classifyObservation(identity, item),
        ),
      );
    }
    const observations = raw.map((item) => classifyObservation(identity, item));
    return this.persistResearch(actor, identity, identityHash, requestId, observations);
  }

  private async persistResearch(
    actor: Actor,
    identity: Identity,
    identityHash: string,
    requestId: string,
    observations: MatchedObservation[],
  ) {
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

  private async collectProviderObservations(
    identity: Identity,
    input: MarketResearchInput,
  ): Promise<Observation[] | null> {
    const provider = this.providers.get('PRICECHARTING');
    if (!provider?.searchProducts || !provider.fetchObservations) return null;
    const health = await provider.health();
    if (!health.configured) return null;
    const category = await this.db.category.findUnique({
      where: { id: identity.categoryId },
      select: { slug: true },
    });
    if (!category || !provider.supports(category.slug)) return null;
    const marketIdentity: MarketIdentity = {
      category: category.slug,
      year: identity.year ? Number(identity.year) || null : null,
      manufacturer: identity.manufacturer,
      set: identity.set,
      cardNumber: identity.cardNumber,
      edition: identity.edition,
      title: identity.name,
      variant: identity.variant,
      grader: identity.grader,
      grade: identity.grade,
    };
    const reference = customerReference(input.declaredMetadata);
    const providerId = reference?.provider === 'PriceCharting'
      ? reference.externalReferenceId
      : null;
    try {
      let selectedId = providerId && /^\d+$/.test(providerId) ? providerId : null;
      if (!selectedId) {
        const candidates = await provider.searchProducts(marketIdentity);
        const exact = candidates.filter((candidate) => candidate.matchQuality === 'EXACT');
        if (exact.length !== 1) return [];
        selectedId = exact[0]!.providerProductId;
      }
      const providerRows = await provider.fetchObservations(marketIdentity, selectedId);
      return providerRows.map(providerObservationToResearch);
    } catch {
      return null;
    }
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
      throw new ConflictException({
        code: 'MARKET_RESEARCH_UNAVAILABLE',
        message: 'The saved market research could not be attached.',
      });
    await this.db.submissionMarketResearch.update({
      where: { id: researchId },
      data: { submissionId },
    });
  }

  /**
   * Re-evaluates provider observations already persisted by an explicit
   * research request. This is a staff-only domain operation: it never calls
   * an external provider and exists so matching-rule corrections do not
   * require a second paid lookup.
   */
  async reclassifyStored(actor: Actor, researchId: string, requestId: string) {
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'ASSET_REVIEWER')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to reclassify market research.',
      });
    }
    const record = await this.db.submissionMarketResearch.findUnique({
      where: { id: researchId },
      include: { observations: { orderBy: { observedAt: 'desc' } } },
    });
    if (!record) throw new NotFoundException({ code: 'MARKET_RESEARCH_NOT_FOUND' });
    const identity = record.identity as unknown as Identity;
    const observations: Observation[] = record.observations.map((item) => ({
      providerCode: item.providerCode,
      externalReferenceId: item.externalReferenceId,
      externalUrl: item.externalUrl ?? '',
      observationType: item.observationType as Observation['observationType'],
      originalTitle: item.originalTitle,
      amountMinor: item.amountMinor,
      currency: item.currency,
      observedAt: item.observedAt,
      soldAt: item.soldAt ?? undefined,
      grader: item.grader ?? undefined,
      grade: item.grade ?? undefined,
      variant: item.variant ?? undefined,
    }));
    const classified = observations.map((item) => classifyObservation(identity, item));
    const now = new Date();
    const aggregate = aggregateSnapshot(classified, now);
    const updated = await this.db.$transaction(async (db) => {
      await db.submissionMarketResearch.update({
        where: { id: researchId },
        data: {
          state: aggregate.state,
          dataQuality: aggregate.dataQuality,
          sourceCoverage: aggregate.sourceCoverage as Prisma.InputJsonValue,
          snapshot: aggregate.snapshot as Prisma.InputJsonValue,
        },
      });
      await Promise.all(
        record.observations.map((row, index) => {
          const item = classified[index]!;
          return db.submissionMarketObservation.update({
            where: { id: row.id },
            data: {
              matchQuality: item.matchQuality,
              exclusionReason: item.exclusionReason ?? null,
              includedInSnapshot: item.included,
            },
          });
        }),
      );
      return db.submissionMarketResearch.findUniqueOrThrow({
        where: { id: researchId },
        include: { observations: { orderBy: { observedAt: 'desc' } } },
      });
    });
    await this.db.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'MARKET_RESEARCH_RECLASSIFIED',
        resourceType: 'market-research',
        resourceId: researchId,
        requestId,
        sessionId: actor.sessionId,
        result: 'SUCCESS',
        metadata: { state: aggregate.state, exactCompCount: aggregate.snapshot.exactCompCount },
        createdAt: now,
      },
    });
    return researchProjection(updated);
  }

  async attachToApprovedSubmission(
    actor: Actor,
    researchId: string,
    submissionId: string,
    requestId: string,
  ) {
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'ASSET_REVIEWER')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to attach market research.',
      });
    }
    const record = await this.db.submissionMarketResearch.findFirst({
      where: { id: researchId, submissionId: null },
      include: { observations: { orderBy: { observedAt: 'desc' } } },
    });
    if (!record) throw new NotFoundException({ code: 'MARKET_RESEARCH_NOT_FOUND' });
    const submission = await this.db.assetSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, ownerUserId: true, status: true, assetId: true, categoryId: true, declaredMetadata: true },
    });
    if (!submission) throw new NotFoundException({ code: 'SUBMISSION_NOT_FOUND' });
    if (submission.status !== 'APPROVED' || submission.assetId) {
      throw new ConflictException({
        code: 'SUBMISSION_STATE_CONFLICT',
        message: 'Only an approved, unlinked submission can receive market research.',
      });
    }
    const metadata =
      submission.declaredMetadata && typeof submission.declaredMetadata === 'object'
        ? (submission.declaredMetadata as Record<string, unknown>)
        : {};
    const storedIdentity = record.identity as unknown as Identity;
    const identityFields: Array<keyof Identity> = [
      'name',
      'year',
      'set',
      'cardNumber',
      'variant',
    ];
    const identityMatches = identityFields.every((field) => {
      const stored = storedIdentity[field];
      if (!stored) return true;
      const submissionKey = field === 'name' ? 'name' : field;
      const current = metadata[submissionKey];
      return typeof current === 'string' && normalize(current) === normalize(stored);
    });
    if (!identityMatches || storedIdentity.categoryId !== submission.categoryId) {
      throw new ConflictException({
        code: 'MARKET_RESEARCH_IDENTITY_MISMATCH',
        message: 'Refresh market research after correcting the submission identity.',
      });
    }
    const updated = await this.db.submissionMarketResearch.update({
      where: { id: researchId },
      data: { submissionId, ownerUserId: submission.ownerUserId },
      include: { observations: { orderBy: { observedAt: 'desc' } } },
    });
    await this.db.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'MARKET_RESEARCH_ATTACHED',
        resourceType: 'submission',
        resourceId: submissionId,
        requestId,
        sessionId: actor.sessionId,
        result: 'SUCCESS',
        metadata: {
          researchId,
          ...(record.ownerUserId !== submission.ownerUserId
            ? { transferredFromOwnerUserId: record.ownerUserId }
            : {}),
        },
        createdAt: new Date(),
      },
    });
    return researchProjection(updated);
  }

  /**
   * Hands persisted submission research to an already-created canonical Asset.
   * This is deliberately staff-controlled and never calls a provider. The
   * submission remains the source of identity/provenance until this handoff.
   */
  async promoteToAsset(
    actor: Actor,
    submissionId: string,
    assetId: string,
    requestId: string,
  ) {
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'ASSET_REVIEWER')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to promote market research.',
      });
    }
    const submission = await this.db.assetSubmission.findUnique({
      where: { id: submissionId },
      include: {
        marketResearch: { include: { observations: true } },
        asset: { include: { category: true, collectibleSet: true, gradeScaleEntry: { include: { company: true } } } },
      },
    });
    if (!submission) throw new NotFoundException({ code: 'SUBMISSION_NOT_FOUND' });
    if (submission.status !== 'APPROVED' || submission.assetId !== assetId || !submission.asset) {
      throw new ConflictException({
        code: 'ASSET_PROMOTION_PRECONDITION_FAILED',
        message: 'The approved submission must already be linked to the requested canonical Asset.',
      });
    }
    const asset = submission.asset;
    const research = submission.marketResearch
      .filter((item) => item.submissionId === submissionId)
      .sort((left, right) => right.collectedAt.getTime() - left.collectedAt.getTime())[0];
    if (!research) {
      throw new ConflictException({
        code: 'ASSET_PROMOTION_RESEARCH_MISSING',
        message: 'Confirmed submission market research is required before promotion.',
      });
    }
    const identity = research.identity as unknown as Identity;
    if (!identityCompatibleWithAsset(identity, asset)) {
      throw new ConflictException({
        code: 'ASSET_PROMOTION_IDENTITY_CONFLICT',
        message: 'The confirmed provider identity does not match the canonical Asset.',
      });
    }
    const observation = research.observations.find(
      (item) =>
        item.providerCode === 'PRICECHARTING' &&
        item.observationType === 'PRICE_GUIDE' &&
        item.matchQuality === 'EXACT' &&
        item.includedInSnapshot &&
        !item.grader &&
        !item.grade,
    );
    if (!observation) {
      throw new ConflictException({
        code: 'ASSET_PROMOTION_RAW_REFERENCE_MISSING',
        message: 'An exact raw PriceCharting reference is required before promotion.',
      });
    }
    const providerProductId = observation.externalReferenceId.split(':', 1)[0]!;
    const now = new Date();
    const sourceFingerprint = marketSourceFingerprint(
      providerProductId,
      observation.observationType,
      observation.amountMinor,
      observation.currency,
      observation.observedAt,
    );
    const result = await this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
      const existingMapping = await db.marketProviderMapping.findUnique({
        where: { assetId_providerCode: { assetId, providerCode: 'PRICECHARTING' } },
      });
      if (existingMapping && existingMapping.providerExternalId !== providerProductId) {
        throw new ConflictException({
          code: 'MAPPING_CONFLICT',
          message: 'The canonical Asset already has a different PriceCharting product mapping.',
        });
      }
      const mappingForProvider = await db.marketProviderMapping.findUnique({
        where: { providerCode_providerExternalId: { providerCode: 'PRICECHARTING', providerExternalId: providerProductId } },
      });
      if (mappingForProvider && mappingForProvider.assetId !== assetId) {
        throw new ConflictException({
          code: 'MAPPING_CONFLICT',
          message: 'That PriceCharting product is already mapped to another canonical Asset.',
        });
      }
      const mapping = existingMapping
        ? await db.marketProviderMapping.update({
            where: { id: existingMapping.id },
            data: {
              providerUrl: observation.externalUrl,
              identityHash: research.identityHash,
              status: 'STAFF_CONFIRMED',
              matchQuality: 'EXACT',
              lastVerifiedAt: now,
            },
          })
        : await db.marketProviderMapping.create({
            data: {
              id: randomUUID(),
              assetId,
              providerCode: 'PRICECHARTING',
              providerExternalId: providerProductId,
              providerUrl: observation.externalUrl,
              identityHash: research.identityHash,
              status: 'STAFF_CONFIRMED',
              matchQuality: 'EXACT',
              lastVerifiedAt: now,
              nextRefreshAt: null,
            },
          });
      const existingObservation = await db.marketObservation.findUnique({
        where: { providerCode_sourceFingerprint: { providerCode: 'PRICECHARTING', sourceFingerprint } },
      });
      if (existingObservation && existingObservation.assetId !== assetId) {
        throw new ConflictException({
          code: 'MARKET_OBSERVATION_CONFLICT',
          message: 'The confirmed observation is already attached to another canonical Asset.',
        });
      }
      const promotedObservation = existingObservation ?? await db.marketObservation.create({
        data: {
          id: randomUUID(),
          assetId,
          mappingId: mapping.id,
          providerCode: 'PRICECHARTING',
          providerExternalId: providerProductId,
          observationType: 'PRICE_GUIDE',
          priceMinor: observation.amountMinor,
          currency: observation.currency,
          grader: null,
          grade: null,
          title: observation.originalTitle,
          externalUrl: observation.externalUrl,
          occurredAt: observation.observedAt,
          observedAt: observation.observedAt,
          matchQuality: 'EXACT',
          included: true,
          exclusionReason: null,
          sourceFingerprint,
          provenance: {
            provider: 'PRICECHARTING',
            providerProductId,
            conditionKey: 'loose-price',
            observationType: 'PRICE_GUIDE',
            sourceCurrency: observation.currency,
            submissionId,
            submissionResearchId: research.id,
            submissionObservationId: observation.id,
            identityHash: research.identityHash,
          } as Prisma.InputJsonValue,
        },
      });
      const snapshot = await db.assetMarketSnapshot.upsert({
        where: { assetId_source_asOf: { assetId, source: 'EXTERNAL_MARKET_REFERENCE', asOf: observation.observedAt } },
        create: {
          id: randomUUID(),
          assetId,
          asOf: observation.observedAt,
          estimatedMarketValueMinor: observation.amountMinor,
          currency: observation.currency,
          change24hBps: 0,
          availableBps: null,
          ownersCount: null,
          watchersCount: null,
          confidence: null,
          source: 'EXTERNAL_MARKET_REFERENCE',
          status: 'LIVE',
          markSource: 'EXTERNAL_REFERENCE_FALLBACK',
          freshness: freshnessState(now, observation.observedAt),
          lastSuccessfulRefreshAt: observation.observedAt,
        },
        update: {},
      });
      await db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'SUBMISSION_MARKET_RESEARCH_PROMOTED',
          resourceType: 'asset',
          resourceId: assetId,
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            submissionId,
            researchId: research.id,
            provider: 'PRICECHARTING',
            providerProductId,
            observationId: promotedObservation.id,
            snapshotId: snapshot.id,
            observedAt: observation.observedAt.toISOString(),
          },
          createdAt: now,
        },
      });
      return {
        submissionId,
        assetId,
        mappingId: mapping.id,
        observationId: promotedObservation.id,
        snapshotId: snapshot.id,
        providerProductId,
        providerCalls: 0,
        idempotent: Boolean(existingMapping && existingObservation),
      };
    });
    return result;
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
    edition: read('edition'),
    language: read('language'),
    grader: read('grader'),
    grade: read('grade'),
    variant: read('variant'),
  };
}

function customerReference(metadata: Record<string, unknown>) {
  const value = metadata.customerReference;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const reference = value as Record<string, unknown>;
  return {
    provider:
      typeof reference.provider === 'string' ? reference.provider : null,
    externalReferenceId:
      typeof reference.externalReferenceId === 'string'
        ? reference.externalReferenceId
        : null,
  };
}

function providerObservationToResearch(
  observation: ProviderObservation,
): Observation {
  return {
    providerCode: 'PRICECHARTING',
    externalReferenceId: `${observation.providerExternalId}:${String(observation.provenance?.conditionKey ?? 'reference')}`,
    externalUrl: observation.externalUrl ?? '',
    observationType: 'PRICE_GUIDE',
    originalTitle: observation.title,
    amountMinor: observation.priceMinor,
    currency: observation.currency,
    observedAt: observation.observedAt,
    grader: observation.grader,
    grade: observation.grade,
    variant: undefined,
  };
}
function hashIdentity(identity: Identity) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(identity)
            .filter(([k, v]) => k !== 'edition' || v !== null)
            .map(([k, v]) => [k, normalize(v ?? '')]),
        ),
      ),
    )
    .digest('hex');
}
function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function identityCompatibleWithAsset(identity: Identity, asset: {
  category: { id: string };
  year: number | null;
  title: string;
  collectibleSet: { name: string } | null;
  cardNumber: string | null;
  edition: string | null;
}) {
  const same = (left: string | number | null | undefined, right: string | number | null | undefined) =>
    left == null || right == null || normalize(String(left)) === normalize(String(right));
  return (
    identity.categoryId === asset.category.id &&
    same(identity.year, asset.year) &&
    same(identity.name, asset.title) &&
    same(identity.set, asset.collectibleSet?.name) &&
    same(identity.cardNumber, asset.cardNumber) &&
    same(identity.variant, asset.edition)
  );
}

function marketSourceFingerprint(
  providerExternalId: string,
  observationType: string,
  amountMinor: bigint,
  currency: string,
  observedAt: Date,
) {
  return createHash('sha256')
    .update(
      [
        providerExternalId,
        observationType,
        amountMinor.toString(),
        currency,
        observedAt.toISOString(),
      ].join('|'),
    )
    .digest('hex');
}
function classifyObservation(
  identity: Identity,
  item: Observation,
): MatchedObservation {
  const haystack = normalize(`${item.originalTitle} ${item.variant ?? ''}`);
  const required = [identity.name]
    .filter(Boolean)
    .map((part) => normalize(part!));
  const wrong =
    /\b(proxy|replica|reprint|custom|empty slab|lot|bundle|damaged)\b/i.test(
      item.originalTitle,
    );
  const identityMatch =
    required.every((part) => haystack.includes(part)) &&
    (!identity.cardNumber || cardNumberMatches(identity.cardNumber, haystack));
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

function cardNumberMatches(cardNumber: string, haystack: string) {
  const normalizedCardNumber = normalize(cardNumber);
  if (haystack.includes(normalizedCardNumber)) return true;
  const numerator = normalize(cardNumber.split('/')[0] ?? '');
  return numerator.length >= 2 && haystack.includes(numerator);
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
  const priceGuides = observations.filter(
    (o) => o.observationType === 'PRICE_GUIDE' && o.included,
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
    (exactSales.length >= 5 && sourceCount >= 2) || priceGuides.length >= 2
      ? 'HIGH'
      : exactSales.length >= 2 || priceGuides.length
        ? 'MEDIUM'
        : exactSales.length
          ? 'LOW'
          : null;
  const state = sales.length || priceGuides.length
    ? (sales.length || priceGuides.length) === 1
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
      priceGuides: summary(priceGuides),
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
