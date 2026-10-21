import { useState } from 'react';

/** Tags as removable chips; type and press space, comma, semicolon or return to add. */
export function TagInput({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const next = [...tags];
    for (const t of raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) if (!next.includes(t)) next.push(t);
    onChange(next);
    setDraft('');
  };
  const q = draft.trim().toLowerCase();
  const sugg = q ? suggestions.filter((s) => s.toLowerCase().startsWith(q) && !tags.includes(s)).slice(0, 6) : [];
  return (
    <div className="tag-input">
      <div className="tag-input-chips">
        {tags.map((t) => (
          <button key={t} type="button" className="tag-chip" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
            {t} <span aria-hidden>×</span>
          </button>
        ))}
        <input
          className="tag-input-field"
          value={draft}
          placeholder={tags.length ? 'Add tag' : 'Add tags'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.target.value;
            if (/[\s,;]$/.test(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(draft); }
            else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
      </div>
      {sugg.length > 0 && (
        <div className="tag-suggestions">
          {sugg.map((s) => (
            <button key={s} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
