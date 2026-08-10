import * as request from 'supertest';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 010 submission owner HTTP E2E', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let owner: Awaited<ReturnType<typeof signup>>;
  let other: Awaited<ReturnType<typeof signup>>;
  beforeAll(async () => {
    h = await bootSubmissionHarness('owner');
    categoryId = await createCategory(h);
    owner = await signup(h, 'owner', 11);
    other = await signup(h, 'other', 12);
    await h.db.user.update({
      where: { id: owner.id },
      data: { accountStatus: 'ACTIVE', emailVerifiedAt: new Date() },
    });
  });
  afterAll(async () =>
    closeSubmissionHarness(h, [owner.id, other.id], categoryId),
  );
  it('creates, lists, reads, updates, replays, and protects a draft', async () => {
    const body = { categoryId, declaredMetadata: { name: 'Owner draft' } };
    const first = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-create`)
      .send(body);
    expect(first.status).toBe(201);
    const id = first.body.id;
    const replay = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-create`)
      .send(body);
    expect(replay.body).toEqual(first.body);
    const conflict = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-create`)
      .send({ ...body, declaredMetadata: { name: 'changed' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect(
      (
        await request(h.app.getHttpServer())
          .get('/api/v1/submissions')
          .set('authorization', owner.auth)
          .set('x-forwarded-for', owner.clientIp)
      ).body.items.map((item: { id: string }) => item.id),
    ).toContain(id);
    expect(
      (
        await request(h.app.getHttpServer())
          .get(`/api/v1/submissions/${id}`)
          .set('authorization', other.auth)
          .set('x-forwarded-for', other.clientIp)
      ).status,
    ).toBe(404);
    const updated = await request(h.app.getHttpServer())
      .patch(`/api/v1/submissions/${id}`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-update`)
      .send({ ...body, version: 1, declaredMetadata: { name: 'updated' } });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);
    const stale = await request(h.app.getHttpServer())
      .patch(`/api/v1/submissions/${id}`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-stale`)
      .send({ ...body, version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SUBMISSION_VERSION_CONFLICT');
  });
});
