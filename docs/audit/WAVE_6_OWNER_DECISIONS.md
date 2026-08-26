# Wave 6 owner decisions

## Decision matrix

| Candidate | Evidence | Wave 6 classification | Required decision | Action now |
| --- | --- | --- | --- | --- |
| Canonicalization trigger | Approved submission/intake can remain unlinked; current approval outbox is notification-only. | OWNER DECISION | Approve explicit staff canonicalization trigger and UI handoff. | No action; Charizard unchanged. |
| `FinancialConnectionSession` | No current service delegate writes; model preserves Financial Connections/session history and has unique provider/environment/external-session identity. | KEEP FOR PROVIDER HISTORY | Provider/finance retention and retirement plan. | Keep schema/data. |
| `PhoneVerificationChallenge.codeHash` | Twilio Verify owns new OTPs; new challenges write `null`; tests assert this. Field is a nullable compatibility field for retained history. | LEGACY RETENTION | Security/compliance decision after retained-row and rollback review. | Keep; never expose hashes. |
| Bacs legacy setup-intent reference | New code uses encrypted/hashed references; nullable raw legacy field supports additive historical compatibility and webhook/support tracing. | OWNER DECISION / KEEP | Provider/finance retention and migration plan. | Keep. |
| `ProviderCode.SUMSUB`, `TRM`, `BVNK` | Enum values originate in historical migrations and are explicitly marked compatibility-only; active code selects `LOCAL_TEST` or Stripe modes. | KEEP FOR HISTORY | Provider/audit owner approval before enum retirement. | Keep enum values. |
| Sessions/challenges/idempotency/outbox/notification delivery | Security, replay, delivery, and operational records grow over time. | ADD RETENTION JOB LATER | Legal/security-approved retention periods and job design. | Recommend, do not purge. |
| Audit, financial/ownership ledgers, custody history | Audit/reconciliation/custody authority. | PERMANENT / OWNER-LEGAL | Formal retention/archive tier only. | No TTL deletion. |
| Schema parity drift | Current Prisma schema differs from a full migration replay. | OWNER DECISION | Select desired contract and approve a forward-only alignment. | No historical rewrite. |
| Migration squashing/baseline | 98 migrations replay successfully. | NO ACTION | Only decide if future bootstrap time becomes material. | Preserve ordered history. |
| Index changes | Static review and empty local plans do not prove benefit/redundancy. | NO ACTION | Production-safe query-plan/workload evidence. | No index change. |

## Retention/action categories

- Permanent: financial journal/ledger, ownership ledger, custody lineage,
  required audit and reconciliation evidence.
- Long-term audit / regulated-high-sensitivity: account history, provider
  incidents/discrepancies/costs, verification evidence, security events,
  provider payload references, Discord moderation/support audit records.
- Short-lived operational candidates: expired one-time challenges, expired
  sessions, completed idempotency rows, transient polling state, delivered
  notifications/outbox attempts after dependency and dispute windows are
  approved.
- Archive candidates: market/portfolio observations and snapshots, delivery
  history, older provider and Discord operational events; compaction must not
  overwrite valuation, finance, or audit authority.

No duration is assigned here. Every expiry, purge, anonymization, archival, or
schema-removal action remains an OWNER/LEGAL DECISION REQUIRED.
