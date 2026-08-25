import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  CACHE_STORE,
  type CacheStore,
} from '../../infrastructure/redis/redis.store';
import type {
  MarketDataProvider,
  MarketIdentity,
  MarketProductCandidate,
  PriceChartingProduct,
  ProviderObservation,
} from './market-provider.ports';

@Injectable()
export class MarketProviderRegistry {
  private readonly providers: MarketDataProvider[];

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Optional() @Inject(CACHE_STORE) cache?: CacheStore,
  ) {
    this.providers = [new PriceChartingProvider(config, cache)];
  }

  get(providerId: string) {
    return this.providers.find(
      (provider) => provider.providerId === providerId,
    );
  }

  all() {
    return [...this.providers];
  }
}

/**
 * PriceCharting's documented API adapter. PriceCharting is a current guide
 * source, not completed-sales history: every returned value is normalized as
 * PRICE_GUIDE and retains the provider's source currency.
 */
@Injectable()
export class PriceChartingProvider implements MarketDataProvider {
  readonly providerId = 'PRICECHARTING';
  private static lastRequestAt = 0;
  private static requestChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: AppConfig,
    @Optional() private readonly cache?: CacheStore,
  ) {}

  supports(category: string) {
    const normalizedCategory = category.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
      'pokemon',
      'pokemontcg',
      'sportscards',
      'football',
      'basketball',
      'hockey',
    ].includes(normalizedCategory);
  }

  async health() {
    const configured = Boolean(
      this.config.priceChartingEnabled && this.config.priceChartingApiToken,
    );
    return {
      configured,
      status: configured ? ('UP' as const) : ('UNAVAILABLE' as const),
      detail: configured
        ? 'PriceCharting API adapter configured; no paid call was made.'
        : 'PriceCharting API token is not configured.',
    };
  }

  async searchProducts(
    identity: MarketIdentity,
  ): Promise<MarketProductCandidate[]> {
    const query = buildSearchQuery(identity);
    const payload = await this.request('products', { q: query });
    const rows = objectArray(payload, 'products');
    return rows
      .map((row) => parseCandidate(row, identity))
      .filter((row): row is MarketProductCandidate => Boolean(row))
      .slice(0, 20);
  }

  async getProduct(providerExternalId: string): Promise<PriceChartingProduct> {
    const payload = await this.request('product', { id: providerExternalId });
    return parseProduct(payload, providerExternalId);
  }

  async fetchObservations(
    identity: MarketIdentity,
    providerExternalId: string,
  ): Promise<ProviderObservation[]> {
    const product = await this.getProduct(providerExternalId);
    const observedAt = new Date();
    return product.references.map((reference) => ({
      providerExternalId: product.providerProductId,
      observationType: 'PRICE_GUIDE' as const,
      priceMinor: reference.amountMinor,
      currency: product.currency,
      title: product.title || identity.title,
      externalUrl: `${this.config.priceChartingBaseUrl ?? 'https://www.pricecharting.com'}/product?id=${encodeURIComponent(product.providerProductId)}`,
      grader: reference.grader,
      grade: reference.grade,
      observedAt,
      matchQuality: conditionMatch(identity, reference),
      exclusionReason:
        conditionMatch(identity, reference) === 'WEAK'
          ? 'Reference is a different or non-specific grader/grade.'
          : undefined,
      provenance: {
        provider: 'PRICECHARTING',
        providerProductId: product.providerProductId,
        observationType: 'PRICE_GUIDE',
        conditionKey: reference.conditionKey,
        exactGrader: reference.exactGrader,
        sourceCurrency: product.currency,
        ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      },
    }));
  }

  private async request(
    resource: 'product' | 'products',
    params: Record<string, string>,
  ): Promise<unknown> {
    if (
      !this.config.priceChartingEnabled ||
      !this.config.priceChartingApiToken
    ) {
      throw new Error('PRICECHARTING_NOT_CONFIGURED');
    }
    const cacheKey = this.cache
      ? this.cache.key(
          'pricecharting-cache',
          createHash('sha256')
            .update(JSON.stringify({ resource, params }))
            .digest('hex'),
        )
      : null;
    if (cacheKey && this.config.priceChartingCacheTtlSeconds) {
      try {
        const cached = await this.cache!.get(cacheKey);
        if (cached) return JSON.parse(cached) as unknown;
      } catch {
        // A cache outage must not prevent a provider refresh.
      }
    }
    await this.throttle();
    const url = new URL(
      `/api/${resource}`,
      this.config.priceChartingApiBaseUrl ??
        this.config.priceChartingBaseUrl ??
        'https://www.pricecharting.com',
    );
    Object.entries({ ...params, t: this.config.priceChartingApiToken }).forEach(
      ([key, value]) => url.searchParams.set(key, value),
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.priceChartingRequestTimeoutMs,
    );
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('PRICECHARTING_AUTH_FAILED');
      }
      if (response.status === 429)
        throw new Error('PRICECHARTING_RATE_LIMITED');
      if (!response.ok)
        throw new Error(`PRICECHARTING_HTTP_${response.status}`);
      const payload = await response.json();
      if (cacheKey && this.config.priceChartingCacheTtlSeconds) {
        try {
          await this.cache!.set(cacheKey, JSON.stringify(payload), {
            ttlSeconds: this.config.priceChartingCacheTtlSeconds,
          });
        } catch {
          // A cache outage must not turn a successful provider response into a failure.
        }
      }
      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('PRICECHARTING_TIMEOUT');
      }
      if (
        error instanceof Error &&
        error.message.startsWith('PRICECHARTING_')
      ) {
        throw error;
      }
      throw new Error('PRICECHARTING_REQUEST_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throttle() {
    const run = async () => {
      const wait = Math.max(
        0,
        (this.config.priceChartingMinRequestIntervalMs ?? 1_000) -
          (Date.now() - PriceChartingProvider.lastRequestAt),
      );
      if (wait) await sleep(wait);

      if (this.cache) {
        const key = this.cache.key('pricecharting', 'global-rate');
        const ttlSeconds = Math.max(
          2,
          Math.ceil(
            (this.config.priceChartingMinRequestIntervalMs ?? 1_000) / 1_000,
          ) + 1,
        );
        for (;;) {
          try {
            if (
              await this.cache.set(key, String(Date.now()), {
                ttlSeconds,
                nx: true,
              })
            )
              break;
          } catch {
            break;
          }
          await sleep(this.config.priceChartingMinRequestIntervalMs ?? 1_000);
        }
      }
      PriceChartingProvider.lastRequestAt = Date.now();
    };
    const next = PriceChartingProvider.requestChain.then(run, run);
    PriceChartingProvider.requestChain = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
  }
}

const CONDITION_FIELDS = [
  ['loose-price', 'Raw / Ungraded', undefined, undefined, false],
  ['manual-only-price', 'PSA 10', 'PSA', '10', true],
  ['graded-price', 'Graded 9 reference', undefined, '9', false],
  ['new-price', 'Graded 8 / 8.5 reference', undefined, '8.5', false],
  ['cib-price', 'Graded 7 / 7.5 reference', undefined, '7.5', false],
  ['box-only-price', 'Graded 9.5 reference', undefined, '9.5', false],
  ['bgs-10-price', 'BGS 10', 'BGS', '10', true],
  ['condition-17-price', 'CGC 10', 'CGC', '10', true],
  ['condition-18-price', 'SGC 10', 'SGC', '10', true],
] as const;

function parseProduct(
  payload: unknown,
  fallbackId: string,
): PriceChartingProduct {
  const row =
    isRecord(payload) && isRecord(payload.product) ? payload.product : payload;
  if (!isRecord(row)) throw new Error('PRICECHARTING_INVALID_RESPONSE');
  const providerProductId = stringValue(row.id) ?? fallbackId;
  const title =
    stringValue(row['product-name']) ?? stringValue(row.title) ?? '';
  const set = stringValue(row['console-name']) ?? stringValue(row.set) ?? null;
  const releaseDate = stringValue(row['release-date']) ?? null;
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) || null : null;
  const currency = (
    stringValue(row.currency) ??
    stringValue(row['currency-code']) ??
    'USD'
  ).toUpperCase();
  const imageUrl = firstImageUrl(row);
  const references = CONDITION_FIELDS.flatMap(
    ([conditionKey, label, grader, grade, exactGrader]) => {
      const amountMinor = integerAmount(row[conditionKey]);
      return amountMinor === null
        ? []
        : [{ conditionKey, label, amountMinor, grader, grade, exactGrader }];
    },
  );
  return {
    providerProductId,
    title,
    set,
    releaseDate,
    year,
    upc: stringValue(row.upc) ?? null,
    currency,
    imageUrl,
    references,
  };
}

function parseCandidate(
  row: Record<string, unknown>,
  identity: MarketIdentity,
): MarketProductCandidate | undefined {
  const providerProductId =
    stringValue(row.id) ?? stringValue(row['product-id']);
  const title = stringValue(row['product-name']) ?? stringValue(row.title);
  if (!providerProductId || !title) return undefined;
  const candidate: MarketProductCandidate = {
    providerProductId,
    title,
    set: stringValue(row['console-name']) ?? stringValue(row.set) ?? null,
    releaseDate: stringValue(row['release-date']) ?? null,
    year: Number((stringValue(row['release-date']) ?? '').slice(0, 4)) || null,
    upc: stringValue(row.upc) ?? null,
    matchQuality: 'NEEDS_CONFIRMATION',
  };
  const normalized = normalize(`${candidate.title} ${candidate.set ?? ''}`);
  const number = normalize(identity.cardNumber);
  const titleMatch = normalize(identity.title)
    .split(' ')
    .filter(Boolean)
    .every((part) => normalized.includes(part));
  candidate.matchQuality =
    number && normalized.includes(number) && titleMatch
      ? 'EXACT'
      : titleMatch
        ? 'STRONG'
        : 'NEEDS_CONFIRMATION';
  return candidate;
}

function conditionMatch(
  identity: MarketIdentity,
  reference: { grader?: string; grade?: string; exactGrader: boolean },
): ProviderObservation['matchQuality'] {
  if (!identity.grader && !identity.grade) {
    return !reference.exactGrader && !reference.grader && !reference.grade
      ? 'EXACT'
      : 'WEAK';
  }
  if (!reference.exactGrader) return 'WEAK';
  return normalize(identity.grader) === normalize(reference.grader) &&
    normalize(identity.grade) === normalize(reference.grade)
    ? 'EXACT'
    : 'WEAK';
}

function objectArray(value: unknown, key: string) {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value) || !Array.isArray(value[key])) return [];
  return value[key].filter(isRecord);
}

function integerAmount(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return BigInt(value);
  if (
    typeof value === 'string' &&
    /^\d+$/.test(value.trim()) &&
    BigInt(value) > 0n
  )
    return BigInt(value);
  return null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstImageUrl(row: Record<string, unknown>) {
  for (const key of [
    'image-url',
    'image_url',
    'imageUrl',
    'image',
    'thumbnail-url',
    'thumbnail_url',
    'thumbnailUrl',
    'thumbnail',
    'cover-image',
    'cover_image',
    'box-art',
    'box_art',
  ]) {
    const value = imageUrlValue(row[key]);
    if (value) return value;
  }
  return null;
}

function imageUrlValue(value: unknown): string | undefined {
  const candidate =
    typeof value === 'string'
      ? value.trim()
      : isRecord(value) && typeof value.url === 'string'
        ? value.url.trim()
        : '';
  if (!candidate) return undefined;
  const normalized = candidate.startsWith('//')
    ? `https:${candidate}`
    : candidate;
  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildSearchQuery(identity: MarketIdentity) {
  return [
    identity.title,
    identity.edition,
    identity.set,
    identity.cardNumber,
    identity.variant,
    identity.year,
  ]
    .filter((value): value is string | number => Boolean(value))
    .join(' ');
}

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
