# DeFi Protocol Risk Scorer

A DeFi protocol risk-scoring dapp built for **ETHOnline 2026** (Sep 4–16). It grades a small set of real protocols/pools against each other in real time, combining three layers of signal: security auditing background (contract-level risk), econometrics (statistical risk metrics), and cross-chain liquidity data. The goal is a working, usable dapp — not a static analysis report or BI dashboard.

## Project Concept

Protocols are compared within matched categories rather than across unrelated business types, so scores stay apples-to-apples:

- **Group 1 — DEXes:** Uniswap v3, Curve Finance, Balancer
- **Group 2 — Lending markets:** Aave v3, Compound v3, Morpho

Whether both groups ship in the hackathon build or just one is still open, pending data availability.

Each group is scored on the same three layers:

| Layer | Signal | Source |
|---|---|---|
| Security (auditing) | Upgradeable / proxy pattern, verified, audited; oracle dependency (e.g. Chainlink vs. thinner/custom oracle) as a risk signal | Etherscan, contract metadata |
| Econometrics | Concentration index (HHI), rolling volatility | SQL + R, on-chain data via The Graph / Dune |
| Cross-chain liquidity | Liquidity fragmentation across chains | TBD — see [Open Questions](#open-questions) |

Chainlink is not a compared entity — it's a candidate input to the security sub-score (oracle source quality), not a competitor being graded.

## Demo Format

A 3-minute video showing the working dapp in use: wallet connect, protocol selection, and a live score with a walked-through example (one protocol flagged, one clear reason why). Frontend built in Next.js with shadcn/ui components.

## Sponsor Integration

The original plan assumed cross-chain liquidity data would come via LI.FI as sponsor SDK. Verification against the live ETHOnline 2026 prizes page (checked 2026-09-04) found LI.FI is **not** currently a confirmed sponsor, so that assumption needs a replacement. Candidates under consideration:

- **The Graph** ($15,000 across 3 tracks) — strong natural fit, since the econometrics layer already plans to lean on Dune/Graph queries for concentration and volatility data. Requires live (not mocked) data via Subgraph MCP, Substreams, or Standardized Subgraphs. Most promising replacement since it would also serve as the econometrics data layer.
- **Chainlink Labs** ($3,000) — could dovetail with using Chainlink as a security-signal input.
- **Uniswap Foundation** ($5,000) — confirmed sponsor, but requires a real integration point on the Uniswap stack (API, AMM v2/v3/v4, v4 hooks, or ecosystem tooling) plus a public repo, FEEDBACK.md, and their developer feedback form. Simply grading Uniswap alongside other DEXes using generic indexer data likely doesn't qualify on its own.
- **1inch** ($7,000) — narrowly scoped to building an "Aqua app" on SwapVM contracts; weak fit as a general cross-chain liquidity source.

## Prep Checklist

- [x] Confirm sponsor landscape and re-evaluate the cross-chain data source (LI.FI is not confirmed; The Graph is the current leading candidate)
- [ ] Verify the chosen cross-chain data source's real feature set
- [ ] Run a test Dune / The Graph query to confirm holder concentration and historical liquidity data is actually queryable, not just theoretically public
- [ ] Pick 4–6 real protocols/pools to score (mix of established + newer for score spread)
- [ ] Refresh narrow econometrics toolkit: HHI concentration index, rolling volatility, basic significance/relevance check
- [ ] Practice Next.js + shadcn/ui component patterns for the frontend
- [ ] Confirm ETHOnline's rules on pre-event practice code vs. project-specific code
- [ ] Decide whether both protocol groups (DEXes + lending markets) ship, or just one

## Open Questions

- Which sponsor SDK/data source replaces the original LI.FI assumption for cross-chain liquidity data?
- Is the specific on-chain data needed (holder concentration, historical liquidity depth) actually available via Dune/Graph at usable granularity?
- Does ETHOnline restrict any pre-event frontend practice, or only project-specific code?
- Do both protocol groups ship, or just one?

## Tech Stack

- **Frontend:** Next.js, shadcn/ui
- **Data / analytics:** SQL, R (econometrics), on-chain data via The Graph / Dune (candidate)
- **Contract risk signals:** Etherscan, contract metadata

## License

TBD