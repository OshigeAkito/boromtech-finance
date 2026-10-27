import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadForecast, projectMonths } from '../lib/forecast.js';
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
  assert.match(html, /รายการบี <span class="assumption">\(สมมติ\)<\/span>/);
  assert.equal(html.includes('รายการเอ <span class="assumption">'), false);
  assert.match(html, /เปิดตัวอย่าง <span class="assumption">\(สมมติ\)<\/span>/);
  assert.match(html, /<h4>กลุ่มเอ<\/h4>/);
  assert.match(html, /<h4>กลุ่มบี<\/h4>/);
  assert.match(html, /105\.50 THB/);
  assert.equal(html.includes('class="example-banner"'), false);
});
