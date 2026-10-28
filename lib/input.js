import { englishDate, monthKeyLabels } from './dates.js';
import { canonicalMoney, canonicalRate, canonicalShare, parseMoneyCents } from './forecast.js';
import { isUuid } from './ids.js';

export const EXPENSE_CATEGORIES = [
  ['domain', 'Domain registration'],
  ['fee', 'DBD fee'],
  ['software', 'Software / online service'],
  ['other', 'Other'],
];

export const PAYMENT_METHODS = [
  ['card', 'Credit / debit card', 'payCard'],
  ['transfer', 'Bank transfer', 'payTransfer'],
  ['paypal', 'PayPal / e-wallet', 'payPaypal'],
  ['cash', 'Cash', 'payCash'],
  ['other', 'Other', 'payOther'],
];

export const FILE_KINDS = [
  ['receiptFile', 'receipt', 'Receipt / tax invoice'],
  ['paymentFile', 'payment_proof', 'Proof of payment (transfer slip / card statement)'],
  ['screenshotFile', 'screenshot', 'Screenshot of the service details'],
  ['assignmentFile', 'assignment', 'Rights transfer letter to the company'],
];

function flagOn(value) {
  return value === 'on' || value === 'true' || value === '1';
}

function invalid(field, message) {
  return { field, message };
}

function line(value, min, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length < min || text.length > max) return null;
  if (/[\u0000-\u001F]/.test(text)) return null;
  return text;
}

function code(value) {
  const text = line(value, 3, 8);
  if (!text || !/^[A-Za-z]{3,8}$/.test(text)) return null;
  return text.toUpperCase();
}

export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function money(value, minCents) {
  if (typeof value !== 'string') return null;
  const canonical = canonicalMoney(value.trim());
  if (!canonical) return null;
  const cents = parseMoneyCents(canonical);
  if (cents == null || cents < minCents) return null;
  return canonical;
}

function noteLines(value, label) {
  if (typeof value !== 'string') return { error: invalid(label, `${label} is not valid`) };
  const items = value.split(/\n/).map((item) => item.trim()).filter(Boolean);
  if (items.length > 80) return { error: invalid(label, `${label}: at most 80 lines`) };
  if (items.some((item) => item.length > 1000 || /[\u0000-\u001F]/.test(item))) {
    return { error: invalid(label, `${label}: each line must be at most 1,000 characters`) };
  }
  return { items };
}

export const DEFAULT_FX_SOURCE = 'Entered manually';
export const DEFAULT_BALANCE_FORMULA = 'Month-end balance = previous balance + income − expenses';

function textOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

// Share of registered capital, as text with up to two decimals ("40" or "12.5").
function shareFrom(openingAmount, registeredCapital) {
  const opening = parseMoneyCents(openingAmount);
  const registered = parseMoneyCents(registeredCapital);
  if (opening == null || registered == null || registered <= 0n || opening > registered) return '';
  const basisPoints = (opening * 10000n + registered / 2n) / registered;
  return canonicalShare((Number(basisPoints) / 100).toFixed(2)) || '';
}

export function parseSettings(body) {
  const errors = [];
  const company = line(body.company, 1, 200);
  const currency = code(textOr(body.currency, 'THB'));
  const registeredCapital = money(body.registeredCapital, 0n);
  const openingAmount = money(body.openingAmount, 0n);
  const shareInput = typeof body.openingShare === 'string' ? body.openingShare.trim() : '';
  const overRegistered = Boolean(openingAmount && registeredCapital)
    && parseMoneyCents(registeredCapital) > 0n
    && parseMoneyCents(openingAmount) > parseMoneyCents(registeredCapital);
  const shareText = shareInput
    ? canonicalShare(shareInput)
    : shareFrom(openingAmount, registeredCapital) || '0';
  const openingLabel = line(body.openingLabel ?? '', 0, 200) ?? null;
  const openingTiming = line(body.openingTiming ?? '', 0, 200) ?? null;
  const fxBase = code(textOr(body.fxBase, 'USD'));
  const fxQuote = code(textOr(body.fxQuote, 'THB'));
  const fxRate = typeof body.fxRate === 'string' ? canonicalRate(body.fxRate.trim()) : null;
  const fxSource = line(textOr(body.fxSource, DEFAULT_FX_SOURCE), 1, 300);
  const fxUpdatedAt = isoDate(body.fxUpdatedAt);
  const fxUpdatedDisplay = line(textOr(body.fxUpdatedDisplay, englishDate(fxUpdatedAt || '')), 1, 120);
  const balanceFormula = line(textOr(body.balanceFormula, DEFAULT_BALANCE_FORMULA), 1, 1000);
  const documentPrefix = textOr(body.documentPrefix, 'EXP').trim().toUpperCase();
  const assumptions = noteLines(typeof body.assumptions === 'string' ? body.assumptions : '', 'Assumptions');
  const notYet = noteLines(typeof body.notYetIncluded === 'string' ? body.notYetIncluded : '', 'Not yet included');
  if (!company) errors.push(invalid('company', 'Enter the company name (up to 200 characters)'));
  if (!currency) errors.push(invalid('currency', 'Currency must be 3 to 8 letters, e.g. THB'));
  if (!registeredCapital) errors.push(invalid('registeredCapital', 'Registered capital must be zero or more, with at most 2 decimals'));
  if (!openingAmount) errors.push(invalid('openingAmount', 'Opening capital must be zero or more, with at most 2 decimals'));
  if (!shareText) errors.push(invalid('openingShare', 'Share must be between 0 and 100, with at most 2 decimals'));
  if (!shareInput && overRegistered) errors.push(invalid('openingAmount', 'Opening capital cannot be more than registered capital'));
  if (openingLabel == null) errors.push(invalid('openingLabel', 'Opening capital description is too long'));
  if (openingTiming == null) errors.push(invalid('openingTiming', 'Opening capital timing is too long'));
  if (!fxBase || !fxQuote) errors.push(invalid('fx', 'Exchange-rate currencies must be 3 to 8 letters'));
  if (!fxRate) errors.push(invalid('fxRate', 'Exchange rate must be more than 0, with at most 8 decimals'));
  if (!fxSource) errors.push(invalid('fxSource', 'Exchange-rate source is too long'));
  if (!fxUpdatedAt) errors.push(invalid('fxUpdatedAt', 'Pick the date of the exchange rate'));
  if (!fxUpdatedDisplay) errors.push(invalid('fxUpdatedDisplay', 'Rate date text is too long'));
  if (!balanceFormula) errors.push(invalid('balanceFormula', 'Balance formula text is too long'));
  if (!/^[A-Z]{2,6}$/.test(documentPrefix)) {
    errors.push(invalid('documentPrefix', 'Document prefix must be 2 to 6 English letters, e.g. EXP or PRE'));
  }
  if (assumptions.error) errors.push(assumptions.error);
  if (notYet.error) errors.push(notYet.error);
  if (errors.length) return { ok: false, errors };
  const assumed = body.openingAssumed === 'on' || body.openingAssumed === 'true' || body.openingAssumed === '1';
  return {
    ok: true,
    value: {
      company,
      currency,
      registeredCapital,
      openingCapital: {
        amount: openingAmount,
        sharePercent: shareText,
        assumed,
        label: openingLabel,
        timing: openingTiming,
      },
      fx: {
        base: fxBase,
        quote: fxQuote,
        rate: fxRate,
        source: fxSource,
        updatedAt: fxUpdatedAt,
        updatedDisplay: fxUpdatedDisplay,
      },
      balanceFormula,
      documentPrefix,
      assumptions: assumptions.items,
      notYetIncluded: notYet.items,
    },
  };
}

// Months are added from a month picker (key 2026-01); short and full names come from the key
// unless the form sends stored ones, so existing labels are kept when only income changes.
export function parseMonth(body) {
  const errors = [];
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const generated = monthKeyLabels(key);
  const label = line(textOr(body.label, generated?.label || ''), 1, 40);
  const labelFull = line(textOr(body.labelFull, generated?.labelFull || ''), 1, 80);
  const revenue = money(textOr(body.revenue, '0'), 0n);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(key)) {
    errors.push(invalid('key', 'Pick a month'));
  } else {
    if (!label) errors.push(invalid('label', 'Enter a short month name'));
    if (!labelFull) errors.push(invalid('labelFull', 'Enter a full month name'));
  }
  if (!revenue) errors.push(invalid('revenue', 'Income must be zero or more, with at most 2 decimals'));
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { key, label, labelFull, revenue } };
}

export function parseItem(body) {
  const errors = [];
  const monthId = isUuid(body.monthId) ? body.monthId : '';
  const group = typeof body.group === 'string' ? body.group.trim().toLowerCase() : '';
  const groupName = line(body.groupName, 1, 200);
  const name = line(body.name, 1, 300);
  const amount = money(body.amount, 0n);
  const usdText = typeof body.usd === 'string' ? body.usd.trim() : '';
  const usd = usdText ? money(usdText, 0n) : null;
  const note = line(body.note ?? '', 0, 2000);
  if (!monthId) errors.push(invalid('monthId', 'Pick a month'));
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(group)) {
    errors.push(invalid('group', 'Group code: lowercase English letters, digits, _ or -, e.g. office'));
  }
  if (!groupName) errors.push(invalid('groupName', 'Enter a group name'));
  if (!name) errors.push(invalid('name', 'Enter an item name'));
  if (!amount) errors.push(invalid('amount', 'Amount must be zero or more, with at most 2 decimals'));
  if (usdText && !usd) errors.push(invalid('usd', 'USD amount must be zero or more with at most 2 decimals, or left blank'));
  if (note == null) errors.push(invalid('note', 'Note is too long'));
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      monthId,
      group,
      groupName,
      name,
      amount,
      usd,
      assumed: body.assumed === 'on' || body.assumed === 'true' || body.assumed === '1',
      note: note ?? '',
    },
  };
}

export function parseActual(body) {
  const errors = [];
  const spentOn = isoDate(body.spentOn);
  const itemName = line(body.itemName, 1, 200);
  const category = EXPENSE_CATEGORIES.some(([key]) => key === body.category) ? body.category : '';
  const categoryOther = category === 'other' ? line(body.categoryOther, 1, 80) : '';
  const vendor = line(body.vendor, 1, 200);
  const periodNone = flagOn(body.periodNone);
  const periodText = periodNone ? '' : line(body.periodText, 1, 40);
  const periodFrom = periodNone ? null : isoDate(body.periodFrom);
  const periodTo = periodNone ? null : isoDate(body.periodTo);
  const amount = money(body.amount, 1n);
  const vatMode = ['included', 'excluded', 'foreign'].includes(body.vatMode) ? body.vatMode : '';
  const foreignCurrency = vatMode === 'foreign' && typeof body.foreignCurrency === 'string'
    ? body.foreignCurrency.trim().toUpperCase()
    : '';
  const foreignAmount = vatMode === 'foreign' ? money(body.foreignAmount, 1n) : null;
  const foreignRate = vatMode === 'foreign' && typeof body.foreignRate === 'string'
    ? canonicalRate(body.foreignRate.trim())
    : null;
  const payer = line(body.payer, 1, 120);
  const paymentMethods = PAYMENT_METHODS.filter(([, , field]) => flagOn(body[field])).map(([key]) => key);
  const paymentOther = paymentMethods.includes('other') ? line(body.paymentOther, 1, 80) : '';
  const receiptNo = line(body.receiptNo, 1, 80);
  const receiptName = ['company', 'promoter', 'other'].includes(body.receiptName) ? body.receiptName : '';
  const receiptNameOther = receiptName === 'other' ? line(body.receiptNameOther, 1, 120) : '';
  const transferRights = body.transferRights === 'yes';
  const transferKnown = body.transferRights === 'yes' || body.transferRights === 'no';
  const transferAsset = transferRights ? line(body.transferAsset, 1, 200) : '';
  const note = line(body.note ?? '', 0, 2000);
  if (!spentOn) errors.push(invalid('spentOn', 'Pick the payment date'));
  if (!itemName) errors.push(invalid('itemName', 'Enter what was bought'));
  if (!category) errors.push(invalid('category', 'Pick a category'));
  if (category === 'other' && !categoryOther) errors.push(invalid('categoryOther', 'Describe the other category'));
  if (!vendor) errors.push(invalid('vendor', 'Enter the vendor or payee'));
  if (!periodNone && (!periodText || !periodFrom || !periodTo || periodFrom > periodTo)) {
    errors.push(invalid('period', 'Enter the service period with start and end dates, or tick No service period'));
  }
  if (!amount) errors.push(invalid('amount', 'Amount must be more than 0, with at most 2 decimals'));
  if (!vatMode) errors.push(invalid('vatMode', 'Pick VAT included, VAT excluded or foreign'));
  if (vatMode === 'foreign' && (!/^[A-Z]{3,8}$/.test(foreignCurrency) || !foreignAmount || !foreignRate)) {
    errors.push(invalid('foreign', 'A foreign expense needs a currency, an amount and a rate'));
  }
  if (!payer) errors.push(invalid('payer', 'Enter who paid (the promoter)'));
  if (paymentMethods.length === 0) errors.push(invalid('paymentMethods', 'Pick at least one payment method. Do not enter card or account numbers'));
  if (paymentMethods.includes('other') && !paymentOther) errors.push(invalid('paymentOther', 'Describe the other payment method without card or account numbers'));
  if (!receiptNo) errors.push(invalid('receiptNo', 'Enter the receipt or invoice number'));
  if (!receiptName) errors.push(invalid('receiptName', 'Pick the name on the receipt'));
  if (receiptName === 'other' && !receiptNameOther) errors.push(invalid('receiptNameOther', 'Enter the name on the receipt'));
  if (!transferKnown) errors.push(invalid('transferRights', 'Pick whether rights must be transferred to the company'));
  if (transferRights && !transferAsset) errors.push(invalid('transferAsset', 'Name the asset or account to transfer'));
  if (note == null) errors.push(invalid('note', 'Note is too long'));
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      spentOn,
      itemName,
      category,
      categoryOther: categoryOther || '',
      vendor,
      periodNone,
      periodText: periodText || '',
      periodFrom,
      periodTo,
      amount,
      vatMode,
      foreignCurrency: vatMode === 'foreign' ? foreignCurrency : '',
      foreignAmount: vatMode === 'foreign' ? foreignAmount : null,
      foreignRate: vatMode === 'foreign' ? foreignRate : null,
      payer,
      paymentMethods,
      paymentOther: paymentOther || '',
      receiptNo,
      receiptName,
      receiptNameOther: receiptNameOther || '',
      transferRights,
      transferAsset: transferAsset || '',
      note: note ?? '',
    },
  };
}

export function confirmedDelete(body) {
  return body.confirm === 'yes';
}
