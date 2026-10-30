import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createMemoryStore } from '../lib/memory-store.js';
import { officeHomePage } from '../lib/office-page.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, csrfFrom, mergeCookies, signIn, withServer } from './helpers.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));

function page(role) {
  return officeHomePage({ role, csrf: 'csrf-token' });
}

test('executive home shows the sample cashflow and advance rules', () => {
  const html = page('founder');
  assert.match(html, /data-role="founder"/);
  assert.match(html, /data-finance-scope="company"/);
  assert.match(html, /data-example="true"/);
  assert.match(html, /สวัสดีตอนเช้า คุณ \(ชื่อผู้ใช้\)/);
  assert.match(html, /id="cashflow"/);
  assert.match(html, /฿1,250,000/);
  assert.match(html, /฿860,000/);
  assert.match(html, /฿320,000/);
  assert.match(html, /฿390,000/);
  assert.match(html, /฿8,500/);
  assert.match(html, /฿24,000/);
  assert.match(html, /฿120,000/);
  assert.match(html, /฿95,000/);
  assert.equal((html.match(/badge-example/g) || []).length >= 9, true);
  assert.match(html, /เห็นเฉพาะผู้บริหาร \(ผู้ก่อการ · กรรมการ\)/);
  assert.match(html, /เกณฑ์อนุมัติทดรองจ่าย/);
  assert.match(html, /เกิน 10,000 บาท: ลงนามครบ 2 คน/);
  assert.match(html, /ไม่เกิน 10,000 บาท: ลงนาม 1 คน/);
  assert.match(html, /อนุมัติตัวเองไม่ได้/);
  assert.match(html, /รอคุณอนุมัติ · 0 รายการ/);
  assert.match(html, /data-approver-count="1"/);
  assert.match(html, /data-approver-count="2"/);
  assert.match(html, /ดาวน์โหลดแบบฟอร์มทดรองจ่าย \(PDF\)/);
  assert.match(html, /disabled/);
  assert.equal(html.includes('freelance'), false);
  assert.equal(html.includes('@'), false);
  assert.match(html, />ลา</);
  assert.match(html, />การเงิน</);
  assert.equal((html.match(/class="btn btn-primary"/g) || []).length, 1);
  assert.match(html, /Expert A \(ตัวอย่าง\)/);
  assert.match(html, /action="\/auth\/logout"/);
});

test('directors see cashflow; employees and Experts do not see company figures', () => {
  const director = page('director');
  assert.match(director, /id="cashflow"/);
  assert.match(director, /฿1,250,000/);

  for (const role of ['employee', 'expert']) {
    const html = page(role);
    assert.equal(html.includes('id="cashflow"'), false, role);
    assert.equal(html.includes('฿1,250,000'), false, role);
    assert.equal(html.includes('฿860,000'), false, role);
    assert.equal(html.includes('฿390,000'), false, role);
    assert.match(html, /เห็นเฉพาะผู้บริหาร/);
    assert.match(html, /ทดรองจ่าย/);
  }
  assert.match(page('employee'), /พนักงานเห็นเฉพาะใบเบิกของตนเอง/);
  assert.match(page('expert'), /Expert เห็นเฉพาะสถานะการจ่ายของตนเอง/);
  assert.equal(page('expert').includes('freelance'), false);
});

test('office home is behind the existing login and roles do not bypass the allowlist', async () => {
  const app = createApp({
    env: baseEnv({
      OFFICE_ROLES: 'investor@example.com:employee, stranger@example.com:founder',
    }),
    oidc: createFakeOidc(),
    store: createMemoryStore(example),
  });
  await withServer(app, async (base) => {
    const anon = await fetch(`${base}/office`, { redirect: 'manual' });
    assert.equal(anon.status, 302);
    assert.equal(new URL(anon.headers.get('location'), base).pathname, '/login');

    const asset = await fetch(`${base}/office-assets/office.css`, { redirect: 'manual' });
    assert.equal(asset.status, 401);

    const denied = await signIn(base, 'denied');
    assert.equal(denied.callback.status, 403);

    const signed = await signIn(base, 'allowed');
    const home = await fetch(`${base}/office`, { headers: { cookie: signed.jar } });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /data-role="employee"/);
    assert.equal(html.includes('฿1,250,000'), false);
    assert.match(html, /หน้าหลัก/);

    const css = await fetch(`${base}/office-assets/office.css`, { headers: { cookie: signed.jar } });
    assert.equal(css.status, 200);
    const styles = await css.text();
    assert.match(styles, /--bt-night-900:\s*#1e2235/);
    assert.match(styles, /--bt-orange-500:\s*#e56e3f/);
    assert.match(styles, /--bt-gray-100:\s*#eceef2/);
    assert.match(styles, /\.bt-display-th/);
    assert.match(styles, /\.bt-number-large/);
    assert.match(styles, /IBM Plex Sans Thai/);
    assert.match(styles, /Bricolage Grotesque/);

    const font = await fetch(`${base}/office-assets/fonts/plex-400-thai.woff2`, { headers: { cookie: signed.jar } });
    assert.equal(font.status, 200);
    assert.match(font.headers.get('content-type') || '', /font\/woff2/);

    const icon = await fetch(`${base}/office-assets/icons/home.svg`, { headers: { cookie: signed.jar } });
    assert.equal(icon.status, 200);
    assert.match(await icon.text(), /<svg/);

    const dashboard = await fetch(`${base}/`, { headers: { cookie: signed.jar } });
    assert.equal(dashboard.status, 200);
    const dash = await dashboard.text();
    assert.match(dash, /Funding forecast|ประมาณการเงินทุน/);
    assert.equal(dash.includes('สรุปกระแสเงินสด'), false);
  });
});

test('executives see real cashflow figures from the forecast and actual expenses', async () => {
  const store = createMemoryStore(example);
  await store.createActual({
    spentOn: '2026-01-15', itemName: 'ค่าโดเมนทดสอบ', category: 'domain', categoryOther: '', vendor: 'ผู้ขาย',
    periodNone: true, periodText: '', periodFrom: null, periodTo: null, amount: '1500.50', vatMode: 'excluded',
    foreignCurrency: '', foreignAmount: null, foreignRate: null, payer: 'ผู้ก่อการ A', paymentMethods: ['card'],
    paymentOther: '', receiptNo: 'R-1', receiptName: 'company', receiptNameOther: '', transferRights: false,
    transferAsset: '', note: '', createdBy: 'investor@example.com',
  }, []);
  let reads = 0;
  const counted = { ...store, configured: true, loadForecast: (...args) => { reads += 1; return store.loadForecast(...args); } };
  const env = baseEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
  const app = createApp({ env, oidc: createFakeOidc(), store: counted, now: () => Date.parse('2026-02-10T03:00:00Z') });
  await withServer(app, async (base) => {
    const signed = await signIn(base, 'allowed');
    const html = await (await fetch(`${base}/office`, { headers: { cookie: signed.jar } })).text();
    assert.match(html, /data-example="false"/);
    // Income and planned spend are forecasts; paid spend and the balance are actual.
    assert.match(html, /รายรับ<\/p>\s*<p class="bt-number-large">฿50,000<\/p>/);
    assert.match(html, /รายจ่ายยอดจริง<\/p>\s*<p class="bt-number-large">฿1,500\.50<\/p>/);
    assert.match(html, /รายจ่ายยอดคาดการณ์<\/p>\s*<p class="bt-number-large">฿370,000<\/p>/);
    assert.match(html, /ยอดคงเหลือ<\/p>\s*<p class="bt-number-large">฿998,499\.50<\/p>/);
    assert.match(html, /ประมาณการ มกราคม 2569 – มีนาคม 2569 · 3 เดือน/);
    assert.match(html, /ค่าโดเมนทดสอบ · ทดรองจ่ายโดย ผู้ก่อการ A/);
    assert.equal(html.includes('฿1,250,000'), false);
    // January is past on 10 Feb 2026, so the planned rows start in February.
    assert.match(html, /<p class="bt-body-small expense-month">ก\.พ\.<\/p>/);
    assert.match(html, /<a class="nav-item" href="\/"[^>]*>.*การเงิน/s);
    assert.match(html, /<a class="btn btn-primary" href="\/actual\/new">/);
    assert.match(html, /href="\/">ดูแดชบอร์ดการเงิน<\/a>/);
    assert.equal(reads, 1);
  });

  const employeeApp = createApp({
    env: { ...env, OFFICE_ROLES: 'investor@example.com:employee' },
    oidc: createFakeOidc(),
    store: counted,
  });
  await withServer(employeeApp, async (base) => {
    const signed = await signIn(base, 'allowed');
    const html = await (await fetch(`${base}/office`, { headers: { cookie: signed.jar } })).text();
    assert.equal(html.includes('id="cashflow"'), false);
    assert.equal(reads, 1, 'company figures are not read for an employee');
  });
});

test('without a database the cashflow card keeps the sample figures', async () => {
  const app = createApp({ env: baseEnv(), oidc: createFakeOidc(), store: { configured: false } });
  await withServer(app, async (base) => {
    const signed = await signIn(base, 'allowed');
    const html = await (await fetch(`${base}/office`, { headers: { cookie: signed.jar } })).text();
    assert.match(html, /data-example="true"/);
    assert.match(html, /฿1,250,000/);
  });
});

test('office home names the signed-in person and signs out from a visible sidebar button', async () => {
  const app = createApp({
    env: baseEnv({ OFFICE_ROLES: 'investor@example.com:director' }),
    oidc: createFakeOidc(),
    store: createMemoryStore(example),
  });
  await withServer(app, async (base) => {
    const signed = await signIn(base, 'allowed');
    const html = await (await fetch(`${base}/office`, { headers: { cookie: signed.jar } })).text();
    assert.match(html, /สวัสดี คุณExample Investor/);
    assert.match(html, /class="bt-body-strong user-name">Example Investor</);
    assert.match(html, /class="bt-body-small user-role">กรรมการ</);
    assert.equal(html.includes('(ชื่อผู้ใช้)'), false);
    assert.equal(html.includes('บทบาท (ตัวอย่าง)'), false);

    const sidebar = html.match(/<aside class="sidebar">[\s\S]*?<\/aside>/)[0];
    assert.match(sidebar, /<form class="sign-out" method="post" action="\/auth\/logout">[\s\S]*?>ออกจากระบบ<\/button><\/form>/);
    assert.equal((html.match(/action="\/auth\/logout"/g) || []).length, 1);

    const styles = await (await fetch(`${base}/office-assets/office.css`, { headers: { cookie: signed.jar } })).text();
    const rule = styles.match(/\.sign-out \{[^}]*\}/)[0];
    assert.equal(/clip|width: 1px|position: absolute/.test(rule), false);

    const out = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: signed.jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: csrfFrom(sidebar) }),
    });
    assert.equal(out.status, 302);
    assert.equal(out.headers.get('location'), '/login');
    assert.equal(mergeCookies(signed.jar, out).includes('bt_session='), false);
  });
});

test('office home without a signed-in person keeps the sample card', () => {
  const html = page('founder');
  assert.match(html, /ชื่อผู้ใช้ \(ตัวอย่าง\)/);
  assert.match(html, /สวัสดีตอนเช้า คุณ \(ชื่อผู้ใช้\)/);
});
