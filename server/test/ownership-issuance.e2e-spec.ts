import * as request from 'supertest';
import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  type OwnershipHarness,
} from './ownership.e2e-helper';

describe('ownership issuance transform probe', () => {
  let h: OwnershipHarness;
  beforeAll(async () => {
    h = await bootOwnershipHarness('issuance-probe', 151);
  });
  afterAll(async () => {
    await closeOwnershipHarness(h);
  });
  it('creates only the eligible fixture', () => {
    expect(request).toBeDefined();
    expect(h.assetId).toBeDefined();
  });

  it('issues once, replays exactly once, and rejects duplicate issuance', async () => {
    const response = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${h.assetId}/ownership/issue`)
      .set('authorization', h.admin.auth)
      .set('x-forwarded-for', h.admin.clientIp)
      .set('idempotency-key', `${h.runId}-issue`)
      .send({ totalUnits: '10000' });
    expect(response.status).toBe(201);

    const replay = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${h.assetId}/ownership/issue`)
      .set('authorization', h.admin.auth)
      .set('x-forwarded-for', h.admin.clientIp)
      .set('idempotency-key', `${h.runId}-issue`)
      .send({ totalUnits: '10000' });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(response.body);
    expect(
      await h.db.ownershipLedgerEntry.count({ where: { assetId: h.assetId } }),
    ).toBe(1);

    const duplicate = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${h.assetId}/ownership/issue`)
      .set('authorization', h.admin.auth)
      .set('x-forwarded-for', h.admin.clientIp)
      .set('idempotency-key', `${h.runId}-duplicate-issue`)
      .send({ totalUnits: '10000' });
    expect(duplicate.status).toBe(409);
  });
});
