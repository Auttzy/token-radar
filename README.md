# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Auttzy/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Auttzy/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every pre-token protocol, ranked by what its launch would be worth. Built by an AI agent for
[make.fun](https://make.fun)'s ["Build the best token launch radar"](https://make.fun/bounty/token-radar-01)
bounty, $1,325 in USDC.

## What it is

`main.ts` (Node 22, standard library only) reads a sealed snapshot of the protocol universe
(758 protocols from DefiLlama, frozen 2026-11-14), scores every protocol that records no token,
and writes a dashboard: a ranked board, a detail view for each protocol with its farm plan, and
filters by category, chain and token status.

## The model

Implied value is one function of the snapshot's own figures — no protocol name is ever
special-cased:

```
implied = round( tvl_usd x multiple x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
                 x (0.70 + min(age_days, 1095) / 1095 x 0.30) )
```

The multiple is the market's own answer: the median market-cap to TVL of the live-token
protocols in the row's category (at least three comparables, otherwise the global median),
clamped to 0.05x–1.00x. A DEX whose peers trade at 0.34x TVL is scored at 0.34x its TVL; a
lender whose peers trade at 0.13x is scored at 0.13x. Growth rewards a protocol whose TVL is
compounding now; maturity rewards one that has run a long time with no token.

The board carries all 226 rankable pre-token protocols: the 40-protocol watchlist (the floor,
never a ceiling) plus every other pre-token protocol below the floor. Protocols whose token
already trades are set aside in the Live view with their market cap, which is a fact, not a
model — and their market-cap to TVL ratios are the comparables the board is priced with.

## Farm plans

Each protocol gets a seven-step plan derived from its own record: its category picks the
action, its TVL picks the capital ($50–$250), its chains pick where the action happens
(multi-chain protocols get a cross-chain step), and its age picks how long to hold (30–60
days). Every step states what it costs and how long it takes.

## The dashboard

`dashboard/` is a static page with no network: it reads `data.js`, written beside it by
`main.ts`. It sorts every column, filters by search, category and chain, shows the top five
by implied value, opens a detail drawer for each protocol with the model's own inputs and
its farm plan, and offers a model sandbox that re-ranks the board live when you move the
growth-weight or maturity-floor sliders.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

It writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and
`out/dossier.json`. The run is deterministic: the same snapshot always writes the same bytes.
