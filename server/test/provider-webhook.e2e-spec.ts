import { createHmac, randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { bootSubmissionHarness, closeSubmissionHarness, type SubmissionHarness } from './submissions.e2e-helper';

const localSecret = 'slice-local-webhook-signing-secret-not-production';

describe('Document 016 provider webhook HTTP boundary', () => {
  let h: SubmissionHarness;
  const receivedAfter = new Date();

  beforeAll(async () => { h = await bootSubmissionHarness('provider-webhook'); });
  afterAll(async () => {
    await h.db.webhookInbox.deleteMany({ where: { receivedAt: { gte: receivedAfter }, provider: 'LOCAL_TEST' } });
    await h.db.auditEvent.deleteMany({ where: { resourceType: 'provider-webhook' } });
    await closeSubmissionHarness(h, [], `${h.runId}-no-category`);
  });

  it('verifies exact raw bytes, persists unknown signed events, and deduplicates them', async () => {
    const raw = Buffer.from(JSON.stringify({ eventId: `webhook-${randomUUID()}`, type: 'unknown.event' }));
    const headers = signed(raw);
    const server = h.app.getHttpServer();
    const legacy = await request(server).post('/api/v1/providers/BRIDGE/webhooks').set(headers).set('content-type', 'application/json').send(raw.toString());
    expect(legacy.status).toBe(400);
    const first = await request(server).post('/api/v1/providers/LOCAL_TEST/webhooks').set(headers).set('content-type', 'application/json').send(raw.toString());
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ accepted: true, replayed: false });
    const replay = await request(server).post('/api/v1/providers/LOCAL_TEST/webhooks').set(headers).set('content-type', 'application/json').send(raw.toString());
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({ accepted: true, replayed: true });
    expect(await h.db.webhookInbox.count({ where: { provider: 'LOCAL_TEST', receivedAt: { gte: receivedAfter } } })).toBe(1);

    const tampered = Buffer.from(raw.toString().replace('unknown.event', 'unknown.tampered'));
    const invalid = await request(server).post('/api/v1/providers/LOCAL_TEST/webhooks').set(headers).set('content-type', 'application/json').send(tampered.toString());
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).not.toContain(localSecret);
  });

  it('rejects expired and invalid signatures before persisting an inbox event', async () => {
    const raw = Buffer.from(JSON.stringify({ eventId: `expired-${randomUUID()}`, type: 'unknown.event' }));
    const expired = await request(h.app.getHttpServer()).post('/api/v1/providers/LOCAL_TEST/webhooks').set(signed(raw, Math.floor(Date.now() / 1000) - 600)).set('content-type', 'application/json').send(raw.toString());
    expect(expired.status).toBe(400);
    const bad = await request(h.app.getHttpServer()).post('/api/v1/providers/LOCAL_TEST/webhooks').set({ 'x-provider-timestamp': String(Math.floor(Date.now() / 1000)), 'x-provider-signature': '00' }).set('content-type', 'application/json').send(raw.toString());
    expect(bad.status).toBe(400);
    expect(await h.db.webhookInbox.count({ where: { provider: 'LOCAL_TEST', receivedAt: { gte: receivedAfter } } })).toBe(1);
  });
});

function signed(raw: Buffer, timestamp = Math.floor(Date.now() / 1000)) {
  return { 'x-provider-timestamp': String(timestamp), 'x-provider-signature': createHmac('sha256', localSecret).update(`${timestamp}.`).update(raw).digest('hex') };
}
