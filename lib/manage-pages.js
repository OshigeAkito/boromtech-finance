import { thaiDate } from './dates.js';
import { formatCents, parseMoneyCents } from './forecast.js';
import { csrfField, esc } from './html.js';
import { EXPENSE_CATEGORIES, FILE_KINDS, PAYMENT_METHODS } from './input.js';
import { logoutForm, renderShell } from './nav.js';

export function managePage({ title, active, session, csrf, main, sub = '', actions = '', kicker = '' }) {
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
  ${renderShell({ active, email: session.email, name: session.name, csrf })}
  <div class="page-head">
    <div>
      ${kicker ? `<p class="kicker">${kicker}</p>` : ''}
      <h1>${esc(title)}</h1>
      ${sub ? `<p class="sub">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>
  <main id="main">${main}</main>
</body>
</html>`;
}

function flash(saved) {
  return saved ? '<p class="ok" role="status">บันทึกแล้ว การเปลี่ยนแปลงจะเห็นเมื่อเปิดหน้านั้นอีกครั้ง</p>' : '';
}

function errorsBlock(errors) {
  if (!errors || errors.length === 0) return '';
  const items = errors.map((error) => `<li>${esc(error.message || error)}</li>`).join('');
  return `<div class="error" role="alert"><div><strong>ยังบันทึกไม่ได้ กรุณาแก้ไข</strong><ul>${items}</ul></div></div>`;
}

function field(name, label, value, options = {}) {
  const type = options.type || 'text';
  const required = options.required === false ? '' : ' required';
  const hint = options.hint ? `<p class="hint">${esc(options.hint)}</p>` : '';
  const attrs = [
    options.maxlength ? ` maxlength="${options.maxlength}"` : '',
    options.min ? ` min="${options.min}"` : '',
    options.step ? ` step="${options.step}"` : '',
    options.inputmode ? ` inputmode="${options.inputmode}"` : '',
    options.placeholder ? ` placeholder="${esc(options.placeholder)}"` : '',
    options.autocomplete ? ` autocomplete="${options.autocomplete}"` : '',
  ].join('');
  const cls = options.wide ? ' wide' : '';
  const mark = options.required === false ? ' <span class="muted">(ไม่บังคับ)</span>' : '';
  return `<label class="field${cls}" for="f-${esc(name)}"><span>${esc(label)}${mark}</span>${hint}<input id="f-${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value ?? '')}"${required}${attrs}></label>`;
}

function moneyField(name, label, value, options = {}) {
  return field(name, label, value, { inputmode: 'decimal', placeholder: '0.00', autocomplete: 'off', ...options });
}

function area(name, label, value, hint, rows = 5) {
  return `<label class="field wide" for="f-${esc(name)}"><span>${esc(label)}</span>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<textarea id="f-${esc(name)}" name="${esc(name)}" rows="${rows}">${esc(value ?? '')}</textarea></label>`;
}

function checked(value) {
  return value ? ' checked' : '';
}

function baht(value) {
  const cents = parseMoneyCents(value);
  return cents === null || cents === undefined ? esc(value) : esc(formatCents(cents));
}

function safeCents(value) {
  try {
    const cents = parseMoneyCents(value);
    return typeof cents === 'bigint' ? cents : 0n;
  } catch {
    return 0n;
  }
}

function dangerZone(action, csrf, confirmText, buttonText, summary = 'ลบ') {
  return `<details class="disclosure danger-zone">
      <summary>${esc(summary)}</summary>
      <form method="post" action="${action}" class="danger-row">
        ${csrfField(csrf)}
        <label class="check"><input type="checkbox" name="confirm" value="yes" required> ${esc(confirmText)}</label>
        <button class="danger" type="submit">${esc(buttonText)}</button>
      </form>
    </details>`;
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
      <h2>เริ่มต้นใช้งาน</h2>
      <ol class="steps">
        <li><strong>นำเข้าตัวเลขครั้งแรก</strong> รันคำสั่ง <span class="code">npm run import-forecast -- /path/นอกรีโป/forecast.json</span> บนเครื่องที่มีไฟล์ .env ตามขั้นตอนใน README</li>
        <li><strong>หรือกรอกเอง</strong> บันทึกการตั้งค่าบริษัทและทุน แล้วเพิ่มเดือนในหน้าประมาณการ</li>
      </ol>
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
    main: `<section class="panel"><p class="${status}" role="status">${esc(message)}</p><p><a class="ghost" href="/">กลับไปที่แดชบอร์ด</a></p></section>`,
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
  const main = `${flash(saved)}
    ${errorsBlock(errors)}
    <form method="post" action="/settings" class="panel">
      ${csrfField(csrf)}
      <fieldset>
        <legend>บริษัทและทุน</legend>
        <div class="grid two">
          ${field('company', 'ชื่อบริษัท', form.company, { maxlength: 200 })}
          ${field('currency', 'สกุลเงิน', form.currency, { maxlength: 8, hint: 'เช่น THB' })}
          ${moneyField('registeredCapital', 'ทุนจดทะเบียน', form.registeredCapital, { hint: 'ทศนิยมไม่เกิน 2 ตำแหน่ง ไม่ใส่จุลภาค เช่น 500000.00' })}
          ${moneyField('openingAmount', 'ทุนยกมา', form.openingAmount, { hint: 'ยอดเงินสดก่อนเดือนแรก' })}
          ${field('openingShare', 'สัดส่วนทุนยกมา (%)', form.openingShare, { hint: '0 ถึง 100', inputmode: 'decimal' })}
          <div class="field"><span>สถานะทุนยกมา</span><label class="check"><input type="checkbox" name="openingAssumed" value="on"${checked(form.openingAssumed)}> เป็นตัวเลขสมมติ</label></div>
          ${field('openingLabel', 'คำอธิบายทุนยกมา', form.openingLabel, { required: false, maxlength: 200 })}
          ${field('openingTiming', 'ช่วงเวลาของทุนยกมา', form.openingTiming, { required: false, maxlength: 200 })}
        </div>
      </fieldset>
      <fieldset>
        <legend>อัตราแลกเปลี่ยน</legend>
        <div class="grid">
          ${field('fxBase', 'สกุลตั้งต้น', form.fxBase, { maxlength: 8, hint: 'เช่น USD' })}
          ${field('fxQuote', 'สกุลปลายทาง', form.fxQuote, { maxlength: 8, hint: 'เช่น THB' })}
          ${field('fxRate', 'อัตรา', form.fxRate, { hint: 'ทศนิยมได้ถึง 8 ตำแหน่ง เช่น 33.78705', inputmode: 'decimal' })}
          ${field('fxSource', 'แหล่งที่มา', form.fxSource, { maxlength: 300 })}
          ${field('fxUpdatedAt', 'วันที่อัปเดต', form.fxUpdatedAt, { type: 'date' })}
          ${field('fxUpdatedDisplay', 'ข้อความวันที่บนแดชบอร์ด', form.fxUpdatedDisplay, { maxlength: 120, hint: 'เช่น 1 มกราคม 2026' })}
        </div>
      </fieldset>
      <fieldset>
        <legend>สูตร เอกสาร และหมายเหตุ</legend>
        <div class="grid two">
          ${field('balanceFormula', 'ข้อความสูตรยอดคงเหลือ', form.balanceFormula, { maxlength: 1000, wide: true })}
          ${field('documentPrefix', 'คำนำหน้าเลขที่รายจ่ายจริง', form.documentPrefix, { maxlength: 6, hint: 'ค่าเริ่มต้น EXP ได้เลข EXP-0001 เปลี่ยนเป็น PRE ได้ถ้าต้องการให้ตรงแม่แบบใบทดรองจ่าย' })}
          ${area('assumptions', 'สมมติฐาน', form.assumptions, 'หนึ่งข้อต่อหนึ่งบรรทัด', 7)}
          ${area('notYetIncluded', 'ยังไม่รวม', form.notYetIncluded, 'หนึ่งข้อต่อหนึ่งบรรทัด', 5)}
        </div>
      </fieldset>
      <div class="form-foot">
        <button class="primary" type="submit">บันทึกการตั้งค่า</button>
        <p class="hint">การเปลี่ยนแปลงมีผลกับแดชบอร์ดทันทีหลังบันทึก</p>
      </div>
    </form>`;
  return managePage({ title: 'ตั้งค่า', active: 'settings', session, csrf, main, sub: 'ข้อมูลบริษัท ทุน อัตราแลกเปลี่ยน และหมายเหตุบนแดชบอร์ด' });
}

function stripEmpty(values) {
  if (!values) return {};
  return values;
}

export function forecastPage({ session, forecast, csrf, errors = [], saved = false }) {
  const months = forecast?.months || [];
  let balance = safeCents(forecast?.openingCapital?.amount || '0');
  const cards = months.map((month) => {
    const spent = month.items.reduce((sum, item) => sum + safeCents(item.amount), 0n);
    balance = balance + safeCents(month.revenue) - spent;
    const items = month.items.map((item) => `<tr>
      <td><a class="row-link" href="/forecast/items/${esc(item.id)}">${esc(item.name)}</a>${item.note ? `<div class="hint">${esc(item.note)}</div>` : ''}</td>
      <td>${esc(item.groupName)}<div class="code">${esc(item.group)}</div></td>
      <td class="num">${baht(item.amount)}</td>
      <td>${item.assumed ? '<span class="assumption">สมมติ</span>' : '<span class="badge">ยืนยัน</span>'}</td>
      <td class="num"><a href="/forecast/items/${esc(item.id)}">แก้ไข</a></td>
    </tr>`).join('');
    return `<details class="panel month-card">
      <summary>
        <h2>${esc(month.labelFull)} <span class="code">${esc(month.key)}</span></h2>
        <div class="month-stats">
          <span>รายการ <strong>${month.items.length}</strong></span>
          <span>รายรับ <strong>${baht(month.revenue)}</strong></span>
          <span>รายจ่าย <strong>${esc(formatCents(spent))}</strong></span>
          <span>คงเหลือ <strong>${esc(formatCents(balance))}</strong></span>
        </div>
      </summary>
      <div class="month-body">
        <div class="table-wrap">
          <table>
            <thead><tr><th>รายการ</th><th>กลุ่ม</th><th class="num">จำนวน (บาท)</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>${items || '<tr><td colspan="5" class="muted">ยังไม่มีรายจ่ายในเดือนนี้</td></tr>'}</tbody>
          </table>
        </div>
        <p class="actions"><a class="button small" href="/forecast/items/new?month=${esc(month.id)}">+ เพิ่มรายจ่ายในเดือนนี้</a></p>
        <details class="disclosure">
          <summary>แก้ไขชื่อเดือนและรายรับ</summary>
          <form method="post" action="/forecast/months/${esc(month.id)}" class="inline-form">
            ${csrfField(csrf)}
            ${field('key', 'รหัสเดือน', month.key, { maxlength: 40 })}
            ${field('label', 'ชื่อสั้น', month.label, { maxlength: 40 })}
            ${field('labelFull', 'ชื่อเต็ม', month.labelFull, { maxlength: 80 })}
            ${moneyField('revenue', 'รายรับ', month.revenue)}
            <button class="primary" type="submit">บันทึกรายรับ</button>
          </form>
        </details>
        ${dangerZone(`/forecast/months/${esc(month.id)}/delete`, csrf, 'ยืนยันการลบเดือนนี้และรายจ่ายในเดือน', 'ลบเดือน', 'ลบเดือนนี้')}
      </div>
    </details>`;
  }).join('');
  const addOpen = months.length === 0 ? ' open' : '';
  const main = `${flash(saved)}
    ${errorsBlock(errors)}
    ${cards ? `<div class="actions" style="margin-bottom:12px"><span class="hint">แตะที่เดือนเพื่อดูและแก้ไขรายการ · ยอดคงเหลือคิดจากทุนยกมา</span></div>${cards}` : '<section class="panel empty"><p>ยังไม่มีเดือน</p></section>'}
    <details class="panel month-card"${addOpen}>
      <summary><h2>+ เพิ่มเดือน</h2></summary>
      <div class="month-body">
        <form method="post" action="/forecast/months" class="inline-form">
          ${csrfField(csrf)}
          ${field('key', 'รหัสเดือน', '', { maxlength: 40, hint: 'เช่น 2570-09' })}
          ${field('label', 'ชื่อสั้น', '', { maxlength: 40, hint: 'เช่น ก.ย. 70' })}
          ${field('labelFull', 'ชื่อเต็ม', '', { maxlength: 80, hint: 'เช่น กันยายน 2570' })}
          ${moneyField('revenue', 'รายรับ', '0.00', { hint: 'ใส่ 0.00 ถ้ายังไม่มี' })}
          <button class="primary" type="submit">เพิ่มเดือน</button>
        </form>
      </div>
    </details>`;
  return managePage({
    title: 'รายรับและรายจ่ายประมาณการ',
    active: 'forecast',
    session,
    csrf,
    main,
    sub: `${months.length} เดือน · ทุกการแก้ไขแสดงบนแดชบอร์ดทันที`,
    actions: months.length ? `<a class="button small" href="/forecast/items/new">+ เพิ่มรายจ่าย</a>` : '',
  });
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
  // Existing groups, so a new item can reuse a code instead of inventing a near-duplicate.
  const known = new Map();
  for (const month of forecast?.months || []) {
    for (const entry of month.items) if (!known.has(entry.group)) known.set(entry.group, entry.groupName);
  }
  const groupList = [...known].map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
  const action = item ? `/forecast/items/${esc(item.id)}` : '/forecast/items';
  const main = `${errorsBlock(errors)}
    ${options ? '' : '<p class="warn">เพิ่มเดือนก่อน จึงจะเพิ่มรายจ่ายได้</p>'}
    <form method="post" action="${action}" class="panel">
      ${csrfField(csrf)}
      <div class="grid two">
        <label class="field" for="f-monthId"><span>เดือน</span>
          <select id="f-monthId" name="monthId" required>${options}</select>
        </label>
        ${moneyField('amount', 'จำนวนเงิน (บาท)', form.amount, { hint: 'ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 20000.00' })}
        ${field('name', 'ชื่อรายการ', form.name, { maxlength: 300, wide: true })}
        <label class="field" for="f-group"><span>รหัสกลุ่ม</span><p class="hint">ภาษาอังกฤษตัวเล็ก ใช้รหัสเดิมเพื่อรวมยอดเป็นรายการเดียวบนแดชบอร์ด</p><input id="f-group" name="group" type="text" value="${esc(form.group ?? '')}" required maxlength="40" list="group-codes" autocomplete="off"></label>
        ${field('groupName', 'ชื่อกลุ่ม', form.groupName, { maxlength: 200 })}
        <div class="field wide"><label class="check"><input type="checkbox" name="assumed" value="on"${checked(form.assumed)}> เป็นตัวเลขสมมติ (แสดงป้าย “สมมติ” บนแดชบอร์ด)</label></div>
        ${area('note', 'หมายเหตุ', form.note, 'ไม่บังคับ', 3)}
      </div>
      <datalist id="group-codes">${groupList}</datalist>
      <div class="form-foot">
        <button class="primary" type="submit">${item ? 'บันทึกการแก้ไข' : 'เพิ่มรายจ่าย'}</button>
        <a class="ghost" href="/forecast">ยกเลิก</a>
      </div>
    </form>
    ${item ? `<section class="panel">${dangerZone(`/forecast/items/${esc(item.id)}/delete`, csrf, 'ยืนยันการลบรายการนี้', 'ลบรายการ', 'ลบรายการนี้')}</section>` : ''}
    <p><a href="/forecast">← กลับไปหน้ารายการ</a></p>`;
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
    const isChecked = form.category === key ? ' checked' : '';
    const trigger = key === 'other' ? ' class="reveal-trigger"' : '';
    return `<label class="check"><input type="radio" name="category" value="${key}"${isChecked}${trigger} required> ${esc(label)}</label>`;
  }).join('');
  const pays = PAYMENT_METHODS.map(([key, label, fieldName]) => {
    const isChecked = methods.has(key) ? ' checked' : '';
    const trigger = key === 'other' ? ' class="reveal-trigger"' : '';
    return `<label class="check"><input type="checkbox" name="${fieldName}" value="on"${isChecked}${trigger}> ${esc(label)}</label>`;
  }).join('');
  const vat = (value, label) => `<label class="check"><input type="radio" name="vatMode" value="${value}"${form.vatMode === value ? ' checked' : ''}${value === 'foreign' ? ' class="reveal-trigger"' : ''}> ${label}</label>`;
  const receipt = (value, label) => `<label class="check"><input type="radio" name="receiptName" value="${value}"${form.receiptName === value ? ' checked' : ''}${value === 'other' ? ' class="reveal-trigger"' : ''}> ${esc(label)}</label>`;
  const transferYes = form.transferRights === true || form.transferRights === 'yes';
  const transferNo = form.transferRights === false || form.transferRights === 'no';
  const uploadsHtml = uploads ? `<fieldset>
    <legend>5 · เอกสารแนบ</legend>
    <p class="hint">PDF, JPG หรือ PNG รวมไม่เกิน 4 ไฟล์ ไฟล์ละไม่เกิน 5 MB ต้องมีอย่างน้อย 1 ไฟล์ ห้ามแนบเลขบัตรหรือเลขบัญชีเต็ม</p>
    <div class="grid two" style="margin-top:12px">
      ${FILE_KINDS.map(([fieldName, , label]) => `<label class="field" for="f-${fieldName}"><span>${esc(label)}</span><input id="f-${fieldName}" name="${fieldName}" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label>`).join('')}
    </div>
  </fieldset>` : '';
  return `<fieldset>
      <legend>1 · รายการ</legend>
      <div class="grid two">
        ${field('spentOn', 'วันที่จ่าย', form.spentOn, { type: 'date' })}
        ${moneyField('amount', 'จำนวนเงิน (บาท)', form.amount, { hint: 'มากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง' })}
        ${field('itemName', 'รายการ', form.itemName, { maxlength: 200, wide: true })}
        ${field('vendor', 'ผู้ให้บริการ / ผู้รับเงิน', form.vendor, { maxlength: 200 })}
        ${field('receiptNo', 'เลขที่ใบเสร็จ / Invoice', form.receiptNo, { maxlength: 80 })}
      </div>
    </fieldset>
    <fieldset>
      <legend>2 · ประเภท</legend>
      <div class="choices">${categories}</div>
      <div class="reveal">${field('categoryOther', 'อื่น ๆ ระบุ', form.categoryOther || '', { required: false, maxlength: 80 })}</div>
    </fieldset>
    <fieldset>
      <legend>ระยะเวลาบริการ</legend>
      <div class="choices"><label class="check"><input type="checkbox" name="periodNone" value="on" class="reveal-hide"${periodNone ? ' checked' : ''}> ไม่มีระยะเวลา</label></div>
      <div class="grid reveal-off">
        ${field('periodText', 'ระยะ', form.periodText || '', { required: false, maxlength: 40, hint: 'เช่น 1 ปี' })}
        ${field('periodFrom', 'ตั้งแต่', form.periodFrom || '', { type: 'date', required: false })}
        ${field('periodTo', 'ถึง', form.periodTo || '', { type: 'date', required: false })}
      </div>
    </fieldset>
    <fieldset>
      <legend>ภาษี / ต่างประเทศ</legend>
      <div class="choices">
        ${vat('included', 'รวม VAT')}
        ${vat('excluded', 'ไม่รวม VAT')}
        ${vat('foreign', 'ต่างประเทศ')}
      </div>
      <div class="grid reveal">
        ${field('foreignCurrency', 'สกุล', form.foreignCurrency || '', { required: false, maxlength: 8, placeholder: 'USD' })}
        ${moneyField('foreignAmount', 'จำนวนเงินต่างประเทศ', form.foreignAmount || '', { required: false })}
        ${field('foreignRate', 'อัตรา', form.foreignRate || '', { required: false, hint: 'ทศนิยมได้ถึง 8 ตำแหน่ง', inputmode: 'decimal' })}
      </div>
    </fieldset>
    <fieldset>
      <legend>3 · ผู้จ่ายและวิธีจ่าย</legend>
      <div class="grid two">${field('payer', 'ผู้ทดรองจ่าย (ผู้เริ่มก่อการ)', form.payer, { maxlength: 120 })}</div>
      <div class="choices">${pays}</div>
      <div class="reveal">${field('paymentOther', 'อื่น ๆ ระบุ', form.paymentOther || '', { required: false, maxlength: 80 })}</div>
      <p class="hint" style="margin-bottom:12px">ห้ามกรอกเลขบัตร/เลขบัญชี</p>
    </fieldset>
    <fieldset>
      <legend>4 · ชื่อบนใบเสร็จ/ใบกำกับ</legend>
      <div class="choices">
        ${receipt('company', 'บริษัท (อยู่ระหว่างจดทะเบียน)')}
        ${receipt('promoter', 'ผู้เริ่มก่อการ')}
        ${receipt('other', 'อื่น ๆ')}
      </div>
      <div class="reveal">${field('receiptNameOther', 'อื่น ๆ ระบุ', form.receiptNameOther || '', { required: false, maxlength: 120 })}</div>
    </fieldset>
    <fieldset>
      <legend>ต้องโอนสิทธิ์ให้บริษัท?</legend>
      <div class="choices">
        <label class="check"><input type="radio" name="transferRights" value="yes" class="reveal-trigger"${transferYes ? ' checked' : ''}> ใช่ – ทรัพย์สิน/บัญชี</label>
        <label class="check"><input type="radio" name="transferRights" value="no"${transferNo ? ' checked' : ''}> ไม่</label>
      </div>
      <div class="reveal">${field('transferAsset', 'ทรัพย์สินหรือบัญชี', form.transferAsset || '', { required: false, maxlength: 200 })}</div>
    </fieldset>
    ${uploadsHtml}
    ${area('note', 'หมายเหตุ', form.note || '', 'ไม่บังคับ', 3)}`;
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
  const total = expenses.reduce((sum, expense) => sum + safeCents(expense.amount), 0n);
  const rows = expenses.map((expense) => `<tr>
    <td><a class="row-link" href="/actual/${esc(expense.id)}">${esc(expense.documentNo)}</a></td>
    <td>${esc(thaiDate(expense.spentOn))}</td>
    <td>${esc(expense.itemName)}</td>
    <td>${esc(expense.vendor || '')}</td>
    <td class="num">${baht(expense.amount)}</td>
    <td>${esc(expense.payer)}</td>
    <td class="num"><span class="badge">${expense.files.length} ไฟล์</span></td>
  </tr>`).join('');
  const table = `<div class="table-wrap">
        <table>
          <thead><tr><th>เลขที่</th><th>วันที่</th><th>รายการ</th><th>ผู้รับเงิน</th><th class="num">จำนวน (บาท)</th><th>ผู้ทดรองจ่าย</th><th class="num">หลักฐาน</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="total"><th colspan="4">รวม ${expenses.length} รายการ</th><td class="num">${esc(formatCents(total))}</td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>`;
  const empty = `<div class="empty">
        <p>ยังไม่มีรายจ่ายจริง</p>
        <p class="hint">บันทึกรายจ่ายที่จ่ายไปแล้วพร้อมใบเสร็จ ระบบออกเลขที่เอกสารให้และพิมพ์ใบทดรองจ่ายได้</p>
        <a class="button" href="/actual/new">บันทึกรายจ่ายจริง</a>
      </div>`;
  const main = `${flash(saved)}
    <section class="panel">
      ${rows ? table : empty}
    </section>`;
  return managePage({
    title: 'รายจ่ายจริง',
    active: 'actual',
    session,
    csrf,
    main,
    sub: 'รายจ่ายที่จ่ายแล้วพร้อมหลักฐาน',
    actions: '<a class="button small" href="/actual/new">+ บันทึกรายจ่ายจริง</a>',
  });
}

export function actualFormPage({ session, csrf, errors = [], values = null, prefix = 'EXP' }) {
  const form = { ...BLANK_ACTUAL, ...(values || {}) };
  if (values) form.periodNone = values.periodNone === 'on' || values.periodNone === true;
  const main = `${errorsBlock(errors)}
    <form method="post" action="/actual" enctype="multipart/form-data" class="panel">
      ${csrfField(csrf)}
      ${actualFields(form, { uploads: true })}
      <div class="form-foot">
        <button class="primary" type="submit">บันทึกรายจ่ายจริง</button>
        <a class="ghost" href="/actual">ยกเลิก</a>
      </div>
    </form>`;
  return managePage({
    title: 'บันทึกรายจ่ายจริง',
    active: 'actual',
    session,
    csrf,
    main,
    sub: `ระบบออกเลขที่เอกสารให้อัตโนมัติ เช่น ${esc(prefix)}-0001 หนึ่งรายการต่อหนึ่งใบทดรองจ่าย`,
  });
}

export function actualDetailPage({ session, expense, csrf, errors = [], values = null, saved = false }) {
  const form = values || expense;
  const files = expense.files.map((file) => {
    const href = `/actual/${esc(expense.id)}/files/${esc(file.id)}`;
    const preview = file.contentType === 'application/pdf'
      ? `<a class="ghost small" href="${href}">เปิด PDF</a>`
      : `<a href="${href}"><img src="${href}" alt="หลักฐาน ${esc(file.filename)}"></a>`;
    return `<li><p>${esc(file.filename)}</p>${preview}</li>`;
  }).join('');
  const main = `${flash(saved)}
    <section class="panel">
      <div class="section-head">
        <h2>สรุป</h2>
        <a class="button small" href="/actual/${esc(expense.id)}/form">พิมพ์ใบทดรองจ่าย</a>
      </div>
      <dl class="facts">
        <div><dt>จำนวนเงิน</dt><dd>${baht(expense.amount)} บาท</dd></div>
        <div><dt>วันที่จ่าย</dt><dd>${esc(thaiDate(expense.spentOn))}</dd></div>
        <div><dt>ผู้รับเงิน</dt><dd>${esc(expense.vendor || '–')}</dd></div>
        <div><dt>ผู้ทดรองจ่าย</dt><dd>${esc(expense.payer || '–')}</dd></div>
      </dl>
      <ul class="files">${files}</ul>
    </section>
    ${errorsBlock(errors)}
    <form method="post" action="/actual/${esc(expense.id)}" class="panel">
      <h2>แก้ไขรายละเอียด</h2>
      ${csrfField(csrf)}
      ${actualFields(form)}
      <div class="form-foot">
        <button class="primary" type="submit">บันทึกการแก้ไข</button>
        <a class="ghost" href="/actual">กลับไปรายการ</a>
      </div>
    </form>
    <section class="panel">
      ${dangerZone(`/actual/${esc(expense.id)}/delete`, csrf, 'ยืนยันการลบรายการและไฟล์หลักฐาน', 'ลบรายจ่ายจริง', 'ลบรายจ่ายนี้')}
    </section>`;
  return managePage({ title: expense.documentNo, active: 'actual', session, csrf, main, kicker: 'รายจ่ายจริง', sub: esc(expense.itemName || '') });
}

export function reimburseSelectPage({ session, expenses, csrf }) {
  const rows = expenses.map((expense) => `<tr>
    <td><span class="row-link">${esc(expense.documentNo)}</span></td>
    <td>${esc(thaiDate(expense.spentOn))}</td>
    <td>${esc(expense.itemName)}</td>
    <td class="num">${baht(expense.amount)}</td>
    <td class="num"><a class="ghost small" href="/actual/${esc(expense.id)}/form">พิมพ์ใบ</a></td>
  </tr>`).join('');
  const main = `<section class="panel">
    ${rows ? `<div class="table-wrap">
      <table>
        <thead><tr><th>เลขที่</th><th>วันที่</th><th>รายการ</th><th class="num">จำนวน (บาท)</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : `<div class="empty"><p>ยังไม่มีรายจ่ายจริง</p><a class="button" href="/actual/new">บันทึกรายจ่ายจริง</a></div>`}
  </section>`;
  return managePage({
    title: 'ใบทดรองจ่าย',
    active: 'reimburse',
    session,
    csrf,
    main,
    sub: 'ใบทดรองจ่ายหนึ่งใบต่อหนึ่งรายจ่ายจริง ใช้แม่แบบก่อนจัดตั้งบริษัท',
  });
}
