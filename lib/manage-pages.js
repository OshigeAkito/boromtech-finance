import { formatDate, monthName } from './dates.js';
import { formatCents, parseMoneyCents } from './forecast.js';
import { csrfField, esc } from './html.js';
import { normalizeLang, tr } from './i18n.js';
import { EXPENSE_CATEGORIES, FILE_KINDS, PAYMENT_METHODS } from './input.js';
import { expenseTabs, renderShell } from './nav.js';

export function managePage({ title, active, session, csrf, main, sub = '', actions = '', kicker = '', reveal = false }) {
  const lang = normalizeLang(session.lang);
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="csrf-token" content="${esc(csrf)}">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/app-assets/manage.css">
</head>
<body>
  ${renderShell({ active, email: session.email, name: session.name, csrf, lang, path: session.path })}
  <div class="page-head">
    <div>
      ${kicker ? `<p class="kicker">${kicker}</p>` : ''}
      <h1>${esc(title)}</h1>
      ${sub ? `<p class="sub">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>
  <main id="main">${main}</main>
  ${reveal ? '<script src="/app-assets/manage.js" defer></script>' : ''}
</body>
</html>`;
}

// Form helpers bound to one language.
function kit(lang) {
  const L = tr(lang);

  function field(name, label, value, options = {}) {
    const type = options.type || 'text';
    // 'visible' keeps the asterisk, but omits the HTML required attribute until
    // manage.js sees the surrounding .reveal / .reveal-off section open.
    // A static required attribute on a display:none control makes Chrome
    // cancel submit ("An invalid form control is not focusable").
    const whenShown = options.required === 'visible';
    const required = options.required === false || whenShown ? '' : ' required';
    const reveal = whenShown ? ' data-reveal-required=""' : '';
    const hint = `<p class="hint">${options.hint ? esc(options.hint) : ''}</p>`;
    const attrs = [
      options.maxlength ? ` maxlength="${options.maxlength}"` : '',
      options.min ? ` min="${options.min}"` : '',
      options.step ? ` step="${options.step}"` : '',
      options.inputmode ? ` inputmode="${options.inputmode}"` : '',
      options.placeholder ? ` placeholder="${esc(options.placeholder)}"` : '',
      options.autocomplete ? ` autocomplete="${options.autocomplete}"` : '',
      options.autocapitalize ? ` autocapitalize="${esc(options.autocapitalize)}"` : '',
      options.pattern ? ` pattern="${esc(options.pattern)}"` : '',
      options.title ? ` title="${esc(options.title)}"` : '',
    ].join('');
    const cls = options.wide ? ' wide' : '';
    const mark = options.required === false
      ? ` <span class="muted">${L('(optional)', '(ไม่บังคับ)')}</span>`
      : ` <abbr class="req" title="${esc(L('Required', 'จำเป็น'))}">*</abbr>`;
    return `<label class="field${cls}" for="f-${esc(name)}"><span>${esc(label)}${mark}</span><input id="f-${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value ?? '')}"${required}${reveal}${attrs}>${hint}</label>`;
  }

  return {
    L,
    lang,
    field,
    req: () => `<abbr class="req" title="${esc(L('Required', 'จำเป็น'))}">*</abbr>`,
    moneyField(name, label, value, options = {}) {
      const { positive, ...rest } = options;
      const pattern = positive
        ? '(?:0\\.(?:0[1-9]|[1-9]\\d?)|[1-9]\\d{0,11}(?:\\.\\d{1,2})?)'
        : '(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,2})?';
      return field(name, label, value, {
        inputmode: 'decimal',
        placeholder: '0.00',
        autocomplete: 'off',
        maxlength: 15,
        pattern,
        title: rest.hint || L('Up to 2 decimals', 'ทศนิยมไม่เกิน 2 ตำแหน่ง'),
        ...rest,
      });
    },
    area(name, label, value, hint, rows = 5) {
      return `<label class="field wide" for="f-${esc(name)}"><span>${esc(label)}</span><textarea id="f-${esc(name)}" name="${esc(name)}" rows="${rows}">${esc(value ?? '')}</textarea><p class="hint">${hint ? esc(hint) : ''}</p></label>`;
    },
    flash(saved) {
      return saved ? `<p class="ok" role="status">${L('Saved.', 'บันทึกแล้ว')}</p>` : '';
    },
    errorsBlock(errors) {
      if (!errors || errors.length === 0) return '';
      const items = errors.map((error) => `<li>${esc(error.message || error)}</li>`).join('');
      return `<div class="error" role="alert"><div><strong>${L('Not saved yet. Please fix:', 'ยังบันทึกไม่ได้ กรุณาแก้ไข')}</strong><ul>${items}</ul></div></div>`;
    },
    dangerZone(action, csrf, confirmText, buttonText, summary = L('Delete', 'ลบ')) {
      return `<details class="disclosure danger-zone">
      <summary>${esc(summary)}</summary>
      <form method="post" action="${action}" class="danger-row">
        ${csrfField(csrf)}
        <label class="check"><input type="checkbox" name="confirm" value="yes" required> ${esc(confirmText)}</label>
        <button class="danger" type="submit">${esc(buttonText)}</button>
      </form>
    </details>`;
    },
    month(month, full = false) {
      return monthName(month, { full, lang });
    },
  };
}

function checked(value) {
  return value ? ' checked' : '';
}

function baht(value) {
  const cents = parseMoneyCents(value);
  return cents === null || cents === undefined ? esc(value) : esc(formatCents(cents));
}

function usdHint(L) {
  return L('For costs billed in dollars. Totals still use the baht amount.', 'ใส่เมื่อจ่ายเป็นดอลลาร์ ยอดบาทยังเป็นตัวเลขที่ใช้คำนวณ');
}

function usdLine(usd) {
  return usd ? `<div class="hint">US$${baht(usd)}</div>` : '';
}

function safeCents(value) {
  try {
    const cents = parseMoneyCents(value);
    return typeof cents === 'bigint' ? cents : 0n;
  } catch {
    return 0n;
  }
}

export function notConfiguredPage({ session }) {
  const { L } = kit(session.lang);
  return managePage({
    title: L('Database not connected', 'ยังไม่ได้เชื่อมฐานข้อมูล'),
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel">
      <p class="warn" role="status">Supabase is not configured.</p>
      <p>${L(
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Render, then reload this page. Both stay on the server and are never sent to the browser.',
        'ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY บน Render แล้วเปิดหน้านี้ใหม่ สองค่านี้ใช้บนเซิร์ฟเวอร์เท่านั้น และไม่ถูกส่งมาที่เบราว์เซอร์',
      )}</p>
    </section>`,
  });
}

export function emptyDashboardPage({ session }) {
  const { L } = kit(session.lang);
  return managePage({
    title: L('No forecast yet', 'ยังไม่มีข้อมูลประมาณการ'),
    active: 'dashboard',
    session,
    csrf: session.csrf,
    main: `<section class="panel">
      <h2>${L('Get started', 'เริ่มต้นใช้งาน')}</h2>
      <ol class="steps">
        <li>${L(
          '<strong>Import the first figures:</strong> run <span class="code">npm run import-forecast -- /path/outside/repo/forecast.json</span> on a machine with the .env file, as described in the README.',
          '<strong>นำเข้าตัวเลขครั้งแรก</strong> รันคำสั่ง <span class="code">npm run import-forecast -- /path/นอกรีโป/forecast.json</span> บนเครื่องที่มีไฟล์ .env ตามขั้นตอนใน README',
        )}</li>
        <li>${L(
          '<strong>Or enter them here:</strong> save the company and capital on the Capital page, then add months on the Income page.',
          '<strong>หรือกรอกเอง</strong> บันทึกข้อมูลบริษัทและทุนในหน้าเงินทุน แล้วเพิ่มเดือนในหน้ารายรับ',
        )}</li>
      </ol>
      <p><a class="button" href="/capital">${L('Go to Capital', 'ไปที่หน้าเงินทุน')}</a></p>
    </section>`,
  });
}

export function messagePage({ session, title, message, status = '' }) {
  const { L } = kit(session.lang);
  return managePage({
    title,
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel"><p class="${status}" role="status">${esc(message)}</p><p><a class="ghost" href="/">${L('Back to the dashboard', 'กลับไปที่แดชบอร์ด')}</a></p></section>`,
  });
}

export function logoutConfirmPage({ session }) {
  const { L } = kit(session.lang);
  return managePage({
    title: L('Sign out', 'ออกจากระบบ'),
    active: '',
    session,
    csrf: session.csrf,
    // The confirm step is the whole page, so its button is the primary one, not the small header button.
    main: `<section class="panel"><p>${L(`Sign out ${esc(session.email)}?`, `ยืนยันออกจากระบบของ ${esc(session.email)}`)}</p>
      <form method="post" action="/auth/logout" class="logout-confirm">${csrfField(session.csrf)}<button class="primary" type="submit">${L('Sign out', 'ออกจากระบบ')}</button> <a class="ghost" href="/">${L('Cancel', 'ยกเลิก')}</a></form></section>`,
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
    balanceFormula: forecast.balanceFormula,
    documentPrefix: forecast.documentPrefix || 'EXP',
    assumptions: (forecast.assumptions || []).join('\n'),
    notYetIncluded: (forecast.notYetIncluded || []).join('\n'),
  };
}

export function capitalPage({ session, forecast, csrf, errors = [], values = null, saved = false }) {
  const { L, field, moneyField, area, flash, errorsBlock } = kit(session.lang);
  const form = { ...settingsValues(forecast), ...stripEmpty(values) };
  if (values && !Object.prototype.hasOwnProperty.call(values, 'openingAssumed')) form.openingAssumed = false;
  const share = forecast ? String(forecast.openingCapital.shareText || forecast.openingCapital.sharePercent).replace(/\.0+$/, '') : '';
  const openingHint = share
    ? L(`Cash before the first month. Currently ${share}% of registered capital.`, `เงินสดก่อนเดือนแรก ตอนนี้เป็น ${share}% ของทุนจดทะเบียน`)
    : L('Cash before the first month', 'เงินสดก่อนเดือนแรก');
  const companyErrors = ['company', 'currency', 'documentPrefix', 'balanceFormula'];
  const main = `${flash(saved)}
    ${errorsBlock(errors)}
    <form method="post" action="/capital" class="panel">
      ${csrfField(csrf)}
      <fieldset>
        <legend>${L('Capital', 'ทุน')}</legend>
        <div class="grid two">
          ${moneyField('registeredCapital', L('Registered capital (THB)', 'ทุนจดทะเบียน (บาท)'), form.registeredCapital, { hint: L('Up to 2 decimals, no commas, e.g. 500000.00', 'ทศนิยมไม่เกิน 2 ตำแหน่ง ไม่ใส่จุลภาค เช่น 500000.00') })}
          ${moneyField('openingAmount', L('Opening capital (THB)', 'ทุนยกมา (บาท)'), form.openingAmount, { hint: openingHint })}
          <div class="field wide"><label class="check"><input type="checkbox" name="openingAssumed" value="on"${checked(form.openingAssumed)}> ${L('Opening capital is an estimate (shows an “assumed” tag)', 'ทุนยกมาเป็นตัวเลขสมมติ (แสดงป้าย “สมมติ”)')}</label></div>
        </div>
      </fieldset>
      <details class="disclosure"${errors.some((error) => companyErrors.includes(error.field)) ? ' open' : ''}>
        <summary>${L('Company and dashboard notes', 'ข้อมูลบริษัทและหมายเหตุบนแดชบอร์ด')}</summary>
        <div class="grid two" style="margin-top:12px">
          ${field('company', L('Company name', 'ชื่อบริษัท'), form.company, { maxlength: 200 })}
          ${field('currency', L('Currency', 'สกุลเงิน'), form.currency, { maxlength: 8, hint: L('e.g. THB', 'เช่น THB') })}
          ${field('openingLabel', L('Opening capital description', 'คำอธิบายทุนยกมา'), form.openingLabel, { required: false, maxlength: 200 })}
          ${field('openingTiming', L('Opening capital timing', 'ช่วงเวลาของทุนยกมา'), form.openingTiming, { required: false, maxlength: 200 })}
          ${field('documentPrefix', L('Expense number prefix', 'คำนำหน้าเลขที่รายจ่ายจริง'), form.documentPrefix, { maxlength: 6, hint: L('EXP gives EXP-0001. Use PRE to match the reimbursement template.', 'ค่าเริ่มต้น EXP ได้เลข EXP-0001 เปลี่ยนเป็น PRE ได้ถ้าต้องการให้ตรงแม่แบบใบทดรองจ่าย') })}
          ${field('balanceFormula', L('Balance formula text', 'ข้อความสูตรยอดคงเหลือ'), form.balanceFormula, { maxlength: 1000, required: false })}
          ${area('assumptions', L('Assumptions', 'สมมติฐาน'), form.assumptions, L('One per line', 'หนึ่งข้อต่อหนึ่งบรรทัด'), 6)}
          ${area('notYetIncluded', L('Not yet included', 'ยังไม่รวม'), form.notYetIncluded, L('One per line', 'หนึ่งข้อต่อหนึ่งบรรทัด'), 4)}
        </div>
      </details>
      <div class="form-foot">
        <button class="primary" type="submit">${L('Save', 'บันทึก')}</button>
        <p class="hint">${L('The dashboard updates right after saving.', 'แดชบอร์ดเปลี่ยนทันทีหลังบันทึก')}</p>
      </div>
    </form>`;
  return managePage({
    title: L('Capital', 'เงินทุน'),
    active: 'capital',
    session,
    csrf,
    main,
    sub: L('Registered and opening capital, and company details', 'ทุนจดทะเบียน ทุนยกมา และข้อมูลบริษัท'),
  });
}

function stripEmpty(values) {
  if (!values) return {};
  return values;
}

function monthTotals(forecast) {
  let balance = safeCents(forecast?.openingCapital?.amount || '0');
  return (forecast?.months || []).map((month) => {
    const spent = month.items.reduce((sum, item) => sum + safeCents(item.amount), 0n);
    const income = safeCents(month.revenue);
    balance = balance + income - spent;
    return { month, spent, income, balance };
  });
}

function monthPicker(tools, name, value, extra = {}) {
  const { L, lang, field } = tools;
  if (lang !== 'th') return field(name, L('Month', 'เดือน'), value, { type: 'month', ...extra });
  const selected = typeof value === 'string' ? value : '';
  const years = [];
  for (let year = 2024; year <= 2040; year += 1) years.push(year);
  const pickedYear = /^(\d{4})-\d{2}$/.exec(selected);
  if (pickedYear) {
    const year = Number(pickedYear[1]);
    if (!years.includes(year)) years.push(year);
    years.sort((a, b) => a - b);
  }
  const options = [`<option value="">${esc(L('Pick a month', 'เลือกเดือน'))}</option>`];
  for (const year of years) {
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = monthName({ key }, { full: true, lang: 'th' });
      options.push(`<option value="${key}"${key === selected ? ' selected' : ''}>${esc(label)}</option>`);
    }
  }
  const hint = extra.hint ? esc(extra.hint) : '';
  return `<label class="field${extra.wide ? ' wide' : ''}" for="f-${esc(name)}"><span>${esc(L('Month', 'เดือน'))} <abbr class="req" title="${esc(L('Required', 'จำเป็น'))}">*</abbr></span><select id="f-${esc(name)}" name="${esc(name)}" required>${options.join('')}</select><p class="hint">${hint}</p></label>`;
}

// editing is { id, revenue } when a row's save failed, so that row shows what was typed.
export function incomePage({ session, forecast, csrf, errors = [], saved = false, values = null, editing = null }) {
  const tools = kit(session.lang);
  const { L, moneyField, flash, errorsBlock, dangerZone, month: name } = tools;
  const rows = monthTotals(forecast);
  const totalIncome = rows.reduce((sum, row) => sum + row.income, 0n);
  const body = rows.map(({ month, spent, balance }) => `<tr>
      <th scope="row">${esc(name(month, true))}</th>
      <td>
        <form method="post" action="/forecast/months/${esc(month.id)}" class="row-form">
          ${csrfField(csrf)}
          <input type="hidden" name="key" value="${esc(month.key)}">
          <input type="hidden" name="label" value="${esc(month.label)}">
          <input type="hidden" name="labelFull" value="${esc(month.labelFull)}">
          <label class="visually-hidden" for="rev-${esc(month.id)}">${L('Income for', 'รายรับเดือน')} ${esc(name(month, true))}</label>
          <input id="rev-${esc(month.id)}" name="revenue" type="text" inputmode="decimal" autocomplete="off" value="${esc(editing && editing.id === month.id ? editing.revenue : month.revenue)}" required>
          <button class="ghost small" type="submit">${L('Save', 'บันทึก')}</button>
        </form>
      </td>
      <td class="num">${esc(formatCents(spent))}</td>
      <td class="num">${esc(formatCents(balance))}</td>
      <td class="num">${dangerZone(`/forecast/months/${esc(month.id)}/delete`, csrf, L('Also delete its planned expenses', 'ลบรายจ่ายประมาณการของเดือนนี้ด้วย'), L('Delete month', 'ลบเดือน'))}</td>
    </tr>`).join('');
  const table = `<div class="table-wrap">
      <table class="income">
        <thead><tr><th>${L('Month', 'เดือน')}</th><th>${L('Income (THB)', 'รายรับ (บาท)')}</th><th class="num">${L('Planned expenses', 'รายจ่ายประมาณการ')}</th><th class="num">${L('Month-end balance', 'คงเหลือสิ้นเดือน')}</th><th></th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr class="total"><th>${L('Total', 'รวม')}</th><td>${esc(formatCents(totalIncome))}</td><td colspan="3"></td></tr></tfoot>
      </table>
    </div>`;
  const main = `${flash(saved)}
    ${errorsBlock(errors)}
    <section class="panel">
      ${rows.length ? table : `<div class="empty"><p>${L('No months yet. Add the first month below.', 'ยังไม่มีเดือน เพิ่มเดือนแรกด้านล่าง')}</p></div>`}
    </section>
    <section class="panel">
      <h2>${L('Add a month', 'เพิ่มเดือน')}</h2>
      <form method="post" action="/forecast/months" class="inline-form">
        ${csrfField(csrf)}
        ${monthPicker(tools, 'key', values?.key || '')}
        ${moneyField('revenue', L('Income (THB)', 'รายรับ (บาท)'), values?.revenue || '0.00', { hint: L('0.00 if there is none yet', 'ใส่ 0.00 ถ้ายังไม่มี') })}
        <button class="primary" type="submit">${L('Add month', 'เพิ่มเดือน')}</button>
      </form>
    </section>`;
  return managePage({
    title: L('Income', 'รายรับ'),
    active: 'income',
    session,
    csrf,
    main,
    sub: L('Expected income per month. Months added here also hold the planned expenses.', 'รายรับที่คาดไว้แต่ละเดือน เดือนที่เพิ่มที่นี่ใช้เก็บรายจ่ายประมาณการด้วย'),
  });
}

export function plannedPage({ session, forecast, csrf, saved = false, errors = [], values = null }) {
  const tools = kit(session.lang);
  const { L, lang, flash, errorsBlock, month: name } = tools;
  const rows = monthTotals(forecast);
  const cards = rows.map(({ month, spent, income, balance }) => {
    const items = month.items.map((item) => `<tr>
      <td><a class="row-link" href="/forecast/items/${esc(item.id)}">${esc(item.name)}</a>${item.note ? `<div class="hint">${esc(item.note)}</div>` : ''}</td>
      <td>${esc(item.groupName)}</td>
      <td class="num">${baht(item.amount)}${usdLine(item.usd)}</td>
      <td>${item.assumed ? `<span class="assumption">${L('assumed', 'สมมติ')}</span>` : `<span class="badge">${L('confirmed', 'ยืนยัน')}</span>`}</td>
      <td class="num"><a href="/forecast/items/${esc(item.id)}">${L('Edit', 'แก้ไข')}</a></td>
    </tr>`).join('');
    return `<details class="panel month-card">
      <summary>
        <h2>${esc(name(month, true))}</h2>
        <div class="month-stats">
          <span>${L('Items', 'รายการ')} <strong>${month.items.length}</strong></span>
          <span>${L('Income', 'รายรับ')} <strong>${esc(formatCents(income))}</strong></span>
          <span>${L('Expenses', 'รายจ่าย')} <strong>${esc(formatCents(spent))}</strong></span>
          <span>${L('Balance', 'คงเหลือ')} <strong>${esc(formatCents(balance))}</strong></span>
        </div>
      </summary>
      <div class="month-body">
        <div class="table-wrap">
          <table>
            <thead><tr><th>${L('Item', 'รายการ')}</th><th>${L('Group', 'กลุ่ม')}</th><th class="num">${L('Amount (THB)', 'จำนวน (บาท)')}</th><th>${L('Status', 'สถานะ')}</th><th></th></tr></thead>
            <tbody>${items || `<tr><td colspan="5" class="muted">${L('No planned expenses this month', 'ยังไม่มีรายจ่ายในเดือนนี้')}</td></tr>`}</tbody>
          </table>
        </div>
        <p class="actions"><a class="button small" href="/forecast/items/new?month=${esc(month.id)}">${L('+ Add to this month', '+ เพิ่มรายจ่ายในเดือนนี้')}</a></p>
      </div>
    </details>`;
  }).join('');
  const addMonth = `<section class="panel">
      <h2>${L('Add a month', 'เพิ่มเดือน')}</h2>
      <form method="post" action="/forecast/months" class="inline-form month-add">
        ${csrfField(csrf)}
        <input type="hidden" name="returnTo" value="forecast">
        <input type="hidden" name="revenue" value="0.00">
        ${monthPicker(tools, 'key', values?.key || '', { hint: L('Income for a new month starts at 0.00', 'รายรับของเดือนที่เพิ่มเริ่มที่ 0.00') })}
        <button class="primary" type="submit">${L('Add month', 'เพิ่มเดือน')}</button>
      </form>
    </section>`;
  const main = `${expenseTabs('planned', lang)}
    ${flash(saved)}
    ${errorsBlock(errors)}
    ${cards
      ? `<p class="hint" style="margin:0 0 12px">${L('Tap a month to see and edit its items.', 'แตะที่เดือนเพื่อดูและแก้ไขรายการ')}</p>${cards}`
      : `<p class="muted empty-note">${L('No planned expenses yet.', 'ยังไม่มีรายจ่ายประมาณการ')}</p>`}
    ${addMonth}`;
  return managePage({
    title: L('Planned expenses', 'รายจ่ายประมาณการ'),
    active: 'expenses',
    session,
    csrf,
    main,
    sub: L(`Forecast amounts · ${rows.length} months`, `ยอดประมาณการ · ${rows.length} เดือน`),
    actions: `<a class="button small" href="/forecast/items/new">${L('+ Add planned expense', '+ เพิ่มรายจ่ายประมาณการ')}</a>`,
  });
}

export function itemFormPage({ session, forecast, csrf, item = null, values = null, errors = [], monthId = '', once = '' }) {
  const tools = kit(session.lang);
  const { L, field, moneyField, area, errorsBlock, dangerZone, month: name } = tools;
  const form = values || (item ? {
    monthId: item.monthId,
    group: item.group,
    groupName: item.groupName,
    name: item.name,
    amount: item.amount,
    usd: item.usd || '',
    assumed: item.assumed,
    note: item.note,
  } : {
    monthId: monthId || forecast?.months?.[0]?.id || '',
    group: '',
    groupName: '',
    name: '',
    amount: '',
    usd: '',
    assumed: false,
    note: '',
  });
  if (values && !Object.prototype.hasOwnProperty.call(values, 'assumed')) form.assumed = false;
  const knownMonth = (forecast?.months || []).find((month) => month.id === (monthId || form.monthId));
  if (!values && !item) {
    form.monthKey = knownMonth?.key || forecast?.months?.[0]?.key || '';
    form.frequency = 'monthly';
    form.repeatCount = '';
  }
  const options = (forecast?.months || []).map((month) => {
    const selected = month.id === form.monthId ? ' selected' : '';
    return `<option value="${esc(month.id)}"${selected}>${esc(name(month, true))}</option>`;
  }).join('');
  // Existing groups, so a new item can reuse a code instead of inventing a near-duplicate.
  const known = new Map();
  for (const month of forecast?.months || []) {
    for (const entry of month.items) if (!known.has(entry.group)) known.set(entry.group, entry.groupName);
  }
  const groupList = [...known].map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
  const action = item ? `/forecast/items/${esc(item.id)}` : '/forecast/items';
  const monthControl = item
    ? `<label class="field" for="f-monthId"><span>${L('Month', 'เดือน')} <abbr class="req" title="${esc(L('Required', 'จำเป็น'))}">*</abbr></span>
          <select id="f-monthId" name="monthId" required>${options}</select>
          <p class="hint"></p>
        </label>`
    : monthPicker(tools, 'monthKey', form.monthKey || '');
  const frequency = (value, label) => {
    const selectedFrequency = values ? form.frequency : (form.frequency || 'monthly');
    const picked = selectedFrequency === value ? ' checked' : '';
    return `<label class="check"><input type="radio" name="frequency" value="${value}"${picked} data-reveal-required=""> ${label}</label>`;
  };
  const repeat = item ? '' : `<fieldset>
        <legend>${L('Repeat', 'ทำซ้ำ')}</legend>
        <label class="check"><input type="checkbox" name="repeat" value="on" class="reveal-trigger"${form.repeat === 'on' || form.repeat === true ? ' checked' : ''}> ${L('Repeat this expense', 'ทำซ้ำรายการนี้')}</label>
        <p class="hint">${L('Each occurrence is its own row. Editing or deleting one changes only that month.', 'แต่ละครั้งเป็นรายการแยกกัน การแก้ไขหรือลบจะมีผลเฉพาะเดือนนั้น')}</p>
        <div class="reveal">
          <p class="choice-label">${L('How often', 'ความถี่')} <abbr class="req" title="${esc(L('Required', 'จำเป็น'))}">*</abbr></p>
          <div class="choices">
            ${frequency('monthly', L('Monthly', 'รายเดือน'))}
            ${frequency('quarterly', L('Quarterly', 'รายไตรมาส'))}
            ${frequency('yearly', L('Yearly', 'รายปี'))}
          </div>
          <div class="repeat-count">${field('repeatCount', L('Number of times', 'จำนวนครั้ง'), form.repeatCount || '', {
            required: 'visible',
            inputmode: 'numeric',
            maxlength: 2,
            pattern: '0*([1-9]|[12]\\d|3[0-6])',
            autocomplete: 'off',
            title: L('Enter a whole number from 1 to 36, such as 5 or 05.', 'ระบุจำนวนเต็มตั้งแต่ 1 ถึง 36 เช่น 5 หรือ 05'),
            hint: L(
              'Including this month, within 36 months of the start: 36 times monthly, 12 quarterly, or 3 yearly.',
              'รวมครั้งนี้ และต้องไม่เกิน 36 เดือนจากเดือนเริ่ม: รายเดือน 36 ครั้ง รายไตรมาส 12 ครั้ง รายปี 3 ครั้ง',
            ),
          })}</div>
        </div>
      </fieldset>`;
  const main = `${errorsBlock(errors)}
    <form method="post" action="${action}" class="panel">
      ${csrfField(csrf)}
      ${once ? `<input type="hidden" name="once" value="${esc(once)}">` : ''}
      <div class="grid two">
        ${monthControl}
        ${moneyField('amount', L('Amount (THB)', 'จำนวนเงิน (บาท)'), form.amount, { hint: L('Up to 2 decimals, e.g. 20000.00', 'ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 20000.00') })}
        ${moneyField('usd', L('Amount in USD', 'จำนวนดอลลาร์ (USD)'), form.usd || '', { required: false, hint: usdHint(L) })}
        ${field('name', L('Item name', 'ชื่อรายการ'), form.name, { maxlength: 300, wide: true })}
        <label class="field" for="f-group"><span>${L('Group code', 'รหัสกลุ่ม')} <abbr class="req" title="${esc(L('Required', 'จำเป็น'))}">*</abbr></span><input id="f-group" name="group" type="text" value="${esc(form.group ?? '')}" required maxlength="40" list="group-codes" autocomplete="off"><p class="hint">${L('Lowercase English. Reuse a code to combine items into one line on the dashboard.', 'ภาษาอังกฤษตัวเล็ก ใช้รหัสเดิมเพื่อรวมยอดเป็นรายการเดียวบนแดชบอร์ด')}</p></label>
        ${field('groupName', L('Group name', 'ชื่อกลุ่ม'), form.groupName, { maxlength: 200 })}
        <div class="field wide"><label class="check"><input type="checkbox" name="assumed" value="on"${checked(form.assumed)}> ${L('This is an estimate (shows an “assumed” tag on the dashboard)', 'เป็นตัวเลขสมมติ (แสดงป้าย “สมมติ” บนแดชบอร์ด)')}</label></div>
        ${area('note', L('Note', 'หมายเหตุ'), form.note, L('Optional', 'ไม่บังคับ'), 3)}
      </div>
      <datalist id="group-codes">${groupList}</datalist>
      ${repeat}
      <div class="form-foot">
        <button class="primary" type="submit">${item ? L('Save changes', 'บันทึกการแก้ไข') : L('Add expense', 'เพิ่มรายจ่าย')}</button>
        <a class="ghost" href="/forecast">${L('Cancel', 'ยกเลิก')}</a>
      </div>
    </form>
    ${item ? `<section class="panel">${dangerZone(`/forecast/items/${esc(item.id)}/delete`, csrf, L('Yes, delete this item', 'ยืนยันการลบรายการนี้'), L('Delete item', 'ลบรายการ'), L('Delete this item', 'ลบรายการนี้'))}</section>` : ''}
    <p><a href="/forecast">${L('← Back to planned expenses', '← กลับไปหน้ารายจ่ายประมาณการ')}</a></p>`;
  return managePage({
    title: item ? L('Edit planned expense', 'แก้ไขรายจ่ายประมาณการ') : L('Add planned expense', 'เพิ่มรายจ่ายประมาณการ'),
    active: 'expenses',
    session,
    csrf,
    reveal: !item,
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

function actualFields(form, tools, { uploads = false } = {}) {
  const { L, lang, field, moneyField, area, req } = tools;
  const methods = selectedMethods(form);
  const periodNone = form.periodNone === true || form.periodNone === 'on';
  const categories = EXPENSE_CATEGORIES.map(([key, label]) => {
    const isChecked = form.category === key ? ' checked' : '';
    const trigger = key === 'other' ? ' class="reveal-trigger"' : '';
    return `<label class="check"><input type="radio" name="category" value="${key}"${isChecked}${trigger} required> ${esc(label[lang])}</label>`;
  }).join('');
  const pays = PAYMENT_METHODS.map(([key, label, fieldName]) => {
    const isChecked = methods.has(key) ? ' checked' : '';
    const trigger = key === 'other' ? ' class="reveal-trigger"' : '';
    return `<label class="check"><input type="checkbox" name="${fieldName}" value="on"${isChecked}${trigger}> ${esc(label[lang])}</label>`;
  }).join('');
  const vat = (value, label) => `<label class="check"><input type="radio" name="vatMode" value="${value}"${form.vatMode === value ? ' checked' : ''}${value === 'foreign' ? ' class="reveal-trigger"' : ''}> ${label}</label>`;
  const receipt = (value, label) => `<label class="check"><input type="radio" name="receiptName" value="${value}"${form.receiptName === value ? ' checked' : ''}${value === 'other' ? ' class="reveal-trigger"' : ''}> ${esc(label)}</label>`;
  const transferYes = form.transferRights === true || form.transferRights === 'yes';
  const transferNo = form.transferRights === false || form.transferRights === 'no';
  const uploadsHtml = uploads ? `<fieldset>
    <legend>${L('5 · Attachments', '5 · เอกสารแนบ')} ${req()}</legend>
    <p class="hint">${L(
      'At least 1 file is required, and at most 4. PDF, JPG or PNG, 5 MB each. Any of these slots counts. Do not attach full card or account numbers.',
      'ต้องแนบอย่างน้อย 1 ไฟล์ และได้ไม่เกิน 4 ไฟล์ เป็น PDF, JPG หรือ PNG ไฟล์ละไม่เกิน 5 MB ช่องใดก็ได้ ห้ามแนบเลขบัตรหรือเลขบัญชีเต็ม',
    )}</p>
    <div class="grid files">
      ${FILE_KINDS.map(([fieldName, , label]) => `<label class="field" for="f-${fieldName}"><span>${esc(label[lang])}</span><input id="f-${fieldName}" name="${fieldName}" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"><p class="hint"></p></label>`).join('')}
    </div>
  </fieldset>` : '';
  return `<fieldset>
      <legend>${L('1 · Expense', '1 · รายการ')}</legend>
      <div class="grid two">
        ${field('spentOn', L('Payment date', 'วันที่จ่าย'), form.spentOn, { type: 'date' })}
        ${moneyField('amount', L('Amount (THB)', 'จำนวนเงิน (บาท)'), form.amount, { positive: true, hint: L('More than 0, up to 2 decimals', 'มากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง') })}
        ${field('itemName', L('What was bought', 'รายการ'), form.itemName, { maxlength: 200, wide: true })}
        ${field('vendor', L('Vendor / payee', 'ผู้ให้บริการ / ผู้รับเงิน'), form.vendor, { maxlength: 200 })}
        ${field('receiptNo', L('Receipt / invoice number', 'เลขที่ใบเสร็จ / ใบแจ้งหนี้'), form.receiptNo, { maxlength: 80 })}
      </div>
    </fieldset>
    <fieldset>
      <legend>${L('2 · Category', '2 · ประเภท')} ${req()}</legend>
      <div class="choices">${categories}</div>
      <div class="reveal">${field('categoryOther', L('Other category', 'อื่น ๆ ระบุ'), form.categoryOther || '', { required: false, maxlength: 80 })}</div>
    </fieldset>
    <fieldset>
      <legend>${L('Service period', 'ระยะเวลาบริการ')}</legend>
      <div class="choices"><label class="check"><input type="checkbox" name="periodNone" value="on" class="reveal-hide"${periodNone ? ' checked' : ''}> ${L('No service period', 'ไม่มีระยะเวลา')}</label></div>
      <div class="grid reveal-off">
        ${field('periodText', L('Length', 'ระยะ'), form.periodText || '', { required: false, maxlength: 40, hint: L('e.g. 1 year. Leave blank to fill this in from the dates', 'เช่น 1 ปี เว้นว่างแล้วระบบจะใส่ให้จากวันที่') })}
        ${field('periodFrom', L('From', 'ตั้งแต่'), form.periodFrom || '', { type: 'date', required: 'visible' })}
        ${field('periodTo', L('To', 'ถึง'), form.periodTo || '', { type: 'date', required: 'visible' })}
      </div>
    </fieldset>
    <fieldset>
      <legend>${L('Tax / foreign', 'ภาษี / ต่างประเทศ')}</legend>
      <div class="choices">
        ${vat('included', L('VAT included', 'รวม VAT'))}
        ${vat('excluded', L('VAT excluded', 'ไม่รวม VAT'))}
        ${vat('foreign', L('Foreign', 'ต่างประเทศ'))}
      </div>
      <div class="grid reveal">
        ${field('foreignCurrency', L('Currency', 'สกุล'), form.foreignCurrency || '', { required: 'visible', maxlength: 8, placeholder: 'USD', pattern: '[A-Za-z]{3,8}', autocapitalize: 'characters' })}
        ${moneyField('foreignAmount', L('Foreign amount', 'จำนวนเงินต่างประเทศ'), form.foreignAmount || '', { required: 'visible', positive: true, hint: L('More than 0, up to 2 decimals', 'มากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง') })}
        ${field('foreignRate', L('Rate', 'อัตรา'), form.foreignRate || '', { required: 'visible', hint: L('More than 0, up to 8 decimals', 'มากกว่า 0 ทศนิยมได้ถึง 8 ตำแหน่ง'), inputmode: 'decimal', maxlength: 15, pattern: '(?:0\\.\\d{1,8}|[1-9]\\d{0,5}(?:\\.\\d{1,8})?)', autocomplete: 'off' })}
      </div>
    </fieldset>
    <fieldset>
      <legend>${L('3 · Who paid and how', '3 · ผู้จ่ายและวิธีจ่าย')}</legend>
      <div class="grid two">${field('payer', L('Paid by (promoter)', 'ผู้ทดรองจ่าย (ผู้เริ่มก่อการ)'), form.payer, { maxlength: 120 })}</div>
      <p class="choice-label">${L('Payment method', 'วิธีจ่าย')} ${req()}</p>
      <div class="choices">${pays}</div>
      <div class="reveal">${field('paymentOther', L('Other payment method', 'อื่น ๆ ระบุ'), form.paymentOther || '', { required: false, maxlength: 80 })}</div>
      <p class="hint" style="margin-bottom:12px">${L('Pick at least one. Do not enter card or account numbers.', 'เลือกอย่างน้อย 1 วิธี ห้ามกรอกเลขบัตรหรือเลขบัญชี')}</p>
    </fieldset>
    <fieldset>
      <legend>${L('4 · Name on the receipt', '4 · ชื่อบนใบเสร็จ/ใบกำกับ')}</legend>
      <div class="choices">
        ${receipt('company', L('Company (being registered)', 'บริษัท (อยู่ระหว่างจดทะเบียน)'))}
        ${receipt('promoter', L('Promoter', 'ผู้เริ่มก่อการ'))}
        ${receipt('other', L('Other', 'อื่น ๆ'))}
      </div>
      <div class="reveal">${field('receiptNameOther', L('Other name', 'อื่น ๆ ระบุ'), form.receiptNameOther || '', { required: false, maxlength: 120 })}</div>
    </fieldset>
    <fieldset>
      <legend>${L('Transfer rights to the company?', 'ต้องโอนสิทธิ์ให้บริษัท?')}</legend>
      <div class="choices">
        <label class="check"><input type="radio" name="transferRights" value="yes" class="reveal-trigger"${transferYes ? ' checked' : ''}> ${L('Yes – an asset or account', 'ใช่ – ทรัพย์สิน/บัญชี')}</label>
        <label class="check"><input type="radio" name="transferRights" value="no"${transferNo ? ' checked' : ''}> ${L('No', 'ไม่')}</label>
      </div>
      <div class="reveal">${field('transferAsset', L('Asset or account', 'ทรัพย์สินหรือบัญชี'), form.transferAsset || '', { required: false, maxlength: 200 })}</div>
    </fieldset>
    ${uploadsHtml}
    ${area('note', L('Note', 'หมายเหตุ'), form.note || '', L('Optional', 'ไม่บังคับ'), 3)}`;
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
  const { L, lang, flash } = kit(session.lang);
  const total = expenses.reduce((sum, expense) => sum + safeCents(expense.amount), 0n);
  const fileCount = (count) => (count === 1 ? L('1 file', '1 ไฟล์') : L(`${count} files`, `${count} ไฟล์`));
  const rows = expenses.map((expense) => `<tr>
    <td><a class="row-link" href="/actual/${esc(expense.id)}">${esc(expense.documentNo)}</a></td>
    <td>${esc(formatDate(expense.spentOn, lang))}</td>
    <td>${esc(expense.itemName)}</td>
    <td>${esc(expense.vendor || '')}</td>
    <td class="num">${baht(expense.amount)}</td>
    <td>${esc(expense.payer)}</td>
    <td class="num"><span class="badge">${fileCount(expense.files.length)}</span></td>
    <td class="num"><a class="ghost small" href="/actual/${esc(expense.id)}/form?from=list">${L('Print', 'พิมพ์')}</a></td>
  </tr>`).join('');
  const count = expenses.length === 1 ? L('1 expense', '1 รายการ') : L(`${expenses.length} expenses`, `${expenses.length} รายการ`);
  const table = `<div class="table-wrap">
        <table>
          <thead><tr><th>${L('No.', 'เลขที่')}</th><th>${L('Date', 'วันที่')}</th><th>${L('Item', 'รายการ')}</th><th>${L('Payee', 'ผู้รับเงิน')}</th><th class="num">${L('Amount (THB)', 'จำนวน (บาท)')}</th><th>${L('Paid by', 'ผู้ทดรองจ่าย')}</th><th class="num">${L('Proof', 'หลักฐาน')}</th><th class="num">${L('Reimbursement form', 'ใบทดรองจ่าย')}</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="total"><th colspan="4">${L('Total', 'รวม')} · ${count}</th><td class="num">${esc(formatCents(total))}</td><td colspan="3"></td></tr></tfoot>
        </table>
      </div>`;
  const empty = `<div class="empty">
        <p>${L('No actual expenses yet', 'ยังไม่มีรายจ่ายจริง')}</p>
        <p class="hint">${L(
          'Record what was paid, with the receipt. Each expense gets a document number and a printable reimbursement form.',
          'บันทึกรายจ่ายที่จ่ายไปแล้วพร้อมใบเสร็จ ระบบออกเลขที่เอกสารให้และพิมพ์ใบทดรองจ่ายได้',
        )}</p>
        <a class="button" href="/actual/new">${L('Record an expense', 'บันทึกรายจ่ายจริง')}</a>
      </div>`;
  const main = `${expenseTabs('actual', lang)}
    ${flash(saved)}
    <section class="panel">
      ${rows ? table : empty}
    </section>`;
  return managePage({
    title: L('Expenses', 'รายจ่าย'),
    active: 'expenses',
    session,
    csrf,
    main,
    sub: L('Actual expenses that were paid, with proof', 'รายจ่ายที่จ่ายแล้วพร้อมหลักฐาน'),
    actions: `<a class="button small" href="/actual/new">${L('+ Record expense', '+ บันทึกรายจ่ายจริง')}</a>`,
  });
}

export function actualFormPage({ session, csrf, errors = [], values = null, prefix = 'EXP' }) {
  const tools = kit(session.lang);
  const { L, errorsBlock } = tools;
  const form = { ...BLANK_ACTUAL, ...(values || {}) };
  if (values) form.periodNone = values.periodNone === 'on' || values.periodNone === true;
  const main = `${errorsBlock(errors)}
    <form method="post" action="/actual" enctype="multipart/form-data" class="panel">
      ${csrfField(csrf)}
      ${actualFields(form, tools, { uploads: true })}
      <div class="form-foot">
        <button class="primary" type="submit">${L('Save expense', 'บันทึกค่าใช้จ่าย')}</button>
        <a class="ghost" href="/actual">${L('Cancel', 'ยกเลิก')}</a>
      </div>
    </form>`;
  return managePage({
    title: L('Record an expense', 'บันทึกรายจ่ายจริง'),
    active: 'expenses',
    session,
    csrf,
    reveal: true,
    main,
    sub: L(
      `A document number is added automatically, e.g. ${esc(prefix)}-0001. One reimbursement form per expense.`,
      `ระบบออกเลขที่เอกสารให้อัตโนมัติ เช่น ${esc(prefix)}-0001 หนึ่งรายการต่อหนึ่งใบทดรองจ่าย`,
    ),
  });
}

export function actualDetailPage({ session, expense, csrf, errors = [], values = null, saved = false }) {
  const tools = kit(session.lang);
  const { L, lang, flash, errorsBlock, dangerZone } = tools;
  const form = values || expense;
  const files = expense.files.map((file) => {
    const href = `/actual/${esc(expense.id)}/files/${esc(file.id)}`;
    const preview = file.contentType === 'application/pdf'
      ? `<a class="ghost small" href="${href}">${L('Open PDF', 'เปิด PDF')}</a>`
      : `<a href="${href}"><img src="${href}" alt="${L('Proof', 'หลักฐาน')} ${esc(file.filename)}"></a>`;
    return `<li><p>${esc(file.filename)}</p>${preview}</li>`;
  }).join('');
  const main = `${flash(saved)}
    <section class="panel">
      <div class="section-head">
        <h2>${L('Summary', 'สรุป')}</h2>
        <a class="button small" href="/actual/${esc(expense.id)}/form?from=edit">${L('Print reimbursement form', 'พิมพ์ใบทดรองจ่าย')}</a>
      </div>
      <dl class="facts">
        <div><dt>${L('Amount', 'จำนวนเงิน')}</dt><dd>${baht(expense.amount)} ${L('THB', 'บาท')}</dd></div>
        <div><dt>${L('Payment date', 'วันที่จ่าย')}</dt><dd>${esc(formatDate(expense.spentOn, lang))}</dd></div>
        <div><dt>${L('Payee', 'ผู้รับเงิน')}</dt><dd>${esc(expense.vendor || '–')}</dd></div>
        <div><dt>${L('Paid by', 'ผู้ทดรองจ่าย')}</dt><dd>${esc(expense.payer || '–')}</dd></div>
      </dl>
      <ul class="files">${files}</ul>
    </section>
    ${errorsBlock(errors)}
    <form method="post" action="/actual/${esc(expense.id)}" class="panel">
      <h2>${L('Edit details', 'แก้ไขรายละเอียด')}</h2>
      ${csrfField(csrf)}
      ${actualFields(form, tools)}
      <div class="form-foot">
        <button class="primary" type="submit">${L('Save changes', 'บันทึกการแก้ไข')}</button>
        <a class="ghost" href="/actual">${L('Back to the list', 'กลับไปรายการ')}</a>
      </div>
    </form>
    <section class="panel">
      ${dangerZone(`/actual/${esc(expense.id)}/delete`, csrf, L('Yes, delete this expense and its files', 'ยืนยันการลบรายการและไฟล์หลักฐาน'), L('Delete expense', 'ลบรายจ่ายจริง'), L('Delete this expense', 'ลบรายจ่ายนี้'))}
    </section>`;
  return managePage({
    title: expense.documentNo,
    active: 'expenses',
    session,
    csrf,
    reveal: true,
    main,
    kicker: L('Actual expense', 'รายจ่ายจริง'),
    sub: esc(expense.itemName || ''),
  });
}
