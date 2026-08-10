# Slice backend build guide

This is the permanent, implementation-first development queue for Slice. It was generated from
the supplied `slice-premium-frontend.zip` and its bundled `server/` source on 2026-08-05. The
archive contains no Git metadata, so no repository revision is available. It is an audit of source,
not a claim that prototype UI or planned contracts are live.

Documents are ordered by safety and dependency in `IMPLEMENTATION_ORDER.md`; they are not ordered
by page. `CURRENT_STATE.md` names the only approved next task. Status is tracked in
`project-state.json`, each implementation document, and `MASTER_CHECKLIST.md`. After a document is
implemented, update all three with test evidence and the actual file/migration/API names before
another document is assigned.

All files under `implementation/` are standalone execution prompts with the same 26-section
contract: metadata, source audit, exact scope and file plan, persistence/domain/API/security/event
specifications, frontend alignment, ordered implementation, tests/QA/commands/state updates,
granular completion evidence, final-report format and an explicit stop condition.

## Operating rule

Every future Codex implementation session must:

1. Read `AGENTS.md`.
2. Read this file.
3. Read `CURRENT_STATE.md`.
4. Read `MASTER_FEATURE_MAP.md`.
5. Read `IMPLEMENTATION_ORDER.md`.
6. Read the assigned implementation document.
7. Inspect the actual relevant source code.
8. Run the current verification baseline.
9. Create an internal checklist.
10. Implement only the assigned document.
11. Run every required test and manual verification.
12. Update project state and the document checklist.
13. Stop before the next document.

Never start a later document early. The implementation documents are coding prompts, not design
approval for payments, compliance, custody, or production trading; those retain explicit provider,
legal, security, and operational gates.
