# Slice List an Asset — Step 6 Review & Submit QA

Date: 2026-08-24

## Scope

Step 6 was rebuilt around the supplied review-screen mockup. The screen is a
read-only summary of the private draft until the collector explicitly submits
it for staff review.

## Frontend

- Card details, category, identity, grading/condition, and edit-to-Step-2.
- Market reference with provider, source currency, timestamp, match quality,
  and edit-to-Step-3.
- Truthful no-match and unavailable states with manual-review copy.
- Offer intent and retain percentage, with illustrative portions labelled as
  non-final and collector estimates labelled as not a Slice valuation.
- Required and optional photo counts with only `SAFE` media thumbnails.
- AI Card Review state separated from grading and clearly disclosed as
  non-final; raw, graded, skipped, unavailable, and incomplete states render
  from persisted data.
- Data-driven checklist, next-steps timeline, help link, terms acknowledgment,
  private-save state, and responsive single-column fallback.
- Submit button is disabled until the same final readiness conditions shown in
  the checklist are complete; loading state is `Submitting…`.

## Backend

The existing `POST /api/v1/submissions/:id/submit` transition remains the
authority. It now validates, inside the existing owner/version/idempotency
transaction:

- owner access, editable lifecycle state, and optimistic version;
- active category and required identity fields;
- market check acknowledgement, including a valid no-match/unavailable path;
- offer percentage in the authoritative persisted metadata;
- required safe media and no active media still processing/rejected;
- terms acknowledgement;
- raw-card AI review success or explicit `AI_REVIEW_SKIPPED` policy state.

On success the existing draft becomes `SUBMITTED`, creates the existing
`SUBMISSION_SUBMITTED` audit record, and appends a deduplicated
`submission.submitted` outbox event for private Collector Actions. No asset,
valuation, offering, ownership, market, order, execution, fee, or ledger row is
created. Outbox routing is reused; no second notification system was added.

## Validation

- Frontend targeted Step 6/list tests: PASS (11 tests)
- Frontend full test suite: PASS (39 files, 153 tests)
- Backend targeted submission policy/outbox tests: PASS (10 tests)
- Backend full test suite: PASS (72 suites, 312 tests)
- Frontend typecheck: PASS
- Backend typecheck: PASS
- Frontend production build: PASS
- Backend production build: PASS
- Targeted frontend/backend ESLint: PASS
- Full repository lint: NOT CLEAN due to the existing formatting backlog in
  unrelated files; changed files pass targeted lint.

## Safety and browser QA

- No real draft was submitted.
- No controlled Umbreon, Charizard, market, offering, ownership, or financial
  state was changed.
- No PriceCharting or Ximilar call was made by this validation.
- Authenticated browser visual QA at the requested staging widths remains
  pending because an authenticated browser session was not available in this
  run. Deployment was intentionally not performed.

## Status

Implementation and automated validation: **PASS**

Release/browser visual gate: **NO-GO until authenticated staging QA**

