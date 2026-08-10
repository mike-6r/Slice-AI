# Decision register

Status labels: **SUPPORTED** means an implementation guide explicitly defines the boundary; **OPEN** means no approved repository decision exists; **PROPOSED** means a guide calls for design but leaves the policy value unspecified.

## Document 017 phase-1 event contract

- **SD-017-01 — transactional outbox:** producers append a versioned, safe JSON event envelope through the same PostgreSQL transaction as their authoritative mutation. Event names are stable dotted lower-case contracts; `eventId` is unique; pending event ordering is `availableAt`, `createdAt`, `id`; no global causal-order guarantee is claimed. Phase 1's only producer is `trade.completed`, whose payload contains only execution ID, asset ID, units, GBP minor-unit price/gross and currency. It is suitable for a future Discord consumer but Document 017 does not implement Discord behavior.
- **SD-017-02 — worker delivery semantics:** outbox dispatch is at-least-once. PostgreSQL leases use `FOR UPDATE SKIP LOCKED` and an opaque claim token; a finalizer must own its current token. Attempts increment only when a handler begins. Retryable failures use configurable exponential backoff with bounded jitter and a configurable five-attempt default; terminal schema/payload failures and exhausted retries persist as immutable `DEAD_LETTER`. Every consumer must idempotently deduplicate on stable `eventId`; Discord remains a future consumer, not a phase-2 behavior.
- **SD-017-03 — delivery routing:** a routed outbox event creates provider-neutral, durable delivery work identified by `<eventId>:<channel>:<logicalDestination>`. A public trade route is platform policy, not a user preference. Product preferences may suppress only optional user routes; mandatory routes override opt-out. External delivery is at-least-once by stable delivery ID/idempotency key and is not implemented in this phase.

## Document 015 user-authorized governance and distribution variables

These are **USER-AUTHORIZED PRODUCTION-SHAPED INITIAL VARIABLES**, editable before launch. They enable the bounded Document 015 authority only; they do not authorize a custody provider, payment provider, tax treatment, or physical custody release.

- **SD-015-01 governance legal gate:** weighted beneficial-owner voting is fail-closed by default. It can be enabled only with the explicit `GOVERNANCE_WEIGHTED_VOTING_ENABLED=true` deployment configuration while legal approval is maintained. Tests set it deliberately; no provider or legal verification is claimed live.
- **SD-015-02 voting policy:** the initial configurable voting window is seven days, quorum is 2,000 bps of immutable snapshot units, approval is strictly greater than 5,000 bps of cast weight, and a tie rejects. A voter may explicitly replace their vote before close; the superseded vote remains historical and only the current vote counts.
- **SD-015-03 distribution fee:** the initial configurable distribution fee is 0 bps, bounded to 0..1,000 bps. Fee calculation is integer GBP minor-unit arithmetic and uses deterministic ceiling rounding; no tax or undisclosed fee treatment is inferred.
- **SD-015-04 sale and proceeds boundary:** external-sale evidence and active custody confirmation are required. Distribution only debits a pre-existing, finance-authoritative GBP proceeds account backed by a posted journal; Document 015 neither receives provider funds nor releases physical custody.
- **SD-015-05 allocation and privacy:** net proceeds use largest-remainder allocation over the immutable ownership snapshot. Proposals expose aggregate tally only; buyer reference, voter identities, account IDs and private holding data remain private.
- **SD-015-06 two-person sale verification:** two distinct non-proposer approvals are required before an external sale can become `VERIFIED` and its proposal can become `SOLD`. Approval identities are durable internally and are not exposed in public proposal/distribution DTOs.

## Document 014 user-authorized production-shaped initial variables

The legacy local-test wording below is superseded by the following user-authorized, editable-before-launch production-shaped variables. Any conflicting earlier wording is not operative.

- **SD-014-01 fee policy:** maker fee is `0` bps and taker fee is `100` bps, represented as bounded integer basis points (`0..1000`) with an explicit policy version. Document 014 applies that internal GBP fee in the same balanced execution journal (buyer gross+fee, seller gross-fee, platform fee revenue); it does not implement an external/provider transfer or revive a 10% fee.
- **SD-014-02 tick, lot and notional:** each market persists configurable integer GBP minor-unit tick and ownership-unit lot values, initially one penny and one unit. The configurable minimum notional is initially 100 minor units (£1.00).
- **SD-014-03 cancellation and self-trade:** OPEN and PARTIALLY_FILLED remainder is cancellable by its owner and releases its reservation; terminal orders are not. `REJECT_TAKER` self-trade prevention is a mandatory market policy.
- **SD-014-04 market and eligibility:** markets explicitly support OPEN, HALTED and CLOSED status plus trading-enabled state. Placement/settlement require an ACTIVE authenticated user and provider-neutral eligibility placeholders. Document 016's local deterministic compliance/wallet authority is separate; it does not claim a live KYC/KYT or external-money provider.

> The legacy local-test-only bullets retained below are archival and non-operative. The four production-shaped variables above are the sole Document 014 policy authority.

- **SD-014-01 — fee schedule:** local/test matching applies an exact zero platform fee. This is not production fee approval and no fee/proceeds treatment is inferred.
- **SD-014-02 — tick and lot:** GBP limit prices are integer minor units with a minimum tick of one penny; the minimum order quantity is one existing integer ownership unit.
- **SD-014-03 — cancellation and self-trade:** users may cancel only their OPEN or PARTIALLY_FILLED orders and cancellation releases the remainder. Terminal orders are not cancellable. Self-trades are prohibited; the matcher cancels/rejects the taker without execution.
- **SD-014-04 — market and eligibility:** local/test markets are always open. Placement and settlement require an authenticated ACTIVE user and provider-neutral local eligibility only. External provider certification remains separate from trading eligibility.

- **SD-016-01 — provider selection:** Bridge is the approved external-money adapter boundary for deposits, withdrawals, external accounts, virtual accounts and transfers. Its local implementation is complete; sandbox certification remains pending. `BRIDGE_API_KEY`, `BRIDGE_API_BASE_URL`, and `BRIDGE_WEBHOOK_PUBLIC_KEY` are required in explicitly enabled Bridge production mode; local mode remains deterministic and never silently falls back from Bridge mode. Bridge signatures use the documented `X-Webhook-Signature` RSA scheme.

- **SD-016-02 — identity and customer watchlist selection:** Plaid is the approved identity-verification and Monitor adapter boundary. Its local implementation is complete; sandbox certification remains pending. It uses an opaque Slice user ID as `client_user_id`; `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, and `PLAID_IDV_TEMPLATE_ID` are required for enabled production provider mode. Identity Verification and Monitor remain provider-specific; Slice persists only encrypted references and normalized decisions.

- **SD-016-03 — blockchain KYT selection:** BlockchainAnalysis.io is the approved transaction-by-transaction crypto KYT adapter. Its local implementation is complete; live/account certification remains pending. `BLOCKCHAIN_ANALYSIS_API_KEY`, `BLOCKCHAIN_ANALYSIS_API_BASE_URL`, and `BLOCKCHAIN_ANALYSIS_REQUEST_TIMEOUT_MS` configure it. It screens only real supplied addresses and explicitly mapped chains; unsupported/missing chain data and provider failures fail closed before cash reservation. It is not a replacement for Plaid identity/Monitor or a continuous-monitoring enrollment authority.

| ID | Decision | Status | Evidence / owner |
| --- | --- | --- | --- |
| SD-010-01 | Document 010 owns private submissions, evidence uploads, secure media lifecycle, review preparation, reviewer decisions, and handoff only. | SUPPORTED | Document 010 §§5, 8–18. |
| SD-010-02 | Document 010 approval does not prove authenticity or authorize valuation, custody, insurance, publication, ownership, or trading. | SUPPORTED | Document 010 §§6, 10, 14; Document 011 §§2, 7, 10. |
| SD-010-03 | Media is private, object keys are generated/non-guessable, and client filenames/MIME/checksum/dimensions are not trusted. | SUPPORTED | Document 010 §§9–15. |
| SD-010-04 | Local/test storage may be used when provider approval is absent; production uploads must be disabled by feature flag and must not claim scanning. | SUPPORTED | Document 010 §7. |
| SD-010-05 | Seller edits are limited to `DRAFT` and `CHANGES_REQUESTED`; submit requires required SAFE evidence and version match. | SUPPORTED | Document 010 §10. |
| SD-010-06 | Review self-assignment is forbidden; review claims/decisions require audit, idempotency and concurrency protection. | SUPPORTED | Document 010 §§10–15. |
| SD-010-07 | Publication requires separate 011 valuation/custody/insurance/readiness evidence. | SUPPORTED | Document 011 §§5–12. |
| SD-010-08 | Required media-slot matrix by category. | OPEN | Document 010 requires it but does not define it. |
| SD-010-09 | Retention, erasure, legal hold, and deletion timelines for submission evidence. | OPEN | Document 010 says “per policy”; no policy exists. |
| SD-010-10 | Reviewer lease duration, reassignment, and stale-case escalation. | PROPOSED | Document 010 calls for a lock/lease but provides no operations value. |
| SD-010-11 | Seller eligibility, fees, KYC/KYB, tax, payout, and jurisdiction restrictions. | OPEN / later scope | Not supported by the completed documents; provider/compliance work is later scope. |
| SD-010-12 | Public wording for “approved” and Document 011 publication readiness. | OPEN | Claims must remain conservative until later evidence contracts exist. |
