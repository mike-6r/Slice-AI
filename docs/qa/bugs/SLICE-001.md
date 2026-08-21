# Bug Report

Bug ID:  
SLICE-001

Area:  
Marketplace / Security

Title:  
Homepage collectible card shows misleading grading and market-state labels

Environment:  
Staging / Beta

Account:  
Public

Severity:  
Medium

Steps to Reproduce:

1. Open `https://staging.slicecollectable.com/`.
2. Scroll to **What collectors are watching**.
3. Inspect the Umbreon VMAX card.
4. Open the same asset at `/asset/2021-umbreon-vmax-evolving-skies-215-203`.

Expected Result:

The homepage card uses the same authoritative terminology as the asset projection: `Raw / Ungraded`, separate `Condition: Mint` and Slice Grade information, and a truthful market/availability state.

Actual Result:

The homepage card displays `Grade pending`, `Live market`, `Market value £1,647.17`, `No 24h move`, and `Availability not published`, while the detail projection displays `Raw / ungraded`, `Slice Grade 4 — Very Good`, issued supply, an open market, and recent execution history.

Screenshot / Video / Evidence:

- [Marketplace screenshot](../screenshots/owner-beta-final/marketplace-loaded.png)
- Public homepage DOM captured during the 2026-08-21 browser pass.
- Public asset DOM captured during the same pass.

Additional Notes:

This is a truth/terminology mismatch, not a fabricated financial effect. No state was changed while reproducing it.

Status:  
Closed — deployed and verified on staging 2026-08-21

Remediation (2026-08-21):

- Root cause: the homepage used a separate hand-built card projection instead of the shared authoritative marketplace projection.
- Fix: homepage live cards now render the shared `MarketAssetCard` from `toMarketplaceAsset`, preserving backend currency, lifecycle, raw/condition, valuation, reference, ownership, and trading semantics without asset-specific values.
- Focused evidence: `src/components/marketplace/MarketAssetCard.test.tsx` now covers raw/pre-market terminology and rejects the misleading labels. Frontend typecheck, 38 test files / 132 tests, client/SSR build all pass.
- Staging retest on release `/opt/slice/releases/20260821-b26e407` passed. The homepage Umbreon card now shows `Raw / Ungraded`, `Condition: Mint`, `Evolving Skies · 215/203`, `Slice valuation`, and `Market reference: $2,152 USD`; the public detail remained consistent. `Grade pending`, fake movement, and unpublished-availability labels were absent.
