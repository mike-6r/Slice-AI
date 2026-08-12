import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const pipeline = [
  'DRAFT',
  'SUBMITTED',
  'REVIEW',
  'VALUATION',
  'CUSTODY',
  'VAULT_READY',
  'MARKET_LIVE',
] as const;

@Injectable()
export class CollectorWorkspaceService {
  constructor(private readonly db: PrismaService) {}

  async overview(userId: string) {
    const [user, submissions, notifications, auditEvents] = await Promise.all([
      this.db.user.findUniqueOrThrow({
        where: { id: userId },
        include: { profile: true, publicCollectorProfile: true },
      }),
      this.db.assetSubmission.findMany({
        where: { ownerUserId: userId },
        include: workspaceSubmissionInclude,
        orderBy: { updatedAt: 'desc' },
      }),
      this.db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.db.auditEvent.findMany({
        where: { actorUserId: userId, result: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);

    const assets = submissions.map((submission) => assetView(submission));
    const counts = Object.fromEntries(
      pipeline.map((stage) => [stage, 0]),
    ) as Record<(typeof pipeline)[number], number>;
    for (const item of assets)
      counts[item.stage as (typeof pipeline)[number]] += 1;
    const attention = assets.flatMap((item) => attentionFor(item)).slice(0, 6);
    const valued = assets.filter((item) => item.referenceValue);
    const marketLive = assets.filter((item) => item.stage === 'MARKET_LIVE');
    const latestActivity = [
      ...notifications.map((item) => ({
        id: `notification:${item.id}`,
        type: item.type,
        title: item.title,
        detail: item.body,
        occurredAt: item.createdAt.toISOString(),
      })),
      ...submissions.map((item) => ({
        id: `submission:${item.id}`,
        type: 'SUBMISSION',
        title: submissionActivityTitle(item.status),
        detail: item.asset?.title ?? declaredName(item.declaredMetadata),
        occurredAt: item.updatedAt.toISOString(),
      })),
      ...auditEvents.map((item) => ({
        id: `activity:${item.id}`,
        type: item.action,
        title: activityTitle(item.action),
        detail:
          item.resourceType === 'submission'
            ? 'Submission activity updated'
            : 'Account activity updated',
        occurredAt: item.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 8);

    const referenceTotal = valued.reduce(
      (total, item) => total + BigInt(item.referenceValue!.amountMinor),
      0n,
    );
    const liveReferenceTotal = marketLive.reduce(
      (total, item) => total + BigInt(item.referenceValue?.amountMinor ?? '0'),
      0n,
    );
    const executionSummary = marketLive.reduce(
      (summary, item) => ({
        trades: summary.trades + item.market.executionCount,
        volumeMinor:
          summary.volumeMinor + BigInt(item.market.executionVolumeMinor),
        units: summary.units + BigInt(item.market.executedUnits),
      }),
      { trades: 0, volumeMinor: 0n, units: 0n },
    );
    const ownerCount = marketLive.reduce(
      (total, item) => total + (item.market.ownersCount ?? 0),
      0,
    );

    return {
      collector: {
        displayName: user.profile?.displayName ?? 'Collector',
        username: user.profile?.publicUsername ?? null,
        countryCode: user.profile?.countryCode ?? null,
        collectorSince: user.createdAt.toISOString(),
        publicProfile: user.publicCollectorProfile
          ? {
              slug: user.publicCollectorProfile.slug,
              headline: user.publicCollectorProfile.headline,
              specialism: user.publicCollectorProfile.specialism,
              isPublic: user.publicCollectorProfile.isPublic,
            }
          : null,
      },
      kpis: {
        totalCollectibles: assets.length,
        referenceValue: referenceTotal > 0n ? money(referenceTotal) : null,
        marketLive: marketLive.length,
        inReview: counts.SUBMITTED + counts.REVIEW + counts.VALUATION,
        needsAttention: attention.length,
      },
      pipeline: pipeline.map((stage) => ({ stage, count: counts[stage] })),
      assets,
      attention,
      activity: latestActivity,
      analytics: {
        catalogueReferenceValue:
          referenceTotal > 0n ? money(referenceTotal) : null,
        marketLiveReferenceValue:
          liveReferenceTotal > 0n ? money(liveReferenceTotal) : null,
        marketLiveAssets: marketLive.length,
        trades: executionSummary.trades || null,
        volume:
          executionSummary.volumeMinor > 0n
            ? money(executionSummary.volumeMinor)
            : null,
        executedUnits: executionSummary.units.toString(),
        owners: ownerCount || null,
      },
    };
  }

  async updatePublicProfile(
    userId: string,
    patch: {
      headline?: string | null;
      specialism?: string | null;
      isPublic?: boolean;
    },
  ) {
    const profile = await this.db.publicCollectorProfile.upsert({
      where: { userId },
      create: {
        userId,
        slug: `collector-${userId.slice(-12)}`,
        headline: patch.headline ?? null,
        specialism: patch.specialism ?? null,
        isPublic: patch.isPublic ?? false,
        publishedAt: patch.isPublic ? new Date() : null,
      },
      update: {
        ...patch,
        ...(patch.isPublic === true ? { publishedAt: new Date() } : {}),
      },
    });
    return {
      slug: profile.slug,
      headline: profile.headline,
      specialism: profile.specialism,
      isPublic: profile.isPublic,
    };
  }
}

const workspaceSubmissionInclude = {
  media: { orderBy: { updatedAt: 'desc' as const } },
  marketResearch: { orderBy: { collectedAt: 'desc' as const }, take: 1 },
  asset: {
    include: {
      category: { select: { name: true } },
      collectibleSet: { select: { name: true } },
      gradeScaleEntry: { include: { company: { select: { code: true } } } },
      marketSnapshots: { orderBy: { asOf: 'desc' as const }, take: 1 },
      valuationDecisions: {
        where: { status: 'ACTIVE' },
        orderBy: { decidedAt: 'desc' as const },
        take: 1,
      },
      custodyRecord: true,
      publication: true,
      tradingMarket: true,
      tradingExecutions: {
        orderBy: { executedAt: 'desc' as const },
        take: 100,
        select: {
          priceMinor: true,
          units: true,
          grossMinor: true,
          executedAt: true,
        },
      },
    },
  },
} satisfies Prisma.AssetSubmissionInclude;
type WorkspaceSubmission = Prisma.AssetSubmissionGetPayload<{
  include: typeof workspaceSubmissionInclude;
}>;
type WorkspaceAsset = NonNullable<WorkspaceSubmission['asset']>;
type WorkspaceDecision = WorkspaceAsset['valuationDecisions'][number] | null;

function assetView(submission: WorkspaceSubmission) {
  const asset = submission.asset;
  const snapshot = asset?.marketSnapshots[0] ?? null;
  const decision = asset?.valuationDecisions[0] ?? null;
  const executions = asset?.tradingExecutions ?? [];
  const stage = stageFor(submission, asset, decision);
  const reference = decision
    ? {
        amountMinor: decision.valueMinor.toString(),
        currency: decision.currency,
        source: 'SLICE_SUPPORTED_VALUATION',
        asOf: decision.decidedAt.toISOString(),
      }
    : snapshot
      ? {
          amountMinor: snapshot.estimatedMarketValueMinor.toString(),
          currency: snapshot.currency,
          source: snapshot.source,
          asOf: snapshot.asOf.toISOString(),
        }
      : null;
  return {
    id: submission.id,
    assetId: asset?.id ?? null,
    slug: asset?.slug ?? null,
    title: asset?.title ?? declaredName(submission.declaredMetadata),
    year: asset?.year ?? declaredYear(submission.declaredMetadata),
    set: asset?.collectibleSet?.name ?? null,
    category: asset?.category?.name ?? null,
    grade: asset?.gradeScaleEntry
      ? `${asset.gradeScaleEntry.company.code} ${asset.gradeScaleEntry.grade.toFixed(2)}`
      : declaredGrade(submission.declaredMetadata),
    stage,
    submissionStatus: submission.status,
    updatedAt: submission.updatedAt.toISOString(),
    referenceValue: reference,
    marketResearch: submission.marketResearch[0]
      ? {
          state: submission.marketResearch[0].state,
          collectedAt: submission.marketResearch[0].collectedAt.toISOString(),
          snapshot: submission.marketResearch[0].snapshot,
        }
      : null,
    custody: asset?.custodyRecord
      ? {
          status: asset.custodyRecord.status,
          updatedAt: asset.custodyRecord.updatedAt.toISOString(),
        }
      : null,
    media: submission.media.map((media) => ({
      id: media.id,
      slot: media.slot,
      filename: media.originalFilename,
      status: media.status,
      updatedAt: media.updatedAt.toISOString(),
    })),
    market: {
      isLive: stage === 'MARKET_LIVE',
      ownersCount: snapshot?.ownersCount ?? null,
      availabilityBps: snapshot?.availableBps ?? null,
      executionCount: executions.length,
      executedUnits: executions
        .reduce((total, item) => total + item.units, 0n)
        .toString(),
      executionVolumeMinor: executions
        .reduce((total, item) => total + item.grossMinor, 0n)
        .toString(),
      latestSharePriceMinor: executions[0]?.priceMinor?.toString() ?? null,
    },
  };
}

function stageFor(
  submission: WorkspaceSubmission,
  asset: WorkspaceAsset | null,
  decision: WorkspaceDecision,
) {
  if (
    asset?.status === 'PUBLISHED' ||
    asset?.publication?.status === 'PUBLISHED'
  )
    return 'MARKET_LIVE';
  if (asset?.custodyRecord?.status === 'SECURED') return 'VAULT_READY';
  if (asset?.custodyRecord) return 'CUSTODY';
  if (decision) return 'VALUATION';
  if (
    submission.status === 'IN_REVIEW' ||
    submission.status === 'CHANGES_REQUESTED'
  )
    return 'REVIEW';
  if (submission.status === 'SUBMITTED' || submission.status === 'APPROVED')
    return 'SUBMITTED';
  return 'DRAFT';
}

function attentionFor(item: ReturnType<typeof assetView>) {
  if (item.submissionStatus === 'CHANGES_REQUESTED')
    return [
      {
        ...item,
        reason: 'Staff requested changes before review can continue.',
        badge: 'Action required',
      },
    ];
  if (item.media.some((media) => media.status === 'REJECTED'))
    return [
      {
        ...item,
        reason: 'Replace rejected evidence to continue the submission.',
        badge: 'Evidence needed',
      },
    ];
  return [];
}

function declaredMetadata(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function declaredName(value: unknown) {
  const name = declaredMetadata(value).name;
  return typeof name === 'string' ? name : 'Untitled collectible';
}
function declaredYear(value: unknown) {
  const year = declaredMetadata(value).year;
  return typeof year === 'string' || typeof year === 'number'
    ? Number(year) || null
    : null;
}
function declaredGrade(value: unknown) {
  const metadata = declaredMetadata(value);
  const grader = typeof metadata.grader === 'string' ? metadata.grader : null;
  const grade = typeof metadata.grade === 'string' ? metadata.grade : null;
  return grader && grade ? `${grader} ${grade}` : null;
}
function money(amountMinor: bigint) {
  return { amountMinor: amountMinor.toString(), currency: 'GBP' };
}
function submissionActivityTitle(status: string) {
  return status === 'CHANGES_REQUESTED'
    ? 'Submission update requested'
    : `Submission ${status.replaceAll('_', ' ').toLowerCase()}`;
}
function activityTitle(action: string) {
  if (action.includes('MEDIA')) return 'Evidence updated';
  if (action.includes('SUBMISSION')) return 'Submission activity';
  if (action.includes('PROFILE')) return 'Profile updated';
  return 'Collector activity';
}
