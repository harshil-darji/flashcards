import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const DURATION = 320;

/** Bottom sheet that slides up (iOS page sheet). Drag the grabber/header down to dismiss. */
export function Sheet({ open, onClose, title, leading, trailing, children }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const last = useRef<{ title?: ReactNode; leading?: ReactNode; trailing?: ReactNode; children: ReactNode }>({ children });
  const dragStart = useRef<number | null>(null);

  if (open) last.current = { title, leading, trailing, children };

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), DURATION);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  const c = last.current;
  return createPortal(
    <div className={`sheet-root${shown ? ' shown' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className={`sheet${drag ? ' dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        style={drag ? { transform: `translate3d(0,${drag}px,0)` } : undefined}
      >
        <div
          className="sheet-header"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            dragStart.current = e.clientY;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, e.clientY - dragStart.current));
          }}
          onPointerUp={() => {
            const d = drag;
            dragStart.current = null;
            setDrag(0);
            if (d > 120) onClose();
          }}
          onPointerCancel={() => { dragStart.current = null; setDrag(0); }}
        >
          <div className="sheet-grabber" />
          <div className="sheet-bar">
            <div className="nav-bar-leading">{c.leading}</div>
            <div className="sheet-title">{c.title}</div>
            <div className="nav-bar-trailing">{c.trailing}</div>
          </div>
        </div>
        <div className="sheet-body">{c.children}</div>
      </div>
    </div>,
    document.body,
  );
}
