import assert from 'node:assert/strict';
import test from 'node:test';
import { parseActual } from '../lib/input.js';

function expense(overrides = {}) {
  return {
    spentOn: '2026-10-28',
    itemName: 'Synthetic office supply',
    category: 'software',
    vendor: 'Example Vendor',
    amount: '100.00',
    vatMode: 'excluded',
    payer: 'Example Payer',
    payCard: 'on',
    receiptNo: 'INV-1',
    receiptName: 'company',
    transferRights: 'no',
    note: '',
    ...overrides,
  };
}

test('a blank length is filled from the dates and a typed length is kept', () => {
  const derived = parseActual(expense({
    periodText: '',
    periodFrom: '2026-10-23',
    periodTo: '2026-11-23',
  }));
  assert.equal(derived.ok, true);
  assert.equal(derived.value.periodNone, false);
  assert.equal(derived.value.periodFrom, '2026-10-23');
  assert.equal(derived.value.periodTo, '2026-11-23');
  assert.equal(derived.value.periodText, '1 month');

  const thai = parseActual(expense({
    periodText: '   ',
    periodFrom: '2026-10-23',
    periodTo: '2026-11-23',
  }), 'th');
  assert.equal(thai.ok, true);
  assert.equal(thai.value.periodText, '1 เดือน');

  const typed = parseActual(expense({
    periodText: ' 1 year ',
    periodFrom: '2026-10-23',
    periodTo: '2026-11-23',
  }));
  assert.equal(typed.ok, true);
  assert.equal(typed.value.periodText, '1 year');

  const year = parseActual(expense({
    periodText: '',
    periodFrom: '2026-10-23',
    periodTo: '2027-10-23',
  }));
  assert.equal(year.value.periodText, '1 year');
  const days = parseActual(expense({
    periodText: '',
    periodFrom: '2026-10-23',
    periodTo: '2026-10-23',
  }));
  assert.equal(days.value.periodText, '1 day');
});

test('period and note errors name the field that failed', () => {
  const backwards = parseActual(expense({
    periodText: '',
    periodFrom: '2026-11-23',
    periodTo: '2026-10-23',
  }));
  assert.equal(backwards.ok, false);
  assert.deepEqual(backwards.errors.map((error) => error.message), [
    'The end date must be on or after the start date',
  ]);

  const missing = parseActual(expense({ periodText: '', periodFrom: '', periodTo: '' }));
  assert.match(missing.errors[0].message, /start and end dates/);

  const long = parseActual(expense({
    periodText: 'x'.repeat(41),
    periodFrom: '2026-10-23',
    periodTo: '2026-11-23',
  }));
  assert.deepEqual(long.errors.map((error) => error.message), ['Length must be at most 40 characters']);

  const noted = parseActual(expense({ periodNone: 'on', note: 'First line\nSecond line' }));
  assert.equal(noted.ok, true);
  assert.equal(noted.value.note, 'First line\nSecond line');
  assert.equal(noted.value.periodNone, true);
  assert.equal(noted.value.periodText, '');
  assert.equal(noted.value.periodFrom, null);
  assert.equal(noted.value.periodTo, null);

  const tooLong = parseActual(expense({ periodNone: 'on', note: 'x'.repeat(2001) }));
  assert.equal(tooLong.errors[0].message, 'Note is too long');
});
