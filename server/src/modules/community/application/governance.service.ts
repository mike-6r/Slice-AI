import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SaleProposalStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { governancePolicy, tallyVote } from '../domain/governance-policy';
import { communityTestFailurePoint } from './community-test-failure-injection';

type Db = Prisma.TransactionClient;
type ProposalListInput = {
  status?: SaleProposalStatus;
  assetId?: string;
  viewerRelevant?: boolean;
  cursor?: string;
  limit: number;
};

@Injectable()
export class GovernanceService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async create(
    actor: Actor,
    assetId: string,
    offerMinor: bigint,
    requestId: string,
    key: string,
  ) {
    if (offerMinor <= 0n)
      throw conflict('INVALID_PROPOSAL_AMOUNT', 'Offer amount is invalid.');
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
      const identity: IdempotencyIdentity = {
        actorScope: `user:${actor.userId}`,
        scope: 'governance.proposal.create',
        key,
      };
      const hash = createHash('sha256')
        .update(`${assetId}:${offerMinor}`)
        .digest('hex');
      const acquired = await createIdentityTransaction(db).idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw conflict(
          'IDEMPOTENCY_KEY_CONFLICT',
          'The request key cannot be reused.',
        );
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as {
          proposalId: string;
          status: SaleProposalStatus;
          replayed: true;
        };
      const asset = await db.asset.findUnique({
        where: { id: assetId },
        include: {
          custodyRecord: { select: { status: true } },
          ownershipSupply: { select: { status: true, issuedUnits: true } },
        },
      });
      if (
        !asset ||
        asset.status !== 'PUBLISHED' ||
        asset.custodyRecord?.status !== 'SECURED' ||
        asset.ownershipSupply?.status !== 'ACTIVE' ||
        asset.ownershipSupply.issuedUnits <= 0n
      ) {
        throw conflict(
          'NOT_ELIGIBLE_TO_PROPOSE',
          'The asset is not eligible for a sale proposal.',
        );
      }
      const position = await db.ownershipPosition.findFirst({
        where: {
          assetId,
          account: { userId: actor.userId },
          settledUnits: { gt: 0n },
        },
      });
      if (!position)
        throw conflict(
          'NOT_ELIGIBLE_TO_PROPOSE',
          'Ownership eligibility is required.',
        );
      const active = await db.saleProposal.findFirst({
        where: {
          assetId,
          status: { in: ['OPEN', 'APPROVED', 'SALE_PENDING', 'SOLD'] },
        },
      });
      if (active)
        throw conflict(
          'PROPOSAL_ALREADY_OPEN',
          'An active proposal already exists.',
        );
      const policy = governancePolicy();
      const proposal = await db.saleProposal.create({
        data: {
          id: randomUUID(),
          assetId,
          proposerId: actor.userId,
          offerMinor,
          currency: 'GBP',
          policyVersion: policy.version,
          quorumBps: policy.quorumBps,
          approvalBps: policy.approvalBps,
          votingEnabled: policy.weightedVotingEnabled,
        },
      });
      const result = {
        proposalId: proposal.id,
        status: proposal.status,
        replayed: false,
      };
      const tx = createIdentityTransaction(db);
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'GOVERNANCE_PROPOSAL_CREATED',
        resourceType: 'sale-proposal',
        resourceId: proposal.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { assetId },
        createdAt: new Date(),
      });
      await tx.idempotency.complete(
        identity,
        { status: 201, body: result },
        new Date(),
      );
      return result;
    });
  }

  async open(actor: Actor, proposalId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    const policy = governancePolicy();
    if (!policy.weightedVotingEnabled)
      throw conflict(
        'GOVERNANCE_LEGAL_APPROVAL_REQUIRED',
        'Weighted governance is not enabled.',
      );
    return this.db.$transaction(async (db) => {
      const proposal = await this.lockProposal(db, proposalId);
      await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${proposal.assetId} FOR UPDATE`;
      if (proposal.status !== 'DRAFT')
        throw conflict('PROPOSAL_STATE_CONFLICT', 'Proposal cannot be opened.');
      const otherOpen = await db.saleProposal.findFirst({
        where: {
          assetId: proposal.assetId,
          id: { not: proposalId },
          status: { in: ['OPEN', 'APPROVED', 'SALE_PENDING', 'SOLD'] },
        },
        select: { id: true },
      });
      if (otherOpen)
        throw conflict(
          'PROPOSAL_ALREADY_OPEN',
          'An active proposal already exists.',
        );
      const identity: IdempotencyIdentity = {
        actorScope: `user:${actor.userId}`,
        scope: `governance.proposal.open:${proposalId}`,
        key,
      };
      const hash = createHash('sha256')
        .update(`open:${proposalId}`)
        .digest('hex');
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw conflict(
          'IDEMPOTENCY_KEY_CONFLICT',
          'The request key cannot be reused.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as {
          proposalId: string;
          status: SaleProposalStatus;
          replayed: boolean;
        };
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      await db.$queryRaw`SELECT "accountId" FROM "OwnershipPosition" WHERE "assetId" = ${proposal.assetId} ORDER BY "accountId" FOR UPDATE`;
      const positions = await db.ownershipPosition.findMany({
        where: {
          assetId: proposal.assetId,
          settledUnits: { gt: 0n },
          account: { userId: { not: null }, status: 'ACTIVE' },
        },
        include: { account: { select: { userId: true } } },
        orderBy: { accountId: 'asc' },
      });
      const eligibleUnits = positions.reduce(
        (sum, position) => sum + position.settledUnits,
        0n,
      );
      if (eligibleUnits === 0n)
        throw conflict('NOT_ELIGIBLE_TO_VOTE', 'No eligible ownership exists.');
      const supply = await db.ownershipAssetSupply.findUniqueOrThrow({
        where: { assetId: proposal.assetId },
      });
      await db.proposalEligibility.createMany({
        data: positions.map((position) => ({
          id: randomUUID(),
          proposalId,
          accountId: position.accountId,
          userId: position.account.userId,
          units: position.settledUnits,
        })),
      });
      await communityTestFailurePoint('governance.open.after-snapshot');
      const now = new Date();
      const updated = await db.saleProposal.update({
        where: { id: proposalId },
        data: {
          status: 'OPEN',
          opensAt: now,
          closesAt: new Date(now.getTime() + policy.votingPeriodMs),
          snapshotSequence: supply.nextSequence - 1n,
          eligibleUnits,
          votingEnabled: true,
          version: { increment: 1 },
        },
      });
      const result = {
        proposalId,
        status: updated.status,
        closesAt: updated.closesAt!.toISOString(),
        replayed: false,
      };
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'GOVERNANCE_PROPOSAL_OPENED',
        resourceType: 'sale-proposal',
        resourceId: proposalId,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { eligibleUnits: eligibleUnits.toString() },
        createdAt: now,
      });
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        now,
      );
      return result;
    });
  }

  async vote(
    actor: Actor,
    proposalId: string,
    choice: 'APPROVE' | 'REJECT',
    requestId: string,
    key: string,
  ) {
    if (!governancePolicy().weightedVotingEnabled)
      throw conflict(
        'GOVERNANCE_LEGAL_APPROVAL_REQUIRED',
        'Weighted governance is not enabled.',
      );
    return this.db.$transaction(async (db) => {
      const proposal = await this.lockProposal(db, proposalId);
      if (
        proposal.status !== 'OPEN' ||
        !proposal.closesAt ||
        proposal.closesAt <= new Date()
      )
        throw conflict('VOTING_NOT_OPEN', 'Voting is not open.');
      const eligibility = await db.proposalEligibility.findFirst({
        where: { proposalId, userId: actor.userId },
      });
      if (!eligibility)
        throw conflict('NOT_ELIGIBLE_TO_VOTE', 'You are not eligible to vote.');
      await db.$queryRaw`SELECT id FROM "ProposalVote" WHERE "eligibilityId" = ${eligibility.id} FOR UPDATE`;
      const identity: IdempotencyIdentity = {
        actorScope: `user:${actor.userId}`,
        scope: `governance.vote:${proposalId}`,
        key,
      };
      const hash = createHash('sha256').update(choice).digest('hex');
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw conflict(
          'IDEMPOTENCY_KEY_CONFLICT',
          'The request key cannot be reused.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as {
          proposalId: string;
          choice: string;
          replayed: boolean;
        };
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      const current = await db.proposalVote.findFirst({
        where: { eligibilityId: eligibility.id, isCurrent: true },
        orderBy: { sequence: 'desc' },
      });
      if (current)
        await db.proposalVote.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
      await communityTestFailurePoint('governance.vote.after-supersede');
      await db.proposalVote.create({
        data: {
          id: randomUUID(),
          proposalId,
          eligibilityId: eligibility.id,
          castByUserId: actor.userId,
          choice,
          weightUnits: eligibility.units,
          sequence: (current?.sequence ?? 0) + 1,
        },
      });
      const result = { proposalId, choice, replayed: false };
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'GOVERNANCE_VOTE_CAST',
        resourceType: 'sale-proposal',
        resourceId: proposalId,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { choice },
        createdAt: new Date(),
      });
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
    });
  }

  async close(
    actor: Actor,
    proposalId: string,
    requestId: string,
    key: string,
    now = new Date(),
  ) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const identity: IdempotencyIdentity = {
        actorScope: `user:${actor.userId}`,
        scope: `governance.proposal.close:${proposalId}`,
        key,
      };
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        createHash('sha256').update(`close:${proposalId}`).digest('hex'),
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw conflict(
          'IDEMPOTENCY_KEY_CONFLICT',
          'The request key cannot be reused.',
        );
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw conflict(
          'PERSISTENCE_CONFLICT',
          'The request is already in progress.',
        );
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as {
          proposalId: string;
          status: SaleProposalStatus;
          quorumMet: boolean;
          approveUnits: string;
          rejectUnits: string;
          replayed: boolean;
        };
      const proposal = await this.lockProposal(db, proposalId);
      if (
        proposal.status !== 'OPEN' ||
        !proposal.closesAt ||
        proposal.closesAt > now
      )
        throw conflict('VOTING_NOT_CLOSED', 'Voting has not closed.');
      const votes = await db.proposalVote.findMany({
        where: { proposalId, isCurrent: true },
      });
      const approve = votes
        .filter((vote) => vote.choice === 'APPROVE')
        .reduce((sum, vote) => sum + vote.weightUnits, 0n);
      const reject = votes
        .filter((vote) => vote.choice === 'REJECT')
        .reduce((sum, vote) => sum + vote.weightUnits, 0n);
      const tally = tallyVote(proposal.eligibleUnits, approve, reject, {
        ...governancePolicy(),
        quorumBps: proposal.quorumBps,
        approvalBps: proposal.approvalBps,
        weightedVotingEnabled: proposal.votingEnabled,
        version: proposal.policyVersion,
      });
      await communityTestFailurePoint('governance.close.after-tally');
      const status: SaleProposalStatus = tally.approved
        ? 'APPROVED'
        : 'REJECTED';
      const updated = await db.saleProposal.update({
        where: { id: proposalId },
        data: { status, closedAt: now, version: { increment: 1 } },
      });
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'GOVERNANCE_PROPOSAL_CLOSED',
        resourceType: 'sale-proposal',
        resourceId: proposalId,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: {
          approve: approve.toString(),
          reject: reject.toString(),
          quorumMet: tally.quorumMet,
        },
        createdAt: now,
      });
      const result = {
        proposalId,
        status: updated.status,
        quorumMet: tally.quorumMet,
        approveUnits: approve.toString(),
        rejectUnits: reject.toString(),
        replayed: false,
      };
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        now,
      );
      return result;
    });
  }

  async read(proposalId: string, viewerId?: string) {
    const proposal = await this.db.saleProposal.findUnique({
      where: { id: proposalId },
      include: {
        votes: {
          where: { isCurrent: true },
          select: { choice: true, weightUnits: true },
        },
      },
    });
    if (!proposal)
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Proposal was not found.',
      });
    const approve = proposal.votes
      .filter((vote) => vote.choice === 'APPROVE')
      .reduce((sum, vote) => sum + vote.weightUnits, 0n);
    const reject = proposal.votes
      .filter((vote) => vote.choice === 'REJECT')
      .reduce((sum, vote) => sum + vote.weightUnits, 0n);
    const own = viewerId
      ? await this.db.proposalVote.findFirst({
          where: { proposalId, isCurrent: true, castByUserId: viewerId },
          select: { choice: true },
        })
      : null;
    return {
      id: proposal.id,
      assetId: proposal.assetId,
      status: proposal.status,
      offerMinor: proposal.offerMinor.toString(),
      currency: proposal.currency,
      opensAt: proposal.opensAt?.toISOString() ?? null,
      closesAt: proposal.closesAt?.toISOString() ?? null,
      eligibleUnits: proposal.eligibleUnits.toString(),
      approveUnits: approve.toString(),
      rejectUnits: reject.toString(),
      votingEnabled: proposal.votingEnabled,
      ownVote: own?.choice ?? null,
    };
  }

  /**
   * Bounded authenticated discovery projection. It deliberately reuses the detail DTO's
   * aggregate tally and never returns eligibility accounts, other voters or proposer data.
   */
  async listForViewer(actor: Actor, input: ProposalListInput) {
    const viewerId = actor.userId;
    const mayManageGovernance = actor.roles.includes('ADMIN');
    const rows = await this.db.saleProposal.findMany({
      where: {
        OR: [
          { status: { not: 'DRAFT' } },
          { proposerId: viewerId },
          ...(mayManageGovernance ? [{}] : []),
        ],
        ...(input.status ? { status: input.status } : {}),
        ...(input.assetId ? { assetId: input.assetId } : {}),
        ...(input.viewerRelevant
          ? { eligibility: { some: { userId: viewerId } } }
          : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      select: {
        id: true,
        assetId: true,
        status: true,
        offerMinor: true,
        currency: true,
        opensAt: true,
        closesAt: true,
        closedAt: true,
        eligibleUnits: true,
        votingEnabled: true,
        asset: { select: { publicId: true, slug: true, title: true } },
        eligibility: {
          where: { userId: viewerId },
          select: {
            units: true,
            votes: { where: { isCurrent: true }, select: { choice: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const totals = page.length
      ? await this.db.proposalVote.groupBy({
          by: ['proposalId', 'choice'],
          where: {
            proposalId: { in: page.map((proposal) => proposal.id) },
            isCurrent: true,
          },
          _sum: { weightUnits: true },
        })
      : [];
    const tally = new Map(
      totals.map((row) => [
        `${row.proposalId}:${row.choice}`,
        row._sum.weightUnits ?? 0n,
      ]),
    );
    return {
      items: page.map((proposal) => {
        const eligibility = proposal.eligibility[0];
        const ownVote = eligibility?.votes[0]?.choice ?? null;
        const viewerState =
          proposal.status === 'DRAFT'
            ? 'NOT_OPEN'
            : !proposal.votingEnabled
              ? 'LEGAL_GATE_DISABLED'
              : proposal.status !== 'OPEN'
                ? 'CLOSED'
                : !eligibility
                  ? 'NOT_ELIGIBLE'
                  : ownVote
                    ? 'ALREADY_VOTED'
                    : 'ELIGIBLE';
        return {
          id: proposal.id,
          assetId: proposal.assetId,
          asset: {
            id: proposal.asset.publicId,
            slug: proposal.asset.slug,
            title: proposal.asset.title,
          },
          status: proposal.status,
          offerMinor: proposal.offerMinor.toString(),
          currency: proposal.currency,
          opensAt: proposal.opensAt?.toISOString() ?? null,
          closesAt: proposal.closesAt?.toISOString() ?? null,
          closedAt: proposal.closedAt?.toISOString() ?? null,
          eligibleUnits: proposal.eligibleUnits.toString(),
          approveUnits: (tally.get(`${proposal.id}:APPROVE`) ?? 0n).toString(),
          rejectUnits: (tally.get(`${proposal.id}:REJECT`) ?? 0n).toString(),
          votingEnabled: proposal.votingEnabled,
          viewerState,
          viewerEligibleUnits: eligibility?.units.toString() ?? null,
          ownVote,
        };
      }),
      nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  private async lockProposal(db: Db, proposalId: string) {
    await db.$queryRaw`SELECT id FROM "SaleProposal" WHERE id = ${proposalId} FOR UPDATE`;
    const proposal = await db.saleProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal)
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Proposal was not found.',
      });
    return proposal;
  }
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
