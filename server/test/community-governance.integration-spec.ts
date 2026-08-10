import { PrismaClient } from '@prisma/client';
import { CommunityService } from '../src/modules/community/application/community.service';
import { DistributionService } from '../src/modules/community/application/distribution.service';
import { GovernanceService } from '../src/modules/community/application/governance.service';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { setCommunityTestFailureHook } from '../src/modules/community/application/community-test-failure-injection';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import type { AppConfig } from '../src/config/app-config';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `community-i-${Date.now()}`;

describe('Document 015 PostgreSQL community and governance authority', () => {
  const categoryId = `${run}-category`;
  const assetId = `${run}-asset`;
  const aliceId = `${run}-alice`;
  const bobId = `${run}-bob`;
  const charlieId = `${run}-charlie`;
  const aliceAccountId = `${run}-alice-account`;
  const bobAccountId = `${run}-bob-account`;
  const proceedsAccountId = `${run}-proceeds`;
  const clearingAccountId = `${run}-clearing`;
  const recentAuth = new RecentAuthService({
    recentAuthWindowSeconds: 300,
  } as AppConfig);
  const community = new CommunityService(db as never);
  const governance = new GovernanceService(db as never, recentAuth);
  const ledger = new FinancialLedgerService(db as never, recentAuth);
  const distributions = new DistributionService(
    db as never,
    ledger,
    recentAuth,
  );
  let approvedProposalId = '';
  const actor = (userId: string, roles: Actor['roles'] = ['ADMIN']): Actor => ({
    userId: userId as never,
    sessionId: `${userId}-session`,
    status: 'ACTIVE',
    roles,
    sessionRevokedAt: null,
    sessionRevocationReason: null,
    authenticatedAt: new Date(),
  });

  beforeAll(async () => {
    process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED = 'true';
    await db.$connect();
    await cleanup();
    await db.user.createMany({
      data: [aliceId, bobId, charlieId].map((id) => ({
        id,
        email: `${id}@example.test`,
        normalizedEmail: `${id}@example.test`,
        passwordHash: 'test',
        accountStatus: 'ACTIVE',
      })),
    });
    await db.category.create({
      data: { id: categoryId, slug: categoryId, name: 'Community test' },
    });
    await db.asset.create({
      data: {
        id: assetId,
        publicId: `ast${Date.now()}`,
        slug: assetId,
        title: 'Community asset',
        categoryId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await db.vaultCustodyRecord.create({
      data: {
        id: `${run}-custody`,
        assetId,
        providerCode: 'TEST',
        status: 'SECURED',
        securedAt: new Date(),
      },
    });
    await db.ownershipAssetSupply.create({
      data: {
        assetId,
        totalUnits: 100n,
        issuedUnits: 100n,
        nextSequence: 4n,
        status: 'ACTIVE',
      },
    });
    await db.ownershipAccount.createMany({
      data: [
        { id: aliceAccountId, type: 'USER', userId: aliceId },
        { id: bobAccountId, type: 'USER', userId: bobId },
      ],
    });
    await db.ownershipPosition.createMany({
      data: [
        {
          id: `${aliceAccountId}-position`,
          assetId,
          accountId: aliceAccountId,
          settledUnits: 60n,
        },
        {
          id: `${bobAccountId}-position`,
          assetId,
          accountId: bobAccountId,
          settledUnits: 40n,
        },
      ],
    });
    await db.financialAccount.createMany({
      data: [
        {
          id: proceedsAccountId,
          ownerType: 'PLATFORM',
          accountType: 'ASSET',
          code: `${run}-PROCEEDS`,
          currency: 'GBP',
          normalSide: 'DEBIT',
        },
        {
          id: clearingAccountId,
          ownerType: 'PLATFORM',
          accountType: 'LIABILITY',
          code: `${run}-CLEARING`,
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
      ],
    });
  });

  afterAll(async () => {
    setCommunityTestFailureHook(undefined);
    delete process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED;
    await cleanup();
    await db.$disconnect();
  });

  it('keeps follow/content interactions private and moderated without raw user output', async () => {
    await expect(
      community.follow(actor(aliceId), aliceId, `${run}-self`),
    ).rejects.toMatchObject({ response: { code: 'SELF_FOLLOW_FORBIDDEN' } });
    await expect(
      community.follow(actor(aliceId), bobId, `${run}-follow`),
    ).resolves.toEqual({ followed: true });
    const post = await community.createPost(
      actor(aliceId),
      assetId,
      'A plain ownership discussion.',
      undefined,
      `${run}-post`,
    );
    expect(post).not.toHaveProperty('userId');
    const report = await community.report(
      actor(bobId),
      post.id,
      'SPAM',
      `${run}-report`,
    );
    await expect(
      community.reviewReport(
        actor(aliceId),
        report.reportId,
        'UNDER_REVIEW',
        'SPAM_REVIEW',
        `${run}-report-review`,
      ),
    ).resolves.toMatchObject({ status: 'UNDER_REVIEW' });
    await expect(
      community.reviewReport(
        actor(aliceId),
        report.reportId,
        'RESOLVED',
        'SPAM_RESOLVED',
        `${run}-report-resolve`,
      ),
    ).resolves.toMatchObject({ status: 'RESOLVED' });
    const hidden = await community.moderate(
      actor(bobId),
      post.id,
      'HIDE',
      'SPAM_CONFIRMED',
      `${run}-moderate`,
    );
    expect(hidden).not.toHaveProperty('userId');
    await expect(
      community.editPost(actor(aliceId), post.id, 'Changed', `${run}-edit`),
    ).rejects.toMatchObject({ response: { code: 'CONTENT_LOCKED' } });
  });

  it('snapshots ownership, preserves vote history, and closes using exact quorum and strict threshold', async () => {
    const created = await governance.create(
      actor(aliceId),
      assetId,
      10_001n,
      `${run}-create`,
      `${run}-create-key`,
    );
    await expect(
      governance.create(
        actor(aliceId),
        assetId,
        10_001n,
        `${run}-create`,
        `${run}-create-key`,
      ),
    ).resolves.toMatchObject({
      proposalId: created.proposalId,
      replayed: false,
    });
    await governance.open(
      actor(aliceId),
      created.proposalId,
      `${run}-open`,
      `${run}-open-key`,
    );
    expect(
      await db.proposalEligibility.aggregate({
        where: { proposalId: created.proposalId },
        _sum: { units: true },
      }),
    ).toMatchObject({ _sum: { units: 100n } });
    await governance.vote(
      actor(aliceId),
      created.proposalId,
      'REJECT',
      `${run}-vote-one`,
      `${run}-vote-one-key`,
    );
    await governance.vote(
      actor(aliceId),
      created.proposalId,
      'APPROVE',
      `${run}-vote-replace`,
      `${run}-vote-replace-key`,
    );
    await governance.vote(
      actor(bobId),
      created.proposalId,
      'APPROVE',
      `${run}-vote-two`,
      `${run}-vote-two-key`,
    );
    expect(
      await db.proposalVote.count({
        where: { proposalId: created.proposalId },
      }),
    ).toBe(3);
    await db.saleProposal.update({
      where: { id: created.proposalId },
      data: { closesAt: new Date(Date.now() - 1) },
    });
    await expect(
      governance.close(
        actor(aliceId),
        created.proposalId,
        `${run}-close`,
        `${run}-close-key`,
      ),
    ).resolves.toMatchObject({
      status: 'APPROVED',
      approveUnits: '100',
      rejectUnits: '0',
    });
    approvedProposalId = created.proposalId;
    const proposal = await governance.read(created.proposalId, aliceId);
    expect(proposal).toMatchObject({
      eligibleUnits: '100',
      ownVote: 'APPROVE',
    });
    expect(proposal).not.toHaveProperty('voterId');
    const listed = await governance.listForViewer(actor(aliceId), {
      status: 'APPROVED',
      viewerRelevant: true,
      limit: 1,
    });
    expect(listed.items).toMatchObject([
      {
        id: created.proposalId,
        viewerState: 'CLOSED',
        ownVote: 'APPROVE',
        viewerEligibleUnits: '60',
      },
    ]);
    expect(listed.items[0]).not.toHaveProperty('proposerId');
    expect(listed.items[0]).not.toHaveProperty('accountId');
  });

  it('rolls back an interrupted snapshot without completing its idempotency key', async () => {
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'REJECTED' },
    });
    const created = await governance.create(
      actor(aliceId),
      assetId,
      15_001n,
      `${run}-rollback-create`,
      `${run}-rollback-create-key`,
    );
    await expect(
      governance.listForViewer(actor(bobId, ['USER']), {
        status: 'DRAFT',
        limit: 20,
      }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      governance.listForViewer(actor(aliceId), {
        status: 'DRAFT',
        limit: 20,
      }),
    ).resolves.toMatchObject({ items: [{ id: created.proposalId }] });
    setCommunityTestFailureHook((point) => {
      if (point === 'governance.open.after-snapshot')
        throw new Error('INJECTED_COMMUNITY_FAILURE');
    });
    await expect(
      governance.open(
        actor(aliceId),
        created.proposalId,
        `${run}-rollback-open`,
        `${run}-rollback-open-key`,
      ),
    ).rejects.toThrow('INJECTED_COMMUNITY_FAILURE');
    setCommunityTestFailureHook(undefined);
    expect(
      await db.proposalEligibility.count({
        where: { proposalId: created.proposalId },
      }),
    ).toBe(0);
    expect(
      await db.saleProposal.findUniqueOrThrow({
        where: { id: created.proposalId },
      }),
    ).toMatchObject({ status: 'DRAFT' });
    await expect(
      governance.open(
        actor(aliceId),
        created.proposalId,
        `${run}-rollback-open`,
        `${run}-rollback-open-key`,
      ),
    ).resolves.toMatchObject({ status: 'OPEN', replayed: false });
    await db.saleProposal.update({
      where: { id: created.proposalId },
      data: { status: 'REJECTED' },
    });
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'APPROVED' },
    });
  });

  it('rolls back a vote replacement and a close tally without changing the authoritative vote or proposal', async () => {
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'REJECTED' },
    });
    const created = await governance.create(
      actor(aliceId),
      assetId,
      16_001n,
      `${run}-vote-close-create`,
      `${run}-vote-close-create-key`,
    );
    await governance.open(
      actor(aliceId),
      created.proposalId,
      `${run}-vote-close-open`,
      `${run}-vote-close-open-key`,
    );
    await governance.vote(
      actor(aliceId),
      created.proposalId,
      'REJECT',
      `${run}-vote-original`,
      `${run}-vote-original-key`,
    );
    setCommunityTestFailureHook((point) => {
      if (point === 'governance.vote.after-supersede')
        throw new Error('INJECTED_VOTE_REPLACEMENT_FAILURE');
    });
    await expect(
      governance.vote(
        actor(aliceId),
        created.proposalId,
        'APPROVE',
        `${run}-vote-replace-failed`,
        `${run}-vote-replace-key`,
      ),
    ).rejects.toThrow('INJECTED_VOTE_REPLACEMENT_FAILURE');
    setCommunityTestFailureHook(undefined);
    expect(
      await db.proposalVote.findMany({
        where: { proposalId: created.proposalId, isCurrent: true },
      }),
    ).toMatchObject([{ choice: 'REJECT', weightUnits: 60n }]);
    await governance.vote(
      actor(aliceId),
      created.proposalId,
      'APPROVE',
      `${run}-vote-replace-retry`,
      `${run}-vote-replace-key`,
    );
    expect(
      await db.proposalVote.count({
        where: { proposalId: created.proposalId, isCurrent: true },
      }),
    ).toBe(1);
    await db.saleProposal.update({
      where: { id: created.proposalId },
      data: { closesAt: new Date(Date.now() - 1) },
    });
    setCommunityTestFailureHook((point) => {
      if (point === 'governance.close.after-tally')
        throw new Error('INJECTED_CLOSE_TALLY_FAILURE');
    });
    await expect(
      governance.close(
        actor(aliceId),
        created.proposalId,
        `${run}-close-failed`,
        `${run}-close-key`,
      ),
    ).rejects.toThrow('INJECTED_CLOSE_TALLY_FAILURE');
    setCommunityTestFailureHook(undefined);
    expect(
      await db.saleProposal.findUniqueOrThrow({
        where: { id: created.proposalId },
      }),
    ).toMatchObject({ status: 'OPEN', closedAt: null });
    await expect(
      governance.close(
        actor(aliceId),
        created.proposalId,
        `${run}-close-retry`,
        `${run}-close-key`,
      ),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    await db.saleProposal.update({
      where: { id: created.proposalId },
      data: { status: 'REJECTED' },
    });
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'APPROVED' },
    });
  });

  it('serializes concurrent proposal opens through the asset lock', async () => {
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'REJECTED' },
    });
    const policy = {
      policyVersion: 'test-concurrency',
      quorumBps: 2_000,
      approvalBps: 5_000,
      votingEnabled: true,
    };
    const drafts = await Promise.all(
      ['a', 'b'].map((suffix) =>
        db.saleProposal.create({
          data: {
            id: `${run}-open-race-${suffix}`,
            assetId,
            proposerId: aliceId,
            offerMinor: 20_000n,
            currency: 'GBP',
            ...policy,
          },
        }),
      ),
    );
    const results = await Promise.allSettled(
      drafts.map((draft) =>
        governance.open(
          actor(aliceId),
          draft.id,
          `${run}-race-${draft.id}`,
          `${run}-race-key-${draft.id}`,
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await db.saleProposal.count({ where: { assetId, status: 'OPEN' } }),
    ).toBe(1);
    await db.saleProposal.updateMany({
      where: { id: { in: drafts.map((draft) => draft.id) } },
      data: { status: 'REJECTED' },
    });
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'APPROVED' },
    });
  });

  it('serializes competing votes into one effective immutable-weight vote', async () => {
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'REJECTED' },
    });
    const created = await governance.create(
      actor(aliceId),
      assetId,
      22_001n,
      `${run}-vote-race-create`,
      `${run}-vote-race-create-key`,
    );
    await governance.open(
      actor(aliceId),
      created.proposalId,
      `${run}-vote-race-open`,
      `${run}-vote-race-open-key`,
    );
    const results = await Promise.allSettled([
      governance.vote(
        actor(aliceId),
        created.proposalId,
        'APPROVE',
        `${run}-vote-race-a`,
        `${run}-vote-race-a-key`,
      ),
      governance.vote(
        actor(aliceId),
        created.proposalId,
        'REJECT',
        `${run}-vote-race-b`,
        `${run}-vote-race-b-key`,
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    const votes = await db.proposalVote.findMany({
      where: { proposalId: created.proposalId },
      orderBy: { sequence: 'asc' },
    });
    expect(votes).toHaveLength(2);
    expect(votes.filter((vote) => vote.isCurrent)).toHaveLength(1);
    expect(votes.filter((vote) => vote.isCurrent)[0]).toMatchObject({
      weightUnits: 60n,
      sequence: 2,
    });
    await db.saleProposal.update({
      where: { id: created.proposalId },
      data: { status: 'REJECTED' },
    });
    await db.saleProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'APPROVED' },
    });
  });

  it('posts exactly one balanced, largest-remainder distribution against recognized proceeds', async () => {
    const proposal = await db.saleProposal.findFirstOrThrow({
      where: { assetId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    const proceeds = await ledger.post(
      actor(aliceId),
      {
        type: 'DEMO_FUNDING',
        correlationId: `${run}-sale-proceeds`,
        descriptionCode: 'TEST_SALE_PROCEEDS',
        lines: [
          { accountId: proceedsAccountId, side: 'DEBIT', amountMinor: '10001' },
          {
            accountId: clearingAccountId,
            side: 'CREDIT',
            amountMinor: '10001',
          },
        ],
      },
      `${run}-proceeds-request`,
      `${run}-proceeds-key`,
    );
    await expect(
      distributions.verifyExternalSale(
        actor(aliceId),
        proposal.id,
        {
          grossMinor: 10001n,
          soldAt: new Date(),
          externalReference: 'LOCAL-SALE',
          evidenceReference: 'LOCAL-EVIDENCE',
          custodyConfirmed: true,
          proceedsAccountId,
          proceedsJournalId: proceeds.transactionId,
        },
        `${run}-sale-verify-self`,
        `${run}-sale-verify-self-key`,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SALE_TWO_PERSON_APPROVAL_REQUIRED' },
    });
    const approvals = await Promise.all([
      distributions.verifyExternalSale(
        actor(bobId),
        proposal.id,
        {
          grossMinor: 10001n,
          soldAt: new Date(),
          externalReference: 'LOCAL-SALE',
          evidenceReference: 'LOCAL-EVIDENCE',
          custodyConfirmed: true,
          proceedsAccountId,
          proceedsJournalId: proceeds.transactionId,
        },
        `${run}-sale-verify`,
        `${run}-sale-verify-key`,
      ),
      distributions.verifyExternalSale(
        actor(charlieId),
        proposal.id,
        {
          grossMinor: 10001n,
          soldAt: new Date(),
          externalReference: 'LOCAL-SALE',
          evidenceReference: 'LOCAL-EVIDENCE',
          custodyConfirmed: true,
          proceedsAccountId,
          proceedsJournalId: proceeds.transactionId,
        },
        `${run}-sale-verify-second`,
        `${run}-sale-verify-second-key`,
      ),
    ]);
    expect(approvals.map((approval) => approval.saleStatus).sort()).toEqual([
      'PENDING',
      'VERIFIED',
    ]);
    expect(
      await db.externalSaleVerificationApproval.count({
        where: { saleVerification: { proposalId: proposal.id } },
      }),
    ).toBe(2);
    await expect(
      distributions.verifyExternalSale(
        actor(bobId),
        proposal.id,
        {
          grossMinor: 10001n,
          soldAt: new Date(),
          externalReference: 'LOCAL-SALE',
          evidenceReference: 'LOCAL-EVIDENCE',
          custodyConfirmed: true,
          proceedsAccountId,
          proceedsJournalId: proceeds.transactionId,
        },
        `${run}-sale-verify-again`,
        `${run}-sale-verify-again-key`,
      ),
    ).rejects.toMatchObject({ response: { code: 'PROPOSAL_STATE_CONFLICT' } });
    const prepared = await distributions.prepare(
      actor(aliceId),
      proposal.id,
      `${run}-distribution-prepare`,
    );
    expect(prepared).toMatchObject({
      grossMinor: '10001',
      feeMinor: '0',
      netMinor: '10001',
      status: 'READY',
    });
    const lines = await db.distributionLine.findMany({
      where: { distributionId: prepared.id },
      orderBy: { remainderRank: 'asc' },
    });
    expect(lines.map((line) => line.amountMinor)).toEqual([6001n, 4000n]);
    setCommunityTestFailureHook((point) => {
      if (point === 'distribution.execute.after-journal')
        throw new Error('INJECTED_DISTRIBUTION_FINALIZE_FAILURE');
    });
    await expect(
      distributions.execute(
        actor(aliceId),
        proposal.id,
        `${run}-distribution-execute-failed`,
        `${run}-distribution-key`,
      ),
    ).rejects.toThrow('INJECTED_DISTRIBUTION_FINALIZE_FAILURE');
    setCommunityTestFailureHook(undefined);
    const processing = await db.distribution.findUniqueOrThrow({
      where: { proposalId: proposal.id },
    });
    expect(processing).toMatchObject({
      status: 'PROCESSING',
      financeTransactionId: null,
    });
    expect(
      await db.journalTransaction.count({
        where: { correlationId: `distribution:${processing.id}` },
      }),
    ).toBe(1);
    const posted = await distributions.execute(
      actor(aliceId),
      proposal.id,
      `${run}-distribution-execute-recover`,
      `${run}-distribution-key`,
    );
    await expect(
      distributions.execute(
        actor(aliceId),
        proposal.id,
        `${run}-distribution-execute`,
        `${run}-distribution-key`,
      ),
    ).resolves.toEqual(posted);
    expect(posted.status).toBe('DISTRIBUTED');
    const journal = await db.journalTransaction.findUniqueOrThrow({
      where: {
        id: (
          await db.distribution.findUniqueOrThrow({
            where: { proposalId: proposal.id },
          })
        ).financeTransactionId!,
      },
      include: { entries: true },
    });
    expect(
      journal.entries.reduce(
        (sum, line) =>
          sum + (line.side === 'DEBIT' ? line.amountMinor : -line.amountMinor),
        0n,
      ),
    ).toBe(0n);
    await expect(
      distributions.reconcile(actor(aliceId), proposal.id),
    ).resolves.toMatchObject({ reconciled: true });
    const reconciliationCount = await db.distributionReconciliationRun.count({
      where: { distributionId: prepared.id },
    });
    setCommunityTestFailureHook((point) => {
      if (point === 'distribution.reconcile.before-persist')
        throw new Error('INJECTED_RECONCILIATION_FAILURE');
    });
    await expect(
      distributions.reconcile(actor(aliceId), proposal.id),
    ).rejects.toThrow('INJECTED_RECONCILIATION_FAILURE');
    setCommunityTestFailureHook(undefined);
    expect(
      await db.distributionReconciliationRun.count({
        where: { distributionId: prepared.id },
      }),
    ).toBe(reconciliationCount);
    const line = await db.distributionLine.findFirstOrThrow({
      where: { distributionId: prepared.id },
      orderBy: { remainderRank: 'asc' },
    });
    await db.distributionLine.update({
      where: { id: line.id },
      data: { amountMinor: { increment: 1n } },
    });
    await expect(
      distributions.reconcile(actor(aliceId), proposal.id),
    ).resolves.toMatchObject({
      reconciled: false,
      mismatchCodes: expect.arrayContaining([
        'DISTRIBUTION_LINE_TOTAL_MISMATCH',
      ]),
    });
    expect(
      (await db.distributionLine.findUniqueOrThrow({ where: { id: line.id } }))
        .amountMinor,
    ).toBe(line.amountMinor + 1n);
    await db.distributionLine.update({
      where: { id: line.id },
      data: { amountMinor: line.amountMinor },
    });
  });

  async function cleanup() {
    const proposals = await db.saleProposal.findMany({
      where: {
        OR: [{ assetId }, { proposerId: { startsWith: 'community-i-' } }],
      },
      select: { id: true },
    });
    const proposalIds = proposals.map((row) => row.id);
    await db.auditEvent.deleteMany({
      where: { actorUserId: { startsWith: 'community-i-' } },
    });
    await db.idempotencyRecord.deleteMany({
      where: { actorScope: { startsWith: 'user:community-i-' } },
    });
    await db.distributionReconciliationRun.deleteMany({
      where: { distribution: { proposalId: { in: proposalIds } } },
    });
    await db.distributionLine.deleteMany({
      where: { distribution: { proposalId: { in: proposalIds } } },
    });
    await db.distribution.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await db.externalSaleVerificationApproval.deleteMany({
      where: { saleVerification: { proposalId: { in: proposalIds } } },
    });
    await db.externalSaleVerification.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await db.proposalVote.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await db.proposalEligibility.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await db.saleProposal.deleteMany({ where: { id: { in: proposalIds } } });
    await db.moderationAction.deleteMany({ where: { post: { assetId } } });
    await db.contentReport.deleteMany({ where: { post: { assetId } } });
    await db.discussionPost.deleteMany({ where: { assetId } });
    await db.collectorFollow.deleteMany({
      where: {
        OR: [
          { followerUserId: { startsWith: 'community-i-' } },
          { followedUserId: { startsWith: 'community-i-' } },
        ],
      },
    });
    const financeAccountIds = (
      await db.financialAccount.findMany({
        where: {
          OR: [
            { id: { startsWith: 'community-i-' } },
            { ownerUserId: { startsWith: 'community-i-' } },
          ],
        },
        select: { id: true },
      })
    ).map((row) => row.id);
    const journalIds = (
      await db.journalEntry.findMany({
        where: { accountId: { in: financeAccountIds } },
        select: { transactionId: true },
      })
    ).map((row) => row.transactionId);
    await db.cashReservation.deleteMany({
      where: { accountId: { in: financeAccountIds } },
    });
    await db.journalEntry.deleteMany({
      where: { accountId: { in: financeAccountIds } },
    });
    await db.journalTransaction.deleteMany({
      where: { id: { in: journalIds } },
    });
    await db.accountBalance.deleteMany({
      where: { accountId: { in: financeAccountIds } },
    });
    await db.financialAccount.deleteMany({
      where: { id: { in: financeAccountIds } },
    });
    await db.ownershipReservation.deleteMany({ where: { assetId } });
    await db.ownershipLedgerEntry.deleteMany({ where: { assetId } });
    await db.ownershipPosition.deleteMany({ where: { assetId } });
    const scopedAccountIds = (
      await db.ownershipAccount.findMany({
        where: { userId: { startsWith: 'community-i-' } },
        select: { id: true },
      })
    ).map((row) => row.id);
    const staleEligibilityIds = (
      await db.proposalEligibility.findMany({
        where: { accountId: { in: scopedAccountIds } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await db.distributionLine.deleteMany({
      where: { eligibilityId: { in: staleEligibilityIds } },
    });
    await db.proposalVote.deleteMany({
      where: { eligibilityId: { in: staleEligibilityIds } },
    });
    await db.proposalEligibility.deleteMany({
      where: { id: { in: staleEligibilityIds } },
    });
    await db.ownershipAccount.deleteMany({
      where: { userId: { startsWith: 'community-i-' } },
    });
    await db.ownershipAssetSupply.deleteMany({ where: { assetId } });
    await db.custodyEvent.deleteMany({ where: { assetId } });
    await db.vaultCustodyRecord.deleteMany({ where: { assetId } });
    await db.asset.deleteMany({ where: { id: assetId } });
    await db.category.deleteMany({ where: { id: categoryId } });
    await db.user.deleteMany({ where: { id: { startsWith: 'community-i-' } } });
  }
});
