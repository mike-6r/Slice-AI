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

export type ReferenceHistoryMetrics = {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  startingPoint: ReferenceHistoryPoint | null;
  latestPoint: ReferenceHistoryPoint | null;
  visiblePoints: ReferenceHistoryPoint[];
  actualCoverageSeconds: number;
  absoluteChangeMinor: bigint | null;
  percentageChangeBps: number | null;
  highValueMinor: bigint | null;
  lowValueMinor: bigint | null;
  movementAvailability: 'AVAILABLE' | 'UNAVAILABLE';
  movementUnavailableReason: string | null;
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
 * Selects range statistics from persisted observations only. The range end is
 * the latest persisted observation, not the browser clock, so a delayed feed
 * cannot make the selected window appear more complete than it is. The
 * starting value is the latest observation at or before the range boundary;
 * when no such observation exists, the earliest observation inside the range
 * is exposed but movement remains unavailable.
 */
export function calculateReferenceHistoryMetrics(
  points: readonly ReferenceHistoryPoint[],
  windowMs: number,
): ReferenceHistoryMetrics {
  const ordered = [...points].sort(comparePoints).filter((point) => point.priceMinor > 0n);
  const latestPoint = ordered.at(-1) ?? null;
  if (!latestPoint) {
    return {
      rangeStart: null,
      rangeEnd: null,
      startingPoint: null,
      latestPoint: null,
      visiblePoints: [],
      actualCoverageSeconds: 0,
      absoluteChangeMinor: null,
      percentageChangeBps: null,
      highValueMinor: null,
      lowValueMinor: null,
      movementAvailability: 'UNAVAILABLE',
      movementUnavailableReason: 'No reference history yet',
    };
  }

  const rangeEnd = latestPoint.observedAt;
  const rangeStart = new Date(rangeEnd.getTime() - windowMs);
  const visiblePoints = ordered.filter(
    (point) =>
      point.observedAt.getTime() >= rangeStart.getTime() &&
      point.observedAt.getTime() <= rangeEnd.getTime(),
  );
  const boundaryPoint = ordered
    .filter((point) => point.observedAt.getTime() <= rangeStart.getTime())
    .at(-1);
  const startingPoint = boundaryPoint ?? visiblePoints[0] ?? null;
  const highValueMinor = visiblePoints.length
    ? visiblePoints.reduce((high, point) => (point.priceMinor > high ? point.priceMinor : high), visiblePoints[0]!.priceMinor)
    : null;
  const lowValueMinor = visiblePoints.length
    ? visiblePoints.reduce((low, point) => (point.priceMinor < low ? point.priceMinor : low), visiblePoints[0]!.priceMinor)
    : null;
  const earliestPoint = ordered[0]!;
  const actualCoverageSeconds = Math.max(
    0,
    Math.floor((latestPoint.observedAt.getTime() - earliestPoint.observedAt.getTime()) / 1000),
  );
  const movementAvailable = Boolean(
    boundaryPoint &&
      boundaryPoint.priceMinor > 0n &&
      latestPoint.priceMinor > 0n &&
      boundaryPoint.id !== latestPoint.id,
  );
  const absoluteChangeMinor = movementAvailable
    ? latestPoint.priceMinor - boundaryPoint!.priceMinor
    : null;
  const percentageChangeBps = movementAvailable
    ? calculateMovementBps(ordered, windowMs)
    : null;

  return {
    rangeStart,
    rangeEnd,
    startingPoint,
    latestPoint,
    visiblePoints,
    actualCoverageSeconds,
    absoluteChangeMinor,
    percentageChangeBps,
    highValueMinor,
    lowValueMinor,
    movementAvailability: movementAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    movementUnavailableReason: movementAvailable
      ? null
      : visiblePoints.length < 2
        ? 'Need at least two observations'
        : `History currently covers ${formatCoverage(actualCoverageSeconds)}`,
  };
}

function formatCoverage(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
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
