import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateForecast } from '../lib/forecast.js';
import { prepareForecastImport } from '../lib/import-forecast.js';
import { parseItem } from '../lib/input.js';
import { createMemoryStore } from '../lib/memory-store.js';
import { presentForecast } from '../lib/supabase-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, csrfFrom, signIn, withServer } from './helpers.js';

const root = path.join(import.meta.dirname, '..');
const example = JSON.parse(fs.readFileSync(path.join(root, 'data', 'forecast.example.json'), 'utf8'));
const MONTH = '11111111-1111-4111-8111-111111111111';

function withUsd(value) {
  const data = structuredClone(example);
  data.months[0].items[0].usd = value;
  return data;
}

test('import keeps an optional usd amount and rejects a bad one', () => {
  const ok = prepareForecastImport(withUsd('12.00'));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.months[0].items[0].usd, '12.00');
  assert.equal(ok.value.months[0].items[1].usd, null);

  const bad = prepareForecastImport(withUsd('12.345'));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((message) => /usd/.test(message)));

  assert.deepEqual(validateForecast(withUsd('12.00')), []);
  assert.ok(validateForecast(withUsd('twelve')).some((message) => /usd/.test(message)));
});

test('the item form treats a blank usd as none and validates a filled one', () => {
  const base = { monthId: MONTH, group: 'tools', groupName: 'เครื่องมือ', name: 'รายการ', amount: '405.44' };
  assert.equal(parseItem({ ...base, usd: '' }).value.usd, null);
  assert.equal(parseItem({ ...base, usd: ' 12 ' }).value.usd, '12.00');
  const bad = parseItem({ ...base, usd: '-1' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((error) => error.field === 'usd'));
});

test('supabase reads present usd as a decimal string or null', () => {
  const view = presentForecast({
    ...example,
    months: [{
      id: MONTH,
      key: 'm1',
      label: 'ม.ค.',
      labelFull: 'มกราคม',
      revenue: '0.00',
      items: [
        { id: 'a', group: 'g', groupName: 'G', name: 'มี', amount: '405.44', usd: '12', assumed: false, note: '' },
        { id: 'b', group: 'g', groupName: 'G', name: 'ไม่มี', amount: '1.00', usd: null, assumed: false, note: '' },
      ],
    }],
  });
  assert.equal(view.months[0].items[0].usd, '12.00');
  assert.equal(view.months[0].items[1].usd, null);
});

test('usd entered on the web shows beside the baht amount and stays out of totals', async () => {
  const store = createMemoryStore(example);
  const app = createApp({
    env: baseEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x' }),
    oidc: createFakeOidc(),
    store,
  });
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const page = await (await fetch(`${base}/forecast/items/new`, { headers: { cookie: jar } })).text();
    assert.match(page, /name="usd"/);
    const before = await store.loadForecast();
    const body = new URLSearchParams({
      csrf: csrfFrom(page),
      monthId: before.months[0].id,
      group: 'tools',
      groupName: 'ค่าเครื่องมือตัวอย่าง',
      name: 'ซอฟต์แวร์ดอลลาร์',
      amount: '405.44',
      usd: '12.00',
    });
    const created = await fetch(`${base}/forecast/items`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    assert.equal(created.status, 303);
    const after = await store.loadForecast();
    const item = after.months[0].items.find((entry) => entry.name === 'ซอฟต์แวร์ดอลลาร์');
    assert.equal(item.usd, '12.00');

    const dashboard = await (await fetch(`${base}/`, { headers: { cookie: jar } })).text();
    assert.match(dashboard, /405\.44<span class="usd">US\$12\.00<\/span>/);
    const forecast = await (await fetch(`${base}/forecast`, { headers: { cookie: jar } })).text();
    assert.match(forecast, /US\$12\.00/);
    const edit = await (await fetch(`${base}/forecast/items/${item.id}`, { headers: { cookie: jar } })).text();
    assert.match(edit, /name="usd" type="text" value="12\.00"/);
  });
});

test('the usd migration adds the column and carries it through import and load', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261028150000_forecast_item_usd.sql'), 'utf8');
  assert.match(sql, /add column if not exists usd numeric\(14, 2\)/);
  assert.match(sql, /create or replace function public\.replace_forecast/);
  assert.match(sql, /create or replace function public\.load_forecast/);
  assert.match(sql, /'usd', i\.usd::text/);
  assert.match(sql, /amount, usd, assumed/);
  assert.equal(/create policy|to anon|to authenticated/i.test(sql), false);
});
