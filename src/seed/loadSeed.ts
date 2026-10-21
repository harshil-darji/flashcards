import { parseJSON, type ParseResult } from '../core/importExport';
import { getSettings, importCards, saveSettings } from '../core/db';

/** Every src/seed/*.json, as raw text (format: docs/IMPORT_FORMAT.md JSON). */
const seedFiles = import.meta.glob('./*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function parseSeeds(files: Record<string, string> = seedFiles): { file: string; result: ParseResult }[] {
  return Object.keys(files)
    .sort()
    .map((file) => ({ file, result: parseJSON(files[file]) }));
}

/** On first run imports all seed decks once, then sets settings.seeded. Returns number of cards imported. */
export async function loadSeed(): Promise<number> {
  const settings = await getSettings();
  if (settings.seeded) return 0;
  let total = 0;
  for (const { file, result } of parseSeeds()) {
    if (result.errors.length) console.warn(`[seed] ${file}:`, result.errors);
    const r = await importCards(result);
    total += r.cardsAdded;
  }
  await saveSettings({ seeded: true });
  return total;
}
