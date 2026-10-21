import { Rating } from '../../types';

const BUTTONS: { rating: Rating; label: string; cls: string }[] = [
  { rating: Rating.Again, label: 'Again', cls: 'again' },
  { rating: Rating.Hard, label: 'Hard', cls: 'hard' },
  { rating: Rating.Good, label: 'Good', cls: 'good' },
  { rating: Rating.Easy, label: 'Easy', cls: 'easy' },
];

export function RatingButtons({ intervals, onRate, disabled }: {
  intervals: Partial<Record<Rating, string>>;
  onRate: (r: Rating) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rating-buttons">
      {BUTTONS.map((b) => (
        <button key={b.rating} type="button" className={`rating ${b.cls}`} onClick={() => onRate(b.rating)} disabled={disabled}>
          <span className="rating-interval">{intervals[b.rating] ?? ''}</span>
          <span className="rating-label">{b.label}</span>
        </button>
      ))}
    </div>
  );
}
