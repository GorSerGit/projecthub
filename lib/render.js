// Экспорт страниц в Markdown / HTML / тело письма, CSV таблиц, разбор CSV.
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// Разметка внутри текста: оставляем только безопасные теги, атрибуты вычищаем (кроме href у ссылок)
const INLINE = new Set(['b', 'i', 'u', 's', 'code', 'a', 'br', 'mark']), ALIAS = { strong: 'b', em: 'i', strike: 's', del: 's' };
function cleanInline(html) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, txt = s => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    out += txt(html.slice(last, m.index)); last = re.lastIndex;
    const tag = ALIAS[m[2].toLowerCase()] || m[2].toLowerCase();
    if (!INLINE.has(tag)) continue;
    if (tag === 'br') { if (!m[1]) out += '<br>'; continue; }
    if (m[1]) { out += `</${tag}>`; continue; }
    if (tag === 'a') { const href = (m[3].match(/href\s*=\s*"([^"]*)"/i) || [])[1] || ''; out += /^\s*(https?:|mailto:)/i.test(href.replace(/&amp;/g, '&')) ? `<a href="${href}">` : '<a>'; continue; }
    out += `<${tag}>`;
  }
  return out + txt(html.slice(last));
}
const inlineMd = html => dec(cleanInline(html).replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, '[$2]($1)').replace(/<br>/g, '\n')
  .replace(/<\/?b>/g, '**').replace(/<\/?i>/g, '*').replace(/<\/?s>/g, '~~').replace(/<\/?code>/g, '`').replace(/<[^>]+>/g, ''));
const tHtml = (c, k = 'text', hk = 'html') => c[hk] ? cleanInline(c[hk]) : esc(c[k] || '').replace(/\n/g, '<br>');
const tMd = (c, k = 'text', hk = 'html') => c[hk] ? inlineMd(c[hk]) : (c[k] || '');

const pos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
const DEF_COLS = [{ key: 'Todo', name: 'К выполнению' }, { key: 'In Progress', name: 'В работе' }, { key: 'Done', name: 'Готово' }];
const kanbanCols = (b, cards) => {
  const cols = (b.properties.columns && b.properties.columns.length ? b.properties.columns : DEF_COLS).map(c => ({ ...c }));
  for (const c of cards) { const s = c.properties.status || cols[0].key; if (!cols.some(x => x.key === s)) cols.push({ key: s, name: s }); }
  return cols;
};
const cellText = (col, v) => col.type === 'checkbox' ? (v === '1' ? '✓' : '') : String(v ?? '');

function renderPage(d, id, fmt, opt = {}) {
  const all = Object.values(d.blocks), by = new Map();
  for (const b of all) { if (!by.has(b.parentId)) by.set(b.parentId, []); by.get(b.parentId).push(b); }
  for (const a of by.values()) a.sort(pos);
  const kids = pid => by.get(pid) || [], abs = u => u && u.startsWith('/') ? (opt.base || '') + u : u;
  const md = fmt === 'md', out = [];

  function page(pid, depth) {
    const p = d.blocks[pid], n = Math.min(depth + 1, 6);
    const title = (p.properties.icon ? p.properties.icon + ' ' : '') + (p.content.title || 'Без названия');
    out.push(md ? `${'#'.repeat(n)} ${title}\n` : `<h${n} class="pt">${esc(title)}</h${n}>`);
    let list = null, num = 0, wasList = false;
    const openList = t => { if (md) return; const tag = t === 'numbered' ? 'ol' : 'ul'; if (list !== tag) { closeList(); out.push(`<${tag}${t === 'todo' ? ' class="todo"' : ''}>`); list = tag; } };
    const closeList = () => { if (list && !md) out.push(`</${list}>`); list = null; };
    for (const b of kids(pid)) {
      if (b.properties.trashed) continue;
      const c = b.content, P = b.properties;
      const isList = ['bullet', 'numbered', 'todo'].includes(b.type);
      if (!isList) { closeList(); if (md && wasList) out.push(''); num = 0; }
      wasList = isList;
      switch (b.type) {
        case 'page': if (opt.sub === false) out.push(md ? `- 📄 ${c.title || 'Без названия'}` : `<p>📄 ${esc(c.title || 'Без названия')}</p>`); else page(b.id, depth + 1); break;
        case 'h1': case 'h2': case 'h3': { const k = Math.min(+b.type[1] + depth + 1, 6); out.push(md ? `${'#'.repeat(k)} ${tMd(c)}\n` : `<h${k}>${tHtml(c)}</h${k}>`); break; }
        case 'todo': openList('todo'); out.push(md ? `- [${P.checked ? 'x' : ' '}] ${tMd(c)}` : `<li class="${P.checked ? 'done' : ''}">${P.checked ? '☑' : '☐'} ${tHtml(c)}</li>`); break;
        case 'bullet': openList('bullet'); out.push(md ? `- ${tMd(c)}` : `<li>${tHtml(c)}</li>`); break;
        case 'numbered': openList('numbered'); out.push(md ? `${++num}. ${tMd(c)}` : `<li>${tHtml(c)}</li>`); break;
        case 'quote': out.push(md ? tMd(c).split('\n').map(l => '> ' + l).join('\n') + '\n' : `<blockquote>${tHtml(c)}</blockquote>`); break;
        case 'callout': out.push(md ? `> ${P.icon || '💡'} ${tMd(c)}\n` : `<div class="callout"><span>${esc(P.icon || '💡')}</span><div>${tHtml(c)}</div></div>`); break;
        case 'toggle': out.push(md ? `**▸ ${tMd(c)}**\n\n${tMd(c, 'body', 'bodyHtml')}\n` : `<details open><summary>${tHtml(c)}</summary><div>${tHtml(c, 'body', 'bodyHtml')}</div></details>`); break;
        case 'code': out.push(md ? '```' + (P.lang || '') + '\n' + (c.text || '') + '\n```\n' : `<pre><code>${esc(c.text)}</code></pre>`); break;
        case 'divider': out.push(md ? '---\n' : '<hr>'); break;
        case 'table': {
          const cols = P.columns || [], rows = all.filter(r => r.type === 'table_row' && r.properties.tableId === b.id).sort(pos);
          const cell = (r, i) => cellText(cols[i], (r.content.cells || [])[i]);
          if (md) out.push(`**${c.title || 'Таблица'}**\n\n| ${cols.map(x => x.name).join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n` +
            rows.map(r => '| ' + cols.map((_, i) => cell(r, i).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |').join('\n') + '\n');
          else out.push(`<h4>${esc(c.title || 'Таблица')}</h4><table><tr>${cols.map(x => `<th>${esc(x.name)}</th>`).join('')}</tr>` +
            rows.map(r => `<tr>${cols.map((_, i) => `<td>${esc(cell(r, i))}</td>`).join('')}</tr>`).join('') + '</table>');
          break;
        }
        case 'kanban_view': {
          const cards = kids(b.id).filter(x => x.type === 'kanban_card'), cols = kanbanCols(b, cards);
          const of = col => cards.filter(x => (x.properties.status || cols[0].key) === col.key);
          const meta = x => [x.properties.due && '📅 ' + x.properties.due, ...(x.properties.tags || []).map(t => '#' + t)].filter(Boolean).join(' ');
          if (md) out.push(`**${c.title || 'Канбан'}**\n\n` + cols.map(col => `*${col.name}*\n` + of(col).map(x => `- ${x.content.text || 'Без названия'} ${meta(x)}`.trim()).join('\n')).join('\n\n') + '\n');
          else out.push(`<h4>${esc(c.title || 'Канбан')}</h4><div class="kan">` + cols.map(col => `<div class="col"><b>${esc(col.name)}</b><ul>${of(col).map(x => `<li>${esc(x.content.text || 'Без названия')} <small>${esc(meta(x))}</small></li>`).join('')}</ul></div>`).join('') + '</div>');
          break;
        }
        case 'calendar_view': {
          const ev = all.filter(e => e.type === 'event' && e.properties.calendarId === b.id).sort((a, x) => (a.properties.date || '').localeCompare(x.properties.date || ''));
          const line = e => `${e.properties.date}${e.properties.time ? ' ' + e.properties.time : ''} — ${e.content.text || ''}`;
          out.push(md ? `**${c.title || 'Календарь'}**\n\n` + ev.map(e => '- ' + line(e)).join('\n') + '\n' : `<h4>${esc(c.title || 'Календарь')}</h4><ul>${ev.map(e => `<li>${esc(line(e))}</li>`).join('')}</ul>`);
          break;
        }
        case 'gsheet': out.push(md ? `[📊 ${c.title || 'Google Таблица'}](${c.url || ''})\n` : `<p class="link">📊 <a href="${esc(c.url)}">${esc(c.title || 'Google Таблица')}</a></p>`); break;
        case 'embed': out.push(md ? `[🔗 ${c.title || c.url || ''}](${c.url || ''})\n` : `<p class="link">🔗 <a href="${esc(c.url)}">${esc(c.title || c.url)}</a></p>`); break;
        case 'image': if (c.url) out.push(md ? `![${c.caption || ''}](${abs(c.url)})\n` : `<figure><img src="${esc(abs(c.url))}" alt=""><figcaption>${esc(c.caption || '')}</figcaption></figure>`); break;
        case 'file': if (c.url) out.push(md ? `[📎 ${c.name || 'Файл'}](${abs(c.url)})\n` : `<p class="link">📎 <a href="${esc(abs(c.url))}">${esc(c.name || 'Файл')}</a></p>`); break;
        case 'table_row': case 'kanban_card': case 'event': break;
        default: if ((c.text || '').trim() || c.html) out.push(md ? tMd(c) + '\n' : `<p>${tHtml(c)}</p>`);
      }
    }
    closeList();
  }
  page(id, 0);
  const body = out.join('\n');
  if (md || fmt === 'body') return body;
  const title = esc(d.blocks[id].content.title || 'Страница');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${DOC_CSS}</style></head><body><main>${body}</main></body></html>`;
}

const DOC_CSS = `body{font:17px/1.65 -apple-system,"Segoe UI",Inter,Roboto,sans-serif;color:#37352f;background:#fff;margin:0}main{max-width:820px;margin:48px auto;padding:0 24px}
h1.pt{font-size:2.4em;margin:.2em 0 .6em}h2,h3,h4{margin:1.4em 0 .4em}blockquote{border-left:3px solid #37352f;margin:.6em 0;padding:.1em 1em}
.callout{display:flex;gap:12px;background:#f1f1ef;border-radius:8px;padding:14px 16px;margin:.6em 0}pre{background:#f7f6f3;border-radius:8px;padding:14px 16px;overflow:auto;font:14px/1.5 ui-monospace,Consolas,monospace}
code{background:#f1f1ef;border-radius:4px;padding:.1em .3em;font-size:.9em}pre code{background:none;padding:0}ul.todo{list-style:none;padding-left:.4em}li.done{color:#9b9a97;text-decoration:line-through}
table{border-collapse:collapse;width:100%;margin:.6em 0}th,td{border:1px solid #e9e9e7;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f7f6f3;font-weight:600}
hr{border:0;border-top:1px solid #e9e9e7;margin:1.4em 0}img{max-width:100%;border-radius:6px}figcaption{color:#9b9a97;font-size:.85em}.kan{display:flex;gap:12px;flex-wrap:wrap}.kan .col{flex:1;min-width:180px;background:#f7f6f3;border-radius:8px;padding:10px 12px}
small{color:#9b9a97}a{color:#2383e2}details{margin:.4em 0}summary{cursor:pointer;font-weight:500}`;

function tableCsv(d, id) {
  const t = d.blocks[id], cols = t.properties.columns || [];
  const rows = Object.values(d.blocks).filter(r => r.type === 'table_row' && r.properties.tableId === id).sort(pos);
  const q = v => /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return '﻿' + [cols.map(c => q(c.name)), ...rows.map(r => cols.map((c, i) => q(cellText(c, (r.content.cells || [])[i]))))].map(r => r.join(';')).join('\r\n');
}

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

module.exports = { renderPage, tableCsv, parseCsv, cleanInline, esc };
