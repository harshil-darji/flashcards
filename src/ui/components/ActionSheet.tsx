import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface Action { label: string; onSelect: () => void; destructive?: boolean }

/** iOS action sheet: grouped actions plus a separate Cancel button. */
export function ActionSheet({ open, title, message, actions, onClose }: {
  open: boolean;
  title?: string;
  message?: string;
  actions: Action[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [snapshot, setSnapshot] = useState({ title, message, actions });

  useEffect(() => {
    if (open) {
      setSnapshot({ title, message, actions });
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  const s = open ? { title, message, actions } : snapshot;
  return createPortal(
    <div className={`action-sheet-root${shown ? ' shown' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="action-sheet" role="dialog" aria-modal="true">
        <div className="action-group">
          {(s.title || s.message) && (
            <div className="action-head">
              {s.title && <div className="action-title">{s.title}</div>}
              {s.message && <div className="action-message">{s.message}</div>}
            </div>
          )}
          {s.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`action-button${a.destructive ? ' destructive' : ''}`}
              onClick={() => { onClose(); a.onSelect(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="action-group">
          <button type="button" className="action-button cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
