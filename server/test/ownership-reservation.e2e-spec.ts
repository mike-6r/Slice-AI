import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  issue,
  postOwnershipReservation,
  postOwnershipReservationRelease,
  postOwnershipTransfer,
  type OwnershipHarness,
} from './ownership.e2e-helper';

describe('ownership reservations', () => {
  let h: OwnershipHarness;

  beforeAll(async () => {
    h = await bootOwnershipHarness('reservation', 211);
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

  afterAll(async () => {
    await closeOwnershipHarness(h);
  });

  it('reserves and releases owned units exactly once', async () => {
    const reserve = await postOwnershipReservation({
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      idempotencyKey: `${h.runId}-reserve`,
      userId: h.owner.id,
      units: '1000',
      purposeId: `${h.runId}-purpose`,
    });
    expect(reserve.status).toBe(201);
    const reservationId = String(reserve.body.reservationId);

    const position = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { userId: h.owner.id } },
    });
    expect(position.settledUnits).toBe(2500n);
    expect(position.reservedUnits).toBe(1000n);

    const release = await postOwnershipReservationRelease({
      server: h.app.getHttpServer(),
      reservationId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      idempotencyKey: `${h.runId}-release`,
    });
    expect(release.status).toBe(201);
    const released = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { userId: h.owner.id } },
    });
    expect(released.reservedUnits).toBe(0n);
  });

  it('does not over-reserve under concurrent requests', async () => {
    const reserve = (key: string, purposeId: string) =>
      postOwnershipReservation({
        server: h.app.getHttpServer(),
        assetId: h.assetId,
        authorization: h.admin.auth,
        clientIp: h.admin.clientIp,
        idempotencyKey: `${h.runId}-${key}`,
        userId: h.owner.id,
        units: '2000',
        purposeId,
      });
    const results = await Promise.all([
      reserve('race-reserve-a', `${h.runId}-race-a`),
      reserve('race-reserve-b', `${h.runId}-race-b`),
    ]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);

    const position = await h.db.ownershipPosition.findFirstOrThrow({
      where: { assetId: h.assetId, account: { userId: h.owner.id } },
    });
    expect(position.reservedUnits).toBe(2000n);
    expect(position.settledUnits - position.reservedUnits).toBe(500n);
  });
});
