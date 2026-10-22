import type { ReactNode } from 'react';

/** A row of small labelled numbers shown above a chart. */
export function MetricRow({ items }: { items: { label: string; value: ReactNode; accent?: string }[] }) {
  return (
    <div className="metric-row">
      {items.map((m) => (
        <div key={m.label} className="metric">
          <div className="metric-value" style={m.accent ? { color: m.accent } : undefined}>{m.value}</div>
          <div className="metric-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
}
