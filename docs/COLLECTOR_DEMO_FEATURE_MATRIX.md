# Collector demo feature matrix

This matrix records current code authority, not a product roadmap. It applies only to the explicitly guarded staging collector fixture.

| Feature | Route | Backend authority | Required state | Demo now | Fixture / external condition |
| --- | --- | --- | --- | --- | --- |
| Public collector directory | `/collectors` | `ReadsController` + `PublicCollectorProfile` | public profile | Yes | Demo profile and published submission-linked assets |
| Public collector profile/catalogue | `/collector/:id` | `ReadsController` public projection | published asset linked to approved D10 submission | Yes | Eight D10/D11-published listings (five primary, three specialist) |
| Public asset discovery/detail | `/markets`, `/asset/:id` | catalogue + market reads | D11 publication and market snapshot | Yes | Real asset/lifecycle records; staging market history is labelled `DEMO` |
| Asset submission | `/list` | `SubmissionService` (D10) | account capability `LIST_ASSET` | Yes, local-test email delivery only | Front/back evidence completed through D10 storage authority |
| Review workspace | `/collector-workspace` | review queue, claim, decision endpoints | `ASSET_REVIEWER` role | Yes | Demo Collector receives only `ASSET_REVIEWER`, scoped staging fixture role; never finance/vault/compliance/admin |
| D11 lifecycle/readiness/publication | staff operations routes | `LifecycleService` | approved D10 submission | Yes | Handoff, custody, valuation, coverage, publication run through services |
| Fractional inventory | portfolio/ownership reads | D12 `OwnershipService`, `OwnershipOperationsService` | published + custody secured + active coverage | Yes | Issue 1,000 units and transfer 300 units to Collector through D12 |
| Cash/portfolio | `/wallet`, `/portfolio` | D13 journal and projections | verified staging identity | Yes | Base demo setup posts balanced D13 demo-funding journal |
| Orders/matching | `/orders`, trading endpoints | D14 `TradingService` | account trading capability and market policy | Conditional | Never force compliance/provider state. Only test if configured capability permits it. |
| Provider deposits/withdrawals | wallet provider routes | D16 | sandbox provider availability | No | External providers remain sandbox/certification gated. |
| Durable public thumbnails | public cards | approved object-storage/CDN provider | durable media provider | No | D10 local storage is process-local; public responses expose safe listing metadata only, never broken media URLs. |
| Collector B isolation | review workspace/API | D10 owner/reviewer checks | separate collector identity | Yes | Collector B private submissions; Collector A may review only claimed work and cannot access owned/private records. |

## Role terminology

The current Role enum has no `INVESTOR` or `COLLECTOR` value. Normal investor access is `USER`. The staging Demo Collector remains a `USER` and is additionally assigned `ASSET_REVIEWER` only to exercise the existing staff-only review workspace. No financial, vault, compliance, support, or admin role is granted.
