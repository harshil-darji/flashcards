import { useEffect, useState } from 'react';
import { getSyncEngine } from '../../core/sync';
import { ListSection } from './ListSection';
import { ListRow } from './ListRow';
import { ActionSheet } from './ActionSheet';
import { useSyncStatus } from './SyncAgent';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

function ago(t: number | undefined, now: number): string {
  if (!t) return 'Never';
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8, border: '0.5px solid var(--separator)',
  background: 'transparent', fontSize: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Settings › Sync: connect a GitHub token, see status, sync now, disconnect. */
export function SyncSection() {
  const engine = getSyncEngine();
  const status = useSyncStatus();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => setNow(Date.now()), [status.lastSyncedAt]);

  const connected = status.state !== 'disconnected';
  const connect = async () => {
    setBusy(true);
    try { await engine.connect(token); setToken(''); } catch { /* shown via status.error */ } finally { setBusy(false); }
  };

  const help = (
    <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
      <li>Open <a href={TOKEN_URL} target="_blank" rel="noreferrer">github.com/settings/personal-access-tokens</a> → Generate new token (fine-grained).</li>
      <li>Repository access: <b>Public repositories</b> (no repos needed).</li>
      <li>Account permissions → <b>Gists: Read and write</b>. Nothing else.</li>
      <li>Pick an expiration, generate, and paste the token here. Do this once on each device.</li>
    </ol>
  );

  if (!connected) {
    return (
      <ListSection
        header="Sync"
        footer={<>
          Syncs cards, decks, reviews, and settings between your devices through a <b>secret gist</b> on your GitHub account.
          The token stays on this device and is never exported.{' '}
          <button type="button" onClick={() => setShowHelp((v) => !v)} style={{ color: 'var(--tint)', background: 'none', border: 0, padding: 0, font: 'inherit' }}>
            {showHelp ? 'Hide steps' : 'How to make a token'}
          </button>
          {showHelp && help}
        </>}
      >
        <div className="list-row">
          <input
            style={inputStyle}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="GitHub token"
            onKeyDown={(e) => { if (e.key === 'Enter' && token.trim() && !busy) connect(); }}
          />
        </div>
        {status.error && <ListRow destructive multiline title="Couldn’t connect" subtitle={status.error} />}
        <ListRow tint title={busy ? 'Connecting…' : 'Connect GitHub'} onClick={busy || !token.trim() ? undefined : connect} />
      </ListSection>
    );
  }

  const stateLabel = status.state === 'syncing' ? 'Syncing…' : status.state === 'offline' ? 'Waiting for connection' : status.state === 'error' ? 'Error' : 'Up to date';
  return (
    <>
      <ListSection header="Sync" footer="Syncs automatically when the app opens, when you come back to it, and about 30 seconds after you review or edit.">
        <ListRow title="GitHub Account" detail={status.login || '—'} />
        <ListRow title="Last Synced" detail={ago(status.lastSyncedAt, now)} />
        <ListRow title="Status" detail={stateLabel} />
        {status.state === 'error' && status.error && (
          <ListRow destructive multiline title={status.errorCode === 'auth' || status.errorCode === 'forbidden' ? 'Token problem' : 'Sync failed'}
            subtitle={status.errorCode === 'auth' || status.errorCode === 'forbidden' ? <>{status.error} Disconnect, then connect with a new token.</> : status.error} />
        )}
        <ListRow tint title={status.state === 'syncing' ? 'Syncing…' : 'Sync Now'} onClick={status.state === 'syncing' ? undefined : () => void engine.sync('manual')} />
        <ListRow destructive title="Disconnect" onClick={() => setConfirmOff(true)} />
      </ListSection>
      <ActionSheet
        open={confirmOff}
        title="Disconnect sync on this device?"
        message="Your cards stay on this device and the gist stays on GitHub. The token is removed from this device."
        actions={[{ label: 'Disconnect', destructive: true, onSelect: () => engine.disconnect() }]}
        onClose={() => setConfirmOff(false)}
      />
    </>
  );
}
