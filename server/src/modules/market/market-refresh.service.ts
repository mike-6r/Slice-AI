import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Inject } from '@nestjs/common';
import { MarketProviderRegistry } from './market-provider.registry';
import type { MarketIdentity, ProviderObservation } from './market-provider.ports';

const REFRESH_INTERVALS_MS = {
  AUTO_MATCHED: 24 * 60 * 60 * 1000,
  STRONG: 12 * 60 * 60 * 1000,
  VERIFIED: 6 * 60 * 60 * 1000,
  STAFF_CONFIRMED: 6 * 60 * 60 * 1000,
} as const;
const MANUAL_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
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
        asset: this.config.isBeta
          ? { slug: { not: { startsWith: 'slice-demo-' } } }
          : undefined,
        OR: [{ nextRefreshAt: null }, { nextRefreshAt: { lte: now } }],
        AND: [{ OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }] }],
      },
      take: this.config.marketRefreshBatchSize * 4,
      orderBy: [{ nextRefreshAt: 'asc' }, { assetId: 'asc' }],
    });
    let queued = 0;
    for (const mapping of mappings) {
      const interval = refreshInterval(mapping.status);
      const jitter = deterministicJitter(mapping.assetId, interval);
      const idempotencyKey = `market-refresh:${mapping.assetId}:${mapping.providerCode}:${Math.floor((now.getTime() - jitter) / interval)}`;
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
            availableAt: new Date(Math.max(now.getTime(), (mapping.nextRefreshAt ?? now).getTime())),
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
    const cooldownUntil = new Date(now.getTime() + MANUAL_REFRESH_COOLDOWN_MS);
    let queued = 0;
    for (const mapping of mappings) {
      if (mapping.cooldownUntil && mapping.cooldownUntil > now) continue;
      const recentlyQueued = await this.db.marketRefreshJob.findFirst({
        where: {
          mappingId: mapping.id,
          createdAt: { gte: new Date(now.getTime() - MANUAL_REFRESH_COOLDOWN_MS) },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (recentlyQueued) continue;
      const idempotencyKey = `market-refresh:manual:${assetId}:${mapping.providerCode}:${Math.floor(now.getTime() / MANUAL_REFRESH_COOLDOWN_MS)}`;
      const existing = await this.db.marketRefreshJob.findUnique({ where: { idempotencyKey } });
      if (existing) continue;
      try {
        await this.db.marketRefreshJob.create({
          data: { id: randomUUID(), assetId, mappingId: mapping.id, providerCode: mapping.providerCode, idempotencyKey, availableAt: now },
        });
        queued += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return { assetId, queued, cooldownUntil: queued ? cooldownUntil.toISOString() : null };
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
      if (this.config.isBeta && asset.slug.startsWith('slice-demo-')) {
        await this.db.marketRefreshJob.update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: now, lastErrorCode: 'BETA_FIXTURE_EXCLUDED', lastErrorAt: now, lockedAt: null, lockedBy: null, leaseExpiresAt: null } });
        return;
      }
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
      await this.recordReferenceChange(asset.id, observations, now);
      await this.db.marketProviderMapping.update({
        where: { id: job.mapping.id },
        data: {
          lastSuccessAt: now,
          lastFailureAt: null,
          lastFailureCode: null,
          cooldownUntil: null,
          nextRefreshAt: new Date(now.getTime() + refreshInterval(job.mapping.status) + deterministicJitter(asset.id, refreshInterval(job.mapping.status))),
        },
      });
      await this.db.marketRefreshJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: now, lockedAt: null, lockedBy: null, leaseExpiresAt: null } });
      this.logger.log({ jobId: job.id, workerId, provider: job.providerCode, observations: observations.length }, 'Market refresh completed');
    } catch (error) {
      const attempts = job.attempts;
      const code = safeErrorCode(error);
      const terminal = attempts >= this.config.marketRefreshMaxAttempts || isPermanentFailure(code);
      const delay = retryDelay(code, attempts, this.config.marketRefreshRetryBaseMs, this.config.marketRefreshRetryMaxMs);
      const next = new Date(now.getTime() + delay);
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

  private async recordReferenceChange(assetId: string, current: ProviderObservation[], now: Date) {
    const latest = current.find((item) => item.matchQuality === 'EXACT' || item.matchQuality === 'STRONG');
    if (!latest || latest.priceMinor <= 0n) return;
    const previous = await this.db.marketObservation.findFirst({
      where: { assetId, included: true, providerExternalId: latest.providerExternalId, currency: latest.currency, priceMinor: { not: latest.priceMinor } },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
    });
    if (!previous || previous.priceMinor <= 0n) return;
    const changeBps = Number(((latest.priceMinor - previous.priceMinor) * 10_000n) / previous.priceMinor);
    if (Math.abs(changeBps) >= 1_000) {
      this.logger.log({ assetId, provider: 'PRICECHARTING', changeBps, observedAt: now.toISOString() }, 'Material external reference change detected; Slice valuation was not changed');
    }
  }

  private async ensureMappings(now: Date, assetId?: string) {
    const assets = await this.db.asset.findMany({ where: { status: 'PUBLISHED', ...(assetId ? { id: assetId } : {}), ...(this.config.isBeta ? { slug: { not: { startsWith: 'slice-demo-' } } } : {}) }, include: { category: true, collectibleSet: true, gradeScaleEntry: { include: { company: true } }, valuationEvidence: { orderBy: { observedAt: 'desc' }, take: 10 } }, take: assetId ? undefined : 200 });
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
        const existing = await this.db.marketProviderMapping.findUnique({ where: { assetId_providerCode: { assetId: asset.id, providerCode } } });
        const identityChanged = Boolean(existing && (existing.identityHash !== identityHash || existing.providerExternalId !== providerExternalId));
        await this.db.marketProviderMapping.upsert({ where: { assetId_providerCode: { assetId: asset.id, providerCode } }, create: { id: randomUUID(), assetId: asset.id, providerCode, providerExternalId, providerUrl: parsed.listingUrl, identityHash, nextRefreshAt: now }, update: identityChanged ? { providerExternalId, providerUrl: parsed.listingUrl, identityHash, status: 'AUTO_MATCHED', lastSuccessAt: null, lastFailureAt: null, lastFailureCode: null, cooldownUntil: null, nextRefreshAt: now } : { providerExternalId, providerUrl: parsed.listingUrl, identityHash } });
      } catch (error) { if (!isUniqueViolation(error)) throw error; }
    }
  }
}

function providerIdFromUrl(value: string) {
  try { const parsed = new URL(value); const marker = '/game/'; const index = parsed.pathname.indexOf(marker); return index >= 0 ? parsed.pathname.slice(index + marker.length).replace(/^\/+|\/+$/g, '') : null; } catch { return null; }
}

function fingerprint(observation: ProviderObservation) {
  const provenance = observation.provenance as Record<string, unknown> | undefined;
  const stableCondition = typeof provenance?.conditionKey === 'string' ? provenance.conditionKey : '';
  const eventTime = observation.occurredAt?.toISOString() ?? '';
  return createHash('sha256').update([observation.providerExternalId, observation.observationType, stableCondition, observation.priceMinor.toString(), observation.currency, eventTime].join('|')).digest('hex');
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
function refreshInterval(status: string) {
  return REFRESH_INTERVALS_MS[status as keyof typeof REFRESH_INTERVALS_MS] ?? REFRESH_INTERVALS_MS.AUTO_MATCHED;
}
function deterministicJitter(assetId: string, intervalMs: number) {
  const digest = createHash('sha256').update(assetId).digest().readUInt32BE(0);
  return Math.floor((digest / 0xffffffff) * Math.min(30 * 60 * 1000, Math.floor(intervalMs * 0.1)));
}
function isPermanentFailure(code: string) {
  return ['PRICECHARTING_AUTH_FAILED', 'PRICECHARTING_INVALID_RESPONSE', 'PRICECHARTING_NOT_CONFIGURED', 'MARKET_PROVIDER_UNSUPPORTED_CATEGORY', 'MARKET_ASSET_NOT_FOUND'].includes(code);
}
function retryDelay(code: string, attempts: number, base: number, max: number) {
  if (code === 'PRICECHARTING_RATE_LIMITED') return Math.min(max, Math.max(base, 5 * 60 * 1000));
  return Math.min(max, base * 2 ** Math.max(0, attempts - 1));
}
