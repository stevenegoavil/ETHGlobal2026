// ============================================================
// CORE FORMULA — protocol-agnostic
// ============================================================

/**
 * Herfindahl-Hirschman Index for LP concentration.
 * Takes a flat array of numeric balances, ALL IN THE SAME UNIT
 * (this version assumes USD — see the price-conversion helpers below
 * for how each protocol's raw data gets there).
 * Returns 0–1. Closer to 1 = a few whales dominate. Closer to 0 = distributed.
 */
function computeHHI(balancesUSD) {
  const total = balancesUSD.reduce((sum, b) => sum + b, 0);
  if (total === 0) return 0;
  const shares = balancesUSD.map(b => b / total);
  return shares.reduce((sum, s) => sum + s * s, 0);
}

function normalizedHHI(balancesUSD) {
  const n = balancesUSD.length;
  if (n <= 1) return 1;
  const hhi = computeHHI(balancesUSD);
  const minPossible = 1 / n;
  return (hhi - minPossible) / (1 - minPossible);
}

/**
 * Slippage / price-impact proxy at a given trade size (constant-product approx).
 * reserveIn / reserveOut: pool reserves of the two assets, same unit (e.g. USD)
 * tradeSizeIn: hypothetical trade size, same unit as reserveIn
 */
function estimateSlippage(reserveIn, reserveOut, tradeSizeIn) {
  const k = reserveIn * reserveOut;
  const newReserveIn = reserveIn + tradeSizeIn;
  const newReserveOut = k / newReserveIn;
  const amountOut = reserveOut - newReserveOut;
  const spotPrice = reserveOut / reserveIn;
  const executionPrice = amountOut / tradeSizeIn;
  return Math.abs(spotPrice - executionPrice) / spotPrice;
}

function slippageCurve(reserveIn, reserveOut, tradeSizes) {
  return tradeSizes.map(size => ({
    tradeSize: size,
    slippage: estimateSlippage(reserveIn, reserveOut, size),
  }));
}

// ============================================================
// PRICE CONVERSION — required for cross-protocol comparability
// ============================================================

/**
 * Manual price table you populate once you've picked your real pools.
 * Keyed by token contract address (lowercase), value = { symbol, decimals, priceUSD }.
 * priceUSD is a snapshot you set manually for the hackathon — not live.
 * Fine for a comparative demo; note in your README this is a known simplification.
 *
 * Fill this in once you know your actual pools' tokens (Tuesday's other task).
 */
const TOKEN_PRICE_TABLE = {
  // Prices as of Sep 8, 2026 — snapshot for hackathon demo, not live-updating.
  // Uniswap v3 USDC/WETH 0.05% pool tokens:
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, priceUSD: 1.00 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, priceUSD: 2440 },
  // Curve TricryptoGHO pool tokens:
  '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f': { symbol: 'GHO', decimals: 18, priceUSD: 1.00 },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', decimals: 8, priceUSD: 79000 },
  // NOTE: Balancer's Aave Boosted StablePool USD conversion doesn't need this table —
  // balancerToBalancesUSD() derives USD directly from the pool's totalLiquidity field.
};

/**
 * Converts a raw on-chain token amount (string, wei-style units) to USD,
 * using the manual price table. Returns 0 and warns if token isn't in the table
 * — don't silently drop data, missing prices should be visible, not hidden.
 */
function rawAmountToUSD(rawAmount, tokenAddress) {
  const info = TOKEN_PRICE_TABLE[tokenAddress.toLowerCase()];
  if (!info) {
    console.warn(`No price entry for token ${tokenAddress} — add it to TOKEN_PRICE_TABLE`);
    return 0;
  }
  const amount = Number(rawAmount) / Math.pow(10, info.decimals);
  return amount * info.priceUSD;
}

/**
 * LIVE PRICE REFRESH
 * For the finished product: someone using this tool to decide whether to
 * put funds into a pool right now needs current prices, not a snapshot from
 * whenever the demo was built. This fetches live USD prices from CoinGecko's
 * free public API (no key required) by token contract address, and updates
 * TOKEN_PRICE_TABLE in place.
 *
 * Call this on page load and on a manual "refresh" button — NOT on every
 * render, to respect CoinGecko's rate limits (10-30 calls/min on free tier).
 *
 * Falls back gracefully: if the fetch fails (rate limit, network, token not
 * listed), keeps the last known price rather than zeroing it out — a stale
 * price is a better answer than a missing one for a risk tool.
 */
async function refreshLivePrices() {
  const addresses = Object.keys(TOKEN_PRICE_TABLE);
  const addressList = addresses.join(',');
  const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${addressList}&vs_currencies=usd`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    const data = await response.json();

    const updated = [];
    const failed = [];

    for (const addr of addresses) {
      const priceData = data[addr.toLowerCase()];
      if (priceData && typeof priceData.usd === 'number') {
        TOKEN_PRICE_TABLE[addr].priceUSD = priceData.usd;
        updated.push(TOKEN_PRICE_TABLE[addr].symbol);
      } else {
        failed.push(TOKEN_PRICE_TABLE[addr].symbol);
      }
    }

    return {
      success: true,
      updated,
      failed, // tokens CoinGecko didn't return — kept at last known price
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Price refresh failed, using last known prices:', err.message);
    return {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================
// PROTOCOL ADAPTERS — all output USD-denominated balances
// ============================================================

/**
 * Uniswap v3 — PRECISE version (not the simplified one).
 * Only counts a position's liquidity toward concentration if the pool's
 * CURRENT tick falls inside that position's [tickLower, tickUpper] range —
 * out-of-range positions aren't actively providing liquidity right now,
 * so including them would overstate how distributed the pool really is.
 *
 * Requires the query to also fetch pool.tick (current tick) alongside
 * each position's tickLower/tickUpper. You'll need to add `tick` to your
 * pool query — not fetched in the earlier test query, add it Tuesday.
 *
 * NOTE: Uniswap v3 liquidity units aren't directly USD — converting
 * `liquidity` to a USD value properly requires the tick-math formula
 * (liquidity + tick range + token prices -> token0/token1 amounts).
 * For now this uses depositedToken0USD + depositedToken1USD if your
 * query includes them (Uniswap subgraphs often expose these directly,
 * cheaper than re-deriving from liquidity + ticks by hand).
 */
function uniswapV3ToBalancesUSD(positionsResponse, currentTick) {
  const token0Address = positionsResponse.pool.token0.id;
  const token1Address = positionsResponse.pool.token1.id;
  const price0 = TOKEN_PRICE_TABLE[token0Address.toLowerCase()]?.priceUSD;
  const price1 = TOKEN_PRICE_TABLE[token1Address.toLowerCase()]?.priceUSD;

  if (price0 === undefined || price1 === undefined) {
    console.warn(`Missing price for pool token(s) — add ${token0Address} and/or ${token1Address} to TOKEN_PRICE_TABLE`);
  }

  return positionsResponse.positions
    .filter(p => {
      const inRange = currentTick >= Number(p.tickLower.tickIdx) &&
                       currentTick <= Number(p.tickUpper.tickIdx);
      return inRange;
    })
    .map(p => {
      // NOTE: depositedToken0/depositedToken1 from the subgraph are already
      // decimal-adjusted (e.g. "2175027.951365" USDC), NOT raw wei — no need
      // to divide by 10^decimals here, unlike Curve's inputTokenAmounts.
      const usd0 = Number(p.depositedToken0) * (price0 || 0);
      const usd1 = Number(p.depositedToken1) * (price1 || 0);
      return usd0 + usd1;
    })
    .filter(v => v > 0);
}

/**
 * Balancer v2 — REWRITTEN to use the pool-centric `shares` reverse relation
 * (discovered via autocomplete, confirmed working) instead of scanning all
 * users. Query shape:
 *   pool(id: "...") { totalShares totalLiquidity shares(first: 100) { userAddress { id } balance } }
 * This is correct and scalable — the earlier `users -> sharesOwned -> filter`
 * version required scanning every user on the entire protocol client-side,
 * which doesn't work for pools with many LPs. This gets exactly the LPs
 * in one pool, directly, in one call.
 */
function balancerToBalancesUSD(poolResponse) {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const pool = poolResponse.pool;
  const totalShares = Number(pool.totalShares);
  const totalLiquidityUSD = Number(pool.totalLiquidity);

  if (totalShares === 0) return [];

  return pool.shares
    .filter(s => s.userAddress.id !== ZERO_ADDRESS)
    .map(s => (Number(s.balance) / totalShares) * totalLiquidityUSD)
    .filter(v => v > 0);
}

/**
 * Curve — deposits AND withdraws (both confirmed working queries).
 * Net position per address = sum(deposits in USD) - sum(withdraws in USD),
 * with each inputTokenAmounts entry converted via the price table
 * (needs each pool's token addresses in order — add a `pool { inputTokens { id } }`
 * field to your query so you know which address each array index refers to).
 *
 * poolsToExclude: corrupted pools to skip (e.g. the y-pool — 10^32-scale garbage amounts).
 */
/**
 * IMPORTANT GOTCHA (found while testing): the order of values in
 * inputTokenAmounts does NOT necessarily match the order tokens are listed
 * in the pool's `inputTokens` metadata field. Curve's tricrypto-style pools
 * order coins as [stablecoin, BTC-variant, ETH-variant] by on-chain
 * convention, regardless of how Messari lists inputTokens. Getting this
 * wrong produces silently absurd numbers (quadrillions of dollars) rather
 * than a clean error — always sanity-check a NEW pool's token ordering
 * against a real transaction's magnitudes before trusting it.
 * Confirmed for TricryptoGHO: [GHO, cbBTC, WETH], not [GHO, WETH, cbBTC].
 */
function curveToBalancesUSD(depositsResponse, withdrawsResponse, poolTokenAddresses, poolsToExclude = []) {
  const netByAddress = {};

  const sumToUSD = (amounts, tokenAddresses) =>
    amounts.reduce((sum, amt, i) => sum + rawAmountToUSD(amt, tokenAddresses[i]), 0);

  for (const d of depositsResponse.deposits) {
    if (poolsToExclude.includes(d.pool.id)) continue;
    const tokenAddrs = poolTokenAddresses[d.pool.id];
    if (!tokenAddrs) { console.warn(`No token address list for pool ${d.pool.id}`); continue; }
    netByAddress[d.from] = (netByAddress[d.from] || 0) + sumToUSD(d.inputTokenAmounts, tokenAddrs);
  }

  for (const w of (withdrawsResponse?.withdraws || [])) {
    if (poolsToExclude.includes(w.pool.id)) continue;
    const tokenAddrs = poolTokenAddresses[w.pool.id];
    if (!tokenAddrs) continue;
    netByAddress[w.from] = (netByAddress[w.from] || 0) - sumToUSD(w.inputTokenAmounts, tokenAddrs);
  }

  return Object.values(netByAddress).filter(v => v > 0);
}

/**
 * CURVE PAGINATION — needed because deposits/withdraws are event logs,
 * not live balances. A single `first: 1000` call only gets the 1000 MOST
 * RECENT events, which understates concentration for long-term LPs whose
 * activity is older than that. This loops backward through time using a
 * `timestamp_lt` cursor (avoids The Graph's ~5000 row `skip` offset limit)
 * until either the pool's full history is retrieved or maxPages is hit.
 *
 * gatewayUrl: e.g. `https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>`
 * poolId: the pool's contract address (lowercase)
 * eventType: 'deposits' or 'withdraws'
 * maxPages: safety cap — each page is up to 1000 events, so 20 pages = up to
 *   20,000 events. Raise this only if you confirm the pool needs more history;
 *   most single pools won't have anywhere near this many LP events.
 */
async function fetchAllCurveEvents(gatewayUrl, poolId, eventType, maxPages = 20) {
  const allEvents = [];
  let cursor = null; // timestamp to page backward from; null = start at most recent
  let page = 0;

  while (page < maxPages) {
    const whereClause = cursor
      ? `where: { pool: "${poolId}", timestamp_lt: "${cursor}" }`
      : `where: { pool: "${poolId}" }`;

    const query = `{
      ${eventType}(first: 1000, ${whereClause}, orderBy: timestamp, orderDirection: desc) {
        from
        inputTokenAmounts
        timestamp
        pool { id }
      }
    }`;

    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) throw new Error(`Curve ${eventType} page ${page} failed: ${response.status}`);
    const json = await response.json();
    const events = json.data?.[eventType] || [];

    allEvents.push(...events);
    page++;

    if (events.length < 1000) break; // fewer than a full page = reached the end of history
    cursor = events[events.length - 1].timestamp; // page backward from the oldest event just fetched
  }

  return { [eventType]: allEvents, pagesUsed: page, complete: page < maxPages };
}

/**
 * Convenience wrapper: fetches BOTH deposits and withdraws for a Curve pool
 * with full pagination, ready to feed straight into curveToBalancesUSD.
 */
async function fetchFullCurveHistory(gatewayUrl, poolId, maxPages = 20) {
  const [depositsResult, withdrawsResult] = await Promise.all([
    fetchAllCurveEvents(gatewayUrl, poolId, 'deposits', maxPages),
    fetchAllCurveEvents(gatewayUrl, poolId, 'withdraws', maxPages),
  ]);

  if (!depositsResult.complete || !withdrawsResult.complete) {
    console.warn(`Curve history may be incomplete — hit maxPages (${maxPages}) cap. Raise maxPages if this pool has very high LP activity.`);
  }

  return {
    deposits: depositsResult,
    withdraws: withdrawsResult,
    complete: depositsResult.complete && withdrawsResult.complete,
  };
}

// ============================================================
// EXAMPLE USAGE (fill in once pools + TOKEN_PRICE_TABLE are set)
// ============================================================

// const uniHHI = computeHHI(uniswapV3ToBalancesUSD(uniswapQueryResult, currentPoolTick));
// const balancerHHI = computeHHI(balancerToBalancesUSD(balancerQueryResult));
// const { deposits, withdraws } = await fetchFullCurveHistory(gatewayUrl, '0xPOOL_ID');
// const curveHHI = computeHHI(curveToBalancesUSD(
//   deposits, withdraws,
//   { '0xPOOL_ID': ['0xtoken0addr', '0xtoken1addr', ...] },
//   ['0xYPOOL_ADDRESS_TO_EXCLUDE']
// ));

module.exports = {
  computeHHI,
  normalizedHHI,
  estimateSlippage,
  slippageCurve,
  TOKEN_PRICE_TABLE,
  rawAmountToUSD,
  refreshLivePrices,
  uniswapV3ToBalancesUSD,
  balancerToBalancesUSD,
  curveToBalancesUSD,
  fetchAllCurveEvents,
  fetchFullCurveHistory,
};