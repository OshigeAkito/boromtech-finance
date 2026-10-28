// Office portal role hook and advance-payment approval rules.
// The existing Google allowlist is the executive list, so an allowlisted
// email with no OFFICE_ROLES entry is a founder. Assign other roles with
// OFFICE_ROLES=person@example.com:employee,other@example.com:expert
// (founder | director | employee | expert). This does not bypass the allowlist.

export const OFFICE_ROLE = {
  founder: 'founder',
  director: 'director',
  employee: 'employee',
  expert: 'expert',
};

const KNOWN_ROLES = new Set(Object.values(OFFICE_ROLE));
const EXECUTIVE_ROLES = new Set([OFFICE_ROLE.founder, OFFICE_ROLE.director]);

// Up to this amount (inclusive) one authorised director signs. Above it, both do.
export const SINGLE_APPROVER_MAX_BAHT = 10_000;

export function isKnownOfficeRole(role) {
  return KNOWN_ROLES.has(role);
}

export function isExecutiveRole(role) {
  return EXECUTIVE_ROLES.has(role);
}

// Later data scoping: employees see only their own claims, Experts only their own payment status.
export function visibleFinanceScope(role) {
  if (isExecutiveRole(role)) return 'company';
  if (role === OFFICE_ROLE.employee) return 'own-claims';
  if (role === OFFICE_ROLE.expert) return 'own-payment-status';
  return 'none';
}

export function canSeeCashflowSummary(role) {
  return visibleFinanceScope(role) === 'company';
}

export function parseOfficeRoleAssignments(raw) {
  const assignments = {};
  for (const part of String(raw ?? '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const splitAt = trimmed.lastIndexOf(':');
    if (splitAt <= 0) continue;
    const email = trimmed.slice(0, splitAt).trim().toLowerCase();
    const role = trimmed.slice(splitAt + 1).trim().toLowerCase();
    if (!email || !isKnownOfficeRole(role)) continue;
    assignments[email] = role;
  }
  return assignments;
}

export function resolveOfficeRole(email, assignments = {}, options = {}) {
  const defaultRole = options.defaultRole ?? OFFICE_ROLE.founder;
  const key = String(email ?? '').trim().toLowerCase();
  const assigned = key ? assignments[key] : '';
  if (isKnownOfficeRole(assigned)) return assigned;
  return isKnownOfficeRole(defaultRole) ? defaultRole : OFFICE_ROLE.founder;
}

export function formatGroupedBaht(amount) {
  return Number(amount).toLocaleString('en-US');
}

export function approvalRuleLines() {
  const limit = formatGroupedBaht(SINGLE_APPROVER_MAX_BAHT);
  return [
    `เกิน ${limit} บาท: ลงนามครบ 2 คน`,
    `ไม่เกิน ${limit} บาท: ลงนาม 1 คน`,
    'ผู้ทดรองจ่ายกับผู้อนุมัติต้องเป็นคนละคน (อนุมัติตัวเองไม่ได้)',
  ];
}

export function advanceLimitLabel(amount) {
  const need = requiredApprovers(amount);
  const limit = formatGroupedBaht(SINGLE_APPROVER_MAX_BAHT);
  return need.count === 1 ? `ไม่เกิน ${limit} บาท` : `เกิน ${limit} บาท`;
}

// How many authorised directors must sign an advance of `amount` baht.
export function requiredApprovers(amount) {
  const value = parseBaht(amount);
  if (value <= SINGLE_APPROVER_MAX_BAHT) return { count: 1, rule: 'one-director' };
  return { count: 2, rule: 'both-directors' };
}

// The person who paid can never approve their own reimbursement.
export function canApprove(payer, approver) {
  const left = personKey(payer);
  const right = personKey(approver);
  if (!left || !right) return false;
  return left !== right;
}

// Sample step list for the two advance examples. Approvers are chosen from
// `directors` and skipped when they are the payer.
export function buildAdvanceSteps({ amount, payer, directors }) {
  const need = requiredApprovers(amount);
  const approvers = [];
  for (const person of directors) {
    if (!canApprove(payer, person)) continue;
    approvers.push(person);
    if (approvers.length === need.count) break;
  }
  if (approvers.length < need.count) {
    throw new Error('not enough approvers who are not the payer');
  }
  const steps = [{ label: 'ยื่นใบทดรองจ่าย', state: 'done' }];
  if (need.count === 1) {
    steps.push({ label: `กรรมการลงนาม 1 คน · ${approvers[0]}`, state: 'pending' });
  } else {
    approvers.forEach((person, index) => {
      const last = index === approvers.length - 1;
      steps.push({
        label: `กรรมการคนที่ ${index + 1} ลงนาม · ${person}`,
        state: last ? 'pending' : 'done',
      });
    });
  }
  steps.push({ label: 'จ่ายคืนผู้ก่อการ', state: 'upcoming' });
  return { count: need.count, rule: need.rule, approvers, steps };
}

function parseBaht(amount) {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new RangeError('amount must be a non-negative number of baht');
    }
    return amount;
  }
  if (typeof amount !== 'string') throw new TypeError('amount must be a number of baht');
  const cleaned = amount.trim().replace(/฿/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new TypeError('amount must be a number of baht');
  return Number(cleaned);
}

function personKey(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}
