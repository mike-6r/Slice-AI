import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../../submissions/ports/submission-storage.ports';
import {
  assertCustodyTransition,
  assertMoney,
  evaluateReadiness,
} from '../domain/publication.policy';
import {
  catalogueCustodyState,
  cataloguePhysicalState,
  catalogueVerificationState,
  type CatalogueLifecycleInput,
} from '../../admin/admin-catalogue-projections';
import {
  hasStagingDemoPhysicalReadiness,
  isExplicitPikachuOwnerDemoSubmission,
  isProtectedControlledAsset,
  STAGING_DEMO_PHYSICAL_CONFIRMATION,
  STAGING_DEMO_PIKACHU_FIXTURE_KEY,
} from '../domain/staging-demo-physical.policy';

type Db = Prisma.TransactionClient;
type OperationsBoardInput = {
  limit?: number;
  tab?: string;
  q?: string;
  category?: string;
  grader?: string;
  stage?: string;
  valuation?: string;
  ownership?: string;
  offering?: string;
  market?: string;
  workType?: string;
  attention?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};
type OperationsStage =
  | 'PHYSICAL_PREREQUISITE'
  | 'VALUATION'
  | 'OWNERSHIP_SETUP'
  | 'OFFERING_SETUP'
  | 'LAUNCH_READINESS'
  | 'READY_FOR_LAUNCH'
  | 'MARKET_LIVE'
  | 'RESTRICTION';
type BoardAsset = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  certificationNumber: string | null;
  edition: string | null;
  status: string;
  updatedAt: Date;
  createdAt: Date;
  category: { name: string; slug: string };
  collectibleSet: { name: string } | null;
  gradeScaleEntry: {
    grade: { toFixed: (digits: number) => string };
    company: { code: string };
  } | null;
  submissions: Array<{
    id: string;
    status: string;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    owner: {
      id: string;
      profile: { displayName: string; publicUsername: string | null } | null;
    };
    media: Array<{ slot: string; status: string; objectKey: string }>;
    marketResearch: Array<{ state: string; collectedAt: Date }>;
    intake: {
      status: string;
      deliveryMethod: 'SHIPMENT' | 'IN_PERSON';
      selectedAt: Date;
      updatedAt: Date;
      receivedAt: Date | null;
      shipment: {
        status: string;
        shippedAt: Date;
        deliveredAt: Date | null;
      } | null;
      receipt: { confirmedAt: Date } | null;
      vault: { displayName: string };
      verification: { status: string; updatedAt: Date } | null;
      exceptions: Array<{ code: string; severity: string; createdAt: Date }>;
    } | null;
    reviews: Array<{
      status: string;
      createdAt: Date;
      completedAt: Date | null;
    }>;
  }>;
  valuationDecisions: Array<{
    status: string;
    decidedAt: Date;
    valueMinor: bigint;
    currency: string;
  }>;
  valuationEvidence: Array<{
    sourceType: string;
    sourceRef: string | null;
    observedAt: Date;
  }>;
  marketSnapshots: Array<{ asOf: Date }>;
  custodyRecord: { status: string; updatedAt: Date } | null;
  insuranceCoverage: Array<{ status: string; expiresAt: Date }>;
  publication: { status: string; updatedAt: Date; readiness: unknown } | null;
  ownershipSupply: {
    status: string;
    totalUnits: bigint;
    issuedUnits: bigint;
  } | null;
  ownershipSupplyPolicy: { status: string } | null;
  initialOffering: { id: string; status: string; updatedAt: Date } | null;
  tradingMarket: { status: string; tradingEnabled: boolean } | null;
  controlledBetaBypass: { id: string } | null;
  stagingDemoPhysicalIntake: { id: string } | null;
};

export const CONTROLLED_BETA_UMBREON_FIXTURE_KEY =
  'UMBREON_VMAX_2021_EVOLVING_SKIES_215_203';
export const CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE =
  'BETA_QA_PHYSICAL_BYPASS';
export const CONTROLLED_BETA_PHYSICAL_BYPASS_CONFIRMATION =
  'BETA_QA_PHYSICAL_BYPASS';

@Injectable()
export class LifecycleService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async sellerStatus(actor: Actor, assetId: string) {
    const asset = await this.db.asset.findFirst({
      where: {
        id: assetId,
        submissions: { some: { ownerUserId: actor.userId } },
      },
      include: {
        publication: true,
        custodyRecord: true,
        insuranceCoverage: true,
      },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found.',
      });
    return safeStatus(asset);
  }

  /** Bounded staff-only discovery projection for the existing D11 authority. */
  async operationsQueue(actor: Actor, input: number | OperationsBoardInput) {
    if (
      !actor.roles.some((role) =>
        ['ADMIN', 'COMPLIANCE_ANALYST', 'VAULT_OPERATOR'].includes(role),
      )
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view asset operations.',
      });
    }
    if (typeof input === 'number') {
      const assets = await this.db.asset.findMany({
        where: { status: { not: 'ARCHIVED' } },
        include: {
          valuationDecisions: {
            where: { status: 'ACTIVE' },
            orderBy: { decidedAt: 'desc' },
            take: 1,
          },
          custodyRecord: true,
          insuranceCoverage: {
            where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: 'desc' },
            take: 1,
          },
          publication: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: input,
      });
      return {
        items: assets.map((asset) => ({
          id: asset.id,
          publicId: asset.publicId,
          title: asset.title,
          catalogueStatus: asset.status,
          valuationStatus: asset.valuationDecisions.length
            ? 'ACTIVE'
            : 'MISSING',
          custodyStatus: asset.custodyRecord?.status ?? 'MISSING',
          coverageStatus: asset.insuranceCoverage.length ? 'ACTIVE' : 'MISSING',
          publicationStatus: asset.publication?.status ?? 'BLOCKED',
          updatedAt: asset.updatedAt.toISOString(),
        })),
      };
    }
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const assets = await this.db.asset.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        submissions: { some: { status: 'APPROVED' } },
        ...(input.q
          ? {
              OR: [
                { title: { contains: input.q, mode: 'insensitive' } },
                { publicId: { contains: input.q, mode: 'insensitive' } },
                { slug: { contains: input.q, mode: 'insensitive' } },
                { cardNumber: { contains: input.q, mode: 'insensitive' } },
                {
                  certificationNumber: {
                    contains: input.q,
                    mode: 'insensitive',
                  },
                },
                {
                  submissions: {
                    some: {
                      OR: [
                        { id: { contains: input.q, mode: 'insensitive' } },
                        {
                          owner: {
                            profile: {
                              is: {
                                displayName: {
                                  contains: input.q,
                                  mode: 'insensitive',
                                },
                              },
                            },
                          },
                        },
                        {
                          owner: {
                            profile: {
                              is: {
                                publicUsername: {
                                  contains: input.q,
                                  mode: 'insensitive',
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
        ...(input.category ? { category: { slug: input.category } } : {}),
        ...(input.grader
          ? {
              gradeScaleEntry: {
                company: { code: input.grader.toUpperCase() },
              },
            }
          : {}),
      },
      include: {
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
        submissions: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            owner: {
              select: {
                id: true,
                profile: {
                  select: { displayName: true, publicUsername: true },
                },
              },
            },
            media: { where: { status: 'SAFE', deletedAt: null }, take: 2 },
            intake: {
              include: {
                vault: true,
                shipment: true,
                receipt: true,
                verification: true,
                exceptions: {
                  where: { resolvedAt: null },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
            reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
            marketResearch: {
              orderBy: { collectedAt: 'desc' },
              take: 1,
              select: { state: true, collectedAt: true },
            },
          },
        },
        valuationDecisions: {
          where: { status: 'ACTIVE' },
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
        valuationEvidence: { orderBy: { observedAt: 'desc' }, take: 10 },
        marketSnapshots: { orderBy: { asOf: 'desc' }, take: 1 },
        custodyRecord: true,
        insuranceCoverage: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
        publication: true,
        ownershipSupply: true,
        ownershipSupplyPolicy: true,
        initialOffering: true,
        tradingMarket: true,
        controlledBetaBypass: true,
        stagingDemoPhysicalIntake: true,
      },
      orderBy: { updatedAt: 'desc' },
      // The returned page is authoritative and all filters run on the server.
      // We deliberately bound the discovery projection until the materialized
      // operations index lands; this prevents an unbounded administrative read.
      take: 500,
    });
    const allProjected = (
      await Promise.all(
        assets.map((asset) => operationsItem(asset, this.storage)),
      )
    ).filter(
      (item): item is NonNullable<Awaited<ReturnType<typeof operationsItem>>> =>
        Boolean(item),
    );
    const counts = operationsCounts(allProjected);
    const projected = allProjected
      .filter((item) => operationsMatches(item, input))
      .sort((left, right) => operationsSort(left, right, input.sort));
    const start = (page - 1) * pageSize;
    const items = projected.slice(start, start + pageSize);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total: projected.length,
        totalPages: Math.max(1, Math.ceil(projected.length / pageSize)),
      },
      counts,
    };
  }

  /**
   * The detail workspace consumes this bounded projection rather than deriving
   * an economic state machine in React. It deliberately reuses the operations
   * board authority so queue and detail cannot disagree about physical gates,
   * the current stage, or the next actor.
   */
  async operationDetail(actor: Actor, assetId: string) {
    const board = await this.operationsQueue(actor, {
      q: assetId,
      page: 1,
      pageSize: 100,
      sort: 'UPDATED_DESC',
    });
    const item = board.items.find((candidate) => candidate.id === assetId) as
      NonNullable<Awaited<ReturnType<typeof operationsItem>>> | undefined;
    if (!item)
      throw new NotFoundException({
        code: 'ASSET_OPERATION_NOT_FOUND',
        message: 'The asset is not available in the operations workspace.',
      });
    const blockers = [
      ...item.entryBlockers,
      ...item.launchReadiness.blockers,
      ...(item.exception ? [item.exception.type] : []),
    ].filter((value, index, values) => values.indexOf(value) === index);
    const issued = item.ownership.state === 'ISSUED';
    const offeringLive = ['OPEN', 'PARTIALLY_FILLED', 'SOLD_OUT'].includes(
      item.offering.state,
    );
    return {
      assetId,
      physicalPrerequisites: item.physicalPrerequisiteSummary,
      operations: {
        stage: item.currentStage,
        nextAction: item.nextAction,
        nextActor: item.nextAction.actor,
        blockers,
      },
      economicWorkflow: operationEconomicWorkflow(item),
      launchReadiness: item.launchReadiness,
      reconciliation: {
        ownership: {
          expectedUnits: item.ownership.totalUnits,
          allocatedUnits: item.ownership.issuedUnits,
          differenceUnits:
            issued && item.ownership.totalUnits === item.ownership.issuedUnits
              ? '0'
              : null,
          state: issued ? 'RECONCILED' : 'NOT_ISSUED',
        },
        offering: {
          state: item.offering.state,
          reconciled: offeringLive ? true : null,
        },
      },
      availableCommands: {
        recordValuation: item.currentStage === 'VALUATION',
        configureOwnership: item.currentStage === 'OWNERSHIP_SETUP',
        issueOwnership:
          item.ownership.state === 'CONFIGURED' &&
          item.offering.state === 'APPROVED',
        reviewOffering: item.offering.state === 'AWAITING_APPROVAL',
        publish: item.launchReadiness.state === 'READY',
        activateMarket: issued && !offeringLive,
        openOffering: issued && item.offering.state === 'APPROVED',
      },
    };
  }

  handoff(
    actor: Actor,
    assetId: string,
    input: { providerCode: string; facilityCode: string; providerRef: string },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.handoff:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/handoff`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const asset = await db.asset.findUnique({
          where: { id: assetId },
          include: {
            submissions: {
              where: { status: 'APPROVED' },
              take: 1,
              select: { id: true },
            },
          },
        });
        if (!asset || !asset.submissions.length)
          throw new ConflictException({
            code: 'CUSTODY_PROOF_REQUIRED',
            message: 'An approved submission is required for intake.',
          });
        const verifiedIntake = await db.assetSubmission.findFirst({
          where: {
            assetId,
            status: 'APPROVED',
            intake: {
              is: {
                receipt: { isNot: null },
                verification: { is: { status: 'VERIFIED' } },
                exceptions: { none: { resolvedAt: null } },
              },
            },
          },
          select: { id: true },
        });
        if (!verifiedIntake)
          throw new ConflictException({
            code: 'CUSTODY_VERIFICATION_REQUIRED',
            message:
              'Verified physical intake without an open exception is required before custody handoff.',
          });
        const custody = await db.vaultCustodyRecord.upsert({
          where: { assetId },
          create: {
            id: randomUUID(),
            assetId,
            providerCode: input.providerCode,
            facilityCode: input.facilityCode,
            providerRef: input.providerRef,
            status: 'EXPECTED',
          },
          update: {},
        });
        await audit('CUSTODY_STATUS_CHANGED', 'asset', assetId, {
          assetId,
          fromStatus: 'NONE',
          toStatus: custody.status,
          providerCode: custody.providerCode,
          facilityCode: custody.facilityCode,
          providerRef: custody.providerRef,
        });
        await this.notifyOwner(
          db,
          assetId,
          'LIFECYCLE_HANDOFF',
          'Asset intake started',
        );
        return { assetId, custodyStatus: custody.status };
      },
    );
  }

  custody(
    actor: Actor,
    assetId: string,
    input: { toStatus: string; providerRef?: string },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.custody:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/custody/transitions`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "VaultCustodyRecord" WHERE "assetId" = ${assetId} FOR UPDATE`;
        const custody = await db.vaultCustodyRecord.findUnique({
          where: { assetId },
        });
        if (!custody)
          throw new NotFoundException({
            code: 'CUSTODY_PROOF_REQUIRED',
            message: 'Asset intake is required.',
          });
        if (['RECEIVED', 'INSPECTED'].includes(input.toStatus)) {
          const verifiedIntake = await db.assetSubmission.findFirst({
            where: {
              assetId,
              status: 'APPROVED',
              intake: {
                is: {
                  receipt: { isNot: null },
                  verification: { is: { status: 'VERIFIED' } },
                  exceptions: { none: { resolvedAt: null } },
                },
              },
            },
            select: { id: true },
          });
          if (!verifiedIntake)
            throw new ConflictException({
              code: 'CUSTODY_VERIFICATION_REQUIRED',
              message:
                'Verified physical intake without an open exception is required before custody can progress.',
            });
        }
        assertCustodyTransition(custody.status, input.toStatus);
        if (
          ['RECEIVED', 'INSPECTED', 'SECURED'].includes(input.toStatus) &&
          !input.providerRef
        )
          throw new ConflictException({
            code: 'CUSTODY_EVIDENCE_REQUIRED',
            message:
              'A custody evidence or operator reference is required for this transition.',
          });
        if (input.toStatus === 'SECURED') {
          if (custody.status !== 'INSPECTED')
            throw new ConflictException({
              code: 'CUSTODY_INSPECTION_REQUIRED',
              message: 'Custody must be inspected before it can be secured.',
            });
          const coverage = await db.insuranceCoverage.count({
            where: {
              assetId,
              status: 'ACTIVE',
              effectiveAt: { lte: new Date() },
              expiresAt: { gt: new Date() },
            },
          });
          if (coverage !== 1)
            throw new ConflictException({
              code: 'ACTIVE_COVERAGE_REQUIRED',
              message:
                'Active insurance coverage is required before custody can be secured.',
            });
        }
        const at = new Date();
        const updated = await db.vaultCustodyRecord.update({
          where: { id: custody.id },
          data: {
            status: input.toStatus as never,
            providerRef: input.providerRef ?? custody.providerRef,
            receivedAt: input.toStatus === 'RECEIVED' ? at : custody.receivedAt,
            securedAt: input.toStatus === 'SECURED' ? at : custody.securedAt,
          },
        });
        await db.custodyEvent.create({
          data: {
            id: randomUUID(),
            assetId,
            custodyRecordId: custody.id,
            fromStatus: custody.status,
            toStatus: input.toStatus as never,
            actorUserId: actor.userId,
            providerRef: input.providerRef ?? custody.providerRef,
            occurredAt: at,
          },
        });
        await audit('CUSTODY_STATUS_CHANGED', 'asset', assetId, {
          assetId,
          fromStatus: custody.status,
          toStatus: input.toStatus,
          providerRef: input.providerRef ?? custody.providerRef,
        });
        await this.notifyOwner(
          db,
          assetId,
          `LIFECYCLE_CUSTODY_${input.toStatus}`,
          'Asset custody status updated',
        );
        return {
          assetId,
          custodyStatus: updated.status,
          asOf: updated.updatedAt.toISOString(),
        };
      },
    );
  }

  valuation(
    actor: Actor,
    assetId: string,
    input: {
      valueMinor: bigint;
      currency: string;
      confidence: number;
      methodologyCode: string;
      sourceType: string;
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.valuation:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/valuations/decisions`,
      input,
      requestId,
      key,
      async (db, audit) => {
        assertMoney(input.valueMinor, input.currency);
        if (
          !Number.isInteger(input.confidence) ||
          input.confidence < 0 ||
          input.confidence > 100
        )
          throw new ConflictException({
            code: 'VALUATION_EVIDENCE_INVALID',
            message: 'Confidence must be a whole percentage.',
          });
        await this.asset(db, assetId);
        const at = new Date();
        await db.valuationEvidence.create({
          data: {
            id: randomUUID(),
            assetId,
            sourceType: input.sourceType,
            observedAt: at,
            valueMinor: input.valueMinor,
            currency: input.currency,
            conditionBasis: 'MANUAL_UNVERIFIED',
            confidence: input.confidence,
            createdByUserId: actor.userId,
          },
        });
        await db.valuationDecision.updateMany({
          where: { assetId, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' },
        });
        const decision = await db.valuationDecision.create({
          data: {
            id: randomUUID(),
            assetId,
            valueMinor: input.valueMinor,
            currency: input.currency,
            confidence: input.confidence,
            methodologyCode: input.methodologyCode,
            decidedByUserId: actor.userId,
            decidedAt: at,
          },
        });
        await audit('VALUATION_DECIDED', 'asset', assetId, {
          assetId,
          currency: input.currency,
          confidence: input.confidence,
          methodologyCode: input.methodologyCode,
        });
        await this.notifyOwner(
          db,
          assetId,
          'LIFECYCLE_VALUATION_COMPLETE',
          'Asset valuation recorded',
        );
        return {
          assetId,
          valuation: {
            amount: decision.valueMinor.toString(),
            currency: decision.currency,
            confidence: decision.confidence,
            asOf: decision.decidedAt.toISOString(),
            status: 'MANUAL_UNVERIFIED',
          },
        };
      },
    );
  }

  coverage(
    actor: Actor,
    assetId: string,
    input: {
      insuredValueMinor: bigint;
      currency: string;
      effectiveAt: Date;
      expiresAt: Date;
      status: 'PENDING' | 'ACTIVE';
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.coverage:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/insurance/coverage`,
      input,
      requestId,
      key,
      async (db, audit) => {
        assertMoney(input.insuredValueMinor, input.currency);
        if (input.expiresAt <= input.effectiveAt)
          throw new ConflictException({
            code: 'COVERAGE_INVALID',
            message: 'Coverage dates are invalid.',
          });
        await this.asset(db, assetId);
        const coverage = await db.insuranceCoverage.create({
          data: {
            id: randomUUID(),
            assetId,
            providerCode: 'MANUAL_UNVERIFIED',
            insuredValueMinor: input.insuredValueMinor,
            currency: input.currency,
            status: input.status,
            effectiveAt: input.effectiveAt,
            expiresAt: input.expiresAt,
          },
        });
        await audit('INSURANCE_COVERAGE_RECORDED', 'asset', assetId, {
          assetId,
          status: coverage.status,
          currency: coverage.currency,
        });
        if (coverage.status === 'ACTIVE') {
          await this.notifyOwner(
            db,
            assetId,
            'LIFECYCLE_INSURANCE_ACTIVE',
            'Asset coverage is active',
          );
        }
        return {
          assetId,
          insurance: {
            status: coverage.status,
            insuredAmount: coverage.insuredValueMinor.toString(),
            currency: coverage.currency,
            expiresAt: coverage.expiresAt.toISOString(),
          },
        };
      },
    );
  }

  async readiness(actor: Actor, assetId: string, requestId?: string) {
    const result = await this.readinessFor(this.db, assetId);
    if (requestId)
      await this.db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'ASSET_PUBLICATION_READINESS_EVALUATED',
          resourceType: 'asset',
          resourceId: assetId,
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: { assetId, status: result.status },
        },
      });
    return result;
  }

  controlledBetaPhysicalBypass(
    actor: Actor,
    input: {
      submissionId: string;
      assetId: string;
      fixtureKey: string;
      reason: string;
      confirmation: string;
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    if (!this.config.isBeta)
      throw new ForbiddenException({
        code: 'CONTROLLED_BETA_FEATURE_DISABLED',
        message:
          'This controlled lifecycle exception is available only in beta.',
      });
    if (!actor.roles.includes('ADMIN'))
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only an administrator can apply this controlled exception.',
      });
    if (
      input.fixtureKey !== CONTROLLED_BETA_UMBREON_FIXTURE_KEY ||
      input.confirmation !== CONTROLLED_BETA_PHYSICAL_BYPASS_CONFIRMATION
    )
      throw new ConflictException({
        code: 'CONTROLLED_BETA_CONFIRMATION_REQUIRED',
        message: 'The named beta fixture and confirmation are required.',
      });

    return this.mutate(
      actor,
      `lifecycle.controlled-beta-physical-bypass:${input.submissionId}`,
      'POST',
      `/v1/admin/submissions/${input.submissionId}/controlled-beta/physical-bypass`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const submission = await db.assetSubmission.findUnique({
          where: { id: input.submissionId },
          include: {
            controlledBetaBypass: true,
            asset: {
              include: {
                category: true,
                collectibleSet: true,
                custodyRecord: true,
                controlledBetaBypass: true,
              },
            },
          },
        });
        const asset = submission?.asset;
        const fixtureMatches =
          asset?.title.toLowerCase().includes('umbreon vmax') &&
          asset.year === 2021 &&
          asset.cardNumber === '215/203' &&
          asset.collectibleSet?.name.toLowerCase() === 'evolving skies' &&
          asset.category.name.toLowerCase() === 'pokémon tcg';
        if (
          !submission ||
          submission.assetId !== input.assetId ||
          submission.status !== 'APPROVED' ||
          !asset ||
          !fixtureMatches
        )
          throw new ConflictException({
            code: 'CONTROLLED_BETA_FIXTURE_REQUIRED',
            message:
              'This exception is limited to the approved Umbreon VMAX 215/203 beta fixture.',
          });
        if (submission.controlledBetaBypass || asset.controlledBetaBypass)
          throw new ConflictException({
            code: 'CONTROLLED_BETA_BYPASS_ALREADY_APPLIED',
            message: 'The controlled beta exception has already been applied.',
          });
        if (asset.custodyRecord)
          throw new ConflictException({
            code: 'PHYSICAL_STATE_ALREADY_STARTED',
            message:
              'The controlled exception cannot be applied after a custody record exists.',
          });

        const created = await db.controlledBetaPhysicalBypass.create({
          data: {
            id: randomUUID(),
            submissionId: submission.id,
            assetId: asset.id,
            reasonCode: CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE,
            reason: input.reason.trim(),
            createdByUserId: actor.userId,
          },
        });
        await audit(
          'CONTROLLED_BETA_PHYSICAL_BYPASS_APPLIED',
          'asset',
          asset.id,
          {
            submissionId: submission.id,
            assetId: asset.id,
            reasonCode: CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE,
            reason: input.reason.trim(),
          },
        );
        return {
          status: 'APPLIED',
          submissionId: submission.id,
          assetId: asset.id,
          reasonCode: CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE,
          createdAt: created.createdAt.toISOString(),
          physicalStateUnchanged: true,
        };
      },
    );
  }

  /**
   * A demo authority, not a physical shortcut. It records only simulated
   * staging receipt, verification and custody for one immutable owner-demo
   * fixture and deliberately leaves real shipment/receipt/custody tables empty.
   */
  completeStagingDemoPhysicalIntake(
    actor: Actor,
    input: {
      submissionId: string;
      assetId: string;
      fixtureKey: string;
      reason: string;
      confirmation: string;
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    if (!this.config.isBeta)
      throw new ForbiddenException({
        code: 'STAGING_DEMO_FEATURE_DISABLED',
        message: 'Demo physical intake is available only in staging.',
      });
    if (!actor.roles.includes('ADMIN'))
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only an administrator can complete demo intake.',
      });
    if (
      input.fixtureKey !== STAGING_DEMO_PIKACHU_FIXTURE_KEY ||
      input.confirmation !== STAGING_DEMO_PHYSICAL_CONFIRMATION
    )
      throw new ConflictException({
        code: 'STAGING_DEMO_CONFIRMATION_REQUIRED',
        message:
          'The explicit owner-demo fixture and confirmation are required.',
      });

    return this.mutate(
      actor,
      `lifecycle.staging-demo-physical-intake:${input.submissionId}`,
      'POST',
      `/v1/admin/submissions/${input.submissionId}/staging-demo/physical-intake`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${input.assetId} FOR UPDATE`;
        const submission = await db.assetSubmission.findUnique({
          where: { id: input.submissionId },
          include: {
            owner: { select: { email: true } },
            stagingDemoPhysicalIntake: true,
            intake: true,
            asset: {
              include: {
                category: { select: { name: true } },
                collectibleSet: { select: { name: true } },
                gradeScaleEntry: {
                  include: { company: { select: { code: true } } },
                },
                custodyRecord: true,
                stagingDemoPhysicalIntake: true,
              },
            },
          },
        });
        const asset = submission?.asset;
        if (
          !submission ||
          !asset ||
          submission.assetId !== input.assetId ||
          submission.status !== 'APPROVED'
        )
          throw new ConflictException({
            code: 'STAGING_DEMO_APPROVED_CANONICAL_ASSET_REQUIRED',
            message:
              'Demo intake requires the existing approved canonical asset.',
          });
        if (isProtectedControlledAsset(asset))
          throw new ForbiddenException({
            code: 'STAGING_DEMO_CONTROLLED_ASSET_FORBIDDEN',
            message:
              'Controlled Umbreon and Charizard fixtures cannot use demo intake.',
          });
        if (!isExplicitPikachuOwnerDemoSubmission(submission.id))
          throw new ForbiddenException({
            code: 'STAGING_DEMO_ASSET_MARKER_REQUIRED',
            message:
              'This asset is not the explicitly marked staging owner-demo fixture.',
          });
        const existing =
          submission.stagingDemoPhysicalIntake ??
          asset.stagingDemoPhysicalIntake;
        if (existing)
          return {
            status: existing.status,
            submissionId: submission.id,
            assetId: asset.id,
            demoIntakeId: existing.id,
            replayed: true,
            simulated: true,
          };
        if (submission.intake || asset.custodyRecord)
          throw new ConflictException({
            code: 'PHYSICAL_STATE_ALREADY_STARTED',
            message:
              'Demo intake cannot be mixed with production physical records.',
          });
        const now = new Date();
        const created = await db.stagingDemoPhysicalIntake.create({
          data: {
            id: randomUUID(),
            submissionId: submission.id,
            assetId: asset.id,
            fixtureKey: input.fixtureKey,
            status: 'DEMO_CUSTODY',
            destinationLabel: 'Slice Staging Demo Intake — Simulated only',
            simulationNote: input.reason.trim(),
            identityMatch: true,
            certificationMatch: true,
            gradeMatch: true,
            variantMatch: true,
            simulatedReceiptAt: now,
            verifiedAt: now,
            custodyAt: now,
            completedByUserId: actor.userId,
          },
        });
        await audit(
          'STAGING_DEMO_PHYSICAL_INTAKE_COMPLETED',
          'asset',
          asset.id,
          {
            submissionId: submission.id,
            assetId: asset.id,
            demoIntakeId: created.id,
            fixtureKey: input.fixtureKey,
            status: created.status,
            reason: input.reason.trim(),
          },
        );
        return {
          status: created.status,
          submissionId: submission.id,
          assetId: asset.id,
          demoIntakeId: created.id,
          simulated: true,
          destinationLabel: created.destinationLabel,
          physicalStateUnchanged: true,
        };
      },
    );
  }

  publish(actor: Actor, assetId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.publish:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/publish`,
      {},
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
        const readiness = await this.readinessFor(db, assetId);
        if (readiness.status !== 'READY')
          throw new ConflictException({
            code: 'PUBLICATION_BLOCKED',
            message: 'Publication prerequisites are not met.',
            blockingCodes: readiness.blockingCodes,
          });
        const asset = await this.asset(db, assetId);
        const existing = await db.assetPublication.findUnique({
          where: { assetId },
        });
        if (existing?.status === 'PUBLISHED') {
          return {
            assetId,
            status: 'PUBLISHED',
            publishedAt: existing.publishedAt!.toISOString(),
            version: existing.version,
          };
        }
        const now = new Date();
        const publication = await db.assetPublication.upsert({
          where: { assetId },
          create: {
            id: randomUUID(),
            assetId,
            status: 'PUBLISHED',
            readiness: { blockingCodes: [] },
            publishedAt: now,
            publishedByUserId: actor.userId,
          },
          update: {
            status: 'PUBLISHED',
            readiness: { blockingCodes: [] },
            publishedAt: now,
            publishedByUserId: actor.userId,
            version: { increment: 1 },
          },
        });
        await db.asset.update({
          where: { id: asset.id },
          data: { status: 'PUBLISHED', publishedAt: now },
        });
        await audit('ASSET_PUBLISHED', 'asset', assetId, {
          assetId,
          version: publication.version,
        });
        await this.notifyOwner(
          db,
          assetId,
          'LIFECYCLE_PUBLISHED',
          'Asset published',
        );
        return {
          assetId,
          status: 'PUBLISHED',
          publishedAt: now.toISOString(),
          version: publication.version,
        };
      },
    );
  }

  private async readinessFor(db: PrismaService | Db, assetId: string) {
    const asset = await (db as PrismaService).asset.findUnique({
      where: { id: assetId },
      include: {
        submissions: { where: { status: 'APPROVED' }, take: 1 },
        valuationDecisions: { where: { status: 'ACTIVE' }, take: 1 },
        custodyRecord: true,
        insuranceCoverage: {
          where: {
            status: 'ACTIVE',
            effectiveAt: { lte: new Date() },
            expiresAt: { gt: new Date() },
          },
          take: 1,
        },
        controlledBetaBypass: true,
        stagingDemoPhysicalIntake: true,
      },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found.',
      });
    const evaluated = evaluateReadiness({
      cataloguePublished: asset.status !== 'ARCHIVED',
      verificationApproved: asset.submissions.length > 0,
      activeDecision: asset.valuationDecisions.length > 0,
      custodySecured: asset.custodyRecord?.status === 'SECURED',
      controlledBetaPhysicalBypass:
        Boolean(asset.controlledBetaBypass) ||
        hasStagingDemoPhysicalReadiness(
          this.config.isBeta,
          asset.stagingDemoPhysicalIntake,
        ),
      activeCoverage: asset.insuranceCoverage.length > 0,
      hasException: asset.custodyRecord?.status === 'EXCEPTION',
    });
    return { assetId, ...evaluated };
  }
  private async asset(db: Db, id: string) {
    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found.',
      });
    return asset;
  }

  private async notifyOwner(
    db: Db,
    assetId: string,
    type: string,
    title: string,
  ) {
    const submission = await db.assetSubmission.findFirst({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      select: { ownerUserId: true },
    });
    if (!submission) return;
    await db.notification.create({
      data: {
        id: randomUUID(),
        userId: submission.ownerUserId,
        type,
        title,
        body: 'Your asset lifecycle status has changed.',
        resourceType: 'asset',
        resourceId: assetId,
      },
    });
  }
  private async mutate<T extends Record<string, unknown>>(
    actor: Actor,
    scope: string,
    method: string,
    path: string,
    body: unknown,
    requestId: string,
    key: string,
    work: (
      db: Db,
      audit: (
        action: string,
        type: string,
        id: string,
        metadata: Record<string, unknown>,
      ) => Promise<void>,
    ) => Promise<T>,
  ) {
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope,
      key,
    };
    const hash = createHash('sha256')
      .update(`${method}\n${path}\n${canonicalBody(body)}`)
      .digest('hex');
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: 'The request key cannot be reused for this operation.',
        });
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw new ConflictException({
          code: 'PERSISTENCE_CONFLICT',
          message: 'The request is already in progress.',
        });
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as T;
      const audit = (
        action: string,
        resourceType: string,
        resourceId: string,
        metadata: Record<string, unknown>,
      ) =>
        tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action,
          resourceType,
          resourceId,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata,
          createdAt: new Date(),
        });
      const result = await work(db, audit);
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
    });
  }
}

async function operationsItem(asset: BoardAsset, storage: ObjectStoragePort) {
  const submission = asset.submissions[0];
  const intake = submission?.intake;
  const decision = asset.valuationDecisions[0];
  if (!submission || submission.status !== 'APPROVED') return null;
  const lifecycle: CatalogueLifecycleInput = {
    submissionStatus: submission.status,
    intake: intake
      ? {
          status: intake.status,
          deliveryMethod: intake.deliveryMethod,
          shipmentStatus: intake.shipment?.status ?? null,
          hasReceipt: Boolean(intake.receipt),
          verificationStatus: intake.verification?.status ?? null,
          hasOpenException: intake.exceptions.length > 0,
        }
      : null,
    custodyStatus: asset.custodyRecord?.status ?? null,
    hasValuation: Boolean(decision),
    ownershipPolicyStatus: asset.ownershipSupplyPolicy?.status ?? null,
    ownershipSupplyStatus: asset.ownershipSupply?.status ?? null,
    issuedUnits: asset.ownershipSupply?.issuedUnits ?? null,
    offeringStatus: asset.initialOffering?.status ?? null,
    publicationStatus: asset.publication?.status ?? null,
    marketStatus: asset.tradingMarket?.status ?? null,
    tradingEnabled: asset.tradingMarket?.tradingEnabled ?? null,
  };
  const physicalState = cataloguePhysicalState(lifecycle);
  const verificationState = catalogueVerificationState(lifecycle);
  const custodyState = catalogueCustodyState(lifecycle);
  const entryBlockers = physicalEntryBlockers(
    physicalState,
    verificationState,
    custodyState,
  );
  const eligibleForAssetOperations = entryBlockers.length === 0;
  const custodyException = asset.custodyRecord?.status === 'EXCEPTION';
  const intakeException = Boolean(intake?.exceptions.length);
  const marketRestriction = asset.tradingMarket?.status === 'HALTED';
  const exception = custodyException || intakeException;
  const ownership = ownershipProjection(asset);
  const offering = offeringProjection(asset);
  const market = marketProjection(asset);
  const covered = asset.insuranceCoverage.some(
    (item) => item.status === 'ACTIVE' && item.expiresAt > new Date(),
  );
  const publicationReadiness = evaluateReadiness({
    cataloguePublished: asset.status !== 'ARCHIVED',
    verificationApproved: verificationState === 'VERIFIED',
    activeDecision: Boolean(decision),
    custodySecured: custodyState === 'IN_CUSTODY',
    activeCoverage: covered,
    hasException: exception,
  });
  const launchBlockers = [
    ...publicationReadiness.blockingCodes,
    ...(ownership.state === 'ISSUED' ? [] : ['OWNERSHIP_ISSUANCE_REQUIRED']),
    ...(offering.state === 'OPEN' || offering.state === 'SOLD_OUT'
      ? []
      : ['INITIAL_OFFERING_REQUIRED']),
  ];
  const launchReadiness = {
    state: launchBlockers.length ? ('BLOCKED' as const) : ('READY' as const),
    blockers: [...new Set(launchBlockers)],
  };
  let currentStage: OperationsStage = 'PHYSICAL_PREREQUISITE';
  let stageSince: Date = intake?.updatedAt ?? asset.updatedAt;
  let detailTab: 'overview' | 'valuation' | 'ownership' | 'market' | 'intake' =
    'intake';
  if (exception) {
    currentStage = 'RESTRICTION';
    stageSince =
      intake?.exceptions[0]?.createdAt ??
      asset.custodyRecord?.updatedAt ??
      asset.updatedAt;
    detailTab = 'intake';
  } else if (!eligibleForAssetOperations) {
    currentStage = 'PHYSICAL_PREREQUISITE';
    stageSince = intake?.updatedAt ?? asset.updatedAt;
  } else if (!decision) {
    currentStage = 'VALUATION';
    stageSince = asset.updatedAt;
    detailTab = 'valuation';
  } else if (ownership.state !== 'ISSUED') {
    currentStage = 'OWNERSHIP_SETUP';
    stageSince =
      asset.ownershipSupplyPolicy?.status === 'PROPOSED'
        ? asset.updatedAt
        : decision.decidedAt;
    detailTab = 'ownership';
  } else if (
    !['OPEN', 'PARTIALLY_FILLED', 'SOLD_OUT'].includes(offering.state)
  ) {
    currentStage = 'OFFERING_SETUP';
    stageSince = asset.initialOffering?.updatedAt ?? asset.updatedAt;
    detailTab = 'market';
  } else if (market.state === 'MARKET_LIVE') {
    currentStage = 'MARKET_LIVE';
    stageSince = asset.publication?.updatedAt ?? asset.updatedAt;
    detailTab = 'market';
  } else if (launchReadiness.state === 'READY') {
    currentStage = 'READY_FOR_LAUNCH';
    stageSince =
      asset.publication?.updatedAt ??
      asset.initialOffering?.updatedAt ??
      decision.decidedAt;
    detailTab = 'market';
  } else {
    currentStage = 'LAUNCH_READINESS';
    stageSince =
      asset.publication?.updatedAt ??
      asset.initialOffering?.updatedAt ??
      decision.decidedAt;
    detailTab = 'market';
  }
  const source = asset.valuationEvidence.find(
    (item) => item.sourceType === 'STAGING_CURRENT_LISTING',
  );
  const approvedMedia = submission.media
    .filter((item) => item.status === 'SAFE' && item.objectKey)
    .sort((left) => (left.slot.toLowerCase() === 'front' ? -1 : 1));
  const thumbnailUrl = approvedMedia[0]
    ? await storage
        .createPrivateDownloadUrl(
          approvedMedia[0].objectKey,
          new Date(Date.now() + 5 * 60_000),
        )
        .catch(() => null)
    : source
      ? sourceImage(source.sourceRef)
      : null;
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - stageSince.getTime()) / 86_400_000),
  );
  return {
    id: asset.id,
    publicId: asset.publicId,
    slug: asset.slug,
    title: asset.title,
    thumbnailUrl,
    collector: submission.owner
      ? {
          id: submission.owner.id,
          displayName:
            submission.owner.profile?.displayName ?? 'Unnamed collector',
          username: submission.owner.profile?.publicUsername ?? null,
          membership: null,
        }
      : null,
    workType: asset.stagingDemoPhysicalIntake
      ? 'OWNER_DEMO'
      : asset.controlledBetaBypass
        ? 'CONTROLLED_QA'
        : 'PRODUCTION',
    eligibleForAssetOperations,
    physicalPrerequisiteSummary: {
      state: physicalState,
      verification: verificationState,
      custody: custodyState,
      location: intake?.vault.displayName ?? null,
      complete: eligibleForAssetOperations,
    },
    entryBlockers,
    grading: {
      company: asset.gradeScaleEntry?.company.code ?? null,
      grade:
        asset.gradeScaleEntry?.grade.toFixed(2).replace(/\.00$/, '') ?? null,
      certNumber: asset.certificationNumber,
      gradeDate: null,
    },
    category: {
      name: asset.category.name,
      set: asset.collectibleSet?.name ?? null,
      variant: asset.edition,
    },
    currentStage,
    stageSince: stageSince.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    valuation: {
      state: decision ? 'VALUED' : 'PENDING',
      valueMinor: decision?.valueMinor.toString() ?? null,
      currency: decision?.currency ?? null,
    },
    ownership,
    offering,
    market,
    launchReadiness,
    attention: {
      required:
        exception ||
        marketRestriction ||
        (eligibleForAssetOperations &&
          currentStage !== 'MARKET_LIVE' &&
          ageDays >= 7),
      reasons: [
        ...(exception
          ? [
              custodyException
                ? 'Custody exception'
                : 'Physical intake exception',
            ]
          : []),
        ...(marketRestriction ? ['Secondary market halted'] : []),
        ...(eligibleForAssetOperations &&
        currentStage !== 'MARKET_LIVE' &&
        ageDays >= 7
          ? ['Operational stage is overdue']
          : []),
      ],
      severity:
        exception || marketRestriction
          ? 'HIGH'
          : ageDays >= 7
            ? 'MEDIUM'
            : 'NONE',
    },
    exception: exception
      ? {
          type: custodyException ? 'CUSTODY_EXCEPTION' : 'INTAKE_EXCEPTION',
          summary: custodyException
            ? 'Custody requires operator attention.'
            : 'Physical intake has an unresolved exception.',
        }
      : null,
    recommendedDetailTab: detailTab,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    sourceContext: {
      submissionId: submission.id,
      receivedAt: intake?.receivedAt?.toISOString() ?? null,
      receiptConfirmedAt: intake?.receipt?.confirmedAt.toISOString() ?? null,
      vault: intake?.vault.displayName ?? 'Not assigned',
    },
    assignee: null,
    nextAction: operationsNextAction(currentStage, entryBlockers),
    ageDays,
  };
}

function physicalEntryBlockers(
  physical: string,
  verification: string,
  custody: string,
) {
  const blockers: string[] = [];
  if (!['IN_CUSTODY'].includes(physical)) blockers.push(`PHYSICAL_${physical}`);
  if (verification !== 'VERIFIED') blockers.push('VERIFICATION_REQUIRED');
  if (custody !== 'IN_CUSTODY') blockers.push('SECURE_CUSTODY_REQUIRED');
  return [...new Set(blockers)];
}

function ownershipProjection(asset: BoardAsset) {
  if (
    asset.ownershipSupply?.issuedUnits &&
    asset.ownershipSupply.issuedUnits > 0n
  )
    return {
      state: 'ISSUED',
      issuedUnits: asset.ownershipSupply.issuedUnits.toString(),
      totalUnits: asset.ownershipSupply.totalUnits.toString(),
    };
  if (
    asset.ownershipSupply?.status === 'ACTIVE' ||
    asset.ownershipSupplyPolicy?.status === 'ISSUED'
  )
    return {
      state: 'ISSUED',
      issuedUnits: asset.ownershipSupply?.issuedUnits.toString() ?? null,
      totalUnits: asset.ownershipSupply?.totalUnits.toString() ?? null,
    };
  if (asset.ownershipSupplyPolicy?.status === 'APPROVED')
    return { state: 'CONFIGURED', issuedUnits: null, totalUnits: null };
  if (asset.ownershipSupplyPolicy?.status === 'PROPOSED')
    return { state: 'PENDING_APPROVAL', issuedUnits: null, totalUnits: null };
  return { state: 'NOT_CONFIGURED', issuedUnits: null, totalUnits: null };
}

function offeringProjection(asset: BoardAsset) {
  return {
    state: asset.initialOffering?.status ?? 'NOT_CREATED',
    offeringId: asset.initialOffering?.id ?? null,
  };
}

function marketProjection(asset: BoardAsset) {
  const state =
    asset.publication?.status === 'PUBLISHED'
      ? 'MARKET_LIVE'
      : asset.tradingMarket?.status === 'HALTED'
        ? 'PAUSED'
        : asset.initialOffering &&
            ['OPEN', 'PARTIALLY_FILLED', 'SOLD_OUT'].includes(
              asset.initialOffering.status,
            )
          ? 'INITIAL_OFFERING'
          : asset.publication?.status === 'READY'
            ? 'READY_FOR_LAUNCH'
            : asset.publication?.status === 'UNPUBLISHED'
              ? 'ARCHIVED'
              : 'NOT_ELIGIBLE';
  return {
    state,
    publicationStatus: asset.publication?.status ?? null,
    tradingStatus: asset.tradingMarket?.status ?? null,
  };
}

function operationsNextAction(stage: OperationsStage, entryBlockers: string[]) {
  if (stage === 'RESTRICTION')
    return {
      label: 'Resolve restriction',
      actor: 'STAFF' as const,
      target: 'INTAKE' as const,
    };
  if (stage === 'PHYSICAL_PREREQUISITE')
    return {
      label: entryBlockers.includes('PHYSICAL_AWAITING_DROP_OFF')
        ? 'Await collector drop-off'
        : 'Complete physical prerequisites',
      actor: 'STAFF' as const,
      target: 'INTAKE' as const,
    };
  if (stage === 'VALUATION')
    return {
      label: 'Record valuation',
      actor: 'STAFF' as const,
      target: 'VALUATION' as const,
    };
  if (stage === 'OWNERSHIP_SETUP')
    return {
      label: 'Configure ownership',
      actor: 'STAFF' as const,
      target: 'OWNERSHIP' as const,
    };
  if (stage === 'OFFERING_SETUP')
    return {
      label: 'Configure Initial Offering',
      actor: 'STAFF' as const,
      target: 'MARKET' as const,
    };
  if (stage === 'LAUNCH_READINESS')
    return {
      label: 'Resolve launch blockers',
      actor: 'STAFF' as const,
      target: 'MARKET' as const,
    };
  if (stage === 'READY_FOR_LAUNCH')
    return {
      label: 'Open launch workspace',
      actor: 'STAFF' as const,
      target: 'MARKET' as const,
    };
  return {
    label: 'No action required',
    actor: 'NONE' as const,
    target: 'COLLECTIBLE' as const,
  };
}

/**
 * Detail uses this server-owned projection verbatim. This prevents a separate
 * React state machine from disagreeing with the queue and launch policy.
 */
function operationEconomicWorkflow(
  item: NonNullable<Awaited<ReturnType<typeof operationsItem>>>,
) {
  const physicalBlocked = !item.eligibleForAssetOperations;
  const valuationComplete = item.valuation.state === 'VALUED';
  const ownershipComplete = item.ownership.state === 'ISSUED';
  const offeringLive = ['OPEN', 'PARTIALLY_FILLED', 'SOLD_OUT'].includes(
    item.offering.state,
  );
  const offeringInProgress = [
    'AWAITING_APPROVAL',
    'CHANGES_REQUESTED',
    'APPROVED',
    'PAUSED',
  ].includes(item.offering.state);

  return [
    {
      key: 'VALUATION' as const,
      label: 'Valuation',
      state: valuationComplete
        ? ('COMPLETE' as const)
        : item.currentStage === 'VALUATION'
          ? ('IN_PROGRESS' as const)
          : physicalBlocked
            ? ('BLOCKED' as const)
            : ('NOT_STARTED' as const),
      detail: valuationComplete
        ? 'Authoritative valuation recorded'
        : 'Staff valuation required',
    },
    {
      key: 'OWNERSHIP' as const,
      label: 'Ownership',
      state: ownershipComplete
        ? ('COMPLETE' as const)
        : item.currentStage === 'OWNERSHIP_SETUP' ||
            item.ownership.state === 'CONFIGURED' ||
            item.ownership.state === 'PENDING_APPROVAL'
          ? ('IN_PROGRESS' as const)
          : !valuationComplete || physicalBlocked
            ? ('BLOCKED' as const)
            : ('NOT_STARTED' as const),
      detail: ownershipComplete
        ? 'Ownership issued'
        : 'Ownership configuration required',
    },
    {
      key: 'INITIAL_OFFERING' as const,
      label: 'Initial Offering',
      state: offeringLive
        ? ('COMPLETE' as const)
        : offeringInProgress || item.currentStage === 'OFFERING_SETUP'
          ? ('IN_PROGRESS' as const)
          : !ownershipComplete
            ? ('BLOCKED' as const)
            : ('NOT_STARTED' as const),
      detail: offeringLive
        ? 'Initial Offering active'
        : offeringInProgress
          ? 'Offering terms in progress'
          : 'Offering terms not created',
    },
    {
      key: 'LAUNCH' as const,
      label: 'Launch',
      state:
        item.market.state === 'MARKET_LIVE'
          ? ('COMPLETE' as const)
          : item.launchReadiness.state === 'READY'
            ? ('READY' as const)
            : offeringLive
              ? ('BLOCKED' as const)
              : ('NOT_STARTED' as const),
      detail:
        item.market.state === 'MARKET_LIVE'
          ? 'Public record is live'
          : item.launchReadiness.state === 'READY'
            ? 'All launch gates satisfied'
            : (item.launchReadiness.blockers[0] ??
              'Launch prerequisites incomplete'),
    },
    {
      key: 'MARKET' as const,
      label: 'Market',
      state:
        item.market.state === 'MARKET_LIVE'
          ? ('LIVE' as const)
          : offeringLive
            ? ('IN_PROGRESS' as const)
            : item.market.state === 'PAUSED'
              ? ('BLOCKED' as const)
              : ('NOT_STARTED' as const),
      detail:
        item.market.state === 'MARKET_LIVE'
          ? 'Market live'
          : item.market.state === 'PAUSED'
            ? 'Market restriction active'
            : 'Market not live',
    },
  ];
}

function sourceImage(sourceRef: string | null) {
  if (!sourceRef) return null;
  try {
    const value = JSON.parse(sourceRef) as { imageUrl?: unknown };
    return typeof value.imageUrl === 'string' ? value.imageUrl : null;
  } catch {
    return null;
  }
}
function operationsMatches(
  item: NonNullable<Awaited<ReturnType<typeof operationsItem>>>,
  input: OperationsBoardInput,
) {
  if (input.tab && input.tab !== 'all') {
    const byTab: Record<string, boolean> = {
      'needs-action':
        item.eligibleForAssetOperations && item.currentStage !== 'MARKET_LIVE',
      valuation: item.currentStage === 'VALUATION',
      ownership: item.currentStage === 'OWNERSHIP_SETUP',
      offering: item.currentStage === 'OFFERING_SETUP',
      'launch-readiness': item.currentStage === 'LAUNCH_READINESS',
      'ready-for-launch': item.currentStage === 'READY_FOR_LAUNCH',
      'market-live': item.currentStage === 'MARKET_LIVE',
      restrictions: item.currentStage === 'RESTRICTION',
    };
    if (!byTab[input.tab]) return false;
  }
  return (
    (!input.stage || item.currentStage === input.stage) &&
    (!input.valuation || item.valuation.state === input.valuation) &&
    (!input.ownership || item.ownership.state === input.ownership) &&
    (!input.offering || item.offering.state === input.offering) &&
    (!input.market || item.market.state === input.market) &&
    (!input.workType || item.workType === input.workType) &&
    (!input.attention ||
      input.attention !== 'REQUIRES_ATTENTION' ||
      item.attention.required)
  );
}

function operationsSort(
  left: NonNullable<Awaited<ReturnType<typeof operationsItem>>>,
  right: NonNullable<Awaited<ReturnType<typeof operationsItem>>>,
  sort?: string,
) {
  if (sort === 'TITLE')
    return (
      left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
    );
  if (sort === 'NEWEST')
    return (
      new Date(right.stageSince).getTime() -
        new Date(left.stageSince).getTime() || left.id.localeCompare(right.id)
    );
  if (sort === 'UPDATED_DESC')
    return (
      new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime() || left.id.localeCompare(right.id)
    );
  if (sort === 'READY_FIRST')
    return (
      Number(right.launchReadiness.state === 'READY') -
        Number(left.launchReadiness.state === 'READY') ||
      new Date(right.stageSince).getTime() -
        new Date(left.stageSince).getTime() ||
      left.id.localeCompare(right.id)
    );
  if (sort === 'STAGE_OLDEST')
    return (
      new Date(left.stageSince).getTime() -
        new Date(right.stageSince).getTime() || left.id.localeCompare(right.id)
    );
  const severity = (item: typeof left) =>
    item.attention.severity === 'HIGH'
      ? 0
      : item.attention.severity === 'MEDIUM'
        ? 1
        : 2;
  return (
    severity(left) - severity(right) ||
    new Date(right.stageSince).getTime() -
      new Date(left.stageSince).getTime() ||
    left.id.localeCompare(right.id)
  );
}

function operationsCounts(
  items: Array<NonNullable<Awaited<ReturnType<typeof operationsItem>>>>,
) {
  return {
    all: items.length,
    needsAction: items.filter(
      (item) =>
        item.eligibleForAssetOperations && item.currentStage !== 'MARKET_LIVE',
    ).length,
    valuationPending: items.filter((item) => item.currentStage === 'VALUATION')
      .length,
    ownershipPending: items.filter(
      (item) => item.currentStage === 'OWNERSHIP_SETUP',
    ).length,
    offeringSetup: items.filter(
      (item) => item.currentStage === 'OFFERING_SETUP',
    ).length,
    launchReadiness: items.filter(
      (item) => item.currentStage === 'LAUNCH_READINESS',
    ).length,
    readyForLaunch: items.filter(
      (item) => item.currentStage === 'READY_FOR_LAUNCH',
    ).length,
    marketLive: items.filter((item) => item.currentStage === 'MARKET_LIVE')
      .length,
    restrictions: items.filter((item) => item.currentStage === 'RESTRICTION')
      .length,
    physicalPrerequisite: items.filter(
      (item) => !item.eligibleForAssetOperations,
    ).length,
  };
}

/** Narrow pure helpers retained for projection regression coverage. */
export const operationsQueueTestUtils = {
  physicalEntryBlockers,
  operationsNextAction,
  operationEconomicWorkflow,
};

/** Request DTOs use bigint for GBP minor units; native JSON cannot encode bigint. */
function canonicalBody(body: unknown) {
  return JSON.stringify(body, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

function safeStatus(asset: {
  publication: { status: string; updatedAt: Date } | null;
  custodyRecord: { status: string; updatedAt: Date } | null;
  insuranceCoverage: Array<{ status: string; expiresAt: Date }>;
}) {
  const coverage = asset.insuranceCoverage.find(
    (item) => item.status === 'ACTIVE' && item.expiresAt > new Date(),
  );
  return {
    publication: asset.publication
      ? {
          status: asset.publication.status,
          asOf: asset.publication.updatedAt.toISOString(),
        }
      : null,
    custody: asset.custodyRecord
      ? {
          status: asset.custodyRecord.status,
          asOf: asset.custodyRecord.updatedAt.toISOString(),
        }
      : null,
    insurance: coverage
      ? { status: 'ACTIVE', expiresAt: coverage.expiresAt.toISOString() }
      : { status: 'UNAVAILABLE', expiresAt: null },
  };
}
