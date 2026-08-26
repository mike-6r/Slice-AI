# Data retention candidates

## Scope

These are retention-policy candidates, not dead-schema candidates and not
deletion instructions. Wave 5 performed no data cleanup and did not inspect or
print sensitive values.

| Record family | Purpose | Candidate policy question | Required authority |
| --- | --- | --- | --- |
| `Session`, login/action challenges, password/email/phone records | Account security, authentication, recovery, abuse investigation | Define expiration, anonymization, and security-event retention after legal/security review. | Identity and compliance |
| `AuditEvent`, account/status history, order/status history, custody events | Traceability, staff accountability, financial/operational forensics | Define immutable retention and archival tier; low read frequency is not deletion evidence. | Compliance, finance, operations |
| `IdempotencyRecord`, `WebhookInbox`, `OutboxEvent`, `NotificationDelivery` | Exactly-once/retry, provider disputes, delivery recovery | Define age-based archival only after retry windows, provider dispute windows, and reconciliation requirements are known. | Platform, provider, compliance |
| Market snapshots, observations, portfolio snapshots, refresh jobs | Reference data, valuation context, portfolio history | Define compaction/downsampling separately from staff valuation authority. | Market and finance |
| Provider reconciliation/discrepancy/incident/cost records | Reconciliation, incident investigation, financial reporting | Preserve according to provider/financial retention policy. | Finance and provider |
| Ownership ledger, journal, reservations, movements, lots, distributions | Financial and ownership system of record | No automated purge candidate. Any archival must retain reconciliation/audit ability. | Finance and ownership |
| Submission media/review/intake/verification/exception records | Customer evidence, chain of custody, dispute handling | Define retention after custody/compliance requirements; never infer from UI visibility. | Operations and compliance |
| Discord tickets/transcripts/audit/community delivery records | Community moderation, support, Discord recovery | Define guild/legal retention and redaction policy. | Community and compliance |
| `FinancialConnectionSession` and Bacs legacy references | Historical provider compatibility | Decide retirement only with provider and financial-owner approval. | Provider and finance |

## Data-quality and orphan analysis

No live data repair was authorised. Existing read-only staging evidence found
one approved submission without a canonical asset link; this is a documented
canonicalization-policy gap, not an orphan safe to repair in a schema wave.

The local PostgreSQL endpoint and Docker daemon are unavailable, preventing
disposable aggregate/orphan checks. Required future read-only checks include
foreign-key orphan counts, duplicate logical identities, invalid state
combinations, canonical lineage aggregates, provider-parent relationships, and
membership-plan consistency. No conclusion should be drawn from a zero-row
table or staging-only feature gate.
