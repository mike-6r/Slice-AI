import { generateKeyPairSync, createHash, createSign } from 'node:crypto';
import { BridgeAdapter, BridgeWebhookVerifier, mapBridgeTransferState } from './bridge.adapter';

const config = {
  bridgeApiKey: 'bridge-test-key-not-a-real-secret',
  bridgeApiBaseUrl: 'https://api.bridge.xyz/v0',
  bridgeRequestTimeoutMs: 1000,
};

describe('BridgeAdapter', () => {
  it('uses Bridge Api-Key and Idempotency-Key for a transfer request', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'tr_123', state: 'awaiting_funds' }), { status: 201 }));
    const adapter = new BridgeAdapter(config, fetcher);
    await expect(adapter.createTransfer({
      idempotencyKey: 'movement-123',
      body: {
        amount: '50.00', on_behalf_of: 'cust_123',
        source: { payment_rail: 'bridge_wallet' },
        destination: { payment_rail: 'gbp_fps' },
      },
    })).resolves.toEqual({ id: 'tr_123', state: 'awaiting_funds' });
    expect(fetcher).toHaveBeenCalledWith('https://api.bridge.xyz/v0/transfers', expect.objectContaining({ headers: expect.objectContaining({ 'Api-Key': config.bridgeApiKey, 'Idempotency-Key': 'movement-123', 'Content-Type': 'application/json' }) }));
  });

  it('fails closed without Bridge credentials and classifies provider errors', async () => {
    await expect(new BridgeAdapter({ ...config, bridgeApiKey: undefined }, jest.fn()).getTransfer('tr_1')).rejects.toMatchObject({ response: { code: 'BRIDGE_CREDENTIALS_UNAVAILABLE' } });
    const adapter = new BridgeAdapter(config, jest.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    await expect(adapter.getTransfer('tr_1')).rejects.toMatchObject({ kind: 'RATE_LIMIT', status: 429 });
  });

  it('maps only documented Bridge transfer states to Slice movement states', () => {
    expect(mapBridgeTransferState('payment_processed')).toBe('SETTLED');
    expect(mapBridgeTransferState('payment_submitted')).toBe('PROCESSING');
    expect(mapBridgeTransferState('in_review')).toBe('MANUAL_REVIEW');
    expect(mapBridgeTransferState('returned')).toBe('RETURNED');
    expect(mapBridgeTransferState('undeliverable')).toBe('FAILED');
  });

  it('verifies Bridge X-Webhook-Signature over the timestamp and raw body', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const raw = Buffer.from(JSON.stringify({ event_id: 'wh_123', event_type: 'updated.status_transitioned', event_category: 'transfer', event_created_at: '2026-08-08T00:00:00.000Z' }));
    const timestamp = String(Date.parse('2026-08-08T00:00:01.000Z'));
    const digest = createHash('sha256').update(`${timestamp}.${raw.toString('utf8')}`).digest();
    const signer = createSign('RSA-SHA256'); signer.update(digest);
    const signature = signer.sign(privateKey, 'base64');
    const verifier = new BridgeWebhookVerifier(publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(), 300);
    await expect(verifier.verify({ rawBody: raw, headers: { 'x-webhook-signature': `t=${timestamp},v0=${signature}` }, now: new Date('2026-08-08T00:00:01.000Z') })).resolves.toMatchObject({ eventId: 'wh_123', eventType: 'updated.status_transitioned' });
  });

  it('rejects invalid or stale Bridge signatures without echoing secret material', async () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const verifier = new BridgeWebhookVerifier(publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(), 60);
    await expect(verifier.verify({ rawBody: Buffer.from('{"event_id":"wh"}'), headers: { 'x-webhook-signature': 't=1,v0=bad' }, now: new Date() })).rejects.toMatchObject({ response: { code: 'WEBHOOK_TIMESTAMP_INVALID' } });
  });
});
