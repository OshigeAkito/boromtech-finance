import { monthKeyParts } from './dates.js';

const FREQUENCY_OF_STEP = { 1: 'monthly', 3: 'quarterly', 12: 'yearly' };

function monthIndex(key) {
  const parts = monthKeyParts(key);
  return parts ? parts.year * 12 + parts.month - 1 : null;
}

function finish(run, step) {
  const first = run[0];
  const last = run[run.length - 1];
  return {
    id: first.item.id,
    name: first.item.name,
    amount: first.item.amount,
    usd: first.item.usd || null,
    frequency: step ? FREQUENCY_OF_STEP[step] : 'once',
    startKey: first.monthKey,
    endKey: last.monthKey,
    count: run.length,
    // The first row's stored details, kept when the plan is saved again.
    group: first.item.group,
    groupName: first.item.groupName,
    assumed: first.item.assumed === true,
    note: first.item.note || '',
    rows: run.map((entry) => ({ id: entry.item.id, monthId: entry.monthId, monthKey: entry.monthKey })),
  };
}

// Planned rows are stored one per month with nothing linking them. A plan is
// rebuilt from rows with the same name and amount whose months are a regular
// monthly, quarterly, or yearly step apart, within the 36-month repeat limit.
export function plannedPlans(forecast) {
  const buckets = new Map();
  const loose = [];
  for (const month of forecast?.months || []) {
    const index = monthIndex(month.key);
    for (const item of month.items || []) {
      const entry = { item, monthId: month.id, monthKey: month.key, index };
      if (index == null) {
        loose.push(entry);
        continue;
      }
      const key = [String(item.name).toLowerCase(), item.amount, item.usd || ''].join('\u0000');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(entry);
    }
  }
  const plans = loose.map((entry) => finish([entry], null));
  for (const entries of buckets.values()) {
    entries.sort((a, b) => a.index - b.index);
    let run = [entries[0]];
    let step = null;
    for (const entry of entries.slice(1)) {
      const last = run[run.length - 1];
      const diff = entry.index - last.index;
      const withinLimit = entry.index - run[0].index < 36;
      if (run.length === 1 && FREQUENCY_OF_STEP[diff] && withinLimit) {
        step = diff;
        run.push(entry);
      } else if (step && diff === step && withinLimit) {
        run.push(entry);
      } else {
        plans.push(finish(run, step));
        run = [entry];
        step = null;
      }
    }
    plans.push(finish(run, step));
  }
  return plans.sort((a, b) => (a.startKey < b.startKey ? -1 : a.startKey > b.startKey ? 1 : a.name.localeCompare(b.name)));
}

export function findPlan(forecast, rowId) {
  return plannedPlans(forecast).find((plan) => plan.rows.some((row) => row.id === rowId)) || null;
}
