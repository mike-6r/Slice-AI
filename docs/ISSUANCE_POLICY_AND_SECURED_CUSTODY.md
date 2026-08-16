# Issuance policy and secured custody

Slice keeps catalogue publication, secured custody, ownership issuance, and market tradeability as separate authorities.

## Secured custody authority

An Admin or vault operator must create an intake record with an approved provider code, approved facility code, and an operational handoff reference. Custody then progresses through `EXPECTED → RECEIVED → INSPECTED → SECURED`. Every evidence-bearing transition requires a provider or operator reference and appends a custody event plus an audit event. `SECURED` additionally requires the asset to be inspected and to have exactly one active insurance coverage record effective at the transition time.

The prior controlled-beta physical bypass is intentionally separate. It records the beta exception only and never creates or changes a vault custody record.

## Ownership-unit supply policy

`STANDARD_COLLECTIBLE_V1` is an explicit product template, not an automatic issuance decision. It permits 100–100,000 whole ownership units and presents 100, 1,000, and 10,000-unit previews. Each asset still requires an Admin proposal and a separate Admin approval. The proposal stores the authoritative valuation used for the preview, the selected unit count, the integer floor price, and the retained minor-unit remainder.

Issuance is blocked unless the policy is approved, the selected units exactly match the approved proposal, the catalogue is published, custody is secured, and exactly one active insurance coverage is present. Proposal and approval do not create ownership positions, ledger entries, markets, orders, or availability. Issuance remains idempotent and immutable after the ledger is created.

## Public behavior before issuance

Published assets without an approved/issued supply remain non-tradeable. Public projections expose no price or availability percentage and use “Not yet available for trading” language. They must not look like sold-out inventory and must not invent shipment, receipt, verification, or custody history.
