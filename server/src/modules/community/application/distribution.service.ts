import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from '../../finance/application/financial-ledger.service';
import { accountAuthority } from '../../finance/domain/journal';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { allocateLargestRemainder, feeMinor, governancePolicy } from '../domain/governance-policy';
import { communityTestFailurePoint } from './community-test-failure-injection';

type Db = Prisma.TransactionClient;

@Injectable()
export class DistributionService {
  constructor(private readonly db: PrismaService, private readonly ledger: FinancialLedgerService, private readonly recentAuth: RecentAuthService) {}

  async verifyExternalSale(actor: Actor, proposalId: string, input: { grossMinor: bigint; soldAt: Date; externalReference: string; evidenceReference: string; custodyConfirmed: boolean; proceedsAccountId: string; proceedsJournalId: string }, requestId: string, key: string) {
    this.recentAuth.require(actor);
    if (input.grossMinor <= 0n || !input.custodyConfirmed) throw conflict('SALE_EVIDENCE_REQUIRED', 'Verified sale evidence and custody confirmation are required.');
    return this.db.$transaction(async (db) => {
      const identity: IdempotencyIdentity = { actorScope: `user:${actor.userId}`, scope: `distribution.sale.verify:${proposalId}`, key };
      const tx = createIdentityTransaction(db);
      const hash = createHash('sha256').update(JSON.stringify({ ...input, grossMinor: input.grossMinor.toString(), soldAt: input.soldAt.toISOString() })).digest('hex');
      const acquired = await tx.idempotency.acquire(identity, hash, new Date(Date.now() + 86_400_000));
      if (acquired.state === 'FINGERPRINT_CONFLICT') throw conflict('IDEMPOTENCY_KEY_CONFLICT', 'The request key cannot be reused.');
      if (acquired.state === 'EXISTING_IN_PROGRESS') throw conflict('PERSISTENCE_CONFLICT', 'The request is already in progress.');
      if (acquired.state === 'EXISTING_COMPLETED') return acquired.record.response!.body as { proposalId: string; saleStatus: string; replayed: boolean };
      const proposal = await this.lockProposal(db, proposalId);
      if (proposal.status !== 'APPROVED') throw conflict('PROPOSAL_STATE_CONFLICT', 'Proposal is not approved for sale verification.');
      if (proposal.proposerId === actor.userId) throw conflict('SALE_TWO_PERSON_APPROVAL_REQUIRED', 'The proposer cannot verify the external sale.');
      const asset = await db.asset.findUnique({ where: { id: proposal.assetId }, include: { custodyRecord: { select: { status: true } } } });
      if (asset?.custodyRecord?.status !== 'SECURED') throw conflict('SALE_EVIDENCE_REQUIRED', 'Active secured custody is required.');
      const [account, journal] = await Promise.all([
        db.financialAccount.findUnique({ where: { id: input.proceedsAccountId }, include: { balance: true } }),
        db.journalTransaction.findUnique({ where: { id: input.proceedsJournalId } }),
      ]);
      if (!account || !journal || journal.currency !== 'GBP') throw conflict('SALE_PROCEEDS_NOT_RECOGNIZED', 'Authoritative sale proceeds are required.');
      const authority = accountAuthority(account.normalSide, account.balance?.postedDebitMinor ?? 0n, account.balance?.postedCreditMinor ?? 0n);
      if (authority < input.grossMinor) throw conflict('SALE_PROCEEDS_NOT_RECOGNIZED', 'Recognized proceeds are insufficient.');
      const sale = await db.externalSaleVerification.upsert({
        where: { proposalId },
        create: { id: randomUUID(), proposalId, status: 'PENDING', grossMinor: input.grossMinor, currency: 'GBP', soldAt: input.soldAt, externalReference: input.externalReference, evidenceReference: input.evidenceReference, custodyConfirmed: true, proceedsAccountId: account.id, proceedsJournalId: journal.id },
        update: {},
      });
      if (sale.grossMinor !== input.grossMinor || sale.proceedsAccountId !== account.id || sale.proceedsJournalId !== journal.id || sale.externalReference !== input.externalReference) throw conflict('SALE_VERIFICATION_CONFLICT', 'Sale verification details conflict.');
      const prior = await db.externalSaleVerificationApproval.findUnique({ where: { saleVerificationId_verifierUserId: { saleVerificationId: sale.id, verifierUserId: actor.userId } } });
      if (prior) throw conflict('SALE_VERIFIER_ALREADY_RECORDED', 'This verifier has already approved the sale.');
      await db.externalSaleVerificationApproval.create({ data: { id: randomUUID(), saleVerificationId: sale.id, verifierUserId: actor.userId } });
      const approvals = await db.externalSaleVerificationApproval.count({ where: { saleVerificationId: sale.id } });
      const verified = approvals >= 2;
      if (verified) {
        await db.externalSaleVerification.update({ where: { id: sale.id }, data: { status: 'VERIFIED', verifierUserId: actor.userId, verifiedAt: new Date() } });
        await db.saleProposal.update({ where: { id: proposalId }, data: { status: 'SOLD', version: { increment: 1 } } });
      }
      await tx.audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'GOVERNANCE_EXTERNAL_SALE_VERIFIED', resourceType: 'sale-proposal', resourceId: proposalId, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { grossMinor: input.grossMinor.toString() }, createdAt: new Date() });
      const result = { proposalId, saleStatus: verified ? 'VERIFIED' : 'PENDING', approvalCount: approvals, replayed: false };
      await tx.idempotency.complete(identity, { status: 200, body: result }, new Date());
      return result;
    });
  }

  async prepare(actor: Actor, proposalId: string, requestId: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const proposal = await this.lockProposal(db, proposalId);
      if (proposal.status !== 'SOLD') throw conflict('PROPOSAL_STATE_CONFLICT', 'Proposal is not ready for distribution.');
      const sale = await db.externalSaleVerification.findFirst({ where: { proposalId, status: 'VERIFIED', custodyConfirmed: true } });
      if (!sale) throw conflict('SALE_EVIDENCE_REQUIRED', 'Verified sale evidence is required.');
      const existing = await db.distribution.findUnique({ where: { proposalId } });
      if (existing) return this.safeDistribution(existing);
      const eligibility = await db.proposalEligibility.findMany({ where: { proposalId }, orderBy: { id: 'asc' } });
      const totalUnits = eligibility.reduce((sum, item) => sum + item.units, 0n);
      if (totalUnits === 0n || totalUnits !== proposal.eligibleUnits) throw conflict('DISTRIBUTION_INVARIANT_VIOLATION', 'Distribution eligibility is inconsistent.');
      const policy = governancePolicy();
      const fee = feeMinor(sale.grossMinor, policy.distributionFeeBps);
      const net = sale.grossMinor - fee;
      const distribution = await db.distribution.create({ data: { id: randomUUID(), proposalId, status: 'READY', grossMinor: sale.grossMinor, feeMinor: fee, netMinor: net, currency: 'GBP', policyVersion: policy.version } });
      await communityTestFailurePoint('distribution.prepare.after-create');
      const allocations = allocateLargestRemainder(net, eligibility.map((item) => ({ id: item.id, units: item.units })));
      await db.distributionLine.createMany({ data: allocations.map((line) => ({ id: randomUUID(), distributionId: distribution.id, eligibilityId: line.id, units: eligibility.find((item) => item.id === line.id)!.units, amountMinor: line.amountMinor, remainderRank: line.remainderRank })) });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'DISTRIBUTION_PREPARED', resourceType: 'distribution', resourceId: distribution.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { netMinor: net.toString() }, createdAt: new Date() });
      return this.safeDistribution(distribution);
    });
  }

  async execute(actor: Actor, proposalId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    const prepared = await this.db.$transaction(async (db) => {
      const distribution = await this.lockDistributionForProposal(db, proposalId);
      if (distribution.status === 'DISTRIBUTED') return { distribution, sale: null, lines: [] };
      const correlationId = `distribution:${distribution.id}`;
      if (distribution.status === 'PROCESSING') {
        const posted = await db.journalTransaction.findUnique({ where: { correlationId } });
        if (!posted) throw conflict('PERSISTENCE_CONFLICT', 'Distribution execution is already in progress.');
        const finalized = await this.finalizePostedDistribution(db, proposalId, distribution.id, posted.id, actor, requestId);
        return { distribution: finalized, sale: null, lines: [] };
      }
      if (distribution.status !== 'READY' && distribution.status !== 'FAILED') throw conflict('DISTRIBUTION_ALREADY_POSTED', 'Distribution is not executable.');
      const sale = await db.externalSaleVerification.findUnique({ where: { proposalId } });
      if (!sale || sale.status !== 'VERIFIED' || !sale.custodyConfirmed) throw conflict('SALE_EVIDENCE_REQUIRED', 'Verified sale evidence is required.');
      const lines = await db.distributionLine.findMany({ where: { distributionId: distribution.id }, include: { eligibility: true }, orderBy: { remainderRank: 'asc' } });
      if (lines.reduce((sum, line) => sum + line.amountMinor, 0n) !== distribution.netMinor) throw conflict('DISTRIBUTION_INVARIANT_VIOLATION', 'Distribution lines do not balance.');
      await db.distribution.update({ where: { id: distribution.id }, data: { status: 'PROCESSING', attemptCount: { increment: 1 }, failureCode: null } });
      return { distribution, sale, lines };
    });
    if (!prepared.sale) return this.safeDistribution(prepared.distribution);
    let journalPosted = false;
    try {
      const recipientAccounts = await this.ensureRecipientAccounts(prepared.lines.map((line) => line.eligibility.userId).filter((id): id is string => Boolean(id)));
      const journalLines: Array<{ accountId: string; side: 'DEBIT' | 'CREDIT'; amountMinor: string }> = [
        { accountId: prepared.sale.proceedsAccountId, side: 'DEBIT', amountMinor: prepared.distribution.grossMinor.toString() },
      ];
      for (const line of prepared.lines) {
        const userId = line.eligibility.userId;
        if (!userId) throw conflict('DISTRIBUTION_INVARIANT_VIOLATION', 'A distribution recipient is unavailable.');
        journalLines.push({ accountId: recipientAccounts.get(userId)!, side: 'CREDIT', amountMinor: line.amountMinor.toString() });
      }
      if (prepared.distribution.feeMinor > 0n) journalLines.push({ accountId: await this.platformFeeAccount(), side: 'CREDIT', amountMinor: prepared.distribution.feeMinor.toString() });
      const journal = await this.ledger.post(actor, { type: 'DISTRIBUTION', correlationId: `distribution:${prepared.distribution.id}`, descriptionCode: 'GOVERNANCE_DISTRIBUTION', lines: journalLines }, requestId, key);
      journalPosted = true;
      await communityTestFailurePoint('distribution.execute.after-journal');
      return this.db.$transaction(async (db) => {
        const updated = await this.finalizePostedDistribution(db, proposalId, prepared.distribution.id, journal.transactionId, actor, requestId);
        return this.safeDistribution(updated);
      });
    } catch (error) {
      // A posted journal is authoritative.  Keep the distribution PROCESSING so a
      // retry can recover/finalize it without ever reposting the entitlement cash.
      if (!journalPosted) await this.db.distribution.updateMany({ where: { proposalId, status: 'PROCESSING' }, data: { status: 'FAILED', failureCode: 'DISTRIBUTION_POST_FAILED' } });
      throw error;
    }
  }

  async reconcile(actor: Actor, proposalId: string) {
    const distribution = await this.db.distribution.findUnique({ where: { proposalId }, include: { lines: true } });
    if (!distribution) throw new NotFoundException({ code: 'DISTRIBUTION_NOT_FOUND', message: 'Distribution was not found.' });
    const codes: string[] = [];
    const lines = distribution.lines.reduce((sum, line) => sum + line.amountMinor, 0n);
    if (distribution.grossMinor - distribution.feeMinor !== distribution.netMinor) codes.push('DISTRIBUTION_GROSS_NET_MISMATCH');
    if (lines !== distribution.netMinor) codes.push('DISTRIBUTION_LINE_TOTAL_MISMATCH');
    if (distribution.status === 'DISTRIBUTED' && !distribution.financeTransactionId) codes.push('DISTRIBUTION_JOURNAL_MISSING');
    if (distribution.financeTransactionId) {
      const journal = await this.db.journalTransaction.findUnique({ where: { id: distribution.financeTransactionId }, include: { entries: true } });
      if (!journal || journal.type !== 'DISTRIBUTION') codes.push('DISTRIBUTION_JOURNAL_MISMATCH');
      else {
        const debits = journal.entries.filter((entry) => entry.side === 'DEBIT').reduce((sum, entry) => sum + entry.amountMinor, 0n);
        const credits = journal.entries.filter((entry) => entry.side === 'CREDIT').reduce((sum, entry) => sum + entry.amountMinor, 0n);
        if (debits !== credits || debits !== distribution.grossMinor) codes.push('DISTRIBUTION_JOURNAL_TOTAL_MISMATCH');
      }
    }
    await communityTestFailurePoint('distribution.reconcile.before-persist');
    const run = await this.db.distributionReconciliationRun.create({ data: { id: randomUUID(), distributionId: distribution.id, status: codes.length ? 'MISMATCH' : 'RECONCILED', grossMinor: distribution.grossMinor, feeMinor: distribution.feeMinor, netMinor: distribution.netMinor, lineMinor: lines, mismatchCodes: codes, actorUserId: actor.userId } });
    return { reconciled: run.status === 'RECONCILED', mismatchCodes: codes, grossMinor: run.grossMinor.toString(), feeMinor: run.feeMinor.toString(), netMinor: run.netMinor.toString(), lineMinor: run.lineMinor.toString() };
  }

  private async ensureRecipientAccounts(userIds: string[]) {
    const accounts = await this.db.$transaction(async (db) => {
      const result = new Map<string, string>();
      for (const userId of [...new Set(userIds)].sort()) {
        const account = await db.financialAccount.findFirst({ where: { ownerType: 'USER', ownerUserId: userId, code: 'CASH_AVAILABLE', currency: 'GBP' } }) ?? await db.financialAccount.create({ data: { id: randomUUID(), ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
        result.set(userId, account.id);
      }
      return result;
    });
    return accounts;
  }
  private async platformFeeAccount() {
    const account = await this.db.financialAccount.findFirst({ where: { ownerType: 'PLATFORM', code: 'DISTRIBUTION_FEE_REVENUE', currency: 'GBP' } }) ?? await this.db.financialAccount.create({ data: { id: randomUUID(), ownerType: 'PLATFORM', accountType: 'REVENUE', code: 'DISTRIBUTION_FEE_REVENUE', currency: 'GBP', normalSide: 'CREDIT' } });
    return account.id;
  }
  private async finalizePostedDistribution(db: Db, proposalId: string, distributionId: string, financeTransactionId: string, actor: Actor, requestId: string) {
    const distribution = await this.lockDistributionForProposal(db, proposalId);
    if (distribution.status === 'DISTRIBUTED') {
      if (distribution.financeTransactionId !== financeTransactionId) throw conflict('DISTRIBUTION_INVARIANT_VIOLATION', 'Distribution journal conflicts with final state.');
      return distribution;
    }
    const updated = await db.distribution.update({ where: { id: distributionId }, data: { status: 'DISTRIBUTED', financeTransactionId, completedAt: new Date(), failureCode: null } });
    await db.saleProposal.update({ where: { id: proposalId }, data: { status: 'DISTRIBUTED', version: { increment: 1 } } });
    await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'DISTRIBUTION_POSTED', resourceType: 'distribution', resourceId: updated.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { netMinor: updated.netMinor.toString() }, createdAt: new Date() });
    return updated;
  }
  private async lockProposal(db: Db, proposalId: string) { await db.$queryRaw`SELECT id FROM "SaleProposal" WHERE id = ${proposalId} FOR UPDATE`; const proposal = await db.saleProposal.findUnique({ where: { id: proposalId } }); if (!proposal) throw new NotFoundException({ code: 'PROPOSAL_NOT_FOUND', message: 'Proposal was not found.' }); return proposal; }
  private async lockDistributionForProposal(db: Db, proposalId: string) { await db.$queryRaw`SELECT id FROM "Distribution" WHERE "proposalId" = ${proposalId} FOR UPDATE`; const distribution = await db.distribution.findUnique({ where: { proposalId } }); if (!distribution) throw new NotFoundException({ code: 'DISTRIBUTION_NOT_FOUND', message: 'Distribution was not found.' }); return distribution; }
  private safeDistribution(distribution: { id: string; proposalId: string; status: string; grossMinor: bigint; feeMinor: bigint; netMinor: bigint; currency: string; completedAt: Date | null }) { return { id: distribution.id, proposalId: distribution.proposalId, status: distribution.status, grossMinor: distribution.grossMinor.toString(), feeMinor: distribution.feeMinor.toString(), netMinor: distribution.netMinor.toString(), currency: distribution.currency, completedAt: distribution.completedAt?.toISOString() ?? null }; }
}
function conflict(code: string, message: string): never { throw new ConflictException({ code, message }); }
