# Risk-Scoring Analysis — Data & Formula Verification

**Status:** Complete and verified against live data as of Sep 8, 2026.
**Scope:** This document covers data-source investigation, formula design, and
end-to-end verification — the analytical foundation the frontend build (starting
mid-week) is built on top of. No UI work is included here by design; this is the
part of the project that has to be right before any pixel gets drawn.

## Goal

Score real DeFi protocols/pools against each other on liquidity-provider (LP)
concentration risk — how much of a pool's liquidity is controlled by a small
number of addresses. High concentration means a single large withdrawal can
meaningfully disrupt the pool for everyone else.

Three protocols, one pool each, compared on the same underlying metric
(Herfindahl-Hirschman Index) despite each protocol exposing LP data in a
completely different shape.

## Data sources

All data pulled from live subgraphs on The Graph's decentralized network
(no mocked or static data — a requirement for the sponsor track this project
targets).

| Protocol | Subgraph | Subgraph ID |
|---|---|---|
| Uniswap v3 | Uniswap-V3 (mainnet) | `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` |
| Curve | Curve Finance Ethereum (Messari) | `3fy93eAT56UJsRCEht8iFhfi6wjHWXtZ9dnnbQmvFopF` |
| Balancer v2 | Balancer V2 | `C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV` |

### Pools selected

| Protocol | Pool | Address |
|---|---|---|
| Uniswap v3 | USDC/WETH 0.05% | `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640` |
| Curve | TricryptoGHO | `0x8a4f252812dff2a8636e4f7eb249d8fc2e3bd77f` |
| Balancer v2 | GyroE pool | `0xc8398feef7aa2a8638473ca6569af217448d080a0002000000000000000006f5` |

Each pool was chosen by querying live TVL/liquidity, sorted descending, and
manually verifying the top result was a real, active pool rather than a
mock/placeholder — see Known Data Issues below for why this step mattered.

## Why the three protocols needed different formulas

A single LP's "current position" isn't represented the same way across these
three protocols:

- **Uniswap v3**: LP positions are NFTs (`Position` entities) with an explicit
  liquidity amount and a price range. A position only counts toward
  concentration if the pool's *current tick* falls inside that position's
  range — out-of-range positions aren't actively providing liquidity, even
  though they still technically exist.
- **Balancer v2**: LP shares are fungible BPT (pool tokens). Balance is a
  direct, current, queryable number per address — no calculation needed
  beyond converting BPT balance to USD.
- **Curve**: No live balance field is exposed at all. LP positions have to be
  reconstructed as *net position = sum(deposits) − sum(withdraws)*, computed
  from the full event history per address.

## Formulas

**Herfindahl-Hirschman Index (concentration):**

```
HHI = Σ(share_i)²   where share_i = balance_i / total_balance
```

Ranges 0 (perfectly distributed) to 1 (single holder). Values above ~0.25 are
conventionally considered highly concentrated.

**Slippage estimate (constant-product approximation)**, used for the
liquidity-depth/trading-cost side of the risk score:

```
slippage = |spot_price − execution_price| / spot_price
```

Computed across a few trade sizes to show how price impact scales with trade
size per pool.

**Live price refresh:** token USD prices refresh from CoinGecko's public API
on demand (not hardcoded), since this tool is meant to inform a real-time
decision about whether to deposit funds right now — a stale price defeats the
purpose. Falls back to last-known price if a fetch fails, rather than zeroing
out a token's value.

Full implementation: `risk-formulas.js`.

## Known data issues found and handled

Live on-chain data is not clean by default. Each of these was caught by
checking whether a returned number was *plausible*, not just present:

- **Corrupted subgraph values**: Sentinel/placeholder values in the 10¹²–10³²
  range appeared across all three subgraphs (a "DO NOT USE - Mock Linear
  Pool" balance of ~$5.19×10¹⁵, an $18.9 quadrillion Curve deposit, a $21.3B
  single Balancer pool). None are real. Filtered out by sorting on real TVL
  and manually sanity-checking the top result before selecting a pool.
- **Curve token ordering**: `inputTokenAmounts` array order follows Curve's
  on-chain coin index convention (`[stablecoin, BTC-variant, ETH-variant]`
  for tricrypto-style pools), which does **not** match the order tokens are
  listed in the subgraph's own `inputTokens` metadata field. Assuming they
  matched produced an 18-quadrillion-dollar result before this was caught
  and fixed.
- **Uniswap position staleness**: some `Position` entities exist far outside
  the pool's current price range (e.g. a position with `tickLower: -76280`
  in a pool currently at `tick: 198088`) — abandoned or historical positions
  that don't represent live liquidity. Excluded via range-filtering against
  the pool's current tick.
- **Query scalability (Balancer)**: the first working query approach
  (`users → sharesOwned → filter by pool`) required scanning every user on
  the entire protocol client-side to find LPs in one pool — correct but
  doesn't scale. Replaced with a pool-centric query
  (`pool(id) { shares { userAddress balance } }`) that returns exactly the
  LPs in one pool directly.
- **Curve pagination**: LP history for an active pool exceeds the 1000-row
  per-query max. Full history is retrieved via a timestamp-cursor pagination
  loop (`fetchFullCurveHistory`) rather than a single capped query, which
  would understate concentration by missing older LP activity.

## Verified results (live, Sep 8 2026)

Run via `test-live.js` against real API credentials, full data (not samples):

| Protocol | Pool | LPs counted | HHI |
|---|---|---|---|
| Uniswap v3 | USDC/WETH 0.05% | 41 (in-range, of 100 pulled) | **0.331** |
| Curve | TricryptoGHO | 57 (net positive, full history) | **0.614** |
| Balancer v2 | GyroE pool | 1 | **1.000** |

The spread across these three numbers is itself a meaningful result — it
shows the scoring approach differentiates real risk across protocols rather
than returning a flat or arbitrary number.

## Comparability note: why LP counts differ so much across protocols

The results table shows very different underlying counts — 100 pulled for
Uniswap, 57 for Curve, 3 for Balancer. These are not the same kind of number,
and the difference doesn't weaken the comparison:

- **Uniswap's 100** is a *query cap* (`first: 100`, sorted by liquidity
  descending). There may be more positions beyond this, but since they're
  sorted by size and HHI weights by squared share, additional small
  positions would barely move the result. This is the one number here that
  is technically an incomplete sample, by design.
- **Curve's 57** is a *complete, reconstructed* count — the full paginated
  deposit/withdraw history for the pool, netted per address, filtered to
  addresses with a remaining positive balance. Not capped.
- **Balancer's 3** is also *complete*, not a limitation — the query returns
  every address that has ever held a share of this specific pool, and this
  particular $20M pool genuinely only has three. Low LP count here reflects
  the real structure of a niche pool, not thin data.

HHI itself doesn't require equal sample sizes to be comparable across pools.
It's a ratio — the sum of each LP's squared share of the pool, always scaled
0 to 1 — not a function of how many LPs exist underneath it. A 3-LP pool and
a 57-LP pool are both answering the same question ("how much does the
largest holder dominate this pool") on the same scale; different LP counts
reflect real differences in each pool's actual holder base, not
inconsistent methodology between protocols.

## Interpreting the score

HHI is the right underlying math, but it's not something a non-technical
person — including most hackathon judges watching a 3-minute demo — should
have to parse directly. The frontend will surface three layers, primary to
secondary:

**1. Risk label (primary, what most people see first)**

| HHI range | Label | Color |
|---|---|---|
| 0.00 – 0.15 | Low concentration risk | Green |
| 0.15 – 0.35 | Moderate concentration risk | Yellow |
| 0.35 – 1.00 | High concentration risk | Red |

(Thresholds are a reasonable starting convention, not a regulatory standard —
worth revisiting once more pools are scored and the real distribution of
values across pools is known.)

**2. Plain-English equivalent (secondary, one sentence)**

`1 / HHI` gives the "equivalent number of equal-sized holders" — a pool
this concentrated behaves as if it were owned by that many equal people,
regardless of how many addresses technically hold a balance. Framed as:

> "This pool behaves like it's owned by roughly N people."

**3. Raw HHI (tertiary, for anyone who wants the underlying rigor)**

Shown smaller/secondary on the UI — the number backing the label above.

### Worked examples, using this project's own verified results

| Pool | HHI | Equivalent holders (1/HHI) | Label |
|---|---|---|---|
| Balancer GyroE pool | 1.000 | ~1.0 | High — literally one address |
| Curve TricryptoGHO | 0.614 | ~1.6 | High — two addresses functionally control it |
| Uniswap USDC/WETH 0.05% | 0.331 | ~3.0 | High, but closer to the moderate line |

This also directly supports The Graph's "AI Tooling" prize track requirement
for "reasoning... not just printing a raw query result" — the plain-English
sentence above is the natural place to extend into a fuller generated
explanation (e.g. "flagged high-risk because address 0x78ec... controls
100% of liquidity — a single withdrawal could drain the pool entirely"),
planned for later in the build.

### Note for later (not now)

Considered writing a longer, formal paper/thesis alongside this analysis to
pre-empt anyone trying to "pull apart" the methodology on inspection. Decided
against it for the hackathon timeline — this README plus the commit history
of the actual bugs found and fixed already serves that purpose, and the
frontend build needs the remaining time more. Worth revisiting as a
standalone writeup after submission, for a portfolio or blog post, not as
prep for Sunday.

## What's deliberately out of scope here

- Frontend/UI — starts next, separate from this analysis phase.
- Wallet connect, visualization — planned but not part of data verification.
- Precise Uniswap v3 in-range liquidity math (this uses `depositedToken0`/
  `depositedToken1` directly rather than deriving exact active liquidity from
  tick math — a reasonable simplification for a hackathon timeline, noted
  here rather than hidden).
- Multiple pools per protocol / the lending-market comparison group — this
  phase validates the pipeline on one pool per protocol; expanding to
  more pools is mechanical repetition of the same verified approach.

## Files

- `risk-formulas.js` — HHI, slippage, per-protocol adapters, live price
  refresh, Curve pagination.
- `test-live.js` — end-to-end live test script, run locally with a Graph API
  key (`GRAPH_API_KEY=your_key node test-live.js`).