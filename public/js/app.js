'use strict';
/* ===== Приложение: вход, каркас, боковая панель, разделы, поиск, настройки ===== */

const pageRoute = p => `#/p/${p._s}/${p.id}`;
const Expanded = new Set(Pref.get('exp', []));
const saveExp = () => Pref.set('exp', [...Expanded].slice(-300));
App.view = {};

/* ================= вход ================= */
function renderAuth(mode = 'login', token) {
  const root = $('#root'); root.innerHTML = '';
  const err = h('div', { class: 'err' }), name = App.cfg.appName || 'ProjectHub';
  const L = h('input', { class: 'inp', placeholder: mode === 'forgot' ? 'Логин или e-mail' : mode === 'register' ? 'Логин (латиница)' : 'Логин или e-mail', autocomplete: 'username' });
  const P = h('input', { class: 'inp', type: 'password', placeholder: mode === 'reset' ? 'Новый пароль (от 8 символов)' : 'Пароль', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
  const N = h('input', { class: 'inp', placeholder: 'Имя (как к вам обращаться)', autocomplete: 'name' });
  const E = h('input', { class: 'inp', type: 'email', placeholder: 'E-mail (для восстановления пароля)', autocomplete: 'email' });
  const btn = h('button', { class: 'btn primary', onclick: () => go_() }, { login: 'Войти', register: 'Создать аккаунт', forgot: 'Отправить ссылку', reset: 'Сохранить пароль' }[mode]);
  async function go_() {
    err.textContent = ''; btn.disabled = true;
    try {
      if (mode === 'forgot') { await api('POST', '/forgot', { login: L.value.trim() }); err.style.color = 'var(--ok)'; err.textContent = 'Если такой пользователь есть и у него указан e-mail, письмо со ссылкой уже в пути.'; return; }
      const r = mode === 'reset' ? await api('POST', '/reset', { token, password: P.value })
        : await api('POST', mode === 'register' ? '/register' : '/login', { login: L.value.trim(), password: P.value, name: N.value.trim(), email: E.value.trim() });
      setToken(r.token); location.hash = ''; boot();
    } catch (e) { err.style.color = ''; err.textContent = e.message; } finally { btn.disabled = false; }
  }
  [L, P, N, E].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go_(); }));
  const link = (text, m) => h('a', { onclick: () => renderAuth(m) }, text);
  root.append(h('div', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'auth-logo' }, h('span', { class: 'ws-logo' }, name[0]), name),
    h('p', { class: 'mut', style: 'margin:.2rem 0 1.4rem' }, { login: 'Войдите в рабочее пространство', register: 'Создайте аккаунт', forgot: 'Мы пришлём ссылку для смены пароля на e-mail', reset: 'Придумайте новый пароль' }[mode]),
    mode !== 'reset' ? L : null, mode === 'register' ? [N, E] : null, mode !== 'forgot' ? P : null, err, btn,
    h('div', { class: 'auth-links' },
      mode === 'login' ? (App.cfg.mailEnabled ? link('Забыли пароль?', 'forgot') : h('span')) : link('← Ко входу', 'login'),
      mode === 'login' && App.cfg.openRegistration ? link('Регистрация', 'register') : null))));
  setTimeout(() => (mode === 'reset' ? P : L).focus());
}
function logout() {
  setToken(null); for (const k in B) delete B[k]; reindex(); App.me = null; clearInterval(App.poll);
  history.replaceState(null, '', location.pathname); renderAuth('login');
}

/* ================= запуск ================= */
async function boot() {
  App.cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({ appName: 'ProjectHub' }));
  document.title = App.cfg.appName;
  const m = location.hash.match(/^#\/reset\/(\w+)/); if (m) return renderAuth('reset', m[1]);
  if (!App.tok) return renderAuth('login');
  $('#root').innerHTML = '<div class="auth"><span class="spinner"></span></div>';
  try {
    App.me = await api('GET', '/me');
    Object.assign(App.cfg, { mailEnabled: App.me.mailEnabled, teamSpace: App.me.teamSpace, appName: App.me.appName });
    App.spaces = App.cfg.teamSpace ? ['me', 'team'] : ['me'];
    await Promise.all(App.spaces.map(loadSpace));
    App.favs = await api('GET', '/s/me/meta/favorites').catch(() => []);
  } catch (e) {
    if (!App.tok) return;
    $('#root').innerHTML = ''; $('#root').append(h('div', { class: 'auth' }, h('div', { class: 'auth-card' }, h('h3', {}, 'Не удалось загрузить данные'), h('p', { class: 'mut' }, e.message), h('button', { class: 'btn primary', onclick: boot }, 'Повторить'))));
    return;
  }
  shell(); route();
  clearInterval(App.poll); App.poll = setInterval(pollChanges, 15000);
}
function shell() {
  const root = $('#root'); root.innerHTML = '';
  const appEl = h('div', { id: 'app', class: Pref.get('collapsed', false) ? 'collapsed' : '' }, h('aside', { id: 'side' }), h('main', { id: 'main' }, h('header', { id: 'top' }), h('div', { id: 'scroll' })));
  appEl.addEventListener('click', e => { if (e.target === appEl) appEl.classList.remove('mobile-open'); });
  root.append(appEl);
  document.documentElement.style.setProperty('--sw', Pref.get('sw', 17.5) + 'rem');
}
const toggleSide = () => { const a = $('#app'); a.classList.toggle('collapsed'); Pref.set('collapsed', a.classList.contains('collapsed')); renderTop(); };

/* ================= маршруты ================= */
function go(hash, opts) { App.nextOpts = opts || null; if (location.hash === hash) route(); else location.hash = hash; }
addEventListener('hashchange', () => { if (App.me) route(); });
function route() {
  const opts = App.nextOpts || {}; App.nextOpts = null;
  const [kind = 'home', , b] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  hideFmt(); closePops(); $('#app')?.classList.remove('mobile-open');
  if (kind === 'p') {
    const p = B[b];
    if (!p || p.type !== 'page' || inTrash(p)) { toast('Страница не найдена или в корзине', 'err'); return go('#/home'); }
    App.view = { kind: 'page', id: p.id, space: p._s };
    ancestors(p).forEach(x => Expanded.add(x.id)); saveExp();
    const rec = Pref.get('recent', []).filter(r => r.id !== p.id); rec.unshift({ s: p._s, id: p.id }); Pref.set('recent', rec.slice(0, 16));
    document.title = titleOf(p) + ' · ' + App.cfg.appName;
    renderSidebar(); renderTop();
    const title = renderPage(p); $('#scroll').scrollTop = 0;
    if (opts.focusTitle) setTimeout(() => caretAt(title, 'end'));
    if (opts.print) setTimeout(() => print(), 300);
    return;
  }
  const views = { home: renderHome, calendar: renderGlobalCalendar, sheets: renderSheets, mail: renderMail, files: renderFiles, trash: renderTrash };
  App.view = { kind: views[kind] ? kind : 'home', opts };
  document.title = (VIEW_NAMES[App.view.kind] || '') + ' · ' + App.cfg.appName;
  Ed.page = null; renderSidebar(); renderTop();
  const sc = $('#scroll'); sc.innerHTML = ''; sc.scrollTop = 0;
  (views[kind] || renderHome)(opts);
}
const VIEW_NAMES = { home: 'Главная', calendar: 'Календарь', sheets: 'Google Таблицы', mail: 'Рассылки', files: 'Файлы', trash: 'Корзина' };
const VIEW_ICONS = { home: 'home', calendar: 'calendar', sheets: 'sheet', mail: 'mail', files: 'folder', trash: 'trash' };

/* ================= боковая панель ================= */
function renderSidebar() {
  const s = $('#side'); if (!s) return;
  const st = $('.side-scroll', s)?.scrollTop || 0; s.innerHTML = '';
  const nav = (kind, label, icon, extra) => h('div', { class: 'si' + (App.view.kind === kind ? ' on' : ''), onclick: () => go('#/' + kind) }, ic(icon), h('span', { class: 't' }, label), extra);
  const trashN = Object.values(B).filter(b => b.type === 'page' && b.properties.trashed).length;
  s.append(
    h('div', { class: 'ws', onclick: e => wsMenu(e.currentTarget) }, h('span', { class: 'ws-logo' }, (App.cfg.appName || 'P')[0].toUpperCase()),
      h('div', { class: 'grow' }, h('div', { class: 'ws-name' }, App.cfg.appName), h('div', { class: 'ws-sub' }, App.me.name || App.me.login)),
      h('button', { class: 'ib', id: 'collapse', title: 'Скрыть панель (Ctrl+\\)', onclick: e => { e.stopPropagation(); toggleSide(); } }, ic('dleft'))),
    h('div', { class: 'side-nav' },
      h('div', { class: 'si', onclick: openSearch }, ic('search'), h('span', { class: 't' }, 'Поиск'), h('span', { class: 'kbd' }, 'Ctrl K')),
      nav('home', 'Главная', 'home'), nav('calendar', 'Календарь', 'calendar'), nav('sheets', 'Google Таблицы', 'sheet'), nav('mail', 'Рассылки', 'mail'), nav('files', 'Файлы', 'folder')));
  const sc = h('div', { class: 'side-scroll' });
  const favs = (App.favs || []).map(f => B[f.id]).filter(p => p && p.type === 'page' && !inTrash(p));
  if (favs.length) sc.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, h('span', { class: 't' }, 'Избранное')), favs.map(p => treeRow(p, 0, true))));
  for (const sp of App.spaces) {
    const key = 'sec_' + sp, open = Pref.get(key, true), list = roots(sp, 'page').filter(p => !p.properties.trashed);
    const head = h('div', { class: 'sec-h' }, h('span', { class: 't', onclick: () => { Pref.set(key, !open); renderSidebar(); } }, sp === 'me' ? 'Личное' : 'Команда'),
      h('button', { class: 'ib', title: 'Новая страница', onclick: () => newPage(sp) }, ic('plus')));
    head.addEventListener('dragover', e => { if (TREE_DRAG) { e.preventDefault(); head.style.background = 'var(--accent-bg)'; } });
    head.addEventListener('dragleave', () => head.style.background = '');
    head.addEventListener('drop', e => { head.style.background = ''; if (!TREE_DRAG) return; e.preventDefault(); const p = TREE_DRAG; TREE_DRAG = null; if (p._s !== sp) moveToSpace(p, sp); else { p.parentId = null; p.position = list.length ? (list[list.length - 1].position ?? 0) + 1 : 0; batchUpdate(sp, [p]); renderSidebar(); } });
    const sec = h('div', { class: 'sec' }, head);
    if (open) { list.forEach(p => sec.append(...treeEl(p, 0))); if (!list.length) sec.append(h('div', { class: 'tree-empty', style: 'padding-left:.6rem' }, sp === 'team' ? 'Общих страниц пока нет' : 'Страниц пока нет')); }
    sc.append(sec);
  }
  s.append(sc, h('div', { class: 'side-foot' },
    nav('trash', 'Корзина', 'trash', trashN ? h('span', { class: 'kbd' }, trashN) : null),
    h('div', { class: 'si', onclick: () => openSettings() }, ic('settings'), h('span', { class: 't' }, 'Настройки')),
    h('button', { class: 'new-page', onclick: () => newPage('me') }, h('span', { class: 'plus' }, ic('plus')), 'Новая страница')));
  const rz = h('div', { class: 'resizer' });
  rz.addEventListener('mousedown', e => {
    e.preventDefault(); rz.classList.add('drag'); const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const mv = ev => { const rem = Math.max(14, Math.min(30, ev.clientX / fs)); document.documentElement.style.setProperty('--sw', rem + 'rem'); Pref.set('sw', rem); };
    const up = () => { rz.classList.remove('drag'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  s.append(rz);
  sc.scrollTop = st;
}
let TREE_DRAG = null;
function treeRow(p, depth, flat) {
  const ch = kids(p.id, 'page').filter(x => !x.properties.trashed), open = !flat && Expanded.has(p.id);
  const row = h('div', { class: 'ti' + (App.view.id === p.id ? ' on' : ''), style: `padding-left:${.25 + depth * .95}rem`, draggable: flat ? null : 'true', 'data-id': p.id, onclick: () => go(pageRoute(p)) },
    h('button', { class: 'tg' + (open ? ' open' : ''), style: flat ? 'visibility:hidden' : '', title: open ? 'Свернуть' : 'Развернуть', onclick: e => { e.stopPropagation(); open ? Expanded.delete(p.id) : Expanded.add(p.id); saveExp(); renderSidebar(); } }, ic('right')),
    h('span', { class: 'em' }, p.properties.icon || ic('page')), h('span', { class: 't' }, titleOf(p)),
    h('span', { class: 'acts' }, h('button', { class: 'ib', title: 'Действия', onclick: e => { e.stopPropagation(); row.classList.add('menu-open'); pageMenu(e.currentTarget, p, { onClose: () => row.classList.remove('menu-open') }); } }, ic('more')),
      flat ? null : h('button', { class: 'ib', title: 'Добавить подстраницу', onclick: e => { e.stopPropagation(); newPage(p._s, p.id); } }, ic('plus'))));
  if (!flat) {
    row.addEventListener('dragstart', e => { TREE_DRAG = p; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); });
    row.addEventListener('dragend', () => { TREE_DRAG = null; clearDrop(); });
    row.addEventListener('dragover', e => {
      if (!TREE_DRAG && !DRAG) return; if (TREE_DRAG === p) return;
      e.preventDefault(); clearDrop();
      const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
      row.dataset.zone = DRAG ? 'in' : y < .28 ? 'before' : y > .72 ? 'after' : 'in';
      row.classList.add('drop-' + row.dataset.zone);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-in'));
    row.addEventListener('drop', e => {
      e.preventDefault(); const zone = row.dataset.zone; clearDrop();
      if (DRAG) { const b = DRAG.b; dragEnd(); moveBlockToPage(b, p); return; }
      if (TREE_DRAG) { const x = TREE_DRAG; TREE_DRAG = null; movePage(x, p, zone); }
    });
  }
  return row;
}
function treeEl(p, depth) {
  const out = [treeRow(p, depth)];
  if (Expanded.has(p.id)) {
    const ch = kids(p.id, 'page').filter(x => !x.properties.trashed);
    if (ch.length) ch.forEach(c => out.push(...treeEl(c, depth + 1)));
    else out.push(h('div', { class: 'tree-empty', style: `padding-left:${2.15 + depth * .95}rem` }, 'Нет вложенных страниц'));
  }
  return out;
}
function movePage(p, target, zone) {
  if (p === target || ancestors(target).includes(p)) return toast('Нельзя вложить страницу саму в себя', 'err');
  if (p._s !== target._s) return moveToSpace(p, target._s);
  if (zone === 'in') { const l = visibleKids(target); p.parentId = target.id; p.position = l.length ? (l[l.length - 1].position ?? 0) + 1 : 0; Expanded.add(target.id); saveExp(); }
  else { const parent = B[target.parentId], sib = (parent ? visibleKids(parent) : roots(target._s, 'page')).filter(x => x !== p), i = sib.indexOf(target); p.parentId = target.parentId; p.position = positionAfter(sib, zone === 'after' ? target : sib[i - 1] || null); }
  batchUpdate(p._s, [p]); renderSidebar(); if (Ed.page && App.view.kind === 'page') renderBlocks(); renderTop();
}
async function moveToSpace(p, to) {
  if (!(await confirmBox(`Переместить «${titleOf(p)}» со всеми вложенными страницами в раздел «${SPACE_NAME[to]}»?` + (to === 'team' ? ' Её увидят все участники.' : ' Она станет видна только вам.'), { ok: 'Переместить', danger: false }))) return;
  flushAll(); await Promise.all(Object.values(Sync.q));
  try {
    const r = await api('POST', '/move', { from: p._s, to, id: p.id });
    await Promise.all([loadSpace(p._s), loadSpace(to)]);
    toast('Перемещено в «' + SPACE_NAME[to] + '»'); go(`#/p/${to}/${r.rootId}`);
  } catch (e) { toast(e.message, 'err'); }
}
function newPage(space, parentId = null, title = '') {
  const sib = parentId ? visibleKids(B[parentId]) : roots(space, 'page');
  const p = create(space, { parentId, type: 'page', content: { title }, properties: {}, position: sib.length ? (sib[sib.length - 1].position ?? 0) + 1 : 0 });
  create(space, { parentId: p.id, type: 'text', content: { text: '' }, position: 0 });
  if (parentId) { Expanded.add(parentId); saveExp(); }
  go(pageRoute(p), { focusTitle: true });
  return p;
}
const isFav = p => (App.favs || []).some(f => f.id === p.id);
function toggleFav(p) {
  App.favs = isFav(p) ? App.favs.filter(f => f.id !== p.id) : [...(App.favs || []), { s: p._s, id: p.id }];
  api('PUT', '/s/me/meta/favorites', App.favs).catch(e => toast(e.message, 'err'));
  renderSidebar(); renderTop();
}
function trashPage(p) {
  p.properties.trashed = true; p.properties.trashedAt = new Date().toISOString(); save(p, 0);
  const t = toast(h('span', { class: 'row' }, '«' + titleOf(p) + '» в корзине', h('button', { class: 'btn sm', style: 'color:#fff;border-color:rgba(255,255,255,.3)', onclick: () => { delete p.properties.trashed; save(p, 0); t.remove(); renderSidebar(); if (Ed.page) renderBlocks(); } }, 'Отменить')), 'ok', 6000);
  if (App.view.kind === 'page' && inTrash(B[App.view.id])) go('#/home'); else { renderSidebar(); if (Ed.page && App.view.kind === 'page') renderBlocks(); }
}
async function exportPage(p, fmt) {
  flushAll(); await Promise.all(Object.values(Sync.q));
  download(`/s/${p._s}/export/${p.id}?format=${fmt}`, titleOf(p).replace(/[\\/:*?"<>|]/g, '_') + '.' + fmt);
}
function pageMenu(anchor, p, o = {}) {
  menu(anchor, [
    { label: isFav(p) ? 'Убрать из избранного' : 'Добавить в избранное', icon: 'star', onClick: () => toggleFav(p) },
    { label: 'Переименовать', icon: 'edit', onClick: async () => { const v = await promptBox('Переименовать страницу', { value: p.content.title || '' }); if (v != null) { p.content.title = v; save(p, 0); onTitleChange(p); if (Ed.page === p) $('.page-title').textContent = v; } } },
    { label: 'Новая подстраница', icon: 'plus', onClick: () => newPage(p._s, p.id) },
    { label: 'Дублировать', icon: 'copy', onClick: () => duplicateBlock(p) },
    App.cfg.teamSpace ? { label: p._s === 'me' ? 'Переместить в «Команда»' : 'Переместить в «Личное»', icon: 'move', onClick: () => moveToSpace(p, p._s === 'me' ? 'team' : 'me') } : null,
    o.inTop ? { label: 'Во всю ширину', icon: 'expand', check: !!p.properties.full, onClick: () => { p.properties.full = !p.properties.full; save(p, 0); renderPage(p); } } : null,
    '-', { head: 'Выгрузить страницу' },
    { label: 'Markdown (.md)', icon: 'download', onClick: () => exportPage(p, 'md') },
    { label: 'HTML-файл', icon: 'download', onClick: () => exportPage(p, 'html') },
    { label: 'JSON (для переноса)', icon: 'download', onClick: () => exportPage(p, 'json') },
    { label: 'PDF / печать', icon: 'print', onClick: () => go(pageRoute(p), { print: true }) },
    { label: 'Отправить по почте', icon: 'mail', onClick: () => go('#/mail', { page: p }) },
    { label: 'Импорт Markdown в страницу…', icon: 'import', onClick: async () => { const fs = await pickFiles('.md,.markdown,.txt', true); for (const f of fs) await importMarkdown(p, await f.text()); } },
    '-', { label: 'В корзину', icon: 'trash', danger: true, onClick: () => trashPage(p) },
    h('div', { class: 'm-head', style: 'text-transform:none;font-weight:400;line-height:1.5' }, 'Изменено ' + fmtTime(p.updatedAt || p.createdAt) + (p.by ? ' · ' + p.by : ''), h('br'), SPACE_NAME[p._s])
  ], { align: o.inTop ? 'end' : 'start', onClose: o.onClose });
}
function wsMenu(anchor) {
  const theme = Pref.get('theme', 'dark');
  menu(anchor, [
    h('div', { class: 'row', style: 'padding:.5rem .6rem .6rem' }, avatar(App.me.login, App.me.name), h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, App.me.name || App.me.login), h('div', { class: 'mut small' }, App.me.email || App.me.login + (App.me.role === 'admin' ? ' · администратор' : '')))),
    '-',
    { label: 'Настройки', icon: 'settings', onClick: () => openSettings() },
    { label: theme === 'light' ? 'Тёмная тема' : 'Светлая тема', icon: theme === 'light' ? 'moon' : 'sun', onClick: () => { Pref.set('theme', theme === 'light' ? 'dark' : 'light'); applyTheme(); } },
    App.me.role === 'admin' ? { label: 'Пользователи', icon: 'users', onClick: () => openSettings('users') } : null,
    '-', { label: 'Выйти', icon: 'logout', onClick: logout }]);
}
const onTitleChange = debounce(p => {
  const row = $(`#side .ti[data-id="${p.id}"] .t`); if (row) $$(`#side .ti[data-id="${p.id}"] .t`).forEach(x => x.textContent = titleOf(p)); else renderSidebar();
  renderTop(); if (App.view.id === p.id) document.title = titleOf(p) + ' · ' + App.cfg.appName;
}, 250);

/* ================= верхняя панель ================= */
function renderTop() {
  const t = $('#top'); if (!t) return; t.innerHTML = '';
  t.append(h('button', { class: 'ib', id: 'burger', onclick: () => $('#app').classList.toggle('mobile-open') }, ic('menu')));
  if ($('#app').classList.contains('collapsed')) t.append(h('button', { class: 'ib', title: 'Показать панель (Ctrl+\\)', onclick: toggleSide }, ic('panel')));
  const cr = h('div', { class: 'crumbs' }), acts = h('div', { class: 'top-acts' });
  if (App.view.kind === 'page') {
    const p = B[App.view.id]; if (!p) return;
    [...ancestors(p), p].forEach((x, i) => { if (i) cr.append(h('span', { class: 'crumb-sep' }, '/')); cr.append(h('div', { class: 'crumb', onclick: () => go(pageRoute(x)) }, x.properties.icon ? h('span', {}, x.properties.icon) : null, h('span', {}, titleOf(x)))); });
    cr.append(h('span', { class: 'space-tag' }, p._s === 'team' ? 'Команда' : 'Личное'));
    acts.append(h('button', { class: 'ib' + (isFav(p) ? ' on' : ''), title: isFav(p) ? 'Убрать из избранного' : 'В избранное', onclick: () => toggleFav(p) }, ic('star')),
      h('button', { class: 'btn sm ghost', onclick: e => menu(e.currentTarget, [{ label: 'Markdown (.md)', icon: 'download', onClick: () => exportPage(p, 'md') }, { label: 'HTML-файл', icon: 'download', onClick: () => exportPage(p, 'html') }, { label: 'JSON', icon: 'download', onClick: () => exportPage(p, 'json') }, { label: 'PDF / печать', icon: 'print', onClick: () => print() }, '-', { label: 'Отправить по почте', icon: 'mail', onClick: () => go('#/mail', { page: p }) }], { align: 'end' }) }, ic('download'), h('span', {}, 'Выгрузить')),
      h('button', { class: 'ib', title: 'Ещё', onclick: e => pageMenu(e.currentTarget, p, { inTop: true }) }, ic('more')));
  } else cr.append(h('div', { class: 'crumb' }, ic(VIEW_ICONS[App.view.kind] || 'home'), h('span', {}, VIEW_NAMES[App.view.kind] || '')));
  t.append(cr, h('div', { class: 'saving', id: 'saving' }), acts);
  setSaving();
}

/* ================= главная ================= */
function greet() { const hr = new Date().getHours(); return hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер'; }
function upcoming(days = 14) {
  const out = [];
  for (const b of Object.values(B)) {
    if (b.type === 'event' && b.properties.date && B[b.parentId] && !inTrash(B[b.parentId])) { const d = dayDiff(b.properties.date), e = b.properties.end ? dayDiff(b.properties.end) : d; if (e >= 0 && d <= days) out.push({ date: d < 0 ? todayStr() : b.properties.date, d, text: b.content.text, time: b.properties.time, page: pageOf(b), color: b.properties.color, b, kind: 'event' }); }
    if (b.type === 'kanban_card' && b.properties.due && B[b.parentId] && !inTrash(B[b.parentId]) && !isCardDone(b)) { const d = dayDiff(b.properties.due); if (d <= days) out.push({ date: b.properties.due, d, text: b.content.text || 'Без названия', page: pageOf(b), b, kind: 'task', late: d < 0 }); }
  }
  return out.sort((a, z) => a.date.localeCompare(z.date) || String(a.time || '').localeCompare(String(z.time || '')));
}
function upItem(u) {
  const dt = parseYmd(u.date);
  return h('div', { class: 'up-item', onclick: () => u.kind === 'task' ? openCard(u.b, B[u.b.parentId], () => App.view.kind === 'home' && route()) : openEvent(u.b, () => App.view.kind === 'home' && route()) },
    h('div', { class: 'up-date' }, h('b', { style: u.late ? 'color:var(--danger)' : '' }, dt.getDate()), h('span', {}, MONTHS_G[dt.getMonth()].slice(0, 3))),
    h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'lt', style: 'font-weight:500' }, u.text || 'Без названия'),
      h('div', { class: 'ls mut small' }, (u.kind === 'task' ? (u.late ? 'Просрочено · ' : 'Задача · ') : 'Событие · ') + (u.time ? u.time + ' · ' : '') + (u.page ? titleOf(u.page) : ''))),
    u.kind === 'task' ? ic('kanban', 'mut') : h('span', { class: 'dot c-' + (u.color || 'blue') }));
}
function pageTile(p) {
  const c = p.properties.cover;
  return h('div', { class: 'tile cover-tile', onclick: () => go(pageRoute(p)) }, h('div', { class: 'tc ' + (c && !c.startsWith('/files/') ? c : 'g7'), style: coverStyle(c) + ';background-size:cover' }),
    h('div', { class: 'tb' }, h('div', { class: 'te' }, p.properties.icon || '📄'), h('div', { class: 'tt' }, titleOf(p)), h('div', { class: 'ts' }, SPACE_NAME[p._s] + ' · ' + fmtTime(p.updatedAt || p.createdAt))));
}
function renderHome() {
  const v = h('div', { class: 'view' }), now = new Date();
  const recent = Pref.get('recent', []).map(r => B[r.id]).filter(p => p && p.type === 'page' && !inTrash(p)).slice(0, 8);
  const all = pages();
  const latest = recent.length ? recent : [...all].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 8);
  const up = upcoming(14);
  v.append(h('div', { class: 'mut' }, 'Сегодня ' + now.getDate() + ' ' + MONTHS_G[now.getMonth()] + ', ' + now.toLocaleDateString('ru-RU', { weekday: 'long' })),
    h('div', { class: 'hello' }, greet() + (App.me.name ? ', ' + App.me.name.split(' ')[0] : '') + '!'),
    h('div', { class: 'quick' },
      h('button', { class: 'btn primary', onclick: () => newPage('me') }, ic('plus'), 'Новая страница'),
      App.cfg.teamSpace ? h('button', { class: 'btn', onclick: () => newPage('team') }, ic('users'), 'Страница для команды') : null,
      h('button', { class: 'btn', onclick: () => go('#/sheets', { add: true }) }, ic('sheet'), 'Добавить Google Таблицу'),
      h('button', { class: 'btn', onclick: () => go('#/mail') }, ic('mail'), 'Новая рассылка'),
      h('button', { class: 'btn', onclick: openSearch }, ic('search'), 'Поиск')));
  if (latest.length) v.append(h('h2', {}, ic('clock', 'mut'), recent.length ? 'Недавно открытые' : 'Последние изменения'), h('div', { class: 'grid' }, latest.map(pageTile)));
  v.append(h('h2', {}, ic('calendar', 'mut'), 'Ближайшие события и сроки'),
    up.length ? h('div', { class: 'list' }, up.slice(0, 12).map(upItem)) : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'На ближайшие две недели ничего не запланировано. Добавьте календарь или канбан на страницу командой «/».')));
  if (App.cfg.teamSpace) {
    const team = pages('team').filter(p => p.by && p.by !== App.me.login).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6);
    if (team.length) v.append(h('h2', {}, ic('users', 'mut'), 'Изменения в команде'), h('div', { class: 'list' }, team.map(p => h('div', { class: 'li click', onclick: () => go(pageRoute(p)) }, h('span', { style: 'font-size:1.3rem' }, p.properties.icon || '📄'), h('div', { class: 'grow' }, h('div', { class: 'lt' }, titleOf(p)), h('div', { class: 'ls' }, (p.by || '') + ' · ' + fmtTime(p.updatedAt)))))));
  }
  $('#scroll').append(v);
}

/* ================= общий календарь ================= */
function renderGlobalCalendar() {
  const v = h('div', { class: 'view', style: 'max-width:78rem' });
  const st = Pref.get('gcal', {}); if (st.calMonth == null) { const n = new Date(); st.calMonth = n.getMonth(); st.calYear = n.getFullYear(); }
  const cals = () => Object.values(B).filter(b => b.type === 'calendar_view' && B[b.parentId] && !inTrash(B[b.parentId]));
  const items = () => [
    ...Object.values(B).filter(e => e.type === 'event' && B[e.properties.calendarId] && !inTrash(B[e.parentId])).map(e => ({ id: e.id, date: e.properties.date, end: e.properties.end, time: e.properties.time, text: e.content.text, color: e.properties.color || 'blue', where: titleOf(pageOf(e)), block: e, open: () => openEvent(e, draw) })),
    ...datedCards().map(c => ({ id: c.id, date: c.properties.due, text: c.content.text || 'Без названия', task: true, done: isCardDone(c), where: titleOf(pageOf(c)), open: () => openCard(c, B[c.parentId], draw) }))];
  const holder = h('div');
  const draw = () => {
    holder.innerHTML = '';
    holder.append(monthGrid({ state: st, onNav: () => Pref.set('gcal', st), items, redraw: draw,
      onAdd: async date => {
        const list = cals();
        if (!list.length) return toast('Сначала добавьте календарь на любую страницу: напишите «/календарь»', 'err', 5000);
        const name = h('input', { class: 'inp', placeholder: 'Название события' }), sel = h('select', { class: 'inp' }, list.map(c => h('option', { value: c.id }, (c.content.title || 'Календарь') + ' — ' + titleOf(pageOf(c)) + ' (' + SPACE_NAME[c._s] + ')')));
        const ok = () => { if (!name.value.trim()) return; const c = B[sel.value]; create(c._s, { parentId: c.parentId, type: 'event', content: { text: name.value.trim() }, properties: { date, calendarId: c.id, color: 'blue' }, position: 0 }); m.close(); draw(); };
        name.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
        const m = modal({ title: 'Новое событие · ' + fmtDate(date, false), body: [name, h('label', { class: 'lbl' }, 'Календарь'), sel], foot: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Отмена'), h('button', { class: 'btn primary', onclick: ok }, 'Добавить')] });
        setTimeout(() => name.focus());
      },
      onMove: (it, date) => { if (it.block) { it.block.properties.date = date; save(it.block, 0); } else { B[it.id].properties.due = date; save(B[it.id], 0); } draw(); } }));
  };
  v.append(h('div', { class: 'view-h' }, h('h1', {}, h('span', { class: 'vic', style: 'background:#e5534b' }, ic('calendar')), 'Календарь')),
    h('p', { class: 'mut', style: 'margin:-.8rem 0 1.4rem' }, 'Все события из календарей на ваших страницах и сроки задач с канбан-досок. Перетаскивайте события между днями.'), holder);
  draw(); $('#scroll').append(v);
}

/* ================= Google Таблицы ================= */
function renderSheets(opts = {}) {
  const v = h('div', { class: 'view' }), st = { q: '', folder: null, space: 'all' };
  const all = () => Object.values(B).filter(b => b.type === 'gsheet' && b.content.url && (!b.parentId || (B[b.parentId] && !inTrash(B[b.parentId]))));
  const grid = h('div'), filters = h('div', { class: 'filters' });
  const draw = () => {
    const list = all().filter(b => (st.space === 'all' || b._s === st.space) && (!st.folder || (b.properties.folder || '') === st.folder) &&
      (!st.q || [b.content.title, b.content.note, b.properties.folder, b.content.url].join(' ').toLowerCase().includes(st.q.toLowerCase())))
      .sort((a, z) => (a.properties.folder || '').localeCompare(z.properties.folder || '') || (a.content.title || '').localeCompare(z.content.title || ''));
    const folders = [...new Set(all().map(b => b.properties.folder).filter(Boolean))].sort();
    filters.innerHTML = '';
    filters.append(App.cfg.teamSpace ? seg([['all', 'Все'], ['me', 'Личные'], ['team', 'Командные']], st.space, x => { st.space = x; draw(); }) : null,
      h('span', { style: 'width:.6rem' }), h('span', { class: 'chip' + (!st.folder ? ' on' : ''), onclick: () => { st.folder = null; draw(); } }, 'Все папки'),
      ...folders.map(f => h('span', { class: 'chip' + (st.folder === f ? ' on' : ''), onclick: () => { st.folder = st.folder === f ? null : f; draw(); } }, ic('folder'), f)));
    grid.innerHTML = '';
    if (!list.length) { grid.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, '📊'), all().length ? 'Ничего не найдено' : 'Здесь будут все ваши Google Таблицы, Документы и Презентации — в одном месте, с папками и поиском.', h('div', { style: 'margin-top:1rem' }, h('button', { class: 'btn primary', onclick: () => sheetModal() }, ic('plus'), 'Добавить первую')))); return; }
    grid.append(h('div', { class: 'grid' }, list.map(b => {
      const info = gInfo(b.content.url) || { kind: 'sheet' }, [kn, ki, kc] = G_KIND[info.kind], where = b.parentId ? pageOf(b) : null;
      return h('div', { class: 'tile sheet-tile', onclick: () => gFullscreen(b, info) },
        h('div', { class: 'gs-ic', style: `background:${kc}` }, ic(ki)),
        h('div', { class: 'tt' }, b.content.title || kn), h('div', { class: 'ts' }, b.content.note || kn),
        h('div', { class: 'tags' }, b.properties.folder ? chip(b.properties.folder, hashColor(b.properties.folder)) : null, App.cfg.teamSpace ? chip(SPACE_NAME[b._s]) : null, where ? chip('📄 ' + titleOf(where)) : null),
        h('button', { class: 'ib tmenu', onclick: e => { e.stopPropagation(); menu(e.currentTarget, [
          { label: 'Открыть в Google', icon: 'ext', onClick: () => open(info.open, '_blank', 'noopener') },
          { label: 'Просмотр здесь', icon: 'eye', onClick: () => gFullscreen(b, info) },
          { label: 'Изменить', icon: 'edit', onClick: () => sheetModal(b) },
          { label: 'Встроить на страницу…', icon: 'page', onClick: () => embedSheetOnPage(b) },
          where ? { label: 'Перейти на страницу', icon: 'right', onClick: () => go(pageRoute(where)) } : null,
          { label: 'Скопировать ссылку', icon: 'copy', onClick: () => { copyText(info.open); toast('Ссылка скопирована'); } },
          '-', { label: where ? 'Удалить со страницы' : 'Удалить', icon: 'trash', danger: true, onClick: async () => { if (await confirmBox(`Удалить «${b.content.title || kn}» из списка? Сам файл в Google не удаляется.`)) { removeBlock(b); draw(); } } }], { align: 'end' }); } }, ic('more')));
    })));
  };
  function sheetModal(b) {
    const url = h('input', { class: 'inp', placeholder: 'https://docs.google.com/spreadsheets/d/…', value: b?.content.url || '' });
    const title = h('input', { class: 'inp', placeholder: 'Например: Бюджет 2026', value: b?.content.title || '' });
    const folders = [...new Set(all().map(x => x.properties.folder).filter(Boolean))];
    const folder = h('input', { class: 'inp', placeholder: 'Например: Финансы', value: b?.properties.folder || '', list: 'ph-folders' });
    const note = h('textarea', { class: 'inp', rows: 3, placeholder: 'Что в этой таблице, кто ведёт…', value: b?.content.note || '' });
    let space = b?._s || (App.cfg.teamSpace && st.space === 'team' ? 'team' : 'me');
    const err = h('div', { class: 'err' });
    const ok = () => {
      const info = gInfo(url.value); if (!info) { err.textContent = 'Нужна ссылка на файл Google: docs.google.com/spreadsheets/…, /document/…, /presentation/… или /forms/…'; return; }
      const content = { url: url.value.trim(), title: title.value.trim() || G_KIND[info.kind][0], note: note.value.trim() };
      if (b) { Object.assign(b.content, content); b.properties.folder = folder.value.trim() || undefined; save(b, 0); }
      else create(space, { parentId: null, type: 'gsheet', content, properties: { folder: folder.value.trim() || undefined, mode: 'view', height: 560 }, position: Date.now() });
      m.close(); draw(); toast(b ? 'Сохранено' : 'Добавлено');
    };
    const m = modal({ title: b ? 'Изменить' : 'Добавить Google Таблицу', body: [
      h('label', { class: 'lbl' }, 'Ссылка'), url, h('label', { class: 'lbl' }, 'Название'), title,
      h('label', { class: 'lbl' }, 'Папка'), folder, h('datalist', { id: 'ph-folders' }, folders.map(f => h('option', { value: f }))),
      h('label', { class: 'lbl' }, 'Описание'), note,
      !b && App.cfg.teamSpace ? [h('label', { class: 'lbl' }, 'Кому видно'), seg([['me', 'Только мне'], ['team', 'Всей команде']], space, x => space = x)] : null,
      h('p', { class: 'hint' }, 'Чтобы таблица открывалась у всех, в Google нажмите «Настройки доступа» → «Все, у кого есть ссылка». Работают таблицы, документы, презентации и формы.'), err],
      foot: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Отмена'), h('button', { class: 'btn primary', onclick: ok }, b ? 'Сохранить' : 'Добавить')] });
    setTimeout(() => url.focus());
  }
  function embedSheetOnPage(b) {
    const list = pages();
    const inp = h('input', { class: 'inp', placeholder: 'Найти страницу…', oninput: () => drawL() }), res = h('div', { class: 'sres' });
    const drawL = () => { res.innerHTML = ''; list.filter(p => titleOf(p).toLowerCase().includes(inp.value.toLowerCase())).slice(0, 40).forEach(p => res.append(h('div', { class: 'sr', onclick: () => {
      const l = visibleKids(p); create(p._s, { parentId: p.id, type: 'gsheet', content: { ...b.content }, properties: { ...b.properties }, position: l.length ? (l[l.length - 1].position ?? 0) + 1 : 0 });
      m.close(); go(pageRoute(p)); toast('Таблица добавлена на страницу');
    } }, h('span', { class: 'em' }, p.properties.icon || '📄'), h('div', {}, h('div', { class: 'st' }, titleOf(p)), h('div', { class: 'ss' }, SPACE_NAME[p._s]))))); };
    const m = modal({ title: 'Встроить на страницу', body: [inp, res] }); drawL(); setTimeout(() => inp.focus());
  }
  v.append(h('div', { class: 'view-h' }, h('h1', {}, h('span', { class: 'vic', style: 'background:#0f9d58' }, ic('sheet')), 'Google Таблицы'), h('span', { class: 'sp' }),
    h('input', { class: 'inp', style: 'width:15rem', placeholder: 'Поиск…', oninput: e => { st.q = e.target.value; draw(); } }),
    h('button', { class: 'btn primary', onclick: () => sheetModal() }, ic('plus'), 'Добавить')),
    h('p', { class: 'mut', style: 'margin:-.8rem 0 1.2rem' }, 'Храните ссылки на таблицы, документы и презентации Google по папкам, открывайте их прямо здесь и встраивайте в страницы. Таблицы, встроенные на страницы, тоже видны в этом списке.'),
    filters, grid);
  $('#scroll').append(v); draw();
  if (opts.add) sheetModal();
}

/* ================= рассылки ================= */
const Draft = Pref.get('maildraft', { to: '', subject: '', html: '', lists: [] });
const saveDraft = debounce(() => Pref.set('maildraft', Draft), 400);
async function renderMail(opts = {}) {
  const v = h('div', { class: 'view', style: 'max-width:76rem' });
  $('#scroll').append(v);
  v.append(h('div', { class: 'view-h' }, h('h1', {}, h('span', { class: 'vic', style: 'background:#2383e2' }, ic('mail')), 'Рассылки')));
  if (!App.me.myMail) v.append(h('div', { class: 'banner' }, ic('info'), h('div', { class: 'grow' }, h('b', {}, 'Подключите свою почту. '), 'Рассылки уходят с вашего ящика (Mail.ru, Яндекс, Gmail или свой) — получатели увидят ваш адрес. Это займёт пару минут.'),
    h('button', { class: 'btn', onclick: () => openSettings('mymail') }, ic('settings'), 'Подключить почту')));
  const lists = { me: await api('GET', '/s/me/meta/lists').catch(() => []), team: App.cfg.teamSpace ? await api('GET', '/s/team/meta/lists').catch(() => []) : [] };
  if (opts.page) Draft.page = { space: opts.page._s, id: opts.page.id };
  if (opts.page && !Draft.subject) Draft.subject = titleOf(opts.page);
  // --- форма письма
  const to = h('textarea', { class: 'inp', rows: 2, placeholder: 'ivan@mail.ru, olga@yandex.ru — через запятую, пробел или с новой строки', value: Draft.to, oninput: e => { Draft.to = e.target.value; saveDraft(); count(); } });
  const listChips = h('div', { class: 'rcpt' });
  const cnt = h('span', { class: 'mut small' });
  const parseEmails = s => [...new Set(String(s).split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x)))];
  const allLists = () => [...lists.me.map(l => ({ ...l, space: 'me' })), ...lists.team.map(l => ({ ...l, space: 'team' }))];
  const count = () => { const set = new Set(parseEmails(Draft.to)); allLists().filter(l => Draft.lists.some(x => x.id === l.id)).forEach(l => parseEmails((l.emails || []).join(' ')).forEach(e => set.add(e))); cnt.textContent = set.size ? 'Получателей: ' + set.size : ''; return set.size; };
  const drawChips = () => {
    listChips.innerHTML = '';
    if (!allLists().length) listChips.append(h('span', { class: 'hint' }, 'Создайте список рассылки справа, чтобы выбирать получателей одним кликом.'));
    allLists().forEach(l => { const on = Draft.lists.some(x => x.id === l.id); listChips.append(h('span', { class: 'chip' + (on ? ' on' : ''), onclick: () => { Draft.lists = on ? Draft.lists.filter(x => x.id !== l.id) : [...Draft.lists, { id: l.id, space: l.space }]; saveDraft(); drawChips(); count(); } }, on ? ic('check') : ic('users'), l.name + ' · ' + (l.emails || []).length)); });
  };
  const subj = h('input', { class: 'inp', placeholder: 'Тема письма', value: Draft.subject, oninput: e => { Draft.subject = e.target.value; saveDraft(); } });
  const rte = h('div', { class: 'rte', contenteditable: 'true', 'data-ph': 'Текст письма. Можно выделять жирным, курсивом, добавлять ссылки.' });
  rte.innerHTML = safeHtml(Draft.html || '');
  rte.addEventListener('input', () => { Draft.html = canon(rte).replace(/(<br>)+$/, ''); saveDraft(); });
  const cmd = (c, a) => () => { rte.focus(); document.execCommand(c, false, a); };
  const bar = h('div', { class: 'rte-bar' }, h('button', { onmousedown: e => e.preventDefault(), onclick: cmd('bold'), title: 'Жирный' }, 'B'), h('button', { onmousedown: e => e.preventDefault(), onclick: cmd('italic'), style: 'font-style:italic', title: 'Курсив' }, 'I'),
    h('button', { onmousedown: e => e.preventDefault(), onclick: cmd('underline'), style: 'text-decoration:underline', title: 'Подчёркнутый' }, 'U'), h('button', { onmousedown: e => e.preventDefault(), onclick: cmd('insertUnorderedList'), title: 'Список' }, ic('list')),
    h('button', { onmousedown: e => e.preventDefault(), onclick: () => { rte.focus(); if (!sel().isCollapsed) addLink(); else toast('Сначала выделите текст для ссылки', 'info'); }, title: 'Ссылка' }, ic('link')));
  const pageSel = h('select', { class: 'inp', onchange: e => { Draft.page = e.target.value ? { space: e.target.value.split(':')[0], id: e.target.value.split(':')[1] } : null; saveDraft(); } }, h('option', { value: '' }, '— не прикреплять —'),
    pages().sort((a, b) => titleOf(a).localeCompare(titleOf(b))).map(p => h('option', { value: p._s + ':' + p.id, selected: Draft.page?.id === p.id }, (p.properties.icon || '📄') + ' ' + titleOf(p) + (App.cfg.teamSpace ? ' · ' + SPACE_NAME[p._s] : ''))));
  let asFile = !!Draft.asFile;
  const files = Draft.files || (Draft.files = []);
  const fileBox = h('div', { class: 'rcpt' });
  const drawFiles = () => { fileBox.innerHTML = ''; files.forEach((f, i) => fileBox.append(chip('📎 ' + f.name, null, h('span', { class: 'x', onclick: () => { files.splice(i, 1); saveDraft(); drawFiles(); } }, '×')))); fileBox.append(h('button', { class: 'btn sm', onclick: async () => { for (const f of await pickFiles('', true)) { try { const r = await uploadFile(f); files.push({ id: r.id, name: r.name }); } catch (e) { toast(e.message, 'err'); } } saveDraft(); drawFiles(); } }, ic('clip'), 'Прикрепить файл')); };
  const sendBtn = h('button', { class: 'btn primary lg', onclick: () => send(false) }, ic('send'), 'Отправить');
  async function send(test) {
    flushAll(); await Promise.all(Object.values(Sync.q));
    const body = { to: test ? App.me.email : Draft.to, lists: test ? [] : Draft.lists, subject: Draft.subject, html: Draft.html, page: Draft.page, attachPage: asFile, files: files.map(f => f.id) };
    if (test && !App.me.email) return toast('Укажите свой e-mail в Настройках → Аккаунт', 'err');
    const n = test ? 1 : count();
    if (!n) return toast('Добавьте получателей', 'err');
    if (!Draft.subject.trim()) return toast('Укажите тему письма', 'err');
    if (!test && !(await confirmBox(`Отправить письмо «${Draft.subject}» получателям: ${n}? Каждый получит отдельное письмо и не увидит других адресатов.`, { ok: 'Отправить', danger: false, title: 'Отправка рассылки' }))) return;
    sendBtn.disabled = true;
    try { await api('POST', '/mail/send', body); toast(test ? 'Тестовое письмо отправлено на ' + App.me.email : 'Рассылка запущена'); drawLog(); } catch (e) { toast(e.message, 'err', 6000); } finally { sendBtn.disabled = false; }
  }
  const composer = h('div', { class: 'composer' },
    h('label', { class: 'lbl' }, 'Кому'), to, h('div', { style: 'margin:.5rem 0 0' }, listChips), h('div', { style: 'margin-top:.3rem' }, cnt),
    h('label', { class: 'lbl' }, 'Тема'), subj, h('label', { class: 'lbl' }, 'Сообщение'), bar, rte,
    h('label', { class: 'lbl' }, 'Страница из ProjectHub'), pageSel,
    h('label', { class: 'row small', style: 'margin-top:.5rem;cursor:pointer' }, switchEl(asFile, x => { asFile = Draft.asFile = x; saveDraft(); }), 'Прикрепить страницу HTML-файлом (иначе — вставить в текст письма)'),
    h('label', { class: 'lbl' }, 'Вложения'), fileBox,
    h('div', { class: 'row', style: 'margin-top:1.4rem' }, sendBtn, h('button', { class: 'btn', onclick: () => send(true) }, 'Тест себе'), h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost', onclick: async () => { if (await confirmBox('Очистить черновик?', { ok: 'Очистить' })) { Object.assign(Draft, { to: '', subject: '', html: '', lists: [], page: null, files: [] }); Pref.set('maildraft', Draft); route(); } } }, 'Очистить')));
  // --- списки и история
  const side = h('div', { class: 'col-gap' });
  const listsBox = h('div'), logBox = h('div');
  const drawLists = () => {
    listsBox.innerHTML = '';
    listsBox.append(h('div', { class: 'row', style: 'margin-bottom:.6rem' }, h('h3', { style: 'margin:0;font-size:1.05rem', class: 'grow' }, 'Списки рассылки'), h('button', { class: 'btn sm', onclick: () => listModal() }, ic('plus'), 'Список')));
    const l = allLists();
    listsBox.append(h('div', { class: 'list' }, l.length ? l.map(x => h('div', { class: 'li click', onclick: () => listModal(x) }, ic('users', 'mut'), h('div', { class: 'grow' }, h('div', { class: 'lt' }, x.name), h('div', { class: 'ls' }, (x.emails || []).length + ' адресов' + (App.cfg.teamSpace ? ' · ' + SPACE_NAME[x.space] : ''))), ic('right', 'mut')))
      : h('div', { class: 'empty', style: 'padding:1.4rem' }, 'Списков пока нет')));
  };
  function listModal(l) {
    const name = h('input', { class: 'inp', value: l?.name || '', placeholder: 'Например: Родители 10 класса' });
    const emails = h('textarea', { class: 'inp', rows: 8, value: (l?.emails || []).join('\n'), placeholder: 'По одному адресу в строке или через запятую' });
    let space = l?.space || 'me';
    const info = h('div', { class: 'hint' });
    const upd = () => info.textContent = 'Корректных адресов: ' + parseEmails(emails.value).length; emails.addEventListener('input', upd); upd();
    const saveL = async () => {
      if (!name.value.trim()) return toast('Введите название списка', 'err');
      const item = { id: l?.id || uid(), name: name.value.trim(), emails: parseEmails(emails.value) };
      if (l && l.space !== space) lists[l.space] = lists[l.space].filter(x => x.id !== l.id);
      const arr = lists[space], i = arr.findIndex(x => x.id === item.id); i >= 0 ? arr[i] = item : arr.push(item);
      try { await api('PUT', `/s/${space}/meta/lists`, arr); if (l && l.space !== space) await api('PUT', `/s/${l.space}/meta/lists`, lists[l.space]); m.close(); drawLists(); drawChips(); count(); toast('Список сохранён'); } catch (e) { toast(e.message, 'err'); }
    };
    const m = modal({ title: l ? 'Список рассылки' : 'Новый список', body: [h('label', { class: 'lbl' }, 'Название'), name, h('label', { class: 'lbl' }, 'Адреса'), emails, info,
      h('div', { class: 'row wrap', style: 'margin-top:.6rem' }, h('button', { class: 'btn sm', onclick: async () => { const [f] = await pickFiles('.csv,.txt,text/csv,text/plain'); if (!f) return; const found = parseEmails((await f.text()).replace(/[",;<>]/g, ' ')); emails.value = [...new Set([...parseEmails(emails.value), ...found])].join('\n'); upd(); toast('Найдено адресов в файле: ' + found.length); } }, ic('import'), 'Из файла CSV/TXT'),
        h('button', { class: 'btn sm', onclick: () => { const found = parseEmails(Object.values(B).filter(b => b.type === 'table_row').flatMap(r => r.content.cells || []).join(' ')); if (!found.length) return toast('В таблицах не найдено адресов', 'err'); emails.value = [...new Set([...parseEmails(emails.value), ...found])].join('\n'); upd(); toast('Добавлено из таблиц: ' + found.length); } }, ic('database'), 'Собрать из таблиц')),
      App.cfg.teamSpace ? [h('label', { class: 'lbl' }, 'Доступ'), seg([['me', 'Только мне'], ['team', 'Всей команде']], space, x => space = x)] : null],
      foot: [l ? h('button', { class: 'btn danger', onclick: async () => { if (!(await confirmBox(`Удалить список «${l.name}»?`))) return; lists[l.space] = lists[l.space].filter(x => x.id !== l.id); await api('PUT', `/s/${l.space}/meta/lists`, lists[l.space]); Draft.lists = Draft.lists.filter(x => x.id !== l.id); m.close(); drawLists(); drawChips(); count(); } }, 'Удалить') : null, h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Отмена'), h('button', { class: 'btn primary', onclick: saveL }, 'Сохранить')] });
    setTimeout(() => name.focus());
  }
  let logTimer;
  async function drawLog() {
    clearTimeout(logTimer);
    const log = await api('GET', '/mail/log').catch(() => []);
    if (!logBox.isConnected && logBox.dataset.drawn) return;
    logBox.dataset.drawn = 1; logBox.innerHTML = '';
    const ST = { done: 'Отправлено', sending: 'Отправляется…', failed: 'Ошибка', partial: 'Частично' };
    logBox.append(h('h3', { style: 'margin:.8rem 0 .6rem;font-size:1.05rem' }, 'История'), h('div', { class: 'list' }, log.length ? log.slice(0, 30).map(j => h('div', { class: 'li job', style: 'flex-wrap:wrap' },
      h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'lt' }, j.subject), h('div', { class: 'ls' }, fmtTime(j.createdAt) + ' · ' + j.sent + ' из ' + j.total + (j.page ? ' · 📄 ' + j.page : '') + (App.me.role === 'admin' && j.from !== App.me.login ? ' · ' + j.from : ''))),
      h('span', { class: 'st ' + j.status }, ST[j.status] || j.status),
      j.failed?.length ? h('details', { style: 'width:100%;font-size:.83rem;color:var(--muted)' }, h('summary', { style: 'cursor:pointer' }, 'Не доставлено: ' + j.failed.length), j.failed.slice(0, 50).map(f => h('div', {}, f.email + ' — ' + f.error))) : null))
      : h('div', { class: 'empty', style: 'padding:1.4rem' }, 'Писем ещё не было')));
    if (log.some(j => j.status === 'sending')) logTimer = setTimeout(drawLog, 2500);
  }
  side.append(listsBox, logBox);
  v.append(h('div', { class: 'mail-grid' }, composer, side));
  drawChips(); drawFiles(); count(); drawLists(); drawLog();
}

/* ================= файлы ================= */
async function renderFiles() {
  const v = h('div', { class: 'view' }); $('#scroll').append(v);
  let all = false;
  const box = h('div');
  const up = async list => { for (const f of list) { try { await uploadFile(f); } catch (e) { toast(e.message, 'err'); } } draw(); };
  const dz = h('div', { class: 'dropzone', onclick: async () => up(await pickFiles('', true)) }, ic('upload'), ' Перетащите файлы сюда или нажмите, чтобы выбрать');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('ov'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('ov'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('ov'); up([...e.dataTransfer.files]); });
  async function draw() {
    const list = await api('GET', '/files' + (all ? '?all=1' : '')).catch(e => { toast(e.message, 'err'); return []; });
    box.innerHTML = '';
    if (!list.length) return box.append(h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Файлов пока нет. Файлы, загруженные на страницы, тоже появятся здесь.')));
    const total = list.reduce((s, f) => s + f.size, 0);
    box.append(h('div', { class: 'mut small', style: 'margin-bottom:.6rem' }, 'Файлов: ' + list.length + ' · ' + fmtSize(total)),
      h('div', { class: 'list' }, list.map(f => h('div', { class: 'li' },
        /^image\/(png|jpe?g|gif|webp)/.test(f.mime) ? h('img', { class: 'thumb', src: f.url, loading: 'lazy', alt: '' }) : h('span', { class: 'ftype' }, (f.name.split('.').pop() || '?').slice(0, 4)),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'lt' }, f.name), h('div', { class: 'ls' }, fmtSize(f.size) + ' · ' + fmtTime(f.createdAt) + (all ? ' · ' + f.owner : ''))),
        h('div', { class: 'acts' },
          h('a', { class: 'ib', href: f.url, target: '_blank', rel: 'noopener', title: 'Открыть' }, ic('eye')),
          h('a', { class: 'ib', href: f.url + '?dl=1', title: 'Скачать' }, ic('download')),
          h('button', { class: 'ib', title: 'Скопировать ссылку', onclick: () => { copyText(location.origin + f.url); toast('Ссылка скопирована'); } }, ic('link')),
          h('button', { class: 'ib', title: 'Удалить', onclick: async () => { if (await confirmBox(`Удалить файл «${f.name}»? Если он вставлен на страницы, там он перестанет открываться.`)) { await api('DELETE', '/files/' + f.id).catch(e => toast(e.message, 'err')); draw(); } } }, ic('trash')))))));
  }
  v.append(h('div', { class: 'view-h' }, h('h1', {}, h('span', { class: 'vic', style: 'background:#9065b0' }, ic('folder')), 'Файлы'), h('span', { class: 'sp' }),
    App.me.role === 'admin' ? h('label', { class: 'row small' }, switchEl(false, x => { all = x; draw(); }), 'Файлы всех пользователей') : null),
    h('p', { class: 'mut', style: 'margin:-.8rem 0 1.2rem' }, 'Все загруженные вами файлы и изображения. Ссылка на файл работает без входа — делитесь ей, как ссылкой «для всех, у кого есть ссылка».'), dz, box);
  draw();
}

/* ================= корзина ================= */
function renderTrash() {
  const v = h('div', { class: 'view' }); $('#scroll').append(v);
  const draw = () => {
    v.innerHTML = '';
    const list = Object.values(B).filter(b => b.type === 'page' && b.properties.trashed).sort((a, b) => String(b.properties.trashedAt).localeCompare(String(a.properties.trashedAt)));
    v.append(h('div', { class: 'view-h' }, h('h1', {}, h('span', { class: 'vic', style: 'background:#787774' }, ic('trash')), 'Корзина'), h('span', { class: 'sp' }),
      list.length ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(`Удалить навсегда все страницы из корзины (${list.length})? Это нельзя отменить.`, { ok: 'Удалить навсегда' })) { list.forEach(removeBlock); draw(); renderSidebar(); } } }, 'Очистить корзину') : null),
      h('div', { class: 'list' }, list.length ? list.map(p => h('div', { class: 'li' }, h('span', { style: 'font-size:1.3rem' }, p.properties.icon || '📄'),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'lt' }, titleOf(p)), h('div', { class: 'ls' }, SPACE_NAME[p._s] + ' · удалено ' + fmtTime(p.properties.trashedAt) + (ancestors(p).length ? ' · из «' + titleOf(ancestors(p).pop()) + '»' : ''))),
        h('div', { class: 'acts' }, h('button', { class: 'btn sm', onclick: () => { delete p.properties.trashed; delete p.properties.trashedAt; if (B[p.parentId] && inTrash(B[p.parentId])) p.parentId = null; save(p, 0); draw(); renderSidebar(); toast('Восстановлено'); } }, ic('restore'), 'Восстановить'),
          h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox(`Удалить «${titleOf(p)}» навсегда вместе со всем содержимым?`, { ok: 'Удалить навсегда' })) { removeBlock(p); draw(); renderSidebar(); } } }, 'Удалить'))))
        : h('div', { class: 'empty' }, h('div', { class: 'big' }, '🗑️'), 'Корзина пуста')));
  };
  draw();
}

/* ================= поиск ================= */
function openSearch() {
  const inp = h('input', { placeholder: 'Поиск по страницам, тексту, задачам, таблицам…' }), res = h('div', { class: 'sres' });
  let act = 0, items = [];
  const hl = (text, q) => { const i = text.toLowerCase().indexOf(q); if (!q || i < 0) return text; return [text.slice(0, i), h('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length)]; };
  const snippet = (t, q) => { const i = t.toLowerCase().indexOf(q); const s = Math.max(0, i - 40); return (s ? '…' : '') + t.slice(s, s + 120); };
  const draw = () => {
    const q = inp.value.trim().toLowerCase(); res.innerHTML = ''; items = [];
    if (!q) {
      const rec = Pref.get('recent', []).map(r => B[r.id]).filter(p => p && p.type === 'page' && !inTrash(p)).slice(0, 8);
      if (rec.length) res.append(h('div', { class: 'm-head' }, 'Недавние'));
      rec.forEach(p => items.push({ p, el: h('div', { class: 'sr' }, h('span', { class: 'em' }, p.properties.icon || '📄'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'st' }, titleOf(p)), h('div', { class: 'ss' }, ancestors(p).map(titleOf).join(' / ') || SPACE_NAME[p._s]))) }));
    } else {
      const pg = pages().filter(p => titleOf(p).toLowerCase().includes(q)).slice(0, 12);
      if (pg.length) res.append(h('div', { class: 'm-head' }, 'Страницы'));
      pg.forEach(p => items.push({ p, el: h('div', { class: 'sr' }, h('span', { class: 'em' }, p.properties.icon || '📄'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'st' }, hl(titleOf(p), q)), h('div', { class: 'ss' }, ancestors(p).map(titleOf).join(' / ') || SPACE_NAME[p._s]))) }));
      const found = [];
      for (const b of Object.values(B)) {
        if (b.type === 'page' || found.length > 30) continue;
        const t = b.type === 'table_row' ? (b.content.cells || []).join(' · ') : b.type === 'kanban_card' ? [b.content.text, b.properties.desc, ...(b.properties.tags || [])].filter(Boolean).join(' · ') : b.type === 'event' ? [b.content.text, b.properties.note].filter(Boolean).join(' · ') : [b.content.text, b.content.title, b.content.body, b.content.note].filter(Boolean).join(' · ');
        if (!t || !t.toLowerCase().includes(q)) continue;
        const p = pageOf(b); if (!p || inTrash(p)) continue;
        found.push({ p, b, t });
      }
      if (found.length) res.append(h('div', { class: 'm-head' }, 'Содержимое'));
      const ICON = { table_row: 'database', kanban_card: 'kanban', event: 'calendar', gsheet: 'sheet', todo: 'todo', code: 'code' };
      found.forEach(f => items.push({ p: f.p, b: f.b, el: h('div', { class: 'sr' }, h('span', { class: 'em mut' }, ic(ICON[f.b.type] || 'text')), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'st', style: 'font-weight:400' }, hl(snippet(f.t, q), q)), h('div', { class: 'ss' }, (f.p.properties.icon || '📄') + ' ' + titleOf(f.p) + ' · ' + DEF_NAME(f.b.type === 'table_row' ? 'table' : f.b.type === 'kanban_card' ? 'kanban_view' : f.b.type === 'event' ? 'calendar_view' : f.b.type)))) }));
      if (!items.length) res.append(h('div', { class: 'empty' }, 'Ничего не найдено'));
    }
    act = Math.min(act, items.length - 1);
    items.forEach((it, i) => { it.el.classList.toggle('act', i === act); it.el.onclick = () => pick(it); it.el.onmousemove = () => { if (act !== i) { act = i; items.forEach((x, k) => x.el.classList.toggle('act', k === i)); } }; res.append(it.el); });
  };
  const pick = it => { m.close(); go(pageRoute(it.p)); if (it.b) setTimeout(() => { if (it.b.type === 'kanban_card') openCard(it.b, B[it.b.parentId], () => renderBlocks()); else if (it.b.type === 'event') openEvent(it.b, () => renderBlocks()); else { const el = elOf(it.b.id) || elOf(it.b.properties.tableId); el?.scrollIntoView({ block: 'center' }); if (el) { el.style.background = 'var(--accent-bg)'; setTimeout(() => el.style.background = '', 1500); } } }, 120); };
  inp.addEventListener('input', () => { act = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); items.forEach((x, k) => x.el.classList.toggle('act', k === act)); items[act]?.el.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter' && items[act]) pick(items[act]);
  });
  const m = modal({ cls: 'search-modal', noHead: true, body: [h('div', { class: 'search-in' }, ic('search'), inp, h('span', { class: 'kbd' }, 'Esc')), res] });
  m.body.style.padding = '0';
  draw(); setTimeout(() => inp.focus());
}

/* ================= настройки ================= */
function openSettings(tab = 'account') {
  const isAdmin = App.me.role === 'admin';
  const nav = h('div', { class: 'set-nav' }), body = h('div', { class: 'set-body' });
  const TABS = [['account', 'Аккаунт', 'user'], ['mymail', 'Моя почта', 'mail'], ['look', 'Оформление', 'palette'], ['data', 'Данные и копии', 'database'],
    ...(isAdmin ? [['admin-h'], ['users', 'Пользователи', 'users'], ['mail', 'Системная почта', 'shield'], ['general', 'Общие', 'settings']] : [])];
  const show = t => {
    nav.innerHTML = ''; nav.append(h('div', { class: 'm-head' }, 'Личные'));
    TABS.forEach(([k, n, i]) => nav.append(k === 'admin-h' ? h('div', { class: 'm-head' }, 'Администрирование') : h('div', { class: 'si' + (k === t ? ' on' : ''), onclick: () => show(k) }, ic(i), h('span', { class: 't' }, n))));
    body.innerHTML = ''; ({ account: setAccount, look: setLook, data: setData, users: setUsers, mymail: setMyMail, mail: setMail, general: setGeneral }[t] || setAccount)(body);
  };
  const m = modal({ cls: 'xl', noHead: true, body: h('div', { class: 'set' }, nav, body) });
  m.body.style.padding = '0'; m.el.style.height = 'auto';
  show(tab);
}
function setAccount(b) {
  const name = h('input', { class: 'inp', value: App.me.name || '' }), email = h('input', { class: 'inp', type: 'email', value: App.me.email || '' });
  const o = h('input', { class: 'inp', type: 'password', placeholder: 'Текущий пароль', autocomplete: 'current-password' }), n = h('input', { class: 'inp', type: 'password', placeholder: 'Новый пароль (от 8 символов)', autocomplete: 'new-password' }), n2 = h('input', { class: 'inp', type: 'password', placeholder: 'Повторите новый пароль', autocomplete: 'new-password' });
  b.append(h('h2', {}, 'Аккаунт'),
    h('div', { class: 'row', style: 'margin-bottom:1rem' }, avatar(App.me.login, App.me.name), h('div', {}, h('b', {}, App.me.login), h('div', { class: 'mut small' }, App.me.role === 'admin' ? 'Администратор' : 'Пользователь'))),
    h('label', { class: 'lbl' }, 'Имя'), name, h('label', { class: 'lbl' }, 'E-mail'), email, h('p', { class: 'hint' }, 'E-mail нужен для восстановления пароля и как адрес для ответов на ваши рассылки.'),
    h('button', { class: 'btn primary', onclick: async () => { try { const r = await api('PUT', '/me', { name: name.value, email: email.value }); Object.assign(App.me, r); toast('Сохранено'); renderSidebar(); } catch (e) { toast(e.message, 'err'); } } }, 'Сохранить'),
    h('h3', {}, 'Смена пароля'), h('div', { class: 'col-gap', style: 'max-width:24rem' }, o, n, n2),
    h('div', { class: 'row', style: 'margin-top:.8rem' }, h('button', { class: 'btn', onclick: async () => {
      if (n.value !== n2.value) return toast('Пароли не совпадают', 'err');
      try { const r = await api('PUT', '/me/password', { oldPassword: o.value, password: n.value }); setToken(r.token); o.value = n.value = n2.value = ''; toast('Пароль изменён. На других устройствах нужно войти заново.'); } catch (e) { toast(e.message, 'err'); }
    } }, 'Сменить пароль')),
    h('h3', {}, 'Сеанс'), h('button', { class: 'btn danger', onclick: logout }, ic('logout'), 'Выйти'));
}
function setLook(b) {
  const th = Pref.get('theme', 'dark');
  const pick = (k, n, bg, side, fg) => h('button', { class: th === k ? 'on' : '', onclick: () => { Pref.set('theme', k); applyTheme(); b.innerHTML = ''; setLook(b); } }, h('span', { class: 'pv', style: `background:${bg}` }, h('i', { style: `background:${side}` }), h('span', { style: `flex:1;padding:.6rem;display:flex;flex-direction:column;gap:.3rem` }, h('i', { style: `height:.4rem;width:70%;background:${fg};border-radius:2px` }), h('i', { style: `height:.4rem;width:50%;background:${fg};opacity:.5;border-radius:2px` }))), h('span', { class: 'nm' }, n));
  b.append(h('h2', {}, 'Оформление'), h('h3', { style: 'margin-top:0' }, 'Тема'),
    h('div', { class: 'theme-pick' }, pick('dark', 'Тёмная', '#191919', '#202020', '#ffffffcc'), pick('light', 'Светлая', '#ffffff', '#f7f7f5', '#37352fcc'), pick('system', 'Как в системе', 'linear-gradient(135deg,#191919 50%,#fff 50%)', 'transparent', '#888')),
    h('h3', {}, 'Размер интерфейса'), seg([['s', 'Компактный'], ['m', 'Обычный'], ['l', 'Крупный'], ['xl', 'Очень крупный']], Pref.get('scale', 'm'), k => { Pref.set('scale', k); applyTheme(); }),
    h('p', { class: 'hint' }, 'Меняет размер текста, кнопок и боковой панели во всём приложении. Сохраняется для этого браузера.'),
    h('h3', {}, 'Боковая панель'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { Pref.set('sw', 17.5); document.documentElement.style.setProperty('--sw', '17.5rem'); } }, 'Сбросить ширину'), h('span', { class: 'hint' }, 'Ширину можно менять, потянув за правый край панели. Скрыть — Ctrl+\\.')));
}
function setData(b) {
  const imp = async space => {
    const [f] = await pickFiles('.json'); if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j.root && !(await confirmBox('Это полная копия: она ЗАМЕНИТ все страницы раздела «' + SPACE_NAME[space] + '». Продолжить?', { ok: 'Заменить всё' }))) return;
      flushAll(); await Promise.all(Object.values(Sync.q));
      const r = await api('POST', `/s/${space}/import`, j); await loadSpace(space); toast(r.mode === 'page' ? 'Страница добавлена' : 'Данные восстановлены');
      renderSidebar(); if (r.rootId) go(`#/p/${space}/${r.rootId}`); else go('#/home');
    } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
  };
  b.append(h('h2', {}, 'Данные и резервные копии'),
    h('p', { class: 'hint' }, 'Полная копия — все страницы раздела одним JSON-файлом. Отдельную страницу можно выгрузить в Markdown, HTML, JSON или PDF через меню «⋯» на странице.'),
    ...App.spaces.map(sp => h('div', { class: 'opt' }, h('div', { class: 'ot' }, h('b', {}, SPACE_NAME[sp]), h('span', {}, pages(sp).length + ' страниц')),
      h('button', { class: 'btn', onclick: () => download(`/s/${sp}/backup`, `projecthub-${sp === 'me' ? App.me.login : 'team'}.json`) }, ic('download'), 'Скачать копию'),
      sp === 'me' || App.me.role === 'admin' ? h('button', { class: 'btn', onclick: () => imp(sp) }, ic('import'), 'Импорт JSON') : h('button', { class: 'btn', onclick: () => imp(sp), title: 'Можно добавить страницу из экспорта JSON' }, ic('import'), 'Импорт страницы'))),
    h('h3', {}, 'Импорт из Markdown / Notion'),
    h('p', { class: 'hint' }, 'Выберите один или несколько .md-файлов (например, экспорт из Notion) — для каждого будет создана страница в разделе «Личное».'),
    h('button', { class: 'btn', onclick: async () => { const fs = await pickFiles('.md,.markdown,.txt', true); for (const f of fs) { const p = create('me', { type: 'page', content: { title: f.name.replace(/\.(md|markdown|txt)$/i, '').replace(/\s[0-9a-f]{32}$/, '') }, properties: {}, position: roots('me', 'page').length }); await importMarkdown(p, await f.text()); } renderSidebar(); } }, ic('import'), 'Импорт .md файлов'));
}
async function setUsers(b) {
  b.append(h('h2', {}, 'Пользователи'));
  const listBox = h('div'); b.append(listBox);
  const draw = async () => {
    const { users } = await api('GET', '/users'); listBox.innerHTML = '';
    listBox.append(h('div', { class: 'list' }, users.map(u => h('div', { class: 'li', style: 'flex-wrap:wrap' }, avatar(u.login, u.name),
      h('div', { class: 'grow', style: 'min-width:10rem' }, h('div', { class: 'lt' }, (u.name || u.login) + (u.login === App.me.login ? ' (вы)' : '')), h('div', { class: 'ls' }, u.login + (u.email ? ' · ' + u.email : '') + ' · с ' + fmtDate(u.createdAt?.slice(0, 10), false))),
      h('select', { class: 'inp', style: 'width:auto;height:2rem', onchange: async e => { try { await api('PUT', '/users/' + u.login, { role: e.target.value }); toast('Роль изменена'); } catch (x) { toast(x.message, 'err'); draw(); } } }, h('option', { value: 'user', selected: u.role === 'user' }, 'Пользователь'), h('option', { value: 'admin', selected: u.role === 'admin' }, 'Администратор')),
      h('div', { class: 'acts' },
        h('button', { class: 'ib', title: 'Изменить', onclick: () => editUser(u) }, ic('edit')),
        u.login !== App.me.login ? h('button', { class: 'ib', title: 'Удалить', onclick: async () => { if (await confirmBox(`Удалить пользователя ${u.login}? Его личные страницы останутся в файлах сервера (data/${u.login}.json).`)) { await api('DELETE', '/users/' + u.login).catch(e => toast(e.message, 'err')); draw(); } } }, ic('trash')) : null)))));
  };
  const editUser = u => {
    const name = h('input', { class: 'inp', value: u.name }), email = h('input', { class: 'inp', type: 'email', value: u.email }), pass = h('input', { class: 'inp', type: 'text', placeholder: 'Оставьте пустым, чтобы не менять' });
    const m = modal({ title: 'Пользователь ' + u.login, body: [h('label', { class: 'lbl' }, 'Имя'), name, h('label', { class: 'lbl' }, 'E-mail'), email, h('label', { class: 'lbl' }, 'Новый пароль'), pass],
      foot: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Отмена'), h('button', { class: 'btn primary', onclick: async () => { try { await api('PUT', '/users/' + u.login, { name: name.value, email: email.value, password: pass.value || undefined }); m.close(); draw(); toast('Сохранено'); } catch (e) { toast(e.message, 'err'); } } }, 'Сохранить')] });
  };
  const L = h('input', { class: 'inp', placeholder: 'Логин (латиница)' }), N = h('input', { class: 'inp', placeholder: 'Имя' }), E = h('input', { class: 'inp', type: 'email', placeholder: 'E-mail' });
  const P = h('input', { class: 'inp', placeholder: 'Пароль (от 8 символов)' }), R = h('select', { class: 'inp' }, h('option', { value: 'user' }, 'Пользователь'), h('option', { value: 'admin' }, 'Администратор'));
  let invite = App.cfg.mailEnabled;
  const gen = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(12)); P.value = [...r].map(x => a[x % a.length]).join(''); };
  b.append(h('h3', {}, 'Добавить пользователя'),
    h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:.6rem' }, L, N, E, h('div', { class: 'row' }, P, h('button', { class: 'btn', onclick: gen, title: 'Сгенерировать пароль' }, ic('refresh'))), R),
    App.cfg.mailEnabled ? h('label', { class: 'row small', style: 'margin-top:.7rem;cursor:pointer' }, switchEl(invite, x => invite = x), 'Отправить приглашение с логином и паролем на e-mail') : h('p', { class: 'hint' }, 'Настройте почту, чтобы отправлять приглашения автоматически. Пока передайте логин и пароль сами.'),
    h('button', { class: 'btn primary', style: 'margin-top:.9rem', onclick: async () => {
      try { const r = await api('POST', '/users', { login: L.value.trim(), name: N.value.trim(), email: E.value.trim(), password: P.value, role: R.value, invite }); toast(r.invited ? 'Пользователь создан, приглашение отправлено' : r.inviteError ? 'Создан, но письмо не ушло: ' + r.inviteError : 'Пользователь создан', r.inviteError ? 'err' : 'ok', 5000); L.value = N.value = E.value = P.value = ''; PEOPLE = null; draw(); } catch (e) { toast(e.message, 'err'); }
    } }, ic('plus'), 'Создать'));
  draw();
}
// личная почта пользователя — для его рассылок
const setMyMail = b => smtpForm(b, {
  title: 'Моя почта', load: () => api('GET', '/me/smtp'),
  hint: 'Ваши рассылки уходят с этого ящика — получатели видят ваш адрес и отвечают вам. Пароль хранится только на сервере и не виден другим пользователям, даже администратору в интерфейсе.',
  save: async m => { const r = await api('PUT', '/me/smtp', { smtp: m }); App.me.myMail = r.myMail; },
  test: to => api('POST', '/me/smtp/test', { to })
});
// общий ящик — только системные письма
const setMail = b => smtpForm(b, {
  title: 'Системная почта', load: async () => (await api('GET', '/settings')).smtp,
  hint: 'С этого ящика уходят только служебные письма: приглашения новым пользователям и восстановление пароля. Рассылки каждый пользователь отправляет со своей почты (Настройки → Моя почта).',
  save: async m => { await api('PUT', '/settings', { smtp: m }); const c = await fetch('/api/config').then(r => r.json()); App.cfg.mailEnabled = c.mailEnabled; },
  test: to => api('POST', '/mail/test', { to })
});
async function smtpForm(b, o) {
  const m = await o.load();
  const host = h('input', { class: 'inp', value: m.host, placeholder: 'smtp.mail.ru' }), port = h('input', { class: 'inp', type: 'number', value: m.port || 465 });
  const user = h('input', { class: 'inp', value: m.user, placeholder: 'ivan@mail.ru', autocomplete: 'off' }), pass = h('input', { class: 'inp', type: 'password', placeholder: m.hasPass ? '•••••••• (сохранён — оставьте пустым)' : 'Пароль приложения', autocomplete: 'new-password' });
  const from = h('input', { class: 'inp', value: m.from, placeholder: App.me.name || 'Иванов И.И.' });
  let secure = m.secure !== false;
  const secSw = switchEl(secure, x => secure = x);
  const preset = (hst, prt) => { host.value = hst; port.value = prt; secure = prt == 465; secSw.classList.toggle('on', secure); };
  const testTo = h('input', { class: 'inp', type: 'email', value: App.me.email || m.user || '', placeholder: 'куда отправить проверку' });
  const doSave = () => o.save({ host: host.value, port: +port.value, secure, user: user.value, pass: pass.value, from: from.value });
  b.append(h('h2', {}, o.title),
    h('p', { class: 'hint' }, o.hint),
    h('p', { class: 'hint' }, 'Для Mail.ru, Яндекса и Gmail нужен «пароль приложения» — его создают в настройках безопасности почты (Mail.ru: id.mail.ru → Безопасность → Пароли для внешних приложений). Обычный пароль от ящика не подойдёт.'),
    h('div', { class: 'row wrap', style: 'margin:.6rem 0 .4rem' }, h('span', { class: 'mut small' }, 'Быстрая настройка:'),
      h('button', { class: 'btn sm', onclick: () => preset('smtp.yandex.ru', 465) }, 'Яндекс'), h('button', { class: 'btn sm', onclick: () => preset('smtp.gmail.com', 465) }, 'Gmail'),
      h('button', { class: 'btn sm', onclick: () => preset('smtp.mail.ru', 465) }, 'Mail.ru'), h('button', { class: 'btn sm', onclick: () => preset('smtp.office365.com', 587) }, 'Outlook')),
    h('div', { style: 'display:grid;grid-template-columns:2fr 1fr;gap:.6rem' }, h('div', {}, h('label', { class: 'lbl' }, 'Сервер'), host), h('div', {}, h('label', { class: 'lbl' }, 'Порт'), port)),
    h('label', { class: 'row small', style: 'margin-top:.6rem' }, secSw, 'SSL/TLS (порт 465). Для 587 выключите — будет STARTTLS'),
    h('label', { class: 'lbl' }, 'Логин (адрес ящика)'), user, h('label', { class: 'lbl' }, 'Пароль'), pass,
    h('label', { class: 'lbl' }, 'Отправитель'), from, h('p', { class: 'hint' }, 'Необязательно. Можно написать просто имя («Иванов И.И.») — адрес подставится из логина. Если указываете адрес, он должен совпадать с логином.'),
    h('div', { class: 'row', style: 'margin-top:.8rem' }, h('button', { class: 'btn primary', onclick: async () => { try { await doSave(); toast('Настройки почты сохранены'); } catch (e) { toast(e.message, 'err'); } } }, 'Сохранить')),
    h('h3', {}, 'Проверка'), h('div', { class: 'row', style: 'max-width:30rem' }, testTo, h('button', { class: 'btn', onclick: async e => {
      const btn = e.currentTarget; btn.disabled = true;
      try { await doSave(); await o.test(testTo.value); toast('Письмо отправлено — проверьте ящик ' + testTo.value, 'ok', 5000); } catch (x) { toast(x.message, 'err', 9000); } finally { btn.disabled = false; }
    } }, ic('send'), 'Отправить тест')));
}
async function setGeneral(b) {
  const s = await api('GET', '/settings');
  const name = h('input', { class: 'inp', value: s.appName }), url = h('input', { class: 'inp', value: s.publicUrl, placeholder: 'https://hub.example.ru' });
  const put = async patch => { try { await api('PUT', '/settings', patch); Object.assign(App.cfg, patch); toast('Сохранено'); } catch (e) { toast(e.message, 'err'); } };
  b.append(h('h2', {}, 'Общие настройки'),
    h('label', { class: 'lbl' }, 'Название рабочего пространства'), h('div', { class: 'row' }, name, h('button', { class: 'btn', onclick: async () => { await put({ appName: name.value }); renderSidebar(); } }, 'Сохранить')),
    h('label', { class: 'lbl' }, 'Адрес сайта'), h('div', { class: 'row' }, url, h('button', { class: 'btn', onclick: () => put({ publicUrl: url.value }) }, 'Сохранить')),
    h('p', { class: 'hint' }, 'Используется в ссылках из писем (приглашения, восстановление пароля, картинки в рассылках). Если пусто — берётся адрес, с которого открыт сайт.'),
    h('div', { class: 'opt' }, h('div', { class: 'ot' }, h('b', {}, 'Открытая регистрация'), h('span', {}, 'Любой, кто знает адрес, сможет создать аккаунт на странице входа')), switchEl(s.openRegistration, x => put({ openRegistration: x }))),
    h('div', { class: 'opt' }, h('div', { class: 'ot' }, h('b', {}, 'Командное пространство'), h('span', {}, 'Общий раздел «Команда», который видят и редактируют все пользователи')), switchEl(s.teamSpace, async x => { await put({ teamSpace: x }); toast('Перезагружаю…', 'info'); setTimeout(() => location.reload(), 600); })));
}

/* ================= фоновая синхронизация, горячие клавиши ================= */
const editing = () => { const a = document.activeElement; return a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || !!$('.overlay') || POPS.length; };
async function pollChanges() {
  if (document.hidden || !App.me) return;
  let changed = false;
  for (const sp of App.spaces) { try { changed = (await pull(sp)) || changed; } catch { } }
  if (changed) App.stale = true;
  if (App.stale && !editing() && !Sync.pend.size && !Sync.busy) {
    App.stale = false; renderSidebar();
    if (App.view.kind === 'page') { const p = B[App.view.id]; if (!p || inTrash(p)) return go('#/home'); const y = $('#scroll').scrollTop; renderTop(); renderPage(p); $('#scroll').scrollTop = y; }
    else if (['home', 'calendar', 'sheets', 'trash'].includes(App.view.kind)) { const y = $('#scroll').scrollTop; route(); $('#scroll').scrollTop = y; }
  }
}
addEventListener('focus', () => App.me && pollChanges());
addEventListener('beforeunload', e => { if (Sync.pend.size) flushAll(true); if (Sync.busy || Sync.pend.size) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', e => {
  if (!App.me) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'k' || e.key === 'л' || e.key === 'p' && e.shiftKey)) { e.preventDefault(); if (!$('.search-modal')) openSearch(); }
  else if (mod && e.key === '\\') { e.preventDefault(); toggleSide(); }
  else if (e.altKey && (e.key === 'n' || e.key === 'т')) { e.preventDefault(); newPage(App.view.space || 'me'); }
  else if (mod && e.key === 's') { e.preventDefault(); flushAll(); toast('Сохранено'); }
});

boot();
