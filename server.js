import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { newCsrfToken, tokensMatch } from './lib/csrf.js';
import { emailAllowed, readConfig } from './lib/config.js';
import { contentDisposition, validateUploads } from './lib/files.js';
import { createGoogleOidc } from './lib/google-oidc.js';
import { confirmedDelete, parseActual, parseItem, parseMonth, parseSettings } from './lib/input.js';
import { LANG_COOKIE, LANG_MAX_AGE_MS, normalizeLang, safeNext, tr } from './lib/i18n.js';
import { isUuid } from './lib/ids.js';
import {
  actualDetailPage,
  actualFormPage,
  actualListPage,
  capitalPage,
  emptyDashboardPage,
  incomePage,
  itemFormPage,
  logoutConfirmPage,
  messagePage,
  notConfiguredPage,
  plannedPage,
} from './lib/manage-pages.js';
import { parseMultipart } from './lib/multipart.js';
import { parseOfficeRoleAssignments, resolveOfficeRole } from './lib/office-access.js';
import { officeHomePage } from './lib/office-page.js';
import { dashboardPage, loginPage, noAccessPage, notFoundPage } from './lib/pages.js';
import { advanceFormPage } from './lib/reimburse-page.js';
import {
  SESSION_COOKIE,
  OAUTH_COOKIE,
  SESSION_MS,
  OAUTH_MS,
  signPayload,
  verifyPayload,
  readCookie,
  cookieOptions,
  clearCookieOptions,
} from './lib/session.js';
import { createSupabaseStore } from './lib/supabase-store.js';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const APP_ASSETS = {
  'manage.css': 'text/css; charset=utf-8',
  'print.css': 'text/css; charset=utf-8',
  'print.js': 'application/javascript; charset=utf-8',
};
const MULTIPART_LIMIT = 22 * 1024 * 1024;

export function createApp(options = {}) {
  const env = options.env ?? process.env;
  const config = readConfig(env);
  const oidc = options.oidc ?? createGoogleOidc();
  const now = options.now ?? (() => Date.now());
  const store = options.store ?? createSupabaseStore({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    fetch: options.fetchImpl,
  });
  const officeRoles = parseOfficeRoleAssignments(env.OFFICE_ROLES);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('etag', false);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    next();
  });

  // Render checks this before Google OAuth env vars exist. Keep it ahead of the gate below.
  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res, next) => {
    if (config.ok) {
      next();
      return;
    }
    res.status(503).json({
      error: 'misconfigured',
      message: `Server is not configured. Set required environment variables: ${config.missing.join(', ')}`,
      missing: config.missing,
    });
  });

  app.use(express.urlencoded({ extended: true, limit: '32kb', parameterLimit: 80 }));

  app.use('/login-assets', express.static(path.join(appDir, 'public', 'login'), {
    index: false,
    dotfiles: 'deny',
    redirect: false,
    fallthrough: false,
  }));

  app.get('/login', (req, res) => {
    if (readSession(req)) {
      res.redirect('/');
      return;
    }
    const code = req.query.error === 'state' || req.query.error === 'auth' ? req.query.error : '';
    res.type('html').send(loginPage({ error: code, lang: langOf(req) }));
  });

  // EN | TH switch. Works signed in or out; only same-site paths are followed.
  app.get('/lang/:code', (req, res) => {
    const lang = normalizeLang(req.params.code);
    res.cookie(LANG_COOKIE, lang, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: LANG_MAX_AGE_MS,
      path: '/',
    });
    res.redirect(303, safeNext(req.query.next));
  });

  app.get('/auth/google', async (req, res, next) => {
    try {
      const begun = await oidc.begin(config.env, { redirectUri: redirectUri(req) });
      if (!begun || typeof begun.url !== 'string' || !begun.state || !begun.nonce || !begun.codeVerifier) {
        throw new Error('invalid oauth begin');
      }
      const target = new URL(begun.url);
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        throw new Error('invalid oauth url');
      }
      const token = signPayload({
        v: 1,
        kind: 'oauth',
        exp: now() + OAUTH_MS,
        state: begun.state,
        nonce: begun.nonce,
        codeVerifier: begun.codeVerifier,
      }, config.sessionSecret);
      res.cookie(OAUTH_COOKIE, token, cookieOptions(config, OAUTH_MS));
      res.redirect(target.href);
    } catch (error) {
      console.error(`oauth begin failed: ${safeError(error, secrets())}`);
      next(Object.assign(new Error('oauth begin failed'), { status: 503 }));
    }
  });

  app.get('/auth/google/callback', async (req, res) => {
    const fail = (code) => {
      res.clearCookie(OAUTH_COOKIE, clearCookieOptions(config));
      res.redirect(`/login?error=${code}`);
    };
    try {
      if (typeof req.query.error === 'string' && req.query.error) {
        fail('auth');
        return;
      }
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const stateQuery = typeof req.query.state === 'string' ? req.query.state : '';
      const txn = verifyPayload(readCookie(req, OAUTH_COOKIE), config.sessionSecret, now());
      if (!code || !txn || txn.kind !== 'oauth' || txn.state !== stateQuery || !txn.nonce || !txn.codeVerifier) {
        fail('state');
        return;
      }
      const claims = await oidc.complete(config.env, {
        currentUrl: currentUrl(req),
        state: txn.state,
        nonce: txn.nonce,
        codeVerifier: txn.codeVerifier,
      });
      res.clearCookie(OAUTH_COOKIE, clearCookieOptions(config));
      const email = claims && typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
      const verified = Boolean(claims) && claims.email_verified === true;
      if (!verified || !emailAllowed(config.allowlist, email)) {
        const shown = claims && typeof claims.email === 'string' ? claims.email : '';
        res.status(403).type('html').send(noAccessPage({ email: shown, lang: langOf(req) }));
        return;
      }
      const name = claims && typeof claims.name === 'string' ? claims.name.slice(0, 200) : '';
      const token = signPayload({
        v: 1,
        kind: 'session',
        exp: now() + SESSION_MS,
        email,
        name,
        csrf: newCsrfToken(),
      }, config.sessionSecret);
      res.cookie(SESSION_COOKIE, token, cookieOptions(config, SESSION_MS));
      res.redirect('/');
    } catch (error) {
      console.error(`oauth callback failed: ${safeError(error, secrets())}`);
      fail('auth');
    }
  });

  app.get('/auth/logout', (req, res) => {
    const session = readSession(req);
    if (!session) {
      res.redirect('/login');
      return;
    }
    res.type('html').send(logoutConfirmPage({ session }));
  });

  app.post('/auth/logout', (req, res) => {
    const session = readSession(req);
    if (!session) {
      res.redirect('/login');
      return;
    }
    if (!csrfOk(req, session)) {
      rejectCsrf(res, session);
      return;
    }
    res.clearCookie(SESSION_COOKIE, clearCookieOptions(config));
    res.clearCookie(OAUTH_COOKIE, clearCookieOptions(config));
    res.redirect('/login');
  });

  const dashboardScript = path.join(appDir, 'public', 'dashboard', 'dashboard.js');
  app.get('/dashboard-assets/dashboard.js', (req, res) => {
    if (!readSession(req)) {
      res.status(401).type('text/plain').send('unauthorized');
      return;
    }
    res.type('application/javascript');
    res.sendFile(dashboardScript, (error) => {
      if (!error || res.headersSent) return;
      res.status(404).type('text/plain').send('not found');
    });
  });

  app.use('/office-assets', (req, res, next) => {
    if (!readSession(req)) {
      res.status(401).type('text/plain').send('unauthorized');
      return;
    }
    next();
  }, express.static(path.join(appDir, 'public', 'office'), {
    index: false,
    dotfiles: 'deny',
    redirect: false,
    fallthrough: false,
  }));

  app.get('/app-assets/:name', (req, res) => {
    if (!readSession(req)) {
      res.status(401).type('text/plain').send('unauthorized');
      return;
    }
    if (!Object.hasOwn(APP_ASSETS, req.params.name)) {
      res.status(404).type('text/plain').send('not found');
      return;
    }
    res.type(APP_ASSETS[req.params.name]);
    res.sendFile(path.join(appDir, 'public', 'app', req.params.name), (error) => {
      if (!error || res.headersSent) return;
      res.status(404).type('text/plain').send('not found');
    });
  });

  app.get('/api/forecast', async (req, res) => {
    const session = readSession(req);
    if (!session) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!store.configured) {
      res.status(503).json({ error: 'not_configured', message: 'Supabase is not configured.' });
      return;
    }
    try {
      const forecast = await store.loadForecast();
      if (!forecast) {
        res.status(404).json({ error: 'no_data', message: 'No forecast has been saved yet.' });
        return;
      }
      res.json({ example: false, banner: null, forecast });
    } catch {
      console.error('forecast read failed');
      res.status(500).json({
        error: 'forecast_unavailable',
        message: 'The forecast could not be read.',
      });
    }
  });

  app.get('/', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const forecast = await readForecast(req, res, session);
    if (forecast === undefined) return;
    if (!forecast) {
      res.type('html').send(emptyDashboardPage({ session }));
      return;
    }
    res.type('html').send(dashboardPage({
      forecast,
      example: false,
      email: session.email,
      name: session.name,
      csrf: session.csrf,
      lang: session.lang,
      path: session.path,
    }));
  });

  app.get('/capital', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const forecast = await readForecast(req, res, session);
    if (forecast === undefined) return;
    res.type('html').send(capitalPage({
      session,
      forecast,
      csrf: session.csrf,
      saved: req.query.saved === '1',
    }));
  });

  // Settings now live on the Capital page; keep old links and bookmarks working.
  app.get('/settings', (req, res) => {
    res.redirect(301, '/capital');
  });

  app.post(['/capital', '/settings'], async (req, res) => {
    const session = requireWrite(req, res);
    if (!session) return;
    const parsed = parseSettings(req.body || {}, session.lang);
    if (!parsed.ok) {
      const forecast = await readForecast(req, res, session);
      if (forecast === undefined) return;
      res.status(400).type('html').send(capitalPage({
        session,
        forecast,
        csrf: session.csrf,
        errors: parsed.errors,
        values: formValues(req.body),
      }));
      return;
    }
    try {
      await store.saveSettings(parsed.value);
      res.redirect(303, '/capital?saved=1');
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.get('/income', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const forecast = await readForecast(req, res, session);
    if (forecast === undefined) return;
    res.type('html').send(incomePage({
      session,
      forecast,
      csrf: session.csrf,
      saved: req.query.saved === '1',
    }));
  });

  app.get('/forecast', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const forecast = await readForecast(req, res, session);
    if (forecast === undefined) return;
    res.type('html').send(plannedPage({
      session,
      forecast,
      csrf: session.csrf,
      saved: req.query.saved === '1',
    }));
  });

  app.post('/forecast/months', async (req, res) => {
    const session = requireWrite(req, res);
    if (!session) return;
    const parsed = parseMonth(req.body || {}, session.lang);
    if (!parsed.ok) {
      const forecast = await readForecast(req, res, session);
      if (forecast === undefined) return;
      res.status(400).type('html').send(incomePage({
        session,
        forecast,
        csrf: session.csrf,
        errors: parsed.errors,
      }));
      return;
    }
    try {
      await store.createMonth(parsed.value);
      res.redirect(303, '/income?saved=1');
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.post('/forecast/months/:id', async (req, res) => {
    const session = requireWrite(req, res);
    if (!session) return;
    if (!isUuid(req.params.id)) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    const parsed = parseMonth(req.body || {}, session.lang);
    if (!parsed.ok) {
      const forecast = await readForecast(req, res, session);
      if (forecast === undefined) return;
      res.status(400).type('html').send(incomePage({
        session,
        forecast,
        csrf: session.csrf,
        errors: parsed.errors,
      }));
      return;
    }
    try {
      await store.updateMonth(req.params.id, parsed.value);
      res.redirect(303, '/income?saved=1');
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.post('/forecast/months/:id/delete', async (req, res) => {
    await deleteById(req, res, (id) => store.deleteMonth(id), '/income?saved=1');
  });

  app.get('/forecast/items/new', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const forecast = await readForecast(req, res, session);
    if (forecast === undefined) return;
    const monthId = isUuid(req.query.month) ? req.query.month : '';
    res.type('html').send(itemFormPage({ session, forecast, csrf: session.csrf, monthId }));
  });

  app.post('/forecast/items', async (req, res) => {
    const session = requireWrite(req, res);
    if (!session) return;
    const parsed = parseItem(req.body || {}, session.lang);
    if (!parsed.ok) {
      const forecast = await readForecast(req, res, session);
      if (forecast === undefined) return;
      res.status(400).type('html').send(itemFormPage({
        session,
        forecast,
        csrf: session.csrf,
        errors: parsed.errors,
        values: formValues(req.body),
      }));
      return;
    }
    try {
      await store.createItem(parsed.value);
      res.redirect(303, '/forecast?saved=1');
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.get('/forecast/items/:id', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const forecast = await readForecast(req, res, session);
    if (forecast === undefined) return;
    const item = findItem(forecast, req.params.id);
    if (!item) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    res.type('html').send(itemFormPage({ session, forecast, csrf: session.csrf, item }));
  });

  app.post('/forecast/items/:id', async (req, res) => {
    const session = requireWrite(req, res);
    if (!session) return;
    if (!isUuid(req.params.id)) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    const parsed = parseItem(req.body || {}, session.lang);
    const forecast = await readForecast(req, res, session);
    if (forecast === undefined) return;
    const item = findItem(forecast, req.params.id);
    if (!item) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    if (!parsed.ok) {
      res.status(400).type('html').send(itemFormPage({
        session,
        forecast,
        csrf: session.csrf,
        item,
        errors: parsed.errors,
        values: formValues(req.body),
      }));
      return;
    }
    try {
      await store.updateItem(req.params.id, parsed.value);
      res.redirect(303, '/forecast?saved=1');
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.post('/forecast/items/:id/delete', async (req, res) => {
    await deleteById(req, res, (id) => store.deleteItem(id), '/forecast?saved=1');
  });

  app.get('/actual', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    if (!(await ensureStore(req, res, session))) return;
    try {
      const expenses = await store.listActual();
      res.type('html').send(actualListPage({
        session,
        expenses,
        csrf: session.csrf,
        saved: req.query.saved === '1',
      }));
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.get('/actual/new', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    if (!(await ensureStore(req, res, session))) return;
    let prefix = 'EXP';
    try {
      const forecast = await store.loadForecast();
      if (forecast?.documentPrefix) prefix = forecast.documentPrefix;
    } catch {
      prefix = 'EXP';
    }
    res.type('html').send(actualFormPage({ session, csrf: session.csrf, prefix }));
  });

  app.post('/actual', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    if (!(await ensureStore(req, res, session))) return;
    const uploaded = await readMultipart(req, res, session);
    if (!uploaded) return;
    if (!tokensMatch(session.csrf, uploaded.fields.csrf || '')) {
      rejectCsrf(res, session);
      return;
    }
    const parsed = parseActual(uploaded.fields, session.lang);
    const files = validateUploads(uploaded.files, { required: true, lang: session.lang });
    const errors = [
      ...(parsed.ok ? [] : parsed.errors),
      ...files.errors.map((message) => ({ message })),
    ];
    if (errors.length) {
      res.status(400).type('html').send(actualFormPage({
        session,
        csrf: session.csrf,
        errors,
        values: uploaded.fields,
      }));
      return;
    }
    try {
      const created = await store.createActual({ ...parsed.value, createdBy: session.email }, files.files);
      res.redirect(303, `/actual/${created.id}?saved=1`);
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.get('/actual/:id', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    if (!isUuid(req.params.id)) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    if (!(await ensureStore(req, res, session))) return;
    try {
      const expense = await store.getActual(req.params.id);
      if (!expense) {
        res.status(404).type('html').send(notFoundPage(langOf(req)));
        return;
      }
      res.type('html').send(actualDetailPage({
        session,
        expense,
        csrf: session.csrf,
        saved: req.query.saved === '1',
      }));
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.post('/actual/:id', async (req, res) => {
    const session = requireWrite(req, res);
    if (!session) return;
    if (!isUuid(req.params.id)) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    const parsed = parseActual(req.body || {}, session.lang);
    if (!parsed.ok) {
      const expense = await store.getActual(req.params.id);
      if (!expense) {
        res.status(404).type('html').send(notFoundPage(langOf(req)));
        return;
      }
      res.status(400).type('html').send(actualDetailPage({
        session,
        expense,
        csrf: session.csrf,
        errors: parsed.errors,
        values: formValues(req.body),
      }));
      return;
    }
    try {
      await store.updateActual(req.params.id, parsed.value);
      res.redirect(303, `/actual/${req.params.id}?saved=1`);
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  app.post('/actual/:id/delete', async (req, res) => {
    await deleteById(req, res, (id) => store.deleteActual(id), '/actual?saved=1');
  });

  app.get('/actual/:id/files/:fileId', async (req, res) => {
    const session = readSession(req);
    if (!session) {
      res.status(401).type('text/plain').send('unauthorized');
      return;
    }
    if (!store.configured) {
      res.status(404).type('text/plain').send('not found');
      return;
    }
    try {
      const file = await store.readReceipt(req.params.id, req.params.fileId);
      if (!file || !RECEIPT_TYPES.has(file.contentType)) {
        res.status(404).type('text/plain').send('not found');
        return;
      }
      res.set('Content-Type', file.contentType);
      res.set('Content-Length', String(file.bytes.length));
      res.set('Content-Disposition', contentDisposition(file.filename));
      res.end(file.bytes);
    } catch {
      console.error('receipt read failed');
      res.status(500).type('text/plain').send('error');
    }
  });

  app.get('/actual/:id/form', async (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    if (!isUuid(req.params.id)) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    if (!(await ensureStore(req, res, session))) return;
    try {
      const expense = await store.getActual(req.params.id);
      if (!expense) {
        res.status(404).type('html').send(notFoundPage(langOf(req)));
        return;
      }
      let company = '';
      try {
        const forecast = await store.loadForecast();
        company = forecast?.company || '';
      } catch {
        company = '';
      }
      res.type('html').send(advanceFormPage({ expense, company }));
    } catch (error) {
      sendStoreError(res, session, error);
    }
  });

  // Reimbursement forms are printed from each actual expense now.
  app.get('/reimburse', (req, res) => {
    res.redirect(301, '/actual');
  });

  // Sample Office Portal home. Figures are fixtures; role comes from OFFICE_ROLES.
  app.get('/office', (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const role = resolveOfficeRole(session.email, officeRoles);
    res.type('html').send(officeHomePage({ role, csrf: session.csrf }));
  });

  app.use((req, res) => {
    const session = readSession(req);
    if (req.path.startsWith('/api/')) {
      if (!session) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (req.path.startsWith('/dashboard-assets/') || req.path.startsWith('/app-assets/')) {
      res.status(401).type('text/plain').send('unauthorized');
      return;
    }
    if (!session) {
      res.redirect('/login');
      return;
    }
    res.status(404).type('html').send(notFoundPage(langOf(req)));
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const status = Number(err.status || err.statusCode) || 500;
    if (status >= 500) console.error('request failed');
    if (status === 503) {
      res.status(503).json({
        error: 'misconfigured',
        message: 'Could not start Google sign-in. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and outbound access to accounts.google.com.',
      });
      return;
    }
    res.status(status).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Error</title><p>Something went wrong on the server.</p></html>');
  });

  return app;

  function secrets() {
    return [config.env.GOOGLE_CLIENT_SECRET, config.supabaseServiceRoleKey];
  }

  function readSession(req) {
    const payload = verifyPayload(readCookie(req, SESSION_COOKIE), config.sessionSecret, now());
    if (!payload || payload.kind !== 'session' || typeof payload.email !== 'string') return null;
    if (!emailAllowed(config.allowlist, payload.email)) return null;
    return payload;
  }

  function langOf(req) {
    return normalizeLang(readCookie(req, LANG_COOKIE));
  }

  // Signed-in pages get the visitor's language and the current path (for the EN | TH switch).
  function requireUser(req, res) {
    const session = readSession(req);
    if (session) return { ...session, lang: langOf(req), path: req.originalUrl };
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    res.redirect('/login');
    return null;
  }

  function requireWrite(req, res) {
    const session = requireUser(req, res);
    if (!session) return null;
    if (!store.configured) {
      res.status(200).type('html').send(notConfiguredPage({ session }));
      return null;
    }
    if (!csrfOk(req, session)) {
      rejectCsrf(res, session);
      return null;
    }
    return session;
  }

  function csrfOk(req, session) {
    const header = req.get('x-csrf-token');
    const bodyToken = req.body && typeof req.body.csrf === 'string' ? req.body.csrf : '';
    return tokensMatch(session.csrf, header || bodyToken);
  }

  function rejectCsrf(res, session) {
    const L = tr(session.lang);
    res.status(403).type('html').send(messagePage({
      session,
      title: L('Request rejected', 'คำขอถูกปฏิเสธ'),
      message: L('The form token is not valid. Reload the page and try again.', 'โทเคนยืนยันไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง'),
    }));
  }

  async function ensureStore(req, res, session) {
    if (store.configured) return true;
    if (req.path.startsWith('/api/')) {
      res.status(503).json({ error: 'not_configured', message: 'Supabase is not configured.' });
    } else {
      res.status(200).type('html').send(notConfiguredPage({ session }));
    }
    return false;
  }

  async function readForecast(req, res, session) {
    if (!(await ensureStore(req, res, session))) return undefined;
    try {
      return await store.loadForecast();
    } catch {
      console.error('forecast read failed');
      if (req.path.startsWith('/api/')) {
        res.status(500).json({ error: 'forecast_unavailable', message: 'The forecast could not be read.' });
      } else {
        res.status(500).type('html').send(messagePage({
          session,
          title: tr(session.lang)('Could not read data', 'อ่านข้อมูลไม่สำเร็จ'),
          message: tr(session.lang)('The data could not be read. Please try again.', 'ระบบอ่านข้อมูลไม่สำเร็จ กรุณาลองใหม่'),
        }));
      }
      return undefined;
    }
  }

  function sendStoreError(res, session, error) {
    const L = tr(session.lang);
    if (error && error.code === 'NOT_FOUND') {
      res.status(404).type('html').send(notFoundPage(session.lang));
      return;
    }
    if (error && error.code === 'CONFLICT') {
      res.status(409).type('html').send(messagePage({
        session,
        title: L('Already exists', 'ข้อมูลซ้ำ'),
        message: L('That month or code already exists.', 'มีเดือนหรือรหัสนี้อยู่แล้ว'),
      }));
      return;
    }
    console.error('store failed');
    res.status(500).type('html').send(messagePage({
      session,
      title: L('Not saved', 'บันทึกไม่สำเร็จ'),
      message: L('The data could not be read or saved. Please try again.', 'ระบบอ่านหรือบันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่'),
    }));
  }

  async function deleteById(req, res, remove, nextUrl) {
    const session = requireWrite(req, res);
    if (!session) return;
    if (!isUuid(req.params.id)) {
      res.status(404).type('html').send(notFoundPage(langOf(req)));
      return;
    }
    if (!confirmedDelete(req.body || {})) {
      res.status(400).type('html').send(messagePage({
        session,
        title: tr(session.lang)('Not confirmed', 'ยังไม่ได้ยืนยัน'),
        message: tr(session.lang)('Tick the confirmation box before deleting.', 'ติ๊กยืนยันการลบก่อนจึงจะลบได้'),
      }));
      return;
    }
    try {
      await remove(req.params.id);
      res.redirect(303, nextUrl);
    } catch (error) {
      sendStoreError(res, session, error);
    }
  }

  async function readMultipart(req, res, session) {
    const L = tr(session.lang);
    const type = req.get('content-type') || '';
    if (!type.toLowerCase().startsWith('multipart/form-data')) {
      res.status(415).type('html').send(actualFormPage({
        session,
        csrf: session.csrf,
        errors: [{ message: L('The form must be sent with attachments', 'ต้องส่งแบบฟอร์มแบบไฟล์แนบ') }],
      }));
      return null;
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MULTIPART_LIMIT) {
          res.status(413).type('html').send(actualFormPage({
            session,
            csrf: session.csrf,
            errors: [{ message: L('The attachments are too large', 'ไฟล์แนบใหญ่เกินไป') }],
          }));
          return null;
        }
        chunks.push(chunk);
      }
    } catch {
      res.status(400).type('html').send(actualFormPage({
        session,
        csrf: session.csrf,
        errors: [{ message: L('The attachments could not be read', 'อ่านไฟล์แนบไม่สำเร็จ') }],
      }));
      return null;
    }
    try {
      return parseMultipart(Buffer.concat(chunks), type);
    } catch (error) {
      const message = error && error.code === 'FILE_TOO_LARGE'
        ? L('Each file must be 5 MB or less', 'แต่ละไฟล์ต้องไม่เกิน 5 MB')
        : L('The attachments could not be read', 'อ่านไฟล์แนบไม่สำเร็จ');
      res.status(400).type('html').send(actualFormPage({
        session,
        csrf: session.csrf,
        errors: [{ message }],
      }));
      return null;
    }
  }

  function publicBase(req) {
    if (config.baseUrl) return config.baseUrl;
    return `${req.protocol}://${req.get('host')}`;
  }

  function redirectUri(req) {
    return `${publicBase(req)}/auth/google/callback`;
  }

  function currentUrl(req) {
    return new URL(req.originalUrl, `${publicBase(req)}/`);
  }
}

function findItem(forecast, id) {
  if (!forecast || !isUuid(id)) return null;
  for (const month of forecast.months) {
    const item = month.items.find((entry) => entry.id === id);
    if (item) return { ...item, monthId: month.id };
  }
  return null;
}

function formValues(body) {
  const values = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (typeof value === 'string') values[key] = value;
    else if (Array.isArray(value)) values[key] = value.filter((item) => typeof item === 'string');
  }
  return values;
}

function safeError(error, secretList) {
  let message = error && error.message ? String(error.message) : 'error';
  for (const secret of secretList) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  return message.slice(0, 300);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const config = readConfig(process.env);
  if (!config.ok) {
    console.error(`refusing traffic until configured: ${config.missing.join(', ')}`);
  }
  const source = createSupabaseStore({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  });
  console.log(source.configured ? 'data source: supabase' : 'data source: not configured');
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`listening on ${port}`);
  });
}
