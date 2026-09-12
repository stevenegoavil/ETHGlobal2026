// Real, verified results from live queries against The Graph — see analysis-README.md
// for how each number was derived and the bugs caught along the way.
const POOLS = {
  uniswap: {
    protocol: 'Uniswap v3',
    pair: 'USDC / WETH · 0.05% fee',
    address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    hhi: 0.331,
    lpCount: 41,
    lpNote: '41 in-range positions, of 100 pulled',
    methodNote: 'Positions outside the pool\u2019s current price range are excluded \u2014 they aren\u2019t providing liquidity right now, even though they still exist on-chain.',
  },
  curve: {
    protocol: 'Curve Finance',
    pair: 'TricryptoGHO · GHO / cbBTC / WETH',
    address: '0x8a4f252812dff2a8636e4f7eb249d8fc2e3bd77f',
    hhi: 0.614,
    lpCount: 57,
    lpNote: '57 net-positive addresses, from full deposit/withdrawal history',
    methodNote: 'Curve doesn\u2019t expose a live balance field. Each address\u2019s position is reconstructed from every deposit and withdrawal the pool has ever recorded.',
  },
  balancer: {
    protocol: 'Balancer v2',
    pair: 'GyroE pool',
    address: '0xc8398feef7aa2a8638473ca6569af217448d080a0002000000000000000006f5',
    hhi: 1.000,
    lpCount: 1,
    lpNote: '1 active holder, of 3 addresses that have ever held a share',
    methodNote: 'Address 0x78ecf975...19f6219 holds effectively the entire pool. The other two addresses on record hold dust or zero balance.',
    whale: '0x78ecf97572c3890ed02221a611014f30219f6219',
  },
};

function getRiskLevel(hhi) {
  if (hhi < 0.15) return { level: 'low', label: 'Low concentration risk' };
  if (hhi < 0.35) return { level: 'moderate', label: 'Moderate concentration risk' };
  return { level: 'high', label: 'High concentration risk' };
}

function equivalentHolders(hhi) {
  return (1 / hhi).toFixed(1);
}

function renderReport(poolKey) {
  const pool = POOLS[poolKey];
  const risk = getRiskLevel(pool.hhi);
  const holders = equivalentHolders(pool.hhi);

  const report = document.getElementById('report');
  report.innerHTML = `
    <div class="risk-band ${risk.level}">
      <p class="risk-label ${risk.level} font-medium text-lg">${risk.label}</p>
      <p class="text-sm mt-1">
        This pool behaves like it's owned by about ${holders} equal-sized people.
      </p>
    </div>

    <section class="mb-8">
      <h2 class="font-serif text-xl mb-1">${pool.protocol}</h2>
      <p class="text-muted text-sm mb-4">${pool.pair}</p>

      <div class="data-row">
        <span class="text-muted text-sm">Pool address</span>
        <span class="font-mono text-sm">${pool.address}</span>
      </div>
      <div class="data-row">
        <span class="text-muted text-sm">Concentration (HHI)</span>
        <span class="font-mono text-sm">${pool.hhi.toFixed(3)}</span>
      </div>
      <div class="data-row">
        <span class="text-muted text-sm">Liquidity providers counted</span>
        <span class="font-mono text-sm">${pool.lpNote}</span>
      </div>
      ${pool.whale ? `
      <div class="data-row">
        <span class="text-muted text-sm">Dominant holder</span>
        <span class="font-mono text-sm">${pool.whale}</span>
      </div>` : ''}
      <div class="data-row">
        <span class="text-muted text-sm">Cross-chain fragmentation</span>
        <span class="text-sm text-muted italic">Not yet built</span>
      </div>
    </section>

    <p class="text-sm text-muted leading-relaxed">${pool.methodNote}</p>
  `;
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.setAttribute('aria-selected', 'false'));
    btn.setAttribute('aria-selected', 'true');
    renderReport(btn.dataset.pool);
  });
});

// Initial render
renderReport('uniswap');