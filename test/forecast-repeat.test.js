import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repeatMonthKeys } from '../lib/dates.js';
import { buildDashboardSummary } from '../lib/dashboard-cash.js';
import { itemFormPage, plannedPage } from '../lib/manage-pages.js';
import { createMemoryStore } from '../lib/memory-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, csrfFrom, signIn, withServer } from './helpers.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));

function appWith(store = createMemoryStore(example)) {
  return createApp({
    env: baseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-should-not-leak',
    }),
    oidc: createFakeOidc(),
    store,
  });
}

function postForm(base, jar, pathname, fields) {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

const itemFields = {
  group: 'tools',
  groupName: 'Synthetic tools',
  name: 'Synthetic planned row',
  amount: '17.25',
};

test('repeat keys step by quarter and year and stop at 36 months', () => {
  assert.deepEqual(repeatMonthKeys('2026-01', 'quarterly', 3), ['2026-01', '2026-04', '2026-07']);
  assert.deepEqual(repeatMonthKeys('2026-11', 'quarterly', 2), ['2026-11', '2027-02']);
  assert.equal(repeatMonthKeys('2026-01', 'quarterly', 12).at(-1), '2028-10');
  assert.equal(repeatMonthKeys('2026-01', 'quarterly', 13), null);
  assert.deepEqual(repeatMonthKeys('2026-03', 'yearly', 3), ['2026-03', '2027-03', '2028-03']);
  assert.equal(repeatMonthKeys('2026-03', 'yearly', 4), null);
  assert.equal(repeatMonthKeys('2026-01', 'monthly', 36).length, 36);
  assert.equal(repeatMonthKeys('2026-01', 'monthly', 36).at(-1), '2028-12');
  assert.equal(repeatMonthKeys('2026-01', 'monthly', 37), null);
});

test('a month can be added on the planned expenses page', async () => {
  const store = createMemoryStore(example);
  const loaded = await store.loadForecast();
  for (const month of loaded.months) await store.deleteMonth(month.id);
  const app = appWith(store);
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const get = (pathname) => fetch(`${base}${pathname}`, { headers: { cookie: jar } });
    const page = await (await get('/forecast')).text();
    assert.match(page, /<h1>Planned expenses<\/h1>/);
    assert.match(page, /No planned expenses yet/);
    assert.match(page, /name="key" type="month"/);
    assert.match(page, /name="returnTo" value="forecast"/);
    assert.match(page, /name="revenue" value="0\.00"/);
    assert.match(page, />Add month</);
    assert.match(page, /href="\/forecast\/items\/new"/);
    assert.equal(page.includes('Add a month on the Income page'), false);
    assert.equal(page.includes('href="/income">Add a month'), false);
    const csrf = csrfFrom(page);

    const added = await postForm(base, jar, '/forecast/months', { csrf, returnTo: 'forecast', key: '2026-04', revenue: '0.00' });
    assert.equal(added.status, 303);
    assert.equal(added.headers.get('location'), '/forecast?saved=1');
    const data = (await (await get('/api/forecast')).json()).forecast;
    assert.equal(data.months.length, 1);
    assert.equal(data.months[0].key, '2026-04');
    assert.equal(data.months[0].revenue, '0.00');
    assert.equal(data.months[0].label, 'Apr 2026');

    const missing = await postForm(base, jar, '/forecast/months', { csrf, returnTo: 'forecast', key: '', revenue: '0.00' });
    assert.equal(missing.status, 400);
    const errorPage = await missing.text();
    assert.match(errorPage, /<h1>Planned expenses<\/h1>/);
    assert.match(errorPage, /Pick a month/);

    const income = await (await get('/income')).text();
    assert.match(income, /name="key" type="month"/);
    assert.match(income, /name="revenue"/);
    const fromIncome = await postForm(base, jar, '/forecast/months', { csrf, key: '2026-05', revenue: '1500' });
    assert.equal(fromIncome.status, 303);
    assert.equal(fromIncome.headers.get('location'), '/income?saved=1');
  });
});

test('a planned expense creates a missing month, and repeat rows stay independent', async () => {
  const store = createMemoryStore(example);
  const app = appWith(store);
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const get = (pathname) => fetch(`${base}${pathname}`, { headers: { cookie: jar } });
    const csrf = csrfFrom(await (await get('/forecast')).text());
    const before = (await (await get('/api/forecast')).json()).forecast;
    const february = before.months.find((month) => month.key === '2026-02');

    const once = await postForm(base, jar, '/forecast/items', {
      csrf,
      monthKey: '2026-10',
      ...itemFields,
      name: 'Synthetic October plan',
      repeatCount: '99',
      frequency: 'yearly',
    });
    assert.equal(once.status, 303);
    let data = (await (await get('/api/forecast')).json()).forecast;
    const october = data.months.find((month) => month.key === '2026-10');
    assert.equal(october.revenue, '0.00');
    assert.equal(october.items.length, 1);
    assert.equal(october.items[0].amount, '17.25');
    assert.equal(data.months.some((month) => month.key === '2027-10'), false);
    assert.equal(data.months.find((month) => month.key === '2026-02').revenue, february.revenue);

    const quarterly = await postForm(base, jar, '/forecast/items', {
      csrf,
      monthKey: '2026-02',
      ...itemFields,
      name: 'Synthetic quarterly row',
      amount: '10.00',
      repeat: 'on',
      frequency: 'quarterly',
      repeatCount: '3',
    });
    assert.equal(quarterly.status, 303);
    data = (await (await get('/api/forecast')).json()).forecast;
    assert.deepEqual(
      ['2026-02', '2026-05', '2026-08'].map((key) => data.months.find((month) => month.key === key)?.items.filter((item) => item.name === 'Synthetic quarterly row').length),
      [1, 1, 1],
    );
    assert.equal(data.months.some((month) => month.key === '2026-04'), false);
    assert.equal(data.months.find((month) => month.key === '2026-02').revenue, '50000.00');
    assert.equal(data.months.find((month) => month.key === '2026-05').revenue, '0.00');
    const copies = data.months.flatMap((month) => month.items.filter((item) => item.name === 'Synthetic quarterly row').map((item) => item.id));
    assert.equal(new Set(copies).size, 3);

    const edited = await postForm(base, jar, `/forecast/items/${copies[0]}`, {
      csrf,
      monthId: data.months.find((month) => month.key === '2026-02').id,
      group: 'tools',
      groupName: 'Synthetic tools',
      name: 'Synthetic quarterly row',
      amount: '3.00',
    });
    assert.equal(edited.status, 303);
    data = (await (await get('/api/forecast')).json()).forecast;
    const amounts = ['2026-02', '2026-05', '2026-08'].map((key) => data.months.find((month) => month.key === key).items.find((item) => item.name === 'Synthetic quarterly row').amount);
    assert.deepEqual(amounts, ['3.00', '10.00', '10.00']);

    const removed = await postForm(base, jar, `/forecast/items/${copies[1]}/delete`, { csrf, confirm: 'yes' });
    assert.equal(removed.status, 303);
    data = (await (await get('/api/forecast')).json()).forecast;
    assert.equal(data.months.find((month) => month.key === '2026-05').items.some((item) => item.name === 'Synthetic quarterly row'), false);
    assert.equal(data.months.find((month) => month.key === '2026-08').items.some((item) => item.name === 'Synthetic quarterly row'), true);

    const yearly = await postForm(base, jar, '/forecast/items', {
      csrf,
      monthKey: '2026-03',
      ...itemFields,
      name: 'Synthetic yearly row',
      amount: '8.00',
      repeat: 'on',
      frequency: 'yearly',
      repeatCount: '3',
    });
    assert.equal(yearly.status, 303);
    data = (await (await get('/api/forecast')).json()).forecast;
    assert.deepEqual(
      ['2026-03', '2027-03', '2028-03'].map((key) => data.months.find((month) => month.key === key)?.items.some((item) => item.name === 'Synthetic yearly row')),
      [true, true, true],
    );
    assert.equal(data.months.find((month) => month.key === '2027-03').revenue, '0.00');
    assert.equal(data.months.some((month) => month.key === '2029-03'), false);

    const tooFar = await postForm(base, jar, '/forecast/items', {
      csrf,
      monthKey: '2026-03',
      ...itemFields,
      name: 'Should not repeat',
      repeat: 'on',
      frequency: 'yearly',
      repeatCount: '4',
    });
    assert.equal(tooFar.status, 400);
    assert.match(await tooFar.text(), /past 36 months/);
    data = (await (await get('/api/forecast')).json()).forecast;
    assert.equal(data.months.some((month) => month.key === '2029-03'), false);
    assert.equal(data.months.flatMap((month) => month.items).some((item) => item.name === 'Should not repeat'), false);

    const quarterlyCap = await postForm(base, jar, '/forecast/items', {
      csrf,
      monthKey: '2026-01',
      ...itemFields,
      repeat: 'on',
      frequency: 'quarterly',
      repeatCount: '13',
    });
    assert.equal(quarterlyCap.status, 400);

    const summary = buildDashboardSummary(data, []);
    const keys = summary.months.map((row) => row.month.key);
    assert.deepEqual(keys.slice(0, 3), ['2026-01', '2026-02', '2026-03']);
    assert.ok(keys.indexOf('2026-10') > keys.indexOf('2026-03'));
    assert.ok(keys.indexOf('2027-03') > keys.indexOf('2026-10'));
    const octoberRow = summary.months.find((row) => row.month.key === '2026-10');
    assert.equal(octoberRow.plannedCents, 1725n);
    assert.equal(octoberRow.revenueCents, 0n);
    const dashboard = await (await get('/')).text();
    assert.match(dashboard, /Synthetic October plan/);
    assert.match(dashboard, /Oct 2026/);
  });
});

test('a month added before the forecast is included in the balance walk', async () => {
  const store = createMemoryStore(example);
  const app = appWith(store);
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const page = await (await fetch(`${base}/forecast`, { headers: { cookie: jar } })).text();
    const csrf = csrfFrom(page);
    const added = await postForm(base, jar, '/forecast/items', {
      csrf,
      monthKey: '2025-12',
      ...itemFields,
      name: 'Synthetic earlier plan',
      amount: '5.00',
    });
    assert.equal(added.status, 303);
    const data = (await (await fetch(`${base}/api/forecast`, { headers: { cookie: jar } })).json()).forecast;
    assert.equal(data.months[0].key, '2025-12');
    assert.equal(data.months[0].revenue, '0.00');
    const summary = buildDashboardSummary(data, []);
    assert.equal(summary.months[0].month.key, '2025-12');
    assert.equal(summary.months[0].plannedCents, 500n);
    assert.equal(summary.months[0].closingCents, summary.openingCents - 500n);
    assert.equal(summary.months[1].month.key, '2026-01');
    assert.equal(summary.months[1].openingCents, summary.months[0].closingCents);
  });
});

test('planned expense labels name the repeat choices in English and Thai', () => {
  const session = { lang: 'en', email: 'investor@example.com', name: 'Example Investor', path: '/forecast' };
  const english = itemFormPage({ session, forecast: example, csrf: 'token' });
  assert.match(english, /Repeat this expense/);
  assert.match(english, /Monthly/);
  assert.match(english, /Quarterly/);
  assert.match(english, /Yearly/);
  assert.match(english, /Number of times/);
  assert.match(english, /<abbr class="req"/);
  const thai = itemFormPage({ session: { ...session, lang: 'th' }, forecast: example, csrf: 'token' });
  assert.match(thai, /ทำซ้ำรายการนี้/);
  assert.match(thai, /รายเดือน/);
  assert.match(thai, /รายไตรมาส/);
  assert.match(thai, /รายปี/);
  assert.match(thai, /จำนวนครั้ง/);
  const empty = plannedPage({
    session: { ...session, lang: 'th' },
    forecast: { ...example, months: [] },
    csrf: 'token',
  });
  assert.match(empty, /เพิ่มเดือน/);
  assert.match(empty, /ยังไม่มีรายจ่ายประมาณการ/);
  assert.equal(empty.includes('เพิ่มเดือนในหน้ารายรับ'), false);
});
