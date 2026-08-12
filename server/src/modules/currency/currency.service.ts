import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CACHE_STORE,
  type CacheStore,
} from '../../infrastructure/redis/redis.store';

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const FX_SOURCE = 'Frankfurter (central-bank reference rates)';
const fxCurrencies = ['USD', 'CAD', 'EUR'] as const;
type CurrencyCode = 'GBP' | (typeof fxCurrencies)[number];
type FxSnapshot = {
  baseCurrency: 'GBP';
  rates: Record<CurrencyCode, number>;
  asOf: string;
  fetchedAt: string;
  source: string;
};

@Injectable()
export class CurrencyService {
  constructor(@Inject(CACHE_STORE) private readonly cache: CacheStore) {}

  async rates() {
    const key = this.cache.key('fx-rates', 'gbp');
    const cached = await this.readCached(key);
    if (cached) return { ...cached, cached: true };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(
        'https://api.frankfurter.dev/v2/rates?base=GBP&quotes=USD,CAD,EUR',
        { signal: controller.signal, headers: { accept: 'application/json' } },
      );
      clearTimeout(timeout);
      if (!response.ok)
        throw new Error(`FX provider returned ${response.status}`);
      const raw: unknown = await response.json();
      const snapshot = this.parse(raw);
      try {
        await this.cache.set(key, JSON.stringify(snapshot), {
          ttlSeconds: CACHE_TTL_SECONDS,
        });
      } catch {
        // Redis is an acceleration layer. A live provider result remains safe to return.
      }
      return { ...snapshot, cached: false };
    } catch {
      throw new ServiceUnavailableException({
        code: 'FX_RATES_UNAVAILABLE',
        message:
          'Currency conversion is temporarily unavailable. GBP amounts remain available.',
      });
    }
  }

  private async readCached(key: string): Promise<FxSnapshot | null> {
    try {
      const raw = await this.cache.get(key);
      if (!raw) return null;
      return this.parse(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }

  private parse(value: unknown): FxSnapshot {
    if (!Array.isArray(value)) {
      const cached = value as Partial<FxSnapshot>;
      if (
        cached.baseCurrency === 'GBP' &&
        cached.rates &&
        typeof cached.asOf === 'string' &&
        typeof cached.fetchedAt === 'string' &&
        typeof cached.source === 'string'
      ) {
        return this.validateSnapshot(cached as FxSnapshot);
      }
      throw new Error('Invalid FX response');
    }
    const rates: Record<CurrencyCode, number> = {
      GBP: 1,
      USD: 0,
      CAD: 0,
      EUR: 0,
    };
    let asOf: string | undefined;
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as {
        base?: unknown;
        quote?: unknown;
        rate?: unknown;
        date?: unknown;
      };
      if (
        row.base !== 'GBP' ||
        !fxCurrencies.includes(row.quote as (typeof fxCurrencies)[number])
      )
        continue;
      if (
        typeof row.rate !== 'number' ||
        !Number.isFinite(row.rate) ||
        row.rate <= 0
      )
        continue;
      rates[row.quote as (typeof fxCurrencies)[number]] = row.rate;
      if (typeof row.date === 'string') asOf = row.date;
    }
    if (!asOf || fxCurrencies.some((currency) => rates[currency] <= 0)) {
      throw new Error('Incomplete FX response');
    }
    return {
      baseCurrency: 'GBP',
      rates,
      asOf,
      fetchedAt: new Date().toISOString(),
      source: FX_SOURCE,
    };
  }

  private validateSnapshot(snapshot: FxSnapshot): FxSnapshot {
    if (
      snapshot.rates.GBP !== 1 ||
      fxCurrencies.some(
        (currency) =>
          typeof snapshot.rates[currency] !== 'number' ||
          !Number.isFinite(snapshot.rates[currency]) ||
          snapshot.rates[currency] <= 0,
      )
    ) {
      throw new Error('Invalid FX cache');
    }
    return snapshot;
  }
}
