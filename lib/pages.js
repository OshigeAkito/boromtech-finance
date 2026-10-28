import { CHART_SERIES, renderMonthlyChart } from './chart.js';
import {
  ASSUMPTION_MARK,
  EXAMPLE_BANNER,
  formatCents,
  noteLabel,
  parseFxRate,
  parseMoneyCents,
  summarizeForecast,
} from './forecast.js';

const LOGIN_ERRORS = {
  state: 'การเข้าสู่ระบบถูกยกเลิกหรือหมดเวลา กรุณาลองอีกครั้ง',
  auth: 'ไม่สามารถยืนยันตัวตนกับ Google ได้ กรุณาลองอีกครั้ง',
};

export function loginPage({ error }) {
  const message = LOGIN_ERRORS[error] || '';
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>เข้าสู่ระบบ · ประมาณการเงินทุน</title>
  <link rel="stylesheet" href="/login-assets/login.css">
</head>
<body>
  <main class="card">
    <p class="kicker">BoromTech</p>
    <h1>ประมาณการเงินทุน</h1>
    <p class="lead">สำหรับนักลงทุนที่ได้รับเชิญเท่านั้น เข้าสู่ระบบด้วยบัญชี Google ที่ผู้ดูแลลงทะเบียนไว้</p>
    ${message ? `<p class="error" role="alert">${esc(message)}</p>` : ''}
    <a class="btn" href="/auth/google">เข้าสู่ระบบด้วย Google</a>
    <p class="fine">ระบบขอเฉพาะชื่อ อีเมล และโปรไฟล์ เพื่อตรวจว่าอีเมลอยู่ในรายชื่อที่อนุญาต</p>
  </main>
</body>
</html>`;
}

export function noAccessPage({ email }) {
  const who = email ? `<strong>${esc(email)}</strong>` : 'นี้';
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>ยังเข้าใช้งานไม่ได้</title>
  <link rel="stylesheet" href="/login-assets/login.css">
</head>
<body>
  <main class="card">
    <p class="kicker">BoromTech</p>
    <h1>ยังเข้าใช้งานไม่ได้</h1>
    <p class="lead">บัญชี Google ${who} ยังไม่ได้รับสิทธิ์ให้ดูประมาณการเงินทุนชุดนี้</p>
    <p>ใช้ได้เฉพาะอีเมลที่ Google ยืนยันแล้ว และอยู่ในรายชื่อที่ผู้ดูแลอนุญาต ระบบไม่ได้สร้างเซสชันให้บัญชีนี้</p>
    <p>หากคุณควรมีสิทธิ์ กรุณาติดต่อผู้ดูแลเพื่อเพิ่มอีเมลนี้ในรายชื่อนักลงทุน</p>
    <a class="btn" href="/auth/google">ลองด้วยบัญชี Google อื่น</a>
    <p class="fine"><a href="/login">กลับหน้าเข้าสู่ระบบ</a></p>
  </main>
</body>
</html>`;
}

export function notFoundPage() {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ไม่พบหน้านี้</title>
  <link rel="stylesheet" href="/login-assets/login.css">
</head>
<body>
  <main class="card">
    <h1>ไม่พบหน้านี้</h1>
    <p><a href="/">กลับไปที่แดชบอร์ด</a></p>
  </main>
</body>
</html>`;
}

export function dashboardPage({ forecast, example, email, name }) {
  const summary = summarizeForecast(forecast);
  const banner = example
    ? `<div class="example-banner" role="status">${esc(EXAMPLE_BANNER)}</div>`
    : '';
  const who = name ? `${name} · ${email}` : email;
  const chartRows = summary.months.map((row) => ({
    label: monthLabel(row.month),
    capitalCents: row.closingCents,
    revenueCents: row.revenueCents,
    cashOutCents: row.spentCents,
  }));
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>ประมาณการเงินทุน · ${esc(forecast.company)}</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <header class="top">
    <div>
      <p class="kicker">BoromTech</p>
      <h1>ประมาณการเงินทุน</h1>
      <p class="company">${esc(forecast.company)}</p>
    </div>
    <div class="session">
      <p>เข้าสู่ระบบด้วย <strong>${esc(who)}</strong></p>
      <form method="post" action="/auth/logout"><button class="primary" type="submit">ออกจากระบบ</button></form>
    </div>
  </header>
  <main>
    ${banner}
    <section class="panel" aria-labelledby="chart-heading">
      <h2 id="chart-heading">รายเดือน</h2>
      <ul class="legend">
        ${CHART_SERIES.map((series) => `<li><span class="swatch ${series.key}"></span>${esc(series.label)}</li>`).join('')}
      </ul>
      <div class="chart-scroll">
        ${renderMonthlyChart(chartRows)}
      </div>
    </section>
    <section class="panel" aria-labelledby="summary-heading">
      <div class="section-head">
        <h2 id="summary-heading">สรุปรายเดือน</h2>
        <div class="actions">
          <button class="ghost" type="button" id="expand-all">ขยายทั้งหมด</button>
          <button class="ghost" type="button" id="collapse-all">ย่อทั้งหมด</button>
        </div>
      </div>
      <div class="table-wrap">
        ${renderSummaryTable(summary, forecast)}
      </div>
    </section>
    <section class="panel" aria-labelledby="by-item-heading">
      <h2 id="by-item-heading">รายจ่ายรวม ${summary.monthCount} เดือน แยกตามรายการ (บาท)</h2>
      <div class="table-wrap">
        ${renderGroupTable(summary)}
      </div>
    </section>
    <section class="panel footnotes" aria-labelledby="notes-heading">
      <h2 id="notes-heading">หมายเหตุ</h2>
      <p class="fx-note">${esc(fxNote(forecast.fx))}</p>
      <h3>สมมติฐาน</h3>
      ${renderNotes(forecast.assumptions)}
      <h3>ยังไม่รวม</h3>
      ${renderNotes(forecast.notYetIncluded)}
    </section>
  </main>
  <script src="/dashboard-assets/dashboard.js" defer></script>
</body>
</html>`;
}

function renderSummaryTable(summary, forecast) {
  const openingMark = forecast.openingCapital.assumed ? ` ${assumptionTag()}` : '';
  const monthRows = summary.months.map((row, index) => {
    const id = `month-detail-${index}`;
    const label = monthLabel(row.month);
    return `<tr class="month-row" role="button" tabindex="0" aria-expanded="false" aria-controls="${id}">
      <th scope="row"><span class="marker" aria-hidden="true">▸</span>${esc(label)}</th>
      <td class="num col-revenue">${money(row.revenueCents)}</td>
      <td class="num col-cash">${money(row.spentCents)}</td>
      <td class="num col-capital">${money(row.closingCents)}</td>
    </tr>
    <tr class="detail" id="${id}" hidden>
      <td colspan="4">${renderMonthDetails(row)}</td>
    </tr>`;
  }).join('');
  return `<table class="summary" aria-labelledby="summary-heading">
    <thead>
      <tr>
        <th scope="col">เดือน</th>
        <th class="num col-revenue" scope="col">รายได้</th>
        <th class="num col-cash" scope="col">รายจ่าย</th>
        <th class="num col-capital" scope="col">เงินทุนสิ้นเดือน</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening">
        <th scope="row">ทุนเริ่มต้น (ยอดยกมา)${openingMark}</th>
        <td class="num col-revenue">–</td>
        <td class="num col-cash">–</td>
        <td class="num col-capital">${money(summary.openingCents)}</td>
      </tr>
      ${monthRows}
      <tr class="total">
        <th scope="row">รวม</th>
        <td class="num col-revenue">${money(summary.totalRevenueCents)}</td>
        <td class="num col-cash">${money(summary.totalSpentCents)}</td>
        <td class="num col-capital">${money(summary.endingCents)}</td>
      </tr>
    </tbody>
  </table>`;
}

function renderMonthDetails(row) {
  const revenue = row.revenueCents === 0n
    ? '<li class="line-revenue">รายได้: ยังไม่มีข้อมูลรายได้</li>'
    : `<li class="line-revenue"><span class="label">รายได้</span><span class="amt">${money(row.revenueCents)}</span></li>`;
  const items = row.month.items.map((item) => {
    const name = (typeof item.name === 'string' && item.name.trim())
      || (typeof item.groupName === 'string' && item.groupName.trim())
      || item.group
      || '';
    const mark = item.assumed ? ` ${assumptionTag()}` : '';
    return `<li class="line-expense"><span class="label">รายจ่าย: ${esc(name)}${mark}</span><span class="amt">${money(parseMoneyCents(item.amount))}</span></li>`;
  }).join('');
  return `<ul class="details">${revenue}${items}</ul>`;
}

function renderGroupTable(summary) {
  const body = summary.groups.map((group) => {
    const mark = group.assumed ? ` ${assumptionTag()}` : '';
    return `<tr>
      <th scope="row">${esc(group.label)}${mark}</th>
      <td class="num">${money(group.totalCents)}</td>
    </tr>`;
  }).join('');
  return `<table class="groups" aria-labelledby="by-item-heading">
    <thead>
      <tr>
        <th scope="col">รายการ</th>
        <th class="num" scope="col">รวม (บาท)</th>
      </tr>
    </thead>
    <tbody>
      ${body || '<tr><td colspan="2" class="muted">ไม่มีรายการ</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="total">
        <th scope="row">รวม</th>
        <td class="num">${money(summary.groupTotalCents)}</td>
      </tr>
    </tfoot>
  </table>`;
}

function fxNote(fx) {
  const rate = parseFxRate(fx.rate) ?? '';
  return `แปลงดอลลาร์ที่ ${rate} บาท/ดอลลาร์ จาก ${fx.source} อัปเดต ${fx.updatedDisplay}`;
}

function renderNotes(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="muted">ไม่มีรายการ</p>';
  return `<ul class="notes">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ul>`;
}

function monthLabel(month) {
  return month.label || month.labelFull || month.key || '';
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

const DASHBOARD_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Leelawadee UI", Thonburi, "Noto Sans Thai", Sarabun, "Segoe UI", sans-serif;
  background: #f3efe6;
  color: #1d1b16;
  line-height: 1.5;
  border-top: 4px solid #0b6b50;
}
main { max-width: 1100px; margin: 0 auto; padding: 8px 20px 48px; min-width: 0; }
.top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 20px 8px;
}
.session { display: flex; align-items: center; gap: 12px; }
.session p { margin: 0; overflow-wrap: anywhere; }
.kicker, .muted, .session p { color: #5e584e; }
.kicker { margin: 0; letter-spacing: .04em; text-transform: uppercase; font-size: .78rem; }
h1 { margin: 4px 0 0; font-size: 1.8rem; }
h2 { margin: 0 0 12px; font-size: 1.15rem; }
h3 { margin: 16px 0 8px; font-size: 1rem; }
.company { font-size: 1.05rem; font-weight: 700; margin: 6px 0 0; }
.example-banner {
  background: #fff4cc;
  color: #6d4e00;
  border: 2px solid #e2b340;
  border-radius: 14px;
  padding: 14px 16px;
  font-weight: 800;
  margin-bottom: 16px;
}
.panel {
  background: #fffdf9;
  border: 1px solid #e6dfd2;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
  min-width: 0;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.section-head h2 { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}
.legend li { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; flex: 0 0 auto; }
.swatch.capital { background: #E8710A; }
.swatch.revenue { background: #1E8E3E; }
.swatch.cashOut { background: #D93025; }
.chart-scroll { overflow-x: auto; max-width: 100%; }
.chart-svg { width: 100%; height: auto; display: block; font-family: "Leelawadee UI", Thonburi, "Noto Sans Thai", Sarabun, "Segoe UI", sans-serif; }
.table-wrap { overflow-x: auto; max-width: 100%; }
table { width: 100%; border-collapse: collapse; }
.summary { min-width: 560px; }
.groups { min-width: 320px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e6dfd2; vertical-align: middle; }
thead th { font-weight: 800; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.col-revenue { color: #1E8E3E; }
.col-cash { color: #D93025; }
.col-capital { color: #E8710A; }
.opening th, .opening td { background: #fff8ef; }
.opening .col-revenue, .opening .col-cash { color: #5e584e; }
.month-row { cursor: pointer; }
.month-row:hover { background: #fff6ea; }
.month-row:focus { outline: none; }
.month-row:focus-visible { outline: 3px solid #0b6b50; outline-offset: -3px; }
.marker { display: inline-block; width: 1.15em; color: #5e584e; }
tr.detail[hidden] { display: none; }
tr.detail td { background: #fbf7f0; padding: 4px 12px 10px; }
.details { list-style: none; margin: 0; padding: 4px 8px 4px 28px; }
.details li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  padding: 5px 0;
  border-bottom: 1px solid #f0ebe1;
}
.details li:last-child { border-bottom: 0; }
.details .label { min-width: 0; overflow-wrap: anywhere; }
.details .amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
.line-revenue { color: #1E8E3E; }
.line-expense { color: #D93025; }
tr.total th, tr.total td {
  font-weight: 800;
  border-top: 2px solid #1d1b16;
  background: #f6f1e6;
}
.assumption {
  color: #6d4e00;
  background: #fff4cc;
  border-radius: 999px;
  padding: 0 8px;
  font-size: .85em;
  font-weight: 800;
  white-space: nowrap;
}
.notes { list-style: none; margin: 0; padding: 0; }
.notes li { padding: 6px 0 6px 1em; position: relative; }
.notes li::before { content: "•"; position: absolute; left: 0; color: #0b6b50; }
.fx-note { margin: 0 0 8px; font-weight: 700; }
.footnotes h3 { color: #3f3a32; }
button {
  border-radius: 999px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
button.primary {
  background: #0b6b50;
  color: white;
  border: 0;
  padding: 10px 16px;
}
button.ghost {
  background: #fff;
  color: #0b6b50;
  border: 1.5px solid #0b6b50;
}
button:focus-visible, a:focus-visible { outline: 3px solid #0b6b50; outline-offset: 2px; }
@media (max-width: 720px) {
  .top, .session { display: block; }
  .session form { margin-top: 8px; }
  main, .top { padding-left: 12px; padding-right: 12px; }
  h1 { font-size: 1.45rem; }
  .panel { padding: 12px; }
  th, td { padding: 8px; }
  .details { padding-left: 8px; }
}
`;
