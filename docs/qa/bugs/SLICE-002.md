# Bug Report

Bug ID:  
SLICE-002

Area:  
Security / Permissions

Title:  
Dedicated Collector QA account has active staff-reviewer role assignments

Environment:  
Staging / Beta

Account:  
Collector

Severity:  
Critical

Steps to Reproduce:

1. Read the active role assignments for `demo-collector@slicecollectable.com` using the read-only staging database inspection.
2. Filter assignments to `revokedAt IS NULL`.
3. Compare the result with the Beta QA role matrix, which requires the Collector account to have only `USER`.

Expected Result:

The dedicated Collector account has `USER + COLLECTOR` only, with no staff-review authority, and cannot reach staff/admin review surfaces.

Actual Result:

At discovery the account had active assignments for `USER`, two scoped `COLLECTOR`, and two `ASSET_REVIEWER` roles. The unwanted assignments were revoked through the supported Admin endpoint; active roles are now exactly `USER + COLLECTOR`.

Screenshot / Video / Evidence:

- Read-only Prisma inspection on 2026-08-21 returned the active roles for the dedicated QA account.
- `docs/DEMO_FUNCTIONAL_TEST_CHECKLIST.md` requires no `ASSET_REVIEWER`/staff roles on demo Collector accounts.

Additional Notes:

- Root cause: the Collector demo setup explicitly granted `ASSET_REVIEWER`; historical scoped assignments were not removed by the prior setup. The role schema already has a partial active uniqueness constraint on `(userId, role, scopeType, scopeId)`, and supported Admin grants are global-only.
- Fix: `setup-demo-collector.ts` now provisions only `COLLECTOR`; staging safety validation now rejects reviewer authority on the Collector fixture. Revokes preserve rows and audit history.
- Supported staging cleanup: three unwanted assignments on Collector A and one reviewer assignment on the separate Collector B baseline returned HTTP 204. Collector A has three `ROLE_REVOKED` audit events and revoked history rows.
- Focused API/session checks remained green: fresh Collector A login and workspace returned 200; Admin overview/users, review queue, finance admin, and audit admin returned 403; Collector A cannot read Collector B submission detail or workspace detail (both 404), and its owned-submission list does not contain B’s ID.
- Focused tests pass for the Collector fixture role boundary. No lifecycle, ownership, trading, ledger, Stripe, Umbreon, or Charizard data was changed.

Status:  
Verified / Closed — final Collector browser authorization retest passed

Deployment status:

- Commit `b26e407` is deployed at `/opt/slice/releases/20260821-b26e407`.
- The login component was not the defect. During the blocked attempt, `/opt/slice/current` pointed to `b26e407` but `/opt/slice/app` had drifted to a Discord-only release without `dist/client`. Apache asset aliases target `/opt/slice/app/dist/client`, so the login CSS/JavaScript returned 403 and the SSR form never hydrated; no `/auth/login` request was sent.
- Runtime fix: restored `/opt/slice/app` to `/opt/slice/releases/20260821-b26e407` and restarted `slice-api.service` and `slice-web.service`. The aliased JavaScript/CSS returned 200, `/health` and `/ready` passed, and no application source change was required.

Final browser verification (2026-08-21/22): **PASS**. A fresh Collector session logged in, reached `/portfolio`, loaded `/collector-workspace` as `Slice Demo Collector`, and remained authenticated after refresh. The workspace contained only Collector navigation. Direct Admin dashboard, Admin users, review queue, asset review, finance, audit and role-management routes settled on safe access-required/reviewer boundaries with no staff content. The known Collector B private submission rendered `Submission unavailable` with no private details or media. Logout returned the protected Collector route to the sign-in boundary. Console error/warning logs were empty on exercised routes; the focused protected-API matrix remained 401/403/404 as expected.
- Safe browser screenshots were captured for the authenticated Collector workspace, denied reviewer route, and cross-Collector submission boundary. No credentials or secrets were included.
- No new application bug ID was created: this was deployment-pointer drift, not an auth-form or authorization implementation defect. No lifecycle, ownership, trading, ledger, Stripe, Umbreon, or Charizard data was changed during the retest.
