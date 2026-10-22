/** Labeled, colored counts: new (blue) and due (green). Zeros are greyed. */
export function CountPills({ fresh, due }: { fresh: number; due: number }) {
  return (
    <span className="count-pills labeled" aria-label={`${fresh} new, ${due} due`}>
      <span className={`count new${fresh ? '' : ' zero'}`}>{fresh}<span className="count-label"> new</span></span>
      <span className={`count due${due ? '' : ' zero'}`}>{due}<span className="count-label"> due</span></span>
    </span>
  );
}
