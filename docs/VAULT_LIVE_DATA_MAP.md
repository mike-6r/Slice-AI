# Vault Live public data map

`GET /api/v1/vault/live` is a read-only public projection. It does not own
review, valuation, custody, publication, trading, settlement, or provider
state. Those authorities remain in Documents 010–017 services and their
existing ledgers/records.

| Vault Live surface | Source of truth | Public fields only |
| --- | --- | --- |
| Live activity and readiness | `VaultPublicEvent` where `status = PUBLISHED` | fixed safe label, public summary, occurred time, public asset projection |
| Recently reviewed | public vault events classified as review/verification | asset title, category, public market snapshot |
| Published and featured assets | `Asset.status = PUBLISHED` plus latest `AssetMarketSnapshot` | public ID/slug/title/category, grading, public market values |
| Market activity | `TradingExecution` for published assets in the last 24 hours | aggregate executed units, latest public price, timestamp; never buyer/seller/order/account IDs |
| Category links | published assets' category projections | category slug and display name |

The endpoint has no static event fallback. When the underlying public records
are absent it returns zero counts and empty arrays. The frontend then renders
explicit empty states. Static journey copy is educational only and is not
presented as live activity.

Private custody references, provider references, financial accounts, wallet or
bank information, compliance/KYT data, evidence, internal review notes,
ownership account IDs, and counterparty identities are never included.
