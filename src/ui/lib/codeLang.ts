import { useCallback, useEffect, useState } from 'react';

export type CodeLang = 'java' | 'python';
export const CODE_LANG_OPTIONS: { id: CodeLang; label: string }[] = [
  { id: 'java', label: 'Java' },
  { id: 'python', label: 'Python' },
];
export const CODE_LANG_KEY = 'fc.codeLang';

const FENCE_LANG = /^ {0,3}(?:`{3,}|~{3,})[ \t]*(java|python|py)\b/gim;

/** Languages (java/python) that have at least one fenced code block in the given Markdown sources. */
export function codeLangsIn(...sources: string[]): Set<CodeLang> {
  const out = new Set<CodeLang>();
  for (const s of sources) for (const m of (s ?? '').matchAll(FENCE_LANG)) out.add(m[1].toLowerCase() === 'java' ? 'java' : 'python');
  return out;
}

/**
 * Which language to hide on a card, given the user's pick. Only when the card has both languages;
 * a card with just one shows it regardless of the pick.
 */
export function hiddenLangFor(pref: CodeLang, langs: Set<CodeLang>): CodeLang | null {
  if (!(langs.has('java') && langs.has('python'))) return null;
  return pref === 'java' ? 'python' : 'java';
}

export function readCodeLang(): CodeLang {
  try {
    const v = localStorage.getItem(CODE_LANG_KEY);
    if (v === 'java' || v === 'python') return v;
  } catch { /* storage unavailable */ }
  return 'java';
}

/** Per-device code language for review cards, persisted in localStorage `fc.codeLang` (default Java). */
export function useCodeLang() {
  const [lang, setLangState] = useState<CodeLang>(readCodeLang);
  useEffect(() => {
    try { localStorage.setItem(CODE_LANG_KEY, lang); } catch { /* storage unavailable */ }
  }, [lang]);
  const setLang = useCallback((l: CodeLang) => setLangState(l), []);
  return { lang, setLang };
}
