import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as db from '../core/db';
import { loadSeed } from '../seed/loadSeed';
import { DEFAULT_SETTINGS, type Card, type Deck, type Settings } from '../types';
import { applyTheme } from './lib/theme';

interface Store {
  ready: boolean;
  error: string | null;
  decks: Deck[];
  cards: Card[];
  settings: Settings;
  /** Bumped after every reload; use as a dependency to refetch derived data. */
  version: number;
  reload: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [version, setVersion] = useState(0);

  const reload = useCallback(async () => {
    const [d, c, s] = await Promise.all([db.listDecks(), db.listCards(), db.getSettings()]);
    setDecks(d);
    setCards(c);
    setSettings(s);
    applyTheme(s.theme);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await db.openDB();
        await loadSeed();
        if (!cancelled) await reload();
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (patch.theme) applyTheme(patch.theme);
    const saved = await db.saveSettings(patch);
    setSettings(saved);
  }, []);

  const value = useMemo(
    () => ({ ready, error, decks, cards, settings, version, reload, updateSettings }),
    [ready, error, decks, cards, settings, version, reload, updateSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
