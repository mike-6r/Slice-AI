# Wave 2 removal report

Audit date: 2026-08-26
Starting commit: `b009fb8`

This report records only removals backed by direct static evidence. No schema,
migration, dependency, backend authority, financial, ownership, custody, market,
or controlled-asset behavior was changed.

## Local release artifacts

| Path / item | Why removed | Evidence of zero use | Replacement | Risk | Regression proof |
| --- | --- | --- | --- | --- | --- |
| Repository-root `*.tar.gz` / `*.zip` (nine files) | Ignored local release bundles should not be retained in the worktree. | No package, deployment, rollback, manifest, or runbook reference named any bundle. `.gitignore` ignores them and `DEPLOYMENT.md` explicitly directs operators not to create local release archives. | VPS immutable releases remain the rollback mechanism. | Low | Verified no root archive remained after removal. |

The following 119,097,590 bytes were removed from the local worktree to the
Windows Recycle Bin: `slice-auth-refresh-e5064ac.tar.gz`,
`slice-connect-responsibilities-941e007.tar.gz`,
`slice-connect-v2-a2fea0c.tar.gz`, `slice-provider-12e595f-20260819.tar.gz`,
`slice-provider-523a413-20260820.tar.gz`,
`slice-provider-523a413-20260820.zip`,
`slice-release-501bc2ddc060c09db65a8d743e9742ce1b9b94f6.tar.gz`,
`slice-release-804943cd063d780c500352d5460b64b5f8e23a7b.tar.gz`, and
`slice-release-c3a92e4.tar.gz`. Remote VPS releases were not accessed.

## Dead frontend modules

| Path / symbol | Why removed | Evidence of zero use | Replacement | Risk | Regression proof |
| --- | --- | --- | --- | --- | --- |
| `src/components/ui/{alert-dialog,calendar,carousel,context-menu,dropdown-menu,hover-card,input-otp,menubar,navigation-menu,radio-group,resizable,scroll-area,slider,toggle-group}.tsx` | Unused generated UI primitives. | Repository-wide import-path tracing found no runtime, test, route, dynamic-import, Storybook, or barrel consumer for each module. | None; no active surface imported them. | Low | Frontend typecheck, tests, production build, and changed-file lint. |
| `OwnershipService.percentageForUnits` in `src/services/app-services.ts` | Unused frontend presentation helper. | Its declaration and implementation were the only repository references; no service consumer or test invoked it. | None. Authoritative ownership calculations remain backend-owned and unchanged. | Low | Frontend typecheck, tests, production build, and changed-file lint. |

## Routes and authority intentionally retained

| Surface | Classification | Evidence |
| --- | --- | --- |
| `/admin` | KEEP DISTINCT | Privileged console projection using `admin.console.read`, with catalogue, intake, and broader administration workflows. |
| `/staff` | KEEP DISTINCT | Role-gated staff entry point with capability-aware workspace links. |
| `/operations/submissions` | KEEP DISTINCT | Reviewer workflow with claim, release, evidence, condition, valuation, notes, and decision mutations; admin review links intentionally deep-link here. |
| `/operations/assets` | KEEP DISTINCT | Staff lifecycle workspace exposing custody, valuation, coverage, and publication actions against the lifecycle authority. |
| Admin Asset Operations | KEEP | It consumes the richer operations-board projection and has active search, control-centre, detail, and collectible-detail deep links. Consolidation would touch custody/valuation/market workflow behavior and is not high-confidence Wave 2 cleanup. |

No redirects, route removals, API wrapper removals, backend deletions, stale style
deletions, or documentation archival were justified by the evidence in this wave.
Mock mode remains supported because `VITE_DATA_SOURCE=mock` is explicitly
documented, dynamically imported, and used by tests.
