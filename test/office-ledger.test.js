import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOfficeLedger, canViewLedgerRow } from '../lib/office-ledger.js';
import { parseOfficeExpense } from '../lib/office-expense.js';

const forecast = {
  months: [{
    id: '11111111-1111-4111-8111-111111111111',
    key: '2026-10',
    label: 'ต.ค.',
    revenue: '100.00',
    items: [{
      id: '22222222-2222-4222-8222-222222222222',
      name: 'รายการคาดการณ์ทดสอบ',
      amount: '40.00',
      payer: 'ผู้ทดสอบ A',
      advance: true,
      createdBy: 'staff@example.com',
    }],
  }],
};

const actuals = [{
  id: '33333333-3333-4333-8333-333333333333',
  itemName: 'รายการจริงทดสอบ',
  amount: '25.50',
  payer: 'ผู้ทดสอบ B',
  advance: true,
  createdBy: 'boss@example.com',
  spentOn: '2026-10-02',
}];

function ledger(role, email, name = 'ผู้ทดสอบ B') {
  return buildOfficeLedger({
    forecast,
    actuals,
    role,
    email,
    approver: { email, name },
  });
}

test('executive totals are income minus actual spend, without treating forecast as spent', () => {
  const home = ledger('founder', 'boss@example.com');
  assert.equal(home.showCashflow, true);
  assert.equal(home.empty, false);
  assert.equal(home.income, '฿100.00');
  assert.equal(home.actual, '฿25.50');
  assert.equal(home.forecast, '฿40.00');
  assert.equal(home.balance, '฿74.50');
  assert.equal(home.recent.length, 2);
  assert.equal(home.advances.length, 2);
  assert.equal(home.advances[0].approverCount, 1);
  assert.equal(home.awaiting, 1);
});

test('the payer is not counted as waiting to approve their own advance', () => {
  const home = ledger('director', 'boss@example.com', 'ผู้ทดสอบ B');
  assert.equal(home.advances.some((row) => row.payer === 'ผู้ทดสอบ B'), true);
  assert.equal(home.awaiting, 1);
});

test('employees see only claims they created and no company totals', () => {
  const home = ledger('employee', 'staff@example.com', 'พนักงานทดสอบ');
  assert.equal(home.showCashflow, false);
  assert.equal(home.recent.some((row) => row.label.includes('รายการคาดการณ์ทดสอบ')), true);
  assert.equal(home.recent.some((row) => row.label.includes('รายการจริงทดสอบ')), false);
  assert.equal(home.income, '฿100.00');
  assert.equal(canViewLedgerRow('employee', 'staff@example.com', actuals[0]), false);
  assert.equal(canViewLedgerRow('employee', 'staff@example.com', { createdBy: 'staff@example.com', payer: 'คนอื่น' }), true);
});

test('Experts see only their own payment rows', () => {
  const home = ledger('expert', 'staff@example.com');
  assert.equal(home.showCashflow, false);
  assert.equal(home.recent.length, 1);
  assert.equal(home.recent[0].label.includes('รายการคาดการณ์ทดสอบ'), true);
  const byPayer = ledger('expert', 'ผู้ทดสอบ b');
  assert.equal(byPayer.recent.some((row) => row.payer === 'ผู้ทดสอบ B'), true);
});

test('an empty store is an empty ledger', () => {
  const home = buildOfficeLedger({
    forecast: null,
    actuals: [],
    role: 'founder',
    email: 'boss@example.com',
    approver: { email: 'boss@example.com', name: 'ผู้ทดสอบ' },
  });
  assert.equal(home.empty, true);
  assert.equal(home.recent.length, 0);
  assert.equal(home.advances.length, 0);
});

test('the office expense form rejects a blank amount and accepts a fake advance', () => {
  const bad = parseOfficeExpense({ kind: 'actual', itemName: 'ค่าทดสอบ', amount: '0', spentOn: '2026-10-02', payer: 'ผู้ทดสอบ A', vendor: 'ร้านทดสอบ', receiptNo: 'TEST-1' });
  assert.equal(bad.ok, false);
  const ok = parseOfficeExpense({
    kind: 'actual',
    itemName: 'ค่าทดสอบสำนักงาน',
    amount: '12',
    spentOn: '2026-10-02',
    payer: 'ผู้ทดสอบ A',
    vendor: 'ร้านทดสอบ',
    receiptNo: 'TEST-1',
    advance: 'on',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.amount, '12.00');
  assert.equal(ok.value.advance, true);
  const forecast = parseOfficeExpense({ kind: 'forecast', itemName: 'คาดการณ์ทดสอบ', amount: '10.50', spentOn: '2026-10-03' });
  assert.equal(forecast.ok, false);
});
