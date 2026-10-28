import { englishDate, monthName } from './dates.js';
import { formatCents, parseMoneyCents } from './forecast.js';
import { csrfField, esc } from './html.js';
import { EXPENSE_CATEGORIES, FILE_KINDS, PAYMENT_METHODS } from './input.js';
import { expenseTabs, logoutForm, renderShell } from './nav.js';

export function managePage({ title, active, session, csrf, main, sub = '', actions = '', kicker = '' }) {
  return `<!doctype html>
<html lang="en">
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
  return saved ? '<p class="ok" role="status">Saved.</p>' : '';
}

function errorsBlock(errors) {
  if (!errors || errors.length === 0) return '';
  const items = errors.map((error) => `<li>${esc(error.message || error)}</li>`).join('');
  return `<div class="error" role="alert"><div><strong>Not saved yet. Please fix:</strong><ul>${items}</ul></div></div>`;
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
  const mark = options.required === false ? ' <span class="muted">(optional)</span>' : '';
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

function usdHint(forecast) {
  const rate = forecast?.fx?.base === 'USD' ? forecast.fx.rate : '';
  return rate
    ? `For costs billed in dollars. Totals still use the baht amount. Current rate: 1 USD = ${rate} THB`
    : 'For costs billed in dollars. Totals still use the baht amount.';
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

function dangerZone(action, csrf, confirmText, buttonText, summary = 'Delete') {
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
    title: 'Database not connected',
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel">
      <p class="warn" role="status">Supabase is not configured.</p>
      <p>Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Render, then reload this page. Both stay on the server and are never sent to the browser.</p>
    </section>`,
  });
}

export function emptyDashboardPage({ session }) {
  return managePage({
    title: 'No forecast yet',
    active: 'dashboard',
    session,
    csrf: session.csrf,
    main: `<section class="panel">
      <h2>Get started</h2>
      <ol class="steps">
        <li><strong>Import the first figures:</strong> run <span class="code">npm run import-forecast -- /path/outside/repo/forecast.json</span> on a machine with the .env file, as described in the README.</li>
        <li><strong>Or enter them here:</strong> save the company and capital on the Capital page, then add months on the Income page.</li>
      </ol>
      <p><a class="button" href="/capital">Go to Capital</a></p>
    </section>`,
  });
}

export function messagePage({ session, title, message, status = '' }) {
  return managePage({
    title,
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel"><p class="${status}" role="status">${esc(message)}</p><p><a class="ghost" href="/">Back to the dashboard</a></p></section>`,
  });
}

export function logoutConfirmPage({ session }) {
  return managePage({
    title: 'Sign out',
    active: '',
    session,
    csrf: session.csrf,
    main: `<section class="panel"><p>Sign out ${esc(session.email)}?</p>${logoutForm(session.csrf)}</section>`,
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

export function capitalPage({ session, forecast, csrf, errors = [], values = null, saved = false }) {
  const form = { ...settingsValues(forecast), ...stripEmpty(values) };
  if (values && !Object.prototype.hasOwnProperty.call(values, 'openingAssumed')) form.openingAssumed = false;
  const share = forecast ? String(forecast.openingCapital.shareText || forecast.openingCapital.sharePercent).replace(/\.0+$/, '') : '';
  const main = `${flash(saved)}
    ${errorsBlock(errors)}
    <form method="post" action="/capital" class="panel">
      ${csrfField(csrf)}
      <fieldset>
        <legend>Capital</legend>
        <div class="grid two">
          ${moneyField('registeredCapital', 'Registered capital (THB)', form.registeredCapital, { hint: 'Up to 2 decimals, no commas, e.g. 500000.00' })}
          ${moneyField('openingAmount', 'Opening capital (THB)', form.openingAmount, { hint: share ? `Cash before the first month. Currently ${share}% of registered capital.` : 'Cash before the first month' })}
          <div class="field wide"><label class="check"><input type="checkbox" name="openingAssumed" value="on"${checked(form.openingAssumed)}> Opening capital is an estimate (shows an “assumed” tag)</label></div>
        </div>
      </fieldset>
      <fieldset>
        <legend>Exchange rate</legend>
        <p class="hint">Typed in by hand. Used to show dollar amounts next to baht.</p>
        <div class="grid two">
          ${field('fxRate', `THB per 1 ${form.fxBase || 'USD'}`, form.fxRate, { hint: 'Up to 8 decimals, e.g. 33.78705', inputmode: 'decimal', autocomplete: 'off' })}
          ${field('fxUpdatedAt', 'Rate date', form.fxUpdatedAt, { type: 'date' })}
          ${field('fxSource', 'Source', form.fxSource === 'Entered manually' ? '' : form.fxSource, { required: false, maxlength: 300, placeholder: 'Entered manually' })}
        </div>
        <input type="hidden" name="fxBase" value="${esc(form.fxBase)}">
        <input type="hidden" name="fxQuote" value="${esc(form.fxQuote)}">
      </fieldset>
      <details class="disclosure"${errors.some((error) => ['company', 'currency', 'documentPrefix', 'balanceFormula'].includes(error.field)) ? ' open' : ''}>
        <summary>Company and dashboard notes</summary>
        <div class="grid two" style="margin-top:12px">
          ${field('company', 'Company name', form.company, { maxlength: 200 })}
          ${field('currency', 'Currency', form.currency, { maxlength: 8, hint: 'e.g. THB' })}
          ${field('openingLabel', 'Opening capital description', form.openingLabel, { required: false, maxlength: 200 })}
          ${field('openingTiming', 'Opening capital timing', form.openingTiming, { required: false, maxlength: 200 })}
          ${field('documentPrefix', 'Expense number prefix', form.documentPrefix, { maxlength: 6, hint: 'EXP gives EXP-0001. Use PRE to match the reimbursement template.' })}
          ${field('balanceFormula', 'Balance formula text', form.balanceFormula, { maxlength: 1000, required: false })}
          ${area('assumptions', 'Assumptions', form.assumptions, 'One per line', 6)}
          ${area('notYetIncluded', 'Not yet included', form.notYetIncluded, 'One per line', 4)}
        </div>
      </details>
      <div class="form-foot">
        <button class="primary" type="submit">Save</button>
        <p class="hint">The dashboard updates right after saving.</p>
      </div>
    </form>`;
  return managePage({ title: 'Capital', active: 'capital', session, csrf, main, sub: 'Registered and opening capital, the exchange rate, and company details' });
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

export function incomePage({ session, forecast, csrf, errors = [], saved = false }) {
  const rows = monthTotals(forecast);
  const totalIncome = rows.reduce((sum, row) => sum + row.income, 0n);
  const body = rows.map(({ month, spent, balance }) => `<tr>
      <th scope="row">${esc(monthName(month, { full: true }))}</th>
      <td>
        <form method="post" action="/forecast/months/${esc(month.id)}" class="row-form">
          ${csrfField(csrf)}
          <input type="hidden" name="key" value="${esc(month.key)}">
          <input type="hidden" name="label" value="${esc(month.label)}">
          <input type="hidden" name="labelFull" value="${esc(month.labelFull)}">
          <label class="visually-hidden" for="rev-${esc(month.id)}">Income for ${esc(monthName(month, { full: true }))}</label>
          <input id="rev-${esc(month.id)}" name="revenue" type="text" inputmode="decimal" autocomplete="off" value="${esc(month.revenue)}" required>
          <button class="ghost small" type="submit">Save</button>
        </form>
      </td>
      <td class="num">${esc(formatCents(spent))}</td>
      <td class="num">${esc(formatCents(balance))}</td>
      <td class="num">${dangerZone(`/forecast/months/${esc(month.id)}/delete`, csrf, 'Also delete its planned expenses', 'Delete month', 'Delete')}</td>
    </tr>`).join('');
  const table = `<div class="table-wrap">
      <table class="income">
        <thead><tr><th>Month</th><th>Income (THB)</th><th class="num">Planned expenses</th><th class="num">Month-end balance</th><th></th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr class="total"><th>Total</th><td>${esc(formatCents(totalIncome))}</td><td colspan="3"></td></tr></tfoot>
      </table>
    </div>`;
  const main = `${flash(saved)}
    ${errorsBlock(errors)}
    <section class="panel">
      ${rows.length ? table : '<div class="empty"><p>No months yet. Add the first month below.</p></div>'}
    </section>
    <section class="panel">
      <h2>Add a month</h2>
      <form method="post" action="/forecast/months" class="inline-form">
        ${csrfField(csrf)}
        ${field('key', 'Month', '', { type: 'month' })}
        ${moneyField('revenue', 'Income (THB)', '0.00', { hint: '0.00 if there is none yet' })}
        <button class="primary" type="submit">Add month</button>
      </form>
    </section>`;
  return managePage({
    title: 'Income',
    active: 'income',
    session,
    csrf,
    main,
    sub: 'Expected income per month. Months added here also hold the planned expenses.',
  });
}

export function plannedPage({ session, forecast, csrf, saved = false }) {
  const rows = monthTotals(forecast);
  const cards = rows.map(({ month, spent, income, balance }) => {
    const items = month.items.map((item) => `<tr>
      <td><a class="row-link" href="/forecast/items/${esc(item.id)}">${esc(item.name)}</a>${item.note ? `<div class="hint">${esc(item.note)}</div>` : ''}</td>
      <td>${esc(item.groupName)}</td>
      <td class="num">${baht(item.amount)}${usdLine(item.usd)}</td>
      <td>${item.assumed ? '<span class="assumption">assumed</span>' : '<span class="badge">confirmed</span>'}</td>
      <td class="num"><a href="/forecast/items/${esc(item.id)}">Edit</a></td>
    </tr>`).join('');
    return `<details class="panel month-card">
      <summary>
        <h2>${esc(monthName(month, { full: true }))}</h2>
        <div class="month-stats">
          <span>Items <strong>${month.items.length}</strong></span>
          <span>Income <strong>${esc(formatCents(income))}</strong></span>
          <span>Expenses <strong>${esc(formatCents(spent))}</strong></span>
          <span>Balance <strong>${esc(formatCents(balance))}</strong></span>
        </div>
      </summary>
      <div class="month-body">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Group</th><th class="num">Amount (THB)</th><th>Status</th><th></th></tr></thead>
            <tbody>${items || '<tr><td colspan="5" class="muted">No planned expenses this month</td></tr>'}</tbody>
          </table>
        </div>
        <p class="actions"><a class="button small" href="/forecast/items/new?month=${esc(month.id)}">+ Add to this month</a></p>
      </div>
    </details>`;
  }).join('');
  const main = `${expenseTabs('planned')}
    ${flash(saved)}
    ${cards ? `<p class="hint" style="margin:0 0 12px">Tap a month to see and edit its items.</p>${cards}` : '<section class="panel empty"><p>No months yet.</p><a class="button" href="/income">Add a month on the Income page</a></section>'}`;
  return managePage({
    title: 'Expenses',
    active: 'expenses',
    session,
    csrf,
    main,
    sub: `Planned (forecast) expenses · ${rows.length} months`,
    actions: rows.length ? '<a class="button small" href="/forecast/items/new">+ Add planned expense</a>' : '',
  });
}

export function itemFormPage({ session, forecast, csrf, item = null, values = null, errors = [], monthId = '' }) {
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
  const options = (forecast?.months || []).map((month) => {
    const selected = month.id === form.monthId ? ' selected' : '';
    return `<option value="${esc(month.id)}"${selected}>${esc(monthName(month, { full: true }))}</option>`;
  }).join('');
  // Existing groups, so a new item can reuse a code instead of inventing a near-duplicate.
  const known = new Map();
  for (const month of forecast?.months || []) {
    for (const entry of month.items) if (!known.has(entry.group)) known.set(entry.group, entry.groupName);
  }
  const groupList = [...known].map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
  const action = item ? `/forecast/items/${esc(item.id)}` : '/forecast/items';
  const main = `${errorsBlock(errors)}
    ${options ? '' : '<p class="warn">Add a month on the Income page first.</p>'}
    <form method="post" action="${action}" class="panel">
      ${csrfField(csrf)}
      <div class="grid two">
        <label class="field" for="f-monthId"><span>Month</span>
          <select id="f-monthId" name="monthId" required>${options}</select>
        </label>
        ${moneyField('amount', 'Amount (THB)', form.amount, { hint: 'Up to 2 decimals, e.g. 20000.00' })}
        ${moneyField('usd', 'Amount in USD', form.usd || '', { required: false, hint: usdHint(forecast) })}
        ${field('name', 'Item name', form.name, { maxlength: 300, wide: true })}
        <label class="field" for="f-group"><span>Group code</span><p class="hint">Lowercase English. Reuse a code to combine items into one line on the dashboard.</p><input id="f-group" name="group" type="text" value="${esc(form.group ?? '')}" required maxlength="40" list="group-codes" autocomplete="off"></label>
        ${field('groupName', 'Group name', form.groupName, { maxlength: 200 })}
        <div class="field wide"><label class="check"><input type="checkbox" name="assumed" value="on"${checked(form.assumed)}> This is an estimate (shows an “assumed” tag on the dashboard)</label></div>
        ${area('note', 'Note', form.note, 'Optional', 3)}
      </div>
      <datalist id="group-codes">${groupList}</datalist>
      <div class="form-foot">
        <button class="primary" type="submit">${item ? 'Save changes' : 'Add expense'}</button>
        <a class="ghost" href="/forecast">Cancel</a>
      </div>
    </form>
    ${item ? `<section class="panel">${dangerZone(`/forecast/items/${esc(item.id)}/delete`, csrf, 'Yes, delete this item', 'Delete item', 'Delete this item')}</section>` : ''}
    <p><a href="/forecast">← Back to planned expenses</a></p>`;
  return managePage({
    title: item ? 'Edit planned expense' : 'Add planned expense',
    active: 'expenses',
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
    <legend>5 · Attachments</legend>
    <p class="hint">PDF, JPG or PNG. At least 1 and at most 4 files, 5 MB each. Do not attach full card or account numbers.</p>
    <div class="grid two" style="margin-top:12px">
      ${FILE_KINDS.map(([fieldName, , label]) => `<label class="field" for="f-${fieldName}"><span>${esc(label)}</span><input id="f-${fieldName}" name="${fieldName}" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label>`).join('')}
    </div>
  </fieldset>` : '';
  return `<fieldset>
      <legend>1 · Expense</legend>
      <div class="grid two">
        ${field('spentOn', 'Payment date', form.spentOn, { type: 'date' })}
        ${moneyField('amount', 'Amount (THB)', form.amount, { hint: 'More than 0, up to 2 decimals' })}
        ${field('itemName', 'What was bought', form.itemName, { maxlength: 200, wide: true })}
        ${field('vendor', 'Vendor / payee', form.vendor, { maxlength: 200 })}
        ${field('receiptNo', 'Receipt / invoice number', form.receiptNo, { maxlength: 80 })}
      </div>
    </fieldset>
    <fieldset>
      <legend>2 · Category</legend>
      <div class="choices">${categories}</div>
      <div class="reveal">${field('categoryOther', 'Other category', form.categoryOther || '', { required: false, maxlength: 80 })}</div>
    </fieldset>
    <fieldset>
      <legend>Service period</legend>
      <div class="choices"><label class="check"><input type="checkbox" name="periodNone" value="on" class="reveal-hide"${periodNone ? ' checked' : ''}> No service period</label></div>
      <div class="grid reveal-off">
        ${field('periodText', 'Length', form.periodText || '', { required: false, maxlength: 40, hint: 'e.g. 1 year' })}
        ${field('periodFrom', 'From', form.periodFrom || '', { type: 'date', required: false })}
        ${field('periodTo', 'To', form.periodTo || '', { type: 'date', required: false })}
      </div>
    </fieldset>
    <fieldset>
      <legend>Tax / foreign</legend>
      <div class="choices">
        ${vat('included', 'VAT included')}
        ${vat('excluded', 'VAT excluded')}
        ${vat('foreign', 'Foreign')}
      </div>
      <div class="grid reveal">
        ${field('foreignCurrency', 'Currency', form.foreignCurrency || '', { required: false, maxlength: 8, placeholder: 'USD' })}
        ${moneyField('foreignAmount', 'Foreign amount', form.foreignAmount || '', { required: false })}
        ${field('foreignRate', 'Rate', form.foreignRate || '', { required: false, hint: 'Up to 8 decimals', inputmode: 'decimal' })}
      </div>
    </fieldset>
    <fieldset>
      <legend>3 · Who paid and how</legend>
      <div class="grid two">${field('payer', 'Paid by (promoter)', form.payer, { maxlength: 120 })}</div>
      <div class="choices">${pays}</div>
      <div class="reveal">${field('paymentOther', 'Other payment method', form.paymentOther || '', { required: false, maxlength: 80 })}</div>
      <p class="hint" style="margin-bottom:12px">Do not enter card or account numbers.</p>
    </fieldset>
    <fieldset>
      <legend>4 · Name on the receipt</legend>
      <div class="choices">
        ${receipt('company', 'Company (being registered)')}
        ${receipt('promoter', 'Promoter')}
        ${receipt('other', 'Other')}
      </div>
      <div class="reveal">${field('receiptNameOther', 'Other name', form.receiptNameOther || '', { required: false, maxlength: 120 })}</div>
    </fieldset>
    <fieldset>
      <legend>Transfer rights to the company?</legend>
      <div class="choices">
        <label class="check"><input type="radio" name="transferRights" value="yes" class="reveal-trigger"${transferYes ? ' checked' : ''}> Yes – an asset or account</label>
        <label class="check"><input type="radio" name="transferRights" value="no"${transferNo ? ' checked' : ''}> No</label>
      </div>
      <div class="reveal">${field('transferAsset', 'Asset or account', form.transferAsset || '', { required: false, maxlength: 200 })}</div>
    </fieldset>
    ${uploadsHtml}
    ${area('note', 'Note', form.note || '', 'Optional', 3)}`;
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
    <td>${esc(englishDate(expense.spentOn))}</td>
    <td>${esc(expense.itemName)}</td>
    <td>${esc(expense.vendor || '')}</td>
    <td class="num">${baht(expense.amount)}</td>
    <td>${esc(expense.payer)}</td>
    <td class="num"><span class="badge">${expense.files.length} ${expense.files.length === 1 ? 'file' : 'files'}</span></td>
    <td class="num"><a class="ghost small" href="/actual/${esc(expense.id)}/form">Print</a></td>
  </tr>`).join('');
  const table = `<div class="table-wrap">
        <table>
          <thead><tr><th>No.</th><th>Date</th><th>Item</th><th>Payee</th><th class="num">Amount (THB)</th><th>Paid by</th><th class="num">Proof</th><th class="num">Reimbursement form</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="total"><th colspan="4">Total · ${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}</th><td class="num">${esc(formatCents(total))}</td><td colspan="3"></td></tr></tfoot>
        </table>
      </div>`;
  const empty = `<div class="empty">
        <p>No actual expenses yet</p>
        <p class="hint">Record what was paid, with the receipt. Each expense gets a document number and a printable reimbursement form.</p>
        <a class="button" href="/actual/new">Record an expense</a>
      </div>`;
  const main = `${expenseTabs('actual')}
    ${flash(saved)}
    <section class="panel">
      ${rows ? table : empty}
    </section>`;
  return managePage({
    title: 'Expenses',
    active: 'expenses',
    session,
    csrf,
    main,
    sub: 'Actual expenses that were paid, with proof',
    actions: '<a class="button small" href="/actual/new">+ Record expense</a>',
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
        <button class="primary" type="submit">Save expense</button>
        <a class="ghost" href="/actual">Cancel</a>
      </div>
    </form>`;
  return managePage({
    title: 'Record an expense',
    active: 'expenses',
    session,
    csrf,
    main,
    sub: `A document number is added automatically, e.g. ${esc(prefix)}-0001. One reimbursement form per expense.`,
  });
}

export function actualDetailPage({ session, expense, csrf, errors = [], values = null, saved = false }) {
  const form = values || expense;
  const files = expense.files.map((file) => {
    const href = `/actual/${esc(expense.id)}/files/${esc(file.id)}`;
    const preview = file.contentType === 'application/pdf'
      ? `<a class="ghost small" href="${href}">Open PDF</a>`
      : `<a href="${href}"><img src="${href}" alt="Proof ${esc(file.filename)}"></a>`;
    return `<li><p>${esc(file.filename)}</p>${preview}</li>`;
  }).join('');
  const main = `${flash(saved)}
    <section class="panel">
      <div class="section-head">
        <h2>Summary</h2>
        <a class="button small" href="/actual/${esc(expense.id)}/form">Print reimbursement form</a>
      </div>
      <dl class="facts">
        <div><dt>Amount</dt><dd>${baht(expense.amount)} THB</dd></div>
        <div><dt>Payment date</dt><dd>${esc(englishDate(expense.spentOn))}</dd></div>
        <div><dt>Payee</dt><dd>${esc(expense.vendor || '–')}</dd></div>
        <div><dt>Paid by</dt><dd>${esc(expense.payer || '–')}</dd></div>
      </dl>
      <ul class="files">${files}</ul>
    </section>
    ${errorsBlock(errors)}
    <form method="post" action="/actual/${esc(expense.id)}" class="panel">
      <h2>Edit details</h2>
      ${csrfField(csrf)}
      ${actualFields(form)}
      <div class="form-foot">
        <button class="primary" type="submit">Save changes</button>
        <a class="ghost" href="/actual">Back to the list</a>
      </div>
    </form>
    <section class="panel">
      ${dangerZone(`/actual/${esc(expense.id)}/delete`, csrf, 'Yes, delete this expense and its files', 'Delete expense', 'Delete this expense')}
    </section>`;
  return managePage({ title: expense.documentNo, active: 'expenses', session, csrf, main, kicker: 'Actual expense', sub: esc(expense.itemName || '') });
}
