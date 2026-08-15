import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  collectorPlanRegistry,
  collectorUsageFor,
  planJson,
} from './collector-entitlements';

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
  edition: string | null;
  set: string | null;
  cardNumber: string | null;
  certificationNumber: string | null;
  category: string | null;
  grader: string | null;
  grade: string | null;
  stage: WorkspaceStage;
  submissionStatus: string;
  version: number;
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
  intake: {
    id: string;
    status: string;
    intakeReference: string;
    vault: {
      id: string;
      displayName: string;
      region: string;
      countryCode: string;
      customerSafeAddress: string;
      shippingInstructions: string;
    };
    shipment: {
      carrier: string;
      trackingNumber: string;
      status: string;
      shippedAt: string;
      deliveredAt: string | null;
    } | null;
    receivedAt: string | null;
  } | null;
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

type CollectorRequestView = {
  id: string;
  type:
    | 'CHOOSE_VAULT'
    | 'ADD_REQUIRED_EVIDENCE'
    | 'CHANGES_REQUESTED'
    | 'ADD_TRACKING'
    | 'SHIPPING_EXCEPTION'
    | 'PROVIDE_INFORMATION';
  category: 'SUBMISSION' | 'SHIPPING' | 'INFORMATION';
  priority: 'BLOCKING' | 'IMPORTANT' | 'REMINDER';
  reason: string;
  badge: string;
  action: string;
  actionLabel: string;
  targetRoute: string;
  asset: WorkspaceItem;
  submissionId: string;
  collectibleId: string | null;
  destination: string;
  status: 'OPEN';
};

@Injectable()
export class CollectorWorkspaceService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config?: AppConfig,
  ) {}

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
    const activity = await this.activityFor(userId, submissions, notifications);
    const recentActivityCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
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
        type: request.type,
        category: request.category,
        priority: request.priority,
        action: request.action,
        actionLabel: request.actionLabel,
        targetRoute: request.targetRoute,
      })),
      actionSummary: {
        waitingOnYou: requests.length,
        inProgress: assets.filter((asset) =>
          [
            'SUBMITTED',
            'REVIEW',
            'VALUATION',
            'CUSTODY',
            'VAULT_READY',
          ].includes(asset.stage),
        ).length,
        completedRecently: activity.filter(
          (item) =>
            completedActivity(item.type) &&
            Date.parse(item.occurredAt) >= recentActivityCutoff,
        ).length,
      },
      activity,
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

  async subscription(userId: string) {
    await this.ensurePlans();
    const [plans, current] = await Promise.all([
      this.db.collectorPlan.findMany({
        where: { active: true },
        orderBy: { monthlyPriceMinor: 'asc' },
      }),
      this.db.collectorSubscription.findFirst({
        where: {
          userId,
          status: {
            in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END'],
          },
        },
        include: { plan: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const usage = await this.usageFor(
      userId,
      current?.plan.entitlements ?? null,
    );
    const billingConfigured = Boolean(
      current?.provider && current.provider !== 'STAGING_DEMO',
    );
    return {
      current: current
        ? {
            id: current.id,
            code: current.plan.code,
            displayName: current.plan.displayName,
            status: current.status,
            currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: current.cancelAtPeriodEnd,
            entitlements: current.plan.entitlements,
            provider: current.provider,
          }
        : null,
      plans: plans.map((plan) => ({
        code: plan.code,
        displayName: plan.displayName,
        monthlyPriceMinor: plan.monthlyPriceMinor.toString(),
        currency: plan.currency,
        entitlements: plan.entitlements,
        recommended: plan.code === 'PRO',
      })),
      usage,
      billing: {
        configured: billingConfigured,
        provider: billingConfigured ? (current?.provider ?? null) : null,
        paymentMethod: null,
        nextBillingDate: current?.currentPeriodEnd?.toISOString() ?? null,
      },
    };
  }

  async plans() {
    await this.ensurePlans();
    const plans = await this.db.collectorPlan.findMany({
      where: { active: true },
      orderBy: { monthlyPriceMinor: 'asc' },
    });
    return plans.map((plan) => ({
      id: plan.code,
      displayName: plan.displayName,
      monthlyPriceMinor: plan.monthlyPriceMinor.toString(),
      currency: plan.currency,
      billingInterval: 'month',
      entitlements: plan.entitlements,
      recommended: plan.code === 'PRO',
      availability: 'AVAILABLE',
    }));
  }

  async subscriptionAction(
    userId: string,
    action: 'CHECKOUT' | 'PORTAL' | 'CHANGE_PLAN' | 'CANCEL' | 'RESUME',
    planCode?: string,
  ): Promise<never> {
    // No billing provider is configured in this environment. Keeping these
    // commands backend-owned prevents the UI from ever fabricating payment or
    // subscription state; a provider webhook must be the source of truth.
    void userId;
    void planCode;
    throw new ServiceUnavailableException({
      code: 'BILLING_CONFIGURATION_REQUIRED',
      action,
      message:
        'Membership billing is temporarily unavailable. Please try again later.',
    });
  }

  async vaults() {
    return this.db.vaultIntakeLocation.findMany({
      // External collectors may only choose an operator-approved destination.
      // Existing internal test records remain available in the database but
      // are deliberately not exposed by this customer-facing projection.
      where: {
        active: true,
        intakeAvailable: true,
        operationallyApproved: true,
        acceptingShipments: true,
        environment: this.config?.appEnvironment ?? 'development',
      },
      orderBy: [{ countryCode: 'asc' }, { displayName: 'asc' }],
      select: {
        id: true,
        displayName: true,
        region: true,
        countryCode: true,
        acceptedCategories: true,
        shippingInstructions: true,
        customerSafeAddress: true,
      },
    });
  }

  async selectVault(userId: string, submissionId: string, vaultId: string) {
    const submission = await this.db.assetSubmission.findFirst({
      where: { id: submissionId, ownerUserId: userId },
      select: {
        id: true,
        status: true,
        categoryId: true,
        intake: { include: { shipment: true, vault: true } },
      },
    });
    if (!submission)
      throw new NotFoundException({
        code: 'COLLECTIBLE_NOT_FOUND',
        message: 'Collectible not found.',
      });
    if (submission.status !== 'APPROVED')
      throw new ConflictException({
        code: 'SUBMISSION_NOT_ACCEPTED',
        message:
          'A vault can only be selected after staff accepts the submission.',
      });
    if (submission.intake?.shipment)
      throw new ConflictException({
        code: 'SHIPMENT_ALREADY_STARTED',
        message: 'The destination cannot be changed after shipment starts.',
      });
    const vault = await this.db.vaultIntakeLocation.findFirst({
      where: {
        id: vaultId,
        active: true,
        intakeAvailable: true,
        operationallyApproved: true,
        acceptingShipments: true,
        environment: this.config?.appEnvironment ?? 'development',
      },
    });
    if (!vault)
      throw new NotFoundException({
        code: 'VAULT_NOT_AVAILABLE',
        message: 'That intake destination is no longer available.',
      });
    // An empty accepted-category list is the configured "all categories"
    // default for a general intake destination. Only a non-empty list should
    // restrict the destination to specific catalogue categories.
    const accepted =
      Array.isArray(vault.acceptedCategories) && vault.acceptedCategories.length
        ? vault.acceptedCategories
        : null;
    if (accepted && !accepted.includes(submission.categoryId))
      throw new ConflictException({
        code: 'VAULT_CATEGORY_UNSUPPORTED',
        message: 'That destination does not accept this category.',
      });
    return this.db.$transaction(async (db) => {
      const intake = await db.submissionIntake.upsert({
        where: { submissionId },
        create: {
          submissionId,
          vaultId,
          intakeReference: `SLICE-${submissionId.slice(-8).toUpperCase()}`,
          status: 'SHIPPING_REQUIRED',
        },
        update: {
          vaultId,
          status: 'SHIPPING_REQUIRED',
          updatedAt: new Date(),
        },
        include: { vault: true, shipment: true },
      });
      const previousVault = submission.intake?.vault;
      await db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: userId,
          actorType: 'USER',
          action: 'INTAKE_DESTINATION_SELECTED',
          resourceType: 'submission-intake',
          resourceId: intake.id,
          result: 'SUCCESS',
          metadata: {
            submissionId,
            intakeReference: intake.intakeReference,
            changed: previousVault?.id !== vault.id,
            previous: previousVault
              ? { id: previousVault.id, displayName: previousVault.displayName }
              : null,
            next: { id: vault.id, displayName: vault.displayName },
            reason:
              'Collector selected an operator-approved intake destination before shipment.',
          },
        },
      });
      return intake;
    });
  }

  async addShipment(
    userId: string,
    submissionId: string,
    input: {
      carrier: string;
      trackingNumber: string;
      shippedAt: string;
      notes?: string;
    },
  ) {
    const intake = await this.db.submissionIntake.findFirst({
      where: { submissionId, submission: { ownerUserId: userId } },
      include: { shipment: true, receipt: true },
    });
    if (!intake)
      throw new ConflictException({
        code: 'VAULT_SELECTION_REQUIRED',
        message: 'Choose an intake destination before adding shipment details.',
      });
    if (intake.receipt)
      throw new ConflictException({
        code: 'RECEIPT_ALREADY_CONFIRMED',
        message:
          'Shipment details cannot be changed after Slice confirms receipt.',
      });
    const carrier = input.carrier.trim();
    const trackingNumber = input.trackingNumber.trim();
    if (
      carrier.length < 2 ||
      carrier.length > 40 ||
      trackingNumber.length < 3 ||
      trackingNumber.length > 120
    )
      throw new ConflictException({
        code: 'SHIPMENT_DETAILS_INVALID',
        message: 'Enter a carrier and tracking reference.',
      });
    const shippedAt = new Date(input.shippedAt);
    if (Number.isNaN(shippedAt.getTime()))
      throw new ConflictException({
        code: 'SHIPMENT_DATE_INVALID',
        message: 'Enter a valid shipping date.',
      });
    return this.db.$transaction(async (db) => {
      await db.intakeShipment.upsert({
        where: { intakeId: intake.id },
        create: {
          intakeId: intake.id,
          carrier,
          trackingNumber,
          shippedAt,
          status: 'SHIPPED',
          notes: input.notes?.trim() || null,
        },
        update: {
          carrier,
          trackingNumber,
          shippedAt,
          status: 'SHIPPED',
          notes: input.notes?.trim() || null,
        },
      });
      return db.submissionIntake.update({
        where: { id: intake.id },
        data: { status: 'IN_TRANSIT', shippedAt },
        include: { vault: true, shipment: true },
      });
    });
  }

  async confirmReceipt(
    actorId: string,
    intakeId: string,
    actorRoles: string[],
  ) {
    if (!actorRoles.some((role) => ['ADMIN', 'ASSET_REVIEWER'].includes(role)))
      throw new ForbiddenException({
        code: 'RECEIPT_CONFIRMATION_REQUIRES_STAFF',
        message: 'Only Slice staff can confirm physical receipt.',
      });
    const intake = await this.db.submissionIntake.findUnique({
      where: { id: intakeId },
      include: { shipment: true },
    });
    if (!intake)
      throw new NotFoundException({
        code: 'INTAKE_NOT_FOUND',
        message: 'Intake record not found.',
      });
    if (!intake.shipment || intake.shipment.status !== 'DELIVERED')
      throw new ConflictException({
        code: 'DELIVERY_NOT_CONFIRMED',
        message: 'Confirm carrier delivery before recording Slice receipt.',
      });
    return this.db.$transaction(async (db) => {
      await db.intakeReceiptConfirmation.upsert({
        where: { intakeId },
        create: {
          intakeId,
          confirmedById: actorId,
          shipmentRef: intake.shipment?.trackingNumber,
        },
        update: {
          confirmedById: actorId,
          confirmedAt: new Date(),
          shipmentRef: intake.shipment?.trackingNumber,
        },
      });
      return db.submissionIntake.update({
        where: { id: intakeId },
        data: { status: 'RECEIVED', receivedAt: new Date() },
        include: { vault: true, shipment: true, receipt: true },
      });
    });
  }

  async updateShipmentStatus(
    actorRoles: string[],
    intakeId: string,
    status:
      'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'UNKNOWN',
  ) {
    if (!actorRoles.some((role) => ['ADMIN', 'ASSET_REVIEWER'].includes(role)))
      throw new ForbiddenException({
        code: 'SHIPMENT_STATUS_REQUIRES_STAFF',
        message: 'Only Slice staff can update carrier status.',
      });
    const shipment = await this.db.intakeShipment.findUnique({
      where: { intakeId },
    });
    if (!shipment)
      throw new NotFoundException({
        code: 'SHIPMENT_NOT_FOUND',
        message: 'Shipment not found.',
      });
    const deliveredAt =
      status === 'DELIVERED' ? new Date() : shipment.deliveredAt;
    await this.db.intakeShipment.update({
      where: { intakeId },
      data: { status, deliveredAt, lastCheckedAt: new Date() },
    });
    return this.db.submissionIntake.update({
      where: { id: intakeId },
      data: {
        status: status === 'DELIVERED' ? 'DELIVERED' : 'IN_TRANSIT',
        deliveredAt,
      },
      include: { vault: true, shipment: true, receipt: true },
    });
  }

  async deleteDraft(userId: string, submissionId: string, version: number) {
    const current = await this.db.assetSubmission.findFirst({
      where: { id: submissionId, ownerUserId: userId },
      select: { status: true, cancelledAt: true },
    });
    if (current?.status === 'CANCELLED' && current.cancelledAt) {
      return { submissionId, deleted: true, alreadyDeleted: true };
    }
    const result = await this.db.assetSubmission.updateMany({
      where: {
        id: submissionId,
        ownerUserId: userId,
        status: 'DRAFT',
        version,
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count !== 1)
      throw new ConflictException({
        code: 'DRAFT_DELETE_CONFLICT',
        message:
          'Only your current editable draft can be deleted. Refresh and try again.',
      });
    return { submissionId, deleted: true };
  }

  private async ensurePlans() {
    for (const config of collectorPlanRegistry)
      await this.db.collectorPlan.upsert({
        where: { code: config.code },
        create: {
          code: config.code,
          displayName: config.displayName,
          monthlyPriceMinor: config.monthlyPriceMinor,
          entitlements: planJson(config.entitlements),
        },
        update: {
          displayName: config.displayName,
          monthlyPriceMinor: config.monthlyPriceMinor,
          entitlements: planJson(config.entitlements),
          active: true,
        },
      });
  }

  private async usageFor(
    userId: string,
    entitlements: Prisma.JsonValue | null,
  ) {
    return collectorUsageFor(this.db, userId, entitlements);
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
    const requests = requestViews([asset]);
    return {
      asset,
      requests,
      lifecycle: lifecycleFor(asset, requests[0] ?? null),
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

  private async submissionsFor(userId: string) {
    const submissions = await this.db.assetSubmission.findMany({
      // Cancelled submissions are retained for audit/replay safety, but are
      // no longer part of the collector's active workspace projection.
      where: { ownerUserId: userId, status: { not: 'CANCELLED' } },
      include: workspaceSubmissionInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return submissions.filter(
      (submission) =>
        !isBetaFixtureSubmission(
          submission.declaredMetadata,
          submission.asset?.slug,
          this.config?.isBeta === true,
        ),
    );
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
    const auditActivity = auditEvents
      .map((item) => {
        const title = activityTitle(item.action);
        if (!title) return null;
        return {
          id: `activity:${item.id}`,
          type: item.action,
          title,
          detail:
            (item.resourceType === 'submission' && item.resourceId
              ? titles.get(item.resourceId)
              : item.resourceType === 'asset' && item.resourceId
                ? assetTitles.get(item.resourceId)
                : null) ?? '',
          occurredAt: item.createdAt.toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return [
      ...notifications.map((item) => ({
        id: `notification:${item.id}`,
        type: item.type,
        title: item.title,
        detail: item.body,
        occurredAt: item.createdAt.toISOString(),
      })),
      ...auditActivity,
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 12);
  }
}

function isBetaFixtureSubmission(
  metadata: Prisma.JsonValue | null,
  assetSlug: string | null | undefined,
  isBeta: boolean,
) {
  if (!isBeta) return false;
  if (assetSlug?.startsWith('slice-demo-')) return true;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const value = metadata as Record<string, unknown>;
  return (
    value.betaFixtureRetired === true ||
    (typeof value.certificationNumber === 'string' && value.certificationNumber.startsWith('STG-'))
  );
}

const workspaceSubmissionInclude = {
  intake: { include: { vault: true, shipment: true, receipt: true } },
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
    edition: asset?.edition ?? null,
    set: asset?.collectibleSet?.name ?? null,
    cardNumber:
      asset?.cardNumber ?? declaredCardNumber(submission.declaredMetadata),
    certificationNumber: asset?.certificationNumber ?? null,
    category: asset?.category?.name ?? null,
    grader:
      asset?.gradeScaleEntry?.company.code ??
      declaredGrader(submission.declaredMetadata),
    grade: asset?.gradeScaleEntry
      ? asset.gradeScaleEntry.grade.toFixed(2)
      : declaredGrade(submission.declaredMetadata),
    stage,
    submissionStatus: submission.status,
    version: submission.version,
    nextAction: nextActionFor(
      submission.status,
      stage,
      media,
      submission.intake,
    ),
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
    intake: submission.intake
      ? {
          id: submission.intake.id,
          status: submission.intake.status,
          intakeReference: submission.intake.intakeReference,
          vault: {
            id: submission.intake.vault.id,
            displayName: submission.intake.vault.displayName,
            region: submission.intake.vault.region,
            countryCode: submission.intake.vault.countryCode,
            customerSafeAddress: submission.intake.vault.customerSafeAddress,
            shippingInstructions: submission.intake.vault.shippingInstructions,
          },
          shipment: submission.intake.shipment
            ? {
                carrier: submission.intake.shipment.carrier,
                trackingNumber: submission.intake.shipment.trackingNumber,
                status: submission.intake.shipment.status,
                shippedAt: submission.intake.shipment.shippedAt.toISOString(),
                deliveredAt:
                  submission.intake.shipment.deliveredAt?.toISOString() ?? null,
              }
            : null,
          receivedAt: submission.intake.receivedAt?.toISOString() ?? null,
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

function requestViews(assets: WorkspaceItem[]): CollectorRequestView[] {
  const priority = { BLOCKING: 0, IMPORTANT: 1, REMINDER: 2 } as const;
  return assets
    .flatMap((asset) => requestFor(asset))
    .sort(
      (a, b) =>
        priority[a.priority] - priority[b.priority] ||
        b.asset.updatedAt.localeCompare(a.asset.updatedAt),
    );
}

function requestFor(asset: WorkspaceItem): CollectorRequestView[] {
  // A published/secured asset has already completed its intake journey. Do
  // not surface a stale pre-intake action from the original submission.
  if (
    asset.market.isLive ||
    asset.stage === 'MARKET_LIVE' ||
    asset.stage === 'VAULT_READY'
  )
    return [];
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
        type: 'CHANGES_REQUESTED' as const,
        category: 'SUBMISSION' as const,
        priority: 'BLOCKING' as const,
        reason: 'Staff requested changes before review can continue.',
        badge: 'Action required',
        action: 'Review changes',
        actionLabel: 'Review changes',
        targetRoute: 'submission',
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
        type: 'ADD_REQUIRED_EVIDENCE' as const,
        category: 'SUBMISSION' as const,
        priority: 'REMINDER' as const,
        reason: 'Add the required front and back evidence before submitting.',
        badge: 'Evidence needed',
        action: 'Add photos',
        actionLabel: 'Add photos',
        targetRoute: 'media',
      },
    ];
  if (asset.media.some((media) => media.status === 'REJECTED'))
    return [
      {
        ...base,
        id: `submission:${asset.id}:replace-evidence`,
        type: 'ADD_REQUIRED_EVIDENCE' as const,
        category: 'SUBMISSION' as const,
        priority: 'BLOCKING' as const,
        reason: 'Replace rejected evidence to continue the submission.',
        badge: 'Evidence needed',
        action: 'Add photos',
        actionLabel: 'Add photos',
        targetRoute: 'media',
      },
    ];
  if (asset.submissionStatus === 'APPROVED' && !asset.intake)
    return [
      {
        ...base,
        id: `submission:${asset.id}:vault`,
        type: 'CHOOSE_VAULT' as const,
        category: 'SHIPPING' as const,
        priority: 'BLOCKING' as const,
        reason:
          'Your submission was accepted. Choose an intake destination to continue.',
        badge: 'Choose vault',
        action: 'Choose vault',
        actionLabel: 'Choose vault',
        targetRoute: 'custody',
      },
    ];
  if (asset.intake?.status === 'SHIPPING_REQUIRED' && !asset.intake.shipment)
    return [
      {
        ...base,
        id: `submission:${asset.id}:shipping`,
        type: 'ADD_TRACKING' as const,
        category: 'SHIPPING' as const,
        priority: 'BLOCKING' as const,
        reason:
          'Your approved collectible is ready. When the package is physically sent, add the carrier and tracking details.',
        badge: 'Ship your collectible',
        action: 'Ship your collectible',
        actionLabel: 'Ship your collectible',
        targetRoute: 'custody',
      },
    ];
  return [];
}

function lifecycleFor(
  asset: WorkspaceItem,
  action: CollectorRequestView | null,
) {
  const hasIntake = Boolean(asset.intake);
  const hasShipment = Boolean(asset.intake?.shipment);
  const hasReceived =
    Boolean(asset.intake?.receivedAt) ||
    ['RECEIVED', 'INSPECTED', 'SECURED'].includes(asset.custody?.status ?? '');
  const hasVerified =
    ['INSPECTED', 'SECURED'].includes(asset.custody?.status ?? '') ||
    ['VAULT_READY', 'MARKET_LIVE'].includes(asset.stage);
  const hasValuation = Boolean(asset.valuation.supportedValue);
  const hasVaultReady = ['VAULT_READY', 'MARKET_LIVE'].includes(asset.stage);
  const hasMarket = asset.market.isLive || asset.stage === 'MARKET_LIVE';
  const submitted = asset.submissionStatus !== 'DRAFT';
  const accepted =
    [
      'APPROVED',
      'REVIEW',
      'VALUATION',
      'CUSTODY',
      'VAULT_READY',
      'MARKET_LIVE',
    ].includes(asset.submissionStatus) ||
    ['VALUATION', 'CUSTODY', 'VAULT_READY', 'MARKET_LIVE'].includes(
      asset.stage,
    );
  const actionStep =
    action?.type === 'CHOOSE_VAULT'
      ? 'vault'
      : action?.type === 'ADD_TRACKING'
        ? 'shipped'
        : action?.type === 'ADD_REQUIRED_EVIDENCE' ||
            action?.type === 'CHANGES_REQUESTED'
          ? 'submitted'
          : null;
  const completed = (done: boolean, id: string) => ({
    id,
    status: done ? ('COMPLETED' as const) : ('UPCOMING' as const),
    // updatedAt is not an event timestamp; only real event records should
    // populate lifecycle dates.
    occurredAt: null,
  });
  const steps = [
    {
      ...completed(submitted && actionStep !== 'submitted', 'submitted'),
      label: 'Submitted',
    },
    {
      ...completed(accepted && actionStep !== 'submitted', 'accepted'),
      label: 'Accepted',
    },
    {
      ...completed(hasIntake && actionStep !== 'vault', 'vault'),
      label: hasIntake ? 'Vault selected' : 'Choose vault',
    },
    {
      ...completed(hasShipment && actionStep !== 'shipped', 'shipped'),
      label: 'Shipped',
    },
    { ...completed(hasReceived, 'received'), label: 'Received' },
    { ...completed(hasVerified, 'verified'), label: 'Verified' },
    { ...completed(hasValuation, 'valued'), label: 'Valued' },
    { ...completed(hasVaultReady, 'vault-ready'), label: 'Vault ready' },
    { ...completed(hasMarket, 'market-live'), label: 'Market live' },
  ];
  const currentIndex = actionStep
    ? Math.max(
        0,
        steps.findIndex((step) => step.id === actionStep),
      )
    : asset.stage === 'DRAFT'
      ? 0
      : asset.stage === 'SUBMITTED' || asset.stage === 'REVIEW'
        ? 1
        : asset.stage === 'VALUATION'
          ? 6
          : asset.stage === 'CUSTODY'
            ? hasReceived
              ? 5
              : 3
            : asset.stage === 'VAULT_READY'
              ? 7
              : 8;
  const current = steps[currentIndex];
  const normalizedSteps = steps.map((step, index) => ({
    ...step,
    status:
      action && index === currentIndex
        ? ('ACTION_REQUIRED' as const)
        : index === currentIndex
          ? ('CURRENT' as const)
          : step.status,
  }));
  const approvedAwaitingShipment =
    asset.submissionStatus === 'APPROVED' &&
    asset.intake?.status === 'SHIPPING_REQUIRED' &&
    !asset.intake.shipment;
  const currentLabel =
    asset.submissionStatus === 'APPROVED'
      ? 'Approved'
      : action?.actionLabel ??
        (asset.stage === 'MARKET_LIVE' ? 'Market Live' : stageLabel(asset.stage));
  const currentDetail =
    asset.submissionStatus === 'APPROVED' && approvedAwaitingShipment
      ? 'Your submission was approved. Ship the physical collectible when you are ready, then add carrier and tracking details.'
      : action?.reason ??
        (hasMarket
          ? 'Your collectible is verified, held in Slice custody, and currently available through the marketplace.'
          : asset.stage === 'DRAFT'
            ? 'Finish your collectible submission when you are ready.'
            : 'Slice is moving your collectible through the authenticated workflow. No action is required from you right now.');
  const nextMilestone = action
    ? { label: action.actionLabel, detail: action.reason }
    : hasMarket
      ? {
          label: 'Ongoing',
          detail:
            "Your collectible is live on the marketplace. We'll notify you of any major updates.",
        }
      : asset.stage === 'CUSTODY'
        ? {
            label: hasReceived ? 'Verification' : 'Slice receipt confirmation',
            detail:
              'Slice will update the next milestone as the physical workflow progresses.',
          }
        : asset.stage === 'VALUATION'
          ? {
              label: 'Valuation',
              detail:
                'Slice is preparing the supported valuation for your collectible.',
            }
          : {
              label: current?.label ?? 'Workflow update',
              detail: 'We will notify you when the next milestone is reached.',
            };
  return {
    currentStage: asset.stage,
    currentStatus: action ? ('ACTION_REQUIRED' as const) : ('CURRENT' as const),
    currentLabel,
    currentDetail,
    nextMilestone,
    action: action
      ? {
          type: action.type,
          label: action.actionLabel,
          detail: action.reason,
          targetRoute: action.targetRoute,
        }
      : null,
    steps: normalizedSteps,
  };
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
  intake: WorkspaceSubmission['intake'],
) {
  if (status === 'CHANGES_REQUESTED') return 'Review requested changes';
  if (status === 'DRAFT' && missingRequiredEvidence(media))
    return 'Add required evidence';
  if (status === 'DRAFT') return 'Finish your draft';
  if (status === 'APPROVED' && !intake) return 'Choose an intake destination';
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
    avatarReference: string | null;
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
    avatarReference: user.profile?.avatarReference ?? null,
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
function activityTitle(action: string): string | null {
  if (action.includes('ACCEPT')) return 'Submission accepted';
  if (action.includes('VAULT')) return 'Vault selected';
  if (action.includes('TRACK')) return 'Tracking added';
  if (action.includes('CHANGES')) return 'Changes requested';
  if (action.includes('MEDIA')) return 'Photos uploaded';
  if (action.includes('RECEIPT')) return 'Received by Slice';
  if (action.includes('VERIF')) return 'Verification completed';
  if (action.includes('VALUATION')) return 'Valuation updated';
  if (action.includes('PUBLISHED')) return 'Market published';
  if (action.includes('CUSTODY')) return 'Custody updated';
  if (action.includes('PROFILE')) return 'Profile updated';
  if (action.includes('SUBMISSION')) return 'Submission updated';
  return null;
}

function completedActivity(action: string) {
  return ['VAULT', 'TRACK', 'RECEIPT', 'VERIF', 'PUBLISHED', 'ACCEPT'].some(
    (token) => action.includes(token),
  );
}
