import type { Prisma } from '@prisma/client';

export const collectorPlanRegistry = [
  {
    code: 'STARTER',
    displayName: 'Collector Starter',
    monthlyPriceMinor: 900n,
    entitlements: {
      maxActiveCollectibles: 10,
      maxOpenDrafts: 3,
      maxOpenSubmissions: 3,
      maxConcurrentIntake: 1,
      maxConcurrentSubmissions: 3,
      monthlySubmissionLimit: 10,
      marketResearchTier: 'STANDARD',
      marketResearchHistoryDepth: 3,
      bulkImportEnabled: false,
      advancedAnalyticsEnabled: false,
      featuredProfileAssetLimit: 2,
      prioritySupport: false,
      exportEnabled: false,
    },
  },
  {
    code: 'PRO',
    displayName: 'Collector Pro',
    monthlyPriceMinor: 1900n,
    entitlements: {
      maxActiveCollectibles: 50,
      maxOpenDrafts: 10,
      maxOpenSubmissions: 10,
      maxConcurrentIntake: 2,
      maxConcurrentSubmissions: 10,
      monthlySubmissionLimit: 20,
      marketResearchTier: 'EXPANDED',
      marketResearchHistoryDepth: 12,
      bulkImportEnabled: true,
      advancedAnalyticsEnabled: true,
      featuredProfileAssetLimit: 6,
      prioritySupport: true,
      exportEnabled: true,
    },
  },
  {
    code: 'ELITE',
    displayName: 'Collector Elite',
    monthlyPriceMinor: 4900n,
    entitlements: {
      maxActiveCollectibles: 250,
      maxOpenDrafts: 30,
      maxOpenSubmissions: 30,
      maxConcurrentIntake: 5,
      maxConcurrentSubmissions: 30,
      monthlySubmissionLimit: 100,
      marketResearchTier: 'ADVANCED',
      marketResearchHistoryDepth: 36,
      bulkImportEnabled: true,
      advancedAnalyticsEnabled: true,
      featuredProfileAssetLimit: 12,
      prioritySupport: true,
      exportEnabled: true,
    },
  },
] as const;

export type CollectorPlanCode = (typeof collectorPlanRegistry)[number]['code'];

/** Submission states that consume the active catalogue capacity. */
export const activeCollectorSubmissionStatuses = [
  'SUBMITTED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
] as const;

/** Workflow records that continue to consume open submission capacity. */
export const openCollectorSubmissionStatuses = [
  'SUBMITTED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
] as const;

export function billingPeriod(now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export function planJson(value: object): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function numberEntitlement(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
}
