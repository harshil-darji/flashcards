import { useEffect, useRef, useState } from 'react';
import type { ThemePreference } from '../../types';
import * as db from '../../core/db';
import { exportCSV, exportJSON, parseCSV, parseJSON, type ParseError } from '../../core/importExport';
import { useStore } from '../store';
import { downloadText } from '../lib/download';
import { Page } from '../components/Page';
import { ListSection } from '../components/ListSection';
import { ListRow } from '../components/ListRow';
import { SegmentedControl } from '../components/SegmentedControl';
import { Stepper } from '../components/Stepper';

type ImportReport = { file: string; added: number; updated: number; decks: number; errors: ParseError[] } | { file: string; fatal: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function SettingsScreen() {
  const { settings, updateSettings, decks, cards, reload } = useStore();
  const [retention, setRetention] = useState(settings.requestRetention);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRetention(settings.requestRetention), [settings.requestRetention]);
  useEffect(() => {
    if (Math.abs(retention - settings.requestRetention) < 1e-9) return;
    const t = setTimeout(() => save({ requestRetention: retention }), 350);
    return () => clearTimeout(t);
  }, [retention]);

  const save = (patch: Parameters<typeof updateSettings>[0]) =>
    updateSettings(patch).catch((e) => setError(e instanceof Error ? e.message : String(e)));

  const onFile = async (file: File) => {
    setImporting(true);
    setReport(null);
    try {
      const text = await file.text();
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      const parsed = isCsv ? parseCSV(text) : parseJSON(text);
      if (!parsed.cards.length) {
        setReport({ file: file.name, added: 0, updated: 0, decks: 0, errors: parsed.errors.length ? parsed.errors : [{ row: 0, message: 'No cards found.' }] });
        return;
      }
      const r = await db.importCards(parsed);
      await reload();
      setReport({ file: file.name, added: r.cardsAdded, updated: r.cardsUpdated, decks: r.decksCreated, errors: parsed.errors });
    } catch (e) {
      setReport({ file: file.name, fatal: e instanceof Error ? e.message : String(e) });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Page title="Settings">
      {error && <div className="form-error">{error}</div>}
      <ListSection header="Appearance">
        <div className="list-row">
          <SegmentedControl<ThemePreference>
            label="Theme"
            value={settings.theme}
            onChange={(theme) => save({ theme })}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          />
        </div>
      </ListSection>

      <ListSection header="Daily Limits" footer="Caps how many new and review cards a study day shows.">
        <ListRow title="New Cards / Day" detail={settings.newCardsPerDay}
          accessory={<Stepper label="new cards per day" value={settings.newCardsPerDay} min={0} max={500} step={5} onChange={(v) => save({ newCardsPerDay: v })} />} />
        <ListRow title="Reviews / Day" detail={settings.reviewsPerDay}
          accessory={<Stepper label="reviews per day" value={settings.reviewsPerDay} min={10} max={9999} step={10} onChange={(v) => save({ reviewsPerDay: v })} />} />
      </ListSection>

      <ListSection header="Scheduling" footer="Target probability of remembering a card when it comes due. Higher means more frequent reviews.">
        <ListRow title="Desired Retention" detail={`${Math.round(retention * 100)}%`} />
        <div className="list-row">
          <input
            className="slider"
            type="range"
            min={0.7}
            max={0.97}
            step={0.01}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            aria-label="Desired retention"
          />
        </div>
      </ListSection>

      <ListSection header="Import" footer="JSON (simple or full backup) or CSV with columns front, back, deck, tags. Existing cards with the same id are updated.">
        <ListRow tint title={importing ? 'Importing…' : 'Import from File…'} onClick={importing ? undefined : () => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,application/json,text/csv,text/plain"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </ListSection>

      {report && (
        <ListSection header={`Result · ${report.file}`}>
          {'fatal' in report ? (
            <ListRow destructive multiline title="Import failed" subtitle={report.fatal} />
          ) : (
            <>
              <ListRow title="Added" detail={report.added} />
              <ListRow title="Updated" detail={report.updated} />
              <ListRow title="Decks Created" detail={report.decks} />
              <ListRow title="Errors" detail={report.errors.length} />
              {report.errors.slice(0, 50).map((er, i) => (
                <ListRow key={i} destructive multiline title={er.row ? `Row ${er.row}` : 'File'} subtitle={er.message} />
              ))}
              {report.errors.length > 50 && <ListRow title={`…and ${report.errors.length - 50} more`} />}
            </>
          )}
        </ListSection>
      )}

      <ListSection header="Export" footer="JSON keeps scheduling and ids (full backup). CSV has front, back, deck, tags only.">
        <ListRow tint title="Export JSON Backup" detail={`${cards.length}`}
          onClick={() => downloadText(`flashcards-backup-${today()}.json`, exportJSON(cards, decks), 'application/json')} />
        <ListRow tint title="Export CSV"
          onClick={() => downloadText(`flashcards-${today()}.csv`, exportCSV(cards, decks), 'text/csv')} />
      </ListSection>

      <ListSection header="About">
        <ListRow title="Decks" detail={decks.length} />
        <ListRow title="Cards" detail={cards.length} />
        <ListRow title="Storage" detail="On this device" />
      </ListSection>
    </Page>
  );
}
