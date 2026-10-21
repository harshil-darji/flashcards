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

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const SAFE_URL = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;
const safeHref = (href: string): string | null => {
  const h = href.trim();
  return SAFE_URL.test(h) || !/^[a-z][a-z0-9+.-]*:/i.test(h) ? h : null;
};

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Raw HTML (block or inline) is shown as text, never injected.
    html({ text }) {
      return escapeHtml(text);
    },
    code({ text, lang }: Tokens.Code) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      let body: string;
      if (language && hljs.getLanguage(language)) {
        body = hljs.highlight(text, { language, ignoreIllegals: true }).value;
      } else {
        body = escapeHtml(text);
      }
      const cls = language ? ` language-${escapeHtml(language)}` : '';
      return `<pre><code class="hljs${cls}">${body}</code></pre>\n`;
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

/** Markdown → sanitized HTML (raw HTML escaped, unsafe URLs dropped, code highlighted). */
export function renderMarkdown(src: string): string {
  return md.parse(src ?? '', { async: false }) as string;
}

/** Plain-text one-line preview of a Markdown string. */
export function plainPreview(src: string, max = 120): string {
  const s = (src ?? '')
    .replace(/```[\s\S]*?```/g, ' ⟨code⟩ ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[#>*_~\[\]()!|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
