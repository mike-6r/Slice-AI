# Deployment plan

## Environments

- **Dev guild:** commands registered guild-scoped (instant propagation) against a local/staging
  Slice backend, for iteration during each implementation document.
- **Staging:** commands registered guild-scoped in a staging Discord server against Slice's staging
  environment, full Phase 1 command set, feature flags mostly on for QA.
- **Production:** commands registered globally (propagation delay expected) against Slice's
  production API, with every new command family shipped **flagged off by default** and enabled
  guild-by-guild after QA — mirroring Slice's own Doc 018 default-off philosophy.

## Runtime

- Containerized Node.js service, same base image conventions as Slice's `server/`.
- Two process types: gateway process (Discord connection + interaction handling) and worker
  process(es) (BullMQ job queues) — deployed and scaled independently so a gateway reconnect never
  blocks scheduled jobs.
- `/health` and `/ready` HTTP endpoints exposed for orchestration, mirroring Slice's Doc 001/002
  convention (`/ready` returns 200 only when Discord gateway + Slice API + bot DB/Redis are all
  reachable).

## Secrets

- Discord bot token, Slice service-account credential, bot DB/Redis connection strings — all in the
  deployment secret manager, never in source control or logs. Rotation procedure documented
  alongside Slice's own credential-rotation runbook once the service-account credential type exists
  (BOT_API_REQUIREMENTS.md §3).

## Rollout sequence

1. Deploy to dev guild, validate against local/staging Slice — Implementation Docs 001–003.
2. Deploy account-linking to staging once Slice's team has shipped the new bot-only endpoints
   (BOT_API_REQUIREMENTS.md §1–3) on staging — Implementation Docs 004–006.
3. Deploy read-only marketplace/collector/vault/watchlist/notification commands to staging —
   Implementation Docs 007–010.
4. Deploy bot-owned community features (tickets, moderation, giveaways, suggestions) to staging,
   independent of any Slice timeline — Implementation Docs 011–014.
5. Production rollout of Phase 1, flagged off by default, enabled per-guild after manual QA sign-off
   — Implementation Docs 017–018.
6. Phase 2+ features remain undeployed until their named Slice backend document ships and, where
   flagged, a separate product/legal decision is made (BOT_PRODUCT_SPEC.md client-wishlist table).

## Rollback

- Command deregistration is immediate (guild-scoped) or delayed (global) — feature flags are the
  primary rollback mechanism for behavior, not command removal, to avoid Discord's global-command
  propagation delay working against an incident response.
- Bot-owned data (tickets, moderation history) is never deleted on rollback; only the interaction
  surface is disabled.
