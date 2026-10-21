import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getSyncEngine, type SyncStatus } from '../../core/sync';
import { useStore } from '../store';

/** Debounce after a review session / edit before syncing. */
export const SYNC_DEBOUNCE_MS = 30_000;
const FOREGROUND_THROTTLE_MS = 10_000;
const RETRY_POLL_MS = 60_000;

export function useSyncStatus(): SyncStatus {
  const e = getSyncEngine();
  return useSyncExternalStore(e.subscribe, e.getStatus, e.getStatus);
}

/**
 * Headless: runs sync on app open, on returning to the foreground, ~30s after local changes (store reloads),
 * and retries queued syncs when back online. Renders nothing.
 */
export function SyncAgent() {
  const { ready, version, reload } = useStore();
  const engine = getSyncEngine();
  const selfReload = useRef(false);
  const dirty = useRef(false);
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    engine.onLocalChange = async () => {
      selfReload.current = true;
      try { await reload(); } finally { setTimeout(() => { selfReload.current = false; }, 0); }
    };
    return () => { engine.onLocalChange = null; };
  }, [engine, reload]);

  const run = (reason: string) => {
    if (!engine.isConnected()) return;
    const retryAt = engine.retryAt();
    if (retryAt && Date.now() < retryAt) return;
    clearTimeout(timer.current);
    lastRun.current = Date.now();
    dirty.current = false;
    void engine.sync(reason);
  };

  // App open.
  useEffect(() => { if (ready) run('open'); }, [ready]);

  // Local changes → debounced sync.
  const seenVersion = useRef(version);
  useEffect(() => {
    if (!ready || version === seenVersion.current) return;
    seenVersion.current = version;
    if (selfReload.current || !engine.isConnected()) return;
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run('edit'), SYNC_DEBOUNCE_MS);
  }, [version, ready]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRun.current > FOREGROUND_THROTTLE_MS) run('foreground');
      } else if (dirty.current) run('background'); // flush pending edits before iOS suspends us
    };
    const onOnline = () => { if (engine.isPending()) run('online'); };
    const poll = setInterval(() => { if (engine.isPending() && navigator.onLine !== false && document.visibilityState === 'visible') run('retry'); }, RETRY_POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      clearInterval(poll);
      clearTimeout(timer.current);
    };
  }, [engine]);

  return null;
}
