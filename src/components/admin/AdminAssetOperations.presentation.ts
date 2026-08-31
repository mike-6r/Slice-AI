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

export function assetOperationsHealthSegments(health: {
  onTrack: number;
  atRisk: number;
  blocked: number;
  exceptions: number;
}) {
  const total = health.onTrack + health.atRisk + health.blocked + health.exceptions;
  const entries = [
    { key: "on-track", label: "On track", value: health.onTrack },
    { key: "at-risk", label: "At risk", value: health.atRisk },
    { key: "blocked", label: "Blocked", value: health.blocked },
    { key: "exception", label: "Exceptions", value: health.exceptions },
  ] as const;

  return entries
    .filter((entry) => entry.value > 0)
    .map((entry) => ({
      ...entry,
      percent: total ? Math.round((entry.value / total) * 100) : 0,
    }));
}

export function resolveAssetOperationsSelection(
  current: string | "closed" | null,
  incoming: string | undefined,
) {
  if (incoming) return incoming;
  if (current && current !== "closed") return "closed";
  return current;
}
