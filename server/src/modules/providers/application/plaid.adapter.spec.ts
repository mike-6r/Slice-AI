import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { PlaidAdapter, mapPlaidIdentityStatus, mapPlaidMonitorStatus } from './plaid.adapter';

const config = { plaidClientId: 'plaid-client', plaidSecret: 'plaid-secret-not-real', plaidEnvironment: 'sandbox' as const, plaidIdentityVerificationTemplateId: 'idv-template', plaidRequestTimeoutMs: 1000 };

describe('PlaidAdapter', () => {
  it('creates an idempotent identity verification using an opaque Slice user id', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'idv_1', status: 'active', shareable_url: 'https://verify.test/idv_1' }), { status: 200 }));
    const adapter = new PlaidAdapter(config, fetcher);
    await expect(adapter.createSession({ userId: 'usr_opaque_123', requestId: 'request-1' })).resolves.toMatchObject({ providerReference: 'idv_1', status: 'PENDING' });
    expect(fetcher).toHaveBeenCalledWith('https://sandbox.plaid.com/identity_verification/create', expect.objectContaining({ headers: expect.objectContaining({ 'PLAID-CLIENT-ID': 'plaid-client', 'PLAID-SECRET': 'plaid-secret-not-real' }) }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ client_user_id: 'usr_opaque_123', template_id: 'idv-template', is_idempotent: true });
  });

  it('maps current identity and Monitor status without auto-approving watchlist review', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'idv_1', status: 'success' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'scr_1', status: 'pending_review' }), { status: 200 }));
    const adapter = new PlaidAdapter(config, fetcher);
    await expect(adapter.getIdentityVerification('idv_1')).resolves.toMatchObject({ status: 'APPROVED' });
    await expect(adapter.createIndividualScreening({ clientUserId: 'usr_opaque_123', watchlistProgramId: 'program_1', legalName: 'Verified Name' })).resolves.toMatchObject({ providerReference: 'scr_1', status: 'MANUAL_REVIEW' });
    expect(mapPlaidIdentityStatus('failed')).toBe('REJECTED');
    expect(mapPlaidMonitorStatus('cleared')).toBe('APPROVED');
  });

  it('fails closed for missing credentials and normalizes Plaid authentication errors', async () => {
    await expect(new PlaidAdapter({ ...config, plaidSecret: undefined }, jest.fn()).createSession({ userId: 'usr', requestId: 'r' })).rejects.toMatchObject({ response: { code: 'PLAID_CREDENTIALS_UNAVAILABLE' } });
    await expect(new PlaidAdapter(config, jest.fn().mockResolvedValue(new Response(JSON.stringify({ error_type: 'INVALID_INPUT', request_id: 'plaid-request-id' }), { status: 400 }))).getIdentityVerification('idv_1')).rejects.toMatchObject({ kind: 'VALIDATION', requestId: 'plaid-request-id' });
  });

  it('creates Link tokens and normalizes linked account data without exposing an access token', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ link_token: 'link-sandbox-token', expiration: '2026-08-09T00:00:00Z' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-sandbox-token', item_id: 'item-sandbox-id' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{ account_id: 'account-1', name: 'Current account', mask: '1234', type: 'depository' }] }), { status: 200 }));
    const adapter = new PlaidAdapter(config, fetcher);
    await expect(adapter.createLinkToken({ userId: 'usr_opaque_123' })).resolves.toEqual({ linkToken: 'link-sandbox-token', expiration: '2026-08-09T00:00:00Z' });
    await expect(adapter.exchangePublicToken('public-sandbox-token')).resolves.toEqual({ accessToken: 'access-sandbox-token', itemId: 'item-sandbox-id' });
    await expect(adapter.listAccounts('access-sandbox-token')).resolves.toEqual([{ accountId: 'account-1', name: 'Current account', mask: '1234', type: 'depository', institutionName: null }]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ country_codes: ['GB'], products: ['auth'], user: { client_user_id: 'usr_opaque_123' } });
  });

  it('verifies Plaid ES256 JWT and exact raw-body hash using a fetched JWK', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string>;
    const raw = Buffer.from(JSON.stringify({ webhook_type: 'IDENTITY_VERIFICATION', webhook_code: 'STATUS_UPDATED', request_id: 'plaid-event-1', identity_verification_id: 'idv_1', client_user_id: 'usr_opaque_123' }));
    const header = encode({ alg: 'ES256', kid: 'kid_1', typ: 'JWT' });
    const payload = encode({ iat: Math.floor(Date.now() / 1000), request_body_sha256: createHash('sha256').update(raw).digest('hex') });
    const signer = createSign('sha256'); signer.update(`${header}.${payload}`);
    const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const adapter = new PlaidAdapter(config, jest.fn().mockResolvedValue(new Response(JSON.stringify({ key: { ...jwk, kid: 'kid_1', alg: 'ES256', use: 'sig', expired_at: null } }), { status: 200 })));
    await expect(adapter.verify({ rawBody: raw, headers: { 'plaid-verification': `${header}.${payload}.${signature}` }, now: new Date() })).resolves.toMatchObject({ eventId: 'plaid-event-1', eventType: 'IDENTITY_VERIFICATION:STATUS_UPDATED' });
  });

  it('rejects wrong algorithms, stale signatures, and body mismatches', async () => {
    const adapter = new PlaidAdapter(config, jest.fn());
    await expect(adapter.verify({ rawBody: Buffer.from('{}'), headers: { 'plaid-verification': `${encode({ alg: 'none', kid: 'k' })}.${encode({})}.x` }, now: new Date() })).rejects.toMatchObject({ response: { code: 'WEBHOOK_SIGNATURE_INVALID' } });
  });
});

function encode(value: object) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
