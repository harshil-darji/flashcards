import { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';

/** Renders Markdown with highlighted code. Raw HTML in the source is escaped (see lib/markdown). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div className={`markdown${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
