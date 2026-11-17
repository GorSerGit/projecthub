// ProjectHub 3 — сервер. Зависимости: express, jsonwebtoken, multer, nodemailer.
'use strict';
const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto'), jwt = require('jsonwebtoken'), multer = require('multer');
const { createStore, rj, wj, now, uuid } = require('./lib/store');
const { renderPage, tableCsv, parseCsv, cleanInline } = require('./lib/render');
const mail = require('./lib/mail');

const PORT = +process.env.PORT || 3000, ROOT = process.env.DATA_ROOT || __dirname, MAX_MB = +process.env.MAX_UPLOAD_MB || 100;
const USERS = path.join(ROOT, 'users.json'), SETTINGS = path.join(ROOT, 'settings.json'), SECRET_F = path.join(ROOT, '.jwt-secret');
const UPLOADS = path.join(ROOT, 'uploads'), FILES_IDX = path.join(UPLOADS, 'index.json'), MAILLOG = path.join(ROOT, 'mail-log.json');
fs.mkdirSync(UPLOADS, { recursive: true });
const store = createStore(ROOT);
const SECRET = process.env.JWT_SECRET || (fs.existsSync(SECRET_F) ? fs.readFileSync(SECRET_F, 'utf8').trim() : (() => { const s = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(SECRET_F, s, { mode: 0o600 }); return s; })());

// ---- пароли: scrypt; старые открытые пароли переводятся в хэш при первом входе ----
const hash = p => { const s = crypto.randomBytes(16).toString('hex'); return `scrypt$${s}$${crypto.scryptSync(p, s, 64).toString('hex')}`; };
const check = (p, u) => {
  if (u.hash) { const [, s, h] = u.hash.split('$'); return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(p, s, 64)); }
  return typeof u.password === 'string' && u.password === p;
};

// ---- пользователи и настройки (кэш в памяти) ----
const DB = rj(USERS, { users: [] }); const saveUsers = () => wj(USERS, DB);
if (!DB.users.length) { DB.users.push({ login: 'admin', hash: hash(process.env.ADMIN_PASSWORD || 'admin1234'), role: 'admin', createdAt: now() }); saveUsers(); console.log('Создан администратор admin (пароль из ADMIN_PASSWORD или admin1234 — смените его!)'); }
const findUser = l => DB.users.find(u => u.login === l);
const pub = u => ({ login: u.login, name: u.name || '', email: u.email || '', role: u.role, createdAt: u.createdAt });

const DEF = { openRegistration: false, appName: 'ProjectHub', publicUrl: '', teamSpace: true, smtp: { host: '', port: 465, secure: true, user: '', pass: '', from: '' } };
const SET = { ...DEF, ...rj(SETTINGS, {}) }; SET.smtp = { ...DEF.smtp, ...(SET.smtp || {}) };
const saveSettings = () => wj(SETTINGS, SET);
const smtpReady = () => !!(SET.smtp.host && (SET.smtp.from || SET.smtp.user));
// личная почта пользователя: через неё уходят его рассылки (общий ящик — только для системных писем)
const userSmtp = u => u && u.smtp && u.smtp.host && u.smtp.user && u.smtp.pass ? u.smtp : null;
function mergeSmtp(t, m) {
  for (const k of ['host', 'user', 'from']) if (m[k] !== undefined) t[k] = String(m[k]).trim().slice(0, 200);
  if (m.port !== undefined) t.port = +m.port || 465;
  if (m.secure !== undefined) t.secure = !!m.secure;
  if (m.pass) t.pass = String(m.pass); // пустое поле = оставить прежний пароль
  if (m.clearPass) t.pass = '';
  return t;
}
const maskSmtp = m => ({ host: '', port: 465, secure: true, user: '', from: '', ...m, pass: '', hasPass: !!(m && m.pass) });
const baseUrl = q => (SET.publicUrl || '').replace(/\/+$/, '') || `${q.protocol}://${q.get('host')}`;

// ---- защита от перебора ----
const fails = new Map();
const throttled = ip => { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 15 * 60e3; };
const fail = ip => { const f = fails.get(ip) || { n: 0 }; fails.set(ip, { n: f.n + 1, t: Date.now() }); };

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use((q, s, n) => { s.setHeader('X-Content-Type-Options', 'nosniff'); s.setHeader('Referrer-Policy', 'same-origin'); n(); });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 })); // проверка по ETag — после обновления все сразу получают новую версию

const auth = (q, s, n) => {
  try {
    const t = jwt.verify(q.headers['x-auth-token'] || '', SECRET), u = findUser(t.login);
    if (!u || (u.tv || 0) !== (t.tv || 0)) throw 0; // удалён или сменил пароль — старые сессии недействительны
    q.user = { login: u.login, role: u.role, cid: String(q.headers['x-client'] || '').slice(0, 40) }; n();
  } catch { s.status(401).json({ error: 'Нужно войти' }); }
};
const admin = (q, s, n) => q.user.role === 'admin' ? n() : s.status(403).json({ error: 'Только для администратора' });
const okLogin = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,31}$/;
const tokenFor = u => ({ token: jwt.sign({ login: u.login, tv: u.tv || 0 }, SECRET, { expiresIn: '60d' }), user: pub(u) });
const badEmail = e => e && !mail.EMAIL.test(e);
const sendMail = async (to, subject, html) => { const t = mail.transport(SET.smtp); try { await t.sendMail({ from: mail.from(SET.smtp, SET.appName), to, subject, html: mail.wrap({ appName: SET.appName, html }), text: mail.toText(html) }); } finally { t.close(); } };

// ================= вход, регистрация, восстановление =================
app.get('/api/config', (q, s) => s.json({ openRegistration: SET.openRegistration, appName: SET.appName, mailEnabled: smtpReady(), teamSpace: SET.teamSpace }));
app.post('/api/login', (q, s) => {
  if (throttled(q.ip)) return s.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });
  const { login = '', password = '' } = q.body || {}, v = String(login).trim().toLowerCase();
  const u = DB.users.find(x => x.login.toLowerCase() === v || (x.email && x.email.toLowerCase() === v));
  if (!u || !check(String(password), u)) { fail(q.ip); return s.status(401).json({ error: 'Неверный логин или пароль' }); }
  if (!u.hash) { u.hash = hash(String(password)); delete u.password; saveUsers(); }
  fails.delete(q.ip); s.json(tokenFor(u));
});
app.post('/api/register', (q, s) => {
  if (!SET.openRegistration) return s.status(403).json({ error: 'Регистрация закрыта администратором' });
  if (throttled(q.ip)) return s.status(429).json({ error: 'Слишком много попыток' });
  const { login = '', password = '', email = '', name = '' } = q.body || {};
  if (!okLogin.test(login)) return s.status(400).json({ error: 'Логин: 2–32 символа (латиница, цифры, _ . -)' });
  if (String(password).length < 8) return s.status(400).json({ error: 'Пароль: минимум 8 символов' });
  if (badEmail(email)) return s.status(400).json({ error: 'Неверный e-mail' });
  if (DB.users.some(x => x.login.toLowerCase() === login.toLowerCase())) return s.status(409).json({ error: 'Логин занят' });
  if (email && DB.users.some(x => (x.email || '').toLowerCase() === email.toLowerCase())) return s.status(409).json({ error: 'Этот e-mail уже используется' });
  const u = { login, name: String(name).slice(0, 80), email: String(email).toLowerCase(), hash: hash(password), role: 'user', createdAt: now() };
  DB.users.push(u); saveUsers(); fail(q.ip); s.json(tokenFor(u));
});
const resets = new Map();
app.post('/api/forgot', async (q, s) => {
  if (throttled(q.ip)) return s.status(429).json({ error: 'Слишком много попыток' });
  fail(q.ip);
  const v = String((q.body || {}).login || '').trim().toLowerCase();
  const u = DB.users.find(x => x.login.toLowerCase() === v || (x.email || '').toLowerCase() === v);
  s.json({ ok: true }); // одинаковый ответ — нельзя узнать, существует ли пользователь
  if (!u || !u.email || !smtpReady()) return;
  const t = crypto.randomBytes(24).toString('hex'); resets.set(t, { login: u.login, exp: Date.now() + 3600e3 });
  const link = `${baseUrl(q)}/#/reset/${t}`;
  sendMail(u.email, 'Восстановление пароля', `<p>Здравствуйте${u.name ? ', ' + u.name : ''}!</p><p>Чтобы задать новый пароль для входа <b>${u.login}</b>, перейдите по ссылке (действует 1 час):</p><p><a href="${link}" style="display:inline-block;background:#2383e2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Задать новый пароль</a></p><p style="color:#9b9a97">Если вы не запрашивали восстановление, просто проигнорируйте письмо.</p>`).catch(e => console.error('forgot mail:', e.message));
});
app.post('/api/reset', (q, s) => {
  const { token = '', password = '' } = q.body || {}, r = resets.get(token), u = r && findUser(r.login);
  if (!r || r.exp < Date.now() || !u) return s.status(400).json({ error: 'Ссылка устарела. Запросите восстановление ещё раз.' });
  if (String(password).length < 8) return s.status(400).json({ error: 'Пароль: минимум 8 символов' });
  u.hash = hash(password); delete u.password; u.tv = (u.tv || 0) + 1; saveUsers(); resets.delete(token); s.json(tokenFor(u));
});

// ================= аккаунт =================
app.get('/api/me', auth, (q, s) => { const u = findUser(q.user.login); s.json({ ...pub(u), mailEnabled: smtpReady(), myMail: !!userSmtp(u), teamSpace: SET.teamSpace, appName: SET.appName }); });
app.get('/api/me/smtp', auth, (q, s) => s.json(maskSmtp(findUser(q.user.login).smtp)));
app.put('/api/me/smtp', auth, (q, s) => {
  const u = findUser(q.user.login), m = (q.body || {}).smtp || {};
  if (m.user && !mail.EMAIL.test(String(m.user).trim())) return s.status(400).json({ error: 'Логин почты — это полный адрес ящика, например ivan@mail.ru' });
  u.smtp = mergeSmtp({ port: 465, secure: true, ...(u.smtp || {}) }, m); saveUsers(); s.json({ ok: true, myMail: !!userSmtp(u) });
});
app.post('/api/me/smtp/test', auth, async (q, s) => {
  const u = findUser(q.user.login), sm = userSmtp(u), to = String((q.body || {}).to || '').trim();
  if (!sm) return s.status(400).json({ error: 'Заполните сервер, логин и пароль и сохраните' });
  if (!mail.EMAIL.test(to)) return s.status(400).json({ error: 'Укажите адрес для проверки' });
  const t = mail.transport(sm);
  try { await t.sendMail({ from: mail.from(sm, u.name || u.login), to, subject: 'Проверка почты', html: mail.wrap({ appName: SET.appName, html: `<p>Ваша почта в <b>${SET.appName}</b> подключена — рассылки будут уходить с этого ящика ✅</p>` }) }); s.json({ ok: true }); }
  catch (e) { s.status(400).json({ error: 'SMTP: ' + e.message }); } finally { t.close(); }
});
app.put('/api/me', auth, (q, s) => {
  const u = findUser(q.user.login), { name, email } = q.body || {};
  if (email !== undefined) {
    const e = String(email).trim().toLowerCase(); if (badEmail(e)) return s.status(400).json({ error: 'Неверный e-mail' });
    if (e && DB.users.some(x => x !== u && (x.email || '') === e)) return s.status(409).json({ error: 'Этот e-mail уже используется' });
    u.email = e;
  }
  if (name !== undefined) u.name = String(name).slice(0, 80);
  saveUsers(); s.json(pub(u));
});
app.put('/api/me/password', auth, (q, s) => {
  const { oldPassword = '', password = '' } = q.body || {}, u = findUser(q.user.login);
  if (!check(String(oldPassword), u)) return s.status(401).json({ error: 'Текущий пароль неверен' });
  if (String(password).length < 8) return s.status(400).json({ error: 'Пароль: минимум 8 символов' });
  u.hash = hash(password); delete u.password; u.tv = (u.tv || 0) + 1; saveUsers(); s.json(tokenFor(u));
});
app.get('/api/people', auth, (q, s) => s.json(DB.users.map(u => ({ login: u.login, name: u.name || '', email: u.email || '' }))));

// ================= администрирование =================
const admins = () => DB.users.filter(u => u.role === 'admin').length;
app.get('/api/users', auth, admin, (q, s) => s.json({ users: DB.users.map(pub) }));
app.post('/api/users', auth, admin, async (q, s) => {
  const { login = '', password = '', role, email = '', name = '', invite } = q.body || {};
  if (!okLogin.test(login)) return s.status(400).json({ error: 'Логин: 2–32 символа (латиница, цифры, _ . -)' });
  if (String(password).length < 8) return s.status(400).json({ error: 'Пароль: минимум 8 символов' });
  if (badEmail(email)) return s.status(400).json({ error: 'Неверный e-mail' });
  if (DB.users.some(x => x.login.toLowerCase() === login.toLowerCase())) return s.status(409).json({ error: 'Логин занят' });
  const u = { login, name: String(name).slice(0, 80), email: String(email).toLowerCase(), hash: hash(password), role: role === 'admin' ? 'admin' : 'user', createdAt: now() };
  DB.users.push(u); saveUsers();
  let invited = false, inviteError = null;
  if (invite && u.email && smtpReady()) {
    try {
      await sendMail(u.email, `Приглашение в ${SET.appName}`, `<p>Здравствуйте${u.name ? ', ' + u.name : ''}!</p><p>Для вас создан аккаунт в <b>${SET.appName}</b>.</p><p>Адрес: <a href="${baseUrl(q)}">${baseUrl(q)}</a><br>Логин: <b>${u.login}</b><br>Пароль: <b>${String(password).replace(/[<>&]/g, '')}</b></p><p>После входа смените пароль в настройках.</p>`);
      invited = true;
    } catch (e) { inviteError = e.message; }
  }
  s.json({ ok: true, invited, inviteError });
});
app.put('/api/users/:l', auth, admin, (q, s) => {
  const u = findUser(q.params.l), { role, email, name, password } = q.body || {};
  if (!u) return s.status(404).json({ error: 'Не найден' });
  if (role && role !== u.role) {
    if (u.role === 'admin' && admins() === 1) return s.status(400).json({ error: 'Нельзя снять права с последнего администратора' });
    u.role = role === 'admin' ? 'admin' : 'user';
  }
  if (email !== undefined) { const e = String(email).trim().toLowerCase(); if (badEmail(e)) return s.status(400).json({ error: 'Неверный e-mail' }); u.email = e; }
  if (name !== undefined) u.name = String(name).slice(0, 80);
  if (password) { if (String(password).length < 8) return s.status(400).json({ error: 'Пароль: минимум 8 символов' }); u.hash = hash(password); delete u.password; u.tv = (u.tv || 0) + 1; }
  saveUsers(); s.json(pub(u));
});
app.delete('/api/users/:l', auth, admin, (q, s) => {
  const u = findUser(q.params.l);
  if (!u) return s.status(404).json({ error: 'Не найден' });
  if (u.login === q.user.login) return s.status(400).json({ error: 'Нельзя удалить себя' });
  DB.users.splice(DB.users.indexOf(u), 1); saveUsers(); s.json({ ok: true }); // страницы пользователя остаются в data/
});
app.get('/api/settings', auth, admin, (q, s) => s.json({ ...SET, smtp: { ...SET.smtp, pass: '', hasPass: !!SET.smtp.pass } }));
app.put('/api/settings', auth, admin, (q, s) => {
  const b = q.body || {};
  if (b.openRegistration !== undefined) SET.openRegistration = !!b.openRegistration;
  if (b.teamSpace !== undefined) SET.teamSpace = !!b.teamSpace;
  if (b.appName !== undefined) SET.appName = String(b.appName).trim().slice(0, 40) || 'ProjectHub';
  if (b.publicUrl !== undefined) SET.publicUrl = String(b.publicUrl).trim().slice(0, 200);
  if (b.smtp) mergeSmtp(SET.smtp, b.smtp);
  saveSettings(); s.json({ ok: true });
});

// ================= пространства и блоки =================
const space = (q, s, n) => {
  const p = q.params.space;
  if (p === 'me') q.sk = 'u:' + q.user.login; else if (p === 'team' && SET.teamSpace) q.sk = 'team';
  else return s.status(404).json({ error: 'Пространство недоступно' });
  q.d = store.load(q.sk); n();
};
const S = '/api/s/:space';
const okId = x => typeof x === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(x);
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
function patch(b, u) {
  if (u.parentId === null || okId(u.parentId)) b.parentId = u.parentId;
  if (typeof u.type === 'string' && u.type.length < 40) b.type = u.type;
  if (isObj(u.content)) b.content = u.content;
  if (isObj(u.properties)) b.properties = u.properties;
  if (typeof u.position === 'number' && isFinite(u.position)) b.position = u.position;
}
app.get(S + '/blocks', auth, space, (q, s) => s.json({ blocks: Object.values(q.d.blocks), rev: q.d.rev }));
app.get(S + '/changes', auth, space, (q, s) => {
  const since = +q.query.since || 0, d = q.d;
  if (since > d.rev || (d.meta.prunedRev || 0) > since) return s.json({ reset: true });
  s.json({ rev: d.rev, blocks: since === d.rev ? [] : Object.values(d.blocks).filter(b => b.rev > since), deleted: d.deleted.filter(x => x.rev > since).map(x => x.id) });
});
app.post(S + '/blocks', auth, space, (q, s) => {
  const list = Array.isArray(q.body?.blocks) ? q.body.blocks : [q.body || {}], out = [];
  for (const o of list) {
    if (o.id && (!okId(o.id) || q.d.blocks[o.id])) continue;
    const b = store.make(q.d, { id: o.id }, q.user); patch(b, o); out.push(b);
  }
  store.save(q.sk); s.json({ blocks: out, rev: q.d.rev });
});
app.put(S + '/blocks/:id', auth, space, (q, s) => {
  const b = q.d.blocks[q.params.id]; if (!b) return s.status(404).json({ error: 'Блок не найден (возможно, удалён)' });
  patch(b, q.body || {}); store.put(q.d, b, q.user); store.save(q.sk); s.json({ rev: q.d.rev });
});
app.delete(S + '/blocks/:id', auth, space, (q, s) => { store.remove(q.d, q.params.id); store.save(q.sk); s.json({ ok: true, rev: q.d.rev }); });
app.post(S + '/batch', auth, space, (q, s) => {
  const { updates = [], deletes = [] } = q.body || {};
  for (const u of updates) { const b = q.d.blocks[u.id]; if (b) { patch(b, u); store.put(q.d, b, q.user); } }
  for (const id of deletes) store.remove(q.d, id);
  store.save(q.sk); s.json({ ok: true, rev: q.d.rev });
});
app.post(S + '/duplicate/:id', auth, space, (q, s) => {
  const b = q.d.blocks[q.params.id]; if (!b) return s.status(404).json({ error: 'Не найдено' });
  const rp = { position: (b.position ?? 0) + 0.5 }; if (b.type === 'page') rp.content = { ...b.content, title: (b.content.title || 'Без названия') + ' (копия)' };
  const out = store.cloneTree(q.d, b.id, q.d, q.user, rp); store.save(q.sk); s.json({ blocks: out, rootId: out[0].id, rev: q.d.rev });
});
const META = ['lists', 'favorites'];
app.get(S + '/meta/:key', auth, space, (q, s) => META.includes(q.params.key) ? s.json(q.d.meta[q.params.key] || []) : s.status(404).end());
app.put(S + '/meta/:key', auth, space, (q, s) => {
  if (!META.includes(q.params.key) || !Array.isArray(q.body)) return s.status(400).json({ error: 'Неверные данные' });
  q.d.meta[q.params.key] = q.body.slice(0, 500); store.save(q.sk); s.json({ ok: true });
});

// перенос страницы (с вложенным) между личным и командным пространством
app.post('/api/move', auth, (q, s) => {
  const { from, to, id } = q.body || {}, key = x => x === 'me' ? 'u:' + q.user.login : x === 'team' && SET.teamSpace ? 'team' : null;
  const fk = key(from), tk = key(to); if (!fk || !tk || fk === tk) return s.status(400).json({ error: 'Неверное пространство' });
  const src = store.load(fk), dst = store.load(tk), b = src.blocks[id]; if (!b) return s.status(404).json({ error: 'Не найдено' });
  const roots = Object.values(dst.blocks).filter(x => !x.parentId && x.type === 'page');
  const out = store.cloneTree(src, id, dst, q.user, { parentId: null, position: roots.length });
  store.remove(src, id); store.save(fk); store.save(tk); s.json({ rootId: out[0].id });
});

// ---- экспорт / импорт ----
const fname = t => encodeURIComponent(String(t || 'page').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80));
app.get(S + '/export/:id', auth, space, (q, s) => {
  const b = q.d.blocks[q.params.id]; if (!b) return s.status(404).json({ error: 'Не найдено' });
  const fmt = ['md', 'html', 'json'].includes(q.query.format) ? q.query.format : 'md', name = fname(b.content.title);
  s.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}.${fmt}`);
  if (fmt === 'json') { const keep = {}; for (const i of store.subtree(q.d, b.id)) keep[i] = q.d.blocks[i]; return s.json({ blocks: keep, root: b.id }); }
  const out = renderPage(q.d, b.id, fmt, { base: baseUrl(q) });
  s.type(fmt === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8').send(out);
});
app.get(S + '/csv/:id', auth, space, (q, s) => {
  const b = q.d.blocks[q.params.id]; if (!b || b.type !== 'table') return s.status(404).json({ error: 'Таблица не найдена' });
  s.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname(b.content.title || 'table')}.csv`); s.type('text/csv; charset=utf-8').send(tableCsv(q.d, b.id));
});
app.get(S + '/backup', auth, space, (q, s) => {
  s.setHeader('Content-Disposition', `attachment; filename=projecthub-${q.params.space === 'me' ? q.user.login : 'team'}-${now().slice(0, 10)}.json`);
  s.json({ blocks: q.d.blocks, meta: q.d.meta });
});
app.post(S + '/import', auth, space, (q, s) => {
  const b = (q.body || {}).blocks; if (!isObj(b)) return s.status(400).json({ error: 'Неверный формат файла' });
  if (q.body.root) { // страница из экспорта JSON — добавляется как новая
    if (!b[q.body.root]) return s.status(400).json({ error: 'Неверный формат файла' });
    const tmp = { blocks: JSON.parse(JSON.stringify(b)), rev: 0 };
    const out = store.cloneTree(tmp, q.body.root, q.d, q.user, { parentId: null, position: 9999 }); store.save(q.sk); return s.json({ ok: true, mode: 'page', rootId: out[0].id });
  }
  if (q.params.space === 'team' && q.user.role !== 'admin') return s.status(403).json({ error: 'Полностью заменить командное пространство может только администратор' });
  for (const id of Object.keys(q.d.blocks)) store.remove(q.d, id);
  for (const x of Object.values(b)) if (isObj(x) && okId(x.id)) { const n = store.make(q.d, { id: x.id }, q.user); patch(n, x); n.createdAt = x.createdAt || n.createdAt; }
  if (isObj(q.body.meta)) for (const k of META) if (Array.isArray(q.body.meta[k])) q.d.meta[k] = q.body.meta[k];
  store.save(q.sk); s.json({ ok: true, mode: 'full' });
});

// ================= файлы =================
const FILES = rj(FILES_IDX, { files: [] }); const saveFiles = () => wj(FILES_IDX, FILES);
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOADS, filename: (q, f, cb) => cb(null, uuid() + path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10)) }),
  limits: { fileSize: MAX_MB * 1048576 }
});
const fixName = n => { const u = Buffer.from(n, 'latin1').toString('utf8'); return u.includes('�') ? n : u; };
const pubFile = f => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, owner: f.owner, createdAt: f.createdAt, url: `/files/${f.id}/${encodeURIComponent(f.name)}` });
app.post('/api/upload', auth, (q, s) => upload.single('file')(q, s, e => {
  if (e) return s.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? `Файл больше ${MAX_MB} МБ` : e.message });
  if (!q.file) return s.status(400).json({ error: 'Файл не получен' });
  const f = { id: path.parse(q.file.filename).name, file: q.file.filename, name: fixName(q.file.originalname).slice(0, 200), size: q.file.size, mime: q.file.mimetype, owner: q.user.login, createdAt: now() };
  FILES.files.push(f); saveFiles(); s.json(pubFile(f));
}));
app.get('/api/files', auth, (q, s) => s.json(FILES.files.filter(f => f.owner === q.user.login || (q.query.all && q.user.role === 'admin')).map(pubFile).reverse()));
app.delete('/api/files/:id', auth, (q, s) => {
  const f = FILES.files.find(x => x.id === q.params.id);
  if (!f) return s.status(404).json({ error: 'Не найден' });
  if (f.owner !== q.user.login && q.user.role !== 'admin') return s.status(403).json({ error: 'Это не ваш файл' });
  fs.rm(path.join(UPLOADS, f.file), { force: true }, () => {}); FILES.files.splice(FILES.files.indexOf(f), 1); saveFiles(); s.json({ ok: true });
});
// Файлы доступны по неугадываемой ссылке (как «доступ по ссылке»), чтобы картинки показывались в страницах и письмах
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|video\/|audio\/|text\/plain)/;
app.get('/files/:id/:name?', (q, s) => {
  const f = FILES.files.find(x => x.id === q.params.id); if (!f) return s.status(404).send('Файл не найден');
  const inline = INLINE.test(f.mime) && !q.query.dl;
  s.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  if (!/pdf/.test(f.mime)) s.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  s.setHeader('Cache-Control', 'private, max-age=86400');
  s.type(inline ? f.mime : 'application/octet-stream').sendFile(path.join(UPLOADS, f.file));
});

// ================= Google Таблицы: чтение CSV по ссылке (для импорта в таблицу) =================
app.get('/api/gsheet/csv', auth, async (q, s) => {
  const u = String(q.query.url || ''), gid = (u.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  const pubM = u.match(/\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,})/), idM = u.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  const url = pubM ? `https://docs.google.com/spreadsheets/d/e/${pubM[1]}/pub?output=csv&gid=${gid}` : idM ? `https://docs.google.com/spreadsheets/d/${idM[1]}/export?format=csv&gid=${gid}` : null;
  if (!url) return s.status(400).json({ error: 'Это не ссылка на Google Таблицу' });
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) }), ct = r.headers.get('content-type') || '';
    if (!r.ok || !/csv|text\/plain/.test(ct)) return s.status(400).json({ error: 'Не удалось прочитать таблицу. В Google Таблицах откройте «Настройки доступа» → «Все, у кого есть ссылка» (читатель).' });
    s.json({ rows: parseCsv((await r.text()).slice(0, 5e6)).slice(0, 5000).map(r => r.slice(0, 60)) });
  } catch (e) { s.status(502).json({ error: 'Google не ответил: ' + e.message }); }
});

// ================= рассылки =================
const LOG = rj(MAILLOG, []); let logTimer; const saveLog = () => { clearTimeout(logTimer); logTimer = setTimeout(() => wj(MAILLOG, LOG.slice(0, 500)), 300); };
app.post('/api/mail/send', auth, (q, s) => {
  const sender = findUser(q.user.login), sm = userSmtp(sender);
  if (!sm) return s.status(400).json({ error: 'Подключите свою почту: Настройки → Моя почта. Рассылки уходят с вашего ящика.' });
  const { to = '', lists = [], subject = '', html = '', page, files = [], attachPage } = q.body || {};
  const emails = new Set(mail.parseEmails(to));
  for (const l of Array.isArray(lists) ? lists : []) {
    const d = store.load(l.space === 'team' && SET.teamSpace ? 'team' : 'u:' + q.user.login);
    const list = d.meta.lists.find(x => x.id === l.id); if (list) mail.parseEmails((list.emails || []).join(' ')).forEach(e => emails.add(e));
  }
  if (!emails.size) return s.status(400).json({ error: 'Нет ни одного корректного адреса получателя' });
  if (emails.size > 3000) return s.status(400).json({ error: 'Слишком много получателей (максимум 3000 за раз)' });
  if (!String(subject).trim()) return s.status(400).json({ error: 'Укажите тему письма' });
  let body = cleanInline(String(html)), pageTitle = null; const attachments = [];
  if (page && page.id) {
    const d = store.load(page.space === 'team' && SET.teamSpace ? 'team' : 'u:' + q.user.login), p = d.blocks[page.id];
    if (p) {
      pageTitle = p.content.title || 'Страница';
      const fragment = renderPage(d, p.id, 'body', { base: baseUrl(q) });
      if (attachPage) attachments.push({ filename: pageTitle.replace(/[\\/:*?"<>|]/g, '_') + '.html', content: renderPage(d, p.id, 'html', { base: baseUrl(q) }) });
      else body += `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #eeede9">${fragment}</div>`;
    }
  }
  for (const id of Array.isArray(files) ? files.slice(0, 10) : []) {
    const f = FILES.files.find(x => x.id === id && (x.owner === q.user.login || q.user.role === 'admin'));
    if (f) attachments.push({ filename: f.name, path: path.join(UPLOADS, f.file) });
  }
  const fromAddr = mail.from(sm, sender.name || sender.login);
  const job = { id: uuid(), from: q.user.login, sender: sm.user, subject: String(subject).slice(0, 200), total: emails.size, sent: 0, failed: [], status: 'sending', page: pageTitle, attachments: attachments.length, createdAt: now() };
  LOG.unshift(job); saveLog(); s.json({ ok: true, job });
  // отправляем в фоне с ящика пользователя: каждому получателю отдельное письмо, адреса друг друга не видны
  (async () => {
    const t = mail.transport(sm, true), html2 = mail.wrap({ appName: SET.appName, html: body, footer: `Отправлено через ${SET.appName}` });
    const text = mail.toText(body);
    for (const e of emails) {
      try { await t.sendMail({ from: fromAddr, to: e, subject: job.subject, html: html2, text, attachments }); job.sent++; }
      catch (x) { job.failed.push({ email: e, error: String(x.message).slice(0, 200) }); }
      saveLog();
    }
    job.status = !job.failed.length ? 'done' : job.sent ? 'partial' : 'failed'; job.finishedAt = now(); saveLog(); t.close();
  })();
});
app.get('/api/mail/log', auth, (q, s) => s.json(LOG.filter(j => q.user.role === 'admin' || j.from === q.user.login).slice(0, 100)));
app.post('/api/mail/test', auth, admin, async (q, s) => {
  const to = String((q.body || {}).to || '').trim(); if (!mail.EMAIL.test(to)) return s.status(400).json({ error: 'Укажите адрес для проверки' });
  if (!smtpReady()) return s.status(400).json({ error: 'Сначала заполните и сохраните настройки SMTP' });
  try { await sendMail(to, 'Проверка почты', `<p>Почта в <b>${SET.appName}</b> настроена правильно ✅</p>`); s.json({ ok: true }); }
  catch (e) { s.status(400).json({ error: 'SMTP: ' + e.message }); }
});

app.use('/api', (q, s) => s.status(404).json({ error: 'Неизвестный запрос' }));
app.use((e, q, s, n) => { console.error(e); s.status(e.status || 500).json({ error: e.type === 'entity.too.large' ? 'Слишком большой запрос' : e.type === 'entity.parse.failed' ? 'Неверный формат запроса' : 'Ошибка сервера' }); });
app.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`${SET.appName}: http://localhost:${PORT}`));
