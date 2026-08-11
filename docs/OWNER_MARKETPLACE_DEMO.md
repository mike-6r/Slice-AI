# Owner marketplace demo

The staging marketplace is backed by the same published-asset, ownership, finance and trading authorities as the application. It is not a frontend data set.

## Safe staging preparation

Run these commands only against the staging configuration, after loading both `/etc/slice/slice.env` and the guarded `/etc/slice/demo.env` on the staging host:

```bash
npm run staging:demo:preflight
npm run staging:demo:refresh
npm run staging:demo:market:check
npm run staging:demo:market:verify
```

`refresh` is guarded for the staging/demo environment and restores only explicitly named demo records through the existing domain services. It does not reset the database, alter normal users, or directly edit balances.

## Owner walkthrough

1. Open the homepage and explain that the featured card is an illustrative ownership example.
2. Open **Markets** and use the default public catalogue.
3. Open the published Charizard record.
4. Point out the PSA grader and certification reference; Slice is the marketplace, not the grader.
5. Contrast the whole asset value, share price, issued shares and available shares.
6. Review the aggregate, privacy-safe order book and real execution history.
7. Sign in with the separately provisioned demo investor and select **Buy shares**.
8. Complete a supported order; confirm the real execution in recent trades, then check Portfolio, Orders, Transactions and Notifications.
9. Create a supported limit order, confirm its cash/share reservation, then cancel it and confirm the release.
10. Where the demonstration inventory supports it, sell shares and verify the resulting order/execution and portfolio cash change.
11. Open the demo collector's public profile and confirm it lists the same published catalogue records as Markets.

Never place production-provider payments, use personal credentials, or include passwords in a demo runbook.
