import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '../../types';
import { Markdown } from './Markdown';

export type SwipeDir = 'left' | 'right' | 'up';
const THRESHOLD = 90;

const atEnd = (el: HTMLElement | null) => !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 2;

/**
 * Flashcard: tap to flip; once flipped, swipe left = Again, right = Good, up = Easy.
 *
 * Long backs scroll inside the card body. On a scrollable card a vertical touch belongs to the
 * browser (touch-action: pan-y, so pointer events get cancelled); swipe-up = Easy is then detected
 * from touch events, and only for a swipe that *starts* with the body already scrolled to the end.
 * So: scroll to read, then one more swipe up at the end grades Easy (like pull-to-refresh, inverted).
 */
export function ReviewCard({ card, deckPath, flipped, onFlip, onSwipe }: {
  card: Card;
  deckPath?: string;
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
  }, []);

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    measure();
  }, [flipped, card.id, measure]);

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
      className={`review-card${flipped ? ' flipped' : ''}${dragging ? ' dragging' : ''}${fly ? ' flying' : ''}`}
      style={{ transform, touchAction: scrollable ? 'pan-y' : 'none' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        if (!start.current || !flipped) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        if (!moved.current && Math.hypot(dx, dy) < 8) return;
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
        if (!moved.current) return;
        if (dir) commit(dir);
        else setD({ x: 0, y: 0 });
      }}
      onPointerCancel={() => {
        start.current = null;
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
      onClick={() => { if (!moved.current && !flipped) onFlip(); moved.current = false; }}
      role="button"
      tabIndex={0}
      aria-label={flipped ? 'Answer shown' : 'Show answer'}
    >
      {dir && <div className={`swipe-hint ${dir}`}>{dir === 'left' ? 'Again' : dir === 'right' ? 'Good' : 'Easy'}</div>}
      {deckPath && <div className="review-card-deck">{deckPath}</div>}
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
