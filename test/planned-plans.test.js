import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createMemoryStore } from '../lib/memory-store.js';
import { plannedPlans } from '../lib/planned-plans.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, csrfFrom, signIn, withServer } from './helpers.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));

function forecastWith(rows) {
  const months = new Map();
  rows.forEach(([key, name, amount], index) => {
    if (!months.has(key)) months.set(key, { id: `m-${key}`, key, items: [] });
    months.get(key).items.push({ id: `r${index}`, name, amount, usd: null, group: 'g', groupName: 'G' });
  });
  return { months: [...months.values()] };
}

test('stored rows are read back as one plan per expense', () => {
  const plans = plannedPlans(forecastWith([
    ['2026-01', 'Rent', '100.00'], ['2026-02', 'Rent', '100.00'], ['2026-03', 'Rent', '100.00'],
    ['2026-01', 'Audit', '50.00'], ['2026-04', 'Audit', '50.00'],
    ['2026-02', 'Domain', '9.00'],
    ['2026-05', 'Rent', '100.00'],
    ['2026-03', 'Rent', '120.00'],
  ]));
  const shape = plans.map((plan) => [plan.name, plan.frequency, plan.startKey, plan.endKey, plan.count]);
  assert.deepEqual(shape, [
    ['Audit', 'quarterly', '2026-01', '2026-04', 2],
    ['Rent', 'monthly', '2026-01', '2026-03', 3],
    ['Domain', 'once', '2026-02', '2026-02', 1],
    ['Rent', 'once', '2026-03', '2026-03', 1],
    ['Rent', 'once', '2026-05', '2026-05', 1],
  ]);
});

test('a planned expense is listed once and edited or deleted as a whole', async () => {
  const store = createMemoryStore(example);
  const app = createApp({
    env: baseEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests' }),
    oidc: createFakeOidc(),
    store,
  });
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const get = (pathname) => fetch(`${base}${pathname}`, { headers: { cookie: jar } });
    const post = (pathname, fields) => fetch(`${base}${pathname}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    });
    const form = await (await get('/forecast/items/new')).text();
    const once = form.match(/name="once" value="([^"]+)"/)[1];
    const created = await post('/forecast/items', {
      csrf: csrfFrom(form), once, monthKey: '2026-04', frequency: 'monthly', endKey: '2026-06', name: 'Synthetic plan', value: '10.00', currency: 'THB',
    });
    assert.equal(created.status, 303);

    const list = await (await get('/forecast')).text();
    assert.equal((list.match(/>Synthetic plan</g) || []).length, 1);
    assert.match(list, /Apr 2026 – Jun 2026/);
    assert.match(list, /Monthly <span class="hint">· 3×/);
    const href = list.match(/href="(\/forecast\/plans\/[^"]+)">Synthetic plan</)[1];

    const edit = await (await get(href)).text();
    assert.match(edit, /name="frequency" value="monthly" checked/);
    assert.match(edit, /name="endKey"[^>]*value="2026-06"/);
    const saved = await post(href, {
      csrf: csrfFrom(edit),
      once: edit.match(/name="once" value="([^"]+)"/)[1],
      group: edit.match(/name="group" value="([^"]*)"/)[1],
      groupName: edit.match(/name="groupName" value="([^"]*)"/)[1],
      note: '',
      monthKey: '2026-04', frequency: 'quarterly', endKey: '2026-10', name: 'Synthetic plan', value: '12.00', currency: 'THB',
    });
    assert.equal(saved.status, 303);
    const keys = () => store.loadForecast().then((data) => data.months
      .filter((month) => month.items.some((item) => item.name === 'Synthetic plan'))
      .map((month) => [month.key, month.items.find((item) => item.name === 'Synthetic plan').amount]));
    assert.deepEqual(await keys(), [['2026-04', '12.00'], ['2026-07', '12.00'], ['2026-10', '12.00']]);

    const again = await (await get('/forecast')).text();
    const next = again.match(/href="(\/forecast\/plans\/[^"]+)">Synthetic plan</)[1];
    const removed = await post(`${next}/delete`, { csrf: csrfFrom(again), confirm: 'yes' });
    assert.equal(removed.status, 303);
    assert.deepEqual(await keys(), []);
  });
});
