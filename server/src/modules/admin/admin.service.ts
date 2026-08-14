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
import {
  collectorUsageForMany,
} from '../collector-workspace/collector-entitlements';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

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
  return item.intake.status;
}

function nextIntakeAction(intake: {
  status: string;
  shipment: { status: string } | null;
  receipt: unknown;
}) {
  if (!intake.shipment) return 'Await shipment details';
  if (intake.shipment.status === 'DELIVERED' && !intake.receipt)
    return 'Confirm receipt';
  if (intake.status === 'VERIFICATION') return 'Verify collectible';
  if (intake.status === 'RECEIVED') return 'Start verification';
  if (intake.status === 'COMPLETE') return 'No action';
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
  ) {}

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
      preGradeRuns,
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
        where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
      }),
      this.db.assetMarketSnapshot.count(),
      this.db.rawCardPreGrade.findMany({ orderBy: { updatedAt: 'desc' }, take: 20, select: { status: true, updatedAt: true } }),
    ]);
    const incidentCounts = new Map<string, number>();
    for (const incident of incidents)
      incidentCounts.set(
        incident.provider,
        (incidentCounts.get(incident.provider) ?? 0) + 1,
      );
    const dbCheckedAt = new Date().toISOString();
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
          : ('Unknown' as const),
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
            : ('Unknown' as const),
          summary: notificationFailures
            ? `${notificationFailures} failed deliveries require review.`
            : 'No current failure telemetry.',
          lastCheckedAt: dbCheckedAt,
        },
        {
          name: 'Market data',
          status: 'Unknown' as const,
          summary: marketSnapshots
            ? 'Snapshot records are available; provider health telemetry is not exposed.'
            : 'No market snapshot telemetry is available.',
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
            ? `Raw card AI Pre-Grade is configured${preGradeRuns[0] ? ` · last ${preGradeRuns[0].status.toLowerCase().replaceAll('_', ' ')}` : ''}.`
            : 'Optional raw card AI Pre-Grade is not configured.',
          status: preGradeRuns.some((run) => ['FAILED', 'TEMPORARILY_UNAVAILABLE'].includes(run.status))
            ? ('Degraded' as const)
            : this.config.ximilarEnabled && this.config.ximilarCardGradingEnabled && this.config.ximilarApiToken
              ? ('Operational' as const)
              : ('Unavailable' as const),
        },
        integration(
          'Plaid',
          false,
          incidentCounts.get('PLAID')
            ? 'Open provider incident.'
            : 'Provider configuration is not exposed in Admin.',
          incidentCounts.get('PLAID') ?? 0,
        ),
        integration(
          'Bridge',
          false,
          incidentCounts.get('BRIDGE')
            ? 'Open provider incident.'
            : 'Provider configuration is not exposed in Admin.',
          incidentCounts.get('BRIDGE') ?? 0,
        ),
        integration(
          'BlockchainAnalysis.io',
          false,
          incidentCounts.get('BLOCKCHAIN_ANALYSIS')
            ? 'Open provider incident.'
            : 'Provider configuration is not exposed in Admin.',
          incidentCounts.get('BLOCKCHAIN_ANALYSIS') ?? 0,
        ),
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
    const degraded = risk.system.filter((item) => item.status === 'Degraded');
    const unknown = risk.system.some((item) => item.status === 'Unknown');
    const overallHealth = degraded.length ? 'Degraded' : unknown ? 'Unknown' : 'Healthy';
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
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      user: {
        id: item.user.id,
        displayName: item.user.profile?.displayName ?? 'Unnamed user',
        username: item.user.profile?.publicUsername ?? null,
      },
      providerStatus: item.status === 'NOT_STARTED' ? 'Unknown' : item.status,
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
      supportTickets,
      payments,
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
      this.db.discordTicket.count({
        where: { status: { in: ['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF', 'ESCALATED'] } },
      }),
      this.db.moneyMovement.count({
        where: { status: { in: ['FAILED', 'MANUAL_REVIEW', 'HELD'] } },
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
        },
      }),
      this.db.notificationDelivery.count({
        where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
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
      if (action.includes('VALUATION')) return 'Valuation completed';
      if (action.includes('SUBMISSION_APPROVED')) return 'Submission accepted';
      if (action.includes('RECEIPT')) return 'Receipt confirmed';
      if (action.includes('PUBLISH')) return 'Listing published';
      if (action.includes('ORDER')) return 'Order activity';
      if (action.includes('USER')) return 'Account activity';
      if (action.includes('MEMBERSHIP')) return 'Membership changed';
      return 'Admin activity';
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
        status: notificationFailures ? 'Degraded' : 'Unknown',
        summary: notificationFailures
          ? `${notificationFailures} failed deliveries require review.`
          : 'Notification failure telemetry is not available.',
      },
      {
        name: 'Market data',
        status: marketSnapshots ? 'Operational' : 'Unknown',
        summary: marketSnapshots
          ? `${marketSnapshots} market snapshots are available.`
          : 'Market snapshot telemetry is not available.',
      },
      {
        name: 'Vault Integration',
        status: 'Unknown',
        summary: 'Provider health telemetry is not exposed.',
      },
      {
        name: 'Payment Provider',
        status: 'Unknown',
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
        context: `${row.resourceType}${row.resourceId ? ` · ${row.resourceId.slice(0, 8)}` : ''}`,
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
      generatedAt: new Date().toISOString(),
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
        media: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    const projected = rows.map((item) => {
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
      return {
        id: intake?.id ?? item.id,
        submissionId: item.id,
        intakeReference: intake?.intakeReference ?? null,
        title:
          item.asset?.title ??
          metadataString('name') ??
          `Submission ${item.id.slice(0, 8)}`,
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
    });
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
      select: { id: true, displayName: true },
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
          status: { notIn: ['CANCELLED', 'EXPIRED'] },
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
      PAST_DUE: 0,
      CANCELLED: 0,
      CANCEL_AT_PERIOD_END: 0,
      TRIALING: 0,
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
          currentPeriodStart: null,
          currentPeriodEnd: item.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: item.cancelAtPeriodEnd,
          trialEnd: null,
          providerConfigured: Boolean(item.provider && item.provider !== 'STAGING_DEMO'),
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
          concurrentIntakeAtLimit:
            usage.maxConcurrentIntake !== null && usage.concurrentIntake >= usage.maxConcurrentIntake,
          billingPeriodStart: usage.billingPeriodStart,
          billingPeriodEnd: usage.billingPeriodEnd,
        },
        billing: {
          nextBillingDate: item.currentPeriodEnd?.toISOString() ?? null,
          health: item.status === 'PAST_DUE' ? 'PAST_DUE' : 'CURRENT',
        },
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
    if (roleFilters.length) where.AND = roleFilters;
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
        restricted,
        suspended,
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
            plan: { select: { displayName: true } },
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
          status: { in: ['CREATED', 'PENDING_PROVIDER', 'PROCESSING'] },
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
    const collectorEnabled = Boolean(
      user.collectorSubscriptions.length ||
      user.roleAssignments.some((role) => role.role === 'COLLECTOR'),
    );
    return {
      id: user.id,
      email: user.email,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt.toISOString(),
      lastActivityAt: user.lastLoginAt?.toISOString() ?? null,
      profile: user.profile,
      roles: user.roleAssignments.map((assignment) => ({
        ...assignment,
        createdAt: assignment.createdAt.toISOString(),
      })),
      statusHistory: user.statusHistory.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
      counts: user._count,
      collector: collectorEnabled
        ? {
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
        phone: user.phoneE164,
        country: user.profile?.countryCode ?? null,
        discord: {
          connected: Boolean(user.discordAccountLink),
          username: user.discordAccountLink?.username ?? null,
          displayName: user.discordAccountLink?.displayName ?? null,
          linkedAt: user.discordAccountLink?.linkedAt.toISOString() ?? null,
        },
        twoFactorEnabled: Boolean(user.twoFactor?.enabledAt),
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
    const [pendingMovements, exceptions, mismatches] = await Promise.all([
      this.db.moneyMovement.count({
        where: {
          status: { in: ['CREATED', 'PENDING_PROVIDER', 'PROCESSING'] },
        },
      }),
      this.db.moneyMovement.count({
        where: { status: { in: ['FAILED', 'MANUAL_REVIEW', 'HELD'] } },
      }),
      this.db.financialReconciliationRun.count({
        where: { status: 'MISMATCH' },
      }),
    ]);
    return {
      currency: 'GBP',
      pendingMovements,
      exceptions,
      reconciliationMismatches: mismatches,
    };
  }

  async financeDashboard(actor: Actor) {
    await this.authorization.authorize(actor, 'finance.read');
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const historyStart = new Date(dayStart);
    historyStart.setUTCDate(historyStart.getUTCDate() - 6);
    const pendingStates = ['CREATED', 'PENDING_PROVIDER', 'PROCESSING'] as const;
    const [accounts, pendingMovements, openOrders, executions, historyExecutions, reconRuns, activity] =
      await Promise.all([
        this.db.financialAccount.findMany({
          where: { ownerType: 'USER', currency: 'GBP' },
          select: { normalSide: true, balance: true },
        }),
        this.db.moneyMovement.findMany({
          where: { status: { in: [...pendingStates] } },
          select: { type: true, amountMinor: true },
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
    return {
      currency: 'GBP',
      kpis: {
        totalCustomerCashMinor: customerCash.toString(),
        reservedFundsMinor: reservedFunds.toString(),
        pendingDepositsMinor: pendingDeposits.toString(),
        pendingWithdrawalsMinor: pendingWithdrawals.toString(),
        openOrders,
        executionsToday: executions.length,
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
      return { tab: input.tab, items: [], pagination: { page: input.page, pageSize: take, total: 0, totalPages: 0 } };
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
        this.db.tradingOrder.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take, include: { asset: { select: { title: true, slug: true } }, user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } }),
        this.db.tradingOrder.count({ where }),
      ]);
      return this.financePage(input, total, rows.map((order) => ({ id: order.id, kind: 'order', user: { id: order.user.id, displayName: order.user.profile?.displayName ?? 'Unnamed user', username: order.user.profile?.publicUsername ?? null, email: order.user.email }, asset: { title: order.asset.title, slug: order.asset.slug }, side: order.side, shares: order.originalUnits.toString(), limitPriceMinor: order.limitPriceMinor.toString(), filled: order.filledUnits.toString(), remaining: order.remainingUnits.toString(), status: order.status, createdAt: order.createdAt.toISOString() })));
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
        this.db.tradingExecution.findMany({ where, orderBy: [{ executedAt: 'desc' }, { id: 'desc' }], skip, take, include: { asset: { select: { title: true, slug: true } }, buyOrder: { select: { user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } }, sellOrder: { select: { user: { select: { id: true, email: true, profile: { select: { displayName: true, publicUsername: true } } } } } } } }),
        this.db.tradingExecution.count({ where }),
      ]);
      return this.financePage(input, total, rows.map((execution) => ({ id: execution.id, kind: 'execution', asset: { title: execution.asset.title, slug: execution.asset.slug }, buyer: { id: execution.buyOrder.user.id, displayName: execution.buyOrder.user.profile?.displayName ?? 'Unnamed user', username: execution.buyOrder.user.profile?.publicUsername ?? null }, seller: { id: execution.sellOrder.user.id, displayName: execution.sellOrder.user.profile?.displayName ?? 'Unnamed user', username: execution.sellOrder.user.profile?.publicUsername ?? null }, shares: execution.units.toString(), priceMinor: execution.priceMinor.toString(), feeMinor: (execution.buyerFeeMinor + execution.sellerFeeMinor).toString(), executedAt: execution.executedAt.toISOString(), settlementStatus: execution.settlementStatus })));
    }
    const where: Prisma.FinancialReconciliationRunWhereInput = input.status ? { status: input.status as never } : {};
    const [rows, total] = await Promise.all([
      this.db.financialReconciliationRun.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
      this.db.financialReconciliationRun.count({ where }),
    ]);
    return this.financePage(input, total, rows.map((run) => ({ id: run.id, kind: 'reconciliation', reference: run.id, scope: run.scope, status: run.status, expectedMinor: run.debitMinor.toString(), observedMinor: run.creditMinor.toString(), differenceMinor: (run.debitMinor - run.creditMinor).toString(), currency: run.currency, createdAt: run.createdAt.toISOString(), actions: ['Inspect'] })));
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
        custodyRecord: {
          include: { events: { orderBy: { occurredAt: 'asc' } } },
        },
        publication: true,
        ownershipSupply: {
          include: {
            positions: {
              select: {
                settledUnits: true,
                reservedUnits: true,
                accountId: true,
              },
            },
          },
        },
        tradingMarket: true,
        tradingExecutions: { orderBy: { executedAt: 'desc' }, take: 50 },
        vaultPublicEvents: { orderBy: { occurredAt: 'asc' }, take: 50 },
      },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Collectible not found.',
      });
    const approved =
      asset.submissions.find(
        (submission) => submission.status === 'APPROVED',
      ) ??
      asset.submissions[0] ??
      null;
    const intake = approved?.intake ?? null;
    const latestReview = approved?.reviews[0] ?? null;
    const snapshot = asset.marketSnapshots[0] ?? null;
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
    const saleValues = sales.map((item) => item.valueMinor);
    const avgSale = saleValues.length
      ? saleValues.reduce((sum, value) => sum + value, 0n) /
        BigInt(saleValues.length)
      : null;
    return {
      id: asset.id,
      publicId: asset.publicId,
      slug: asset.slug,
      title: asset.title,
      status: asset.status,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      media: asset.submissions.flatMap((submission) =>
        submission.media
          .filter((item) => item.status === 'SAFE')
          .map((item) => ({
            slot: item.slot,
            filename: item.originalFilename,
            status: item.status,
            url: null,
          })),
      ),
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
      },
      lifecycle: { current, stages },
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
        asking: listing
          ? { minor: listing.minor, currency: listing.currency }
          : null,
        floor: null,
        salesAverage:
          avgSale === null
            ? null
            : { minor: avgSale.toString(), currency: sales[0]!.currency },
        salesCount: sales.length,
        lastUpdated: snapshot?.asOf.toISOString() ?? null,
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
      evidence: asset.submissions.flatMap((submission) =>
        submission.media
          .filter((item) => item.status === 'SAFE')
          .map((item) => ({
            slot: item.slot,
            filename: item.originalFilename,
            status: item.status,
            url: null,
          })),
      ),
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
    state:
      stage.state === 'complete'
        ? index === firstUpcoming - 1
          ? 'complete'
          : 'complete'
        : index === firstUpcoming
          ? 'current'
          : stage.state,
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
