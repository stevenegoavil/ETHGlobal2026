# SKNYDipping — Risk Pool

A DeFi risk-scoring dapp built for **ETHOnline 2026** (Sep 4–16). It scores
real, live pools on two independent risk factors — liquidity-provider
concentration and cross-chain liquidity fragmentation — using on-chain data
queried directly from **The Graph**, with a real AI-generated explanation of
what each score actually means for someone considering depositing funds.

**Status: complete.** Live data, wallet-gated access, and a working demo
video. Everything below reflects the finished build, not a plan.

## What it does

- **Concentration:** for Uniswap v3, Curve, and Balancer v2, computes the
  Herfindahl-Hirschman Index (HHI) on real liquidity-provider balances,
  pulled live from each protocol's subgraph. Uniswap and Balancer support
  **any pool address** the user pastes in, not just the demo pools — Curve
  is intentionally limited to one verified pool (see "Known limitations"
  below for why).
- **Fragmentation:** for the USDC/WETH pair on Uniswap v3, applies the same
  HHI formula to per-chain TVL across Ethereum mainnet, Arbitrum, and
  Optimism, showing how much of the pair's real liquidity sits on one chain.
- **AI reasoning layer:** each report includes a short, genuinely
  AI-generated sentence (via the **Google Gemini API**, called server-side)
  explaining the practical risk implication of the computed numbers — not a
  hand-written template.
- **Wallet-gated:** built with **Dynamic** (`@dynamic-labs/sdk-react-core`).
  A connected wallet is required to use the tool at all — there's no free
  tier, by deliberate decision (see Roadmap).
- **Live pricing:** token USD values refresh from CoinGecko rather than
  using a stale hardcoded table, since this is meant to inform a real,
  present-moment decision.

## Real results, verified against live data

| Protocol | Pool | HHI |
|---|---|---|
| Uniswap v3 | USDC/WETH 0.05% | 0.331 (initial verification; live queries return current values, which drift with real market activity) |
| Curve | TricryptoGHO | 0.614 |
| Balancer v2 | GyroE pool | 1.000 (single address holds effectively the entire pool) |

Fragmentation (USDC/WETH, Uniswap v3): **HHI 0.829** — roughly 91% of this
pair's tracked liquidity sits on Ethereum mainnet alone.

Full methodology, every data-quality bug found and fixed along the way, and
the reasoning behind each pool selection: see `analysis-README.md`.

## Tech stack

- **Frontend:** Vite + React + shadcn/ui (Base UI primitives, Lyra preset)
  — pivoted from an original Next.js plan once the project moved to a
  pure client + serverless-function architecture rather than needing SSR.
- **Backend:** Vercel serverless functions (`/api`) — the only place the
  Graph API key and Gemini API key exist. The frontend never sees either.
- **Data:** live GraphQL queries to The Graph's Uniswap v3, Curve Finance
  (Messari), and Balancer V2 mainnet subgraphs, plus their Arbitrum and
  Optimism deployments for fragmentation.
- **Wallet auth:** Dynamic SDK.
- **AI reasoning:** Google Gemini API, called server-side per report.
- **Pricing:** CoinGecko public API.

## Known limitations (stated on purpose, not hidden)

- **Curve doesn't support custom pool input.** Curve orders each pool's
  tokens by its own on-chain coin index, which does not reliably match the
  order its subgraph metadata lists them in — confirmed the hard way after
  an assumed ordering produced an 18-quadrillion-dollar result during
  testing. Automating this safely per arbitrary pool wasn't achievable in
  the timeline, so Curve is scoped to one manually-verified pool
  (TricryptoGHO).
- **Fragmentation is Uniswap-only, for one pair (USDC/WETH), across three
  chains.** Curve and Balancer appear in the UI as greyed-out tabs on
  purpose — the idea generalizes to them, but each protocol organizes its
  per-chain subgraphs differently, and matching "the same pool, on another
  chain" needs the same kind of manual verification as Curve's token
  ordering.
- **Rolling volatility / historical HHI trend** is not built — every score
  is a live, current-moment snapshot, not a time series.

## Sponsor fit — The Graph

- **Composable/Standardized Track:** primary target. Uniswap, Curve, and
  Balancer concentration scoring all run through one shared query pattern
  against Messari-standardized schemas — confirmed live, not assumed.
- **AI Tooling/Use Case Track:** the Gemini-generated explanation layer
  does real reasoning over live Graph data (not printing a raw query
  result), which is the track's explicit bar.

Full sponsor research and the LI.FI → Graph pivot reasoning:
`protocol-selection-and-sponsor-notes.md`.

## Roadmap — discussed, not built

- Wallet-connected-as-unlock is the honest, buildable version of a future
  paid tier; real on-chain payment collection was deliberately scoped out.
- Users bringing their own Graph API key (removes the backend proxy
  requirement for their own usage, shifts Graph query volume — and
  business — to them directly).
- More risk factors: oracle-dependency quality, audit status,
  upgradeable/proxy-pattern risk.
- Expanding beyond one pool per protocol, if it can be done without
  repeating the same data-quality issues found this week.

## Repo structure

- `defi-risk-scorer/` — the real, deployed application (Vite + React +
  serverless functions).
- `prototype-test/` — the earlier throwaway data-verification scripts and
  vanilla HTML/CSS/JS prototype, kept for the commit history showing the
  investigation work behind the final build.
- `analysis-README.md` — full data investigation: pool selection, every
  bug found and fixed, formula design, verified results.
- `protocol-selection-and-sponsor-notes.md` — sponsor research and pool
  grouping decisions.

## License

TBD