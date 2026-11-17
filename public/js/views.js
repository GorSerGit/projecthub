'use strict';
/* ===== Представления: таблица, канбан, календарь, Google Таблицы, изображения, файлы, встраивания ===== */

const editTitle = (b, cls, ph = 'Без названия') => {
  const t = h('div', { class: cls, contenteditable: 'plaintext-only', spellcheck: 'false', 'data-ph': ph });
  if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.textContent = b.content.title || '';
  t.addEventListener('input', () => { b.content.title = t.textContent; save(b); });
  t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } });
  return t;
};

/* ================= таблица ================= */
const COL_TYPES = [['text', 'Текст', 'text'], ['number', 'Число', 'num'], ['select', 'Выбор', 'select'], ['multi', 'Несколько меток', 'list'], ['date', 'Дата', 'calendar'], ['checkbox', 'Флажок', 'todo'], ['link', 'Ссылка', 'link'], ['email', 'E-mail', 'at'], ['phone', 'Телефон', 'phone']];
const colIcon = t => (COL_TYPES.find(c => c[0] === t) || COL_TYPES[0])[2];
const tableRows = t => kids(t.parentId).filter(r => r.type === 'table_row' && r.properties.tableId === t.id);
function tableView(t) {
  const w = h('div', { class: 'db' }), st = { q: '', sort: t.properties.sort || null };
  t.properties.columns = t.properties.columns || DEF_TABLE();
  const cols = () => t.properties.columns;
  const cellsOf = r => { const c = r.content.cells = r.content.cells || []; while (c.length < cols().length) c.push(''); return c; };
  const optColor = (col, o) => (col.colors || {})[o] || hashColor(o);
  function draw() {
    w.innerHTML = '';
    const search = h('input', { class: 'inp', placeholder: 'Поиск…', value: st.q, oninput: e => { st.q = e.target.value; drawBody(); } });
    w.append(h('div', { class: 'db-h' }, ic('database', 'mut'), editTitle(t, 'db-title'), h('span', { class: 'sp' }), search,
      h('button', { class: 'ib', title: 'Скачать CSV (Excel)', onclick: () => { flushAll(); setTimeout(() => download(`/s/${t._s}/csv/${t.id}`, (t.content.title || 'Таблица') + '.csv'), 300); } }, ic('download')),
      h('button', { class: 'ib', title: 'Ещё', onclick: e => menu(e.currentTarget, [
        { label: 'Импорт из Google Таблицы…', icon: 'sheet', onClick: () => importGsheetInto(t) },
        { label: 'Импорт CSV-файла…', icon: 'import', onClick: async () => { const [f] = await pickFiles('.csv,text/csv'); if (f) fillTable(t, parseCsvText(await f.text()), true); } },
        { label: 'Скачать CSV', icon: 'download', onClick: () => download(`/s/${t._s}/csv/${t.id}`, (t.content.title || 'Таблица') + '.csv') },
        st.sort ? { label: 'Сбросить сортировку', icon: 'sort', onClick: () => { st.sort = t.properties.sort = null; save(t, 0); drawBody(); } } : null,
        '-', { label: 'Удалить таблицу', icon: 'trash', danger: true, onClick: () => deleteBlockAsk(t) }], { align: 'end' }) }, ic('more'))));
    const body = h('div'); w.append(body);
    function drawBody() {
      body.innerHTML = '';
      let rows = tableRows(t);
      if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter(r => cellsOf(r).some(v => String(v).toLowerCase().includes(q))); }
      if (st.sort) {
        const { i, dir } = st.sort, c = cols()[i], num = c && c.type === 'number';
        rows = [...rows].sort((a, b) => { const x = cellsOf(a)[i] ?? '', y = cellsOf(b)[i] ?? ''; const r = num ? (parseFloat(x) || 0) - (parseFloat(y) || 0) : String(x).localeCompare(String(y), 'ru', { numeric: true }); return dir * r; });
      }
      const thead = h('tr', {}, cols().map((c, i) => h('th', {}, h('div', { class: 'th', onclick: e => colMenu(e.currentTarget, i) }, ic(colIcon(c.type)), h('span', {}, c.name || 'Без названия'), st.sort?.i === i ? h('span', { class: 'sort' }, st.sort.dir > 0 ? '↑' : '↓') : null))),
        h('th', { class: 'add' }, h('button', { class: 'ib', title: 'Добавить столбец', onclick: () => { cols().push({ name: 'Столбец ' + (cols().length + 1), type: 'text' }); save(t, 0); drawBody(); } }, ic('plus'))));
      const tb = h('tbody');
      for (const r of rows) tb.append(h('tr', {}, cols().map((c, i) => h('td', {}, cellEl(r, c, i))),
        h('td', { class: 'add' }, h('button', { class: 'ib row-del', title: 'Действия со строкой', onclick: e => menu(e.currentTarget, [
          { label: 'Дублировать строку', icon: 'copy', onClick: () => { const list = tableRows(t); create(t._s, { parentId: t.parentId, type: 'table_row', content: { cells: [...cellsOf(r)] }, properties: { tableId: t.id }, position: positionAfter(list, r) }); drawBody(); } },
          { label: 'Удалить строку', icon: 'trash', danger: true, onClick: () => { removeBlock(r); drawBody(); } }]) }, ic('more')))));
      body.append(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, thead), tb)),
        h('div', { class: 'tbl-add', onclick: () => { const list = tableRows(t); const r = create(t._s, { parentId: t.parentId, type: 'table_row', content: { cells: cols().map(() => '') }, properties: { tableId: t.id }, position: list.length ? (list[list.length - 1].position ?? 0) + 1 : 0 }); drawBody(); $(`[data-row="${r.id}"]`, body)?.focus(); } }, ic('plus'), 'Новая строка'),
        h('div', { class: 'tbl-foot' }, 'Строк: ' + rows.length + (st.q ? ' (найдено)' : '')));
    }
    function cellEl(r, c, i) {
      const v = cellsOf(r)[i] ?? '', set = x => { cellsOf(r)[i] = x; save(r); };
      switch (c.type) {
        case 'checkbox': { const cb = h('span', { class: 'cb' + (v === '1' ? ' on' : ''), onclick: () => { const on = cellsOf(r)[i] !== '1'; cb.classList.toggle('on', on); set(on ? '1' : '0'); } }); return h('div', { class: 'cell-cb' }, cb); }
        case 'select': case 'multi': {
          const vals = c.type === 'multi' ? String(v).split(',').map(s => s.trim()).filter(Boolean) : v ? [v] : [];
          const box = h('div', { class: 'cell-sel', onclick: () => optPicker(box, c, vals, nv => { set(c.type === 'multi' ? nv.join(', ') : nv[0] || ''); drawBody(); }) }, vals.map(o => chip(o, optColor(c, o))));
          return box;
        }
        case 'date': return h('input', { class: 'cell', type: 'date', value: v, onchange: e => set(e.target.value), 'data-row': i === 0 ? r.id : null });
        case 'link': case 'email': case 'phone': {
          const inp = h('input', { class: 'cell', type: c.type === 'link' ? 'url' : c.type === 'email' ? 'email' : 'tel', value: v, oninput: e => set(e.target.value), 'data-row': i === 0 ? r.id : null });
          const href = !v ? null : c.type === 'link' ? (/^https?:\/\//i.test(v) ? v : 'https://' + v) : c.type === 'email' ? 'mailto:' + v : 'tel:' + v;
          return h('div', { class: 'cell-link' }, inp, href ? h('a', { href, target: '_blank', rel: 'noopener', title: 'Открыть' }, ic(c.type === 'link' ? 'ext' : colIcon(c.type))) : null);
        }
        case 'number': return h('input', { class: 'cell', type: 'number', step: 'any', value: v, oninput: e => set(e.target.value), style: 'text-align:right', 'data-row': i === 0 ? r.id : null });
      }
      const ta = h('div', { class: 'cell', contenteditable: 'plaintext-only', 'data-row': i === 0 ? r.id : null });
      if (ta.contentEditable !== 'plaintext-only') ta.contentEditable = 'true';
      ta.textContent = v; ta.addEventListener('input', () => set(ta.innerText.replace(/\n$/, '')));
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const tr = ta.closest('tr').nextElementSibling; const nx = tr?.children[i]?.querySelector('.cell'); nx ? nx.focus() : ta.blur(); } });
      return ta;
    }
    function optPicker(anchor, c, vals, onSet) {
      c.options = c.options || [];
      const inp = h('input', { class: 'inp', placeholder: 'Найти или создать…', style: 'height:2rem;margin-bottom:.3rem' });
      const list = h('div');
      const toggle = o => { if (c.type === 'multi') { const i = vals.indexOf(o); i >= 0 ? vals.splice(i, 1) : vals.push(o); onSet([...vals]); drawList(); } else { P.close(); onSet(vals[0] === o ? [] : [o]); } };
      const drawList = () => {
        list.innerHTML = ''; const q = inp.value.trim();
        c.options.filter(o => !q || o.toLowerCase().includes(q.toLowerCase())).forEach(o => list.append(h('div', { class: 'mi', onclick: () => toggle(o) }, chip(o, optColor(c, o)), h('span', { class: 't' }), vals.includes(o) ? ic('check', 'check') : null,
          h('button', { class: 'ib', style: 'width:1.5rem;height:1.5rem', title: 'Цвет / удалить', onclick: e => { e.stopPropagation(); menu(e.currentTarget, [{ colors: true, value: optColor(c, o), onPick: col => { c.colors = { ...(c.colors || {}), [o]: col }; save(t, 0); drawBody(); } }, '-', { label: 'Удалить вариант', icon: 'trash', danger: true, onClick: () => { c.options = c.options.filter(x => x !== o); save(t, 0); drawBody(); } }], { nested: true }); } }, ic('more')))));
        if (q && !c.options.includes(q)) list.append(h('div', { class: 'mi', onclick: () => { c.options.push(q); save(t, 0); inp.value = ''; toggle(q); } }, ic('plus'), h('span', { class: 't' }, 'Создать '), chip(q, hashColor(q))));
        if (!c.options.length && !q) list.append(h('div', { class: 'hint', style: 'padding:.3rem .5rem' }, 'Введите название варианта и нажмите Enter'));
      };
      inp.addEventListener('input', drawList);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const q = inp.value.trim(); if (!q) return; if (!c.options.includes(q)) { c.options.push(q); save(t, 0); } inp.value = ''; toggle(q); } });
      const P = popup(anchor, h('div', { style: 'width:16rem' }, inp, list)); drawList(); setTimeout(() => inp.focus());
    }
    function colMenu(anchor, i) {
      const c = cols()[i];
      const name = h('input', { class: 'inp', value: c.name, style: 'height:2rem;margin:.2rem 0 .3rem', onkeydown: e => { if (e.key === 'Enter') P.close(); } });
      const P = menu(anchor, [name, { head: 'Тип' }, ...COL_TYPES.map(([k, n, icn]) => ({ label: n, icon: icn, check: c.type === k, onClick: () => { c.type = k; if ((k === 'select' || k === 'multi') && !c.options) c.options = []; save(t, 0); drawBody(); } })),
        '-', { label: 'Сортировать по возрастанию', icon: 'sort', onClick: () => { st.sort = t.properties.sort = { i, dir: 1 }; save(t, 0); drawBody(); } },
        { label: 'Сортировать по убыванию', icon: 'sort', onClick: () => { st.sort = t.properties.sort = { i, dir: -1 }; save(t, 0); drawBody(); } },
        i > 0 ? { label: 'Сдвинуть влево', icon: 'left', onClick: () => moveCol(i, -1) } : null,
        i < cols().length - 1 ? { label: 'Сдвинуть вправо', icon: 'right', onClick: () => moveCol(i, 1) } : null,
        cols().length > 1 ? { label: 'Удалить столбец', icon: 'trash', danger: true, onClick: async () => { if (!(await confirmBox(`Удалить столбец «${c.name}» и все его значения?`))) return; cols().splice(i, 1); tableRows(t).forEach(r => { cellsOf(r).splice(i, 1); save(r); }); if (st.sort?.i === i) st.sort = t.properties.sort = null; save(t, 0); drawBody(); } } : null],
        { onClose: () => { if (name.value.trim() && name.value !== c.name) { c.name = name.value.trim(); save(t, 0); drawBody(); } } });
      setTimeout(() => { name.focus(); name.select(); });
    }
    function moveCol(i, d) {
      const j = i + d; [cols()[i], cols()[j]] = [cols()[j], cols()[i]];
      tableRows(t).forEach(r => { const c = cellsOf(r); [c[i], c[j]] = [c[j], c[i]]; save(r); }); save(t, 0); drawBody();
    }
    drawBody();
  }
  draw();
  w.redraw = draw;
  return w;
}
function parseCsvText(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false; text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x !== ''));
}
// заполнить таблицу строками (первая строка — заголовки)
function fillTable(t, rows, replace) {
  if (!rows.length) return toast('Таблица пустая', 'err');
  const head = rows[0], n = Math.max(...rows.map(r => r.length));
  t.properties.columns = Array.from({ length: n }, (_, i) => ({ name: head[i] || 'Столбец ' + (i + 1), type: 'text' })); save(t, 0);
  if (replace) tableRows(t).forEach(r => removeBlock(r));
  createMany(t._s, rows.slice(1).map((r, k) => ({ parentId: t.parentId, type: 'table_row', content: { cells: Array.from({ length: n }, (_, i) => r[i] ?? '') }, properties: { tableId: t.id }, position: k })));
  replaceEl(t); toast('Загружено строк: ' + (rows.length - 1));
}
async function importGsheetInto(t, url) {
  url = url || await promptBox('Импорт из Google Таблицы', { placeholder: 'https://docs.google.com/spreadsheets/d/…', ok: 'Загрузить', label: 'Таблица должна быть открыта по ссылке («Все, у кого есть ссылка»). Текущие строки будут заменены. Данные копируются один раз — для живой таблицы используйте блок «Google Таблица».' });
  if (!url) return;
  const tt = toast(h('span', { class: 'row' }, h('span', { class: 'spinner' }), 'Читаю Google Таблицу…'), 'info', 0);
  try { const r = await api('GET', '/gsheet/csv?url=' + encodeURIComponent(url)); fillTable(t, r.rows, true); } catch (e) { toast(e.message, 'err', 6000); } finally { tt.remove(); }
}

/* ================= канбан ================= */
const PRIO = { high: ['Высокий', 'red'], mid: ['Средний', 'yellow'], low: ['Низкий', 'gray'] };
function kanbanCols(v) {
  if (!v.properties.columns || !v.properties.columns.length) v.properties.columns = DEF_KANBAN();
  const cols = v.properties.columns;
  for (const c of kids(v.id, 'kanban_card')) { const s = c.properties.status || cols[0].key; if (!cols.some(x => x.key === s)) cols.push({ key: s, name: s, color: 'gray' }); }
  return cols;
}
function kanbanView(v) {
  const w = h('div', { class: 'db' });
  let dragCard = null;
  function draw() {
    w.innerHTML = '';
    const cols = kanbanCols(v), cards = kids(v.id, 'kanban_card');
    w.append(h('div', { class: 'db-h' }, ic('kanban', 'mut'), editTitle(v, 'db-title'), h('span', { class: 'sp' }), h('span', { class: 'mut small' }, 'Карточек: ' + cards.length),
      h('button', { class: 'ib', title: 'Ещё', onclick: e => menu(e.currentTarget, [{ label: 'Добавить колонку', icon: 'plus', onClick: addCol }, '-', { label: 'Удалить доску', icon: 'trash', danger: true, onClick: () => deleteBlockAsk(v) }], { align: 'end' }) }, ic('more'))));
    const board = h('div', { class: 'kan' });
    for (const col of cols) {
      const list = cards.filter(c => (c.properties.status || cols[0].key) === col.key);
      const cardsBox = h('div', { class: 'kcards' });
      for (const c of list) cardsBox.append(cardEl(c, col));
      const colEl = h('div', { class: 'kcol c-' + (col.color || 'gray') },
        h('div', { class: 'kcol-h' }, h('span', { class: 'chip c-' + (col.color || 'gray'), onclick: e => colMenu(e.currentTarget, col) }, col.name), h('span', { class: 'n' }, list.length), h('span', { class: 'sp' }),
          h('button', { class: 'ib', title: 'Настроить колонку', onclick: e => colMenu(e.currentTarget, col) }, ic('more')),
          h('button', { class: 'ib', title: 'Новая карточка', onclick: () => addCard(col, true) }, ic('plus'))),
        cardsBox, h('div', { class: 'kadd', onclick: () => addCard(col) }, ic('plus'), 'Новая карточка'));
      colEl.addEventListener('dragover', e => {
        if (!dragCard) return; e.preventDefault(); colEl.classList.add('ov');
        $$('.kdrop', w).forEach(x => x.remove());
        const after = [...cardsBox.children].find(x => x.classList.contains('kcard') && e.clientY < x.getBoundingClientRect().top + x.offsetHeight / 2);
        const line = h('div', { class: 'kdrop' }); after ? cardsBox.insertBefore(line, after) : cardsBox.append(line);
      });
      colEl.addEventListener('dragleave', e => { if (!colEl.contains(e.relatedTarget)) { colEl.classList.remove('ov'); $$('.kdrop', colEl).forEach(x => x.remove()); } });
      colEl.addEventListener('drop', e => {
        if (!dragCard) return; e.preventDefault();
        const line = $('.kdrop', cardsBox), nextEl = line?.nextElementSibling, next = nextEl && B[nextEl.dataset.id];
        const c = dragCard; dragCard = null;
        const inCol = cards.filter(x => (x.properties.status || cols[0].key) === col.key && x !== c);
        const i = next ? inCol.indexOf(next) : inCol.length;
        c.properties.status = col.key; c.position = positionAfter(inCol, inCol[i - 1] || null);
        if (col.done && !c.properties.doneAt) c.properties.doneAt = new Date().toISOString();
        save(c, 0); reindex(); draw();
      });
      board.append(colEl);
    }
    board.append(h('div', { class: 'kcol-new' }, h('div', { class: 'kadd', onclick: addCol }, ic('plus'), 'Колонка')));
    w.append(board);
  }
  function cardEl(c, col) {
    const p = c.properties, late = p.due && dayDiff(p.due) < 0 && !isDoneCol(col);
    const el = h('div', { class: 'kcard', draggable: 'true', 'data-id': c.id, onclick: () => openCard(c, v, draw) },
      h('div', { class: 'kt' }, c.content.text || ''),
      p.desc ? h('div', { class: 'kdesc' }, p.desc) : null,
      (p.tags?.length || p.due || p.prio || p.assignee) ? h('div', { class: 'km' },
        p.prio && PRIO[p.prio] ? chip(PRIO[p.prio][0], PRIO[p.prio][1]) : null,
        (p.tags || []).map(t => chip(t, hashColor(t))),
        p.due ? h('span', { class: 'kd' + (late ? ' late' : '') }, ic('calendar'), fmtDate(p.due)) : null,
        p.assignee ? avatar(p.assignee, p.assigneeName, 'who') : null) : null);
    el.addEventListener('dragstart', e => { dragCard = c; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setTimeout(() => el.classList.add('dragging')); });
    el.addEventListener('dragend', () => { dragCard = null; el.classList.remove('dragging'); $$('.kdrop,.ov', w).forEach(x => x.classList.contains('kdrop') ? x.remove() : x.classList.remove('ov')); });
    return el;
  }
  const isDoneCol = col => col.done || col.key === 'Done';
  function addCard(col, top) {
    const list = kids(v.id, 'kanban_card').filter(x => (x.properties.status || kanbanCols(v)[0].key) === col.key);
    const pos = top ? (list[0] ? (list[0].position ?? 0) - 1 : 0) : (list.length ? (list[list.length - 1].position ?? 0) + 1 : 0);
    const c = create(v._s, { parentId: v.id, type: 'kanban_card', content: { text: '' }, properties: { status: col.key, tags: [] }, position: pos });
    draw(); openCard(c, v, draw, true);
  }
  async function addCol() {
    const name = await promptBox('Новая колонка', { placeholder: 'Например: На проверке' }); if (!name?.trim()) return;
    kanbanCols(v).push({ key: uid().slice(0, 8), name: name.trim(), color: COLOR_KEYS[kanbanCols(v).length % COLOR_KEYS.length] }); save(v, 0); draw();
  }
  function colMenu(anchor, col) {
    const cols = kanbanCols(v), i = cols.indexOf(col);
    const name = h('input', { class: 'inp', value: col.name, style: 'height:2rem;margin:.2rem 0 .3rem', onkeydown: e => { if (e.key === 'Enter') P.close(); } });
    const P = menu(anchor, [name, { head: 'Цвет' }, { colors: true, value: col.color, onPick: c => { col.color = c; save(v, 0); draw(); } }, '-',
      { label: 'Колонка «готово» (сроки не горят)', icon: 'check', check: isDoneCol(col), onClick: () => { col.done = !isDoneCol(col); if (col.key === 'Done' && !col.done) col.done = false; save(v, 0); draw(); } },
      i > 0 ? { label: 'Сдвинуть влево', icon: 'left', onClick: () => { [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; save(v, 0); draw(); } } : null,
      i < cols.length - 1 ? { label: 'Сдвинуть вправо', icon: 'right', onClick: () => { [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; save(v, 0); draw(); } } : null,
      cols.length > 1 ? { label: 'Удалить колонку', icon: 'trash', danger: true, onClick: async () => {
        const inCol = kids(v.id, 'kanban_card').filter(x => (x.properties.status || cols[0].key) === col.key);
        if (inCol.length && !(await confirmBox(`В колонке ${inCol.length} карточек. Они переедут в «${cols[i === 0 ? 1 : 0].name}».`, { ok: 'Удалить колонку' }))) return;
        const to = cols[i === 0 ? 1 : 0]; inCol.forEach(x => { x.properties.status = to.key; save(x, 0); }); cols.splice(i, 1); save(v, 0); draw();
      } } : null],
      { onClose: () => { if (name.value.trim() && name.value !== col.name) { col.name = name.value.trim(); save(v, 0); draw(); } } });
    setTimeout(() => { name.focus(); name.select(); });
  }
  draw();
  w.redraw = draw;
  return w;
}
let PEOPLE = null;
const loadPeople = async () => PEOPLE || (PEOPLE = await api('GET', '/people').catch(() => []));
function openCard(c, v, redraw, isNew) {
  const p = c.properties, cols = kanbanCols(v);
  const t = h('div', { class: 'card-title', contenteditable: 'plaintext-only' });
  if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.textContent = c.content.text || '';
  t.addEventListener('input', () => { c.content.text = t.textContent; save(c); });
  t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); desc.focus(); } });
  const status = h('select', { class: 'inp', onchange: e => { p.status = e.target.value; save(c, 0); } }, cols.map(x => h('option', { value: x.key, selected: (p.status || cols[0].key) === x.key }, x.name)));
  const due = h('input', { class: 'inp', type: 'date', value: p.due || '', onchange: e => { p.due = e.target.value || undefined; save(c, 0); } });
  const prio = h('select', { class: 'inp', onchange: e => { p.prio = e.target.value || undefined; save(c, 0); } }, h('option', { value: '' }, '—'), Object.entries(PRIO).map(([k, [n]]) => h('option', { value: k, selected: p.prio === k }, n)));
  const who = h('select', { class: 'inp', onchange: e => { p.assignee = e.target.value || undefined; p.assigneeName = e.target.selectedOptions[0]?.dataset.name || undefined; save(c, 0); } }, h('option', { value: '' }, '— не назначен —'));
  loadPeople().then(list => list.forEach(u => who.append(h('option', { value: u.login, 'data-name': u.name, selected: p.assignee === u.login }, u.name ? `${u.name} (${u.login})` : u.login))));
  const tags = tagEditor(p.tags || [], v => { p.tags = v; save(c, 0); });
  const desc = h('textarea', { class: 'inp', rows: 6, placeholder: 'Описание, заметки, ссылки…', value: p.desc || '', oninput: e => { p.desc = e.target.value; save(c); } });
  const row = (icon, name, el) => [h('div', { class: 'pk' }, ic(icon), name), h('div', { class: 'pv' }, el)];
  const m = modal({ title: v.content.title || 'Карточка', cls: 'wide', onClose: () => { flush(c.id); redraw(); },
    body: [t, h('div', { class: 'props' }, row('select', 'Статус', status), row('calendar', 'Срок', due), row('flag', 'Приоритет', prio), row('user', 'Исполнитель', who), row('hash', 'Метки', tags)), desc,
      h('div', { class: 'hint', style: 'margin-top:.6rem' }, 'Создано ' + fmtTime(c.createdAt) + (c.createdBy ? ' · ' + c.createdBy : ''))],
    foot: [h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Удалить карточку?')) { removeBlock(c); m.close(); } } }, ic('trash'), 'Удалить'), h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => m.close() }, 'Готово')] });
  setTimeout(() => isNew ? t.focus() : null);
}
function tagEditor(vals, onChange) {
  vals = [...vals];
  const inp = h('input', { placeholder: vals.length ? '' : 'Добавить метку…' });
  const box = h('div', { class: 'tag-edit', onclick: () => inp.focus() });
  const draw = () => { box.innerHTML = ''; vals.forEach((v, i) => box.append(chip(v, hashColor(v), h('span', { class: 'x', onclick: e => { e.stopPropagation(); vals.splice(i, 1); onChange([...vals]); draw(); } }, '×')))); box.append(inp); };
  inp.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) { e.preventDefault(); if (!vals.includes(inp.value.trim())) vals.push(inp.value.trim()); inp.value = ''; onChange([...vals]); draw(); inp.focus(); }
    else if (e.key === 'Backspace' && !inp.value && vals.length) { vals.pop(); onChange([...vals]); draw(); inp.focus(); }
  });
  draw(); return box;
}

/* ================= календарь ================= */
const calEvents = cal => kids(cal.parentId).filter(e => e.type === 'event' && e.properties.calendarId === cal.id);
// задачи с датами (карточки канбанов), которые показываются в календарях
const datedCards = space => Object.values(B).filter(c => c.type === 'kanban_card' && c.properties.due && (!space || c._s === space) && B[c.parentId] && !inTrash(B[c.parentId]));
function calendarView(cal) {
  const w = h('div', { class: 'db' });
  const P = cal.properties; if (P.calMonth == null) { const n = new Date(); P.calMonth = n.getMonth(); P.calYear = n.getFullYear(); }
  const source = () => [
    ...calEvents(cal).map(e => ({ id: e.id, date: e.properties.date, end: e.properties.end, time: e.properties.time, text: e.content.text, color: e.properties.color || 'blue', open: () => openEvent(e, draw), block: e })),
    ...(P.showTasks !== false ? datedCards(cal._s).map(c => ({ id: c.id, date: c.properties.due, text: c.content.text || 'Без названия', task: true, done: isCardDone(c), open: () => openCard(c, B[c.parentId], draw) })) : [])];
  function draw() {
    w.innerHTML = '';
    w.append(h('div', { class: 'db-h' }, ic('calendar', 'mut'), editTitle(cal, 'db-title'), h('span', { class: 'sp' }),
      h('button', { class: 'ib', title: 'Ещё', onclick: e => menu(e.currentTarget, [{ label: 'Показывать задачи с канбанов', icon: 'kanban', check: P.showTasks !== false, onClick: () => { P.showTasks = P.showTasks === false; save(cal, 0); draw(); } }, '-', { label: 'Удалить календарь', icon: 'trash', danger: true, onClick: () => deleteBlockAsk(cal) }], { align: 'end' }) }, ic('more'))));
    w.append(monthGrid({ state: P, onNav: () => save(cal, 0), items: source, redraw: draw,
      onAdd: async date => { const t = await promptBox('Новое событие · ' + fmtDate(date, false), { placeholder: 'Название события', ok: 'Добавить' }); if (t?.trim()) { create(cal._s, { parentId: cal.parentId, type: 'event', content: { text: t.trim() }, properties: { date, calendarId: cal.id, color: 'blue' }, position: 0 }); draw(); } },
      onMove: (it, date) => { if (it.block) { const e = it.block, len = e.properties.end ? dayDiff(e.properties.end) - dayDiff(e.properties.date) : 0; e.properties.date = date; if (e.properties.end) e.properties.end = ymd(new Date(parseYmd(date).getTime() + len * 864e5)); save(e, 0); } else { B[it.id].properties.due = date; save(B[it.id], 0); } draw(); } }));
  }
  draw(); w.redraw = draw; return w;
}
const isCardDone = c => { const v = B[c.parentId]; if (!v) return false; const col = (v.properties.columns || DEF_KANBAN()).find(x => x.key === (c.properties.status || 'Todo')); return !!col && (col.done || col.key === 'Done'); };
// сетка месяца: используется в блоке календаря и в общем календаре
function monthGrid({ state, onNav, items, onAdd, onMove, redraw }) {
  const box = h('div');
  let mode = state.calMode || 'month', dragIt = null;
  const draw = () => {
    box.innerHTML = '';
    const m = state.calMonth, y = state.calYear;
    const nav = d => { let n = state.calMonth + d, yy = state.calYear; if (n < 0) { n = 11; yy--; } if (n > 11) { n = 0; yy++; } state.calMonth = n; state.calYear = yy; onNav?.(); draw(); };
    box.append(h('div', { class: 'cal-h' }, h('span', { class: 'mon' }, MONTHS[m] + ' ' + y),
      h('button', { class: 'ib', title: 'Предыдущий месяц', onclick: () => nav(-1) }, ic('left')),
      h('button', { class: 'btn sm', onclick: () => { const n = new Date(); state.calMonth = n.getMonth(); state.calYear = n.getFullYear(); onNav?.(); draw(); } }, 'Сегодня'),
      h('button', { class: 'ib', title: 'Следующий месяц', onclick: () => nav(1) }, ic('right')), h('span', { class: 'sp' }),
      seg([['month', 'Месяц'], ['list', 'Список']], mode, v => { mode = state.calMode = v; onNav?.(); draw(); })));
    const all = items(), start = new Date(y, m, 1), lead = (start.getDay() + 6) % 7, first = new Date(y, m, 1 - lead);
    const byDay = new Map();
    for (const it of all) {
      if (!it.date) continue;
      const span = it.end && it.end > it.date ? Math.min(dayDiff(it.end) - dayDiff(it.date), 62) : 0;
      for (let k = 0; k <= span; k++) { const d = k ? ymd(new Date(parseYmd(it.date).getTime() + k * 864e5 + 3600e3)) : it.date; if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(it); }
    }
    for (const a of byDay.values()) a.sort((x, z) => (x.task - z.task) || String(x.time || '99').localeCompare(String(z.time || '99')));
    const evEl = it => {
      const e = h('div', { class: 'cev c-' + (it.color || 'blue') + (it.task ? ' task' : '') + (it.done ? ' done' : ''), draggable: onMove ? 'true' : null, title: it.text + (it.where ? ' · ' + it.where : ''), onclick: ev => { ev.stopPropagation(); it.open(); } },
        it.task ? ic(it.done ? 'todo' : 'kanban') : null, it.time ? h('span', { class: 'tm' }, it.time) : null, h('span', { class: 'tx' }, it.text || 'Без названия'));
      e.addEventListener('dragstart', ev => { dragIt = it; ev.dataTransfer.setData('text/plain', ''); ev.stopPropagation(); });
      return e;
    };
    if (mode === 'list') {
      const days = [...byDay.keys()].filter(d => d.startsWith(`${y}-${pad(m + 1)}`)).sort();
      const ag = h('div', { class: 'agenda' });
      if (!days.length) ag.append(h('div', { class: 'empty' }, 'В этом месяце событий нет'));
      for (const d of days) { const dt = parseYmd(d); ag.append(h('div', { class: 'ag-day' }, h('div', { class: 'ag-d' }, h('b', {}, dt.getDate()), WD[(dt.getDay() + 6) % 7] + (d === todayStr() ? ' · сегодня' : '')), h('div', { class: 'ag-list' }, byDay.get(d).map(evEl)))); }
      box.append(ag); return;
    }
    const grid = h('div', { class: 'cal' }, WD.map(d => h('div', { class: 'dn' }, d)));
    const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
    for (let i = 0; i < weeks * 7; i++) {
      const dt = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i), ds = ymd(dt), list = byDay.get(ds) || [];
      const cell = h('div', { class: 'cday' + (dt.getMonth() !== m ? ' out' : '') + (ds === todayStr() ? ' today' : '') + (i % 7 > 4 ? ' wk' : ''), onclick: () => onAdd?.(ds) },
        onAdd ? h('button', { class: 'ib addd', title: 'Добавить событие', onclick: e => { e.stopPropagation(); onAdd(ds); } }, ic('plus')) : null,
        h('div', { class: 'num' }, h('span', {}, dt.getDate() === 1 ? dt.getDate() + ' ' + MONTHS_G[dt.getMonth()].slice(0, 3) : dt.getDate())),
        list.slice(0, 4).map(evEl), list.length > 4 ? h('div', { class: 'cmore', onclick: e => { e.stopPropagation(); mode = 'list'; draw(); } }, 'ещё ' + (list.length - 4)) : null);
      if (onMove) {
        cell.addEventListener('dragover', e => { if (dragIt) { e.preventDefault(); cell.classList.add('ov'); } });
        cell.addEventListener('dragleave', () => cell.classList.remove('ov'));
        cell.addEventListener('drop', e => { if (!dragIt) return; e.preventDefault(); const it = dragIt; dragIt = null; onMove(it, ds); });
      }
      grid.append(cell);
    }
    box.append(grid);
  };
  draw(); return box;
}
function openEvent(e, redraw) {
  const p = e.properties;
  const t = h('div', { class: 'card-title', contenteditable: 'plaintext-only' });
  if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.textContent = e.content.text || ''; t.addEventListener('input', () => { e.content.text = t.textContent; save(e); });
  t.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); t.blur(); } });
  const row = (icon, name, el) => [h('div', { class: 'pk' }, ic(icon), name), h('div', { class: 'pv' }, el)];
  const colors = h('div', { class: 'row wrap', style: 'gap:.3rem' }, COLOR_KEYS.map(k => h('button', { class: 'c-' + k, title: k, style: `width:1.6rem;height:1.6rem;border-radius:.35rem;background:var(--cbg);outline:${(p.color || 'blue') === k ? '2px solid var(--accent)' : '0'};outline-offset:1px`, onclick: ev => { p.color = k; save(e, 0); [...colors.children].forEach(x => x.style.outline = '0'); ev.currentTarget.style.outline = '2px solid var(--accent)'; } })));
  const m = modal({ title: 'Событие', cls: 'wide', onClose: () => { flush(e.id); redraw(); }, body: [t, h('div', { class: 'props' },
    row('calendar', 'Дата', h('input', { class: 'inp', type: 'date', value: p.date || '', onchange: ev => { if (ev.target.value) { p.date = ev.target.value; save(e, 0); } } })),
    row('calendarDay', 'До (необяз.)', h('input', { class: 'inp', type: 'date', value: p.end || '', onchange: ev => { p.end = ev.target.value || undefined; save(e, 0); } })),
    row('clock', 'Время', h('input', { class: 'inp', type: 'time', value: p.time || '', onchange: ev => { p.time = ev.target.value || undefined; save(e, 0); } })),
    row('palette', 'Цвет', colors)),
    h('textarea', { class: 'inp', rows: 5, placeholder: 'Описание, место, ссылка на встречу…', value: p.note || '', oninput: ev => { p.note = ev.target.value; save(e); } })],
    foot: [h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Удалить событие?')) { removeBlock(e); m.close(); } } }, ic('trash'), 'Удалить'), h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => m.close() }, 'Готово')] });
}

/* ================= Google Таблицы / Документы ================= */
function gInfo(url) {
  const u = String(url || '').trim();
  const m = u.match(/docs\.google\.com\/(spreadsheets|document|presentation|forms)\/d\/(e\/)?([A-Za-z0-9_-]{15,})/);
  if (!m) return null;
  const kind = { spreadsheets: 'sheet', document: 'doc', presentation: 'slide', forms: 'form' }[m[1]], base = `https://docs.google.com/${m[1]}/d/${m[2] || ''}${m[3]}`;
  const gid = (u.match(/[#&?]gid=(\d+)/) || [])[1];
  if (m[2]) return { kind, open: u, view: kind === 'form' ? `${base}/viewform?embedded=true` : kind === 'sheet' ? `${base}/pubhtml?widget=true&headers=false${gid ? '&gid=' + gid : ''}` : kind === 'slide' ? `${base}/embed` : `${base}/pub?embedded=true`, edit: null };
  if (kind === 'form') return { kind, open: `${base}/viewform`, view: `${base}/viewform?embedded=true`, edit: `${base}/edit` };
  return { kind, open: `${base}/edit${gid ? '#gid=' + gid : ''}`, view: `${base}/preview${gid ? '?gid=' + gid : ''}`, edit: `${base}/edit?rm=minimal${gid ? '#gid=' + gid : ''}` };
}
const G_KIND = { sheet: ['Google Таблица', 'sheet', '#0f9d58'], doc: ['Google Документ', 'page', '#4285f4'], slide: ['Google Презентация', 'embed', '#f4b400'], form: ['Google Форма', 'todo', '#7248b9'] };
function gsheetView(b) {
  const w = h('div');
  const draw = () => {
    w.innerHTML = '';
    const info = gInfo(b.content.url);
    if (!info) {
      const inp = h('input', { class: 'inp', placeholder: 'Вставьте ссылку на Google Таблицу, Документ, Презентацию или Форму', value: b.content.url || '' });
      const ok = () => { if (!gInfo(inp.value)) return toast('Это не ссылка на файл Google (docs.google.com/…)', 'err'); b.content.url = inp.value.trim(); if (!b.content.title || b.content.title === 'Google Таблица') b.content.title = G_KIND[gInfo(inp.value).kind][0]; save(b, 0); draw(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      w.append(h('div', { class: 'ph-block' }, ic('sheet'), inp, h('button', { class: 'btn primary sm', onclick: ok }, 'Встроить'),
        h('div', { class: 'hint', style: 'width:100%' }, 'Совет: чтобы таблица показывалась всем, откройте в Google «Настройки доступа» → «Все, у кого есть ссылка». Для редактирования прямо здесь нужен вход в Google в этом браузере.')));
      return;
    }
    const mode = b.properties.mode === 'edit' && info.edit ? 'edit' : 'view', [kindName, kindIcon, kindColor] = G_KIND[info.kind];
    const frame = h('iframe', { src: mode === 'edit' ? info.edit : info.view, loading: 'lazy', allow: 'clipboard-write', style: `height:${b.properties.height || 520}px`, referrerpolicy: 'no-referrer-when-downgrade' });
    const rs = h('div', { class: 'resize', title: 'Потяните, чтобы изменить высоту' });
    rs.addEventListener('mousedown', e => {
      e.preventDefault(); const y0 = e.clientY, h0 = frame.offsetHeight; frame.style.pointerEvents = 'none';
      const mv = ev => { frame.style.height = Math.max(200, h0 + ev.clientY - y0) + 'px'; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); frame.style.pointerEvents = ''; b.properties.height = frame.offsetHeight; save(b, 0); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    const title = editTitle(b, 'ttl', kindName);
    w.append(h('div', { class: 'frame' }, h('div', { class: 'frame-h' }, h('span', { class: 'gs', style: `background:${kindColor}` }, ic(kindIcon)), title,
      info.edit && info.kind !== 'form' ? seg([['view', 'Просмотр'], ['edit', 'Редактирование']], mode, v => { b.properties.mode = v; save(b, 0); draw(); }) : null,
      h('button', { class: 'ib', title: 'Развернуть', onclick: () => gFullscreen(b, info) }, ic('expand')),
      h('a', { class: 'ib', href: info.open, target: '_blank', rel: 'noopener', title: 'Открыть в Google' }, ic('ext')),
      h('button', { class: 'ib', title: 'Ещё', onclick: e => menu(e.currentTarget, [
        { label: 'Изменить ссылку', icon: 'link', onClick: () => { b.content.url = ''; draw(); } },
        { label: 'Обновить', icon: 'refresh', onClick: () => { frame.src = frame.src; } },
        info.kind === 'sheet' ? { label: 'Скопировать данные в таблицу ProjectHub', icon: 'database', onClick: () => gsheetToTable(b) } : null,
        { label: 'Скопировать ссылку', icon: 'copy', onClick: () => { copyText(info.open); toast('Ссылка скопирована'); } },
        '-', { label: 'Удалить блок', icon: 'trash', danger: true, onClick: () => deleteBlockEl(b) }], { align: 'end' }) }, ic('more'))), frame, rs));
  };
  draw(); w.redraw = draw; return w;
}
function gFullscreen(b, info) {
  const mode = b.properties.mode === 'edit' && info.edit ? 'edit' : 'view';
  const m = modal({ title: b.content.title || G_KIND[info.kind][0], cls: 'xl', body: h('iframe', { src: mode === 'edit' ? info.edit : info.view, style: 'width:100%;height:100%;border:0;border-radius:.4rem;background:#fff' }) });
  m.body.style.padding = '0 .8rem .8rem';
}
function gsheetToTable(b) {
  const t = insertNear(b, { type: 'table', content: { title: b.content.title || 'Таблица' }, properties: { columns: [{ name: 'Столбец 1', type: 'text' }] } });
  importGsheetInto(t, b.content.url);
}

/* ================= изображения, файлы, встраивания ================= */
function mediaPlaceholder(b, kind, redraw) {
  const isImg = kind === 'image';
  const inp = h('input', { class: 'inp', placeholder: isImg ? 'Или вставьте ссылку на изображение' : 'Или вставьте ссылку на файл' });
  const fromUrl = () => { const u = inp.value.trim(); if (!/^https?:\/\//.test(u)) return toast('Нужна ссылка, начинающаяся с http(s)://', 'err'); b.content = isImg ? { url: u, caption: '' } : { url: u, name: u.split('/').pop().split('?')[0] || 'Файл' }; save(b, 0); redraw(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') fromUrl(); });
  const up = async files => { const f = files[0]; if (!f) return; try { const r = await uploadFile(f); b.content = isImg ? { url: r.url, caption: '' } : { url: r.url, name: r.name, size: r.size, mime: r.mime }; save(b, 0); redraw(); } catch (e) { toast(e.message, 'err'); } };
  const el = h('div', { class: 'ph-block' }, ic(isImg ? 'image' : 'clip'), h('button', { class: 'btn primary sm', onclick: async () => up(await pickFiles(isImg ? 'image/*' : '')) }, ic('upload'), isImg ? 'Загрузить изображение' : 'Загрузить файл'), inp);
  el.addEventListener('dragover', e => { e.preventDefault(); el.style.outline = '2px dashed var(--accent)'; });
  el.addEventListener('dragleave', () => el.style.outline = '');
  el.addEventListener('drop', e => { e.preventDefault(); el.style.outline = ''; up([...e.dataTransfer.files]); });
  return el;
}
function imageView(b) {
  const w = h('div');
  const draw = () => {
    w.innerHTML = '';
    if (!b.content.url) return w.append(mediaPlaceholder(b, 'image', draw));
    const width = b.properties.width || 100;
    const cap = h('div', { class: 'ce ph-always', contenteditable: 'true', 'data-ph': 'Подпись (необязательно)' }); cap.textContent = b.content.caption || '';
    cap.addEventListener('input', () => { b.content.caption = cap.innerText; save(b); });
    cap.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cap.blur(); } });
    const img = h('img', { src: b.content.url, alt: b.content.caption || '', loading: 'lazy', style: `width:${width}%` });
    w.append(h('div', { class: 'img' }, img, h('div', { class: 'img-tools' },
      ...[[50, 'S'], [75, 'M'], [100, 'L']].map(([v, n]) => h('button', { class: 'ib', title: 'Ширина ' + v + '%', onclick: () => { b.properties.width = v; save(b, 0); img.style.width = v + '%'; } }, n)),
      h('a', { class: 'ib', href: b.content.url, target: '_blank', rel: 'noopener', title: 'Открыть оригинал' }, ic('ext')),
      h('button', { class: 'ib', title: 'Заменить', onclick: () => { b.content = {}; draw(); } }, ic('refresh'))), cap));
  };
  draw(); return w;
}
function fileView(b) {
  const w = h('div');
  const draw = () => {
    w.innerHTML = '';
    if (!b.content.url) return w.append(mediaPlaceholder(b, 'file', draw));
    const c = b.content, dl = c.url.startsWith('/files/') ? c.url + '?dl=1' : c.url;
    w.append(h('div', { class: 'file-card' }, h('span', { class: 'fic' }, ic('clip')), h('div', { class: 'grow' }, h('div', { class: 'nm' }, c.name || 'Файл'), h('div', { class: 'mut small' }, [c.size ? fmtSize(c.size) : null, c.mime].filter(Boolean).join(' · '))),
      c.url.startsWith('/files/') && /^(image|application\/pdf|video|audio|text\/plain)/.test(c.mime || '') ? h('a', { class: 'btn sm ghost', href: c.url, target: '_blank', rel: 'noopener' }, ic('eye'), 'Открыть') : null,
      h('a', { class: 'btn sm', href: dl, target: '_blank', rel: 'noopener', download: c.name || '' }, ic('download'), 'Скачать')));
  };
  draw(); return w;
}
function embedSrc(u) {
  let m;
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/))) return `https://www.youtube.com/embed/${m[1]}`;
  if ((m = u.match(/vimeo\.com\/(\d+)/))) return `https://player.vimeo.com/video/${m[1]}`;
  if ((m = u.match(/rutube\.ru\/video\/([\w]+)/))) return `https://rutube.ru/play/embed/${m[1]}`;
  if (/figma\.com\/(file|design|proto|board)/.test(u)) return `https://www.figma.com/embed?embed_host=projecthub&url=${encodeURIComponent(u)}`;
  if (/yandex\.(ru|com)\/maps/.test(u)) return u.replace(/yandex\.(ru|com)\/maps/, 'yandex.$1/map-widget/v1');
  if (/loom\.com\/share\//.test(u)) return u.replace('/share/', '/embed/');
  if (/miro\.com\/app\/board\//.test(u)) return u.replace('/app/board/', '/app/live-embed/');
  const g = gInfo(u); if (g) return g.view;
  return u;
}
function embedView(b) {
  const w = h('div');
  const draw = () => {
    w.innerHTML = '';
    if (!b.content.url) {
      const inp = h('input', { class: 'inp', placeholder: 'Ссылка: YouTube, RuTube, Vimeo, Figma, Miro, Яндекс Карты, сайт…' });
      const ok = () => { const u = inp.value.trim(); if (!/^https?:\/\//.test(u)) return toast('Нужна ссылка, начинающаяся с http(s)://', 'err'); b.content = { url: u, title: '' }; b.properties.height = b.properties.height || 420; save(b, 0); draw(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      return w.append(h('div', { class: 'ph-block' }, ic('embed'), inp, h('button', { class: 'btn primary sm', onclick: ok }, 'Встроить')));
    }
    const host = (() => { try { return new URL(b.content.url).hostname.replace(/^www\./, ''); } catch { return b.content.url; } })();
    if (b.properties.asLink) {
      w.append(h('a', { class: 'bm', href: b.content.url, target: '_blank', rel: 'noopener' }, ic('link'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { style: 'font-weight:500' }, b.content.title || host), h('div', { class: 'mut small', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, b.content.url)),
        h('button', { class: 'ib', title: 'Показать встроенным', onclick: e => { e.preventDefault(); b.properties.asLink = false; save(b, 0); draw(); } }, ic('embed'))));
      return;
    }
    const frame = h('iframe', { src: embedSrc(b.content.url), loading: 'lazy', allowfullscreen: true, allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture', sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation', style: `height:${b.properties.height || 420}px` });
    const rs = h('div', { class: 'resize' });
    rs.addEventListener('mousedown', e => { e.preventDefault(); const y0 = e.clientY, h0 = frame.offsetHeight; frame.style.pointerEvents = 'none'; const mv = ev => frame.style.height = Math.max(160, h0 + ev.clientY - y0) + 'px'; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); frame.style.pointerEvents = ''; b.properties.height = frame.offsetHeight; save(b, 0); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); });
    w.append(h('div', { class: 'frame' }, h('div', { class: 'frame-h' }, ic('embed', 'mut'), h('span', { class: 'ttl', style: 'font-weight:500' }, host), h('a', { class: 'ib', href: b.content.url, target: '_blank', rel: 'noopener', title: 'Открыть' }, ic('ext')),
      h('button', { class: 'ib', title: 'Ещё', onclick: e => menu(e.currentTarget, [{ label: 'Показать как ссылку', icon: 'link', onClick: () => { b.properties.asLink = true; save(b, 0); draw(); } }, { label: 'Изменить ссылку', icon: 'edit', onClick: () => { b.content.url = ''; draw(); } }, '-', { label: 'Удалить блок', icon: 'trash', danger: true, onClick: () => deleteBlockEl(b) }], { align: 'end' }) }, ic('more'))), frame, rs));
  };
  draw(); return w;
}
