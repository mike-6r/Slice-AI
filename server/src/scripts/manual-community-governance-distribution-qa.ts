import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { assertTestDatabaseUrl, type AppConfig } from '../config/app-config';
import { CommunityService } from '../modules/community/application/community.service';
import { DistributionService } from '../modules/community/application/distribution.service';
import { GovernanceService } from '../modules/community/application/governance.service';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../modules/identity/access/recent-auth.service';
import type { Actor } from '../modules/identity/auth/auth.service';

const run = `manual-community-${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Manual community/governance/distribution QA failed: ${message}`);
}

async function expectCode(work: () => Promise<unknown>, code: string) {
  try { await work(); } catch (error) {
    const actual = typeof error === 'object' && error && 'response' in error
      ? (error as { response?: { code?: string } }).response?.code : undefined;
    assert(actual === code, `expected ${code}, received ${String(actual)}`);
    return;
  }
  throw new Error(`Manual community/governance/distribution QA failed: expected ${code}.`);
}

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl) throw new Error('TEST_DATABASE_URL (or DATABASE_URL) and REDIS_URL are required.');
  assertTestDatabaseUrl(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const redis = new Redis(redisUrl, { lazyConnect: true });
  const ids = {
    category: `${run}-category`, asset: `${run}-asset`, alice: `${run}-alice`, bob: `${run}-bob`, charlie: `${run}-charlie`,
    aliceAccount: `${run}-alice-account`, bobAccount: `${run}-bob-account`, proceeds: `${run}-proceeds`, clearing: `${run}-clearing`,
  };
  const actor = (userId: string): Actor => ({ userId: userId as never, sessionId: `${userId}-session`, status: 'ACTIVE', roles: ['ADMIN'], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() });
  const recentAuth = new RecentAuthService({ recentAuthWindowSeconds: 300 } as AppConfig);
  const ledger = new FinancialLedgerService(db as never, recentAuth);
  const governance = new GovernanceService(db as never, recentAuth);
  const distributions = new DistributionService(db as never, ledger, recentAuth);
  const community = new CommunityService(db as never);
  const originalVoting = process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED;
  process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED = 'true';
  try {
    await db.$connect(); await redis.connect(); assert(await redis.ping() === 'PONG', 'Redis PING did not return PONG.');
    await db.user.createMany({ data: [ids.alice, ids.bob, ids.charlie].map((id) => ({ id, email: `${id}@slice.test`, normalizedEmail: `${id}@slice.test`, passwordHash: 'manual-qa-not-a-login-password', accountStatus: 'ACTIVE' })) });
    await db.category.create({ data: { id: ids.category, slug: ids.category, name: 'Manual community QA' } });
    await db.asset.create({ data: { id: ids.asset, publicId: `ast${Date.now()}`, slug: ids.asset, title: 'Manual governance asset', categoryId: ids.category, status: 'PUBLISHED', publishedAt: new Date() } });
    await db.vaultCustodyRecord.create({ data: { id: `${run}-custody`, assetId: ids.asset, providerCode: 'LOCAL_QA', status: 'SECURED', securedAt: new Date() } });
    await db.ownershipAssetSupply.create({ data: { assetId: ids.asset, totalUnits: 100n, issuedUnits: 100n, nextSequence: 1n, status: 'ACTIVE' } });
    await db.ownershipAccount.createMany({ data: [{ id: ids.aliceAccount, type: 'USER', userId: ids.alice }, { id: ids.bobAccount, type: 'USER', userId: ids.bob }] });
    await db.ownershipPosition.createMany({ data: [{ id: `${run}-alice-position`, assetId: ids.asset, accountId: ids.aliceAccount, settledUnits: 60n }, { id: `${run}-bob-position`, assetId: ids.asset, accountId: ids.bobAccount, settledUnits: 40n }] });
    await db.financialAccount.createMany({ data: [{ id: ids.proceeds, ownerType: 'PLATFORM', accountType: 'ASSET', code: `${run}-PROCEEDS`, currency: 'GBP', normalSide: 'DEBIT' }, { id: ids.clearing, ownerType: 'PLATFORM', accountType: 'LIABILITY', code: `${run}-CLEARING`, currency: 'GBP', normalSide: 'CREDIT' }] });

    await community.follow(actor(ids.alice), ids.bob, `${run}-follow`);
    await community.follow(actor(ids.alice), ids.bob, `${run}-follow-replay`);
    const post = await community.createPost(actor(ids.alice), ids.asset, 'Manual QA plain-text discussion.', undefined, `${run}-post`);
    const report = await community.report(actor(ids.bob), post.id, 'SPAM', `${run}-report`);
    await community.reviewReport(actor(ids.alice), report.reportId, 'UNDER_REVIEW', 'QA_REVIEW', `${run}-review`);
    await community.reviewReport(actor(ids.alice), report.reportId, 'RESOLVED', 'QA_RESOLVED', `${run}-resolve`);
    await expectCode(() => community.reviewReport(actor(ids.alice), report.reportId, 'DISMISSED', 'QA_DISMISS', `${run}-dismiss`), 'CONTENT_LOCKED');

    const proposal = await governance.create(actor(ids.alice), ids.asset, 10_001n, `${run}-proposal`, `${run}-proposal-key`);
    await governance.open(actor(ids.alice), proposal.proposalId, `${run}-open`, `${run}-open-key`);
    assert((await db.proposalEligibility.aggregate({ where: { proposalId: proposal.proposalId }, _sum: { units: true } }))._sum.units === 100n, 'snapshot units were not immutable and complete.');
    await governance.vote(actor(ids.alice), proposal.proposalId, 'REJECT', `${run}-vote-one`, `${run}-vote-one-key`);
    await governance.vote(actor(ids.alice), proposal.proposalId, 'APPROVE', `${run}-vote-replace`, `${run}-vote-replace-key`);
    await governance.vote(actor(ids.bob), proposal.proposalId, 'APPROVE', `${run}-vote-bob`, `${run}-vote-bob-key`);
    assert(await db.proposalVote.count({ where: { proposalId: proposal.proposalId, isCurrent: true } }) === 2, 'vote replacement did not retain one effective vote per owner.');
    await db.saleProposal.update({ where: { id: proposal.proposalId }, data: { closesAt: new Date(Date.now() - 1) } });
    const closed = await governance.close(actor(ids.alice), proposal.proposalId, `${run}-close`, `${run}-close-key`);
    assert(closed.status === 'APPROVED', 'weighted quorum/strict approval did not approve.');

    const proceeds = await ledger.post(actor(ids.alice), { type: 'DEMO_FUNDING', correlationId: `${run}-proceeds`, descriptionCode: 'MANUAL_COMMUNITY_QA_PROCEEDS', lines: [{ accountId: ids.proceeds, side: 'DEBIT', amountMinor: '10001' }, { accountId: ids.clearing, side: 'CREDIT', amountMinor: '10001' }] }, `${run}-proceeds-request`, `${run}-proceeds-key`);
    const saleInput = { grossMinor: 10001n, soldAt: new Date(), externalReference: `${run}-sale`, evidenceReference: `${run}-evidence`, custodyConfirmed: true, proceedsAccountId: ids.proceeds, proceedsJournalId: proceeds.transactionId };
    await expectCode(() => distributions.verifyExternalSale(actor(ids.alice), proposal.proposalId, saleInput, `${run}-self-verify`, `${run}-self-verify-key`), 'SALE_TWO_PERSON_APPROVAL_REQUIRED');
    assert((await distributions.verifyExternalSale(actor(ids.bob), proposal.proposalId, saleInput, `${run}-verify-a`, `${run}-verify-a-key`)).saleStatus === 'PENDING', 'first verifier must leave sale pending.');
    await expectCode(() => distributions.verifyExternalSale(actor(ids.bob), proposal.proposalId, saleInput, `${run}-verify-a-duplicate`, `${run}-verify-a-duplicate-key`), 'SALE_VERIFIER_ALREADY_RECORDED');
    assert((await distributions.verifyExternalSale(actor(ids.charlie), proposal.proposalId, saleInput, `${run}-verify-b`, `${run}-verify-b-key`)).saleStatus === 'VERIFIED', 'second distinct verifier did not verify sale.');
    const prepared = await distributions.prepare(actor(ids.alice), proposal.proposalId, `${run}-prepare`);
    const lines = await db.distributionLine.findMany({ where: { distributionId: prepared.id }, orderBy: { remainderRank: 'asc' } });
    assert(lines.reduce((sum, line) => sum + line.amountMinor, 0n) === 10001n, 'largest-remainder allocation did not conserve net proceeds.');
    const posted = await distributions.execute(actor(ids.alice), proposal.proposalId, `${run}-execute`, `${run}-execute-key`);
    assert(posted.status === 'DISTRIBUTED', 'distribution did not finalize.');
    assert((await distributions.reconcile(actor(ids.alice), proposal.proposalId)).reconciled, 'clean distribution reconciliation failed.');
    console.log(JSON.stringify({ run, proposalId: proposal.proposalId, distributionId: prepared.id, qa: 'PASSED' }));
  } finally {
    const proposalIds = (await db.saleProposal.findMany({ where: { OR: [{ assetId: ids.asset }, { proposerId: { startsWith: run } }] }, select: { id: true } }).catch(() => [])).map((row) => row.id);
    await db.auditEvent.deleteMany({ where: { actorUserId: { startsWith: run } } }).catch(() => undefined);
    await db.idempotencyRecord.deleteMany({ where: { actorScope: { startsWith: `user:${run}` } } }).catch(() => undefined);
    await db.distributionReconciliationRun.deleteMany({ where: { distribution: { proposalId: { in: proposalIds } } } }).catch(() => undefined);
    await db.distributionLine.deleteMany({ where: { distribution: { proposalId: { in: proposalIds } } } }).catch(() => undefined);
    await db.distribution.deleteMany({ where: { proposalId: { in: proposalIds } } }).catch(() => undefined);
    await db.externalSaleVerificationApproval.deleteMany({ where: { saleVerification: { proposalId: { in: proposalIds } } } }).catch(() => undefined);
    await db.externalSaleVerification.deleteMany({ where: { proposalId: { in: proposalIds } } }).catch(() => undefined);
    await db.proposalVote.deleteMany({ where: { proposalId: { in: proposalIds } } }).catch(() => undefined);
    await db.proposalEligibility.deleteMany({ where: { proposalId: { in: proposalIds } } }).catch(() => undefined);
    await db.saleProposal.deleteMany({ where: { id: { in: proposalIds } } }).catch(() => undefined);
    await db.moderationAction.deleteMany({ where: { post: { assetId: ids.asset } } }).catch(() => undefined);
    await db.contentReport.deleteMany({ where: { post: { assetId: ids.asset } } }).catch(() => undefined);
    await db.discussionPost.deleteMany({ where: { assetId: ids.asset } }).catch(() => undefined);
    await db.collectorFollow.deleteMany({ where: { OR: [{ followerUserId: { startsWith: run } }, { followedUserId: { startsWith: run } }] } }).catch(() => undefined);
    const financeIds = (await db.financialAccount.findMany({ where: { OR: [{ id: { startsWith: run } }, { ownerUserId: { startsWith: run } }] }, select: { id: true } }).catch(() => [])).map((row) => row.id);
    const journalIds = (await db.journalEntry.findMany({ where: { accountId: { in: financeIds } }, select: { transactionId: true } }).catch(() => [])).map((row) => row.transactionId);
    await db.cashReservation.deleteMany({ where: { accountId: { in: financeIds } } }).catch(() => undefined);
    await db.journalEntry.deleteMany({ where: { accountId: { in: financeIds } } }).catch(() => undefined);
    await db.journalTransaction.deleteMany({ where: { id: { in: journalIds } } }).catch(() => undefined);
    await db.accountBalance.deleteMany({ where: { accountId: { in: financeIds } } }).catch(() => undefined);
    await db.financialAccount.deleteMany({ where: { id: { in: financeIds } } }).catch(() => undefined);
    await db.ownershipLedgerEntry.deleteMany({ where: { assetId: ids.asset } }).catch(() => undefined);
    await db.ownershipReservation.deleteMany({ where: { assetId: ids.asset } }).catch(() => undefined);
    await db.ownershipPosition.deleteMany({ where: { assetId: ids.asset } }).catch(() => undefined);
    await db.ownershipAccount.deleteMany({ where: { userId: { startsWith: run } } }).catch(() => undefined);
    await db.ownershipAssetSupply.deleteMany({ where: { assetId: ids.asset } }).catch(() => undefined);
    await db.vaultCustodyRecord.deleteMany({ where: { assetId: ids.asset } }).catch(() => undefined);
    await db.asset.deleteMany({ where: { id: ids.asset } }).catch(() => undefined);
    await db.category.deleteMany({ where: { id: ids.category } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { startsWith: run } } }).catch(() => undefined);
    const residual = await Promise.all([db.saleProposal.count({ where: { assetId: ids.asset } }), db.distribution.count({ where: { proposalId: { in: proposalIds } } }), db.asset.count({ where: { id: ids.asset } }), db.user.count({ where: { id: { startsWith: run } } })]).catch(() => [-1, -1, -1, -1]);
    console.log(JSON.stringify({ run, cleanup: { proposals: residual[0], distributions: residual[1], assets: residual[2], users: residual[3] } }));
    if (originalVoting === undefined) delete process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED; else process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED = originalVoting;
    await redis.quit().catch(() => undefined); await db.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
