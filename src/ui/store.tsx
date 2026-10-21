import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as db from '../core/db';
import { loadSeed } from '../seed/loadSeed';
import { State } from 'ts-fsrs';
import { DEFAULT_SETTINGS, type Card, type Deck, type Settings } from '../types';
import { studyDayStart } from './lib/dates';
import type { DailyLimits } from './lib/decks';
import { applyTheme } from './lib/theme';

interface Store {
  ready: boolean;
  error: string | null;
  decks: Deck[];
  cards: Card[];
  settings: Settings;
  /** Bumped after every reload; use as a dependency to refetch derived data. */
  version: number;
  /** Reviews logged since the current study day started. */
  today: { newDone: number; reviewsDone: number };
  /** Remaining daily allowance (settings limits minus today's reviews). */
  limits: DailyLimits;
  reload: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/** One-time startup (open DB + seed). Shared so StrictMode's double effects can't seed twice. */
let initPromise: Promise<void> | null = null;
function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await db.openDB();
      await loadSeed();
    })().catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [version, setVersion] = useState(0);
  const [today, setToday] = useState({ newDone: 0, reviewsDone: 0 });

  const reload = useCallback(async () => {
    const s = await db.getSettings();
    const [d, c, logs] = await Promise.all([db.listDecks(), db.listCards(), db.listLogs({ since: studyDayStart(new Date(), s.dayStartHour) })]);
    const newDone = logs.filter((l) => l.fsrs.state === State.New).length;
    setToday({ newDone, reviewsDone: logs.length - newDone });
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
        await init();
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

  const limits = useMemo(
    () => ({ newLeft: Math.max(0, settings.newCardsPerDay - today.newDone), reviewsLeft: Math.max(0, settings.reviewsPerDay - today.reviewsDone) }),
    [settings.newCardsPerDay, settings.reviewsPerDay, today],
  );
  const value = useMemo(
    () => ({ ready, error, decks, cards, settings, version, today, limits, reload, updateSettings }),
    [ready, error, decks, cards, settings, version, today, limits, reload, updateSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
