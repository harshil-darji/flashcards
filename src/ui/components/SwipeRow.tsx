import { useEffect, useRef, useState, type ReactNode } from 'react';

const ACTION_W = 84;

/** Swipe left to reveal a Delete action (full swipe triggers it). Vertical scrolling is unaffected. */
export function SwipeRow({ children, onDelete, label = 'Delete' }: { children: ReactNode; onDelete: () => void; label?: string }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null } | null>(null);
  const moved = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (x === 0) return;
    const close = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setX(0);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [x]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, base: x, axis: null };
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.axis !== 'x') return;
    moved.current = true;
    const width = rowRef.current?.offsetWidth ?? 320;
    setX(Math.min(0, Math.max(-width, s.base + dx)));
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s || s.axis !== 'x') return;
    const width = rowRef.current?.offsetWidth ?? 320;
    if (x < -width * 0.6) {
      setX(0);
      onDelete();
    } else setX(x < -ACTION_W / 2 ? -ACTION_W : 0);
  };

  return (
    <div className="swipe-row" ref={rowRef}>
      <button
        type="button"
        className="swipe-action"
        style={{ width: Math.max(ACTION_W, -x), visibility: x === 0 && !dragging ? 'hidden' : 'visible' }}
        onClick={() => { setX(0); onDelete(); }}
        tabIndex={x === 0 ? -1 : 0}
      >
        {label}
      </button>
      <div
        className={`swipe-content${dragging ? ' dragging' : ''}`}
        style={{ transform: `translate3d(${x}px,0,0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (moved.current || x !== 0) {
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
            if (x !== 0 && !dragging) setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
