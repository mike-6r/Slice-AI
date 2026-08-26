# Admin Visual QA

**Status:** NOT RUN — a supported authenticated browser session is required.

## Required viewport matrix

| Viewport | Workspaces | Result |
| --- | --- | --- |
| 1920 desktop | Overview, Accounts, Review Queue, Intake, Collectibles, Asset Operations, Memberships, Finance, Trust & Support, Platform Operations | NOT RUN |
| 1440 desktop | Submission Review, Account Detail, Collectible Detail, Membership Detail and finance detail surfaces | NOT RUN |
| Tablet | Navigation, tables, drawers and form actions | NOT RUN |
| 390px mobile | Collector listing, marketplace, asset detail, portfolio and usable Admin fallback | NOT RUN |

## Source-review observations

- The canonical catalogue provides a dense table, compact summary metrics,
  server-backed filters, a side preview and a mobile-card alternative.
- It has distinct loading, authority-unavailable, no-canonical-data and
  no-filter-match states. This is appropriate operator copy.
- The review queue uses a compact toolbar and detail handoff rather than a
  duplicated review implementation.
- The decisive visual/product gap is not stylistic: the review workspace does
  not expose canonicalization after acceptance, leaving the owner demo at a
  dead-end that looks like an ordinary intake handoff.

## Visual acceptance criteria

For each authenticated workspace, verify and fix as needed:

- near-black background, restrained emerald/teal/amber/red state semantics and
  readable contrast;
- dense tables without clipped cells, horizontal traps or meaningless empty
  center space;
- consistent action hierarchy, safe disabled explanations and confirmation UX;
- no raw enums, booleans, internal errors or placeholder/debug copy;
- status text that is not colour-only, labelled controls, visible focus and
  keyboard-reachable drawers/dialogs;
- responsive details/actions that remain usable without squeezing desktop
  tables into mobile; and
- no console errors, hydration warnings, missing chunks or broken requests.

For each major demo screen, a first-time owner must be able to answer the
applicable questions without an engineering explanation: **What is this? What
state is it in? What happens next? Who owns it? Where is the physical asset?
What is it worth? Can it be bought? Why is an action enabled or blocked? Where
did this information come from?** Review labels, disabled explanations,
acronyms, provider terminology, status progression and money/currency display
against those questions.

## Required evidence before PASS

Capture authenticated screenshots at the required viewports for every major
Admin workspace, record console/network status, deep-link refresh behavior and
any P2/P3 fixes. Do not convert this source-only review into a visual PASS.
