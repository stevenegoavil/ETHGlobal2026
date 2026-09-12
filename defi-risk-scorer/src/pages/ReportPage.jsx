// src/pages/ReportPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getRiskLevel, equivalentHolders, RISK_COLORS } from '@/lib/risk-ui';

const PROTOCOL_LABELS = {
  uniswap: 'Uniswap v3',
  curve: 'Curve',
  balancer: 'Balancer v2',
};

function RiskBand({ hhi }) {
  const risk = getRiskLevel(hhi);
  const colors = RISK_COLORS[risk.level];
  const holders = equivalentHolders(hhi);

  return (
    <div
      className="mb-6 px-5 py-4"
      style={{ borderLeft: `4px solid ${colors.border}`, background: colors.bg }}
    >
      <p className="text-lg font-medium" style={{ color: colors.text }}>
        {risk.label}
      </p>
      <p className="text-sm mt-1">
        This pool behaves like it's owned by about {holders} equal-sized people.
      </p>
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

function ProtocolReport({ protocol }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customPool, setCustomPool] = useState('');

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

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleAnalyzeCustom = (e) => {
    e.preventDefault();
    if (customPool.trim()) fetchReport(customPool.trim());
  };

  const canUseCustomPool = protocol !== 'curve';

  return (
    <div>
      {canUseCustomPool && (
        <form onSubmit={handleAnalyzeCustom} className="flex gap-2 mb-6">
          <input
            type="text"
            value={customPool}
            onChange={(e) => setCustomPool(e.target.value)}
            placeholder={`Paste a ${PROTOCOL_LABELS[protocol]} pool address to analyze it instead`}
            className="flex-1 text-sm px-3 py-2 border rounded font-mono"
          />
          <button
            type="submit"
            className="text-sm px-4 py-2 border rounded font-medium hover:bg-accent"
          >
            Analyze
          </button>
        </form>
      )}

      {!canUseCustomPool && (
        <p className="text-xs text-muted-foreground mb-6 italic">
          Custom pool input isn't available for Curve yet — token ordering must be
          manually verified per pool. See the info page for why.
        </p>
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
          <RiskBand hhi={report.hhi} />

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
              <DataRow
                label="Cross-chain fragmentation"
                value={<span className="italic text-muted-foreground">Not yet built</span>}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ReportPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-serif text-foreground">DeFi pool risk report</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Live liquidity-provider concentration, scored from on-chain data via The Graph.
        </p>
      </header>

      <div className="flex items-center justify-between mb-8 pb-4 border-b">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Ethereum mainnet only.</span>{' '}
          Other chains are not covered by this tool.
        </p>
        <Link
          to="/info"
          className="text-xs font-medium text-primary underline decoration-primary/40 hover:decoration-primary transition-colors"
        >
          Why these numbers matter →
        </Link>
      </div>

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

      <footer className="mt-12 pt-6 border-t text-xs text-muted-foreground">
        Concentration data verified live against on-chain subgraphs via The Graph.
      </footer>
    </div>
  );
}