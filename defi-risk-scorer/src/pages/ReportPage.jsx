// src/pages/ReportPage.jsx
import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useIsLoggedIn, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getRiskLevel, equivalentHolders, RISK_COLORS } from '@/lib/risk-ui';

const PROTOCOL_LABELS = {
  uniswap: 'Uniswap v3',
  curve: 'Curve',
  balancer: 'Balancer v2',
};

// Example pool addresses shown to the user so they can try the tool
// themselves — deliberately not auto-loaded, so using it feels like
// operating a real tool rather than watching a canned demo.
const EXAMPLE_POOLS = {
  uniswap: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  balancer: '0xc8398feef7aa2a8638473ca6569af217448d080a0002000000000000000006f5',
};

// Where to find a different pool address to try, per protocol — verified
// live URLs, not guessed. Uniswap's page even lists the exact demo pool
// above as a real listing.
// The real, tested query for finding a pool address via The Graph Explorer
// itself — same subgraph this tool already queries under the hood, and the
// same technique used to verify every pool in this project's data (see
// analysis-README.md). Balancer's is filtered to skip dust/test pools —
// the same "DO NOT USE - Mock Linear Pool" issue caught earlier this week.
const FIND_POOL_QUERY = {
  uniswap: {
    subgraphName: 'Uniswap V3 Mainnet',
    query: `{
  pools(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id
    token0 { symbol }
    token1 { symbol }
  }
}`,
    fieldName: 'pools',
  },
  balancer: {
    subgraphName: 'Balancer V2',
    query: `{
  pools(first: 5, orderBy: totalLiquidity, orderDirection: desc, where: { totalLiquidity_gt: "1000" }) {
    id
    poolType
  }
}`,
    fieldName: 'pools',
  },
};

function AIExplanation({ report, riskLabel }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setExplanation(null);
    fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: report.protocol,
        pair: report.pair,
        hhi: report.hhi,
        lpCount: report.lpCount,
        whale: report.whale,
        riskLabel,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.explanation) setExplanation(data.explanation);
      })
      .catch(() => {}) // this is an enhancement, not core functionality — fail silently
      .finally(() => setLoading(false));
  }, [report, riskLabel]);

  if (loading) {
    return <p className="text-xs text-muted-foreground italic mt-2">Generating AI analysis...</p>;
  }
  if (!explanation) return null;

  return (
    <p className="text-xs mt-2 pt-2 border-t border-current/10">
      <span className="font-medium">AI analysis:</span> {explanation}
    </p>
  );
}

function RiskBand({ hhi, lpCount, report }) {
  const risk = getRiskLevel(hhi, lpCount);
  const colors = RISK_COLORS[risk.level];

  return (
    <div
      className="mb-6 px-5 py-4"
      style={{ borderLeft: `4px solid ${colors.border}`, background: colors.bg }}
    >
      <p className="text-lg font-medium" style={{ color: colors.text }}>
        {risk.label}
      </p>
      {risk.level === 'inactive' ? (
        <p className="text-sm mt-1">
          No liquidity providers are currently active in this pool's price
          range. There's no real market depth here right now — concentration
          can't be meaningfully measured, and whoever deposits next would
          instantly own the entire active pool.
        </p>
      ) : (
        <>
          <p className="text-sm mt-1">
            This pool behaves like it's owned by about {equivalentHolders(hhi)} equal-sized people.
          </p>
          <AIExplanation report={report} riskLabel={risk.label} />
        </>
      )}
    </div>
  );
}

function DataRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm text-right break-all max-w-[60%] ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
function FragmentationAIExplanation({ fragmentation }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setExplanation(null);

    fetch('/api/explain-fragmentation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pair: 'USDC/WETH',
        hhi: fragmentation.hhi,
        maxShare: Math.max(...fragmentation.breakdown.map(c => c.sharePercent)),
        topChain: fragmentation.breakdown[0].chain,
        chains: fragmentation.breakdown.map(c => ({
          name: c.chain,
          sharePercent: c.sharePercent,
          tvlUSD: c.tvlUSD,
        })),
      }),
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => { if (data.explanation) setExplanation(data.explanation); })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [fragmentation]);

  if (loading) {
    return <p className="text-xs text-muted-foreground italic mt-3 pt-3 border-t">Generating AI analysis...</p>;
  }
  if (!explanation) return null;

  return (
    <p className="text-xs mt-3 pt-3 border-t">
      <span className="font-medium">AI analysis:</span> {explanation}
    </p>
  );
}
function ProtocolReport({ protocol }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [poolInput, setPoolInput] = useState('');

  const canUseCustomPool = protocol !== 'curve';
  const exampleAddress = EXAMPLE_POOLS[protocol];

  const fetchReport = useCallback(async (poolOverride) => {
    setLoading(true);
    setError(null);
    try {
      const url = poolOverride
        ? `/api/pool-risk?protocol=${protocol}&pool=${poolOverride}`
        : `/api/pool-risk?protocol=${protocol}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setReport(data);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  const handleAnalyze = (e) => {
    e.preventDefault();
    if (canUseCustomPool && poolInput.trim()) {
      fetchReport(poolInput.trim());
    } else if (!canUseCustomPool) {
      fetchReport();
    }
  };

  return (
    <div>
      {canUseCustomPool ? (
        <form onSubmit={handleAnalyze} className="mb-6">
          <p className="text-xs text-muted-foreground mb-2">
            Try this pool: <span className="font-mono select-all">{exampleAddress}</span>
            {' '}— paste it below, or find your own using The Graph Explorer.
          </p>
          <details className="mb-4 text-xs">
            <summary className="cursor-pointer text-black-600 hover:text-black-700 underline">
              How do I find a different pool address?
            </summary>
            <div className="mt-2 pl-3 border-l-2 space-y-2 text-muted-foreground">
              <p>
                1. Go to{' '}
                <a
                  href="https://thegraph.com/explorer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  thegraph.com/explorer
                </a>{' '}
                and search "{FIND_POOL_QUERY[protocol].subgraphName}"
              </p>
              <p>2. Click into the result, paste this into the query box, and run it:</p>
              <pre className="bg-card border rounded p-2 font-mono text-[11px] overflow-x-auto whitespace-pre">
                {FIND_POOL_QUERY[protocol].query}
              </pre>
              <p>
                3. Copy an <code className="font-mono">"id"</code> value from the{' '}
                <code className="font-mono">{FIND_POOL_QUERY[protocol].fieldName}</code> results
                (not from any other field) and paste it below.
              </p>
            </div>
          </details>
          <div className="flex gap-2">
            <input
              type="text"
              value={poolInput}
              onChange={(e) => setPoolInput(e.target.value)}
              placeholder={`Paste a ${PROTOCOL_LABELS[protocol]} pool address to analyze`}
              className="flex-1 text-sm px-3 py-2 border rounded font-mono"
            />
            <button
              type="submit"
              className="text-sm px-4 py-2 border rounded font-medium hover:bg-accent shrink-0"
            >
              Analyze
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-2 italic">
            Custom pool input isn't available for Curve yet — token ordering must be
            manually verified per pool. See the info page for why.
          </p>
          <button
            onClick={handleAnalyze}
            className="text-sm px-4 py-2 border rounded font-medium hover:bg-accent"
          >
            Load TricryptoGHO report
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading live data...</p>}

      {error && (
        <Card className="mb-6 border-red-300">
          <CardContent className="pt-6">
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {report && !loading && (
        <>
          <RiskBand hhi={report.hhi} lpCount={report.lpCount} report={report} />

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{report.protocol}</CardTitle>
                {report.isCustomPool && <Badge variant="secondary">Custom pool</Badge>}
              </div>
              <CardDescription>{report.pair}</CardDescription>
            </CardHeader>
            <CardContent>
              <DataRow label="Pool address" value={report.address} mono />
              <DataRow label="Concentration (HHI)" value={report.hhi.toFixed(3)} mono />
              <DataRow label="Liquidity providers counted" value={report.lpNote} />
              {report.whale && (
                <DataRow label="Dominant holder" value={report.whale} mono />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function FragmentationSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const loadData = () => {
    setLoading(true);
    setError(null);
    fetch('/api/fragmentation')
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
        setLoaded(true);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  const maxShare = data ? Math.max(...data.breakdown.map(c => c.sharePercent)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cross-chain liquidity fragmentation</CardTitle>
        <CardDescription>USDC / WETH · Uniswap v3 · Ethereum, Arbitrum, Optimism</CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded && !loading && (
          <button
            onClick={loadData}
            className="text-sm px-4 py-2 border rounded font-medium hover:bg-accent"
          >
            Load fragmentation report
          </button>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading live data...</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

{data && (
  <>
    <p className="text-sm mb-4">
      HHI: <span className="font-mono">{data.hhi.toFixed(3)}</span> — the most
      concentrated chain holds{' '}
      <span className="font-mono">{maxShare.toFixed(1)}%</span> of this pair's
      total tracked liquidity.
    </p>
    <div className="space-y-3">
      {data.breakdown.map((c) => (
        <div key={c.chain}>
          <div className="flex justify-between text-sm mb-1">
            <span>{c.chain}</span>
            <span className="font-mono text-muted-foreground">
              {c.sharePercent.toFixed(1)}% · ${(c.tvlUSD / 1_000_000).toFixed(1)}M
            </span>
          </div>
          <div className="h-2 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-foreground/70 rounded"
              style={{ width: `${c.sharePercent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
    <FragmentationAIExplanation fragmentation={data} />
  </>
)}
      </CardContent>
    </Card>
  );
}

export default function ReportPage() {
  const isLoggedIn = useIsLoggedIn();

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-serif text-foreground">SKNYDipping</h1>
        <p className="text-xs uppercase tracking-wide text-muted-foreground -mt-1 mb-3">Risk Pool</p>
        <p className="text-sm leading-relaxed">
          Analyzing risk in the blockchain market. Using The Graph's live
          on-chain data, this tool scores two distinct kinds of DeFi risk:
          how concentrated a pool's ownership is, and how fragmented a
          token's liquidity is across chains.
        </p>
      </header>

      <div className="flex items-center justify-between mb-8 pb-4 border-b">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Ethereum mainnet for LP concentration.</span>{' '}
          Ethereum, Arbitrum, and Optimism for cross-chain fragmentation.
        </p>
        <Link
          to="/info"
          className="text-xs font-medium text-primary underline decoration-primary/40 hover:decoration-primary transition-colors"
        >
          Why these numbers matter →
        </Link>
      </div>

      {!isLoggedIn ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect a wallet to continue</CardTitle>
            <CardDescription>
              This tool requires a connected wallet to use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DynamicWidget />
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="concentration">
          <TabsList className="mb-6">
            <TabsTrigger value="concentration">Concentration</TabsTrigger>
            <TabsTrigger value="fragmentation">Fragmentation</TabsTrigger>
          </TabsList>

          <TabsContent value="concentration">
            <Tabs defaultValue="uniswap">
              <TabsList className="mb-6">
                <TabsTrigger value="uniswap">Uniswap v3</TabsTrigger>
                <TabsTrigger value="curve">Curve</TabsTrigger>
                <TabsTrigger value="balancer">Balancer v2</TabsTrigger>
              </TabsList>

              <TabsContent value="uniswap"><ProtocolReport protocol="uniswap" /></TabsContent>
              <TabsContent value="curve"><ProtocolReport protocol="curve" /></TabsContent>
              <TabsContent value="balancer"><ProtocolReport protocol="balancer" /></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="fragmentation">
            <Tabs defaultValue="uniswap">
              <TabsList className="mb-6">
                <TabsTrigger value="uniswap">Uniswap v3</TabsTrigger>
                <TabsTrigger value="curve" disabled>Curve</TabsTrigger>
                <TabsTrigger value="balancer" disabled>Balancer v2</TabsTrigger>
              </TabsList>

              <TabsContent value="uniswap">
                <FragmentationSection />
              </TabsContent>
              <TabsContent value="curve">
                <p className="text-sm text-muted-foreground italic">
                  Fragmentation isn't available for Curve yet — see the info page for why.
                </p>
              </TabsContent>
              <TabsContent value="balancer">
                <p className="text-sm text-muted-foreground italic">
                  Fragmentation isn't available for Balancer yet — see the info page for why.
                </p>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      )}

      <footer className="mt-12 pt-6 border-t text-xs text-muted-foreground">
        Concentration data verified live against on-chain subgraphs via The Graph.
      </footer>
    </div>
  );
}