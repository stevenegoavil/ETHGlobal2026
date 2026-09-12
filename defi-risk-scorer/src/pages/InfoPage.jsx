// src/pages/InfoPage.jsx
import { Link } from 'react-router-dom';

export default function InfoPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-serif text-foreground">Why these numbers matter</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The math behind the risk report, and why it's worth reading before you deposit.
        </p>
      </header>

      <div className="flex items-center justify-between mb-10 pb-4 border-b">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Ethereum mainnet for LP concentration.</span>{' '}
          Ethereum, Arbitrum, and Optimism for cross-chain fragmentation.
        </p>
        <Link
          to="/"
          className="text-xs font-medium text-primary underline decoration-primary/40 hover:decoration-primary transition-colors"
        >
          ← Back to report
        </Link>
      </div>

      <section className="mb-10">
        <h2 className="text-xl font-serif mb-3">Concentration: who really owns this pool</h2>
        <p className="text-sm leading-relaxed mb-3">
          A liquidity pool with a thousand small depositors behaves very
          differently from one where a single address holds almost everything.
          In a concentrated pool, one large withdrawal can shift the price
          sharply, drain the pool's depth, or signal that the "market" for a
          token is really just one or two wallets. Depositing into a pool
          without knowing this is depositing blind.
        </p>
        <p className="text-sm leading-relaxed mb-3">
          This report measures concentration using the{' '}
          <strong>Herfindahl-Hirschman Index (HHI)</strong> — a standard
          economics tool for measuring how concentrated ownership or market
          share is across any group of holders. It's the sum of every
          holder's share of the pool, squared:
        </p>
        <p className="font-mono text-sm bg-card border rounded px-4 py-3 mb-3">
          HHI = &Sigma; (share<sub>i</sub>)&sup2;
        </p>
        <p className="text-sm leading-relaxed mb-3">
          The score always lands between 0 (perfectly spread out) and 1 (one
          holder owns everything). <code className="font-mono text-xs">1 / HHI</code>{' '}
          translates that into something easier to picture — an "equivalent
          number of equal-sized holders." An HHI of 0.5, for example, behaves
          like the pool is split between two people, even if ten addresses
          technically hold a balance.
        </p>
        <p className="text-sm">
          Further reading:{' '}
          <a
            className="underline text-blue-600 hover:text-blue-700"
            href="https://en.wikipedia.org/wiki/Herfindahl%E2%80%93Hirschman_Index"
            target="_blank"
            rel="noopener noreferrer"
          >
            Herfindahl-Hirschman Index — Wikipedia
          </a>
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-serif mb-3">Fragmentation: how thin is liquidity, really</h2>
        <p className="text-sm leading-relaxed mb-3">
          The same trading pair often exists as separate pools on many
          different chains — mainnet, Arbitrum, Optimism, Base, and others.
          If nearly all the real liquidity sits on one chain and the rest are
          thin, trading on those thinner chains costs more (worse slippage)
          and can be far less reliable during volatile moments, even though
          the token "exists" everywhere.
        </p>
        <p className="text-sm leading-relaxed mb-3">
          This factor reuses the same HHI formula above, applied to a
          different input: instead of scoring how liquidity splits across{' '}
          <em>addresses</em> within one pool, it scores how liquidity splits
          across <em>chains</em> for the same pair. A high fragmentation score
          means most of the real depth is concentrated on one chain — worth
          knowing before assuming a smaller chain's version of a pool is just
          as safe to trade against.
        </p>
        <p className="text-sm leading-relaxed mb-3">
          This factor is live for one pair right now:{' '}
          <strong>USDC/WETH on Uniswap v3</strong>, compared across Ethereum
          mainnet, Arbitrum, and Optimism — see the "Cross-chain" tab on the
          report. Curve and Balancer show up there too, greyed out, on
          purpose: the idea applies to any protocol, but each one organizes
          its per-chain subgraphs differently, and finding the equivalent
          pool for the same pair on each chain has to be verified by hand,
          the same way each pool's token ordering does elsewhere in this
          tool. Uniswap's deployments are the most directly comparable
          across chains, which is why it came first. The underlying
          price-impact math it relates to is the same constant-product
          formula automated market makers use to price every trade:
        </p>
        <p className="text-sm">
          Further reading:{' '}
          <a
            className="underline text-blue-600 hover:text-blue-700"
            href="https://en.wikipedia.org/wiki/Automated_market_maker"
            target="_blank"
            rel="noopener noreferrer"
          >
            Automated market maker — Wikipedia
          </a>{' '}
          ·{' '}
          <a
            className="underline text-blue-600 hover:text-blue-700"
            href="https://en.wikipedia.org/wiki/Market_liquidity"
            target="_blank"
            rel="noopener noreferrer"
          >
            Market liquidity — Wikipedia
          </a>
        </p>
      </section>

      <section className="mb-4">
        <h2 className="text-xl font-serif mb-3">In short</h2>
        <p className="text-sm leading-relaxed mb-3">
          Neither score tells you whether a pool is a good or bad investment
          on its own. They tell you something narrower and more useful:
          how exposed you'd be to a single actor's behavior, and how real
          the liquidity actually is once you look past the total-value-locked
          number. Both are the kind of thing worth checking before moving
          real funds — not after.
        </p>
        <p className="text-xs text-muted-foreground">
          This tool provides informational risk metrics only. It is not
          financial advice.
        </p>
      </section>
    </div>
  );
}