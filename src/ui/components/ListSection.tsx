import type { ReactNode } from 'react';

/** iOS inset-grouped list section. */
export function ListSection({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="list-section">
      {header && <div className="list-header">{header}</div>}
      <div className="list-group">{children}</div>
      {footer && <div className="list-footer">{footer}</div>}
    </div>
  );
}
