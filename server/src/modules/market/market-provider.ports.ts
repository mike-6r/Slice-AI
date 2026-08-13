export type MarketIdentity = {
  category: string;
  year: number | null;
  manufacturer: string | null;
  set: string | null;
  cardNumber: string | null;
  title: string;
  variant: string | null;
  grader: string | null;
  grade: string | null;
};

export type ProviderObservation = {
  providerExternalId: string;
  observationType: 'COMPLETED_SALE' | 'ACTIVE_LISTING' | 'PRICE_GUIDE' | 'OTHER_APPROVED_REFERENCE';
  priceMinor: bigint;
  currency: string;
  title: string;
  externalUrl?: string;
  grader?: string;
  grade?: string;
  occurredAt?: Date;
  observedAt: Date;
  matchQuality: 'EXACT' | 'STRONG' | 'WEAK' | 'REJECTED';
  exclusionReason?: string;
  provenance?: Record<string, unknown>;
};

export interface MarketDataProvider {
  readonly providerId: string;
  supports(category: string): boolean;
  health(): Promise<{ configured: boolean; status: 'UP' | 'UNAVAILABLE'; detail: string }>;
  fetchObservations(
    identity: MarketIdentity,
    providerExternalId: string,
  ): Promise<ProviderObservation[]>;
}
