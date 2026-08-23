# Slice Portfolio Full Data, Accounting and UI QA

## Scope

This pass reconstructs the authenticated Portfolio workspace without changing
cash, reservations, ownership, orders, executions, or any staging fixture.
The four supplied Portfolio screenshots were treated as visual evidence; the
implementation brief is the product and data contract.

## Accounting authority

The API is the source of truth. `FinancialLedgerService.walletForUser` returns
the aggregate GBP cash projection, including `totalMinor`, `reservedMinor`, and
`availableMinor`. `PortfolioQueryService.portfolioForUser` combines that ledger
cash with marked settled holdings:

```text
total account value = total cash (available + reserved) + fully marked holdings
available cash      = total cash - active cash reservations
reserved cash       = active reservations across the user's GBP accounts
holdings value      = the sum of backend-projected settled holding values
```

The frontend consumes these explicit fields. It does not reconstruct the
accounting formula from account rows or today's market catalogue. If any held
position cannot be valued, the holdings and total-account values are unavailable
rather than treating the missing mark as zero.

### Staging reconciliation from the supplied screenshots

```text
Displayed total account value  £81,762.95
Available cash                 £76,016.53
Marked holdings                 £4,001.64
Implied reserved cash           £1,744.78

£76,016.53 + £1,744.78 + £4,001.64 = £81,762.95
```

The difference is reserved cash, not an unexplained gain or a second holdings
value. It is now surfaced as its own Overview metric and in the account-value
history summary. No cash was reserved or released by this pass.

## Performance and cost-basis semantics

`PortfolioSnapshotService` persists account-value snapshots. The chart is
labelled **Account value history**, because its points represent persisted total
account value, not investment return. Its period change is the backend's change
after external cash flows. No points are generated in the browser.

Invested cost and unrealised P/L remain unavailable unless authoritative lot
history is complete. The UI explains that this depends on reliable acquisition
cost history rather than showing a fabricated zero.

## Shared asset projection

Holdings now return the safe approved-media thumbnail, title, category, set,
slug, authoritative Slice value, and price per Slice from the finance query.
Authenticated order and execution projections also include the same safe asset
summary. The browser no longer depends on a limited current asset catalogue to
identify historical orders/activity, and no provider is called from Portfolio
rendering.

If approved safe media is absent, the UI uses the deliberate Slice layers
placeholder rather than a bank/building icon. Private media is only represented
by a short-lived backend download URL for approved safe media.

## Holdings

- ownership is settled units and total supply;
- available to sell is settled units minus reserved sell units;
- ownership and sale eligibility are separate table columns;
- unit wording is singular/plural safe (`1 Slice`, `2 Slices`);
- current value and price per Slice come from backend projections;
- list and grid views remain functional;
- search, category, sort, and server pagination remain URL-safe.

## Orders

Historical identity previously fell back to `Collectible` when the separate
current asset list did not contain an order's asset. The order query now joins a
safe asset summary directly, including approved safe media. Order facts remain
historical facts; the limit price and average fill are not rewritten from the
current market. The summary metric is labelled **Executed fill ratio** so it is
not confused with an order success rate.

## Activity

Activity still combines the existing user-scoped authoritative streams, but each
trading order and execution now carries safe identity data before the frontend
formats the customer-facing row. The table calls its mixed field **Change**,
places quantities/order details under the event, and uses customer language such
as **Account history** and **Security event**. Raw internal IDs, provider data,
and `Custom account event` are not shown.

## Visual reconstruction

Overview, Holdings, Orders, and Activity share one restrained authenticated
workspace: moderate page headings, stable tabs, wider desktop use of space,
explicit cash metrics, consistent panel geometry, real safe thumbnails, and
mobile stacked records instead of clipped dense tables. The responsive cascade
was verified by build and component rendering; final staging screenshots should
be captured after an authenticated browser session is restored.

## Verification

- frontend typecheck: PASS
- backend typecheck: PASS
- focused frontend portfolio/repository tests: PASS (3 files, 9 tests)
- backend portfolio projection tests: PASS (2 tests)
- frontend production client/SSR build: PASS
- backend production build: PASS
- mutations: NONE
- provider calls: NONE

The browser session available during implementation had expired, so authenticated
staging visual screenshots remain a deployment-time QA step. No retry or state
changing workflow was attempted.
