import type { AssetOperationsBoardResponse } from "@/data/repositories";

export const assetOperationsTabs = [
  ["all", "All Active"],
  ["needs-action", "Needs action"],
  ["valuation", "Valuation"],
  ["ownership", "Ownership setup"],
  ["offering", "Offering setup"],
  ["ready-for-launch", "Ready for launch"],
  ["market-live", "Market live"],
  ["exceptions", "Exceptions"],
] as const;

export function assetOperationsTabCount(
  tab: string,
  counts: AssetOperationsBoardResponse["counts"],
) {
  return (
    (
      {
        all: counts.all,
        "needs-action": counts.needsAction,
        valuation: counts.valuationPending,
        ownership: counts.ownershipPending,
        offering: counts.offeringSetup,
        "ready-for-launch": counts.readyForLaunch,
        "market-live": counts.marketLive,
        exceptions: counts.exceptions,
      } as Record<string, number>
    )[tab] ?? 0
  );
}

export function assetOperationsEmptyCopy(filtered: boolean) {
  return filtered
    ? {
        title: "No assets match this queue view",
        detail: "Adjust the server-side search or filters to widen this view.",
      }
    : {
        title: "No canonical assets are active in Asset Operations",
        detail:
          "Canonical assets appear here with their current physical and market lifecycle state.",
      };
}

export function assetOperationsMarketPresentation(state: string) {
  if (state === "RESTRICTED") {
    return {
      state: "Historical published",
      detail: "Currently blocked",
      tone: "muted",
    } as const;
  }
  if (state === "MARKET_LIVE") {
    return { state: "Market live", detail: "Trading", tone: "mint" } as const;
  }
  if (state === "READY_FOR_LAUNCH") {
    return { state: "Launch review", detail: "Awaiting approval", tone: "blue" } as const;
  }
  if (state === "INITIAL_OFFERING") {
    return { state: "Initial Offering", detail: "Offering active", tone: "violet" } as const;
  }
  return null;
}

export function assetOperationsBlockerSummary(
  needsAction: number,
  blockers: Array<{ count: number }>,
) {
  return {
    assets: needsAction,
    conditions: blockers.reduce((total, blocker) => total + blocker.count, 0),
  };
}
