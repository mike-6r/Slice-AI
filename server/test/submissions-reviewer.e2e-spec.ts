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
  let autoQualifiedId: string | null = null;
  let collectorActionId: string | null = null;
  let autoQualifiedAssetId: string | null = null;
  let autoQualificationLocationId: string | null = null;
  let autoQualificationGradeId: string | null = null;
  let autoQualificationCompanyId: string | null = null;
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
  afterAll(async () => {
    const qualifiedSubmissionIds = [autoQualifiedId, collectorActionId].filter(
      (submissionId): submissionId is string => Boolean(submissionId),
    );
    if (qualifiedSubmissionIds.length) {
      const runIds = (
        await h.db.qualificationRun.findMany({
          where: { submissionId: { in: qualifiedSubmissionIds } },
          select: { id: true },
        })
      ).map((run) => run.id);
      if (runIds.length)
        await h.db.qualificationCheck.deleteMany({
          where: { runId: { in: runIds } },
        });
      await h.db.qualificationRun.deleteMany({
        where: { submissionId: { in: qualifiedSubmissionIds } },
      });
      await h.db.submissionIntake.deleteMany({
        where: { submissionId: { in: qualifiedSubmissionIds } },
      });
      await h.db.gradingCertificationVerification.deleteMany({
        where: { submissionId: { in: qualifiedSubmissionIds } },
      });
      await h.db.gradingCertificationClaim.deleteMany({
        where: { submissionId: { in: qualifiedSubmissionIds } },
      });
      if (autoQualifiedAssetId) {
        const preSale = await h.db.preSale.findUnique({
          where: { assetId: autoQualifiedAssetId },
          select: { id: true },
        });
        if (preSale)
          await h.db.preSaleAuditEvent.deleteMany({
            where: { preSaleId: preSale.id },
          });
        await h.db.preSale.deleteMany({
          where: { assetId: autoQualifiedAssetId },
        });
        await h.db.initialOffering.deleteMany({
          where: { assetId: autoQualifiedAssetId },
        });
        await h.db.assetSubmission.updateMany({
          where: { id: { in: qualifiedSubmissionIds } },
          data: { assetId: null, gradeScaleEntryId: null },
        });
        await h.db.asset.delete({ where: { id: autoQualifiedAssetId } });
      } else
        await h.db.assetSubmission.updateMany({
          where: { id: { in: qualifiedSubmissionIds } },
          data: { gradeScaleEntryId: null },
        });
    }
    if (autoQualificationLocationId)
      await h.db.vaultIntakeLocation.delete({
        where: { id: autoQualificationLocationId },
      });
    if (autoQualificationGradeId)
      await h.db.gradeScaleEntry.delete({
        where: { id: autoQualificationGradeId },
      });
    if (autoQualificationCompanyId)
      await h.db.gradingCompany.delete({
        where: { id: autoQualificationCompanyId },
      });
    await closeSubmissionHarness(
      h,
      [owner.id, reviewer.id, secondReviewer.id],
      categoryId,
    );
  });
  it('queues, claims, requests changes, audits and notifies without exposing notes', async () => {
    const submit = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${id}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-submit`)
      .send({ version: 1 });
    expect(submit.status).toBe(201);
    const fixtureId = `${h.runId}-retired-staging-fixture`;
    await h.db.assetSubmission.create({
      data: {
        id: fixtureId,
        ownerUserId: owner.id,
        categoryId,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        declaredMetadata: {
          name: 'Retired staging fixture',
          certificationNumber: 'STG-QUEUE-EXCLUSION',
          betaFixtureRetired: true,
        },
      },
    });
    const queue = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions')
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((x: { id: string }) => x.id)).toContain(id);
    expect(queue.body.items.map((x: { id: string }) => x.id)).not.toContain(
      fixtureId,
    );
    const queueIncludingDemo = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions?testFixture=include')
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(queueIncludingDemo.status).toBe(200);
    expect(
      queueIncludingDemo.body.items.map((x: { id: string }) => x.id),
    ).toEqual(expect.arrayContaining([id, fixtureId]));
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
      reviewStatus: 'AWAITING_REVIEWER',
      primaryIncompleteRequiredCheck: null,
      nextAction: 'CLAIM_REVIEW',
      nextActionReason: 'Start review to begin the required checks.',
      readyForDecision: false,
      decisionBlockers: [],
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

  it('runs qualification from the Collector submit endpoint and keeps non-review outcomes out of the staff queue', async () => {
    const company = await h.db.gradingCompany.create({
      data: {
        code: 'PSA',
        name: 'Professional Sports Authenticator',
        displayName: 'PSA',
      },
    });
    autoQualificationCompanyId = company.id;
    const grade = await h.db.gradeScaleEntry.create({
      data: {
        companyId: company.id,
        grade: '10.00',
        label: '10',
        scaleVersion: 'test-v1',
      },
    });
    autoQualificationGradeId = grade.id;
    const location = await h.db.vaultIntakeLocation.create({
      data: {
        displayName: `${h.runId} qualification intake`,
        region: 'Test region',
        countryCode: 'GB',
        operationallyApproved: true,
        environment: 'test',
        acceptingShipments: true,
        acceptedCategories: [categoryId],
        shippingInstructions: 'Use the test shipping instructions.',
        customerSafeAddress: 'Test intake address',
      },
    });
    autoQualificationLocationId = location.id;
    const metadata = {
      name: 'Clean PSA qualification card',
      year: '2025',
      set: 'Qualification test set',
      cardNumber: 'QA-10',
      grader: 'PSA',
      grade: '10',
      certificationNumber: 'QA-PSA-10',
      inPossession: true,
      termsAcknowledged: true,
      marketCheckStatus: 'FOUND',
      marketCheckAcknowledged: true,
      offerIntentPercent: '25',
      collectorExpectedValueMinor: '100000',
      collectorExpectedCurrency: 'GBP',
      collectorExpectedSupply: '1000',
    };
    const draft = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-qualified-draft`)
      .send({
        categoryId,
        gradeScaleEntryId: grade.id,
        preferredIntakeLocationId: location.id,
        preferredDeliveryMethod: 'SHIPMENT',
        declaredMetadata: metadata,
    });
    expect(draft.status).toBe(201);
    autoQualifiedId = draft.body.id;
    const submissionId = autoQualifiedId!;
    await h.db.submissionMedia.createMany({
      data: [...REQUIRED_MEDIA_SLOTS, 'grading-label'].map((slot, index) => ({
        id: `${h.runId}-qualified-${slot}`,
        submissionId,
        slot,
        objectKey: `${h.runId}/qualified/${slot}`,
        originalFilename: `${slot}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 42,
        sha256: String(index + 1).repeat(64),
        status: 'SAFE',
      })),
    });
    await h.db.gradingCertificationVerification.create({
      data: {
        id: `${h.runId}-qualified-certification`,
        submissionId,
        requestedByUserId: owner.id,
        companyCode: 'PSA',
        certificationNumber: metadata.certificationNumber,
        normalizedCertificationNumber: metadata.certificationNumber,
        status: 'VERIFIED',
        verificationMode: 'TEST_PROVIDER',
        verifiedGrade: '10.00',
        verifiedCard: { name: metadata.name, cardNumber: metadata.cardNumber },
        verifiedAt: new Date(),
      },
    });
    const submitted = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${submissionId}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-qualified-submit`)
      .send({ version: draft.body.version });
    expect(submitted.status).toBe(201);
    expect(submitted.body).toMatchObject({
      status: 'APPROVED',
      qualification: {
        outcome: 'AUTO_QUALIFIED',
        customerStatus: 'PRE_SALE_QUALIFIED',
      },
    });
    const persisted = await h.db.assetSubmission.findUniqueOrThrow({
      where: { id: submissionId },
    });
    const qualificationRuns = await h.db.qualificationRun.findMany({
      where: { submissionId },
      include: { checks: true },
    });
    autoQualifiedAssetId = persisted.assetId;
    expect(persisted.decisionCode).toBe('AUTO_QUALIFIED');
    expect(qualificationRuns).toHaveLength(1);
    expect(qualificationRuns[0]).toMatchObject({
      trigger: 'SUBMISSION_SUBMITTED',
      status: 'COMPLETED',
      outcome: 'AUTO_QUALIFIED',
    });
    expect(
      qualificationRuns[0]?.checks.find(
        (check) => check.code === 'POSSESSION_CONFIRMED',
      ),
    ).toMatchObject({ result: 'PASS' });
    expect(
      await h.db.verificationReview.count({
        where: { submissionId },
      }),
    ).toBe(0);
    expect(
      await h.db.submissionIntake.findUnique({
        where: { submissionId },
      }),
    ).toMatchObject({ vaultId: location.id, deliveryMethod: 'SHIPMENT' });
    expect(
      await h.db.preSale.findUnique({
        where: { assetId: autoQualifiedAssetId! },
      }),
    ).toMatchObject({ status: 'ACTIVE', physicalStatus: 'AWAITING_INTAKE' });
    const replay = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${submissionId}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-qualified-submit`)
      .send({ version: draft.body.version });
    expect(replay.body).toEqual(submitted.body);
    const queue = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions')
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((item: { id: string }) => item.id)).not.toContain(
      submissionId,
    );

    const collectorActionDraft = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-collector-action-draft`)
      .send({
        categoryId,
        gradeScaleEntryId: grade.id,
        preferredIntakeLocationId: location.id,
        preferredDeliveryMethod: 'SHIPMENT',
        declaredMetadata: {
          ...metadata,
          name: 'Possession confirmation required',
          cardNumber: 'QA-POSSESSION',
          certificationNumber: 'QA-PSA-POSSESSION',
          inPossession: false,
        },
      });
    expect(collectorActionDraft.status).toBe(201);
    collectorActionId = collectorActionDraft.body.id;
    const collectorActionSubmissionId = collectorActionId!;
    await h.db.submissionMedia.createMany({
      data: [...REQUIRED_MEDIA_SLOTS, 'grading-label'].map((slot, index) => ({
        id: `${h.runId}-collector-action-${slot}`,
        submissionId: collectorActionSubmissionId,
        slot,
        objectKey: `${h.runId}/collector-action/${slot}`,
        originalFilename: `${slot}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 42,
        sha256: String(index + 5).repeat(64),
        status: 'SAFE',
      })),
    });
    await h.db.gradingCertificationVerification.create({
      data: {
        id: `${h.runId}-collector-action-certification`,
        submissionId: collectorActionSubmissionId,
        requestedByUserId: owner.id,
        companyCode: 'PSA',
        certificationNumber: 'QA-PSA-POSSESSION',
        normalizedCertificationNumber: 'QA-PSA-POSSESSION',
        status: 'VERIFIED',
        verificationMode: 'TEST_PROVIDER',
        verifiedGrade: '10.00',
        verifiedCard: { name: 'Possession confirmation required', cardNumber: 'QA-POSSESSION' },
        verifiedAt: new Date(),
      },
    });
    const collectorActionSubmission = await request(h.app.getHttpServer())
      .post(`/api/v1/submissions/${collectorActionSubmissionId}/submit`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', `${h.runId}-collector-action-submit`)
      .send({ version: collectorActionDraft.body.version });
    expect(collectorActionSubmission.status).toBe(201);
    expect(collectorActionSubmission.body.qualification).toMatchObject({
      outcome: 'COLLECTOR_ACTION_REQUIRED',
      customerStatus: 'NEEDS_YOUR_ACTION',
    });
    const queueAfterCollectorAction = await request(h.app.getHttpServer())
      .get('/api/v1/reviews/submissions')
      .set('authorization', reviewer.auth)
      .set('x-forwarded-for', reviewer.clientIp);
    expect(
      queueAfterCollectorAction.body.items.map((item: { id: string }) => item.id),
    ).not.toContain(collectorActionSubmissionId);
  });
});
