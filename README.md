# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Auttzy/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Auttzy/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every pre-token protocol, ranked by what its launch would be worth — and what farming it
costs. Built by an AI agent for
[make.fun](https://make.fun)'s ["Build the best token launch radar"](https://make.fun/bounty/token-radar-01)
bounty, $1,325 in USDC.

## What it is

`main.ts` (Node 22, standard library only) reads a sealed snapshot of the protocol universe
(758 protocols from DefiLlama, frozen 2026-11-14), scores every protocol that records no token,
and writes a dashboard: a ranked board, a detail view for each protocol with its farm plan
netted to the dollar, and filters by category, chain, farm verdict and token status.

## The model

Implied value is one function of the snapshot's own figures — no protocol name is ever
special-cased. The market pays less per dollar of TVL as a protocol gets bigger, so the model
fits a size curve to the traded tokens instead of using one flat multiple:

```
implied = round( 10^2.31 x TVL^0.61
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
                 x (0.70 + min(age_days, 1095) / 1095 x 0.30) x sibling )
```

The curve is fitted robustly (Huber, iteratively reweighted) on log market cap against log
TVL, over 78 cleaned comparables: live-token protocols that are not exchanges, not wrapped,
staked or bridged products, with market-cap/TVL between 0.005 and 5. A token far off the
curve is downweighted, so one odd token cannot bend it. The sibling factor is the median
log-residual of the traded tokens sharing the protocol's first word, shrunk by n/(n+3)
toward no effect and clamped to 0.25x–4x.

There is deliberately no family multiplier. The previous model carried one — the median
log-residual of the traded tokens in the row's category, shrunk toward no effect — and it
was tested blind, the same way the curve is: pricing each traded token with the whole model
fitted without it. It failed the test. With it the full model priced a held-out token at a
median miss of x3.03, within 3x 49% of the time; without it x2.87 and 56%, and the time
split agreed (within 3x 59% with it, 62% without). A category effect that does not survive
being held out is noise, so the board carries none.

The whole model is tested blind before it prices anything. Leave-one-out over the 78
comparables: median miss x2.87, within 3x of the real market cap 56% of the time — against
x4.42 and 41% for one flat multiple. A time split (fit on protocols listed before 2024,
price the ones listed after): median miss x2.25, within 3x 62%, against x3.99 and 41% for
the flat multiple. The band around each implied value is the leave-one-out residual's 10th
to 90th percentile (x0.11 to x9.02), so the board states its own uncertainty instead of
hiding it.

The board carries 195 launch candidates: the 40-protocol watchlist (the floor, never a
ceiling) plus every other pre-token protocol that is a launch rather than a product, below
the floor and above it. The other 147 pre-token protocols are set aside by house rule
(wrapped, staked, bridged, exchange or versioned), and the 416 protocols whose token already
trades are kept apart in the Live view with their market cap, which is a fact, not a model.

## Farm plans

Each protocol gets a seven-step plan derived from its own record: its category picks the
action, its first chain picks where the action happens and what gas costs (Ethereum $4 a
transaction, most other chains $0.30, Solana and Bittensor $0.10), multi-chain protocols get
a cross-chain step, and its age picks how long to hold (30–60 days). Every step states what
it costs and how long it takes. Every plan is $1,000, and the economics are netted to the
dollar: the slice is 10% of the implied value pro rata to TVL, fees are the plan's gas, and
the forgone yield is 4% a year on the $1,000 for the hold. FARM means the slice pays for the
farm, THIN means it almost does, and SKIP means it never does — 147 / 30 / 18 across the
board.

## The dashboard

`dashboard/` is a static page with no network: it reads `data.js`, written beside it by
`main.ts`. The board comes first — headline, a two-line method band (the Huber curve,
the blind-test numbers in plain words, the dropped family effect and the best farm on
the watchlist), a stats strip carrying the board facts (watchlist 40 / 40 covered,
195 rows, the farm / thin / skip split), one row of filters, then the board itself,
which at the judge's 1024×640 shows six data rows with the implied-value bar, the
$1K slice and the netted farm verdict. The board sorts every column, filters by
search, category, chain, farm verdict and scope, opens a detail drawer for each
protocol with the model's own inputs, the traded peers nearest it in size, its farm
plan and its netted economics with a sensitivity table, and offers a model sandbox
that re-ranks the board live when you move the growth-weight or maturity-floor
sliders. The model panel shows the fitted curve, the blind-test results and a
log-log scatter of the traded comparables against the curve.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

It writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and
`out/dossier.json`. The run is deterministic: the same snapshot always writes the same bytes.
