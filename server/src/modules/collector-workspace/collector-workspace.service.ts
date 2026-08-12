import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

type WorkspaceStage = (typeof pipeline)[number];
type WorkspaceMoney = {
  amountMinor: string;
  currency: string;
  source: string;
  asOf: string;
};
type WorkspaceMedia = {
  id: string;
  slot: string;
  filename: string;
  status: string;
  updatedAt: string;
};
type WorkspaceItem = {
  id: string;
  assetId: string | null;
  slug: string | null;
  title: string;
  year: number | null;
  manufacturer: string | null;
  set: string | null;
  cardNumber: string | null;
  category: string | null;
  grader: string | null;
  grade: string | null;
  stage: WorkspaceStage;
  submissionStatus: string;
  nextAction: string;
  updatedAt: string;
  referenceValue: WorkspaceMoney | null;
  valuation: {
    supportedValue: WorkspaceMoney | null;
    externalReference: WorkspaceMoney | null;
  };
  marketResearch: {
    state: string;
    collectedAt: string;
    snapshot: Prisma.JsonValue;
  } | null;
  custody: { status: string; updatedAt: string } | null;
  media: WorkspaceMedia[];
  market: {
    isLive: boolean;
    ownersCount: number | null;
    availabilityBps: number | null;
    executionCount: number;
    executedUnits: string;
    executionVolumeMinor: string;
    latestSharePriceMinor: string | null;
  };
};

@Injectable()
export class CollectorWorkspaceService {
  constructor(private readonly db: PrismaService) {}

  async overview(userId: string) {
    const [user, submissions, notifications] = await Promise.all([
      this.db.user.findUniqueOrThrow({
        where: { id: userId },
        include: { profile: true, publicCollectorProfile: true },
      }),
      this.submissionsFor(userId),
      this.db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
    const assets = submissions.map(assetView);
    const requests = requestViews(assets);
    const counts = stageCounts(assets);
    const valued = assets.filter((item) => item.referenceValue);
    const marketLive = assets.filter((item) => item.stage === 'MARKET_LIVE');
    const referenceTotal = sumMoney(
      valued.map((item) => item.referenceValue!.amountMinor),
    );
    const liveReferenceTotal = sumMoney(
      marketLive.map((item) => item.referenceValue?.amountMinor ?? '0'),
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
      collector: collectorView(user),
      kpis: {
        // A collectible is one collector-owned D10 submission, whether or not
        // it has reached D11/D14 lifecycle records yet.
        totalCollectibles: assets.length,
        referenceValue: referenceTotal > 0n ? money(referenceTotal) : null,
        marketLive: marketLive.length,
        inReview: counts.SUBMITTED + counts.REVIEW + counts.VALUATION,
        needsAttention: requests.length,
      },
      pipeline: pipeline.map((stage) => ({ stage, count: counts[stage] })),
      assets,
      attention: requests.map((request) => ({
        ...request.asset,
        reason: request.reason,
        badge: request.badge,
        requestId: request.id,
        requestStatus: request.status,
        destination: request.destination,
      })),
      activity: await this.activityFor(userId, submissions, notifications),
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

  /** Customer-safe list projection. All records are scoped to D10 ownership. */
  async collectibles(userId: string) {
    return (await this.submissionsFor(userId)).map(assetView);
  }

  /** A single collector-owned detail projection; never accepts an arbitrary asset id. */
  async collectibleDetail(userId: string, submissionId: string) {
    const submission = await this.db.assetSubmission.findFirst({
      where: { id: submissionId, ownerUserId: userId },
      include: workspaceSubmissionInclude,
    });
    if (!submission) {
      throw new NotFoundException({
        code: 'COLLECTIBLE_NOT_FOUND',
        message: 'Collectible not found.',
      });
    }
    const asset = assetView(submission);
    return {
      asset,
      requests: requestViews([asset]),
      activity: await this.activityFor(userId, [submission], []),
    };
  }

  /** Requests are a live D10/media workflow projection, not a second state store. */
  async requests(userId: string) {
    return requestViews((await this.submissionsFor(userId)).map(assetView));
  }

  /** Evidence metadata only: object keys, scan diagnostics, and storage URLs remain private. */
  async documents(userId: string) {
    return (await this.submissionsFor(userId)).flatMap((submission) => {
      const asset = assetView(submission);
      return asset.media.map((media) => ({
        id: media.id,
        submissionId: asset.id,
        collectibleId: asset.assetId,
        title: asset.title,
        slot: media.slot,
        label: friendlyMediaLabel(media.slot),
        filename: media.filename,
        status: media.status,
        uploadedAt: media.updatedAt,
      }));
    });
  }

  /** Search is deliberately limited to the authenticated collector's records. */
  async search(userId: string, query: string) {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return { items: [] };
    const items = (await this.submissionsFor(userId)).flatMap((submission) => {
      const asset = assetView(submission);
      const base = [
        asset.title,
        asset.category,
        asset.set,
        asset.grade,
        asset.submissionStatus,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      const results: Array<{
        entityType: string;
        title: string;
        subtitle: string;
        route: string;
      }> = [];
      if (base.includes(value)) {
        results.push({
          entityType: 'COLLECTIBLE',
          title: asset.title,
          subtitle: `${stageLabel(asset.stage)} · ${asset.category ?? 'Collectible'}`,
          route: `/collector-workspace?collectible=${asset.id}`,
        });
      }
      for (const media of asset.media) {
        if (!media.filename.toLocaleLowerCase().includes(value)) continue;
        results.push({
          entityType: 'DOCUMENT',
          title: media.filename,
          subtitle: `${asset.title} · ${friendlyMediaLabel(media.slot)}`,
          route: `/collector-workspace?collectible=${asset.id}`,
        });
      }
      return results;
    });
    return { items: items.slice(0, 30) };
  }

  async updatePublicProfile(
    userId: string,
    patch: {
      headline?: string | null;
      specialism?: string | null;
      isPublic?: boolean;
    },
  ) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { profile: { select: { publicUsername: true } } },
    });
    const username = user.profile?.publicUsername;
    if (!username) {
      throw new ConflictException({
        code: 'PUBLIC_USERNAME_REQUIRED',
        message:
          'Set an account username before publishing a collector profile.',
      });
    }
    const profile = await this.db.publicCollectorProfile.upsert({
      where: { userId },
      create: {
        userId,
        slug: username,
        headline: patch.headline ?? null,
        specialism: patch.specialism ?? null,
        isPublic: patch.isPublic ?? false,
        publishedAt: patch.isPublic ? new Date() : null,
      },
      update: {
        slug: username,
        ...patch,
        ...(patch.isPublic === true ? { publishedAt: new Date() } : {}),
        ...(patch.isPublic === false ? { publishedAt: null } : {}),
      },
    });
    return {
      slug: profile.slug,
      headline: profile.headline,
      specialism: profile.specialism,
      isPublic: profile.isPublic,
    };
  }

  private submissionsFor(userId: string) {
    return this.db.assetSubmission.findMany({
      where: { ownerUserId: userId },
      include: workspaceSubmissionInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async activityFor(
    userId: string,
    submissions: WorkspaceSubmission[],
    notifications: Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      createdAt: Date;
    }>,
  ) {
    const submissionIds = submissions.map((item) => item.id);
    const assetIds = submissions.flatMap((item) =>
      item.assetId ? [item.assetId] : [],
    );
    const auditEvents = await this.db.auditEvent.findMany({
      where: {
        result: 'SUCCESS',
        OR: [
          { actorUserId: userId },
          ...(submissionIds.length
            ? [
                {
                  resourceType: 'submission',
                  resourceId: { in: submissionIds },
                },
              ]
            : []),
          ...(assetIds.length
            ? [{ resourceType: 'asset', resourceId: { in: assetIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    const titles = new Map(
      submissions.map((item) => [item.id, assetView(item).title]),
    );
    const assetTitles = new Map(
      submissions.flatMap((item) =>
        item.assetId ? [[item.assetId, assetView(item).title] as const] : [],
      ),
    );
    return [
      ...notifications.map((item) => ({
        id: `notification:${item.id}`,
        type: item.type,
        title: item.title,
        detail: item.body,
        occurredAt: item.createdAt.toISOString(),
      })),
      ...auditEvents.map((item) => ({
        id: `activity:${item.id}`,
        type: item.action,
        title: activityTitle(item.action),
        detail:
          (item.resourceType === 'submission' && item.resourceId
            ? titles.get(item.resourceId)
            : item.resourceType === 'asset' && item.resourceId
              ? assetTitles.get(item.resourceId)
              : null) ?? 'Collector workflow updated',
        occurredAt: item.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 12);
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
      tradingExecutions: {
        orderBy: { executedAt: 'desc' as const },
        take: 100,
        select: { priceMinor: true, units: true, grossMinor: true },
      },
    },
  },
} satisfies Prisma.AssetSubmissionInclude;
type WorkspaceSubmission = Prisma.AssetSubmissionGetPayload<{
  include: typeof workspaceSubmissionInclude;
}>;
type WorkspaceAsset = NonNullable<WorkspaceSubmission['asset']>;
type WorkspaceDecision = WorkspaceAsset['valuationDecisions'][number] | null;

function assetView(submission: WorkspaceSubmission): WorkspaceItem {
  const asset = submission.asset;
  const snapshot = asset?.marketSnapshots[0] ?? null;
  const decision = asset?.valuationDecisions[0] ?? null;
  const executions = asset?.tradingExecutions ?? [];
  const stage = stageFor(submission, asset, decision);
  const supportedValue = decision
    ? {
        amountMinor: decision.valueMinor.toString(),
        currency: decision.currency,
        source: 'SLICE_SUPPORTED_VALUATION',
        asOf: decision.decidedAt.toISOString(),
      }
    : null;
  const externalReference = snapshot
    ? {
        amountMinor: snapshot.estimatedMarketValueMinor.toString(),
        currency: snapshot.currency,
        source: snapshot.source,
        asOf: snapshot.asOf.toISOString(),
      }
    : null;
  const media = submission.media.map((item) => ({
    id: item.id,
    slot: item.slot,
    filename: item.originalFilename,
    status: item.status,
    updatedAt: item.updatedAt.toISOString(),
  }));
  return {
    id: submission.id,
    assetId: asset?.id ?? null,
    slug: asset?.slug ?? null,
    title: asset?.title ?? declaredName(submission.declaredMetadata),
    year: asset?.year ?? declaredYear(submission.declaredMetadata),
    manufacturer: asset?.manufacturer ?? null,
    set: asset?.collectibleSet?.name ?? null,
    cardNumber:
      asset?.cardNumber ?? declaredCardNumber(submission.declaredMetadata),
    category: asset?.category?.name ?? null,
    grader:
      asset?.gradeScaleEntry?.company.code ??
      declaredGrader(submission.declaredMetadata),
    grade: asset?.gradeScaleEntry
      ? asset.gradeScaleEntry.grade.toFixed(2)
      : declaredGrade(submission.declaredMetadata),
    stage,
    submissionStatus: submission.status,
    nextAction: nextActionFor(submission.status, stage, media),
    updatedAt: submission.updatedAt.toISOString(),
    // Kept for current workspace clients: it is always labelled with its source.
    referenceValue: supportedValue ?? externalReference,
    valuation: { supportedValue, externalReference },
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
    media,
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

function requestViews(assets: WorkspaceItem[]) {
  return assets.flatMap((asset) => requestFor(asset));
}

function requestFor(asset: WorkspaceItem) {
  const base = {
    asset,
    submissionId: asset.id,
    collectibleId: asset.assetId,
    destination: `/list?submissionId=${encodeURIComponent(asset.id)}`,
    status: 'OPEN' as const,
  };
  if (asset.submissionStatus === 'CHANGES_REQUESTED')
    return [
      {
        ...base,
        id: `submission:${asset.id}:changes`,
        reason: 'Staff requested changes before review can continue.',
        badge: 'Action required',
        action: 'Review and resubmit',
      },
    ];
  if (
    ['DRAFT', 'CHANGES_REQUESTED'].includes(asset.submissionStatus) &&
    missingRequiredEvidence(asset.media)
  )
    return [
      {
        ...base,
        id: `submission:${asset.id}:evidence`,
        reason: 'Add the required front and back evidence before submitting.',
        badge: 'Evidence needed',
        action: 'Add evidence',
      },
    ];
  if (asset.media.some((media) => media.status === 'REJECTED'))
    return [
      {
        ...base,
        id: `submission:${asset.id}:replace-evidence`,
        reason: 'Replace rejected evidence to continue the submission.',
        badge: 'Evidence needed',
        action: 'Replace evidence',
      },
    ];
  return [];
}

function stageCounts(assets: WorkspaceItem[]) {
  const counts = Object.fromEntries(
    pipeline.map((stage) => [stage, 0]),
  ) as Record<(typeof pipeline)[number], number>;
  for (const item of assets) counts[item.stage] += 1;
  return counts;
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

function nextActionFor(
  status: string,
  stage: WorkspaceStage,
  media: WorkspaceMedia[],
) {
  if (status === 'CHANGES_REQUESTED') return 'Review requested changes';
  if (status === 'DRAFT' && missingRequiredEvidence(media))
    return 'Add required evidence';
  if (status === 'DRAFT') return 'Finish your draft';
  if (stage === 'SUBMITTED' || stage === 'REVIEW')
    return 'Awaiting staff review';
  if (stage === 'VALUATION') return 'Valuation in progress';
  if (stage === 'CUSTODY') return 'Custody in progress';
  if (stage === 'VAULT_READY') return 'Awaiting market publication';
  return 'No action required';
}

function missingRequiredEvidence(media: WorkspaceMedia[]) {
  return !['front', 'back'].every((slot) =>
    media.some((item) => item.slot === slot && item.status === 'SAFE'),
  );
}

function collectorView(user: {
  createdAt: Date;
  profile: {
    displayName: string;
    publicUsername: string | null;
    countryCode: string;
  } | null;
  publicCollectorProfile: {
    slug: string;
    headline: string | null;
    specialism: string | null;
    isPublic: boolean;
  } | null;
}) {
  return {
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
  };
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
function declaredCardNumber(value: unknown) {
  const cardNumber = declaredMetadata(value).cardNumber;
  return typeof cardNumber === 'string' ? cardNumber : null;
}
function declaredGrader(value: unknown) {
  const grader = declaredMetadata(value).grader;
  return typeof grader === 'string' ? grader : null;
}
function declaredGrade(value: unknown) {
  const metadata = declaredMetadata(value);
  const grader = declaredGrader(value);
  const grade = typeof metadata.grade === 'string' ? metadata.grade : null;
  return grader && grade ? `${grader} ${grade}` : null;
}
function money(amountMinor: bigint) {
  return { amountMinor: amountMinor.toString(), currency: 'GBP' };
}
function sumMoney(amounts: string[]) {
  return amounts.reduce((total, amount) => total + BigInt(amount), 0n);
}
function friendlyMediaLabel(slot: string) {
  return `${slot.replaceAll('_', ' ')} evidence`;
}
function stageLabel(stage: WorkspaceStage) {
  return (
    {
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      REVIEW: 'In Review',
      VALUATION: 'Valuation',
      CUSTODY: 'Custody',
      VAULT_READY: 'Vault Ready',
      MARKET_LIVE: 'Market Live',
    } as const
  )[stage];
}
function activityTitle(action: string) {
  if (action.includes('MEDIA')) return 'Evidence updated';
  if (action.includes('SUBMISSION')) return 'Submission activity';
  if (action.includes('VALUATION')) return 'Valuation updated';
  if (action.includes('CUSTODY')) return 'Custody updated';
  if (action.includes('PUBLISHED')) return 'Market listing approved';
  if (action.includes('PROFILE')) return 'Profile updated';
  return 'Collector activity';
}
