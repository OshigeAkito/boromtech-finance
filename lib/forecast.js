import fs from 'node:fs';
import path from 'node:path';

export const EXAMPLE_BANNER = 'ตัวอย่างข้อมูล / Example data, not real figures';
export const ASSUMPTION_MARK = '(สมมติ)';

export const REQUIRED_KEYS = [
  'company',
  'currency',
  'registeredCapital',
  'openingCapital',
  'fx',
  'balanceFormula',
  'months',
  'assumptions',
  'notYetIncluded',
];

const MONEY = /^-?\d+(\.\d{1,2})?$/;

export function parseMoneyCents(value) {
  if (typeof value !== 'string' || !MONEY.test(value.trim())) return null;
  const text = value.trim();
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole, frac = ''] = unsigned.split('.');
  const cents = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
  return negative ? -cents : cents;
}

export function formatCents(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = new Intl.NumberFormat('th-TH').format(absolute / 100n);
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function validateForecast(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['root must be a JSON object'];
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) errors.push(`missing ${key}`);
  }
  if (typeof data.company !== 'string' || data.company.trim() === '') {
    errors.push('company must be a non-empty string');
  }
  if (typeof data.currency !== 'string' || data.currency.trim() === '') {
    errors.push('currency must be a non-empty string');
  }
  if (parseMoneyCents(data.registeredCapital) == null) {
    errors.push('registeredCapital must be a decimal string');
  }
  validateOpeningCapital(data.openingCapital, errors);
  validateFx(data.fx, errors);
  if (typeof data.balanceFormula !== 'string' || data.balanceFormula.trim() === '') {
    errors.push('balanceFormula must be a non-empty string');
  }
  if (!Array.isArray(data.months) || data.months.length === 0) {
    errors.push('months must be a non-empty array');
  } else {
    data.months.forEach((month, index) => validateMonth(month, index, errors));
  }
  for (const key of ['assumptions', 'notYetIncluded']) {
    validateNotes(data[key], key, errors);
  }
  return errors;
}

export function assertValidForecast(data) {
  const errors = validateForecast(data);
  if (errors.length === 0) return;
  const error = new Error('forecast schema invalid');
  error.code = 'FORECAST_SCHEMA';
  error.details = errors;
  throw error;
}

export function loadForecast({ forecastPath, examplePath }) {
  if (forecastPath) {
    try {
      const data = readForecastFile(forecastPath);
      return { data, example: sameFile(forecastPath, examplePath) };
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }
  return { data: readForecastFile(examplePath), example: true };
}

export function projectMonths(forecast) {
  let balance = parseMoneyCents(forecast.openingCapital.amount);
  return forecast.months.map((month) => {
    const revenueCents = parseMoneyCents(month.revenue);
    const spentCents = month.items.reduce((sum, item) => sum + parseMoneyCents(item.amount), 0n);
    const openingCents = balance;
    // Integer satang: inputs have at most two decimal places, so this does not drift.
    const closingCents = openingCents + revenueCents - spentCents;
    balance = closingCents;
    return {
      month,
      openingCents,
      revenueCents,
      spentCents,
      closingCents,
      groups: groupItems(month.items),
    };
  });
}

// balance = opening + cumulative revenue − cumulative cash out, in satang.
export function summarizeForecast(forecast) {
  const openingCents = parseMoneyCents(forecast.openingCapital.amount);
  const months = projectMonths(forecast);
  const totalRevenueCents = months.reduce((sum, row) => sum + row.revenueCents, 0n);
  const totalSpentCents = months.reduce((sum, row) => sum + row.spentCents, 0n);
  const endingCents = openingCents + totalRevenueCents - totalSpentCents;
  const groups = aggregateExpenseGroups(forecast);
  const groupTotalCents = groups.reduce((sum, group) => sum + group.totalCents, 0n);
  return {
    openingCents,
    months,
    totalRevenueCents,
    totalSpentCents,
    endingCents,
    groups,
    groupTotalCents,
    monthCount: forecast.months.length,
  };
}

// One row per `group` across every month. The label is the shared item name,
// or groupName when the names inside that group are not all the same.
export function aggregateExpenseGroups(forecast) {
  const rows = [];
  const seen = new Map();
  for (const month of forecast.months) {
    for (const item of month.items) {
      const key = item.group;
      let row = seen.get(key);
      if (!row) {
        row = {
          key,
          names: [],
          groupNames: [],
          totalCents: 0n,
          assumedCount: 0,
          itemCount: 0,
        };
        seen.set(key, row);
        rows.push(row);
      }
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const groupName = typeof item.groupName === 'string' ? item.groupName.trim() : '';
      if (name && !row.names.includes(name)) row.names.push(name);
      if (groupName && !row.groupNames.includes(groupName)) row.groupNames.push(groupName);
      row.totalCents += parseMoneyCents(item.amount);
      row.itemCount += 1;
      if (item.assumed) row.assumedCount += 1;
    }
  }
  return rows.map((row) => ({
    key: row.key,
    label: expenseGroupLabel(row),
    totalCents: row.totalCents,
    assumed: row.itemCount > 0 && row.assumedCount === row.itemCount,
  }));
}

function expenseGroupLabel(row) {
  if (row.names.length === 1) return row.names[0];
  if (row.groupNames.length === 1) return row.groupNames[0];
  if (row.names.length > 0) return row.names[0];
  if (row.groupNames.length > 0) return row.groupNames[0];
  return row.key;
}

export function groupItems(items) {
  const groups = [];
  const seen = new Map();
  for (const item of items) {
    if (!seen.has(item.groupName)) {
      seen.set(item.groupName, groups.length);
      groups.push({ group: item.group, groupName: item.groupName, items: [] });
    }
    groups[seen.get(item.groupName)].items.push(item);
  }
  return groups;
}

export function noteLabel(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const title = item.title || item.name || '';
  const detail = item.detail || item.text || '';
  if (title && detail) return `${title} — ${detail}`;
  return title || detail;
}

function validateOpeningCapital(value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('openingCapital must be an object');
    return;
  }
  if (parseMoneyCents(value.amount) == null) errors.push('openingCapital.amount must be a decimal string');
  if (typeof value.sharePercent !== 'number' || !Number.isFinite(value.sharePercent)) {
    errors.push('openingCapital.sharePercent must be a number');
  }
  if (typeof value.assumed !== 'boolean') errors.push('openingCapital.assumed must be a boolean');
  if (typeof value.label !== 'string') errors.push('openingCapital.label must be a string');
  if (typeof value.timing !== 'string') errors.push('openingCapital.timing must be a string');
}

function validateFx(value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('fx must be an object');
    return;
  }
  for (const key of ['base', 'quote', 'source', 'updatedAt', 'updatedDisplay']) {
    if (typeof value[key] !== 'string') errors.push(`fx.${key} must be a string`);
  }
  if (parseMoneyCents(value.rate) == null) errors.push('fx.rate must be a decimal string');
}

function validateMonth(month, index, errors) {
  if (!month || typeof month !== 'object' || Array.isArray(month)) {
    errors.push(`months[${index}] must be an object`);
    return;
  }
  for (const key of ['key', 'label', 'labelFull']) {
    if (typeof month[key] !== 'string') errors.push(`months[${index}].${key} must be a string`);
  }
  if (parseMoneyCents(month.revenue) == null) errors.push(`months[${index}].revenue must be a decimal string`);
  if (!Array.isArray(month.items)) {
    errors.push(`months[${index}].items must be an array`);
    return;
  }
  month.items.forEach((item, itemIndex) => {
    const where = `months[${index}].items[${itemIndex}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${where} must be an object`);
      return;
    }
    for (const key of ['group', 'groupName', 'name']) {
      if (typeof item[key] !== 'string') errors.push(`${where}.${key} must be a string`);
    }
    if (parseMoneyCents(item.amount) == null) errors.push(`${where}.amount must be a decimal string`);
    if (typeof item.assumed !== 'boolean') errors.push(`${where}.assumed must be a boolean`);
  });
}

function validateNotes(value, key, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item === 'string') return;
    errors.push(`${key}[${index}] must be a string`);
  });
}

function readForecastFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const data = JSON.parse(text);
  assertValidForecast(data);
  return data;
}

function sameFile(left, right) {
  if (!left || !right) return false;
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return path.resolve(left) === path.resolve(right);
  }
}
