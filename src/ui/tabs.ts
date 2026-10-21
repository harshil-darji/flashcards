export type TabId = 'decks' | 'review' | 'search' | 'stats' | 'settings';
export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'decks', label: 'Decks', icon: '▤' },
  { id: 'review', label: 'Review', icon: '◉' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'stats', label: 'Stats', icon: '▥' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];
