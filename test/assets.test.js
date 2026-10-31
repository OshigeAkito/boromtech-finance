import assert from 'node:assert/strict';
import test from 'node:test';
import { assetPath, assetType } from '../lib/assets.js';

test('asset paths stay inside their public folder', () => {
  assert.equal(assetPath('office', '/office.css'), 'office/office.css');
  assert.equal(assetPath('office', '/fonts/bricolage-700-latin.woff2'), 'office/fonts/bricolage-700-latin.woff2');
  for (const rest of ['/../server.js', '/%2e%2e/server.js', '/fonts/../../.env', '/.hidden.css', '/a//b.css', '/x\\y.css', '/', '/%E0%A4%A.css', '/notes.md']) {
    assert.equal(assetPath('office', rest), null, rest);
  }
});

test('asset types cover what public/ serves', () => {
  assert.match(assetType('a.css'), /text\/css/);
  assert.match(assetType('a.js'), /javascript/);
  assert.equal(assetType('a.woff2'), 'font/woff2');
  assert.equal(assetType('a.svg'), 'image/svg+xml');
  assert.equal(assetType('a.json'), null);
});
