import type { ProposalStatus, SaleProposalSummary } from "@/domain";

export type ProposalScope = "FOR_YOU" | "ACTIVE" | "CLOSED" | "ALL";

const CLOSED_STATUSES: ProposalStatus[] = [
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "SALE_PENDING",
  "SOLD",
  "DISTRIBUTED",
  "FAILED",
];

export type GovernanceMetrics = {
  listed: number;
  active: number;
  finalised: number;
  eligible: number;
  awaiting: number;
  voted: number;
};

export function calculateGovernance(items: SaleProposalSummary[]): GovernanceMetrics {
  return {
    listed: items.length,
    active: items.filter((item) => item.status === "OPEN").length,
    finalised: items.filter((item) => CLOSED_STATUSES.includes(item.status)).length,
    eligible: items.filter(
      (item) => item.viewerState === "ELIGIBLE" || item.viewerState === "ALREADY_VOTED",
    ).length,
    awaiting: items.filter((item) => item.viewerState === "ELIGIBLE").length,
    voted: items.filter((item) => item.status === "OPEN" && item.viewerState === "ALREADY_VOTED")
      .length,
  };
}

export function scopeItems(items: SaleProposalSummary[], scope: ProposalScope) {
  if (scope === "FOR_YOU") {
    return items.filter(
      (item) => item.viewerState === "ELIGIBLE" || item.viewerState === "ALREADY_VOTED",
    );
  }
  if (scope === "ACTIVE") return items.filter((item) => item.status === "OPEN");
  if (scope === "CLOSED") return items.filter((item) => CLOSED_STATUSES.includes(item.status));
  return items;
}

export function weightedVote(item: SaleProposalSummary) {
  const approve = BigInt(item.approveUnits);
  const reject = BigInt(item.rejectUnits);
  const cast = approve + reject;
  const approvePercent = cast === 0n ? 50 : Number((approve * 100n) / cast);
  const rejectPercent = cast === 0n ? 50 : 100 - approvePercent;
  return {
    approvePercent,
    rejectPercent,
    approveLabel: `${approvePercent}% approve`,
    rejectLabel: `${rejectPercent}% reject`,
    accessibleLabel:
      cast === 0n
        ? "No weighted votes have been recorded."
        : `${approvePercent}% weighted approval and ${rejectPercent}% weighted rejection.`,
  };
}

export function weightedParticipation(item: SaleProposalSummary) {
  const eligible = BigInt(item.eligibleUnits);
  const cast = BigInt(item.approveUnits) + BigInt(item.rejectUnits);
  const percent = eligible === 0n ? 0 : Math.min(100, Number((cast * 100n) / eligible));
  return {
    percent,
    label: `${percent}% turnout`,
    accessibleLabel:
      eligible === 0n
        ? "No eligible ownership units were recorded."
        : `${percent}% of eligible ownership units have cast a current weighted vote.`,
  };
}
