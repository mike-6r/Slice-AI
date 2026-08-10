import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  issue,
  postOwnershipCorrection,
  postOwnershipTransfer,
  type OwnershipHarness,
} from './ownership.e2e-helper';

describe('ownership corrections', () => {
  let h: OwnershipHarness;

  beforeAll(async () => {
    h = await bootOwnershipHarness('correction', 231);
    expect((await issue(h)).status).toBe(201);
    expect(
      (
        await postOwnershipTransfer({
          server: h.app.getHttpServer(),
          assetId: h.assetId,
          authorization: h.admin.auth,
          clientIp: h.admin.clientIp,
          idempotencyKey: `${h.runId}-fund-owner`,
          toUserId: h.owner.id,
          units: '2500',
        })
      ).status,
    ).toBe(201);
  });

  afterAll(async () => closeOwnershipHarness(h));

  it('writes an append-only compensating correction', async () => {
    const before = await h.db.ownershipLedgerEntry.count({
      where: { assetId: h.assetId },
    });
    const result = await postOwnershipCorrection({
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      idempotencyKey: `${h.runId}-correction`,
      userId: h.owner.id,
      units: '500',
      direction: 'DEBIT',
      reasonCode: 'TEST_CORRECTION',
    });
    expect(result.status).toBe(201);
    const position = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { userId: h.owner.id } },
    });
    expect(position.settledUnits).toBe(2000n);
    const entries = await h.db.ownershipLedgerEntry.findMany({
      where: { assetId: h.assetId },
    });
    expect(entries).toHaveLength(before + 1);
    expect(entries.at(-1)).toMatchObject({
      entryType: 'CORRECTION',
      reasonCode: 'TEST_CORRECTION',
    });
  });
});
