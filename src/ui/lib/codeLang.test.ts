import { describe, expect, it } from 'vitest';
import { codeLangsIn, hiddenLangFor } from './codeLang';
import { renderMarkdown } from './markdown';

const both = [
  '**Java**', '', '```java', 'int a;', '```', '', '**Python**', '', '```python', 'a = 1', '```',
  '', ':::details BFS', '**Java**', '', '```java', 'int b;', '```', '', '**Python**', '', '```python', 'b = 2', '```', ':::',
].join('\n');

/** Visible (not .code-hidden) code languages and labels in rendered HTML. */
const visible = (html: string) => ({
  code: [...html.matchAll(/<pre( class="code-hidden")?><code class="hljs language-(\w+)"/g)].filter((m) => !m[1]).map((m) => m[2]),
  hiddenCode: [...html.matchAll(/<pre class="code-hidden"><code class="hljs language-(\w+)"/g)].map((m) => m[1]),
  labels: [...html.matchAll(/<p class="code-label( code-hidden)?" data-code-lang="(\w+)"/g)].filter((m) => !m[1]).map((m) => m[2]),
});

describe('code language filter', () => {
  it('detects fenced languages', () => {
    expect([...codeLangsIn(both)].sort()).toEqual(['java', 'python']);
    expect([...codeLangsIn('```py\nx\n```')]).toEqual(['python']);
    expect(codeLangsIn('no code, **Java** mentioned').size).toBe(0);
  });
  it('hides the other language only when the card has both', () => {
    const j = new Set(['java'] as const), jp = new Set(['java', 'python'] as const);
    expect(hiddenLangFor('java', jp)).toBe('python');
    expect(hiddenLangFor('python', jp)).toBe('java');
    expect(hiddenLangFor('python', j)).toBeNull();
    expect(hiddenLangFor('java', new Set())).toBeNull();
  });
  it('Java selected: python blocks + labels hidden (kept in DOM), including inside details', () => {
    const v = visible(renderMarkdown(both, { hideLang: 'python' }));
    expect(v.code).toEqual(['java', 'java']);
    expect(v.hiddenCode).toEqual(['python', 'python']);
    expect(v.labels).toEqual(['java', 'java']);
  });
  it('Python selected: java hidden', () => {
    const h = renderMarkdown(both, { hideLang: 'java' });
    expect(visible(h).code).toEqual(['python', 'python']);
    expect(h).toContain('</span> a;</code></pre>'); // hidden, not removed
  });
  it('no filter: everything visible; a single-language card is never filtered', () => {
    expect(visible(renderMarkdown(both)).code).toEqual(['java', 'python', 'java', 'python']);
    const only = '**Python**\n\n```python\nx = 1\n```';
    const h = renderMarkdown(only, { hideLang: hiddenLangFor('java', codeLangsIn(only)) });
    expect(visible(h).code).toEqual(['python']);
  });
  it('filter state does not leak into the next render', () => {
    renderMarkdown(both, { hideLang: 'java' });
    expect(renderMarkdown(both)).not.toContain('code-hidden');
  });
});
