// Real figures for the Office Portal cashflow card, from the saved forecast and actual expenses.
// The app records planned income only, so income is tagged as a forecast; the balance is the
// cash actually left: opening capital minus the expenses that were paid.
import { monthName } from './dates.js';
import { formatCents, parseMoneyCents } from './forecast.js';

function cents(value) {
  try {
    const parsed = parseMoneyCents(value);
    return typeof parsed === 'bigint' ? parsed : 0n;
  } catch {
    return 0n;
  }
}

// ฿1,250,000 or ฿8,500.50: satang only when there are some.
export function bahtText(amountCents) {
  return `฿${formatCents(amountCents).replace(/\.00$/, '')}`;
}

function shortMonth(iso) {
  return monthName({ key: String(iso || '').slice(0, 7) }, { lang: 'th' }).replace(/\s\d+$/, '');
}

export function buildOfficeFinance({ forecast, actuals = [], today = '' }) {
  if (!forecast) return null;
  const months = forecast.months || [];
  const opening = cents(forecast.openingCapital?.amount);
  const income = months.reduce((sum, month) => sum + cents(month.revenue), 0n);
  const planned = months.reduce((sum, month) => sum + month.items.reduce((s, item) => s + cents(item.amount), 0n), 0n);
  const paid = actuals.reduce((sum, expense) => sum + cents(expense.amount), 0n);
  const first = months[0];
  const last = months.at(-1);
  const period = first
    ? `ประมาณการ ${monthName(first, { full: true, lang: 'th' })} – ${monthName(last, { full: true, lang: 'th' })} · ${months.length} เดือน`
    : 'ยังไม่มีเดือนในประมาณการ';

  const figures = [
    { label: 'รายรับ', amount: bahtText(income), tone: 'forecast', badge: 'ยอดคาดการณ์', note: 'รายรับที่ประมาณไว้ทุกเดือน' },
    { label: 'รายจ่ายยอดจริง', amount: bahtText(paid), tone: 'actual', badge: 'ยอดจริง', note: `ทดรองจ่ายแล้ว ${actuals.length} รายการ` },
    { label: 'รายจ่ายยอดคาดการณ์', amount: bahtText(planned), tone: 'forecast', badge: 'ยอดคาดการณ์', note: `ตลอด ${months.length} เดือนในประมาณการ` },
    { label: 'ยอดคงเหลือ', amount: bahtText(opening - paid), tone: 'actual', badge: 'ยอดจริง', note: 'ทุนยกมา − จ่ายจริง' },
  ];

  // Latest paid expenses first, then the next planned items from the current month on.
  const recentActual = [...actuals]
    .sort((a, b) => String(b.spentOn).localeCompare(String(a.spentOn)))
    .slice(0, 3)
    .map((expense) => ({
      label: expense.payer ? `${expense.itemName} · ทดรองจ่ายโดย ${expense.payer}` : expense.itemName,
      month: shortMonth(expense.spentOn),
      amount: bahtText(cents(expense.amount)),
      tone: 'actual',
      badge: 'ยอดจริง',
      href: `/actual/${expense.id}`,
    }));
  const thisMonth = String(today).slice(0, 7);
  const isPast = (month) => Boolean(thisMonth) && /^\d{4}-\d{2}$/.test(month.key) && month.key < thisMonth;
  // When the whole forecast is in the past, show its latest months instead of nothing.
  const ahead = months.filter((month) => !isPast(month));
  const plannedMonths = ahead.some((month) => month.items.length) ? ahead : [...months].reverse();
  const upcoming = [];
  for (const month of plannedMonths) {
    for (const item of month.items) {
      upcoming.push({
        label: item.name || item.groupName || item.group,
        month: monthName(month, { lang: 'th' }).replace(/\s\d+$/, ''),
        amount: bahtText(cents(item.amount)),
        tone: 'forecast',
        badge: 'ยอดคาดการณ์',
        href: item.id ? `/forecast/items/${item.id}` : '/forecast',
      });
    }
  }
  const expenses = [...recentActual, ...upcoming.slice(0, Math.max(2, 5 - recentActual.length))].slice(0, 5);

  return { example: false, period, figures, expenses };
}
