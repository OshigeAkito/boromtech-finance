import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EXAMPLE_BANNER } from '../lib/forecast.js';

const script = path.join(import.meta.dirname, '..', 'scripts', 'check-forecast.js');
const examplePath = path.join(import.meta.dirname, '..', 'data', 'forecast.example.json');

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('the committed example file passes the checker and is marked as an example', () => {
  const result = run(['--example', examplePath]);
  assert.equal(result.status, 0, result.stderr);
  const text = fs.readFileSync(examplePath, 'utf8');
  assert.equal(text.includes(EXAMPLE_BANNER), true);
  const data = JSON.parse(text);
  for (const key of ['company', 'currency', 'registeredCapital', 'openingCapital', 'fx', 'balanceFormula', 'months', 'assumptions', 'notYetIncluded']) {
    assert.ok(Object.prototype.hasOwnProperty.call(data, key), key);
  }
});

test('the checker rejects a file that does not match the schema', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-forecast-'));
  const file = path.join(dir, 'bad.json');
  fs.writeFileSync(file, '{"company":"only"}');
  const result = run([file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /months/);
});

test('example mode rejects disallowed content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-forecast-'));
  const file = path.join(dir, 'marked.json');
  const data = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  data.company = ['125', '000'].join('');
  fs.writeFileSync(file, JSON.stringify(data));
  const result = run(['--example', file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /disallowed content/);
});
