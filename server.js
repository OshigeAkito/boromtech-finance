import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { emailAllowed, readConfig } from './lib/config.js';
import { loadForecast, EXAMPLE_BANNER } from './lib/forecast.js';
import { createGoogleOidc } from './lib/google-oidc.js';
import { dashboardPage, loginPage, noAccessPage, notFoundPage } from './lib/pages.js';
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

const appDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_EXAMPLE_PATH = path.join(appDir, 'data', 'forecast.example.json');

export function createApp(options = {}) {
  const env = options.env ?? process.env;
  const config = readConfig(env);
  const oidc = options.oidc ?? createGoogleOidc();
  const now = options.now ?? (() => Date.now());
  const examplePath = options.examplePath ?? DEFAULT_EXAMPLE_PATH;
  const forecastPath = options.forecastPath ?? config.forecastPath;

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

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

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
    res.type('html').send(loginPage({ error: code }));
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
      console.error(`oauth begin failed: ${safeError(error, config.env.GOOGLE_CLIENT_SECRET)}`);
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
        res.status(403).type('html').send(noAccessPage({ email: shown }));
        return;
      }
      const name = claims && typeof claims.name === 'string' ? claims.name.slice(0, 200) : '';
      const token = signPayload({
        v: 1,
        kind: 'session',
        exp: now() + SESSION_MS,
        email,
        name,
      }, config.sessionSecret);
      res.cookie(SESSION_COOKIE, token, cookieOptions(config, SESSION_MS));
      res.redirect('/');
    } catch (error) {
      console.error(`oauth callback failed: ${safeError(error, config.env.GOOGLE_CLIENT_SECRET)}`);
      fail('auth');
    }
  });

  const logout = (req, res) => {
    res.clearCookie(SESSION_COOKIE, clearCookieOptions(config));
    res.clearCookie(OAUTH_COOKIE, clearCookieOptions(config));
    res.redirect('/login');
  };
  app.post('/auth/logout', logout);
  app.get('/auth/logout', logout);

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

  app.get('/api/forecast', (req, res) => {
    const session = readSession(req);
    if (!session) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const loaded = loadForecast({ forecastPath, examplePath });
      res.json({
        example: loaded.example,
        banner: loaded.example ? EXAMPLE_BANNER : null,
        forecast: loaded.data,
      });
    } catch (error) {
      console.error(`forecast load failed: ${error.code || 'error'}`);
      res.status(500).json({
        error: 'forecast_unavailable',
        message: 'The forecast file could not be read.',
      });
    }
  });

  app.get('/', (req, res) => {
    const session = readSession(req);
    if (!session) {
      res.redirect('/login');
      return;
    }
    try {
      const loaded = loadForecast({ forecastPath, examplePath });
      res.type('html').send(dashboardPage({
        forecast: loaded.data,
        example: loaded.example,
        email: session.email,
        name: session.name,
      }));
    } catch (error) {
      console.error(`forecast load failed: ${error.code || 'error'}`);
      res.status(500).type('html').send('<!doctype html><html lang="th"><meta charset="utf-8"><title>Error</title><p>ไม่สามารถอ่านไฟล์ประมาณการได้</p></html>');
    }
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
    if (!session) {
      res.redirect('/login');
      return;
    }
    res.status(404).type('html').send(notFoundPage());
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
    res.status(status).type('html').send('<!doctype html><html lang="th"><meta charset="utf-8"><title>Error</title><p>เกิดข้อผิดพลาดภายในระบบ</p></html>');
  });

  return app;

  function readSession(req) {
    const payload = verifyPayload(readCookie(req, SESSION_COOKIE), config.sessionSecret, now());
    if (!payload || payload.kind !== 'session' || typeof payload.email !== 'string') return null;
    if (!emailAllowed(config.allowlist, payload.email)) return null;
    return payload;
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

function safeError(error, secret) {
  const message = error && error.message ? String(error.message) : 'error';
  const redacted = secret ? message.split(secret).join('[redacted]') : message;
  return redacted.slice(0, 300);
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
  } else {
    try {
      const loaded = loadForecast({
        forecastPath: config.forecastPath,
        examplePath: DEFAULT_EXAMPLE_PATH,
      });
      console.log(loaded.example ? 'forecast source: example file' : 'forecast source: secret file');
    } catch {
      console.error('forecast file is not readable');
    }
  }
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`listening on ${port}`);
  });
}
