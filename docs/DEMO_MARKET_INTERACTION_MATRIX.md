# Staging Demo Market Interaction Matrix

This matrix describes only the explicit, durable staging showcase fixtures.
They are created by `npm run staging:demo:refresh`, which refuses to run
outside `SLICE_ENV=staging` and never resets or deletes general staging data.

| Asset | Collector | Published | Tradeable when staging D14 is enabled | Supply / staged availability | History | Investor watchlist | Showcase purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1999 Pokémon Base Set Charizard Holo | Slice Demo Collector | Yes | Yes | 1,000 issued; collector and market-maker allocations use D12 | 90 days | Yes | Immediate execution, order book and chart |
| 2020 Pokémon Pikachu Illustrator | Slice Demo Collector | Yes | Yes | 1,000 issued; collector and market-maker allocations use D12 | 90 days | Yes | Second execution and watchlist |
| 1999 Pokémon Base Set Blastoise Holo | Slice Demo Collector | Yes | Yes | 1,000 issued; collector and market-maker allocations use D12 | 90 days | No | Open bid/ask depth |
| 1986 Fleer Michael Jordan Rookie | Slice Demo Collector | Yes | Configured market | 1,000 issued; collector allocation is real D12 ownership | 90 days | Yes | Asset detail and collector profile |
| 1952 Topps Mickey Mantle | Slice Demo Collector | Yes | Configured market | 1,000 issued; collector allocation is real D12 ownership | 90 days | No | Asset detail and valuation comparison |
| 2002 Yu-Gi-Oh! Dark Magician | Slice Demo Collector | No — custody | Not applicable | No public market | 90 days | No | Collector custody workflow |
| 1993 Magic: The Gathering Black Lotus | Slice Demo Collector | No — changes requested | Not applicable | No public market | No | No | Evidence/change-request workflow |
| 2023 One Piece Manga Rare Shanks | Slice Demo Collector | No — submitted | Not applicable | No public market | No | No | Submitted queue workflow |
| 2018 Panini Prizm Luka Dončić Rookie | Slice Demo Collector | No — draft | Not applicable | No public market | No | No | Draft workflow |
| 2005 Pokémon Gold Star Rayquaza | Slice Demo Collector | No — draft | Not applicable | No public market | No | No | Draft workflow |

## Trading gate

The refresh creates D14 markets, seed orders, two real executions, an open
bid/ask book and a cancelled-order history **only** when all of these are true:

- `SLICE_ENV=staging`
- `ALLOW_DEMO_DATA_SETUP=true`
- `OPERATIONAL_TRADING_ENABLED=true`
- `PROVIDER_MODE=local`

`PROVIDER_MODE=local` means the already-implemented deterministic local-test
compliance adapter is used. It does not enable Plaid, Bridge, external money,
or production KYC/KYT. Any other provider mode leaves trading honestly
unseeded and the verifier reports that state.

## Repeatable commands

```bash
cd /opt/slice/app/server
set -a; . /etc/slice/slice.env; . /etc/slice/demo.env; set +a
npm run staging:demo:refresh
npm run staging:demo:market:verify
```

The refresh is idempotent for the exact `slice-demo-*` records. It retains
already-completed demo order/trade history, rehydrates any missing fixture
orders and market data, and restores demo spendable cash only through new,
balanced D13 `DEMO_FUNDING` replenishment journals. It does not reset the
database, alter an existing non-demo password, or touch untagged customers,
assets, journals, provider movements, or orders.
