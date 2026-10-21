export type IconName =
  | 'decks' | 'review' | 'search' | 'stats' | 'settings'
  | 'plus' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'ellipsis' | 'trash' | 'close' | 'check';

const PATHS: Record<IconName, string> = {
  decks: 'M4 7h16v12H4zM6 4h12M8 1.5h8',
  review: 'M6 3.5h9a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM19.5 6.5v11',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13zM15.5 15.5L20.5 20.5',
  stats: 'M5 20V12M10 20V5M15 20V9M20 20V14',
  settings: 'M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  plus: 'M12 5v14M5 12h14',
  'chevron-left': 'M15 4l-8 8l8 8',
  'chevron-right': 'M9 5l7 7l-7 7',
  'chevron-down': 'M5 9l7 7l7-7',
  ellipsis: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
};

export function Icon({ name, size = 24, strokeWidth = 2 }: { name: IconName; size?: number; strokeWidth?: number }) {
  const sw = name === 'ellipsis' ? 3.2 : strokeWidth;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
