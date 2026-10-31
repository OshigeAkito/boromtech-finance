import { monthKeyLabels, shiftMonthKey } from './dates.js';
import { parseMoneyCents } from './forecast.js';

const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

// Actual expenses are cash: the month is the payment date, not the service period.
export function paymentMonthKey(spentOn) {
  const match = /^(\d{4}-\d{2})-\d{2}$/.exec(String(spentOn || ''));
  if (!match) return null;
  const key = match[1];
  return monthKeyLabels(key) ? key : null;
}

function isYearMonth(key) {
  return YEAR_MONTH.test(key) && monthKeyLabels(key);
}

// Forecast months keep their saved order. A payment month with no forecast row,
// and any calendar month between the first and last one, is inserted among the
// calendar keys in date order, so the chart runs month by month without gaps.
export function mergeMonthKeys(forecastMonths, actualKeys) {
  const keys = (forecastMonths || []).map((month) => month.key);
  const calendar = [...keys, ...actualKeys].filter((key) => key && isYearMonth(key)).sort();
  const between = [];
  if (calendar.length) {
    const last = calendar[calendar.length - 1];
    for (let key = calendar[0]; key && key < last; key = shiftMonthKey(key, 1)) between.push(key);
  }
  const extras = [...new Set([...actualKeys, ...between].filter((key) => key && !keys.includes(key)))].sort();
  for (const key of extras) {
    const index = keys.findIndex((existing) => isYearMonth(existing) && existing > key);
    if (index === -1) keys.push(key);
    else keys.splice(index, 0, key);
  }
  return keys;
}

function syntheticMonth(key) {
  const labels = monthKeyLabels(key) || { label: key, labelFull: key };
  return {
    key,
    label: labels.label,
    labelFull: labels.labelFull,
    revenue: '0.00',
    items: [],
  };
}

function centsOf(value) {
  if (value == null || value === '') return null;
  return parseMoneyCents(String(value));
}

// Include plan: outflow is the larger of actual and planned, so spent money counts
// and any plan not yet spent still counts. Actual only: outflow is the actual total.
export function buildDashboardSummary(forecast, actuals = [], mode = 'plan') {
  const openingCents = parseMoneyCents(forecast.openingCapital.amount);
  const plannedByKey = new Map();
  for (const month of forecast.months || []) {
    const plannedCents = (month.items || []).reduce((sum, item) => {
      const cents = centsOf(item.amount);
      return sum + (cents == null ? 0n : cents);
    }, 0n);
    const revenue = centsOf(month.revenue);
    plannedByKey.set(month.key, {
      month,
      plannedCents,
      revenueCents: revenue == null ? 0n : revenue,
    });
  }
  const actualByKey = new Map();
  for (const expense of actuals || []) {
    const key = paymentMonthKey(expense.spentOn);
    const cents = centsOf(expense.amount);
    if (!key || cents == null) continue;
    let bucket = actualByKey.get(key);
    if (!bucket) {
      bucket = { cents: 0n, expenses: [] };
      actualByKey.set(key, bucket);
    }
    bucket.cents += cents;
    bucket.expenses.push(expense);
  }
  for (const bucket of actualByKey.values()) {
    bucket.expenses.sort((a, b) => String(a.spentOn).localeCompare(String(b.spentOn))
      || String(a.documentNo || '').localeCompare(String(b.documentNo || '')));
  }
  let balance = openingCents;
  const months = mergeMonthKeys(forecast.months || [], [...actualByKey.keys()]).map((key) => {
    const planned = plannedByKey.get(key);
    const actual = actualByKey.get(key);
    const plannedCents = planned ? planned.plannedCents : 0n;
    const actualCents = actual ? actual.cents : 0n;
    const actualCount = actual ? actual.expenses.length : 0;
    const usesActual = actualCount > 0;
    const hasPlan = Boolean(planned && (planned.month.items || []).length > 0);
    const spendCents = mode === 'actual'
      ? actualCents
      : (actualCents > plannedCents ? actualCents : plannedCents);
    const revenueCents = planned ? planned.revenueCents : 0n;
    const opening = balance;
    const closingCents = opening + revenueCents - spendCents;
    balance = closingCents;
    return {
      month: planned ? planned.month : syntheticMonth(key),
      revenueCents,
      plannedCents,
      actualCents,
      actualCount,
      usesActual,
      hasPlan,
      spendCents,
      openingCents: opening,
      closingCents,
      actuals: actual ? actual.expenses : [],
    };
  });
  const totalPlannedCents = months.reduce((sum, row) => sum + row.plannedCents, 0n);
  const totalActualCents = months.reduce((sum, row) => sum + row.actualCents, 0n);
  const totalOutflowCents = months.reduce((sum, row) => sum + row.spendCents, 0n);
  const totalRevenueCents = months.reduce((sum, row) => sum + row.revenueCents, 0n);
  const actualCount = (actuals || []).filter((expense) => paymentMonthKey(expense.spentOn) && centsOf(expense.amount) != null).length;
  return {
    openingCents,
    months,
    totalPlannedCents,
    totalActualCents,
    totalOutflowCents,
    totalRevenueCents,
    mode: mode === 'actual' ? 'actual' : 'plan',
    endingCents: balance,
    monthCount: months.length,
    forecastMonthCount: (forecast.months || []).length,
    actualCount,
  };
}
