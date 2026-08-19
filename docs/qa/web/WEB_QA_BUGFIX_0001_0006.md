# WEB QA BUGFIX 0001–0006

## Summary

Focused frontend fixes for the six reported Slice UI defects. No backend code,
financial rules, market records, Umbreon state, Charizard state, Initial
Offering state, Stripe work, or Discord work was changed.

## 0001 Trading Alignment

### Root cause

The Buy and Sell examples rendered the progress list and action as independent
siblings. The Buy example had more content above them, so the flex spacing
could not keep both footer elements aligned.

### Files changed

- `src/routes/index.tsx`
- `src/styles.css`

### Fix

Both examples now use the same `trade-example-footer` structure. The footer is
the flexible region, with the progress list followed by the action button.

### QA

PASS at 1440px: both cards, progress rows, and buttons share the same bottom
and action baselines. The footer stacks naturally when the cards stack.

## 0002 Card Flip

### Root cause

CSS `:hover` rotation and React `flipped` state both controlled the same
transform. While the pointer remained over the card, clicking Show Front could
set React state to front while CSS immediately rotated the card back.

### State model

`manualFlip` is nullable and takes precedence after an explicit click;
`hoverFlip` provides the pointer preview only until the pointer leaves the
stage. Leaving the stage resets the manual choice so the next hover behaves
normally. The button remains the touch and keyboard path.

### Fix

- Removed CSS hover rotation as a competing source of truth.
- Added controlled pointer-enter/leave state.
- Kept the semantic button and `aria-pressed`/accessible label behavior.

### QA

PASS by state-model regression tests and direct staging contract inspection.
The fixed local build could not render the staging Umbreon response because
the staging API does not allow the local origin; no staging state was changed.

## 0003 Similar Assets

### Root cause

The Similar Assets component only consulted the exact staged fallback map and
ignored the authoritative public `media` projection. Its fallback text was
also a raw “Media unavailable” label inside a card layout, which created the
orphaned media presentation seen in QA.

### Data vs layout findings

This was a frontend projection/component issue, not a backend data mutation
or invented-data problem. Live projected image media is now preferred; the
existing exact staged fallback is used only for known demo identities.

### Fix

- Added the shared `resolveMarketplaceMedia` helper.
- Similar Assets now uses projected media, exact staged fallback, or a clean
  `Image unavailable` placeholder.
- Added a small meaningful carousel window and disabled arrows when there is
  no previous/next page.

### Empty/fallback behavior

Zero assets use the existing clean empty state. Unknown assets do not borrow
another collectible's image.

### QA

PASS in local mock browser QA: two-card Similar Assets rendered as complete
tiles with no raw “Media” text. Direct staging inspection confirmed the old
orphan symptom that the fix addresses.

## 0004 Recent Executions

### Root cause

The row used fixed narrow columns (`1fr 42px 76px`) while rendering the full
customer-facing “ownership units” label. At narrow widths the units text and
price could occupy the same visual space.

### Actual authoritative fields

The existing contract supplies `executedAt`, `units`, and `pricePerUnit` after
the repository maps the API's `executedAt`, `units`, and `priceMinor` fields.
No total consideration or side was added.

### Final layout

The desktop row uses flexible date/units columns plus a content-sized price
column. At widths up to 799px it becomes a two-row date/price plus units layout
with wrapping enabled.

### QA

PASS by responsive CSS inspection and direct staging contract inspection: the
three authoritative values are separate and no additional fake execution data
was created.

## 0005 Market Grid / Compact

### Root cause

The shared card already used a flex body, but the CTA had ordinary top spacing
and Compact mode hid the CTA at desktop widths. Optional metadata therefore
changed where the final action appeared (or removed it entirely).

### Shared component findings

Grid and Compact both render `MarketAssetCard`; the fix stays in the shared
card/layout primitive rather than duplicating mode-specific markup.

### Grid fix

Cards stretch to the grid row height, bodies remain flexible, and the CTA is
anchored with `margin-top: auto`.

### Compact fix

Compact cards retain the same anchored `View details` action while omitting
secondary detail blocks. This keeps the mode compact without removing the
primary navigation path.

### QA

PASS at 1440px local mock QA. Four visible cards had equal heights and equal
CTA top/bottom coordinates in Grid and Compact. No card-level horizontal
overflow was measured.

## 0006 Market Detailed

### Root cause

The row had four rendered children but a five-column grid template. The action
therefore landed in an unintended column and became cramped/misaligned. The
first visual also used the generic card-media class while detailed sizing was
defined separately.

### Layout fix

The row now has four explicit columns: media, identity, metrics, and action.
The detailed media receives a stable 104×90px desktop region and the action
has a 120px minimum column with no wrapping.

### Responsive fix

At widths up to 799px the row becomes a stacked card with a full-width action.

### QA

PASS at 1440px and 1024px desktop/tablet layouts; PASS at 768px and 390px
stacked layouts. The action measured 120px wide at 1024px and did not wrap; it
became full-width at 768px and 390px.

## Responsive QA

| Viewport | Result | Notes |
| --- | --- | --- |
| 1440×900 | PASS | Grid cards stretch and CTAs align. |
| 1024×768 | PASS | Detailed action column remains 120px and unwrapped. |
| 768×1024 | PASS | Detailed rows stack; no document/body horizontal overflow. |
| 390×844 | PASS | Detailed rows stack; no document/body horizontal overflow. |

The market quick-filter rail remains intentionally horizontally scrollable on
phone widths; it does not create document-level overflow.

## Accessibility

PASS for the changed structures: the flip control remains a native button with
an accessible label and pressed state; market navigation remains native links
and buttons; disabled Similar Assets arrows communicate unavailable movement.
Existing focus-visible styles were preserved.

## Automated Tests

Added:

- `src/components/marketplace/marketplace-layout.test.ts`
- `src/components/marketplace/MarketAssetCard.test.tsx`

The tests cover authoritative media resolution, exact fallback behavior, flip
state precedence, Compact CTA presence, projected media, and the Detailed
action child.

## Build

- Focused marketplace tests: PASS — 4 files, 17 tests.
- Full frontend test suite: PASS — 38 files, 131 tests.
- Frontend typecheck: PASS.
- Production build: PASS — client and SSR bundles generated.
- Frontend lint: repository-wide command remains blocked by 4,916 existing
  Prettier errors across the dirty worktree. The new helper/tests and homepage
  route pass direct lint; the pre-existing marketplace/detail files still
  report unrelated formatting errors. No formatting sweep was applied.
- Backend tests: not run; backend was intentionally unchanged.

## Remaining Risks

The fixed frontend was not deployed in this task. A local browser run against
the live staging API could not load the API response cross-origin, so the
published Umbreon two-sided visual was inspected directly on staging while the
fixed layouts were verified against local mock catalogue fixtures.

## Release Decision

Frontend tests, typecheck, targeted lint, and production build are green. The
repository-wide lint gate is not green because of pre-existing formatting debt
outside this focused change, and the fixed bundle was not deployed in this
task. Do not deploy until the normal same-origin staging release path has
rechecked the fixed bundle against Umbreon's live two-sided response.
