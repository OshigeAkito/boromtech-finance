import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sql = fs.readFileSync(path.join(import.meta.dirname, '..', 'supabase', 'migrations', '20261028180000_office_expense_fields.sql'), 'utf8');

test('the office migration only adds columns and does not seed or open the database', () => {
  assert.match(sql, /add column if not exists payer/);
  assert.match(sql, /add column if not exists created_by/);
  assert.match(sql, /add column if not exists advance/);
  assert.match(sql, /create or replace function public\.load_forecast/);
  assert.match(sql, /create or replace function public\.create_actual_expense/);
  assert.equal(/insert into public\.(settings|months|notes|forecast_items)/i.test(sql), false);
  assert.equal(/create policy/i.test(sql), false);
  assert.equal(/\bto anon\b/i.test(sql), false);
  assert.equal(/\bto authenticated\b/i.test(sql), false);
  assert.equal(/drop table/i.test(sql), false);
});
