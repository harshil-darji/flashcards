/** Anki-style counts: new (blue) and due (green). */
export function CountPills({ fresh, due }: { fresh: number; due: number }) {
  return (
    <span className="count-pills" aria-label={`${fresh} new, ${due} due`}>
      <span className={`count new${fresh ? '' : ' zero'}`}>{fresh}</span>
      <span className={`count due${due ? '' : ' zero'}`}>{due}</span>
    </span>
  );
}
