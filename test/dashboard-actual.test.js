import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildDashboardSummary } from '../lib/dashboard-cash.js';
import { createMemoryStore } from '../lib/memory-store.js';
import { dashboardPage } from '../lib/pages.js';
import { presentForecast } from '../lib/supabase-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, signIn, withServer } from './helpers.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));

function forecast(months) {
  return {
    company: 'Fixture Co',
    currency: 'THB',
    registeredCapital: '2000.00',
    openingCapital: {
      amount: '1000.00',
      sharePercent: 50,
      shareText: '50.00',
      assumed: false,
      label: '',
      timing: '',
    },
    fx: { base: 'USD', quote: 'THB', rate: '30.00', source: 'fixture', updatedAt: '2026-01-01', updatedDisplay: '1 Jan 2026' },
    balanceFormula: 'opening − spend',
    months,
    assumptions: [],
    notYetIncluded: [],
    documentPrefix: 'EXP',
  };
}

function month(key, items, revenue = '0.00') {
  return { key, label: key, labelFull: key, revenue, items };
}

function item(amount) {
  return { group: 'tools', groupName: 'Tools', name: 'Planned item', amount, assumed: false, note: '' };
}

function actual(spentOn, amount, extra = {}) {
  return {
    spentOn,
    amount,
    itemName: 'Synthetic payment',
    documentNo: 'EXP-0001',
    periodFrom: '2026-11-01',
    periodTo: '2026-11-30',
    foreignAmount: '999.00',
    ...extra,
  };
}

test('actuals are grouped by payment month and replace planned spend in the balance', () => {
  const summary = buildDashboardSummary(forecast([
    month('2026-01', [item('200.00')]),
    month('2026-02', [item('80.00')]),
  ]), [
    actual('2026-01-15', '50.00'),
    actual('2026-03-02', '10.00', { documentNo: 'EXP-0002', itemName: 'March payment' }),
  ]);
  assert.deepEqual(summary.months.map((row) => row.month.key), ['2026-01', '2026-02', '2026-03']);
  assert.equal(summary.months[0].usesActual, true);
  assert.equal(summary.months[0].actualCents, 5000n);
  assert.equal(summary.months[0].plannedCents, 20000n);
  assert.equal(summary.months[0].closingCents, 95000n);
  assert.equal(summary.months[1].usesActual, false);
  assert.equal(summary.months[1].spendCents, 8000n);
  assert.equal(summary.months[1].closingCents, 87000n);
  assert.equal(summary.months[2].plannedCents, 0n);
  assert.equal(summary.months[2].actualCents, 1000n);
  assert.equal(summary.months[2].closingCents, 86000n);
  assert.equal(summary.endingCents, 86000n);
  assert.equal(summary.totalActualCents, 6000n);
  assert.equal(summary.totalPlannedCents, 28000n);
});

test('with no forecast months an actual still reduces opening capital', () => {
  const summary = buildDashboardSummary(forecast([]), [actual('2026-10-23', '100.00')]);
  assert.equal(summary.forecastMonthCount, 0);
  assert.equal(summary.months.length, 1);
  assert.equal(summary.months[0].month.key, '2026-10');
  assert.equal(summary.months[0].plannedCents, 0n);
  assert.equal(summary.months[0].actualCents, 10000n);
  assert.equal(summary.months[0].revenueCents, 0n);
  assert.equal(summary.months[0].closingCents, 90000n);
  assert.equal(summary.endingCents, 90000n);
});

test('dashboard labels name actual and planned in English and Thai', () => {
  const data = forecast([]);
  const expenses = [actual('2026-10-23', '100.00')];
  const english = dashboardPage({
    forecast: data,
    actuals: expenses,
    example: false,
    email: 'investor@example.com',
    name: 'Example Person',
    lang: 'en',
  });
  assert.match(english, /Actual spent/);
  assert.match(english, /Actual and planned by month/);
  assert.match(english, /grouped by the payment date/);
  assert.match(english, />Oct 2026</);
  assert.match(english, /No forecast months/);
  assert.match(english, /100\.00/);
  assert.match(english, /900\.00/);
  const thai = dashboardPage({
    forecast: data,
    actuals: expenses,
    example: false,
    email: 'investor@example.com',
    name: 'Example Person',
    lang: 'th',
  });
  assert.match(thai, /จ่ายจริง/);
  assert.match(thai, /ประมาณการ/);
  assert.match(thai, /ตามเดือนของวันที่จ่าย/);
  assert.match(thai, />ต\.ค\. 69</);
});

test('the dashboard route shows an actual when the forecast has no months', async () => {
  const store = createMemoryStore(example);
  const loaded = await store.loadForecast();
  for (const month of loaded.months) await store.deleteMonth(month.id);
  await store.createActual({
    spentOn: '2026-10-23',
    itemName: 'Synthetic October expense',
    category: 'software',
    categoryOther: '',
    vendor: 'Example Vendor',
    periodNone: false,
    periodText: '1 month',
    periodFrom: '2026-11-01',
    periodTo: '2026-11-30',
    amount: '100.00',
    vatMode: 'foreign',
    foreignCurrency: 'USD',
    foreignAmount: '999.00',
    foreignRate: '33.00',
    payer: 'Example Payer',
    paymentMethods: ['cash'],
    paymentOther: '',
    receiptNo: 'INV-1',
    receiptName: 'company',
    receiptNameOther: '',
    transferRights: false,
    transferAsset: '',
    note: '',
    createdBy: 'investor@example.com',
  }, []);
  const app = createApp({
    env: baseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-should-not-leak',
    }),
    oidc: createFakeOidc(),
    store,
  });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const html = await (await fetch(`${base}/`, { headers: { cookie: result.jar } })).text();
    assert.match(html, /Synthetic October expense/);
    assert.match(html, /Oct 2026/);
    assert.match(html, /100\.00/);
    assert.match(html, /999,900\.00/);
    assert.equal(html.includes('Nov 2026'), false);
    assert.equal(html.includes('999.00'), false);
  });
});

test('a missing global exchange rate does not stop the forecast from loading', () => {
  const raw = {
    company: 'Fixture Co',
    currency: 'THB',
    registeredCapital: '1000.00',
    openingCapital: { amount: '100.00', sharePercent: '40.00', assumed: false, label: '', timing: '' },
    balanceFormula: 'opening − spend',
    months: [],
    assumptions: [],
    notYetIncluded: [],
    documentPrefix: 'EXP',
  };
  for (const fx of [undefined, null, { rate: '' }, { rate: 'nope' }, { base: 'USD', quote: 'THB', rate: '33.50' }]) {
    const forecast = presentForecast({ ...raw, fx });
    assert.equal(forecast.company, 'Fixture Co');
    assert.equal(typeof forecast.fx.rate, 'string');
  }
  assert.equal(presentForecast({ ...raw, fx: { rate: '' } }).fx.rate, '');
  assert.equal(presentForecast({ ...raw, fx: { rate: '33.50' } }).fx.rate, '33.50');
});
