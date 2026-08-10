# Seller lifecycle

Status: **DERIVED — implementation guidance, not an approved policy source**. This record restores the decisions already expressed by Documents 010 and 011. Anything not specified there remains OPEN.

## Ownership by implementation document

| Stage | Status / capability | Owner | Meaning |
| --- | --- | --- | --- |
| Draft | `DRAFT` | 010 | Owner may create, read and edit their private submission. |
| Evidence preparation | media `PENDING_UPLOAD` through `SAFE` / `REJECTED` | 010 | Private evidence is attached to a submission; safe media is a prerequisite to submission. |
| Submitted | `SUBMITTED` | 010 | Owner locks the submitted snapshot and sends it to the review workflow. |
| Review | `IN_REVIEW` | 010 | An eligible reviewer claims or is assigned the case. |
| Changes requested | `CHANGES_REQUESTED` | 010 | Seller may make the permitted corrections and resubmit. Seller-visible request reasons are required; reviewer internal notes stay private. |
| Verification decision | `APPROVED` or `REJECTED` | 010 | Approval is a verification-workflow outcome only. It is not authenticity, valuation, custody, insurance, ownership issuance, or publication. |
| Seller cancellation | `CANCELLED` | 010 | Cancellation is terminal according to Document 010; a new submission is required to restart. |
| Valuation/custody/insurance/publication | separate evidence and gates | 011 | Not available from a Document 010 approval. |
| Ownership issuance / market activity | later phases | 012+ | Out of scope for seller submissions. |

## Derived transition rules

- Only the owner may edit `DRAFT` and `CHANGES_REQUESTED` submissions.
- A submission may move to `SUBMITTED` only when the category-required evidence is `SAFE`, server-verified, and the optimistic version matches.
- Submitted snapshots are immutable except for owned workflow fields.
- `REJECTED` and `CANCELLED` are terminal; the documented recovery path is a new submission.
- A reviewer cannot review their own submission. Claiming and decisions are auditable and idempotent.
- Every state mutation requires the platform authorization, audit, idempotency, and rate-limit controls specified in Documents 004, 005, and 010.

## OPEN / PROPOSED items

| Item | Status | Reason / owner |
| --- | --- | --- |
| Exact seller withdrawal windows and whether `WITHDRAWN` differs from `CANCELLED` | OPEN | Document 010 specifies `CANCELLED`; no separate withdrawal policy is established. |
| Required evidence slots per category | OPEN | Document 010 requires category-required slots but does not define a catalogue policy table. |
| Reviewer assignment lease duration, reassignment, and escalation | PROPOSED | Document 010 calls for a lock/lease but does not establish the duration or operations policy. |
| Evidence retention/deletion periods | OPEN | Document 010 requires retain/soft-delete behavior “per policy”; policy is not present. |
| Seller eligibility, fees, tax, KYC, KYB, or payout conditions | OPEN / OUT OF SCOPE | Owned by no completed document; KYC/KYT/payments are later-phase scope. |

