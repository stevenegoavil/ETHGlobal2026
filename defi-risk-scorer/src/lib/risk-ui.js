// src/lib/risk-ui.js
// Same thresholds established in analysis-README.md — kept as one
// source of truth so the label is never manually mismatched to the HHI again.

// IMPORTANT: an HHI of 0 has two totally different real-world meanings that
// look identical as a number:
//   1. Liquidity is spread across many holders (genuinely low concentration)
//   2. There is NO active liquidity at all (lpCount === 0) — the formula
//      returns 0 for an empty set, but this is not "safe," it's undefined —
//      whoever deposits next would instantly own the whole pool.
// Always check lpCount === 0 FIRST and treat it as its own state, never as
// "low risk." Caught via real testing on a WETH/NIGHT pool with 0 in-range
// positions, which without this check displayed "Low concentration risk"
// and "owned by about Infinity people" — both wrong.

export function getRiskLevel(hhi, lpCount) {
  if (lpCount === 0) {
    return { level: 'inactive', label: 'No active liquidity' };
  }
  if (hhi < 0.15) return { level: 'low', label: 'Low concentration risk' };
  if (hhi < 0.35) return { level: 'moderate', label: 'Moderate concentration risk' };
  return { level: 'high', label: 'High concentration risk' };
}

export function equivalentHolders(hhi) {
  return (1 / hhi).toFixed(1);
}

// WCAG-AA-checked colors from the vanilla prototype (styles.css) — kept as
// exact hex so the contrast math already verified still holds here.
export const RISK_COLORS = {
  low: { text: '#2F7A4D', border: '#2F7A4D', bg: 'rgba(47, 122, 77, 0.06)' },
  moderate: { text: '#96681A', border: '#96681A', bg: 'rgba(150, 104, 26, 0.07)' },
  high: { text: '#B23A34', border: '#B23A34', bg: 'rgba(178, 58, 52, 0.06)' },
  // Reuses the "high" red visually — this deserves the same attention —
  // but the copy in RiskBand must never claim "concentration is high" here,
  // since concentration genuinely isn't measurable with zero active LPs.
  inactive: { text: '#B23A34', border: '#B23A34', bg: 'rgba(178, 58, 52, 0.06)' },
};