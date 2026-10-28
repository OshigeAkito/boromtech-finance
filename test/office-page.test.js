import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createMemoryStore } from '../lib/memory-store.js';
import { buildOfficeLedger } from '../lib/office-ledger.js';
import { officeHomePage } from '../lib/office-page.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, csrfFrom, signIn, withServer } from './helpers.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));

function ledgerFor(role, email = 'boss@example.com') {
  return buildOfficeLedger({
    forecast: {
      months: [{
        id: '11111111-1111-4111-8111-111111111111',
        key: '2026-10',
        label: 'ต.ค.',
        revenue: '100.00',
        items: [{
          id: '22222222-2222-4222-8222-222222222222',
          name: 'รายการคาดการณ์ทดสอบ',
          amount: '40.00',
          payer: 'ผู้ทดสอบ A',
          advance: true,
          createdBy: 'staff@example.com',
        }],
      }],
    },
    actuals: [{
      id: '33333333-3333-4333-8333-333333333333',
      itemName: 'รายการจริงทดสอบ',
      amount: '25.50',
      payer: 'ผู้ทดสอบ B',
      advance: true,
      createdBy: 'boss@example.com',
      spentOn: '2026-10-02',
    }],
    role,
    email,
    approver: { email, name: 'ผู้ทดสอบ' },
  });
}

function page(role, ledger = ledgerFor(role)) {
  return officeHomePage({ role, csrf: 'csrf-token', ledger, name: '' });
}

test('executive home shows recorded totals and not the old sample figures', () => {
  const html = page('founder');
  assert.match(html, /data-role="founder"/);
  assert.match(html, /data-ledger="live"/);
  assert.match(html, /สวัสดีตอนเช้า คุณ \(ชื่อผู้ใช้\)/);
  assert.match(html, /id="cashflow"/);
  assert.match(html, /฿100\.00/);
  assert.match(html, /฿25\.50/);
  assert.match(html, /฿40\.00/);
  assert.match(html, /฿74\.50/);
  assert.equal(html.includes('฿1,250,000'), false);
  assert.equal(html.includes('badge-example'), false);
  assert.match(html, /ยอดจากข้อมูลที่บันทึกในระบบ/);
  assert.match(html, /เกณฑ์อนุมัติทดรองจ่าย/);
  assert.match(html, /เกิน 10,000 บาท: ลงนามครบ 2 คน/);
  assert.match(html, /ไม่เกิน 10,000 บาท: ลงนาม 1 คน/);
  assert.match(html, /อนุมัติตัวเองไม่ได้/);
  assert.match(html, /data-approver-count="1"/);
  assert.match(html, /href="\/actual\/33333333-3333-4333-8333-333333333333\/form"/);
  assert.equal(html.includes('freelance'), false);
  assert.equal(html.includes('@'), false);
  assert.match(html, />ลา</);
  assert.match(html, />การเงิน</);
  assert.match(html, /href="\/office\/expenses\/new"/);
  assert.match(html, /Expert A \(ตัวอย่าง\)/);
  assert.match(html, /action="\/auth\/logout"/);
});

test('an empty ledger has an empty state and no sample money', () => {
  const empty = buildOfficeLedger({
    forecast: null,
    actuals: [],
    role: 'founder',
    email: 'boss@example.com',
    approver: { email: 'boss@example.com', name: '' },
  });
  const html = page('founder', empty);
  assert.match(html, /data-ledger="empty"/);
  assert.match(html, /ยังไม่มีรายรับหรือรายจ่ายที่บันทึก/);
  assert.equal(html.includes('฿1,250,000'), false);
  assert.equal(html.includes('฿100.00'), false);
  assert.match(html, /รอคุณอนุมัติ · 0 รายการ/);
});

test('directors see cashflow; employees and Experts do not see company figures', () => {
  const director = page('director');
  assert.match(director, /id="cashflow"/);
  assert.match(director, /฿100\.00/);

  for (const role of ['employee', 'expert']) {
    const html = page(role, ledgerFor(role, 'staff@example.com'));
    assert.equal(html.includes('id="cashflow"'), false, role);
    assert.equal(html.includes('฿100.00'), false, role);
    assert.equal(html.includes('฿25.50'), false, role);
    assert.match(html, /เห็นเฉพาะผู้บริหาร/);
    assert.match(html, /ทดรองจ่าย/);
    assert.match(html, /฿40\.00/);
  }
  assert.match(page('employee', ledgerFor('employee', 'staff@example.com')), /พนักงานเห็นเฉพาะใบเบิกของตนเอง/);
  assert.match(page('expert', ledgerFor('expert', 'staff@example.com')), /Expert เห็นเฉพาะสถานะการจ่ายของตนเอง/);
  assert.equal(page('expert', ledgerFor('expert', 'staff@example.com')).includes('freelance'), false);
});

test('office home is behind the existing login and roles do not bypass the allowlist', async () => {
  const store = createMemoryStore(example);
  const app = createApp({
    env: baseEnv({
      OFFICE_ROLES: 'investor@example.com:employee, stranger@example.com:founder',
    }),
    oidc: createFakeOidc(),
    store,
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

    assert.equal(html.includes('50,000.00'), false);
    assert.match(html, /data-ledger="hidden"/);

    const dashboard = await fetch(`${base}/`, { redirect: 'manual', headers: { cookie: signed.jar } });
    assert.equal(dashboard.status, 302);
    assert.equal(new URL(dashboard.headers.get('location'), base).pathname, '/office');

    const form = await fetch(`${base}/office/expenses/new`, { headers: { cookie: signed.jar } });
    assert.equal(form.status, 200);
    const formHtml = await form.text();
    const saved = await fetch(`${base}/office/expenses`, {
      method: 'POST',
      headers: { cookie: signed.jar, 'content-type': 'application/x-www-form-urlencoded' },
      redirect: 'manual',
      body: new URLSearchParams({
        csrf: csrfFrom(formHtml),
        kind: 'actual',
        advance: 'on',
        itemName: 'ค่าทดสอบสำนักงาน',
        amount: '12.00',
        spentOn: '2026-10-02',
        payer: 'ผู้ทดสอบ A',
        vendor: 'ร้านทดสอบ',
        receiptNo: 'TEST-1',
      }),
    });
    assert.equal(saved.status, 303);
    const after = await fetch(`${base}/office`, { headers: { cookie: signed.jar } });
    const afterHtml = await after.text();
    assert.match(afterHtml, /ค่าทดสอบสำนักงาน/);
    assert.match(afterHtml, /฿12\.00/);
    assert.equal(afterHtml.includes('id="cashflow"'), false);

    const listed = await store.listActual();
    const own = listed.find((expense) => expense.itemName === 'ค่าทดสอบสำนักงาน');
    assert.ok(own);
    const other = await store.createActual({
      spentOn: '2026-10-03',
      itemName: 'รายการของคนอื่น',
      category: 'other',
      categoryOther: 'ทดสอบ',
      vendor: 'ร้านอื่น',
      periodNone: true,
      amount: '77.00',
      vatMode: 'included',
      payer: 'ผู้ทดสอบ B',
      paymentMethods: ['cash'],
      receiptNo: 'TEST-2',
      receiptName: 'company',
      transferRights: false,
      note: '',
      advance: true,
      createdBy: 'other@example.com',
    }, []);
    const hidden = await fetch(`${base}/actual/${other.id}`, { headers: { cookie: signed.jar } });
    assert.equal(hidden.status, 404);
    const ownPage = await fetch(`${base}/actual/${own.id}`, { headers: { cookie: signed.jar } });
    assert.equal(ownPage.status, 200);
    const list = await fetch(`${base}/actual`, { headers: { cookie: signed.jar } });
    const listHtml = await list.text();
    assert.match(listHtml, /ค่าทดสอบสำนักงาน/);
    assert.equal(listHtml.includes('รายการของคนอื่น'), false);
  });
});

test('a founder still opens the funding dashboard and the company cashflow', async () => {
  const app = createApp({
    env: baseEnv(),
    oidc: createFakeOidc(),
    store: createMemoryStore(example),
  });
  await withServer(app, async (base) => {
    const signed = await signIn(base, 'allowed');
    const dashboard = await fetch(`${base}/`, { headers: { cookie: signed.jar } });
    assert.equal(dashboard.status, 200);
    const dash = await dashboard.text();
    assert.match(dash, /Funding forecast|ประมาณการเงินทุน/);
    const office = await fetch(`${base}/office`, { headers: { cookie: signed.jar } });
    assert.equal(office.status, 200);
    const html = await office.text();
    assert.match(html, /data-role="founder"/);
    assert.match(html, /id="cashflow"/);
    assert.equal(html.includes('฿1,250,000'), false);
  });
});
