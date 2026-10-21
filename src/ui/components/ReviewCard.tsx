import { useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '../../types';
import { Markdown } from './Markdown';

export type SwipeDir = 'left' | 'right' | 'up';
const THRESHOLD = 90;

/** Flashcard: tap to flip; once flipped, swipe left = Again, right = Good, up = Easy. */
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
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setD({ x: 0, y: 0 });
    setFly(null);
    moved.current = false;
    start.current = null;
  }, [card.id]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    setScrollable(!!el && el.scrollHeight > el.clientHeight + 2);
    if (el) el.scrollTop = 0;
  }, [flipped, card.id]);

  const dir: SwipeDir | null = !flipped ? null
    : d.y < -THRESHOLD && Math.abs(d.y) > Math.abs(d.x) && !scrollable ? 'up'
    : d.x < -THRESHOLD ? 'left'
    : d.x > THRESHOLD ? 'right'
    : null;

  const transform = fly
    ? fly === 'up' ? 'translate3d(0,-120vh,0)' : `translate3d(${fly === 'left' ? '-' : ''}130vw,0,0) rotate(${fly === 'left' ? -18 : 18}deg)`
    : `translate3d(${d.x}px,${scrollable ? 0 : Math.min(0, d.y)}px,0) rotate(${d.x / 22}deg)`;

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
          if (scrollable && Math.abs(dy) > Math.abs(dx)) { start.current = null; return; }
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
        if (dir) {
          setFly(dir);
          setTimeout(() => onSwipe(dir), 180);
        } else setD({ x: 0, y: 0 });
      }}
      onPointerCancel={() => { start.current = null; setDragging(false); setD({ x: 0, y: 0 }); }}
      onClick={() => { if (!moved.current && !flipped) onFlip(); moved.current = false; }}
      role="button"
      tabIndex={0}
      aria-label={flipped ? 'Answer shown' : 'Show answer'}
    >
      {dir && <div className={`swipe-hint ${dir}`}>{dir === 'left' ? 'Again' : dir === 'right' ? 'Good' : 'Easy'}</div>}
      {deckPath && <div className="review-card-deck">{deckPath}</div>}
      {/* touch-action must be on the scroll container too: it resets the effective touch-action for its descendants. */}
      <div className="review-card-body" ref={bodyRef} style={{ touchAction: scrollable ? 'pan-y' : 'none' }}>
        <Markdown source={card.front} className="review-front" />
        {flipped && (
          <>
            <hr className="review-divider" />
            <Markdown source={card.back} className="review-back" />
          </>
        )}
      </div>
      {!flipped && <div className="review-card-hint">Tap to show answer</div>}
      {card.tags.length > 0 && (
        <div className="review-card-tags">{card.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
      )}
    </div>
  );
}
