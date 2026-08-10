import * as request from 'supertest';
import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  postOwnershipTransfer,
  type OwnershipHarness,
} from './ownership.e2e-helper';

describe('ownership movement bootstrap probe', () => {
  let h: OwnershipHarness;

  beforeAll(async () => {
    h = await bootOwnershipHarness('movement-probe', 171);
  });

  afterAll(async () => {
    await closeOwnershipHarness(h);
  });

  it('creates only the eligible fixture', () => {
    expect(request).toBeDefined();
    expect(h.assetId).toBeDefined();
  });

  it('executes one issuance request', async () => {
    const response = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${h.assetId}/ownership/issue`)
      .set('authorization', h.admin.auth)
      .set('x-forwarded-for', h.admin.clientIp)
      .set('idempotency-key', `${h.runId}-issue`)
      .send({ totalUnits: '10000' });
    expect(response.status).toBe(201);
  });

  it('moves units from the treasury to the owner', async () => {
    const ledgerBefore = await h.db.ownershipLedgerEntry.count({
      where: { assetId: h.assetId },
    });
    const result = await postOwnershipTransfer({
      server: h.app.getHttpServer(),
      assetId: String(h.assetId),
      authorization: String(h.admin.auth),
      clientIp: String(h.admin.clientIp),
      idempotencyKey: `${h.runId}-transfer`,
      toUserId: String(h.owner.id),
      units: '2500',
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ assetId: h.assetId, units: '2500' });

    const source = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { type: 'TREASURY' } },
    });
    const destination = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { userId: h.owner.id } },
    });
    expect(source.settledUnits).toBe(7500n);
    expect(destination.settledUnits).toBe(2500n);
    expect(source.settledUnits + destination.settledUnits).toBe(10000n);

    const ledger = await h.db.ownershipLedgerEntry.findMany({
      where: { assetId: h.assetId },
      orderBy: { sequence: 'asc' },
    });
    expect(ledger).toHaveLength(ledgerBefore + 1);
    expect(ledger.at(-1)).toMatchObject({
      entryType: 'TRANSFER',
      debitAccountId: source.accountId,
      creditAccountId: destination.accountId,
      units: 2500n,
    });

    const replay = await postOwnershipTransfer({
      server: h.app.getHttpServer(),
      assetId: String(h.assetId),
      authorization: String(h.admin.auth),
      clientIp: String(h.admin.clientIp),
      idempotencyKey: `${h.runId}-transfer`,
      toUserId: String(h.owner.id),
      units: '2500',
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(result.body);
    expect(
      await h.db.ownershipLedgerEntry.count({ where: { assetId: h.assetId } }),
    ).toBe(ledgerBefore + 1);
  });

  it('rejects invalid, insufficient, unauthorized, and conflicting transfers', async () => {
    const base = {
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      toUserId: h.owner.id,
    };
    expect(
      (
        await postOwnershipTransfer({
          ...base,
          idempotencyKey: `${h.runId}-insufficient`,
          units: '8000',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await postOwnershipTransfer({
          ...base,
          idempotencyKey: `${h.runId}-zero`,
          units: '0',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await postOwnershipTransfer({
          ...base,
          idempotencyKey: `${h.runId}-decimal`,
          units: '1.5',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await postOwnershipTransfer({
          ...base,
          idempotencyKey: `${h.runId}-transfer`,
          units: '1',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await postOwnershipTransfer({
          ...base,
          authorization: h.owner.auth,
          clientIp: h.owner.clientIp,
          idempotencyKey: `${h.runId}-owner-denied`,
          units: '1',
        })
      ).status,
    ).toBe(403);
  });

  it('does not overspend when two transfers race for the same treasury units', async () => {
    const transfer = (key: string) =>
      postOwnershipTransfer({
        server: h.app.getHttpServer(),
        assetId: h.assetId,
        authorization: h.admin.auth,
        clientIp: h.admin.clientIp,
        idempotencyKey: `${h.runId}-${key}`,
        toUserId: h.owner.id,
        units: '5000',
      });

    const results = await Promise.all([transfer('race-a'), transfer('race-b')]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);

    const positions = await h.db.ownershipPosition.findMany({
      where: { assetId: h.assetId },
    });
    const total = positions.reduce(
      (sum, position) => sum + position.settledUnits,
      0n,
    );
    expect(total).toBe(10000n);
    for (const position of positions) {
      expect(position.settledUnits).toBeGreaterThanOrEqual(0n);
      expect(position.reservedUnits).toBeGreaterThanOrEqual(0n);
      expect(
        position.settledUnits - position.reservedUnits,
      ).toBeGreaterThanOrEqual(0n);
    }
  });
});
