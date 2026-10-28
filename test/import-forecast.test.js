import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importForecastFile } from '../lib/import-forecast.js';
import { createMemoryStore } from '../lib/memory-store.js';

const repoRoot = path.join(import.meta.dirname, '..');
const examplePath = path.join(repoRoot, 'data', 'forecast.example.json');
const script = path.join(repoRoot, 'scripts', 'import-forecast.js');

test('import refuses a file inside the repository and seeds a store from an outside file', async () => {
  await assert.rejects(
    () => importForecastFile({ filePath: examplePath, repoRoot, store: createMemoryStore() }),
    (error) => error.code === 'INSIDE_REPO',
  );

  const outside = path.join(os.tmpdir(), `forecast-import-${process.pid}.json`);
  const data = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  data.fx.rate = '33.78705';
  fs.writeFileSync(outside, JSON.stringify(data));
  const store = createMemoryStore();
  const result = await importForecastFile({ filePath: outside, repoRoot, store });
  assert.equal(result.months, data.months.length);
  const loaded = await store.loadForecast();
  assert.equal(loaded.company, data.company);
  assert.equal(loaded.fx.rate, '33.78705');
  assert.equal(loaded.months[0].items[0].amount, data.months[0].items[0].amount);
  fs.unlinkSync(outside);
});

test('an ISO fx.updatedAt is stored as its calendar date', async () => {
  const outside = path.join(os.tmpdir(), `forecast-import-date-${process.pid}.json`);
  const data = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  data.fx.updatedAt = '2026-01-01T07:02:00+07:00';
  fs.writeFileSync(outside, JSON.stringify(data));
  const store = createMemoryStore();
  const result = await importForecastFile({ filePath: outside, repoRoot, store });
  assert.equal(result.months, data.months.length);
  const loaded = await store.loadForecast();
  assert.equal(loaded.fx.updatedAt, '2026-01-01');
  assert.equal(loaded.fx.updatedDisplay, data.fx.updatedDisplay);
  fs.unlinkSync(outside);

  const bad = path.join(os.tmpdir(), `forecast-import-date-bad-${process.pid}.json`);
  data.fx.updatedAt = '2026-01-01T25:02:00Z';
  fs.writeFileSync(bad, JSON.stringify(data));
  await assert.rejects(
    () => importForecastFile({ filePath: bad, repoRoot, store: createMemoryStore() }),
    (error) => error.code === 'INVALID' && error.details.includes('fx.updatedAt must be YYYY-MM-DD'),
  );
  fs.unlinkSync(bad);
});

test('the import command does not read a repository file or call the network', () => {
  const refused = spawnSync(process.execPath, [script, examplePath], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /inside the repository/);
  assert.equal(refused.stdout.includes('imported'), false);

  const outside = path.join(os.tmpdir(), `forecast-import-cli-${process.pid}.json`);
  fs.copyFileSync(examplePath, outside);
  const missing = spawnSync(process.execPath, [script, outside], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /not configured/);
  fs.unlinkSync(outside);
});
