import { Marked, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/core';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';

hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);

import { escapeHtml } from './escape';
import { isDiagramKind, renderDiagram } from './diagrams';
import type { CodeLang } from './codeLang';

export { escapeHtml };

/** Language whose code blocks (and their `**Java**` / `**Python**` label) get `.code-hidden` during the current parse. */
let hiddenLang: CodeLang | null = null;
const CODE_LANGS: Record<string, CodeLang> = { java: 'java', python: 'python', py: 'python' };
const hideCls = (lang: CodeLang | undefined) => (lang && lang === hiddenLang ? ' code-hidden' : '');

interface DetailsToken extends Tokens.Generic { type: 'details'; raw: string; title: string; tokens: Tokens.Generic[] }
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * `:::details Title` … `:::` → collapsed <details>. The body is full Markdown (code fences, diagrams);
 * a `:::` inside a code fence does not close it. An unclosed block runs to the end of the text.
 */
const detailsExtension = {
  name: 'details',
  level: 'block' as const,
  start(src: string) { return /^:::details\b/m.exec(src)?.index; },
  tokenizer(this: { lexer: { blockTokens: (s: string, t: Tokens.Generic[]) => Tokens.Generic[] } }, src: string): DetailsToken | undefined {
    const head = /^:::details\b[ \t]*([^\n]*)(?:\n|$)/.exec(src);
    if (!head) return undefined;
    let i = head[0].length;
    let fence: string | null = null;
    let body = '';
    let closed = false;
    while (i < src.length) {
      const nl = src.indexOf('\n', i);
      const end = nl === -1 ? src.length : nl + 1;
      const line = src.slice(i, end);
      const f = FENCE.exec(line);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^\s*$/.test(line.slice(f[0].length))) fence = null;
      } else if (f) fence = f[1];
      else if (/^ {0,3}:::[ \t]*(?:\n|$)/.test(line)) { i = end; closed = true; break; }
      body += line;
      i = end;
    }
    void closed;
    const title = head[1].trim() || 'Details';
    return { type: 'details', raw: src.slice(0, i), title, tokens: this.lexer.blockTokens(body, []) };
  },
  renderer(this: { parser: { parse: (t: Tokens.Generic[]) => string; parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Generic) {
    const t = token as DetailsToken;
    return `<details class="md-details"><summary>${escapeHtml(t.title)}</summary><div class="md-details-body">${this.parser.parse(t.tokens)}</div></details>\n`;
  },
};

const SAFE_URL = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;
const safeHref = (href: string): string | null => {
  const h = href.trim();
  return SAFE_URL.test(h) || !/^[a-z][a-z0-9+.-]*:/i.test(h) ? h : null;
};

const md = new Marked({
  gfm: true,
  breaks: true,
  extensions: [detailsExtension],
  renderer: {
    // Raw HTML (block or inline) is shown as text, never injected.
    html({ text }) {
      return escapeHtml(text);
    },
    code({ text, lang }: Tokens.Code) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      if (isDiagramKind(language)) return renderDiagram(language, text);
      let body: string;
      if (language && hljs.getLanguage(language)) {
        body = hljs.highlight(text, { language, ignoreIllegals: true }).value;
      } else {
        body = escapeHtml(text);
      }
      const cls = language ? ` language-${escapeHtml(language)}` : '';
      const hidden = hideCls(CODE_LANGS[language]);
      return `<pre${hidden ? ` class="${hidden.trim()}"` : ''}><code class="hljs${cls}">${body}</code></pre>\n`;
    },
    // A paragraph that is only **Java** / **Python** labels the code block below it.
    paragraph({ tokens }: Tokens.Paragraph) {
      if (tokens.length !== 1 || tokens[0].type !== 'strong') return false;
      const lang = CODE_LANGS[(tokens[0] as Tokens.Strong).text.trim().toLowerCase()];
      if (!lang) return false;
      return `<p class="code-label${hideCls(lang)}" data-code-lang="${lang}">${this.parser.parseInline(tokens)}</p>\n`;
    },
    link(token: Tokens.Link) {
      const inner = this.parser.parseInline(token.tokens);
      const href = safeHref(token.href);
      if (!href) return inner;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${escapeHtml(href)}"${title} target="_blank" rel="noopener noreferrer">${inner}</a>`;
    },
    image(token: Tokens.Image) {
      const href = safeHref(token.href);
      if (!href) return escapeHtml(token.text);
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(token.text)}" loading="lazy">`;
    },
  },
});

/**
 * Markdown → sanitized HTML (raw HTML escaped, unsafe URLs dropped, code highlighted, diagram fences → SVG,
 * `:::details` blocks). `hideLang` marks that language's code blocks and labels `.code-hidden` (kept in the DOM).
 */
export function renderMarkdown(src: string, opts: { hideLang?: CodeLang | null } = {}): string {
  hiddenLang = opts.hideLang ?? null;
  try {
    return md.parse(src ?? '', { async: false }) as string;
  } finally {
    hiddenLang = null;
  }
}

/** Plain-text one-line preview of a Markdown string. */
export function plainPreview(src: string, max = 120): string {
  const s = (src ?? '')
    .replace(/```(tree|graph|grid|list)\b[\s\S]*?```/g, ' ⟨diagram⟩ ')
    .replace(/```[\s\S]*?```/g, ' ⟨code⟩ ')
    .replace(/^:::details[ \t]*/gm, '')
    .replace(/^:::[ \t]*$/gm, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[#>*_~\[\]()!|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
