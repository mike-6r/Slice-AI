# Staging authority evidence

Read-only evidence captured on 2026-08-26 from `slice_staging` through the
established VPS SSH key and `sudo -u postgres psql`. No application, database,
worker, financial, ownership, custody, or controlled-asset state was changed.

## Database counts

| Measure | Result |
| --- | ---: |
| Approved submissions | 12 |
| Approved submissions with `assetId` | 11 |
| Approved submissions without `assetId` | 1 |
| Canonical `Asset` rows | 21 |
| Fixture Assets | 19 |
| Non-fixture Assets | 2 |
| Intake rows | 2 |
| Verified intake rows | 0 |
| Intake linked to a submission with Asset | 1 |
| Intake linked to a submission without Asset | 1 |
| `AssetPublication` rows / published | 16 / 16 |
| `OwnershipAssetSupply` rows / issued units greater than zero | 16 / 16 |
| Active staff valuations | 16 |
| Secured custody records | 16 |
| Trading markets / open | 16 / 16 |

The sole approved, unlinked submission is the Charizard ex record
`054e7773-87ad-4b5e-9701-916a3aa5144d`. It has intake
`cmst5ry3m0001pbsdixtu2gcf` in `SHIPPING_REQUIRED`, no Asset, and no
verification record. This is direct staging evidence that approval and intake
can proceed without canonicalization under current architecture.

## Fixture and controlled records

The 19 fixture rows are predominantly `slice-demo-*` assets. The two currently
non-fixture, non-archived rows under the beta catalogue predicate are:

| Asset ID | Public ID | Slug | State |
| --- | --- | --- | --- |
| `37647d6a-9774-49c7-b3dc-d83c9f5b733a` | `ast_62d726fbb8974a5eaf9e2ebfe29a2925` | `2021-umbreon-vmax-evolving-skies-215-203` | `PUBLISHED` |
| `43212b2a-225c-4253-a1bd-47facaf6fd73` | `ast_8c419eced8c74b9c8613c01b4381f060` | `qa-test-initial-offering-card` | `PUBLISHED` |

The controlled-beta physical bypass is
`bd8be53f-1c15-4ebc-8c1a-015db73d59bf`, linking approved submission
`f3d2ed04-8309-4e5d-bfe4-ee7dbcdc3a79` to the published Umbreon Asset above.
It was inspected only. No controlled Umbreon/Charizard economics or physical
truth was modified.

## Zero-record diagnosis

The supplied zero-record screenshot is **not the present staging authority**.
The current `AdminService.catalogueAssets` beta default excludes `slice-demo-*`
and explicitly retired/STG fixture submissions, then requires a linked
non-draft/non-cancelled submission. Applying that exact predicate directly to
the current staging database returns **two** non-archived rows, listed above.

Accordingly, current staging does not have an empty canonical catalogue and the
reported UI text cannot be attributed to a missing `Asset` table, a failed
canonicalization worker, or publication-only filtering. The screenshot-time
cause cannot be proven retroactively without its request/session logs. The
most likely causes are an earlier staging dataset/release or an earlier UI/API
rendering failure. A logged-in browser/API capture is still needed to attribute
that historical screen exactly; anonymous browser access correctly stops at the
admin sign-in boundary.

The current, actionable authority gap is instead the one approved unlinked
Charizard intake. It reflects the absent automatic/manual UI handoff, not a
catalogue query that returns zero today.

## Runtime evidence

Active systemd units: `slice-api.service`, `slice-web.service`,
`slice-discord.service`, and `slice-discord-worker.service` are all active and
running. Staging sets `OUTBOX_WORKER_ENABLED=true` and
`OUTBOX_WORKER_ID=slice-vps-01`. The approval outbox evidence present was one
`submission.approved` event in `DELIVERED` state; the source handler is
notification-only, not canonicalization.
