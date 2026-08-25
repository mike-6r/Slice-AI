# Global display currency QA

## Scope

This QA covers the GBP-default display system and its read-only FX projection. It does not create listings, trades, balances, journals, deposits, withdrawals, FX postings, or provider movements.

## Acceptance matrix

| Check                     | Result | Evidence                                                                                                                         |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| GBP default               | PASS   | Provider default, account-profile default, and server financial authority remain GBP.                                            |
| Footer selector           | PASS   | `SiteFooter` renders the shared `CurrencySelector`; selection updates `CurrencyProvider` without reload.                         |
| Authenticated persistence | PASS   | `GET/PATCH /me/preferences` reads/writes `preferredCurrency`; account value wins after login.                                    |
| Anonymous persistence     | PASS   | Explicit choice persists to local storage and `slice_display_currency` same-site cookie; locale is not consulted.                |
| Shared formatter          | PASS   | Marketplace, ticker, asset detail, portfolio, wallet, orders, and trading use the common display path.                           |
| Real FX provider          | PASS   | Backend-only Frankfurter GBP-base adapter; no browser calls to the third-party provider.                                         |
| Rate cache                | PASS   | Redis snapshot cache with six-hour TTL and `cached`, `asOf`, `fetchedAt`, and `source` metadata.                                 |
| Safe conversion           | PASS   | Integer minor-unit conversion and deterministic half-up rounding; normal fiat displays use two decimals.                         |
| FX failure                | PASS   | HTTP 503 safe error; UI retains source currency and explains conversion is unavailable.                                          |
| PriceCharting source      | PASS   | Source amount/currency remain authoritative and discoverable beside converted display values.                                    |
| History policy            | PASS   | Stored observations are unchanged; current-rate read-time conversion is documented and not presented as historical FX.           |
| Ledger safety             | PASS   | No Prisma migration or financial table rewrite; GBP ledger/settlement semantics remain unchanged.                                |
| Transaction disclosure    | PASS   | Trading and wallet flows state that settlement/input currency is GBP.                                                            |
| Admin safety              | PASS   | Admin finance/accounting remains GBP-authoritative.                                                                              |
| Provider calls on render  | PASS   | UI calls Slice `/api/v1/currency/rates`; only backend `CurrencyService` calls Frankfurter and cached reads avoid provider calls. |

## Automated verification

- Frontend typecheck: PASS
- Frontend focused currency/marketplace tests: PASS (6 files, 26 tests)
- Server typecheck: PASS
- Currency service tests: PASS (3 tests)
- Frontend production build: PASS
- Server production build: PASS
- Staging health/readiness/homepage: PASS (HTTP 200)
- Browser responsive visual pass at 390, 768, 1366, and 1920 pixels: PASS; no horizontal overflow observed and the currency selector remained GBP.
- Staging FX endpoint: PASS via independent read-only request (HTTP 200, GBP base, Frankfurter snapshot). The in-app browser blocked direct JSON navigation with `ERR_BLOCKED_BY_CLIENT`, so that browser session correctly exercised the documented source-currency fallback rather than being used as evidence of a conversion failure.

## Manual browser checklist

For a fresh anonymous browser:

1. Load the homepage and footer. Confirm GBP is selected and PriceCharting/source labels are present where applicable.
2. Change to USD. Confirm homepage, ticker, marketplace, asset detail, reference history, portfolio, wallet, and order displays rerender without a reload.
3. Confirm converted external values retain source provenance.
4. Confirm Buy/Sell review says settlement currency GBP.
5. Confirm wallet says deposits and withdrawals settle in GBP and input remains `Amount (GBP)`.
6. Reload and confirm the anonymous selection persists. Sign in and confirm the saved account preference takes precedence.
7. Simulate `/currency/rates` failure. Confirm original source values remain visible; no £0, fake rate, or misleading unavailable total appears.
8. Repeat at 390×844, 768×1024, 1366×768, and 1920×1080. Check selector, card labels, graph tooltip/axis, and disclosure wrapping for clipping.

## Financial mutation guard

Expected mutation count for this QA: **0**. The change is presentation/configuration only. Umbreon, Charizard, listings, ownership, trades, wallet balances, journals, and provider state must remain unchanged.
