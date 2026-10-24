import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { pool } from './db.js';
import { safeEqualStrings, csrfToken } from './security.js';
import { AppError, listSquares, getSquare, publishSquare, issueOrReplaceCode, listAdminCodes, countPublished } from './services.js';

const PgStore = connectPgSimple(session);
export const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"],
    baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"]
  } },
  referrerPolicy: { policy: 'no-referrer' }
}));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(session({
  store: new PgStore({ pool, tableName: 'app_sessions', createTableIfMissing: false, pruneSessionInterval: 15 }),
  name: 'love.sid', secret: config.sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: config.nodeEnv === 'production', maxAge: 4 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(here, '../public'), { index: false, dotfiles: 'deny', maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));

const rateLimitHandler = (_req, res, _next, options) => res.status(options.statusCode).json({ error: 'RATE_LIMITED', message: 'تم تجاوز عدد الطلبات المسموح به. حاول مرة أخرى بعد قليل.' });

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false , handler: rateLimitHandler});
const publishLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false , handler: rateLimitHandler});
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false , handler: rateLimitHandler});
app.use('/api', apiLimiter);

const publishSchema = z.object({
  squareId: z.coerce.number().int().min(1).max(10000),
  code: z.string().trim().min(10).max(80).regex(/^[A-Fa-f0-9-]+$/),
  name: z.string().trim().min(1).max(50),
  story: z.string().trim().min(1).max(250)
}).strict();

function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function requireAdmin(req, res, next) {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'ADMIN_LOGIN_REQUIRED' });
  next();
}
function requireCsrf(req, res, next) {
  const token = req.get('x-csrf-token') || req.body?._csrf;
  if (!req.session?.csrfToken || typeof token !== 'string' || !safeEqualStrings(token, req.session.csrfToken)) {
    return res.status(403).json({ error: 'CSRF_INVALID' });
  }
  next();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

app.get('/healthz', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));

app.get('/api/squares', asyncRoute(async (req, res) => {
  const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    return res.status(400).json({ error: 'INVALID_PAGINATION' });
  }
  const publishedOnly = req.query.published === 'true';
  const squares = await listSquares({ limit, offset, publishedOnly });
  res.json({ squares, limit, offset });
}));
app.get('/api/squares/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 10000) return res.status(400).json({ error: 'INVALID_SQUARE_ID' });
  const square = await getSquare(id);
  if (!square) return res.status(404).json({ error: 'SQUARE_NOT_PUBLISHED' });
  res.json({ square });
}));
app.post('/api/publish', publishLimiter, asyncRoute(async (req, res) => {
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors });
  const result = await publishSquare({
    squareId: parsed.data.squareId,
    code: parsed.data.code.toUpperCase(),
    name: parsed.data.name,
    story: parsed.data.story
  });
  res.status(201).json({ ok: true, squareId: result.squareId });
}));

app.get('/admin/login', (_req, res) => res.type('html').send(loginPage()));
app.post('/admin/login', loginLimiter, asyncRoute(async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!safeEqualStrings(password, config.adminPassword)) {
    await new Promise(resolve => setTimeout(resolve, 250));
    return res.status(401).type('html').send(loginPage('بيانات الدخول غير صحيحة.'));
  }
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.isAdmin = true;
  req.session.csrfToken = csrfToken();
  res.redirect(303, '/admin');
}));
app.get('/admin', requireAdmin, asyncRoute(async (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = csrfToken();
  const [codes, publishedCount] = await Promise.all([listAdminCodes(), countPublished()]);
  res.type('html').send(adminPage(req.session.csrfToken, codes, publishedCount));
}));
app.post('/admin/codes', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const parsed = z.object({ squareId: z.coerce.number().int().min(1).max(10000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_SQUARE_ID' });
  const result = await issueOrReplaceCode(parsed.data.squareId, 'admin');
  res.status(201).json(result);
}));
app.post('/admin/logout', requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
  res.clearCookie('love.sid', { httpOnly: true, sameSite: 'strict', secure: config.nodeEnv === 'production' });
  res.redirect(303, '/admin/login');
}));

app.get('/', (_req, res) => res.type('html').send(homePage()));
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
app.use((err, req, res, _next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err?.code === '23505') return res.status(409).json({ error: 'CONFLICT', message: 'تعارض في البيانات؛ حدّث الصفحة وحاول مرة أخرى.' });
  if (err?.code === '23503' || err?.code === '23514') return res.status(400).json({ error: 'DATABASE_CONSTRAINT', message: 'البيانات لا تطابق شروط النظام.' });
  console.error('Request failed:', { method: req.method, path: req.path, message: err?.message });
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'حصل خطأ داخلي. حاول لاحقًا.' });
});

function loginPage(error = '') {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دخول الإدارة</title><link rel="stylesheet" href="/style.css"></head><body><main class="narrow"><h1>لوحة الإدارة</h1>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}<form method="post" action="/admin/login"><label>كلمة مرور الإدارة<input type="password" name="password" minlength="16" required autocomplete="current-password"></label><button>دخول</button></form></main></body></html>`;
}
function adminPage(csrf, codes, count) {
  const rows = codes.map(c => `<tr><td>${c.square_id}</td><td>${escapeHtml(c.code_hint)}</td><td>${c.is_used ? 'مستخدم' : c.is_revoked ? 'ملغي' : 'نشط'}</td><td>${new Date(c.created_at).toLocaleString('ar-EG')}</td></tr>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>لوحة الإدارة</title><link rel="stylesheet" href="/style.css"><script src="/admin.js" defer></script></head><body><main><div class="top"><h1>لوحة الإدارة</h1><form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${csrf}"><button class="secondary">تسجيل الخروج</button></form></div><p>القصص المنشورة: <strong>${count}</strong> / 10000</p><section class="panel"><h2>إصدار كود تفعيل</h2><p>إصدار كود جديد يلغي الأكواد القديمة غير المستخدمة لهذا المربع. الكود الكامل يظهر مرة واحدة فقط.</p><form id="issue-form"><input type="hidden" id="csrf" value="${csrf}"><label>رقم المربع (1–10000)<input id="squareId" type="number" min="1" max="10000" required></label><button>إصدار كود</button></form><pre id="issue-result" aria-live="polite"></pre></section><section class="panel"><h2>آخر الأكواد (آخر 200)</h2><div class="table-wrap"><table><thead><tr><th>المربع</th><th>آخر 8 أحرف</th><th>الحالة</th><th>تاريخ الإنشاء</th></tr></thead><tbody>${rows}</tbody></table></div></section></main></body></html>`;
}
function homePage() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="شارك قصة حبك في واحد من عشرة آلاف مربع."><title>10 آلاف قصة حب</title><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script></head><body><main><header><p class="eyebrow">حكاية من بين عشرة آلاف</p><h1>10 آلاف قصة حب</h1><p>اختار رقم المربع المكتوب على كود التفعيل، واكتب قصتك.</p>
<section class="panel">
  <h2>سعر القصة</h2>
  <p>سعر نشر القصة الواحدة: <strong>200 جنيه مصري</strong></p>
  <h2>الدفع والتواصل</h2>
  <p>رقم المحفظة: <strong dir="ltr">01558628114</strong></p>
  <p>واتساب للتواصل واستلام كود التفعيل:
    <a href="https://wa.me/201558628114" target="_blank" rel="noopener noreferrer" dir="ltr">01558628114</a>
  </p>
  <p>الدفع يدوي. بعد التحويل، تواصل عبر واتساب لتأكيد الدفع واستلام كود التفعيل.</p>
</section></header><section class="panel"><form id="publish-form"><label>رقم المربع<input name="squareId" type="number" min="1" max="10000" required></label><label>كود التفعيل<input name="code" autocomplete="off" required maxlength="80"></label><label>اسم يظهر مع القصة<input name="name" maxlength="50" required></label><label>قصتك (حتى 250 حرفًا)<textarea name="story" maxlength="250" rows="4" required></textarea></label><button>نشر القصة</button></form><p id="publish-result" aria-live="polite"></p></section><section><div class="top"><h2>القصص المنشورة</h2><button id="load-squares" class="secondary" type="button">تحديث</button></div><div id="squares" class="grid" aria-live="polite"></div><div class="top"><button id="load-more" class="secondary" type="button" hidden>تحميل المزيد</button></div></section></main></body></html>`;
}
