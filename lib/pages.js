import { groupPalette, renderBalanceChart, renderCompareChart } from './chart.js';
import { buildDashboardSummary } from './dashboard-cash.js';
import {
  ASSUMPTION_MARK,
  EXAMPLE_BANNER,
  formatCents,
  aggregateExpenseGroups,
  noteLabel,
  parseMoneyCents,
} from './forecast.js';
import { monthName } from './dates.js';
import { bahtText } from './office-finance.js';
import { normalizeLang, tr } from './i18n.js';
import { langSwitch, renderShell } from './nav.js';

const LOGIN_ERRORS = {
  state: { en: 'Sign-in was cancelled or timed out. Please try again.', th: 'การเข้าสู่ระบบถูกยกเลิกหรือหมดเวลา กรุณาลองอีกครั้ง' },
  auth: { en: 'Google could not confirm your identity. Please try again.', th: 'ไม่สามารถยืนยันตัวตนกับ Google ได้ กรุณาลองอีกครั้ง' },
};

function authShell(title, body, lang = 'en', path = '/login') {
  return `<!doctype html>
<html lang="${normalizeLang(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/login-assets/login.css">
</head>
<body>
  <main class="card">
    <div class="brand"><strong class="wordmark">BoromTech<sup>™</sup></strong><span class="kicker">${tr(lang)('Finance', 'การเงิน')}</span>${langSwitch(lang, path)}</div>
    ${body}
  </main>
</body>
</html>`;
}

export function loginPage({ error, lang = 'en' }) {
  const code = normalizeLang(lang);
  const L = tr(code);
  const message = LOGIN_ERRORS[error]?.[code] || '';
  return authShell(L('Sign in · Funding forecast', 'เข้าสู่ระบบ · ประมาณการเงินทุน'), `<h1>${L('Funding forecast', 'ประมาณการเงินทุน')}</h1>
    <p class="lead">${L('For invited investors only. Sign in with the Google account your administrator registered.', 'สำหรับนักลงทุนที่ได้รับเชิญเท่านั้น เข้าสู่ระบบด้วยบัญชี Google ที่ผู้ดูแลลงทะเบียนไว้')}</p>
    ${message ? `<p class="error" role="alert">${esc(message)}</p>` : ''}
    <a class="btn" href="/auth/google"><span class="g" aria-hidden="true">G</span>${L('Sign in with Google', 'เข้าสู่ระบบด้วย Google')}</a>
    <ul class="points">
      <li>${L('See the remaining capital, income and planned expenses by month', 'ดูเงินทุนคงเหลือ รายรับ และรายจ่ายประมาณการรายเดือน')}</li>
      <li>${L('Record actual expenses with receipts and print reimbursement forms', 'บันทึกรายจ่ายจริงพร้อมหลักฐาน และพิมพ์ใบทดรองจ่าย')}</li>
    </ul>
    <p class="fine">${L('Only your name, email and profile are requested, to check that your email is on the allowed list.', 'ระบบขอเฉพาะชื่อ อีเมล และโปรไฟล์ เพื่อตรวจว่าอีเมลอยู่ในรายชื่อที่อนุญาต')}</p>`, code);
}

export function noAccessPage({ email, lang = 'en' }) {
  const L = tr(lang);
  const who = email ? `<strong>${esc(email)}</strong>` : '';
  const lead = email
    ? L(`The Google account ${who} does not have access to this funding forecast.`, `บัญชี Google ${who} ยังไม่ได้รับสิทธิ์ให้ดูประมาณการเงินทุนชุดนี้`)
    : L('This Google account does not have access to this funding forecast.', 'บัญชี Google นี้ยังไม่ได้รับสิทธิ์ให้ดูประมาณการเงินทุนชุดนี้');
  return authShell(L('No access yet', 'ยังเข้าใช้งานไม่ได้'), `<h1>${L('No access yet', 'ยังเข้าใช้งานไม่ได้')}</h1>
    <p class="lead">${lead}</p>
    <p>${L("Only emails verified by Google and on the administrator's allowed list can sign in. No session was created for this account.", 'ใช้ได้เฉพาะอีเมลที่ Google ยืนยันแล้ว และอยู่ในรายชื่อที่ผู้ดูแลอนุญาต ระบบไม่ได้สร้างเซสชันให้บัญชีนี้')}</p>
    <p>${L('If you should have access, ask the administrator to add this email to the investor list.', 'หากคุณควรมีสิทธิ์ กรุณาติดต่อผู้ดูแลเพื่อเพิ่มอีเมลนี้ในรายชื่อนักลงทุน')}</p>
    <a class="btn" href="/auth/google">${L('Try another Google account', 'ลองด้วยบัญชี Google อื่น')}</a>
    <p class="fine"><a href="/login">${L('Back to sign in', 'กลับหน้าเข้าสู่ระบบ')}</a></p>`, lang);
}

export function notFoundPage(lang = 'en') {
  const L = tr(lang);
  return authShell(L('Page not found', 'ไม่พบหน้านี้'), `<h1>${L('Page not found', 'ไม่พบหน้านี้')}</h1>
    <p class="lead">${L('The link may be wrong, or the item was deleted.', 'ลิงก์อาจผิดหรือรายการถูกลบไปแล้ว')}</p>
    <a class="btn" href="/">${L('Back to the dashboard', 'กลับไปที่แดชบอร์ด')}</a>`, lang, '/');
}

const SPEND_SERIES = [
  { key: 'planned', color: '#2a78d6' },
  { key: 'actual', color: '#E56E3F' },
];

export function dashboardPage({ forecast, actuals = [], example, email, name, csrf = '', lang = 'en', path = '/' }) {
  const code = normalizeLang(lang);
  const L = tr(code);
  const summary = buildDashboardSummary(forecast, actuals);
  const banner = example
    ? `<div class="example-banner" role="status">${esc(EXAMPLE_BANNER)}</div>`
    : '';
  const plannedGroups = aggregateExpenseGroups(forecast);
  const colors = groupPalette(plannedGroups);
  const balanceRows = summary.months.map((row) => ({ label: monthName(row.month, { lang: code }), closingCents: row.closingCents }));
  const seriesLabel = {
    planned: L('Planned', 'ประมาณการ'),
    actual: L('Actual', 'จ่ายจริง'),
  };
  const spendSeries = SPEND_SERIES.map((series) => ({ ...series, label: seriesLabel[series.key] }));
  const spendRows = summary.months.map((row) => ({
    label: monthName(row.month, { lang: code }),
    tip: `${monthName(row.month, { lang: code })} · ${seriesLabel.planned} ${formatCents(row.plannedCents)} ${L('THB', 'บาท')} · ${seriesLabel.actual} ${row.usesActual ? formatCents(row.actualCents) : '–'} ${L('THB', 'บาท')}`,
    values: { planned: row.plannedCents, actual: row.actualCents },
  }));
  const first = summary.months[0];
  const last = summary.months.at(-1);
  const period = first
    ? `${esc(monthName(first.month, { full: true, lang: code }))} – ${esc(monthName(last.month, { full: true, lang: code }))} · ${monthsText(summary.monthCount, L)}`
    : L('No months in the forecast yet', 'ยังไม่มีเดือนในประมาณการ');
  return `<!doctype html>
<html lang="${code}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${L('Funding forecast', 'ประมาณการเงินทุน')} · ${esc(forecast.company)}</title>
  <link rel="stylesheet" href="/app-assets/manage.css">
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  ${renderShell({ active: 'dashboard', email, name, csrf, lang: code, path })}
  <div class="page-head">
    <div>
      <p class="kicker">${esc(forecast.company)}</p>
      <h1>${L('Funding forecast', 'ประมาณการเงินทุน')}</h1>
      <p class="sub">${period}</p>
    </div>
    <div class="page-actions">
      <a class="ghost small" href="/forecast">${L('Edit planned expenses', 'แก้ไขรายจ่ายประมาณการ')}</a>
      <a class="button small" href="/actual/new">${L('+ Record expense', '+ บันทึกรายจ่ายจริง')}</a>
    </div>
  </div>
  <main id="main">
    ${banner}
    <p class="hint balance-rule">${L(
      'Month-end balance uses actual spending when that month has a recorded expense, grouped by the payment date. Otherwise it uses the planned total.',
      'เงินทุนสิ้นเดือนใช้ยอดจ่ายจริงในเดือนที่มีรายจ่ายที่บันทึกแล้ว โดยจัดกลุ่มตามเดือนของวันที่จ่าย เดือนที่ยังไม่มีรายจ่ายจริงใช้ยอดประมาณการ',
    )}</p>
    ${renderKpis(summary, forecast, L)}
    <div class="charts">
      <section class="panel" aria-labelledby="balance-heading">
        <div class="section-head">
          <h2 id="balance-heading">${L('Month-end balance', 'เงินทุนคงเหลือสิ้นเดือน')}</h2>
          <span class="badge">${L('THB', 'บาท')}</span>
        </div>
        ${summary.monthCount === 0
          ? `<p class="empty-chart">${L('No months to chart yet.', 'ยังไม่มีเดือนให้แสดงบนกราฟ')}</p>`
          : `<div class="chart-scroll">${renderBalanceChart(balanceRows, summary.openingCents, code)}</div>`}
      </section>
      <section class="panel" aria-labelledby="spend-heading">
        <div class="section-head">
          <h2 id="spend-heading">${L('Actual and planned by month', 'จ่ายจริงและประมาณการรายเดือน')}</h2>
        </div>
        <ul class="legend">
          ${spendSeries.map((series) => `<li><span class="swatch" style="background:${series.color}"></span>${esc(series.label)}</li>`).join('')}
        </ul>
        <div class="chart-scroll">${renderCompareChart(spendRows, spendSeries, code)}</div>
      </section>
    </div>
    <section class="panel" aria-labelledby="summary-heading">
      <div class="section-head">
        <h2 id="summary-heading">${L('Monthly summary', 'สรุปรายเดือน')}</h2>
        <div class="actions">
          <button class="ghost small" type="button" id="expand-all">${L('Expand all', 'ขยายทั้งหมด')}</button>
          <button class="ghost small" type="button" id="collapse-all">${L('Collapse all', 'ย่อทั้งหมด')}</button>
        </div>
        <p class="hint">${L('Tap a month to see its items', 'แตะที่เดือนเพื่อดูรายการ')}</p>
      </div>
      ${summary.forecastMonthCount === 0 ? `<p class="muted">${L('No forecast months. Actual expenses still appear by payment date.', 'ยังไม่มีเดือนในประมาณการ รายจ่ายจริงยังแสดงตามเดือนของวันที่จ่าย')}</p>` : ''}
      ${summary.actualCount === 0 ? `<p class="muted">${L('No actual expenses yet. Months without one use the planned total.', 'ยังไม่มีรายจ่ายจริง เดือนที่ไม่มีรายจ่ายจริงใช้ยอดประมาณการ')}</p>` : ''}
      <div class="table-wrap">
        ${renderSummaryTable(summary, forecast, L, code)}
      </div>
    </section>
    <section class="panel" aria-labelledby="by-item-heading">
      <h2 id="by-item-heading">${L(`Planned expenses by item, ${monthsText(summary.forecastMonthCount, L)} (THB)`, `รายจ่ายประมาณการรวม ${summary.forecastMonthCount} เดือน แยกตามรายการ (บาท)`)}</h2>
      <div class="table-wrap">
        ${renderGroupTable({ groups: plannedGroups, groupTotalCents: summary.totalPlannedCents }, colors, L)}
      </div>
    </section>
    <section class="panel footnotes" aria-labelledby="notes-heading">
      <h2 id="notes-heading">${L('Notes', 'หมายเหตุ')}</h2>
      ${forecast.balanceFormula ? `<p class="formula">${L('Balance', 'ยอดคงเหลือ')}: ${esc(forecast.balanceFormula)}</p>` : ''}
      <div class="notes-grid">
        <div>
          <h3>${L('Assumptions', 'สมมติฐาน')}</h3>
          ${renderNotes(forecast.assumptions, L)}
        </div>
        <div>
          <h3>${L('Not yet included', 'ยังไม่รวม')}</h3>
          ${renderChips(forecast.notYetIncluded, L)}
        </div>
      </div>
    </section>
  </main>
  <div class="tip" id="chart-tip" role="tooltip" hidden></div>
  <script src="/dashboard-assets/dashboard.js" defer></script>
</body>
</html>`;
}

function monthsText(count, L) {
  return count === 1 ? L('1 month', '1 เดือน') : L(`${count} months`, `${count} เดือน`);
}

function renderKpis(summary, forecast, L) {
  const opening = summary.openingCents;
  const plannedMonths = BigInt(summary.forecastMonthCount || 0);
  const shownMonths = BigInt(summary.monthCount || 0);
  const plannedAvg = plannedMonths > 0n ? summary.totalPlannedCents / plannedMonths : 0n;
  const balanceSpend = summary.months.reduce((sum, row) => sum + row.spendCents, 0n);
  const avg = shownMonths > 0n ? balanceSpend / shownMonths : 0n;
  const runway = avg > 0n && summary.endingCents > 0n
    ? L(`${(Number(summary.endingCents) / Number(avg)).toFixed(1)} months`, `${(Number(summary.endingCents) / Number(avg)).toFixed(1)} เดือน`)
    : '–';
  const left = opening > 0n ? `${(Number(summary.endingCents * 1000n / opening) / 10).toFixed(1)}%` : '–';
  const registered = parseMoneyCents(forecast.registeredCapital || '0');
  const share = String(forecast.openingCapital.shareText || forecast.openingCapital.sharePercent).replace(/\.0+$/, '');
  const openingSub = registered > 0n
    ? L(`${esc(share)}% of registered capital ${money(registered)}`, `${esc(share)}% ของทุนจดทะเบียน ${money(registered)}`)
    : esc(forecast.openingCapital.label || '');
  const revenueSub = summary.totalRevenueCents === 0n
    ? L('No income in the forecast yet', 'ยังไม่มีรายรับในประมาณการ')
    : L(`Income ${money(summary.totalRevenueCents)}`, `รายรับรวม ${money(summary.totalRevenueCents)}`);
  const actualSub = summary.actualCount === 0
    ? L('No actual expenses yet', 'ยังไม่มีรายจ่ายจริง')
    : L(`${summary.actualCount === 1 ? '1 expense' : `${summary.actualCount} expenses`} · by payment date`, `${summary.actualCount === 1 ? '1 รายการ' : `${summary.actualCount} รายการ`} · ตามวันที่จ่าย`);
  const ending = summary.endingCents < 0n ? ' negative' : '';
  const tile = (label, value, sub, extra = '') => `<div class="kpi${extra}">
      <p class="kpi-label">${label}</p>
      <p class="kpi-value">${value}</p>
      <p class="kpi-sub">${sub}</p>
    </div>`;
  return `<section class="kpis" aria-label="${L('Key figures', 'ตัวเลขสำคัญ')}">
    ${tile(`${L('Opening capital', 'ทุนยกมา')}${forecast.openingCapital.assumed ? ` ${assumptionTag(L)}` : ''}`, esc(bahtText(opening)), openingSub)}
    ${tile(L(`Planned expenses, ${monthsText(summary.forecastMonthCount, L)}`, `รายจ่ายประมาณการ ${monthsText(summary.forecastMonthCount, L)}`), esc(bahtText(summary.totalPlannedCents)), `${plannedMonths > 0n ? L(`Avg ${money(plannedAvg)} / month`, `เฉลี่ย ${money(plannedAvg)} / เดือน`) : L('No forecast months', 'ยังไม่มีเดือนในประมาณการ')} · ${revenueSub}`)}
    ${tile(L('Actual spent', 'จ่ายจริง'), esc(bahtText(summary.totalActualCents)), actualSub)}
    ${tile(L('Ending balance', 'คงเหลือสิ้นงวด'), esc(bahtText(summary.endingCents)), L(`${left} of opening capital left`, `เหลือ ${left} ของทุนยกมา`), ` lead${ending}`)}
    ${tile(L('Runway', 'ใช้ได้อีกประมาณ'), esc(runway), L('Based on the spending used in the balance, without income', 'คำนวณจากยอดที่ใช้ในเงินทุนสิ้นเดือน ไม่รวมรายรับ'))}
  </section>`;
}

function renderSummaryTable(summary, forecast, L, lang) {
  const openingMark = forecast.openingCapital.assumed ? ` ${assumptionTag(L)}` : '';
  const opening = summary.openingCents > 0n ? summary.openingCents : 1n;
  const monthRows = summary.months.map((row, index) => {
    const id = `month-detail-${index}`;
    const label = monthName(row.month, { lang });
    const pct = row.closingCents > 0n ? Math.min(100, Number(row.closingCents * 1000n / opening) / 10) : 0;
    const actualCell = row.usesActual ? money(row.actualCents) : '–';
    return `<tr class="month-row" role="button" tabindex="0" aria-expanded="false" aria-controls="${id}">
      <th scope="row"><span class="marker" aria-hidden="true">▸</span>${esc(label)}</th>
      <td class="num col-revenue">${money(row.revenueCents)}</td>
      <td class="num col-cash">${money(row.plannedCents)}</td>
      <td class="num col-actual">${actualCell}</td>
      <td class="num col-capital">${money(row.closingCents)}<span class="meter" aria-hidden="true"><span style="width:${pct}%"></span></span></td>
    </tr>
    <tr class="detail" id="${id}" hidden>
      <td colspan="5">${renderMonthDetails(row, L)}</td>
    </tr>`;
  }).join('');
  return `<table class="summary" aria-labelledby="summary-heading">
    <thead>
      <tr>
        <th scope="col">${L('Month', 'เดือน')}</th>
        <th class="num col-revenue" scope="col">${L('Income', 'รายได้')}</th>
        <th class="num col-cash" scope="col">${L('Planned', 'ประมาณการ')}</th>
        <th class="num col-actual" scope="col">${L('Actual', 'จ่ายจริง')}</th>
        <th class="num col-capital" scope="col">${L('Month-end balance', 'เงินทุนสิ้นเดือน')}</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening">
        <th scope="row">${L('Opening capital', 'ทุนเริ่มต้น (ยอดยกมา)')}${openingMark}</th>
        <td class="num col-revenue">–</td>
        <td class="num col-cash">–</td>
        <td class="num col-actual">–</td>
        <td class="num col-capital">${money(summary.openingCents)}</td>
      </tr>
      ${monthRows}
      <tr class="total">
        <th scope="row">${L('Total', 'รวม')}</th>
        <td class="num col-revenue">${money(summary.totalRevenueCents)}</td>
        <td class="num col-cash">${money(summary.totalPlannedCents)}</td>
        <td class="num col-actual">${summary.actualCount ? money(summary.totalActualCents) : '–'}</td>
        <td class="num col-capital">${money(summary.endingCents)}</td>
      </tr>
    </tbody>
  </table>`;
}

function renderMonthDetails(row, L) {
  const revenue = row.revenueCents === 0n
    ? `<li class="line-revenue">${L('Income: none yet', 'รายได้: ยังไม่มีข้อมูลรายได้')}</li>`
    : `<li class="line-revenue"><span class="label">${L('Income', 'รายได้')}</span><span class="amt">${money(row.revenueCents)}</span></li>`;
  const items = row.month.items.map((item) => {
    const name = (typeof item.name === 'string' && item.name.trim())
      || (typeof item.groupName === 'string' && item.groupName.trim())
      || item.group
      || '';
    const mark = item.assumed ? ` ${assumptionTag(L)}` : '';
    const note = typeof item.note === 'string' && item.note.trim()
      ? ` <span class="item-note">${esc(item.note.trim())}</span>`
      : '';
    const usdCents = item.usd ? parseMoneyCents(item.usd) : null;
    const usd = usdCents != null ? `<span class="usd">US$${money(usdCents)}</span>` : '';
    return `<li class="line-expense"><span class="label">${esc(name)}${mark}${note}</span><span class="amt">${money(parseMoneyCents(item.amount))}${usd}</span></li>`;
  }).join('');
  const actuals = (row.actuals || []).map((expense) => `<li class="line-expense"><span class="label">${esc(expense.itemName || '')} <span class="badge">${L('Actual', 'จ่ายจริง')}</span></span><span class="amt">${money(parseMoneyCents(String(expense.amount)))}</span></li>`).join('');
  const none = !items && !actuals ? `<li class="line-expense">${L('No expenses this month', 'ไม่มีรายจ่ายในเดือนนี้')}</li>` : '';
  return `<ul class="details">${revenue}${items}${actuals}${none}</ul>`;
}

function renderGroupTable(summary, colors, L) {
  const total = summary.groupTotalCents > 0n ? summary.groupTotalCents : 1n;
  const body = summary.groups.map((group) => {
    const mark = group.assumed ? ` ${assumptionTag(L)}` : '';
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
        <th scope="col">${L('Item', 'รายการ')}</th>
        <th scope="col" class="share-head">${L('Share', 'สัดส่วน')}</th>
        <th class="num" scope="col">${L('Total (THB)', 'รวม (บาท)')}</th>
      </tr>
    </thead>
    <tbody>
      ${body || `<tr><td colspan="3" class="muted">${L('No items', 'ไม่มีรายการ')}</td></tr>`}
    </tbody>
    <tfoot>
      <tr class="total">
        <th scope="row">${L('Total', 'รวม')}</th>
        <td></td>
        <td class="num">${money(summary.groupTotalCents)}</td>
      </tr>
    </tfoot>
  </table>`;
}

function renderNotes(items, L) {
  if (!Array.isArray(items) || items.length === 0) return `<p class="muted">${L('None', 'ไม่มีรายการ')}</p>`;
  return `<ol class="notes">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ol>`;
}

function renderChips(items, L) {
  if (!Array.isArray(items) || items.length === 0) return `<p class="muted">${L('None', 'ไม่มีรายการ')}</p>`;
  return `<ul class="chips">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ul>`;
}

function assumptionTag(L) {
  return `<span class="assumption">${L(ASSUMPTION_MARK, 'สมมติ')}</span>`;
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
.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
@media (max-width: 980px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.balance-rule { margin: 0 0 14px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow); min-width: 0; }
.kpi p { margin: 0; }
.kpi-label { color: var(--ink-3); font-size: .88rem; font-weight: 600; }
.kpi-value { font-size: 1.55rem; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.01em; margin: 2px 0 4px !important; overflow-wrap: anywhere; }
.kpi-sub { color: var(--ink-3); font-size: .84rem; }
.kpi.lead { background: var(--navy); border-color: var(--navy); color: white; box-shadow: inset 0 3px 0 var(--accent), var(--shadow); }
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
  background: var(--navy);
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
.month-row:focus-visible { outline: 3px solid var(--navy); outline-offset: -3px; }
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
.empty-chart { margin: 8px 0 4px; color: var(--ink-3); }
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
