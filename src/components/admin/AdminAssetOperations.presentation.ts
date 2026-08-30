import type { AssetOperationsBoardResponse } from "@/data/repositories";

export const assetOperationsTabs = [
  ["all", "All"],
  ["needs-action", "Needs action"],
  ["valuation", "Valuation"],
  ["ownership", "Ownership setup"],
  ["offering", "Offering setup"],
  ["launch-readiness", "Launch readiness"],
  ["ready-for-launch", "Ready for launch"],
  ["market-live", "Market live"],
  ["restrictions", "Restrictions / exceptions"],
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
        "launch-readiness": counts.launchReadiness,
        "ready-for-launch": counts.readyForLaunch,
        "market-live": counts.marketLive,
        restrictions: counts.restrictions,
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
        title: "No assets are ready for Asset Operations",
        detail:
          "Canonical assets appear here after physical intake, verification, and custody are complete.",
      };
}
