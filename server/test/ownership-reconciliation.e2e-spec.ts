import * as request from 'supertest';
import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  issue,
  postOwnershipReconciliation,
  postOwnershipReservation,
  postOwnershipTransfer,
  type OwnershipHarness,
} from './ownership.e2e-helper';

describe('ownership reconciliation', () => {
  let h: OwnershipHarness;

  beforeAll(async () => {
    h = await bootOwnershipHarness('reconciliation', 251);
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
    expect(
      (
        await postOwnershipReservation({
          server: h.app.getHttpServer(),
          assetId: h.assetId,
          authorization: h.admin.auth,
          clientIp: h.admin.clientIp,
          idempotencyKey: `${h.runId}-reserve`,
          userId: h.owner.id,
          units: '1000',
          purposeId: `${h.runId}-purpose`,
        })
      ).status,
    ).toBe(201);
  });

  afterAll(async () => closeOwnershipHarness(h));

  it('reconciles issuance, positions, reservations, and issuance ledger safely', async () => {
    const result = await postOwnershipReconciliation({
      server: h.app.getHttpServer(),
      assetId: h.assetId,
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      idempotencyKey: `${h.runId}-reconcile`,
    });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      status: 'RECONCILED',
      issuedUnits: '10000',
      positionUnits: '10000',
      reservedUnits: '1000',
      mismatchCodes: [],
    });

    const publicRead = await request(h.app.getHttpServer()).get(
      '/api/v1/market/assets/' + h.slug + '/ownership/issuance',
    );
    expect(publicRead.status).toBe(200);
    expect(publicRead.body).toMatchObject({
      totalUnits: '10000',
      issuedUnits: '10000',
    });
    expect(JSON.stringify(publicRead.body)).not.toContain(h.owner.id);
  });
});
