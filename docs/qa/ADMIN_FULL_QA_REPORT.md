# Slice Admin Console & Owner Demo QA Report

**Run date:** 2026-08-26  
**Source candidate:** `8bea9a8902d2d6e991b011b29b4aa67e68ab82db` (`main`, clean at audit start)  
**Staging:** `https://staging.slicecollectable.com`  
**Decision:** **NO-GO — evidence and workflow gates remain open**

## Evidence collected

| Check | Result | Evidence |
| --- | --- | --- |
| Repository recovery | PASS | `main` is clean and matches `origin/main`; prior cleanup-wave commits are present. |
| Staging health | PASS | `GET /health` returned 200 with `slice-api` staging status. |
| Staging readiness | PASS | `GET /ready` returned 200; PostgreSQL and Redis both reported up. |
| Public market authority | PASS | `GET /api/v1/market/assets` returned two published records: controlled Umbreon and the clearly labelled `qa-test-initial-offering-card`. |
| Admin catalogue authorization | PASS | Anonymous `GET /api/v1/admin/collectibles` returned the expected 401, not a data leak. |
| Admin catalogue implementation | PASS, source-reviewed | `GET /api/v1/admin/collectibles` reads `Asset` only, with server-side filtering, sort and pagination. |
| Canonicalization handoff | **FAIL / P0** | Approved submissions can be linked through protected API services, but the review UI has no supported staff action to create/link the canonical asset. |
| Authenticated browser matrix | NOT RUN | The available in-app browser blocks staging before navigation; no external browser session is connected. |
| Staging release provenance | NOT VERIFIED | Health/readiness do not expose the active commit, and no release-host session was available. |
| Controlled fixture mutation | NOT RUN | No authenticated, scoped staging session was available. Umbreon/Charizard were not touched. |

## Current lifecycle authority

`AssetSubmission` owns the collector submission and review record. `Asset` is the
canonical collectible. `SubmissionIntake`, receipt and verification own intake;
`VaultCustodyRecord` owns custody; `ValuationDecision` owns staff valuation; and
publication, ownership supply, Initial Offering and trading are independent
authorities.

The current executable sequence is:

`AssetSubmission` → review decision → **explicit canonical Asset create + audited link** → intake / receipt / verification → custody → valuation → ownership supply → Initial Offering → publication / trading.

Approval deliberately does not create a canonical asset, custody record,
valuation, ownership or publication. This protects the domain boundary, but it
also means the owner-demo workflow cannot proceed from an approved submission
without an explicit staff canonicalization capability.

## P0: canonicalization is invisible to staff

The protected authorities are present:

- `POST /api/v1/admin/catalogue/assets` creates a draft `Asset`.
- `POST /api/v1/admin/submissions/:id/asset-link` links an **approved**
  submission to exactly one Asset under locking, certification-duplicate and
  idempotency protections.

No current frontend repository calls either endpoint. The submission review
workspace tells staff that acceptance moves to Physical Intake, but does not
surface the required canonicalization work. This is not a catalogue-query or
empty-state defect.

The checked-in authority contract still marks the boundary as **OWNER DECISION
REQUIRED**. It recommends Model C (an explicit staff canonicalization action),
but does not authorize selecting or implementing it automatically. The next
implementation must be explicitly approved as Model C, or the owner must choose
another boundary. It must preserve the existing locking, audit, duplicate-cert
and idempotency invariants and must not infer receipt, custody, valuation,
ownership or publication.

## Admin inventory status

| Workspace | Source/read QA | Authenticated functional & visual QA |
| --- | --- | --- |
| Overview | Implemented route and admin projection found | NOT RUN |
| Accounts / account detail | Implemented route and admin projection found | NOT RUN |
| Review Queue | Server pagination, filters and review route found | NOT RUN |
| Submission Review | Claim/release, condition, valuation and guarded decisions found | NOT RUN |
| Physical Intake | Receipt and verification commands found | NOT RUN |
| Collectibles / detail | Asset-only authority, filters, drawer and detail handoff found | NOT RUN |
| Asset Operations | Receipt-gated post-intake workspace found | NOT RUN |
| Memberships / detail | Implemented route and detail workspace found | NOT RUN |
| Finance, Trust & Support, Platform Operations | Implemented admin sections found | NOT RUN |

This table is an inventory, not a claim that pages are demo-ready. It cannot
replace fresh authenticated navigation, RBAC, mutation, responsive,
accessibility or console evidence.

## Existing safeguards confirmed in source

- Catalogue search is server-side across title, public ID, slug, card number,
  certification number, category, set and collector fields.
- Catalogue filtering, sorting and pagination remain server-side.
- Catalogue distinguishes loading/authority-unavailable/no-data/no-filter-match.
- Optional catalogue enrichments do not need to fail the entire result.
- Canonical links reject non-approved submissions, conflicting links and active
  graded-certification duplicates; they are idempotency-key guarded.
- Asset creation is draft-only and does not create custody, valuation,
  publication or ownership.
- Public market data shows the separate published-market authority; it is not
  used as evidence that every approved submission is canonical.

## Required before a GO decision

1. The owner must select the canonicalization boundary. Model C is the
   documented recommendation; no alternative should be inferred.
2. Implement and test the selected, staff-visible canonicalization action.
3. Provision or connect an authenticated supported browser session for Admin,
   reviewer, intake, finance, collector and investor roles.
4. Use a VPS session to run the staging-only preflight/refresh/verification
   scripts, deploy the exact candidate, and verify the active immutable release
   path and commit.
5. Run the golden path and failure/RBAC matrix from
   `docs/qa/OWNER_DEMO_GOLDEN_PATH.md`, recording actual request IDs, audit
   events and screenshots.

## Additional final-demo gate

| Requirement | Current result | What closes it |
| --- | --- | --- |
| Cross-surface consistency | NOT RUN | After every lifecycle write, compare the named Admin, collector, public-market, portfolio, finance and history projections. |
| Refresh / recovery | NOT RUN | Refresh, deep-link, login/session renewal, retry and safe restart recovery tests at each important boundary. |
| Double-action safety | PARTIAL, source-reviewed | Existing key mutations use idempotency/locking, but authenticated repeated-click evidence is still required. |
| Media lifecycle QA | NOT RUN | Exercise upload, replacement, deletion, failure, private/public rendering and signed-URL safety with disposable media. |
| Currency consistency | NOT RUN | Reconcile all demo monetary displays to their backend source and distinguish external-reference currency from ledger currency. |
| Calculation reconciliation | NOT RUN | Reconcile issued/retained/offering/investor/treasury units, gross, fee, proceeds and order totals from the authoritative responses. |
| Notification copy | NOT RUN | Inspect rendered staff/customer notifications and safe links for every golden-path event. |
| Demo version verified | FAIL | Confirm active release directory, deployed commit and fresh frontend bundle on the VPS/browser. |
| Rollback ready | PARTIAL, documented | The release runbook documents compatible rollback; confirm a known-good release and migration compatibility before deploying. |
| Post-demo reset | PARTIAL, existing fixture refresh only | Existing refresh is scoped to named staging demos; a complete Owner Demo reset inventory is not yet implemented or run. |

**Full demo duration:** not measured.  
**Short demo duration:** not measured.  
**Hidden manual steps required:** canonicalization currently requires an
invisible backend-only operation; this is unacceptable for the owner-demo
release.  
**Manual SQL required:** NO.  
**Owner golden-path P0:** 1 (canonicalization).  
**Owner golden-path P1:** unassessed until authenticated staging QA.  
**Final:** **NO-GO**.

## Scope protection

No production provider action, real-bank settlement, direct SQL repair,
frontend-only fixture, controlled Umbreon economic mutation or controlled
Charizard physical-state mutation was performed in this QA pass.
