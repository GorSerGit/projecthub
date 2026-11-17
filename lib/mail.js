// Отправка почты через SMTP (Gmail, Яндекс, Mail.ru или свой сервер).
const nodemailer = require('nodemailer');
const { esc } = require('./render');

const transport = (smtp, pool = false) => nodemailer.createTransport({
  host: smtp.host, port: +smtp.port || 465, secure: smtp.secure !== false && (+smtp.port || 465) === 465,
  auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  pool, maxConnections: 2, rateDelta: 1000, rateLimit: 5, connectionTimeout: 20000
});

// «Отправитель» может быть адресом, «Имя <адрес>» или просто именем — тогда адрес берётся из логина
const from = (smtp, appName) => {
  const f = String(smtp.from || '').trim(), q = s => `"${String(s).replace(/"/g, '')}"`;
  if (/<[^>]+@[^>]+>/.test(f)) return f;
  if (f.includes('@')) return `${q(appName || 'ProjectHub')} <${f}>`;
  return `${q(f || appName || 'ProjectHub')} <${smtp.user}>`;
};

// Простой адаптивный шаблон письма; стили внутри тегов — так их не вырезают почтовые клиенты
const wrap = ({ appName, html, footer }) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f4f2;padding:24px 12px;font:16px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#2f2e2b">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e7e3">
<div style="padding:18px 28px;border-bottom:1px solid #eeede9;font-weight:700;font-size:17px">${esc(appName || 'ProjectHub')}</div>
<div style="padding:24px 28px">${html}</div>
${footer ? `<div style="padding:14px 28px;border-top:1px solid #eeede9;color:#9b9a97;font-size:13px">${esc(footer)}</div>` : ''}
</div></body></html>`;

const toText = html => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const parseEmails = s => [...new Set(String(s || '').split(/[\s,;]+/).map(x => x.trim().replace(/^<|>$/g, '')).filter(x => EMAIL.test(x)).map(x => x.toLowerCase()))];

module.exports = { transport, from, wrap, toText, parseEmails, EMAIL };
