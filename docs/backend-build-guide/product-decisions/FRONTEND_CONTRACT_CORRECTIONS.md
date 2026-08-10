# Frontend contract corrections

Status: **DERIVED** from the existing API-integration documents. This file identifies contract boundaries; it does not authorize a visual redesign.

## Current contract rules

- API mode uses the `AppServicesProvider`, repository boundaries, shared HTTP client, React Query, and real cookie-backed frontend session behavior established by 009/009A. No API failure may silently fall back to mocks.
- Prices use explicit estimated-market-value contracts where available. Do not map any generic `price`, Slice Unit Price, ownership percentage, availability, owners, order-book, trade, or portfolio field where the backend has not supplied authority.
- Submission UI is a Document 010 future integration. The current `/list` local draft, previews, local save indicator, and simulated analysis are not authoritative submission, upload, scan, or verification state.
- When Document 010 adds frontend work, routes must use repository/query boundaries; they must not call `fetch` directly or expose upload URLs/keys, private filename metadata, scan details, or reviewer-only content.

## Document 010 future UI requirements derived from its guide

- Safe states: draft, upload pending, scanning pending, media rejected, version conflict, changes requested, submission success, and reviewer-action success/failure.
- Seller views show only owner-safe submission and change-request data. Reviewer queue/detail views require backend authorization and must not show fabricated evidence or decision data.
- Approval remains an “approval for the Document 010 workflow” state, not a publication, valuation, insurance, custody, or authenticity claim.

## OPEN / deferred UI decisions

- Final seller experience, media progress visual treatment, reviewer assignment UX, and exact change-request copy are OPEN pending implementation of Document 010's durable contracts.
- Any public asset detail, Vault, or marketplace representation of Document 010 results is DEFERRED to Document 011’s publication authority.
- Accessible user-facing disclosure text for uploads, retention, review and decisions is OPEN; no approved legal copy exists in the repository.

