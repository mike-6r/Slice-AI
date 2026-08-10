# Slice owner demo walkthrough

Use an existing staging account with the appropriate role. Do not record account credentials in this repository or a demo script.

## Five-to-eight minute walkthrough

1. **Home** — start at `/`. Explain that the featured Charizard panel is a clearly static showcase module, while the surrounding catalogue counts are live public projections. In an unseeded staging environment, the empty catalogue cards are intentional and truthful.
2. **Markets, collectors and Vault Live** — open `/marketplace`, `/collectors`, and `/vault-live`. These demonstrate public safe-read boundaries and their polished no-public-data states. Do not describe empty data as live inventory.
3. **Sign in** — use the existing staging owner account at `/login`. Do not create an account during the presentation unless onboarding itself is being demonstrated.
4. **Dashboard and portfolio** — show `/dashboard` then `/portfolio`. Call out the real API-backed cash, holdings, transaction, and valuation states. Where a value is unavailable, say it is unavailable rather than inferring a return or valuation.
5. **Wallet and orders** — show `/wallet` and `/orders`. Bank linking and production payments remain provider-gated in staging; do not attempt a real funding action. Order actions are subject to the user’s existing eligibility and verification state.
6. **Account Center** — open `/account` to demonstrate profile, sessions, security, preferences, and export/deactivation controls. Avoid changing password, session, or account lifecycle controls during a showcase.
7. **List an asset** — open `/list` to demonstrate the submission workspace. It is safe to review categories and validation. Do not submit a disposable asset unless a separate cleanup plan has been agreed.
8. **Role workspaces** — open staff, collector, or administration pages only while signed in with a role authorized for them. Unauthorized users should see the existing safe access boundary, not internal data.

## Staging limitations to state plainly

- Public market data may be empty when no published catalogue records exist.
- Provider-backed identity, bank-link, and payment operations remain subject to their configured staging capability and must not be presented as production-certified.
- No live money movement, provider certification, or fabricated showcase data is part of this walkthrough.

## Safe recovery

If an API-backed panel is unavailable, refresh once and use its in-product retry control if offered. Do not reset the database, reseed shared staging data, or use browser developer tools to alter stored account state.
