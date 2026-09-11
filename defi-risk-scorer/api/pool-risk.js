// api/pool-risk.js
// Vercel serverless function — the ONLY place the Graph API key exists.
//
// GET /api/pool-risk?protocol=uniswap&pool=0x...   (any Uniswap v3 pool address)
// GET /api/pool-risk?protocol=balancer&pool=0x...  (any Balancer v2 pool id)
// GET /api/pool-risk?protocol=curve                (fixed verified pool only — see note below)
//
// Never import this file into frontend code — it's server-only.

import {
  computeHHI,
  uniswapV3ToBalancesUSD,
  balancerToBalancesUSD,
  curveToBalancesUSD,
  fetchFullCurveHistory,
  TOKEN_PRICE_TABLE,
} from '../lib/risk-formulas.js';

const API_KEY = process.env.GRAPH_API_KEY;
const BASE = `https://gateway.thegraph.com/api/${API_KEY}/subgraphs/id`;

const SUBGRAPHS = {
  uniswap: `${BASE}/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`,
  curve:   `${BASE}/3fy93eAT56UJsRCEht8iFhfi6wjHWXtZ9dnnbQmvFopF`,
  balancer:`${BASE}/C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV`,
};

// Default/demo pools — used when no `pool` query param is given.
const DEFAULT_POOLS = {
  uniswap: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  curve:   '0x8a4f252812dff2a8636e4f7eb249d8fc2e3bd77f',
  balancer:'0xc8398feef7aa2a8638473ca6569af217448d080a0002000000000000000006f5',
};

// Curve's ONLY supported pool right now. This is a real, documented
// limitation, not an oversight — see the comment on getCurveReport().
const CURVE_TOKEN_ORDER = [
  '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f', // GHO
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
];

// Basic sanity check on user-supplied addresses before they get interpolated
// into a GraphQL query string. Not a full checksum validation — just enough
// to reject garbage/injection attempts. Accepts both 20-byte addresses and
// Balancer's longer 32-byte pool ids.
function isValidHexId(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40,64}$/.test(value);
}

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

/**
 * Fetches live USD prices for any tokens not already in TOKEN_PRICE_TABLE,
 * and adds them. Needed because a user-supplied pool can involve any token —
 * the static table only pre-populates the demo pools' known tokens.
 */
async function ensureTokenPrices(tokens) {
  const missing = tokens.filter(t => !TOKEN_PRICE_TABLE[t.id.toLowerCase()]);
  if (missing.length === 0) return;

  const addressList = missing.map(t => t.id.toLowerCase()).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${addressList}&vs_currencies=usd`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`CoinGecko price fetch failed (${res.status}) for: ${addressList}`);
    return;
  }
  const data = await res.json();

  for (const t of missing) {
    const priceData = data[t.id.toLowerCase()];
    if (priceData?.usd) {
      TOKEN_PRICE_TABLE[t.id.toLowerCase()] = {
        symbol: t.symbol,
        decimals: Number(t.decimals),
        priceUSD: priceData.usd,
      };
    } else {
      console.warn(`No CoinGecko price found for ${t.symbol} (${t.id}) — this token's value will show as $0.`);
    }
  }
}

async function getUniswapReport(poolAddress) {
  const query = `{
    pool(id: "${poolAddress}") {
      tick
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
    positions(first: 100, where: { pool: "${poolAddress}" }, orderBy: liquidity, orderDirection: desc) {
      id owner liquidity
      tickLower { tickIdx }
      tickUpper { tickIdx }
      depositedToken0
      depositedToken1
    }
  }`;
  const data = await gqlQuery(SUBGRAPHS.uniswap, query);

  if (!data.pool) {
    throw new Error('Pool not found on Uniswap v3 mainnet. Check the address and try again.');
  }

  await ensureTokenPrices([data.pool.token0, data.pool.token1]);

  const currentTick = Number(data.pool.tick);
  const balances = uniswapV3ToBalancesUSD(data, currentTick);
  return {
    protocol: 'Uniswap v3',
    pair: `${data.pool.token0.symbol} / ${data.pool.token1.symbol}`,
    address: poolAddress,
    hhi: computeHHI(balances),
    lpCount: balances.length,
    lpNote: `${balances.length} in-range positions, of ${data.positions.length} pulled`,
    isCustomPool: poolAddress.toLowerCase() !== DEFAULT_POOLS.uniswap.toLowerCase(),
  };
}

async function getBalancerReport(poolAddress) {
  const query = `{
    pool(id: "${poolAddress}") {
      totalShares
      totalLiquidity
      shares(first: 100, orderBy: balance, orderDirection: desc) {
        userAddress { id }
        balance
      }
    }
  }`;
  const data = await gqlQuery(SUBGRAPHS.balancer, query);

  if (!data.pool) {
    throw new Error('Pool not found on Balancer v2 mainnet. Check the pool id and try again.');
  }

  const balances = balancerToBalancesUSD(data);
  const maxBalance = data.pool.shares.length > 0
    ? Math.max(...data.pool.shares.map(s => Number(s.balance)))
    : 0;
  const whale = data.pool.shares.find(s => Number(s.balance) === maxBalance);

  return {
    protocol: 'Balancer v2',
    pair: `Pool ${poolAddress.slice(0, 10)}...`,
    address: poolAddress,
    hhi: computeHHI(balances),
    lpCount: balances.length,
    lpNote: `${balances.length} active holder(s), of ${data.pool.shares.length} addresses on record`,
    whale: balances.length > 0 ? whale.userAddress.id : null,
    isCustomPool: poolAddress.toLowerCase() !== DEFAULT_POOLS.balancer.toLowerCase(),
  };
}

/**
 * Curve is intentionally NOT open to arbitrary pool addresses yet.
 *
 * Why: inputTokenAmounts' order follows each pool's own on-chain coin
 * index, which can differ from pool to pool and does NOT reliably match
 * the subgraph's inputTokens metadata order. TricryptoGHO's real order
 * ([GHO, cbBTC, WETH]) was only confirmed by manually checking real
 * transaction magnitudes against an obviously-wrong quadrillion-dollar
 * result. Automating this per arbitrary pool risks silently wrong numbers,
 * which is worse than not supporting it. Documented in analysis-README.md.
 */
async function getCurveReport(requestedPoolAddress) {
  if (requestedPoolAddress && requestedPoolAddress.toLowerCase() !== DEFAULT_POOLS.curve.toLowerCase()) {
    const err = new Error(
      'Custom Curve pools are not yet supported — token ordering must be ' +
      'manually verified per pool to avoid silently wrong results. ' +
      'Only TricryptoGHO is available for Curve right now.'
    );
    err.statusCode = 400;
    throw err;
  }

  const { deposits, withdraws, complete } = await fetchFullCurveHistory(
    SUBGRAPHS.curve, DEFAULT_POOLS.curve, 20
  );
  const balances = curveToBalancesUSD(
    deposits, withdraws,
    { [DEFAULT_POOLS.curve]: CURVE_TOKEN_ORDER },
    []
  );
  return {
    protocol: 'Curve Finance',
    pair: 'TricryptoGHO · GHO / cbBTC / WETH',
    address: DEFAULT_POOLS.curve,
    hhi: computeHHI(balances),
    lpCount: balances.length,
    lpNote: `${balances.length} net-positive addresses, from full deposit/withdrawal history`,
    historyComplete: complete,
    isCustomPool: false,
    customPoolSupported: false,
  };
}

export default async function handler(req, res) {
  const { protocol, pool } = req.query;

  if (!API_KEY) {
    return res.status(500).json({ error: 'GRAPH_API_KEY not configured on server' });
  }

  if (!['uniswap', 'curve', 'balancer'].includes(protocol)) {
    return res.status(400).json({ error: 'protocol must be one of: uniswap, curve, balancer' });
  }

  // Validate any user-supplied pool address before it touches a query string.
  if (pool && !isValidHexId(pool)) {
    return res.status(400).json({ error: 'pool must be a valid 0x-prefixed hex address' });
  }

  try {
    let report;
    if (protocol === 'uniswap') {
      report = await getUniswapReport(pool || DEFAULT_POOLS.uniswap);
    } else if (protocol === 'balancer') {
      report = await getBalancerReport(pool || DEFAULT_POOLS.balancer);
    } else {
      report = await getCurveReport(pool);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json(report);
  } catch (err) {
    console.error(`Error generating ${protocol} report:`, err);
    return res.status(err.statusCode || 502).json({ error: err.message });
  }
}