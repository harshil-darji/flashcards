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
  it('~> is a dashed directed edge (random pointers next to solid next pointers)', () => {
    const g = parseGraph('7 -> 13\n13 ~> 7');
    expect(g.edges).toEqual([
      { a: '7', b: '13', directed: true, w: undefined },
      { a: '13', b: '7', directed: true, w: undefined, dashed: true },
    ]);
    const d = renderDiagram('graph', '7 -> 13\n13 ~> 7');
    expect(count(d, /class="dg-edge dg-dashed"/g)).toBe(1);
    expect(count(d, /class="dg-edge"/g)).toBe(1);
    expect(count(d, /marker-end=/g)).toBe(2);
  });
  it('bare names listed first fix the circle order', () => {
    expect(parseGraph('a\nc\nb\na -- b\nb -- c').nodes.map((n) => n.id)).toEqual(['a', 'c', 'b']);
  });
  it('weight labels sit on the outer side of rim edges', () => {
    // square 0(top) 1(right) 2(bottom) 3(left); every weight must be farther from the centre than its edge midpoint
    const d = renderDiagram('graph', '0 -- 1 : 5\n1 -- 2 : 6\n2 -- 3 : 7\n3 -- 0 : 8');
    const vb = /viewBox="0 0 ([\d.]+)/.exec(d)!; const C = Number(vb[1]) / 2;
    const lines = [...d.matchAll(/<line class="dg-edge" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)].map((m) => m.slice(1).map(Number));
    const ws = [...d.matchAll(/<text class="dg-weight" x="([\d.-]+)" y="([\d.-]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(ws).toHaveLength(4);
    ws.forEach(([x, y], i) => {
      const [x1, y1, x2, y2] = lines[i];
      expect(Math.hypot(x - C, y - C)).toBeGreaterThan(Math.hypot((x1 + x2) / 2 - C, (y1 + y2) / 2 - C));
    });
  });
  it('triangle edges are rim edges: weights go outside', () => {
    const d = renderDiagram('graph', '0 -> 1 : 100\n1 -> 2 : 100\n0 -> 2 : 500');
    const C = Number(/viewBox="0 0 ([\d.]+)/.exec(d)![1]) / 2;
    const lines = [...d.matchAll(/<line class="dg-edge" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)].map((m) => m.slice(1).map(Number));
    [...d.matchAll(/<text class="dg-weight" x="([\d.-]+)" y="([\d.-]+)"/g)].forEach((m, i) => {
      const [x1, y1, x2, y2] = lines[i];
      expect(Math.hypot(Number(m[1]) - C, Number(m[2]) - C)).toBeGreaterThan(Math.hypot((x1 + x2) / 2 - C, (y1 + y2) / 2 - C));
    });
  });
  it('a chord weight goes to the side with more room, away from the nodes', () => {
    // pentagon A(top) B C D E clockwise; chord B -- E runs under A: its weight must go below the chord, not up next to A
    const d = renderDiagram('graph', 'A -- B\nB -- C\nC -- D\nD -- E\nB -- E : 9');
    const [, x1, y1, x2, y2] = [...d.matchAll(/<line class="dg-edge" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)][4].map(Number);
    const [, , wy] = /<text class="dg-weight" x="([\d.-]+)" y="([\d.-]+)"/.exec(d)!.map(Number);
    expect(wy).toBeGreaterThan((y1 + y2) / 2);
    expect(Math.abs(x1 - x2)).toBeGreaterThan(Math.abs(y1 - y2));
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
