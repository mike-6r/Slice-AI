import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type DropState, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { fingerprintRequest } from '../../identity/domain/idempotency';
import {
  evaluateDropAssetEligibility,
  type DropEligibilityResult,
} from '../domain/drop-eligibility';
import {
  assertDropTransition,
  isDropEditable,
  type DropLifecycleState,
} from '../domain/drop-lifecycle';
import { calculateDropReadiness } from '../domain/drop-readiness';

type Db = PrismaClient | Prisma.TransactionClient;

export type DropMutationInput = {
  version: number;
};

@Injectable()
export class DropsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listPublic() {
    this.assertPreview();
    const rows = await this.db.drop.findMany({
      where: {
        publicationStatus: 'PUBLISHED',
        state: { in: ['LIVE', 'SOLD_OUT', 'CLOSED'] },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { id: true },
    });
    return {
      items: await Promise.all(
        rows.map((row) => this.project(this.db, row.id)),
      ),
    };
  }

  async publicDetail(reference: string) {
    this.assertPreview();
    const row = await this.db.drop.findFirst({
      where: {
        OR: [{ id: reference }, { publicId: reference }, { slug: reference }],
        publicationStatus: 'PUBLISHED',
        state: { in: ['LIVE', 'SOLD_OUT', 'CLOSED'] },
      },
      select: { id: true },
    });
    if (!row) this.notFound();
    return this.project(this.db, row.id);
  }

  async creatorDrops(actor: Actor) {
    this.assertCreator(actor);
    const rows = await this.db.drop.findMany({
      where: { creatorUserId: actor.userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return {
      items: await Promise.all(
        rows.map((row) => this.project(this.db, row.id)),
      ),
    };
  }

  async creatorDrop(actor: Actor, dropId: string) {
    this.assertCreator(actor);
    return this.creatorProjection(this.db, actor.userId, dropId);
  }

  async eligibleAssets(actor: Actor) {
    this.assertCreator(actor);
    const positions = await this.db.ownershipPosition.findMany({
      where: {
        settledUnits: { gt: 0 },
        account: { userId: actor.userId, status: 'ACTIVE' },
      },
      select: { assetId: true },
      orderBy: { updatedAt: 'desc' },
    });
    const items = await Promise.all(
      positions.map(async ({ assetId }) => {
        const eligibility = await this.assetEligibility(
          this.db,
          actor.userId,
          assetId,
        );
        const asset = await this.db.asset.findUniqueOrThrow({
          where: { id: assetId },
          select: {
            id: true,
            publicId: true,
            slug: true,
            title: true,
            status: true,
            heroMediaId: true,
            valuationDecisions: {
              where: { status: 'ACTIVE' },
              orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { valueMinor: true, currency: true, decidedAt: true },
            },
            previewDropFixtureAssets: {
              take: 1,
              select: {
                scenario: true,
                fixture: { select: { classification: true } },
              },
            },
          },
        });
        const valuation = asset.valuationDecisions[0];
        const fixture = asset.previewDropFixtureAssets[0];
        return {
          id: asset.id,
          publicId: asset.publicId,
          slug: asset.slug,
          title: asset.title,
          status: asset.status,
          imageAvailable: Boolean(asset.heroMediaId),
          eligibility,
          referenceValue: valuation
            ? {
                amountMinor: valuation.valueMinor.toString(),
                currency: valuation.currency,
                asOf: valuation.decidedAt.toISOString(),
              }
            : null,
          fixture: fixture
            ? {
                classification: fixture.fixture.classification,
                scenario: fixture.scenario,
              }
            : null,
        };
      }),
    );
    return { items };
  }

  createDraft(
    actor: Actor,
    input: { name: string; description: string },
    key: string,
  ) {
    this.assertCreator(actor);
    return this.idempotent(
      actor.userId,
      'drops.create',
      key,
      input,
      async (tx) => {
        const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
        const row = await tx.drop.create({
          data: {
            publicId: `DRP-${suffix.toUpperCase()}`,
            slug: `${slugify(input.name)}-${suffix}`,
            creatorUserId: actor.userId,
            name: input.name.trim(),
            description: input.description.trim(),
            history: {
              create: {
                actorUserId: actor.userId,
                action: 'DROP_CREATED',
                toState: 'DRAFT',
                afterState: { name: input.name.trim(), inventoryCount: 0 },
              },
            },
          },
          select: { id: true },
        });
        return this.project(tx, row.id);
      },
    );
  }

  updateDraft(
    actor: Actor,
    dropId: string,
    input: { version: number; name: string; description: string },
    key: string,
  ) {
    this.assertCreator(actor);
    return this.idempotent(
      actor.userId,
      `drops.update:${dropId}`,
      key,
      input,
      async (tx) => {
        const existing = await this.ownedEditable(tx, actor.userId, dropId);
        const updated = await tx.drop.updateMany({
          where: { id: existing.id, version: input.version },
          data: {
            name: input.name.trim(),
            description: input.description.trim(),
            version: { increment: 1 },
          },
        });
        this.assertVersion(updated.count);
        await tx.dropHistoryEvent.create({
          data: {
            dropId: existing.id,
            actorUserId: actor.userId,
            action: 'DROP_DETAILS_UPDATED',
            fromState: existing.state,
            toState: existing.state,
            beforeState: {
              name: existing.name,
              description: existing.description,
            },
            afterState: {
              name: input.name.trim(),
              description: input.description.trim(),
            },
          },
        });
        return this.project(tx, existing.id);
      },
    );
  }

  addInventory(
    actor: Actor,
    dropId: string,
    input: { version: number; assetId: string },
    key: string,
  ) {
    this.assertCreator(actor);
    return this.idempotent(
      actor.userId,
      `drops.inventory.add:${dropId}`,
      key,
      input,
      async (tx) => {
        const drop = await this.ownedEditable(tx, actor.userId, dropId);
        const eligibility = await this.assetEligibility(
          tx,
          actor.userId,
          input.assetId,
          drop.id,
        );
        if (!eligibility.eligible)
          throw new ConflictException({
            code: 'DROP_ASSET_INELIGIBLE',
            message: 'The collectible is not eligible for this Drop.',
            reasons: eligibility.reasons,
          });
        const updated = await tx.drop.updateMany({
          where: { id: drop.id, version: input.version },
          data: { version: { increment: 1 } },
        });
        this.assertVersion(updated.count);
        try {
          const item = await tx.dropInventoryItem.create({
            data: { dropId: drop.id, assetId: input.assetId },
          });
          await tx.dropAssetLock.create({
            data: {
              assetId: input.assetId,
              dropId: drop.id,
              inventoryItemId: item.id,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          )
            throw new ConflictException({
              code: 'DROP_ASSET_ALREADY_COMMITTED',
              message: 'The collectible is already committed to a Drop.',
            });
          throw error;
        }
        await tx.dropHistoryEvent.create({
          data: {
            dropId: drop.id,
            actorUserId: actor.userId,
            action: 'INVENTORY_ADDED',
            fromState: drop.state,
            toState: drop.state,
            afterState: { assetId: input.assetId },
          },
        });
        return this.project(tx, drop.id);
      },
    );
  }

  removeInventory(
    actor: Actor,
    dropId: string,
    assetId: string,
    input: DropMutationInput,
    key: string,
  ) {
    this.assertCreator(actor);
    return this.idempotent(
      actor.userId,
      `drops.inventory.remove:${dropId}:${assetId}`,
      key,
      input,
      async (tx) => {
        const drop = await this.ownedEditable(tx, actor.userId, dropId);
        const item = await tx.dropInventoryItem.findUnique({
          where: { dropId_assetId: { dropId: drop.id, assetId } },
        });
        if (!item)
          throw new NotFoundException({
            code: 'DROP_INVENTORY_NOT_FOUND',
            message: 'That collectible is not in this Drop.',
          });
        const updated = await tx.drop.updateMany({
          where: { id: drop.id, version: input.version },
          data: { version: { increment: 1 } },
        });
        this.assertVersion(updated.count);
        await tx.dropAssetLock.delete({ where: { assetId } });
        await tx.dropInventoryItem.delete({ where: { id: item.id } });
        await tx.dropHistoryEvent.create({
          data: {
            dropId: drop.id,
            actorUserId: actor.userId,
            action: 'INVENTORY_REMOVED',
            fromState: drop.state,
            toState: drop.state,
            beforeState: { assetId },
          },
        });
        return this.project(tx, drop.id);
      },
    );
  }

  submitForReview(
    actor: Actor,
    dropId: string,
    input: DropMutationInput,
    key: string,
  ) {
    this.assertCreator(actor);
    return this.idempotent(
      actor.userId,
      `drops.submit:${dropId}`,
      key,
      input,
      async (tx) => {
        const drop = await this.ownedEditable(tx, actor.userId, dropId);
        const readiness = await this.readiness(tx, drop.id, actor.userId);
        if (!readiness.ready)
          throw new ConflictException({
            code: 'DROP_NOT_READY',
            message: 'Complete every readiness requirement before review.',
            readiness,
          });
        assertDropTransition(drop.state, 'READY_FOR_REVIEW');
        const updated = await tx.drop.updateMany({
          where: { id: drop.id, version: input.version },
          data: {
            state: 'READY_FOR_REVIEW',
            submittedAt: new Date(),
            version: { increment: 1 },
          },
        });
        this.assertVersion(updated.count);
        await this.historyTransition(
          tx,
          drop.id,
          actor.userId,
          'SUBMITTED_FOR_REVIEW',
          drop.state,
          'READY_FOR_REVIEW',
        );
        return this.project(tx, drop.id);
      },
    );
  }

  async adminDrops(actor: Actor) {
    this.assertAdmin(actor);
    const rows = await this.db.drop.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true },
    });
    return {
      items: await Promise.all(
        rows.map((row) => this.project(this.db, row.id)),
      ),
    };
  }

  async adminDrop(actor: Actor, dropId: string) {
    this.assertAdmin(actor);
    return this.project(this.db, dropId);
  }

  adminTransition(
    actor: Actor,
    dropId: string,
    input: {
      version: number;
      target: 'READY_TO_PUBLISH' | 'LIVE' | 'CLOSED' | 'CANCELLED';
      reason?: string;
    },
    key: string,
  ) {
    this.assertAdmin(actor);
    return this.idempotent(
      actor.userId,
      `drops.admin.transition:${dropId}`,
      key,
      input,
      async (tx) => {
        const drop = await tx.drop.findUnique({ where: { id: dropId } });
        if (!drop) this.notFound();
        assertDropTransition(drop.state, input.target);
        if (input.target === 'READY_TO_PUBLISH' || input.target === 'LIVE') {
          const readiness = await this.readiness(
            tx,
            drop.id,
            drop.creatorUserId,
          );
          if (!readiness.ready)
            throw new ConflictException({
              code: 'DROP_NOT_READY',
              message:
                'This Drop no longer passes authoritative readiness checks.',
              readiness,
            });
        }
        const now = new Date();
        const updated = await tx.drop.updateMany({
          where: { id: drop.id, version: input.version },
          data: {
            state: input.target,
            publicationStatus:
              input.target === 'LIVE' ? 'PUBLISHED' : drop.publicationStatus,
            readyAt: input.target === 'READY_TO_PUBLISH' ? now : drop.readyAt,
            publishedAt: input.target === 'LIVE' ? now : drop.publishedAt,
            closedAt: input.target === 'CLOSED' ? now : drop.closedAt,
            cancelledAt: input.target === 'CANCELLED' ? now : drop.cancelledAt,
            version: { increment: 1 },
          },
        });
        this.assertVersion(updated.count);
        await this.historyTransition(
          tx,
          drop.id,
          actor.userId,
          `ADMIN_${input.target}`,
          drop.state,
          input.target,
          input.reason,
        );
        return this.project(tx, drop.id);
      },
    );
  }

  private async assetEligibility(
    db: Db,
    creatorUserId: string,
    assetId: string,
    requestedDropId?: string,
  ): Promise<DropEligibilityResult> {
    const [creator, asset, deficit, hold] = await Promise.all([
      db.user.findUnique({
        where: { id: creatorUserId },
        select: {
          accountStatus: true,
          emailVerifiedAt: true,
          roleAssignments: { select: { role: true } },
        },
      }),
      db.asset.findUnique({
        where: { id: assetId },
        include: {
          custodyRecord: true,
          operationalControl: true,
          ownershipSupply: {
            include: { positions: { include: { account: true } } },
          },
          submissions: {
            where: { ownerUserId: creatorUserId },
            include: { reviews: true },
            orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
          },
          initialOffering: true,
          preSale: true,
          tradingMarket: true,
          saleProposals: {
            where: {
              status: {
                in: ['DRAFT', 'OPEN', 'APPROVED', 'SALE_PENDING', 'SOLD'],
              },
            },
            take: 1,
            select: { id: true },
          },
          dropLock: true,
        },
      }),
      db.financialDeficit.count({
        where: { userId: creatorUserId, status: 'OPEN' },
      }),
      db.complianceHold.count({
        where: { userId: creatorUserId, status: 'ACTIVE' },
      }),
    ]);
    if (!asset) this.notFound('Collectible');
    const positions = asset.ownershipSupply?.positions ?? [];
    const creatorPosition = positions.find(
      (position) =>
        position.account.type === 'USER' &&
        position.account.userId === creatorUserId &&
        position.account.status === 'ACTIVE',
    );
    const otherSettledUnits = positions
      .filter((position) => position.account.userId !== creatorUserId)
      .reduce((sum, position) => sum + position.settledUnits, 0n);
    const verificationApproved = asset.submissions.some(
      (submission) =>
        submission.status === 'APPROVED' &&
        submission.reviews.some(
          (review) =>
            review.status === 'COMPLETED' && review.decision === 'APPROVE',
        ),
    );
    return evaluateDropAssetEligibility({
      canonicalStatus: asset.status,
      creatorVerified: Boolean(
        creator &&
        creator.accountStatus === 'ACTIVE' &&
        creator.emailVerifiedAt &&
        creator.roleAssignments.some(
          ({ role }) => role === 'COLLECTOR' || role === 'ADMIN',
        ),
      ),
      custodyStatus: asset.custodyRecord?.status ?? null,
      receivedAt: asset.custodyRecord?.receivedAt ?? null,
      securedAt: asset.custodyRecord?.securedAt ?? null,
      verificationApproved,
      supplyStatus: asset.ownershipSupply?.status ?? null,
      totalUnits: asset.ownershipSupply?.totalUnits ?? 0n,
      issuedUnits: asset.ownershipSupply?.issuedUnits ?? 0n,
      creatorSettledUnits: creatorPosition?.settledUnits ?? 0n,
      creatorReservedUnits: creatorPosition?.reservedUnits ?? 0n,
      otherSettledUnits,
      operationalControlStatus: asset.operationalControl?.status ?? null,
      offeringStatus: asset.initialOffering?.status ?? null,
      preSaleStatus: asset.preSale?.status ?? null,
      marketStatus: asset.tradingMarket?.status ?? null,
      hasFinancialDeficit: deficit > 0,
      hasComplianceHold: hold > 0,
      hasConflictingSale: asset.saleProposals.length > 0,
      lockedByDropId: asset.dropLock?.dropId ?? null,
      requestedDropId,
    });
  }

  private async readiness(db: Db, dropId: string, creatorUserId: string) {
    const drop = await db.drop.findUnique({
      where: { id: dropId },
      include: { inventory: true, assetLocks: true },
    });
    if (!drop) this.notFound();
    const eligibility = await Promise.all(
      drop.inventory.map((item) =>
        this.assetEligibility(db, creatorUserId, item.assetId, drop.id),
      ),
    );
    return calculateDropReadiness({
      name: drop.name,
      description: drop.description,
      inventoryCount: drop.inventory.length,
      lockCount: drop.assetLocks.length,
      inventoryEligible: eligibility.every((item) => item.eligible),
    });
  }

  private async project(db: Db, dropId: string) {
    const drop = await db.drop.findUnique({
      where: { id: dropId },
      include: {
        creator: {
          select: { id: true, profile: { select: { displayName: true } } },
        },
        inventory: {
          orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
          include: {
            lock: { select: { lockedAt: true, version: true } },
            asset: {
              select: {
                id: true,
                publicId: true,
                slug: true,
                title: true,
                status: true,
                heroMediaId: true,
                valuationDecisions: {
                  where: { status: 'ACTIVE' },
                  orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
                  take: 1,
                  select: { valueMinor: true, currency: true, decidedAt: true },
                },
              },
            },
          },
        },
        history: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
          select: {
            id: true,
            action: true,
            fromState: true,
            toState: true,
            reference: true,
            createdAt: true,
          },
        },
      },
    });
    if (!drop) this.notFound();
    const readiness = await this.readiness(db, drop.id, drop.creatorUserId);
    return {
      id: drop.id,
      publicId: drop.publicId,
      slug: drop.slug,
      creator: {
        id: drop.creator.id,
        displayName: drop.creator.profile?.displayName ?? 'Verified creator',
      },
      name: drop.name,
      description: drop.description,
      state: drop.state,
      publicationStatus: drop.publicationStatus,
      inventoryCount: drop.inventory.length,
      openingCount: drop.openingCount,
      remainingInventoryCount: Math.max(
        0,
        drop.inventory.length - drop.openingCount,
      ),
      version: drop.version,
      readiness,
      inventory: await Promise.all(
        drop.inventory.map(async ({ asset, addedAt, lock }) => {
          const value = asset.valuationDecisions[0];
          const eligibility = await this.assetEligibility(
            db,
            drop.creatorUserId,
            asset.id,
            drop.id,
          );
          return {
            id: asset.id,
            publicId: asset.publicId,
            slug: asset.slug,
            title: asset.title,
            status: asset.status,
            imageAvailable: Boolean(asset.heroMediaId),
            addedAt: addedAt.toISOString(),
            vaultLock: lock
              ? {
                  active: true,
                  lockedAt: lock.lockedAt.toISOString(),
                  version: lock.version,
                }
              : { active: false, lockedAt: null, version: null },
            eligibility,
            referenceValue: value
              ? {
                  amountMinor: value.valueMinor.toString(),
                  currency: value.currency,
                  asOf: value.decidedAt.toISOString(),
                }
              : null,
          };
        }),
      ),
      history: drop.history.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      submittedAt: drop.submittedAt?.toISOString() ?? null,
      publishedAt: drop.publishedAt?.toISOString() ?? null,
      createdAt: drop.createdAt.toISOString(),
      updatedAt: drop.updatedAt.toISOString(),
    };
  }

  private async creatorProjection(db: Db, userId: string, dropId: string) {
    const owner = await db.drop.findFirst({
      where: { id: dropId, creatorUserId: userId },
      select: { id: true },
    });
    if (!owner) this.notFound();
    return this.project(db, owner.id);
  }

  private async ownedEditable(db: Db, userId: string, dropId: string) {
    const drop = await db.drop.findFirst({
      where: { id: dropId, creatorUserId: userId },
    });
    if (!drop) this.notFound();
    if (!isDropEditable(drop.state as DropLifecycleState))
      throw new ConflictException({
        code: 'DROP_NOT_EDITABLE',
        message: 'Only a draft Drop can be edited.',
      });
    return drop;
  }

  private historyTransition(
    tx: Prisma.TransactionClient,
    dropId: string,
    actorUserId: string,
    action: string,
    fromState: DropState,
    toState: DropState,
    reference?: string,
  ) {
    return tx.dropHistoryEvent.create({
      data: { dropId, actorUserId, action, fromState, toState, reference },
    });
  }

  private async idempotent<T>(
    actorScope: string,
    scope: string,
    key: string,
    body: unknown,
    execute: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    this.assertPreview();
    const requestHash = fingerprintRequest('POST', scope, body);
    return this.db.$transaction(
      async (tx) => {
        const identity = { actorScope, scope, key };
        const existing = await tx.idempotencyRecord.findUnique({
          where: { actorScope_scope_key: identity },
        });
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_CONFLICT',
              message: 'This request key was already used for different input.',
            });
          if (existing.status === 'COMPLETED') return existing.responseBody as T;
          throw new ConflictException({
            code: 'PERSISTENCE_CONFLICT',
            message: 'This request is already in progress.',
          });
        }
        await tx.idempotencyRecord.create({
          data: {
            ...identity,
            requestHash,
            status: 'PROCESSING',
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        const value = await execute(tx);
        await tx.idempotencyRecord.update({
          where: { actorScope_scope_key: identity },
          data: {
            status: 'COMPLETED',
            responseStatus: 200,
            responseBody: value as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return value;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
  }

  private assertPreview(): void {
    if (
      this.config.deploymentChannel !== 'preview' ||
      this.config.publicBasePath !== '/preview'
    )
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found.',
      });
  }

  private assertCreator(actor: Actor): void {
    this.assertPreview();
    if (
      actor.status !== 'ACTIVE' ||
      !actor.roles.some((role) => role === 'COLLECTOR' || role === 'ADMIN')
    )
      throw new ForbiddenException({
        code: 'DROP_CREATOR_REQUIRED',
        message: 'A verified collector account is required.',
      });
  }

  private assertAdmin(actor: Actor): void {
    this.assertPreview();
    if (!actor.roles.includes('ADMIN'))
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Admin access is required.',
      });
  }

  private assertVersion(count: number): void {
    if (count !== 1)
      throw new ConflictException({
        code: 'STALE_WRITE',
        message: 'This Drop changed. Refresh before trying again.',
      });
  }

  private notFound(subject = 'Drop'): never {
    throw new NotFoundException({
      code: 'DROP_NOT_FOUND',
      message: `${subject} not found.`,
    });
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 64) || 'drop'
  );
}
