export const REFERENCE_WINDOWS_MS = {
  '24H': 24 * 60 * 60 * 1000,
  '7D': 7 * 24 * 60 * 60 * 1000,
  '30D': 30 * 24 * 60 * 60 * 1000,
  '90D': 90 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
} as const;

export type ReferenceHistoryPoint = {
  id: string;
  priceMinor: bigint;
  observedAt: Date;
};

/**
 * Movement uses the latest stored observation at or before the window
 * boundary. A range is unavailable until a real boundary observation exists;
 * a newer point is never substituted to make a range look complete.
 */
export function calculateMovementBps(
  points: readonly ReferenceHistoryPoint[],
  windowMs: number,
): number | null {
  const ordered = [...points].sort(comparePoints);
  const current = ordered.at(-1);
  if (!current || current.priceMinor <= 0n) return null;
  const boundary = current.observedAt.getTime() - windowMs;
  const start = ordered
    .filter((point) => point.observedAt.getTime() <= boundary)
    .at(-1);
  if (!start || start.priceMinor <= 0n) return null;
  return Number(((current.priceMinor - start.priceMinor) * 10_000n) / start.priceMinor);
}

export function calculateReferenceMovements(points: readonly ReferenceHistoryPoint[]) {
  return {
    '24H': calculateMovementBps(points, REFERENCE_WINDOWS_MS['24H']),
    '7D': calculateMovementBps(points, REFERENCE_WINDOWS_MS['7D']),
    '30D': calculateMovementBps(points, REFERENCE_WINDOWS_MS['30D']),
    '90D': calculateMovementBps(points, REFERENCE_WINDOWS_MS['90D']),
    '1Y': calculateMovementBps(points, REFERENCE_WINDOWS_MS['1Y']),
  };
}

/**
 * Deterministic latest-per-time-bucket downsampling. The first and last real
 * observations are always retained; no interpolated values are created.
 */
export function downsampleReferencePoints(
  points: readonly ReferenceHistoryPoint[],
  maxPoints = 240,
): ReferenceHistoryPoint[] {
  const ordered = [...points].sort(comparePoints);
  if (ordered.length <= maxPoints) return ordered;
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  const bucketCount = Math.max(1, maxPoints - 2);
  const span = Math.max(1, last.observedAt.getTime() - first.observedAt.getTime());
  const buckets = new Map<number, ReferenceHistoryPoint>();
  for (const point of ordered.slice(1, -1)) {
    const bucket = Math.min(
      bucketCount - 1,
      Math.floor(((point.observedAt.getTime() - first.observedAt.getTime()) * bucketCount) / span),
    );
    buckets.set(bucket, point);
  }
  return [first, ...[...buckets.entries()].sort(([left], [right]) => left - right).map(([, point]) => point), last];
}

function comparePoints(left: ReferenceHistoryPoint, right: ReferenceHistoryPoint) {
  return left.observedAt.getTime() - right.observedAt.getTime() || left.id.localeCompare(right.id);
}
