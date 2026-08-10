import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import type { TransactionScreeningProvider } from '../domain/provider.types';
import { ProviderResilienceService } from './provider-resilience.service';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;
export class BlockchainAnalysisError extends Error { constructor(readonly kind: 'VALIDATION' | 'AUTHENTICATION' | 'RATE_LIMIT' | 'TEMPORARY' | 'TIMEOUT' | 'REJECTED') { super('BlockchainAnalysis.io request failed.'); } }

export class BlockchainAnalysisAdapter implements TransactionScreeningProvider {
  constructor(private readonly config: Pick<AppConfig, 'blockchainAnalysisApiKey' | 'blockchainAnalysisApiBaseUrl' | 'blockchainAnalysisRequestTimeoutMs'>, private readonly fetcher: Fetch = fetch, private readonly resilience = new ProviderResilienceService()) {}
  async screen(input: { address: string; currency: string; chain?: string; from?: string }) {
    const chain = normalizeChain(input.chain);
    const body = input.from ? { from: input.from, to: input.address, chain } : { address: input.address, chain };
    const response = await this.request(body);
    const data = response.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BlockchainAnalysisError('TEMPORARY');
    const record = data as Record<string, unknown>;
    const level = typeof record.riskLevel === 'string' ? record.riskLevel : null;
    const sanctioned = record.sanctioned === true || nestedSanctioned(record.from) || nestedSanctioned(record.to);
    if (!level) throw new BlockchainAnalysisError('TEMPORARY');
    const decision = sanctioned || level === 'HIGH' || level === 'CRITICAL' ? 'BLOCK' : level === 'MEDIUM' ? 'MANUAL_REVIEW' : level === 'LOW' || level === 'SAFE' ? 'ALLOW' : 'MANUAL_REVIEW';
    const flags = Array.isArray(record.flags) ? record.flags.filter((value): value is string => typeof value === 'string').slice(0, 8) : [];
    return { decision: decision as 'ALLOW' | 'MANUAL_REVIEW' | 'BLOCK', providerReference: `blockchain-analysis:${chain}:${input.address}`, reasonCode: sanctioned ? 'KYT_SANCTIONS' : flags[0] ? `KYT_FLAG_${flags[0].slice(0, 48)}` : `KYT_${level}` };
  }
  private async request(body: { chain: string; address?: string; from?: string; to?: string }) {
    if (!this.config.blockchainAnalysisApiKey) throw new ServiceUnavailableException({ code: 'BLOCKCHAIN_ANALYSIS_CREDENTIALS_UNAVAILABLE', message: 'Blockchain risk screening is unavailable.' });
    this.resilience.beforeOutbound('BLOCKCHAIN_ANALYSIS');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.blockchainAnalysisRequestTimeoutMs);
    try {
      const response = await this.fetcher(`${this.config.blockchainAnalysisApiBaseUrl}/kyt`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.blockchainAnalysisApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new BlockchainAnalysisError(response.status === 401 || response.status === 403 ? 'AUTHENTICATION' : response.status === 429 ? 'RATE_LIMIT' : response.status >= 500 ? 'TEMPORARY' : response.status === 400 ? 'VALIDATION' : 'REJECTED');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || (parsed as Record<string, unknown>).success !== true) throw new BlockchainAnalysisError('TEMPORARY');
      this.resilience.success('BLOCKCHAIN_ANALYSIS'); return parsed as { data: unknown };
    } catch (error) { const normalized = error instanceof BlockchainAnalysisError ? error : error instanceof ServiceUnavailableException ? null : error instanceof Error && error.name === 'AbortError' ? new BlockchainAnalysisError('TIMEOUT') : new BlockchainAnalysisError('TEMPORARY'); if (normalized) this.resilience.failure('BLOCKCHAIN_ANALYSIS', normalized.kind); throw normalized ?? error; } finally { clearTimeout(timer); }
  }
}
export function normalizeChain(value: string | undefined) { const chain = value?.trim().toUpperCase(); const aliases: Record<string, string> = { ETHEREUM: 'ETH', BITCOIN: 'BTC', SOLANA: 'SOL', TRON: 'TRON', ETH: 'ETH', BTC: 'BTC', SOL: 'SOL', BSC: 'BSC', POLYGON: 'POLYGON', ARBITRUM: 'ARBITRUM', OPTIMISM: 'OPTIMISM', BASE: 'BASE', AVALANCHE: 'AVALANCHE', XRP: 'XRP' }; if (!chain || !aliases[chain]) throw new ConflictException({ code: 'KYT_CHAIN_UNSUPPORTED', message: 'The blockchain network is unsupported.' }); return aliases[chain]; }
function nestedSanctioned(value: unknown) { return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).sanctioned === true); }
