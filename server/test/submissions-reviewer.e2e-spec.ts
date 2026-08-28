import * as request from 'supertest';
import { REQUIRED_MEDIA_SLOTS } from '../src/modules/submissions/domain/submission.policy';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 010 reviewer HTTP E2E', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let owner: Awaited<ReturnType<typeof signup>>;
  let reviewer: Awaited<ReturnType<typeof signup>>;
  let secondReviewer: Awaited<ReturnType<typeof signup>>;
  let id: string;
  beforeAll(async () => {
    h = await bootSubmissionHarness('reviewer');
    categoryId = await createCategory(h);
    owner = await signup(h, 'review-owner', 31);
    reviewer = await signup(h, 'reviewer', 32);
    secondReviewer = await signup(h, 'reviewer-other', 33);
    await h.db.user.update({
      where: { id: owner.id },
      data: { accountStatus: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    await h.db.roleAssignment.create({
      data: {
        id: `${h.runId}-role`,
        userId: reviewer.id,
        role: 'ASSET_REVIEWER',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    await h.db.roleAssignment.create({
      data: {
        id: `${h.runId}-role-other`,
        userId: secondReviewer.id,
        role: 'ASSET_REVIEWER',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    const draft = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-draft`)
      .send({
        categoryId,
        declaredMetadata: { name: 'Review fixture', termsAcknowledged: true },
      });
    expect(draft.status).toBe(201);
    expect(draft.body.id).toBeDefined();
    id = draft.body.id;
    await h.db.submissionMedia.createMany({
      data: REQUIRED_MEDIA_SLOTS.map((slot) => ({
        id: `${h.runId}-${slot}`,
        submissionId: id,
        slot,
        objectKey: `${h.runId}/${slot}`,
        originalFilename: `${slot}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 42,
        sha256: slot.repeat(64).slice(0, 64),
        status: 'SAFE',
      })),
    });
  });
  afterAll(async () =>
    closeSubmissionHarness(
      h,
      [owner.id, reviewer.id, secondReviewer.id],
      categoryId,
    ),
  );
  it('queues, claims, requests changes, audits and notifies without exposing notes', async () => {
    const submit = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${id}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-submit`)
      .send({ version: 1 });
    expect(submit.status).toBe(201);
    const queue = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions')
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((x: { id: string }) => x.id)).toContain(id);
    const queueItem = queue.body.items.find(
      (item: { id: string }) => item.id === id,
    );
    expect(queueItem).toMatchObject({
      readinessState: 'READY',
      priority: 'LOW',
      evidence: {
        presentRequired: REQUIRED_MEDIA_SLOTS.length,
        required: REQUIRED_MEDIA_SLOTS.length,
      },
      reviewer: { state: 'UNCLAIMED', displayName: null },
    });
    expect(queue.body.counts).toEqual(
      expect.objectContaining({ highPriority: expect.any(Number) }),
    );
    const highPriorityQueue = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions?priority=high')
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(highPriorityQueue.status).toBe(200);
    expect(
      highPriorityQueue.body.items.map((item: { id: string }) => item.id),
    ).not.toContain(id);
    const readyDetail = await request(h.app.getHttpServer())
      .get(`/api/v1/reviews/submissions/${id}`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(readyDetail.status).toBe(200);
    expect(readyDetail.body.readiness).toMatchObject({
      state: 'CLAIM_REVIEW',
      nextAction: 'CLAIM_REVIEW',
      decisionEligible: false,
      requiredBlockers: [],
    });
    expect(readyDetail.body.reviewPresentation).toEqual({
      access: 'UNCLAIMED',
      required: { complete: 3, total: 3, blockers: 0 },
      advisory: { complete: 1, total: 3 },
    });
    expect(readyDetail.body.readiness.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'evidence', status: 'COMPLETE' }),
        expect.objectContaining({
          key: 'certification',
          status: 'NOT_APPLICABLE',
        }),
        expect.objectContaining({ key: 'research', required: false }),
        expect.objectContaining({ key: 'assessment', required: false }),
      ]),
    );
    const claim = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${id}/claim`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-claim`)
      .send({});
    expect(claim.status).toBe(201);
    const claimedDetail = await request(h.app.getHttpServer())
      .get(`/api/v1/reviews/submissions/${id}`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(claimedDetail.status).toBe(200);
    expect(claimedDetail.body.readiness).toMatchObject({
      state: 'READY_FOR_DECISION',
      nextAction: 'READY_FOR_DECISION',
      decisionEligible: true,
    });
    expect(claimedDetail.body.reviewPresentation.access).toBe('CLAIMED_BY_ME');
    const claimedQueue = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions?reviewer=mine')
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(claimedQueue.status).toBe(200);
    expect(
      claimedQueue.body.items.find((item: { id: string }) => item.id === id),
    ).toMatchObject({
      reviewer: { state: 'CLAIMED_BY_ME' },
      readinessState: 'MANUAL_REVIEW',
    });
    const secondQueue = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions')
      .set('authorization', secondReviewer.auth)
      .set('x-forwarded-for', secondReviewer.clientIp);
    expect(secondQueue.status).toBe(200);
    expect(
      secondQueue.body.items.map((x: { id: string }) => x.id),
    ).not.toContain(id);
    const secondDetail = await request(h.app.getHttpServer())
      .get(`/api/v1/reviews/submissions/${id}`)
      .set('authorization', secondReviewer.auth)
      .set('x-forwarded-for', secondReviewer.clientIp);
    expect(secondDetail.status).toBe(404);
    const changes = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${id}/request-changes`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-changes`)
      .send({ reasonCode: 'EVIDENCE_REQUIRED', note: 'private reviewer note' });
    expect(changes.status).toBe(201);
    expect(JSON.stringify(changes.body)).not.toContain('private reviewer note');
    expect(
      await h.db.outboxEvent.count({
        where: {
          eventType: 'submission.changesrequested',
          actorUserId: owner.id,
        },
      }),
    ).toBe(1);
    const changesDetail = await request(h.app.getHttpServer())
      .get(`/api/v1/reviews/submissions/${id}`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(changesDetail.status).toBe(200);
    expect(changesDetail.body.readiness).toMatchObject({
      state: 'WAITING_FOR_COLLECTOR',
      nextAction: 'WAIT_FOR_COLLECTOR',
      decisionEligible: false,
    });
    expect(
      await h.db.auditEvent.count({
        where: {
          actorUserId: reviewer.id,
          action: 'SUBMISSION_CHANGES_REQUESTED',
          resourceId: id,
        },
      }),
    ).toBe(1);
  });
});
