export type MarketSnapshotStatus =
  | 'CURRENT'
  | 'AGING'
  | 'STALE'
  | 'DELAYED'
  | 'UNAVAILABLE';

/**
 * The header is a small view over persisted market projections. A missing
 * freshness value is deliberately delayed rather than treated as live.
 */
export function deriveMarketSnapshotStatus(
  items: ReadonlyArray<{ freshness: string | null }>,
): MarketSnapshotStatus {
  if (!items.length) return 'UNAVAILABLE';
  if (items.some((item) => item.freshness === 'FRESH')) return 'CURRENT';
  if (items.some((item) => item.freshness === 'AGING')) return 'AGING';
  if (items.some((item) => item.freshness === 'STALE')) return 'STALE';
  return 'DELAYED';
}

export function marketSnapshotPriority(item: {
  hasLastTrade: boolean;
  hasInitialOffering: boolean;
  hasExternalReference: boolean;
}) {
  if (item.hasLastTrade) return 0;
  if (item.hasInitialOffering) return 1;
  if (item.hasExternalReference) return 2;
  return 3;
}
