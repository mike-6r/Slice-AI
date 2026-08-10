import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../app.module';
import { createApp } from '../create-app';
import { PrismaService } from '../database/prisma.service';

type SignedIn = { id: string; accessToken: string; ip: string };

const runId = `manual-lifecycle-${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Manual lifecycle QA failed: ${message}`);
}

async function main() {
  if (!process.env.TEST_DATABASE_URL || !process.env.REDIS_URL) {
    throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    JWT_ACCESS_SECRET:
      process.env.JWT_ACCESS_SECRET ??
      'test-only-secret-that-is-long-enough-for-hs256',
    COOKIE_SECURE: 'false',
    TRUST_PROXY_HOPS: '1',
  });

  const app = await createApp(AppModule);
  await app.listen(0, '127.0.0.1');
  const db = app.get(PrismaService);
  const port = (
    app.getHttpServer() as unknown as { address(): AddressInfo }
  ).address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const categoryId = `${runId}-category`;
  const assetId = `${runId}-asset`;
  const assetSlug = `${runId}-asset`;
  const concurrentAssetId = `${runId}-concurrent-asset`;
  const userIds: string[] = [];

  const call = async (
    path: string,
    options: {
      accessToken?: string;
      ip?: string;
      key?: string;
      body?: Record<string, unknown>;
    } = {},
  ) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.body ? 'POST' : 'GET',
      headers: {
        ...(options.accessToken
          ? { authorization: `Bearer ${options.accessToken}` }
          : {}),
        ...(options.ip ? { 'x-forwarded-for': options.ip } : {}),
        ...(options.key ? { 'idempotency-key': options.key } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = (await response.json()) as Record<string, unknown>;
    return { response, body };
  };
  const signUp = async (label: string, ip: string): Promise<SignedIn> => {
    const response = await call('/auth/signup', {
      ip,
      key: `${runId}-${label}-signup`,
      body: {
        email: `${runId}-${label}@example.test`,
        password: 'a sufficiently strong password',
        displayName: label,
      },
    });
    assert(
      response.response.status === 201,
      `${label} signup returned ${response.response.status}`,
    );
    const user = response.body.user as { id: string };
    userIds.push(user.id);
    return {
      id: user.id,
      accessToken: response.body.accessToken as string,
      ip,
    };
  };

  try {
    await db.$queryRaw`SELECT 1`;
    await db.category.create({
      data: { id: categoryId, slug: categoryId, name: 'Manual lifecycle QA' },
    });
    const owner = await signUp('owner', '198.51.100.211');
    const operator = await signUp('operator', '198.51.100.212');
    const other = await signUp('other', '198.51.100.213');
    await db.roleAssignment.createMany({
      data: [
        {
          id: `${runId}-vault-role`,
          userId: operator.id,
          role: 'VAULT_OPERATOR',
          scopeType: 'GLOBAL',
          scopeId: '*',
        },
        {
          id: `${runId}-compliance-role`,
          userId: operator.id,
          role: 'COMPLIANCE_ANALYST',
          scopeType: 'GLOBAL',
          scopeId: '*',
        },
      ],
    });
    await db.asset.create({
      data: {
        id: assetId,
        publicId: `ast_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`,
        slug: assetSlug,
        title: 'Manual lifecycle fixture',
        categoryId,
      },
    });
    await db.assetSubmission.create({
      data: {
        id: `${runId}-approved-submission`,
        ownerUserId: owner.id,
        assetId,
        categoryId,
        status: 'APPROVED',
      },
    });

    const denied = await call(`/admin/assets/${assetId}/handoff`, {
      accessToken: owner.accessToken,
      ip: owner.ip,
      key: `${runId}-permission-denied`,
      body: {},
    });
    assert(denied.response.status === 403, 'seller handoff was not denied');
    const handoff = await call(`/admin/assets/${assetId}/handoff`, {
      accessToken: operator.accessToken,
      ip: operator.ip,
      key: `${runId}-handoff`,
      body: {},
    });
    assert(handoff.response.status === 201, 'handoff did not succeed');
    const blocked = await call(`/admin/assets/${assetId}/publish`, {
      accessToken: operator.accessToken,
      ip: operator.ip,
      key: `${runId}-blocked-publish`,
      body: {},
    });
    assert(
      blocked.response.status === 409,
      'premature publication was not blocked',
    );
    assert(
      (await db.asset.findUniqueOrThrow({ where: { id: assetId } })).status !==
        'PUBLISHED',
      'blocked publication changed asset state',
    );
    const invalid = await call(`/admin/assets/${assetId}/custody/transitions`, {
      accessToken: operator.accessToken,
      ip: operator.ip,
      key: `${runId}-invalid-custody`,
      body: { toStatus: 'SECURED' },
    });
    assert(
      invalid.response.status === 409,
      'invalid custody transition was accepted',
    );
    for (const status of ['RECEIVED', 'INSPECTED', 'SECURED']) {
      const transition = await call(
        `/admin/assets/${assetId}/custody/transitions`,
        {
          accessToken: operator.accessToken,
          ip: operator.ip,
          key: `${runId}-custody-${status}`,
          body: { toStatus: status },
        },
      );
      assert(transition.response.status === 201, `${status} transition failed`);
    }
    const valuation = await call(
      `/admin/assets/${assetId}/valuations/decisions`,
      {
        accessToken: operator.accessToken,
        ip: operator.ip,
        key: `${runId}-valuation`,
        body: {
          valueMinor: '120000',
          currency: 'GBP',
          confidence: 80,
          methodologyCode: 'MANUAL',
          sourceType: 'MANUAL',
        },
      },
    );
    assert(valuation.response.status === 201, 'valuation decision failed');
    const insurance = await call(
      `/admin/assets/${assetId}/insurance/coverage`,
      {
        accessToken: operator.accessToken,
        ip: operator.ip,
        key: `${runId}-coverage`,
        body: {
          insuredValueMinor: '120000',
          currency: 'GBP',
          status: 'ACTIVE',
          effectiveAt: new Date(Date.now() - 60_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    );
    assert(insurance.response.status === 201, 'insurance coverage failed');
    const ready = await call(`/admin/assets/${assetId}/publication-readiness`, {
      accessToken: operator.accessToken,
      ip: operator.ip,
    });
    assert(
      ready.response.status === 200 && ready.body.status === 'READY',
      'readiness was not READY',
    );
    const publish = await call(`/admin/assets/${assetId}/publish`, {
      accessToken: operator.accessToken,
      ip: operator.ip,
      key: `${runId}-publish`,
      body: {},
    });
    assert(publish.response.status === 201, 'publication failed');
    const replay = await call(`/admin/assets/${assetId}/publish`, {
      accessToken: operator.accessToken,
      ip: operator.ip,
      key: `${runId}-publish`,
      body: {},
    });
    assert(
      replay.response.status === 201 &&
        replay.body.publishedAt === publish.body.publishedAt,
      'publication replay was not stable',
    );
    const market = await call(
      `/market/assets?category=${encodeURIComponent(categoryId)}&sort=title`,
    );
    assert(
      market.response.status === 200,
      'market read did not expose published asset',
    );
    const published = (
      market.body.items as Array<Record<string, unknown>>
    ).find((item) => item.slug === assetSlug);
    assert(
      published?.publication && published.custody && published.insurance,
      'safe lifecycle claims missing',
    );
    assert(
      !/provider|facility|policy|certification|sourceRef/i.test(
        JSON.stringify(published),
      ),
      'private lifecycle data leaked',
    );
    const seller = await call(`/assets/${assetId}/lifecycle`, {
      accessToken: owner.accessToken,
      ip: owner.ip,
    });
    assert(seller.response.status === 200, 'seller lifecycle read failed');
    const crossUser = await call(`/assets/${assetId}/lifecycle`, {
      accessToken: other.accessToken,
      ip: other.ip,
    });
    assert(
      crossUser.response.status === 404,
      'cross-user lifecycle read was not denied',
    );
    await db.session.updateMany({
      where: { userId: operator.id, revokedAt: null },
      data: { authenticatedAt: new Date(Date.now() - 86_400_000) },
    });
    const stale = await call(`/admin/assets/${assetId}/custody/transitions`, {
      accessToken: operator.accessToken,
      ip: operator.ip,
      key: `${runId}-stale`,
      body: { toStatus: 'RELEASE_PENDING' },
    });
    assert(
      stale.response.status === 403,
      'stale recent authentication was accepted',
    );
    assert(
      (await db.auditEvent.count({
        where: { resourceId: assetId, action: 'ASSET_PUBLISHED' },
      })) === 1,
      'publication audit was duplicated',
    );
    assert(
      (await db.notification.count({
        where: {
          userId: owner.id,
          resourceId: assetId,
          type: 'LIFECYCLE_PUBLISHED',
        },
      })) === 1,
      'publication notification was duplicated',
    );
    await db.session.updateMany({
      where: { userId: operator.id, revokedAt: null },
      data: { authenticatedAt: new Date() },
    });
    const now = new Date();
    await db.asset.create({
      data: {
        id: concurrentAssetId,
        publicId: `ast_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(-16)}c`,
        slug: `${runId}-concurrent-asset`,
        title: 'Concurrent publication fixture',
        categoryId,
      },
    });
    await db.assetSubmission.create({
      data: {
        id: `${runId}-concurrent-submission`,
        ownerUserId: owner.id,
        assetId: concurrentAssetId,
        categoryId,
        status: 'APPROVED',
      },
    });
    await db.vaultCustodyRecord.create({
      data: {
        id: `${runId}-concurrent-custody`,
        assetId: concurrentAssetId,
        providerCode: 'MANUAL_UNVERIFIED',
        status: 'SECURED',
        securedAt: now,
      },
    });
    await db.valuationDecision.create({
      data: {
        id: `${runId}-concurrent-valuation`,
        assetId: concurrentAssetId,
        valueMinor: 120000n,
        currency: 'GBP',
        confidence: 80,
        methodologyCode: 'MANUAL',
        decidedByUserId: operator.id,
        decidedAt: now,
      },
    });
    await db.insuranceCoverage.create({
      data: {
        id: `${runId}-concurrent-coverage`,
        assetId: concurrentAssetId,
        providerCode: 'MANUAL_UNVERIFIED',
        insuredValueMinor: 120000n,
        currency: 'GBP',
        status: 'ACTIVE',
        effectiveAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    const [concurrentFirst, concurrentSecond] = await Promise.all(
      ['a', 'b'].map((suffix) =>
        call(`/admin/assets/${concurrentAssetId}/publish`, {
          accessToken: operator.accessToken,
          ip: operator.ip,
          key: `${runId}-concurrent-publish-${suffix}`,
          body: {},
        }),
      ),
    );
    assert(
      concurrentFirst.response.status === 201 &&
        concurrentSecond.response.status === 201 &&
        concurrentFirst.body.publishedAt === concurrentSecond.body.publishedAt,
      'concurrent publication was not stable',
    );
    assert(
      (await db.auditEvent.count({
        where: { resourceId: concurrentAssetId, action: 'ASSET_PUBLISHED' },
      })) === 1 &&
        (await db.notification.count({
          where: {
            userId: owner.id,
            resourceId: concurrentAssetId,
            type: 'LIFECYCLE_PUBLISHED',
          },
        })) === 1,
      'concurrent publication duplicated a side effect',
    );
    process.stdout.write(
      'Manual lifecycle QA passed. Disposable fixtures will now be removed.\n',
    );
  } finally {
    await db.auditEvent.deleteMany({ where: { resourceId: assetId } });
    await db.notification.deleteMany({ where: { resourceId: assetId } });
    await db.valuationEvidence.deleteMany({ where: { assetId } });
    await db.valuationDecision.deleteMany({ where: { assetId } });
    await db.insuranceCoverage.deleteMany({ where: { assetId } });
    await db.custodyEvent.deleteMany({ where: { assetId } });
    await db.assetPublication.deleteMany({ where: { assetId } });
    await db.vaultCustodyRecord.deleteMany({ where: { assetId } });
    await db.assetSubmission.deleteMany({ where: { assetId } });
    await db.asset.deleteMany({ where: { id: assetId } });
    await db.auditEvent.deleteMany({
      where: { resourceId: concurrentAssetId },
    });
    await db.notification.deleteMany({
      where: { resourceId: concurrentAssetId },
    });
    await db.valuationDecision.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await db.insuranceCoverage.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await db.custodyEvent.deleteMany({ where: { assetId: concurrentAssetId } });
    await db.assetPublication.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await db.vaultCustodyRecord.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await db.assetSubmission.deleteMany({
      where: { assetId: concurrentAssetId },
    });
    await db.asset.deleteMany({ where: { id: concurrentAssetId } });
    await db.idempotencyRecord.deleteMany({
      where: { key: { startsWith: runId } },
    });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.roleAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  }
}

void main();
