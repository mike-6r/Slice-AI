# Slice Collector Route Inventory — Final QA

Generated 2026-08-15 against deployed commit `e6acfdaddd95e01b52011fbb6e7eecd7432f51ce`.

| Route | Purpose | Tabs/areas | Read authority | Mutations | Permissions | QA result |
| --- | --- | --- | --- | --- | --- | --- |
| `/collector-workspace` | Authenticated Collector workspace | Overview, My Collectibles, Submissions, Your Actions, Subscription, Public Profile, Settings | `GET /api/v1/collector-workspace/overview`, `collectibles`, `requests`, `subscription` | Profile, subscription commands, vault selection, shipment entry, draft deletion | Owner Collector; lifecycle prerequisites | Prior authenticated pass; fresh final session not executed |
| `/collector-workspace?view=collectibles&asset=:id` | Collectible detail | Overview, Submission, Market Data, Media, Valuation, Custody, Market, Activity | `GET /api/v1/collector-workspace/collectibles/:id` | Select eligible intake destination; real shipment entry | Owner Collector; approved/intake rules | Prior controlled detail pass; no physical event fabricated |
| `/list` | Six-step listing flow | Identify, Details, Market, Photos, AI Review, Review & Submit | `GET /api/v1/categories`, `GET /api/v1/submissions`, `GET /api/v1/submissions/:id`, pre-grade read | Import reference, create/update draft, market check, media upload/remove, optional pre-grade, submit/cancel | Authenticated Collector listing access; versioned drafts | Exact URL/Step 1 previously passed; Steps 4–6 and live Ximilar not re-executed |
| `/submissions/:id` | Submission detail | Identity, research, photos, AI state, timeline, requests, intake/shipping | `GET /api/v1/submissions/:id`, `GET /api/v1/submissions/:id/pre-grade` | Versioned draft edits, media operations, submit/cancel | Owner Collector | Prior authenticated read pass; fresh final session not executed |
| `/collector/:id` | Public collector profile | Profile summary and supported public collectibles | `GET /api/v1/collectors/:slug` | None | Public projection only | Existing public route; privacy re-test not executed |
| `/collector/:id/assets` | Public collector assets | Published public assets | `GET /api/v1/collectors/:slug` / public asset projection | None | Public projection only | Existing public route; privacy re-test not executed |

## Listing workflow authority

- Exact PriceCharting imports are advisory identity/reference research; no provider call occurs from ordinary page render.
- Market research is explicit (`Check Market`) and persisted as a research snapshot; raw `PRICE_GUIDE` is not represented as a completed sale.
- Uploads use an authorized signed target, then checksum completion; private object access is not a public R2 path.
- Ximilar/pre-grade is optional and provider-gated. Link/upload success is not treated as an official grade.
- Submit and delete-draft commands are versioned/idempotent; a double-submit must be revalidated by the backend.

## Final QA boundary

The current deployment was health-checked, but the required fresh authenticated Collector session was unavailable to the agent. The staging route therefore showed the expected sign-in boundary and no mutations were attempted. Prior authenticated evidence is retained in `docs/qa/beta/QA_COLLECTOR_ADMIN_AUDIT.md`; this pass does not upgrade that evidence to a final External Invited Beta GO.
