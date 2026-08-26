import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { parseOwnershipUnits } from '../domain/ownership-units';
import { throwIfOwnershipTestFailure } from './ownership-test-failure';
import { hasStagingDemoPhysicalReadiness } from '../../lifecycle/domain/staging-demo-physical.policy';

type Db = Prisma.TransactionClient;

/**
 * Document 012's first authoritative ownership mutation. It issues a fixed
 * quantity to an internal treasury account; it creates neither customer
 * balances nor any trading, payment, or financial-ledger state.
 */
@Injectable()
export class OwnershipService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(
    actor: Actor,
    assetId: string,
    totalUnitsWire: string,
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    const totalUnits = parseOwnershipUnits(totalUnitsWire);
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope: `ownership.issue:${assetId}`,
      key,
    };
    const requestHash = createHash('sha256')
      .update(
        `POST\n/v1/admin/assets/${assetId}/ownership/issue\n${totalUnits}`,
      )
      .digest('hex');

    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        requestHash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT') throw conflictKey();
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw new ConflictException({
          code: 'PERSISTENCE_CONFLICT',
          message: 'The request is already in progress.',
        });
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as IssuanceResult;

      // The asset lock serializes first issuance. It also makes the immutable
      // supply check deterministic across different idempotency keys.
      await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
      const asset = await db.asset.findUnique({
        where: { id: assetId },
        include: {
          publication: true,
          custodyRecord: true,
          controlledBetaBypass: true,
          stagingDemoPhysicalIntake: true,
          insuranceCoverage: {
            where: {
              status: 'ACTIVE',
              effectiveAt: { lte: new Date() },
              expiresAt: { gt: new Date() },
            },
            take: 1,
          },
          ownershipSupplyPolicy: true,
          initialOffering: true,
        },
      });
      if (!asset)
        throw new NotFoundException({
          code: 'ASSET_NOT_FOUND',
          message: 'Asset not found.',
        });
      if (
        asset.status !== 'PUBLISHED' ||
        asset.publication?.status !== 'PUBLISHED' ||
        (asset.custodyRecord?.status !== 'SECURED' &&
          !asset.controlledBetaBypass &&
          !hasStagingDemoPhysicalReadiness(this.config.isBeta, asset.stagingDemoPhysicalIntake)) ||
        asset.insuranceCoverage.length !== 1
      )
        throw new ConflictException({
          code: 'ASSET_NOT_ELIGIBLE_FOR_ISSUANCE',
          message: 'The asset is not eligible for ownership issuance.',
        });
      const policy = asset.ownershipSupplyPolicy;
      if (!policy || policy.status !== 'APPROVED')
        throw new ConflictException({
          code: 'SUPPLY_POLICY_NOT_APPROVED',
          message: 'An approved ownership supply policy is required before issuance.',
        });
      if (policy.proposedUnits !== totalUnits)
        throw new ConflictException({
          code: 'SUPPLY_POLICY_MISMATCH',
          message: 'The requested quantity does not match the approved supply policy.',
        });
      if (await db.ownershipAssetSupply.findUnique({ where: { assetId } }))
        throw new ConflictException({
          code: 'OWNERSHIP_ALREADY_ISSUED',
          message: 'Ownership has already been issued for this asset.',
        });

      const now = new Date();
      const offering = asset.initialOffering;
      if (offering && offering.status !== 'APPROVED')
        throw new ConflictException({
          code: 'INITIAL_OFFERING_NOT_APPROVED',
          message: 'The collector offering must be approved before issuance.',
        });
      const treasury = offering
        ? null
        : await db.ownershipAccount.create({
            data: { id: randomUUID(), type: 'TREASURY', status: 'ACTIVE' },
          });
      const collector = offering
        ? (await db.ownershipAccount.findUnique({ where: { userId: offering.beneficiaryUserId } })) ??
          (await db.ownershipAccount.create({
            data: { id: randomUUID(), type: 'USER', userId: offering.beneficiaryUserId, status: 'ACTIVE' },
          }))
        : null;
      if (collector && collector.type !== 'USER')
        throw new ConflictException({ code: 'OWNERSHIP_ACCOUNT_INVALID', message: 'Collector ownership account is unavailable.' });
      const inventoryAccount = offering
        ? await db.ownershipAccount.create({ data: { id: randomUUID(), type: 'INITIAL_OFFERING', status: 'ACTIVE' } })
        : null;
      const retainedUnits = offering?.retainedUnits ?? 0n;
      const offeredUnits = offering?.offeredUnits ?? totalUnits;
      const issuanceEntries: Array<{ accountId: string; units: bigint; correlationId: string }> = [];
      if (collector && retainedUnits > 0n) issuanceEntries.push({ accountId: collector.id, units: retainedUnits, correlationId: `issuance:${assetId}:collector` });
      if (inventoryAccount && offeredUnits > 0n) issuanceEntries.push({ accountId: inventoryAccount.id, units: offeredUnits, correlationId: `issuance:${assetId}:initial-offering` });
      if (treasury) issuanceEntries.push({ accountId: treasury.id, units: totalUnits, correlationId: `issuance:${assetId}` });
      throwIfOwnershipTestFailure('issuance.after-account');
      await db.ownershipAssetSupply.create({
        data: {
          assetId,
          totalUnits,
          issuedUnits: totalUnits,
          nextSequence: BigInt(issuanceEntries.length + 1),
          status: 'ACTIVE',
          issuedAt: now,
        },
      });
      await db.ownershipSupplyPolicy.update({
        where: { assetId },
        data: { status: 'ISSUED', issuedAt: now },
      });
      if (treasury)
        await db.ownershipPosition.create({
          data: { id: randomUUID(), assetId, accountId: treasury.id, settledUnits: totalUnits, reservedUnits: 0n },
        });
      for (const allocation of issuanceEntries.filter((entry) => entry.accountId !== treasury?.id)) {
        await db.ownershipPosition.create({ data: { id: randomUUID(), assetId, accountId: allocation.accountId, settledUnits: allocation.units, reservedUnits: 0n } });
      }
      if (offering && inventoryAccount) {
        await db.initialOfferingInventory.create({ data: { id: randomUUID(), offeringId: offering.id, assetId, accountId: inventoryAccount.id, beneficiaryUserId: offering.beneficiaryUserId, offeredUnits, availableUnits: offeredUnits, reservedUnits: 0n, settledUnits: 0n } });
        await db.initialOffering.update({ where: { id: offering.id }, data: { issuedAt: now } });
      }
      for (const [index, allocation] of issuanceEntries.entries()) {
        await db.ownershipLedgerEntry.create({
          data: {
            id: randomUUID(), assetId, sequence: BigInt(index + 1), entryType: 'ISSUANCE', creditAccountId: allocation.accountId, units: allocation.units, correlationId: allocation.correlationId, idempotencyRecordId: acquired.record.id, reasonCode: offering ? 'INITIAL_OFFERING_ISSUANCE' : 'INITIAL_ISSUANCE', metadata: { schemaVersion: 1, channel: offering ? 'INITIAL_OFFERING' : 'TREASURY' }, actorUserId: actor.userId,
          },
        });
      }
      const entry = await db.ownershipLedgerEntry.findFirstOrThrow({ where: { assetId, entryType: 'ISSUANCE' }, orderBy: { sequence: 'desc' } });
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'OWNERSHIP_ISSUED',
        resourceType: 'asset',
        resourceId: assetId,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: {
          assetId,
          totalUnits: totalUnits.toString(),
          sequence: entry.sequence.toString(),
        },
        createdAt: now,
      });
      await this.notifyOwner(db, assetId);
      const result: IssuanceResult = {
        assetId,
        status: 'ACTIVE',
        totalUnits: totalUnits.toString(),
        issuedUnits: totalUnits.toString(),
        availableUnits: totalUnits.toString(),
        issuedAt: now.toISOString(),
        sequence: entry.sequence.toString(),
      };
      await tx.idempotency.complete(
        identity,
        { status: 201, body: result },
        now,
      );
      return result;
    });
  }

  async publicIssuance(slug: string) {
    const asset = await this.db.asset.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: { ownershipSupply: true },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found.',
      });
    if (!asset.ownershipSupply) return { status: 'UNAVAILABLE' as const };
    return publicSupply(asset.ownershipSupply);
  }

  async adminIssuance(assetId: string) {
    const supply = await this.db.ownershipAssetSupply.findUnique({
      where: { assetId },
    });
    if (!supply)
      throw new NotFoundException({
        code: 'OWNERSHIP_NOT_ISSUED',
        message: 'Ownership has not been issued for this asset.',
      });
    return publicSupply(supply);
  }

  private async notifyOwner(db: Db, assetId: string) {
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
        type: 'OWNERSHIP_ISSUED',
        title: 'Ownership issuance completed',
        body: 'Ownership issuance is now complete for your asset.',
        resourceType: 'asset',
        resourceId: assetId,
      },
    });
  }
}

type IssuanceResult = {
  assetId: string;
  status: 'ACTIVE';
  totalUnits: string;
  issuedUnits: string;
  availableUnits: string;
  issuedAt: string;
  sequence: string;
};

function publicSupply(supply: {
  status: string;
  totalUnits: bigint;
  issuedUnits: bigint;
  issuedAt: Date | null;
}) {
  return {
    status: supply.status,
    totalUnits: supply.totalUnits.toString(),
    issuedUnits: supply.issuedUnits.toString(),
    issuedAt: supply.issuedAt?.toISOString() ?? null,
  };
}

function conflictKey() {
  return new ConflictException({
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    message: 'The request key cannot be reused for this operation.',
  });
}
