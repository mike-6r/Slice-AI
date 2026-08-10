import * as request from 'supertest';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 013 privileged finance HTTP contracts', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let admin: { id: string; auth: string; clientIp: string };
  let member: { id: string; auth: string; clientIp: string };
  let originalTransactionId: string;
  let cashAccountId: string;
  let clearingAccountId: string;

  beforeAll(async () => {
    h = await bootSubmissionHarness('financial-admin');
    categoryId = await createCategory(h);
    admin = await signup(h, 'finance-admin', 821);
    member = await signup(h, 'finance-member', 822);
    await h.db.roleAssignment.create({
      data: {
        id: `${h.runId}-admin`,
        userId: admin.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
      },
    });
    cashAccountId = `${h.runId}-cash`;
    clearingAccountId = `${h.runId}-clearing`;
    originalTransactionId = `${h.runId}-journal`;
    await h.db.financialAccount.createMany({
      data: [
        {
          id: cashAccountId,
          ownerType: 'USER',
          ownerUserId: admin.id,
          accountType: 'LIABILITY',
          code: 'CASH_AVAILABLE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
        {
          id: clearingAccountId,
          ownerType: 'PLATFORM',
          accountType: 'ASSET',
          code: `${h.runId}-CLEARING`,
          currency: 'GBP',
          normalSide: 'DEBIT',
        },
      ],
    });
    await h.db.journalTransaction.create({
      data: {
        id: originalTransactionId,
        type: 'DEMO_FUNDING',
        currency: 'GBP',
        correlationId: `${h.runId}-journal`,
        descriptionCode: 'TEST_FUNDING',
        createdByUserId: admin.id,
      },
    });
    await h.db.journalEntry.createMany({
      data: [
        {
          id: `${h.runId}-entry-1`,
          transactionId: originalTransactionId,
          sequence: 1,
          accountId: clearingAccountId,
          side: 'DEBIT',
          amountMinor: 1000n,
          currency: 'GBP',
        },
        {
          id: `${h.runId}-entry-2`,
          transactionId: originalTransactionId,
          sequence: 2,
          accountId: cashAccountId,
          side: 'CREDIT',
          amountMinor: 1000n,
          currency: 'GBP',
        },
      ],
    });
    await h.db.accountBalance.createMany({
      data: [
        { accountId: cashAccountId, postedCreditMinor: 1000n },
        { accountId: clearingAccountId, postedDebitMinor: 1000n },
      ],
    });
  });

  afterAll(async () => {
    const accountIds = [cashAccountId, clearingAccountId];
    await h.db.auditEvent.deleteMany({
      where: { actorUserId: { in: [admin.id, member.id] } },
    });
    await h.db.idempotencyRecord.deleteMany({
      where: { key: { startsWith: h.runId } },
    });
    await h.db.journalEntry.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await h.db.journalTransaction.deleteMany({
      where: { reversalOfId: originalTransactionId },
    });
    await h.db.journalTransaction.deleteMany({
      where: { id: originalTransactionId },
    });
    await h.db.accountBalance.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await h.db.financialAccount.deleteMany({
      where: { id: { in: accountIds } },
    });
    await h.db.financialReconciliationRun.deleteMany({
      where: { actorUserId: admin.id },
    });
    await closeSubmissionHarness(h, [admin.id, member.id], categoryId);
  });

  it('requires finance.manage and creates one compensating reversal with safe replay', async () => {
    const server = h.app.getHttpServer();
    const denied = await request(server)
      .post('/api/v1/admin/finance/reversals')
      .set('authorization', member.auth)
      .set('x-forwarded-for', member.clientIp)
      .set('idempotency-key', `${h.runId}-denied`)
      .send({ transactionId: originalTransactionId, reasonCode: 'TEST' });
    expect(denied.status).toBe(403);
    const headers = {
      authorization: admin.auth,
      'x-forwarded-for': admin.clientIp,
      'idempotency-key': `${h.runId}-reverse`,
    };
    const first = await request(server)
      .post('/api/v1/admin/finance/reversals')
      .set(headers)
      .send({
        transactionId: originalTransactionId,
        reasonCode: 'TEST_REVERSAL',
      });
    const replay = await request(server)
      .post('/api/v1/admin/finance/reversals')
      .set(headers)
      .send({
        transactionId: originalTransactionId,
        reasonCode: 'TEST_REVERSAL',
      });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(Object.keys(first.body).sort()).toEqual([
      'reversalId',
      'transactionId',
    ]);
    expect(
      await h.db.journalEntry.count({
        where: { transactionId: originalTransactionId },
      }),
    ).toBe(2);
    expect(
      await h.db.journalTransaction.count({
        where: { reversalOfId: originalTransactionId },
      }),
    ).toBe(1);
    const conflict = await request(server)
      .post('/api/v1/admin/finance/reversals')
      .set(headers)
      .send({ transactionId: originalTransactionId, reasonCode: 'DIFFERENT' });
    expect(conflict.status).toBe(409);
  });

  it('runs clean reconciliation once without leaking account internals', async () => {
    const headers = {
      authorization: admin.auth,
      'x-forwarded-for': admin.clientIp,
      'idempotency-key': `${h.runId}-reconcile`,
    };
    const first = await request(h.app.getHttpServer())
      .post('/api/v1/admin/finance/reconciliation-runs')
      .set(headers)
      .send({});
    const replay = await request(h.app.getHttpServer())
      .post('/api/v1/admin/finance/reconciliation-runs')
      .set(headers)
      .send({});
    expect(first.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(first.body).toMatchObject({ reconciled: true, mismatchCodes: [] });
    expect(JSON.stringify(first.body)).not.toContain(cashAccountId);
    expect(JSON.stringify(first.body)).not.toContain(clearingAccountId);
  });
});
