import * as request from 'supertest';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 011 lifecycle HTTP E2E', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let owner: Awaited<ReturnType<typeof signup>>;
  let operator: Awaited<ReturnType<typeof signup>>;
  let other: Awaited<ReturnType<typeof signup>>;
  let assetId: string;
  let assetSlug: string;

  const idempotency = (suffix: string) => `${h.runId}-${suffix}`;

  beforeAll(async () => {
    h = await bootSubmissionHarness('lifecycle');
    categoryId = await createCategory(h);
    owner = await signup(h, 'lifecycle-owner', 61);
    operator = await signup(h, 'lifecycle-operator', 62);
    other = await signup(h, 'lifecycle-other', 63);
    await h.db.roleAssignment.createMany({
      data: [
        {
          id: `${h.runId}-vault-role`,
          userId: operator.id,
          role: 'VAULT_OPERATOR',
          scopeType: 'GLOBAL',
          scopeId: '*',
        },
        {
          id: `${h.runId}-compliance-role`,
          userId: operator.id,
          role: 'COMPLIANCE_ANALYST',
          scopeType: 'GLOBAL',
          scopeId: '*',
        },
      ],
    });
    assetId = `${h.runId}-asset`;
    assetSlug = `${h.runId}-asset`;
    await h.db.asset.create({
      data: {
        id: assetId,
        publicId: `ast_${h.runId.replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`,
        slug: assetSlug,
        title: 'Lifecycle E2E fixture',
        categoryId,
      },
    });
    await h.db.assetSubmission.create({
      data: {
        id: `${h.runId}-approved-submission`,
        ownerUserId: owner.id,
        assetId,
        categoryId,
        status: 'APPROVED',
      },
    });
  });

  afterAll(async () => {
    await h.db.auditEvent.deleteMany({ where: { resourceId: assetId } });
    await h.db.notification.deleteMany({ where: { resourceId: assetId } });
    await h.db.valuationEvidence.deleteMany({ where: { assetId } });
    await h.db.valuationDecision.deleteMany({ where: { assetId } });
    await h.db.insuranceCoverage.deleteMany({ where: { assetId } });
    await h.db.custodyEvent.deleteMany({ where: { assetId } });
    await h.db.assetPublication.deleteMany({ where: { assetId } });
    await h.db.vaultCustodyRecord.deleteMany({ where: { assetId } });
    await h.db.assetSubmission.deleteMany({ where: { assetId } });
    await h.db.asset.deleteMany({ where: { id: assetId } });
    await closeSubmissionHarness(
      h,
      [owner.id, operator.id, other.id],
      categoryId,
    );
  });

  it('keeps seller lifecycle status authenticated, owner-scoped, and safe', async () => {
    const unauthenticated = await request(h.app.getHttpServer()).get(
      `/api/v1/assets/${assetId}/lifecycle`,
    );
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['x-request-id']).toBeDefined();

    const crossUser = await request(h.app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/lifecycle`)
      .set('authorization', other.auth)
      .set('x-forwarded-for', other.clientIp);
    expect(crossUser.status).toBe(404);

    const own = await request(h.app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/lifecycle`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp);
    expect(own.status).toBe(200);
    expect(own.body).toEqual({
      publication: null,
      custody: null,
      insurance: { status: 'UNAVAILABLE', expiresAt: null },
    });
    expect(JSON.stringify(own.body)).not.toMatch(
      /provider|facility|policy|certification|sourceRef/i,
    );
  });

  it('exposes only a bounded, authorized staff lifecycle discovery projection', async () => {
    const customer = await request(h.app.getHttpServer())
      .get('/api/v1/admin/assets/operations')
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp);
    expect(customer.status).toBe(403);

    const staff = await request(h.app.getHttpServer())
      .get('/api/v1/admin/assets/operations?limit=10')
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp);
    expect(staff.status).toBe(200);
    expect(staff.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: assetId,
          title: 'Lifecycle E2E fixture',
          valuationStatus: 'MISSING',
          custodyStatus: 'MISSING',
          coverageStatus: 'MISSING',
        }),
      ]),
    );
    expect(JSON.stringify(staff.body)).not.toMatch(
      /providerRef|facility|policyRef|reviewerId|objectKey|scanner/i,
    );
  });

  it('enforces privileged intake and provides deterministic blocked readiness', async () => {
    const denied = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/handoff`)
      .set('authorization', owner.auth)
      .set('x-forwarded-for', owner.clientIp)
      .set('idempotency-key', idempotency('denied-handoff'))
      .send({});
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const first = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/handoff`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp)
      .set('idempotency-key', idempotency('handoff'))
      .send({});
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ assetId, custodyStatus: 'EXPECTED' });

    const replay = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/handoff`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp)
      .set('idempotency-key', idempotency('handoff'))
      .send({});
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(
      await h.db.notification.count({
        where: {
          userId: owner.id,
          resourceId: assetId,
          type: 'LIFECYCLE_HANDOFF',
        },
      }),
    ).toBe(1);

    const readiness = await request(h.app.getHttpServer())
      .get(`/api/v1/admin/assets/${assetId}/publication-readiness`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp);
    expect(readiness.status).toBe(200);
    expect(readiness.body.status).toBe('BLOCKED');
    expect(readiness.body.blockingCodes).toEqual(
      expect.arrayContaining([
        'CUSTODY_NOT_SECURED',
        'VALUATION_REQUIRED',
        'ACTIVE_COVERAGE_REQUIRED',
      ]),
    );

    const blocked = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/publish`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp)
      .set('idempotency-key', idempotency('blocked-publish'))
      .send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PUBLICATION_BLOCKED');
    expect(blocked.headers['x-request-id']).toBeDefined();
    expect(await h.db.assetPublication.count({ where: { assetId } })).toBe(0);
  });

  it('records the lifecycle once, publishes atomically, and exposes only safe public claims', async () => {
    const transition = async (toStatus: string, key: string) =>
      request(h.app.getHttpServer())
        .post(`/api/v1/admin/assets/${assetId}/custody/transitions`)
        .set('authorization', operator.auth)
        .set('x-forwarded-for', operator.clientIp)
        .set('idempotency-key', idempotency(key))
        .send({ toStatus, providerRef: `${h.runId}-custody-${toStatus}` });

    expect((await transition('RECEIVED', 'received')).status).toBe(201);
    const invalidTransition = await transition('SECURED', 'invalid-transition');
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code).toBe(
      'CUSTODY_TRANSITION_INVALID',
    );
    const custodyConflict = await transition('INSPECTED', 'received');
    expect(custodyConflict.status).toBe(409);
    expect(custodyConflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect((await transition('INSPECTED', 'inspected')).status).toBe(201);

    const valuation = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/valuations/decisions`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp)
      .set('idempotency-key', idempotency('valuation'))
      .send({
        valueMinor: '120000',
        currency: 'GBP',
        confidence: 80,
        methodologyCode: 'MANUAL',
        sourceType: 'MANUAL',
      });
    expect(valuation.status).toBe(201);
    expect(valuation.body.valuation.amount).toBe('120000');

    const coverage = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/insurance/coverage`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp)
      .set('idempotency-key', idempotency('coverage'))
      .send({
        insuredValueMinor: '120000',
        currency: 'GBP',
        status: 'ACTIVE',
        effectiveAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(coverage.status).toBe(201);

    expect((await transition('SECURED', 'secured')).status).toBe(201);

    const ready = await request(h.app.getHttpServer())
      .get(`/api/v1/admin/assets/${assetId}/publication-readiness`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp);
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({
      assetId,
      status: 'READY',
      blockingCodes: [],
    });

    const firstPublish = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/publish`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp)
      .set('idempotency-key', idempotency('publish'))
      .send({});
    expect(firstPublish.status).toBe(201);
    expect(firstPublish.body.status).toBe('PUBLISHED');

    const publicationAuditCount = await h.db.auditEvent.count({
      where: { resourceId: assetId, action: 'ASSET_PUBLISHED' },
    });
    const publicationNotificationCount = await h.db.notification.count({
      where: {
        userId: owner.id,
        resourceId: assetId,
        type: 'LIFECYCLE_PUBLISHED',
      },
    });
    const replay = await request(h.app.getHttpServer())
      .post(`/api/v1/admin/assets/${assetId}/publish`)
      .set('authorization', operator.auth)
      .set('x-forwarded-for', operator.clientIp)
      .set('idempotency-key', idempotency('publish'))
      .send({});
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(firstPublish.body);
    expect(
      await h.db.auditEvent.count({
        where: { resourceId: assetId, action: 'ASSET_PUBLISHED' },
      }),
    ).toBe(publicationAuditCount);
    expect(
      await h.db.notification.count({
        where: {
          userId: owner.id,
          resourceId: assetId,
          type: 'LIFECYCLE_PUBLISHED',
        },
      }),
    ).toBe(publicationNotificationCount);

    const market = await request(h.app.getHttpServer())
      .get('/api/v1/market/assets')
      .query({ category: categoryId, sort: 'title' });
    expect(market.status).toBe(200);
    const published = market.body.items.find(
      (item: { slug: string }) => item.slug === assetSlug,
    );
    expect(published).toMatchObject({
      publication: { status: 'PUBLISHED' },
      custody: { status: 'SECURED' },
      insurance: { status: 'ACTIVE' },
    });
    expect(JSON.stringify(published)).not.toMatch(
      /provider|facility|policy|certification|sourceRef/i,
    );

    await h.db.session.updateMany({
      where: { userId: operator.id, revokedAt: null },
      data: { authenticatedAt: new Date(Date.now() - 86_400_000) },
    });
    const stale = await transition('RELEASE_PENDING', 'stale-recent-auth');
    expect(stale.status).toBe(403);
    expect(stale.body.error.code).toBe('RECENT_AUTH_REQUIRED');
  });

  it('serializes concurrent initial publication without duplicate side effects', async () => {
    const concurrentAssetId = `${h.runId}-concurrent-asset`;
    const concurrentSlug = `${h.runId}-concurrent-asset`;
    const now = new Date();
    await h.db.asset.create({
      data: {
        id: concurrentAssetId,
        publicId: `ast_${h.runId.replace(/[^a-zA-Z0-9]/g, '').slice(-16)}c`,
        slug: concurrentSlug,
        title: 'Concurrent publication fixture',
        categoryId,
      },
    });
    await h.db.assetSubmission.create({
      data: {
        id: `${h.runId}-concurrent-submission`,
        ownerUserId: owner.id,
        assetId: concurrentAssetId,
        categoryId,
        status: 'APPROVED',
      },
    });
    const custody = await h.db.vaultCustodyRecord.create({
      data: {
        id: `${h.runId}-concurrent-custody`,
        assetId: concurrentAssetId,
        providerCode: 'MANUAL_UNVERIFIED',
        status: 'SECURED',
        securedAt: now,
      },
    });
    await h.db.custodyEvent.create({
      data: {
        id: `${h.runId}-concurrent-custody-event`,
        assetId: concurrentAssetId,
        custodyRecordId: custody.id,
        toStatus: 'SECURED',
        occurredAt: now,
      },
    });
    await h.db.valuationDecision.create({
      data: {
        id: `${h.runId}-concurrent-valuation`,
        assetId: concurrentAssetId,
        valueMinor: 150000n,
        currency: 'GBP',
        confidence: 90,
        methodologyCode: 'MANUAL',
        decidedByUserId: operator.id,
        decidedAt: now,
      },
    });
    await h.db.insuranceCoverage.create({
      data: {
        id: `${h.runId}-concurrent-coverage`,
        assetId: concurrentAssetId,
        providerCode: 'MANUAL_UNVERIFIED',
        insuredValueMinor: 150000n,
        currency: 'GBP',
        status: 'ACTIVE',
        effectiveAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    await h.db.session.updateMany({
      where: { userId: operator.id, revokedAt: null },
      data: { authenticatedAt: new Date() },
    });

    const publish = (key: string) =>
      request(h.app.getHttpServer())
        .post(`/api/v1/admin/assets/${concurrentAssetId}/publish`)
        .set('authorization', operator.auth)
        .set('x-forwarded-for', operator.clientIp)
        .set('idempotency-key', idempotency(key))
        .send({});
    const [first, second] = await Promise.all([
      publish('concurrent-publish-a'),
      publish('concurrent-publish-b'),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.status).toBe('PUBLISHED');
    expect(second.body.status).toBe('PUBLISHED');
    expect(first.body.publishedAt).toBe(second.body.publishedAt);
    expect(
      await h.db.assetPublication.count({
        where: { assetId: concurrentAssetId },
      }),
    ).toBe(1);
    expect(
      await h.db.auditEvent.count({
        where: { resourceId: concurrentAssetId, action: 'ASSET_PUBLISHED' },
      }),
    ).toBe(1);
    expect(
      await h.db.notification.count({
        where: {
          userId: owner.id,
          resourceId: concurrentAssetId,
          type: 'LIFECYCLE_PUBLISHED',
        },
      }),
    ).toBe(1);

    await h.db.auditEvent.deleteMany({
      where: { resourceId: concurrentAssetId },
    });
    await h.db.notification.deleteMany({
      where: { resourceId: concurrentAssetId },
    });
    await h.db.valuationDecision.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await h.db.insuranceCoverage.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await h.db.custodyEvent.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await h.db.assetPublication.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await h.db.vaultCustodyRecord.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await h.db.assetSubmission.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await h.db.asset.deleteMany({ where: { id: concurrentAssetId } });
  });
});
