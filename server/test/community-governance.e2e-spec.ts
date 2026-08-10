import {
  bootOwnershipHarness,
  closeOwnershipHarness,
  issue,
  postOwnershipTransfer,
} from './ownership.e2e-helper';
import { communityHttp } from './community-http.helper';

type CommunityHarness = {
  app: { getHttpServer(): unknown };
  assetId: string;
  runId: string;
  owner: { id: string; auth: string; clientIp: string };
  admin: { auth: string; clientIp: string };
  proposalId?: string;
};

describe('Document 015 community and governance HTTP authority', () => {
  let h: CommunityHarness;

  beforeAll(async () => {
    process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED = 'true';
    h = (await bootOwnershipHarness(
      'community',
      950_000,
    )) as unknown as CommunityHarness;
    expect((await issue(h as never, 'community-issue')).status).toBe(201);
    expect(
      (
        await postOwnershipTransfer({
          server: h.app.getHttpServer(),
          assetId: h.assetId,
          authorization: h.admin.auth,
          clientIp: h.admin.clientIp,
          idempotencyKey: h.runId + '-community-transfer',
          toUserId: h.owner.id,
          units: '6000',
        })
      ).status,
    ).toBe(201);
  });

  afterAll(async () => {
    delete process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED;
    await closeOwnershipHarness(h as never);
  });

  it('requires authentication and keeps discussion authors private', async () => {
    const unauthenticated = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'POST',
      path: '/api/v1/assets/' + h.assetId + '/discussions',
      body: { body: 'Unauthenticated' },
    });
    expect(unauthenticated.status).toBe(401);
    const created = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'POST',
      path: '/api/v1/assets/' + h.assetId + '/discussions',
      authorization: h.owner.auth,
      clientIp: h.owner.clientIp,
      body: { body: 'Safe community text' },
    });
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty('userId');
    const listed = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'GET',
      path: '/api/v1/assets/' + h.assetId + '/discussions',
    });
    const items =
      (listed.body as { items?: Array<Record<string, unknown>> }).items ?? [];
    expect(listed.status).toBe(200);
    expect(items[0]).not.toHaveProperty('userId');
  });

  it('opens an immutable ownership snapshot and exposes aggregate voting only', async () => {
    const created = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'POST',
      path: '/api/v1/assets/' + h.assetId + '/sale-proposals',
      authorization: h.owner.auth,
      clientIp: h.owner.clientIp,
      idempotencyKey: h.runId + '-proposal',
      body: { offerMinor: '10001' },
    });
    expect(created.status).toBe(201);
    const proposalId = String(created.body.proposalId);
    h.proposalId = proposalId;
    const opened = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'POST',
      path: '/api/v1/admin/sale-proposals/' + proposalId + '/open',
      authorization: h.admin.auth,
      clientIp: h.admin.clientIp,
      idempotencyKey: h.runId + '-proposal-open',
    });
    expect(opened.status).toBe(201);
    const vote = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'POST',
      path: '/api/v1/sale-proposals/' + proposalId + '/votes',
      authorization: h.owner.auth,
      clientIp: h.owner.clientIp,
      idempotencyKey: h.runId + '-proposal-vote',
      body: { choice: 'APPROVE' },
    });
    expect(vote.status).toBe(201);
    const read = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'GET',
      path: '/api/v1/sale-proposals/' + proposalId,
      authorization: h.owner.auth,
    });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      votingEnabled: true,
      ownVote: 'APPROVE',
    });
    expect(read.body).not.toHaveProperty('votes');
    expect(read.body).not.toHaveProperty('accountId');
  });

  it('lists bounded viewer-aware proposal summaries without leaking snapshot or voter data', async () => {
    const unauthenticated = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'GET',
      path: '/api/v1/sale-proposals?limit=1',
    });
    expect(unauthenticated.status).toBe(401);
    const listed = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'GET',
      path: '/api/v1/sale-proposals?status=OPEN&viewerRelevant=true&limit=1',
      authorization: h.owner.auth,
      clientIp: h.owner.clientIp,
    });
    expect(listed.status).toBe(200);
    const page = listed.body as {
      items?: Array<Record<string, unknown>>;
      nextCursor?: string | null;
    };
    const item = page.items?.find((entry) => entry.id === h.proposalId);
    expect(item).toMatchObject({
      status: 'OPEN',
      viewerState: 'ALREADY_VOTED',
      ownVote: 'APPROVE',
    });
    expect(item).not.toHaveProperty('eligibility');
    expect(item).not.toHaveProperty('accountId');
    expect(item).not.toHaveProperty('proposerId');
    expect(JSON.stringify(item)).not.toMatch(
      /journal|reservation|counterparty|provider|audit/i,
    );
    const invalid = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'GET',
      path: '/api/v1/sale-proposals?status=INVALID',
      authorization: h.owner.auth,
      clientIp: h.owner.clientIp,
    });
    expect(invalid.status).toBe(400);
    const denied = await communityHttp({
      server: h.app.getHttpServer(),
      method: 'POST',
      path: '/api/v1/admin/sale-proposals/' + h.proposalId + '/open',
      authorization: h.owner.auth,
      clientIp: h.owner.clientIp,
      idempotencyKey: h.runId + '-ordinary-open',
    });
    expect(denied.status).toBe(403);
  });
});
