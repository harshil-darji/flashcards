import { useEffect, useMemo, useRef, useState } from 'react';
import type { ID } from '../types';
import { TabBar } from './components/TabBar';
import type { TabId } from './tabs';
import { StoreProvider, useStore } from './store';
import { isDue, isNew } from './lib/decks';
import DecksScreen from './screens/DecksScreen';
import ReviewScreen from './screens/ReviewScreen';
import SearchScreen from './screens/SearchScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { SyncAgent } from './components/SyncAgent';

function Shell() {
  const { error, cards, limits } = useStore();
  const [tab, setTab] = useState<TabId>('decks');
  const [reviewDeck, setReviewDeck] = useState<ID | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [reviewKey, setReviewKey] = useState(0);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [tab, reviewKey]);

  const dueBadge = useMemo(() => {
    const now = Date.now();
    const due = Math.min(limits.reviewsLeft, cards.filter((c) => isDue(c, now)).length);
    const fresh = Math.min(limits.newLeft, cards.filter(isNew).length);
    return due + fresh;
  }, [cards, limits]);

  const study = (deckId?: ID) => {
    setReviewDeck(deckId ?? null);
    setAutoStart(true);
    setReviewKey((k) => k + 1);
    setTab('review');
  };

  const changeTab = (t: TabId) => {
    if (t === tab) contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    if (t !== 'review') { setReviewDeck(null); setAutoStart(false); }
    setTab(t);
  };

  return (
    <div className="app">
      <main className="app-content" ref={contentRef}>
        {error && (
          <div className="fatal-banner" role="alert">
            <strong>Storage error</strong>
            <span>{error}</span>
          </div>
        )}
        {tab === 'decks' && <DecksScreen onStudy={study} />}
        {tab === 'review' && (
          <ReviewScreen key={reviewKey} deckId={reviewDeck} startNow={autoStart} onExit={() => { const back = autoStart; setReviewDeck(null); setAutoStart(false); if (back) setTab('decks'); }} />
        )}
        {tab === 'search' && <SearchScreen />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <TabBar active={tab} onChange={changeTab} badge={{ review: dueBadge }} />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <SyncAgent />
      <Shell />
    </StoreProvider>
  );
}
