// Run locally: GRAPH_API_KEY=your_new_key node test-live.js
// Requires Node 18+ (built-in fetch) and risk-formulas.js in the same folder.

const {
  computeHHI,
  uniswapV3ToBalancesUSD,
  balancerToBalancesUSD,
  fetchFullCurveHistory,
  curveToBalancesUSD,
} = require('./risk-formulas.js');

const API_KEY = process.env.GRAPH_API_KEY;
if (!API_KEY) {
  console.error('Set GRAPH_API_KEY as an environment variable before running.');
  console.error('Example: GRAPH_API_KEY=your_key node test-live.js');
  process.exit(1);
}

const BASE = `https://gateway.thegraph.com/api/${API_KEY}/subgraphs/id`;

const SUBGRAPHS = {
  uniswap: `${BASE}/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`,
  curve:   `${BASE}/3fy93eAT56UJsRCEht8iFhfi6wjHWXtZ9dnnbQmvFopF`,
  balancer:`${BASE}/C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV`,
};

const POOLS = {
  uniswap: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',   // USDC/WETH 0.05%
  curve:   '0x8a4f252812dff2a8636e4f7eb249d8fc2e3bd77f',   // TricryptoGHO
  balancer:'0xc8398feef7aa2a8638473ca6569af217448d080a0002000000000000000006f5', // GyroE pool
};

const CURVE_TOKEN_ORDER = [
  '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f', // GHO
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
];

async function gqlQuery(url, query) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function testUniswap() {
  console.log('\n=== UNISWAP V3 (USDC/WETH 0.05%) ===');
  const query = `{
    pool(id: "${POOLS.uniswap}") {
      tick
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
    positions(first: 100, where: { pool: "${POOLS.uniswap}" }, orderBy: liquidity, orderDirection: desc) {
      id owner liquidity
      tickLower { tickIdx }
      tickUpper { tickIdx }
      depositedToken0
      depositedToken1
    }
  }`;
  const data = await gqlQuery(SUBGRAPHS.uniswap, query);
  const currentTick = Number(data.pool.tick);
  const balances = uniswapV3ToBalancesUSD(data, currentTick);
  console.log('Positions pulled:', data.positions.length, '| In-range:', balances.length);
  console.log('Total active liquidity: $' + balances.reduce((a,b)=>a+b,0).toLocaleString(undefined,{maximumFractionDigits:0}));
  console.log('HHI:', computeHHI(balances).toFixed(4));
}

async function testBalancer() {
  console.log('\n=== BALANCER V2 (GyroE pool) ===');
  const query = `{
    pool(id: "${POOLS.balancer}") {
      totalShares
      totalLiquidity
      shares(first: 100, orderBy: balance, orderDirection: desc) {
        userAddress { id }
        balance
      }
    }
  }`;
  const data = await gqlQuery(SUBGRAPHS.balancer, query);
  const balances = balancerToBalancesUSD(data);
  console.log('Shares pulled:', data.pool.shares.length, '| Nonzero LPs:', balances.length);
  console.log('Total: $' + balances.reduce((a,b)=>a+b,0).toLocaleString(undefined,{maximumFractionDigits:0}));
  console.log('HHI:', computeHHI(balances).toFixed(4));
}

async function testCurve() {
  console.log('\n=== CURVE (TricryptoGHO) — paginated full history ===');
  const { deposits, withdraws, complete } = await fetchFullCurveHistory(SUBGRAPHS.curve, POOLS.curve, 20);
  console.log('Deposits pulled:', deposits.deposits.length, '(pages:', deposits.pagesUsed + ')');
  console.log('Withdraws pulled:', withdraws.withdraws.length, '(pages:', withdraws.pagesUsed + ')');
  console.log('Full history captured:', complete);

  const balances = curveToBalancesUSD(
    deposits, withdraws,
    { [POOLS.curve]: CURVE_TOKEN_ORDER },
    [] // no corrupted pools to exclude — already scoped to TricryptoGHO only
  );
  console.log('Net positive LPs:', balances.length);
  console.log('Total net: $' + balances.reduce((a,b)=>a+b,0).toLocaleString(undefined,{maximumFractionDigits:0}));
  console.log('HHI:', computeHHI(balances).toFixed(4));
}

(async () => {
  try {
    await testUniswap();
    await testBalancer();
    await testCurve();
    console.log('\n✅ All three protocols ran successfully.');
  } catch (err) {
    console.error('\n❌ Failed:', err.message);
    process.exit(1);
  }
})();