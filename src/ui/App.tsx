import { useState } from 'react';
import { TabBar } from './components/TabBar';
import type { TabId } from './tabs';
import DecksScreen from './screens/DecksScreen';
import ReviewScreen from './screens/ReviewScreen';
import SearchScreen from './screens/SearchScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';

const SCREENS: Record<TabId, () => React.JSX.Element> = {
  decks: DecksScreen,
  review: ReviewScreen,
  search: SearchScreen,
  stats: StatsScreen,
  settings: SettingsScreen,
};

export default function App() {
  const [tab, setTab] = useState<TabId>('decks');
  const Screen = SCREENS[tab];
  return (
    <div className="app">
      <main className="app-content">
        <Screen />
      </main>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
