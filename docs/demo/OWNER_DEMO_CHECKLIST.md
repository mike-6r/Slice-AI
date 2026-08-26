# Owner Demo: 15-Minute Checklist

## Before the meeting

- [ ] `GET /health` returns 200.
- [ ] `GET /ready` returns 200 and reports PostgreSQL and Redis up.
- [ ] VPS immutable release path and active commit match the candidate.
- [ ] Supported browser is connected; a fresh tab has no console, hydration or
      failed-chunk errors.
- [ ] Admin, Reviewer, Intake, Collector and Investor demo identities can sign
      in without exposing credentials.
- [ ] `npm run staging:demo:preflight` reports safe staging configuration.
- [ ] Run the guarded refresh/check/verify commands in the owner-demo runbook.
- [ ] Only named test/demo assets are selected; Umbreon and controlled Charizard
      are excluded.
- [ ] The canonicalization policy has been chosen and its staff UI action is
      available to the appropriate role.
- [ ] Test financial mode is explicit; no production provider or real bank path
      is enabled.
- [ ] Previous known-good release and compatible rollback procedure are
      confirmed.
- [ ] Every browser uses the candidate bundle; no stale chunk, service-worker
      or cache mismatch is present.

## Demo checkpoints

- [ ] Collector can create and submit the Owner Demo listing.
- [ ] Admin can claim, review, value and accept it with a visible audit trail.
- [ ] Canonical asset/link exists exactly once after staff action.
- [ ] Intake shows carrier status separately from physical receipt.
- [ ] Verification, custody and final valuation are recorded.
- [ ] Ownership supply and Initial Offering are guarded and explainable.
- [ ] The published test asset appears in Marketplace and its detail page.
- [ ] Investor preview, purchase, execution and Portfolio update reconcile.
- [ ] Admin history/finance views show the final authoritative lifecycle.
- [ ] Refresh/deep-link/login/retry and repeated-click checks leave one durable
      result at every important boundary.
- [ ] Relevant Admin, collector, marketplace, portfolio, finance and history
      screens agree after each transition.
- [ ] Media order, preview/zoom and public/private media safety pass.
- [ ] Currency, supply, fee, proceeds and execution calculations reconcile.
- [ ] Customer/staff notification copy is understandable and safe.

## Stop conditions

- [ ] Stop if the UI suggests a physical state, valuation, ownership or market
      state that has not occurred authoritatively.
- [ ] Stop if a main action lacks an explanation, confirmation, reason or
      permission boundary required by policy.
- [ ] Stop if a test fixture cannot be identified or a controlled asset is
      selected.
- [ ] Stop if a provider path is unexpectedly live or a console/network error
      affects the current view.

## After the meeting

- [ ] Capture request IDs, screenshots and relevant audit IDs.
- [ ] Run the documented fixture refresh/verification path only for named demo
      records.
- [ ] Record any failure in the QA report; do not silently patch staging data.
- [ ] Record the measured full and short demo durations.
- [ ] Confirm the reset procedure starts a second owner-demo run cleanly without
      raw-deleting ledger or audit history.
