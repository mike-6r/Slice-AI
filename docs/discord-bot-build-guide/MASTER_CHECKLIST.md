# Master checklist

## Review completion (this build guide)

- [x] Active Slice workspace verified (docs/backend-build-guide/ with implementation docs 001–018,
      009 and 009A present, CURRENT_STATE.md/MASTER_CHECKLIST.md/project-state.json consistent)
- [x] Old Python bot workspace located and confirmed with the user (Infria bot, unrelated product
      domain, treated as-is per explicit user direction)
- [x] Entire old bot inspected (`main.py` + all 12 cogs read in full)
- [x] Relevant Slice architecture inspected (18 backend implementation docs + supporting docs read
      in full or extracted in full detail via delegated research)
- [x] Old bot feature inventory created (`OLD_BOT_FEATURE_INVENTORY.md`) with a migration status on
      every feature
- [x] Slice compatibility matrix created (`SLICE_FEATURE_COMPATIBILITY.md`)
- [x] New bot product spec created (`BOT_PRODUCT_SPEC.md`), including the client's supplementary
      feature-wishlist reality check
- [x] Technology recommendation documented (`BOT_ARCHITECTURE.md` — TypeScript/discord.js)
- [x] New architecture documented (`BOT_ARCHITECTURE.md`)
- [x] Security model documented (`BOT_SECURITY_MODEL.md`)
- [x] Bot/API boundaries documented (`BOT_DATA_OWNERSHIP.md`)
- [x] Backend requirements documented (`BOT_API_REQUIREMENTS.md`)
- [x] Command catalogue created (`COMMAND_CATALOGUE.md`)
- [x] Permission matrix created (`PERMISSION_MATRIX.md`)
- [x] Event/job catalogue created (`EVENT_AND_JOB_CATALOGUE.md`)
- [x] Old-to-new migration plan created (`OLD_TO_NEW_MIGRATION_MATRIX.md`)
- [x] New Slice feature plan created (folded into `BOT_PRODUCT_SPEC.md` and `COMMAND_CATALOGUE.md`)
- [x] Implementation order created (`IMPLEMENTATION_ORDER.md`)
- [x] Individual implementation documents created (`implementation/001`–`018`)
- [x] Every implementation document includes tests and a stop condition
- [x] No Slice source changed
- [x] No old bot source changed
- [x] No unsupported functionality claimed (every client-requested feature that isn't backed by a
      VERIFIED Slice API is explicitly marked phase-gated or needs-product-decision, never silently
      implied as buildable)
- [x] No implementation work started (this build guide is documentation only)

## Production readiness (future — not evaluated by this review)

- [ ] Discord bot implementation begun (Document 001)
- [ ] New Slice backend endpoints (BOT_API_REQUIREMENTS.md §1–3) built and verified by Slice's own
      team
- [ ] Slice Doc 017 ships with a Discord/webhook notification channel before any push-delivery work
      begins
- [ ] Slice Docs 012–014 ship before any ownership/portfolio/trading-adjacent bot feature is built
- [ ] Slice Doc 016 unblocked (compliance/provider approval) and Slice Doc 018 launch gate passed
      before any wallet/deposit/withdrawal/trading bot feature is built
- [ ] Product/legal decision recorded on peer-to-peer request/offer boards and any "Buy"-style
      button before those are designed further
