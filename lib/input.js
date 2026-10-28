import { canonicalMoney, canonicalRate, canonicalShare, parseMoneyCents } from './forecast.js';
import { isUuid } from './ids.js';

export const EXPENSE_CATEGORIES = [
  ['domain', 'ค่าจดโดเมน'],
  ['fee', 'ค่าธรรมเนียม DBD'],
  ['software', 'ซอฟต์แวร์-บริการออนไลน์'],
  ['other', 'อื่น ๆ'],
];

export const PAYMENT_METHODS = [
  ['card', 'บัตรเครดิต/เดบิต', 'payCard'],
  ['transfer', 'โอนเงิน', 'payTransfer'],
  ['paypal', 'PayPal/e-wallet', 'payPaypal'],
  ['cash', 'เงินสด', 'payCash'],
  ['other', 'อื่น ๆ', 'payOther'],
];

export const FILE_KINDS = [
  ['receiptFile', 'receipt', 'ใบเสร็จรับเงิน / ใบกำกับภาษี'],
  ['paymentFile', 'payment_proof', 'หลักฐานการชำระเงิน (สลิปโอนเงิน / รายการบัตร)'],
  ['screenshotFile', 'screenshot', 'ภาพหน้าจอรายละเอียดบริการ'],
  ['assignmentFile', 'assignment', 'หนังสือโอนสิทธิ์ให้บริษัท'],
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
  if (typeof value !== 'string') return { error: invalid(label, `${label} ไม่ถูกต้อง`) };
  const items = value.split(/\n/).map((item) => item.trim()).filter(Boolean);
  if (items.length > 80) return { error: invalid(label, `${label} ได้ไม่เกิน 80 บรรทัด`) };
  if (items.some((item) => item.length > 1000 || /[\u0000-\u001F]/.test(item))) {
    return { error: invalid(label, `${label} แต่ละบรรทัดต้องไม่เกิน 1,000 ตัวอักษร`) };
  }
  return { items };
}

export function parseSettings(body) {
  const errors = [];
  const company = line(body.company, 1, 200);
  const currency = code(body.currency);
  const registeredCapital = money(body.registeredCapital, 0n);
  const openingAmount = money(body.openingAmount, 0n);
  const shareText = canonicalShare(typeof body.openingShare === 'string' ? body.openingShare.trim() : '');
  const openingLabel = line(body.openingLabel ?? '', 0, 200) ?? null;
  const openingTiming = line(body.openingTiming ?? '', 0, 200) ?? null;
  const fxBase = code(body.fxBase);
  const fxQuote = code(body.fxQuote);
  const fxRate = typeof body.fxRate === 'string' ? canonicalRate(body.fxRate.trim()) : null;
  const fxSource = line(body.fxSource, 1, 300);
  const fxUpdatedAt = isoDate(body.fxUpdatedAt);
  const fxUpdatedDisplay = line(body.fxUpdatedDisplay, 1, 120);
  const balanceFormula = line(body.balanceFormula, 1, 1000);
  const documentPrefix = typeof body.documentPrefix === 'string' ? body.documentPrefix.trim().toUpperCase() : '';
  const assumptions = noteLines(typeof body.assumptions === 'string' ? body.assumptions : '', 'สมมติฐาน');
  const notYet = noteLines(typeof body.notYetIncluded === 'string' ? body.notYetIncluded : '', 'ยังไม่รวม');
  if (!company) errors.push(invalid('company', 'กรอกชื่อบริษัท ไม่เกิน 200 ตัวอักษร'));
  if (!currency) errors.push(invalid('currency', 'สกุลเงินต้องเป็นตัวอักษร 3 ถึง 8 ตัว เช่น THB'));
  if (!registeredCapital) errors.push(invalid('registeredCapital', 'ทุนจดทะเบียนต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง'));
  if (!openingAmount) errors.push(invalid('openingAmount', 'ทุนยกมาต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง'));
  if (!shareText) errors.push(invalid('openingShare', 'สัดส่วนต้องอยู่ระหว่าง 0 ถึง 100 และทศนิยมไม่เกิน 2 ตำแหน่ง'));
  if (openingLabel == null) errors.push(invalid('openingLabel', 'คำอธิบายทุนยกมายาวเกินไป'));
  if (openingTiming == null) errors.push(invalid('openingTiming', 'ช่วงเวลาของทุนยกมายาวเกินไป'));
  if (!fxBase || !fxQuote) errors.push(invalid('fx', 'สกุลเงินของอัตราแลกเปลี่ยนต้องเป็นตัวอักษร 3 ถึง 8 ตัว'));
  if (!fxRate) errors.push(invalid('fxRate', 'อัตราแลกเปลี่ยนต้องมากกว่า 0 และทศนิยมไม่เกิน 8 ตำแหน่ง'));
  if (!fxSource) errors.push(invalid('fxSource', 'กรอกแหล่งที่มาของอัตราแลกเปลี่ยน'));
  if (!fxUpdatedAt) errors.push(invalid('fxUpdatedAt', 'วันที่อัปเดตอัตราต้องเป็น YYYY-MM-DD'));
  if (!fxUpdatedDisplay) errors.push(invalid('fxUpdatedDisplay', 'กรอกข้อความวันที่ที่จะแสดงบนแดชบอร์ด'));
  if (!balanceFormula) errors.push(invalid('balanceFormula', 'กรอกข้อความสูตรยอดคงเหลือ'));
  if (!/^[A-Z]{2,6}$/.test(documentPrefix)) {
    errors.push(invalid('documentPrefix', 'คำนำหน้าเลขที่เอกสารเป็นตัวอักษรภาษาอังกฤษ 2 ถึง 6 ตัว เช่น EXP หรือ PRE'));
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

export function parseMonth(body) {
  const errors = [];
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const label = line(body.label, 1, 40);
  const labelFull = line(body.labelFull, 1, 80);
  const revenue = money(body.revenue, 0n);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(key)) {
    errors.push(invalid('key', 'รหัสเดือนใช้ได้เฉพาะตัวอักษร ตัวเลข _ และ - เช่น 2026-01'));
  }
  if (!label) errors.push(invalid('label', 'กรอกชื่อเดือนแบบสั้น'));
  if (!labelFull) errors.push(invalid('labelFull', 'กรอกชื่อเดือนแบบเต็ม'));
  if (!revenue) errors.push(invalid('revenue', 'รายรับต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง'));
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
  if (!monthId) errors.push(invalid('monthId', 'เลือกเดือน'));
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(group)) {
    errors.push(invalid('group', 'รหัสกลุ่มใช้ตัวอักษรภาษาอังกฤษตัวเล็ก ตัวเลข _ หรือ - เช่น place'));
  }
  if (!groupName) errors.push(invalid('groupName', 'กรอกชื่อกลุ่ม'));
  if (!name) errors.push(invalid('name', 'กรอกชื่อรายการ'));
  if (!amount) errors.push(invalid('amount', 'จำนวนเงินต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง'));
  if (usdText && !usd) errors.push(invalid('usd', 'จำนวนดอลลาร์ต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง หรือเว้นว่าง'));
  if (note == null) errors.push(invalid('note', 'หมายเหตุยาวเกินไป'));
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
  if (!spentOn) errors.push(invalid('spentOn', 'เลือกวันที่จ่าย'));
  if (!itemName) errors.push(invalid('itemName', 'กรอกรายการ'));
  if (!category) errors.push(invalid('category', 'เลือกประเภทค่าใช้จ่าย'));
  if (category === 'other' && !categoryOther) errors.push(invalid('categoryOther', 'ระบุประเภทอื่น ๆ'));
  if (!vendor) errors.push(invalid('vendor', 'กรอกผู้ให้บริการหรือผู้รับเงิน'));
  if (!periodNone && (!periodText || !periodFrom || !periodTo || periodFrom > periodTo)) {
    errors.push(invalid('period', 'กรอกระยะเวลา วันเริ่ม และวันสิ้นสุด หรือเลือกไม่มี'));
  }
  if (!amount) errors.push(invalid('amount', 'จำนวนเงินต้องมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง'));
  if (!vatMode) errors.push(invalid('vatMode', 'เลือกวิธีคิดภาษีหรือรายการต่างประเทศ'));
  if (vatMode === 'foreign' && (!/^[A-Z]{3,8}$/.test(foreignCurrency) || !foreignAmount || !foreignRate)) {
    errors.push(invalid('foreign', 'รายการต่างประเทศต้องมีสกุลเงิน จำนวน และอัตรา'));
  }
  if (!payer) errors.push(invalid('payer', 'กรอกผู้ทดรองจ่าย (ผู้เริ่มก่อการ)'));
  if (paymentMethods.length === 0) errors.push(invalid('paymentMethods', 'เลือกวิธีจ่ายอย่างน้อย 1 วิธี และห้ามกรอกเลขบัตรหรือเลขบัญชี'));
  if (paymentMethods.includes('other') && !paymentOther) errors.push(invalid('paymentOther', 'ระบุวิธีจ่ายอื่น ๆ โดยไม่ใส่เลขบัตรหรือเลขบัญชี'));
  if (!receiptNo) errors.push(invalid('receiptNo', 'กรอกเลขที่ใบเสร็จหรือ Invoice'));
  if (!receiptName) errors.push(invalid('receiptName', 'เลือกชื่อบนใบเสร็จ'));
  if (receiptName === 'other' && !receiptNameOther) errors.push(invalid('receiptNameOther', 'ระบุชื่อบนใบเสร็จ'));
  if (!transferKnown) errors.push(invalid('transferRights', 'เลือกว่าต้องโอนสิทธิ์ให้บริษัทหรือไม่'));
  if (transferRights && !transferAsset) errors.push(invalid('transferAsset', 'ระบุทรัพย์สินหรือบัญชีที่ต้องโอน'));
  if (note == null) errors.push(invalid('note', 'หมายเหตุยาวเกินไป'));
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
