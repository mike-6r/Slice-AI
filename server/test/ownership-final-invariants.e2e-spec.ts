import { signup } from './submissions.e2e-helper';
import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  issue,
  postOwnershipReconciliation,
  postOwnershipReservation,
  postOwnershipTransfer,
  type OwnershipHarness,
} from './ownership.e2e-helper';

describe('ownership final invariants', () => {
  let h: OwnershipHarness;

  beforeAll(async () => {
    h = await bootOwnershipHarness('final-invariants', 291);
  });

  afterAll(async () => closeOwnershipHarness(h));

  it('serializes duplicate issuance and destination-account creation races', async () => {
    const [first, second] = await Promise.all([
      issue(h, 'race-a'),
      issue(h, 'race-b'),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(
      await h.db.ownershipAssetSupply.count({ where: { assetId: h.assetId } }),
    ).toBe(1);
    expect(
      await h.db.ownershipLedgerEntry.count({ where: { assetId: h.assetId } }),
    ).toBe(1);

    const destination = await signup(h, 'destination', 299);
    h.extraUserIds = [...(h.extraUserIds ?? []), destination.id];
    const transfer = (key: string) =>
      postOwnershipTransfer({
        server: h.app.getHttpServer(),
        assetId: h.assetId,
        authorization: h.admin.auth,
        clientIp: h.admin.clientIp,
        idempotencyKey: `${h.runId}-${key}`,
        toUserId: destination.id,
        units: '1000',
      });
    const results = await Promise.all([
      transfer('destination-a'),
      transfer('destination-b'),
    ]);
    expect(results.every((result) => result.status === 201)).toBe(true);
    expect(
      await h.db.ownershipAccount.count({ where: { userId: destination.id } }),
    ).toBe(1);
  });

  it('preserves available-unit invariants during a reserve-versus-transfer race', async () => {
    const ownerTransfer = await postOwnershipTransfer({
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      idempotencyKey: `${h.runId}-fund-owner`,
      toUserId: h.owner.id,
      units: '2500',
    });
    expect(ownerTransfer.status).toBe(201);
    const [reserve, transfer] = await Promise.all([
      postOwnershipReservation({
        server: h.app.getHttpServer(),
        assetId: h.assetId,
        authorization: h.admin.auth,
        clientIp: h.admin.clientIp,
        idempotencyKey: `${h.runId}-race-reserve`,
        userId: h.owner.id,
        units: '2000',
        purposeId: `${h.runId}-race-purpose`,
      }),
      postOwnershipTransfer({
        server: h.app.getHttpServer(),
        assetId: h.assetId,
        authorization: h.admin.auth,
        clientIp: h.admin.clientIp,
        idempotencyKey: `${h.runId}-race-transfer`,
        fromUserId: h.owner.id,
        toUserId: h.admin.id,
        units: '1000',
      }),
    ]);
    expect(
      [reserve.status, transfer.status].filter((status) => status === 201)
        .length,
    ).toBe(1);
    const owner = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { userId: h.owner.id } },
    });
    expect(owner.settledUnits).toBeGreaterThanOrEqual(0n);
    expect(owner.reservedUnits).toBeGreaterThanOrEqual(0n);
    expect(owner.reservedUnits).toBeLessThanOrEqual(owner.settledUnits);
  });

  it('reports deterministic mismatch codes without repairing positions', async () => {
    const position = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { type: 'TREASURY' } },
    });
    await h.db.ownershipPosition.update({
      where: { id: position.id },
      data: { settledUnits: { decrement: 1n } },
    });
    const reconciliation = await postOwnershipReconciliation({
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      idempotencyKey: `${h.runId}-mismatch`,
    });
    expect(reconciliation.status).toBe(201);
    expect(reconciliation.body).toMatchObject({
      status: 'MISMATCH',
      mismatchCodes: expect.arrayContaining(['POSITION_TOTAL_MISMATCH']),
    });
    const unchanged = await h.db.ownershipPosition.findUniqueOrThrow({
      where: { id: position.id },
    });
    expect(unchanged.settledUnits).toBe(position.settledUnits - 1n);
  });
});
