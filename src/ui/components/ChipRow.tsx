import type { ReactNode } from 'react';

/** Horizontally scrolling row of chips. */
export function ChipRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="chip-row-wrap">
      {label && <div className="chip-row-label">{label}</div>}
      <div className="chip-row">{children}</div>
    </div>
  );
}
