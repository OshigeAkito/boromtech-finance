import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server.js';
import { EXAMPLE_BANNER, projectMonths } from '../lib/forecast.js';
import { baseEnv, createFakeOidc, mergeCookies, signIn, withServer } from './helpers.js';

const examplePath = path.join(import.meta.dirname, '..', 'data', 'forecast.example.json');
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));

function appWith(extraEnv = {}, options = {}) {
  const oidc = options.oidc ?? createFakeOidc();
  const env = baseEnv({
    FORECAST_PATH: path.join(os.tmpdir(), 'missing-forecast-does-not-exist.json'),
    ...extraEnv,
  });
  return { app: createApp({ env, oidc, ...options.app }), oidc, env };
}

test('unauthenticated pages redirect and data endpoints return 401', async () => {
  const { app } = appWith();
  await withServer(app, async (base) => {
    const home = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(home.status, 302);
    assert.equal(new URL(home.headers.get('location'), base).pathname, '/login');

    const api = await fetch(`${base}/api/forecast`, { redirect: 'manual' });
    assert.equal(api.status, 401);
    assert.deepEqual(await api.json(), { error: 'unauthorized' });

    const otherApi = await fetch(`${base}/api/other`, { redirect: 'manual' });
    assert.equal(otherApi.status, 401);

    const login = await fetch(`${base}/login`);
    assert.equal(login.status, 200);
    const html = await login.text();
    assert.match(html, /เข้าสู่ระบบด้วย Google/);
    assert.equal(html.includes(example.company), false);
    assert.equal(html.includes('1,000,000.00'), false);
    assert.equal(html.includes('เงินทุนสิ้นเดือน'), false);
    assert.equal(html.includes('/dashboard-assets/dashboard.js'), false);

    const dash = await fetch(`${base}/dashboard`, { redirect: 'manual' });
    assert.equal(dash.status, 302);
    assert.equal(new URL(dash.headers.get('location'), base).pathname, '/login');

    const script = await fetch(`${base}/dashboard-assets/dashboard.js`, { redirect: 'manual' });
    assert.equal(script.status, 401);
    const scriptBody = await script.text();
    assert.equal(scriptBody.includes(example.company), false);
    assert.equal(scriptBody.includes('1,000,000.00'), false);

    const css = await fetch(`${base}/login-assets/login.css`);
    assert.equal(css.status, 200);
    assert.match(await css.text(), /font-family/);

    const hidden = await fetch(`${base}/data/forecast.example.json`, { redirect: 'manual' });
    assert.equal(hidden.status, 302);

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
  });
});

test('a disallowed or unverified email gets a Thai no-access page and no session', async () => {
  const { app } = appWith();
  await withServer(app, async (base) => {
    for (const code of ['denied', 'unverified', 'stringflag', 'noemail']) {
      const result = await signIn(base, code);
      assert.equal(result.callback.status, 403);
      const html = await result.callback.text();
      assert.match(html, /ยังไม่ได้รับสิทธิ์/);
      assert.equal(result.jar.includes('bt_session='), false);
      const api = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
      assert.equal(api.status, 401);
    }
  });
});

test('an allowed email can read the forecast, then log out', async () => {
  const { app, oidc } = appWith();
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    assert.equal(result.callback.status, 302);
    assert.equal(new URL(result.callback.headers.get('location'), base).pathname, '/');
    assert.equal(result.jar.includes('bt_session='), true);
    assert.equal(oidc.calls.complete.length, 1);
    assert.equal(oidc.calls.complete[0].state, result.state);
    assert.ok(oidc.calls.complete[0].nonce);
    assert.ok(oidc.calls.complete[0].codeVerifier);

    const api = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    assert.equal(api.status, 200);
    const body = await api.json();
    assert.equal(body.example, true);
    assert.equal(body.banner, EXAMPLE_BANNER);
    assert.equal(body.forecast.company, example.company);
    assert.equal(body.forecast.registeredCapital, example.registeredCapital);

    const page = await fetch(`${base}/`, { headers: { cookie: result.jar } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.equal(html.includes(EXAMPLE_BANNER), true);
    assert.match(html, /class="example-banner"/);
    assert.equal(html.includes(example.assumptions[0]), true);
    assert.equal(html.includes(example.notYetIncluded[0]), true);
    assert.equal(html.includes('investor@example.com'), true);
    assert.match(html, /เงินทุนสิ้นเดือน/);
    assert.match(html, /<script src="\/dashboard-assets\/dashboard\.js" defer><\/script>/);
    assert.equal(/<script(?![^>]*\bsrc=)/i.test(html), false);
    const csp = page.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.equal(/script-src[^;]*unsafe-inline/.test(csp), false);

    const script = await fetch(`${base}/dashboard-assets/dashboard.js`, { headers: { cookie: result.jar } });
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    const source = await script.text();
    assert.match(source, /expand-all/);
    assert.match(source, /aria-expanded/);
    assert.equal(source.includes(example.company), false);
    assert.equal(/\d{5,}/.test(source), false);

    const loggedOut = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: result.jar },
    });
    assert.equal(loggedOut.status, 302);
    const cleared = mergeCookies(result.jar, loggedOut);
    assert.equal(cleared.includes('bt_session='), false);
    const after = await fetch(`${base}/api/forecast`, { headers: { cookie: cleared } });
    assert.equal(after.status, 401);
  });
});

test('the example banner is shown only when the example file is served', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-'));
  const realFile = path.join(dir, 'forecast.json');
  const real = {
    company: 'บริษัท สมมติสอง จำกัด',
    currency: 'THB',
    registeredCapital: '3000000.00',
    openingCapital: {
      amount: '400000.00',
      sharePercent: 10,
      assumed: false,
      label: 'ทุนเปิดทดสอบ',
      timing: 'ต้นงวดทดสอบ',
    },
    fx: {
      base: 'USD',
      quote: 'THB',
      rate: '40.00',
      source: 'fixture',
      updatedAt: '2026-04-01',
      updatedDisplay: 'เมษายน 2026',
    },
    balanceFormula: 'previous + revenue - items',
    months: [
      {
        key: '2026-04',
        label: 'เม.ย.',
        labelFull: 'เมษายน 2026',
        revenue: '10000.00',
        items: [
          {
            group: 'test',
            groupName: 'กลุ่มทดสอบ',
            name: 'รายการทดสอบ',
            amount: '5000.00',
            assumed: false,
          },
        ],
      },
    ],
    assumptions: ['สมมติฐานสำหรับไฟล์ทดสอบ'],
    notYetIncluded: ['รายการที่ยังไม่ใส่ในไฟล์ทดสอบ'],
  };
  fs.writeFileSync(realFile, JSON.stringify(real));
  const { app } = appWith({ FORECAST_PATH: realFile });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const api = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    const body = await api.json();
    assert.equal(body.example, false);
    assert.equal(body.banner, null);
    assert.equal(body.forecast.company, real.company);
    const html = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.equal(html.includes(EXAMPLE_BANNER), false);
    assert.equal(html.includes('class="example-banner"'), false);
    assert.equal(html.includes(real.company), true);
  });

  const { app: exampleApp } = appWith({ FORECAST_PATH: examplePath });
  await withServer(exampleApp, async (base) => {
    const result = await signIn(base, 'allowed');
    const body = await (await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } })).json();
    assert.equal(body.example, true);
    assert.equal(body.banner, EXAMPLE_BANNER);
  });
});

test('a present but unreadable forecast does not fall open to silent success', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-bad-'));
  const file = path.join(dir, 'forecast.json');
  fs.writeFileSync(file, JSON.stringify({ company: 'MARKER_COMPANY_XYZ' }));
  const { app } = appWith({ FORECAST_PATH: file });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const api = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    assert.equal(api.status, 500);
    const text = await api.text();
    assert.equal(text.includes('MARKER_COMPANY_XYZ'), false);
    assert.equal(text.includes(EXAMPLE_BANNER), false);
  });
});

test('a signed-in user can open a forecast whose fx rate has five decimal places', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-fx-http-'));
  const file = path.join(dir, 'forecast.json');
  const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'schema-shape.json'), 'utf8'));
  data.fx.rate = '1.23456';
  fs.writeFileSync(file, JSON.stringify(data));
  const { app } = appWith({ FORECAST_PATH: file });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const home = await fetch(`${base}/`, { headers: { cookie: result.jar } });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.equal(html.includes('ไม่สามารถอ่านไฟล์ประมาณการได้'), false);
    assert.match(html, /แปลงดอลลาร์ที่ 1\.23456 บาท\/ดอลลาร์/);
    const api = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    assert.equal(api.status, 200);
    const body = await api.json();
    assert.equal(body.example, false);
    assert.equal(body.forecast.fx.rate, '1.23456');
    assert.equal(body.forecast.registeredCapital, '0.00');
  });
});

test('missing required env fails closed', async () => {
  let called = false;
  const oidc = {
    async begin() {
      called = true;
      throw new Error('should not run');
    },
    async complete() {
      called = true;
      throw new Error('should not run');
    },
  };
  const app = createApp({
    env: {
      GOOGLE_CLIENT_ID: 'visible-client-id-should-stay-out-of-the-body',
      ALLOWED_EMAILS: ' , ',
    },
    oidc,
  });
  await withServer(app, async (base) => {
    const health = await fetch(`${base}/health`, { redirect: 'manual' });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    for (const pathName of ['/api/forecast', '/', '/login', '/auth/google', '/login-assets/login.css']) {
      const response = await fetch(`${base}${pathName}`, { redirect: 'manual' });
      assert.equal(response.status, 503, pathName);
      const body = await response.json();
      assert.equal(body.error, 'misconfigured');
      assert.ok(body.missing.includes('GOOGLE_CLIENT_SECRET'));
      assert.ok(body.missing.includes('SESSION_SECRET'));
      assert.ok(body.missing.includes('ALLOWED_EMAILS'));
      assert.equal(body.missing.includes('GOOGLE_CLIENT_ID'), false);
      assert.equal(JSON.stringify(body).includes('visible-client-id-should-stay-out-of-the-body'), false);
    }
  });
  assert.equal(called, false);
});

test('redirect URI prefers BASE_URL, then RENDER_EXTERNAL_URL', async () => {
  const external = appWith({
    RENDER_EXTERNAL_URL: 'https://finance.example.onrender.com/',
  });
  await withServer(external.app, async (base) => {
    const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
    const redirect = new URL(start.headers.get('location')).searchParams.get('redirect_uri');
    assert.equal(redirect, 'https://finance.example.onrender.com/auth/google/callback');
  });

  const explicit = appWith({
    BASE_URL: 'https://finance.example.test',
    RENDER_EXTERNAL_URL: 'https://finance.example.onrender.com',
  });
  await withServer(explicit.app, async (base) => {
    const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
    const redirect = new URL(start.headers.get('location')).searchParams.get('redirect_uri');
    assert.equal(redirect, 'https://finance.example.test/auth/google/callback');
  });
});

test('production session cookies are httpOnly, secure, and sameSite=lax', async () => {
  const { app } = appWith({ NODE_ENV: 'production' });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const cookies = result.callback.headers.getSetCookie();
    const session = cookies.find((cookie) => cookie.startsWith('bt_session='));
    assert.ok(session);
    assert.match(session, /HttpOnly/i);
    assert.match(session, /Secure/);
    assert.match(session, /SameSite=Lax/i);
    assert.match(session, /Path=\//);
  });
});

test('expired, tampered, and cross-secret sessions are rejected', async () => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const oidc = createFakeOidc();
  const env = baseEnv({
    FORECAST_PATH: path.join(os.tmpdir(), 'missing-forecast-clock.json'),
  });
  const app = createApp({ env, oidc, now: () => clock });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    clock += 6 * 24 * 60 * 60 * 1000;
    const still = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    assert.equal(still.status, 200);
    clock += 2 * 24 * 60 * 60 * 1000;
    const expired = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    assert.equal(expired.status, 401);
  });

  const left = appWith({ SESSION_SECRET: 'left-session-secret-value' });
  const right = appWith({ SESSION_SECRET: 'right-session-secret-value' });
  let jar = '';
  await withServer(left.app, async (base) => {
    jar = (await signIn(base, 'allowed')).jar;
  });
  await withServer(right.app, async (base) => {
    const rejected = await fetch(`${base}/api/forecast`, { headers: { cookie: jar } });
    assert.equal(rejected.status, 401);
    const tampered = jar.replace(/.$/, (char) => (char === 'a' ? 'b' : 'a'));
    const bad = await fetch(`${base}/api/forecast`, { headers: { cookie: tampered } });
    assert.equal(bad.status, 401);
  });
});

test('a mismatched oauth state does not create a session', async () => {
  const { app, oidc } = appWith();
  await withServer(app, async (base) => {
    const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
    const jar = start.headers.getSetCookie()[0].split(';')[0];
    const callback = await fetch(`${base}/auth/google/callback?code=allowed&state=wrong-state`, {
      redirect: 'manual',
      headers: { cookie: jar },
    });
    assert.equal(callback.status, 302);
    assert.equal(new URL(callback.headers.get('location'), base).searchParams.get('error'), 'state');
    assert.equal(oidc.calls.complete.length, 0);
    const api = await fetch(`${base}/api/forecast`, { headers: { cookie: jar } });
    assert.equal(api.status, 401);
  });
});

test('forecast HTML escapes text from the file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-escape-'));
  const file = path.join(dir, 'forecast.json');
  const data = structuredClone(example);
  delete data.notice;
  data.company = '<script>alert(1)</script>';
  fs.writeFileSync(file, JSON.stringify(data));
  const { app } = appWith({ FORECAST_PATH: file });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const html = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.equal(html.includes('&lt;script&gt;'), true);
  });
});

test('example months project a running balance from opening capital', () => {
  const months = projectMonths(example);
  assert.equal(months[0].closingCents, 87000000n);
  assert.equal(months[1].closingCents, 80000000n);
  assert.equal(months[2].closingCents, 68000000n);
});
