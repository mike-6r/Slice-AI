import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Inject } from '@nestjs/common';
import { MarketProviderRegistry } from './market-provider.registry';
import type { MarketIdentity, ProviderObservation } from './market-provider.ports';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LEASE_MS = 120_000;

@Injectable()
export class MarketRefreshService {
  private readonly logger = new Logger(MarketRefreshService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly providers: MarketProviderRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async enqueueDue(now = new Date()) {
    await this.ensureMappings(now);
    const mappings = await this.db.marketProviderMapping.findMany({
      where: {
        status: { in: ['AUTO_MATCHED', 'STRONG', 'VERIFIED', 'STAFF_CONFIRMED'] },
        OR: [{ nextRefreshAt: null }, { nextRefreshAt: { lte: now } }],
        AND: [{ OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }] }],
      },
      take: this.config.marketRefreshBatchSize * 4,
      orderBy: [{ nextRefreshAt: 'asc' }, { assetId: 'asc' }],
    });
    let queued = 0;
    for (const mapping of mappings) {
      const idempotencyKey = `market-refresh:${mapping.assetId}:${mapping.providerCode}:${Math.floor(now.getTime() / REFRESH_INTERVAL_MS)}`;
      const existing = await this.db.marketRefreshJob.findUnique({ where: { idempotencyKey } });
      if (existing) continue;
      try {
        await this.db.marketRefreshJob.create({
          data: {
            id: randomUUID(),
            assetId: mapping.assetId,
            mappingId: mapping.id,
            providerCode: mapping.providerCode,
            idempotencyKey,
            availableAt: now,
          },
        });
        queued += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return { queued, mappings: mappings.length };
  }

  async runOnce(now = new Date(), workerId = `market-${process.pid}`) {
    await this.enqueueDue(now);
    const jobs = await this.claimJobs(now, workerId);
    for (const job of jobs) await this.processJob(job.id, now, workerId);
    return { claimed: jobs.length };
  }

  async refreshAsset(assetId: string, now = new Date()) {
    await this.ensureMappings(now, assetId);
    const mappings = await this.db.marketProviderMapping.findMany({ where: { assetId } });
    for (const mapping of mappings) {
      const idempotencyKey = `market-refresh:manual:${assetId}:${mapping.providerCode}:${now.getTime()}`;
      await this.db.marketRefreshJob.create({
        data: { id: randomUUID(), assetId, mappingId: mapping.id, providerCode: mapping.providerCode, idempotencyKey, availableAt: now },
      });
    }
    return { assetId, queued: mappings.length };
  }

  private async claimJobs(now: Date, workerId: string) {
    const candidates = await this.db.marketRefreshJob.findMany({
      where: {
        status: { in: ['QUEUED', 'PROCESSING'] },
        availableAt: { lte: now },
        OR: [{ status: 'QUEUED' }, { leaseExpiresAt: { lt: now } }],
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: this.config.marketRefreshBatchSize,
    });
    const claimed: typeof candidates = [];
    for (const candidate of candidates) {
      const result = await this.db.marketRefreshJob.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          ...(candidate.status === 'PROCESSING' ? { leaseExpiresAt: { lt: now } } : {}),
        },
        data: { status: 'PROCESSING', lockedAt: now, lockedBy: workerId, leaseExpiresAt: new Date(now.getTime() + (this.config.marketRefreshLeaseMs ?? LEASE_MS)), attempts: { increment: 1 } },
      });
      if (result.count === 1) claimed.push(candidate);
    }
    return claimed;
  }

  private async processJob(jobId: string, now: Date, workerId: string) {
    const job = await this.db.marketRefreshJob.findUnique({ where: { id: jobId }, include: { mapping: true } });
    if (!job || !job.mapping) return;
    const provider = this.providers.get(job.providerCode);
    try {
      if (!provider) throw new Error('MARKET_PROVIDER_NOT_REGISTERED');
      const asset = await this.db.asset.findUnique({ where: { id: job.assetId }, include: { category: true, collectibleSet: true, gradeScaleEntry: { include: { company: true } } } });
      if (!asset) throw new Error('MARKET_ASSET_NOT_FOUND');
      const identity: MarketIdentity = {
        category: asset.category.slug,
        year: asset.year,
        manufacturer: asset.manufacturer,
        set: asset.collectibleSet?.name ?? null,
        cardNumber: asset.cardNumber,
        title: asset.title,
        variant: asset.edition,
        grader: asset.gradeScaleEntry?.company.code ?? null,
        grade: asset.gradeScaleEntry?.grade.toString() ?? null,
      };
      if (!provider.supports(identity.category)) throw new Error('MARKET_PROVIDER_UNSUPPORTED_CATEGORY');
      const observations = await provider.fetchObservations(identity, job.mapping.providerExternalId);
      await this.persistObservations(job.mapping.id, asset.id, observations);
      await this.rebuildSummary(asset.id, observations, now);
      await this.db.marketProviderMapping.update({
        where: { id: job.mapping.id },
        data: { lastSuccessAt: now, lastFailureAt: null, lastFailureCode: null, cooldownUntil: null, nextRefreshAt: new Date(now.getTime() + REFRESH_INTERVAL_MS) },
      });
      await this.db.marketRefreshJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: now, lockedAt: null, lockedBy: null, leaseExpiresAt: null } });
      this.logger.log({ jobId: job.id, workerId, provider: job.providerCode, observations: observations.length }, 'Market refresh completed');
    } catch (error) {
      const attempts = job.attempts;
      const terminal = attempts >= this.config.marketRefreshMaxAttempts;
      const delay = Math.min(this.config.marketRefreshRetryMaxMs, this.config.marketRefreshRetryBaseMs * 2 ** Math.max(0, attempts - 1));
      const next = new Date(now.getTime() + delay);
      const code = safeErrorCode(error);
      await this.db.marketProviderMapping.update({ where: { id: job.mapping.id }, data: { lastFailureAt: now, lastFailureCode: code, cooldownUntil: terminal ? next : null, nextRefreshAt: terminal ? next : now } });
      await this.db.marketRefreshJob.update({ where: { id: job.id }, data: { status: terminal ? 'FAILED' : 'QUEUED', availableAt: next, lastErrorCode: code, lastErrorAt: now, lockedAt: null, lockedBy: null, leaseExpiresAt: null } });
      this.logger.warn({ jobId: job.id, workerId, provider: job.providerCode, code, terminal }, 'Market refresh failed');
    }
  }

  private async persistObservations(mappingId: string, assetId: string, observations: ProviderObservation[]) {
    const rows = observations.map((observation) => ({
      id: randomUUID(), assetId, mappingId, providerCode: 'PRICECHARTING', providerExternalId: observation.providerExternalId,
      observationType: observation.observationType, priceMinor: observation.priceMinor, currency: observation.currency,
      grader: observation.grader, grade: observation.grade, title: observation.title, externalUrl: observation.externalUrl,
      occurredAt: observation.occurredAt, observedAt: observation.observedAt, matchQuality: observation.matchQuality,
      included: observation.matchQuality === 'EXACT' || observation.matchQuality === 'STRONG', exclusionReason: observation.exclusionReason,
      sourceFingerprint: fingerprint(observation), provenance: observation.provenance as Prisma.InputJsonValue,
    }));
    if (rows.length) await this.db.marketObservation.createMany({ data: rows, skipDuplicates: true });
  }

  private async rebuildSummary(assetId: string, current: ProviderObservation[], now: Date) {
    const history = await this.db.marketObservation.findMany({ where: { assetId, included: true }, orderBy: [{ observedAt: 'desc' }, { id: 'desc' }], take: 500 });
    const sales = history.filter((item) => item.observationType === 'COMPLETED_SALE');
    if (!sales.length) return;
    const byCurrency = sales.reduce((groups, item) => { const list = groups.get(item.currency) ?? []; list.push(item); groups.set(item.currency, list); return groups; }, new Map<string, typeof sales>());
    const [currency, currencySales] = [...byCurrency.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
    const sorted = [...currencySales].sort((a, b) => (a.priceMinor < b.priceMinor ? -1 : a.priceMinor > b.priceMinor ? 1 : 0));
    const midpoint = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[midpoint]!.priceMinor : (sorted[midpoint - 1]!.priceMinor + sorted[midpoint]!.priceMinor) / 2n;
    const previous = await this.db.assetMarketSnapshot.findFirst({ where: { assetId, currency }, orderBy: [{ asOf: 'desc' }, { id: 'desc' }] });
    const change24hBps = previous && previous.estimatedMarketValueMinor > 0n && previous.asOf.getTime() >= now.getTime() - 2 * 86_400_000
      ? Number(((median - previous.estimatedMarketValueMinor) * 10_000n) / previous.estimatedMarketValueMinor)
      : 0;
    const freshness = freshnessState(now, history[0]?.observedAt ?? now);
    await this.db.assetMarketSnapshot.create({ data: { id: randomUUID(), assetId, asOf: now, estimatedMarketValueMinor: median, currency, change24hBps, availableBps: null, ownersCount: null, watchersCount: null, confidence: null, source: 'EXTERNAL_MARKET_REFERENCE', status: 'LIVE', markSource: 'EXTERNAL_REFERENCE_FALLBACK', freshness, lastSuccessfulRefreshAt: now } });
    await this.db.assetValuationPoint.create({ data: { id: randomUUID(), assetId, observedAt: now, estimatedMarketValueMinor: median, currency, source: 'MARKET_DATA:PRICECHARTING', status: 'LIVE' } }).catch((error) => { if (!isUniqueViolation(error)) throw error; });
  }

  private async ensureMappings(now: Date, assetId?: string) {
    const assets = await this.db.asset.findMany({ where: { status: 'PUBLISHED', ...(assetId ? { id: assetId } : {}) }, include: { category: true, collectibleSet: true, gradeScaleEntry: { include: { company: true } }, valuationEvidence: { orderBy: { observedAt: 'desc' }, take: 10 } }, take: assetId ? undefined : 200 });
    for (const asset of assets) {
      const evidence = asset.valuationEvidence.find((item) => {
        if (!item.sourceRef) return false;
        try { const parsed = JSON.parse(item.sourceRef) as Record<string, unknown>; return typeof parsed.listingUrl === 'string' && /pricecharting\.com/i.test(parsed.listingUrl); } catch { return false; }
      });
      if (!evidence?.sourceRef) continue;
      const parsed = JSON.parse(evidence.sourceRef) as { listingUrl?: string; externalReference?: string };
      const providerExternalId = providerIdFromUrl(parsed.listingUrl!) ?? parsed.externalReference;
      if (!providerExternalId) continue;
      const providerCode = 'PRICECHARTING';
      const identityHash = createHash('sha256').update(JSON.stringify({ category: asset.category.slug, year: asset.year, manufacturer: asset.manufacturer, set: asset.collectibleSet?.slug, cardNumber: asset.cardNumber, title: asset.title, grader: asset.gradeScaleEntry?.company.code, grade: asset.gradeScaleEntry?.grade.toString(), variant: asset.edition })).digest('hex');
      try {
        await this.db.marketProviderMapping.upsert({ where: { assetId_providerCode: { assetId: asset.id, providerCode } }, create: { id: randomUUID(), assetId: asset.id, providerCode, providerExternalId, providerUrl: parsed.listingUrl, identityHash, nextRefreshAt: now }, update: { providerExternalId, providerUrl: parsed.listingUrl, identityHash } });
      } catch (error) { if (!isUniqueViolation(error)) throw error; }
    }
  }
}

function providerIdFromUrl(value: string) {
  try { const parsed = new URL(value); const marker = '/game/'; const index = parsed.pathname.indexOf(marker); return index >= 0 ? parsed.pathname.slice(index + marker.length).replace(/^\/+|\/+$/g, '') : null; } catch { return null; }
}

function fingerprint(observation: ProviderObservation) {
  return createHash('sha256').update([observation.providerExternalId, observation.observationType, observation.priceMinor.toString(), observation.currency, observation.occurredAt?.toISOString() ?? observation.observedAt.toISOString()].join('|')).digest('hex');
}

export function freshnessState(now: Date, observedAt: Date): 'FRESH' | 'AGING' | 'STALE' | 'UNAVAILABLE' {
  const age = now.getTime() - observedAt.getTime();
  if (age <= 24 * 60 * 60 * 1000) return 'FRESH';
  if (age <= 72 * 60 * 60 * 1000) return 'AGING';
  if (age <= 7 * 24 * 60 * 60 * 1000) return 'STALE';
  return 'UNAVAILABLE';
}

function safeErrorCode(error: unknown) { return error instanceof Error ? error.message.slice(0, 120) : 'MARKET_REFRESH_FAILED'; }
function isUniqueViolation(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
