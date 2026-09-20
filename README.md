# Slice

Slice is a collectible platform with a React/TanStack Start web application, a
NestJS API, and a Discord companion service. The API is the authority for
identity, submissions, canonical assets, intake/custody, valuation, ownership,
finance, publication, and trading. The browser and Discord bot consume
authorised projections; neither replaces those domain authorities.

## Homepage story

The homepage keeps the collectible-to-portfolio journey in a route-scoped cinematic
experience. Its ownership calculator and portfolio illustration share local example
state; neither creates orders nor reads private holdings. Public catalogue cards use
the existing market service with separate loading, failure and empty states. Copy
lives in `src/data/homepage-story.ts`, while styles and motion live beside
`CinematicHomepageStory.tsx`. Intersection observers start finite, time-based entrance
animations once per element. Sections stay in normal document flow: no pinned scenes,
scroll-scrubbed animations or extra scroll runway. A passive, frame-bounded scroll
listener only updates chapter navigation and reading progress.
The lifecycle tour advances every 4.8 seconds while visible, stops at its final stage,
and offers Pause, Play, Replay and manual stage controls. It pauses when offscreen,
when the document is hidden, or after manual interaction. Reduced-motion preferences
disable autoplay and decorative animation; all content remains readable without
animation. Existing homepage section anchors are retained.

## Portfolio overview

The Portfolio Atlas overview keeps current account totals separate from dated performance
snapshots. Owned collectible marks, wallet cash and conditional pre-sale commitments are
explained individually; commitments are not added to the total a second time. Partial marks
and explicit unavailable totals remain unavailable. Collection previews can be browsed
without leaving the overview, with real catalogue media as a fallback and explicit missing-image
states. The account breakdown and portfolio guide use accessible native disclosures, and
their scoped styles live in `src/components/portfolio/portfolio-companion.css`. All values and
permitted actions continue to come from the existing portfolio, order and wallet services.

## Repository layout

This repository deliberately has three independent Node package roots, each
with its own `package-lock.json`:

- `/` — TanStack Start SSR frontend (`npm run dev`)
- `/server` — NestJS API and Prisma schema (`npm run start:dev`)
- `/apps/discord-bot` — Discord bot and companion worker

Install dependencies separately with `npm ci` in each root. Node.js 22 LTS is
the supported baseline. Do not merge the roots into a workspace or update their
dependencies as part of ordinary feature work.

## Local setup

1. Copy `.env.example` to `.env` for frontend values and `server/.env.example`
   to `server/.env` for API values. Templates contain placeholders only.
2. Run `npm ci` at the root, `server/`, and `apps/discord-bot/`.
3. Start the API and frontend in separate terminals. The Discord service needs
   its own configured environment and is not required for ordinary web work.

```bash
npm run verify
```

`verify` runs the enforced non-DB checks across all three roots and reports
both prerequisite-sensitive integration tests and the known frontend formatting
backlog separately. See [verification guidance](docs/engineering/VERIFICATION.md).

## Engineering references

### Public collector discovery

`/collectors` explains the public collector network and presents collection-led
discovery using real public profile and asset projections. Its hero reuses the
unfiltered first-page query; URL-backed search, specialties, availability and
sorting have independent, abortable paginated queries. Filters reset the page,
browser Back restores them, and out-of-range pages have an explicit recovery.
The directory adapts from a single collection showcase to a multi-profile grid.
Missing media, empty results, loading and retry states never invent profiles,
counts or endorsements. Asset previews show per-Slice prices only from the
corresponding source field, never from a total asset valuation.

The shared AppShell, public profile/catalogue routes and guarded submission
flow remain unchanged. Presentation lives in `src/components/collectors/`
under the `collector-network` namespace, isolated from legacy profile styles.

### Customer wallet

`/wallet` uses the shared Slice frame with a balance overview, money controls,
bank/payout setup, verification, a paginated movement ledger, settlement details,
and insights. History uses server-side type, status, reference/bank search and
inclusive UTC date filters; page sizes are 10, 25 or 50. Existing movement IDs
remain valid cursors, resolved within the signed-in customer's records using
the stable `(createdAt, id)` ordering. No history is truncated to the recent
timeline preview. CSV exports are explicitly current-page, original GBP values
with exact minor-unit conversion and spreadsheet-formula escaping.

The wallet does not change ledger balances, payment eligibility, or provider
authority. Mutations retain existing verification, preflight and confirmation
flows. Unknown withdrawal availability is shown as unavailable, not zero.
Route-scoped composition lives in `src/components/wallet/wallet.css`.

- [Current system state](docs/CURRENT_SYSTEM_STATE.md)
- [Environment configuration](docs/engineering/ENVIRONMENT_CONFIGURATION.md)
- [Package version policy](docs/engineering/PACKAGE_VERSION_POLICY.md)
- [Verification and CI](docs/engineering/VERIFICATION.md)
- [Audit index](docs/audit/README.md)
- [Staging VPS deployment](docs/STAGING_VPS_DEPLOYMENT.md)

Staging deployment is a manual immutable-release procedure. GitHub Actions is
verify-only and never deploys, contacts live providers, or uses staging data.

## Guided asset review

The shared admin asset record opens in a step-by-step guide. Review ownership,
identity, evidence, certification and the decision lead into intake, physical
verification, valuation, ownership and launch. Staff can inspect another step
or switch to the full record without creating a second asset workspace.

`assetReviewGuide.ts` derives progress from the existing review, intake and
lifecycle projections. There is no browser-owned completion checklist: Next
never writes a decision, a planned supply is not issued ownership, and a live
pre-sale is not a live final market. Rejected, self-reviewed and collector-waiting
submissions have explicit stop states. Missing or failed projections do not
count as completed checks.

Review forms use the existing permission-controlled repository commands and
their version checks where supported. Successful mutations await projection refresh; failed refreshes pause
controls. Decisions require an explicit confirmation. Money entry uses exact
decimal-to-integer conversion, while receipt and verification notes record staff
observations rather than generated assertions. No schema migration is required.

The guide uses a persistent, grouped checklist beside the current task. The
asset resolver reports `intakeAvailable`: pre-approval and retired submissions
do not call the intake-only endpoint. Approved submissions and existing intakes
retain their normal errors and authorization checks. Image previews use the
review response's signed evidence URLs, with a retry when a refreshed URL changes.

## Admin presentation system

The five admin destinations and their record workspaces share the scoped
`src/styles/admin-design-system.css` layer. Slice's dark navy surfaces, mint
actions, readable tables, responsive navigation, forms and status treatments
are consistent across Home, Customers, Assets, Money and Platform. The scope
does not restyle the investor or collector applications.

Money's Trading, Reconciliation and Adjustments views put their records first;
Wallets & Movements retains the financial overview. Platform views have focused
headings, and only timestamp columns are formatted as dates. Record dialogs
keep keyboard focus inside the workspace and restore it on close. Existing
server permissions, self-review protections and mutation commands are unchanged.
