import type { ReactNode } from 'react';

/** Sticky translucent iOS nav bar. Small title fades in once the large title scrolls away. */
export function NavBar({ title, collapsed, leading, trailing }: { title: ReactNode; collapsed: boolean; leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className={`nav-bar${collapsed ? ' collapsed' : ''}`}>
      <div className="nav-bar-inner">
        <div className="nav-bar-leading">{leading}</div>
        <div className="nav-bar-title" aria-hidden={!collapsed}>{title}</div>
        <div className="nav-bar-trailing">{trailing}</div>
      </div>
    </div>
  );
}
