import { thaiDate } from './dates.js';
import { csrfField, esc } from './html.js';
import { EXPENSE_CATEGORIES, FILE_KINDS, PAYMENT_METHODS } from './input.js';
import { logoutForm, renderNav } from './nav.js';

function who(session) {
  return session.name ? `${session.name} · ${session.email}` : session.email;
}

export function managePage({ title, active, session, csrf, main }) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="csrf-token" content="${esc(csrf)}">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/app-assets/manage.css">
</head>
<body>
  <header class="top">
    <div>
      <p class="kicker">BoromTech</p>
      <h1>${esc(title)}</h1>
    </div>
    <div class="session">
      <p>เข้าสู่ระบบด้วย <strong>${esc(who(session))}</strong></p>
      ${logoutForm(csrf)}
    </div>
  </header>
  ${renderNav(active)}
  <main>${main}</main>
</body>
</html>`;
}

function flash(saved) {
  return saved ? '<p class="ok" role="status">บันทึกแล้ว การเปลี่ยนแปลงจะเห็นเมื่อเปิดหน้านั้นอีกครั้ง</p>' : '';
}

function errorsBlock(errors) {
  if (!errors || errors.length === 0) return '';
  const items = errors.map((error) => `<li>${esc(error.message || error)}</li>`).join('');
  return `<div class="error" role="alert"><ul>${items}</ul></div>`;
}

function field(name, label, value, options = {}) {
  const type = options.type || 'text';
  const required = options.required === false ? '' : ' required';
  const hint = options.hint ? `<p class="hint">${esc(options.hint)}</p>` : '';
  const attrs = [
    options.maxlength ? ` maxlength="${options.maxlength}"` : '',
    options.min ? ` min="${options.min}"` : '',
    options.step ? ` step="${options.step}"` : '',
  ].join('');
  return `<label class="field" for="f-${esc(name)}"><span>${esc(label)}</span>${hint}<input id="f-${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value ?? '')}"${required}${attrs}></label>`;
}

function area(name, label, value, hint) {
  return `<label class="field" for="f-${esc(name)}"><span>${esc(label)}</span>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<textarea id="f-${esc(name)}" name="${esc(name)}" rows="5">${esc(value ?? '')}</textarea></label>`;
}

function checked(value) {
  return value ? ' checked' : '';
}

export function notConfiguredPage({ session }) {
  return managePage({
    title: 'ยังไม่ได้เชื่อมฐานข้อมูล',
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel">
      <p class="warn" role="status">Supabase is not configured.</p>
      <p>ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY บน Render แล้วเปิดหน้านี้ใหม่ สองค่านี้ใช้บนเซิร์ฟเวอร์เท่านั้น และไม่ถูกส่งมาที่เบราว์เซอร์</p>
    </section>`,
  });
}

export function emptyDashboardPage({ session }) {
  return managePage({
    title: 'ยังไม่มีข้อมูลประมาณการ',
    active: 'dashboard',
    session,
    csrf: session.csrf,
    main: `<section class="panel">
      <p>ยังไม่มีข้อมูลในฐานข้อมูล บันทึกการตั้งค่าได้จากหน้านี้ หรือนำเข้าไฟล์ JSON ครั้งเดียวด้วยคำสั่งใน README</p>
      <p><a class="button" href="/settings">ไปที่การตั้งค่า</a></p>
    </section>`,
  });
}

export function messagePage({ session, title, message, status = '' }) {
  return managePage({
    title,
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel"><p class="${status}" role="status">${esc(message)}</p></section>`,
  });
}

export function logoutConfirmPage({ session }) {
  return managePage({
    title: 'ออกจากระบบ',
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel"><p>ยืนยันออกจากระบบของ ${esc(session.email)}</p>${logoutForm(session.csrf)}</section>`,
  });
}

function settingsValues(forecast) {
  if (!forecast) {
    return {
      company: '',
      currency: 'THB',
      registeredCapital: '',
      openingAmount: '',
      openingShare: '',
      openingAssumed: false,
      openingLabel: '',
      openingTiming: '',
      fxBase: 'USD',
      fxQuote: 'THB',
      fxRate: '',
      fxSource: '',
      fxUpdatedAt: '',
      fxUpdatedDisplay: '',
      balanceFormula: '',
      documentPrefix: 'EXP',
      assumptions: '',
      notYetIncluded: '',
    };
  }
  return {
    company: forecast.company,
    currency: forecast.currency,
    registeredCapital: forecast.registeredCapital,
    openingAmount: forecast.openingCapital.amount,
    openingShare: forecast.openingCapital.shareText || String(forecast.openingCapital.sharePercent),
    openingAssumed: forecast.openingCapital.assumed === true,
    openingLabel: forecast.openingCapital.label,
    openingTiming: forecast.openingCapital.timing,
    fxBase: forecast.fx.base,
    fxQuote: forecast.fx.quote,
    fxRate: forecast.fx.rate,
    fxSource: forecast.fx.source,
    fxUpdatedAt: forecast.fx.updatedAt,
    fxUpdatedDisplay: forecast.fx.updatedDisplay,
    balanceFormula: forecast.balanceFormula,
    documentPrefix: forecast.documentPrefix || 'EXP',
    assumptions: (forecast.assumptions || []).join('\n'),
    notYetIncluded: (forecast.notYetIncluded || []).join('\n'),
  };
}

export function settingsPage({ session, forecast, csrf, errors = [], values = null, saved = false }) {
  const form = { ...settingsValues(forecast), ...stripEmpty(values) };
  if (values && !Object.prototype.hasOwnProperty.call(values, 'openingAssumed')) form.openingAssumed = false;
  const main = `<section class="panel">
    ${flash(saved)}
    ${errorsBlock(errors)}
    <form method="post" action="/settings">
      ${csrfField(csrf)}
      <fieldset>
        <legend>บริษัทและทุน</legend>
        ${field('company', 'ชื่อบริษัท', form.company, { maxlength: 200 })}
        ${field('currency', 'สกุลเงิน', form.currency, { maxlength: 8, hint: 'เช่น THB' })}
        ${field('registeredCapital', 'ทุนจดทะเบียน', form.registeredCapital, { hint: 'ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 2000000.00 ไม่ใส่จุลภาค' })}
        ${field('openingAmount', 'ทุนยกมา', form.openingAmount, { hint: 'ยอดก่อนเดือนแรก' })}
        ${field('openingShare', 'สัดส่วนทุนยกมา (%)', form.openingShare, { hint: '0 ถึง 100' })}
        <label class="check"><input type="checkbox" name="openingAssumed" value="on"${checked(form.openingAssumed)}> ทุนยกมาเป็นตัวเลขสมมติ</label>
        ${field('openingLabel', 'คำอธิบายทุนยกมา', form.openingLabel, { required: false, maxlength: 200 })}
        ${field('openingTiming', 'ช่วงเวลาของทุนยกมา', form.openingTiming, { required: false, maxlength: 200 })}
      </fieldset>
      <fieldset>
        <legend>อัตราแลกเปลี่ยน</legend>
        ${field('fxBase', 'สกุลตั้งต้น', form.fxBase, { maxlength: 8, hint: 'เช่น USD' })}
        ${field('fxQuote', 'สกุลปลายทาง', form.fxQuote, { maxlength: 8, hint: 'เช่น THB' })}
        ${field('fxRate', 'อัตรา', form.fxRate, { hint: 'มากกว่า 0 ทศนิยมได้ถึง 8 ตำแหน่ง เช่น 33.78705' })}
        ${field('fxSource', 'แหล่งที่มา', form.fxSource, { maxlength: 300 })}
        ${field('fxUpdatedAt', 'วันที่อัปเดต', form.fxUpdatedAt, { type: 'date' })}
        ${field('fxUpdatedDisplay', 'ข้อความวันที่บนแดชบอร์ด', form.fxUpdatedDisplay, { maxlength: 120, hint: 'เช่น 1 มกราคม 2026' })}
      </fieldset>
      <fieldset>
        <legend>สูตรและหมายเหตุ</legend>
        ${field('balanceFormula', 'ข้อความสูตรยอดคงเหลือ', form.balanceFormula, { maxlength: 1000 })}
        ${field('documentPrefix', 'คำนำหน้าเลขที่รายจ่ายจริง', form.documentPrefix, { maxlength: 6, hint: 'ค่าเริ่มต้น EXP ได้เลข EXP-0001 แม่แบบใบทดรองจ่ายพูดถึง PRE สามารถเปลี่ยนเป็น PRE ได้' })}
        ${area('assumptions', 'สมมติฐาน', form.assumptions, 'หนึ่งข้อต่อหนึ่งบรรทัด')}
        ${area('notYetIncluded', 'ยังไม่รวม', form.notYetIncluded, 'หนึ่งข้อต่อหนึ่งบรรทัด')}
      </fieldset>
      <button class="primary" type="submit">บันทึกการตั้งค่า</button>
    </form>
  </section>`;
  return managePage({ title: 'ตั้งค่า', active: 'settings', session, csrf, main });
}

function stripEmpty(values) {
  if (!values) return {};
  return values;
}

export function forecastPage({ session, forecast, csrf, errors = [], saved = false }) {
  const months = forecast?.months || [];
  const cards = months.map((month) => {
    const items = month.items.map((item) => `<tr>
      <td>${esc(item.name)}</td>
      <td>${esc(item.groupName)} <span class="muted">${esc(item.group)}</span></td>
      <td class="num">${esc(item.amount)}</td>
      <td>${item.assumed ? 'สมมติ' : ''}</td>
      <td><a href="/forecast/items/${esc(item.id)}">แก้ไข</a></td>
    </tr>`).join('');
    return `<section class="panel">
      <h2>${esc(month.labelFull)}</h2>
      <form method="post" action="/forecast/months/${esc(month.id)}" class="grid">
        ${csrfField(csrf)}
        ${field('key', 'รหัสเดือน', month.key, { maxlength: 40 })}
        ${field('label', 'ชื่อสั้น', month.label, { maxlength: 40 })}
        ${field('labelFull', 'ชื่อเต็ม', month.labelFull, { maxlength: 80 })}
        ${field('revenue', 'รายรับ', month.revenue, { hint: 'เช่น 50000.00' })}
        <button class="primary" type="submit">บันทึกรายรับ</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>รายการ</th><th>กลุ่ม</th><th class="num">จำนวน</th><th>สมมติ</th><th></th></tr></thead>
          <tbody>${items || '<tr><td colspan="5">ยังไม่มีรายจ่าย</td></tr>'}</tbody>
        </table>
      </div>
      <p><a class="button" href="/forecast/items/new?month=${esc(month.id)}">เพิ่มรายจ่ายในเดือนนี้</a></p>
      <form method="post" action="/forecast/months/${esc(month.id)}/delete" class="danger-row">
        ${csrfField(csrf)}
        <label class="check"><input type="checkbox" name="confirm" value="yes" required> ยืนยันการลบเดือนนี้และรายจ่ายในเดือน</label>
        <button class="danger" type="submit">ลบเดือน</button>
      </form>
    </section>`;
  }).join('');
  const main = `${flash(saved)}
    ${errorsBlock(errors)}
    <section class="panel">
      <h2>เพิ่มเดือน</h2>
      <form method="post" action="/forecast/months" class="grid">
        ${csrfField(csrf)}
        ${field('key', 'รหัสเดือน', '', { maxlength: 40, hint: 'เช่น 2026-04' })}
        ${field('label', 'ชื่อสั้น', '', { maxlength: 40, hint: 'เช่น เม.ย.' })}
        ${field('labelFull', 'ชื่อเต็ม', '', { maxlength: 80 })}
        ${field('revenue', 'รายรับ', '0.00')}
        <button class="primary" type="submit">เพิ่มเดือน</button>
      </form>
    </section>
    ${cards || '<section class="panel"><p>ยังไม่มีเดือน</p></section>'}`;
  return managePage({ title: 'รายรับและรายจ่ายประมาณการ', active: 'forecast', session, csrf, main });
}

export function itemFormPage({ session, forecast, csrf, item = null, values = null, errors = [], monthId = '' }) {
  const form = values || (item ? {
    monthId: item.monthId,
    group: item.group,
    groupName: item.groupName,
    name: item.name,
    amount: item.amount,
    assumed: item.assumed,
    note: item.note,
  } : {
    monthId: monthId || forecast?.months?.[0]?.id || '',
    group: '',
    groupName: '',
    name: '',
    amount: '',
    assumed: false,
    note: '',
  });
  if (values && !Object.prototype.hasOwnProperty.call(values, 'assumed')) form.assumed = false;
  const options = (forecast?.months || []).map((month) => {
    const selected = month.id === form.monthId ? ' selected' : '';
    return `<option value="${esc(month.id)}"${selected}>${esc(month.labelFull)}</option>`;
  }).join('');
  const action = item ? `/forecast/items/${esc(item.id)}` : '/forecast/items';
  const main = `<section class="panel">
    ${errorsBlock(errors)}
    ${options ? '' : '<p class="warn">เพิ่มเดือนก่อน จึงจะเพิ่มรายจ่ายได้</p>'}
    <form method="post" action="${action}">
      ${csrfField(csrf)}
      <label class="field" for="f-monthId"><span>เดือน</span>
        <select id="f-monthId" name="monthId" required>${options}</select>
      </label>
      ${field('name', 'ชื่อรายการ', form.name, { maxlength: 300 })}
      ${field('group', 'รหัสกลุ่ม', form.group, { maxlength: 40, hint: 'ภาษาอังกฤษตัวเล็ก เช่น place หรือ team' })}
      ${field('groupName', 'ชื่อกลุ่ม', form.groupName, { maxlength: 200 })}
      ${field('amount', 'จำนวนเงิน', form.amount, { hint: 'ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 20000.00' })}
      <label class="check"><input type="checkbox" name="assumed" value="on"${checked(form.assumed)}> เป็นตัวเลขสมมติ</label>
      ${area('note', 'หมายเหตุ', form.note, 'ไม่บังคับ')}
      <button class="primary" type="submit">${item ? 'บันทึกการแก้ไข' : 'เพิ่มรายจ่าย'}</button>
    </form>
    ${item ? `<form method="post" action="/forecast/items/${esc(item.id)}/delete" class="danger-row">
      ${csrfField(csrf)}
      <label class="check"><input type="checkbox" name="confirm" value="yes" required> ยืนยันการลบรายการนี้</label>
      <button class="danger" type="submit">ลบรายการ</button>
    </form>` : ''}
    <p><a href="/forecast">กลับไปหน้ารายการ</a></p>
  </section>`;
  return managePage({
    title: item ? 'แก้ไขรายจ่ายประมาณการ' : 'เพิ่มรายจ่ายประมาณการ',
    active: 'forecast',
    session,
    csrf,
    main,
  });
}

function selectedMethods(source) {
  const fromBoxes = PAYMENT_METHODS
    .filter(([, , fieldName]) => source[fieldName] === 'on' || source[fieldName] === 'true' || source[fieldName] === '1')
    .map(([key]) => key);
  if (fromBoxes.length) return new Set(fromBoxes);
  if (Array.isArray(source.paymentMethods)) return new Set(source.paymentMethods);
  return new Set();
}

function actualFields(form, { uploads = false } = {}) {
  const methods = selectedMethods(form);
  const periodNone = form.periodNone === true || form.periodNone === 'on';
  const categories = EXPENSE_CATEGORIES.map(([key, label]) => {
    const checked = form.category === key ? ' checked' : '';
    return `<label class="check"><input type="radio" name="category" value="${key}"${checked} required> ${esc(label)}</label>`;
  }).join('');
  const pays = PAYMENT_METHODS.map(([key, label, fieldName]) => {
    const checked = methods.has(key) ? ' checked' : '';
    return `<label class="check"><input type="checkbox" name="${fieldName}" value="on"${checked}> ${esc(label)}</label>`;
  }).join('');
  const vat = (value, label) => `<label class="check"><input type="radio" name="vatMode" value="${value}"${form.vatMode === value ? ' checked' : ''}> ${label}</label>`;
  const receipt = (value, label) => `<label class="check"><input type="radio" name="receiptName" value="${value}"${form.receiptName === value ? ' checked' : ''}> ${esc(label)}</label>`;
  const uploadsHtml = uploads ? `<fieldset>
    <legend>เอกสารแนบ</legend>
    <p class="hint">PDF, JPG หรือ PNG รวมไม่เกิน 4 ไฟล์ ไฟล์ละไม่เกิน 5 MB อย่างน้อย 1 ไฟล์ ห้ามแนบเลขบัตรหรือเลขบัญชีเต็ม</p>
    ${FILE_KINDS.map(([fieldName, , label]) => `<label class="field" for="f-${fieldName}"><span>${esc(label)}</span><input id="f-${fieldName}" name="${fieldName}" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label>`).join('')}
  </fieldset>` : '';
  return `${field('spentOn', 'วันที่จ่าย', form.spentOn, { type: 'date' })}
    ${field('itemName', 'รายการ', form.itemName, { maxlength: 200 })}
    <fieldset><legend>ประเภท</legend>${categories}${field('categoryOther', 'อื่น ๆ ระบุ', form.categoryOther || '', { required: false, maxlength: 80 })}</fieldset>
    ${field('vendor', 'ผู้ให้บริการ / ผู้รับเงิน', form.vendor, { maxlength: 200 })}
    <fieldset>
      <legend>ระยะเวลา (ถ้ามี)</legend>
      <label class="check"><input type="checkbox" name="periodNone" value="on"${periodNone ? ' checked' : ''}> ไม่มี</label>
      ${field('periodText', 'ระยะ', form.periodText || '', { required: false, maxlength: 40, hint: 'เช่น 1 ปี' })}
      ${field('periodFrom', 'ตั้งแต่', form.periodFrom || '', { type: 'date', required: false })}
      ${field('periodTo', 'ถึง', form.periodTo || '', { type: 'date', required: false })}
    </fieldset>
    ${field('amount', 'จำนวนเงิน (บาท)', form.amount, { hint: 'มากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง' })}
    <fieldset>
      <legend>ภาษี / ต่างประเทศ</legend>
      ${vat('included', 'รวม VAT')}
      ${vat('excluded', 'ไม่รวม VAT')}
      ${vat('foreign', 'ต่างประเทศ')}
      ${field('foreignCurrency', 'สกุล', form.foreignCurrency || '', { required: false, maxlength: 8 })}
      ${field('foreignAmount', 'จำนวนเงินต่างประเทศ', form.foreignAmount || '', { required: false })}
      ${field('foreignRate', 'อัตรา', form.foreignRate || '', { required: false, hint: 'ทศนิยมได้ถึง 8 ตำแหน่ง' })}
    </fieldset>
    ${field('payer', 'ผู้ทดรองจ่าย (ผู้เริ่มก่อการ)', form.payer, { maxlength: 120 })}
    <fieldset>
      <legend>วิธีจ่าย</legend>
      ${pays}
      ${field('paymentOther', 'อื่น ๆ ระบุ', form.paymentOther || '', { required: false, maxlength: 80 })}
      <p class="hint">ห้ามกรอกเลขบัตร/เลขบัญชี</p>
    </fieldset>
    ${field('receiptNo', 'เลขที่ใบเสร็จ / Invoice', form.receiptNo, { maxlength: 80 })}
    <fieldset>
      <legend>ชื่อบนใบเสร็จ/ใบกำกับ</legend>
      ${receipt('company', 'บริษัท (อยู่ระหว่างจดทะเบียน)')}
      ${receipt('promoter', 'ผู้เริ่มก่อการ')}
      ${receipt('other', 'อื่น ๆ')}
      ${field('receiptNameOther', 'อื่น ๆ ระบุ', form.receiptNameOther || '', { required: false, maxlength: 120 })}
    </fieldset>
    <fieldset>
      <legend>ต้องโอนสิทธิ์ให้บริษัท?</legend>
      <label class="check"><input type="radio" name="transferRights" value="yes"${form.transferRights === true || form.transferRights === 'yes' ? ' checked' : ''}> ใช่ – ทรัพย์สิน/บัญชี</label>
      ${field('transferAsset', 'ทรัพย์สินหรือบัญชี', form.transferAsset || '', { required: false, maxlength: 200 })}
      <label class="check"><input type="radio" name="transferRights" value="no"${form.transferRights === false || form.transferRights === 'no' ? ' checked' : ''}> ไม่</label>
    </fieldset>
    ${area('note', 'หมายเหตุ', form.note || '', 'ไม่บังคับ')}
    ${uploadsHtml}`;
}

const BLANK_ACTUAL = {
  spentOn: '',
  itemName: '',
  category: '',
  categoryOther: '',
  vendor: '',
  periodNone: true,
  periodText: '',
  periodFrom: '',
  periodTo: '',
  amount: '',
  vatMode: 'excluded',
  foreignCurrency: '',
  foreignAmount: '',
  foreignRate: '',
  payer: '',
  paymentMethods: [],
  paymentOther: '',
  receiptNo: '',
  receiptName: 'company',
  receiptNameOther: '',
  transferRights: false,
  transferAsset: '',
  note: '',
};

export function actualListPage({ session, expenses, csrf, saved = false }) {
  const rows = expenses.map((expense) => `<tr>
    <td><a href="/actual/${esc(expense.id)}">${esc(expense.documentNo)}</a></td>
    <td>${esc(thaiDate(expense.spentOn))}</td>
    <td>${esc(expense.itemName)}</td>
    <td>${esc(expense.vendor || '')}</td>
    <td class="num">${esc(expense.amount)}</td>
    <td>${esc(expense.payer)}</td>
    <td>${expense.files.length}</td>
  </tr>`).join('');
  const main = `${flash(saved)}
    <section class="panel">
      <p><a class="button" href="/actual/new">บันทึกรายจ่ายจริง</a></p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>เลขที่</th><th>วันที่</th><th>รายการ</th><th>ผู้รับเงิน</th><th class="num">จำนวน</th><th>ผู้ทดรองจ่าย</th><th>ไฟล์</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7">ยังไม่มีรายจ่ายจริง</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
  return managePage({ title: 'รายจ่ายจริง', active: 'actual', session, csrf, main });
}

export function actualFormPage({ session, csrf, errors = [], values = null, prefix = 'EXP' }) {
  const form = { ...BLANK_ACTUAL, ...(values || {}) };
  if (values) form.periodNone = values.periodNone === 'on' || values.periodNone === true;
  const main = `<section class="panel">
    <p>ระบบออกเลขที่เอกสารให้อัตโนมัติ เช่น ${esc(prefix)}-0001 หนึ่งรายการต่อหนึ่งใบทดรองจ่าย</p>
    ${errorsBlock(errors)}
    <form method="post" action="/actual" enctype="multipart/form-data">
      ${csrfField(csrf)}
      ${actualFields(form, { uploads: true })}
      <button class="primary" type="submit">บันทึกรายจ่ายจริง</button>
    </form>
  </section>`;
  return managePage({ title: 'บันทึกรายจ่ายจริง', active: 'actual', session, csrf, main });
}

export function actualDetailPage({ session, expense, csrf, errors = [], values = null, saved = false }) {
  const form = values || expense;
  const files = expense.files.map((file) => {
    const href = `/actual/${esc(expense.id)}/files/${esc(file.id)}`;
    const preview = file.contentType === 'application/pdf'
      ? `<a href="${href}">เปิด PDF</a>`
      : `<img src="${href}" alt="หลักฐาน ${esc(file.filename)}">`;
    return `<li><p>${esc(file.filename)}</p>${preview}</li>`;
  }).join('');
  const main = `${flash(saved)}
    <section class="panel">
      <p class="doc-no">${esc(expense.documentNo)}</p>
      <ul class="files">${files}</ul>
    </section>
    <section class="panel">
      ${errorsBlock(errors)}
      <form method="post" action="/actual/${esc(expense.id)}">
        ${csrfField(csrf)}
        ${actualFields(form)}
        <button class="primary" type="submit">บันทึกการแก้ไข</button>
      </form>
      <form method="post" action="/actual/${esc(expense.id)}/delete" class="danger-row">
        ${csrfField(csrf)}
        <label class="check"><input type="checkbox" name="confirm" value="yes" required> ยืนยันการลบรายการและไฟล์หลักฐาน</label>
        <button class="danger" type="submit">ลบรายจ่ายจริง</button>
      </form>
      <p><a class="button" href="/actual/${esc(expense.id)}/form">พิมพ์ใบทดรองจ่าย</a></p>
    </section>`;
  return managePage({ title: expense.documentNo, active: 'actual', session, csrf, main });
}

export function reimburseSelectPage({ session, expenses, csrf }) {
  const rows = expenses.map((expense) => `<tr>
    <td>${esc(expense.documentNo)}</td>
    <td>${esc(thaiDate(expense.spentOn))}</td>
    <td>${esc(expense.itemName)}</td>
    <td class="num">${esc(expense.amount)}</td>
    <td><a href="/actual/${esc(expense.id)}/form">พิมพ์ใบ</a></td>
  </tr>`).join('');
  const main = `<section class="panel">
    <p>ใบทดรองจ่ายหนึ่งใบต่อหนึ่งรายจ่ายจริง ใช้แม่แบบก่อนจัดตั้งบริษัท</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>เลขที่</th><th>วันที่</th><th>รายการ</th><th class="num">จำนวน</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">ยังไม่มีรายจ่ายจริง</td></tr>'}</tbody>
      </table>
    </div>
  </section>`;
  return managePage({ title: 'ใบทดรองจ่าย', active: 'reimburse', session, csrf, main });
}
