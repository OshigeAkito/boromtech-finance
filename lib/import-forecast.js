import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalMoney,
  canonicalRate,
  canonicalShare,
  validateForecast,
} from './forecast.js';

const MAX_BYTES = 2 * 1024 * 1024;

function fail(code, details = []) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveImportPath(filePath, repoRoot) {
  if (typeof filePath !== 'string' || filePath.trim() === '') throw fail('NOT_FOUND');
  const root = fs.realpathSync(repoRoot);
  const lexical = path.resolve(filePath);
  if (inside(root, lexical)) throw fail('INSIDE_REPO');
  const parent = path.dirname(lexical);
  if (!fs.existsSync(parent)) throw fail('NOT_FOUND');
  const resolvedParent = fs.realpathSync(parent);
  const resolved = path.join(resolvedParent, path.basename(lexical));
  if (inside(root, resolved)) throw fail('INSIDE_REPO');
  if (!fs.existsSync(resolved)) throw fail('NOT_FOUND');
  const real = fs.realpathSync(resolved);
  if (inside(root, real)) throw fail('INSIDE_REPO');
  return real;
}

function takeLine(value, min, max, label, errors) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max || /[\u0000-\u001F]/.test(text)) {
    errors.push(`${label} must be ${min}-${max} characters without control characters`);
    return '';
  }
  return text;
}

function takeCode(value, label, errors) {
  const text = takeLine(value, 3, 8, label, errors);
  if (!text) return '';
  if (!/^[A-Za-z]{3,8}$/.test(text)) {
    errors.push(`${label} must be 3-8 letters`);
    return '';
  }
  return text.toUpperCase();
}

function takeDate(value, label, errors) {
  if (typeof value !== 'string') {
    errors.push(`${label} must be YYYY-MM-DD`);
    return '';
  }
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) {
    errors.push(`${label} must be YYYY-MM-DD`);
    return '';
  }
  const datePart = match[1];
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(5, 7));
  const day = Number(datePart.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    errors.push(`${label} must be a real date`);
    return '';
  }
  if (match[2] != null) {
    const hour = Number(match[2]);
    const minute = Number(match[3]);
    const second = Number(match[4]);
    const zone = match[5];
    const zoneOk = zone === 'Z' || /^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(zone);
    if (hour > 23 || minute > 59 || second > 59 || !zoneOk) {
      errors.push(`${label} must be YYYY-MM-DD`);
      return '';
    }
  }
  return datePart;
}

function takeNotes(items, label, errors) {
  if (!Array.isArray(items)) return [];
  const notes = [];
  items.forEach((item, index) => {
    if (typeof item !== 'string') return;
    const text = item.trim();
    if (!text) return;
    if (text.length > 1000 || /[\u0000-\u001F]/.test(text)) {
      errors.push(`${label}[${index}] is too long`);
      return;
    }
    notes.push(text);
  });
  if (notes.length > 80) errors.push(`${label} has too many rows`);
  return notes;
}

export function prepareForecastImport(data) {
  const schemaErrors = validateForecast(data);
  if (schemaErrors.length) return { ok: false, errors: schemaErrors };
  const errors = [];
  const company = takeLine(data.company, 1, 200, 'company', errors);
  const currency = takeCode(data.currency, 'currency', errors);
  const registeredCapital = canonicalMoney(data.registeredCapital);
  if (!registeredCapital) errors.push('registeredCapital is out of range');
  const opening = data.openingCapital;
  const openingAmount = canonicalMoney(opening.amount);
  if (!openingAmount) errors.push('openingCapital.amount is out of range');
  const sharePercent = canonicalShare(opening.sharePercent);
  if (!sharePercent) errors.push('openingCapital.sharePercent must be from 0 to 100');
  const openingLabel = takeLine(opening.label, 0, 200, 'openingCapital.label', errors);
  const openingTiming = takeLine(opening.timing, 0, 200, 'openingCapital.timing', errors);
  const fx = data.fx;
  const rate = canonicalRate(fx.rate);
  if (!rate) errors.push('fx.rate must be a positive decimal with at most 8 places');
  const fxBase = takeCode(fx.base, 'fx.base', errors);
  const fxQuote = takeCode(fx.quote, 'fx.quote', errors);
  const fxSource = takeLine(fx.source, 1, 300, 'fx.source', errors);
  const fxUpdatedAt = takeDate(fx.updatedAt, 'fx.updatedAt', errors);
  const fxUpdatedDisplay = takeLine(fx.updatedDisplay, 1, 120, 'fx.updatedDisplay', errors);
  const balanceFormula = takeLine(data.balanceFormula, 1, 1000, 'balanceFormula', errors);
  const seen = new Set();
  const months = data.months.map((month, index) => {
    const key = typeof month.key === 'string' ? month.key.trim() : '';
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(key)) errors.push(`months[${index}].key is not supported`);
    if (seen.has(key)) errors.push(`months[${index}].key is duplicated`);
    seen.add(key);
    const label = takeLine(month.label, 1, 40, `months[${index}].label`, errors);
    const labelFull = takeLine(month.labelFull, 1, 80, `months[${index}].labelFull`, errors);
    const revenue = canonicalMoney(month.revenue);
    if (!revenue) errors.push(`months[${index}].revenue is out of range`);
    if (!Array.isArray(month.items) || month.items.length > 400) errors.push(`months[${index}].items is too large`);
    const items = (month.items || []).map((item, itemIndex) => {
      const where = `months[${index}].items[${itemIndex}]`;
      const amount = canonicalMoney(item.amount);
      if (!amount) errors.push(`${where}.amount is out of range`);
      const note = item.note == null ? '' : takeLine(item.note, 0, 2000, `${where}.note`, errors);
      return {
        group: takeLine(item.group, 0, 80, `${where}.group`, errors),
        groupName: takeLine(item.groupName, 0, 200, `${where}.groupName`, errors),
        name: takeLine(item.name, 0, 300, `${where}.name`, errors),
        amount: amount || '0.00',
        assumed: item.assumed === true,
        note,
      };
    });
    return { key, label, labelFull, revenue: revenue || '0.00', items };
  });
  if (months.length > 120) errors.push('months has too many rows');
  const assumptions = takeNotes(data.assumptions, 'assumptions', errors);
  const notYetIncluded = takeNotes(data.notYetIncluded, 'notYetIncluded', errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      company,
      currency,
      registeredCapital,
      openingCapital: {
        amount: openingAmount,
        sharePercent,
        assumed: opening.assumed === true,
        label: openingLabel,
        timing: openingTiming,
      },
      fx: {
        base: fxBase,
        quote: fxQuote,
        rate,
        source: fxSource,
        updatedAt: fxUpdatedAt,
        updatedDisplay: fxUpdatedDisplay,
      },
      balanceFormula,
      months,
      assumptions,
      notYetIncluded,
    },
  };
}

export async function importForecastFile({ filePath, repoRoot, store }) {
  const resolved = resolveImportPath(filePath, repoRoot);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw fail('NOT_FOUND');
  if (stat.size > MAX_BYTES) throw fail('TOO_LARGE');
  const text = fs.readFileSync(resolved, 'utf8');
  let data;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw fail('INVALID', ['forecast file is not valid JSON']);
  }
  const prepared = prepareForecastImport(data);
  if (!prepared.ok) throw fail('INVALID', prepared.errors);
  if (!store || store.configured === false) throw fail('NOT_CONFIGURED');
  await store.replaceForecast(prepared.value);
  const items = prepared.value.months.reduce((sum, month) => sum + month.items.length, 0);
  return { months: prepared.value.months.length, items };
}
