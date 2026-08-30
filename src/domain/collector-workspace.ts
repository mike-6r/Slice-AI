export type CollectorWorkspaceStage =
  "DRAFT" | "SUBMITTED" | "REVIEW" | "VALUATION" | "CUSTODY" | "VAULT_READY" | "MARKET_LIVE";

export type CollectorWorkspaceMoney = { amountMinor: string; currency: string };

export type CollectorWorkspaceAsset = {
  id: string;
  assetId: string | null;
  slug: string | null;
  title: string;
  year: number | null;
  manufacturer: string | null;
  edition: string | null;
  set: string | null;
  cardNumber: string | null;
  certificationNumber: string | null;
  category: string | null;
  grader: string | null;
  grade: string | null;
  stage: CollectorWorkspaceStage;
  submissionStatus: string;
  version: number;
  nextAction: string;
  updatedAt: string;
  referenceValue: (CollectorWorkspaceMoney & { source: string; asOf: string }) | null;
  valuation: {
    supportedValue: (CollectorWorkspaceMoney & { source: string; asOf: string }) | null;
    externalReference: (CollectorWorkspaceMoney & { source: string; asOf: string }) | null;
  };
  marketResearch: {
    state: string;
    collectedAt: string;
    snapshot: Record<string, unknown>;
  } | null;
  custody: { status: string; updatedAt: string } | null;
  intake: {
    id: string;
    status: string;
    deliveryMethod: "SHIPMENT" | "IN_PERSON";
    intakeReference: string;
    vault: {
      id: string;
      displayName: string;
      region: string;
      countryCode: string;
      customerSafeAddress: string;
      shippingInstructions: string;
    };
    shipment: {
      carrier: string;
      trackingNumber: string;
      status: string;
      shippedAt: string;
      deliveredAt: string | null;
    } | null;
    receivedAt: string | null;
  } | null;
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

export type CollectorLifecycleStep = {
  id: string;
  label: string;
  status: "COMPLETED" | "CURRENT" | "ACTION_REQUIRED" | "UPCOMING" | "EXCEPTION";
  occurredAt: string | null;
};

export type CollectorWorkspaceLifecycle = {
  currentStage: CollectorWorkspaceStage;
  currentStatus: CollectorLifecycleStep["status"];
  currentLabel: string;
  currentDetail: string;
  nextMilestone: { label: string; detail: string };
  action: {
    type: string;
    label: string;
    detail: string;
    targetRoute: string;
  } | null;
  steps: CollectorLifecycleStep[];
};

export type CollectorWorkspaceOverview = {
  collector: {
    displayName: string;
    username: string | null;
    avatarReference: string | null;
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
  attention: Array<
    CollectorWorkspaceAsset & {
      reason: string;
      badge: string;
      requestId: string;
      requestStatus: "OPEN";
      destination: string;
      type: string;
      category: "SUBMISSION" | "SHIPPING" | "INFORMATION";
      priority: "BLOCKING" | "IMPORTANT" | "REMINDER";
      action: string;
      actionLabel: string;
      targetRoute: string;
    }
  >;
  actionSummary: {
    waitingOnYou: number;
    inProgress: number;
    completedRecently: number;
  };
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
