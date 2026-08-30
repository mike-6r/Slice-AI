# Verification and CI

Run `npm run verify` from the repository root for the normal local gate. It
runs frontend typecheck/tests/build, changed-file lint, backend Prisma
validation/typecheck/lint/tests/build, and Discord typecheck/lint/unit tests/
build.

The command reports four outcomes: **PASS**, **FAIL**, **SKIPPED —
PREREQUISITE MISSING**, and **KNOWN BASELINE DEBT**. The frontend full lint is
intentionally visible but not a passing gate until the dedicated formatting
wave; use `npm run lint` to see it. `npm run lint:changed` is enforced for
changed frontend/server/Discord source files. Set `LINT_CHANGED_BASE=<git ref>`
to lint a PR range. Set `LINT_CHANGED_SCOPES=frontend`, `backend`, `discord`,
or a comma-separated combination when the available install only contains a
specific package toolchain.

Discord database integration is explicit:

```bash
TEST_DATABASE_URL=postgresql://.../slice_test npm --prefix apps/discord-bot run test:integration
```

The URL must be an isolated `slice_test` PostgreSQL database. Backend
integration/E2E commands also require isolated PostgreSQL plus Redis; see
`server/scripts/run-test-suite.mjs`. GitHub Actions supplies disposable
PostgreSQL and Redis and never targets staging or live providers.

The frontend production build currently emits large-chunk warnings. They are a
recorded performance/decomposition follow-up, not a functional build failure.
