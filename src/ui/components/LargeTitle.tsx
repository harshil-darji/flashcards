import type { ReactNode } from 'react';

export function LargeTitle({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <header className="large-title-header">
      <h1 className="large-title">{children}</h1>
      {trailing && <div className="large-title-trailing">{trailing}</div>}
    </header>
  );
}
