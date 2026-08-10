# Implementation document template

Every file in `implementation/` follows this structure. Sections may be marked "N/A — see
[reason]" but must never be silently omitted. No section may claim a capability, endpoint, or
behavior that is not verified in the top-level documents it cites. Follow `MASTER_CHECKLIST.md`'s
accuracy rules throughout: never claim a feature works because a command exists, never claim a
Slice API exists because a frontend button exists, never claim Discord linking is implemented
because web login works, never claim ownership/trading commands are available before the backend
exists, never claim notifications can push to Discord without a delivery design, never treat
Discord admin roles as equal to Slice permissions, never treat mock/demo data as live data.

---

## 1. Metadata

- **Document number:**
- **Title:**
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** implementation documents that must close first
- **Blocks (this build guide):** implementation documents that cannot start until this one closes
- **Slice backend dependency:** named Slice backend document(s), or "none"
- **Can start today:** Yes / Blocked — [reason]

## 2. Project context

One paragraph restating what Slice is, what this bot is (a companion client, never a second
backend), and where this document sits in the overall build (cross-reference
`IMPLEMENTATION_ORDER.md`).

## 3. Current implementation audit

What exists in the new bot codebase before this document starts (cross-reference the previous
document's completion state). For Document 001 this is explicitly "nothing — this is the first
implementation document."

## 4. Old bot behavior migrated

Cite specific rows from `OLD_BOT_FEATURE_INVENTORY.md` / `OLD_TO_NEW_MIGRATION_MATRIX.md` that this
document's scope covers, with their migration status (PRESERVE/REWRITE/MERGE/REPLACE/REMOVE/DEFER/
UNKNOWN). Write "None — this document has no old-bot predecessor" if true; do not force a mapping
that isn't real.

## 5. Slice features supported

Cite the specific Slice feature area(s) and backend document(s) this scope touches, with their
verified status (VERIFIED/PARTIAL/NOT STARTED/DEFERRED/MOCKED per `CURRENT_STATE.md` and
`project-state.json`).

## 6. Files to read before starting

Explicit list of files in this build guide (and, where relevant, specific Slice source/doc paths)
an implementer must read before writing code for this document.

## 7. Strict scope

Bullet list of exactly what this document delivers. Nothing implied, nothing assumed.

## 8. Out of scope

Bullet list of adjacent things this document explicitly does NOT deliver, especially anything that
could be mistaken for in-scope given the title.

## 9. Dependencies

Runtime/library/service dependencies newly introduced or required by this document.

## 10. Bot-owned persistence

Any new tables/collections this document introduces in the bot's own database (per
`BOT_DATA_OWNERSHIP.md`), with schema sketch. "None" if this document is read-only against Slice.

## 11. Slice API dependencies

Table of every Slice endpoint this document's code calls, each tagged exactly as in
`BOT_API_REQUIREMENTS.md`: already-available (VERIFIED), new-endpoint-required, or
bot-only-service-endpoint (and if the latter, whether it is itself proposed/not yet built).

## 12. Commands / events / jobs delivered

Table pulled directly from `COMMAND_CATALOGUE.md` / `EVENT_AND_JOB_CATALOGUE.md`, filtered to this
document's scope only.

## 13. Permission rules

Cite the relevant rows of `PERMISSION_MATRIX.md`. State explicitly that Discord role/permission
checks are a UX gate only and never a substitute for the Slice API's own authorization response.

## 14. Security requirements

Cite the relevant sections of `BOT_SECURITY_MODEL.md`. Call out anything specific to this
document's scope (token handling, PII exposure, admin confirmation, etc.).

## 15. Idempotency and rate limits

State the idempotency key scheme (if this document performs mutations) and the applicable rate
limits, consistent with `BOT_SECURITY_MODEL.md` and `COMMAND_CATALOGUE.md`.

## 16. Audit requirements

What must be logged, where (Slice `AuditEvent` via the API vs. the bot's own operational log), and
on which actions.

## 17. Error behavior

Cite the relevant rows of `ERROR_CATALOGUE.md`. List any error cases specific to this document not
already covered there, and the exact user-facing copy pattern to use.

## 18. Interaction UX

Wireframe-in-words for each command/component: embed fields, buttons, modals, ephemeral vs. public,
pagination, confirmation flows — consistent with the "UI standards" section of
`COMMAND_CATALOGUE.md`.

## 19. Implementation file plan

Proposed file/module layout this document creates or modifies, with one-line purpose per file.

## 20. Numbered implementation steps

Ordered, concrete steps an implementer follows. Each step is small enough to be independently
verifiable.

## 21. Unit tests

What gets unit-tested, and the expected assertions (business logic, validators, formatters —
anything without I/O).

## 22. Integration tests

What gets integration-tested against a mocked/stubbed Slice API and/or the bot's own database.

## 23. Discord interaction tests

What gets tested via discord.js's interaction-simulation tooling (command parsing, component
handlers, permission gates) without a live Discord connection.

## 24. Manual QA checklist

Checklist a human runs by hand in a dev guild before sign-off.

## 25. Verification commands

Exact commands to run, e.g.:

```
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

## 26. Completion checklist

Checklist mirroring `MASTER_CHECKLIST.md`'s style, specific to this document, all boxes unchecked
until the work is actually done.

## 27. Documentation updates

Which top-level documents in this build guide (if any) need a status update once this document's
work lands (e.g., flipping this document's row in `IMPLEMENTATION_ORDER.md`/`PROMPT_INDEX.md` to
COMPLETE, updating `CURRENT_STATE.md`).

## 28. Final report format

The exact structure the implementer's completion report must follow (mirrors the top-level build
guide's own final report format, scoped to this document).

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
