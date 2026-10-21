import { TABS, type TabId } from '../tabs';
import { Icon } from './Icon';

export function TabBar({ active, onChange, badge }: { active: TabId; onChange: (t: TabId) => void; badge?: Partial<Record<TabId, number>> }) {
  return (
    <nav className="tab-bar" role="tablist">
      {TABS.map((t) => {
        const n = badge?.[t.id] ?? 0;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={`tab-bar-item${active === t.id ? ' active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <span className="tab-bar-icon">
              <Icon name={t.icon} size={26} strokeWidth={1.8} />
              {n > 0 && <span className="tab-badge">{n > 99 ? '99+' : n}</span>}
            </span>
            <span className="tab-bar-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
