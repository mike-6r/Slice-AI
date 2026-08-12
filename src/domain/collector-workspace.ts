export type CollectorWorkspaceStage =
  "DRAFT" | "SUBMITTED" | "REVIEW" | "VALUATION" | "CUSTODY" | "VAULT_READY" | "MARKET_LIVE";

export type CollectorWorkspaceMoney = { amountMinor: string; currency: string };

export type CollectorWorkspaceAsset = {
  id: string;
  assetId: string | null;
  slug: string | null;
  title: string;
  year: number | null;
  set: string | null;
  category: string | null;
  grade: string | null;
  stage: CollectorWorkspaceStage;
  submissionStatus: string;
  updatedAt: string;
  referenceValue: (CollectorWorkspaceMoney & { source: string; asOf: string }) | null;
  marketResearch: {
    state: string;
    collectedAt: string;
    snapshot: Record<string, unknown>;
  } | null;
  custody: { status: string; updatedAt: string } | null;
  media: Array<{ id: string; slot: string; filename: string; status: string; updatedAt: string }>;
  market: {
    isLive: boolean;
    ownersCount: number | null;
    availabilityBps: number | null;
    executionCount: number;
    executedUnits: string;
    executionVolumeMinor: string;
    latestSharePriceMinor: string | null;
  };
};

export type CollectorWorkspaceOverview = {
  collector: {
    displayName: string;
    username: string | null;
    countryCode: string | null;
    collectorSince: string;
    publicProfile: {
      slug: string;
      headline: string | null;
      specialism: string | null;
      isPublic: boolean;
    } | null;
  };
  kpis: {
    totalCollectibles: number;
    referenceValue: CollectorWorkspaceMoney | null;
    marketLive: number;
    inReview: number;
    needsAttention: number;
  };
  pipeline: Array<{ stage: CollectorWorkspaceStage; count: number }>;
  assets: CollectorWorkspaceAsset[];
  attention: Array<CollectorWorkspaceAsset & { reason: string; badge: string }>;
  activity: Array<{ id: string; type: string; title: string; detail: string; occurredAt: string }>;
  analytics: {
    catalogueReferenceValue: CollectorWorkspaceMoney | null;
    marketLiveReferenceValue: CollectorWorkspaceMoney | null;
    marketLiveAssets: number;
    trades: number | null;
    volume: CollectorWorkspaceMoney | null;
    executedUnits: string;
    owners: number | null;
  };
};
