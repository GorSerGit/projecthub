// Хранилище блоков: один JSON-файл на пространство, кэш в памяти.
// Личное пространство — data/<login>.json (формат старого проекта), общее — spaces/team.json.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const now = () => new Date().toISOString(), uuid = () => crypto.randomUUID();
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wj = (f, d) => { fs.writeFileSync(f + '.tmp', JSON.stringify(d)); fs.renameSync(f + '.tmp', f); }; // атомарная запись

function createStore(root) {
  const DATA = path.join(root, 'data'), SPACES = path.join(root, 'spaces');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(SPACES, { recursive: true });
  const cache = new Map();
  const fileOf = key => key === 'team' ? path.join(SPACES, 'team.json') : path.join(DATA, key.slice(2).replace(/[^A-Za-z0-9_.-]/g, '_') + '.json');

  function load(key) {
    if (cache.has(key)) return cache.get(key);
    let d = rj(fileOf(key), null); const fresh = !d;
    d = d || { blocks: {} };
    d.blocks = d.blocks || {}; d.rev = d.rev || 0; d.deleted = d.deleted || []; d.meta = d.meta || {};
    d.meta.lists = d.meta.lists || []; d.meta.favorites = d.meta.favorites || [];
    for (const b of Object.values(d.blocks)) { b.content = b.content || {}; b.properties = b.properties || {}; if (b.rev == null) b.rev = 0; }
    cache.set(key, d);
    if (fresh) { seed(d, key === 'team'); save(key); }
    return d;
  }
  function save(key) {
    const d = cache.get(key); if (!d) return;
    if (d.deleted.length > 4000) { d.meta.prunedRev = d.deleted[d.deleted.length - 2000].rev; d.deleted = d.deleted.slice(-2000); }
    wj(fileOf(key), d);
  }
  const put = (d, b, by) => { b.rev = ++d.rev; b.updatedAt = now(); if (by) { b.by = by.login; b.cid = by.cid; } d.blocks[b.id] = b; return b; };
  const make = (d, o, by) => put(d, {
    id: o.id || uuid(), parentId: o.parentId ?? null, type: o.type || 'text', content: o.content || {}, properties: o.properties || {},
    position: typeof o.position === 'number' ? o.position : 0, createdAt: now(), createdBy: by?.login
  }, by);

  // дочерние элементы: по parentId, а также строки таблиц и события календарей, привязанные через tableId/calendarId
  function childIndex(d) {
    const m = new Map();
    for (const b of Object.values(d.blocks)) for (const p of [b.parentId, b.properties.tableId, b.properties.calendarId])
      if (p) { if (!m.has(p)) m.set(p, []); m.get(p).push(b.id); }
    return m;
  }
  function subtree(d, id) {
    const m = childIndex(d), out = [], seen = new Set(), st = [id];
    while (st.length) { const i = st.pop(); if (seen.has(i) || !d.blocks[i]) continue; seen.add(i); out.push(i); st.push(...(m.get(i) || [])); }
    return out;
  }
  function remove(d, id) { for (const i of subtree(d, id)) { delete d.blocks[i]; d.deleted.push({ id: i, rev: ++d.rev }); } }

  // копия поддерева с новыми id (дублирование, перенос между пространствами при конфликте id)
  function cloneTree(src, id, dst, by, rootPatch = {}) {
    const ids = subtree(src, id), map = {}; ids.forEach(i => map[i] = uuid()); const out = [];
    for (const i of ids) {
      const b = JSON.parse(JSON.stringify(src.blocks[i]));
      b.id = map[i]; b.parentId = map[b.parentId] || b.parentId;
      if (b.properties.tableId) b.properties.tableId = map[b.properties.tableId] || b.properties.tableId;
      if (b.properties.calendarId) b.properties.calendarId = map[b.properties.calendarId] || b.properties.calendarId;
      if (i === id) Object.assign(b, rootPatch);
      b.createdAt = now(); out.push(put(dst, b, by));
    }
    return out;
  }

  function seed(d, team) {
    const add = o => make(d, o);
    const today = new Date(), ymd = x => x.toISOString().slice(0, 10), plus = n => ymd(new Date(today.getTime() + n * 864e5));
    if (team) {
      const p = add({ type: 'page', content: { title: 'Командное пространство' }, properties: { icon: '👥' }, position: 0 });
      add({ parentId: p.id, type: 'callout', content: { text: 'Всё в этом разделе видят и редактируют все участники. Личные страницы находятся в разделе «Личное».' }, properties: { icon: '🤝', color: 'blue' }, position: 0 });
      add({ parentId: p.id, type: 'h2', content: { text: 'Задачи команды' }, position: 1 });
      const k = add({ parentId: p.id, type: 'kanban_view', content: { title: 'Задачи' }, properties: {}, position: 2 });
      add({ parentId: k.id, type: 'kanban_card', content: { text: 'Договориться о правилах работы' }, properties: { status: 'Todo', tags: ['Организация'] }, position: 0 });
      return;
    }
    const p = add({ type: 'page', content: { title: 'Добро пожаловать' }, properties: { icon: '👋', cover: 'g3' }, position: 0 });
    let i = 0; const c = o => add({ parentId: p.id, position: i++, ...o });
    c({ type: 'callout', content: { text: 'Нажмите «/» в пустой строке, чтобы добавить блок: заголовок, список, таблицу, канбан, календарь, Google Таблицу, файл или изображение.' }, properties: { icon: '💡', color: 'yellow' } });
    c({ type: 'h2', content: { text: 'С чего начать' } });
    c({ type: 'todo', content: { text: 'Создать аккаунт' }, properties: { checked: true } });
    c({ type: 'todo', content: { text: 'Создать свою страницу кнопкой «+» в боковой панели' } });
    c({ type: 'todo', content: { text: 'Перетащить карточку на канбане ниже в другую колонку' } });
    c({ type: 'todo', content: { text: 'Добавить Google Таблицу в разделе «Google Таблицы»' } });
    c({ type: 'h2', content: { text: 'Задачи' } });
    const k = c({ type: 'kanban_view', content: { title: 'Мои задачи' }, properties: {} });
    add({ parentId: k.id, type: 'kanban_card', content: { text: 'Разобрать входящие' }, properties: { status: 'Todo', tags: ['Быстро'], due: plus(1) }, position: 0 });
    add({ parentId: k.id, type: 'kanban_card', content: { text: 'Подготовить план проекта' }, properties: { status: 'In Progress', tags: ['Важно'], due: plus(3) }, position: 1 });
    add({ parentId: k.id, type: 'kanban_card', content: { text: 'Зарегистрироваться' }, properties: { status: 'Done', tags: [] }, position: 2 });
    c({ type: 'h2', content: { text: 'Календарь' } });
    const cal = c({ type: 'calendar_view', content: { title: 'Календарь' }, properties: {} });
    add({ parentId: p.id, type: 'event', content: { text: 'Планёрка' }, properties: { date: plus(2), time: '10:00', color: 'blue', calendarId: cal.id }, position: 0 });
    c({ type: 'text', content: { text: '' } });
  }

  return { load, save, put, make, remove, subtree, cloneTree, keys: () => [...cache.keys()] };
}

module.exports = { createStore, rj, wj, now, uuid };
