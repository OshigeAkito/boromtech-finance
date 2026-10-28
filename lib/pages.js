import { groupPalette, renderBalanceChart, renderSpendChart } from './chart.js';
import {
  ASSUMPTION_MARK,
  EXAMPLE_BANNER,
  formatCents,
  noteLabel,
  parseFxRate,
  parseMoneyCents,
  summarizeForecast,
} from './forecast.js';
import { englishDate, monthName } from './dates.js';
import { renderShell } from './nav.js';

const LOGIN_ERRORS = {
  state: 'Sign-in was cancelled or timed out. Please try again.',
  auth: 'Google could not confirm your identity. Please try again.',
};

function authShell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/login-assets/login.css">
</head>
<body>
  <main class="card">
    <div class="brand"><strong class="wordmark">BoromTech<sup>™</sup></strong><span class="kicker">Finance</span></div>
    ${body}
  </main>
</body>
</html>`;
}

export function loginPage({ error }) {
  const message = LOGIN_ERRORS[error] || '';
  return authShell('Sign in · Funding forecast', `<h1>Funding forecast</h1>
    <p class="lead">For invited investors only. Sign in with the Google account your administrator registered.</p>
    ${message ? `<p class="error" role="alert">${esc(message)}</p>` : ''}
    <a class="btn" href="/auth/google"><span class="g" aria-hidden="true">G</span>Sign in with Google</a>
    <ul class="points">
      <li>See the remaining capital, income and planned expenses by month</li>
      <li>Record actual expenses with receipts and print reimbursement forms</li>
    </ul>
    <p class="fine">Only your name, email and profile are requested, to check that your email is on the allowed list.</p>`);
}

export function noAccessPage({ email }) {
  const who = email ? `<strong>${esc(email)}</strong>` : 'This Google account';
  return authShell('No access yet', `<h1>No access yet</h1>
    <p class="lead">${email ? `The Google account ${who}` : who} does not have access to this funding forecast.</p>
    <p>Only emails verified by Google and on the administrator's allowed list can sign in. No session was created for this account.</p>
    <p>If you should have access, ask the administrator to add this email to the investor list.</p>
    <a class="btn" href="/auth/google">Try another Google account</a>
    <p class="fine"><a href="/login">Back to sign in</a></p>`);
}

export function notFoundPage() {
  return authShell('Page not found', `<h1>Page not found</h1>
    <p class="lead">The link may be wrong, or the item was deleted.</p>
    <a class="btn" href="/">Back to the dashboard</a>`);
}

export function dashboardPage({ forecast, example, email, name, csrf = '' }) {
  const summary = summarizeForecast(forecast);
  const banner = example
    ? `<div class="example-banner" role="status">${esc(EXAMPLE_BANNER)}</div>`
    : '';
  const colors = groupPalette(summary.groups);
  const groupLabels = new Map(summary.groups.map((group) => [group.key, group.label]));
  const balanceRows = summary.months.map((row) => ({ label: monthName(row.month), closingCents: row.closingCents }));
  const spendRows = summary.months.map((row) => {
    const byGroup = new Map();
    for (const item of row.month.items) {
      byGroup.set(item.group, (byGroup.get(item.group) || 0n) + parseMoneyCents(item.amount));
    }
    return {
      label: monthName(row.month),
      segments: [...byGroup].map(([key, cents]) => ({ key, label: groupLabels.get(key) || key, cents })),
    };
  });
  const first = summary.months[0];
  const last = summary.months.at(-1);
  const period = first
    ? `${esc(monthName(first.month, { full: true }))} – ${esc(monthName(last.month, { full: true }))} · ${summary.monthCount} ${summary.monthCount === 1 ? 'month' : 'months'}`
    : 'No months in the forecast yet';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Funding forecast · ${esc(forecast.company)}</title>
  <link rel="stylesheet" href="/app-assets/manage.css">
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  ${renderShell({ active: 'dashboard', email, name, csrf })}
  <div class="page-head">
    <div>
      <p class="kicker">${esc(forecast.company)}</p>
      <h1>Funding forecast</h1>
      <p class="sub">${period}</p>
    </div>
    <div class="page-actions">
      <a class="ghost small" href="/forecast">Edit planned expenses</a>
      <a class="button small" href="/actual/new">+ Record expense</a>
    </div>
  </div>
  <main id="main">
    ${banner}
    ${renderKpis(summary, forecast)}
    <div class="charts">
      <section class="panel" aria-labelledby="balance-heading">
        <div class="section-head">
          <h2 id="balance-heading">Month-end balance</h2>
          <span class="badge">THB</span>
        </div>
        <div class="chart-scroll">${renderBalanceChart(balanceRows, summary.openingCents)}</div>
      </section>
      <section class="panel" aria-labelledby="spend-heading">
        <div class="section-head">
          <h2 id="spend-heading">Planned expenses by month and item</h2>
        </div>
        <ul class="legend">
          ${summary.groups.map((group) => `<li><span class="swatch" style="background:${colors.get(group.key)}"></span>${esc(group.label)}</li>`).join('')}
        </ul>
        <div class="chart-scroll">${renderSpendChart(spendRows, summary.groups)}</div>
      </section>
    </div>
    <section class="panel" aria-labelledby="summary-heading">
      <div class="section-head">
        <h2 id="summary-heading">Monthly summary</h2>
        <div class="actions">
          <button class="ghost small" type="button" id="expand-all">Expand all</button>
          <button class="ghost small" type="button" id="collapse-all">Collapse all</button>
        </div>
        <p class="hint">Tap a month to see its items</p>
      </div>
      ${summary.monthCount === 0 ? '<p class="muted">No months in the forecast yet</p>' : ''}
      <div class="table-wrap">
        ${renderSummaryTable(summary, forecast)}
      </div>
    </section>
    <section class="panel" aria-labelledby="by-item-heading">
      <h2 id="by-item-heading">Planned expenses by item, ${summary.monthCount} ${summary.monthCount === 1 ? 'month' : 'months'} (THB)</h2>
      <div class="table-wrap">
        ${renderGroupTable(summary, colors)}
      </div>
    </section>
    <section class="panel footnotes" aria-labelledby="notes-heading">
      <h2 id="notes-heading">Notes</h2>
      <p class="fx-note"><span class="badge brand">FX</span> ${esc(fxNote(forecast.fx))}</p>
      ${forecast.balanceFormula ? `<p class="formula">${esc(forecast.balanceFormula)}</p>` : ''}
      <div class="notes-grid">
        <div>
          <h3>Assumptions</h3>
          ${renderNotes(forecast.assumptions)}
        </div>
        <div>
          <h3>Not yet included</h3>
          ${renderChips(forecast.notYetIncluded)}
        </div>
      </div>
    </section>
  </main>
  <div class="tip" id="chart-tip" role="tooltip" hidden></div>
  <script src="/dashboard-assets/dashboard.js" defer></script>
</body>
</html>`;
}

function renderKpis(summary, forecast) {
  const opening = summary.openingCents;
  const months = BigInt(summary.monthCount || 0);
  const avg = months > 0n ? summary.totalSpentCents / months : 0n;
  const runway = avg > 0n && summary.endingCents > 0n
    ? `${(Number(summary.endingCents) / Number(avg)).toFixed(1)} months`
    : '–';
  const left = opening > 0n ? `${(Number(summary.endingCents * 1000n / opening) / 10).toFixed(1)}%` : '–';
  const registered = parseMoneyCents(forecast.registeredCapital || '0');
  const share = String(forecast.openingCapital.shareText || forecast.openingCapital.sharePercent).replace(/\.0+$/, '');
  const openingSub = registered > 0n
    ? `${esc(share)}% of registered capital ${money(registered)}`
    : esc(forecast.openingCapital.label || '');
  const revenueSub = summary.totalRevenueCents === 0n
    ? 'No income in the forecast yet'
    : `Income ${money(summary.totalRevenueCents)}`;
  const ending = summary.endingCents < 0n ? ' negative' : '';
  const tile = (label, value, sub, extra = '') => `<div class="kpi${extra}">
      <p class="kpi-label">${label}</p>
      <p class="kpi-value">${value}</p>
      <p class="kpi-sub">${sub}</p>
    </div>`;
  return `<section class="kpis" aria-label="Key figures">
    ${tile(`Opening capital${forecast.openingCapital.assumed ? ` ${assumptionTag()}` : ''}`, money(opening), openingSub)}
    ${tile(`Planned expenses, ${summary.monthCount} ${summary.monthCount === 1 ? 'month' : 'months'}`, money(summary.totalSpentCents), `Avg ${money(avg)} / month · ${revenueSub}`)}
    ${tile('Ending balance', money(summary.endingCents), `${left} of opening capital left`, ` lead${ending}`)}
    ${tile('Runway', esc(runway), 'Based on average monthly expenses, without income')}
  </section>`;
}

function renderSummaryTable(summary, forecast) {
  const openingMark = forecast.openingCapital.assumed ? ` ${assumptionTag()}` : '';
  const opening = summary.openingCents > 0n ? summary.openingCents : 1n;
  const monthRows = summary.months.map((row, index) => {
    const id = `month-detail-${index}`;
    const label = monthName(row.month);
    const pct = row.closingCents > 0n ? Math.min(100, Number(row.closingCents * 1000n / opening) / 10) : 0;
    return `<tr class="month-row" role="button" tabindex="0" aria-expanded="false" aria-controls="${id}">
      <th scope="row"><span class="marker" aria-hidden="true">▸</span>${esc(label)}</th>
      <td class="num col-revenue">${money(row.revenueCents)}</td>
      <td class="num col-cash">${money(row.spentCents)}</td>
      <td class="num col-capital">${money(row.closingCents)}<span class="meter" aria-hidden="true"><span style="width:${pct}%"></span></span></td>
    </tr>
    <tr class="detail" id="${id}" hidden>
      <td colspan="4">${renderMonthDetails(row)}</td>
    </tr>`;
  }).join('');
  return `<table class="summary" aria-labelledby="summary-heading">
    <thead>
      <tr>
        <th scope="col">Month</th>
        <th class="num col-revenue" scope="col">Income</th>
        <th class="num col-cash" scope="col">Expenses</th>
        <th class="num col-capital" scope="col">Month-end balance</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening">
        <th scope="row">Opening capital${openingMark}</th>
        <td class="num col-revenue">–</td>
        <td class="num col-cash">–</td>
        <td class="num col-capital">${money(summary.openingCents)}</td>
      </tr>
      ${monthRows}
      <tr class="total">
        <th scope="row">Total</th>
        <td class="num col-revenue">${money(summary.totalRevenueCents)}</td>
        <td class="num col-cash">${money(summary.totalSpentCents)}</td>
        <td class="num col-capital">${money(summary.endingCents)}</td>
      </tr>
    </tbody>
  </table>`;
}

function renderMonthDetails(row) {
  const revenue = row.revenueCents === 0n
    ? '<li class="line-revenue">Income: none yet</li>'
    : `<li class="line-revenue"><span class="label">Income</span><span class="amt">${money(row.revenueCents)}</span></li>`;
  const items = row.month.items.map((item) => {
    const name = (typeof item.name === 'string' && item.name.trim())
      || (typeof item.groupName === 'string' && item.groupName.trim())
      || item.group
      || '';
    const mark = item.assumed ? ` ${assumptionTag()}` : '';
    const note = typeof item.note === 'string' && item.note.trim()
      ? ` <span class="item-note">${esc(item.note.trim())}</span>`
      : '';
    const usdCents = item.usd ? parseMoneyCents(item.usd) : null;
    const usd = usdCents != null ? `<span class="usd">US$${money(usdCents)}</span>` : '';
    return `<li class="line-expense"><span class="label">${esc(name)}${mark}${note}</span><span class="amt">${money(parseMoneyCents(item.amount))}${usd}</span></li>`;
  }).join('');
  return `<ul class="details">${revenue}${items}</ul>`;
}

function renderGroupTable(summary, colors) {
  const total = summary.groupTotalCents > 0n ? summary.groupTotalCents : 1n;
  const body = summary.groups.map((group) => {
    const mark = group.assumed ? ` ${assumptionTag()}` : '';
    const pct = Number(group.totalCents * 1000n / total) / 10;
    const color = colors.get(group.key);
    return `<tr>
      <th scope="row">${esc(group.label)}${mark}</th>
      <td class="share"><span class="share-bar" aria-hidden="true"><span style="width:${pct}%;background:${color}"></span></span><span class="share-pct">${pct.toFixed(1)}%</span></td>
      <td class="num">${money(group.totalCents)}</td>
    </tr>`;
  }).join('');
  return `<table class="groups" aria-labelledby="by-item-heading">
    <thead>
      <tr>
        <th scope="col">Item</th>
        <th scope="col" class="share-head">Share</th>
        <th class="num" scope="col">Total (THB)</th>
      </tr>
    </thead>
    <tbody>
      ${body || '<tr><td colspan="3" class="muted">No items</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="total">
        <th scope="row">Total</th>
        <td></td>
        <td class="num">${money(summary.groupTotalCents)}</td>
      </tr>
    </tfoot>
  </table>`;
}

function fxNote(fx) {
  const rate = parseFxRate(fx.rate) ?? '';
  return `1 ${fx.base} = ${rate} ${fx.quote} · ${fx.source} · ${englishDate(fx.updatedAt) || fx.updatedDisplay}`;
}

function renderNotes(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="muted">None</p>';
  return `<ol class="notes">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ol>`;
}

function renderChips(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="muted">None</p>';
  return `<ul class="chips">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ul>`;
}

function assumptionTag() {
  return `<span class="assumption">${ASSUMPTION_MARK}</span>`;
}

function money(cents) {
  return esc(formatCents(cents));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

// Dashboard-only additions on top of /app-assets/manage.css.
const DASHBOARD_CSS = `
.example-banner {
  background: var(--warn-bg);
  color: var(--warn-ink);
  border: 1.5px solid #e2b340;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 800;
  margin-bottom: 16px;
}
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow); min-width: 0; }
.kpi p { margin: 0; }
.kpi-label { color: var(--ink-3); font-size: .88rem; font-weight: 600; }
.kpi-value { font-size: 1.55rem; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.01em; margin: 2px 0 4px !important; overflow-wrap: anywhere; }
.kpi-sub { color: var(--ink-3); font-size: .84rem; }
.kpi.lead { background: var(--brand); border-color: var(--brand); color: white; box-shadow: inset 0 3px 0 var(--accent), var(--shadow); }
.kpi.lead .kpi-label, .kpi.lead .kpi-sub { color: var(--peach); }
.kpi.lead.negative { background: var(--danger); border-color: var(--danger); }
.charts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; list-style: none; padding: 0; margin: 0 0 8px; font-size: .86rem; color: var(--ink-2); }
.legend li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: 0 0 auto; }
.chart-scroll { overflow-x: auto; max-width: 100%; }
.chart-svg { width: 100%; height: auto; display: block; font-family: var(--font); }
.chart-svg .hit { cursor: crosshair; outline: none; }
.chart-svg .hit:hover, .chart-svg .hit:focus-visible { fill: rgba(19, 35, 59, .06); }
.tip {
  position: fixed;
  z-index: 40;
  max-width: 300px;
  background: var(--brand);
  color: white;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: .85rem;
  line-height: 1.4;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0,0,0,.2);
}
.summary { min-width: 560px; }
.groups { min-width: 420px; }
th, td { vertical-align: middle; }
.col-revenue, .col-cash, .col-capital { color: var(--ink); }
thead .col-revenue, thead .col-cash, thead .col-capital { color: var(--ink-3); }
.col-cash { color: var(--danger); }
.opening th, .opening td { background: var(--surface-2); }
.month-row { cursor: pointer; }
.month-row:focus { outline: none; }
.month-row:focus-visible { outline: 3px solid var(--brand); outline-offset: -3px; }
.month-row[aria-expanded="true"] > * { background: var(--brand-soft); }
.marker { display: inline-block; width: 1.15em; color: var(--ink-3); }
.meter { display: block; height: 4px; background: var(--line); border-radius: 2px; margin-top: 4px; margin-left: auto; width: 110px; overflow: hidden; }
.meter span { display: block; height: 100%; background: var(--brand); border-radius: 2px; }
tr.detail[hidden] { display: none; }
tr.detail td { background: var(--surface-2); padding: 4px 12px 10px; }
.details { list-style: none; margin: 0; padding: 4px 8px 4px 24px; }
.details li { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; padding: 6px 0; border-bottom: 1px dashed var(--line); }
.details li:last-child { border-bottom: 0; }
.details .label { min-width: 0; overflow-wrap: anywhere; }
.details .amt { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
.usd { display: block; text-align: right; font-weight: 400; font-size: .82rem; color: var(--ink-3); }
.item-note { display: block; color: var(--ink-3); font-size: .84rem; margin-top: 2px; }
.line-revenue { color: var(--ink-3); }
.line-expense { color: var(--ink); }
.share { width: 34%; }
.share-head { width: 34%; }
.share-bar { display: inline-block; vertical-align: middle; width: calc(100% - 56px); height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.share-bar span { display: block; height: 100%; border-radius: 4px; }
.share-pct { display: inline-block; width: 52px; text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-3); font-size: .86rem; }
.fx-note { margin: 0 0 8px; font-weight: 600; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.formula { margin: 0 0 4px; color: var(--ink-3); }
.notes-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 8px 32px; }
.notes { margin: 0; padding-left: 1.4em; }
.notes li { padding: 4px 0; }
.notes li::marker { color: var(--ink-3); font-variant-numeric: tabular-nums; }
.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chips li { background: var(--surface-2); border: 1px dashed var(--line-strong); border-radius: 999px; padding: 3px 12px; font-size: .9rem; }
@media (max-width: 960px) {
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .kpis { gap: 8px; }
  .kpi { padding: 12px; }
  .kpi-value { font-size: 1.2rem; }
  .notes-grid { grid-template-columns: minmax(0, 1fr); }
  .details { padding-left: 4px; }
  .meter { width: 72px; }
}
`;
