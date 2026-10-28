import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRate } from '../lib/forecast.js';
import { bahtText } from '../lib/thai-baht.js';

test('thai baht words follow the usual spelling', () => {
  const cases = [
    [0n, 'ศูนย์บาทถ้วน'],
    [100n, 'หนึ่งบาทถ้วน'],
    [1000n, 'สิบบาทถ้วน'],
    [1100n, 'สิบเอ็ดบาทถ้วน'],
    [2000n, 'ยี่สิบบาทถ้วน'],
    [2100n, 'ยี่สิบเอ็ดบาทถ้วน'],
    [2500n, 'ยี่สิบห้าบาทถ้วน'],
    [10000n, 'หนึ่งร้อยบาทถ้วน'],
    [10100n, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [100000n, 'หนึ่งพันบาทถ้วน'],
    [100100n, 'หนึ่งพันเอ็ดบาทถ้วน'],
    [110000n, 'หนึ่งพันหนึ่งร้อยบาทถ้วน'],
    [1000000n, 'หนึ่งหมื่นบาทถ้วน'],
    [10000000n, 'หนึ่งแสนบาทถ้วน'],
    [100000000n, 'หนึ่งล้านบาทถ้วน'],
    [100000100n, 'หนึ่งล้านเอ็ดบาทถ้วน'],
    [250000000n, 'สองล้านห้าแสนบาทถ้วน'],
    [100050n, 'หนึ่งพันบาทห้าสิบสตางค์'],
    [2105n, 'ยี่สิบเอ็ดบาทห้าสตางค์'],
    [50n, 'ห้าสิบสตางค์'],
    [1n, 'หนึ่งสตางค์'],
    [11n, 'สิบเอ็ดสตางค์'],
  ];
  for (const [cents, words] of cases) {
    assert.equal(bahtText(cents), words);
  }
});

test('fx rates keep extra decimal places', () => {
  assert.equal(canonicalRate('33.78705'), '33.78705');
  assert.equal(canonicalRate('33.78705000'), '33.78705');
  assert.equal(canonicalRate('30.00'), '30.00');
  assert.equal(canonicalRate('30.50'), '30.50');
  assert.equal(canonicalRate('30'), '30.00');
  assert.equal(canonicalRate('0.00'), null);
  assert.equal(canonicalRate('-1.00'), null);
  assert.equal(canonicalRate('33.787050009'), null);
});
