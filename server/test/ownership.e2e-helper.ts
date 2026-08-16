import * as request from 'supertest';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

export type OwnershipHarness = SubmissionHarness & {
  categoryId: string;
  owner: Awaited<ReturnType<typeof signup>>;
  admin: Awaited<ReturnType<typeof signup>>;
  assetId: string;
  slug: string;
  extraUserIds?: string[];
};

export async function bootOwnershipHarness(
  name: string,
  offset: number,
): Promise<OwnershipHarness> {
  const h = await bootSubmissionHarness(`ownership-${name}`);
  const categoryId = await createCategory(h);
  const runOffset =
    offset + Number.parseInt(h.runId.replace(/\D/g, '').slice(-4), 10);
  const owner = await signup(h, `${name}-owner`, runOffset);
  const admin = await signup(h, `${name}-admin`, runOffset + 1);
  await h.db.roleAssignment.create({
    data: {
      id: `${h.runId}-admin`,
      userId: admin.id,
      role: 'ADMIN',
      scopeType: 'GLOBAL',
      scopeId: '*',
    },
  });
  const assetId = `${h.runId}-asset`;
  const slug = `${h.runId}-asset`;
  const now = new Date();
  await h.db.asset.create({
    data: {
      id: assetId,
      publicId: `ast_${h.runId.replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`,
      slug,
      title: 'Ownership fixture',
      categoryId,
      status: 'PUBLISHED',
      publishedAt: now,
    },
  });
  await h.db.assetSubmission.create({
    data: {
      id: `${h.runId}-submission`,
      ownerUserId: owner.id,
      assetId,
      categoryId,
      status: 'APPROVED',
    },
  });
  await h.db.assetPublication.create({
    data: {
      id: `${h.runId}-publication`,
      assetId,
      status: 'PUBLISHED',
      readiness: { blockingCodes: [] },
      publishedAt: now,
      publishedByUserId: admin.id,
    },
  });
  await h.db.vaultCustodyRecord.create({
    data: {
      id: `${h.runId}-custody`,
      assetId,
      providerCode: 'MANUAL_UNVERIFIED',
      status: 'SECURED',
      securedAt: now,
    },
  });
  await h.db.insuranceCoverage.create({
    data: {
      id: `${h.runId}-coverage`,
      assetId,
      providerCode: 'MANUAL_UNVERIFIED',
      insuredValueMinor: 100_000n,
      currency: 'GBP',
      status: 'ACTIVE',
      effectiveAt: new Date(now.getTime() - 60_000),
      expiresAt: new Date(now.getTime() + 86_400_000),
    },
  });
  await h.db.valuationDecision.create({
    data: {
      id: `${h.runId}-valuation`,
      assetId,
      valueMinor: 100_000n,
      currency: 'GBP',
      confidence: 90,
      methodologyCode: 'TEST_FIXTURE',
      decidedByUserId: admin.id,
      decidedAt: now,
      status: 'ACTIVE',
    },
  });
  await h.db.ownershipSupplyPolicy.create({
    data: {
      id: `${h.runId}-supply-policy`,
      assetId,
      policyCode: 'STANDARD_COLLECTIBLE_V1',
      status: 'APPROVED',
      proposedUnits: 10_000n,
      valuationMinor: 100_000n,
      valuationCurrency: 'GBP',
      pricePerUnitMinor: 10n,
      remainderMinor: 0n,
      reason: 'Test fixture approved supply policy.',
      proposedByUserId: admin.id,
      approvedByUserId: admin.id,
      proposedAt: now,
      approvedAt: now,
    },
  });
  return { ...h, categoryId, owner, admin, assetId, slug };
}

export async function issue(h: OwnershipHarness, key = 'issue') {
  const response = await request(h.app.getHttpServer())
    .post(`/api/v1/admin/assets/${h.assetId}/ownership/issue`)
    .set('authorization', h.admin.auth)
    .set('x-forwarded-for', h.admin.clientIp)
    .set('idempotency-key', `${h.runId}-${key}`)
    .send({ totalUnits: '10000' });
  return response;
}

export async function postOwnershipTransfer(input: {
  server: unknown;
  assetId: string;
  authorization: string;
  clientIp: string;
  idempotencyKey: string;
  fromUserId?: string;
  toUserId: string;
  units: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const pending = request(input.server as never)
    .post('/api/v1/admin/assets/' + input.assetId + '/ownership/transfers')
    .set('authorization', input.authorization)
    .set('x-forwarded-for', input.clientIp)
    .set('idempotency-key', input.idempotencyKey);
  const response = await pending.send({
    ...(input.fromUserId ? { fromUserId: input.fromUserId } : {}),
    toUserId: input.toUserId,
    units: input.units,
  });
  return {
    status: response.status,
    body: response.body as Record<string, unknown>,
  };
}

export async function postOwnershipReservation(input: {
  server: unknown;
  assetId: string;
  authorization: string;
  clientIp: string;
  idempotencyKey: string;
  userId: string;
  units: string;
  purposeId: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request(input.server as never)
    .post('/api/v1/admin/assets/' + input.assetId + '/ownership/reservations')
    .set('authorization', input.authorization)
    .set('x-forwarded-for', input.clientIp)
    .set('idempotency-key', input.idempotencyKey)
    .send({
      userId: input.userId,
      units: input.units,
      purposeType: 'ISSUANCE_ALLOCATION',
      purposeId: input.purposeId,
    });
  return {
    status: response.status,
    body: response.body as Record<string, unknown>,
  };
}

export async function postOwnershipReservationRelease(input: {
  server: unknown;
  reservationId: string;
  authorization: string;
  clientIp: string;
  idempotencyKey: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request(input.server as never)
    .post(
      '/api/v1/admin/ownership/reservations/' +
        input.reservationId +
        '/release',
    )
    .set('authorization', input.authorization)
    .set('x-forwarded-for', input.clientIp)
    .set('idempotency-key', input.idempotencyKey)
    .send({});
  return {
    status: response.status,
    body: response.body as Record<string, unknown>,
  };
}

export async function postOwnershipCorrection(input: {
  server: unknown;
  assetId: string;
  authorization: string;
  clientIp: string;
  idempotencyKey: string;
  userId: string;
  units: string;
  direction: 'CREDIT' | 'DEBIT';
  reasonCode: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request(input.server as never)
    .post('/api/v1/admin/assets/' + input.assetId + '/ownership/corrections')
    .set('authorization', input.authorization)
    .set('x-forwarded-for', input.clientIp)
    .set('idempotency-key', input.idempotencyKey)
    .send({
      userId: input.userId,
      units: input.units,
      direction: input.direction,
      reasonCode: input.reasonCode,
    });
  return {
    status: response.status,
    body: response.body as Record<string, unknown>,
  };
}

export async function postOwnershipReconciliation(input: {
  server: unknown;
  assetId: string;
  authorization: string;
  clientIp: string;
  idempotencyKey: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request(input.server as never)
    .post(
      '/api/v1/admin/assets/' +
        input.assetId +
        '/ownership/reconciliation-runs',
    )
    .set('authorization', input.authorization)
    .set('x-forwarded-for', input.clientIp)
    .set('idempotency-key', input.idempotencyKey)
    .send({});
  return {
    status: response.status,
    body: response.body as Record<string, unknown>,
  };
}

export async function closeOwnershipHarness(h: OwnershipHarness | undefined) {
  if (!h) return;
  const proposalIds = (
    await h.db.saleProposal.findMany({
      where: { assetId: h.assetId },
      select: { id: true },
    })
  ).map((proposal) => proposal.id);
  await h.db.distributionReconciliationRun.deleteMany({
    where: { distribution: { proposalId: { in: proposalIds } } },
  });
  await h.db.distributionLine.deleteMany({
    where: { distribution: { proposalId: { in: proposalIds } } },
  });
  await h.db.distribution.deleteMany({
    where: { proposalId: { in: proposalIds } },
  });
  await h.db.externalSaleVerificationApproval.deleteMany({
    where: { saleVerification: { proposalId: { in: proposalIds } } },
  });
  await h.db.externalSaleVerification.deleteMany({
    where: { proposalId: { in: proposalIds } },
  });
  await h.db.proposalVote.deleteMany({ where: { proposalId: { in: proposalIds } } });
  await h.db.proposalEligibility.deleteMany({
    where: { proposalId: { in: proposalIds } },
  });
  await h.db.saleProposal.deleteMany({ where: { id: { in: proposalIds } } });
  await h.db.moderationAction.deleteMany({ where: { post: { assetId: h.assetId } } });
  await h.db.contentReport.deleteMany({ where: { post: { assetId: h.assetId } } });
  await h.db.discussionPost.deleteMany({ where: { assetId: h.assetId } });
  const ownershipAccountIds = (
    await h.db.ownershipPosition.findMany({
      where: { assetId: h.assetId },
      select: { accountId: true },
    })
  ).map((position) => position.accountId);
  await h.db.auditEvent.deleteMany({ where: { resourceId: h.assetId } });
  await h.db.notification.deleteMany({ where: { resourceId: h.assetId } });
  await h.db.ownershipReconciliationRun.deleteMany({
    where: { assetId: h.assetId },
  });
  await h.db.ownershipLedgerEntry.deleteMany({ where: { assetId: h.assetId } });
  await h.db.ownershipReservation.deleteMany({ where: { assetId: h.assetId } });
  await h.db.ownershipPosition.deleteMany({ where: { assetId: h.assetId } });
  await h.db.ownershipAssetSupply.deleteMany({ where: { assetId: h.assetId } });
  await h.db.ownershipAccount.deleteMany({
    where: { id: { in: ownershipAccountIds } },
  });
  await h.db.ownershipAccount.deleteMany({
    where: {
      userId: { in: [h.owner.id, h.admin.id, ...(h.extraUserIds ?? [])] },
    },
  });
  await h.db.insuranceCoverage.deleteMany({ where: { assetId: h.assetId } });
  await h.db.ownershipSupplyPolicy.deleteMany({ where: { assetId: h.assetId } });
  await h.db.valuationDecision.deleteMany({ where: { assetId: h.assetId } });
  await h.db.vaultCustodyRecord.deleteMany({ where: { assetId: h.assetId } });
  await h.db.assetPublication.deleteMany({ where: { assetId: h.assetId } });
  await h.db.assetSubmission.deleteMany({ where: { assetId: h.assetId } });
  await h.db.asset.deleteMany({ where: { id: h.assetId } });
  await closeSubmissionHarness(
    h,
    [h.owner.id, h.admin.id, ...(h.extraUserIds ?? [])],
    h.categoryId,
  );
}
