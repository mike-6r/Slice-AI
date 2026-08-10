import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  issue,
  postOwnershipCorrection,
  postOwnershipReservation,
  postOwnershipTransfer,
  type OwnershipHarness,
} from './ownership.e2e-helper';

async function withFailure<T>(
  point: string,
  work: () => Promise<T>,
): Promise<T> {
  process.env.SLICE_TEST_OWNERSHIP_FAIL_AT = point;
  try {
    return await work();
  } finally {
    delete process.env.SLICE_TEST_OWNERSHIP_FAIL_AT;
  }
}

describe('ownership transaction rollback', () => {
  let h: OwnershipHarness;

  beforeAll(async () => {
    h = await bootOwnershipHarness('rollback', 271);
  });

  afterAll(async () => closeOwnershipHarness(h));

  it('rolls back an issuance failure and leaves its idempotency key retryable', async () => {
    const failed = await withFailure('issuance.after-account', () =>
      issue(h, 'rollback-issue'),
    );
    expect(failed.status).toBe(500);
    expect(
      await h.db.ownershipAssetSupply.count({ where: { assetId: h.assetId } }),
    ).toBe(0);
    expect(
      await h.db.ownershipPosition.count({ where: { assetId: h.assetId } }),
    ).toBe(0);
    expect(
      await h.db.ownershipLedgerEntry.count({ where: { assetId: h.assetId } }),
    ).toBe(0);

    expect((await issue(h, 'rollback-issue')).status).toBe(201);
  });

  it('rolls back failed transfer, reservation, and correction mutations', async () => {
    const transfer = {
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      toUserId: h.owner.id,
      units: '2500',
    };
    expect(
      (
        await withFailure('transfer.after-validation', () =>
          postOwnershipTransfer({
            ...transfer,
            idempotencyKey: `${h.runId}-rollback-transfer`,
          }),
        )
      ).status,
    ).toBe(500);
    expect(
      await h.db.ownershipPosition.count({ where: { assetId: h.assetId } }),
    ).toBe(1);
    expect(
      await h.db.ownershipLedgerEntry.count({ where: { assetId: h.assetId } }),
    ).toBe(1);
    expect(
      (
        await postOwnershipTransfer({
          ...transfer,
          idempotencyKey: `${h.runId}-rollback-transfer`,
        })
      ).status,
    ).toBe(201);

    const reserve = {
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      userId: h.owner.id,
      units: '1000',
      purposeId: `${h.runId}-rollback-reserve`,
    };
    expect(
      (
        await withFailure('reservation.after-position', () =>
          postOwnershipReservation({
            ...reserve,
            idempotencyKey: `${h.runId}-rollback-reserve`,
          }),
        )
      ).status,
    ).toBe(500);
    const position = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { userId: h.owner.id } },
    });
    expect(position.reservedUnits).toBe(0n);
    expect(
      await h.db.ownershipReservation.count({ where: { assetId: h.assetId } }),
    ).toBe(0);

    expect(
      (
        await withFailure('correction.after-validation', () =>
          postOwnershipCorrection({
            server: h.app.getHttpServer(),
            assetId: h.assetId,
            authorization: h.admin.auth,
            clientIp: h.admin.clientIp,
            idempotencyKey: `${h.runId}-rollback-correction`,
            userId: h.owner.id,
            units: '500',
            direction: 'DEBIT',
            reasonCode: 'ROLLBACK_TEST',
          }),
        )
      ).status,
    ).toBe(500);
    expect(
      await h.db.ownershipLedgerEntry.count({ where: { assetId: h.assetId } }),
    ).toBe(2);
  });
});
