import { describe, expect, it } from "vitest";
import type { SaleProposalSummary } from "@/domain";
import { mockRepositories } from "@/mocks/repositories";
import { createAppServices } from "@/services";
import {
  calculateGovernance,
  scopeItems,
  weightedParticipation,
  weightedVote,
} from "./-governance-presentation";

const eligible: SaleProposalSummary = {
  id: "proposal-safe",
  assetId: "asset-internal" as never,
  asset: { id: "asset-public" as never, slug: "safe-asset", title: "Safe asset" },
  status: "OPEN",
  offerMinor: "10000",
  currency: "GBP",
  opensAt: "2026-08-08T00:00:00.000Z" as never,
  closesAt: "2026-08-15T00:00:00.000Z" as never,
  closedAt: null,
  eligibleUnits: "100",
  approveUnits: "20",
  rejectUnits: "5",
  votingEnabled: true,
  viewerState: "ELIGIBLE",
  viewerEligibleUnits: "60",
  ownVote: null,
};

describe("Document 015 governance frontend contract", () => {
  it("uses bounded API repository data and preserves unavailable eligibility rather than inventing a vote", async () => {
    const repositories = {
      ...mockRepositories,
      proposals: {
        ...mockRepositories.proposals,
        listSaleProposals: async () => ({
          items: [{ ...eligible, viewerState: "NOT_ELIGIBLE" as const, viewerEligibleUnits: null }],
          nextCursor: null,
        }),
      },
    };
    const page = await createAppServices(repositories).repositories.proposals.listSaleProposals();
    expect(page.items[0]).toMatchObject({
      viewerState: "NOT_ELIGIBLE",
      ownVote: null,
      viewerEligibleUnits: null,
    });
    expect(JSON.stringify(page)).not.toMatch(
      /accountId|journal|reservation|counterparty|provider|audit|voterId|proposer/i,
    );
    expect(JSON.stringify(page)).not.toMatch(
      /token|staking|delegation|treasury|return|performance|allocation|profit|pnl/i,
    );
  });

  it("derives dashboard metrics only from safe loaded summaries", () => {
    const data = calculateGovernance([
      eligible,
      { ...eligible, id: "already-voted", viewerState: "ALREADY_VOTED", ownVote: "APPROVE" },
      { ...eligible, id: "final", status: "REJECTED", viewerState: "CLOSED", ownVote: "REJECT" },
    ]);
    expect(data).toEqual({
      listed: 3,
      active: 2,
      finalised: 1,
      eligible: 2,
      awaiting: 1,
      voted: 1,
    });
  });

  it("keeps proposal filters ownership-aware and does not surface private activity", () => {
    const items: SaleProposalSummary[] = [
      eligible,
      { ...eligible, id: "already-voted", viewerState: "ALREADY_VOTED", ownVote: "APPROVE" },
      { ...eligible, id: "not-eligible", viewerState: "NOT_ELIGIBLE" },
      { ...eligible, id: "closed", status: "APPROVED", viewerState: "CLOSED" },
    ];
    expect(scopeItems(items, "FOR_YOU").map((item) => item.id)).toEqual([
      "proposal-safe",
      "already-voted",
    ]);
    expect(scopeItems(items, "ACTIVE")).toHaveLength(3);
    expect(scopeItems(items, "CLOSED").map((item) => item.id)).toEqual(["closed"]);
  });

  it("uses weighted turnout and vote split without claiming a backend quorum result", () => {
    expect(weightedVote(eligible)).toMatchObject({
      approvePercent: 80,
      rejectPercent: 20,
      approveLabel: "80% approve",
    });
    expect(weightedParticipation(eligible)).toMatchObject({ percent: 25, label: "25% turnout" });
    expect(weightedParticipation({ ...eligible, eligibleUnits: "0" })).toMatchObject({
      percent: 0,
      label: "0% turnout",
    });
  });
});
