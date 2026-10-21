import { TABS, type TabId } from '../tabs';

export function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tab-bar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`tab-bar-item${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="tab-bar-icon" aria-hidden>{t.icon}</span>
          <span className="tab-bar-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
