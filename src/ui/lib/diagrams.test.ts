import { describe, expect, it } from 'vitest';
import { parseGraph, parseGrid, parseList, parseTree, renderDiagram } from './diagrams';
import { renderMarkdown } from './markdown';

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const isSvg = (h: string) => h.startsWith('<figure class="diagram') && h.includes('<svg') && !h.includes('diagram-error');
const isErr = (h: string) => h.includes('class="diagram-error"');

describe('tree', () => {
  it('parses LeetCode level order with nulls', () => {
    const { root } = parseTree('[3,9,20,null,null,15,7]');
    expect(root?.v).toBe('3');
    expect(root?.left?.v).toBe('9');
    expect(root?.left?.left).toBeNull();
    expect(root?.right?.left?.v).toBe('15');
    expect(root?.right?.right?.v).toBe('7');
  });
  it('right-skewed tree and highlight markers', () => {
    const { root } = parseTree('1,null,2*,null,3');
    expect(root?.right?.v).toBe('2');
    expect(root?.right?.mark).toBe('*');
    expect(root?.right?.right?.v).toBe('3');
  });
  it('renders one circle per node and n-1 edges', () => {
    const h = renderDiagram('tree', '[4,2,7,1,3,6,9]');
    expect(isSvg(h)).toBe(true);
    expect(count(h, /<circle/g)).toBe(7);
    expect(count(h, /<line/g)).toBe(6);
  });
  it('empty tree [] renders a placeholder, not an error', () => {
    expect(isSvg(renderDiagram('tree', '[]'))).toBe(true);
  });
  it('caption line', () => {
    expect(renderDiagram('tree', '[1,2]\ncaption: before')).toContain('<figcaption>before</figcaption>');
  });
  it.each(['', '[1,,2]', '[[1],[2]]', '[1,2'.repeat(300)])('malformed %j → error box, no throw', (src) => {
    expect(isErr(renderDiagram('tree', src))).toBe(true);
  });
});

describe('graph', () => {
  it('parses directed, undirected, weighted edges and isolated nodes', () => {
    const g = parseGraph('A -> B : 4\nB -- C\nD');
    expect(g.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(g.edges).toEqual([
      { a: 'A', b: 'B', directed: true, w: '4' },
      { a: 'B', b: 'C', directed: false, w: undefined },
    ]);
  });
  it('comma separated edges and <->', () => {
    const g = parseGraph('0 -- 1, 1 -- 2; 2 <-> 0');
    expect(g.nodes).toHaveLength(3);
    expect(g.edges).toHaveLength(4);
  });
  it('renders nodes, edges, arrowheads only when directed, weights', () => {
    const d = renderDiagram('graph', 'A -> B : 4\nB -> C');
    expect(isSvg(d)).toBe(true);
    expect(count(d, /<circle/g)).toBe(3);
    expect(count(d, /marker-end=/g)).toBe(2);
    expect(d).toContain('>4</text>');
    expect(renderDiagram('graph', '1 -- 2')).not.toContain('marker-end');
  });
  it('escapes labels', () => {
    const d = renderDiagram('graph', '<b> -- x');
    expect(d).not.toContain('<b>');
    expect(d).toContain('&lt;b&gt;');
  });
  it.each(['', '   \n  ', 'a b -- c'])('malformed %j → error box', (src) => {
    expect(isErr(renderDiagram('graph', src))).toBe(true);
  });
});

describe('grid', () => {
  it('parses whitespace rows with markers', () => {
    const g = parseGrid('1* 1 0\n0 1+ 0');
    expect(g.rows.map((r) => r.map((c) => c.v))).toEqual([['1', '1', '0'], ['0', '1', '0']]);
    expect(g.rows[0][0].mark).toBe('*');
    expect(g.rows[1][1].mark).toBe('+');
  });
  it('parses a JSON 2D array (LeetCode style)', () => {
    const g = parseGrid('[["1","0"],["0","1"]]');
    expect(g.rows).toHaveLength(2);
    expect(g.rows[1][1].v).toBe('1');
  });
  it('renders one rect per cell, highlight classes', () => {
    const d = renderDiagram('grid', '1* 0\n0 1!');
    expect(isSvg(d)).toBe(true);
    expect(count(d, /<rect/g)).toBe(4);
    expect(d).toContain('dg-cell hl"');
    expect(d).toContain('dg-cell hl3"');
  });
  it('ragged rows still render', () => {
    expect(isSvg(renderDiagram('grid', '1 2 3\n4'))).toBe(true);
  });
  it.each(['', '[[1,2],[3', '[1,2,3]x'.repeat(1), '0 '.repeat(500)])('malformed %j → error box', (src) => {
    expect(isErr(renderDiagram('grid', src))).toBe(true);
  });
});

describe('list', () => {
  it('parses arrows and cycle', () => {
    const l = parseList('3 -> 2 -> 0 -> -4\ncycle: 1');
    expect(l.nodes.map((n) => n.v)).toEqual(['3', '2', '0', '-4']);
    expect(l.cycle).toBe(1);
  });
  it('bracket form, cycle -1 = none, trailing null ignored', () => {
    const l = parseList('[1,2,null]\npos: -1');
    expect(l.nodes).toHaveLength(2);
    expect(l.cycle).toBeNull();
  });
  it('renders nodes, arrows and a cycle path; wraps long lists', () => {
    const d = renderDiagram('list', '1 -> 2 -> 3\ncycle: 0');
    expect(isSvg(d)).toBe(true);
    expect(count(d, /<rect/g)).toBe(3);
    expect(d).toContain('dg-cycle');
    const long = renderDiagram('list', Array.from({ length: 14 }, (_, i) => i).join(' -> '));
    expect(count(long, /<rect/g)).toBe(14);
    expect(long).toContain('<path'); // row wrap connector
  });
  it('empty list renders null', () => {
    expect(renderDiagram('list', '[]')).toContain('null');
  });
  it.each(['1 -> 2\ncycle: 5', '1 -> 2\ncycle: x'])('malformed %j → error box', (src) => {
    expect(isErr(renderDiagram('list', src))).toBe(true);
  });
});

describe('diagram fences in markdown', () => {
  it('```tree etc. become SVG; other fences stay code', () => {
    const h = renderMarkdown('```tree\n[1,2,3]\n```\n\n```grid\n1 0\n```\n\n```python\nx = 1\n```');
    expect(count(h, /<figure class="diagram/g)).toBe(2);
    expect(h).toContain('language-python');
  });
  it('a malformed diagram does not break the rest of the card', () => {
    const h = renderMarkdown('before\n\n```graph\n\n```\n\nafter **bold**');
    expect(h).toContain('diagram-error');
    expect(h).toContain('<strong>bold</strong>');
  });
});
