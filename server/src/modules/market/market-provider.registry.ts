import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import type { MarketDataProvider } from './market-provider.ports';

@Injectable()
export class MarketProviderRegistry {
  private readonly providers: MarketDataProvider[];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.providers = [new PriceChartingProvider(config)];
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
 * PriceCharting's licensed/API contract is intentionally configured rather
 * than scraped. The adapter accepts the provider's normalized JSON response
 * and fails closed when no approved endpoint/key is present.
 */
@Injectable()
export class PriceChartingProvider implements MarketDataProvider {
  readonly providerId = 'PRICECHARTING';

  constructor(private readonly config: AppConfig) {}

  supports(category: string) {
    return [
      'pokemon',
      'pokemon-tcg',
      'sports-cards',
      'football',
      'basketball',
      'hockey',
    ].includes(category.toLowerCase());
  }

  async health() {
    const configured = Boolean(
      this.config.priceChartingApiBaseUrl && this.config.priceChartingApiKey,
    );
    return {
      configured,
      status: configured ? ('UP' as const) : ('UNAVAILABLE' as const),
      detail: configured
        ? 'PriceCharting API adapter configured.'
        : 'PriceCharting API credentials are not configured.',
    };
  }

  async fetchObservations(
    identity: import('./market-provider.ports').MarketIdentity,
    providerExternalId: string,
  ) {
    if (
      !this.config.priceChartingApiBaseUrl ||
      !this.config.priceChartingApiKey
    ) {
      throw new Error('PRICECHARTING_NOT_CONFIGURED');
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.priceChartingRequestTimeoutMs,
    );
    try {
      const response = await fetch(
        `${this.config.priceChartingApiBaseUrl}/products/${encodeURIComponent(providerExternalId)}/observations`,
        {
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${this.config.priceChartingApiKey}`,
          },
          signal: controller.signal,
        },
      );
      if (response.status === 429)
        throw new Error('PRICECHARTING_RATE_LIMITED');
      if (!response.ok)
        throw new Error(`PRICECHARTING_HTTP_${response.status}`);
      const payload = (await response.json()) as unknown;
      return parseProviderObservations(payload, identity, providerExternalId);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('PRICECHARTING_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseProviderObservations(
  payload: unknown,
  identity: import('./market-provider.ports').MarketIdentity,
  providerExternalId: string,
) {
  const rows =
    typeof payload === 'object' &&
    payload !== null &&
    'observations' in payload &&
    Array.isArray(payload.observations)
      ? payload.observations
      : [];
  return rows.flatMap(
    (raw): import('./market-provider.ports').ProviderObservation[] => {
      if (typeof raw !== 'object' || raw === null) return [];
      const row = raw as Record<string, unknown>;
      const price =
        typeof row.priceMinor === 'string' && /^\d+$/.test(row.priceMinor)
          ? BigInt(row.priceMinor)
          : null;
      const type = row.observationType;
      if (
        !price ||
        ![
          'COMPLETED_SALE',
          'ACTIVE_LISTING',
          'PRICE_GUIDE',
          'OTHER_APPROVED_REFERENCE',
        ].includes(String(type))
      )
        return [];
      const title =
        typeof row.title === 'string' && row.title.trim()
          ? row.title.trim()
          : identity.title;
      return [
        {
          providerExternalId:
            typeof row.externalId === 'string' && row.externalId
              ? row.externalId
              : providerExternalId,
          observationType:
            type as import('./market-provider.ports').ProviderObservation['observationType'],
          priceMinor: price,
          currency:
            typeof row.currency === 'string'
              ? row.currency.toUpperCase()
              : 'GBP',
          title,
          externalUrl: typeof row.url === 'string' ? row.url : undefined,
          grader: typeof row.grader === 'string' ? row.grader : undefined,
          grade: typeof row.grade === 'string' ? row.grade : undefined,
          occurredAt:
            typeof row.occurredAt === 'string'
              ? new Date(row.occurredAt)
              : undefined,
          observedAt:
            typeof row.observedAt === 'string'
              ? new Date(row.observedAt)
              : new Date(),
          matchQuality: matchQuality(identity, row),
          exclusionReason:
            typeof row.exclusionReason === 'string'
              ? row.exclusionReason
              : undefined,
          provenance: {
            provider: 'PRICECHARTING',
            externalId: providerExternalId,
          },
        },
      ];
    },
  );
}

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchQuality(
  identity: import('./market-provider.ports').MarketIdentity,
  row: Record<string, unknown>,
) {
  const title = normalize(typeof row.title === 'string' ? row.title : '');
  const cardNumber = normalize(identity.cardNumber);
  const grader = normalize(typeof row.grader === 'string' ? row.grader : '');
  const grade = normalize(typeof row.grade === 'string' ? row.grade : '');
  const expectedGrader = normalize(identity.grader);
  const expectedGrade = normalize(identity.grade);
  if (cardNumber && !title.includes(cardNumber)) return 'REJECTED' as const;
  if (expectedGrader && grader !== expectedGrader) return 'WEAK' as const;
  if (expectedGrade && grade !== expectedGrade) return 'WEAK' as const;
  return 'EXACT' as const;
}
