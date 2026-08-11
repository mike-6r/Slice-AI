# Staging Collector Demo Guide

## Scope and safety

This is a **staging-only**, idempotent showcase fixture. It refuses to run unless both `SLICE_ENV=staging` and `ALLOW_DEMO_DATA_SETUP=true` are set. It never resets the database, truncates data, changes existing passwords, creates provider-success records, or mutates finance balances directly.

Run from `server` with the normal staging environment loaded. Start with the
read-only preflight: it confirms that the configured setup account exists,
is `ACTIVE`, and has the existing `ADMIN` role. It deliberately never checks
or prints a password.

```bash
npm run staging:demo:preflight
npm run staging:demo:refresh
npm run staging:demo:market:check
npm run staging:demo:market:verify
```

The command requires the existing `DEMO_SETUP_ADMIN_EMAIL` / `DEMO_SETUP_ADMIN_PASSWORD` plus the demo passwords already configured in the VPS-only demo environment. Passwords are intentionally not documented here.

`staging:demo:refresh` is the canonical idempotent restoration command. It
only restores explicitly named staging-demo records and never resets or
truncates the database. `staging:demo:market:check` evaluates the exact
public-market projection and reports any missing publication, safe media,
public collector profile, or catalogue count before the browser is used.

## Accounts

- **Slice Demo Collector** — `demo-collector@slicecollectable.com`
  - normal `USER` investor authority
  - `ASSET_REVIEWER` solely for the existing collector/review workspace
  - public handle: `@slice-demo-collector`
- **Slice Demo Collector B** — private counterpart used for review-isolation fixtures
- **Slice Demo Investor** — existing investor demo identity funded only through the D13 balanced journal fixture

## What the collector fixture creates

- public profile and concise professional bio specialising in Pokémon, Sports Cards, Yu-Gi-Oh!, Magic: The Gathering and One Piece;
- ten branded, staging-safe collectible catalogue records;
- D10 submissions with legitimate front/back evidence state, including drafts, submitted review work, changes-requested evidence follow-up, custody-ready, and published examples;
- eight D11-published marketplace listings backed by custody, valuation, coverage and publication services (five from Slice Demo Collector and three from Slice Demo Specialist);
- D12 issuance of 1,000 fractional units per published asset and a 300-unit collector position via the authoritative ownership transfer service;
- 45 days of clearly labelled `STAGING_DEMO_MARKET` history and current public market snapshots for published listings;
- five Collector B private submissions, with three claimed by Demo Collector to make the real review workspace meaningful.

## Public vs private boundaries

`/collectors` and `/collector/:id` expose only the public profile, category/title listing catalogue, safe market amount/status and count. They do not expose user IDs, ownership positions, reservations, journal data, D10 evidence, review status, private notes, or provider/compliance data.

The current D10 local object storage adapter is process-local, not a durable public object store. The fixture deliberately does **not** generate broken thumbnail URLs. A real object-storage/CDN provider is the required external gate for durable public image thumbnails.

## Trading and provider gates

The fixture does not manufacture D14 eligibility, provider verification, cash reservations, orders, executions, or settlement. If current staging configuration grants normal D14 capability, its APIs can be exercised against the published fractional inventory. Otherwise the capability response is the correct, safe outcome. D16 providers remain sandbox/certification dependent.
