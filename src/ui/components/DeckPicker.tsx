import type { Deck, ID } from '../../types';
import { DECK_SEPARATOR } from '../../core/importExport';
import { sortedDecks } from '../lib/decks';

export const NEW_DECK = '__new__';

/** Native <select> (iOS wheel picker) of decks by path, plus "New Deck…". */
export function DeckPicker({ decks, value, onChange }: { decks: Deck[]; value: ID | ''; onChange: (id: ID) => void }) {
  return (
    <select className="deck-picker" value={value} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="" disabled>Choose deck</option>}
      {sortedDecks(decks).map((d) => {
        const depth = d.path.split(DECK_SEPARATOR).length - 1;
        return (
          <option key={d.id} value={d.id}>
            {'\u2003'.repeat(depth)}{d.name}
          </option>
        );
      })}
      <option value={NEW_DECK}>New Deck…</option>
    </select>
  );
}
