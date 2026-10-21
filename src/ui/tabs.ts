import type { IconName } from './components/Icon';

export type TabId = 'decks' | 'review' | 'search' | 'stats' | 'settings';
export const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'decks', label: 'Decks', icon: 'decks' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'stats', label: 'Stats', icon: 'stats' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
