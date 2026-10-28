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
import { renderShell } from './nav.js';

const LOGIN_ERRORS = {
  state: 'การเข้าสู่ระบบถูกยกเลิกหรือหมดเวลา กรุณาลองอีกครั้ง',
  auth: 'ไม่สามารถยืนยันตัวตนกับ Google ได้ กรุณาลองอีกครั้ง',
};

function authShell(title, body) {
  return `<!doctype html>
<html lang="th">
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
  return authShell('เข้าสู่ระบบ · ประมาณการเงินทุน', `<h1>ประมาณการเงินทุน</h1>
    <p class="lead">สำหรับนักลงทุนที่ได้รับเชิญเท่านั้น เข้าสู่ระบบด้วยบัญชี Google ที่ผู้ดูแลลงทะเบียนไว้</p>
    ${message ? `<p class="error" role="alert">${esc(message)}</p>` : ''}
    <a class="btn" href="/auth/google"><span class="g" aria-hidden="true">G</span>เข้าสู่ระบบด้วย Google</a>
    <ul class="points">
      <li>ดูเงินทุนคงเหลือและรายจ่ายประมาณการรายเดือน</li>
      <li>บันทึกรายจ่ายจริงพร้อมหลักฐาน และพิมพ์ใบทดรองจ่าย</li>
    </ul>
    <p class="fine">ระบบขอเฉพาะชื่อ อีเมล และโปรไฟล์ เพื่อตรวจว่าอีเมลอยู่ในรายชื่อที่อนุญาต</p>`);
}

export function noAccessPage({ email }) {
  const who = email ? `<strong>${esc(email)}</strong>` : 'นี้';
  return authShell('ยังเข้าใช้งานไม่ได้', `<h1>ยังเข้าใช้งานไม่ได้</h1>
    <p class="lead">บัญชี Google ${who} ยังไม่ได้รับสิทธิ์ให้ดูประมาณการเงินทุนชุดนี้</p>
    <p>ใช้ได้เฉพาะอีเมลที่ Google ยืนยันแล้ว และอยู่ในรายชื่อที่ผู้ดูแลอนุญาต ระบบไม่ได้สร้างเซสชันให้บัญชีนี้</p>
    <p>หากคุณควรมีสิทธิ์ กรุณาติดต่อผู้ดูแลเพื่อเพิ่มอีเมลนี้ในรายชื่อนักลงทุน</p>
    <a class="btn" href="/auth/google">ลองด้วยบัญชี Google อื่น</a>
    <p class="fine"><a href="/login">กลับหน้าเข้าสู่ระบบ</a></p>`);
}

export function notFoundPage() {
  return authShell('ไม่พบหน้านี้', `<h1>ไม่พบหน้านี้</h1>
    <p class="lead">ลิงก์อาจผิดหรือรายการถูกลบไปแล้ว</p>
    <a class="btn" href="/">กลับไปที่แดชบอร์ด</a>`);
}

export function dashboardPage({ forecast, example, email, name, csrf = '' }) {
  const summary = summarizeForecast(forecast);
  const banner = example
    ? `<div class="example-banner" role="status">${esc(EXAMPLE_BANNER)}</div>`
    : '';
  const colors = groupPalette(summary.groups);
  const groupLabels = new Map(summary.groups.map((group) => [group.key, group.label]));
  const balanceRows = summary.months.map((row) => ({ label: monthLabel(row.month), closingCents: row.closingCents }));
  const spendRows = summary.months.map((row) => {
    const byGroup = new Map();
    for (const item of row.month.items) {
      byGroup.set(item.group, (byGroup.get(item.group) || 0n) + parseMoneyCents(item.amount));
    }
    return {
      label: monthLabel(row.month),
      segments: [...byGroup].map(([key, cents]) => ({ key, label: groupLabels.get(key) || key, cents })),
    };
  });
  const first = summary.months[0];
  const last = summary.months.at(-1);
  const period = first
    ? `${esc(first.month.labelFull || monthLabel(first.month))} – ${esc(last.month.labelFull || monthLabel(last.month))} · ${summary.monthCount} เดือน`
    : 'ยังไม่มีเดือนในประมาณการ';
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>ประมาณการเงินทุน · ${esc(forecast.company)}</title>
  <link rel="stylesheet" href="/app-assets/manage.css">
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  ${renderShell({ active: 'dashboard', email, name, csrf })}
  <div class="page-head">
    <div>
      <p class="kicker">${esc(forecast.company)}</p>
      <h1>ประมาณการเงินทุน</h1>
      <p class="sub">${period}</p>
    </div>
    <div class="page-actions">
      <a class="ghost small" href="/forecast">แก้ไขประมาณการ</a>
      <a class="button small" href="/actual/new">+ บันทึกรายจ่ายจริง</a>
    </div>
  </div>
  <main id="main">
    ${banner}
    ${renderKpis(summary, forecast)}
    <div class="charts">
      <section class="panel" aria-labelledby="balance-heading">
        <div class="section-head">
          <h2 id="balance-heading">เงินทุนคงเหลือสิ้นเดือน</h2>
          <span class="badge">บาท</span>
        </div>
        <div class="chart-scroll">${renderBalanceChart(balanceRows, summary.openingCents)}</div>
      </section>
      <section class="panel" aria-labelledby="spend-heading">
        <div class="section-head">
          <h2 id="spend-heading">รายจ่ายรายเดือน แยกตามรายการ</h2>
        </div>
        <ul class="legend">
          ${summary.groups.map((group) => `<li><span class="swatch" style="background:${colors.get(group.key)}"></span>${esc(group.label)}</li>`).join('')}
        </ul>
        <div class="chart-scroll">${renderSpendChart(spendRows, summary.groups)}</div>
      </section>
    </div>
    <section class="panel" aria-labelledby="summary-heading">
      <div class="section-head">
        <h2 id="summary-heading">สรุปรายเดือน</h2>
        <div class="actions">
          <button class="ghost small" type="button" id="expand-all">ขยายทั้งหมด</button>
          <button class="ghost small" type="button" id="collapse-all">ย่อทั้งหมด</button>
        </div>
        <p class="hint">แตะที่เดือนเพื่อดูรายการ</p>
      </div>
      ${summary.monthCount === 0 ? '<p class="muted">ยังไม่มีเดือนในประมาณการ</p>' : ''}
      <div class="table-wrap">
        ${renderSummaryTable(summary, forecast)}
      </div>
    </section>
    <section class="panel" aria-labelledby="by-item-heading">
      <h2 id="by-item-heading">รายจ่ายรวม ${summary.monthCount} เดือน แยกตามรายการ (บาท)</h2>
      <div class="table-wrap">
        ${renderGroupTable(summary, colors)}
      </div>
    </section>
    <section class="panel footnotes" aria-labelledby="notes-heading">
      <h2 id="notes-heading">หมายเหตุ</h2>
      <p class="fx-note"><span class="badge brand">FX</span> ${esc(fxNote(forecast.fx))}</p>
      ${forecast.balanceFormula ? `<p class="formula">${esc(forecast.balanceFormula)}</p>` : ''}
      <div class="notes-grid">
        <div>
          <h3>สมมติฐาน</h3>
          ${renderNotes(forecast.assumptions)}
        </div>
        <div>
          <h3>ยังไม่รวม</h3>
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
    ? `${(Number(summary.endingCents) / Number(avg)).toFixed(1)} เดือน`
    : '–';
  const left = opening > 0n ? `${(Number(summary.endingCents * 1000n / opening) / 10).toFixed(1)}%` : '–';
  const registered = parseMoneyCents(forecast.registeredCapital || '0');
  const share = String(forecast.openingCapital.shareText || forecast.openingCapital.sharePercent).replace(/\.0+$/, '');
  const openingSub = registered > 0n
    ? `${esc(share)}% ของทุนจดทะเบียน ${money(registered)}`
    : esc(forecast.openingCapital.label || '');
  const revenueSub = summary.totalRevenueCents === 0n
    ? 'ยังไม่มีรายรับในประมาณการ'
    : `รายรับรวม ${money(summary.totalRevenueCents)}`;
  const ending = summary.endingCents < 0n ? ' negative' : '';
  const tile = (label, value, sub, extra = '') => `<div class="kpi${extra}">
      <p class="kpi-label">${label}</p>
      <p class="kpi-value">${value}</p>
      <p class="kpi-sub">${sub}</p>
    </div>`;
  return `<section class="kpis" aria-label="ตัวเลขสำคัญ">
    ${tile(`ทุนยกมา${forecast.openingCapital.assumed ? ` ${assumptionTag()}` : ''}`, money(opening), openingSub)}
    ${tile(`รายจ่ายรวม ${summary.monthCount} เดือน`, money(summary.totalSpentCents), `เฉลี่ย ${money(avg)} / เดือน · ${revenueSub}`)}
    ${tile('คงเหลือสิ้นงวด', money(summary.endingCents), `เหลือ ${left} ของทุนยกมา`, ` lead${ending}`)}
    ${tile('ใช้ได้อีกประมาณ', esc(runway), 'คำนวณจากรายจ่ายเฉลี่ยต่อเดือน ไม่รวมรายรับ')}
  </section>`;
}

function renderSummaryTable(summary, forecast) {
  const openingMark = forecast.openingCapital.assumed ? ` ${assumptionTag()}` : '';
  const opening = summary.openingCents > 0n ? summary.openingCents : 1n;
  const monthRows = summary.months.map((row, index) => {
    const id = `month-detail-${index}`;
    const label = monthLabel(row.month);
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
    const note = typeof item.note === 'string' && item.note.trim()
      ? ` <span class="item-note">${esc(item.note.trim())}</span>`
      : '';
    const usdCents = item.usd ? parseMoneyCents(item.usd) : null;
    const usd = usdCents != null ? `<span class="usd">US$${money(usdCents)}</span>` : '';
    return `<li class="line-expense"><span class="label">รายจ่าย: ${esc(name)}${mark}${note}</span><span class="amt">${money(parseMoneyCents(item.amount))}${usd}</span></li>`;
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
        <th scope="col">รายการ</th>
        <th scope="col" class="share-head">สัดส่วน</th>
        <th class="num" scope="col">รวม (บาท)</th>
      </tr>
    </thead>
    <tbody>
      ${body || '<tr><td colspan="3" class="muted">ไม่มีรายการ</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="total">
        <th scope="row">รวม</th>
        <td></td>
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
  return `<ol class="notes">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ol>`;
}

function renderChips(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="muted">ไม่มีรายการ</p>';
  return `<ul class="chips">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ul>`;
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
