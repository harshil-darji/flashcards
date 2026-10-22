import { useLayoutEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '../lib/markdown';
import type { CodeLang } from '../lib/codeLang';

/**
 * Renders Markdown with highlighted code, diagram fences and `:::details` blocks. Raw HTML in the source is
 * escaped (see lib/markdown). `hideLang` hides (not removes) that language's code blocks and labels.
 * Which `:::details` sections are open survives a `hideLang` change (re-render) and resets with new `source`.
 */
export function Markdown({ source, className, hideLang }: { source: string; className?: string; hideLang?: CodeLang | null }) {
  const html = useMemo(() => renderMarkdown(source, { hideLang }), [source, hideLang]);
  const ref = useRef<HTMLDivElement>(null);
  const open = useRef<{ source: string; idx: Set<number> }>({ source, idx: new Set() });
  if (open.current.source !== source) open.current = { source, idx: new Set() };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll('details').forEach((d, i) => { if (open.current.idx.has(i)) d.open = true; });
  }, [html]);

  // `toggle` doesn't bubble: listen in the capture phase.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onToggle = () => {
      const idx = new Set<number>();
      el.querySelectorAll('details').forEach((d, i) => { if (d.open) idx.add(i); });
      open.current.idx = idx;
    };
    el.addEventListener('toggle', onToggle, true);
    return () => el.removeEventListener('toggle', onToggle, true);
  }, []);

  return (
    <div
      ref={ref}
      className={`markdown${className ? ` ${className}` : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
