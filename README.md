# Slice

Slice is a collectible platform with a React/TanStack Start web application, a
NestJS API, and a Discord companion service. The API is the authority for
identity, submissions, canonical assets, intake/custody, valuation, ownership,
finance, publication, and trading. The browser and Discord bot consume
authorised projections; neither replaces those domain authorities.

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

- [Current system state](docs/CURRENT_SYSTEM_STATE.md)
- [Environment configuration](docs/engineering/ENVIRONMENT_CONFIGURATION.md)
- [Package version policy](docs/engineering/PACKAGE_VERSION_POLICY.md)
- [Verification and CI](docs/engineering/VERIFICATION.md)
- [Audit index](docs/audit/README.md)
- [Staging VPS deployment](docs/STAGING_VPS_DEPLOYMENT.md)

Staging deployment is a manual immutable-release procedure. GitHub Actions is
verify-only and never deploys, contacts live providers, or uses staging data.
