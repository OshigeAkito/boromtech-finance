import fs from 'node:fs';
import path from 'node:path';

export const EXAMPLE_BANNER = 'ตัวอย่างข้อมูล / Example data, not real figures';

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
  if (!isFiniteNumber(data.registeredCapital)) errors.push('registeredCapital must be a finite number');
  if (!isFiniteNumber(data.openingCapital)) errors.push('openingCapital must be a finite number');
  if (!data.fx || typeof data.fx !== 'object' || Array.isArray(data.fx)) errors.push('fx must be an object');
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

export function lineAmount(line) {
  if (!line || typeof line !== 'object') return null;
  if (isFiniteNumber(line.amount)) return line.amount;
  if (isFiniteNumber(line.value)) return line.value;
  return null;
}

export function lineName(line) {
  if (!line || typeof line !== 'object') return '';
  return line.name || line.label || line.title || '';
}

export function projectMonths(forecast) {
  let balance = forecast.openingCapital;
  const months = Array.isArray(forecast.months) ? forecast.months : [];
  return months.map((month) => {
    const inflows = Array.isArray(month.inflows) ? month.inflows : [];
    const outflows = Array.isArray(month.outflows) ? month.outflows : [];
    const inflow = sumLines(inflows);
    const outflow = sumLines(outflows);
    const opening = balance;
    const closing = opening + inflow - outflow;
    balance = closing;
    return { month, inflows, outflows, inflow, outflow, opening, closing };
  });
}

export function noteLabel(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const title = item.title || item.name || '';
  const detail = item.detail || item.text || '';
  if (title && detail) return `${title} — ${detail}`;
  return title || detail;
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

function validateMonth(month, index, errors) {
  if (!month || typeof month !== 'object' || Array.isArray(month)) {
    errors.push(`months[${index}] must be an object`);
    return;
  }
  const hasName = typeof month.month === 'string' || typeof month.label === 'string';
  if (!hasName) errors.push(`months[${index}] needs month or label`);
  for (const side of ['inflows', 'outflows']) {
    if (month[side] == null) continue;
    if (!Array.isArray(month[side])) {
      errors.push(`months[${index}].${side} must be an array`);
      continue;
    }
    month[side].forEach((line, lineIndex) => {
      if (!line || typeof line !== 'object' || Array.isArray(line)) {
        errors.push(`months[${index}].${side}[${lineIndex}] must be an object`);
        return;
      }
      if (typeof lineName(line) !== 'string' || lineName(line).trim() === '') {
        errors.push(`months[${index}].${side}[${lineIndex}] needs a name`);
      }
      if (lineAmount(line) == null) {
        errors.push(`months[${index}].${side}[${lineIndex}] amount must be a finite number`);
      }
    });
  }
}

function validateNotes(value, key, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item === 'string' && item.trim() !== '') return;
    if (item && typeof item === 'object' && noteLabel(item).trim() !== '') return;
    errors.push(`${key}[${index}] must be a string or an object with text`);
  });
}

function sumLines(lines) {
  return lines.reduce((sum, line) => sum + (lineAmount(line) ?? 0), 0);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
