import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SINGLE_APPROVER_MAX_BAHT,
  advanceLimitLabel,
  approvalRuleLines,
  buildAdvanceSteps,
  canApprove,
  canSeeCashflowSummary,
  parseOfficeRoleAssignments,
  requiredApprovers,
  resolveOfficeRole,
  visibleFinanceScope,
} from '../lib/office-access.js';
test('requiredApprovers uses one director up to 10,000 and both above it', () => {
  assert.deepEqual(requiredApprovers(0), { count: 1, rule: 'one-director' });
  assert.deepEqual(requiredApprovers(1), { count: 1, rule: 'one-director' });
  assert.deepEqual(requiredApprovers(SINGLE_APPROVER_MAX_BAHT), { count: 1, rule: 'one-director' });
  assert.deepEqual(requiredApprovers(10_000), { count: 1, rule: 'one-director' });
  assert.deepEqual(requiredApprovers('10,000'), { count: 1, rule: 'one-director' });
  assert.deepEqual(requiredApprovers('฿10000'), { count: 1, rule: 'one-director' });
  assert.deepEqual(requiredApprovers(10_000.01), { count: 2, rule: 'both-directors' });
  assert.deepEqual(requiredApprovers(10_001), { count: 2, rule: 'both-directors' });
  assert.deepEqual(requiredApprovers('25,000'), { count: 2, rule: 'both-directors' });
  assert.throws(() => requiredApprovers(-1), RangeError);
  assert.throws(() => requiredApprovers(''), TypeError);
  assert.throws(() => requiredApprovers('free'), TypeError);
  assert.throws(() => requiredApprovers(null), TypeError);
});

test('canApprove rejects the payer and missing identities', () => {
  assert.equal(canApprove('ผู้ก่อการ A', 'กรรมการ X'), true);
  assert.equal(canApprove('ผู้ก่อการ A', 'ผู้ก่อการ A'), false);
  assert.equal(canApprove('  ผู้ก่อการ A  ', 'ผู้ก่อการ a'), false);
  assert.equal(canApprove('กรรมการ X', 'กรรมการ  X'), false);
  assert.equal(canApprove('', 'กรรมการ X'), false);
  assert.equal(canApprove('ผู้ก่อการ A', ''), false);
  assert.equal(canApprove(null, 'กรรมการ X'), false);
  assert.equal(canApprove('ผู้ก่อการ A', 'ผู้ก่อการ B'), true);
});

test('sample advance steps follow the signing rule and skip the payer', () => {
  const directors = ['กรรมการ X', 'กรรมการ Y'];
  const small = buildAdvanceSteps({ amount: 10_000, payer: 'ผู้ก่อการ A', directors });
  assert.equal(small.count, 1);
  assert.deepEqual(small.steps.map((step) => [step.label, step.state]), [
    ['ยื่นใบทดรองจ่าย', 'done'],
    ['กรรมการลงนาม 1 คน · กรรมการ X', 'pending'],
    ['จ่ายคืนผู้ก่อการ', 'upcoming'],
  ]);

  const large = buildAdvanceSteps({ amount: 10_001, payer: 'ผู้ก่อการ B', directors });
  assert.equal(large.count, 2);
  assert.deepEqual(large.steps.map((step) => step.label), [
    'ยื่นใบทดรองจ่าย',
    'กรรมการคนที่ 1 ลงนาม · กรรมการ X',
    'กรรมการคนที่ 2 ลงนาม · กรรมการ Y',
    'จ่ายคืนผู้ก่อการ',
  ]);
  assert.deepEqual(large.steps.map((step) => step.state), ['done', 'done', 'pending', 'upcoming']);

  const payerIsDirector = buildAdvanceSteps({ amount: 8_000, payer: 'กรรมการ X', directors });
  assert.deepEqual(payerIsDirector.approvers, ['กรรมการ Y']);
  assert.equal(canApprove('กรรมการ X', payerIsDirector.approvers[0]), true);

  assert.throws(
    () => buildAdvanceSteps({ amount: 20_000, payer: 'กรรมการ X', directors: ['กรรมการ X'] }),
    /not enough approvers/,
  );
});

test('approval copy stays tied to the 10,000 baht threshold', () => {
  assert.deepEqual(approvalRuleLines(), [
    'เกิน 10,000 บาท: ลงนามครบ 2 คน',
    'ไม่เกิน 10,000 บาท: ลงนาม 1 คน',
    'ผู้ทดรองจ่ายกับผู้อนุมัติต้องเป็นคนละคน (อนุมัติตัวเองไม่ได้)',
  ]);
  assert.equal(advanceLimitLabel(10_000), 'ไม่เกิน 10,000 บาท');
  assert.equal(advanceLimitLabel(10_001), 'เกิน 10,000 บาท');
});

test('allowlisted emails default to founder unless OFFICE_ROLES says otherwise', () => {
  const assignments = parseOfficeRoleAssignments(
    ' staff@example.com : employee , director@example.com:director , expert@example.com:expert , nope , bad@example.com:intern ',
  );
  assert.deepEqual(assignments, {
    'staff@example.com': 'employee',
    'director@example.com': 'director',
    'expert@example.com': 'expert',
  });
  assert.equal(resolveOfficeRole('Founder@Example.com', assignments), 'founder');
  assert.equal(resolveOfficeRole('staff@example.com', assignments), 'employee');
  assert.equal(resolveOfficeRole('director@example.com', assignments), 'director');
  assert.equal(resolveOfficeRole('expert@example.com', assignments), 'expert');
  assert.equal(parseOfficeRoleAssignments('').constructor, Object);
  assert.equal(Object.keys(parseOfficeRoleAssignments('')).length, 0);
});

test('cashflow visibility is executives only; later scopes stay narrow', () => {
  assert.equal(canSeeCashflowSummary('founder'), true);
  assert.equal(canSeeCashflowSummary('director'), true);
  assert.equal(canSeeCashflowSummary('employee'), false);
  assert.equal(canSeeCashflowSummary('expert'), false);
  assert.equal(visibleFinanceScope('employee'), 'own-claims');
  assert.equal(visibleFinanceScope('expert'), 'own-payment-status');
  assert.equal(visibleFinanceScope('guest'), 'none');
});
