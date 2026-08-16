export type MarketLifecyclePhase =
  | 'UNPUBLISHED'
  | 'CUSTODY_REQUIRED'
  | 'SUPPLY_APPROVAL_REQUIRED'
  | 'READY_FOR_ISSUANCE'
  | 'ISSUANCE_PENDING'
  | 'LIVE'
  | 'SUSPENDED'
  | 'CLOSED';

export type MarketLifecycleStepState = 'complete' | 'current' | 'upcoming' | 'blocked';

export type MarketLifecycleStep = {
  key: 'PUBLISHED' | 'CUSTODY' | 'ISSUANCE' | 'TRADING';
  label: string;
  state: MarketLifecycleStepState;
  subtitle: string;
};

export type MarketLifecycleProjection = {
  phase: MarketLifecyclePhase;
  badge: string;
  headline: string;
  statusPill: string;
  explanation: string;
  tradeabilityMessage: string | null;
  canBuy: boolean;
  canSell: boolean;
  currentStep: number;
  nextAction: string;
  blockingDependency: string | null;
  steps: MarketLifecycleStep[];
  admin: {
    publicState: string;
    internalState: string;
    nextAction: string;
    blockingDependency: string | null;
  };
};

export type MarketLifecycleInput = {
  published: boolean;
  publicationStatus?: string | null;
  custodyStatus?: string | null;
  custodyBypass?: boolean;
  verificationStatus?: string | null;
  valuationAvailable?: boolean;
  supplyPolicyStatus?: string | null;
  supplyStatus?: string | null;
  issuedUnits?: bigint | number | string | null;
  marketStatus?: string | null;
  tradingEnabled?: boolean | null;
  availabilityBps?: number | null;
  userSettledUnits?: bigint | number | string | null;
  suspended?: boolean;
  closed?: boolean;
  retired?: boolean;
};

const steps = (states: MarketLifecycleStepState[]): MarketLifecycleStep[] => [
  {
    key: 'PUBLISHED',
    label: 'Published',
    state: states[0]!,
    subtitle: 'Public record is live',
  },
  {
    key: 'CUSTODY',
    label: 'Secure custody',
    state: states[1]!,
    subtitle: 'The physical collectible is protected',
  },
  {
    key: 'ISSUANCE',
    label: 'Issue ownership',
    state: states[2]!,
    subtitle: 'Supply and pricing are prepared',
  },
  {
    key: 'TRADING',
    label: 'Buy & sell live',
    state: states[3]!,
    subtitle: 'Manage your position in Slice',
  },
] as MarketLifecycleStep[];

function units(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function result(
  phase: MarketLifecyclePhase,
  copy: Omit<MarketLifecycleProjection, 'phase' | 'steps' | 'currentStep' | 'canBuy' | 'canSell'>,
  currentStep: number,
  input: MarketLifecycleInput,
): MarketLifecycleProjection {
  const live = phase === 'LIVE';
  const hasAvailability = (input.availabilityBps ?? 0) > 0;
  const hasSettledUnits = units(input.userSettledUnits) > 0n;
  const stateByStep: Record<MarketLifecyclePhase, MarketLifecycleStepState[]> = {
    UNPUBLISHED: ['blocked', 'blocked', 'blocked', 'blocked'],
    CUSTODY_REQUIRED: ['complete', 'current', 'upcoming', 'upcoming'],
    SUPPLY_APPROVAL_REQUIRED: ['complete', 'complete', 'current', 'upcoming'],
    READY_FOR_ISSUANCE: ['complete', 'complete', 'current', 'upcoming'],
    ISSUANCE_PENDING: ['complete', 'complete', 'complete', 'current'],
    LIVE: ['complete', 'complete', 'complete', 'complete'],
    SUSPENDED: ['complete', 'complete', 'complete', 'blocked'],
    CLOSED: ['complete', 'complete', 'complete', 'blocked'],
  };
  if (phase === 'SUSPENDED' && currentStep < 4) {
    stateByStep.SUSPENDED[currentStep - 1] = 'current';
    for (let index = currentStep; index < stateByStep.SUSPENDED.length; index += 1) {
      stateByStep.SUSPENDED[index] = 'blocked';
    }
  }
  const lifecycleSteps = steps(stateByStep[phase]);
  return {
    phase,
    ...copy,
    currentStep,
    canBuy: live && hasAvailability,
    canSell: live && hasSettledUnits,
    steps: lifecycleSteps,
  };
}

export function deriveMarketLifecycle(input: MarketLifecycleInput): MarketLifecycleProjection {
  const issued = units(input.issuedUnits) > 0n;
  const custodyComplete = input.custodyStatus === 'SECURED' || input.custodyBypass === true;
  const policyApproved = ['APPROVED', 'ISSUED'].includes(input.supplyPolicyStatus ?? '');
  const marketOpen = input.marketStatus === 'OPEN' && input.tradingEnabled !== false;
  const suspension =
    input.suspended === true ||
    input.marketStatus === 'HALTED' ||
    input.supplyStatus === 'FROZEN' ||
    input.custodyStatus === 'EXCEPTION';
  const closed =
    input.closed === true ||
    input.retired === true ||
    input.publicationStatus === 'ARCHIVED';

  if (!input.published || input.publicationStatus === 'UNPUBLISHED') {
    return result(
      'UNPUBLISHED',
      {
        badge: 'Not public',
        headline: 'Not publicly available',
        statusPill: 'Admin only',
        explanation: 'This collectible is still being prepared and is not visible in the public market.',
        tradeabilityMessage: null,
        nextAction: 'Publish when the collectible is ready',
        blockingDependency: 'Publication is required',
        admin: {
          publicState: 'Not public',
          internalState: 'Awaiting publication',
          nextAction: 'Publish when the collectible is ready',
          blockingDependency: 'Publication is required',
        },
      },
      1,
      input,
    );
  }
  if (closed) {
    return result(
      'CLOSED',
      {
        badge: 'Closed',
        headline: 'Market closed',
        statusPill: 'No longer trading',
        explanation: 'This collectible is no longer available for trading on Slice.',
        tradeabilityMessage: 'Buying and selling are no longer available for this collectible.',
        nextAction: 'No action available',
        blockingDependency: 'The market is permanently closed',
        admin: {
          publicState: 'Closed',
          internalState: 'Closed or retired',
          nextAction: 'No action available',
          blockingDependency: 'The market is permanently closed',
        },
      },
      4,
      input,
    );
  }
  if (suspension) {
    return result(
      'SUSPENDED',
      {
        badge: 'Paused',
        headline: 'Market temporarily unavailable',
        statusPill: 'Needs attention',
        explanation: 'Trading is temporarily unavailable while this collectible is under review.',
        tradeabilityMessage: 'Buying and selling are paused until the review is resolved.',
        nextAction: 'Resolve the lifecycle exception',
        blockingDependency: 'An operational exception must be resolved',
        admin: {
          publicState: 'Paused',
          internalState: 'Suspended or blocked',
          nextAction: 'Resolve the lifecycle exception',
          blockingDependency: 'An operational exception must be resolved',
        },
      },
      issued ? 4 : custodyComplete ? 3 : 2,
      input,
    );
  }
  if (issued && marketOpen) {
    return result(
      'LIVE',
      {
        badge: 'Live',
        headline: 'Live market',
        statusPill: 'Trading live',
        explanation: 'This collectible is available to buy and sell on Slice.',
        tradeabilityMessage: null,
        nextAction: 'Monitor the live market',
        blockingDependency: null,
        admin: {
          publicState: 'Live',
          internalState: 'Market open',
          nextAction: 'Monitor the live market',
          blockingDependency: null,
        },
      },
      4,
      input,
    );
  }
  if (issued) {
    return result(
      'ISSUANCE_PENDING',
      {
        badge: 'Issued',
        headline: 'Ownership issued',
        statusPill: 'Trading not open',
        explanation: 'Ownership has been issued, but trading is not open yet.',
        tradeabilityMessage: 'Trading will open once the market is enabled.',
        nextAction: 'Open the trading market when approved',
        blockingDependency: 'Trading market is not open',
        admin: {
          publicState: 'Issued',
          internalState: 'Issued, awaiting market open',
          nextAction: 'Open the trading market when approved',
          blockingDependency: 'Trading market is not open',
        },
      },
      4,
      input,
    );
  }
  if (custodyComplete && policyApproved) {
    return result(
      'READY_FOR_ISSUANCE',
      {
        badge: 'Ready for issuance',
        headline: 'Ownership ready to issue',
        statusPill: 'Not yet available',
        explanation: 'Custody and supply preparation are complete. Ownership has not been issued yet.',
        tradeabilityMessage: 'Issue ownership before buying and selling can open.',
        nextAction: 'Issue ownership units',
        blockingDependency: 'Issuance has not been executed',
        admin: {
          publicState: 'Ready for issuance',
          internalState: 'Approved supply, awaiting issuance',
          nextAction: 'Issue ownership units',
          blockingDependency: 'Issuance has not been executed',
        },
      },
      3,
      input,
    );
  }
  if (custodyComplete) {
    return result(
      'SUPPLY_APPROVAL_REQUIRED',
      {
        badge: 'Pre-market',
        headline: 'Ownership setup required',
        statusPill: 'Not yet available',
        explanation: 'Custody is complete. Ownership supply must be approved before trading can open.',
        tradeabilityMessage: 'Approve the ownership supply before issuance can begin.',
        nextAction: 'Approve the ownership supply',
        blockingDependency: 'Supply policy approval is required',
        admin: {
          publicState: 'Pre-market',
          internalState: 'Ready for supply approval',
          nextAction: 'Approve the ownership supply',
          blockingDependency: 'Supply policy approval is required',
        },
      },
      3,
      input,
    );
  }
  return result(
    'CUSTODY_REQUIRED',
    {
      badge: 'Pre-market',
      headline: 'Market opening soon',
      statusPill: 'Not yet available',
      explanation: 'This collectible is published, but it is not ready to trade yet.',
      tradeabilityMessage: 'Slice must complete custody before ownership can be issued.',
      nextAction: 'Secure custody for the collectible',
      blockingDependency: 'Secured custody is required',
      admin: {
        publicState: 'Pre-market',
        internalState: 'Awaiting secured custody',
        nextAction: 'Secure custody for the collectible',
        blockingDependency: 'Secured custody is required',
      },
    },
    2,
    input,
  );
}
