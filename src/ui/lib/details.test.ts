import { describe, expect, it } from 'vitest';
import { plainPreview, renderMarkdown } from './markdown';

const src = [
  'Intro',
  '',
  ':::details DFS (recursive)',
  'Visit **each** node.',
  '',
  '```java',
  'int x = 1;',
  ':::',
  '```',
  '',
  '```tree',
  '[1,2]',
  '```',
  ':::',
  '',
  ':::details BFS',
  '- queue',
  ':::',
  '',
  'Outro',
].join('\n');

describe(':::details', () => {
  const h = renderMarkdown(src);
  it('renders collapsed <details> with summary, in order', () => {
    expect((h.match(/<details class="md-details">/g) ?? []).length).toBe(2);
    expect(h).not.toContain('<details class="md-details" open');
    expect(h).toContain('<summary>DFS (recursive)</summary>');
    expect(h).toContain('<summary>BFS</summary>');
    expect(h.indexOf('Intro')).toBeLessThan(h.indexOf('DFS'));
    expect(h.indexOf('BFS')).toBeLessThan(h.indexOf('Outro'));
  });
  it('body is full markdown: bold, code fence (with a ::: line inside it), diagram, list', () => {
    const body = h.slice(h.indexOf('DFS'), h.indexOf('BFS'));
    expect(body).toContain('<strong>each</strong>');
    expect(body).toContain('language-java');
    expect(body).toMatch(/;\n:::<\/code><\/pre>/); // `:::` inside the fence did not close the block
    expect(body).toContain('diagram-tree');
    expect(h).toContain('<li>queue</li>');
    expect(h).toContain('<p>Outro</p>');
    expect(h).not.toMatch(/<p>:::/);
  });
  it('escapes the title and raw HTML in the body', () => {
    const x = renderMarkdown(':::details <img src=x onerror=alert(1)>\n<script>alert(1)</script>\n:::');
    expect(x).not.toContain('<img');
    expect(x).not.toContain('<script');
    expect(x).toContain('&lt;script&gt;');
  });
  it('unclosed block runs to the end without crashing; empty title gets a default', () => {
    const x = renderMarkdown(':::details\nonly body');
    expect(x).toContain('<summary>Details</summary>');
    expect(x).toContain('only body');
  });
  it('raw <details> HTML stays escaped (not the supported syntax)', () => {
    expect(renderMarkdown('<details><summary>x</summary>y</details>')).not.toContain('<details');
  });
  it('plain preview drops markers and summarizes diagrams', () => {
    expect(plainPreview(':::details BFS\n```tree\n[1]\n```\n:::', 200)).toBe('BFS ⟨diagram⟩');
  });
});
