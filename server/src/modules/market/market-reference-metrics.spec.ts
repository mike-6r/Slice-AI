import { describe, expect, it } from '@jest/globals';
import {
  calculateMovementBps,
  calculateReferenceHistoryMetrics,
  calculateReferenceMovements,
  downsampleReferencePoints,
} from './market-reference-metrics';
import { selectCurrentPriceGuide } from './market-refresh.service';

const point = (id: string, priceMinor: bigint, observedAt: string) => ({
  id,
  priceMinor,
  observedAt: new Date(observedAt),
});

describe('PriceCharting reference metrics', () => {
  it('does not invent movement before a real window boundary exists', () => {
    const latest = point('latest', 1_250n, '2026-08-23T12:00:00.000Z');

    expect(calculateReferenceMovements([latest])).toEqual({
      '24H': null,
      '7D': null,
      '30D': null,
      '90D': null,
      '1Y': null,
    });
  });

  it('uses the latest observation at or before the boundary', () => {
    const points = [
      point('start', 1_000n, '2026-08-22T11:59:59.000Z'),
      point('boundary', 1_100n, '2026-08-22T12:00:00.000Z'),
      point('latest', 1_250n, '2026-08-23T12:00:00.000Z'),
    ];

    expect(calculateMovementBps(points, 24 * 60 * 60 * 1000)).toBe(1363);
  });

  it('returns authoritative range stats when a real boundary observation exists', () => {
    const metrics = calculateReferenceHistoryMetrics(
      [
        point('before', 900n, '2026-08-22T11:00:00.000Z'),
        point('boundary', 1_000n, '2026-08-22T12:00:00.000Z'),
        point('middle', 1_250n, '2026-08-23T00:00:00.000Z'),
        point('latest', 1_200n, '2026-08-23T12:00:00.000Z'),
      ],
      24 * 60 * 60 * 1000,
    );

    expect(metrics.startingPoint?.id).toBe('boundary');
    expect(metrics.latestPoint?.id).toBe('latest');
    expect(metrics.visiblePoints.map(({ id }) => id)).toEqual(['boundary', 'middle', 'latest']);
    expect(metrics.highValueMinor).toBe(1_250n);
    expect(metrics.lowValueMinor).toBe(1_000n);
    expect(metrics.absoluteChangeMinor).toBe(200n);
    expect(metrics.percentageChangeBps).toBe(2_000);
    expect(metrics.movementAvailability).toBe('AVAILABLE');
    expect(metrics.movementUnavailableReason).toBeNull();
  });

  it('reports incomplete coverage instead of inventing a range movement', () => {
    const metrics = calculateReferenceHistoryMetrics(
      [
        point('first', 1_000n, '2026-08-23T10:00:00.000Z'),
        point('latest', 1_100n, '2026-08-23T12:00:00.000Z'),
      ],
      24 * 60 * 60 * 1000,
    );

    expect(metrics.movementAvailability).toBe('UNAVAILABLE');
    expect(metrics.percentageChangeBps).toBeNull();
    expect(metrics.absoluteChangeMinor).toBeNull();
    expect(metrics.movementUnavailableReason).toBe('History currently covers 2h 0m');
    expect(metrics.actualCoverageSeconds).toBe(7_200);
  });

  it('distinguishes a single observation from an empty history', () => {
    const metrics = calculateReferenceHistoryMetrics(
      [point('only', 1_250n, '2026-08-23T12:00:00.000Z')],
      24 * 60 * 60 * 1000,
    );

    expect(metrics.movementUnavailableReason).toBe('Need at least two observations');
    expect(metrics.highValueMinor).toBe(1_250n);
    expect(metrics.lowValueMinor).toBe(1_250n);
    expect(metrics.actualCoverageSeconds).toBe(0);
  });

  it('supports negative and flat changes without floating point rounding', () => {
    const points = [
      point('start', 1_000n, '2026-08-22T12:00:00.000Z'),
      point('latest', 900n, '2026-08-23T12:00:00.000Z'),
    ];
    expect(calculateMovementBps(points, 24 * 60 * 60 * 1000)).toBe(-1000);
    expect(
      calculateMovementBps(
        [points[0]!, point('same', 1_000n, '2026-08-23T12:00:00.000Z')],
        24 * 60 * 60 * 1000,
      ),
    ).toBe(0);
  });

  it('downsamples deterministically and retains real endpoints', () => {
    const points = Array.from({ length: 20 }, (_, index) =>
      point(
        String(index).padStart(2, '0'),
        BigInt(index + 1),
        `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      ),
    );

    const sampled = downsampleReferencePoints(points, 6);
    expect(sampled.length).toBeLessThanOrEqual(6);
    expect(sampled[0]?.id).toBe('00');
    expect(sampled.at(-1)?.id).toBe('19');
    expect(sampled.map((item) => item.id)).toEqual(
      downsampleReferencePoints([...points].reverse(), 6).map((item) => item.id),
    );
  });

  it('prefers an exact positive price guide over weaker or unusable values', () => {
    const base = {
      providerExternalId: '2513024',
      observationType: 'PRICE_GUIDE' as const,
      currency: 'USD',
      title: 'Umbreon VMAX',
      externalUrl: 'https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215',
      observedAt: new Date('2026-08-23T12:00:00.000Z'),
      matchQuality: 'STRONG' as const,
      priceMinor: 2_000n,
      provenance: {},
    };
    const exact = { ...base, matchQuality: 'EXACT' as const, priceMinor: 2_225n };
    const unusable = { ...base, matchQuality: 'EXACT' as const, priceMinor: 0n };

    expect(selectCurrentPriceGuide([base, unusable, exact])).toBe(exact);
  });
});
