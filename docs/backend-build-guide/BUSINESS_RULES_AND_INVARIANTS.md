# Business rules and invariants

## Document 018 Phase 3 operational invariants (2026-08-08)

Production starts with new-risk controls disabled unless explicitly deployment-enabled. A pause stops
new risk only: it must not prevent safe reads, cancellation, reconciliation or signed provider
recovery. Financial, ownership, trading, provider and outbox authority remains PostgreSQL-backed;
Redis loss must not create or erase that authority.

- **Identity:** Argon2id hashes only; never trim passwords or return/log hashes/tokens. Normalize
  email only. Refresh tokens are opaque, stored hashed, rotate once, and reuse revokes the family.
  Suspended/closed users cannot act; role/status changes need reason, policy, audit and session
  revocation when required. Idempotency keys bind method/path/recursively canonicalized body and cannot be reused
  with different input.
- **Identity persistence (003):** normalized email and refresh-token hash conflicts map to typed repository conflicts; session rotation is performed inside one Prisma transaction; active role uniqueness is enforced by a PostgreSQL partial unique index; audit/status history remain append-only; idempotency completion is compare-and-set.
- **Auth security remediation (004):** a revoked access session may replay logout-all only with an existing completed composite idempotency record whose `POST /auth/logout-all` fingerprint matches; it can never acquire or execute a new logout-all mutation. Auth limiter increments and first-write TTL assignment are one Redis atomic operation; 429 responses carry a bounded `Retry-After`. Unknown-email and wrong-password login each perform one configured password verification. Production rejects insecure refresh-cookie configuration and proxy trust is an explicit bounded hop count.
- **Access control (005):** privileged endpoints are deny-by-default named-permission routes. Current grants are explicit `GLOBAL/*` scoped assignments, unique while active; client input never supplies the acting role/status. Status transitions use the approved transition table and atomically write status history, audit and required session revocations. Users cannot grant themselves roles or remove the final active administrator. Admin mutations require composite durable idempotency; safe replays do not repeat mutations/audits. Audit reads are paged and metadata-redacted. Redis control limits are hashed, namespaced, atomic and fail closed; 429 responses carry standard rate-limit headers.
- **Access-control security remediation (005):** RESTRICTED revokes all current sessions and denies mutations/refresh; narrowly guarded self read/session/logout endpoints may accept only a session revoked specifically for RESTRICTED. Active GLOBAL administrators are protected by a PostgreSQL transaction advisory lock across revoke, disabling-status, and bootstrap mutations. Role scopes other than `GLOBAL/*` have no authorization effect. High-impact role and disabling-status mutations require server-persisted authentication freshness. Audit metadata is allowlisted and recursively secret-screened on write; denied privileged actions are durable audit events; audit pagination uses `(createdAt,id)` cursors. Normal rotation and refresh replay use distinct session reasons.
- **Assets:** only required metadata/media/certification evidence enters verification; only approved,
  vaulted, insured (where policy requires) and published assets are public/listable. Status and
  reviewer/custody history are append-only; media is private by default and signed access is scoped.
- **Submissions (010):** only the owner can change a `DRAFT` or `CHANGES_REQUESTED` submission with its expected version. Submission requires SAFE front/back evidence after server-side MIME, signature, size, dimensions, checksum and scanner checks. Object keys are randomized and filenames/URLs remain private. A reviewer cannot review their own work; claims have one winner; review decisions, audits and owner notifications are idempotent. `APPROVED` is a handoff state only, never a valuation, custody, insurance or publication claim.
- **Vault/insurance:** custody sequence cannot be edited/deleted; physical release needs authorized
  transition, chain-of-custody and compliance checks. Insurance must be current before policies that
  promise cover; UI labels never overstate coverage.
- **Lifecycle publication (011):** approved handoff creates only expected intake. Custody uses the explicit transition table under a record lock; valuation evidence is append-only and a replacement decision supersedes the active decision. Current coverage requires ACTIVE status and an in-window expiry. Publication requires approved submission, secured custody, active valuation and current coverage; it locks the asset, writes `publishedAt` once, and repeated/concurrent publication is a no-op without duplicate audit or owner notification. Public projections expose only durable, allowlisted status and never provider/location/policy/certification internals.
- **Ownership:** fixed supply is issued once; available + reserved + held always equals supply;
  positions/reservations never negative; no transfer/double issue/over-reservation; append-only
  ledger entries and atomic ownership mutations under locks are authority. Exact idempotent replay
  creates no ledger state; reconciliation reports mismatches without repair. Portfolio is derived,
  never the ledger.
- **Finance (013 COMPLETE):** closed-loop authority accepts GBP integer minor units only; no crypto,
  FX, wallet provider, fee or tax policy is implied. Every posted journal balances exactly; entries
  and lot disposals are append-only; correction is one linked compensating reversal; projections and
  active reservations reconcile to journal authority under deterministic locks.
- **Trading (014 COMPLETE):** buy reserves worst-case limit gross plus configured taker fee and sell reserves units; integer price-time priority, no overfill and `REJECT_TAKER` self-trade prevention are mandatory. Every execution is maker-priced and atomically posts ownership transfer, balanced GBP cash journal, platform fee credit and FIFO lot disposal/acquisition. Partial fill/cancel/expiry releases only the remaining reservation; replay and concurrent matcher paths cannot duplicate an execution.
- **Portfolio:** cost basis comes from settled ledger entries; realised P&L only from disposal;
  unrealised P&L uses versioned valuation; snapshots are reproducible and can be rebuilt.
- **Compliance/providers:** KYC/KYT/holds gate defined actions; Bridge, Plaid and BlockchainAnalysis.io remain behind provider-neutral ports. Signed raw webhooks are deduplicated before mutation; money posts once only after provider confirmation; reconciliation creates immutable discrepancies/holds/incidents and never auto-repairs. Local implementation is complete, while external provider certification and production enablement remain fail-closed launch gates.
- **Community/governance:** moderation/restriction applies; one weighted vote per eligible snapshot;
  proposal windows immutable after open; finalization requires threshold/quorum rules, segregation
  and audit. Sale/distribution requires settled ownership snapshot, balanced finance entries, fee
  calculation and retry-safe payout records.

## Primary implementation owners

Identity/security rules are owned by 003–005; catalogue/market/public-read rules by 006–008;
submission/publication evidence by 010–011; ownership by 012; finance/portfolio by 013; trading by
014; community/governance/distribution by 015; provider/compliance/reconciliation by 016; durable
delivery/operations by 017; and launch verification by 018. Projection and frontend-integration
documents consume these rules but do not redefine their authority.

**Document 015 completion:** community reports have explicit non-reopenable terminal review states; beneficial-owner voting is fail-closed absent the configured legal gate, snapshot-weighted and strict-majority/quorum bounded; sale verification requires two distinct non-proposer approvals; gross equals fee plus net and largest-remainder distribution entries preserve every GBP minor unit through a balanced finance journal.

**Document 017 phase 1/2:** a producer appends its safe, schema-versioned outbox envelope through the same PostgreSQL transaction as its authoritative mutation. Commit creates both; rollback creates neither. `eventId` is unique and the worker claims eligible rows in availability/creation/ID order through a short PostgreSQL `SKIP LOCKED` lease transaction. An opaque claim token fences stale workers; handler attempts are at-least-once and consumers deduplicate by event ID. Retryable failure backs off with bounded jitter; terminal schema/payload failure or exhausted attempts becomes immutable `DEAD_LETTER`. No phase-2 handler mutates financial authority or delivers to Discord.

**Document 017 operations:** only an `admin.access` actor with recent authentication may requeue a dead-letter outbox or delivery record. Requeue is idempotent, audited and conditional on `DEAD_LETTER`; it preserves the same event/delivery identity and attempts, clears only worker-lease/dead-letter state, and returns it to `PENDING`. It never creates or repairs business, finance, ownership, provider or compliance authority.
