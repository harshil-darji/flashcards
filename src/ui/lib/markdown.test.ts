import { describe, expect, it } from 'vitest';
import { plainPreview, renderMarkdown } from './markdown';
import leetcode from '../../seed/leetcode.json';
import nc from '../../seed/neetcode150-a.json';

const back = [
  '- Input is **sorted**',
  '',
  '**Java**',
  '',
  '```java',
  'int f(int x) {',
  '    return x < 1 ? 0 : x;',
  '}',
  '```',
  '',
  '**Python**',
  '',
  '```python',
  'def f(x):',
  '    return 0 if x < 1 else x',
  '```',
].join('\n');

const codeBlocks = (html: string) => [...html.matchAll(/<pre><code class="hljs language-(\w+)">([\s\S]*?)<\/code><\/pre>/g)].map((m) => ({ lang: m[1], body: m[2] }));

describe('renderMarkdown: back with Java + Python fences', () => {
  it('renders both headings and both highlighted code blocks, in order', () => {
    const html = renderMarkdown(back);
    expect(html).toContain('<p class="code-label" data-code-lang="java"><strong>Java</strong></p>');
    expect(html).toContain('<p class="code-label" data-code-lang="python"><strong>Python</strong></p>');
    const blocks = codeBlocks(html);
    expect(blocks.map((b) => b.lang)).toEqual(['java', 'python']);
    expect(blocks[0].body).toContain('hljs-keyword');
    expect(blocks[1].body).toContain('<span class="hljs-keyword">def</span>');
    expect(blocks[1].body).toContain('&lt;'); // `<` escaped inside code
    expect(html.indexOf('Python')).toBeLessThan(html.indexOf('language-python'));
  });

  it('every seed card with Java + Python renders both code blocks', () => {
    const cards = [...(leetcode as { cards: { back: string }[] }).cards, ...(nc as { cards: { back: string }[] }).cards];
    const both = cards.filter((c) => c.back.includes('```java') && c.back.includes('```python'));
    expect(both.length).toBeGreaterThan(50);
    for (const c of both) {
      const langs = codeBlocks(renderMarkdown(c.back)).map((b) => b.lang);
      expect(langs).toContain('java');
      expect(langs).toContain('python');
    }
  });

  it('search preview collapses both fences', () => {
    expect(plainPreview(back, 500)).toBe('Input is sorted Java ⟨code⟩ Python ⟨code⟩');
  });
});
