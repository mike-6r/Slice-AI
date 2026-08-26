# Wave 4 dependency and lint report

## Scope and boundaries

Wave 4 started from `66ef971` and covers only package hygiene, lockfile
normalization, lint/format baseline work, and verification scripts. It makes
no product, authority, schema, migration, route, deployment, provider, or
economic changes.

The three independent package roots remain:

| Root | Package | Lockfile | Validation owner |
| --- | --- | --- | --- |
| `.` | `slice-frontend` | `package-lock.json` | frontend |
| `server` | `slice-api` | `server/package-lock.json` | API |
| `apps/discord-bot` | `@slice/discord-bot` | `apps/discord-bot/package-lock.json` | Discord service |

All roots now declare the Node 22 support range and the repository includes
`.nvmrc` with `22`. GitHub Actions already installs Node 22 for each root.
The local desktop validation ran on Node 24.15.0, which emitted expected
engine warnings but did not replace the deliberate Node 22 policy.

## Formatting and lint baseline

The dedicated mechanical formatting commit is `d173e4f`.

- Scope: `src`, `scripts`, root package/tooling configuration, and CSS.
- Formatted source files: 31 files changed by Prettier; generated output and
  lockfiles were not formatted.
- `npm run format:check`: pass.
- Full frontend lint before: Wave 1 recorded approximately 3,959 Prettier
  errors, 0 non-Prettier errors, and 10 warnings.
- Full frontend lint after: 0 errors and 9 warnings.

The remaining warnings are not suppressed or globally disabled:

| Rule | Files | Status |
| --- | --- | --- |
| `react-refresh/only-export-components` | `Section.tsx`, `badge.tsx`, `button.tsx`, `form.tsx`, `sidebar.tsx`, `toggle.tsx`, `CurrencyProvider.tsx`, `AppServicesProvider.tsx` | Existing advisory warnings; defer component/module boundary decisions to a focused UI refactor. |
| `react-hooks/exhaustive-deps` | `operations.submissions.tsx:673` | Existing dependency advisory; defer because changing effect dependencies is behavioral, not a formatting fix. |

`verify-repo.mjs` now runs the full frontend lint gate and generates the API
Prisma client before validating and typechecking. This makes a clean install
reproducible instead of relying on a previously generated client.

## Dependency review and changes

### Removed frontend dependencies

The following direct frontend dependencies had no remaining imports,
configuration references, or script references after the Wave 2 UI cleanup:

`@hookform/resolvers`, `@radix-ui/react-alert-dialog`,
`@radix-ui/react-context-menu`, `@radix-ui/react-dropdown-menu`,
`@radix-ui/react-hover-card`, `@radix-ui/react-menubar`,
`@radix-ui/react-navigation-menu`, `@radix-ui/react-radio-group`,
`@radix-ui/react-scroll-area`, `@radix-ui/react-slider`,
`@radix-ui/react-toggle-group`, `@tanstack/router-plugin`, `date-fns`,
`embla-carousel-react`, `input-otp`, `nitro`, `react-day-picker`, and
`react-resizable-panels`.

No backend or Discord runtime dependency was removed.

### Aligned packages

| Tool | Before | After | Reason |
| --- | --- | --- | --- |
| TypeScript | root/API `^5.8.3`; Discord `5.8.3` | `^5.9.3` in all roots | Safe same-major alignment, validated across all roots. |
| Prisma | API `^6.19.3`; Discord `6.19.0` | `^6.19.3` in both roots | Shared-schema generated client compatibility. |
| ESLint | frontend/API resolved `9.39.5`; Discord `9.32.0` | `9.39.5` in all roots | Safe same-major linter baseline. |
| Prettier | frontend/API resolved `3.9.6`; Discord `3.6.2` | `3.9.6` in all roots | Safe same-major formatter baseline. |

No framework, React, Vite, Nest, Prisma-major, database, or generated-client
architecture upgrade was made. Deferred major updates include ESLint 10,
Prisma 7/8, Recharts 3, Zod 4, and TypeScript 7. Existing package deprecation
notices for Recharts 2, Otplib 12, and transitive tooling remain documented for
a planned compatibility wave.

## Lockfiles, installs, and security

- Each changed manifest updated only its own package lock.
- `npm ci` passed independently in frontend, API, and Discord roots.
- `npm audit --omit=dev` remains non-zero; no `--force` remediation was run.

| Root | Audit result | Deferred remediation |
| --- | --- | --- |
| Frontend | 1 high: transitive `nanoid` | Requires upstream dependency resolution. |
| API | 3 high: direct Prisma path via `@prisma/config` / `deepmerge-ts` | A Prisma upgrade requires separate compatibility review. |
| Discord | 4 high: same Prisma path plus direct `sharp`/libvips advisories | Requires Prisma and Sharp compatibility review. |

## Validation

After clean installs and the aligned tooling update:

- `npm run format:check`: pass.
- `npm run verify`: pass.
- Frontend: typecheck pass, 40 test files / 163 tests pass, production build
  pass, full lint 0 errors / 9 recorded warnings.
- API: Prisma generate and validate pass, typecheck and lint pass, 79 suites /
  355 tests pass, build pass.
- Discord: Prisma generate pass, typecheck and lint pass, 31 unit test files /
  167 tests pass, build pass.
- Discord integration tests were skipped because no isolated
  `TEST_DATABASE_URL` PostgreSQL service was available locally; CI provisions
  that dependency.

## Wave 5 handoff

Wave 4 leaves a clean package baseline and a reproducible verification gate.
The next cleanup wave may address remaining large-module/dependency debt only
as a separately scoped change; it should not bundle deferred framework or
security-major upgrades.
