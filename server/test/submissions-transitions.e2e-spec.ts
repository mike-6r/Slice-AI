import * as request from 'supertest';
import { REQUIRED_MEDIA_SLOTS } from '../src/modules/submissions/domain/submission.policy';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 010 submission transition HTTP E2E', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let owner: Awaited<ReturnType<typeof signup>>;
  let reviewer: Awaited<ReturnType<typeof signup>>;
  let competingReviewer: Awaited<ReturnType<typeof signup>>;
  beforeAll(async () => {
    h = await bootSubmissionHarness('transitions');
    categoryId = await createCategory(h);
    owner = await signup(h, 'transition-owner', 41);
    reviewer = await signup(h, 'transition-reviewer', 42);
    competingReviewer = await signup(h, 'transition-competing-reviewer', 43);
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
        id: `${h.runId}-competing-role`,
        userId: competingReviewer.id,
        role: 'ASSET_REVIEWER',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
  });
  afterAll(async () =>
    closeSubmissionHarness(
      h,
      [owner.id, reviewer.id, competingReviewer.id],
      categoryId,
    ),
  );
  async function submittedDraft(suffix: string) {
    const draft = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-${suffix}-draft`)
      .send({
        categoryId,
        declaredMetadata: { name: suffix, termsAcknowledged: true },
      });
    expect(draft.status).toBe(201);
    const id = draft.body.id as string;
    await h.db.submissionMedia.createMany({
      data: REQUIRED_MEDIA_SLOTS.map((slot) => ({
        id: `${h.runId}-${suffix}-${slot}`,
        submissionId: id,
        slot,
        objectKey: `${h.runId}/${suffix}/${slot}`,
        originalFilename: `${slot}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        sha256: (slot === 'front' ? 'a' : 'b').repeat(64),
        status: 'SAFE',
      })),
    });
    const submit = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${id}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-${suffix}-submit`)
      .send({ version: 1 });
    expect(submit.status).toBe(201);
    return { id, version: submit.body.version as number };
  }
  it('changes, resubmits, and approves only once at the Document 010 handoff boundary', async () => {
    const first = await submittedDraft('approve');
    const claim = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${first.id}/claim`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-claim`)
      .send({});
    expect(claim.status).toBe(201);
    const changes = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${first.id}/request-changes`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-changes`)
      .send({ reasonCode: 'EVIDENCE_REQUIRED' });
    expect(changes.status).toBe(201);
    const edit = await request(h.app.getHttpServer())
      .patch(`/api/v1/submissions/${first.id}`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-edit`)
      .send({
        categoryId,
        version: changes.body.version,
        declaredMetadata: { name: 'resubmitted', termsAcknowledged: true },
      });
    expect(edit.status).toBe(200);
    const resubmit = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${first.id}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-resubmit`)
      .send({ version: edit.body.version });
    expect(resubmit.status).toBe(201);
    const resumed = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${first.id}/claim`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-reclaim`)
      .send({});
    expect(resumed.status).toBe(201);
    const approve = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${first.id}/approve`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-approve`)
      .send({ reasonCode: 'EVIDENCE_COMPLETE' });
    expect(approve.status).toBe(201);
    expect(approve.body.status).toBe('APPROVED');
    const replay = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${first.id}/approve`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-approve`)
      .send({ reasonCode: 'EVIDENCE_COMPLETE' });
    expect(replay.body).toEqual(approve.body);
    const terminalEdit = await request(h.app.getHttpServer())
      .patch(`/api/v1/submissions/${first.id}`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-terminal-edit`)
      .send({ categoryId, version: approve.body.version });
    expect(terminalEdit.status).toBe(409);
    expect(
      await h.db.auditEvent.count({
        where: {
          actorUserId: reviewer.id,
          action: 'SUBMISSION_APPROVED',
          resourceId: first.id,
        },
      }),
    ).toBe(1);
    expect(
      await h.db.outboxEvent.count({
        where: {
          eventType: {
            in: ['submission.changesrequested', 'submission.approved'],
          },
        },
      }),
    ).toBe(2);
    const conflict = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${first.id}/approve`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-approve`)
      .send({ reasonCode: 'DIFFERENT_REASON' });
    expect(conflict.status).toBe(409);
  });
  it('rejects terminally and permits cancel only before review', async () => {
    const rejected = await submittedDraft('reject');
    await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${rejected.id}/claim`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-reject-claim`)
      .send({});
    const decision = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${rejected.id}/reject`)
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp)
      .set('idempotency-key', `${h.runId}-reject`)
      .send({ reasonCode: 'EVIDENCE_REJECTED' });
    expect(decision.status).toBe(201);
    expect(decision.body.status).toBe('REJECTED');
    const draft = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-cancel-draft`)
      .send({
        categoryId,
        declaredMetadata: { name: 'self-submission', termsAcknowledged: true },
      });
    const cancel = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${draft.body.id}/cancel`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-cancel`)
      .send({ version: 1 });
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe('CANCELLED');
  });

  it('allows exactly one reviewer to claim and never permits a reviewer to review their own submission', async () => {
    const submitted = await submittedDraft('claim-race');
    const [firstClaim, secondClaim] = await Promise.all([
      request(h.app.getHttpServer())
        .post(`/api/v1/reviews/submissions/${submitted.id}/claim`)
        .set('authorization', reviewer.auth)
        .set('x-forwarded-for', reviewer.clientIp)
        .set('idempotency-key', `${h.runId}-race-a`)
        .send({}),
      request(h.app.getHttpServer())
        .post(`/api/v1/reviews/submissions/${submitted.id}/claim`)
        .set('authorization', competingReviewer.auth)
        .set('x-forwarded-for', competingReviewer.clientIp)
        .set('idempotency-key', `${h.runId}-race-b`)
        .send({}),
    ]);
    expect([firstClaim.status, secondClaim.status].sort()).toEqual([201, 409]);
    expect(
      await h.db.verificationReview.count({
        where: { submissionId: submitted.id, status: 'CLAIMED' },
      }),
    ).toBe(1);

    await h.db.roleAssignment.create({
      data: {
        id: `${h.runId}-owner-reviewer-role`,
        userId: owner.id,
        role: 'ASSET_REVIEWER',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    const ownDraft = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-self-draft`)
      .send({
        categoryId,
        declaredMetadata: { name: 'self-submission', termsAcknowledged: true },
      });
    expect(ownDraft.status).toBe(201);
    await h.db.submissionMedia.createMany({
      data: REQUIRED_MEDIA_SLOTS.map((slot) => ({
        id: `${h.runId}-self-${slot}`,
        submissionId: ownDraft.body.id,
        slot,
        objectKey: `${h.runId}/self/${slot}`,
        originalFilename: `${slot}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        sha256: (slot === 'front' ? 'c' : 'd').repeat(64),
        status: 'SAFE',
      })),
    });
    const ownSubmit = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${ownDraft.body.id}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-self-submit`)
      .send({ version: 1 });
    expect(ownSubmit.status).toBe(201);
    const selfClaim = await request(h.app.getHttpServer())
      .post(`/api/v1/reviews/submissions/${ownDraft.body.id}/claim`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-self-claim`)
      .send({});
    expect(selfClaim.status).toBe(403);
  });
});
