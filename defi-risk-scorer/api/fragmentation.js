// api/fragmentation.js
// GET /api/fragmentation — cross-chain liquidity fragmentation for the
// USDC/WETH pair, scored with the SAME HHI formula used for LP concentration,
// just applied to a different input (per-chain TVL instead of per-LP balance).
//
// Scope, deliberately simple per the hackathon timeline:
// - Uniswap v3 only (cleanest, best-documented multi-chain deployment)
// - One pair (USDC/WETH), live current TVL only, no history
// - 3 chains: mainnet, Arbitrum, Optimism

import { computeHHI } from '../lib/risk-formulas.js';

const API_KEY = process.env.GRAPH_API_KEY;
const BASE = `https://gateway.thegraph.com/api/${API_KEY}/subgraphs/id`;

// Each chain's real, verified USDC/WETH pool — found by sorting live TVL
// descending and manually confirming the top result wasn't a corrupted
// sentinel value (a real, repeated issue across every subgraph this
// project has touched — see analysis-README.md).
const CHAINS = [
  {
    name: 'Ethereum Mainnet',
    subgraph: `${BASE}/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`,
    pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  },
  {
    name: 'Arbitrum',
    subgraph: `${BASE}/Fo8QBLpEGfXHWkGMD3jSM4vVLk4JxvxxQD3v3U4fsrbh`,
    pool: '0xc6962004f452be9203591991d15f6b388e09e8d0',
  },
  {
    name: 'Optimism',
    subgraph: `${BASE}/49LkWjoVKd3bM9ZrMdFgYkjaCuVj4ExZttQi6XfbcPpG`,
    pool: '0xc1738d90e2e26c35784a0d3e3d8a9f795074bca4',
  },
];

async function gqlQuery(url, query) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph query failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function getChainTVL(chain) {
  const query = `{
    pool(id: "${chain.pool}") {
      totalValueLockedUSD
    }
  }`;
  const data = await gqlQuery(chain.subgraph, query);
  const tvl = data.pool ? Number(data.pool.totalValueLockedUSD) : 0;

  // Same sanity check applied everywhere else in this project: reject an
  // implausible value rather than silently returning it. No single
  // USDC/WETH pool has ever held anywhere near $1B.
  const isPlausible = tvl > 0 && tvl < 1_000_000_000;

  return {
    chain: chain.name,
    tvlUSD: isPlausible ? tvl : 0,
    flagged: !isPlausible,
  };
}

export default async function handler(req, res) {
  if (!API_KEY) {
    return res.status(500).json({ error: 'GRAPH_API_KEY not configured on server' });
  }

  try {
    const results = await Promise.all(CHAINS.map(getChainTVL));
    const validResults = results.filter(r => !r.flagged);

    if (validResults.length < 2) {
      return res.status(502).json({
        error: 'Not enough valid chain data to compute fragmentation.',
        results,
      });
    }

    const tvls = validResults.map(r => r.tvlUSD);
    const hhi = computeHHI(tvls);
    const totalTVL = tvls.reduce((a, b) => a + b, 0);

    const breakdown = validResults
      .map(r => ({ ...r, sharePercent: (r.tvlUSD / totalTVL) * 100 }))
      .sort((a, b) => b.tvlUSD - a.tvlUSD);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({
      pair: 'USDC / WETH',
      protocol: 'Uniswap v3',
      hhi,
      totalTVL,
      breakdown,
      chainsScored: validResults.length,
      chainsFlagged: results.length - validResults.length,
    });
  } catch (err) {
    console.error('Error computing fragmentation:', err);
    return res.status(502).json({ error: err.message });
  }
}