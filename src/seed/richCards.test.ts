import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../ui/lib/markdown';
import a from './neetcode150-a.json';
import b from './neetcode150-b.json';
import c from './neetcode150-c.json';

type SeedCard = { id: string; front: string; back: string };
const all = [a, b, c].flatMap((f) => (f as { cards: SeedCard[] }).cards);
/** Cards in the rich format (docs/card-format.md): any card whose back uses :::details. */
const rich = all.filter((x) => /^:::details/m.test(x.back));

describe('rich NC150 cards (docs/card-format.md)', () => {
  it('golden examples are rich', () => {
    expect(rich.map((x) => x.id)).toEqual(expect.arrayContaining(['nc150-invert-binary-tree', 'nc150-number-of-islands']));
  });
  it.each(rich.map((x) => [x.id, x] as const))('%s follows the required structure and renders cleanly', (_id, card) => {
    const front = renderMarkdown(card.front), back = renderMarkdown(card.back);
    expect(card.front).toMatch(/^\*\*[^*]+\*\* · (Easy|Medium|Hard)\n/);
    expect(card.front).toContain('**Constraints**');
    expect(card.front).toMatch(/\*\*Example 1\*\*/);
    expect(card.front).toMatch(/\[NeetCode\]\(https:\/\/neetcode\.io\/problems\/[a-z0-9-]+\)/);
    expect(card.back).toMatch(/^\*\*Key idea:\*\*/);
    expect(card.back).toContain('**Brute force:**');
    for (const h of [front, back]) {
      expect(h).not.toContain('diagram-error');
      expect(h).not.toMatch(/<p>:::/);
    }
    const sections = back.split('<details class="md-details">').slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    for (const s of sections) {
      expect(s).toContain('language-java');
      expect(s).toContain('language-python');
      expect(s).toContain('<strong>Time:</strong>');
      expect(s).toContain('<strong>Space:</strong>');
    }
  });
});
