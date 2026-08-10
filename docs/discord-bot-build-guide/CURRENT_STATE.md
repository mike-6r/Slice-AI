# Current state — Slice Discord bot build guide

This file describes the state of **this Discord bot project**, not Slice's own backend (see
Slice's `docs/backend-build-guide/CURRENT_STATE.md` for that — summarized in
`project-state.json`'s `sliceBackendStatus`).

## Status: documentation complete, zero code written

- This build guide (`docs/discord-bot-build-guide/`) is **complete**: every top-level document and
  all 18 numbered implementation documents exist.
- **No Discord bot code exists anywhere.** There is no repository, no `package.json`, no
  `src/`, nothing beyond this documentation tree.
- **No Slice source file has been modified.** No Prisma schema change, no migration, no API
  change, no frontend change.
- **The old Python bot's source has not been modified.** It was read-only reviewed for feature
  inventory and security findings (see `OLD_BOT_FEATURE_INVENTORY.md`).
- **Implementation has not begun.** Per `IMPLEMENTATION_ORDER.md`, the next and only approved
  action is to start Implementation Document 001
  (`implementation/001-repository-reconciliation-and-bot-foundation.md`), strictly in order, one
  document at a time, stopping after each one per its own stop condition.

## What "done" means for this build guide

All of the following are true as of this document's creation:

- Both source repositories (current Slice, old Python bot) were located, read, and their identity
  confirmed with the user.
- Slice's real backend state was verified from its own build guide and source docs, not assumed.
- The old bot's every cog and its entry point were read in full; every feature was catalogued with
  an explicit migration status.
- A new bot product spec, architecture, security model, data-ownership model, API requirements,
  command catalogue, permission matrix, event/job catalogue, error catalogue, test strategy, and
  deployment plan were all written from that verified material.
- The client's supplementary feature wishlist was folded into the product spec and command
  catalogue with an explicit BUILD NOW / PHASE-GATED / NEEDS PRODUCT-LEGAL-DECISION classification
  per item — nothing was silently assumed buildable.
- 18 implementation documents were written, each independently scoped, each carrying its own test
  plan and stop condition, ordered per real dependencies (including genuine Slice backend
  blockers, not just convenience ordering).

## What happens next

A human (or an implementer instance, e.g. Codex) picks up `implementation/001-*.md`, follows it to
its own completion checklist, stops, and only then a human decides whether to proceed to 002. This
build guide does not authorize skipping ahead, batching documents together, or starting
implementation work outside the `implementation/` documents' own stated scope.

## Known blockers (see `IMPLEMENTATION_ORDER.md` and `MASTER_CHECKLIST.md` for full detail)

- Documents 004–006, 009, 010, 013 require new Slice backend endpoints
  (`BOT_API_REQUIREMENTS.md` §1–3) that do not exist yet — spec work can proceed, full closure
  cannot, until Slice's own team builds them.
- Any push-notification-to-Discord feature is blocked on Slice Doc 017 shipping a `DISCORD`
  channel type, which does not exist in any Slice document today.
- Any ownership/portfolio/trading-adjacent feature is blocked on Slice Docs 012–014, and any
  wallet/deposit/withdrawal feature is additionally blocked on Slice Doc 016 (DEFERRED) and Doc
  018's launch gate.
- Peer-to-peer request/offer boards and any "Buy"-style button require a separate product/legal
  decision before further design, independent of backend readiness.
