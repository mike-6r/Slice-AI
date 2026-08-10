import type { AssetId } from "./asset";
import type { ISODateTime } from "./common";
import type { UserId } from "./user";
export interface Reaction {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
}
export interface Reply {
  id: string;
  authorId: UserId;
  body: string;
  createdAt: ISODateTime;
}
export interface DiscussionMessage {
  id: string;
  assetId: AssetId;
  authorId: UserId;
  body: string;
  createdAt: ISODateTime;
  reactions: Reaction[];
  replies: Reply[];
}
export interface PollOption {
  id: string;
  label: string;
  voteCount: number;
}
export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  closesAt: ISODateTime;
}
export type ProposalStatus =
  | "DRAFT"
  | "OPEN"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED"
  | "SALE_PENDING"
  | "SOLD"
  | "DISTRIBUTED"
  | "FAILED";
export type ProposalViewerState =
  "ELIGIBLE" | "ALREADY_VOTED" | "NOT_ELIGIBLE" | "NOT_OPEN" | "CLOSED" | "LEGAL_GATE_DISABLED";
export interface SaleProposal {
  id: string;
  assetId: AssetId;
  status: ProposalStatus;
  offerMinor: string;
  currency: "GBP";
  opensAt: ISODateTime | null;
  closesAt: ISODateTime | null;
  eligibleUnits: string;
  approveUnits: string;
  rejectUnits: string;
  votingEnabled: boolean;
  ownVote: "APPROVE" | "REJECT" | null;
}
export interface SaleProposalSummary extends SaleProposal {
  asset: { id: AssetId; slug: string; title: string };
  closedAt: ISODateTime | null;
  viewerState: ProposalViewerState;
  viewerEligibleUnits: string | null;
}
export interface SaleProposalPage {
  items: SaleProposalSummary[];
  nextCursor: string | null;
}
export interface Vote {
  proposalId: string;
  voterId: UserId;
  optionId: string;
  createdAt: ISODateTime;
}
