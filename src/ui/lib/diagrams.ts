/**
 * Diagram fences → inline SVG. Author-facing syntax: docs/card-format.md.
 *
 *   ```tree   [3,9,20,null,null,15,7]           LeetCode level order; `9*` highlights a node
 *   ```graph  A -> B : 4   /   A -- B           one edge per line (-> directed, -- undirected, ~> dashed directed, `: w` weight)
 *   ```grid   1 1 0 / 0 1 0                     one row per line (spaces or commas, or a JSON 2D array); `1*` `1+` `1!` mark cells
 *   ```list   1 -> 2 -> 3 -> 4                  `cycle: 1` = tail points back to index 1 (LeetCode `pos`)
 *
 * Any fence may add a `caption: text` line. Renderers are pure and never throw: malformed input yields an
 * inline error box with the escaped source. All text is escaped; colours come from CSS classes (theme-aware).
 */
import { escapeHtml } from './escape';

export const DIAGRAM_KINDS = ['tree', 'graph', 'grid', 'list'] as const;
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];
export const isDiagramKind = (s: string): s is DiagramKind => (DIAGRAM_KINDS as readonly string[]).includes(s);

type Mark = '' | '*' | '+' | '!';
const MARK_CLASS: Record<Mark, string> = { '': '', '*': ' hl', '+': ' hl2', '!': ' hl3' };
/** Splits a trailing highlight marker off a token: `9*` → ['9','*']. */
function splitMark(tok: string): [string, Mark] {
  const m = /^(.*?)([*+!])$/.exec(tok);
  return m && m[1] !== '' ? [m[1], m[2] as Mark] : [tok, ''];
}

const MAX_ITEMS = 400;
const MAX_LABEL = 12;
const label = (s: string) => escapeHtml(s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + '…' : s);
const n1 = (x: number) => Math.round(x * 10) / 10;

class DiagramError extends Error {}
const fail = (m: string): never => { throw new DiagramError(m); };

/** Pulls `caption:` (and other `key: value` option lines listed in `keys`) out of the fence body. */
function options(src: string, keys: string[]): { body: string[]; opts: Record<string, string> } {
  const opts: Record<string, string> = {};
  const body: string[] = [];
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([a-z]+)\s*:\s*(.*)$/i.exec(line);
    if (m && [...keys, 'caption'].includes(m[1].toLowerCase())) opts[m[1].toLowerCase()] = m[2].trim();
    else body.push(line);
  }
  return { body, opts };
}

function svg(kind: DiagramKind, w: number, h: number, inner: string, caption?: string, title?: string): string {
  const W = n1(Math.max(w, 40)), H = n1(Math.max(h, 30));
  const t = title ? `<title>${escapeHtml(title)}</title>` : '';
  const svgEl = `<svg class="dg-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" xmlns="http://www.w3.org/2000/svg">${t}${inner}</svg>`;
  const cap = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
  return `<figure class="diagram diagram-${kind}">${svgEl}${cap}</figure>\n`;
}

const ARROW = (id: string) =>
  `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="dg-arrowhead" d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
let uid = 0;
const arrowId = () => `dg-arrow-${++uid}`;

// ---------------------------------------------------------------- tree

export interface TreeNode { v: string; mark: Mark; left: TreeNode | null; right: TreeNode | null }

/** Parses LeetCode level order (`[1,null,2]`, brackets/quotes optional). Returns null for an empty tree. */
export function parseTree(src: string): { root: TreeNode | null; caption?: string } {
  const { body, opts } = options(src, []);
  const text = body.join(' ').trim();
  if (!text) fail('empty tree');
  if (!/^\[?[^[\]]*\]?$/.test(text)) fail('tree must be one flat list like [1,2,3,null,4]');
  const inner = text.replace(/^\[/, '').replace(/\]$/, '').trim();
  const toks = inner === '' ? [] : inner.split(',').map((t) => t.trim().replace(/^["']|["']$/g, ''));
  if (toks.length > MAX_ITEMS) fail(`tree too large (> ${MAX_ITEMS})`);
  if (toks.some((t) => t === '')) fail('empty value in tree list');
  const mk = (t: string): TreeNode | null => {
    if (t.toLowerCase() === 'null' || t === '#') return null;
    const [v, mark] = splitMark(t);
    return { v, mark, left: null, right: null };
  };
  if (!toks.length) return { root: null, caption: opts.caption };
  const root = mk(toks[0]);
  if (!root) return { root: null, caption: opts.caption };
  const q: TreeNode[] = [root];
  let i = 1;
  while (q.length && i < toks.length) {
    const n = q.shift()!;
    n.left = mk(toks[i++]);
    if (n.left) q.push(n.left);
    if (i < toks.length) {
      n.right = mk(toks[i++]);
      if (n.right) q.push(n.right);
    }
  }
  return { root, caption: opts.caption };
}

export function renderTree(src: string): string {
  const { root, caption } = parseTree(src);
  if (!root) return svg('tree', 80, 36, `<text class="dg-label" x="40" y="22">(empty)</text>`, caption, 'empty tree');
  // x = in-order index, y = depth
  const pos = new Map<TreeNode, { x: number; y: number }>();
  let col = 0, depth = 0;
  const walk = (n: TreeNode | null, d: number) => {
    if (!n) return;
    walk(n.left, d + 1);
    pos.set(n, { x: col++, y: d });
    depth = Math.max(depth, d);
    walk(n.right, d + 1);
  };
  walk(root, 0);
  const R = 17, DX = 40, DY = 58, PAD = 8;
  const X = (c: number) => PAD + R + c * DX, Y = (d: number) => PAD + R + d * DY;
  let edges = '', nodes = '';
  for (const [n, p] of pos) {
    for (const ch of [n.left, n.right]) {
      if (!ch) continue;
      const q = pos.get(ch)!;
      edges += `<line class="dg-edge" x1="${X(p.x)}" y1="${Y(p.y)}" x2="${X(q.x)}" y2="${Y(q.y)}"/>`;
    }
    nodes += `<g class="dg-node${MARK_CLASS[n.mark]}"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${R}"/><text class="dg-label" x="${X(p.x)}" y="${Y(p.y)}">${label(n.v)}</text></g>`;
  }
  return svg('tree', 2 * PAD + 2 * R + (col - 1) * DX, 2 * PAD + 2 * R + depth * DY, edges + nodes, caption, 'binary tree');
}

// ---------------------------------------------------------------- graph

export interface GraphEdge { a: string; b: string; directed: boolean; w?: string; dashed?: boolean }
export interface Graph { nodes: { id: string; mark: Mark }[]; edges: GraphEdge[]; caption?: string }

/** One edge per line: `A -> B`, `A -- B`, `A ~> B` (dashed directed, e.g. a random pointer), optional ` : weight`; a bare `D` adds an isolated node (bare names listed first fix the layout order); `A*` highlights. Commas/semicolons also separate edges. */
export function parseGraph(src: string): Graph {
  const { body, opts } = options(src, []);
  const items = body.flatMap((l) => l.split(/[;,]/)).map((s) => s.trim()).filter(Boolean);
  if (!items.length) fail('empty graph');
  if (items.length > MAX_ITEMS) fail(`graph too large (> ${MAX_ITEMS})`);
  const nodes = new Map<string, Mark>();
  const add = (tok: string) => {
    const [id, mark] = splitMark(tok.trim());
    if (!id || /\s/.test(id)) fail(`bad node name "${tok.trim()}"`);
    if (!nodes.has(id) || mark) nodes.set(id, mark || nodes.get(id) || '');
    return id;
  };
  const edges: GraphEdge[] = [];
  for (const it of items) {
    const m = /^(.+?)\s*(<->|->|--|~>)\s*(.+?)(?:\s*:\s*(.+))?$/.exec(it);
    if (!m) { add(it); continue; }
    const a = add(m[1]), b = add(m[3]);
    if (m[2] === '<->') { edges.push({ a, b, directed: true, w: m[4] }, { a: b, b: a, directed: true }); continue; }
    if (m[2] === '~>') { edges.push({ a, b, directed: true, w: m[4], dashed: true }); continue; }
    edges.push({ a, b, directed: m[2] === '->', w: m[4] });
  }
  return { nodes: [...nodes].map(([id, mark]) => ({ id, mark })), edges, caption: opts.caption };
}

export function renderGraph(src: string): string {
  const g = parseGraph(src);
  const n = g.nodes.length;
  const R = 17;
  const rad = n <= 1 ? 0 : Math.max(48, (n * (2 * R + 16)) / (2 * Math.PI));
  const C = rad + R + 10;
  const at = new Map(g.nodes.map((v, i) => {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    return [v.id, { x: C + rad * Math.cos(t), y: C + rad * Math.sin(t) }];
  }));
  const id = arrowId();
  const pair = new Set(g.edges.map((e) => `${e.a}\n${e.b}`));
  let edges = '';
  for (const e of g.edges) {
    const p = at.get(e.a)!, q = at.get(e.b)!;
    if (e.a === e.b) { // self loop
      edges += `<circle class="dg-edge" cx="${n1(p.x)}" cy="${n1(p.y - R - 8)}" r="9" fill="none"/>`;
      continue;
    }
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // opposite directed edges are offset sideways so both stay visible
    const off = e.directed && pair.has(`${e.b}\n${e.a}`) ? 5 : 0;
    const ox = -uy * off, oy = ux * off;
    const x1 = p.x + ux * R + ox, y1 = p.y + uy * R + oy, x2 = q.x - ux * (R + (e.directed ? 2 : 0)) + ox, y2 = q.y - uy * (R + (e.directed ? 2 : 0)) + oy;
    edges += `<line class="dg-edge${e.dashed ? ' dg-dashed' : ''}" x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}"${e.directed ? ` marker-end="url(#${id})"` : ''}/>`;
    if (e.w !== undefined) {
      // weight sits beside the edge midpoint: rim edges put it outside the circle; chords (midpoint near the centre)
      // take whichever side is farther from every node, so the label can't be read as a neighbouring edge's weight
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const side = (k: number) => ({ x: cx - uy * 10 * k, y: cy + ux * 10 * k });
      const clearance = (pt: { x: number; y: number }) => Math.min(...[...at.values()].map((v) => Math.hypot(v.x - pt.x, v.y - pt.y)));
      const chord = Math.hypot(cx - C, cy - C) < rad * Math.cos(Math.PI / n) - 6; // rim edges' midpoints sit at rad·cos(π/n)
      const s = chord ? (clearance(side(1)) >= clearance(side(-1)) ? 1 : -1) : (cx - C) * -uy + (cy - C) * ux >= 0 ? 1 : -1;
      const { x: mx, y: my } = side(s);
      edges += `<text class="dg-weight" x="${n1(mx)}" y="${n1(my)}">${label(e.w)}</text>`;
    }
  }
  let nodes = '';
  for (const v of g.nodes) {
    const p = at.get(v.id)!;
    nodes += `<g class="dg-node${MARK_CLASS[v.mark]}"><circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${R}"/><text class="dg-label" x="${n1(p.x)}" y="${n1(p.y)}">${label(v.id)}</text></g>`;
  }
  const directed = g.edges.some((e) => e.directed);
  return svg('graph', 2 * C, 2 * C, (directed ? ARROW(id) : '') + edges + nodes, g.caption, `${directed ? 'directed' : 'undirected'} graph`);
}

// ---------------------------------------------------------------- grid

export interface Grid { rows: { v: string; mark: Mark }[][]; caption?: string }

/** Rows of cells: whitespace/comma separated per line, or one JSON 2D array. `1*` `1+` `1!` mark a cell. */
export function parseGrid(src: string): Grid {
  const { body, opts } = options(src, []);
  if (!body.length) fail('empty grid');
  let raw: string[][];
  const joined = body.join('');
  if (joined.startsWith('[[') || (joined.startsWith('[') && body.length === 1 && joined.includes('['))) {
    let parsed: unknown;
    try { parsed = JSON.parse(joined.replace(/'/g, '"')); } catch { return fail('grid JSON does not parse'); }
    if (!Array.isArray(parsed) || !parsed.every(Array.isArray)) fail('grid JSON must be a 2D array');
    raw = (parsed as unknown[][]).map((r) => r.map((c) => String(c)));
  } else {
    raw = body.map((l) => l.replace(/^\[|\],?$/g, '').split(/[\s,]+/).map((c) => c.replace(/^["']|["']$/g, '')).filter((c) => c !== ''));
  }
  if (!raw.length || raw.every((r) => !r.length)) fail('empty grid');
  if (raw.length * Math.max(...raw.map((r) => r.length)) > MAX_ITEMS) fail(`grid too large (> ${MAX_ITEMS} cells)`);
  return { rows: raw.map((r) => r.map((c) => { const [v, mark] = splitMark(c); return { v, mark }; })), caption: opts.caption };
}

export function renderGrid(src: string): string {
  const g = parseGrid(src);
  const cols = Math.max(...g.rows.map((r) => r.length));
  const S = 34, PAD = 2;
  let cells = '';
  g.rows.forEach((r, i) => r.forEach((c, j) => {
    const x = PAD + j * S, y = PAD + i * S;
    cells += `<g class="dg-cell${MARK_CLASS[c.mark]}"><rect x="${x}" y="${y}" width="${S}" height="${S}"/><text class="dg-label" x="${x + S / 2}" y="${y + S / 2}">${label(c.v)}</text></g>`;
  }));
  return svg('grid', 2 * PAD + cols * S, 2 * PAD + g.rows.length * S, cells, g.caption, `${g.rows.length} by ${cols} grid`);
}

// ---------------------------------------------------------------- linked list

export interface List { nodes: { v: string; mark: Mark }[]; cycle: number | null; caption?: string }

/** `1 -> 2 -> 3` (or `[1,2,3]`); `cycle: k` makes the tail point back to node k (0-based, LeetCode `pos`; -1 = none). */
export function parseList(src: string): List {
  const { body, opts } = options(src, ['cycle', 'pos']);
  const text = body.join(' ').trim().replace(/^\[|\]$/g, '');
  const toks = text === '' ? [] : text.split(/\s*(?:->|,)\s*/).map((t) => t.trim()).filter((t) => t !== '' && t.toLowerCase() !== 'null');
  if (toks.length > MAX_ITEMS) fail(`list too large (> ${MAX_ITEMS})`);
  const c = opts.cycle ?? opts.pos;
  let cycle: number | null = null;
  if (c !== undefined) {
    if (!/^-?\d+$/.test(c)) fail(`cycle must be an index, got "${c}"`);
    const k = Number(c);
    if (k >= toks.length) fail(`cycle index ${k} out of range (list has ${toks.length} nodes)`);
    cycle = k < 0 ? null : k;
  }
  return { nodes: toks.map((t) => { const [v, mark] = splitMark(t); return { v, mark }; }), cycle, caption: opts.caption };
}

export function renderList(src: string): string {
  const l = parseList(src);
  if (!l.nodes.length) return svg('list', 80, 36, `<text class="dg-label" x="40" y="18">null</text>`, l.caption, 'empty list');
  // wraps onto several rows so long lists stay readable on a phone
  const W = 40, H = 30, GAP = 26, PER = 6, PAD = 4, ROWH = H + 34;
  const id = arrowId();
  const xy = (i: number) => ({ x: PAD + (i % PER) * (W + GAP), y: PAD + Math.floor(i / PER) * ROWH + (l.cycle !== null ? 0 : 0) });
  let out = ARROW(id);
  l.nodes.forEach((nd, i) => {
    const { x, y } = xy(i);
    out += `<g class="dg-node${MARK_CLASS[nd.mark]}"><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="7"/><text class="dg-label" x="${x + W / 2}" y="${y + H / 2}">${label(nd.v)}</text></g>`;
    if (i + 1 < l.nodes.length) {
      const q = xy(i + 1);
      if (q.y === y) out += `<line class="dg-edge" x1="${x + W}" y1="${y + H / 2}" x2="${q.x - 2}" y2="${q.y + H / 2}" marker-end="url(#${id})"/>`;
      else out += `<path class="dg-edge" fill="none" d="M${x + W / 2},${y + H} V${y + H + 14} H${q.x + W / 2} V${q.y - 2}" marker-end="url(#${id})"/>`;
    }
  });
  const last = l.nodes.length - 1;
  const rows = Math.floor(last / PER) + 1;
  let height = PAD * 2 + (rows - 1) * ROWH + H;
  if (l.cycle !== null) {
    const a = xy(last), b = xy(l.cycle);
    const yb = Math.max(a.y, b.y) + H + 16;
    out += `<path class="dg-edge dg-cycle" fill="none" d="M${a.x + W / 2},${a.y + H} V${yb} H${b.x + W / 2} V${b.y + H + 2}" marker-end="url(#${id})"/>`;
    height = yb + PAD + 2;
  } else {
    const { x, y } = xy(last);
    out += `<text class="dg-null" x="${x + W + 14}" y="${y + H / 2}">∅</text>`;
  }
  const cols = Math.min(PER, l.nodes.length);
  return svg('list', PAD * 2 + cols * W + (cols - 1) * GAP + (l.cycle === null ? 24 : 0), height, out, l.caption, `linked list${l.cycle !== null ? ' with cycle' : ''}`);
}

// ---------------------------------------------------------------- entry

const RENDER: Record<DiagramKind, (src: string) => string> = { tree: renderTree, graph: renderGraph, grid: renderGrid, list: renderList };

/** Renders a diagram fence; never throws. */
export function renderDiagram(kind: DiagramKind, src: string): string {
  try {
    return RENDER[kind](src ?? '');
  } catch (e) {
    const msg = e instanceof DiagramError ? e.message : 'could not draw diagram';
    return `<div class="diagram-error"><div class="diagram-error-title">${escapeHtml(kind)} diagram: ${escapeHtml(msg)}</div><pre><code>${escapeHtml(src ?? '')}</code></pre></div>\n`;
  }
}
