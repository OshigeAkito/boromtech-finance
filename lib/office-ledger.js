import { formatCents, parseMoneyCents } from './forecast.js';
import {
  canApprove,
  canSeeCashflowSummary,
  isExecutiveRole,
  requiredApprovers,
} from './office-access.js';

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function centsOf(value) {
  if (typeof value === 'bigint') return value;
  const parsed = parseMoneyCents(typeof value === 'string' ? value.trim() : '');
  return parsed == null ? 0n : parsed;
}

function bahtNumber(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  const asNumber = Number(whole) + Number(fraction) / 100;
  return negative ? -asNumber : asNumber;
}

export function shortThaiMonth(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  if (!match) return '';
  return THAI_MONTHS_SHORT[Number(match[2]) - 1] || '';
}

function sortKey(row) {
  const when = String(row.when || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(when)) return when;
  if (/^\d{4}-\d{2}$/.test(when)) return `${when}-01`;
  return '0000-00-00';
}

function flattenForecast(forecast) {
  const rows = [];
  for (const month of forecast?.months || []) {
    for (const item of month.items || []) {
      rows.push({
        id: String(item.id || ''),
        kind: 'forecast',
        name: item.name || '',
        amount: item.amount || '0.00',
        payer: item.payer || '',
        advance: item.advance === true,
        createdBy: item.createdBy || '',
        when: month.key || '',
        monthLabel: shortThaiMonth(month.key) || month.label || '',
      });
    }
  }
  return rows;
}

function flattenActual(actuals) {
  return (actuals || []).map((expense) => ({
    id: String(expense.id || ''),
    kind: 'actual',
    name: expense.itemName || '',
    amount: expense.amount || '0.00',
    payer: expense.payer || '',
    advance: expense.advance === true,
    createdBy: expense.createdBy || '',
    when: expense.spentOn || '',
    monthLabel: shortThaiMonth(expense.spentOn),
  }));
}

function concerns(email, row) {
  const who = String(email || '').trim().toLowerCase();
  if (!who) return false;
  if (String(row.createdBy || '').trim().toLowerCase() === who) return true;
  return String(row.payer || '').trim().toLowerCase() === who;
}

export function canViewLedgerRow(role, email, row) {
  if (isExecutiveRole(role)) return true;
  if (role === 'employee') {
    return String(row.createdBy || '').trim().toLowerCase() === String(email || '').trim().toLowerCase();
  }
  if (role === 'expert') return concerns(email, row);
  return false;
}

function moneyLabel(cents) {
  return `฿${formatCents(cents)}`;
}

function recentRow(row) {
  const advanceNote = row.advance && row.payer ? ` · ทดรองจ่ายโดย ${row.payer}` : '';
  return {
    id: row.id,
    kind: row.kind,
    label: `${row.name}${advanceNote}`,
    month: row.monthLabel,
    amount: moneyLabel(centsOf(row.amount)),
    tone: row.kind === 'forecast' ? 'forecast' : 'actual',
    badge: row.kind === 'forecast' ? 'ยอดคาดการณ์' : 'ยอดจริง',
    advance: row.advance === true,
    payer: row.payer,
    amountBaht: bahtNumber(centsOf(row.amount)),
  };
}

export function approvalProgress(amountBaht) {
  const need = requiredApprovers(amountBaht);
  const steps = [{ label: 'ยื่นใบทดรองจ่าย', state: 'done' }];
  if (need.count === 1) {
    steps.push({ label: 'กรรมการลงนาม 1 คน', state: 'pending' });
  } else {
    steps.push({ label: 'กรรมการคนที่ 1 ลงนาม', state: 'pending' });
    steps.push({ label: 'กรรมการคนที่ 2 ลงนาม', state: 'pending' });
  }
  steps.push({ label: 'จ่ายคืนผู้จ่าย', state: 'upcoming' });
  return { count: need.count, rule: need.rule, steps };
}

function canSign(payer, approver) {
  const email = approver?.email || '';
  const name = String(approver?.name || '').trim();
  if (!canApprove(payer, email)) return false;
  if (name && !canApprove(payer, name)) return false;
  return true;
}

export function buildOfficeLedger({ forecast, actuals, role, email, approver }) {
  const incomeCents = (forecast?.months || []).reduce((sum, month) => sum + centsOf(month.revenue), 0n);
  const actualRows = flattenActual(actuals);
  const forecastRows = flattenForecast(forecast);
  const actualCents = actualRows.reduce((sum, row) => sum + centsOf(row.amount), 0n);
  const forecastCents = forecastRows.reduce((sum, row) => sum + centsOf(row.amount), 0n);
  const companyEmpty = incomeCents === 0n && actualRows.length === 0 && forecastRows.length === 0;
  const showCashflow = canSeeCashflowSummary(role);
  const visible = [...actualRows, ...forecastRows]
    .filter((row) => canViewLedgerRow(role, email, row))
    .sort((left, right) => sortKey(right).localeCompare(sortKey(left)) || right.id.localeCompare(left.id));
  const companyRecent = [...actualRows, ...forecastRows]
    .sort((left, right) => sortKey(right).localeCompare(sortKey(left)) || right.id.localeCompare(left.id));
  const advances = (showCashflow ? companyRecent : visible).filter((row) => row.advance);
  const signer = isExecutiveRole(role) ? approver : null;
  const awaiting = signer
    ? advances.filter((row) => canSign(row.payer, signer)).length
    : 0;
  return {
    showCashflow,
    empty: showCashflow ? companyEmpty : visible.length === 0,
    income: moneyLabel(incomeCents),
    actual: moneyLabel(actualCents),
    forecast: moneyLabel(forecastCents),
    balance: moneyLabel(incomeCents - actualCents),
    recent: (showCashflow ? companyRecent : visible).slice(0, 4).map(recentRow),
    advances: advances.slice(0, 4).map((row) => {
      const progress = approvalProgress(bahtNumber(centsOf(row.amount)));
      return {
        ...recentRow(row),
        approverCount: progress.count,
        limitLabel: progress.count === 1 ? 'ไม่เกิน 10,000 บาท' : 'เกิน 10,000 บาท',
        steps: progress.steps,
        downloadHref: row.kind === 'actual' && row.id ? `/actual/${row.id}/form` : '',
      };
    }),
    awaiting,
  };
}
