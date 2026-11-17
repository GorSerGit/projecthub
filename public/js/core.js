'use strict';
/* ===== ProjectHub · ядро: DOM-хелперы, иконки, API, данные и синхронизация, всплывающие окна ===== */

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // только для доверенной разметки (иконки, canon())
    else if (k === 'value' || k === 'checked' || k === 'disabled') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
// crypto.randomUUID есть только на HTTPS — на сервере по http:// используем getRandomValues
const uid = () => { const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128; const x = [...b].map(v => v.toString(16).padStart(2, '0')).join(''); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- иконки (линейные, 24×24) ---------- */
const ICONS = {
  home: '<path d="m3 10.5 9-7.5 9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6.5H9v6.5H4.5A1.5 1.5 0 0 1 3 20z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  page: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  right: '<path d="m9 6 6 6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 6-6 6 6 6"/>', up: '<path d="m6 15 6-6 6 6"/>',
  dleft: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M18 7l-.8 12.2a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8L6 7M10 11v6M14 11v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  sheet: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9h17M3.5 14.5h17M9.5 9v11.5"/>',
  kanban: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8.5 7.5v8M12 7.5v4.5M15.5 7.5v6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M16 3v4M8 3v4M3.5 10h17"/>',
  users: '<path d="M16 21v-1.5a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V21"/><circle cx="9.3" cy="7.5" r="3.8"/><path d="M21.5 21v-1.5a4 4 0 0 0-3-3.9M16 3.7a3.8 3.8 0 0 1 0 7.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  star: '<path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.8l2 2h7.2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  upload: '<path d="M12 15.5V4M7 8.5l5-4.5 5 4.5M4 20h16"/>', download: '<path d="M12 4v11.5M7 11l5 4.5 5-4.5M4 20h16"/>',
  more: '<circle class="f" cx="5.5" cy="12" r="1.5"/><circle class="f" cx="12" cy="12" r="1.5"/><circle class="f" cx="18.5" cy="12" r="1.5"/>',
  grip: '<circle class="f" cx="9" cy="6" r="1.5"/><circle class="f" cx="15" cy="6" r="1.5"/><circle class="f" cx="9" cy="12" r="1.5"/><circle class="f" cx="15" cy="12" r="1.5"/><circle class="f" cx="9" cy="18" r="1.5"/><circle class="f" cx="15" cy="18" r="1.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/>',
  logout: '<path d="M9.5 20.5H5.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4M16 16.5l4.5-4.5L16 7.5M20.5 12H9.5"/>',
  link: '<path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5"/><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5"/>',
  image: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="9" cy="9" r="1.8"/><path d="m20.5 15-5-5-11 10.5"/>',
  clip: '<path d="m20.5 11.5-8.3 8.3a5.1 5.1 0 0 1-7.2-7.2l8.3-8.3a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6"/>',
  send: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>',
  panel: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.5 3.5v17"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/>',
  restore: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
  ext: '<path d="M14.5 3.5h6v6M10 14 20.5 3.5M18 13.5v5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  list: '<path d="M9 6.5h11.5M9 12h11.5M9 17.5h11.5"/><circle class="f" cx="4.5" cy="6.5" r="1.2"/><circle class="f" cx="4.5" cy="12" r="1.2"/><circle class="f" cx="4.5" cy="17.5" r="1.2"/>',
  olist: '<path d="M10 6.5h10.5M10 12h10.5M10 17.5h10.5M4 5l1.5-1v5M4 9h3M4 14.2a1.5 1.5 0 1 1 2.6 1L4 18.5h3"/>',
  todo: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12.3 2.8 2.7L16 9.5"/>',
  move: '<path d="M16 3.5 20 7.5l-4 4M20 7.5H4.5M8 20.5l-4-4 4-4M4 16.5h15.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  text: '<path d="M5 7V4.5h14V7M9.5 19.5h5M12 4.5v15"/>',
  h1: '<path d="M4 6v12M12 6v12M4 12h8M17 10l2.5-1.5V18"/>', h2: '<path d="M4 6v12M12 6v12M4 12h8M16 10.5a2.3 2.3 0 0 1 4.3 1.1c0 1.6-4.3 4.6-4.3 6.4h4.5"/>',
  h3: '<path d="M4 6v12M12 6v12M4 12h8M16.2 9.2h4l-2.3 3a2.3 2.3 0 1 1-1.9 3.9"/>',
  quote: '<path d="M4 6.5h4.5v5.5c0 3-1.5 5-4.5 5.5M13.5 6.5H18v5.5c0 3-1.5 5-4.5 5.5"/>',
  code: '<path d="m15.5 17.5 5-5.5-5-5.5M8.5 6.5 3.5 12l5 5.5"/>',
  minus: '<path d="M4.5 12h15"/>',
  bulb: '<path d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7v.5h6V16c0 -.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5z"/>',
  toggle: '<path d="m8 7 5 5-5 5"/><path d="M15 17h5"/>',
  embed: '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m10 9.5 4.5 2.5-4.5 2.5z"/>',
  sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  filter: '<path d="M3.5 5h17l-6.5 8v6l-4 1.5V13z"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1l2.6 2.6M20.5 3.5v5h-5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  print: '<path d="M6.5 9V3.5h11V9M6.5 17.5h-2a2 2 0 0 1-2-2v-4.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-2"/><rect x="6.5" y="14" width="11" height="7" rx="1"/>',
  expand: '<path d="M14.5 3.5h6v6M9.5 20.5h-6v-6M20.5 3.5 14 10M3.5 20.5 10 14"/>',
  hash: '<path d="M5 9h14M5 15h14M10 3.5 8 20.5M16 3.5l-2 17"/>',
  calendarDay: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M16 3v4M8 3v4M3.5 10h17"/><rect class="f" x="7.5" y="13" width="3.5" height="3.5" rx=".6"/>',
  num: '<path d="M4 7.5h3v9M4 16.5h6M14 7.5h3.5a2.5 2.5 0 0 1 0 5H14v4h6"/>',
  at: '<circle cx="12" cy="12" r="3.8"/><path d="M15.8 8.2v5a2.5 2.5 0 0 0 5 0V12a8.8 8.8 0 1 0-3.5 7"/>',
  phone: '<path d="M5 4h3.5l1.8 4.5-2.3 1.3a11 11 0 0 0 6.2 6.2l1.3-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  select: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 11 3.5 3.5 3.5-3.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1A4.3 4.3 0 0 0 21 10.8C21 6.5 17 3 12 3z"/><circle class="f" cx="7.5" cy="11.5" r="1.2"/><circle class="f" cx="10.5" cy="7.5" r="1.2"/><circle class="f" cx="15" cy="7.5" r="1.2"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  import: '<path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15"/>',
  bold: '<path d="M7 4.5h6a3.8 3.8 0 0 1 0 7.5H7zM7 12h7a3.8 3.8 0 0 1 0 7.5H7z"/>',
  flag: '<path d="M5 21V4M5 4h11.5l-2 4 2 4H5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
function ic(n, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic ' + cls); s.innerHTML = (ICONS[n] || '').replace(/class="f"/g, 'fill="currentColor" stroke="none"');
  return s;
}

/* ---------- настройки браузера, тема ---------- */
const Pref = {
  get(k, d) { try { const v = localStorage.getItem('ph_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ph_' + k, JSON.stringify(v)); } catch { } }
};
const mq = matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const t = Pref.get('theme', 'dark');
  document.documentElement.dataset.theme = t === 'system' ? (mq.matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.scale = Pref.get('scale', 'm');
}
mq.addEventListener?.('change', applyTheme);
applyTheme();

/* ---------- API ---------- */
const App = { me: null, cfg: {}, tok: null, cid: uid(), rev: {}, spaces: ['me'] };
try { App.tok = localStorage.getItem('ph_token'); } catch { }
async function api(m, u, b, opt = {}) {
  const o = { method: m, headers: { 'x-auth-token': App.tok || '', 'x-client': App.cid }, keepalive: !!opt.keepalive };
  if (b instanceof FormData) o.body = b; else if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  let r;
  try { r = await fetch('/api' + u, o); } catch { throw new Error('Нет связи с сервером'); }
  if (r.status === 401 && App.tok && !/^\/(login|me\/password)/.test(u)) { logout(); throw new Error('Сессия истекла — войдите снова'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Ошибка ' + r.status); e.status = r.status; throw e; }
  return j;
}
function setToken(t) { App.tok = t; try { t ? localStorage.setItem('ph_token', t) : localStorage.removeItem('ph_token'); } catch { } }
async function download(path, name) {
  const t = toast('Готовлю файл…', 'info', 0);
  try {
    const r = await fetch('/api' + path, { headers: { 'x-auth-token': App.tok } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Ошибка экспорта');
    const a = h('a', { href: URL.createObjectURL(await r.blob()), download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { toast(e.message, 'err'); } finally { t.remove(); }
}
function pickFiles(accept = '', multiple = false) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, multiple, style: 'display:none', onchange: () => { res([...i.files]); i.remove(); } });
    document.body.append(i); i.click();
  });
}
async function uploadFile(file) {
  const fd = new FormData(); fd.append('file', file, file.name);
  const t = toast(h('span', { class: 'row' }, h('span', { class: 'spinner' }), 'Загрузка «' + file.name + '»…'), 'info', 0);
  try { return await api('POST', '/upload', fd); } finally { t.remove(); }
}

/* ---------- данные: блоки всех пространств в одной карте ---------- */
const B = {}; let IDX = null;
const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
const reindex = () => { IDX = null; };
function kids(pid, type) {
  if (!IDX) {
    IDX = new Map();
    for (const b of Object.values(B)) { const k = b.parentId || '@' + b._s; let a = IDX.get(k); if (!a) IDX.set(k, a = []); a.push(b); }
    for (const a of IDX.values()) a.sort(byPos);
  }
  const a = IDX.get(pid) || [];
  return type ? a.filter(b => b.type === type) : a;
}
const roots = (space, type) => kids('@' + space, type);
function ancestors(b) { const out = []; let p = B[b.parentId], n = 0; while (p && n++ < 100) { out.unshift(p); p = B[p.parentId]; } return out; }
const inTrash = b => !!b && (b.properties.trashed || ancestors(b).some(a => a.properties.trashed));
const pageOf = b => { let p = b, n = 0; while (p && p.type !== 'page' && n++ < 100) p = B[p.parentId]; return p; };
const titleOf = p => (p && p.content.title) || 'Без названия';
const pages = (space) => Object.values(B).filter(b => b.type === 'page' && (!space || b._s === space) && !inTrash(b));
const SPACE_NAME = { me: 'Личное', team: 'Команда' };

const Sync = { q: {}, pend: new Map(), busy: 0, err: false };
function setSaving() {
  const el = $('#saving'); if (!el) return;
  const n = Sync.busy + Sync.pend.size;
  el.innerHTML = '';
  if (Sync.err) el.append(ic('info'), h('span', {}, 'Нет связи'));
  else if (n) el.append(h('i', { class: 'spinner' }), h('span', {}, 'Сохранение…'));
  else el.append(h('span', {}, 'Сохранено'));
}
function enqueue(space, fn) {
  Sync.busy++; setSaving();
  const p = (Sync.q[space] || Promise.resolve()).then(fn).then(r => { Sync.err = false; return r; })
    .catch(e => { if (e.status !== 404) { Sync.err = !e.status; toast(e.message, 'err'); } })
    .finally(() => { Sync.busy--; setSaving(); });
  return Sync.q[space] = p;
}
const wire = b => ({ id: b.id, parentId: b.parentId, type: b.type, content: b.content, properties: b.properties, position: b.position });
function create(space, o) {
  const b = { parentId: null, type: 'text', content: {}, properties: {}, position: 0, ...o, id: uid(), _s: space, createdAt: new Date().toISOString(), createdBy: App.me?.login };
  B[b.id] = b; reindex();
  enqueue(space, () => api('POST', `/s/${space}/blocks`, wire(b)));
  return b;
}
function createMany(space, list) {
  const out = list.map(o => { const b = { parentId: null, type: 'text', content: {}, properties: {}, position: 0, id: uid(), ...o, _s: space }; B[b.id] = b; return b; });
  reindex(); enqueue(space, () => api('POST', `/s/${space}/blocks`, { blocks: out.map(wire) }));
  return out;
}
function save(b, ms = 450) {
  const p = Sync.pend.get(b.id); if (p) clearTimeout(p.t);
  Sync.pend.set(b.id, { b, t: setTimeout(() => flush(b.id), ms) }); setSaving();
}
function flush(id, keepalive) {
  const p = Sync.pend.get(id); if (!p) return; clearTimeout(p.t); Sync.pend.delete(id);
  if (!B[id]) return setSaving();
  enqueue(p.b._s, () => api('PUT', `/s/${p.b._s}/blocks/${id}`, wire(p.b), { keepalive }));
}
const flushAll = keepalive => [...Sync.pend.keys()].forEach(id => flush(id, keepalive));
function localSubtree(id) {
  const out = [], st = [id], seen = new Set();
  while (st.length) {
    const i = st.pop(); if (seen.has(i) || !B[i]) continue; seen.add(i); out.push(i);
    const b = B[i]; st.push(...kids(i).map(x => x.id));
    if (b.type === 'table' || b.type === 'calendar_view') st.push(...kids(b.parentId).filter(x => x.properties.tableId === i || x.properties.calendarId === i).map(x => x.id));
  }
  return out;
}
function removeBlock(b) {
  for (const i of localSubtree(b.id)) { const p = Sync.pend.get(i); if (p) clearTimeout(p.t); Sync.pend.delete(i); delete B[i]; }
  reindex(); enqueue(b._s, () => api('DELETE', `/s/${b._s}/blocks/${b.id}`));
}
function batchUpdate(space, list) { // list: блоки, у которых поменялись position/parentId
  reindex(); if (!list.length) return;
  for (const b of list) { const p = Sync.pend.get(b.id); if (p) { clearTimeout(p.t); Sync.pend.delete(b.id); } }
  enqueue(space, () => api('POST', `/s/${space}/batch`, { updates: list.map(wire) }));
}
// позиция между соседями; при слишком маленьком зазоре — перенумерация
function positionAfter(list, prev) {
  const i = prev ? list.indexOf(prev) : -1, a = i >= 0 ? list[i].position ?? 0 : null, nx = list[i + 1];
  if (!nx) return a == null ? 0 : a + 1;
  if (a == null) return (nx.position ?? 0) - 1;
  if (Math.abs((nx.position ?? 0) - a) < 1e-6) { list.forEach((b, k) => b.position = k); batchUpdate(list[0]._s, list); return i + 0.5; }
  return (a + (nx.position ?? 0)) / 2;
}
async function loadSpace(space) {
  const r = await api('GET', `/s/${space}/blocks`);
  for (const id in B) if (B[id]._s === space) delete B[id];
  for (const b of r.blocks) { b._s = space; b.content = b.content || {}; b.properties = b.properties || {}; B[b.id] = b; }
  App.rev[space] = r.rev; reindex();
}
async function pull(space) {
  const r = await api('GET', `/s/${space}/changes?since=${App.rev[space] || 0}`);
  if (r.reset) { await loadSpace(space); return true; }
  let changed = false;
  for (const b of r.blocks) { if (b.cid === App.cid || Sync.pend.has(b.id)) continue; b._s = space; B[b.id] = b; changed = true; }
  for (const id of r.deleted) if (B[id]) { delete B[id]; changed = true; }
  App.rev[space] = r.rev; if (changed) reindex();
  return changed;
}

/* ---------- текст с форматированием: только безопасные теги ---------- */
const RT = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', CODE: 'code', MARK: 'mark', A: 'a' };
function canon(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += esc(n.nodeValue); continue; }
    if (n.nodeType !== 1) continue;
    const t = n.tagName;
    if (t === 'BR') { out += '<br>'; continue; }
    if (t === 'SCRIPT' || t === 'STYLE') continue;
    const inner = canon(n); let tag = RT[t];
    if (!tag && t === 'SPAN') { const s = n.style; if (/bold|[6-9]00/.test(s.fontWeight)) tag = 'b'; else if (s.fontStyle === 'italic') tag = 'i'; }
    if (tag === 'a') { const href = (n.getAttribute('href') || '').trim(); out += /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}">${inner}</a>` : inner; continue; }
    if (tag) { if (inner) out += `<${tag}>${inner}</${tag}>`; continue; }
    if ((t === 'DIV' || t === 'P' || t === 'LI' || /^H\d$/.test(t)) && out && !out.endsWith('<br>')) out += '<br>';
    out += (t === 'LI' ? '• ' : '') + inner;
  }
  return out;
}
const tpl = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
const safeHtml = html => canon(tpl(html || ''));
function setRich(el, c, tk = 'text', hk = 'html') { if (c[hk]) el.innerHTML = safeHtml(c[hk]); else el.textContent = c[tk] || ''; }
function readRich(el, c, tk = 'text', hk = 'html') {
  let html = canon(el).replace(/(<br>)+$/, '');
  c[tk] = el.innerText.replace(/\n$/, '');
  if (/<(b|i|u|s|code|mark|a)[ >]/.test(html)) c[hk] = html; else delete c[hk];
}

/* ---------- даты ---------- */
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const todayStr = () => ymd(new Date());
const dayDiff = s => Math.round((parseYmd(s) - parseYmd(todayStr())) / 864e5);
function fmtDate(s, rel = true) {
  if (!s) return '';
  const d = parseYmd(s), n = dayDiff(s);
  if (rel && n === 0) return 'Сегодня'; if (rel && n === 1) return 'Завтра'; if (rel && n === -1) return 'Вчера';
  return d.getDate() + ' ' + MONTHS_G[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}
const fmtTime = iso => { if (!iso) return ''; const d = new Date(iso); return fmtDate(ymd(d)) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fmtSize = n => n < 1024 ? n + ' Б' : n < 1048576 ? (n / 1024).toFixed(0) + ' КБ' : (n / 1048576).toFixed(1) + ' МБ';

/* ---------- цвета, аватары ---------- */
const COLORS = [['default', 'По умолчанию'], ['gray', 'Серый'], ['brown', 'Коричневый'], ['orange', 'Оранжевый'], ['yellow', 'Жёлтый'], ['green', 'Зелёный'], ['blue', 'Синий'], ['purple', 'Фиолетовый'], ['pink', 'Розовый'], ['red', 'Красный']];
const COLOR_KEYS = COLORS.map(c => c[0]).slice(1);
const hashColor = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0; return COLOR_KEYS[Math.abs(x) % COLOR_KEYS.length]; };
const AV = { gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#c29343', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
const avatar = (login, name, cls = 'avatar') => h('span', { class: cls, style: `background:${AV[hashColor(login)]}`, title: name || login }, (name || login || '?').trim()[0].toUpperCase());
const chip = (text, color, extra) => h('span', { class: 'chip c-' + (color || 'default') }, text, extra);

/* ---------- уведомления ---------- */
function toast(msg, type = 'ok', ms = 3200) {
  let box = $('#toasts'); if (!box) document.body.append(box = h('div', { id: 'toasts' }));
  const t = h('div', { class: 'toast ' + type }, type === 'ok' ? ic('check') : type === 'err' ? ic('info') : null, msg);
  box.append(t); if (ms) setTimeout(() => t.remove(), ms);
  return t;
}

/* ---------- всплывающие меню ---------- */
let POPS = [];
const closePops = () => [...POPS].forEach(p => p.close());
function popup(anchor, content, o = {}) {
  if (!o.nested) closePops();
  const el = h('div', { class: 'pop ' + (o.cls || '') }, content); document.body.append(el);
  const place = () => {
    const r = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
    const w = el.offsetWidth, hh = el.offsetHeight;
    let left = o.align === 'end' ? r.right - w : r.left, top = (r.bottom ?? r.top) + 4;
    if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 4);
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    el.style.left = left + 'px'; el.style.top = top + 'px';
  };
  place();
  const out = e => { if (!el.contains(e.target) && !(o.ignore && o.ignore.contains(e.target))) close(); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } else o.onKey?.(e); };
  const close = () => {
    if (!el.isConnected) return;
    el.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', key, true);
    POPS = POPS.filter(p => p !== P); o.onClose?.();
  };
  setTimeout(() => document.addEventListener('mousedown', out, true));
  document.addEventListener('keydown', key, true);
  const P = { el, close, place }; POPS.push(P); return P;
}
// items: {label, icon, hint, danger, check, onClick, keep} | '-' | {head} | {colors, value, onPick} | Element
function menu(anchor, items, o = {}) {
  const box = h('div', { class: 'menu' });
  let P;
  for (const it of items.filter(Boolean)) {
    if (it === '-') box.append(h('div', { class: 'm-sep' }));
    else if (it.nodeType) box.append(it);
    else if (it.head) box.append(h('div', { class: 'm-head' }, it.head));
    else if (it.colors) box.append(h('div', { class: 'm-colors' }, COLORS.map(([k, n]) => h('button', { class: 'c-' + k + (it.value === k || (!it.value && k === 'default') ? ' on' : ''), title: n, onclick: () => { P.close(); it.onPick(k); } }))));
    else box.append(h('div', { class: 'mi' + (it.danger ? ' danger' : ''), onclick: e => { if (!it.keep) P.close(); it.onClick?.(e); } },
      it.icon ? (typeof it.icon === 'string' ? ic(it.icon) : it.icon) : null, h('span', { class: 't' }, it.label), it.check ? ic('check', 'check') : null, it.hint ? h('span', { class: 'hk' }, it.hint) : null));
  }
  const mis = () => $$('.mi', box);
  P = popup(anchor, box, {
    ...o, onKey: e => {
      const l = mis(), i = l.findIndex(x => x.classList.contains('act'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); l[i]?.classList.remove('act'); const n = l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]; n?.classList.add('act'); n?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); l[i].click(); }
    }
  });
  return P;
}

/* ---------- модальные окна ---------- */
function modal({ title, body, foot, cls = '', onClose, noHead }) {
  const close = () => { if (!ov.isConnected) return; ov.remove(); document.removeEventListener('keydown', key); onClose?.(); };
  const key = e => { if (e.key === 'Escape' && !POPS.length && document.querySelector('.overlay:last-of-type') === ov) close(); };
  const box = h('div', { class: 'modal ' + cls },
    noHead ? null : h('div', { class: 'modal-h' }, h('span', { class: 't' }, title || ''), h('button', { class: 'ib', onclick: () => close(), title: 'Закрыть' }, ic('x'))),
    h('div', { class: 'modal-b' }, body), foot ? h('div', { class: 'modal-f' }, foot) : null);
  const ov = h('div', { class: 'overlay', onmousedown: e => { if (e.target === ov) close(); } }, box);
  document.body.append(ov); document.addEventListener('keydown', key);
  return { el: box, body: box.querySelector('.modal-b'), close };
}
function confirmBox(text, { ok = 'Удалить', danger = true, title = 'Подтвердите действие' } = {}) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; m.close(); res(v); };
    const okB = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => fin(true) }, ok);
    const m = modal({ title, body: h('p', { style: 'margin:.2rem 0 .4rem;line-height:1.55' }, text), foot: [h('button', { class: 'btn ghost', onclick: () => fin(false) }, 'Отмена'), okB], onClose: () => fin(false) });
    setTimeout(() => okB.focus());
  });
}
function promptBox(title, { value = '', placeholder = '', ok = 'Готово', label } = {}) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; m.close(); res(v); };
    const inp = h('input', { class: 'inp', value, placeholder, onkeydown: e => { if (e.key === 'Enter') fin(inp.value); } });
    const m = modal({ title, body: [label ? h('div', { class: 'hint', style: 'margin-bottom:.6rem' }, label) : null, inp], foot: [h('button', { class: 'btn ghost', onclick: () => fin(null) }, 'Отмена'), h('button', { class: 'btn primary', onclick: () => fin(inp.value) }, ok)], onClose: () => fin(null) });
    setTimeout(() => { inp.focus(); inp.select(); });
  });
}
const switchEl = (on, onChange) => { const s = h('span', { class: 'sw' + (on ? ' on' : ''), role: 'switch', onclick: () => { s.classList.toggle('on'); onChange(s.classList.contains('on')); } }); return s; };
function seg(options, value, onChange) {
  const box = h('div', { class: 'seg' });
  for (const [k, label] of options) box.append(h('button', { class: k === value ? 'on' : '', onclick: () => { $$('button', box).forEach(b => b.classList.remove('on')); box.children[options.findIndex(o => o[0] === k)].classList.add('on'); onChange(k); } }, label));
  return box;
}

/* ---------- выбор эмодзи и обложки ---------- */
const EMOJI = '📄 📝 📌 📎 📁 📂 🗂️ 📊 📈 📉 📅 🗓️ ⏰ ✅ ☑️ 🎯 🚀 💡 🔥 ⭐ 🌟 ✨ 💎 🏆 🎉 🎓 📚 📖 ✏️ 🖊️ 🧠 💼 🏢 🏠 🏫 🧪 🔬 💻 🖥️ 📱 ⚙️ 🛠️ 🔧 🔒 🔑 🧩 🎨 🎬 🎵 📷 🌍 🗺️ ✈️ 🚗 🛒 💰 💳 📦 🍀 🌱 🌸 🌈 ☀️ 🌙 ⚡ ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 👋 👥 👤 🤝 💬 📣 📢 🔔 ❓ ❗ ⚠️ 🚩 🏁 🧾 📋 🗒️ 📮 ✉️ 📧 🍎 ☕ 🍕 🎁 🐱 🐶 🦊 🐼 🦄 🐝 🌊 🏔️ 🧭 ⏳ 🔍 🧹 🗑️'.split(' ');
function emojiPicker(anchor, onPick, allowRemove = true) {
  const P = popup(anchor, h('div', {},
    h('div', { class: 'row', style: 'padding:.2rem .3rem .4rem' }, h('span', { class: 'mut small grow' }, 'Иконка'),
      h('button', { class: 'btn sm ghost', onclick: () => { P.close(); onPick(EMOJI[Math.floor(Math.random() * EMOJI.length)]); } }, 'Случайная'),
      allowRemove ? h('button', { class: 'btn sm ghost', onclick: () => { P.close(); onPick(null); } }, 'Убрать') : null),
    h('div', { class: 'emoji-grid' }, EMOJI.map(e => h('button', { onclick: () => { P.close(); onPick(e); } }, e)))), { nested: true });
}
const COVERS = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12'];
const coverStyle = c => c && /^\/files\/[\w-]+\/[^"'()\\\s]*$/.test(c) ? `background-image:url("${c}")` : '';

/* ---------- выделение и курсор в редактируемых полях ---------- */
const sel = () => getSelection();
function caretAt(el, where) {
  el.focus();
  const r = document.createRange(), s = sel();
  if (typeof where === 'number') {
    let left = where, node = null, off = 0;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; if (left <= n.length) { node = n; off = left; break; } left -= n.length; }
    if (node) { r.setStart(node, off); r.collapse(true); } else { r.selectNodeContents(el); r.collapse(false); }
  } else { r.selectNodeContents(el); r.collapse(where === 'start'); }
  s.removeAllRanges(); s.addRange(r);
}
function caretOffset(el) {
  const s = sel(); if (!s.rangeCount || !el.contains(s.anchorNode)) return 0;
  const r = document.createRange(); r.selectNodeContents(el); r.setEnd(s.anchorNode, s.anchorOffset); return r.toString().length;
}
function atStart(el) { const s = sel(); if (!s.rangeCount || !s.isCollapsed) return false; return caretOffset(el) === 0; }
function atEnd(el) {
  const s = sel(); if (!s.rangeCount || !s.isCollapsed || !el.contains(s.anchorNode)) return false;
  const r = document.createRange(); r.selectNodeContents(el); r.setStart(s.anchorNode, s.anchorOffset); return r.toString().replace(/\n$/, '').length === 0;
}
function caretRect() {
  const s = sel(); if (!s.rangeCount) return null;
  const r = s.getRangeAt(0).cloneRange(); r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect) { const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement; rect = n.getBoundingClientRect(); }
  return rect;
}
function onFirstLine(el) { const c = caretRect(), r = el.getBoundingClientRect(); return !c || c.top - r.top < parseFloat(getComputedStyle(el).lineHeight) * .8 + 4; }
function onLastLine(el) { const c = caretRect(), r = el.getBoundingClientRect(); return !c || r.bottom - c.bottom < parseFloat(getComputedStyle(el).lineHeight) * .8 + 4; }
