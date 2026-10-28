import assert from 'node:assert/strict';
import test from 'node:test';
import { emailAllowed, parseAllowlist, readConfig } from '../lib/config.js';

test('allowlist parsing trims, lowercases, and drops empty items', () => {
  assert.deepEqual(parseAllowlist('  A@Example.com, , b@example.com '), ['a@example.com', 'b@example.com']);
  assert.equal(emailAllowed(['a@example.com'], ' A@Example.com '), true);
  assert.equal(emailAllowed(['a@example.com'], 'other@example.com'), false);
});

test('readConfig fails closed when a required value is blank', () => {
  const config = readConfig({
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    SESSION_SECRET: '   ',
    ALLOWED_EMAILS: 'person@example.com',
    BASE_URL: 'https://app.example/',
  });
  assert.equal(config.ok, false);
  assert.deepEqual(config.missing, ['SESSION_SECRET']);
  assert.equal(config.baseUrl, 'https://app.example');
  assert.equal(config.missing.includes('SUPABASE_URL'), false);
  assert.equal(config.supabaseUrl, '');
  assert.equal(config.supabaseServiceRoleKey, '');
});
