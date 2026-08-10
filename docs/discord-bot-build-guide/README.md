# Slice Discord bot — build guide

This is a **documentation-only** modernization and migration plan for a new Slice Discord bot. It
contains zero application code. It was produced by reviewing two source repositories in full:

1. **Current Slice** — the active collectibles/marketplace platform (backend + frontend), at
   `slice-project/` — its real, verified backend state (not its roadmap, not its frontend mocks)
   is the ground truth for every claim in this guide.
2. **Old Python Discord bot** — a discord.py 1.6.0 bot named **Infria**, for an unrelated
   FiveM/GTA roleplay community (gangs/factions, a Tebex store). It has zero product overlap with
   Slice. It was reviewed anyway, on explicit user direction, purely as a source of reusable
   Discord-infrastructure patterns (tickets, moderation, giveaways, error handling) — not as a
   feature blueprint for anything Slice-specific.

See `CURRENT_STATE.md` for exactly what state this project is in right now, and
`project-state.json` for a structured machine-readable summary.

## Read order

1. `CURRENT_STATE.md` — state of this build guide (start here).
2. `OLD_BOT_FEATURE_INVENTORY.md` — every feature in the old bot, with a migration status.
3. `OLD_TO_NEW_MIGRATION_MATRIX.md` — how each PRESERVE/REWRITE/MERGE/REPLACE feature migrates.
4. `SLICE_FEATURE_COMPATIBILITY.md` — old-bot patterns vs. what Slice's real backend supports.
5. `BOT_PRODUCT_SPEC.md` — what the new bot is, isn't, and the client wishlist reality check.
6. `BOT_ARCHITECTURE.md` — technology choice (TypeScript + discord.js) and system design.
7. `BOT_SECURITY_MODEL.md` — account linking, permissions, token handling, abuse resistance.
8. `BOT_DATA_OWNERSHIP.md` — what the bot owns vs. what only Slice owns.
9. `BOT_API_REQUIREMENTS.md` — every Slice endpoint used, and every new endpoint proposed.
10. `COMMAND_CATALOGUE.md` — every planned command, phased and cross-referenced to backend calls.
11. `PERMISSION_MATRIX.md`, `EVENT_AND_JOB_CATALOGUE.md`, `ERROR_CATALOGUE.md` — supporting specs.
12. `TEST_STRATEGY.md`, `DEPLOYMENT_PLAN.md` — how it gets tested and shipped.
13. `IMPLEMENTATION_ORDER.md` / `PROMPT_INDEX.md` — the 18 implementation documents, in order.
14. `IMPLEMENTATION_DOCUMENT_TEMPLATE.md` — the structure every implementation document follows.
15. `implementation/001-*.md` onward — the actual build, one document at a time.

## Ground rules (apply to every document in this guide and to anyone implementing from it)

- The Discord bot is a **companion client to Slice**. It never becomes a second backend. It never
  duplicates business rules. It never queries Slice's Postgres/Prisma directly — every read or
  write goes through Slice's HTTP API (existing or newly proposed, see `BOT_API_REQUIREMENTS.md`).
- Nothing in this guide claims a capability that isn't backed by evidence: a working command is
  never assumed from a frontend button, a Slice API is never assumed from a UI mock, account
  linking is never assumed from web login, and mock/demo data is never presented as live data.
- No Slice source, no Prisma schema, no migration, and no old-bot source has been changed by
  producing this guide.
- Implementation has not started. The one and only approved next action is Implementation
  Document 001, run to its own completion and stop condition, before any human decides whether to
  proceed further.

## Scope boundaries this guide does not cross

- Does not rewrite Slice's backend or frontend.
- Does not modify Slice's Prisma schema or apply any migration.
- Does not change any Slice API.
- Does not implement the Discord bot.
- Does not begin Implementation Document 001's actual coding.
