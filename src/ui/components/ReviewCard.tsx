import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '../../types';
import { Markdown } from './Markdown';
import '../styles/review.css';

export type SwipeDir = 'left' | 'right' | 'up';
const THRESHOLD = 90;

const atEnd = (el: HTMLElement | null) => !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 2;

/** Review text sizes; the card scales front, back and code from `--review-scale`. */
export const TEXT_SIZES = [
  { id: 's', label: 'Small', scale: 0.88 },
  { id: 'm', label: 'Default', scale: 1 },
  { id: 'l', label: 'Large', scale: 1.15 },
  { id: 'xl', label: 'Extra Large', scale: 1.3 },
] as const;
export type TextSizeId = (typeof TEXT_SIZES)[number]['id'];
const TEXT_SIZE_KEY = 'fc.textSize';

function readTextSize(): TextSizeId {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY);
    if (TEXT_SIZES.some((t) => t.id === v)) return v as TextSizeId;
  } catch { /* storage unavailable */ }
  return 'm';
}

/** Per-device review text size, persisted in localStorage `fc.textSize`. `cycle` steps S → M → L → XL → S. */
export function useTextSize() {
  const [size, setSize] = useState<TextSizeId>(readTextSize);
  useEffect(() => {
    try { localStorage.setItem(TEXT_SIZE_KEY, size); } catch { /* storage unavailable */ }
  }, [size]);
  const cycle = useCallback(() => setSize((s) => TEXT_SIZES[(TEXT_SIZES.findIndex((t) => t.id === s) + 1) % TEXT_SIZES.length].id), []);
  const info = TEXT_SIZES.find((t) => t.id === size) ?? TEXT_SIZES[1];
  return { size, scale: info.scale, label: info.label, cycle };
}

/** Code block under `el` that scrolls horizontally (its own gesture, never a grade). */
const codeScroller = (el: EventTarget | null) =>
  (el instanceof Element ? el.closest<HTMLElement>('.review-card-body pre > code.code-scroll') : null);

/**
 * Flashcard: tap to flip; once flipped, swipe left = Again, right = Good, up = Easy.
 *
 * Long backs scroll inside the card body. On a scrollable card a vertical touch belongs to the
 * browser (touch-action: pan-y, so pointer events get cancelled); swipe-up = Easy is then detected
 * from touch events, and only for a swipe that *starts* with the body already scrolled to the end.
 * So: scroll to read, then one more swipe up at the end grades Easy (like pull-to-refresh, inverted).
 *
 * Code never wraps: a code block wider than the card gets `.code-scroll` (overflow-x:auto,
 * touch-action pan-x [+ pan-y on scrollable cards], overscroll-behavior-x: contain). A horizontal
 * drag that starts inside one scrolls the code (native for touch, scrollLeft for mouse) and never
 * grades; contain stops the scroll chaining into the browser's back gesture. Swipes that start
 * anywhere else on the card still grade.
 */
export function ReviewCard({ card, flipped, onFlip, onSwipe }: {
  card: Card;
  flipped: boolean;
  onFlip: () => void;
  onSwipe: (dir: SwipeDir) => void;
}) {
  const [d, setD] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fly, setFly] = useState<SwipeDir | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [more, setMore] = useState(false); // content hidden below the fold
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Touch-driven swipe-up on scrollable cards (pointer events are cancelled by native scrolling).
  const tStart = useRef<{ x: number; y: number; atEnd: boolean } | null>(null);
  const tUp = useRef(false);
  // Pointer that started inside a horizontally scrollable code block.
  const code = useRef<{ el: HTMLElement; left: number; active?: boolean } | null>(null);
  const text = useTextSize();

  useLayoutEffect(() => {
    setD({ x: 0, y: 0 });
    setFly(null);
    moved.current = false;
    start.current = null;
    tStart.current = null;
  }, [card.id]);

  const measure = useCallback(() => {
    const el = bodyRef.current;
    const s = !!el && el.scrollHeight > el.clientHeight + 2;
    setScrollable(s);
    setMore(s && !atEnd(el));
    el?.querySelectorAll<HTMLElement>('pre > code').forEach((c) => {
      c.classList.toggle('code-scroll', c.scrollWidth > c.clientWidth + 1);
    });
  }, []);

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    measure();
  }, [flipped, card.id, measure]);

  useLayoutEffect(() => { measure(); }, [text.scale, measure]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const dir: SwipeDir | null = !flipped ? null
    : d.y < -THRESHOLD && Math.abs(d.y) > Math.abs(d.x) ? 'up'
    : d.x < -THRESHOLD ? 'left'
    : d.x > THRESHOLD ? 'right'
    : null;

  const commit = (dirToFly: SwipeDir) => {
    setFly(dirToFly);
    setTimeout(() => onSwipe(dirToFly), 180);
  };

  const transform = fly
    ? fly === 'up' ? 'translate3d(0,-120vh,0)' : `translate3d(${fly === 'left' ? '-' : ''}130vw,0,0) rotate(${fly === 'left' ? -18 : 18}deg)`
    : `translate3d(${d.x}px,${Math.min(0, d.y)}px,0) rotate(${d.x / 22}deg)`;

  return (
    <div
      className={`review-card${flipped ? ' flipped' : ''}${dragging ? ' dragging' : ''}${fly ? ' flying' : ''}${scrollable ? ' scrollable' : ''}`}
      style={{ transform, touchAction: scrollable ? 'pan-y' : 'none', ['--review-scale' as string]: text.scale }}
      data-text-size={text.size}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if ((e.target as Element).closest?.('.review-text-size')) return;
        start.current = { x: e.clientX, y: e.clientY };
        moved.current = false;
        const c = codeScroller(e.target);
        code.current = c ? { el: c, left: c.scrollLeft } : null;
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        if (!moved.current && Math.hypot(dx, dy) < 8) return;
        if (code.current) {
          // Decided on the first real move: a horizontal drag inside a wide code block scrolls the
          // code. Touch: the browser pans it natively (and cancels this pointer). Mouse: by hand.
          if (!moved.current && !code.current.active) {
            if (Math.abs(dx) < Math.abs(dy)) code.current = null;
            else code.current.active = true;
          }
          if (code.current?.active) {
            moved.current = true;
            if (e.pointerType === 'mouse') {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              code.current.el.scrollLeft = code.current.left - dx;
            } else start.current = null;
            return;
          }
        }
        if (!flipped) return;
        if (!moved.current) {
          // Vertical gesture on a scrollable card: touch → native scroll (handled via touch events
          // below); mouse → only an upward drag from the end of the content is a swipe.
          if (scrollable && Math.abs(dy) > Math.abs(dx) && (e.pointerType !== 'mouse' || dy > 0 || !atEnd(bodyRef.current))) {
            start.current = null;
            return;
          }
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
        }
        moved.current = true;
        setD({ x: dx, y: dy });
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
        const wasCode = !!code.current?.active;
        code.current = null;
        if (wasCode) return;
        if (!moved.current) return;
        if (dir) commit(dir);
        else setD({ x: 0, y: 0 });
      }}
      onPointerCancel={() => {
        start.current = null;
        code.current = null;
        setDragging(false);
        // A native vertical scroll took the gesture; keep the pending touch swipe-up preview.
        if (!tUp.current) setD({ x: 0, y: 0 });
      }}
      onTouchStart={(e) => {
        if (!scrollable || !flipped || e.touches.length !== 1) { tStart.current = null; return; }
        const t = e.touches[0];
        tStart.current = { x: t.clientX, y: t.clientY, atEnd: atEnd(bodyRef.current) };
        tUp.current = false;
      }}
      onTouchMove={(e) => {
        const s = tStart.current;
        if (!s || !s.atEnd || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        const up = dy < 0 && Math.abs(dy) > Math.abs(dx) && atEnd(bodyRef.current);
        if (up || tUp.current) {
          tUp.current = up;
          moved.current = true;
          setD({ x: 0, y: up ? dy : 0 });
        }
      }}
      onTouchEnd={(e) => {
        const s = tStart.current;
        tStart.current = null;
        if (!s || !tUp.current) return;
        tUp.current = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (dy < -THRESHOLD && Math.abs(dy) > Math.abs(dx) && atEnd(bodyRef.current)) commit('up');
        else setD({ x: 0, y: 0 });
      }}
      onTouchCancel={() => { tStart.current = null; tUp.current = false; setD({ x: 0, y: 0 }); }}
      onClick={(e) => {
        if ((e.target as Element).closest?.('.review-text-size')) return;
        if (!moved.current && !flipped) onFlip();
        moved.current = false;
      }}
      role="button"
      tabIndex={0}
      aria-label={flipped ? 'Answer shown' : 'Show answer'}
    >
      {dir && <div className={`swipe-hint ${dir}`}>{dir === 'left' ? 'Again' : dir === 'right' ? 'Good' : 'Easy'}</div>}
      <button
        type="button"
        className="review-text-size"
        aria-label={`Text size: ${text.label}. Tap to change.`}
        title={`Text size: ${text.label}`}
        onClick={(e) => { e.stopPropagation(); text.cycle(); }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="small">a</span><span>A</span>
      </button>
      {/* touch-action must be on the scroll container too: it resets the effective touch-action for its descendants. */}
      <div
        className={`review-card-body${more ? ' more' : ''}`}
        ref={bodyRef}
        style={{ touchAction: scrollable ? 'pan-y' : 'none' }}
        onScroll={() => setMore(scrollable && !atEnd(bodyRef.current))}
      >
        <Markdown source={card.front} className="review-front" />
        {flipped && (
          <>
            <hr className="review-divider" />
            <Markdown source={card.back} className="review-back" />
          </>
        )}
      </div>
      {more && <div className="review-card-more" aria-hidden="true">More ↓</div>}
      {!flipped && <div className="review-card-hint">Tap to show answer</div>}
      {card.tags.length > 0 && (
        <div className="review-card-tags">{card.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
      )}
    </div>
  );
}
