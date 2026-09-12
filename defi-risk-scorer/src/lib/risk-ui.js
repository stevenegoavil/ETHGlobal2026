// src/lib/risk-ui.js
// Same thresholds established in analysis-README.md — kept as one
// source of truth so the label is never manually mismatched to the HHI again.

export function getRiskLevel(hhi) {
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
};