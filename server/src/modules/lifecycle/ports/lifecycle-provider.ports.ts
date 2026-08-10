import { ServiceUnavailableException } from '@nestjs/common';

export interface LifecycleProviderPort {
  readonly kind: string;
  verify(reference: string): Promise<{ verified: boolean; code: string }>;
}
export type LogisticsProvider = LifecycleProviderPort;
export type AuthenticationEvidenceProvider = LifecycleProviderPort;
export type GradingEvidenceProvider = LifecycleProviderPort;
export type VaultCustodyProvider = LifecycleProviderPort;
export type ValuationProvider = LifecycleProviderPort;
export type InsuranceProvider = LifecycleProviderPort;
export const LOGISTICS_PROVIDER = Symbol('LOGISTICS_PROVIDER');
export const AUTHENTICATION_EVIDENCE_PROVIDER = Symbol(
  'AUTHENTICATION_EVIDENCE_PROVIDER',
);
export const GRADING_EVIDENCE_PROVIDER = Symbol('GRADING_EVIDENCE_PROVIDER');
export const VAULT_CUSTODY_PROVIDER = Symbol('VAULT_CUSTODY_PROVIDER');
export const VALUATION_PROVIDER = Symbol('VALUATION_PROVIDER');
export const INSURANCE_PROVIDER = Symbol('INSURANCE_PROVIDER');
export class ManualLifecycleProvider implements LifecycleProviderPort {
  constructor(readonly kind: string) {}
  async verify(reference: string) {
    void reference;
    return { verified: false, code: 'MANUAL_UNVERIFIED' };
  }
}
export class UnavailableLifecycleProvider implements LifecycleProviderPort {
  constructor(readonly kind: string) {}
  async verify(reference: string): Promise<never> {
    void reference;
    throw new ServiceUnavailableException({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The external provider is not configured.',
    });
  }
}
