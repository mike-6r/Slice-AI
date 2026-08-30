import type { AssetOperationsBoardResponse } from "@/data/repositories";

export const assetOperationsTabs = [
  ["all", "All"],
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
        title: "No post-intake assets are active in Asset Operations",
        detail:
          "Assets appear here after verified receipt and custody have been established in Physical Intake.",
      };
}
