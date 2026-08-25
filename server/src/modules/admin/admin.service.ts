import {
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../identity/auth/auth.service';
import { AuthorizationService } from '../identity/access/authorization.service';
import { evaluatePolicy } from '../identity/domain/policy';
import {
  collectorUsageForMany,
} from '../collector-workspace/collector-entitlements';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { isBetaFixtureSlug } from '../../config/beta-policy';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../submissions/ports/submission-storage.ports';
import { OwnershipPolicyService } from '../ownership/application/ownership-policy.service';
import { deriveMarketLifecycle } from '../market-lifecycle/domain/market-lifecycle';
import { PlatformRevenueSettlementService } from '../finance/application/platform-revenue-settlement.service';
import { WithdrawalPreflightService } from '../providers/application/withdrawal-preflight.service';

type AdminAttention = {
  id: string;
  type: string;
  subject: string;
  collector: string;
  stage: string;
  reason: string;
  age: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  waitingOn: 'COLLECTOR' | 'SLICE';
  target: 'reviews' | 'intake' | 'valuations' | 'custody';
};

/** Demo submissions remain auditable, but are not real beta intake records. */
function isBetaFixtureSubmission(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const value = metadata as Record<string, unknown>;
  return (
    value.betaFixtureRetired === true ||
    (typeof value.certificationNumber === 'string' && value.certificationNumber.startsWith('STG-'))
  );
}

function ageLabel(updatedAt: Date) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - updatedAt.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function attention(
  id: string,
  type: string,
  subject: string,
  collector: string,
  stage: string,
  reason: string,
  age: string,
  severity: AdminAttention['severity'],
  waitingOn: AdminAttention['waitingOn'],
  target: AdminAttention['target'],
): AdminAttention {
  return {
    id,
    type,
    subject,
    collector,
    stage,
    reason,
    age,
    severity,
    waitingOn,
    target,
  };
}

function intakeStage(item: {
  status: string;
  intake: {
    status: string;
    shipment: { status: string } | null;
    receipt: unknown;
  } | null;
}) {
  if (!item.intake)
    return item.status === 'APPROVED' ? 'ACCEPTED_AWAITING_VAULT' : item.status;
  if (item.intake.shipment?.status === 'EXCEPTION') return 'EXCEPTION';
  if (item.intake.shipment?.status === 'DELIVERED' && !item.intake.receipt)
    return 'DELIVERED_AWAITING_RECEIPT';
  if (
    item.intake.shipment &&
    ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(
      item.intake.shipment.status,
    )
  )
    return 'IN_TRANSIT';
  if (item.intake.status === 'COMPLETE') return 'VAULT_READY';
  if (item.intake.status === 'RECEIVED') return 'RECEIVED';
  if (item.intake.status === 'VERIFICATION') return 'VERIFICATION';
  if (
    ['SHIPPING_REQUIRED', 'VAULT_SELECTED', 'ACCEPTED_AWAITING_VAULT'].includes(
      item.intake.status,
    )
  )
    return 'ACCEPTED_AWAITING_VAULT';
  return item.intake.status;
}

function nextIntakeAction(intake: {
  status: string;
  shipment: { status: string } | null;
  receipt: unknown;
}) {
  if (!intake.shipment) return 'Collector needs to add tracking';
  if (intake.shipment.status === 'DELIVERED' && !intake.receipt)
    return 'Staff needs to confirm receipt';
  if (intake.status === 'VERIFICATION') return 'Begin verification';
  if (intake.status === 'RECEIVED') return 'Begin verification';
  if (intake.status === 'COMPLETE') return 'No action required';
  return 'Monitor shipment';
}

function stageLabel(stage: string) {
  return stage
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function intakeCounts(items: Array<{ stage: string }>) {
  return {
    all: items.length,
    accepted: items.filter((item) =>
      [
        'ACCEPTED_AWAITING_VAULT',
        'VAULT_SELECTED',
        'SHIPPING_REQUIRED',
      ].includes(item.stage),
    ).length,
    shipped: items.filter((item) =>
      ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(item.stage),
    ).length,
    delivered: items.filter(
      (item) => item.stage === 'DELIVERED_AWAITING_RECEIPT',
    ).length,
    received: items.filter((item) =>
      ['RECEIVED', 'VERIFICATION'].includes(item.stage),
    ).length,
    verified: items.filter((item) => item.stage === 'VERIFIED').length,
    readyForVault: items.filter((item) => item.stage === 'VAULT_READY').length,
    exceptions: items.filter((item) => item.stage === 'EXCEPTION').length,
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly authorization: AuthorizationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly ownershipPolicy: OwnershipPolicyService,
    private readonly platformRevenue: PlatformRevenueSettlementService,
    private readonly withdrawalPreflight: WithdrawalPreflightService,
  ) {}

  async setCollectorFeatured(
    actor: Actor,
    slug: string,
    featured: boolean,
    requestId: string,
  ) {
    await this.authorization.authorize(actor, 'catalogue.manage');
    const profile = await this.db.publicCollectorProfile.findUnique({
      where: { slug },
      select: {
        userId: true,
        slug: true,
        isFeatured: true,
        featuredAt: true,
        user: {
          select: {
            accountStatus: true,
            roleAssignments: {
              where: { role: 'COLLECTOR', revokedAt: null },
              select: { id: true },
            },
          },
        },
      },
    });
    if (
      !profile ||
      profile.user.accountStatus !== 'ACTIVE' ||
      profile.user.roleAssignments.length === 0
    )
      throw new NotFoundException({
        code: 'COLLECTOR_NOT_FOUND',
        message: 'Active Collector profile not found.',
      });
    const updated = await this.db.$transaction(async (tx) => {
      const nextFeaturedAt = featured ? new Date() : null;
      const updatedProfile = await tx.publicCollectorProfile.update({
        where: { slug },
        data: { isFeatured: featured, featuredAt: nextFeaturedAt },
        select: { slug: true, isFeatured: true, featuredAt: true },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          actorType: 'USER',
          action: featured ? 'COLLECTOR_FEATURED' : 'COLLECTOR_UNFEATURED',
          resourceType: 'public-collector-profile',
          resourceId: profile.userId,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata: {
            targetUserId: profile.userId,
            slug,
            previousFeatured: profile.isFeatured,
            previousFeaturedAt: profile.featuredAt?.toISOString() ?? null,
            newFeatured: updatedProfile.isFeatured,
            newFeaturedAt: updatedProfile.featuredAt?.toISOString() ?? null,
          },
        },
      });
      return updatedProfile;
    });
    return {
      slug: updated.slug,
      isFeatured: updated.isFeatured,
      featuredAt: updated.featuredAt?.toISOString() ?? null,
    };
  }

  async overview(actor: Actor) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const [
      activeUsers,
      pendingReviews,
      changesRequested,
      valuationPending,
      custodyActions,
      vaultReady,
      complianceCases,
      paymentExceptions,
      providerAlerts,
    ] = await this.db.$transaction([
      this.db.user.count({ where: { accountStatus: 'ACTIVE' } }),
      this.db.assetSubmission.count({
        where: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } },
      }),
      this.db.assetSubmission.count({ where: { status: 'CHANGES_REQUESTED' } }),
      this.db.asset.count({
        where: {
          valuationDecisions: { none: {} },
          status: { not: 'ARCHIVED' },
        },
      }),
      this.db.asset.count({
        where: { custodyRecord: { is: null }, status: { not: 'ARCHIVED' } },
      }),
      this.db.asset.count({
        where: {
          custodyRecord: { status: 'SECURED' },
          status: { not: 'ARCHIVED' },
        },
      }),
      this.db.complianceCase.count({
        where: {
          status: { in: ['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'SUSPENDED'] },
        },
      }),
      this.db.moneyMovement.count({
        where: { status: { in: ['FAILED', 'MANUAL_REVIEW', 'HELD'] } },
      }),
      this.db.providerIncident.count({ where: { status: 'OPEN' } }),
    ]);
    return {
      users: { active: activeUsers },
      reviews: { pending: pendingReviews, changesRequested },
      assets: { valuationPending, custodyActions, vaultReady },
      complianceCases,
      paymentExceptions,
      providerAlerts,
      generatedAt: new Date().toISOString(),
    };
  }

  async riskOperations(actor: Actor) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const [
      movements,
      wallets,
      reservations,
      reconciliation,
      audits,
      webhooks,
      incidents,
      notificationFailures,
      marketSnapshots,
      activeMarketSnapshots,
      preGradeRuns,
      priceChartingMappings,
      priceChartingNeedsMapping,
      confirmedSubmissionResearch,
    ] = await this.db.$transaction([
      this.db.moneyMovement.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        include: {
          user: {
            select: {
              profile: { select: { displayName: true, publicUsername: true } },
            },
          },
        },
      }),
      this.db.financialAccount.findMany({
        where: { ownerType: 'USER' },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: {
          owner: {
            select: {
              profile: { select: { displayName: true, publicUsername: true } },
            },
          },
          balance: true,
        },
      }),
      this.db.cashReservation.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          account: {
            select: {
              currency: true,
              owner: {
                select: {
                  profile: {
                    select: { displayName: true, publicUsername: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.db.financialReconciliationRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.db.auditEvent.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        include: {
          actor: {
            select: {
              profile: { select: { displayName: true, publicUsername: true } },
            },
          },
        },
      }),
      this.db.webhookInbox.findMany({
        where: { status: { in: ['FAILED', 'REJECTED'] } },
        orderBy: { receivedAt: 'desc' },
        take: 50,
      }),
      this.db.providerIncident.findMany({
        where: { status: 'OPEN' },
        select: { provider: true },
      }),
      this.db.notificationDelivery.count({
        where: {
          status: { in: ['FAILED', 'DEAD_LETTER'] },
          ...(this.config.isBeta ? { channel: { not: 'DISCORD' as const } } : {}),
        },
      }),
      this.db.assetMarketSnapshot.count({
        where: {
          source: { not: 'EXTERNAL_MARKET_REFERENCE' },
          markSource: { not: 'EXTERNAL_REFERENCE_FALLBACK' },
        },
      }),
      this.db.assetMarketSnapshot.count({
        where: this.config.isBeta
          ? {
              source: { not: 'EXTERNAL_MARKET_REFERENCE' },
              markSource: { not: 'EXTERNAL_REFERENCE_FALLBACK' },
              asset: {
                status: 'PUBLISHED',
                slug: { not: { startsWith: 'slice-demo-' } },
              },
            }
          : {
              source: { not: 'EXTERNAL_MARKET_REFERENCE' },
              markSource: { not: 'EXTERNAL_REFERENCE_FALLBACK' },
            },
      }),
      this.db.rawCardPreGrade.findMany({ orderBy: { updatedAt: 'desc' }, take: 20, select: { status: true, updatedAt: true } }),
      this.db.marketProviderMapping.findMany({
        where: { providerCode: 'PRICECHARTING' },
        select: {
          status: true,
          lastSuccessAt: true,
          lastFailureAt: true,
          lastFailureCode: true,
          asset: {
            select: {
              slug: true,
              status: true,
              marketSnapshots: {
                orderBy: [{ asOf: 'desc' }, { id: 'desc' }],
                take: 1,
                select: { freshness: true, asOf: true },
              },
            },
          },
        },
      }),
      this.db.asset.count({
        where: {
          status: 'PUBLISHED',
          ...(this.config.isBeta
            ? { slug: { not: { startsWith: 'slice-demo-' } } }
            : {}),
          marketProviderMappings: {
            none: { providerCode: 'PRICECHARTING' },
          },
        },
      }),
      this.db.submissionMarketResearch.findMany({
        where: {
          observations: {
            some: {
              providerCode: 'PRICECHARTING',
              matchQuality: 'EXACT',
              includedInSnapshot: true,
            },
          },
        },
        select: { submission: { select: { assetId: true } } },
      }),
    ]);
    const approvedIntakeDestinations = await this.db.vaultIntakeLocation.count({
      where: {
        active: true,
        intakeAvailable: true,
        operationallyApproved: true,
        acceptingShipments: true,
        environment: this.config.appEnvironment ?? 'development',
      },
    });
    const incidentCounts = new Map<string, number>();
    for (const incident of incidents)
      incidentCounts.set(
        incident.provider,
        (incidentCounts.get(incident.provider) ?? 0) + 1,
      );
    const dbCheckedAt = new Date().toISOString();
    const refreshSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [refreshQueued, refreshProcessing, refreshFailed, refreshCompleted24h, persistedReferences] = await Promise.all([
      this.db.marketRefreshJob.count({ where: { status: 'QUEUED' } }),
      this.db.marketRefreshJob.count({ where: { status: 'PROCESSING' } }),
      this.db.marketRefreshJob.count({ where: { status: 'FAILED' } }),
      this.db.marketRefreshJob.count({ where: { status: 'COMPLETED', completedAt: { gte: refreshSince } } }),
      this.db.marketObservation.count({ where: { providerCode: 'PRICECHARTING', included: true } }),
    ]);
    const activePriceChartingMappings = this.config.isBeta
      ? priceChartingMappings.filter(
          (mapping) =>
            mapping.asset.status === 'PUBLISHED' &&
            !mapping.asset.slug.startsWith('slice-demo-'),
        )
      : priceChartingMappings;
    const retiredDemoPriceChartingMappings = priceChartingMappings.filter(
      (mapping) => !activePriceChartingMappings.includes(mapping),
    );
    const confirmedSubmissionReferenceCount = confirmedSubmissionResearch.length;
    const awaitingAssetPromotionCount = confirmedSubmissionResearch.filter(
      (research) => research.submission?.assetId == null,
    ).length;
    const priceChartingConfigured = Boolean(
      this.config.priceChartingEnabled && this.config.priceChartingApiToken,
    );
    const priceChartingFresh = activePriceChartingMappings.filter(
      (mapping) => mapping.lastSuccessAt && Date.now() - mapping.lastSuccessAt.getTime() <= 24 * 60 * 60 * 1000,
    ).length;
    const priceChartingStale = activePriceChartingMappings.filter((mapping) =>
      !mapping.lastSuccessAt || Date.now() - mapping.lastSuccessAt.getTime() > 24 * 60 * 60 * 1000,
    ).length;
    const priceChartingFailures = activePriceChartingMappings.filter(
      (mapping) =>
        mapping.lastFailureAt &&
        (!mapping.lastSuccessAt || mapping.lastFailureAt > mapping.lastSuccessAt),
    );
    const latestPriceSuccess = activePriceChartingMappings
      .map((mapping) => mapping.lastSuccessAt)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const latestPriceFailure = activePriceChartingMappings
      .map((mapping) => mapping.lastFailureAt)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const priceChartingStatus = priceChartingConfigured
      ? priceChartingFailures.length
        ? ('Degraded' as const)
        : ('Operational' as const)
      : ('NOT_CONFIGURED' as const);
    const priceChartingSummary = [
      priceChartingConfigured ? 'Configured' : 'Not configured',
      `last success ${latestPriceSuccess?.toISOString() ?? 'never'}`,
      `last failure ${latestPriceFailure?.toISOString() ?? 'never'}`,
      `mapped ${activePriceChartingMappings.length}`,
      `retired/demo ${retiredDemoPriceChartingMappings.length}`,
      `fresh ${priceChartingFresh}`,
      `stale ${priceChartingStale}`,
      `needs mapping ${priceChartingNeedsMapping}`,
      `refresh queued ${refreshQueued}`,
      `processing ${refreshProcessing}`,
      `failed ${refreshFailed}`,
      `completed 24h ${refreshCompleted24h}`,
      `references ${persistedReferences}`,
      `confirmed submissions ${confirmedSubmissionReferenceCount}`,
      `awaiting asset promotion ${awaitingAssetPromotionCount}`,
    ].join(' · ');
    const durableStorageConfigured =
      this.config.objectStorageProvider === 'S3_COMPATIBLE' &&
      Boolean(this.config.objectStorageBucket);
    const durableStorageOperational = durableStorageConfigured && Boolean(this.config.objectStorageLastProbeAt);
    const storageSummary = durableStorageOperational
      ? `S3-compatible durable storage operational · last successful probe ${this.config.objectStorageLastProbeAt!.toISOString()}`
      : durableStorageConfigured
        ? 'S3-compatible durable storage configured · health probe not exercised'
      : 'LOCAL_ONLY · Configure durable object storage before inviting external Beta collectors.';
    const integration = (
      name: string,
      configured: boolean,
      summary: string,
      failedEvents = 0,
    ) => ({
      name,
      configured,
      failedEvents,
      summary,
      status: failedEvents
        ? ('Degraded' as const)
        : configured
          ? ('Unknown' as const)
          : (this.config.isBeta ? ('BETA_DISABLED' as const) : ('NOT_CONFIGURED' as const)),
    });
    return {
      finance: {
        movements: movements.map((movement) => ({
          id: movement.id,
          user: {
            displayName: movement.user.profile?.displayName ?? 'Unnamed user',
            username: movement.user.profile?.publicUsername ?? null,
          },
          type: movement.type,
          amountMinor: movement.amountMinor.toString(),
          currency: movement.currency,
          provider: movement.provider,
          status: movement.status,
          referenceAvailable: Boolean(movement.providerReferenceHash),
          createdAt: movement.createdAt.toISOString(),
          updatedAt: movement.updatedAt.toISOString(),
        })),
        wallets: wallets.map((wallet) => {
          const balance = wallet.balance;
          const gross = balance
            ? wallet.normalSide === 'DEBIT'
              ? balance.postedDebitMinor - balance.postedCreditMinor
              : balance.postedCreditMinor - balance.postedDebitMinor
            : 0n;
          const reserved = balance?.reservedMinor ?? 0n;
          return {
            id: wallet.id,
            owner:
              wallet.owner?.profile?.displayName ??
              wallet.owner?.profile?.publicUsername ??
              'Unnamed user',
            availableMinor: (gross - reserved).toString(),
            reservedMinor: reserved.toString(),
            currency: wallet.currency,
            status: wallet.status,
            updatedAt: (balance?.updatedAt ?? wallet.updatedAt).toISOString(),
          };
        }),
        reservations: reservations.map((reservation) => ({
          id: reservation.id,
          owner:
            reservation.account.owner?.profile?.displayName ??
            reservation.account.owner?.profile?.publicUsername ??
            'Unnamed user',
          amountMinor: reservation.amountMinor.toString(),
          currency: reservation.account.currency,
          purposeType: reservation.purposeType,
          status: reservation.status,
          createdAt: reservation.createdAt.toISOString(),
        })),
        reconciliation: reconciliation.map((run) => ({
          id: run.id,
          scope: run.scope,
          status: run.status,
          currency: run.currency,
          debitMinor: run.debitMinor.toString(),
          creditMinor: run.creditMinor.toString(),
          mismatchCodes: mismatchCodes(run.mismatchCodes),
          createdAt: run.createdAt.toISOString(),
        })),
      },
      system: [
        {
          name: 'API',
          status: 'Operational' as const,
          summary: 'Admin API request completed.',
          lastCheckedAt: dbCheckedAt,
        },
        {
          name: 'PostgreSQL',
          status: 'Operational' as const,
          summary: 'Database projection query completed.',
          lastCheckedAt: dbCheckedAt,
        },
        {
          name: 'Notifications',
          status: notificationFailures
            ? ('Degraded' as const)
            : this.config.isBeta
              ? ('BETA_DISABLED' as const)
              : ('UNKNOWN' as const),
          summary: notificationFailures
            ? `${notificationFailures} failed deliveries require review.`
            : 'No current failure telemetry.',
          lastCheckedAt: dbCheckedAt,
        },
        {
          name: 'Market data',
          status: priceChartingStatus,
          summary: marketSnapshots
             ? `${activeMarketSnapshots} active Slice snapshots (${marketSnapshots} persisted total). ${priceChartingSummary}`
            : `No market snapshots. ${priceChartingSummary}`,
          lastCheckedAt: dbCheckedAt,
        },
        {
          name: 'Storage',
          status: durableStorageOperational ? ('Operational' as const) : durableStorageConfigured ? ('CONFIGURED_NOT_EXERCISED' as const) : ('LOCAL_ONLY' as const),
          summary: storageSummary,
          lastCheckedAt: dbCheckedAt,
        },
        {
          name: 'Intake Operations',
          status: approvedIntakeDestinations ? ('Operational' as const) : ('NO_APPROVED_DESTINATION' as const),
          summary: approvedIntakeDestinations
            ? `${approvedIntakeDestinations} approved receiving destination(s) available.`
            : 'Approve a real intake destination before collectors can ship items.',
          lastCheckedAt: dbCheckedAt,
        },
        {
          name: 'Webhooks',
          status: webhooks.length
            ? ('Degraded' as const)
            : ('Unknown' as const),
          summary: webhooks.length
            ? `${webhooks.length} failed webhook events require review.`
            : 'No failed webhook events currently need attention.',
          lastCheckedAt: dbCheckedAt,
        },
      ],
      audit: audits.map((entry) => ({
        id: entry.id,
        actor:
          entry.actor?.profile?.displayName ??
          entry.actor?.profile?.publicUsername ??
          (entry.actorType === 'SYSTEM' ? 'System' : 'Unknown actor'),
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        result: entry.result,
        createdAt: entry.createdAt.toISOString(),
      })),
      integrations: [
        {
          name: 'Ximilar',
          configured: Boolean(this.config.ximilarEnabled && this.config.ximilarCardGradingEnabled && this.config.ximilarApiToken),
          failedEvents: preGradeRuns.filter((run) => ['FAILED', 'TEMPORARILY_UNAVAILABLE'].includes(run.status)).length,
          summary: this.config.ximilarEnabled && this.config.ximilarCardGradingEnabled && this.config.ximilarApiToken
            ? `Raw card AI Pre-Grade is configured${preGradeRuns[0] && preGradeRuns[0].status !== 'NOT_CONFIGURED' ? ` · last ${preGradeRuns[0].status.toLowerCase().replaceAll('_', ' ')}` : ' · not yet exercised'}.`
            : 'Optional raw card AI Pre-Grade is not configured.',
          status: preGradeRuns.some((run) => ['FAILED', 'TEMPORARILY_UNAVAILABLE'].includes(run.status))
            ? ('Degraded' as const)
            : this.config.ximilarEnabled && this.config.ximilarCardGradingEnabled && this.config.ximilarApiToken
              ? ('Operational' as const)
              : ('Unavailable' as const),
        },
        {
          name: 'Storage',
          configured: durableStorageConfigured,
          failedEvents: 0,
          summary: storageSummary,
          status: durableStorageOperational ? ('Operational' as const) : durableStorageConfigured ? ('CONFIGURED_NOT_EXERCISED' as const) : ('LOCAL_ONLY' as const),
          provider: this.config.objectStorageProvider,
          signedUpload: durableStorageConfigured,
          signedDownload: durableStorageConfigured,
        },
        {
          name: 'Intake Operations',
          configured: false,
          failedEvents: 0,
          summary: approvedIntakeDestinations
            ? `${approvedIntakeDestinations} approved receiving destination(s) available.`
            : 'Approve a real intake destination before collectors can ship items.',
          status: approvedIntakeDestinations ? ('Operational' as const) : ('NO_APPROVED_DESTINATION' as const),
        },
        integration(
          'External provider boundary',
          false,
          'Stripe integration is prepared but not enabled in this release.',
          (incidentCounts.get('STRIPE_SANDBOX') ?? 0) +
            (incidentCounts.get('STRIPE_LIVE') ?? 0),
        ),
        integration(
          'BlockchainAnalysis.io',
          false,
          incidentCounts.get('BLOCKCHAIN_ANALYSIS')
            ? 'Open provider incident.'
            : 'Provider configuration is not exposed in Admin.',
          incidentCounts.get('BLOCKCHAIN_ANALYSIS') ?? 0,
        ),
        {
          name: 'PriceCharting',
          configured: priceChartingConfigured,
          failedEvents: priceChartingFailures.length,
          summary: priceChartingSummary,
          status: priceChartingStatus,
          activeAssetMappings: activePriceChartingMappings.length,
          confirmedSubmissionReferences: confirmedSubmissionReferenceCount,
          awaitingAssetPromotion: awaitingAssetPromotionCount,
          retiredDemoMappings: retiredDemoPriceChartingMappings.length,
        },
        integration(
          'Market Data',
          false,
          marketSnapshots > 0
            ? 'Snapshots available.'
            : 'No configured market telemetry.',
          0,
        ),
        integration(
          'Notifications',
          false,
          notificationFailures
            ? 'Delivery failures require review.'
            : 'No current failure telemetry.',
          notificationFailures,
        ),
      ],
      webhooks: webhooks.map((event) => ({
        id: event.id,
        provider: event.provider,
        eventType: event.eventType,
        status: event.status,
        attempts: event.attempts,
        receivedAt: event.receivedAt.toISOString(),
        updatedAt: event.receivedAt.toISOString(),
        error: event.errorCode,
      })),
    };
  }

  async platformDashboard(actor: Actor) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const [risk, failedJobs, webhookFailures, degradedProviders, pendingJobs] = await Promise.all([
      this.riskOperations(actor),
      this.db.outboxEvent.count({ where: { status: { in: ['FAILED', 'DEAD_LETTER'] } } }),
      this.db.webhookInbox.count({ where: { status: { in: ['FAILED', 'REJECTED'] } } }),
      this.db.providerIncident.findMany({
        where: { status: 'OPEN' },
        select: { provider: true },
        distinct: ['provider'],
      }),
      this.db.outboxEvent.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
    ]);
    const degraded = risk.system.filter((item) =>
      ['Degraded', 'Unavailable', 'Outage'].includes(item.status),
    );
    const limited = risk.system.filter((item) =>
      [
        'Unknown',
        'BETA_DISABLED',
        'NOT_CONFIGURED',
        'LOCAL_ONLY',
        'CONFIGURED_NOT_EXERCISED',
        'NO_APPROVED_DESTINATION',
      ].includes(item.status),
    );
    const overallHealth = degraded.length
      ? 'Degraded'
      : limited.length
        ? 'Operational with limitations'
        : 'Operational';
    const alerts = degraded.map((item) => ({
      id: `health-${item.name}`,
      title: `${item.name} requires attention`,
      detail: item.summary,
      severity: 'warning',
      occurredAt: item.lastCheckedAt,
    }));
    if (webhookFailures) {
      alerts.push({
        id: 'webhooks-failed',
        title: 'Webhook delivery failures',
        detail: `${webhookFailures} failed or rejected webhook events require review.`,
        severity: 'warning',
        occurredAt: new Date().toISOString(),
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      overallHealth,
      kpis: {
        failedJobs,
        webhookFailures,
        degradedProviders: degradedProviders.length,
        // There is no feature-flag/change-approval authority in this environment.
        pendingChanges: null,
      },
      systemHealth: risk.system,
      providers: risk.integrations,
      resources: [
        {
          label: 'Outbox queue',
          value: String(pendingJobs),
          status: pendingJobs ? 'Attention' : 'Clear',
        },
        {
          label: 'Webhook inbox',
          value: String(webhookFailures),
          status: webhookFailures ? 'Attention' : 'Clear',
        },
      ],
      alerts,
      recentActivity: risk.audit.slice(0, 12),
      featureFlags: {
        available: false,
        message: 'No authoritative feature-flag read is configured for this environment.',
      },
      settings: {
        available: false,
        message: 'Platform settings are managed outside the Admin read model.',
      },
    };
  }

  async platformRecords(
    actor: Actor,
    input: { tab: string; q?: string; status?: string; page: number; pageSize: number },
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const q = input.q?.trim();
    const page = input.page;
    const pageSize = input.pageSize;
    if (input.tab === 'feature-flags' || input.tab === 'settings' || input.tab === 'health') {
      return {
        tab: input.tab,
        supported: false,
        message:
          input.tab === 'health'
            ? 'Health is available in the dashboard view.'
            : input.tab === 'feature-flags'
              ? 'No authoritative feature-flag read is configured for this environment.'
              : 'Platform settings are managed outside the Admin read model.',
        items: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      };
    }
    if (input.tab === 'integrations') {
      const dashboard = await this.platformDashboard(actor);
      const items = dashboard.providers.filter((item) =>
        q ? `${item.name} ${item.summary}`.toLowerCase().includes(q.toLowerCase()) : true,
      );
      const total = items.length;
      return {
        tab: input.tab,
        supported: true,
        message: null,
        items: items.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
          id: item.name,
          kind: 'integration' as const,
          name: item.name,
          status: item.status,
          configured: item.configured,
          summary: item.summary,
          failedEvents: item.failedEvents,
          ...(() => { const optional = item as { provider?: unknown; signedUpload?: unknown; signedDownload?: unknown }; return {
            ...(typeof optional.provider === 'string' ? { provider: optional.provider } : {}),
            ...(typeof optional.signedUpload === 'boolean' ? { signedUpload: optional.signedUpload } : {}),
            ...(typeof optional.signedDownload === 'boolean' ? { signedDownload: optional.signedDownload } : {}),
          }; })(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    }
    if (input.tab === 'jobs') {
      const statuses = ['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER'];
      const status = statuses.includes(input.status ?? '') ? input.status : undefined;
      const where: Prisma.OutboxEventWhereInput = {
        ...(status ? { status: status as Prisma.OutboxEventWhereInput['status'] } : {}),
        ...(q
          ? {
              OR: [
                { eventId: { contains: q, mode: 'insensitive' } },
                { eventType: { contains: q, mode: 'insensitive' } },
                { aggregateType: { contains: q, mode: 'insensitive' } },
                { aggregateId: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.outboxEvent.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            eventId: true,
            eventType: true,
            aggregateType: true,
            aggregateId: true,
            status: true,
            attempts: true,
            availableAt: true,
            lastAttemptAt: true,
            lastErrorSafe: true,
            updatedAt: true,
          },
        }),
        this.db.outboxEvent.count({ where }),
      ]);
      return {
        tab: input.tab,
        supported: true,
        message: null,
        items: rows.map((row) => ({
          id: row.id,
          kind: 'job' as const,
          eventId: row.eventId,
          eventType: row.eventType,
          aggregate: `${row.aggregateType}:${row.aggregateId}`,
          status: row.status,
          attempts: row.attempts,
          availableAt: row.availableAt.toISOString(),
          lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
          error: row.lastErrorSafe,
          updatedAt: row.updatedAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    }
    if (input.tab === 'webhooks') {
      const statuses = ['ACCEPTED', 'PROCESSING', 'PROCESSED', 'FAILED', 'REJECTED'];
      const status = statuses.includes(input.status ?? '') ? input.status : undefined;
      const where: Prisma.WebhookInboxWhereInput = {
        ...(status ? { status: status as Prisma.WebhookInboxWhereInput['status'] } : {}),
        ...(q
          ? {
              OR: [
                { eventType: { contains: q, mode: 'insensitive' } },
                { providerEventIdHash: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.webhookInbox.findMany({
          where,
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            provider: true,
            providerEventIdHash: true,
            eventType: true,
            status: true,
            attempts: true,
            receivedAt: true,
            processedAt: true,
            errorCode: true,
          },
        }),
        this.db.webhookInbox.count({ where }),
      ]);
      return {
        tab: input.tab,
        supported: true,
        message: null,
        items: rows.map((row) => ({
          id: row.id,
          kind: 'webhook' as const,
          provider: row.provider,
          eventId: row.providerEventIdHash.slice(0, 12),
          eventType: row.eventType,
          status: row.status,
          attempts: row.attempts,
          receivedAt: row.receivedAt.toISOString(),
          processedAt: row.processedAt?.toISOString() ?? null,
          error: row.errorCode,
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    }
    const where: Prisma.AuditEventWhereInput = q
      ? {
          OR: [
            { action: { contains: q, mode: 'insensitive' } },
            { resourceType: { contains: q, mode: 'insensitive' } },
            { resourceId: { contains: q, mode: 'insensitive' } },
            { actor: { profile: { displayName: { contains: q, mode: 'insensitive' } } } },
            { actor: { profile: { publicUsername: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.db.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          actorType: true,
          action: true,
          resourceType: true,
          resourceId: true,
          result: true,
          createdAt: true,
          actor: { select: { profile: { select: { displayName: true, publicUsername: true } } } },
        },
      }),
      this.db.auditEvent.count({ where }),
    ]);
    return {
      tab: 'audit',
      supported: true,
      message: null,
      items: rows.map((row) => ({
        id: row.id,
        kind: 'audit' as const,
        actor:
          row.actor?.profile?.displayName ??
          row.actor?.profile?.publicUsername ??
          (row.actorType === 'SYSTEM' ? 'System' : 'Unknown actor'),
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        result: row.result,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async complianceCaseDetail(actor: Actor, caseId: string) {
    await this.authorization.authorize(actor, 'compliance.read');
    const item = await this.db.complianceCase.findUnique({
      where: { id: caseId },
      include: {
        user: {
          select: {
            id: true,
            profile: { select: { displayName: true, publicUsername: true } },
            complianceHolds: { orderBy: { createdAt: 'desc' }, take: 20 },
            externalConnectAccounts: {
              orderBy: { updatedAt: 'desc' },
              take: 10,
              select: {
                provider: true,
                environment: true,
                status: true,
                requirementsSummary: true,
                detailsSubmitted: true,
                payoutsEnabled: true,
                transfersCapability: true,
                lastSyncedAt: true,
              },
            },
          },
        },
        decisions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!item)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found.',
      });
    const audit = await this.db.auditEvent.findMany({
      where: { resourceType: 'compliance-case', resourceId: caseId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      id: item.id,
      provider: item.provider,
      type: item.type,
      status: item.status,
      identityState: item.identityState,
      verificationSessionReference: item.providerReferenceHash ? `…${item.providerReferenceHash.slice(-8)}` : null,
      identityRequestedAt: item.identityRequestedAt?.toISOString() ?? null,
      identityCompletedAt: item.identityCompletedAt?.toISOString() ?? null,
      identityVerifiedAt: item.identityVerifiedAt?.toISOString() ?? null,
      identitySafeFailureCode: item.identitySafeFailureCode,
      identityLastProviderSync: item.identityLastProviderSync?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      user: {
        id: item.user.id,
        displayName: item.user.profile?.displayName ?? 'Unnamed user',
        username: item.user.profile?.publicUsername ?? null,
      },
      providerStatus: item.status === 'NOT_STARTED' ? 'Unknown' : item.status,
      identity: {
        state: item.identityState,
        provider: item.provider,
        verifiedAt: item.identityVerifiedAt?.toISOString() ?? null,
        safeFailureCode: item.identitySafeFailureCode,
      },
      riskReview: {
        status: item.user.complianceHolds.some((hold) => hold.status === 'ACTIVE') ? 'REVIEW_REQUIRED' : 'CLEAR',
        activeHoldCount: item.user.complianceHolds.filter((hold) => hold.status === 'ACTIVE').length,
      },
      connectPayoutReadiness: item.user.externalConnectAccounts.map((account) => ({
        provider: account.provider,
        environment: account.environment,
        status: account.status,
        requirementsSummary: account.requirementsSummary,
        detailsSubmitted: account.detailsSubmitted,
        payoutsEnabled: account.payoutsEnabled,
        transfersCapability: account.transfersCapability,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      })),
      decisions: item.decisions.map((decision) => ({
        status: decision.status,
        reasonCode: decision.reasonCode,
        actorUserId: decision.actorUserId,
        createdAt: decision.createdAt.toISOString(),
      })),
      restrictions: item.user.complianceHolds.map((hold) => ({
        scope: hold.scope,
        reasonCode: hold.reasonCode,
        source: hold.source,
        status: hold.status,
        createdAt: hold.createdAt.toISOString(),
        releasedAt: hold.releasedAt?.toISOString() ?? null,
      })),
      audit: audit.map((entry) => ({
        action: entry.action,
        result: entry.result,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** Staff-safe operational projection. This deliberately composes existing
   * submission, intake, custody and publication authority; it does not create
   * a second lifecycle state machine. */
  async operationsOverview(actor: Actor) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const [
      submissions,
      compliance,
      complianceCases,
      supportTickets,
      payments,
      failedPayouts,
      pendingAdjustments,
      alerts,
      activeUsers,
      collectorUsers,
      staffUsers,
      adminUsers,
      investorUsers,
      activeListings,
      openOrders,
      stuckOrders,
      pipelineRows,
      membershipRows,
      activityRows,
      notificationFailures,
      marketSnapshots,
      outboxFailures,
      reconciliationExceptions,
    ] = await this.db.$transaction([
      this.db.assetSubmission.findMany({
        where: { status: { notIn: ['DRAFT', 'CANCELLED', 'REJECTED'] } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 200,
        include: {
          owner: {
            select: {
              id: true,
              profile: { select: { displayName: true, publicUsername: true } },
            },
          },
          asset: {
            include: {
              valuationDecisions: { where: { status: 'ACTIVE' }, take: 1 },
              custodyRecord: true,
              publication: true,
            },
          },
          intake: { include: { vault: true, shipment: true, receipt: true } },
        },
      }),
      this.db.complianceCase.count({
        where: {
          status: { in: ['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'SUSPENDED'] },
        },
      }),
      this.db.complianceCase.findMany({
        where: {
          status: { in: ['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'SUSPENDED'] },
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: 8,
        select: {
          id: true,
          type: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { profile: { select: { displayName: true, publicUsername: true } } } },
        },
      }),
      this.db.discordTicket.count({
        where: { status: { in: ['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF', 'ESCALATED'] } },
      }),
      this.db.moneyMovement.count({
        where: { status: { in: ['FAILED', 'MANUAL_REVIEW', 'HELD'] } },
      }),
      this.db.moneyMovement.count({
        where: { type: 'WITHDRAWAL', status: { in: ['FAILED', 'RETURNED'] } },
      }),
      this.db.financialAdjustmentRequest.count({
        where: { status: 'PENDING_APPROVAL' },
      }),
      this.db.providerIncident.count({ where: { status: 'OPEN' } }),
      this.db.user.count({ where: { accountStatus: 'ACTIVE' } }),
      this.db.roleAssignment.findMany({
        where: {
          role: 'COLLECTOR',
          revokedAt: null,
          user: { accountStatus: 'ACTIVE' },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.db.roleAssignment.findMany({
        where: {
          revokedAt: null,
          role: {
            in: [
              'SUPPORT',
              'COMPLIANCE_ANALYST',
              'ASSET_REVIEWER',
              'VAULT_OPERATOR',
              'FINANCE_OPERATOR',
            ],
          },
          user: { accountStatus: 'ACTIVE' },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.db.roleAssignment.findMany({
        where: {
          role: 'ADMIN',
          revokedAt: null,
          user: { accountStatus: 'ACTIVE' },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.db.user.count({
        where: {
          accountStatus: 'ACTIVE',
          OR: [
            { portfolioLots: { some: { status: 'OPEN' } } },
            {
              tradingOrders: {
                some: {
                  status: { in: ['OPEN', 'PARTIALLY_FILLED', 'FILLED'] },
                },
              },
            },
          ],
        },
      }),
      this.db.assetPublication.count({ where: { status: 'PUBLISHED' } }),
      this.db.tradingOrder.count({
        where: {
          status: { in: ['PENDING_RESERVATION', 'OPEN', 'PARTIALLY_FILLED'] },
        },
      }),
      this.db.tradingOrder.count({
        where: {
          status: 'PENDING_RESERVATION',
          createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      }),
      this.db.assetSubmission.findMany({
        where: { status: { notIn: ['CANCELLED', 'REJECTED'] } },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          media: { select: { status: true } },
          intake: {
            select: {
              status: true,
              shipment: { select: { status: true } },
              receipt: { select: { id: true } },
            },
          },
          asset: {
            select: {
              valuationDecisions: {
                where: { status: 'ACTIVE' },
                select: { id: true },
                take: 1,
              },
              custodyRecord: { select: { status: true } },
              publication: { select: { status: true } },
            },
          },
        },
      }),
      this.db.collectorSubscription.findMany({
        where: { status: { notIn: ['CANCELLED', 'EXPIRED'] } },
        select: {
          status: true,
          plan: { select: { code: true, monthlyPriceMinor: true } },
        },
      }),
      this.db.auditEvent.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          createdAt: true,
          actor: {
            select: {
              profile: { select: { displayName: true, publicUsername: true } },
            },
          },
        },
      }),
      this.db.notificationDelivery.count({
        where: {
          status: { in: ['FAILED', 'DEAD_LETTER'] },
          ...(this.config.isBeta ? { channel: { not: 'DISCORD' as const } } : {}),
        },
      }),
      this.db.assetMarketSnapshot.count(),
      this.db.outboxEvent.count({
        where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
      }),
      this.db.financialReconciliationRun.count({
        where: { status: 'MISMATCH' },
      }),
    ]);
    const pendingReviews = submissions.filter((item) =>
      ['SUBMITTED', 'IN_REVIEW'].includes(item.status),
    ).length;
    const changesRequested = submissions.filter(
      (item) => item.status === 'CHANGES_REQUESTED',
    ).length;
    const acceptedAwaitingVault = submissions.filter(
      (item) => item.status === 'APPROVED' && !item.intake,
    ).length;
    const shipmentsInTransit = submissions.filter((item) =>
      ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(
        item.intake?.shipment?.status ?? '',
      ),
    ).length;
    const deliveredAwaitingReceipt = submissions.filter(
      (item) =>
        item.intake?.shipment?.status === 'DELIVERED' && !item.intake.receipt,
    ).length;
    const verificationQueue = submissions.filter(
      (item) =>
        item.intake?.status === 'VERIFICATION' ||
        ['RECEIVED', 'INSPECTED'].includes(
          item.asset?.custodyRecord?.status ?? '',
        ),
    ).length;
    const valuationQueue = submissions.filter(
      (item) =>
        item.asset &&
        item.asset.valuationDecisions.length === 0 &&
        ['APPROVED', 'IN_REVIEW'].includes(item.status),
    ).length;
    const vaultReady = submissions.filter(
      (item) => item.asset?.custodyRecord?.status === 'SECURED',
    ).length;
    const marketplaceReady = submissions.filter((item) =>
      ['READY', 'PUBLISHED'].includes(item.asset?.publication?.status ?? ''),
    ).length;
    const needsAttention = submissions
      .flatMap((item) => {
        const subject =
          item.asset?.title ?? `Submission ${item.id.slice(0, 8)}`;
        const collector =
          item.owner.profile?.displayName ??
          item.owner.profile?.publicUsername ??
          'Unnamed collector';
        const age = ageLabel(item.updatedAt);
        if (item.status === 'CHANGES_REQUESTED')
          return [
            attention(
              item.id,
              'Asset review',
              subject,
              collector,
              'Changes requested',
              'Collector action is required before review can continue.',
              age,
              'HIGH',
              'COLLECTOR',
              'reviews',
            ),
          ];
        if (['SUBMITTED', 'IN_REVIEW'].includes(item.status))
          return [
            attention(
              item.id,
              'Asset review',
              subject,
              collector,
              'Review queue',
              'Submission is waiting for an authorised staff decision.',
              age,
              'MEDIUM',
              'SLICE',
              'reviews',
            ),
          ];
        if (item.status === 'APPROVED' && !item.intake)
          return [
            attention(
              item.id,
              'Physical intake',
              subject,
              collector,
              'Accepted · vault not selected',
              'Collector must choose an intake destination.',
              age,
              'MEDIUM',
              'COLLECTOR',
              'intake',
            ),
          ];
        if (
          item.intake?.shipment?.status === 'DELIVERED' &&
          !item.intake.receipt
        )
          return [
            attention(
              item.id,
              'Physical intake',
              subject,
              collector,
              'Delivered · receipt pending',
              'Delivery is not custody: staff receipt confirmation is still required.',
              age,
              'HIGH',
              'SLICE',
              'intake',
            ),
          ];
        if (
          item.asset &&
          item.asset.valuationDecisions.length === 0 &&
          item.status === 'APPROVED'
        )
          return [
            attention(
              item.id,
              'Valuation',
              subject,
              collector,
              'Valuation required',
              'Record the supported valuation before publication readiness.',
              age,
              'MEDIUM',
              'SLICE',
              'valuations',
            ),
          ];
        return [];
      })
      .slice(0, 24);
    const pipeline = {
      draft: 0,
      submitted: 0,
      inReview: 0,
      accepted: 0,
      shipping: 0,
      received: 0,
      verified: 0,
      valued: 0,
      vaultReady: 0,
      marketLive: 0,
    };
    const pipelineAges = new Map<keyof typeof pipeline, Date[]>();
    for (const row of pipelineRows) {
      const publication = row.asset?.publication?.status;
      const custody = row.asset?.custodyRecord?.status;
      const receipt = Boolean(row.intake?.receipt);
      const shipment = row.intake?.shipment?.status;
      let stage: keyof typeof pipeline;
      if (publication === 'PUBLISHED') stage = 'marketLive';
      else if (custody === 'SECURED') stage = 'vaultReady';
      else if (row.asset?.valuationDecisions.length) stage = 'valued';
      else if (custody === 'INSPECTED' || row.intake?.status === 'VERIFICATION')
        stage = 'verified';
      else if (receipt) stage = 'received';
      else if (row.status === 'DRAFT') stage = 'draft';
      else if (row.status === 'SUBMITTED') stage = 'submitted';
      else if (row.status === 'IN_REVIEW') stage = 'inReview';
      else if (row.status === 'APPROVED' && !row.intake) stage = 'accepted';
      else if (shipment || row.intake?.status) stage = 'shipping';
      else stage = 'accepted';
      pipeline[stage] += 1;
      const dates = pipelineAges.get(stage) ?? [];
      dates.push(row.updatedAt);
      pipelineAges.set(stage, dates);
    }
    const missingEvidence = pipelineRows.filter(
      (row) =>
        ['SUBMITTED', 'IN_REVIEW'].includes(row.status) &&
        !row.media.some((media) => media.status === 'SAFE'),
    ).length;
    const deliveryExceptions = pipelineRows.filter(
      (row) =>
        ['EXCEPTION', 'UNKNOWN'].includes(row.intake?.shipment?.status ?? '') ||
        (row.intake?.shipment?.status === 'DELIVERED' && !row.intake.receipt),
    ).length;
    const accountMix = {
      collectors: collectorUsers.length,
      investors: investorUsers,
      staff: staffUsers.length,
      admins: adminUsers.length,
      overlapping: true,
    };
    const membershipSnapshot = {
      starter: membershipRows.filter((row) => row.plan.code === 'STARTER')
        .length,
      pro: membershipRows.filter((row) => row.plan.code === 'PRO').length,
      elite: membershipRows.filter((row) => row.plan.code === 'ELITE').length,
      trialing: membershipRows.filter((row) => row.status === 'TRIALING')
        .length,
      pastDue: membershipRows.filter((row) => row.status === 'PAST_DUE').length,
      mrrMinor: membershipRows
        .filter((row) =>
          ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCEL_AT_PERIOD_END'].includes(
            row.status,
          ),
        )
        .reduce((total, row) => total + row.plan.monthlyPriceMinor, 0n)
        .toString(),
    };
    const activityTitle = (action: string) => {
      if (action.includes('VALUATION')) return 'Valuation updated';
      if (action.includes('SUBMISSION_APPROVED') || action.includes('SUBMISSION_ACCEPTED'))
        return 'Submission accepted';
      if (action.includes('RECEIPT')) return 'Physical receipt confirmed';
      if (action.includes('SHIPMENT') || action.includes('TRACKING')) return 'Shipment updated';
      if (action.includes('PUBLISH')) return 'Listing published';
      if (action.includes('ORDER')) return 'Trading order updated';
      if (action.includes('USER') || action.includes('ACCOUNT')) return 'Account updated';
      if (action.includes('MEMBERSHIP')) return 'Membership updated';
      if (action.includes('ROLE')) return 'Access role updated';
      if (action.includes('WEBHOOK') || action.includes('PROVIDER')) return 'Provider event received';
      return 'Administrative action';
    };
    const activityResource = (resourceType: string) => {
      const normalized = resourceType.replace(/[_-]+/g, ' ').toLowerCase();
      return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
    };
    const systemHealth = [
      {
        name: 'API',
        status: 'Operational',
        summary: 'Aggregate request completed.',
      },
      {
        name: 'Database',
        status: 'Operational',
        summary: 'Operational projection query completed.',
      },
      {
        name: 'Background Jobs',
        status: outboxFailures ? 'Degraded' : 'Unknown',
        summary: outboxFailures
          ? `${outboxFailures} failed or dead-lettered jobs require review.`
          : 'Job telemetry is not exposed in this environment.',
      },
      {
        name: 'Notifications',
        status: notificationFailures
          ? 'Degraded'
          : this.config.isBeta
            ? 'BETA_DISABLED'
            : 'UNKNOWN',
        summary: notificationFailures
          ? `${notificationFailures} failed deliveries require review.`
          : 'Notification failure telemetry is not available.',
      },
      {
        name: 'Market data',
        status: marketSnapshots ? 'Operational' : this.config.isBeta ? 'BETA_DISABLED' : 'UNKNOWN',
        summary: marketSnapshots
          ? `${marketSnapshots} market snapshots are available.`
          : 'Market snapshot telemetry is not available.',
      },
      {
        name: 'Vault Integration',
        status: this.config.isBeta ? 'BETA_DISABLED' : 'UNKNOWN',
        summary: 'Provider health telemetry is not exposed.',
      },
      {
        name: 'Payment Provider',
        status: this.config.isBeta ? 'BETA_DISABLED' : 'UNKNOWN',
        summary: 'Provider health telemetry is not exposed.',
      },
      {
        name: 'Webhooks',
        status: alerts ? 'Degraded' : 'Unknown',
        summary: alerts
          ? `${alerts} provider incidents are open.`
          : 'Webhook health telemetry is not available.',
      },
    ];
    const attentionGroups = [
      {
        id: 'missing-evidence',
        label: 'Missing evidence',
        count: missingEvidence,
        description: 'Submissions missing required safe evidence.',
        severity: missingEvidence ? 'HIGH' : 'NORMAL',
        section: 'moderation',
      },
      {
        id: 'delivery-exceptions',
        label: 'Delivery exceptions',
        count: deliveryExceptions,
        description: 'Shipments with delivery or receipt issues.',
        severity: deliveryExceptions ? 'HIGH' : 'NORMAL',
        section: 'intake',
      },
      {
        id: 'valuation-issues',
        label: 'Valuation queue',
        count: valuationQueue,
        description: 'Assets waiting for supported valuation.',
        severity: 'NORMAL',
        section: 'valuations',
      },
      {
        id: 'compliance-review',
        label: 'Compliance review',
        count: compliance,
        description: 'Cases awaiting authorised compliance review.',
        severity: compliance ? 'HIGH' : 'NORMAL',
        section: 'compliance',
      },
      {
        id: 'stuck-orders',
        label: 'Stuck orders',
        count: stuckOrders,
        description: 'Orders awaiting abnormal processing recovery.',
        severity: stuckOrders ? 'HIGH' : 'NORMAL',
        section: 'payments',
      },
      {
        id: 'payment-exceptions',
        label: 'Payment exceptions',
        count: payments,
        description: 'Money movements failed or require manual review.',
        severity: payments ? 'HIGH' : 'NORMAL',
        section: 'payments',
      },
      {
        id: 'provider-alerts',
        label: 'Provider alerts',
        count: alerts,
        description: 'Open provider incidents require integration review.',
        severity: alerts ? 'HIGH' : 'NORMAL',
        section: 'integrations',
      },
      {
        id: 'reconciliation',
        label: 'Reconciliation exceptions',
        count: reconciliationExceptions,
        description: 'Financial reconciliation requires inspection.',
        severity: reconciliationExceptions ? 'CRITICAL' : 'NORMAL',
        section: 'payments',
      },
    ].filter((item) => item.count > 0);
    const refreshedAt = new Date().toISOString();
    const financeAccess = evaluatePolicy({
      actor: {
        actorType: 'USER',
        userId: actor.userId,
        accountStatus: actor.status,
        roles: actor.roles as never,
      },
      action: 'finance.read',
    }).allowed;
    let financeDashboard: Awaited<ReturnType<AdminService['financeDashboard']>> | null = null;
    let bacsDashboard: Awaited<ReturnType<AdminService['bacsRiskDashboard']>> | null = null;
    let financeError: string | null = null;
    if (financeAccess) {
      try {
        [financeDashboard, bacsDashboard] = await Promise.all([
          this.financeDashboard(actor),
          this.bacsRiskDashboard(actor),
        ]);
      } catch {
        financeError = 'Finance projection unavailable. Open Finance for a detailed retry.';
      }
    }
    const payoutLiquidity = financeDashboard?.payoutLiquidity ?? null;
    const openDeficitsCount = bacsDashboard?.summary.openDeficitCount ?? null;
    const openDeficitsMinor = bacsDashboard?.summary.openDeficitMinor ?? null;
    const returnsManualReviewCount = bacsDashboard
      ? bacsDashboard.summary.returnedDepositCount + bacsDashboard.summary.manualReviewDepositCount
      : null;
    const liquidityWarning = payoutLiquidity?.providerLiquidityStatus === 'INSUFFICIENT';
    const financeRiskCount = financeDashboard && bacsDashboard
      ? bacsDashboard.summary.heldDepositCount +
        bacsDashboard.summary.manualReviewDepositCount +
        bacsDashboard.summary.returnedDepositCount +
        bacsDashboard.summary.openDeficitCount +
        bacsDashboard.summary.sharedInstrumentReviewCount +
        failedPayouts +
        (liquidityWarning ? 1 : 0) +
        financeDashboard.kpis.reconciliationMismatches +
        pendingAdjustments +
        (financeDashboard.financialNotificationOperations.failedMandatoryEmail > 0 ? 1 : 0)
      : null;
    const staffDecisionCount =
      pendingReviews + changesRequested + deliveredAwaitingReceipt + compliance +
      (financeAccess ? pendingAdjustments : 0);
    const needsActionCount =
      attentionGroups.reduce((total, item) => total + item.count, 0) +
      pendingAdjustments +
      failedPayouts;
    const platformIncidentCount = systemHealth.filter((item) =>
      ['DEGRADED', 'UNAVAILABLE'].includes(item.status.toUpperCase()),
    ).length;
    const pipelineDetails = [
      ['draft', 'Draft', 'moderation'],
      ['submitted', 'Submitted', 'moderation'],
      ['inReview', 'Review', 'moderation'],
      ['accepted', 'Accepted', 'intake'],
      ['shipping', 'Shipping', 'intake'],
      ['received', 'Received', 'intake'],
      ['verified', 'Verified', 'assetOperations'],
      ['valued', 'Valued', 'valuations'],
      ['vaultReady', 'Vault Ready', 'custody'],
      ['marketLive', 'Live', 'collectibles'],
    ] as const;
    const detailedPipeline = pipelineDetails.map(([id, label, target]) => {
      const dates = [...(pipelineAges.get(id) ?? [])].sort((a, b) => a.getTime() - b.getTime());
      const oldestAt = dates[0]?.toISOString() ?? null;
      return {
        id,
        label,
        count: pipeline[id],
        oldestAt,
        oldestAge: oldestAt ? ageLabel(new Date(oldestAt)) : null,
        overdueCount: null,
        target,
      };
    });
    const priorityWork = [
      ...needsAttention.map((item) => ({
        id: item.id,
        severity: item.severity,
        type: item.type.toUpperCase(),
        title: item.subject,
        context: item.reason,
        age: item.age,
        owner: item.waitingOn === 'COLLECTOR' ? item.collector : 'Slice staff',
        actionLabel: item.waitingOn === 'COLLECTOR' ? 'Open collector' : 'Review',
        target: item.target,
        reference: item.id,
      })),
      ...complianceCases.map((item) => ({
        id: `compliance-${item.id}`,
        severity: 'HIGH',
        type: 'COMPLIANCE',
        title: item.user.profile?.displayName
          ? `Compliance case · ${item.user.profile.displayName}`
          : `Compliance case · ${item.id.slice(0, 8)}`,
        context: `${item.type.replaceAll('_', ' ')} · ${item.status.replaceAll('_', ' ')}`,
        age: ageLabel(item.updatedAt),
        owner: 'Compliance',
        actionLabel: 'Open case',
        target: 'compliance',
        reference: item.id,
      })),
      ...(failedPayouts > 0
        ? [{
            id: 'failed-payouts',
            severity: 'HIGH',
            type: 'PAYOUT',
            title: 'Failed or returned payouts',
            context: `${failedPayouts} payout operation${failedPayouts === 1 ? '' : 's'} need review.`,
            age: 'Current',
            owner: 'Finance',
            actionLabel: 'Open finance',
            target: 'payments',
            reference: null,
          }]
        : []),
      ...(pendingAdjustments > 0
        ? [{
            id: 'finance-adjustments',
            severity: 'HIGH',
            type: 'DUAL CONTROL',
            title: 'Finance adjustments awaiting approval',
            context: `${pendingAdjustments} dual-control decision${pendingAdjustments === 1 ? '' : 's'} pending.`,
            age: 'Current',
            owner: 'Finance',
            actionLabel: 'Open finance',
            target: 'payments',
            reference: null,
          }]
        : []),
      ...(financeRiskCount && financeRiskCount > 0 && financeDashboard && bacsDashboard
        ? [{
            id: 'finance-exceptions',
            severity: 'HIGH',
            type: 'FINANCE REVIEW',
            title: 'Financial exceptions require review',
            context: `${financeRiskCount} active finance exception${financeRiskCount === 1 ? '' : 's'} across Bacs, payouts, deficits, or reconciliation.`,
            age: 'Current',
            owner: 'Finance',
            actionLabel: 'Open finance',
            target: 'payments',
            reference: null,
          }]
        : []),
      ...(alerts > 0
        ? [{
            id: 'provider-incidents',
            severity: 'HIGH',
            type: 'PROVIDER INCIDENT',
            title: 'Provider incidents are open',
            context: `${alerts} provider incident${alerts === 1 ? '' : 's'} require integration review.`,
            age: 'Current',
            owner: 'Platform',
            actionLabel: 'Open incidents',
            target: 'integrations',
            reference: null,
          }]
        : []),
    ].sort((left, right) => {
      const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
      return (rank[left.severity] ?? 4) - (rank[right.severity] ?? 4);
    }).slice(0, 12);
    const meaningfulActivity = activityRows
      .filter((row) => /ACCEPT|REJECT|PAYOUT|DEPOSIT|DEFICIT|ADJUSTMENT|COMPLIANCE|BANK|CUSTODY|PROVIDER|WEBHOOK|RECONCIL/i.test(row.action))
      .map((row) => ({
        id: row.id,
        title: activityTitle(row.action),
        summary: `${activityResource(row.resourceType)}${row.resourceId ? ` · ${row.resourceId.slice(0, 8)}` : ''}`,
        actor: row.actor?.profile?.displayName ?? null,
        occurredAt: row.createdAt.toISOString(),
        target: row.resourceType.toLowerCase().includes('finance') || row.action.includes('PAYOUT') ? 'payments' : 'health',
      }));
    return {
      kpis: {
        totalUsers: activeUsers,
        collectors: collectorUsers.length,
        investors: investorUsers,
        activeListings,
        openOrders,
        needsAttention: attentionGroups.reduce(
          (total, item) => total + item.count,
          0,
        ),
      },
      pipeline: [
        ['draft', 'Draft'],
        ['submitted', 'Submitted'],
        ['inReview', 'In Review'],
        ['accepted', 'Accepted'],
        ['shipping', 'Shipping'],
        ['received', 'Received'],
        ['verified', 'Verified'],
        ['valued', 'Valued'],
        ['vaultReady', 'Vault Ready'],
        ['marketLive', 'Market Live'],
      ].map(([id, label]) => ({
        id,
        label,
        count: pipeline[id as keyof typeof pipeline],
      })),
      attentionGroups,
      recentActivity: activityRows.map((row) => ({
        id: row.id,
        title: activityTitle(row.action),
        context: `${activityResource(row.resourceType)}${row.resourceId ? ` · ${row.resourceId.slice(0, 8)}` : ''}${row.actor?.profile?.displayName ? ` · by ${row.actor.profile.displayName}` : ''}`,
        occurredAt: row.createdAt.toISOString(),
      })),
      systemHealth,
      accountMix,
      memberships: membershipSnapshot,
      support: {
        available: true,
        message: supportTickets ? 'Open Discord support tickets require attention.' : 'No open support tickets.',
        open: supportTickets,
      },
      counts: {
        pendingReviews,
        collectorActionsWaiting:
          changesRequested +
          acceptedAwaitingVault +
          submissions.filter(
            (item) =>
              item.intake?.status === 'SHIPPING_REQUIRED' &&
              !item.intake.shipment,
          ).length,
        acceptedAwaitingVault,
        shipmentsInTransit,
        deliveredAwaitingReceipt,
        verificationQueue,
        valuationQueue,
        vaultReady,
        marketplaceReady,
        compliance,
        payments,
        alerts,
      },
      needsAttention,
      controlCenter: {
        summary: {
          needsAction: {
            count: needsActionCount,
            subtitle: needsActionCount ? 'High-priority items require attention.' : 'No active work requires attention.',
            severity: needsActionCount ? 'WARNING' : 'HEALTHY',
            target: 'moderation',
          },
          financialRisk: {
            count: financeRiskCount,
            subtitle: financeAccess
              ? (financeRiskCount ? 'Financial exceptions detected.' : 'No active financial exceptions.')
              : 'Finance visibility requires finance.read.',
            severity: !financeAccess ? 'LIMITED' : financeRiskCount ? 'CRITICAL' : 'HEALTHY',
            target: 'payments',
            access: financeAccess ? 'FULL' : 'LIMITED',
          },
          staffDecisions: {
            count: staffDecisionCount,
            subtitle: staffDecisionCount ? 'Authorized decisions are waiting.' : 'No staff decisions are waiting.',
            severity: staffDecisionCount ? 'WARNING' : 'HEALTHY',
            target: 'moderation',
          },
          platformIncidents: {
            count: platformIncidentCount,
            subtitle: platformIncidentCount ? 'Platform components are degraded.' : 'No degraded components reported.',
            severity: platformIncidentCount ? 'CRITICAL' : 'HEALTHY',
            target: 'health',
          },
        },
        priorityWork,
        platformHealth: systemHealth.map((item) => ({
          name: item.name,
          status: ['BETA_DISABLED', 'NOT_CONFIGURED'].includes(item.status)
            ? 'Unknown'
            : item.status,
          summary: ['BETA_DISABLED', 'NOT_CONFIGURED'].includes(item.status)
            ? 'Telemetry unavailable in this environment.'
            : item.summary,
          lastCheckedAt: refreshedAt,
        })),
        financialOperations: {
          available: Boolean(financeDashboard && bacsDashboard),
          access: financeAccess ? 'FULL' : 'LIMITED',
          message: financeError ?? (financeAccess ? null : 'Finance visibility requires finance.read.'),
          currency: 'GBP',
          customerCashLiabilityMinor: payoutLiquidity?.customerCashLiabilityMinor ?? null,
          bacsRiskHeldMinor: bacsDashboard?.summary.heldAmountMinor ?? null,
          withdrawalEligibleMinor: payoutLiquidity?.withdrawalEligibleLiabilityMinor ?? null,
          providerAvailableMinor: payoutLiquidity?.providerAvailableMinor ?? null,
          providerPendingMinor: payoutLiquidity?.providerPendingMinor ?? null,
          payoutLiquidityCoverageBps: payoutLiquidity?.payoutLiquidityCoverageBps ?? null,
          openDeficitsCount,
          openDeficitsMinor,
          returnsManualReviewCount,
          dualControlApprovals: financeAccess ? pendingAdjustments : null,
          providerLiquidityStatus: payoutLiquidity?.providerLiquidityStatus ?? null,
          warning: payoutLiquidity ? payoutLiquidity.warning || liquidityWarning : null,
        },
        pipeline: detailedPipeline,
        importantActivity: meaningfulActivity,
        openCases: complianceCases.map((item) => ({
          id: item.id,
          type: item.type,
          severity: 'HIGH',
          subject: item.user.profile?.displayName ?? `User ${item.id.slice(0, 8)}`,
          age: ageLabel(item.updatedAt),
          owner: 'Compliance',
          nextAction: 'Review case decision',
        })),
        lastRefreshedAt: refreshedAt,
      },
      generatedAt: refreshedAt,
    };
  }

  /**
   * Canonical catalogue projection. This intentionally reads Asset records
   * only; submissions without an authorised canonical Asset never appear in
   * this surface and remain owned by the review/intake workflows.
   */
  async catalogueAssets(
    actor: Actor,
    input: { q?: string; status?: string; page?: number; pageSize?: number },
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const q = input.q?.trim();
    const where: Prisma.AssetWhereInput = {
      ...(this.config.isBeta
        ? {
            slug: { not: { startsWith: 'slice-demo-' } },
            // Static/reference records are not operator collectibles until a
            // real account has submitted them.
            submissions: {
              some: {
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                NOT: [
                  { declaredMetadata: { path: ['betaFixtureRetired'], equals: true } },
                  {
                    declaredMetadata: {
                      path: ['certificationNumber'],
                      string_starts_with: 'STG-',
                    },
                  },
                ],
              },
            },
          }
        : {}),
      ...(input.status
        ? { status: input.status as never }
        : { status: { not: 'ARCHIVED' } }),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { publicId: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { cardNumber: { contains: q, mode: 'insensitive' } },
              { category: { name: { contains: q, mode: 'insensitive' } } },
              { collectibleSet: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const [total, assets] = await Promise.all([
      this.db.asset.count({ where }),
      this.db.asset.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { name: true } },
          collectibleSet: { select: { name: true } },
          gradeScaleEntry: { include: { company: { select: { name: true, code: true } } } },
          valuationDecisions: {
            where: { status: 'ACTIVE' },
            orderBy: { decidedAt: 'desc' },
            take: 1,
            select: { status: true, decidedAt: true },
          },
          custodyRecord: { select: { status: true, updatedAt: true } },
          publication: { select: { status: true, publishedAt: true, updatedAt: true } },
          submissions: {
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              id: true,
              status: true,
              submittedAt: true,
              updatedAt: true,
              owner: { select: { profile: { select: { displayName: true, publicUsername: true } } } },
              media: {
                where: { deletedAt: null },
                select: { status: true, slot: true, objectKey: true },
              },
            },
          },
          ownershipSupply: {
            select: {
              status: true,
              totalUnits: true,
              issuedUnits: true,
              positions: {
                where: { settledUnits: { gt: 0n } },
                select: { settledUnits: true },
              },
            },
          },
          ownershipSupplyPolicy: { select: { status: true } },
          tradingMarket: { select: { status: true, tradingEnabled: true } },
        },
      }),
    ]);
    return {
      items: await Promise.all(assets.map(async (asset) => {
        const submission = asset.submissions[0] ?? null;
        const mediaStatuses = submission?.media.map((media) => media.status) ?? [];
        const frontMedia = submission?.media.find((media) => media.slot === 'front') ?? submission?.media[0];
        const thumbnailUrl = frontMedia && frontMedia.status === 'SAFE'
          ? await this.storage
              .createPrivateDownloadUrl(frontMedia.objectKey, new Date(Date.now() + 5 * 60_000))
              .catch(() => null)
          : null;
        const mediaState = !mediaStatuses.length
          ? 'NOT_AVAILABLE'
          : mediaStatuses.every((status) => status === 'SAFE')
            ? 'SAFE'
            : mediaStatuses.some((status) => status === 'REJECTED')
              ? 'REJECTED'
              : 'IN_REVIEW';
        const verificationState = asset.custodyRecord
          ? asset.custodyRecord.status === 'EXPECTED'
            ? 'AWAITING_RECEIPT'
            : asset.custodyRecord.status
          : 'NOT_STARTED';
        return {
          id: asset.id,
          publicId: asset.publicId,
          slug: asset.slug,
          title: asset.title,
          thumbnailUrl,
          status: asset.status,
          identity: {
            category: asset.category.name,
            year: asset.year,
            manufacturer: asset.manufacturer,
            set: asset.collectibleSet?.name ?? null,
            cardNumber: asset.cardNumber,
            edition: asset.edition,
            grading: asset.gradeScaleEntry
              ? {
                  company: asset.gradeScaleEntry.company.name,
                  code: asset.gradeScaleEntry.company.code,
                  grade: asset.gradeScaleEntry.grade.toFixed(2),
                  label: asset.gradeScaleEntry.label,
                }
              : null,
          },
          provenance: submission
            ? {
                submissionId: submission.id,
                submissionStatus: submission.status,
                submittedAt: submission.submittedAt?.toISOString() ?? null,
                collector: submission.owner.profile?.displayName ?? 'Unnamed collector',
                username: submission.owner.profile?.publicUsername ?? null,
              }
            : null,
          mediaState,
          verificationState,
          valuationState: asset.valuationDecisions.length ? 'ACTIVE' : 'NOT_STARTED',
          custodyState: asset.custodyRecord?.status ?? 'NOT_STARTED',
          marketReadiness: asset.publication?.status === 'PUBLISHED' ? 'PUBLISHED' : 'NOT_READY',
          publicationState: asset.publication?.status ?? 'NOT_PUBLISHED',
          ownership: {
            ownerCount: asset.ownershipSupply?.positions.length ?? 0,
            totalUnits: asset.ownershipSupply?.totalUnits.toString() ?? null,
            issuedUnits: asset.ownershipSupply?.issuedUnits.toString() ?? null,
          },
          marketLifecycle: deriveMarketLifecycle({
            published: asset.publication?.status === 'PUBLISHED',
            publicationStatus: asset.publication?.status,
            custodyStatus: asset.custodyRecord?.status,
            supplyPolicyStatus: asset.ownershipSupplyPolicy?.status,
            supplyStatus: asset.ownershipSupply?.status,
            issuedUnits: asset.ownershipSupply?.issuedUnits,
            marketStatus: asset.tradingMarket?.status,
            tradingEnabled: asset.tradingMarket?.tradingEnabled,
            availabilityBps: null,
          }),
          updatedAt: asset.updatedAt.toISOString(),
        };
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async listIntake(
    actor: Actor,
    input: {
      status?: string;
      q?: string;
      vaultId?: string;
      carrier?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      pageSize?: number;
      sort?: string;
      sortDirection?: 'asc' | 'desc';
      limit: number;
    },
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const intakeWhere: Prisma.AssetSubmissionWhereInput = {
      AND: [
        { OR: [{ status: 'APPROVED' }, { intake: { isNot: null } }] },
        ...(this.config.isBeta
          ? [
              {
                OR: [
                  { asset: { is: null } },
                  { asset: { is: { slug: { not: { startsWith: 'slice-demo-' } } } } },
                ],
              },
            ]
          : []),
        ...(input.vaultId ? [{ intake: { vaultId: input.vaultId } }] : []),
        ...(input.q
          ? [
              {
                OR: [
                  {
                    id: {
                      contains: input.q,
                      mode: 'insensitive' as Prisma.QueryMode,
                    },
                  },
                  {
                    asset: {
                      title: {
                        contains: input.q,
                        mode: 'insensitive' as Prisma.QueryMode,
                      },
                    },
                  },
                  {
                    owner: {
                      profile: {
                        publicUsername: {
                          contains: input.q,
                          mode: 'insensitive' as Prisma.QueryMode,
                        },
                      },
                    },
                  },
                  {
                    owner: {
                      profile: {
                        displayName: {
                          contains: input.q,
                          mode: 'insensitive' as Prisma.QueryMode,
                        },
                      },
                    },
                  },
                  {
                    intake: {
                      intakeReference: {
                        contains: input.q,
                        mode: 'insensitive' as Prisma.QueryMode,
                      },
                    },
                  },
                  {
                    intake: {
                      shipment: {
                        trackingNumber: {
                          contains: input.q,
                          mode: 'insensitive' as Prisma.QueryMode,
                        },
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
    const rows = await this.db.assetSubmission.findMany({
      where: intakeWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.max(input.limit, 5000),
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true, publicUsername: true } },
            collectorSubscriptions: {
              where: { status: 'ACTIVE' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { plan: { select: { displayName: true } } },
            },
          },
        },
        category: { select: { name: true } },
        asset: {
          select: {
            slug: true,
            title: true,
            edition: true,
            cardNumber: true,
            gradeScaleEntry: {
              select: { label: true, company: { select: { code: true } } },
            },
            custodyRecord: { select: { status: true } },
            valuationDecisions: {
              where: { status: 'ACTIVE' },
              take: 1,
              select: { id: true },
            },
          },
        },
        intake: { include: { vault: true, shipment: true, receipt: true } },
        media: {
          where: { deletedAt: null, status: 'SAFE' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, slot: true, objectKey: true },
        },
      },
    });
    const visibleRows = this.config.isBeta
      ? rows.filter(
          (item) =>
            !isBetaFixtureSlug(item.asset?.slug ?? '') &&
            !isBetaFixtureSubmission(item.declaredMetadata),
        )
      : rows;
    const projected = await Promise.all(visibleRows.map(async (item) => {
      const intake = item.intake;
      const stage =
        item.asset?.custodyRecord?.status === 'INSPECTED'
          ? 'VERIFIED'
          : intakeStage(item);
      const metadata =
        item.declaredMetadata &&
        typeof item.declaredMetadata === 'object' &&
        !Array.isArray(item.declaredMetadata)
          ? (item.declaredMetadata as Record<string, unknown>)
          : {};
      const metadataString = (key: string) =>
        typeof metadata[key] === 'string' && String(metadata[key]).trim()
          ? String(metadata[key])
          : null;
      const exception =
        stage === 'EXCEPTION'
          ? {
              code: 'SHIPMENT_EXCEPTION',
              label: 'Shipping exception',
              severity: 'HIGH' as const,
            }
          : null;
      const frontMedia = item.media.find((media) => media.slot === 'front') ?? item.media[0];
      const thumbnailUrl = frontMedia
        ? await this.storage
            .createPrivateDownloadUrl(frontMedia.objectKey, new Date(Date.now() + 5 * 60_000))
            .catch(() => null)
        : null;
      return {
        id: intake?.id ?? item.id,
        submissionId: item.id,
        intakeReference: intake?.intakeReference ?? null,
        title:
          item.asset?.title ??
          metadataString('name') ??
          `Submission ${item.id.slice(0, 8)}`,
        thumbnailUrl,
        category: item.category.name,
        variant: metadataString('variant') ?? item.asset?.edition ?? null,
        grader:
          metadataString('grader') ??
          item.asset?.gradeScaleEntry?.company.code ??
          null,
        grade:
          metadataString('grade') ?? item.asset?.gradeScaleEntry?.label ?? null,
        itemCount: item.media.length,
        collector: {
          id: item.owner.id,
          displayName: item.owner.profile?.displayName ?? 'Unnamed collector',
          username: item.owner.profile?.publicUsername ?? null,
        },
        membership:
          item.owner.collectorSubscriptions[0]?.plan.displayName ?? null,
        submissionStatus: item.status,
        stage,
        currentStageSince: (intake?.updatedAt ?? item.updatedAt).toISOString(),
        vault: intake?.vault
          ? {
              id: intake.vault.id,
              displayName: intake.vault.displayName,
              region: intake.vault.region,
              countryCode: intake.vault.countryCode,
              code: intake.vault.id.slice(0, 6).toUpperCase(),
            }
          : null,
        shipment: intake?.shipment
          ? {
              carrier: intake.shipment.carrier,
              trackingNumber: intake.shipment.trackingNumber,
              status: intake.shipment.status,
              shippedAt: intake.shipment.shippedAt.toISOString(),
              deliveredAt: intake.shipment.deliveredAt?.toISOString() ?? null,
            }
          : null,
        receipt: intake?.receipt
          ? {
              confirmedAt: intake.receipt.confirmedAt.toISOString(),
              confirmedById: intake.receipt.confirmedById,
            }
          : null,
        updatedAt: item.updatedAt.toISOString(),
        nextAction: intake ? nextIntakeAction(intake) : 'Await vault selection',
        valuationStatus: item.asset
          ? item.asset.valuationDecisions.length
            ? 'ACTIVE'
            : 'PENDING'
          : null,
        custodyStatus: item.asset?.custodyRecord?.status ?? null,
        exception,
      };
    }));
    const filtered = projected
      .filter((item) => !input.status || item.stage === input.status)
      .filter(
        (item) => !input.carrier || item.shipment?.carrier === input.carrier,
      )
      .filter(
        (item) =>
          !input.dateFrom ||
          item.currentStageSince >= `${input.dateFrom}T00:00:00.000Z`,
      )
      .filter(
        (item) =>
          !input.dateTo ||
          item.currentStageSince < `${input.dateTo}T23:59:59.999Z`,
      );
    const counts = intakeCounts(filtered);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? input.limit;
    const start = Math.max(0, (page - 1) * pageSize);
    const items = filtered.slice(start, start + pageSize);
    const recentActivity = items.slice(0, 8).map((item) => ({
      id: item.id,
      type: item.stage,
      title: `${item.title} · ${stageLabel(item.stage)}`,
      reference: item.intakeReference ?? item.submissionId,
      occurredAt: item.currentStageSince,
    }));
    const vaults = await this.db.vaultIntakeLocation.findMany({
      where: { active: true, intakeAvailable: true },
      select: { id: true, displayName: true, operationallyApproved: true, acceptingShipments: true, environment: true, region: true, countryCode: true },
    });
    return {
      items,
      pagination: {
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
      counts,
      overview: counts,
      recentActivity,
      filters: {
        vaults: vaults.map((vault) => ({
          id: vault.id,
          displayName: vault.displayName,
          code: vault.id.slice(0, 6).toUpperCase(),
          operationallyApproved: vault.operationallyApproved,
          acceptingShipments: vault.acceptingShipments,
          environment: vault.environment,
          region: vault.region,
          countryCode: vault.countryCode,
        })),
        carriers: [
          ...new Set(
            projected
              .map((item) => item.shipment?.carrier)
              .filter((carrier): carrier is string => Boolean(carrier)),
          ),
        ].sort(),
      },
    };
  }

  async setIntakeDestinationApproval(
    actor: Actor,
    destinationId: string,
    input: { operationallyApproved: boolean; acceptingShipments: boolean; reason: string },
    requestId: string,
  ) {
    await this.authorization.authorize(actor, 'custody.manage', undefined, undefined, requestId);
    return this.db.$transaction(async (db) => {
      const destination = await db.vaultIntakeLocation.findUnique({ where: { id: destinationId } });
      if (!destination) throw new NotFoundException({ code: 'INTAKE_DESTINATION_NOT_FOUND', message: 'Intake destination not found.' });
      if (input.acceptingShipments && !input.operationallyApproved) {
        throw new ConflictException({ code: 'INTAKE_APPROVAL_REQUIRED', message: 'A destination must be operationally approved before accepting shipments.' });
      }
      const updated = await db.vaultIntakeLocation.update({
        where: { id: destinationId },
        data: { operationallyApproved: input.operationallyApproved, acceptingShipments: input.acceptingShipments },
      });
      await db.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'INTAKE_DESTINATION_APPROVAL_CHANGED',
          resourceType: 'vault-intake-location',
          resourceId: destinationId,
          requestId,
          result: 'SUCCESS',
          metadata: {
            reason: input.reason,
            previous: { operationallyApproved: destination.operationallyApproved, acceptingShipments: destination.acceptingShipments },
            next: { operationallyApproved: updated.operationallyApproved, acceptingShipments: updated.acceptingShipments },
          },
        },
      });
      return {
        id: updated.id,
        displayName: updated.displayName,
        operationallyApproved: updated.operationallyApproved,
        acceptingShipments: updated.acceptingShipments,
        audited: true,
      };
    });
  }

  async createOrUpdateIntakeDestination(
    actor: Actor,
    input: {
      id: string;
      displayName: string;
      receiverName: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      region: string;
      postalCode: string;
      countryCode: string;
      acceptedCategories: string[];
      shippingInstructions: string;
      environment: 'beta';
      active: boolean;
      acceptingShipments: boolean;
      operationallyApproved: boolean;
      reason: string;
    },
    requestId: string,
  ) {
    await this.authorization.authorize(actor, 'custody.manage', undefined, undefined, requestId);
    if (input.acceptingShipments && !input.operationallyApproved) {
      throw new ConflictException({ code: 'INTAKE_APPROVAL_REQUIRED', message: 'A destination must be operationally approved before accepting shipments.' });
    }
    const categories = await this.db.category.findMany({
      where: { name: { in: input.acceptedCategories }, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    const categoryNames = new Set(categories.map((category) => category.name.toLowerCase()));
    const missingCategories = input.acceptedCategories.filter((name) => !categoryNames.has(name.toLowerCase()));
    if (missingCategories.length) {
      throw new NotFoundException({ code: 'INTAKE_CATEGORY_NOT_FOUND', message: `Accepted category not found: ${missingCategories.join(', ')}` });
    }
    const address = [input.receiverName, input.addressLine1, input.addressLine2, input.city, input.region, input.postalCode, input.countryCode.toUpperCase()]
      .filter(Boolean)
      .join(', ');
    return this.db.$transaction(async (db) => {
      const previous = await db.vaultIntakeLocation.findUnique({ where: { id: input.id } });
      const updated = await db.vaultIntakeLocation.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          displayName: input.displayName,
          region: input.region,
          countryCode: input.countryCode.toUpperCase(),
          active: input.active,
          intakeAvailable: input.active,
          operationallyApproved: input.operationallyApproved,
          acceptingShipments: input.acceptingShipments,
          environment: input.environment,
          acceptedCategories: categories.map((category) => category.id),
          shippingInstructions: input.shippingInstructions,
          customerSafeAddress: address,
        },
        update: {
          displayName: input.displayName,
          region: input.region,
          countryCode: input.countryCode.toUpperCase(),
          active: input.active,
          intakeAvailable: input.active,
          operationallyApproved: input.operationallyApproved,
          acceptingShipments: input.acceptingShipments,
          environment: input.environment,
          acceptedCategories: categories.map((category) => category.id),
          shippingInstructions: input.shippingInstructions,
          customerSafeAddress: address,
        },
      });
      await db.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          actorType: 'USER',
          action: previous ? 'INTAKE_DESTINATION_UPDATED' : 'INTAKE_DESTINATION_CREATED',
          resourceType: 'vault-intake-location',
          resourceId: updated.id,
          requestId,
          result: 'SUCCESS',
          metadata: {
            reason: input.reason,
            previous: previous ? { active: previous.active, intakeAvailable: previous.intakeAvailable, operationallyApproved: previous.operationallyApproved, acceptingShipments: previous.acceptingShipments, environment: previous.environment } : null,
            next: { active: updated.active, intakeAvailable: updated.intakeAvailable, operationallyApproved: updated.operationallyApproved, acceptingShipments: updated.acceptingShipments, environment: updated.environment },
          },
        },
      });
      return {
        id: updated.id,
        displayName: updated.displayName,
        active: updated.active,
        intakeAvailable: updated.intakeAvailable,
        operationallyApproved: updated.operationallyApproved,
        acceptingShipments: updated.acceptingShipments,
        audited: true,
      };
    });
  }

  async confirmIntakeReceipt(
    actor: Actor,
    intakeId: string,
    idempotencyKey: string,
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    return this.db.$transaction(async (db) => {
      const intake = await db.submissionIntake.findUnique({
        where: { id: intakeId },
        include: {
          shipment: true,
          receipt: true,
          submission: { select: { ownerUserId: true } },
        },
      });
      if (!intake)
        throw new NotFoundException({
          code: 'INTAKE_NOT_FOUND',
          message: 'Intake record not found.',
        });
      if (intake.receipt?.auditReference === idempotencyKey)
        return {
          intakeId,
          status: 'RECEIVED',
          confirmedAt: intake.receipt.confirmedAt.toISOString(),
          confirmedById: intake.receipt.confirmedById,
          receiptId: intake.receipt.id,
          replayed: true,
        };
      if (intake.receipt)
        throw new ConflictException({
          code: 'RECEIPT_ALREADY_CONFIRMED',
          message: 'This intake has already been received by Slice.',
        });
      if (!intake.shipment || intake.shipment.status !== 'DELIVERED')
        throw new ConflictException({
          code: 'DELIVERY_NOT_CONFIRMED',
          message: 'Confirm carrier delivery before recording Slice receipt.',
        });
      const now = new Date();
      const receipt = await db.intakeReceiptConfirmation.create({
        data: {
          intakeId,
          confirmedById: actor.userId,
          shipmentRef: intake.shipment.trackingNumber,
          auditReference: idempotencyKey,
        },
      });
      await db.submissionIntake.update({
        where: { id: intakeId },
        data: { status: 'RECEIVED', receivedAt: now },
      });
      await db.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'INTAKE_RECEIPT_CONFIRMED',
          resourceType: 'intake',
          resourceId: intakeId,
          result: 'SUCCESS',
          metadata: { submissionId: intake.submissionId, idempotencyKey },
        },
      });
      await db.notification.create({
        data: {
          id: randomUUID(),
          userId: intake.submission.ownerUserId,
          type: 'INTAKE_RECEIVED',
          title: 'Slice received your collectible',
          body: 'Your collectible has been physically received by Slice and is moving to verification.',
          resourceType: 'submission',
          resourceId: intake.submissionId,
        },
      });
      return {
        intakeId,
        status: 'RECEIVED',
        confirmedAt: now.toISOString(),
        confirmedById: actor.userId,
        receiptId: receipt.id,
      };
    });
  }

  async listMemberships(
    actor: Actor,
    input: {
      status?: string;
      plan?: string;
      q?: string;
      page: number;
      pageSize: number;
      sort?: string;
      sortDirection?: 'asc' | 'desc';
    },
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const baseWhere: Prisma.CollectorSubscriptionWhereInput = {
      ...(input.plan
        ? { plan: { code: input.plan as 'STARTER' | 'PRO' | 'ELITE' } }
        : {}),
      ...(input.q
        ? {
            user: {
              OR: [
                { email: { contains: input.q, mode: 'insensitive' } },
                { profile: { displayName: { contains: input.q, mode: 'insensitive' } } },
                { profile: { publicUsername: { contains: input.q, mode: 'insensitive' } } },
                { id: { contains: input.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const where: Prisma.CollectorSubscriptionWhereInput = {
      ...baseWhere,
      ...(input.status
        ? { status: input.status as Prisma.CollectorSubscriptionWhereInput['status'] }
        : {}),
    };
    const orderBy =
      input.sort === 'collector'
        ? { user: { profile: { displayName: input.sortDirection ?? 'asc' } } }
        : input.sort === 'plan'
          ? { plan: { displayName: input.sortDirection ?? 'asc' } }
          : input.sort === 'billing'
            ? { currentPeriodEnd: input.sortDirection ?? 'asc' }
            : input.sort === 'status'
              ? { status: input.sortDirection ?? 'asc' }
              : { updatedAt: 'desc' as const };
    const [rows, total, statusRows, activePlanRows, recentEvents] = await Promise.all([
      this.db.collectorSubscription.findMany({
        where,
        orderBy: [orderBy, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          plan: {
            select: {
              code: true,
              displayName: true,
              monthlyPriceMinor: true,
              currency: true,
              entitlements: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true, publicUsername: true } },
            },
          },
        },
      }),
      this.db.collectorSubscription.count({ where }),
      this.db.collectorSubscription.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
      this.db.collectorSubscription.findMany({
        where: {
          ...baseWhere,
          status: { in: ['ACTIVE', 'TRIALING', 'CANCEL_AT_PERIOD_END'] },
        },
        select: { plan: { select: { code: true } } },
      }),
      this.db.auditEvent.findMany({
        where: {
          OR: [
            { action: { contains: 'MEMBERSHIP', mode: 'insensitive' } },
            { action: { contains: 'SUBSCRIPTION', mode: 'insensitive' } },
            { resourceType: { contains: 'membership', mode: 'insensitive' } },
            { resourceType: { contains: 'subscription', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: { id: true, action: true, resourceId: true, createdAt: true },
      }),
    ]);
    const userIds = rows.map((row) => row.user.id);
    const entitlementByUser = new Map(
      rows.map((row) => [row.user.id, row.plan.entitlements]),
    );
    const usageByUser = await collectorUsageForMany(
      this.db,
      userIds,
      entitlementByUser,
    );
    const statusOverview = {
      ACTIVE: 0,
      INCOMPLETE: 0,
      PAST_DUE: 0,
      CANCELLED: 0,
      CANCEL_AT_PERIOD_END: 0,
      TRIALING: 0,
      SUSPENDED: 0,
      EXPIRED: 0,
    } as Record<string, number>;
    for (const row of statusRows) statusOverview[row.status] = row._count._all;
    const planDistribution = { STARTER: 0, PRO: 0, ELITE: 0 };
    for (const row of activePlanRows) planDistribution[row.plan.code] += 1;
    const activityTitle = (action: string) => {
      if (action.includes('PAYMENT') || action.includes('INVOICE')) return 'Payment activity';
      if (action.includes('CANCEL')) return 'Membership canceled';
      if (action.includes('PLAN') || action.includes('UPGRADE')) return 'Plan updated';
      if (action.includes('TRIAL')) return 'Trial started';
      if (action.includes('RESUME')) return 'Membership resumed';
      return 'Membership activity';
    };
    const items = rows.map((item) => {
      const usage = usageByUser.get(item.user.id)!;
      const monthlyLimit = usage.maxMonthlySubmissions;
      const monthlyPercent = monthlyLimit
        ? Math.min(100, Math.round((usage.monthlySubmissionsUsed / monthlyLimit) * 100))
        : null;
      const activeLimit = usage.maxActiveCollectibles;
      const activePercent = activeLimit
        ? Math.min(100, Math.round((usage.activeCollectibles / activeLimit) * 100))
        : null;
      const concurrentAtLimit =
        usage.maxConcurrentIntake !== null && usage.concurrentIntake >= usage.maxConcurrentIntake;
      const overLimit = Boolean(
        (activeLimit !== null && usage.activeCollectibles > activeLimit) ||
          (monthlyLimit !== null && usage.monthlySubmissionsUsed > monthlyLimit) ||
          (usage.maxConcurrentIntake !== null && usage.concurrentIntake > usage.maxConcurrentIntake),
      );
      const warnings: string[] = [];
      if (overLimit) warnings.push('One or more plan limits are exceeded; new capacity-consuming actions may be blocked.');
      else if ((activePercent ?? 0) >= 80) warnings.push('Active collectible capacity is at least 80% used.');
      if (monthlyPercent !== null && monthlyPercent >= 80) warnings.push('Monthly submission allowance is at least 80% used.');
      if (concurrentAtLimit) warnings.push('Concurrent intake capacity is currently full.');
      const providerConfigured = Boolean(item.provider && item.provider !== 'STAGING_DEMO');
      const billingState = item.status === 'PAST_DUE'
        ? 'PAST_DUE'
        : item.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : item.status === 'INCOMPLETE'
            ? 'PENDING'
            : providerConfigured
              ? 'CURRENT'
              : 'DISABLED';
      return {
        id: item.id,
        collector: {
          id: item.user.id,
          displayName: item.user.profile?.displayName ?? 'Unnamed collector',
          username: item.user.profile?.publicUsername ?? null,
          email: item.user.email,
        },
        membership: {
          planId: item.plan.code,
          planName: item.plan.displayName,
          status: item.status,
          source: item.provider === 'STAGING_DEMO' ? 'STAGING_DEMO' : item.provider ? 'PROVIDER' : 'MANUAL',
          currentPeriodStart: item.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: item.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: item.cancelAtPeriodEnd,
          trialEnd: null,
          providerConfigured,
          billingState,
          betaEntitlement: item.provider === 'STAGING_DEMO',
        },
        plan: {
          code: item.plan.code,
          displayName: item.plan.displayName,
          monthlyPriceMinor: item.plan.monthlyPriceMinor.toString(),
          currency: item.plan.currency,
        },
        usage: {
          activeCollectibles: usage.activeCollectibles,
          activeCollectiblesLimit: activeLimit,
          activeCollectiblesPercent: activePercent,
          monthlySubmissions: usage.monthlySubmissionsUsed,
          monthlySubmissionsLimit: monthlyLimit,
          monthlySubmissionsPercent: monthlyPercent,
          concurrentIntake: usage.concurrentIntake,
          concurrentIntakeLimit: usage.maxConcurrentIntake,
          concurrentIntakeAtLimit: concurrentAtLimit,
          billingPeriodStart: usage.billingPeriodStart,
          billingPeriodEnd: usage.billingPeriodEnd,
        },
        billing: {
          nextBillingDate: item.currentPeriodEnd?.toISOString() ?? null,
          health: billingState,
        },
        entitlements:
          item.plan.entitlements && typeof item.plan.entitlements === 'object' && !Array.isArray(item.plan.entitlements)
            ? item.plan.entitlements
            : {},
        overLimit,
        warnings,
        eligibleActions: providerConfigured
          ? item.status === 'CANCEL_AT_PERIOD_END'
            ? ['RESUME', 'CHANGE_PLAN']
            : item.status === 'CANCELLED' || item.status === 'EXPIRED'
              ? ['CHANGE_PLAN']
              : ['CHANGE_PLAN', 'CANCEL']
          : [],
        updatedAt: item.updatedAt.toISOString(),
      };
    });
    const count = (status: string) => statusOverview[status] ?? 0;
    return {
      items,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
      kpis: {
        active: count('ACTIVE'),
        starter: planDistribution.STARTER,
        pro: planDistribution.PRO,
        elite: planDistribution.ELITE,
        pastDue: count('PAST_DUE'),
        trialing: count('TRIALING'),
        total,
      },
      statusOverview,
      planDistribution,
      recentActivity: recentEvents.map((event) => ({
        id: event.id,
        title: activityTitle(event.action),
        reference: event.resourceId,
        occurredAt: event.createdAt.toISOString(),
      })),
    };
  }

  async listUsers(
    actor: Actor,
    input: {
      q?: string;
      role?: string;
      status?: string;
      type?: string;
      membershipPlan?: string;
      membershipStatus?: string;
      financialState?: string;
      complianceState?: string;
      payoutState?: string;
      joinedFrom?: string;
      joinedTo?: string;
      lastActiveWindow?: string;
      sort?: string;
      sortDirection?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
      limit: number;
      cursor?: string;
    },
  ) {
    await this.authorization.authorize(actor, 'users.read');
    const policyActor = {
      actorType: 'USER' as const,
      userId: actor.userId,
      accountStatus: actor.status,
      roles: actor.roles as never,
    };
    const financeAccess = evaluatePolicy({ actor: policyActor, action: 'finance.read' }).allowed;
    const complianceAccess = evaluatePolicy({ actor: policyActor, action: 'compliance.read' }).allowed;
    const staffRoles = [
      'SUPPORT',
      'COMPLIANCE_ANALYST',
      'ASSET_REVIEWER',
      'VAULT_OPERATOR',
      'FINANCE_OPERATOR',
    ];
    const investorCapability: Prisma.UserWhereInput = {
      OR: [
        { portfolioLots: { some: { status: 'OPEN' } } },
        {
          tradingOrders: {
            some: { status: { in: ['OPEN', 'PARTIALLY_FILLED', 'FILLED'] } },
          },
        },
      ],
    };
    const joinedFrom = input.joinedFrom
      ? new Date(input.joinedFrom)
      : undefined;
    const joinedTo = input.joinedTo
      ? new Date(
          /^\d{4}-\d{2}-\d{2}$/.test(input.joinedTo)
            ? `${input.joinedTo}T23:59:59.999Z`
            : input.joinedTo,
        )
      : undefined;
    const lastActiveCutoff =
      input.lastActiveWindow && /^\d+$/.test(input.lastActiveWindow)
        ? new Date(
            Date.now() - Number(input.lastActiveWindow) * 24 * 60 * 60 * 1000,
          )
        : undefined;
    const whereAnd: Prisma.UserWhereInput[] = [];
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { accountStatus: input.status as never } : {}),
      ...(joinedFrom || joinedTo
        ? {
            createdAt: {
              ...(joinedFrom && !Number.isNaN(joinedFrom.getTime())
                ? { gte: joinedFrom }
                : {}),
              ...(joinedTo && !Number.isNaN(joinedTo.getTime())
                ? { lte: joinedTo }
                : {}),
            },
          }
        : {}),
      ...(input.lastActiveWindow === 'inactive'
        ? {
            lastLoginAt: {
              lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          }
        : lastActiveCutoff
          ? { lastLoginAt: { gte: lastActiveCutoff } }
          : {}),
      ...(input.membershipPlan || input.membershipStatus
        ? {
            collectorSubscriptions: {
              some: {
                ...(input.membershipPlan
                  ? { plan: { code: input.membershipPlan as never } }
                  : {}),
                ...(input.membershipStatus
                  ? { status: input.membershipStatus as never }
                  : {}),
              },
            },
          }
        : {}),
      ...(input.q
        ? {
            OR: [
              { id: { contains: input.q, mode: 'insensitive' } },
              { email: { contains: input.q, mode: 'insensitive' } },
              {
                profile: {
                  publicUsername: { contains: input.q, mode: 'insensitive' },
                },
              },
              {
                profile: {
                  displayName: { contains: input.q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const financialExceptionWhere: Prisma.UserWhereInput = {
      OR: [
        { financialDeficits: { some: { status: { in: ['OPEN', 'PARTIALLY_RECOVERED'] } } } },
        { moneyMovements: { some: { type: 'DEPOSIT', status: { in: ['RETURNED', 'MANUAL_REVIEW'] } } } },
        { externalFinancialAccounts: { some: { riskState: { in: ['SHARED_INSTRUMENT_REVIEW', 'MANUAL_REVIEW_REQUIRED'] } } } },
        { bankWithdrawalHoldUntil: { gt: new Date() } },
      ],
    };
    if (input.financialState === 'CLEAR') whereAnd.push({ NOT: financialExceptionWhere });
    if (input.financialState === 'FINANCIAL_DEFICIT') {
      whereAnd.push({ financialDeficits: { some: { status: { in: ['OPEN', 'PARTIALLY_RECOVERED'] } } } });
    } else if (input.financialState === 'RETURNED_DEPOSIT') {
      whereAnd.push({ moneyMovements: { some: { type: 'DEPOSIT', status: 'RETURNED' } } });
    } else if (input.financialState === 'MANUAL_REVIEW') {
      whereAnd.push({
        OR: [
          { moneyMovements: { some: { type: 'DEPOSIT', status: 'MANUAL_REVIEW' } } },
          { externalFinancialAccounts: { some: { riskState: { in: ['SHARED_INSTRUMENT_REVIEW', 'MANUAL_REVIEW_REQUIRED'] } } } },
        ],
      });
    } else if (input.financialState === 'WITHDRAWAL_HOLD') {
      whereAnd.push({ bankWithdrawalHoldUntil: { gt: new Date() } });
    } else if (input.financialState === 'BANK_CLEARING') {
      whereAnd.push({ moneyMovements: { some: { type: 'DEPOSIT', status: 'HELD', cashAccount: { code: 'BACS_RISK_HOLD' } } } });
    }
    if (input.complianceState === 'VERIFIED') {
      whereAnd.push({ complianceCases: { some: { OR: [{ status: 'APPROVED' }, { identityState: 'VERIFIED' }] } } });
    } else if (input.complianceState === 'REVIEW_REQUIRED') {
      whereAnd.push({ complianceCases: { some: { status: { in: ['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'SUSPENDED'] } } } });
    } else if (input.complianceState === 'INCOMPLETE') {
      whereAnd.push({ complianceCases: { some: { status: { in: ['NOT_STARTED', 'EXPIRED'] } } } });
    } else if (input.complianceState === 'RESTRICTED') {
      whereAnd.push({ complianceCases: { some: { status: 'SUSPENDED' } } });
    }
    if (input.payoutState === 'READY') {
      whereAnd.push({ externalConnectAccounts: { some: { status: 'READY', payoutsEnabled: true, transfersCapability: 'active' } } });
    } else if (input.payoutState === 'RESTRICTED') {
      whereAnd.push({ externalConnectAccounts: { some: { status: { in: ['UNDER_REVIEW', 'RESTRICTED', 'DISABLED'] } } } });
    } else if (input.payoutState === 'SETUP_REQUIRED') {
      whereAnd.push({
        OR: [
          { externalConnectAccounts: { none: {} } },
          { externalConnectAccounts: { some: { status: { in: ['NOT_STARTED', 'ACTION_REQUIRED'] } } } },
        ],
      });
    }
    const roleFilters: Prisma.UserWhereInput[] = [];
    if (input.role)
      roleFilters.push({
        roleAssignments: {
          some: { role: input.role as never, revokedAt: null },
        },
      });
    if (input.type === 'COLLECTOR')
      roleFilters.push({
        roleAssignments: { some: { role: 'COLLECTOR', revokedAt: null } },
      });
    else if (input.type === 'STAFF')
      roleFilters.push({
        roleAssignments: {
          some: { role: { in: staffRoles as never[] }, revokedAt: null },
        },
      });
    else if (input.type === 'ADMIN')
      roleFilters.push({
        roleAssignments: { some: { role: 'ADMIN', revokedAt: null } },
      });
    else if (input.type === 'INVESTOR') roleFilters.push(investorCapability);
    whereAnd.push(...roleFilters);
    if (whereAnd.length) where.AND = whereAnd;
    const direction = input.sortDirection ?? 'desc';
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      input.sort === 'lastActive'
        ? [{ lastLoginAt: direction }, { id: 'desc' }]
        : input.sort === 'username'
          ? [{ profile: { publicUsername: direction } }, { id: 'desc' }]
          : [{ createdAt: direction }, { id: 'desc' }];
    const pageSize = input.pageSize ?? input.limit;
    const pageNumber = Math.max(1, input.page ?? 1);
    const [
      users,
      total,
      activeUsers,
      restricted,
      suspended,
      pastDueMemberships,
      trialingMemberships,
      totalUsers,
      collectorAssignments,
      investorUsers,
      staffAssignments,
      adminAssignments,
      pendingReviewUsers,
      financialExceptionUsers,
    ] = await Promise.all([
      this.db.user.findMany({
        where,
        orderBy,
        take: pageSize,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : { skip: (pageNumber - 1) * pageSize }),
        select: {
          id: true,
          email: true,
          accountStatus: true,
          createdAt: true,
          lastLoginAt: true,
          bankWithdrawalHoldUntil: true,
          profile: { select: { displayName: true, publicUsername: true } },
          collectorSubscriptions: {
            where: { status: { notIn: ['CANCELLED', 'EXPIRED'] } },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { status: true, plan: { select: { code: true } } },
          },
          roleAssignments: {
            where: { revokedAt: null },
            select: {
              id: true,
              role: true,
              scopeType: true,
              scopeId: true,
              createdAt: true,
            },
          },
          financialDeficits: {
            where: { status: { in: ['OPEN', 'PARTIALLY_RECOVERED'] } },
            select: { amountMinor: true, recoveredMinor: true, status: true },
          },
          moneyMovements: {
            where: {
              type: 'DEPOSIT',
              OR: [
                { status: { in: ['RETURNED', 'MANUAL_REVIEW'] } },
                { status: 'HELD', cashAccount: { code: 'BACS_RISK_HOLD' } },
              ],
            },
            select: { amountMinor: true, status: true, cashAccount: { select: { code: true } } },
          },
          externalFinancialAccounts: {
            select: { riskState: true },
          },
          complianceCases: {
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 5,
            select: { status: true, identityState: true, type: true, updatedAt: true },
          },
          externalConnectAccounts: {
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { status: true, detailsSubmitted: true, payoutsEnabled: true, transfersCapability: true },
          },
        },
      }),
      this.db.user.count({ where }),
      this.db.user.count({ where: { accountStatus: 'ACTIVE' } }),
      this.db.user.count({ where: { accountStatus: 'RESTRICTED' } }),
      this.db.user.count({ where: { accountStatus: 'SUSPENDED' } }),
      this.db.collectorSubscription.count({ where: { status: 'PAST_DUE' } }),
      this.db.collectorSubscription.count({ where: { status: 'TRIALING' } }),
      this.db.user.count(),
      this.db.roleAssignment.findMany({
        where: { role: 'COLLECTOR', revokedAt: null },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.db.user.count({ where: investorCapability }),
      this.db.roleAssignment.findMany({
        where: { role: { in: staffRoles as never[] }, revokedAt: null },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.db.roleAssignment.findMany({
        where: { role: 'ADMIN', revokedAt: null },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.db.user.count({ where: { accountStatus: 'PENDING_REVIEW' } }),
      financeAccess ? this.db.user.count({ where: financialExceptionWhere }) : Promise.resolve(null),
    ]);
    const items = users.map((user) => {
      const roleNames = user.roleAssignments.map(
        (assignment) => assignment.role,
      );
      const primaryType = roleNames.includes('ADMIN')
        ? 'ADMIN'
        : staffRoles.some((role) => roleNames.includes(role as never))
          ? 'STAFF'
          : roleNames.includes('COLLECTOR')
            ? 'COLLECTOR'
            : 'INVESTOR';
      const hasDeficit = user.financialDeficits.length > 0;
      const hasReturnedDeposit = user.moneyMovements.some((movement) => movement.status === 'RETURNED');
      const hasManualReview = user.moneyMovements.some((movement) => movement.status === 'MANUAL_REVIEW');
      const hasBacsHold = user.moneyMovements.some(
        (movement) => movement.status === 'HELD' && movement.cashAccount.code === 'BACS_RISK_HOLD',
      );
      const hasSharedInstrumentReview = user.externalFinancialAccounts.some((account) =>
        ['SHARED_INSTRUMENT_REVIEW', 'MANUAL_REVIEW_REQUIRED'].includes(account.riskState),
      );
      const hasWithdrawalHold = Boolean(user.bankWithdrawalHoldUntil && user.bankWithdrawalHoldUntil > new Date());
      const financialExceptionCount = [
        hasDeficit,
        hasReturnedDeposit,
        hasManualReview,
        hasSharedInstrumentReview,
        hasWithdrawalHold,
      ].filter(Boolean).length;
      const financialState = hasDeficit
        ? 'FINANCIAL_DEFICIT'
        : hasReturnedDeposit
          ? 'RETURNED_DEPOSIT'
          : hasManualReview || hasSharedInstrumentReview
            ? 'MANUAL_REVIEW'
            : hasWithdrawalHold
              ? 'WITHDRAWAL_HOLD'
              : hasBacsHold
                ? 'BANK_CLEARING'
                : 'CLEAR';
      const outstandingDeficitMinor = user.financialDeficits.reduce(
        (total, item) => total + item.amountMinor - item.recoveredMinor,
        0n,
      );
      const bacsHeldMinor = user.moneyMovements
        .filter((movement) => movement.status === 'HELD' && movement.cashAccount.code === 'BACS_RISK_HOLD')
        .reduce((total, item) => total + item.amountMinor, 0n);
      const latestCompliance = user.complianceCases[0] ?? null;
      const hasComplianceReview = user.complianceCases.some((item) =>
        ['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'SUSPENDED'].includes(item.status),
      );
      const complianceState = latestCompliance
        ? latestCompliance.status === 'SUSPENDED'
          ? 'RESTRICTED'
          : latestCompliance.status === 'APPROVED' || latestCompliance.identityState === 'VERIFIED'
            ? 'VERIFIED'
            : hasComplianceReview
              ? 'REVIEW_REQUIRED'
              : ['NOT_STARTED', 'EXPIRED'].includes(latestCompliance.status)
                ? 'INCOMPLETE'
                : 'REVIEW_REQUIRED'
        : 'INCOMPLETE';
      const payout = user.externalConnectAccounts[0] ?? null;
      const payoutState = payout
        ? payout.status === 'READY' && payout.payoutsEnabled && payout.transfersCapability === 'active'
          ? 'READY'
          : ['UNDER_REVIEW', 'RESTRICTED', 'DISABLED'].includes(payout.status)
            ? 'RESTRICTED'
            : 'SETUP_REQUIRED'
        : 'SETUP_REQUIRED';
      return {
        id: user.id,
        displayName: user.profile?.displayName ?? 'Unnamed user',
        username: user.profile?.publicUsername ?? null,
        email: user.email,
        primaryType,
        accountStatus: user.accountStatus,
        roles: user.roleAssignments.map((assignment) => ({
          ...assignment,
          createdAt: assignment.createdAt.toISOString(),
        })),
        createdAt: user.createdAt.toISOString(),
        lastActivityAt: user.lastLoginAt?.toISOString() ?? null,
        accountStateReason:
          user.accountStatus === 'PENDING_REVIEW'
            ? complianceState === 'REVIEW_REQUIRED' || complianceState === 'INCOMPLETE'
              ? 'Compliance review'
              : financialExceptionCount > 0
                ? 'Financial review'
                : 'Staff review'
            : user.accountStatus === 'RESTRICTED'
              ? financialState === 'FINANCIAL_DEFICIT'
                ? 'Financial deficit'
                : 'Manual review'
              : user.accountStatus === 'SUSPENDED'
                ? 'Suspended account'
                : null,
        financialState: financeAccess ? financialState : financialExceptionCount > 0 ? 'FINANCIAL_REVIEW' : 'UNAVAILABLE',
        financialExceptionCount: financeAccess ? financialExceptionCount : null,
        financialAmountMinor: financeAccess ? outstandingDeficitMinor.toString() : null,
        bacsHeldMinor: financeAccess ? bacsHeldMinor.toString() : null,
        complianceState: complianceAccess ? complianceState : user.complianceCases.length > 0 ? 'REVIEW' : 'UNAVAILABLE',
        complianceReason: complianceAccess && latestCompliance && hasComplianceReview ? latestCompliance.type : null,
        payoutState,
        payoutReason: payoutState === 'READY' ? null : payout ? 'Payout setup requires attention' : 'Payout setup not started',
        membership: user.collectorSubscriptions[0]
          ? {
              plan: user.collectorSubscriptions[0].plan.code,
              status: user.collectorSubscriptions[0].status,
            }
          : { plan: null, status: null },
      };
    });
    return {
      items,
      nextCursor:
        items.length === pageSize && items.length
          ? (items.at(-1)?.id ?? null)
          : null,
      total,
      summary: {
        totalUsers,
        collectors: collectorAssignments.length,
        investors: investorUsers,
        staff: staffAssignments.length,
        admins: adminAssignments.length,
        activeUsers,
        pendingReview: pendingReviewUsers,
        restricted,
        suspended,
        financialExceptions: financialExceptionUsers,
        pastDueMemberships,
        trialingMemberships,
      },
    };
  }

  async userDetail(actor: Actor, userId: string) {
    await this.authorization.authorize(actor, 'users.read', userId as never);
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        accountStatus: true,
        createdAt: true,
        lastLoginAt: true,
        profile: {
          select: {
            displayName: true,
            publicUsername: true,
            countryCode: true,
            timezone: true,
            preferredCurrency: true,
          },
        },
        discordAccountLink: {
          select: { username: true, displayName: true, linkedAt: true },
        },
        twoFactor: { select: { enabledAt: true } },
        smsTwoFactor: { select: { enabledAt: true } },
        roleAssignments: {
          where: { revokedAt: null },
          select: {
            id: true,
            role: true,
            scopeType: true,
            scopeId: true,
            assignedByUserId: true,
            createdAt: true,
          },
        },
        statusHistory: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
          select: {
            fromStatus: true,
            toStatus: true,
            reason: true,
            actorUserId: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            submissions: true,
            complianceCases: true,
            financialAccounts: true,
            moneyMovements: true,
            auditEvents: true,
          },
        },
        collectorSubscriptions: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            plan: { select: { code: true, displayName: true } },
          },
        },
        publicCollectorProfile: {
          select: {
            slug: true,
            isPublic: true,
            isFeatured: true,
            featuredAt: true,
            publishedAt: true,
          },
        },
      },
    });
    if (!user)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found.',
      });
    const [
      activeIntakes,
      collectorAssets,
      totalAssets,
      invested,
      openOrders,
      activeListings,
      recentOrders,
      financialAccounts,
      pendingMovements,
      withdrawn,
      complianceCases,
      activityRows,
    ] = await Promise.all([
      this.db.submissionIntake.count({
        where: {
          submission: {
            ownerUserId: userId,
            status: { notIn: ['DRAFT', 'CANCELLED', 'REJECTED'] },
          },
          status: { not: 'COMPLETE' },
        },
      }),
      this.db.portfolioLot.findMany({
        where: { userId, status: 'OPEN' },
        orderBy: [{ acquiredAt: 'desc' }, { id: 'desc' }],
        take: 4,
        include: { asset: { select: { id: true, title: true, slug: true } } },
      }),
      this.db.portfolioLot.count({ where: { userId, status: 'OPEN' } }),
      this.db.portfolioLot.aggregate({
        where: { userId, status: 'OPEN' },
        _sum: { totalCostMinor: true },
      }),
      this.db.tradingOrder.count({
        where: {
          userId,
          status: { in: ['PENDING_RESERVATION', 'OPEN', 'PARTIALLY_FILLED'] },
        },
      }),
      this.db.tradingOrder.count({
        where: {
          userId,
          side: 'SELL',
          status: { in: ['PENDING_RESERVATION', 'OPEN', 'PARTIALLY_FILLED'] },
        },
      }),
      this.db.tradingOrder.findMany({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          id: true,
          side: true,
          originalUnits: true,
          limitPriceMinor: true,
          status: true,
          updatedAt: true,
          asset: { select: { title: true } },
        },
      }),
      this.db.financialAccount.findMany({
        where: { ownerType: 'USER', ownerUserId: userId, status: 'ACTIVE' },
        select: {
          currency: true,
          normalSide: true,
          balance: true,
        },
      }),
      this.db.moneyMovement.aggregate({
        where: {
          userId,
          status: { in: ['CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW', 'HELD'] },
        },
        _sum: { amountMinor: true },
      }),
      this.db.moneyMovement.aggregate({
        where: { userId, type: 'WITHDRAWAL', status: 'SETTLED' },
        _sum: { amountMinor: true },
      }),
      this.db.complianceCase.findMany({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: { type: true, status: true, provider: true, updatedAt: true },
      }),
      this.db.auditEvent.findMany({
        where: { actorUserId: userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: {
          id: true,
          action: true,
          resourceType: true,
          createdAt: true,
        },
      }),
    ]);
    const wallet = financialAccounts.length
      ? financialAccounts.reduce(
          (summary, account) => {
            const balance = account.balance;
            const gross = balance
              ? account.normalSide === 'DEBIT'
                ? balance.postedDebitMinor - balance.postedCreditMinor
                : balance.postedCreditMinor - balance.postedDebitMinor
              : 0n;
            const reserved = balance?.reservedMinor ?? 0n;
            summary.available += gross - reserved;
            summary.reserved += reserved;
            summary.currency = summary.currency ?? account.currency;
            return summary;
          },
          { available: 0n, reserved: 0n, currency: null as string | null },
        )
      : null;
    const latestCompliance = complianceCases[0];
    const kycCase = complianceCases.find((item) => item.type.includes('KYC'));
    const kytCase = complianceCases.find((item) => item.type.includes('KYT'));
    const roleNames = user.roleAssignments.map((assignment) => assignment.role);
    const staffRoles = [
      'SUPPORT',
      'COMPLIANCE_ANALYST',
      'ASSET_REVIEWER',
      'VAULT_OPERATOR',
      'FINANCE_OPERATOR',
    ];
    const primaryType = roleNames.includes('ADMIN')
      ? 'ADMIN'
      : staffRoles.some((role) => roleNames.includes(role as never))
        ? 'STAFF'
        : roleNames.includes('COLLECTOR')
          ? 'COLLECTOR'
          : 'INVESTOR';
    const collectorEnabled = Boolean(
      user.collectorSubscriptions.length ||
      user.roleAssignments.some((role) => role.role === 'COLLECTOR'),
    );
    return {
      id: user.id,
      displayName: user.profile?.displayName ?? 'Unnamed user',
      username: user.profile?.publicUsername ?? null,
      email: user.email,
      primaryType,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt.toISOString(),
      lastActivityAt: user.lastLoginAt?.toISOString() ?? null,
      profile: user.profile,
      roles: user.roleAssignments.map((assignment) => ({
        ...assignment,
        createdAt: assignment.createdAt.toISOString(),
      })),
      membership: user.collectorSubscriptions[0]
        ? {
            plan: user.collectorSubscriptions[0].plan.code,
            status: user.collectorSubscriptions[0].status,
          }
        : { plan: null, status: null },
      statusHistory: user.statusHistory.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
      counts: user._count,
      collector: collectorEnabled
        ? {
            publicDirectory: user.publicCollectorProfile
              ? {
                  slug: user.publicCollectorProfile.slug,
                  isPublic: user.publicCollectorProfile.isPublic,
                  isFeatured: user.publicCollectorProfile.isFeatured,
                  featuredAt: user.publicCollectorProfile.featuredAt?.toISOString() ?? null,
                  publishedAt: user.publicCollectorProfile.publishedAt?.toISOString() ?? null,
                }
              : null,
            subscription: user.collectorSubscriptions[0]
              ? {
                  plan: user.collectorSubscriptions[0].plan.displayName,
                  status: user.collectorSubscriptions[0].status,
                  currentPeriodEnd:
                    user.collectorSubscriptions[0].currentPeriodEnd?.toISOString() ??
                    null,
                  cancelAtPeriodEnd:
                    user.collectorSubscriptions[0].cancelAtPeriodEnd,
                }
              : null,
            activeIntakes,
          }
        : null,
      identity: {
        phone: user.phoneE164 ? maskPhoneForAdmin(user.phoneE164) : null,
        country: user.profile?.countryCode ?? null,
        discord: {
          connected: Boolean(user.discordAccountLink),
          username: user.discordAccountLink?.username ?? null,
          displayName: user.discordAccountLink?.displayName ?? null,
          linkedAt: user.discordAccountLink?.linkedAt.toISOString() ?? null,
        },
        twoFactorEnabled: Boolean(user.twoFactor?.enabledAt || user.smsTwoFactor?.enabledAt),
      },
      complianceSummary: {
        kycStatus: kycCase?.status ?? 'UNKNOWN',
        kytStatus: kytCase?.status ?? 'UNKNOWN',
        provider: latestCompliance?.provider ?? null,
        lastReviewAt: latestCompliance?.updatedAt.toISOString() ?? null,
        caseCount: user._count.complianceCases,
      },
      portfolioSummary: {
        totalValueMinor: null,
        totalInvestedMinor: (invested._sum.totalCostMinor ?? 0n).toString(),
        totalWithdrawnMinor: (withdrawn._sum.amountMinor ?? 0n).toString(),
        totalAssets,
        activeListings,
        openOrders,
        currency: wallet?.currency ?? user.profile?.preferredCurrency ?? 'GBP',
      },
      walletSummary: wallet
        ? {
            availableMinor: wallet.available.toString(),
            reservedMinor: wallet.reserved.toString(),
            pendingMinor: (pendingMovements._sum.amountMinor ?? 0n).toString(),
            totalMinor: (wallet.available + wallet.reserved).toString(),
            currency: wallet.currency ?? 'GBP',
          }
        : null,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        side: order.side,
        assetTitle: order.asset.title,
        units: order.originalUnits.toString(),
        limitPriceMinor: order.limitPriceMinor.toString(),
        currency: user.profile?.preferredCurrency ?? 'GBP',
        status: order.status,
        updatedAt: order.updatedAt.toISOString(),
      })),
      collectorOverview: collectorEnabled
        ? {
            assets: collectorAssets.map((lot) => ({
              id: lot.asset.id,
              title: lot.asset.title,
              slug: lot.asset.slug,
              units: lot.remainingUnits.toString(),
            })),
            additionalAssets: Math.max(0, totalAssets - collectorAssets.length),
            activeIntakes,
            submissions: user._count.submissions,
          }
        : null,
      activitySnapshot: activityRows.map((activity) => ({
        id: activity.id,
        action: activity.action,
        resourceType: activity.resourceType,
        occurredAt: activity.createdAt.toISOString(),
      })),
    };
  }

  async complianceCases(actor: Actor, limit: number) {
    await this.authorization.authorize(actor, 'compliance.read');
    const cases = await this.db.complianceCase.findMany({
      where: { status: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED'] } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        provider: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            profile: { select: { displayName: true, publicUsername: true } },
          },
        },
      },
    });
    return {
      items: cases.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        user: {
          id: item.user.id,
          displayName: item.user.profile?.displayName ?? 'Unnamed user',
          username: item.user.profile?.publicUsername ?? null,
        },
      })),
    };
  }

  async trustSupportDashboard(actor: Actor) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const openCaseStatuses = ['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'SUSPENDED'] as const;
    const openTicketStatuses = ['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF', 'ESCALATED'] as const;
    const [openComplianceCases, restrictedUsers, openTickets, unassignedTickets, escalations, cases, holds, tickets, activity] = await Promise.all([
      this.db.complianceCase.count({ where: { status: { in: [...openCaseStatuses] } } }),
      this.db.complianceHold.findMany({ where: { status: 'ACTIVE' }, distinct: ['userId'], select: { userId: true } }),
      this.db.discordTicket.count({ where: { status: { in: [...openTicketStatuses] } } }),
      this.db.discordTicket.count({ where: { status: { in: [...openTicketStatuses] }, assignedStaffId: null } }),
      this.db.discordTicket.count({ where: { status: 'ESCALATED' } }),
      this.db.complianceCase.findMany({
        where: { status: { in: [...openCaseStatuses] } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: { id: true, type: true, status: true, createdAt: true, updatedAt: true, user: { select: { profile: { select: { displayName: true, publicUsername: true } } } } },
      }),
      this.db.complianceHold.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: { id: true, scope: true, createdAt: true, user: { select: { profile: { select: { displayName: true, publicUsername: true } } } } },
      }),
      this.db.discordTicket.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: { id: true, subject: true, category: true, status: true, priority: true, updatedAt: true, createdAt: true },
      }),
      this.db.auditEvent.findMany({
        where: { OR: [
          { action: { contains: 'COMPLIANCE', mode: 'insensitive' } },
          { action: { contains: 'HOLD', mode: 'insensitive' } },
          { action: { contains: 'TICKET', mode: 'insensitive' } },
          { action: { contains: 'ESCALAT', mode: 'insensitive' } },
        ] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true },
      }),
    ]);
    const activityItems = [
      ...activity.map((event) => ({ id: event.id, type: event.resourceType, title: event.action.replace(/_/g, ' '), detail: event.resourceId ? `Reference ${event.resourceId.slice(0, 12)}` : 'Trust & Support event', occurredAt: event.createdAt.toISOString() })),
      ...tickets.map((ticket) => ({ id: `ticket-${ticket.id}`, type: 'support-ticket', title: `Support ticket ${ticket.status.toLowerCase().replace(/_/g, ' ')}`, detail: ticket.subject, occurredAt: ticket.updatedAt.toISOString() })),
      ...holds.map((hold) => ({ id: `hold-${hold.id}`, type: 'restriction', title: 'Account restriction active', detail: `${hold.user.profile?.displayName ?? 'User'} · ${hold.scope}`, occurredAt: hold.createdAt.toISOString() })),
      ...cases.map((item) => ({ id: `case-${item.id}`, type: 'compliance-case', title: `Compliance case ${item.status.toLowerCase().replace(/_/g, ' ')}`, detail: `${item.user.profile?.displayName ?? 'User'} · ${item.type}`, occurredAt: item.updatedAt.toISOString() })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);
    return {
      kpis: { openComplianceCases, restrictedAccounts: restrictedUsers.length, openTickets, unassignedTickets, escalations },
      overview: {
        complianceCases: openComplianceCases,
        restrictedAccounts: restrictedUsers.length,
        openTickets,
        unassignedTickets,
        escalations,
      },
      recentActivity: activityItems,
    };
  }

  async trustSupportRecords(
    actor: Actor,
    input: { tab: string; q?: string; status?: string; type?: string; severity?: string; priority?: string; scope?: string; source?: string; page: number; pageSize: number },
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const skip = (input.page - 1) * input.pageSize;
    const take = input.pageSize;
    const openCaseStatuses = ['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'SUSPENDED'] as const;
    const ref = (prefix: string, id: string, at: Date) => `${prefix}-${at.getUTCFullYear()}-${id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
    if (input.tab === 'compliance') {
      const where: Prisma.ComplianceCaseWhereInput = {
        status: input.status && openCaseStatuses.includes(input.status as (typeof openCaseStatuses)[number]) ? input.status as never : { in: [...openCaseStatuses] },
        ...(input.type && ['KYC', 'KYT'].includes(input.type) ? { type: input.type as never } : {}),
        ...(input.q ? { OR: [
          { id: { contains: input.q, mode: 'insensitive' } },
          { type: { equals: input.q.toUpperCase() as never } },
          { user: { email: { contains: input.q, mode: 'insensitive' } } },
          { user: { profile: { displayName: { contains: input.q, mode: 'insensitive' } } } },
          { user: { profile: { publicUsername: { contains: input.q, mode: 'insensitive' } } } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.complianceCase.findMany({ where, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, provider: true, type: true, status: true, createdAt: true, updatedAt: true, user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } }),
        this.db.complianceCase.count({ where }),
      ]);
      return this.trustSupportPage(input, total, rows.map((item) => ({ id: item.id, kind: 'compliance', caseReference: ref('COMP', item.id, item.createdAt), user: { id: item.user.id, displayName: item.user.profile?.displayName ?? 'Unnamed user', username: item.user.profile?.publicUsername ?? null, email: item.user.email }, caseType: item.type, status: item.status, severity: null, provider: item.provider, providerStatus: item.status === 'NOT_STARTED' ? 'UNKNOWN' : item.status, assignedTo: null, openedAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })));
    }
    if (input.tab === 'restrictions') {
      const where: Prisma.ComplianceHoldWhereInput = {
        ...(input.status && ['ACTIVE', 'RELEASED'].includes(input.status) ? { status: input.status as never } : {}),
        ...(input.scope ? { scope: { contains: input.scope, mode: 'insensitive' } } : {}),
        ...(input.source ? { source: { contains: input.source, mode: 'insensitive' } } : {}),
        ...(input.q ? { OR: [
          { id: { contains: input.q, mode: 'insensitive' } },
          { reasonCode: { contains: input.q, mode: 'insensitive' } },
          { user: { email: { contains: input.q, mode: 'insensitive' } } },
          { user: { profile: { displayName: { contains: input.q, mode: 'insensitive' } } } },
          { user: { profile: { publicUsername: { contains: input.q, mode: 'insensitive' } } } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.complianceHold.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take, select: { id: true, scope: true, source: true, reasonCode: true, status: true, createdAt: true, releasedAt: true, user: { select: { id: true, email: true, accountStatus: true, profile: { select: { displayName: true, publicUsername: true } } } } } }),
        this.db.complianceHold.count({ where }),
      ]);
      return this.trustSupportPage(input, total, rows.map((item) => ({ id: item.id, kind: 'restriction', user: { id: item.user.id, displayName: item.user.profile?.displayName ?? 'Unnamed user', username: item.user.profile?.publicUsername ?? null, email: item.user.email }, restrictionType: item.scope, scope: item.scope, source: item.source, status: item.status, reasonSummary: item.reasonCode, accountStatus: item.user.accountStatus, appliedAt: item.createdAt.toISOString(), expiresAt: null, releasedAt: item.releasedAt?.toISOString() ?? null })));
    }
    const ticketWhere: Prisma.DiscordTicketWhereInput = {
      ...(input.tab === 'escalations' ? { status: 'ESCALATED' } : input.status && ['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF', 'ESCALATED', 'RESOLVED', 'CLOSED'].includes(input.status) ? { status: input.status as never } : {}),
      ...(input.priority && ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(input.priority) ? { priority: input.priority as never } : {}),
      ...(input.q ? { OR: [
        { id: { contains: input.q, mode: 'insensitive' } },
        { subject: { contains: input.q, mode: 'insensitive' } },
        { category: { contains: input.q, mode: 'insensitive' } },
        { creatorDiscordId: { contains: input.q, mode: 'insensitive' } },
        { safeReferenceId: { contains: input.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const [tickets, total] = await Promise.all([
      this.db.discordTicket.findMany({ where: ticketWhere, orderBy: [{ lastActivityAt: 'asc' }, { id: 'asc' }], skip, take, select: { id: true, creatorDiscordId: true, category: true, subject: true, safeSummary: true, safeReferenceId: true, status: true, priority: true, assignedStaffId: true, createdAt: true, updatedAt: true, lastActivityAt: true } }),
      this.db.discordTicket.count({ where: ticketWhere }),
    ]);
    if (input.tab === 'escalations') {
      return this.trustSupportPage(input, total, tickets.map((ticket) => ({ id: ticket.id, kind: 'escalation', reference: ref('ESC', ticket.id, ticket.createdAt), sourceType: 'SUPPORT_TICKET', creatorDiscordId: ticket.creatorDiscordId, severity: null, priority: ticket.priority, reasonSummary: ticket.safeSummary, owner: ticket.assignedStaffId, status: ticket.status, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString() })));
    }
    return this.trustSupportPage(input, total, tickets.map((ticket) => ({ id: ticket.id, kind: 'ticket', ticketReference: ref('TICK', ticket.id, ticket.createdAt), creatorDiscordId: ticket.creatorDiscordId, category: ticket.category, subject: ticket.subject, safeSummary: ticket.safeSummary, safeReferenceId: ticket.safeReferenceId, priority: ticket.priority, status: ticket.status, assignedTo: ticket.assignedStaffId, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), lastActivityAt: ticket.lastActivityAt.toISOString() })));
  }

  private trustSupportPage(input: { tab: string; page: number; pageSize: number }, total: number, items: Array<Record<string, unknown>>) {
    return { tab: input.tab, items, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  }

  async financeSummary(actor: Actor) {
    await this.authorization.authorize(actor, 'finance.read');
    const [pendingMovements, exceptions, mismatches, revenue] = await Promise.all([
      this.db.moneyMovement.count({
        where: {
          status: { in: ['CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW', 'HELD'] },
        },
      }),
      this.db.moneyMovement.count({
        where: { status: { in: ['FAILED', 'MANUAL_REVIEW', 'HELD'] } },
      }),
      this.db.financialReconciliationRun.count({
        where: { status: 'MISMATCH' },
      }),
      this.platformRevenue.projection(),
    ]);
    return {
      currency: 'GBP',
      pendingMovements,
      exceptions,
      reconciliationMismatches: mismatches,
      platformRevenue: {
        grossRevenueMinor: revenue.grossRevenueMinor,
        providerExpensesMinor: revenue.providerExpensesMinor,
        estimatedNetContributionMinor: revenue.estimatedNetContributionMinor,
        eligibleSettlementMinor: revenue.eligibleSettlementMinor,
        pendingProviderCostCount: revenue.pendingProviderCostCount,
      },
    };
  }

  async bacsRiskDashboard(actor: Actor) {
    await this.authorization.authorize(actor, 'finance.read');
    const [held, manualReview, returned, deficits, sharedInstrumentReviews, recentDeposits] = await Promise.all([
      this.db.moneyMovement.findMany({
        where: { type: 'DEPOSIT', status: 'HELD' },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: {
          id: true,
          userId: true,
          amountMinor: true,
          currency: true,
          status: true,
          provider: true,
          providerAvailableOn: true,
          failureCode: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { email: true, profile: { select: { displayName: true, publicUsername: true } } } },
        },
      }),
      this.db.moneyMovement.findMany({
        where: { type: 'DEPOSIT', status: 'MANUAL_REVIEW' },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: {
          id: true,
          userId: true,
          amountMinor: true,
          currency: true,
          status: true,
          provider: true,
          providerAvailableOn: true,
          failureCode: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { email: true, profile: { select: { displayName: true, publicUsername: true } } } },
        },
      }),
      this.db.moneyMovement.findMany({
        where: { type: 'DEPOSIT', status: 'RETURNED' },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          id: true,
          userId: true,
          amountMinor: true,
          currency: true,
          status: true,
          provider: true,
          providerAvailableOn: true,
          failureCode: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { email: true, profile: { select: { displayName: true, publicUsername: true } } } },
          financialDeficit: { select: { amountMinor: true, recoveredMinor: true, status: true } },
        },
      }),
      this.db.financialDeficit.findMany({
        where: { status: { in: ['OPEN', 'PARTIALLY_RECOVERED'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: {
          id: true,
          userId: true,
          sourceMovementId: true,
          currency: true,
          amountMinor: true,
          recoveredMinor: true,
          status: true,
          reasonCode: true,
          createdAt: true,
          user: { select: { email: true, profile: { select: { displayName: true, publicUsername: true } } } },
        },
      }),
      this.db.bankInstrumentIdentity.count({ where: { riskState: 'SHARED_INSTRUMENT_REVIEW' } }),
      this.db.moneyMovement.findMany({
        where: {
          type: 'DEPOSIT',
          status: { notIn: ['FAILED', 'CANCELLED', 'RETURNED', 'REVERSED'] },
          createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5_000,
        select: { userId: true, amountMinor: true, createdAt: true },
      }),
    ]);
    const person = (user: { email: string; profile: { displayName: string | null; publicUsername: string | null } | null }) => ({
      email: user.email,
      displayName: user.profile?.displayName ?? 'Unnamed user',
      username: user.profile?.publicUsername ?? null,
    });
    const heldAmountMinor = held.reduce((total, item) => total + item.amountMinor, 0n);
    const openDeficitMinor = deficits.reduce(
      (total, item) => total + item.amountMinor - item.recoveredMinor,
      0n,
    );
    const utilizationNow = new Date();
    const utilizationDayStart = new Date(utilizationNow);
    utilizationDayStart.setUTCHours(0, 0, 0, 0);
    const utilizationRapidStart = this.config.bacsDepositRapidWindowSeconds === undefined
      ? null
      : new Date(utilizationNow.getTime() - this.config.bacsDepositRapidWindowSeconds * 1_000);
    const utilization = new Map<string, { dailyAmount: bigint; rollingAmount: bigint; dailyCount: number; rapidCount: number; attemptCount: number }>();
    for (const deposit of recentDeposits) {
      const current = utilization.get(deposit.userId) ?? { dailyAmount: 0n, rollingAmount: 0n, dailyCount: 0, rapidCount: 0, attemptCount: 0 };
      current.attemptCount += 1;
      current.rollingAmount += deposit.amountMinor;
      if (deposit.createdAt >= utilizationDayStart) {
        current.dailyAmount += deposit.amountMinor;
        current.dailyCount += 1;
      }
      if (utilizationRapidStart && deposit.createdAt >= utilizationRapidStart) current.rapidCount += 1;
      utilization.set(deposit.userId, current);
    }
    return {
      currency: 'GBP',
      policy: {
        tradeHoldDays: this.config.bacsInternalTradeHoldDays ?? null,
        tradeHoldConfigured: this.config.bacsInternalTradeHoldDays !== undefined,
        depositVelocityConfigured: Boolean(
          this.config.bacsDepositMaxMinor ??
          this.config.bacsDepositDailyLimitMinor ??
          this.config.bacsDepositRolling7dLimitMinor ??
          this.config.bacsDepositDailyCountLimit ??
          this.config.bacsDepositRapidCountLimit,
        ),
        depositLimits: {
          currency: 'GBP',
          maxPerDepositMinor: this.config.bacsDepositMaxMinor?.toString() ?? null,
          dailyAmountMinor: this.config.bacsDepositDailyLimitMinor?.toString() ?? null,
          rolling7dAmountMinor: this.config.bacsDepositRolling7dLimitMinor?.toString() ?? null,
          dailyCount: this.config.bacsDepositDailyCountLimit ?? null,
          rapidWindowSeconds: this.config.bacsDepositRapidWindowSeconds ?? null,
          rapidCount: this.config.bacsDepositRapidCountLimit ?? null,
        },
      },
      summary: {
        heldDepositCount: held.length,
        heldAmountMinor: heldAmountMinor.toString(),
        returnedDepositCount: returned.length,
        manualReviewDepositCount: manualReview.length,
        openDeficitCount: deficits.length,
        openDeficitMinor: openDeficitMinor.toString(),
        sharedInstrumentReviewCount: sharedInstrumentReviews,
      },
      depositLimitUtilization: [...utilization.entries()].map(([userId, value]) => ({
        userId,
        attemptCount7d: value.attemptCount,
        dailyAmountMinor: value.dailyAmount.toString(),
        rolling7dAmountMinor: value.rollingAmount.toString(),
        dailyCount: value.dailyCount,
        rapidCount: value.rapidCount,
      })),
      heldDeposits: held.map((item) => ({
        id: item.id,
        userId: item.userId,
        user: person(item.user),
        amountMinor: item.amountMinor.toString(),
        currency: item.currency,
        provider: item.provider,
        providerStatus: item.status,
        providerAvailableOn: item.providerAvailableOn?.toISOString() ?? null,
        holdReason: item.failureCode ?? 'BACS_RETURN_RISK_HOLD',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      manualReviewDeposits: manualReview.map((item) => ({
        id: item.id,
        userId: item.userId,
        user: person(item.user),
        amountMinor: item.amountMinor.toString(),
        currency: item.currency,
        provider: item.provider,
        providerStatus: item.status,
        providerAvailableOn: item.providerAvailableOn?.toISOString() ?? null,
        reviewReason: item.failureCode ?? 'BACS_MANUAL_REVIEW',
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      returnedDeposits: returned.map((item) => ({
        id: item.id,
        userId: item.userId,
        user: person(item.user),
        amountMinor: item.amountMinor.toString(),
        currency: item.currency,
        provider: item.provider,
        providerStatus: item.status,
        providerAvailableOn: item.providerAvailableOn?.toISOString() ?? null,
        reasonCode: item.failureCode,
        deficit: item.financialDeficit
          ? {
              amountMinor: item.financialDeficit.amountMinor.toString(),
              recoveredMinor: item.financialDeficit.recoveredMinor.toString(),
              status: item.financialDeficit.status,
            }
          : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      deficits: deficits.map((item) => ({
        id: item.id,
        userId: item.userId,
        user: person(item.user),
        sourceMovementId: item.sourceMovementId,
        currency: item.currency,
        amountMinor: item.amountMinor.toString(),
        recoveredMinor: item.recoveredMinor.toString(),
        outstandingMinor: (item.amountMinor - item.recoveredMinor).toString(),
        status: item.status,
        reasonCode: item.reasonCode,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async financeDashboard(actor: Actor) {
    await this.authorization.authorize(actor, 'finance.read');
    const platformRevenue = await this.platformRevenue.projection();
    const payoutLiquidity = await this.withdrawalPreflight.adminProjection();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const historyStart = new Date(dayStart);
    historyStart.setUTCDate(historyStart.getUTCDate() - 6);
    const pendingStates = ['CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW', 'HELD'] as const;
    const [accounts, pendingMovements, allMovements, cashReservations, proceedsAccounts, platformAccounts, openOrders, executions, historyExecutions, reconRuns, activity] =
      await Promise.all([
        this.db.financialAccount.findMany({
          where: { ownerType: 'USER', currency: 'GBP' },
          select: { normalSide: true, balance: true },
        }),
        this.db.moneyMovement.findMany({
          where: { status: { in: [...pendingStates] } },
          select: { type: true, amountMinor: true },
        }),
        this.db.moneyMovement.findMany({
          select: { type: true, status: true, amountMinor: true },
        }),
        this.db.cashReservation.findMany({
          where: { status: 'ACTIVE' },
          select: { purposeType: true, amountMinor: true },
        }),
        this.db.financialAccount.findMany({
          where: { ownerType: 'USER', code: 'COLLECTOR_PROCEEDS_AVAILABLE', currency: 'GBP' },
          select: { normalSide: true, balance: true },
        }),
        this.db.financialAccount.findMany({
          where: { code: { in: ['INITIAL_OFFERING_FEE_REVENUE', 'TRADING_FEE_REVENUE', 'WITHDRAWAL_FEE_REVENUE', 'EXTERNAL_GBP_CLEARING'] }, currency: 'GBP' },
          select: { code: true, normalSide: true, balance: true },
        }),
        this.db.tradingOrder.count({
          where: { status: { in: ['PENDING_RESERVATION', 'OPEN', 'PARTIALLY_FILLED'] } },
        }),
        this.db.tradingExecution.findMany({
          where: { executedAt: { gte: dayStart } },
          select: {
            grossMinor: true,
            buyerFeeMinor: true,
            sellerFeeMinor: true,
            buyOrder: { select: { side: true } },
            sellOrder: { select: { side: true } },
            takerOrder: { select: { side: true } },
          },
        }),
        this.db.tradingExecution.findMany({
          where: { executedAt: { gte: historyStart } },
          select: { grossMinor: true, executedAt: true },
        }),
        this.db.financialReconciliationRun.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 100,
          select: { status: true, debitMinor: true, creditMinor: true },
        }),
        this.db.auditEvent.findMany({
          where: {
            OR: [
              { action: { contains: 'ORDER', mode: 'insensitive' } },
              { action: { contains: 'EXECUTION', mode: 'insensitive' } },
              { action: { contains: 'MOVEMENT', mode: 'insensitive' } },
              { action: { contains: 'RECONCIL', mode: 'insensitive' } },
              { action: { contains: 'ADJUSTMENT', mode: 'insensitive' } },
            ],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 8,
          select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true },
        }),
      ]);
    let customerCash = 0n;
    let reservedFunds = 0n;
    for (const account of accounts) {
      const balance = account.balance;
      if (!balance) continue;
      const gross = account.normalSide === 'DEBIT'
        ? balance.postedDebitMinor - balance.postedCreditMinor
        : balance.postedCreditMinor - balance.postedDebitMinor;
      customerCash += gross;
      reservedFunds += balance.reservedMinor;
    }
    const pendingDeposits = pendingMovements
      .filter((movement) => movement.type === 'DEPOSIT')
      .reduce((total, movement) => total + movement.amountMinor, 0n);
    const pendingWithdrawals = pendingMovements
      .filter((movement) => movement.type === 'WITHDRAWAL')
      .reduce((total, movement) => total + movement.amountMinor, 0n);
    const movementTotal = (type: 'DEPOSIT' | 'WITHDRAWAL', statuses: string[]) =>
      allMovements
        .filter((movement) => movement.type === type && statuses.includes(movement.status))
        .reduce((total, movement) => total + movement.amountMinor, 0n);
    const orderReserved = cashReservations
      .filter((reservation) => reservation.purposeType === 'TRADING_ORDER')
      .reduce((total, reservation) => total + reservation.amountMinor, 0n);
    const withdrawalReserved = cashReservations
      .filter((reservation) => reservation.purposeType === 'EXTERNAL_WITHDRAWAL')
      .reduce((total, reservation) => total + reservation.amountMinor, 0n);
    const accountAuthorityValue = (account: { normalSide: string; balance: { postedDebitMinor: bigint; postedCreditMinor: bigint } | null }) => {
      if (!account.balance) return 0n;
      return account.normalSide === 'DEBIT'
        ? account.balance.postedDebitMinor - account.balance.postedCreditMinor
        : account.balance.postedCreditMinor - account.balance.postedDebitMinor;
    };
    const collectorProceeds = proceedsAccounts.reduce((total, account) => total + accountAuthorityValue(account), 0n);
    const revenue = new Map<string, bigint>();
    for (const account of platformAccounts) revenue.set(account.code, (revenue.get(account.code) ?? 0n) + accountAuthorityValue(account));
    const externalClearing = revenue.get('EXTERNAL_GBP_CLEARING') ?? 0n;
    const totalVolume = executions.reduce((total, execution) => total + execution.grossMinor, 0n);
    const totalFees = executions.reduce(
      (total, execution) => total + execution.buyerFeeMinor + execution.sellerFeeMinor,
      0n,
    );
    const history = new Map<string, bigint>();
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(historyStart);
      date.setUTCDate(date.getUTCDate() + offset);
      history.set(date.toISOString().slice(0, 10), 0n);
    }
    for (const execution of historyExecutions) {
      const key = execution.executedAt.toISOString().slice(0, 10);
      history.set(key, (history.get(key) ?? 0n) + execution.grossMinor);
    }
    const reconciliation = new Map<string, { amount: bigint; count: number }>();
    for (const run of reconRuns) {
      const amount = run.debitMinor >= run.creditMinor
        ? run.debitMinor - run.creditMinor
        : run.creditMinor - run.debitMinor;
      const current = reconciliation.get(run.status) ?? { amount: 0n, count: 0 };
      current.amount += amount;
      current.count += 1;
      reconciliation.set(run.status, current);
    }
    const title = (action: string) => {
      if (action.includes('PAYMENT') || action.includes('DEPOSIT')) return 'Payment received';
      if (action.includes('WITHDRAW')) return 'Withdrawal requested';
      if (action.includes('EXECUTION')) return 'Order executed';
      if (action.includes('RECONCIL')) return 'Reconciliation issue created';
      if (action.includes('ADJUSTMENT')) return 'Adjustment activity';
      return 'Financial activity';
    };
    const buyInitiated = executions.filter((execution) => execution.takerOrder?.side === 'BUY').length;
    const sellInitiated = executions.filter((execution) => execution.takerOrder?.side === 'SELL').length;
    const financialEmailNotifications = await this.db.notificationDelivery.groupBy({
      by: ['status'],
      where: { topic: 'FINANCIAL_ALERTS', channel: 'EMAIL', mandatory: true },
      _count: true,
    });
    const financialEmailNotificationStatus = Object.fromEntries(
      financialEmailNotifications.map((row) => [row.status, row._count]),
    );
    return {
      currency: 'GBP',
      kpis: {
        totalCustomerCashMinor: customerCash.toString(),
        reservedFundsMinor: reservedFunds.toString(),
        pendingDepositsMinor: pendingDeposits.toString(),
        pendingWithdrawalsMinor: pendingWithdrawals.toString(),
        settledDepositsMinor: movementTotal('DEPOSIT', ['SETTLED']).toString(),
        failedDepositsMinor: movementTotal('DEPOSIT', ['FAILED', 'CANCELLED']).toString(),
        returnedDepositsMinor: movementTotal('DEPOSIT', ['RETURNED', 'REVERSED']).toString(),
        failedWithdrawalsMinor: movementTotal('WITHDRAWAL', ['FAILED', 'CANCELLED']).toString(),
        returnedWithdrawalsMinor: movementTotal('WITHDRAWAL', ['RETURNED', 'REVERSED']).toString(),
        orderReservedMinor: orderReserved.toString(),
        withdrawalReservedMinor: withdrawalReserved.toString(),
        collectorProceedsMinor: collectorProceeds.toString(),
        sliceFeeRevenueMinor: ((revenue.get('INITIAL_OFFERING_FEE_REVENUE') ?? 0n) + (revenue.get('TRADING_FEE_REVENUE') ?? 0n) + (revenue.get('WITHDRAWAL_FEE_REVENUE') ?? 0n)).toString(),
        externalClearingMinor: externalClearing.toString(),
        reconciliationMismatches: reconRuns.filter((run) => run.status === 'MISMATCH').length,
        openOrders,
        executionsToday: executions.length,
        platformGrossRevenueMinor: platformRevenue.grossRevenueMinor,
        platformProviderExpensesMinor: platformRevenue.providerExpensesMinor,
        platformEstimatedNetContributionMinor: platformRevenue.estimatedNetContributionMinor,
        platformEligibleSettlementMinor: platformRevenue.eligibleSettlementMinor,
        providerCostsPendingEvidence: platformRevenue.pendingProviderCostCount,
      },
      platformRevenue,
      payoutLiquidity,
      financialNotificationOperations: {
        mandatoryEmail: financialEmailNotificationStatus,
        failedMandatoryEmail: (financialEmailNotificationStatus.FAILED ?? 0) + (financialEmailNotificationStatus.DEAD_LETTER ?? 0),
        retryBacklog: (financialEmailNotificationStatus.PENDING ?? 0) + (financialEmailNotificationStatus.PROCESSING ?? 0),
      },
      overview: {
        totalVolumeMinor: totalVolume.toString(),
        buyVolumeMinor: executions
          .filter((execution) => execution.takerOrder?.side === 'BUY')
          .reduce((total, execution) => total + execution.grossMinor, 0n)
          .toString(),
        sellVolumeMinor: executions
          .filter((execution) => execution.takerOrder?.side === 'SELL')
          .reduce((total, execution) => total + execution.grossMinor, 0n)
          .toString(),
        totalFeesMinor: totalFees.toString(),
        netFeesMinor: totalFees.toString(),
        history: [...history].map(([date, volumeMinor]) => ({ date, volumeMinor: volumeMinor.toString() })),
      },
      orderSummary: {
        total: await this.db.tradingOrder.count(),
        buy: await this.db.tradingOrder.count({ where: { side: 'BUY' } }),
        sell: await this.db.tradingOrder.count({ where: { side: 'SELL' } }),
        open: openOrders,
      },
      executionSummary: {
        total: executions.length,
        buyInitiated,
        sellInitiated,
      },
      reconciliationSummary: [...reconciliation].map(([status, value]) => ({
        status,
        amountMinor: value.amount.toString(),
        count: value.count,
      })),
      recentActivity: activity.map((event) => ({
        id: event.id,
        type: event.resourceType,
        title: title(event.action),
        detail: event.resourceId ?? 'Financial event',
        amountMinor: null,
        occurredAt: event.createdAt.toISOString(),
      })),
    };
  }

  async financeRecords(
    actor: Actor,
    input: { tab: string; q?: string; status?: string; page: number; pageSize: number },
  ) {
    await this.authorization.authorize(actor, 'finance.read');
    const skip = (input.page - 1) * input.pageSize;
    const take = input.pageSize;
    if (input.tab === 'adjustments') {
      const where: Prisma.FinancialAdjustmentRequestWhereInput = {
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.q ? { OR: [
          { id: { contains: input.q, mode: 'insensitive' } },
          { deficitId: { contains: input.q, mode: 'insensitive' } },
          { userId: { contains: input.q, mode: 'insensitive' } },
          { reason: { contains: input.q, mode: 'insensitive' } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.financialAdjustmentRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
        this.db.financialAdjustmentRequest.count({ where }),
      ]);
      const userIds = [...new Set(rows.flatMap((row) => [row.userId, row.initiatorUserId, ...(row.approverUserId ? [row.approverUserId] : [])]))];
      const users = await this.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } });
      const byId = new Map(users.map((user) => [user.id, user]));
      return this.financePage(input, total, rows.map((row) => ({
        id: row.id,
        kind: 'adjustment',
        status: row.status,
        user: this.financePerson(byId.get(row.userId)),
        initiator: this.financePerson(byId.get(row.initiatorUserId)),
        approver: this.financePerson(row.approverUserId ? byId.get(row.approverUserId) : undefined),
        deficitId: row.deficitId,
        amountMinor: row.amountMinor.toString(),
        currency: row.currency,
        reason: row.reason,
        beforeOutstandingMinor: row.beforeOutstandingMinor.toString(),
        afterOutstandingMinor: row.afterOutstandingMinor?.toString() ?? null,
        restrictionReleased: row.restrictionReleased,
        journalTransactionId: row.journalTransactionId,
        requestedAt: row.requestedAt.toISOString(),
        approvedAt: row.approvedAt?.toISOString() ?? null,
        appliedAt: row.appliedAt?.toISOString() ?? null,
        rejectedAt: row.rejectedAt?.toISOString() ?? null,
      })));
    }
    if (input.tab === 'wallets') {
      const where: Prisma.FinancialAccountWhereInput = {
        ownerType: 'USER',
        currency: 'GBP',
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.q ? { owner: { OR: [
          { email: { contains: input.q, mode: 'insensitive' } },
          { profile: { displayName: { contains: input.q, mode: 'insensitive' } } },
          { profile: { publicUsername: { contains: input.q, mode: 'insensitive' } } },
        ] } } : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.financialAccount.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take, include: { balance: true, owner: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } }),
        this.db.financialAccount.count({ where }),
      ]);
      return this.financePage(input, total, rows.map((wallet) => {
        const balance = wallet.balance;
        const gross = balance ? wallet.normalSide === 'DEBIT' ? balance.postedDebitMinor - balance.postedCreditMinor : balance.postedCreditMinor - balance.postedDebitMinor : 0n;
        const reserved = balance?.reservedMinor ?? 0n;
        return { id: wallet.id, kind: 'wallet', collector: { id: wallet.owner?.id ?? null, displayName: wallet.owner?.profile?.displayName ?? 'Unnamed user', username: wallet.owner?.profile?.publicUsername ?? null, email: wallet.owner?.email ?? null }, walletBalanceMinor: gross.toString(), reservedMinor: reserved.toString(), availableMinor: (gross - reserved).toString(), currency: wallet.currency, lastActivityAt: (balance?.updatedAt ?? wallet.updatedAt).toISOString(), status: wallet.status };
      }));
    }
    if (input.tab === 'movements') {
      const where: Prisma.MoneyMovementWhereInput = {
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.q ? { user: { OR: [
          { email: { contains: input.q, mode: 'insensitive' } },
          { profile: { displayName: { contains: input.q, mode: 'insensitive' } } },
          { profile: { publicUsername: { contains: input.q, mode: 'insensitive' } } },
        ] } } : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.moneyMovement.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take, include: { user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } }),
        this.db.moneyMovement.count({ where }),
      ]);
      return this.financePage(input, total, rows.map((movement) => ({ id: movement.id, kind: 'movement', reference: movement.id, user: { id: movement.user.id, displayName: movement.user.profile?.displayName ?? 'Unnamed user', username: movement.user.profile?.publicUsername ?? null, email: movement.user.email }, type: movement.type, amountMinor: movement.amountMinor.toString(), currency: movement.currency, provider: movement.provider, providerState: movement.status, sliceState: movement.ledgerTransactionId ? 'SETTLED' : 'NOT_SETTLED', createdAt: movement.createdAt.toISOString(), updatedAt: movement.updatedAt.toISOString() })));
    }
    if (input.tab === 'orders') {
      const where: Prisma.TradingOrderWhereInput = {
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.q ? { OR: [
          { id: { contains: input.q, mode: 'insensitive' } },
          { asset: { title: { contains: input.q, mode: 'insensitive' } } },
          { user: { profile: { displayName: { contains: input.q, mode: 'insensitive' } } } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.tradingOrder.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take, include: { asset: { select: { title: true, slug: true } }, user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } }, actorUser: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } }),
        this.db.tradingOrder.count({ where }),
      ]);
      return this.financePage(input, total, rows.map((order) => {
        const owner = order.principalType === 'TREASURY' ? null : order.user ?? order.actorUser;
        return { id: order.id, kind: 'order', principalType: order.principalType, user: owner ? { id: owner.id, displayName: owner.profile?.displayName ?? 'Unnamed user', username: owner.profile?.publicUsername ?? null, email: owner.email } : { id: null, displayName: 'Slice Treasury', username: null, email: null }, asset: { title: order.asset.title, slug: order.asset.slug }, side: order.side, shares: order.originalUnits.toString(), limitPriceMinor: order.limitPriceMinor.toString(), filled: order.filledUnits.toString(), remaining: order.remainingUnits.toString(), status: order.status, createdAt: order.createdAt.toISOString() };
      }));
    }
    if (input.tab === 'executions') {
      const where: Prisma.TradingExecutionWhereInput = {
        ...(input.status ? { settlementStatus: input.status as never } : {}),
        ...(input.q ? { OR: [
          { id: { contains: input.q, mode: 'insensitive' } },
          { asset: { title: { contains: input.q, mode: 'insensitive' } } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.tradingExecution.findMany({ where, orderBy: [{ executedAt: 'desc' }, { id: 'desc' }], skip, take, include: { asset: { select: { title: true, slug: true } }, buyOrder: { select: { principalType: true, user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } }, sellOrder: { select: { principalType: true, user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } } } }),
        this.db.tradingExecution.count({ where }),
      ]);
      return this.financePage(input, total, rows.map((execution) => ({ id: execution.id, kind: 'execution', asset: { title: execution.asset.title, slug: execution.asset.slug }, buyer: execution.buyOrder.user ? { id: execution.buyOrder.user.id, displayName: execution.buyOrder.user.profile?.displayName ?? 'Unnamed user', username: execution.buyOrder.user.profile?.publicUsername ?? null } : { id: null, displayName: 'Slice Treasury', username: null }, seller: execution.sellOrder.user ? { id: execution.sellOrder.user.id, displayName: execution.sellOrder.user.profile?.displayName ?? 'Unnamed user', username: execution.sellOrder.user.profile?.publicUsername ?? null } : { id: null, displayName: execution.sellOrder.principalType === 'TREASURY' ? 'Slice Treasury' : 'Unknown principal', username: null }, shares: execution.units.toString(), priceMinor: execution.priceMinor.toString(), feeMinor: (execution.buyerFeeMinor + execution.sellerFeeMinor).toString(), executedAt: execution.executedAt.toISOString(), settlementStatus: execution.settlementStatus })));
    }
    const where: Prisma.FinancialReconciliationRunWhereInput = input.status ? { status: input.status as never } : {};
    const [rows, total] = await Promise.all([
      this.db.financialReconciliationRun.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
      this.db.financialReconciliationRun.count({ where }),
    ]);
    return this.financePage(input, total, rows.map((run) => ({ id: run.id, kind: 'reconciliation', reference: run.id, scope: run.scope, status: run.status, expectedMinor: run.debitMinor.toString(), observedMinor: run.creditMinor.toString(), differenceMinor: (run.debitMinor - run.creditMinor).toString(), currency: run.currency, createdAt: run.createdAt.toISOString(), actions: ['Inspect'] })));
  }

  private financePerson(user: { id: string; email: string; profile: { displayName: string | null; publicUsername: string | null } | null } | undefined) {
    return user
      ? { id: user.id, displayName: user.profile?.displayName ?? 'Unnamed user', username: user.profile?.publicUsername ?? null, email: user.email }
      : { id: null, displayName: 'Unknown user', username: null, email: null };
  }

  private financePage(input: { tab: string; page: number; pageSize: number }, total: number, items: Array<Record<string, unknown>>) {
    return { tab: input.tab, items, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  }

  async integrations(actor: Actor) {
    await this.authorization.authorize(actor, 'integrations.read');
    const [incidents, failedWebhooks] = await Promise.all([
      this.db.providerIncident.count({ where: { status: 'OPEN' } }),
      this.db.webhookInbox.count({ where: { status: 'FAILED' } }),
    ]);
    return {
      providerIncidents: incidents,
      failedWebhooks,
      secrets: 'redacted' as const,
    };
  }

  async search(actor: Actor, q: string, limit: number) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const [users, assets] = await Promise.all([
      this.db.user.findMany({
        where: {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            {
              profile: { publicUsername: { contains: q, mode: 'insensitive' } },
            },
            { profile: { displayName: { contains: q, mode: 'insensitive' } } },
          ],
        },
        take: limit,
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true, publicUsername: true } },
        },
      }),
      this.db.asset.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        take: limit,
        select: { id: true, slug: true, title: true, status: true },
      }),
    ]);
    return {
      items: [
        ...users.map((user) => ({
          entityType: 'USER' as const,
          id: user.id,
          title: user.profile?.displayName ?? 'Unnamed user',
          subtitle: user.profile?.publicUsername
            ? `@${user.profile.publicUsername}`
            : user.email,
          target: `/admin?section=users&user=${user.id}`,
        })),
        ...assets.map((asset) => ({
          entityType: 'COLLECTIBLE' as const,
          id: asset.id,
          title: asset.title,
          subtitle: asset.status,
          target: `/admin?section=marketplace&asset=${asset.id}&tab=overview`,
        })),
      ].slice(0, limit),
    };
  }

  async collectibleDetail(actor: Actor, reference: string, tab?: string) {
    await this.authorization.authorize(actor, 'admin.console.read');
    // The tab is accepted so the frontend can lazy-load by URL without changing the
    // aggregate contract; heavy sections remain bounded in this projection.
    void tab;
    const asset = await this.db.asset.findFirst({
      where: {
        OR: [{ id: reference }, { publicId: reference }, { slug: reference }],
      },
      include: {
        _count: { select: { marketObservations: true } },
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
        submissions: {
          orderBy: { createdAt: 'desc' },
          include: {
            owner: {
              select: {
                id: true,
                createdAt: true,
                profile: {
                  select: { displayName: true, publicUsername: true },
                },
                _count: { select: { submissions: true } },
              },
            },
            media: { where: { deletedAt: null }, orderBy: { slot: 'asc' } },
            reviews: {
              orderBy: { createdAt: 'desc' },
              include: {
                reviewer: {
                  select: { profile: { select: { displayName: true } } },
                },
              },
            },
            intake: { include: { vault: true, shipment: true, receipt: true } },
          },
        },
        valuationDecisions: {
          orderBy: { decidedAt: 'desc' },
          take: 50,
          include: {
            decidedBy: {
              select: { profile: { select: { displayName: true } } },
            },
          },
        },
        valuationEvidence: { orderBy: { observedAt: 'desc' }, take: 100 },
        marketSnapshots: { orderBy: { asOf: 'desc' }, take: 50 },
        marketProviderMappings: {
          where: { providerCode: 'PRICECHARTING' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
        marketObservations: {
          where: {
            providerCode: 'PRICECHARTING',
            observationType: 'PRICE_GUIDE',
            included: true,
          },
          orderBy: { observedAt: 'desc' },
          take: 50,
        },
        custodyRecord: {
          include: { events: { orderBy: { occurredAt: 'asc' } } },
        },
        controlledBetaBypass: true,
        publication: true,
        insuranceCoverage: {
          where: { status: 'ACTIVE', effectiveAt: { lte: new Date() }, expiresAt: { gt: new Date() } },
          take: 1,
        },
        ownershipSupply: {
          include: {
            positions: {
              select: {
                settledUnits: true,
                reservedUnits: true,
                accountId: true,
                account: {
                  select: {
                    type: true,
                    user: {
                      select: {
                        id: true,
                        profile: { select: { displayName: true, publicUsername: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        ownershipSupplyPolicy: { select: { status: true, proposedUnits: true, pricePerUnitMinor: true } },
        initialOffering: {
          include: {
            inventory: true,
            originatingCollector: { select: { id: true, profile: { select: { displayName: true, publicUsername: true } } } },
          },
        },
        tradingMarket: true,
        tradingOrders: {
          where: {
            principalType: 'TREASURY',
            side: 'SELL',
            status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            originalUnits: true,
            filledUnits: true,
            remainingUnits: true,
            limitPriceMinor: true,
            status: true,
            createdAt: true,
          },
        },
        tradingExecutions: { orderBy: { executedAt: 'desc' }, take: 50 },
        vaultPublicEvents: { orderBy: { occurredAt: 'asc' }, take: 50 },
      },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Collectible not found.',
      });
    if (
      this.config.isBeta &&
      (isBetaFixtureSlug(asset.slug) ||
        !asset.submissions.some(
          (submission) => !isBetaFixtureSubmission(submission.declaredMetadata),
        ))
    ) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Collectible not found.',
      });
    }
    const approved =
      asset.submissions.find(
        (submission) => submission.status === 'APPROVED',
      ) ??
      asset.submissions[0] ??
      null;
    const intake = approved?.intake ?? null;
    const latestReview = approved?.reviews[0] ?? null;
    const snapshot = asset.marketSnapshots[0] ?? null;
    const mapping = asset.marketProviderMappings[0] ?? null;
    const marketObservation = asset.marketObservations[0] ?? null;
    const activeDecision =
      asset.valuationDecisions.find((item) => item.status === 'ACTIVE') ?? null;
    const owner = approved?.owner ?? null;
    const external = (sourceType: string) => {
      const record = asset.valuationEvidence.find(
        (item) => item.sourceType === sourceType,
      );
      if (!record) return null;
      let parsed: { source?: string; listingUrl?: string; imageUrl?: string } =
        {};
      try {
        parsed = JSON.parse(record.sourceRef ?? '{}') as typeof parsed;
      } catch {
        /* provenance is optional */
      }
      return {
        minor: record.valueMinor.toString(),
        currency: record.currency,
        source: parsed.source ?? record.sourceType,
        url: parsed.listingUrl ?? '',
        ...(parsed.imageUrl ? { imageUrl: parsed.imageUrl } : {}),
        observedAt: record.observedAt.toISOString(),
      };
    };
    const listing = external('STAGING_CURRENT_LISTING');
    const sale = external('STAGING_RECENT_COMPLETED_SALE');
    const safeMedia = asset.submissions.flatMap((submission) =>
      submission.media
        .filter((item) => item.status === 'SAFE')
        .map((item) => ({
          slot: item.slot,
          filename: item.originalFilename,
          status: item.status,
          objectKey: item.objectKey,
        })),
    );
    const signedMedia = await Promise.all(
      safeMedia.map(async (item) => ({
        slot: item.slot,
        filename: item.filename,
        status: item.status,
        url: await this.storage
          .createPrivateDownloadUrl(item.objectKey, new Date(Date.now() + 5 * 60_000))
          .catch(() => null),
      })),
    );
    const stages = detailStages(
      asset,
      approved,
      intake,
      latestReview,
      activeDecision,
    );
    const current =
      stages.find((stage) => stage.state === 'current')?.key ??
      stages.filter((stage) => stage.state === 'complete').at(-1)?.key ??
      asset.status;
    const activityRows = await this.db.auditEvent.findMany({
      where: { resourceType: 'asset', resourceId: asset.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        actor: { select: { profile: { select: { displayName: true } } } },
      },
    });
    const issued = asset.ownershipSupply?.issuedUnits ?? 0n;
    const available = asset.ownershipSupply
      ? asset.ownershipSupply.totalUnits - issued
      : null;
    const sales = asset.valuationEvidence
      .filter((item) => item.sourceType === 'STAGING_RECENT_COMPLETED_SALE')
      .slice(0, 10);
    const publicationBlockingCodes = readinessCodes(
      asset.publication?.readiness,
    );
    const issuance = await this.ownershipPolicy.adminProjection(asset.id);
    const initialProceedsAccount = asset.initialOffering
      ? await this.db.financialAccount.findFirst({
          where: { ownerType: 'USER', ownerUserId: asset.initialOffering.beneficiaryUserId, code: 'COLLECTOR_PROCEEDS_AVAILABLE', currency: asset.initialOffering.currency },
          include: { balance: true },
        })
      : null;
    const initialOffering = asset.initialOffering
      ? {
          offeringId: asset.initialOffering.id,
          status: asset.initialOffering.status,
          totalUnits: asset.initialOffering.totalUnits.toString(),
          offeredUnits: asset.initialOffering.offeredUnits.toString(),
          retainedUnits: asset.initialOffering.retainedUnits.toString(),
          offeredPercentageBps: Number((asset.initialOffering.offeredUnits * 10_000n) / asset.initialOffering.totalUnits),
          retainedPercentageBps: Number((asset.initialOffering.retainedUnits * 10_000n) / asset.initialOffering.totalUnits),
          pricePerUnitMinor: asset.initialOffering.pricePerUnitMinor.toString(),
          grossOfferingMinor: asset.initialOffering.grossOfferingMinor.toString(),
          feeMinor: (asset.initialOffering.grossOfferingMinor * BigInt(asset.initialOffering.feeBps) / 10_000n).toString(),
          netOfferingMinor: (asset.initialOffering.grossOfferingMinor - (asset.initialOffering.grossOfferingMinor * BigInt(asset.initialOffering.feeBps) / 10_000n)).toString(),
          currency: asset.initialOffering.currency,
          feeScheduleVersion: asset.initialOffering.feeScheduleVersion,
          feeBps: asset.initialOffering.feeBps,
          changeRequestReason: asset.initialOffering.changeRequestReason,
          approvedAt: asset.initialOffering.approvedAt?.toISOString() ?? null,
          openedAt: asset.initialOffering.openedAt?.toISOString() ?? null,
          issuedAt: asset.initialOffering.issuedAt?.toISOString() ?? null,
          closedAt: asset.initialOffering.closedAt?.toISOString() ?? null,
          inventory: asset.initialOffering.inventory ? { offeredUnits: asset.initialOffering.inventory.offeredUnits.toString(), availableUnits: asset.initialOffering.inventory.availableUnits.toString(), reservedUnits: asset.initialOffering.inventory.reservedUnits.toString(), settledUnits: asset.initialOffering.inventory.settledUnits.toString() } : null,
          proceeds: initialProceedsAccount?.balance ? { postedMinor: (initialProceedsAccount.balance.postedCreditMinor - initialProceedsAccount.balance.postedDebitMinor).toString(), reservedMinor: initialProceedsAccount.balance.reservedMinor.toString(), availableMinor: (initialProceedsAccount.balance.postedCreditMinor - initialProceedsAccount.balance.postedDebitMinor - initialProceedsAccount.balance.reservedMinor).toString(), currency: asset.initialOffering.currency } : { postedMinor: '0', reservedMinor: '0', availableMinor: '0', currency: asset.initialOffering.currency },
          collector: { id: asset.initialOffering.originatingCollector.id, displayName: asset.initialOffering.originatingCollector.profile?.displayName ?? 'Collector', username: asset.initialOffering.originatingCollector.profile?.publicUsername ?? null },
          readiness: { custody: asset.custodyRecord?.status === 'SECURED' || Boolean(asset.controlledBetaBypass), insurance: Boolean(asset.insuranceCoverage?.length), publication: asset.publication?.status === 'PUBLISHED', market: asset.tradingMarket?.status === 'OPEN' && asset.tradingMarket.tradingEnabled },
          valuation: asset.valuationDecisions.find((item) => item.status === 'ACTIVE') ? { minor: asset.valuationDecisions.find((item) => item.status === 'ACTIVE')!.valueMinor.toString(), currency: asset.valuationDecisions.find((item) => item.status === 'ACTIVE')!.currency, asOf: asset.valuationDecisions.find((item) => item.status === 'ACTIVE')!.decidedAt.toISOString() } : null,
          supplyPolicy: asset.ownershipSupplyPolicy ? { status: asset.ownershipSupplyPolicy.status, units: asset.ownershipSupplyPolicy.proposedUnits.toString(), pricePerUnitMinor: asset.ownershipSupplyPolicy.pricePerUnitMinor.toString() } : null,
        }
      : null;
    const saleValues = sales.map((item) => item.valueMinor);
    const avgSale = saleValues.length
      ? saleValues.reduce((sum, value) => sum + value, 0n) /
        BigInt(saleValues.length)
      : null;
    const treasuryPosition =
      asset.ownershipSupply?.positions.find(
        (position) => position.account.type === 'TREASURY',
      ) ?? null;
    const treasuryListings = asset.tradingOrders;
    const treasurySettledUnits = treasuryPosition?.settledUnits ?? 0n;
    const treasuryReservedUnits = treasuryPosition?.reservedUnits ?? 0n;
    const treasuryAvailableUnits =
      treasurySettledUnits > treasuryReservedUnits
        ? treasurySettledUnits - treasuryReservedUnits
        : 0n;
    const treasuryListedUnits = treasuryListings.reduce(
      (sum, order) => sum + order.remainingUnits,
      0n,
    );
    const treasuryPartiallyFilledUnits = treasuryListings.reduce(
      (sum, order) =>
        order.status === 'PARTIALLY_FILLED' ? sum + order.filledUnits : sum,
      0n,
    );
    return {
      id: asset.id,
      publicId: asset.publicId,
      slug: asset.slug,
      title: asset.title,
      status: asset.status,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      media: signedMedia,
      identity: {
        category: asset.category.name,
        categorySlug: asset.category.slug,
        set: asset.collectibleSet?.name ?? null,
        year: asset.year,
        manufacturer: asset.manufacturer,
        cardNumber: asset.cardNumber,
        language: null,
        rarity: null,
        variant: asset.edition,
        edition: asset.edition,
      },
      grading: asset.gradeScaleEntry
        ? {
            company: asset.gradeScaleEntry.company.code,
            grade: asset.gradeScaleEntry.grade.toFixed(2).replace(/\.00$/, ''),
            label: asset.gradeScaleEntry.label,
            certificationNumber: asset.certificationNumber,
            gradingDate: null,
            population: null,
            popHigher: null,
          }
        : null,
      valuation: {
        current: activeDecision
          ? {
              minor: activeDecision.valueMinor.toString(),
              currency: activeDecision.currency,
              asOf: activeDecision.decidedAt.toISOString(),
              method: activeDecision.methodologyCode,
              actor: activeDecision.decidedBy.profile?.displayName ?? null,
            }
          : null,
        history: asset.valuationDecisions.map((item) => ({
          id: item.id,
          minor: item.valueMinor.toString(),
          currency: item.currency,
          asOf: item.decidedAt.toISOString(),
          method: item.methodologyCode,
          status: item.status,
        })),
        marketReference: { currentListing: listing, recentSale: sale },
      },
      ownership: {
        totalUnits: asset.ownershipSupply?.totalUnits.toString() ?? null,
        issuedUnits: asset.ownershipSupply?.issuedUnits.toString() ?? null,
        availableUnits: available?.toString() ?? null,
        ownerCount:
          snapshot?.ownersCount ??
          (asset.ownershipSupply
            ? Number(
                asset.ownershipSupply.positions.filter(
                  (position) => position.settledUnits > 0n,
                ).length,
              )
            : null),
        holders:
          asset.ownershipSupply?.positions
            .filter((position) => position.settledUnits > 0n)
            .map((position) => ({
              accountId: position.accountId,
              userId: position.account.user?.id ?? null,
              displayName:
                position.account.user?.profile?.displayName ?? 'System treasury',
              username: position.account.user?.profile?.publicUsername ?? null,
              units: position.settledUnits.toString(),
              percentage:
                asset.ownershipSupply && asset.ownershipSupply.totalUnits > 0n
                  ? Number((position.settledUnits * 10000n) / asset.ownershipSupply.totalUnits) / 100
                  : null,
            })) ?? [],
      },
      treasuryLiquidity:
        treasuryPosition || treasuryListings.length
          ? {
              settledUnits: treasurySettledUnits.toString(),
              reservedUnits: treasuryReservedUnits.toString(),
              availableUnits: treasuryAvailableUnits.toString(),
              openSellOrders: treasuryListings.length,
              listedUnits: treasuryListedUnits.toString(),
              partiallyFilledUnits: treasuryPartiallyFilledUnits.toString(),
              marketStatus: asset.tradingMarket?.status ?? 'CLOSED',
              listings: treasuryListings.map((order) => ({
                id: order.id,
                originalUnits: order.originalUnits.toString(),
                filledUnits: order.filledUnits.toString(),
                remainingUnits: order.remainingUnits.toString(),
                limitPriceMinor: order.limitPriceMinor.toString(),
                status: order.status,
                createdAt: order.createdAt.toISOString(),
              })),
            }
          : null,
      issuance,
      initialOffering,
      lifecycle: { current, legacy: Boolean(asset.publishedAt && !intake), stages },
      marketLifecycle: deriveMarketLifecycle({
        published: asset.publication?.status === 'PUBLISHED',
        publicationStatus: asset.publication?.status,
        custodyStatus: asset.custodyRecord?.status,
        custodyBypass: Boolean(asset.controlledBetaBypass),
        supplyPolicyStatus: asset.ownershipSupplyPolicy?.status,
        supplyStatus: asset.ownershipSupply?.status,
        issuedUnits: asset.ownershipSupply?.issuedUnits,
        marketStatus: asset.tradingMarket?.status,
        tradingEnabled: asset.tradingMarket?.tradingEnabled,
        availabilityBps: snapshot?.availableBps,
      }),
      collector: owner
        ? {
            id: owner.id,
            displayName: owner.profile?.displayName ?? 'Unnamed collector',
            username: owner.profile?.publicUsername ?? null,
            memberSince: owner.createdAt.toISOString(),
            submissions: owner._count.submissions,
            accepted: await this.db.assetSubmission.count({
              where: { ownerUserId: owner.id, status: 'APPROVED' },
            }),
          }
        : null,
      intake: intake
        ? {
            id: intake.id,
            status: intake.status,
            vault: intake.vault.displayName,
            tracking: intake.shipment?.trackingNumber ?? null,
            carrier: intake.shipment?.carrier ?? null,
            shippedAt: intake.shipment?.shippedAt.toISOString() ?? null,
            deliveredAt: intake.shipment?.deliveredAt?.toISOString() ?? null,
            receivedAt: intake.receivedAt?.toISOString() ?? null,
            receiptConfirmedAt:
              intake.receipt?.confirmedAt.toISOString() ?? null,
            exception: intake.shipment?.status === 'EXCEPTION',
          }
        : null,
      verification: {
        status:
          latestReview?.status ??
          (asset.status === 'VERIFIED' || asset.status === 'PUBLISHED'
            ? 'COMPLETED'
            : 'PENDING'),
        verifiedBy: latestReview?.reviewer.profile?.displayName ?? null,
        verifiedAt: latestReview?.completedAt?.toISOString() ?? null,
        decision: latestReview?.decision ?? null,
        note: latestReview?.note ?? null,
      },
      custody: {
        status: asset.custodyRecord?.status ?? 'NOT_STARTED',
        controlledBetaPhysicalBypass: Boolean(asset.controlledBetaBypass),
        location: asset.custodyRecord?.facilityCode ?? null,
        receivedAt: asset.custodyRecord?.receivedAt?.toISOString() ?? null,
        securedAt: asset.custodyRecord?.securedAt?.toISOString() ?? null,
        history:
          asset.custodyRecord?.events.map((event) => ({
            status: event.toStatus,
            at: event.occurredAt.toISOString(),
          })) ?? [],
      },
      market: {
        publication: asset.publication?.status ?? 'BLOCKED',
        trading: asset.tradingMarket
          ? {
              status: asset.tradingMarket.status,
              tradingEnabled: asset.tradingMarket.tradingEnabled,
            }
          : null,
        asking: listing
          ? { minor: listing.minor, currency: listing.currency }
          : null,
        reference: mapping?.currentPriceMinor !== null && mapping?.currentPriceMinor !== undefined
          ? {
              provider: mapping.providerCode,
              externalId: mapping.providerExternalId,
              minor: mapping.currentPriceMinor.toString(),
              currency: mapping.currentCurrency ?? marketObservation?.currency ?? 'USD',
              observedAt: (mapping.currentObservedAt ?? marketObservation?.observedAt ?? new Date()).toISOString(),
              nextRefreshAt: mapping?.nextRefreshAt?.toISOString() ?? null,
              status: mapping.status,
              lastSuccessAt: mapping.lastSuccessAt?.toISOString() ?? null,
              lastFailureAt: mapping.lastFailureAt?.toISOString() ?? null,
              lastFailureCode: mapping.lastFailureCode,
              historyStartedAt: mapping.referenceHistoryStartedAt?.toISOString() ?? null,
              movement24hBps: mapping.referenceMovement24hBps,
              movement7dBps: mapping.referenceMovement7dBps,
              movement30dBps: mapping.referenceMovement30dBps,
              movement90dBps: mapping.referenceMovement90dBps,
              movement1yBps: mapping.referenceMovement1yBps,
              observationCount: asset._count.marketObservations,
            }
          : marketObservation
            ? {
                provider: marketObservation.providerCode,
                externalId: marketObservation.providerExternalId,
                minor: marketObservation.priceMinor.toString(),
                currency: marketObservation.currency,
                observedAt: marketObservation.observedAt.toISOString(),
                nextRefreshAt: mapping?.nextRefreshAt?.toISOString() ?? null,
                status: mapping?.status ?? 'UNKNOWN',
                lastSuccessAt: mapping?.lastSuccessAt?.toISOString() ?? null,
                lastFailureAt: mapping?.lastFailureAt?.toISOString() ?? null,
                lastFailureCode: mapping?.lastFailureCode ?? null,
                historyStartedAt: mapping?.referenceHistoryStartedAt?.toISOString() ?? null,
                movement24hBps: mapping?.referenceMovement24hBps ?? null,
                movement7dBps: mapping?.referenceMovement7dBps ?? null,
                movement30dBps: mapping?.referenceMovement30dBps ?? null,
                movement90dBps: mapping?.referenceMovement90dBps ?? null,
                movement1yBps: mapping?.referenceMovement1yBps ?? null,
                observationCount: asset._count.marketObservations,
              }
          : null,
        floor: null,
        salesAverage:
          avgSale === null
            ? null
            : { minor: avgSale.toString(), currency: sales[0]!.currency },
        salesCount: sales.length,
        lastUpdated:
          marketObservation?.observedAt.toISOString() ?? snapshot?.asOf.toISOString() ?? null,
        readiness: {
          status:
            asset.publication?.status === 'PUBLISHED' ||
            asset.publication?.status === 'READY'
              ? 'READY'
              : 'BLOCKED',
          blockingCodes: publicationBlockingCodes,
        },
      },
      recentSales: sales.map((item) => {
        const parsed = parseSourceRef(item.sourceRef);
        return {
          id: item.id,
          date: item.observedAt.toISOString(),
          grade: null,
          minor: item.valueMinor.toString(),
          currency: item.currency,
          source: parsed.source ?? item.sourceType,
          url: parsed.listingUrl ?? null,
        };
      }),
      metrics: [
        ...(asset.gradeScaleEntry?.grade
          ? [
              {
                label: 'Grade',
                value: asset.gradeScaleEntry.grade
                  .toFixed(2)
                  .replace(/\.00$/, ''),
              },
            ]
          : []),
        ...(snapshot?.ownersCount !== null &&
        snapshot?.ownersCount !== undefined
          ? [{ label: 'Owners', value: String(snapshot.ownersCount) }]
          : []),
        ...(asset.ownershipSupply
          ? [
              {
                label: 'Total supply',
                value: asset.ownershipSupply.totalUnits.toString(),
              },
            ]
          : []),
      ],
      activity: activityRows.map((item) => ({
        id: item.id,
        action: item.action,
        actor: item.actor?.profile?.displayName ?? 'System',
        detail:
          typeof item.metadata === 'object' &&
          item.metadata &&
          'detail' in item.metadata
            ? String((item.metadata as { detail?: unknown }).detail)
            : null,
        occurredAt: item.createdAt.toISOString(),
      })),
      submissions: asset.submissions.map((submission) => ({
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt?.toISOString() ?? null,
        reviewedAt: submission.reviewedAt?.toISOString() ?? null,
        reviewer: submission.reviews[0]?.reviewer.profile?.displayName ?? null,
        decision: submission.decisionCode,
        note: submission.decisionNote,
      })),
      evidence: signedMedia,
    };
  }
}

function parseSourceRef(sourceRef: string | null) {
  if (!sourceRef) return {} as { source?: string; listingUrl?: string };
  try {
    const value = JSON.parse(sourceRef) as {
      source?: unknown;
      listingUrl?: unknown;
    };
    return {
      source: typeof value.source === 'string' ? value.source : undefined,
      listingUrl:
        typeof value.listingUrl === 'string' ? value.listingUrl : undefined,
    };
  } catch {
    return {};
  }
}

function readinessCodes(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const codes = (value as { blockingCodes?: unknown }).blockingCodes;
  return Array.isArray(codes)
    ? codes.filter((code): code is string => typeof code === 'string')
    : [];
}

function detailStages(
  asset: {
    status: string;
    publishedAt: Date | null;
    custodyRecord: {
      status: string;
      receivedAt: Date | null;
      securedAt: Date | null;
    } | null;
  },
  submission: {
    submittedAt: Date | null;
    reviewedAt: Date | null;
    status: string;
  } | null,
  intake: {
    selectedAt: Date;
    shipment: { shippedAt: Date; deliveredAt: Date | null } | null;
    receivedAt: Date | null;
  } | null,
  review: { status: string; completedAt: Date | null } | null,
  valuation: { decidedAt: Date } | null,
) {
  // Seeded/demo catalogue records may be published without a physical intake
  // record. They are useful for beta catalogue coverage, but must never imply
  // that Slice shipped, received, or secured a physical item when no event is
  // persisted. Keep that distinction explicit in the lifecycle projection.
  if (asset.publishedAt && !intake) {
    const legacyStages = [
      ...(submission?.submittedAt
        ? [
            {
              key: 'SUBMITTED',
              label: 'Submitted',
              at: submission.submittedAt,
              state: 'complete' as const,
            },
          ]
        : []),
      ...(submission?.status === 'APPROVED' && submission.reviewedAt
        ? [
            {
              key: 'ACCEPTED',
              label: 'Accepted',
              at: submission.reviewedAt,
              state: 'complete' as const,
            },
          ]
        : []),
      {
        key: 'LEGACY_BETA',
        label: 'Legacy / seeded Beta fixture',
        at: null,
        state: 'current' as const,
      },
      {
        key: 'MARKET_LIVE',
        label: 'Published catalogue record',
        at: asset.publishedAt,
        state: 'complete' as const,
      },
    ];
    return legacyStages;
  }
  const done = (at: Date | null | undefined) =>
    at ? ('complete' as const) : ('upcoming' as const);
  const stages = [
    {
      key: 'SUBMITTED',
      label: 'Submitted',
      at: submission?.submittedAt ?? null,
      state: done(submission?.submittedAt),
    },
    {
      key: 'ACCEPTED',
      label: 'Accepted',
      at: submission?.status === 'APPROVED' ? submission.reviewedAt : null,
      state: done(
        submission?.status === 'APPROVED' ? submission.reviewedAt : null,
      ),
    },
    {
      key: 'VAULT_SELECTED',
      label: 'Vault Selected',
      at: intake?.selectedAt ?? null,
      state: done(intake?.selectedAt),
    },
    {
      key: 'SHIPPED',
      label: 'Shipped',
      at: intake?.shipment?.shippedAt ?? null,
      state: done(intake?.shipment?.shippedAt),
    },
    {
      key: 'DELIVERED',
      label: 'Carrier Delivered',
      at: intake?.shipment?.deliveredAt ?? null,
      state: done(intake?.shipment?.deliveredAt),
    },
    {
      key: 'RECEIVED',
      label: 'Received by Slice',
      at: intake?.receivedAt ?? null,
      state: done(intake?.receivedAt),
    },
    {
      key: 'VERIFIED',
      label: 'Verified',
      at: review?.completedAt ?? null,
      state: done(review?.completedAt),
    },
    {
      key: 'VALUED',
      label: 'Valued',
      at: valuation?.decidedAt ?? null,
      state: done(valuation?.decidedAt),
    },
    {
      key: 'VAULT_READY',
      label: 'Vault Ready',
      at: asset.custodyRecord?.securedAt ?? null,
      state: done(asset.custodyRecord?.securedAt),
    },
    {
      key: 'MARKET_LIVE',
      label: 'Market Live',
      at: asset.publishedAt,
      state: done(asset.publishedAt),
    },
  ];
  const firstUpcoming = stages.findIndex((stage) => stage.state === 'upcoming');
  return stages.map((stage, index) => ({
    ...stage,
    state: stage.state === 'complete' ? 'complete' : index === firstUpcoming ? 'current' : stage.state,
  }));
}

function mismatchCodes(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const codes = (value as { codes?: unknown }).codes;
  return Array.isArray(codes)
    ? codes
        .filter((code): code is string => typeof code === 'string')
        .slice(0, 20)
    : [];
}

function maskPhoneForAdmin(phone: string) {
  return `${phone.slice(0, Math.min(3, phone.length - 4))}${'•'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}`;
}
