# Slice API — Phase 1 foundation

This directory is an isolated NestJS backend foundation. Phase 1 deliberately contains no identity, assets, verification, vault, market, ownership, wallet, trading, provider, or financial-ledger behaviour.

## Local development

1. Copy `.env.example` to `.env` and adjust local values if necessary.
2. Run `npm install`.
3. Optionally run `docker compose up -d` to provision empty PostgreSQL and Redis development services. The API does not connect to them yet.
4. Run `npm run start:dev`.
5. Check `GET http://127.0.0.1:3001/api/v1/health`.

## Phase 1 guarantees

- Configuration is validated before boot.
- API responses have request IDs and user-safe error envelopes.
- CORS is configured from an allowlist.
- Only read-only `GET`, `HEAD`, and `OPTIONS` methods are enabled at this phase.

## Deferred phases

All persistence schemas, authentication, permissions, domain APIs, jobs, WebSockets, and external providers are explicitly deferred to later phases.
