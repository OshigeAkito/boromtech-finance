import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalMonthKey } from '../lib/dates.js';
import { prepareForecastImport } from '../lib/import-forecast.js';
import { parseItem, parseMonth } from '../lib/input.js';
import { createMemoryStore } from '../lib/memory-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, csrfFrom, signIn, withServer } from './helpers.js';

const root = path.join(import.meta.dirname, '..');
const example = JSON.parse(fs.readFileSync(path.join(root, 'data', 'forecast.example.json'), 'utf8'));
const item = { monthKey: '2026-03', amount: '100', name: 'Hosting', group: 'tools', groupName: 'Tools' };

function appWith(store = createMemoryStore(example)) {
  return { app: createApp({ env: baseEnv(), oidc: createFakeOidc(), store }), store };
}

async function postForm(base, jar, pathname, fields) {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

test('a planned expense note keeps its line breaks and still rejects other control characters', () => {
  const twoLines = parseItem({ ...item, note: 'first line\r\nsecond line' });
  assert.equal(twoLines.ok, true);
  assert.equal(twoLines.value.note, 'first line\nsecond line');

  const tab = parseItem({ ...item, note: 'a\tb' });
  assert.equal(tab.ok, false);
  assert.deepEqual(tab.errors.map((error) => [error.field, error.message]), [['note', 'Note is not valid']]);

  const long = parseItem({ ...item, note: 'x'.repeat(2001) });
  assert.deepEqual(long.errors.map((error) => error.message), ['Note is too long']);
});

test('a Buddhist-era month key is stored as the same calendar month', () => {
  assert.equal(canonicalMonthKey('2569-01'), '2026-01');
  assert.equal(canonicalMonthKey('2026-01'), '2026-01');
  assert.equal(canonicalMonthKey('launch'), 'launch');
  assert.equal(parseMonth({ key: '2569-01', revenue: '0' }).value.key, '2026-01');
  assert.equal(parseItem({ ...item, monthKey: '2570-06' }).value.monthKeys[0], '2027-06');

  const twice = structuredClone(example);
  twice.months[1].key = `${Number(twice.months[0].key.slice(0, 4)) + 543}${twice.months[0].key.slice(4)}`;
  const imported = prepareForecastImport(twice);
  assert.equal(imported.ok, false);
  assert.ok(imported.errors.includes('months[1].key is duplicated'));
});

test('the same month typed in either era is one month on the income page and in repeats', async () => {
  const { app } = appWith();
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const csrf = csrfFrom(await (await fetch(`${base}/income`, { headers: { cookie: jar } })).text());
    const firstKey = example.months[0].key;
    const beKey = `${Number(firstKey.slice(0, 4)) + 543}${firstKey.slice(4)}`;

    const duplicate = await postForm(base, jar, '/forecast/months', { csrf, key: beKey, revenue: '0' });
    assert.equal(duplicate.status, 409);

    const added = await postForm(base, jar, '/forecast/months', { csrf, key: '2570-06', revenue: '0' });
    assert.equal(added.status, 303);
    const repeat = await postForm(base, jar, '/forecast/items', {
      csrf, ...item, monthKey: '2027-05', once: 'repeat-once', repeat: 'on', frequency: 'monthly', repeatCount: '3',
    });
    assert.equal(repeat.status, 303);
    const { forecast } = await (await fetch(`${base}/api/forecast`, { headers: { cookie: jar } })).json();
    const keys = forecast.months.map((month) => month.key);
    assert.deepEqual(keys.filter((key) => key === '2027-06'), ['2027-06']);
    assert.equal(keys.includes('2570-06'), false);
    assert.equal(forecast.months.find((month) => month.key === '2027-06').items.length, 1);
  });
});

test('a failed income edit keeps the typed value in that row only', async () => {
  const { app } = appWith();
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const csrf = csrfFrom(await (await fetch(`${base}/income`, { headers: { cookie: jar } })).text());
    const { forecast } = await (await fetch(`${base}/api/forecast`, { headers: { cookie: jar } })).json();
    const [first, second] = forecast.months;
    const failed = await postForm(base, jar, `/forecast/months/${second.id}`, { csrf, key: second.key, revenue: '12,5x' });
    assert.equal(failed.status, 400);
    const html = await failed.text();
    assert.match(html, new RegExp(`id="rev-${second.id}"[^>]*value="12,5x"`));
    assert.match(html, new RegExp(`id="rev-${first.id}"[^>]*value="${first.revenue.replace('.', '\\.')}"`));
  });
});

test('a failed expense save keeps the document prefix in the example number', async () => {
  const store = createMemoryStore(example);
  await store.saveSettings({ ...(await store.loadForecast()), documentPrefix: 'PRE' });
  const { app } = appWith(store);
  await withServer(app, async (base) => {
    const { jar } = await signIn(base, 'allowed');
    const csrf = csrfFrom(await (await fetch(`${base}/actual/new`, { headers: { cookie: jar } })).text());
    const body = new FormData();
    body.set('csrf', csrf);
    const failed = await fetch(`${base}/actual`, { method: 'POST', redirect: 'manual', headers: { cookie: jar }, body });
    assert.equal(failed.status, 400);
    const html = await failed.text();
    assert.match(html, /PRE-0001/);
    assert.equal(html.includes('EXP-0001'), false);
  });
});

test('the notes migration lets the database keep line breaks in notes', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261030120000_multiline_notes.sql'), 'utf8');
  assert.match(sql, /create or replace function finance_private\.need_note\(raw text, max_len integer\)/);
  assert.match(sql, /replace\(value, E'\\n', ''\) ~ '\[\[:cntrl:\]\]'/);
  assert.match(sql, /create or replace function public\.create_actual_expense\(payload jsonb\)[\s\S]*need_note\(payload->>'note', 2000\)/);
  assert.match(sql, /create or replace function public\.create_planned_series\(payload jsonb\)[\s\S]*need_note\(item->>'note', 2000\)/);
  assert.equal(/need_text\([^)]*'note'/.test(sql), false);
  assert.equal(/\bto (anon|authenticated)\b/i.test(sql), false);
  assert.match(sql, /grant execute on function public\.create_actual_expense\(jsonb\) to service_role/);
});

test('the simple planned form turns a date range and repeat into months', () => {
  const base = { name: 'Hosting', value: '100.00', currency: 'THB', monthKey: '2026-01' };
  const keys = (body) => parseItem({ ...base, ...body }).value?.monthKeys;
  assert.deepEqual(keys({ frequency: 'once', endKey: '' }), ['2026-01']);
  assert.deepEqual(keys({ frequency: 'monthly', endKey: '2026-03' }), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(keys({ frequency: 'quarterly', endKey: '2026-08' }), ['2026-01', '2026-04', '2026-07']);
  assert.deepEqual(keys({ frequency: 'yearly', endKey: '2028-01' }), ['2026-01', '2027-01', '2028-01']);
  assert.equal(keys({ frequency: 'monthly', endKey: '2028-12' }).length, 36);

  const fieldsOf = (body) => parseItem({ ...base, ...body }).errors?.map((error) => error.field);
  assert.deepEqual(fieldsOf({ frequency: 'monthly', endKey: '' }), ['endKey']);
  assert.deepEqual(fieldsOf({ frequency: 'monthly', endKey: '2025-12' }), ['endKey']);
  assert.deepEqual(fieldsOf({ frequency: 'monthly', endKey: '2029-01' }), ['endKey']);
});

test('the simple planned form groups by name and counts USD at the Capital rate', () => {
  const groups = new Map([['office rent', { group: 'office', groupName: 'Office' }]]);
  const reused = parseItem({ name: 'Office Rent', value: '5000', currency: 'THB', monthKey: '2026-02' }, 'en', { groups });
  assert.equal(reused.value.group, 'office');
  assert.equal(reused.value.groupName, 'Office');
  assert.equal(reused.value.amount, '5000.00');
  assert.equal(reused.value.usd, null);

  const fresh = parseItem({ name: 'Cloud hosting', value: '1', currency: 'THB', monthKey: '2026-02' });
  assert.equal(fresh.value.group, 'cloud-hosting');
  assert.equal(fresh.value.groupName, 'Cloud hosting');
  const thai = parseItem({ name: 'ค่าเช่าสำนักงาน', value: '1', currency: 'THB', monthKey: '2026-02' });
  assert.match(thai.value.group, /^g[0-9a-f]{12}$/);
  assert.equal(parseItem({ name: 'ค่าเช่าสำนักงาน', value: '2', currency: 'THB', monthKey: '2026-03' }).value.group, thai.value.group);

  const usd = parseItem({ name: 'Domain', value: '12.34', currency: 'USD', monthKey: '2026-02' }, 'en', { usdRate: '33.78705' });
  assert.equal(usd.value.usd, '12.34');
  assert.equal(usd.value.amount, '416.93');
  const noRate = parseItem({ name: 'Domain', value: '12.34', currency: 'USD', monthKey: '2026-02' }, 'en', {});
  assert.deepEqual(noRate.errors.map((error) => error.field), ['currency']);
});
