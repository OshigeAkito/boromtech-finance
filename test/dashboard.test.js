import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { chartAxis } from '../lib/chart.js';
import { formatCents, summarizeForecast } from '../lib/forecast.js';
import { dashboardPage } from '../lib/pages.js';

const examplePath = path.join(import.meta.dirname, '..', 'data', 'forecast.example.json');
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
const script = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'dashboard', 'dashboard.js'), 'utf8');

function forecast(overrides) {
  return {
    company: 'Fixture Co',
    currency: 'THB',
    registeredCapital: '1000.00',
    openingCapital: {
      amount: '1.00',
      sharePercent: 10,
      assumed: false,
      label: 'เปิดตัวอย่าง',
      timing: 'วันแรก',
    },
    fx: {
      base: 'USD',
      quote: 'THB',
      rate: '30.50',
      source: 'แหล่งตัวอย่าง',
      updatedAt: '2026-01-01',
      updatedDisplay: 'ม.ค. 2026',
    },
    balanceFormula: 'opening + revenue - cash out',
    months: [],
    assumptions: ['สมมติฐานตัวอย่าง'],
    notYetIncluded: ['ยังไม่รวมตัวอย่าง'],
    ...overrides,
  };
}

test('example balances, totals, and per-group totals stay in satang', () => {
  const summary = summarizeForecast(example);
  assert.equal(summary.monthCount, example.months.length);
  assert.equal(summary.openingCents, 100000000n);
  assert.deepEqual(summary.months.map((row) => row.closingCents), [87000000n, 80000000n, 68000000n]);
  assert.deepEqual(summary.months.map((row) => row.revenueCents), [0n, 5000000n, 0n]);
  assert.deepEqual(summary.months.map((row) => row.spentCents), [13000000n, 12000000n, 12000000n]);
  assert.equal(summary.totalRevenueCents, 5000000n);
  assert.equal(summary.totalSpentCents, 37000000n);
  assert.equal(summary.endingCents, summary.openingCents + summary.totalRevenueCents - summary.totalSpentCents);
  assert.equal(summary.endingCents, 68000000n);
  assert.equal(summary.endingCents, summary.months.at(-1).closingCents);
  const closingSum = summary.months.reduce((sum, row) => sum + row.closingCents, 0n);
  assert.notEqual(summary.endingCents, closingSum);

  assert.deepEqual(summary.groups.map((group) => [group.key, group.label, group.totalCents, group.assumed]), [
    ['place', 'ค่าเช่าสำนักงานตัวอย่าง', 6000000n, false],
    ['team', 'เงินเดือนทีมตัวอย่าง', 27000000n, false],
    ['tools', 'ค่าเครื่องมือตัวอย่าง', 1000000n, true],
    ['market', 'ค่าการตลาดตัวอย่าง', 2000000n, true],
    ['utilities', 'ค่าสาธารณูปโภคตัวอย่าง', 1000000n, false],
  ]);
  assert.equal(summary.groupTotalCents, summary.totalSpentCents);
});

test('balances round to satang instead of binary floating point', () => {
  const data = forecast({
    openingCapital: {
      amount: '0.10',
      sharePercent: 1,
      assumed: false,
      label: 'เปิด',
      timing: 'วันแรก',
    },
    months: [
      {
        key: 'm1',
        label: 'ม.ค.',
        labelFull: 'มกราคม',
        revenue: '0.20',
        items: [
          { group: 'a', groupName: 'กลุ่ม', name: 'รายการ', amount: '0.30', assumed: false },
        ],
      },
    ],
  });
  const summary = summarizeForecast(data);
  assert.equal(summary.months[0].openingCents, 10n);
  assert.equal(summary.months[0].revenueCents, 20n);
  assert.equal(summary.months[0].spentCents, 30n);
  assert.equal(summary.months[0].closingCents, 0n);
  assert.equal(summary.endingCents, 0n);
  assert.equal(formatCents(summary.endingCents), '0.00');
  assert.equal(formatCents(10n), '0.10');
  assert.equal(formatCents(20n), '0.20');
  assert.match(formatCents(123456789n), /^1,234,567\.89$/);
});

test('group rows sum by group and choose a shared name or groupName', () => {
  const data = forecast({
    months: [
      {
        key: 'm1',
        label: 'ม.ค.',
        labelFull: 'มกราคม',
        revenue: '0.00',
        items: [
          { group: 'rent', groupName: 'สถานที่', name: 'ค่าเช่า', amount: '10.00', assumed: false },
          { group: 'rent', groupName: 'สถานที่', name: 'ค่าเช่า', amount: '5.00', assumed: false },
          { group: 'mixed', groupName: 'กลุ่มผสม', name: 'ชื่อหนึ่ง', amount: '1.00', assumed: false },
        ],
      },
      {
        key: 'm2',
        label: 'ก.พ.',
        labelFull: 'กุมภาพันธ์',
        revenue: '4.00',
        items: [
          { group: 'rent', groupName: 'สถานที่', name: 'ค่าเช่า', amount: '2.50', assumed: true },
          { group: 'mixed', groupName: 'กลุ่มผสม', name: 'ชื่อสอง', amount: '1.50', assumed: true },
        ],
      },
    ],
  });
  const summary = summarizeForecast(data);
  assert.equal(summary.monthCount, 2);
  assert.equal(summary.totalRevenueCents, 400n);
  assert.equal(summary.totalSpentCents, 2000n);
  assert.equal(summary.endingCents, 100n + 400n - 2000n);
  assert.equal(summary.months[0].closingCents, -1500n);
  assert.equal(summary.months[1].closingCents, -1500n);
  assert.deepEqual(summary.groups.map((group) => [group.key, group.label, group.totalCents, group.assumed]), [
    ['rent', 'ค่าเช่า', 1750n, false],
    ['mixed', 'กลุ่มผสม', 250n, false],
  ]);
  assert.equal(formatCents(summary.endingCents), '-15.00');
});

test('chart axis covers the series and starts at zero for positive balances', () => {
  const axis = chartAxis([0n, 87000000n, 5000000n, 13000000n]);
  assert.deepEqual(axis.tickCents, [0n, 25000000n, 50000000n, 75000000n, 100000000n]);
  assert.ok(axis.maxCents >= 87000000n);
  assert.equal(axis.minCents, 0n);

  const negative = chartAxis([-150n]);
  assert.equal(negative.maxCents, 0n);
  assert.ok(negative.minCents <= -150n);
  assert.ok(negative.tickCents.includes(0n));

  const flat = chartAxis([0n, 0n]);
  assert.deepEqual(flat.tickCents, [0n, 25n, 50n, 75n, 100n]);
});

test('example dashboard HTML has the chart, expandable table, group totals, and footnotes', () => {
  const html = dashboardPage({
    forecast: example,
    example: true,
    email: 'investor@example.com',
    name: 'Example Investor',
  });
  assert.match(html, /class="example-banner"/);
  // KPI tiles
  assert.match(html, /<p class="kpi-value">฿1,000,000<\/p>/);
  assert.match(html, /<p class="kpi-value">฿370,000<\/p>/);
  assert.match(html, /<p class="kpi-value">฿680,000<\/p>/);
  assert.match(html, /68\.0% of opening capital left/);
  // Balance and spending charts live on separate scales, with hover text on every mark.
  assert.match(html, /data-tip="Opening capital: 1,000,000\.00 THB"/);
  assert.match(html, /data-tip="Jan 2026 · Balance: 870,000\.00 THB"/);
  assert.match(html, /data-tip="Jan 2026 · Expenses 130,000\.00 THB — /);
  assert.equal(html.split('class="hit"').length - 1, 3 + 1 + 3);
  assert.match(html, /<span class="swatch" style="background:#2a78d6"><\/span>ค่าเช่าสำนักงานตัวอย่าง/);
  assert.match(html, /id="chart-tip" role="tooltip" hidden/);
  // Month names come from the 2026-01 style keys, in English.
  assert.match(html, />Jan 2026</);
  assert.match(html, />Feb 2026</);
  assert.match(html, />Mar 2026</);
  assert.match(html, /January 2026 – March 2026 · 3 months/);
  assert.match(html, /<th class="num col-revenue" scope="col">Income<\/th>/);
  assert.match(html, /<th class="num col-cash" scope="col">Expenses<\/th>/);
  assert.match(html, /<th class="num col-capital" scope="col">Month-end balance<\/th>/);
  assert.match(html, /id="expand-all">Expand all</);
  assert.match(html, /id="collapse-all">Collapse all</);
  assert.equal(html.split('aria-expanded="false"').length - 1, 3);
  assert.equal(html.split('▸').length - 1, 3);
  assert.equal(html.includes('▾'), false);

  const summary = html.slice(html.indexOf('class="summary"'), html.indexOf('by-item-heading'));
  assert.match(summary, /Opening capital <span class="assumption">assumed<\/span>[\s\S]*?–[\s\S]*?–[\s\S]*?1,000,000\.00/);
  assert.match(summary, /aria-controls="month-detail-0"/);
  assert.match(summary, /id="month-detail-0" hidden/);
  assert.equal(summary.split('Income: none yet').length - 1, 2);
  assert.match(summary, /<span class="label">Income<\/span><span class="amt">50,000\.00<\/span>/);
  assert.match(summary, /<span class="label">ค่าเครื่องมือตัวอย่าง <span class="assumption">assumed<\/span><\/span><span class="amt">10,000\.00<\/span>/);
  assert.match(summary, /<tr class="total">[\s\S]*?50,000\.00[\s\S]*?370,000\.00[\s\S]*?680,000\.00/);
  assert.equal(summary.includes('2,350,000.00'), false);

  assert.match(html, /Planned expenses by item, 3 months \(THB\)/);
  assert.equal(html.includes('10 months'), false);
  assert.match(html, /<th scope="col">Item<\/th>[\s\S]*?<th class="num" scope="col">Total \(THB\)<\/th>/);
  assert.match(html, /<span class="share-pct">16\.2%<\/span>/);
  assert.match(html, /<th scope="row">ค่าเช่าสำนักงานตัวอย่าง<\/th>[\s\S]*?60,000\.00/);
  assert.match(html, /<th scope="row">ค่าเครื่องมือตัวอย่าง <span class="assumption">assumed<\/span><\/th>/);
  const groups = html.slice(html.indexOf('class="groups"'));
  assert.match(groups, /<tr class="total">[\s\S]*?370,000\.00/);

  assert.match(html, /1 USD = 30\.00 THB · อัตราสมมติสำหรับไฟล์ตัวอย่าง · 1 Jan 2026/);
  for (const note of [...example.assumptions, ...example.notYetIncluded]) {
    assert.equal(html.includes(note), true);
  }
  assert.match(html, /<script src="\/dashboard-assets\/dashboard\.js" defer><\/script>/);
  assert.equal(/<script(?![^>]*\bsrc=)/i.test(html), false);
  assert.equal(/\son[a-z]+=/i.test(html), false);
});

test('the month count in the group heading follows months.length', () => {
  const data = forecast({
    months: [
      {
        key: 'only',
        label: 'เม.ย.',
        labelFull: 'เมษายน',
        revenue: '0.00',
        items: [
          { group: 'once', groupName: '', name: '', amount: '2.00', assumed: false },
        ],
      },
    ],
  });
  const html = dashboardPage({
    forecast: data,
    example: false,
    email: 'investor@example.com',
    name: '',
  });
  assert.match(html, /Planned expenses by item, 1 month \(THB\)/);
  assert.match(html, /<th scope="row">once<\/th>/);
  assert.match(html, /Income: none yet/);
  assert.equal(html.includes('class="example-banner"'), false);
  assert.match(html, /1 USD = 30\.50 THB · แหล่งตัวอย่าง · 1 Jan 2026/);
  // A key that is not a calendar month keeps its stored label.
  assert.match(html, />เม\.ย\.</);
});

test('dashboard script only toggles rows and contains no figures', () => {
  assert.match(script, /Enter/);
  assert.match(script, /event\.key !== ' '/);
  assert.match(script, /preventDefault/);
  assert.match(script, /aria-expanded/);
  assert.match(script, /getElementById\('expand-all'\)/);
  assert.match(script, /getElementById\('collapse-all'\)/);
  assert.match(script, /'▾'/);
  assert.match(script, /'▸'/);
  assert.equal(/\d{4,}/.test(script), false);
  assert.equal(script.includes('@'), false);
});
