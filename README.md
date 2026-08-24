# Slice frontend

Slice is a frontend prototype for a social investment platform for authenticated collectible assets. Its product message is **Invest. Collect. Grow.**

## Scope

This repository contains the Slice web application. In `VITE_DATA_SOURCE=api` mode, the showcase path uses the authoritative Slice APIs for session restoration, catalogue reads, Document 013 portfolio/wallet projections, Document 014 orders/executions, and Document 017 notifications/SSE. `VITE_DATA_SOURCE=mock` remains an explicit local visual-development mode only; it never silently substitutes data in API mode.

## Stack

- React 19 and TypeScript
- TanStack Start, Router, and Query
- Vite and Tailwind CSS v4
- Radix UI primitives and Recharts

## Local setup

Use Bun (the lockfile is committed) or npm with an equivalent compatible dependency install.

```bash
bun install
bun run dev
bun run typecheck
bun run lint
bun run build
```

Set `VITE_DATA_SOURCE=api` and `VITE_API_BASE_URL=http://127.0.0.1:3001` to run the real local showcase. Do not add secrets to client-exposed variables.

## Structure

- `src/routes` — TanStack file routes; route files should compose presentation and data boundaries.
- `src/components` — reusable layout, design-system, chart, and feature components.
- `src/domain` — shared frontend types for Slice concepts and money conventions.
- `src/mocks` — local, explicitly simulated data used by the current prototype.
- `src/repositories` — interfaces/adapters that isolate routes from the eventual API implementation.
- `src/lib` — small cross-cutting utilities such as display formatters.

## Conventions

Use the shared AppShell and design-system primitives before adding page-specific styling. Currency values at the domain boundary use GBP integer minor units. Format them through `src/lib/format.ts`; never use floating point arithmetic for settlement or final payment calculations.

Routes must not embed large datasets. Add local data to `src/mocks` behind a repository interface, then replace that adapter with an API implementation when backend work begins.

## Homepage composition

The homepage (`src/routes/index.tsx`) is composed from focused components in `src/components/home`
rather than one large section file: `HomeHero` (with `CollectibleShowcase` and `FeaturedAssetPanel`),
`MarketOverview`, `TrendingOpportunities`, `MarketMoversPanel`, `PortfolioPreviewPanel`,
`AssetAllocationPanel`, `WhySliceSection` and `HomeCTA`. The application shell is likewise split into
`MarketTicker`, `MainNavigation` and `SiteFooter` under `src/components/layout`.

`src/components/home/HomeSections.tsx` is a deprecated re-export shim kept only so stale imports keep
resolving; it can be deleted once nothing references it.

### Asset value model

Assets carry two distinct monetary figures, matching the product model:

- `price` — the per-unit Slice market price, used by the market snapshot tape.
- `marketValue` — the estimated market value of the whole physical collectible, used by the hero,
  the trending cards, market movers and the marketplace list, filters and sorting.

The homepage does not hardcode which asset is featured. `featuredAsset()` in `src/mocks/home.ts`
selects whichever asset currently has the highest `marketValue`, and `trendingAssets()` returns the
highest-value assets, so adding a more valuable asset automatically promotes it into the showcase.

## Showcase integration

The API-backed showcase covers login/session recovery, marketplace and asset history, public order books/recent executions, backend-authoritative limit buy/sell submission and cancellation, portfolio/wallet projections, transaction history, durable notifications and best-effort authenticated SSE refresh. The browser only displays or submits inputs: balances, reservations, matching, settlement and fees remain backend authority. Discord account linking is also API-backed and optional: it uses a server-side OAuth `identify` flow when the server has the documented Discord credentials, otherwise the account screen presents an explicit unavailable state.

The included local `server` browser QA seed is catalogue/notification-only. It is safe to use in development and is intentionally not a financial/trading fixture. See [SHOWCASE_DEMO.md](docs/product/SHOWCASE_DEMO.md) for service startup, local seed behaviour and the demo path.

## Testing and deployment

This project currently has lint, typecheck, and production-build verification. Add route/component tests alongside new behavior. The TanStack Start build emits an SSR request handler rather than a static `index.html`; `npm run start:ssr` hosts that handler for a Node reverse-proxy deployment. Configure environment variables in the deployment platform, not in source control. The staging VPS procedure, health checks, backups and rollback boundaries are documented in [docs/STAGING_VPS_DEPLOYMENT.md](docs/STAGING_VPS_DEPLOYMENT.md).

## Discord operations

The Discord companion bot is deliberately separated from financial authority:
it provides community, support, moderation, and safe public-data surfaces only.
Its operational QA and command documentation is in
[`docs/discord`](docs/discord/), including advanced tickets, aggregate
analytics retention, Collector/Collectible Spotlight, and community systems.
