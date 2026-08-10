import * as request from 'supertest';
import { createHash } from 'node:crypto';
import { LocalSubmissionStorage } from '../src/modules/submissions/infrastructure/local-submission-storage';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 010 submission media HTTP E2E', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let owner: Awaited<ReturnType<typeof signup>>;
  let id: string;
  beforeAll(async () => {
    h = await bootSubmissionHarness('media');
    categoryId = await createCategory(h);
    owner = await signup(h, 'media-owner', 21);
    await h.db.user.update({
      where: { id: owner.id },
      data: { accountStatus: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    const draft = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-draft`)
      .send({ categoryId });
    id = draft.body.id;
  });
  afterAll(async () => closeSubmissionHarness(h, [owner.id], categoryId));
  it('uses safe slots, a deterministic local storage double, and safe projections', async () => {
    const invalid = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${id}/media/upload-intents`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-svg`)
      .send({
        slot: 'front',
        mimeType: 'image/svg+xml',
        sizeBytes: 1,
        originalFilename: 'unsafe.svg',
      });
    expect(invalid.status).toBe(415);
    const oversize = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${id}/media/upload-intents`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-oversize`)
      .send({
        slot: 'front',
        mimeType: 'image/jpeg',
        sizeBytes: 10 * 1024 * 1024 + 1,
        originalFilename: 'oversize.jpg',
      });
    expect(oversize.status).toBe(413);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/wJ+Xoej9QAAAABJRU5ErkJggg==',
      'base64',
    );
    const intent = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${id}/media/upload-intents`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-front`)
      .send({
        slot: 'front',
        mimeType: 'image/png',
        sizeBytes: png.length,
        originalFilename: '../../front.png',
      });
    expect(intent.status).toBe(201);
    expect(intent.body.media.originalFilename).toBeUndefined();
    expect(intent.body.upload.url).toMatch(
      /^\/api\/v1\/submissions\/local-uploads\//,
    );
    const upload = await request(h.app.getHttpServer())
      .put(intent.body.upload.url)
      .set('content-type', 'image/png')
      .send(png);
    expect(upload.status).toBe(204);
    const checksum = createHash('sha256').update(png).digest('hex');
    const complete = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${id}/media/${intent.body.media.id}/complete`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-complete`)
      .send({ sha256: checksum, version: 1 });
    expect(complete.status).toBe(201);
    expect(complete.body.media.status).toBe('SAFE');
    for (const [slot, stored, expectedStatus] of [
      [
        'detail',
        {
          mimeType: 'image/jpeg',
          sizeBytes: 42,
          sha256: checksum,
          magicMimeType: 'image/jpeg',
          width: 2,
          height: 2,
        },
        409,
      ],
      [
        'side',
        {
          mimeType: 'image/jpeg',
          sizeBytes: 42,
          sha256: 'd'.repeat(64),
          magicMimeType: 'image/png',
          width: 2,
          height: 2,
        },
        422,
      ],
      [
        'back',
        {
          mimeType: 'image/jpeg',
          sizeBytes: 42,
          sha256: 'e'.repeat(64),
          magicMimeType: 'image/jpeg',
          width: 2,
          height: 2,
          testScanSafe: false,
        },
        201,
      ],
    ] as const) {
      const extraIntent = await request(h.app.getHttpServer())
        .post(`/api/v1/submissions/${id}/media/upload-intents`)
        .set('authorization', owner.auth)
        .set('x-forwarded-for', owner.clientIp)
        .set('idempotency-key', `${h.runId}-${slot}-intent`)
        .send({
          slot,
          mimeType: 'image/jpeg',
          sizeBytes: 42,
          originalFilename: `${slot}.jpg`,
        });
      expect(extraIntent.status).toBe(201);
      h.app.get(LocalSubmissionStorage).putForTest({
        key: extraIntent.body.upload.objectKey,
        ...stored,
      });
      const extraComplete = await request(h.app.getHttpServer())
        .post(
          `/api/v1/submissions/${id}/media/${extraIntent.body.media.id}/complete`,
        )
        .set('authorization', owner.auth)
        .set('x-forwarded-for', owner.clientIp)
        .set('idempotency-key', `${h.runId}-${slot}-complete`)
        .send({ sha256: stored.sha256, version: 1 });
      expect(extraComplete.status).toBe(expectedStatus);
      if (slot === 'back')
        expect(extraComplete.body.media.status).toBe('REJECTED');
    }
    const removed = await request(h.app.getHttpServer())
      .delete(
        `/api/v1/submissions/${id}/media/${intent.body.media.id}?version=1`,
      )
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-remove`);
    expect(removed.status).toBe(200);
    expect(removed.body.media.objectKey).toBeUndefined();
  });
});
