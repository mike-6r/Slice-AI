# Admin Global Cleanup Report

## Scope

This pass focused on shared Admin Console behaviour and the active Collectibles,
Review Queue, Physical Intake, Asset Operations, Finance & Trading, and Trust &
Support surfaces. The preserved Pikachu QA record was not advanced or changed.

## Issues found and fixed

- The Collectibles default `NORMAL` fixture mode was counted as an active filter.
  This could present a genuinely empty catalogue as a filter no-match. Fixture
  visibility now counts as a filter only when test/demo records are included.
- Catalogue filters were component-local, so refresh/back/forward did not
  preserve them. Category, physical state, verification, valuation, market,
  grading, and collector filters now use validated URL state. Catalogue category
  has its own key so it cannot leak into Asset Operations filters.
- The parent Admin route performed a duplicate catalogue request that was not
  used for rendering. It has been removed.
- Catalogues, physical intake, and Asset Operations could render a broken browser
  image icon when a private thumbnail expired. Each now replaces a failed image
  with an explicit safe fallback.
- The Review Queue showed selection controls without a bulk action. Those
  checkboxes have been removed.
- Finance & Trading and Trust & Support displayed zero-valued metrics while an
  authority response was loading or unavailable. They now show loading or
  unavailable states instead of operational-looking zeros.
- Finance & Trading and Trust & Support contained disabled export, settings,
  filtering, quick-action, and row-action controls for workflows that the Admin
  API does not expose. The dead controls and corresponding table columns have
  been removed; remaining actions route to a working workspace.

## Fixture handling

Existing backend fixture markers and the default production-work filter were
preserved. No operational records were archived, deleted, or reclassified in
this pass. Test/demo records remain explicitly surfaced only through their
existing fixture controls and row markers. Controlled Umbreon and Charizard
records were not changed.

## Validation

- Frontend typecheck: pass.
- Frontend lint: pass with existing fast-refresh warnings only.
- Frontend tests: 40 files / 164 tests passed.
- Catalogue URL-state regression test: 3 tests passed.
- Frontend production build: pass.
- Backend typecheck: pass.
- Prisma validate and generate: pass.

## Follow-up items

- Authenticated desktop, tablet, and mobile browser QA must be performed against
  the deployed staging release using an active staff browser session.
- Existing non-blocking fast-refresh warnings should be addressed in a separate
  component-export hygiene pass.
- The remaining active Admin pages should continue to use authoritative APIs
  before adding new actions; this pass intentionally removed rather than mocked
  unsupported workflows.
