import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadForecast, parseFxRate, parseMoneyCents, projectMonths, validateForecast } from '../lib/forecast.js';
import { dashboardPage } from '../lib/pages.js';

const examplePath = path.join(import.meta.dirname, '..', 'data', 'forecast.example.json');

test('a decimal-string fixture loads and keeps cents in the running balance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-shape-'));
  const file = path.join(dir, 'forecast.json');
  const fixture = {
    company: 'Fixture Co',
    currency: 'THB',
    registeredCapital: '1000.00',
    openingCapital: {
      amount: '100.50',
      sharePercent: 10,
      assumed: true,
      label: 'เปิดตัวอย่าง',
      timing: 'วันแรก',
    },
    fx: {
      base: 'USD',
      quote: 'THB',
      rate: '30.50',
      source: 'ตัวอย่าง',
      updatedAt: '2026-01-01',
      updatedDisplay: 'ม.ค. 2026',
    },
    balanceFormula: 'previous + revenue - items',
    months: [
      {
        key: '2026-01',
        label: 'ม.ค.',
        labelFull: 'มกราคม 2026',
        revenue: '20.25',
        items: [
          { group: 'a', groupName: 'กลุ่มเอ', name: 'รายการเอ', amount: '10.10', assumed: false },
          { group: 'a', groupName: 'กลุ่มเอ', name: 'รายการบี', amount: '0.15', assumed: true },
          { group: 'b', groupName: 'กลุ่มบี', name: 'รายการซี', amount: '5.00', assumed: false },
        ],
      },
      {
        key: '2026-02',
        label: 'ก.พ.',
        labelFull: 'กุมภาพันธ์ 2026',
        revenue: '0.00',
        items: [
          { group: 'a', groupName: 'กลุ่มเอ', name: 'รายการดี', amount: '1.50', assumed: false },
        ],
      },
    ],
    assumptions: ['ข้อความสมมติฐาน'],
    notYetIncluded: ['ยังไม่รวมตัวอย่าง'],
  };
  fs.writeFileSync(file, JSON.stringify(fixture));

  const loaded = loadForecast({ forecastPath: file, examplePath });
  assert.equal(loaded.example, false);
  const months = projectMonths(loaded.data);
  assert.equal(months[0].openingCents, 10050n);
  assert.equal(months[0].revenueCents, 2025n);
  assert.equal(months[0].spentCents, 1525n);
  assert.equal(months[0].closingCents, 10550n);
  assert.equal(months[1].openingCents, 10550n);
  assert.equal(months[1].closingCents, 10400n);
  assert.deepEqual(months[0].groups.map((group) => group.groupName), ['กลุ่มเอ', 'กลุ่มบี']);
  assert.equal(months[0].groups[0].items.length, 2);

  const html = dashboardPage({
    forecast: loaded.data,
    example: false,
    email: 'investor@example.com',
    name: 'Example Investor',
  });
  assert.match(html, /<span class="label">รายการบี <span class="assumption">assumed<\/span>/);
  assert.equal(html.includes('<span class="label">รายการเอ <span class="assumption">'), false);
  assert.match(html, /Opening capital <span class="assumption">assumed<\/span>/);
  assert.match(html, /<th scope="row">กลุ่มเอ<\/th>/);
  assert.match(html, /<th scope="row">รายการซี<\/th>/);
  assert.match(html, />105\.50</);
  assert.match(html, />104\.00</);
  assert.equal(html.includes('class="example-banner"'), false);
  // Amounts carry no currency suffix; the unit is in the column headings.
  const summary = html.slice(html.indexOf('class="summary"'), html.indexOf('by-item-heading'));
  assert.equal(summary.includes(' THB'), false);
});

test('production schema shape accepts an fx rate with more than two decimal places', () => {
  const shapePath = path.join(import.meta.dirname, 'fixtures', 'schema-shape.json');
  const shape = JSON.parse(fs.readFileSync(shapePath, 'utf8'));
  assert.deepEqual(validateForecast(shape), []);

  const rated = structuredClone(shape);
  rated.fx.rate = '1.23456';
  assert.deepEqual(validateForecast(rated), []);
  assert.equal(parseFxRate('  1.23456  '), '1.23456');
  assert.equal(parseFxRate('1.23000'), '1.23000');
  assert.equal(parseFxRate('30.5'), '30.5');
  assert.equal(parseFxRate('30'), '30');
  assert.equal(parseFxRate('-1.23456'), '-1.23456');
  assert.equal(parseFxRate(1.23456), null);
  assert.equal(parseFxRate(''), null);
  assert.equal(parseFxRate('1.'), null);
  assert.equal(parseFxRate('.5'), null);
  assert.equal(parseFxRate('1.23456abc'), null);
  assert.equal(parseMoneyCents('1.23456'), null);
  assert.equal(parseMoneyCents('1.239'), null);
  assert.equal(parseMoneyCents('1.23'), 123n);

  const badAmount = structuredClone(rated);
  badAmount.months[0].items[0].amount = '1.23456';
  assert.deepEqual(validateForecast(badAmount), ['months[0].items[0].amount must be a decimal string']);

  const badCapital = structuredClone(rated);
  badCapital.registeredCapital = '1.234';
  assert.ok(validateForecast(badCapital).includes('registeredCapital must be a decimal string'));

  const badOpening = structuredClone(rated);
  badOpening.openingCapital.amount = '1.234';
  assert.ok(validateForecast(badOpening).includes('openingCapital.amount must be a decimal string'));

  const badRevenue = structuredClone(rated);
  badRevenue.months[0].revenue = '1.234';
  assert.ok(validateForecast(badRevenue).includes('months[0].revenue must be a decimal string'));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-fx-'));
  const file = path.join(dir, 'forecast.json');
  fs.writeFileSync(file, JSON.stringify(rated));
  const loaded = loadForecast({ forecastPath: file, examplePath });
  assert.equal(loaded.example, false);
  assert.equal(loaded.data.fx.rate, '1.23456');
  const months = projectMonths(loaded.data);
  assert.equal(months[0].openingCents, 0n);
  assert.equal(months[0].revenueCents, 0n);
  assert.equal(months[0].spentCents, 0n);
  assert.equal(months[0].closingCents, 0n);

  const html = dashboardPage({
    forecast: loaded.data,
    example: false,
    email: 'investor@example.com',
    name: 'Example Investor',
  });
  assert.match(html, /1 &lt;base&gt; = 1\.23456 &lt;quote&gt; · Source: &lt;source&gt; · &lt;updatedDisplay&gt;/);
  assert.equal(html.includes('1.23 &lt;quote&gt;'), false);
  assert.match(html, />0\.00</);
});
