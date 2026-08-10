# 015 — Community, governance and distributions

## 1. Document metadata

Phase 6; **COMPLETE**; high risk; requires 005 and 012–014. Supports discussions, collector following and `/sell-proposal/$id`. Affects community/moderation/governance/distribution. Large; limited parallel safety.

## 2. Project-specific context

Frontend discussion/proposal repository ports exist and the sale-proposal route simulates ownership-weighted voting. Collector follow is local. A physical sale proposal must snapshot eligible ownership, enforce one weighted vote and distribute net proceeds through the real ledger; community content needs moderation. Current mocks are not authority.

## 3. Current implementation audit

No backend discussion/follow/proposal/vote/moderation/distribution entities exist. Preserve identity, ownership, finance and trading ports. Do not execute physical custody release or money movement based on local percentages. Missing quorum/timing/eligibility/fees/tie policy and legal approval.

## 4. Files to read

Read sell-proposal, collectors/collector/asset routes; community/collector/ownership/portfolio domain; repositories/services/hooks/mocks; 005 and 012–014 modules/tests; custody/publication; all guides/state.

## 5. Strict scope

Implement follows; asset discussions/replies with moderation/reporting; sale proposals; immutable ownership eligibility snapshot; weighted votes; quorum/outcome; approved physical-sale execution state; exact fee/net/distribution calculation and ledger posting orchestration.

## 6. Out of scope

No social feed/recommendation, DMs, arbitrary polls, auction/buyer/payment provider, custody release before approved external sale, tax advice, frontend redesign or notification delivery (017).

## 7. Dependencies and preconditions

Require moderation policy, legal approval for governance/beneficial owner voting, quorum/threshold/tie/voting period/fee rules, active custody and reconciliation. Default only if explicitly approved: snapshot at proposal open; one vote per eligible account; weight=snapshot settled units; quorum based on eligible units; >50% of cast eligible weight and quorum to approve. Stop if policy is unapproved.

## 8. Database specification

`CollectorFollow(followerUserId,followedUserId,createdAt)` unique/no self; `DiscussionPost(id,assetId,userId,parentId?,body,status VISIBLE|HIDDEN|REMOVED|LOCKED,editedAt?,createdAt)`; `ContentReport(id,postId,reporterId,reason,status)` unique active reporter/post; `ModerationAction` append-only. `SaleProposal(id,assetId,proposerId,status DRAFT|OPEN|APPROVED|REJECTED|EXPIRED|CANCELLED|SALE_PENDING|SOLD|DISTRIBUTED|FAILED,offerMinor,currency,feeVersion,opensAt,closesAt,snapshotSequence,eligibleUnits,quorumBps,approvalBps,buyerRef private,version,timestamps)`; `ProposalEligibility(proposalId,accountId,userId?,units)` unique; `Vote(proposalId,accountId,choice APPROVE|REJECT,weightUnits,castBy,createdAt)` unique; `Distribution(id,proposalId,status,gross/fee/net minor,currency,financeTransactionId?,createdAt)`; `DistributionLine(distributionId,accountId,units,amountMinor,remainderRank)` unique. Append-only votes/snapshots/distribution lines. Migration `community_governance_distributions`.

## 9. Domain types and ports

Community/follow/post/report/moderation repositories; `GovernanceRepository` lock proposal, store snapshot, vote, tally, transition; `OwnershipSnapshotPort`; `CustodySalePort`; `FinancialDistributionPort`; `DistributionCalculator` largest-remainder deterministic allocation; clock/audit/idempotency/outbox.

## 10. Domain rules and invariants

Follow self forbidden/idempotent. Content plain-text length/rate limits; author edit allowed only before lock/removal and audited; moderator hides/removes with reason. Proposal only eligible owner/authorized custodian, one OPEN per asset, trading/transfer policy freezes or snapshot decisively; eligibility immutable. Vote weight fixed at snapshot, cannot exceed it, vote immutable (or one explicit replace policy, choose and test). Close once after deadline; quorum/threshold exact integer math. Distribution sum lines == net proceeds; fee + net == gross; largest remainder assigns every penny deterministically; post once. Terminal states cannot reopen.

## 11. Application services

Follow/unfollow; create/edit/report/moderate post. Create/open proposal validates asset/custody and builds snapshot in transaction. Cast vote locks proposal/eligibility, validates window/actor and appends. Close tallies snapshot and transitions. RecordExternalSale verifies approved offer/custody evidence. Calculate/PostDistribution locks SOLD proposal, computes fees/lines and invokes balanced 013 posting idempotently, then marks DISTRIBUTED and emits events.

## 12. API specification

`PUT/DELETE /v1/collectors/:id/follow`; `GET/POST /v1/assets/:id/discussions`; `PATCH/DELETE /v1/discussions/:id`; `POST /:id/reports`; moderation admin endpoints. `POST /v1/assets/:id/sale-proposals`; `GET /v1/sale-proposals/:id`; `POST /:id/votes`; admin/system `/close`, `/record-sale`, `/distribute`. Reads expose tally consistent with policy and hide voter identities; mutations auth/idempotency/rate/audit.

## 13. Error catalogue

`SELF_FOLLOW_FORBIDDEN`, `CONTENT_INVALID`, `CONTENT_LOCKED`, `PROPOSAL_ALREADY_OPEN`, `NOT_ELIGIBLE_TO_PROPOSE/VOTE`, `VOTING_NOT_OPEN/CLOSED`, `VOTE_ALREADY_CAST`, `QUORUM_NOT_MET`, `PROPOSAL_STATE_CONFLICT`, `SALE_EVIDENCE_REQUIRED`, `DISTRIBUTION_ALREADY_POSTED`, `DISTRIBUTION_INVARIANT_VIOLATION`; appropriate 400/403/409/422/500, safe/non-enumerating.

## 14. Authorization and security

Self/owner checks in query; moderators scoped and cannot erase audit. Sanitize text, prevent HTML, spam/rate controls. Vote actor must control snapshot account; admin cannot alter weight/tally. Buyer refs and individual holdings private. Sale/distribution needs recent auth/service identity/two-person approval.

## 15. Audit and idempotency

Audit moderation, proposal lifecycle, vote receipt (choice visibility per policy), sale and distribution; no post body/buyer PII. All mutations idempotent; vote uniqueness/snapshot sequence/distribution finance correlation provide secondary defenses.

## 16. Events, realtime and jobs

Outbox `community.*`, `governance.proposal.opened/updated/closed.v1`, `governance.vote.cast.v1`, `distribution.posted.v1`; 017 schedules close and delivers notifications. Duplicate close/distribute jobs are no-ops; dead-letter alerts admin.

## 17. Frontend alignment

Map discussion/proposal repositories/hooks and collector follow UI. Proposal response includes window, own eligibility/vote, quorum/tally/status and safe amounts. No frontend changes here.

## 18. Implementation file plan

Create community/governance modules, migration/controllers/tests and distribution adapter to finance. Preserve ledgers/trading/frontend/provider integrations.

## 19. Numbered implementation process

1. Approve moderation/governance/fee policy.
2. Add entities/migration and pure tally/distribution math.
3. Implement follow/discussion/moderation.
4. Implement proposal snapshot/open/vote/close.
5. Implement sale evidence and exact distribution posting.
6. Add APIs/audit/idempotency/events.
7. Run DB races/rounding/rollback/E2E tests.
8. Update state.

## 20. Test plan

Unit content/state/quorum/tie/deadline/weight/largest-remainder. DB follow/vote/open/close/distribute races, immutable snapshot/votes, rollback. E2E permissions/privacy/rates/idempotency/moderation/proposal flow. Reconcile distribution journal and ownership snapshot. No provider/browser visual test.

## 21. Manual QA

Create owners/posts/reports; moderate; open proposal and snapshot; trade after snapshot per approved policy; vote/tally/close; record approved test sale; distribute awkward pennies and verify exact sum/journal/audit/events. Test duplicate/concurrent actions.

## 22. Verification commands

Server Prisma, lint, unit/property, integration/concurrency, E2E, build; run finance reconciliation. Root typecheck/build for DTO fixtures.

## 23. Documentation and state updates

Update all state/control/API/entity/business/workflow/feature/baseline docs and record approved policy/version.

## 24. Completion checklist

- [x] Follow/content/moderation ownership and abuse rules pass.
- [x] Snapshot eligibility/units are immutable and auditable.
- [x] Voting window, one-vote and exact quorum/threshold rules pass races.
- [x] Proposal lifecycle cannot skip/reopen terminal states.
- [x] Gross=fees+net and distribution lines sum exactly to net.
- [x] Distribution posts once to balanced ledger and recovery finalizes a committed journal exactly once.
- [x] Private holdings/voter/buyer data never leaks.
- [x] DB/E2E/reconciliation tests pass.

## 27. Completion evidence (2026-08-08)

- Migration `20260808052000_external_sale_two_person_approval` brings the local schema to **21** migrations. It persists unique verifier approvals and enforces two distinct non-proposer approvals before `VERIFIED`/`SOLD`.
- Policy is fail-closed for weighted beneficial-owner voting unless `GOVERNANCE_WEIGHTED_VOTING_ENABLED=true`; the versioned seven-day, quorum, strict-majority and 0-bps distribution-fee variables are bounded and tested.
- Real PostgreSQL proof covers immutable snapshots, concurrent proposal opens/votes/sale approvals, replacement/close rollback, exact largest-remainder allocation, balanced distribution posting, posted-journal finalization recovery and deterministic no-repair reconciliation mismatches.
- Disposable `npm run qa:community` passed with real PostgreSQL and Redis and reported zero scoped proposals, distributions, assets and users after cleanup. No Document 016 provider/compliance work was started.

## 25. Final report format

Report all 17 standard items and next document `016`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
