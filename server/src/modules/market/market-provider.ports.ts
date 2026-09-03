export type MarketIdentity = {
  category: string;
  year: number | null;
  manufacturer: string | null;
  set: string | null;
  cardNumber: string | null;
  edition?: string | null;
  title: string;
  variant: string | null;
  grader: string | null;
  grade: string | null;
};

export type ProviderObservation = {
  providerExternalId: string;
  observationType:
    | 'COMPLETED_SALE'
    | 'ACTIVE_LISTING'
    | 'PRICE_GUIDE'
    | 'OTHER_APPROVED_REFERENCE';
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

export type PriceChartingConditionReference = {
  conditionKey: string;
  label: string;
  amountMinor: bigint;
  grader?: string;
  grade?: string;
  exactGrader: boolean;
};

export type PriceChartingProduct = {
  providerProductId: string;
  title: string;
  set: string | null;
  releaseDate: string | null;
  year: number | null;
  upc: string | null;
  currency: string;
  imageUrl: string | null;
  references: PriceChartingConditionReference[];
};

export type MarketProductCandidate = Pick<
  PriceChartingProduct,
  'providerProductId' | 'title' | 'set' | 'releaseDate' | 'year' | 'upc'
> & { matchQuality: 'EXACT' | 'STRONG' | 'NEEDS_CONFIRMATION' };

export interface MarketDataProvider {
  readonly providerId: string;
  supports(category: string): boolean;
  health(): Promise<{
    configured: boolean;
    status: 'UP' | 'UNAVAILABLE';
    detail: string;
  }>;
  fetchObservations(
    identity: MarketIdentity,
    providerExternalId: string,
  ): Promise<ProviderObservation[]>;
  searchProducts?(identity: MarketIdentity): Promise<MarketProductCandidate[]>;
  /** Resolve a trusted provider URL before discovery/search is attempted. */
  resolveReferenceUrl?(url: string): Promise<string | null>;
  getProduct?(providerExternalId: string): Promise<PriceChartingProduct>;
}
