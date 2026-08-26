# Schema cleanup candidates

## Decision rule

No candidate is executable in Wave 5. A Tier A removal requires no runtime,
test, script, raw-SQL, migration-compatibility, provider, relation, staging,
or documented-capability evidence. No current model, field, enum, or index
meets that threshold.

## Tier A — high confidence

None.

## Tier B — evidence of inactivity, but owner decision required

| Element | Classification | Evidence | Risk and required follow-up |
| --- | --- | --- | --- |
| `FinancialConnectionSession` model | LEGACY_ACTIVE | No current direct delegate call; schema describes retained Financial Connections history and provider tests protect against exposing retained rows as GBP funding methods. | Provider/audit retention and historical row counts must be approved before any deprecation plan. Do not drop. |
| `PhoneVerificationChallenge.codeHash` | MIGRATION_COMPATIBILITY | Nullable schema field explicitly labelled legacy; provider-owned Twilio Verify flow does not persist new OTP hashes. | Identity/security owner must confirm retained-row, rollback, and forensic requirements; backfill/null-count evidence required. |

## Tier C — low confidence / preserve

| Element | Why it must be preserved |
| --- | --- |
| `BacsSetupSession.externalSetupIntentId` | Explicit additive compatibility field. New encrypted/hashed reference fields do not prove historic setup rows are safe to rewrite or delete. Financial/provider owner review required. |
| `ProviderCode.SUMSUB`, `TRM`, `BVNK` | Schema explicitly designates historical compatibility. Enum removal is migration- and payload-sensitive. |
| `PlatformRevenueSettlementLine` | Relation-only active finance child model; uniqueness protects settlement source rows. |
| `GradeScaleEntry.legacy` | Active catalogue services, domain types, and seed tooling read/write it. |
| Finance, ownership/trading, custody/intake, provider, audit/outbox, and Discord models | Static use, nested relation use, raw locks, migrations, provider gating, or audit/recovery purpose prevents removal inference. |

## Duplicate representation review

No duplicate representation was judged erroneous. These pairs encode separate
authorities and must not be collapsed without product policy:

- submission/review/intake/custody/valuation/publication/ownership states;
- provider status versus Slice internal/reconciliation status;
- membership status versus billing/entitlement state;
- publication versus ownership/Initial Offering/trading state;
- verification evidence versus staff decision.

## Required evidence for a future controlled cleanup wave

1. Approved read-only aggregate row/null/distinct/recentness evidence.
2. Provider, finance, compliance, Discord, and data-retention owner sign-off.
3. Migration-history and rollback plan; never edit applied migrations.
4. A new forward migration tested from a disposable database.
5. Full API, Discord, integration, and staging release validation.

Wave 5 changes no schema or data.
