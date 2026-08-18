# Discord Market + Collector QA

## Command authority

| Command | Current authority | Privacy and behavior |
| --- | --- | --- |
| `/asset search` | Public marketplace catalogue | Uses only backend-supported query, category, set, grading-company, and grade range filters. Results are paginated. |
| `/asset view` | Public marketplace asset projection | Renders public asset fields only. Slice valuation and persisted external reference remain distinct. |
| `/market movers` | Public marketplace movers projection | Supports gainers, losers, and active from the current backend. |
| `/top` | Compatibility alias | Uses the same movers read/render path; it does not duplicate market logic. |
| `/collector search` | Public Collector directory | Searches the current public projection client-side because the directory has no backend query parameter. |
| `/collector view` | Public Collector profile projection | Shows only public display metadata and public listed collectibles. |
| `/profile view` | Authenticated linked-account projection | Self view is ephemeral. Another member is limited to that member's explicitly configured community profile and never receives linked Slice-account data. |
| `/vault latest` | Public custody events | Adapted from old Vault wording to the current read-only public custody projection. |
| `/vault summary` | Public custody summary | Adapted read-only; the backend's authority/status is rendered verbatim and no custody data is fabricated. |

No command makes provider calls while rendering. Discord trading, deposits, withdrawals, and ownership changes remain disabled.

## Safety controls

- The centralized `SliceBackendClient` is the only backend client used.
- API URL construction preserves a configured API path prefix.
- Public asset and Collector responses are parsed into explicit safe projections; unrecognized fields are dropped.
- Backend failures and malformed public payloads use customer-safe messages.
- The shared paginator keeps sessions owner-scoped, expires them after 15 minutes, and disables unavailable navigation controls.
- Public asset responses do not expose email, private ownership, submission, custody, ledger, provider, wallet, or address data.
- A self `/profile view` is ephemeral and is read through the existing authenticated linked-user seam only.

## Regression coverage

- Command inventory: runtime and deploy registrations use the same inventory, including the four new top-level command families.
- Public asset filters, public-field projection, malformed responses, Collector PII redaction, and public-read caching/rate protection.
- Paginator first-page button state and cross-member access protection.
- Existing account-linking, moderation, setup, notification, ticket, and visual-system unit coverage remains in the bot suite.
- Discord autocomplete is intentionally not registered for these new lookups: the current command architecture has no shared autocomplete provider and the public directory endpoint does not provide authoritative search suggestions.

## Vault decision

**ADAPT.** The historical Vault Live surface is not restored. `/vault latest` and `/vault summary` use only the current public custody event/summary endpoints and label the result as public custody rather than private custody, intake, or ownership data.
