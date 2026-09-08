# DeFi Protocol Risk Scorer

A DeFi protocol risk-scoring dapp built for **ETHOnline 2026** (Sep 4–16). It
grades a small set of real protocols/pools against each other in real time,
combining three layers of signal: security auditing background
(contract-level risk), econometrics (statistical risk metrics), and
cross-chain liquidity data. The goal is a working, usable dapp — not a static
analysis report or BI dashboard.

**Status (Sep 8):** Data pipeline, formulas, and pool selection are complete
and verified against live data. See `analysis-README.md` for the full writeup
— pool selection rationale, data-quality bugs found and fixed, formula
design, and real verified HHI results. Frontend build starts next.

## Project Concept

Protocols are compared within matched categories rather than across
unrelated business types, so scores stay apples-to-apples:

- **Group 1 — DEXes:** Uniswap v3, Curve Finance, Balancer

One pool per protocol has been selected and fully verified end-to-end
(live query → formula → real result):

| Protocol | Pool | HHI (verified) |
|---|---|---|
| Uniswap v3 | USDC/WETH 0.05% | 0.331 |
| Curve | TricryptoGHO | 0.614 |
| Balancer v2 | GyroE pool | 1.000 |

A lending-market group (Aave v3, Compound v3, Morpho) was considered in
early planning but is out of scope for this build — see analysis README for
reasoning.

Each pool is scored on three layers:

| Layer | Signal | Source |
|---|---|---|
| Security (auditing) | Upgradeable/proxy pattern, verified, audited; oracle dependency as a risk signal | Etherscan, contract metadata |
| Econometrics | Concentration index (HHI), rolling volatility | Live subgraph data via The Graph — **built and verified** |
| Cross-chain liquidity | Liquidity fragmentation across chains | TBD — see Open Questions |

Chainlink is not a compared entity — it's a candidate input to the security
sub-score (oracle source quality), not a competitor being graded.

## Sponsor Integration — resolved

The original plan assumed cross-chain liquidity data would come via LI.FI as
a sponsor SDK. **This assumption did not hold up**: LI.FI was not confirmed
as an ETHOnline 2026 sponsor when checked directly against the sponsor page
(2026-09-04). **The Graph is the confirmed, verified replacement** — not just
a fallback pick. Live subgraphs for all three target protocols (Uniswap v3,
Curve Finance Ethereum, Balancer V2) were queried, validated, and are
feeding the actual econometrics layer as of tonight's commit, targeting:

- **The Graph — Composable/Standardized Track ($5,000)** — primary target.
  All three subgraphs confirmed Messari-standardized; one query pattern
  spans all three protocols.
- **The Graph — AI Tooling/Use Case Track ($5,000)** — planned, via a
  natural-language "why this pool was flagged" layer (see
  `analysis-README.md` → Interpreting the Score).
- **Uniswap Foundation ($5,000)** — stretch goal, contingent on time for a
  real Uniswap-stack integration point beyond generic indexer data.
- **Chainlink CRE ($3,000)** — stretch goal only, separate nontrivial build.

Full sponsor-fit reasoning: see `protocol-selection-and-sponsor-notes.md`.

## Demo Format

A 3-minute video showing the working dapp in use: protocol selection, and a
live score with a walked-through example (one pool flagged, one clear reason
why — e.g. "this pool is flagged high-risk because a single address controls
100% of liquidity"). Frontend built in Next.js with shadcn/ui components.

## Prep Checklist

- [x] Confirm sponsor landscape and re-evaluate the cross-chain data source
      (resolved: LI.FI dropped, The Graph confirmed and integrated)
- [x] Verify the chosen data source's real feature set (Messari-standardized
      subgraphs confirmed across all three protocols)
- [x] Run test Graph queries to confirm holder concentration data is
      actually queryable — confirmed live for all three protocols
- [x] Pick real protocols/pools to score (Uniswap v3, Curve, Balancer v2 —
      one pool each, verified; decided against expanding further for now,
      see analysis README)
- [x] Refresh econometrics toolkit: HHI concentration index built, tested,
      and verified against live data
- [ ] Practice Next.js + shadcn/ui component patterns for the frontend
- [ ] Confirm ETHOnline's rules on pre-event practice code vs.
      project-specific code
- [x] Decide whether both protocol groups ship — decided: DEX group only

## Open Questions

- Rolling volatility / historical liquidity time-series — not yet built
  (separate from the concentration/HHI work done so far); likely sourced
  from `poolDayData`/`liquidityPoolDailySnapshot`-style fields, per protocol.
- Does ETHOnline restrict any pre-event frontend practice, or only
  project-specific code?

## Tech Stack

- **Frontend:** Next.js, shadcn/ui
- **Data / analytics:** JavaScript (formulas + adapters), live queries via
  The Graph, CoinGecko for live USD pricing
- **Contract risk signals:** Etherscan, contract metadata

## Repo structure

- `analysis-README.md` — full data investigation writeup: pool selection,
  bugs found and fixed, formula design, verified results.
- `risk-formulas.js` — HHI, slippage, per-protocol data adapters, live price
  refresh, Curve pagination.
- `test-live.js` — end-to-end live verification script.
- `protocol-selection-and-sponsor-notes.md` — sponsor-track research and
  pool grouping decisions.

## License

TBD