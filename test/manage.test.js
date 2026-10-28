import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from '../lib/memory-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, csrfFrom, signIn, withServer } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const secret = 'service-role-key-should-not-leak';

function appWith(store = createMemoryStore(example)) {
  return createApp({
    env: baseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: secret,
    }),
    oidc: createFakeOidc(),
    store,
  });
}

async function postForm(base, jar, pathname, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((item) => body.append(key, item));
    else body.append(key, value ?? '');
  }
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: jar,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
}

function settingsFields(csrf, overrides = {}) {
  return {
    csrf,
    company: example.company,
    currency: example.currency,
    registeredCapital: example.registeredCapital,
    openingAmount: example.openingCapital.amount,
    openingShare: String(example.openingCapital.sharePercent),
    openingAssumed: 'on',
    openingLabel: example.openingCapital.label,
    openingTiming: example.openingCapital.timing,
    fxBase: example.fx.base,
    fxQuote: example.fx.quote,
    fxRate: example.fx.rate,
    fxSource: example.fx.source,
    fxUpdatedAt: example.fx.updatedAt,
    fxUpdatedDisplay: example.fx.updatedDisplay,
    balanceFormula: example.balanceFormula,
    documentPrefix: 'EXP',
    assumptions: example.assumptions.join('\n'),
    notYetIncluded: example.notYetIncluded.join('\n'),
    ...overrides,
  };
}

function multipart(fields, files) {
  const boundary = '----bt-manage';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ));
  }
  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field || 'receiptFile'}"; filename="${file.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ));
    chunks.push(file.bytes);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

test('signed-in edits change the dashboard on the next load and reject bad input', async () => {
  const app = appWith();
  await withServer(app, async (base) => {
    const signedOut = await fetch(`${base}/settings`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(settingsFields('x', { company: 'ไม่ควรบันทึก' })),
    });
    assert.equal(signedOut.status, 302);
    assert.equal(new URL(signedOut.headers.get('location'), base).pathname, '/login');

    const result = await signIn(base, 'allowed');
    const first = await fetch(`${base}/`, { headers: { cookie: result.jar } });
    const html = await first.text();
    const csrf = csrfFrom(html);
    assert.equal(html.includes(secret), false);
    assert.equal(html.includes('supabase.co'), false);
    assert.match(first.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(/supabase/.test(first.headers.get('content-security-policy')), false);

    const blocked = await postForm(base, result.jar, '/settings', settingsFields('', { company: 'ไม่ควรบันทึก' }));
    assert.equal(blocked.status, 403);
    const still = await (await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } })).json();
    assert.equal(still.forecast.company, example.company);

    const invalid = await postForm(base, result.jar, '/settings', settingsFields(csrf, { fxRate: '33.787050009' }));
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /อัตราแลกเปลี่ยน/);

    const saved = await postForm(base, result.jar, '/settings', settingsFields(csrf, {
      company: 'บริษัท ทดสอบแก้ไข จำกัด',
      fxRate: '33.78705',
    }));
    assert.equal(saved.status, 303);
    const after = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.equal(after.includes('บริษัท ทดสอบแก้ไข จำกัด'), true);
    assert.match(after, /แปลงดอลลาร์ที่ 33\.78705 บาท\/ดอลลาร์/);

    const forecast = await (await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } })).json();
    const month = forecast.forecast.months[0];
    const created = await postForm(base, result.jar, '/forecast/items', {
      csrf,
      monthId: month.id,
      group: 'place',
      groupName: 'สถานที่ตัวอย่าง',
      name: 'รายการเพิ่มทดสอบ',
      amount: '15.50',
      note: 'หมายเหตุทดสอบ',
    });
    assert.equal(created.status, 303);
    const withItem = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.match(withItem, /รายการเพิ่มทดสอบ/);
    assert.match(withItem, /15\.50/);
    assert.match(withItem, /หมายเหตุทดสอบ/);

    const badAmount = await postForm(base, result.jar, '/forecast/items', {
      csrf,
      monthId: month.id,
      group: 'place',
      groupName: 'สถานที่ตัวอย่าง',
      name: 'ไม่ควรเพิ่ม',
      amount: '1.234',
    });
    assert.equal(badAmount.status, 400);

    const revenue = await postForm(base, result.jar, `/forecast/months/${month.id}`, {
      csrf,
      key: month.key,
      label: month.label,
      labelFull: month.labelFull,
      revenue: '123.45',
    });
    assert.equal(revenue.status, 303);
    const withRevenue = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.match(withRevenue, /123\.45/);

    const fresh = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    const logoutGet = await fetch(`${base}/auth/logout`, {
      redirect: 'manual',
      headers: { cookie: result.jar },
    });
    assert.equal(logoutGet.status, 200);
    const stillIn = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    assert.equal(stillIn.status, 200);
    assert.equal(csrfFrom(fresh).length > 20, true);
  });
});

test('actual expenses, receipts, and the reimbursement form stay on this server', async () => {
  const app = appWith();
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const page = await (await fetch(`${base}/actual/new`, { headers: { cookie: result.jar } })).text();
    const csrf = csrfFrom(page);
    assert.match(page, /EXP-0001/);
    const form = multipart({
      csrf,
      spentOn: '2026-04-15',
      itemName: 'ค่าอุปกรณ์สำนักงานตัวอย่าง',
      category: 'software',
      vendor: 'ผู้ขายตัวอย่าง',
      periodNone: 'on',
      amount: '1000.00',
      vatMode: 'excluded',
      payer: 'ผู้จ่ายตัวอย่าง',
      payCash: 'on',
      receiptNo: 'INV-1000',
      receiptName: 'company',
      transferRights: 'no',
      note: 'หมายเหตุตัวอย่าง',
    }, [{ field: 'receiptFile', filename: '../ใบเสร็จ.png', bytes: PNG }]);
    const created = await fetch(`${base}/actual`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: result.jar, 'content-type': form.contentType },
      body: form.body,
    });
    assert.equal(created.status, 303);
    const location = new URL(created.headers.get('location'), base);
    const detail = await (await fetch(location, { headers: { cookie: result.jar } })).text();
    assert.match(detail, /EXP-0001/);
    assert.match(detail, /ใบเสร็จ\.png/);
    assert.equal(detail.includes('../'), false);
    assert.equal(detail.includes(secret), false);
    assert.equal(detail.includes('supabase'), false);
    const imagePath = detail.match(/src="(\/actual\/[^"]+)"/)[1];
    const image = await fetch(`${base}${imagePath}`, { headers: { cookie: result.jar } });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.compare(Buffer.from(await image.arrayBuffer()), PNG), 0);
    const hidden = await fetch(`${base}${imagePath}`, { redirect: 'manual' });
    assert.equal(hidden.status, 401);

    const gif = multipart({
      csrf,
      spentOn: '2026-04-15',
      itemName: 'ไม่ควรบันทึก',
      category: 'domain',
      vendor: 'ผู้ขายตัวอย่าง',
      periodNone: 'on',
      amount: '10.00',
      vatMode: 'excluded',
      payer: 'ผู้จ่ายตัวอย่าง',
      payCash: 'on',
      receiptNo: 'INV-2',
      receiptName: 'company',
      transferRights: 'no',
      note: '',
    }, [{ field: 'receiptFile', filename: 'a.gif', bytes: Buffer.from('GIF89ahello') }]);
    const rejected = await fetch(`${base}/actual`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: result.jar, 'content-type': gif.contentType },
      body: gif.body,
    });
    assert.equal(rejected.status, 400);

    const second = multipart({
      csrf,
      spentOn: '2026-04-16',
      itemName: 'ค่าอีกตัวอย่าง',
      category: 'domain',
      vendor: 'ผู้ขายตัวอย่าง',
      periodNone: 'on',
      amount: '20.00',
      vatMode: 'included',
      payer: 'ผู้จ่ายตัวอย่าง',
      payTransfer: 'on',
      receiptNo: 'INV-3',
      receiptName: 'promoter',
      transferRights: 'no',
      note: '',
    }, [{ field: 'paymentFile', filename: 'other.png', bytes: PNG }]);
    const secondCreated = await fetch(`${base}/actual`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: result.jar, 'content-type': second.contentType },
      body: second.body,
    });
    assert.equal(secondCreated.status, 303);
    const list = await (await fetch(`${base}/actual`, { headers: { cookie: result.jar } })).text();
    assert.match(list, /EXP-0001/);
    assert.match(list, /EXP-0002/);

    const expenses = [...list.matchAll(/href="\/actual\/([0-9a-f-]{36})"/g)].map((match) => match[1]);
    const swapped = await fetch(`${base}/actual/${expenses[1]}/files/${imagePath.split('/').pop()}`, {
      headers: { cookie: result.jar },
    });
    assert.equal(swapped.status, 404);

    const expenseId = new URL(created.headers.get('location'), base).pathname.split('/')[2];
    const printed = await (await fetch(`${base}/actual/${expenseId}/form`, { headers: { cookie: result.jar } })).text();
    assert.match(printed, /TEMPLATE DRAFT/);
    assert.match(printed, /EXP-0001/);
    assert.match(printed, /หนึ่งพันบาทถ้วน/);
    assert.match(printed, /1,000\.00/);
    assert.match(printed, /บริษัท ตัวอย่าง จำกัด/);
    assert.match(printed, /ส่วนที่ 1/);
    assert.match(printed, /ส่วนที่ 2/);
    assert.match(printed, /ส่วนที่ 3/);
    assert.match(printed, /พ\.ศ\./);
    assert.match(printed, /เมษายน/);
    assert.match(printed, /2569/);
    assert.match(printed, /ห้ามกรอกเลขบัตร\/เลขบัญชี/);
    assert.match(printed, /ปกปิด \(mask\)/);
    assert.match(printed, /ผู้ทดรองจ่าย/);
    assert.match(printed, /ผู้บันทึกลงสมุดบันทึก/);
    assert.match(printed, /ป\.พ\.พ\. มาตรา 1108\(2\)/);
    assert.match(printed, /ใบเสร็จ\.png/);
    assert.match(printed, /<script src="\/app-assets\/print\.js" defer><\/script>/);
    assert.equal(/<script(?![^>]*\bsrc=)/i.test(printed), false);
    assert.equal(printed.includes(secret), false);
    assert.equal(printed.includes('supabase'), false);
  });
});

test('a signed-in page says supabase is not configured and health stays up', async () => {
  const app = appWith({ configured: false });
  await withServer(app, async (base) => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const result = await signIn(base, 'allowed');
    const page = await fetch(`${base}/`, { headers: { cookie: result.jar } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /not configured/);
    const api = await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } });
    assert.equal(api.status, 503);
    assert.equal((await api.json()).error, 'not_configured');
    const anonymous = await fetch(`${base}/api/forecast`, { redirect: 'manual' });
    assert.equal(anonymous.status, 401);
  });
});
