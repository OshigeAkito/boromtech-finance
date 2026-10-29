import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.join(import.meta.dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261028120000_init.sql'), 'utf8');
const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
const clientFiles = [
  'public/dashboard/dashboard.js',
  'public/app/print.js',
  'public/app/manage.js',
  'public/app/manage.css',
  'public/app/print.css',
  'public/login/login.css',
];

test('the migration locks every table and does not grant browser roles', () => {
  assert.equal((sql.match(/enable row level security/gi) || []).length, 7);
  assert.equal((sql.match(/force row level security/gi) || []).length, 7);
  assert.equal(/create policy/i.test(sql), false);
  assert.equal(/\bto anon\b/i.test(sql), false);
  assert.equal(/\bto authenticated\b/i.test(sql), false);
  assert.match(sql, /numeric\(14,\s*2\)/);
  assert.match(sql, /numeric\(16,\s*8\)/);
  assert.match(sql, /receipts/);
  assert.match(sql, /public = false|public, false/);
  assert.match(sql, /service_role/);
});

test('render no longer mounts a forecast secret file', () => {
  assert.equal(/FORECAST_PATH/.test(render), false);
  assert.equal(/forecast\.json/.test(render), false);
  assert.match(render, /key: SUPABASE_URL[\s\S]*?sync: false/);
  assert.match(render, /key: SUPABASE_SERVICE_ROLE_KEY[\s\S]*?sync: false/);
});

test('browser assets do not mention supabase', () => {
  for (const file of clientFiles) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').toLowerCase();
    assert.equal(text.includes('supabase'), false, file);
    assert.equal(text.includes('service_role'), false, file);
  }
});
