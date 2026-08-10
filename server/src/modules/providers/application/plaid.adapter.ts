import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../../config/app-config';
import type { IdentityVerificationProvider, NormalizedComplianceStatus, WebhookVerifier } from '../domain/provider.types';
import { ProviderResilienceService } from './provider-resilience.service';

type PlaidFetch = (input: string, init: RequestInit) => Promise<Response>;
type Jwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string; kid: string; alg: 'ES256'; expired_at?: number | null };

export class PlaidProviderError extends Error {
  constructor(readonly kind: 'VALIDATION' | 'AUTHENTICATION' | 'RATE_LIMIT' | 'TEMPORARY' | 'TIMEOUT' | 'REJECTED', readonly requestId?: string) { super('Plaid request failed.'); }
}

export class PlaidAdapter implements IdentityVerificationProvider, WebhookVerifier {
  private readonly keys = new Map<string, { key: Jwk; expiresAt: number | null }>();
  constructor(private readonly config: Pick<AppConfig, 'plaidClientId' | 'plaidSecret' | 'plaidEnvironment' | 'plaidIdentityVerificationTemplateId' | 'plaidRequestTimeoutMs'>, private readonly fetcher: PlaidFetch = fetch, private readonly resilience = new ProviderResilienceService()) {}

  async createSession(input: { userId: string; requestId: string }) {
    const response = await this.request('/identity_verification/create', {
      client_user_id: input.userId,
      template_id: this.template(),
      is_idempotent: true,
    });
    const id = text(response.id);
    const status = text(response.status);
    if (!id || !status) throw new PlaidProviderError('TEMPORARY');
    return { providerReference: id, sessionUrl: text(response.shareable_url), status: mapPlaidIdentityStatus(status) };
  }

  async createLinkToken(input: { userId: string; redirectUri?: string }) {
    const response = await this.request('/link/token/create', {
      client_name: 'Slice',
      language: 'en',
      country_codes: ['GB'],
      user: { client_user_id: input.userId },
      products: ['auth'],
      ...(input.redirectUri ? { redirect_uri: input.redirectUri } : {}),
    });
    const token = text(response.link_token);
    const expiration = text(response.expiration);
    if (!token || !expiration) throw new PlaidProviderError('TEMPORARY');
    return { linkToken: token, expiration };
  }

  async exchangePublicToken(publicToken: string) {
    const response = await this.request('/item/public_token/exchange', { public_token: publicToken });
    const accessToken = text(response.access_token);
    const itemId = text(response.item_id);
    if (!accessToken || !itemId) throw new PlaidProviderError('TEMPORARY');
    return { accessToken, itemId };
  }

  async listAccounts(accessToken: string) {
    const response = await this.request('/accounts/get', { access_token: accessToken });
    const accounts = response.accounts;
    if (!Array.isArray(accounts)) throw new PlaidProviderError('TEMPORARY');
    return accounts.flatMap((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      const account = raw as Record<string, unknown>;
      const id = text(account.account_id);
      if (!id) return [];
      return [{
        accountId: id,
        name: text(account.name) ?? 'Connected account',
        mask: text(account.mask),
        type: text(account.type) ?? 'OTHER',
        institutionName: null as string | null,
      }];
    });
  }

  async getIdentityVerification(verificationId: string) {
    const response = await this.request('/identity_verification/get', { identity_verification_id: verificationId });
    const status = text(response.status);
    if (!status) throw new PlaidProviderError('TEMPORARY');
    return { status: mapPlaidIdentityStatus(status), watchlistScreeningId: text(response.watchlist_screening_id) };
  }

  async createIndividualScreening(input: { clientUserId: string; watchlistProgramId: string; legalName: string; dateOfBirth?: string; country?: string }) {
    const response = await this.request('/watchlist_screening/individual/create', {
      client_user_id: input.clientUserId,
      search_terms: { watchlist_program_id: input.watchlistProgramId, legal_name: input.legalName, ...(input.dateOfBirth ? { date_of_birth: input.dateOfBirth } : {}), ...(input.country ? { country: input.country } : {}) },
    });
    const id = text(response.id); const status = text(response.status);
    if (!id || !status) throw new PlaidProviderError('TEMPORARY');
    return { providerReference: id, status: mapPlaidMonitorStatus(status) };
  }

  async getIndividualScreening(screeningId: string) {
    const response = await this.request('/watchlist_screening/individual/get', { watchlist_screening_id: screeningId });
    const status = text(response.status);
    if (!status) throw new PlaidProviderError('TEMPORARY');
    return { status: mapPlaidMonitorStatus(status) };
  }

  async verify(input: { rawBody: Buffer; headers: Record<string, string | string[] | undefined>; now: Date }) {
    const token = header(input.headers, 'plaid-verification');
    if (!token) throw invalidWebhook();
    const [encodedHeader, encodedPayload, encodedSignature, ...extra] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature || extra.length) throw invalidWebhook();
    let jwtHeader: Record<string, unknown>;
    try { jwtHeader = JSON.parse(base64url(encodedHeader).toString('utf8')) as Record<string, unknown>; } catch { throw invalidWebhook(); }
    if (jwtHeader.alg !== 'ES256' || typeof jwtHeader.kid !== 'string') throw invalidWebhook();
    const jwk = await this.key(jwtHeader.kid, input.now);
    try {
      const verifier = createVerify('sha256'); verifier.update(`${encodedHeader}.${encodedPayload}`);
      if (!verifier.verify({ key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, base64url(encodedSignature))) throw invalidWebhook();
      const payload = JSON.parse(base64url(encodedPayload).toString('utf8')) as Record<string, unknown>;
      const iat = payload.iat;
      const expectedHash = text(payload.request_body_sha256);
      if (typeof iat !== 'number' || !expectedHash || Math.abs(input.now.getTime() - iat * 1000) > 300_000) throw invalidWebhook();
      const actualHash = createHash('sha256').update(input.rawBody).digest('hex');
      if (actualHash.length !== expectedHash.length || !timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash))) throw invalidWebhook();
      const body = JSON.parse(input.rawBody.toString('utf8')) as Record<string, unknown>;
      const eventId = text(body.request_id) ?? `${text(body.webhook_type) ?? 'PLAID'}:${text(body.identity_verification_id) ?? text(body.watchlist_screening_id) ?? actualHash}`;
      return { eventId, eventType: `${text(body.webhook_type) ?? 'UNKNOWN'}:${text(body.webhook_code) ?? 'UNKNOWN'}`, occurredAt: input.now, payload: body };
    } catch (error) { if (error instanceof BadRequestException) throw error; throw invalidWebhook(); }
  }

  private async key(kid: string, now: Date): Promise<Jwk> {
    const cached = this.keys.get(kid);
    if (cached && (!cached.expiresAt || cached.expiresAt > now.getTime() / 1000)) return cached.key;
    const response = await this.request('/webhook_verification_key/get', { key_id: kid });
    const key = response.key;
    if (!key || typeof key !== 'object' || Array.isArray(key)) throw new PlaidProviderError('TEMPORARY');
    const jwk = key as Jwk;
    if (jwk.kid !== kid || jwk.alg !== 'ES256' || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new PlaidProviderError('TEMPORARY');
    this.keys.set(kid, { key: jwk, expiresAt: typeof jwk.expired_at === 'number' ? jwk.expired_at : null });
    return jwk;
  }

  private async request(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.config.plaidClientId || !this.config.plaidSecret) throw new ServiceUnavailableException({ code: 'PLAID_CREDENTIALS_UNAVAILABLE', message: 'Plaid credentials are unavailable.' });
    this.resilience.beforeOutbound('PLAID');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.plaidRequestTimeoutMs);
    try {
      const response = await this.fetcher(`${base(this.config.plaidEnvironment)}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'PLAID-CLIENT-ID': this.config.plaidClientId, 'PLAID-SECRET': this.config.plaidSecret }, body: JSON.stringify(body), signal: controller.signal });
      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
        throw new PlaidProviderError(classify(response.status, text(record.error_type)), text(record.request_id) ?? undefined);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new PlaidProviderError('TEMPORARY');
      this.resilience.success('PLAID'); return parsed as Record<string, unknown>;
    } catch (error) {
      const normalized = error instanceof PlaidProviderError ? error : error instanceof ServiceUnavailableException ? null : error instanceof Error && error.name === 'AbortError' ? new PlaidProviderError('TIMEOUT') : new PlaidProviderError('TEMPORARY');
      if (normalized) this.resilience.failure('PLAID', normalized.kind);
      throw normalized ?? error;
    } finally { clearTimeout(timer); }
  }
  private template() { if (!this.config.plaidIdentityVerificationTemplateId) throw new ServiceUnavailableException({ code: 'PLAID_IDV_TEMPLATE_UNAVAILABLE', message: 'Plaid identity template is unavailable.' }); return this.config.plaidIdentityVerificationTemplateId; }
}

export function mapPlaidIdentityStatus(status: string): NormalizedComplianceStatus {
  if (status === 'success') return 'APPROVED';
  if (status === 'pending_review') return 'MANUAL_REVIEW';
  if (status === 'failed') return 'REJECTED';
  if (status === 'expired') return 'EXPIRED';
  return 'PENDING'; // Plaid active and all non-terminal lifecycle states.
}
export function mapPlaidMonitorStatus(status: string): NormalizedComplianceStatus {
  if (status === 'cleared') return 'APPROVED';
  if (status === 'rejected') return 'REJECTED';
  return 'MANUAL_REVIEW'; // pending_review/hit states require human disposition.
}
function base(environment: 'sandbox' | 'production') { return environment === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com'; }
function classify(status: number, type: string | null) { if (status === 401 || status === 403) return 'AUTHENTICATION'; if (status === 429) return 'RATE_LIMIT'; if (status >= 500 || type === 'API_ERROR') return 'TEMPORARY'; if (status === 400) return 'VALIDATION'; return 'REJECTED'; }
function header(headers: Record<string, string | string[] | undefined>, name: string) { const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1]; return Array.isArray(value) ? value[0] : value; }
function text(value: unknown) { return typeof value === 'string' && value.length > 0 ? value : null; }
function base64url(value: string) { return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
function invalidWebhook(): BadRequestException { return new BadRequestException({ code: 'WEBHOOK_SIGNATURE_INVALID', message: 'Plaid webhook signature is invalid.' }); }
