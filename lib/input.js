import crypto from 'node:crypto';
import { canonicalMonthKey, monthKeyLabels, monthKeyParts, repeatMonthKeys } from './dates.js';
import { tr } from './i18n.js';
import { canonicalMoney, canonicalRate, canonicalShare, parseMoneyCents } from './forecast.js';
import { isUuid } from './ids.js';

export const EXPENSE_CATEGORIES = [
  ['domain', { en: 'Domain registration', th: 'ค่าจดโดเมน' }],
  ['fee', { en: 'DBD fee', th: 'ค่าธรรมเนียม DBD' }],
  ['software', { en: 'Software / online service', th: 'ซอฟต์แวร์-บริการออนไลน์' }],
  ['other', { en: 'Other', th: 'อื่น ๆ' }],
];

export const PAYMENT_METHODS = [
  ['card', { en: 'Credit / debit card', th: 'บัตรเครดิต/เดบิต' }, 'payCard'],
  ['transfer', { en: 'Bank transfer', th: 'โอนเงิน' }, 'payTransfer'],
  ['paypal', { en: 'PayPal / e-wallet', th: 'PayPal/e-wallet' }, 'payPaypal'],
  ['cash', { en: 'Cash', th: 'เงินสด' }, 'payCash'],
  ['other', { en: 'Other', th: 'อื่น ๆ' }, 'payOther'],
];

export const FILE_KINDS = [
  ['receiptFile', 'receipt', { en: 'Receipt / tax invoice', th: 'ใบเสร็จรับเงิน / ใบกำกับภาษี' }],
  ['paymentFile', 'payment_proof', { en: 'Proof of payment (transfer slip / card statement)', th: 'หลักฐานการชำระเงิน (สลิปโอนเงิน / รายการบัตร)' }],
  ['screenshotFile', 'screenshot', { en: 'Screenshot of the service details', th: 'ภาพหน้าจอรายละเอียดบริการ' }],
  ['assignmentFile', 'assignment', { en: 'Rights transfer letter to the company', th: 'หนังสือโอนสิทธิ์ให้บริษัท' }],
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

// A blank Length is allowed. A typed one must fit the column.
function cleanLength(value) {
  if (typeof value !== 'string') return { ok: true, text: '' };
  const text = value.trim();
  if (!text) return { ok: true, text: '' };
  if (text.length > 40 || /[\u0000-\u001F]/.test(text)) return { ok: false, text: '' };
  return { ok: true, text };
}

function dateParts(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

// Whole calendar months when the day of month matches, e.g. 23 Oct to 23 Nov.
function wholeMonths(from, to) {
  const start = dateParts(from);
  const end = dateParts(to);
  const months = (end.year - start.year) * 12 + (end.month - start.month);
  if (months > 0 && end.day === start.day) return months;
  return null;
}

function daySpan(from, to) {
  const start = dateParts(from);
  const end = dateParts(to);
  const ms = Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day);
  return Math.round(ms / 86400000);
}

// The period check in the database requires a non-empty label whenever dates are set.
function periodLengthLabel(from, to, lang) {
  const L = tr(lang);
  const months = wholeMonths(from, to);
  if (months != null && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? L('1 year', '1 ปี') : L(`${years} years`, `${years} ปี`);
  }
  if (months != null) {
    return months === 1 ? L('1 month', '1 เดือน') : L(`${months} months`, `${months} เดือน`);
  }
  const days = daySpan(from, to);
  if (days <= 1) return L('1 day', '1 วัน');
  return L(`${days} days`, `${days} วัน`);
}

// The note is a textarea, so line breaks are normal. Other control characters are not.
function noteBody(value) {
  if (typeof value !== 'string') return { text: '', error: 'invalid' };
  const text = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (text.length > 2000) return { text, error: 'long' };
  if (/[\u0000-\u0009\u000B\u000C\u000E-\u001F]/.test(text)) return { text, error: 'invalid' };
  return { text, error: '' };
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

function noteLines(value, label, L) {
  if (typeof value !== 'string') return { error: invalid(label, L(`${label} is not valid`, `${label} ไม่ถูกต้อง`)) };
  const items = value.split(/\n/).map((item) => item.trim()).filter(Boolean);
  if (items.length > 80) return { error: invalid(label, L(`${label}: at most 80 lines`, `${label} ได้ไม่เกิน 80 บรรทัด`)) };
  if (items.some((item) => item.length > 1000 || /[\u0000-\u001F]/.test(item))) {
    return { error: invalid(label, L(`${label}: each line must be at most 1,000 characters`, `${label} แต่ละบรรทัดต้องไม่เกิน 1,000 ตัวอักษร`)) };
  }
  return { items };
}

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

export function parseSettings(body, lang = 'en') {
  const L = tr(lang);
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
  const balanceFormula = line(textOr(body.balanceFormula, DEFAULT_BALANCE_FORMULA), 1, 1000);
  const documentPrefix = textOr(body.documentPrefix, 'EXP').trim().toUpperCase();
  // Blank keeps the saved rate.
  const fxText = typeof body.fxRate === 'string' ? body.fxRate.trim() : '';
  const fxRate = fxText ? canonicalRate(fxText) : null;
  const assumptions = noteLines(typeof body.assumptions === 'string' ? body.assumptions : '', L('Assumptions', 'สมมติฐาน'), L);
  const notYet = noteLines(typeof body.notYetIncluded === 'string' ? body.notYetIncluded : '', L('Not yet included', 'ยังไม่รวม'), L);
  if (!company) errors.push(invalid('company', L('Enter the company name (up to 200 characters)', 'กรอกชื่อบริษัท ไม่เกิน 200 ตัวอักษร')));
  if (!currency) errors.push(invalid('currency', L('Currency must be 3 to 8 letters, e.g. THB', 'สกุลเงินต้องเป็นตัวอักษร 3 ถึง 8 ตัว เช่น THB')));
  if (!registeredCapital) errors.push(invalid('registeredCapital', L('Registered capital must be zero or more, with at most 2 decimals', 'ทุนจดทะเบียนต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง')));
  if (!openingAmount) errors.push(invalid('openingAmount', L('Opening capital must be zero or more, with at most 2 decimals', 'ทุนยกมาต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง')));
  if (!shareText) errors.push(invalid('openingShare', L('Share must be between 0 and 100, with at most 2 decimals', 'สัดส่วนต้องอยู่ระหว่าง 0 ถึง 100 และทศนิยมไม่เกิน 2 ตำแหน่ง')));
  if (!shareInput && overRegistered) errors.push(invalid('openingAmount', L('Opening capital cannot be more than registered capital', 'ทุนยกมาต้องไม่มากกว่าทุนจดทะเบียน')));
  if (openingLabel == null) errors.push(invalid('openingLabel', L('Opening capital description is too long', 'คำอธิบายทุนยกมายาวเกินไป')));
  if (openingTiming == null) errors.push(invalid('openingTiming', L('Opening capital timing is too long', 'ช่วงเวลาของทุนยกมายาวเกินไป')));
  if (!balanceFormula) errors.push(invalid('balanceFormula', L('Balance formula text is too long', 'ข้อความสูตรยอดคงเหลือยาวเกินไป')));
  if (!/^[A-Z]{2,6}$/.test(documentPrefix)) {
    errors.push(invalid('documentPrefix', L('Document prefix must be 2 to 6 English letters, e.g. EXP or PRE', 'คำนำหน้าเลขที่เอกสารเป็นตัวอักษรภาษาอังกฤษ 2 ถึง 6 ตัว เช่น EXP หรือ PRE')));
  }
  if (fxText && !fxRate) {
    errors.push(invalid('fxRate', L('USD rate must be more than 0, with at most 8 decimals', 'อัตรา USD ต้องมากกว่า 0 ทศนิยมได้ถึง 8 ตำแหน่ง')));
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
      balanceFormula,
      documentPrefix,
      fxRate,
      assumptions: assumptions.items,
      notYetIncluded: notYet.items,
    },
  };
}

// Months are added from a month picker (key 2026-01); short and full names come from the key
// unless the form sends stored ones, so existing labels are kept when only income changes.
export function parseMonth(body, lang = 'en') {
  const L = tr(lang);
  const errors = [];
  const key = typeof body.key === 'string' ? canonicalMonthKey(body.key.trim()) : '';
  const generated = monthKeyLabels(key);
  const label = line(textOr(body.label, generated?.label || ''), 1, 40);
  const labelFull = line(textOr(body.labelFull, generated?.labelFull || ''), 1, 80);
  const revenue = money(textOr(body.revenue, '0'), 0n);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(key)) {
    errors.push(invalid('key', L('Pick a month', 'เลือกเดือน')));
  } else {
    if (!label) errors.push(invalid('label', L('Enter a short month name', 'กรอกชื่อเดือนแบบสั้น')));
    if (!labelFull) errors.push(invalid('labelFull', L('Enter a full month name', 'กรอกชื่อเดือนแบบเต็ม')));
  }
  if (!revenue) errors.push(invalid('revenue', L('Income must be zero or more, with at most 2 decimals', 'รายรับต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง')));
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { key, label, labelFull, revenue } };
}

const REPEAT_FREQUENCIES = new Set(['monthly', 'quarterly', 'yearly']);
const REPEAT_STEP = { monthly: 1, quarterly: 3, yearly: 12 };

// USD planned costs count in baht at the Capital page rate, rounded half up to satang.
export function usdToThb(usd, rate) {
  const cents = parseMoneyCents(String(usd ?? ''));
  const canonical = canonicalRate(String(rate ?? ''));
  if (cents == null || cents < 0n || !canonical) return null;
  const [whole, frac = ''] = canonical.split('.');
  const units = BigInt(whole) * 100000000n + BigInt((frac + '00000000').slice(0, 8));
  const thb = (cents * units + 50000000n) / 100000000n;
  return `${thb / 100n}.${String(thb % 100n).padStart(2, '0')}`;
}

// Items with the same name share one dashboard line. A name with no English
// letters (most Thai names) gets a short hash, so the code still fits the schema.
export function groupCodeFor(name) {
  const text = String(name ?? '').trim().toLowerCase();
  const slug = text.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
  if (/^[a-z]/.test(slug)) return slug;
  return `g${crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
}

function monthsBetween(startKey, endKey) {
  const start = monthKeyParts(startKey);
  const end = monthKeyParts(endKey);
  if (!start || !end) return null;
  return (end.year - start.year) * 12 + (end.month - start.month);
}

// context.usdRate is the Capital page rate; context.groups maps a lowercased
// item name to the { group, groupName } it already uses.
export function parseItem(body, lang = 'en', context = {}) {
  const L = tr(lang);
  const errors = [];
  const monthKey = typeof body.monthKey === 'string' ? canonicalMonthKey(body.monthKey.trim()) : '';
  const monthId = isUuid(body.monthId) ? body.monthId : '';
  const repeat = flagOn(body.repeat);
  const name = line(body.name, 1, 300);
  const known = name ? context.groups?.get(name.toLowerCase()) : null;
  const groupInput = typeof body.group === 'string' ? body.group.trim().toLowerCase() : '';
  const group = groupInput || known?.group || (name ? groupCodeFor(name) : '');
  const groupNameInput = typeof body.groupName === 'string' && body.groupName.trim() ? body.groupName : '';
  const groupName = line(groupNameInput || known?.groupName || (name || '').slice(0, 200), 1, 200);
  // The simple form sends one value and its currency; older posts send amount and usd.
  const currency = body.currency === 'USD' || body.currency === 'THB' ? body.currency : '';
  let amount = null;
  let usd = null;
  let usdText = '';
  if (currency) {
    const value = money(body.value, 0n);
    if (!value) {
      errors.push(invalid('value', L('Amount must be zero or more, with at most 2 decimals', 'จำนวนเงินต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง')));
    } else if (currency === 'THB') {
      amount = value;
    } else if (!canonicalRate(String(context.usdRate ?? ''))) {
      errors.push(invalid('currency', L('Set the USD rate on the Capital page first', 'ตั้งอัตรา USD ในหน้าเงินทุนก่อน')));
    } else {
      usd = value;
      amount = usdToThb(value, context.usdRate);
    }
  } else {
    amount = money(body.amount, 0n);
    usdText = typeof body.usd === 'string' ? body.usd.trim() : '';
    usd = usdText ? money(usdText, 0n) : null;
  }
  const noted = noteBody(body.note ?? '');
  let monthKeys = null;
  if (monthKey) {
    if (!monthKeyLabels(monthKey)) {
      errors.push(invalid('monthKey', L('Pick a month', 'เลือกเดือน')));
    } else if (!repeat && REPEAT_FREQUENCIES.has(body.frequency) && typeof body.endKey === 'string') {
      // Date range: from the start month to the end month, every step months.
      const endKey = canonicalMonthKey(body.endKey.trim());
      const span = endKey ? monthsBetween(monthKey, endKey) : null;
      if (span == null) {
        errors.push(invalid('endKey', L('Pick an end month', 'เลือกเดือนสิ้นสุด')));
      } else if (span < 0) {
        errors.push(invalid('endKey', L('The end month must be on or after the start month', 'เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม')));
      } else {
        monthKeys = repeatMonthKeys(monthKey, body.frequency, Math.floor(span / REPEAT_STEP[body.frequency]) + 1);
        if (!monthKeys) {
          errors.push(invalid('endKey', L('The range can be up to 36 months', 'ช่วงเวลาได้ไม่เกิน 36 เดือน')));
        }
      }
    } else if (!repeat) {
      monthKeys = [monthKey];
    } else {
      const frequency = REPEAT_FREQUENCIES.has(body.frequency) ? body.frequency : '';
      const countText = typeof body.repeatCount === 'string' ? body.repeatCount.trim() : '';
      const count = /^0*(?:[1-9]|[1-2]\d|3[0-6])$/.test(countText) ? Number(countText) : null;
      if (!frequency) {
        errors.push(invalid('frequency', L('Pick monthly, quarterly, or yearly', 'เลือกทำซ้ำรายเดือน รายไตรมาส หรือรายปี')));
      }
      if (!count) {
        errors.push(invalid('repeatCount', L('Enter the number of times, from 1 to 36', 'ระบุจำนวนครั้งเป็นจำนวนเต็มตั้งแต่ 1 ถึง 36')));
      }
      if (frequency && count) {
        monthKeys = repeatMonthKeys(monthKey, frequency, count);
        if (!monthKeys) {
          errors.push(invalid('repeatCount', L(
            'That repeat goes past 36 months from the start month. Monthly allows 36 times, quarterly 12, and yearly 3.',
            'การทำซ้ำนี้เกิน 36 เดือนจากเดือนเริ่ม รายเดือนได้ 36 ครั้ง รายไตรมาส 12 ครั้ง และรายปี 3 ครั้ง',
          )));
        }
      }
    }
  } else if (!monthId || repeat) {
    errors.push(invalid('monthKey', L('Pick a month', 'เลือกเดือน')));
  }
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(group)) {
    errors.push(invalid('group', L('Group code: lowercase English letters, digits, _ or -, e.g. office', 'รหัสกลุ่มใช้ตัวอักษรภาษาอังกฤษตัวเล็ก ตัวเลข _ หรือ - เช่น office')));
  }
  if (name && !groupName) errors.push(invalid('groupName', L('Enter a group name', 'กรอกชื่อกลุ่ม')));
  if (!name) errors.push(invalid('name', L('Enter an item name', 'กรอกชื่อรายการ')));
  if (!currency && !amount) errors.push(invalid('amount', L('Amount must be zero or more, with at most 2 decimals', 'จำนวนเงินต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง')));
  if (usdText && !usd) errors.push(invalid('usd', L('USD amount must be zero or more with at most 2 decimals, or left blank', 'จำนวนดอลลาร์ต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง หรือเว้นว่าง')));
  if (noted.error === 'long') errors.push(invalid('note', L('Note is too long', 'หมายเหตุยาวเกินไป')));
  else if (noted.error) errors.push(invalid('note', L('Note is not valid', 'หมายเหตุไม่ถูกต้อง')));
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      monthId,
      monthKeys,
      group,
      groupName,
      name,
      amount,
      usd,
      assumed: body.assumed === 'on' || body.assumed === 'true' || body.assumed === '1',
      note: noted.text,
    },
  };
}

export function parseActual(body, lang = 'en') {
  const L = tr(lang);
  const errors = [];
  const spentOn = isoDate(body.spentOn);
  const itemName = line(body.itemName, 1, 200);
  const category = EXPENSE_CATEGORIES.some(([key]) => key === body.category) ? body.category : '';
  const categoryOther = category === 'other' ? line(body.categoryOther, 1, 80) : '';
  const vendor = line(body.vendor, 1, 200);
  const periodNone = flagOn(body.periodNone);
  const periodFrom = periodNone ? null : isoDate(body.periodFrom);
  const periodTo = periodNone ? null : isoDate(body.periodTo);
  const typedLength = periodNone ? { ok: true, text: '' } : cleanLength(body.periodText);
  let periodText = typedLength.text;
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
  const noted = noteBody(body.note ?? '');
  const note = noted.text;
  if (!spentOn) errors.push(invalid('spentOn', L('Pick the payment date', 'เลือกวันที่จ่าย')));
  if (!itemName) errors.push(invalid('itemName', L('Enter what was bought', 'กรอกรายการ')));
  if (!category) errors.push(invalid('category', L('Pick a category', 'เลือกประเภทค่าใช้จ่าย')));
  if (category === 'other' && !categoryOther) errors.push(invalid('categoryOther', L('Describe the other category', 'ระบุประเภทอื่น ๆ')));
  if (!vendor) errors.push(invalid('vendor', L('Enter the vendor or payee', 'กรอกผู้ให้บริการหรือผู้รับเงิน')));
  if (!periodNone) {
    if (!periodFrom || !periodTo) {
      errors.push(invalid('period', L('Enter the service period with start and end dates, or tick No service period', 'กรอกระยะเวลา วันเริ่ม และวันสิ้นสุด หรือเลือกไม่มี')));
    } else if (periodFrom > periodTo) {
      errors.push(invalid('period', L('The end date must be on or after the start date', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม')));
    } else if (!periodText) {
      periodText = periodLengthLabel(periodFrom, periodTo, lang);
    }
    if (!typedLength.ok) {
      errors.push(invalid('periodText', L('Length must be at most 40 characters', 'ระยะต้องไม่เกิน 40 ตัวอักษร')));
    }
  }
  if (!amount) errors.push(invalid('amount', L('Amount must be more than 0, with at most 2 decimals', 'จำนวนเงินต้องมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง')));
  if (!vatMode) errors.push(invalid('vatMode', L('Pick VAT included, VAT excluded or foreign', 'เลือกวิธีคิดภาษีหรือรายการต่างประเทศ')));
  if (vatMode === 'foreign') {
    if (!/^[A-Z]{3,8}$/.test(foreignCurrency)) {
      errors.push(invalid('foreignCurrency', L('Currency must be 3 to 8 letters, e.g. USD', 'สกุลเงินต้องเป็นตัวอักษร 3 ถึง 8 ตัว เช่น USD')));
    }
    if (!foreignAmount) {
      errors.push(invalid('foreignAmount', L('Foreign amount must be more than 0, with at most 2 decimals', 'จำนวนเงินต่างประเทศต้องมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง')));
    }
    if (!foreignRate) {
      errors.push(invalid('foreignRate', L('Rate must be more than 0, with at most 8 decimals', 'อัตราต้องมากกว่า 0 และทศนิยมไม่เกิน 8 ตำแหน่ง')));
    }
  }
  if (!payer) errors.push(invalid('payer', L('Enter who paid (the promoter)', 'กรอกผู้ทดรองจ่าย (ผู้เริ่มก่อการ)')));
  if (paymentMethods.length === 0) errors.push(invalid('paymentMethods', L('Pick at least one payment method. Do not enter card or account numbers', 'เลือกวิธีจ่ายอย่างน้อย 1 วิธี และห้ามกรอกเลขบัตรหรือเลขบัญชี')));
  if (paymentMethods.includes('other') && !paymentOther) errors.push(invalid('paymentOther', L('Describe the other payment method without card or account numbers', 'ระบุวิธีจ่ายอื่น ๆ โดยไม่ใส่เลขบัตรหรือเลขบัญชี')));
  if (!receiptNo) errors.push(invalid('receiptNo', L('Enter the receipt or invoice number', 'กรอกเลขที่ใบเสร็จหรือใบแจ้งหนี้')));
  if (!receiptName) errors.push(invalid('receiptName', L('Pick the name on the receipt', 'เลือกชื่อบนใบเสร็จ')));
  if (receiptName === 'other' && !receiptNameOther) errors.push(invalid('receiptNameOther', L('Enter the name on the receipt', 'ระบุชื่อบนใบเสร็จ')));
  if (!transferKnown) errors.push(invalid('transferRights', L('Pick whether rights must be transferred to the company', 'เลือกว่าต้องโอนสิทธิ์ให้บริษัทหรือไม่')));
  if (transferRights && !transferAsset) errors.push(invalid('transferAsset', L('Name the asset or account to transfer', 'ระบุทรัพย์สินหรือบัญชีที่ต้องโอน')));
  if (noted.error === 'long') errors.push(invalid('note', L('Note is too long', 'หมายเหตุยาวเกินไป')));
  else if (noted.error) errors.push(invalid('note', L('Note is not valid', 'หมายเหตุไม่ถูกต้อง')));
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
