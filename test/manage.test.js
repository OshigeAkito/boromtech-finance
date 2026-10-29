import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from '../lib/memory-store.js';
import { parseMultipart } from '../lib/multipart.js';
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

function tagAttrs(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s([^\s=/>]+)(?:="([^"]*)")?/g)) {
    attrs[match[1].toLowerCase()] = match[2] ?? '';
  }
  return attrs;
}

// Builds the same multipart body a browser sends for /actual/new: every text
// control (including blanks), one value per radio, every checkbox, and one
// part per file input. Empty file inputs are still parts.
// `fields` overrides text values. A checkbox set to false is left unticked.
function browserExpenseForm(html, file, fields = {}) {
  const start = html.indexOf('<form method="post" action="/actual"');
  const end = html.indexOf('</form>', start);
  assert.ok(start >= 0 && end > start, 'expense form missing');
  const form = html.slice(start, end);
  const controls = [];
  for (const match of form.matchAll(/<input\b[^>]*>/g)) controls.push(tagAttrs(match[0]));
  for (const match of form.matchAll(/<textarea\b[^>]*>/g)) {
    controls.push({ ...tagAttrs(match[0]), type: 'textarea' });
  }
  const byName = new Map();
  for (const control of controls) {
    if (!control.name) continue;
    if (!byName.has(control.name)) byName.set(control.name, []);
    byName.get(control.name).push(control);
  }
  const text = {
    spentOn: '2026-04-15',
    amount: '100.00',
    itemName: 'Synthetic office supply',
    vendor: 'Example Vendor',
    receiptNo: 'INV-TEST-1',
    category: 'software',
    payer: 'Example Payer',
    transferRights: 'no',
    paymentOther: 'Example method',
    ...fields,
  };
  const boundary = '----bt-browser-form';
  const chunks = [];
  const push = (value) => chunks.push(Buffer.from(value, 'utf8'));
  let parts = 0;
  for (const [name, group] of byName) {
    const type = (group[0].type || 'text').toLowerCase();
    if (type === 'file') {
      parts += 1;
      if (name === file.field) {
        push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`);
        chunks.push(file.bytes);
        push('\r\n');
      } else {
        push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename=""\r\nContent-Type: application/octet-stream\r\n\r\n\r\n`);
      }
      continue;
    }
    if (type === 'submit' || type === 'button' || type === 'image') continue;
    if (type === 'radio') {
      const picked = group.find((item) => item.value === text[name])
        || group.find((item) => Object.hasOwn(item, 'checked'));
      if (!picked) continue;
      parts += 1;
      push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${picked.value}\r\n`);
      continue;
    }
    if (type === 'checkbox') {
      if (Object.hasOwn(fields, name) && fields[name] !== 'on' && fields[name] !== true && fields[name] !== '1') {
        continue;
      }
      parts += 1;
      push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${group[0].value || 'on'}\r\n`);
      continue;
    }
    parts += 1;
    const value = text[name] ?? group[0].value ?? '';
    push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  push(`--${boundary}--\r\n`);
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
    parts,
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
    const signedOut = await fetch(`${base}/capital`, {
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

    const blocked = await postForm(base, result.jar, '/capital', settingsFields('', { company: 'ไม่ควรบันทึก' }));
    assert.equal(blocked.status, 403);
    const still = await (await fetch(`${base}/api/forecast`, { headers: { cookie: result.jar } })).json();
    assert.equal(still.forecast.company, example.company);

    const invalid = await postForm(base, result.jar, '/capital', settingsFields(csrf, { registeredCapital: 'nope' }));
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /Registered capital must be zero or more/);

    // The old /settings address still saves, for forms left open in a browser.
    // A posted exchange rate is ignored; the stored rate stays as it was.
    const saved = await postForm(base, result.jar, '/settings', settingsFields(csrf, {
      company: 'บริษัท ทดสอบแก้ไข จำกัด',
      fxRate: '33.78705',
    }));
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), '/capital?saved=1');
    const after = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.equal(after.includes('บริษัท ทดสอบแก้ไข จำกัด'), true);
    assert.equal(after.includes('1 USD ='), false);

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
    assert.equal(revenue.headers.get('location'), '/income?saved=1');
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

test('four tabs: income holds the months, expenses has actual and planned, capital holds settings', async () => {
  const app = appWith();
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const get = (pathname) => fetch(`${base}${pathname}`, { redirect: 'manual', headers: { cookie: result.jar } });

    const home = await (await get('/')).text();
    const navStart = home.indexOf('class="nav"');
    const nav = home.slice(navStart, home.indexOf('</nav>', navStart));
    assert.deepEqual([...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]), [
      ['/', 'Dashboard'],
      ['/income', 'Income'],
      ['/actual', 'Expenses'],
      ['/capital', 'Capital'],
    ]);
    assert.match(home, /<html lang="en">/);

    for (const [from, to] of [['/settings', '/capital'], ['/reimburse', '/actual']]) {
      const moved = await get(from);
      assert.equal(moved.status, 301);
      assert.equal(moved.headers.get('location'), to);
    }

    const actual = await (await get('/actual')).text();
    const planned = await (await get('/forecast')).text();
    for (const page of [actual, planned]) {
      assert.match(page, /<a href="\/actual"[^>]*>Expenses<\/a>/);
      assert.match(page, /class="subtabs"/);
    }
    assert.match(actual, /<a href="\/actual" aria-current="page">Actual<\/a>/);
    assert.match(planned, /<a href="\/forecast" aria-current="page">Planned<\/a>/);
    assert.match(planned, /<h1>Planned expenses<\/h1>/);
    assert.match(actual, /<h1>Expenses<\/h1>/);
    assert.match(planned, /January 2026/);

    const income = await (await get('/income')).text();
    const csrf = csrfFrom(income);
    assert.match(income, /<a href="\/income" aria-current="page">Income<\/a>/);
    assert.match(income, /name="key" type="month"/);
    assert.match(income, /<th scope="row">February 2026<\/th>/);
    assert.match(income, /value="50000\.00"/);

    // A month picked from the month input gets English names from its key.
    const added = await postForm(base, result.jar, '/forecast/months', { csrf, key: '2026-04', revenue: '1500' });
    assert.equal(added.status, 303);
    assert.equal(added.headers.get('location'), '/income?saved=1');
    const data = (await (await get('/api/forecast')).json()).forecast;
    const april = data.months.find((month) => month.key === '2026-04');
    assert.equal(april.label, 'Apr 2026');
    assert.equal(april.labelFull, 'April 2026');
    assert.equal(april.revenue, '1500.00');
    const missing = await postForm(base, result.jar, '/forecast/months', { csrf, key: '', revenue: '1' });
    assert.equal(missing.status, 400);
    assert.match(await missing.text(), /Pick a month/);

    const capital = await (await get('/capital')).text();
    assert.match(capital, /<a href="\/capital" aria-current="page">Capital<\/a>/);
    assert.equal(capital.includes('THB per 1 USD'), false);
    assert.equal(capital.includes('name="fxRate"'), false);
    assert.equal(capital.includes('name="openingShare"'), false);
    assert.equal(capital.includes('name="fxUpdatedDisplay"'), false);

    // Share is worked out from the two amounts. A posted rate does not replace the stored one.
    const saved = await postForm(base, result.jar, '/capital', {
      csrf,
      company: example.company,
      currency: 'THB',
      registeredCapital: '500000',
      openingAmount: '125000',
      fxRate: '99.99',
      documentPrefix: 'EXP',
      balanceFormula: '',
      assumptions: '',
      notYetIncluded: '',
    });
    assert.equal(saved.status, 303);
    const after = (await (await get('/api/forecast')).json()).forecast;
    assert.equal(String(after.openingCapital.sharePercent).replace(/\.0+$/, ''), '25');
    assert.equal(after.fx.rate, example.fx.rate);
    assert.equal(after.fx.source, example.fx.source);
    assert.equal(after.openingCapital.assumed, false);
    const dashboard = await (await get('/')).text();
    assert.equal(dashboard.includes('1 USD ='), false);
    assert.equal(dashboard.includes('class="fx-note"'), false);

    const tooMuch = await postForm(base, result.jar, '/capital', {
      csrf,
      company: example.company,
      registeredCapital: '100',
      openingAmount: '200',
      fxRate: '30',
      fxUpdatedAt: '2026-10-27',
    });
    assert.equal(tooMuch.status, 400);
    assert.match(await tooMuch.text(), /cannot be more than registered capital/);
  });
});

test('the EN | TH switch remembers the language and only returns to same-site pages', async () => {
  const app = appWith();
  await withServer(app, async (base) => {
    const login = await (await fetch(`${base}/login`)).text();
    assert.match(login, /<html lang="en">/);
    assert.match(login, /href="\/lang\/th\?next=%2Flogin"/);

    const toThai = await fetch(`${base}/lang/th?next=${encodeURIComponent('/login')}`, { redirect: 'manual' });
    assert.equal(toThai.status, 303);
    assert.equal(toThai.headers.get('location'), '/login');
    const cookie = toThai.headers.getSetCookie().find((value) => value.startsWith('bt_lang='));
    assert.match(cookie, /^bt_lang=th;/);
    assert.match(cookie, /HttpOnly/i);
    const thaiLogin = await (await fetch(`${base}/login`, { headers: { cookie: 'bt_lang=th' } })).text();
    assert.match(thaiLogin, /<html lang="th">/);
    assert.match(thaiLogin, /เข้าสู่ระบบด้วย Google/);
    assert.match(thaiLogin, /<a href="\/lang\/th[^"]*"[^>]*aria-current="true">TH<\/a>/);

    for (const next of ['https://evil.example/', '//evil.example/', '/\\evil.example']) {
      const away = await fetch(`${base}/lang/en?next=${encodeURIComponent(next)}`, { redirect: 'manual' });
      assert.equal(away.headers.get('location'), '/');
    }
    const unknown = await fetch(`${base}/lang/fr?next=/`, { redirect: 'manual' });
    assert.match(unknown.headers.getSetCookie()[0], /^bt_lang=en;/);

    const result = await signIn(base, 'allowed');
    const jar = `${result.jar}; bt_lang=th`;
    const get = async (pathname) => (await fetch(`${base}${pathname}`, { headers: { cookie: jar } })).text();
    const home = await get('/');
    assert.match(home, /<html lang="th">/);
    assert.match(home, /<a href="\/income"[^>]*>รายรับ<\/a>/);
    assert.match(home, /<a href="\/capital"[^>]*>เงินทุน<\/a>/);
    assert.match(home, /เงินทุนคงเหลือสิ้นเดือน/);
    assert.match(home, />ม\.ค\. 69</);
    assert.match(home, /href="\/lang\/en\?next=%2F"/);
    assert.match(await get('/income'), /<th scope="row">มกราคม 2569<\/th>/);
    assert.match(await get('/actual'), /<a href="\/actual" aria-current="page">จ่ายจริง<\/a>/);
    assert.match(await get('/capital'), /ทุนจดทะเบียน/);
    assert.equal((await get('/capital')).includes('บาทต่อ 1 USD'), false);

    // Validation messages follow the language too.
    const csrf = csrfFrom(home);
    const missing = await fetch(`${base}/forecast/months`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf, key: '', revenue: '1' }),
    });
    assert.equal(missing.status, 400);
    assert.match(await missing.text(), /เลือกเดือน/);

    // Without the cookie the site stays in English.
    const english = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.match(english, /<html lang="en">/);
    assert.match(english, />Jan 2026</);
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

test('one receipt on the full expense form saves a PDF and a PNG', async () => {
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const files = [
    { field: 'receiptFile', filename: 'receipt.pdf', type: 'application/pdf', bytes: pdf },
    { field: 'receiptFile', filename: 'slip.png', type: 'image/png', bytes: PNG },
  ];
  const app = appWith();
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const page = await (await fetch(`${base}/actual/new`, { headers: { cookie: result.jar } })).text();
    for (const file of files) {
      const form = browserExpenseForm(page, file);
      // The live form is larger than the parser's old 24-part cap. Keep this
      // above that cap so a smaller hand-built body cannot hide the bug.
      assert.ok(form.parts > 24, `expected the full form, got ${form.parts} parts`);
      let parsed;
      try {
        parsed = parseMultipart(form.body, form.contentType);
      } catch (error) {
        assert.fail(`parse failed: ${error.code} parts=${form.parts}`);
      }
      assert.equal(parsed.files.length, 1);
      assert.equal(parsed.files[0].field, 'receiptFile');
      assert.equal(Buffer.compare(parsed.files[0].bytes, file.bytes), 0);
      const created = await fetch(`${base}/actual`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie: result.jar, 'content-type': form.contentType },
        body: form.body,
      });
      const text = await created.text();
      assert.equal(created.status, 303, text);
      const detail = await (await fetch(new URL(created.headers.get('location'), base), {
        headers: { cookie: result.jar },
      })).text();
      assert.match(detail, new RegExp(file.filename.replace('.', '\\.')));
      const filePath = detail.match(/href="(\/actual\/[^"]+\/files\/[^"]+)"/)[1];
      const saved = await fetch(`${base}${filePath}`, { headers: { cookie: result.jar } });
      assert.equal(saved.status, 200);
      assert.equal(saved.headers.get('content-type'), file.type);
      assert.equal(Buffer.compare(Buffer.from(await saved.arrayBuffer()), file.bytes), 0);
    }
    const list = await (await fetch(`${base}/actual`, { headers: { cookie: result.jar } })).text();
    assert.match(list, /EXP-0001/);
    assert.match(list, /EXP-0002/);
    assert.equal(list.includes('No actual expenses yet'), false);
  });
});

const PDF = Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

function receiptFile() {
  return { field: 'receiptFile', filename: 'receipt.pdf', type: 'application/pdf', bytes: PDF };
}

async function postExpense(base, jar, page, fields) {
  const form = browserExpenseForm(page, receiptFile(), fields);
  assert.ok(form.parts > 24, `expected the full form, got ${form.parts} parts`);
  const created = await fetch(`${base}/actual`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: jar, 'content-type': form.contentType },
    body: form.body,
  });
  return { created, form };
}

test('a service period with only from and to saves one PDF', async () => {
  const app = appWith();
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const page = await (await fetch(`${base}/actual/new`, { headers: { cookie: result.jar } })).text();
    const backwards = await postExpense(base, result.jar, page, {
      periodNone: false,
      periodText: '',
      periodFrom: '2026-11-23',
      periodTo: '2026-10-23',
      note: 'First line\nSecond line',
    });
    const rejected = await backwards.created.text();
    assert.equal(backwards.created.status, 400, rejected);
    assert.match(rejected, /The end date must be on or after the start date/);
    assert.match(rejected, /The attached file was not kept\. Attach it again before saving\./);
    assert.match(rejected, /name="periodFrom"[^>]*value="2026-11-23"/);
    assert.match(rejected, /name="periodTo"[^>]*value="2026-10-23"/);
    assert.equal(/name="receiptFile"[^>]*value=/.test(rejected), false);

    const saved = await postExpense(base, result.jar, page, {
      periodNone: false,
      periodText: '',
      periodFrom: '2026-10-23',
      periodTo: '2026-11-23',
      note: 'First line\nSecond line',
    });
    const body = await saved.created.text();
    assert.equal(saved.created.status, 303, body);
    const detail = await (await fetch(new URL(saved.created.headers.get('location'), base), {
      headers: { cookie: result.jar },
    })).text();
    assert.match(detail, /name="periodFrom"[^>]*value="2026-10-23"/);
    assert.match(detail, /name="periodTo"[^>]*value="2026-11-23"/);
    assert.match(detail, /name="periodText"[^>]*value="1 month"/);
    assert.equal(/name="periodNone"[^>]*\bchecked\b/.test(detail), false);
    assert.match(detail, /First line\nSecond line/);
    const filePath = detail.match(/href="(\/actual\/[^"]+\/files\/[^"]+)"/)[1];
    const file = await fetch(`${base}${filePath}`, { headers: { cookie: result.jar } });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.compare(Buffer.from(await file.arrayBuffer()), PDF), 0);
    const expenseId = new URL(saved.created.headers.get('location'), base).pathname.split('/')[2];
    const printed = await (await fetch(`${base}/actual/${expenseId}/form`, { headers: { cookie: result.jar } })).text();
    assert.match(printed, /1 month/);
    assert.match(printed, /23 ตุลาคม 2569/);
    assert.match(printed, /23 พฤศจิกายน 2569/);
  });
});

test('ticking No service period saves one PDF with no dates', async () => {
  const app = appWith();
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const page = await (await fetch(`${base}/actual/new`, { headers: { cookie: result.jar } })).text();
    const saved = await postExpense(base, result.jar, page, {
      periodNone: 'on',
      periodText: '',
      periodFrom: '',
      periodTo: '',
    });
    const body = await saved.created.text();
    assert.equal(saved.created.status, 303, body);
    const detail = await (await fetch(new URL(saved.created.headers.get('location'), base), {
      headers: { cookie: result.jar },
    })).text();
    assert.match(detail, /name="periodNone"[^>]*\bchecked\b/);
    assert.match(detail, /name="periodFrom"[^>]*value=""/);
    assert.match(detail, /name="periodTo"[^>]*value=""/);
    assert.match(detail, /name="periodText"[^>]*value=""/);
    const filePath = detail.match(/href="(\/actual\/[^"]+\/files\/[^"]+)"/)[1];
    const file = await fetch(`${base}${filePath}`, { headers: { cookie: result.jar } });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.compare(Buffer.from(await file.arrayBuffer()), PDF), 0);
  });
});

test('the expense form constrains money fields and saves a foreign amount', async () => {
  const app = appWith();
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const page = await (await fetch(`${base}/actual/new`, { headers: { cookie: result.jar } })).text();
    const amountTag = page.match(/<input\b[^>]*\bname="amount"[^>]*>/)[0];
    assert.match(amountTag, /inputmode="decimal"/);
    assert.match(amountTag, /maxlength="15"/);
    assert.match(amountTag, /pattern="\(\?:0\\\./);
    const rateTag = page.match(/<input\b[^>]*\bname="foreignRate"[^>]*>/)[0];
    assert.match(rateTag, /inputmode="decimal"/);
    assert.match(rateTag, /maxlength="15"/);
    assert.match(page, /<input\b[^>]*\bname="foreignAmount"[^>]*pattern="/);
    assert.match(page, /<abbr class="req"[^>]*>\*<\/abbr>/);
    assert.match(page, /At least 1 file is required/);
    assert.match(page, /name="payer"[^>]*>/);
    const thai = await (await fetch(`${base}/actual/new`, { headers: { cookie: `${result.jar}; bt_lang=th` } })).text();
    assert.match(thai, /<h1>บันทึกรายจ่ายจริง<\/h1>/);
    assert.match(thai, /บันทึกค่าใช้จ่าย/);
    assert.equal(thai.includes('>Invoice<'), false);
    assert.match(thai, /ใบแจ้งหนี้/);
    assert.match(thai, /การเงิน/);
    assert.match(thai, /ต้องแนบอย่างน้อย 1 ไฟล์/);

    const rejected = await postExpense(base, result.jar, page, { amount: '-5abc99999999999999999' });
    const rejectedText = await rejected.created.text();
    assert.equal(rejected.created.status, 400, rejectedText);
    assert.match(rejectedText, /Amount must be more than 0, with at most 2 decimals/);

    const saved = await postExpense(base, result.jar, page, {
      vatMode: 'foreign',
      foreignCurrency: 'USD',
      foreignAmount: '12.50',
      foreignRate: '33.50',
      receiptNo: 'INV-FX',
    });
    const body = await saved.created.text();
    assert.equal(saved.created.status, 303, body);
    const detail = await (await fetch(new URL(saved.created.headers.get('location'), base), {
      headers: { cookie: result.jar },
    })).text();
    assert.match(detail, /name="foreignCurrency"[^>]*value="USD"/);
    assert.match(detail, /name="foreignAmount"[^>]*value="12\.50"/);
    assert.match(detail, /name="foreignRate"[^>]*value="33\.50"/);
    const filePath = detail.match(/href="(\/actual\/[^"]+\/files\/[^"]+)"/)[1];
    const file = await fetch(`${base}${filePath}`, { headers: { cookie: result.jar } });
    assert.equal(file.headers.get('content-type'), 'application/pdf');
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
