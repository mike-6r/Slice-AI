import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

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

export function numberEntitlement(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
}

export type CollectorUsage = {
  activeCollectibles: number;
  maxActiveCollectibles: number | null;
  openSubmissions: number;
  maxOpenSubmissions: number | null;
  openDrafts: number;
  maxOpenDrafts: number | null;
  monthlySubmissionsUsed: number;
  maxMonthlySubmissions: number | null;
  concurrentIntake: number;
  maxConcurrentIntake: number | null;
  remainingCatalogueCapacity: number | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  monthlySubmissions: number;
};

/**
 * Shared persisted usage projection for Collector entitlements. Admin and
 * customer workspaces must read the same counts and billing window.
 */
export async function collectorUsageFor(
  db: Pick<PrismaService, 'assetSubmission'>,
  userId: string,
  entitlements: Prisma.JsonValue | null,
) {
  return (
    await collectorUsageForMany(db, [userId], new Map([[userId, entitlements]]))
  ).get(userId)!;
}

export async function collectorUsageForMany(
  db: Pick<PrismaService, 'assetSubmission'>,
  userIds: string[],
  entitlementsByUser: Map<string, Prisma.JsonValue | null>,
) {
  const period = billingPeriod();
  const submissions = userIds.length
    ? await db.assetSubmission.findMany({
        where: { ownerUserId: { in: userIds } },
        select: {
          ownerUserId: true,
          status: true,
          createdAt: true,
          intake: { select: { status: true } },
        },
      })
    : [];
  const totals = new Map<
    string,
    { active: number; open: number; drafts: number; monthly: number; intake: number }
  >();
  for (const submission of submissions) {
    const usage = totals.get(submission.ownerUserId) ?? {
      active: 0,
      open: 0,
      drafts: 0,
      monthly: 0,
      intake: 0,
    };
    if ((activeCollectorSubmissionStatuses as readonly string[]).includes(submission.status))
      usage.active += 1;
    if ((openCollectorSubmissionStatuses as readonly string[]).includes(submission.status))
      usage.open += 1;
    if (submission.status === 'DRAFT') usage.drafts += 1;
    if (
      submission.createdAt >= period.start &&
      submission.createdAt < period.end &&
      submission.status !== 'CANCELLED'
    )
      usage.monthly += 1;
    if (
      submission.intake &&
      ['VAULT_SELECTED', 'SHIPPING_REQUIRED', 'IN_TRANSIT', 'DELIVERED'].includes(
        submission.intake.status,
      )
    )
      usage.intake += 1;
    totals.set(submission.ownerUserId, usage);
  }
  return new Map<string, CollectorUsage>(
    userIds.map((userId: string) => {
      const totalsForUser = totals.get(userId) ?? {
        active: 0,
        open: 0,
        drafts: 0,
        monthly: 0,
        intake: 0,
      };
      const entitlements = entitlementsByUser.get(userId) ?? null;
      const maxActiveCollectibles = numberEntitlement(entitlements ?? {}, 'maxActiveCollectibles');
      const maxOpenSubmissions = numberEntitlement(entitlements ?? {}, 'maxOpenSubmissions');
      const maxOpenDrafts = numberEntitlement(entitlements ?? {}, 'maxOpenDrafts');
      const maxMonthlySubmissions = numberEntitlement(entitlements ?? {}, 'monthlySubmissionLimit');
      const maxConcurrentIntake = numberEntitlement(entitlements ?? {}, 'maxConcurrentIntake');
      return [
        userId,
        {
          activeCollectibles: totalsForUser.active,
          maxActiveCollectibles,
          openSubmissions: totalsForUser.open,
          maxOpenSubmissions,
          openDrafts: totalsForUser.drafts,
          maxOpenDrafts,
          monthlySubmissionsUsed: totalsForUser.monthly,
          maxMonthlySubmissions,
          concurrentIntake: totalsForUser.intake,
          maxConcurrentIntake,
          remainingCatalogueCapacity:
            maxActiveCollectibles === null
              ? null
              : Math.max(maxActiveCollectibles - totalsForUser.active, 0),
          billingPeriodStart: period.start.toISOString(),
          billingPeriodEnd: period.end.toISOString(),
          monthlySubmissions: totalsForUser.monthly,
        },
      ];
    }),
  );
}
