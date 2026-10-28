import { canonicalMoney } from './forecast.js';
import { isUuid } from './ids.js';

function invalid(field, message) {
  return { field, message };
}

function text(value, min, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  if (/[\u0000-\u001F]/.test(trimmed)) return null;
  return trimmed;
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10) === value ? value : '';
}

// Office form: an actual expense (existing actual_expenses row) or a forecast
// item. Advance rows record who paid. createdBy is set by the server, never here.
export function parseOfficeExpense(body) {
  const errors = [];
  const kind = body?.kind === 'forecast' ? 'forecast' : body?.kind === 'actual' ? 'actual' : '';
  const itemName = text(body?.itemName, 1, 200);
  const amount = canonicalMoney(typeof body?.amount === 'string' ? body.amount : '');
  const spentOn = isoDate(body?.spentOn);
  const advance = body?.advance === 'on' || body?.advance === 'true' || body?.advance === '1';
  const payer = text(typeof body?.payer === 'string' ? body.payer : '', 0, 120);
  const vendor = text(typeof body?.vendor === 'string' ? body.vendor : '', 0, 200);
  const receiptNo = text(typeof body?.receiptNo === 'string' ? body.receiptNo : '', 0, 80);
  const note = text(typeof body?.note === 'string' ? body.note : '', 0, 2000);
  const monthId = typeof body?.monthId === 'string' ? body.monthId.trim() : '';

  if (!kind) errors.push(invalid('kind', 'เลือกประเภทรายจ่ายจริงหรือคาดการณ์'));
  if (!itemName) errors.push(invalid('itemName', 'กรอกรายการ'));
  if (!amount || amount === '0.00') errors.push(invalid('amount', 'จำนวนเงินต้องมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง'));
  if (!spentOn) errors.push(invalid('spentOn', 'เลือกวันที่'));
  if (note == null) errors.push(invalid('note', 'หมายเหตุยาวเกินไป'));
  if (payer == null) errors.push(invalid('payer', 'ชื่อผู้จ่ายยาวเกินไป'));
  if ((kind === 'actual' || advance) && !payer) {
    errors.push(invalid('payer', 'กรอกผู้จ่าย หรือผู้ทดรองจ่าย'));
  }
  if (kind === 'actual') {
    if (!vendor) errors.push(invalid('vendor', 'กรอกผู้รับเงิน'));
    if (!receiptNo) errors.push(invalid('receiptNo', 'กรอกเลขที่ใบเสร็จหรือ Invoice'));
  }
  if (kind === 'forecast' && !isUuid(monthId)) {
    errors.push(invalid('monthId', 'เลือกเดือนของรายจ่ายคาดการณ์'));
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind,
      itemName,
      amount,
      spentOn,
      advance,
      payer: payer || '',
      vendor: vendor || '',
      receiptNo: receiptNo || '',
      note: note || '',
      monthId: kind === 'forecast' ? monthId : '',
    },
  };
}

export function actualPayload(expense, createdBy) {
  return {
    spentOn: expense.spentOn,
    itemName: expense.itemName,
    category: 'other',
    categoryOther: 'สำนักงาน',
    vendor: expense.vendor,
    periodNone: true,
    periodText: '',
    periodFrom: null,
    periodTo: null,
    amount: expense.amount,
    vatMode: 'included',
    foreignCurrency: '',
    foreignAmount: null,
    foreignRate: null,
    payer: expense.payer,
    paymentMethods: ['transfer'],
    paymentOther: '',
    receiptNo: expense.receiptNo,
    receiptName: expense.advance ? 'promoter' : 'company',
    receiptNameOther: '',
    transferRights: false,
    transferAsset: '',
    note: expense.note,
    advance: expense.advance === true,
    createdBy,
  };
}

export function forecastPayload(expense, createdBy) {
  return {
    monthId: expense.monthId,
    group: 'office',
    groupName: 'สำนักงาน',
    name: expense.itemName,
    amount: expense.amount,
    usd: null,
    assumed: true,
    note: expense.note,
    payer: expense.payer,
    advance: expense.advance === true,
    createdBy,
  };
}
