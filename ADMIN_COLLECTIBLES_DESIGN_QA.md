# Admin Collectibles catalogue and detail QA

## Scope

The Admin Collectibles surface now presents the canonical record, approved media, physical lifecycle, valuation provenance, market readiness, and settled ownership as separate concepts. The catalogue and detail views are read-only projections; lifecycle and ownership mutations remain in their existing authorised workflows.

## Manual staging checks

- Catalogue cards show an approved front thumbnail when one exists and a clear `No approved image` state otherwise.
- Search accepts title, set, card number, public id, or collector text; category, physical state, market state, status, and sort controls remain usable on narrow screens.
- Detail header shows the canonical identity, grade, physical state, market state, owner count, valuation, and a Beta fixture badge where appropriate.
- Detail navigation is limited to Overview, Physical, Valuation, Ownership, Market, and History.
- Legacy/demo assets explicitly say that shipment, receipt, and custody events are not asserted without persisted intake events.
- Physical evidence links use private, expiring admin download URLs; no external listing image is used as canonical media.
- Ownership holders and percentages are read-only and come from settled positions. No direct edit control is present.
- Slice-supported valuation and external market references display separate source, currency, amount, and observation context.
- Market publication/readiness are not presented as proof of tradeability.
- Activity is bounded on Overview and complete in History.

## Automated checks

- Frontend typecheck: `npm run typecheck`
- API typecheck: `cd server && npm run typecheck`
- API lint: `cd server && npm run lint`
- API build: `cd server && npm run build`
- Production frontend build: `npm run build`

