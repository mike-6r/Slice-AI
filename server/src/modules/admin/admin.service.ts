import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../identity/auth/auth.service';
import { AuthorizationService } from '../identity/access/authorization.service';

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

@Injectable()
export class AdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly authorization: AuthorizationService,
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
    ] = await Promise.all([
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
    ] = await Promise.all([
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
    const [submissions, compliance, payments, alerts] = await Promise.all([
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
      this.db.moneyMovement.count({
        where: { status: { in: ['FAILED', 'MANUAL_REVIEW', 'HELD'] } },
      }),
      this.db.providerIncident.count({ where: { status: 'OPEN' } }),
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
    return {
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
    input: { status?: string; q?: string; limit: number },
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const rows = await this.db.assetSubmission.findMany({
      where: { intake: { isNot: null } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true, publicUsername: true } },
          },
        },
        asset: { select: { title: true } },
        intake: { include: { vault: true, shipment: true, receipt: true } },
      },
    });
    return {
      items: rows
        .map((item) => {
          const intake = item.intake!;
          const stage = intakeStage(item);
          return {
            id: intake.id,
            submissionId: item.id,
            title: item.asset?.title ?? `Submission ${item.id.slice(0, 8)}`,
            collector: {
              id: item.owner.id,
              displayName:
                item.owner.profile?.displayName ?? 'Unnamed collector',
              username: item.owner.profile?.publicUsername ?? null,
            },
            submissionStatus: item.status,
            stage,
            vault: intake.vault
              ? {
                  id: intake.vault.id,
                  displayName: intake.vault.displayName,
                  region: intake.vault.region,
                  countryCode: intake.vault.countryCode,
                }
              : null,
            shipment: intake.shipment
              ? {
                  carrier: intake.shipment.carrier,
                  trackingNumber: intake.shipment.trackingNumber,
                  status: intake.shipment.status,
                  shippedAt: intake.shipment.shippedAt.toISOString(),
                  deliveredAt:
                    intake.shipment.deliveredAt?.toISOString() ?? null,
                }
              : null,
            receipt: intake.receipt
              ? {
                  confirmedAt: intake.receipt.confirmedAt.toISOString(),
                  confirmedById: intake.receipt.confirmedById,
                }
              : null,
            updatedAt: item.updatedAt.toISOString(),
            nextAction: nextIntakeAction(intake),
          };
        })
        .filter((item) => !input.status || item.stage === input.status)
        .filter(
          (item) =>
            !input.q ||
            `${item.title} ${item.collector.displayName} ${item.collector.username ?? ''} ${item.shipment?.trackingNumber ?? ''}`
              .toLowerCase()
              .includes(input.q.toLowerCase()),
        ),
    };
  }

  async listMemberships(
    actor: Actor,
    input: { status?: string; q?: string; limit: number },
  ) {
    await this.authorization.authorize(actor, 'admin.console.read');
    const rows = await this.db.collectorSubscription.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      include: {
        plan: {
          select: {
            code: true,
            displayName: true,
            monthlyPriceMinor: true,
            currency: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true, publicUsername: true } },
            _count: { select: { submissions: true } },
          },
        },
      },
    });
    return {
      items: rows
        .map((item) => ({
          id: item.id,
          collector: {
            id: item.user.id,
            displayName: item.user.profile?.displayName ?? 'Unnamed collector',
            username: item.user.profile?.publicUsername ?? null,
            email: item.user.email,
          },
          plan: {
            code: item.plan.code,
            displayName: item.plan.displayName,
            monthlyPriceMinor: item.plan.monthlyPriceMinor.toString(),
            currency: item.plan.currency,
          },
          status: item.status,
          currentPeriodEnd: item.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: item.cancelAtPeriodEnd,
          submissionCount: item.user._count.submissions,
          updatedAt: item.updatedAt.toISOString(),
        }))
        .filter((item) => !input.status || item.status === input.status)
        .filter(
          (item) =>
            !input.q ||
            `${item.collector.displayName} ${item.collector.username ?? ''} ${item.collector.email}`
              .toLowerCase()
              .includes(input.q.toLowerCase()),
        ),
    };
  }

  async listUsers(
    actor: Actor,
    input: {
      q?: string;
      role?: string;
      status?: string;
      limit: number;
      cursor?: string;
    },
  ) {
    await this.authorization.authorize(actor, 'users.read');
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { accountStatus: input.status as never } : {}),
      ...(input.role
        ? {
            roleAssignments: {
              some: { role: input.role as never, revokedAt: null },
            },
          }
        : {}),
      ...(input.q
        ? {
            OR: [
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
    const users = await this.db.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        accountStatus: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { displayName: true, publicUsername: true } },
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
    });
    const items = users.slice(0, input.limit).map((user) => ({
      id: user.id,
      displayName: user.profile?.displayName ?? 'Unnamed user',
      username: user.profile?.publicUsername ?? null,
      email: user.email,
      accountStatus: user.accountStatus,
      roles: user.roleAssignments.map((assignment) => ({
        ...assignment,
        createdAt: assignment.createdAt.toISOString(),
      })),
      createdAt: user.createdAt.toISOString(),
      lastActivityAt: user.lastLoginAt?.toISOString() ?? null,
    }));
    return {
      items,
      nextCursor:
        users.length > input.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async userDetail(actor: Actor, userId: string) {
    await this.authorization.authorize(actor, 'users.read', userId as never);
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
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
    const activeIntakes = await this.db.submissionIntake.count({
      where: {
        submission: {
          ownerUserId: userId,
          status: { notIn: ['DRAFT', 'CANCELLED', 'REJECTED'] },
        },
        status: { not: 'COMPLETE' },
      },
    });
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
      collector:
        user.collectorSubscriptions.length ||
        user.roleAssignments.some((role) => role.role === 'COLLECTOR')
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
          target: `/asset/${asset.slug}`,
        })),
      ].slice(0, limit),
    };
  }
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
