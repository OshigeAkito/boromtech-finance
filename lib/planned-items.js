import { monthKeyLabels } from './dates.js';

function storeFailure() {
  const error = new Error('STORE');
  error.code = 'STORE';
  return error;
}

// A planned expense can name a month that is not in the forecast yet.
// That month is created with no income. An existing month keeps its income.
export async function ensureForecastMonth(store, key) {
  const labels = monthKeyLabels(key);
  if (!labels) throw storeFailure();
  const forecast = await store.loadForecast();
  const existing = (forecast?.months || []).find((month) => month.key === key);
  if (existing) return existing;
  try {
    await store.createMonth({
      key,
      label: labels.label,
      labelFull: labels.labelFull,
      revenue: '0.00',
    });
  } catch (error) {
    if (!error || error.code !== 'CONFLICT') throw error;
  }
  const fresh = await store.loadForecast();
  const created = (fresh?.months || []).find((month) => month.key === key);
  if (!created) throw storeFailure();
  return created;
}

// One independent forecast row per month. Nothing links the rows together.
export async function createPlannedOccurrences(store, value) {
  for (const key of value.monthKeys || []) {
    const month = await ensureForecastMonth(store, key);
    await store.createItem({ ...value, monthId: month.id });
  }
}
