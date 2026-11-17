'use strict';
/* ===== Редактор страниц: блоки, слэш-меню, Markdown-сокращения, форматирование, перетаскивание ===== */

const TEXT_TYPES = ['text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'numbered', 'quote', 'callout', 'toggle'];
const HIDDEN = ['table_row', 'kanban_card', 'event', 'subpage', 'home_note'];
const BLOCK_DEFS = [
  { t: 'text', n: 'Текст', d: 'Обычный абзац', i: 'text', k: 'text paragraph текст абзац' },
  { t: 'h1', n: 'Заголовок 1', d: 'Крупный заголовок раздела', i: 'h1', k: 'h1 heading заголовок' },
  { t: 'h2', n: 'Заголовок 2', d: 'Заголовок среднего размера', i: 'h2', k: 'h2 heading заголовок' },
  { t: 'h3', n: 'Заголовок 3', d: 'Небольшой заголовок', i: 'h3', k: 'h3 heading заголовок' },
  { t: 'todo', n: 'Список задач', d: 'Пункты с галочками', i: 'todo', k: 'todo task checkbox задачи чек' },
  { t: 'bullet', n: 'Маркированный список', d: 'Простой список', i: 'list', k: 'bullet list список маркер' },
  { t: 'numbered', n: 'Нумерованный список', d: 'Список с номерами', i: 'olist', k: 'numbered ordered list нумер список' },
  { t: 'toggle', n: 'Раскрывающийся блок', d: 'Скрывает подробности', i: 'toggle', k: 'toggle details спойлер раскрыв' },
  { t: 'quote', n: 'Цитата', d: 'Выделенная цитата', i: 'quote', k: 'quote цитата' },
  { t: 'callout', n: 'Выноска', d: 'Заметка с иконкой и фоном', i: 'bulb', k: 'callout note заметка выноска' },
  { t: 'code', n: 'Код', d: 'Фрагмент кода', i: 'code', k: 'code код' },
  { t: 'divider', n: 'Разделитель', d: 'Горизонтальная линия', i: 'minus', k: 'divider hr line разделитель линия' },
  { t: 'page', n: 'Страница', d: 'Вложенная подстраница', i: 'page', k: 'page страница подстраница' },
  { t: 'table', n: 'Таблица', d: 'База данных со столбцами разных типов', i: 'database', k: 'table database таблица база список' },
  { t: 'kanban_view', n: 'Канбан-доска', d: 'Карточки задач по колонкам', i: 'kanban', k: 'kanban board канбан доска задачи' },
  { t: 'calendar_view', n: 'Календарь', d: 'События по дням месяца', i: 'calendar', k: 'calendar календарь события' },
  { t: 'gsheet', n: 'Google Таблица', d: 'Таблица, документ или презентация Google', i: 'sheet', k: 'google sheet гугл таблица docs документ' },
  { t: 'image', n: 'Изображение', d: 'Загрузить или по ссылке', i: 'image', k: 'image picture картинка фото изображение' },
  { t: 'file', n: 'Файл', d: 'Прикрепить файл для скачивания', i: 'clip', k: 'file attach файл вложение' },
  { t: 'embed', n: 'Встраивание', d: 'YouTube, Figma, Яндекс Карты, сайт', i: 'embed', k: 'embed video youtube видео встро ссылка карта' },
];
const DEF_NAME = t => (BLOCK_DEFS.find(d => d.t === t) || {}).n || t;
const PH = { text: 'Введите текст или «/» для команд', h1: 'Заголовок 1', h2: 'Заголовок 2', h3: 'Заголовок 3', todo: 'Задача', bullet: 'Пункт списка', numbered: 'Пункт списка', quote: 'Цитата', callout: 'Текст выноски', toggle: 'Раскрывающийся блок' };
const DEF_KANBAN = () => [{ key: 'Todo', name: 'К выполнению', color: 'gray' }, { key: 'In Progress', name: 'В работе', color: 'blue' }, { key: 'Done', name: 'Готово', color: 'green' }];
const DEF_TABLE = () => [{ name: 'Название', type: 'text' }, { name: 'Статус', type: 'select', options: ['Не начато', 'В работе', 'Готово'], colors: { 'Не начато': 'gray', 'В работе': 'blue', 'Готово': 'green' } }, { name: 'Срок', type: 'date' }];

const Ed = { page: null, box: null };
const visibleKids = p => kids(p.id).filter(b => !HIDDEN.includes(b.type) && !(b.type === 'page' && b.properties.trashed));
const elOf = id => Ed.box && Ed.box.querySelector(`:scope > .blk[data-id="${id}"]`);
const ceOf = id => { const e = elOf(id); return e && e.querySelector('.ce[data-k="text"]'); };
const focusBlock = (id, where = 'end') => { const c = ceOf(id); if (c) caretAt(c, where); };

/* ---------- страница ---------- */
function renderPage(p) {
  const sc = $('#scroll'); sc.innerHTML = ''; Slash.hide();
  Ed.page = p;
  if (p.properties.cover) sc.append(coverEl(p));
  const wrap = h('div', { class: 'page' + (p.properties.full ? ' full' : '') + (p.properties.cover ? ' has-cover' : '') });
  const title = h('h1', { class: 'page-title', contenteditable: 'plaintext-only', spellcheck: 'true', 'data-ph': 'Без названия' });
  if (title.contentEditable !== 'plaintext-only') title.contentEditable = 'true';
  title.textContent = p.content.title || '';
  title.addEventListener('input', () => { p.content.title = title.textContent.replace(/\n/g, ' '); save(p); onTitleChange(p); });
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && onLastLine(title))) {
      e.preventDefault(); const first = visibleKids(p)[0];
      if (e.key === 'Enter' || !first) { const nb = first && TEXT_TYPES.includes(first.type) && !first.content.text ? first : insertTop(p); focusBlock(nb.id, 'start'); }
      else { const c = ceOf(first.id); c ? caretAt(c, 'start') : null; }
    }
  });
  title.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ')); });
  const tools = h('div', { class: 'page-tools' },
    !p.properties.icon ? h('button', { class: 'btn ghost', onclick: e => emojiPicker(e.currentTarget, v => { p.properties.icon = v || undefined; save(p, 0); renderPage(p); onTitleChange(p); }) }, ic('sparkle'), 'Добавить иконку') : null,
    !p.properties.cover ? h('button', { class: 'btn ghost', onclick: e => { p.properties.cover = COVERS[Math.floor(Math.random() * COVERS.length)]; save(p, 0); renderPage(p); } }, ic('image'), 'Добавить обложку') : null);
  const icon = p.properties.icon ? h('div', { class: 'page-icon', title: 'Сменить иконку', onclick: e => emojiPicker(e.currentTarget, v => { p.properties.icon = v || undefined; save(p, 0); renderPage(p); onTitleChange(p); }) }, p.properties.icon) : null;
  const box = h('div', { class: 'blocks' }); Ed.box = box;
  box.addEventListener('dragover', onDragOver); box.addEventListener('drop', onDrop);
  const tail = h('div', { class: 'page-tail', onclick: () => {
    const list = visibleKids(p), last = list[list.length - 1];
    if (last && last.type === 'text' && !last.content.text) return focusBlock(last.id, 'end');
    const nb = last ? insertNear(last, { type: 'text' }) : insertTop(p); focusBlock(nb.id, 'start');
  } });
  wrap.append(h('div', { class: 'page-head' }, icon, tools, title), box, tail);
  sc.append(wrap);
  renderBlocks(p);
  return title;
}
function renderBlocks(p = Ed.page) {
  const box = Ed.box; box.innerHTML = '';
  const list = visibleKids(p);
  box.classList.toggle('lonely', list.length === 1 && list[0].type === 'text' && !list[0].content.text);
  if (!list.length) box.append(h('div', { class: 'add-first', onclick: () => focusBlock(insertTop(p).id, 'start') }, 'Нажмите, чтобы начать писать, или введите «/» для выбора блока'));
  for (const b of list) box.append(blockEl(b));
  renumber();
}
function insertTop(p) {
  const list = visibleKids(p), nb = create(p._s, { parentId: p.id, type: 'text', content: { text: '' }, position: positionAfter(list, null) });
  renderBlocks(p); return nb;
}
function insertNear(b, o, before) {
  const list = visibleKids(B[b.parentId]), i = list.indexOf(b), prev = before ? list[i - 1] || null : b;
  const nb = create(b._s, { parentId: b.parentId, type: 'text', content: { text: '' }, properties: {}, position: positionAfter(list, prev), ...o });
  const el = elOf(b.id), nel = blockEl(nb);
  if (el) before ? el.before(nel) : el.after(nel); else Ed.box.append(nel);
  $('.add-first', Ed.box)?.remove(); Ed.box.classList.remove('lonely'); renumber();
  return nb;
}
function renumber() {
  let n = 0;
  for (const el of Ed.box.children) {
    if (el.classList.contains('t-numbered')) { n++; const m = el.querySelector('.mk.num'); if (m) m.textContent = n + '.'; } else n = 0;
  }
}
function replaceEl(b) { const old = elOf(b.id); if (!old) return; const n = blockEl(b); old.replaceWith(n); renumber(); return n; }

/* ---------- блоки ---------- */
function blockEl(b) {
  const colored = TEXT_TYPES.includes(b.type) && b.type !== 'callout' && b.properties.color && b.properties.color !== 'default';
  const el = h('div', { class: 'blk t-' + b.type + (colored ? ' bc c-' + b.properties.color : ''), 'data-id': b.id });
  const plus = h('button', { class: 'ib', title: 'Добавить блок ниже', onclick: () => {
    const nb = insertNear(b, { type: 'text' }), c = ceOf(nb.id); c.textContent = '/'; caretAt(c, 'end'); slashCheck(c, nb);
  } }, ic('plus'));
  const grip = h('button', { class: 'ib grip', title: 'Перетащите, чтобы переместить\nНажмите, чтобы открыть меню', draggable: 'true', onclick: e => blockMenu(e.currentTarget, b), ondragstart: e => dragStart(e, b, el), ondragend: dragEnd }, ic('grip'));
  let body;
  try { body = bodyFor(b, el); } catch (e) { console.error(e); body = h('div', { class: 'mut' }, 'Не удалось показать блок «' + DEF_NAME(b.type) + '»'); }
  el.append(h('div', { class: 'gut' }, plus, grip), body);
  return el;
}
function bodyFor(b, el) {
  if (TEXT_TYPES.includes(b.type)) return textBody(b, el);
  switch (b.type) {
    case 'code': return codeBody(b);
    case 'divider': return h('div', { class: 'dvd', onclick: e => blockMenu(e.currentTarget, b) }, h('hr'));
    case 'page': return h('div', { class: 'pg-link', onclick: () => go(pageRoute(b)) }, h('span', { class: 'em' }, b.properties.icon || ic('page')), h('span', { class: 't' }, titleOf(b)));
    case 'table': return tableView(b);
    case 'kanban_view': return kanbanView(b);
    case 'calendar_view': return calendarView(b);
    case 'gsheet': return gsheetView(b);
    case 'image': return imageView(b);
    case 'file': return fileView(b);
    case 'embed': return embedView(b);
  }
  return h('div', { class: 'mut small' }, 'Блок «' + b.type + '» не поддерживается');
}
function textBody(b, el) {
  const ce = makeCE(b, { ph: PH[b.type] });
  switch (b.type) {
    case 'todo': {
      el.classList.toggle('done', !!b.properties.checked);
      const cb = h('span', { class: 'cb' + (b.properties.checked ? ' on' : ''), role: 'checkbox', onclick: () => { b.properties.checked = !b.properties.checked; cb.classList.toggle('on', b.properties.checked); el.classList.toggle('done', b.properties.checked); save(b, 0); } });
      return h('div', { class: 'lst' }, h('span', { class: 'mk' }, cb), ce);
    }
    case 'bullet': return h('div', { class: 'lst' }, h('span', { class: 'mk bul' }), ce);
    case 'numbered': return h('div', { class: 'lst' }, h('span', { class: 'mk num' }), ce);
    case 'callout': {
      const icn = h('span', { class: 'cic', title: 'Сменить иконку', onclick: e => emojiPicker(e.currentTarget, v => { b.properties.icon = v || '💡'; icn.textContent = b.properties.icon; save(b, 0); }, false) }, b.properties.icon || '💡');
      return h('div', { class: 'callout c-' + (b.properties.color || 'gray') }, icn, ce);
    }
    case 'toggle': {
      const body = makeCE(b, { tk: 'body', hk: 'bodyHtml', ph: 'Скрытое содержимое…', multiline: true });
      const bw = h('div', { class: 'tgl-body', hidden: !b.properties.open }, body);
      const head = h('div', { class: 'tgl' + (b.properties.open ? ' open' : '') }, h('button', { class: 'tgb', onclick: () => { b.properties.open = !b.properties.open; head.classList.toggle('open', b.properties.open); bw.hidden = !b.properties.open; save(b, 0); } }, ic('right')), ce);
      return h('div', {}, head, bw);
    }
  }
  return ce;
}
function makeCE(b, o = {}) {
  const tk = o.tk || 'text', hk = o.hk || 'html';
  const ce = h('div', { class: 'ce', contenteditable: 'true', spellcheck: 'true', 'data-ph': o.ph || '', 'data-k': tk });
  setRich(ce, b.content, tk, hk);
  ce.addEventListener('input', e => {
    readRich(ce, b.content, tk, hk); save(b);
    if (tk === 'text') { if (mdShortcut(ce, b, e)) return; slashCheck(ce, b); }
    if (b.type === 'text' && Ed.box?.classList.contains('lonely') && b.content.text) Ed.box.classList.remove('lonely');
  });
  ce.addEventListener('keydown', e => onKey(e, ce, b, o));
  ce.addEventListener('paste', e => onPaste(e, ce, b, o));
  ce.addEventListener('click', e => { const a = e.target.closest('a'); if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); } });
  ce.addEventListener('blur', () => { if (Slash.ce === ce) setTimeout(() => { if (!Slash.P?.el.matches(':hover')) Slash.hide(); }, 150); });
  return ce;
}
function codeBody(b) {
  const ce = h('div', { class: 'ce plain', contenteditable: 'plaintext-only', spellcheck: 'false', 'data-k': 'text', 'data-ph': 'Введите код…' });
  if (ce.contentEditable !== 'plaintext-only') ce.contentEditable = 'true';
  ce.textContent = b.content.text || '';
  ce.addEventListener('input', () => { b.content.text = ce.innerText.replace(/\n$/, ''); save(b); });
  ce.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  ce.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.shiftKey)) { e.preventDefault(); focusBlock(insertNear(b, { type: 'text' }).id, 'start'); }
    else if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
    else if (e.key === 'Backspace' && !ce.textContent) { e.preventDefault(); changeType(b, 'text'); }
    else if (e.key === 'ArrowUp' && onFirstLine(ce)) { const p = prevCE(ce); if (p) { e.preventDefault(); caretAt(p, 'end'); } }
    else if (e.key === 'ArrowDown' && onLastLine(ce)) { const n = nextCE(ce); if (n) { e.preventDefault(); caretAt(n, 'start'); } }
  });
  const LANGS = ['plain', 'javascript', 'python', 'html', 'css', 'sql', 'json', 'bash', 'php', 'java', 'c#', 'go'];
  return h('div', { class: 'code' }, h('div', { class: 'code-h' },
    h('select', { onchange: e => { b.properties.lang = e.target.value; save(b, 0); } }, LANGS.map(l => h('option', { value: l, selected: (b.properties.lang || 'plain') === l }, l === 'plain' ? 'Текст' : l))),
    h('span', { class: 'sp' }), h('button', { class: 'btn sm ghost', onclick: () => { copyText(b.content.text || ''); toast('Код скопирован'); } }, ic('copy'), 'Копировать')), ce);
}
function copyText(t) {
  if (navigator.clipboard && isSecureContext) return navigator.clipboard.writeText(t);
  const a = h('textarea', { style: 'position:fixed;opacity:0' }); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove();
}

/* ---------- клавиатура ---------- */
const allCE = () => [$('.page-title'), ...$$('.ce', Ed.box)].filter(x => x && x.offsetParent);
const prevCE = ce => { const l = allCE(), i = l.indexOf(ce); return l[i - 1]; };
const nextCE = ce => { const l = allCE(), i = l.indexOf(ce); return l[i + 1]; };
function onKey(e, ce, b, o) {
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    if (k === 'e' || k === 'у') { e.preventDefault(); wrapToggle('code'); return; }
    if ((k === 'k' || k === 'л') && !sel().isCollapsed) { e.preventDefault(); e.stopPropagation(); addLink(); return; }
    if ((k === 'd' || k === 'в') && !e.shiftKey) { e.preventDefault(); duplicateBlock(b); return; }
    if (e.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); moveBlock(b, k === 'ArrowUp' ? -1 : 1); return; }
  }
  if (o.multiline) { if (k === 'Enter' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); } return; }
  if (k === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); splitBlock(ce, b); return; }
  if (k === 'Backspace' && sel().isCollapsed && atStart(ce)) { if (backspaceAtStart(ce, b)) e.preventDefault(); return; }
  if (k === 'Delete' && sel().isCollapsed && atEnd(ce)) { if (mergeNext(ce, b)) e.preventDefault(); return; }
  if (k === 'ArrowUp' && !e.shiftKey && onFirstLine(ce)) { const p = prevCE(ce); if (p) { e.preventDefault(); caretAt(p, 'end'); } return; }
  if (k === 'ArrowDown' && !e.shiftKey && onLastLine(ce)) { const n = nextCE(ce); if (n) { e.preventDefault(); caretAt(n, 'start'); } return; }
  if (k === 'Tab') e.preventDefault();
  if (k === 'Escape') ce.blur();
}
const hasMarks = html => /<(b|i|u|s|code|mark|a)[ >]/.test(html);
function splitBlock(ce, b) {
  const s = sel(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); r.deleteContents();
  const tail = document.createRange(); tail.setStart(r.endContainer, r.endOffset); tail.setEnd(ce, ce.childNodes.length);
  const tmp = h('div'); tmp.append(tail.extractContents());
  const headEmpty = !ce.textContent.trim(), tailEmpty = !tmp.textContent;
  if (['todo', 'bullet', 'numbered', 'quote', 'toggle', 'callout'].includes(b.type) && headEmpty && tailEmpty) { changeType(b, 'text'); return; }
  if (headEmpty && !tailEmpty) { // курсор в начале — вставляем пустую строку выше, текст остаётся на месте
    ce.append(...tmp.childNodes); insertNear(b, { type: ['todo', 'bullet', 'numbered'].includes(b.type) ? b.type : 'text' }, true); caretAt(ce, 'start'); return;
  }
  readRich(ce, b.content); save(b, 0);
  const c = { text: tmp.innerText ?? tmp.textContent }, html = canon(tmp).replace(/(<br>)+$/, '');
  c.text = tmp.textContent; if (hasMarks(html)) c.html = html;
  const type = ['todo', 'bullet', 'numbered'].includes(b.type) ? b.type : 'text';
  const nb = insertNear(b, { type, content: c, properties: b.type === 'todo' ? { checked: false } : {} });
  focusBlock(nb.id, 'start');
}
function backspaceAtStart(ce, b) {
  if (ce.dataset.k !== 'text') return false;
  if (b.type !== 'text' && TEXT_TYPES.includes(b.type)) { changeType(b, 'text', 'start'); return true; }
  const el = elOf(b.id), prevEl = el?.previousElementSibling, pb = prevEl && B[prevEl.dataset.id];
  if (!pb) { if (!ce.textContent && visibleKids(Ed.page).length > 1) { deleteBlockEl(b); const n = Ed.box.firstElementChild; n && caretAt($('.ce', n) || $('.page-title'), 'start'); return true; } return false; }
  if (pb.type === 'divider') { removeBlock(pb); prevEl.remove(); return true; }
  const pce = prevEl.querySelector('.ce[data-k="text"]');
  if (TEXT_TYPES.includes(pb.type) && pce) {
    const len = pce.textContent.length;
    if (pce.lastChild?.nodeName === 'BR') pce.lastChild.remove();
    pce.append(...ce.childNodes); readRich(pce, pb.content); save(pb, 0);
    deleteBlockEl(b); caretAt(pce, len); return true;
  }
  if (!ce.textContent) { deleteBlockEl(b); if (pce) caretAt(pce, 'end'); return true; }
  return false;
}
function mergeNext(ce, b) {
  if (ce.dataset.k !== 'text' || !TEXT_TYPES.includes(b.type)) return false;
  const nEl = elOf(b.id)?.nextElementSibling, nb = nEl && B[nEl.dataset.id], nce = nEl?.querySelector('.ce[data-k="text"]');
  if (!nb || !TEXT_TYPES.includes(nb.type) || !nce) return false;
  const len = ce.textContent.length; ce.append(...nce.childNodes); readRich(ce, b.content); save(b, 0); deleteBlockEl(nb); caretAt(ce, len); return true;
}
function deleteBlockEl(b) { removeBlock(b); elOf(b.id)?.remove(); renumber(); if (!Ed.box.children.length) renderBlocks(); }
function changeType(b, t, where = 'end') {
  if (b.type === t) return;
  b.type = t;
  if (t === 'callout') { b.properties.icon = b.properties.icon || '💡'; b.properties.color = b.properties.color || 'gray'; }
  if (t === 'todo') b.properties.checked = false;
  if (t === 'code') { b.content = { text: b.content.text || '' }; }
  save(b, 0); replaceEl(b); focusBlock(b.id, where);
}

/* ---------- вставка ---------- */
function mdLine(line) {
  let m;
  if ((m = line.match(/^(#{1,3})\s+(.*)$/))) return { type: 'h' + m[1].length, text: m[2] };
  if ((m = line.match(/^\s*[-*+]\s+\[([ xх])\]\s+(.*)$/i))) return { type: 'todo', text: m[2], props: { checked: m[1].trim() !== '' } };
  if ((m = line.match(/^\s*[-*+•]\s+(.*)$/))) return { type: 'bullet', text: m[1] };
  if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) return { type: 'numbered', text: m[1] };
  if ((m = line.match(/^>\s?(.*)$/))) return { type: 'quote', text: m[1] };
  if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) return { type: 'divider', text: '' };
  if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) return { type: 'image', content: { url: m[2], caption: m[1] } };
  return { type: 'text', text: line };
}
// Markdown → массив блоков (для вставки и импорта .md)
function mdToBlocks(text) {
  const out = [], lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) { const code = []; const lang = l.slice(3).trim(); while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]); out.push({ type: 'code', content: { text: code.join('\n') }, properties: { lang: lang || 'plain' } }); continue; }
    const r = mdLine(l);
    if (r.type === 'text' && !l.trim() && (!out.length || out[out.length - 1].type === 'text' && !out[out.length - 1].content.text)) continue;
    const t = r.text?.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, '$1$2').replace(/`([^`]+)`/g, '$1');
    out.push({ type: r.type, content: r.content || { text: t || '' }, properties: r.props || {} });
  }
  return out;
}
async function onPaste(e, ce, b, o) {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length && !o.multiline) {
    e.preventDefault();
    let prev = b;
    for (const f of files) { try { const r = await uploadFile(f); prev = insertNear(prev, f.type.startsWith('image/') ? { type: 'image', content: { url: r.url, caption: '' } } : { type: 'file', content: { url: r.url, name: r.name, size: r.size, mime: r.mime } }); } catch (x) { toast(x.message, 'err'); } }
    return;
  }
  const text = e.clipboardData.getData('text/plain'); if (!text) return;
  e.preventDefault();
  if (/^https?:\/\/\S+$/.test(text.trim()) && !sel().isCollapsed) { document.execCommand('createLink', false, text.trim()); return; }
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length === 1 || o.multiline) { document.execCommand(o.multiline ? 'insertText' : 'insertText', false, o.multiline ? text : text); return; }
  document.execCommand('insertText', false, lines[0]);
  const list = visibleKids(B[b.parentId]), i = list.indexOf(b), next = list[i + 1];
  const blocks = mdToBlocks(lines.slice(1).join('\n')); if (!blocks.length) return;
  const a = b.position ?? 0, step = ((next ? next.position : a + blocks.length + 1) - a) / (blocks.length + 1);
  const made = createMany(b._s, blocks.map((x, k) => ({ ...x, parentId: b.parentId, position: a + step * (k + 1) })));
  renderBlocks(); focusBlock(made[made.length - 1].id, 'end');
}
async function importMarkdown(p, text) {
  const blocks = mdToBlocks(text), list = visibleKids(p), start = list.length ? (list[list.length - 1].position ?? 0) + 1 : 0;
  createMany(p._s, blocks.map((x, k) => ({ ...x, parentId: p.id, position: start + k })));
  if (Ed.page === p) renderBlocks(p);
  toast('Импортировано блоков: ' + blocks.length);
}

/* ---------- Markdown-сокращения при наборе ---------- */
function removeLeading(ce, n) {
  const r = document.createRange(), w = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT); let left = n;
  r.setStart(ce, 0);
  while (w.nextNode()) { const t = w.currentNode; if (left <= t.length) { r.setEnd(t, left); break; } left -= t.length; }
  r.deleteContents();
}
function mdShortcut(ce, b, e) {
  if (b.type !== 'text' || e.inputType !== 'insertText') return false;
  const full = ce.textContent.replace(/ /g, ' '), off = caretOffset(ce), before = full.slice(0, off);
  const prev = full.slice(0, off - (e.data || '').length) + full.slice(off); // текст до этого ввода
  const map = { '### ': 'h3', '## ': 'h2', '# ': 'h1', '- ': 'bullet', '* ': 'bullet', '+ ': 'bullet', '1. ': 'numbered', '1) ': 'numbered', '[ ] ': 'todo', '[] ': 'todo', '> ': 'quote', '" ': 'quote' };
  const pre = Object.keys(map).find(p => full.startsWith(p) && !prev.startsWith(p) && off >= p.length);
  if (pre) { removeLeading(ce, pre.length); readRich(ce, b.content); changeType(b, map[pre], 'end'); return true; }
  if (before === '```') { removeLeading(ce, 3); readRich(ce, b.content); changeType(b, 'code', 'end'); return true; }
  if (before === '---' && ce.textContent === '---') { b.content = {}; b.type = 'divider'; save(b, 0); replaceEl(b); focusBlock(insertNear(b, { type: 'text' }).id, 'start'); return true; }
  return false;
}

/* ---------- слэш-меню ---------- */
const Slash = {
  P: null, ce: null, b: null, q: '', i: 0, items: [], off: 0,
  show(ce, b, q, off) {
    this.ce = ce; this.b = b; this.q = q; this.off = off;
    const ql = q.toLowerCase();
    this.items = BLOCK_DEFS.filter(d => !ql || d.n.toLowerCase().includes(ql) || d.k.includes(ql));
    if (!this.items.length && q.length > 3) return this.hide();
    this.i = Math.min(this.i, Math.max(0, this.items.length - 1));
    const box = h('div', { class: 'menu slash' }, this.items.length ? null : h('div', { class: 'mi mut' }, 'Ничего не найдено'),
      !q ? h('div', { class: 'm-head' }, 'Блоки') : null,
      this.items.map((d, k) => h('div', { class: 'mi' + (k === this.i ? ' act' : ''), onmousedown: ev => { ev.preventDefault(); this.choose(d); } },
        h('span', { class: 'sic' }, ic(d.i)), h('div', { class: 't' }, h('div', {}, d.n), h('div', { class: 'd' }, d.d)))));
    const r = caretRect() || ce.getBoundingClientRect();
    if (this.P && this.P.el.isConnected) { this.P.el.replaceChildren(box); this.P.place(); }
    else this.P = popup({ left: r.left, top: r.top, bottom: r.bottom, right: r.right }, box, { cls: 'slash-pop', ignore: ce, onClose: () => { this.P = null; }, onKey: e => this.key(e) });
    $('.mi.act', this.P.el)?.scrollIntoView({ block: 'nearest' });
  },
  hide() { const P = this.P; this.P = null; this.i = 0; P?.close(); },
  key(e) {
    if (!this.P) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); const n = this.items.length; if (!n) return; this.i = (this.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; this.show(this.ce, this.b, this.q, this.off); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); const d = this.items[this.i]; if (d) this.choose(d); else this.hide(); }
  },
  choose(d) {
    const { ce, b } = this; this.hide();
    // убираем набранное «/запрос»
    const end = this.off, start = end - this.q.length - 1;
    const r = document.createRange(), w = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT); let pos = 0, s0 = null, e0 = null;
    while (w.nextNode()) { const t = w.currentNode; if (!s0 && start <= pos + t.length) s0 = [t, start - pos]; if (!e0 && end <= pos + t.length) { e0 = [t, end - pos]; break; } pos += t.length; }
    if (s0 && e0) { r.setStart(...s0); r.setEnd(...e0); r.deleteContents(); }
    readRich(ce, b.content); save(b, 0);
    applyBlockType(b, d.t);
  }
};
function slashCheck(ce, b) {
  const off = caretOffset(ce), before = ce.textContent.slice(0, off);
  const m = before.match(/(?:^|[\s ])\/([^\s/ ]{0,24})$/);
  if (m) Slash.show(ce, b, m[1], off); else if (Slash.P) Slash.hide();
}
function defaultsFor(t) {
  switch (t) {
    case 'table': return { content: { title: 'Таблица' }, properties: { columns: DEF_TABLE() } };
    case 'kanban_view': return { content: { title: 'Доска задач' }, properties: { columns: DEF_KANBAN() } };
    case 'calendar_view': return { content: { title: 'Календарь' }, properties: {} };
    case 'gsheet': return { content: { url: '', title: 'Google Таблица' }, properties: { height: 520, mode: 'view' } };
    case 'image': case 'file': case 'embed': return { content: {}, properties: {} };
    case 'code': return { content: { text: '' }, properties: { lang: 'plain' } };
    case 'divider': return { content: {}, properties: {} };
  }
  return { content: { text: '' }, properties: {} };
}
function applyBlockType(b, t) {
  if (TEXT_TYPES.includes(t)) { changeType(b, t); return; }
  const target = (b.content.text || '').trim() ? insertNear(b, { type: 'text' }) : b;
  if (t === 'page') {
    target.type = 'page'; target.content = { title: '' }; target.properties = {}; save(target, 0);
    create(target._s, { parentId: target.id, type: 'text', content: { text: '' }, position: 0 });
    renderSidebar(); go(pageRoute(target), { focusTitle: true }); return;
  }
  const d = defaultsFor(t); target.type = t; target.content = d.content; target.properties = d.properties; save(target, 0);
  if (t === 'table') createMany(target._s, [0, 1, 2].map(i => ({ parentId: target.parentId, type: 'table_row', content: { cells: ['', '', ''] }, properties: { tableId: target.id }, position: i })));
  replaceEl(target);
  const after = () => focusBlock(insertNear(target, { type: 'text' }).id, 'start');
  if (t === 'divider') return after();
  if (t === 'code') return focusBlock(target.id, 'start');
  const nxt = elOf(target.id)?.nextElementSibling; if (!nxt || !B[nxt.dataset.id] || B[nxt.dataset.id].type !== 'text') insertNear(target, { type: 'text' });
  if (['gsheet', 'embed', 'image', 'file'].includes(t)) elOf(target.id)?.querySelector('input.inp')?.focus();
  else focusBlock(elOf(target.id)?.nextElementSibling?.dataset.id, 'start');
}

/* ---------- меню блока, дублирование, перемещение ---------- */
function blockMenu(anchor, b) {
  const items = [{ head: DEF_NAME(b.type) },
    b.type === 'page' ? { label: 'Открыть', icon: 'ext', onClick: () => go(pageRoute(b)) } : null,
    { label: b.type === 'page' ? 'В корзину' : 'Удалить', icon: 'trash', danger: true, onClick: () => deleteBlockAsk(b) },
    { label: 'Дублировать', icon: 'copy', hint: 'Ctrl+D', onClick: () => duplicateBlock(b) },
    { label: 'Выше', icon: 'up', hint: 'Ctrl+Shift+↑', onClick: () => moveBlock(b, -1) },
    { label: 'Ниже', icon: 'down', hint: 'Ctrl+Shift+↓', onClick: () => moveBlock(b, 1) },
    { label: 'Переместить на страницу…', icon: 'move', onClick: () => movePicker(b) }];
  if (TEXT_TYPES.includes(b.type)) items.push('-', { head: 'Превратить в' }, ...BLOCK_DEFS.filter(d => TEXT_TYPES.includes(d.t) || d.t === 'code').map(d => ({ label: d.n, icon: d.i, check: b.type === d.t, onClick: () => changeType(b, d.t) })),
    '-', { head: b.type === 'callout' ? 'Фон' : 'Цвет текста' }, { colors: true, value: b.properties.color, onPick: c => { b.properties.color = c === 'default' ? undefined : c; save(b, 0); replaceEl(b); } });
  items.push('-', h('div', { class: 'm-head', style: 'text-transform:none;font-weight:400' }, 'Изменено ' + fmtTime(b.updatedAt || b.createdAt) + (b.by ? ' · ' + b.by : '')));
  menu(anchor, items);
}
async function deleteBlockAsk(b) {
  if (b.type === 'page') return trashPage(b);
  if (['table', 'kanban_view', 'calendar_view'].includes(b.type) && !(await confirmBox(`Удалить «${b.content.title || DEF_NAME(b.type)}» со всем содержимым?`))) return;
  deleteBlockEl(b);
}
async function duplicateBlock(b) {
  try {
    const r = await api('POST', `/s/${b._s}/duplicate/${b.id}`);
    for (const x of r.blocks) { x._s = b._s; B[x.id] = x; } App.rev[b._s] = Math.max(App.rev[b._s] || 0, 0); reindex();
    if (Ed.page && B[b.parentId] === Ed.page) { renderBlocks(); focusBlock(r.rootId); }
    if (b.type === 'page') renderSidebar();
    toast('Копия создана');
  } catch (e) { toast(e.message, 'err'); }
}
function moveBlock(b, dir) {
  const list = visibleKids(B[b.parentId]), i = list.indexOf(b), j = i + dir; if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; list.forEach((x, k) => x.position = k); batchUpdate(b._s, list);
  const off = ceOf(b.id) ? caretOffset(ceOf(b.id)) : 0; renderBlocks(); const c = ceOf(b.id); if (c) caretAt(c, off);
}
function moveBlockTo(b, target, after) {
  if (b === target) return;
  const list = visibleKids(B[target.parentId]).filter(x => x !== b), i = list.indexOf(target);
  b.position = positionAfter(list, after ? target : list[i - 1] || null); batchUpdate(b._s, [b]); renderBlocks();
}
// перенос блока (вместе со строками таблицы / событиями) на другую страницу того же пространства
function moveBlockToPage(b, page) {
  if (b._s !== page._s) { toast('Блоки переносятся только внутри одного пространства. Перенесите страницу целиком.', 'err'); return; }
  if (b.id === page.id || ancestors(page).includes(b)) return;
  const related = (b.type === 'table' || b.type === 'calendar_view') ? kids(b.parentId).filter(x => x.properties.tableId === b.id || x.properties.calendarId === b.id) : [];
  const list = visibleKids(page); b.parentId = page.id; b.position = list.length ? (list[list.length - 1].position ?? 0) + 1 : 0;
  related.forEach(x => x.parentId = page.id); batchUpdate(b._s, [b, ...related]);
  if (Ed.page) renderBlocks(); renderSidebar(); toast('Перенесено в «' + titleOf(page) + '»');
}
function movePicker(b) {
  const list = pages(b._s).filter(p => p !== B[b.parentId] && p !== b && !ancestors(p).includes(b));
  const inp = h('input', { class: 'inp', placeholder: 'Найти страницу…', oninput: () => draw() }), res = h('div', { class: 'sres', style: 'max-height:50vh' });
  const draw = () => { res.innerHTML = ''; const q = inp.value.toLowerCase(); list.filter(p => titleOf(p).toLowerCase().includes(q)).slice(0, 50).forEach(p => res.append(h('div', { class: 'sr', onclick: () => { m.close(); moveBlockToPage(b, p); } }, h('span', { class: 'em' }, p.properties.icon || '📄'), h('div', { class: 'grow' }, h('div', { class: 'st' }, titleOf(p)), h('div', { class: 'ss' }, ancestors(p).map(titleOf).join(' / ') || SPACE_NAME[p._s]))))); };
  const m = modal({ title: 'Переместить на страницу', body: [inp, res] }); draw(); setTimeout(() => inp.focus());
}

/* ---------- перетаскивание блоков ---------- */
let DRAG = null;
function dragStart(e, b, el) {
  DRAG = { b, el }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '');
  try { e.dataTransfer.setDragImage(el, 20, 14); } catch { }
  setTimeout(() => el.classList.add('dragging'));
}
const clearDrop = () => $$('.drop-before,.drop-after,.drop-in').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-in'));
function onDragOver(e) {
  if (!DRAG) return;
  e.preventDefault(); clearDrop();
  const t = e.target.closest('.blk'); if (!t || t.parentElement !== Ed.box || t === DRAG.el) { DRAG.target = null; return; }
  const r = t.getBoundingClientRect(); DRAG.after = e.clientY > r.top + r.height / 2; DRAG.target = t;
  t.classList.add(DRAG.after ? 'drop-after' : 'drop-before');
}
function onDrop(e) { if (!DRAG) return; e.preventDefault(); const t = DRAG.target && B[DRAG.target.dataset.id]; const { b, after } = DRAG; dragEnd(); if (t) moveBlockTo(b, t, after); }
function dragEnd() { DRAG?.el.classList.remove('dragging'); DRAG = null; clearDrop(); }

/* ---------- панель форматирования ---------- */
let FMT = null;
function hideFmt() { FMT?.remove(); FMT = null; }
function wrapToggle(tag) {
  const s = sel(); if (!s.rangeCount || s.isCollapsed) return;
  const r = s.getRangeAt(0), base = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  const ce = base.closest('.ce, .rte'); if (!ce) return;
  const inside = base.closest(tag);
  if (inside && ce.contains(inside)) inside.replaceWith(...inside.childNodes);
  else { const w = document.createElement(tag); w.append(r.extractContents()); r.insertNode(w); const nr = document.createRange(); nr.selectNodeContents(w); s.removeAllRanges(); s.addRange(nr); }
  ce.dispatchEvent(new Event('input'));
}
async function addLink() {
  const s = sel(); if (!s.rangeCount) return; const r = s.getRangeAt(0).cloneRange();
  const base = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  const ce = base.closest('.ce, .rte'), existing = base.closest('a');
  hideFmt();
  let url = await promptBox(existing ? 'Изменить ссылку' : 'Добавить ссылку', { value: existing?.getAttribute('href') || '', placeholder: 'https://example.com', ok: 'Применить', label: existing ? 'Оставьте пустым, чтобы убрать ссылку' : null });
  if (url === null) return;
  ce.focus(); s.removeAllRanges(); s.addRange(r);
  url = url.trim();
  if (!url) { document.execCommand('unlink'); return; }
  if (!/^(https?:|mailto:)/i.test(url)) url = (/@/.test(url) && !/\//.test(url) ? 'mailto:' : 'https://') + url;
  document.execCommand('createLink', false, url);
}
document.addEventListener('selectionchange', debounce(() => {
  const s = sel();
  if (!s.rangeCount || s.isCollapsed) return hideFmt();
  const n = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement), ce = n?.closest?.('.ce, .rte');
  if (!ce || ce.classList.contains('plain') || !ce.contains(s.focusNode) || !s.toString().trim()) return hideFmt();
  const rect = s.getRangeAt(0).getBoundingClientRect();
  if (!FMT) {
    const btn = (label, title, fn, style = '') => h('button', { title, style, onmousedown: e => { e.preventDefault(); fn(); } }, label);
    const cmd = c => () => document.execCommand(c);
    FMT = h('div', { class: 'fmt' },
      btn('B', 'Жирный (Ctrl+B)', cmd('bold'), 'font-weight:700'), btn('I', 'Курсив (Ctrl+I)', cmd('italic'), 'font-style:italic;font-family:Georgia,serif'),
      btn('U', 'Подчёркнутый (Ctrl+U)', cmd('underline'), 'text-decoration:underline'), btn('S', 'Зачёркнутый', cmd('strikeThrough'), 'text-decoration:line-through'),
      h('span', { class: 'sep' }), btn(ic('code'), 'Код (Ctrl+E)', () => wrapToggle('code')), btn('🖍', 'Выделить маркером', () => wrapToggle('mark')),
      btn(ic('link'), 'Ссылка (Ctrl+K)', addLink), h('span', { class: 'sep' }), btn(ic('x'), 'Убрать форматирование', () => { document.execCommand('removeFormat'); document.execCommand('unlink'); }));
    document.body.append(FMT);
  }
  const w = FMT.offsetWidth; FMT.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
  FMT.style.top = Math.max(8, rect.top - FMT.offsetHeight - 8) + 'px';
}, 80));

/* ---------- обложка ---------- */
function coverEl(p) {
  const c = p.properties.cover, img = c.startsWith('/files/');
  return h('div', { class: 'cover ' + (img ? '' : c), style: coverStyle(c) }, h('div', { class: 'cover-acts' },
    h('button', { class: 'btn sm', onclick: e => coverPicker(e.currentTarget, p) }, 'Сменить обложку'),
    h('button', { class: 'btn sm', onclick: () => { delete p.properties.cover; save(p, 0); renderPage(p); } }, 'Убрать')));
}
function coverPicker(anchor, p) {
  popup(anchor, h('div', {}, h('div', { class: 'm-head' }, 'Градиенты'),
    h('div', { class: 'cover-grid' }, COVERS.map(g => h('button', { class: g, onclick: () => { p.properties.cover = g; save(p, 0); closePops(); renderPage(p); } }))),
    h('div', { class: 'm-sep' }),
    h('div', { class: 'mi', onclick: async () => { closePops(); const [f] = await pickFiles('image/*'); if (!f) return; try { const r = await uploadFile(f); p.properties.cover = r.url; save(p, 0); renderPage(p); } catch (e) { toast(e.message, 'err'); } } }, ic('upload'), h('span', { class: 't' }, 'Загрузить своё изображение'))), { align: 'end' });
}
