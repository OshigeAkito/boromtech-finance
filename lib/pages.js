import { EXAMPLE_BANNER, noteLabel, projectMonths, lineAmount, lineName } from './forecast.js';

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
  const currency = forecast.currency;
  const months = projectMonths(forecast);
  const ending = months.length ? months[months.length - 1].closing : forecast.openingCapital;
  const banner = example
    ? `<div class="example-banner" role="status">${esc(EXAMPLE_BANNER)}</div>`
    : '';
  const who = name ? `${name} · ${email}` : email;
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
      <p class="kicker">BoromTech · Funding forecast</p>
      <h1>ประมาณการเงินทุน</h1>
    </div>
    <div class="session">
      <p>เข้าสู่ระบบด้วย <strong>${esc(who)}</strong></p>
      <form method="post" action="/auth/logout"><button type="submit">ออกจากระบบ</button></form>
    </div>
  </header>
  <main>
    ${banner}
    <p class="company">${esc(forecast.company)}</p>
    <section class="kpis" aria-label="สรุปตัวเลข">
      ${kpi('ทุนจดทะเบียน', forecast.registeredCapital, currency)}
      ${kpi('ทุนยกมา', forecast.openingCapital, currency)}
      ${kpi('ยอดสิ้นงวด', ending, currency)}
      ${kpiText('สกุลเงิน', forecast.currency)}
    </section>
    <section class="panel">
      <h2>สูตรยอดคงเหลือ</h2>
      <p class="formula">${esc(forecast.balanceFormula)}</p>
      <p class="muted">ทุนจดทะเบียนเป็นข้อมูลบริษัท ไม่ได้บวกเข้ายอดเงินสดอัตโนมัติ ยอดรายเดือนเริ่มจากทุนยกมา</p>
    </section>
    <section class="panel">
      <h2>อัตราแลกเปลี่ยน</h2>
      <dl class="fx">${renderFx(forecast.fx)}</dl>
    </section>
    <section class="panel">
      <h2>รายเดือน</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เดือน</th>
              <th>ยกมา</th>
              <th>เงินเข้า</th>
              <th>เงินออก</th>
              <th>คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            ${months.map((row) => `<tr>
              <td>${esc(monthTitle(row.month))}</td>
              <td>${money(row.opening, currency)}</td>
              <td>${money(row.inflow, currency)}</td>
              <td>${money(row.outflow, currency)}</td>
              <td class="${row.closing < 0 ? 'neg' : ''}">${money(row.closing, currency)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="months">
        ${months.map((row) => renderMonth(row, currency)).join('')}
      </div>
    </section>
    <section class="split">
      <div class="panel">
        <h2>สมมติฐาน</h2>
        ${renderNotes(forecast.assumptions)}
      </div>
      <div class="panel">
        <h2>ยังไม่รวม</h2>
        ${renderNotes(forecast.notYetIncluded)}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function renderMonth(row, currency) {
  return `<article class="month">
    <h3>${esc(monthTitle(row.month))}</h3>
    <div class="cols">
      <div>
        <h4>เงินเข้า</h4>
        ${renderLines(row.inflows, currency)}
      </div>
      <div>
        <h4>เงินออก</h4>
        ${renderLines(row.outflows, currency)}
      </div>
    </div>
  </article>`;
}

function renderLines(lines, currency) {
  if (!lines.length) return '<p class="muted">ไม่มีรายการ</p>';
  return `<ul class="lines">${lines.map((line) => {
    const amount = lineAmount(line);
    return `<li><span>${esc(lineName(line))}</span><span>${amount == null ? '—' : money(amount, currency)}</span></li>`;
  }).join('')}</ul>`;
}

function renderNotes(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="muted">ไม่มีรายการ</p>';
  return `<ul class="notes">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ul>`;
}

function renderFx(fx) {
  return Object.entries(fx).map(([key, value]) => {
    const shown = typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
    return `<div><dt>${esc(key)}</dt><dd>${esc(shown)}</dd></div>`;
  }).join('');
}

function monthTitle(month) {
  if (month.label && month.month) return `${month.label} (${month.month})`;
  return month.label || month.month || '';
}

function kpi(label, amount, currency) {
  return `<article><p>${esc(label)}</p><strong class="${amount < 0 ? 'neg' : ''}">${money(amount, currency)}</strong></article>`;
}

function kpiText(label, value) {
  return `<article><p>${esc(label)}</p><strong>${esc(value)}</strong></article>`;
}

function money(amount, currency) {
  const formatted = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return esc(`${formatted} ${currency}`);
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
}
main { max-width: 1100px; margin: 0 auto; padding: 8px 20px 48px; }
.top, .session, .kpis, .split, .cols, .lines li, .fx div {
  display: flex;
}
.top {
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 20px 8px;
}
.session { align-items: center; gap: 12px; }
.kicker, .muted, .session p, .kpis p { color: #5e584e; }
.kicker { margin: 0; letter-spacing: .04em; text-transform: uppercase; font-size: .78rem; }
h1 { margin: 4px 0 0; font-size: 1.8rem; }
h2 { margin: 0 0 8px; font-size: 1.15rem; }
h3, h4 { margin: 0 0 8px; }
.company { font-size: 1.25rem; font-weight: 700; margin: 8px 0 16px; }
.example-banner {
  background: #fff4cc;
  color: #6d4e00;
  border: 2px solid #e2b340;
  border-radius: 14px;
  padding: 14px 16px;
  font-weight: 800;
  margin-bottom: 16px;
}
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpis article, .panel, .month {
  background: #fffdf9;
  border: 1px solid #e6dfd2;
  border-radius: 16px;
  padding: 16px;
}
.kpis p, .session p { margin: 0; }
.kpis strong { display: block; margin-top: 6px; font-size: 1.25rem; }
.panel { margin-bottom: 16px; }
.formula { font-size: 1.05rem; font-weight: 700; margin: 0 0 8px; }
.fx { display: grid; gap: 8px; margin: 0; }
.fx div { justify-content: space-between; gap: 12px; border-bottom: 1px solid #e6dfd2; padding-bottom: 6px; }
.fx dt { font-weight: 700; }
.fx dd { margin: 0; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6dfd2; white-space: nowrap; }
th { color: #5e584e; font-weight: 700; }
.months { display: grid; gap: 12px; margin-top: 16px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.lines, .notes { list-style: none; margin: 0; padding: 0; }
.lines li { justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #f0ebe1; }
.notes li { padding: 6px 0 6px 1em; position: relative; }
.notes li::before { content: "•"; position: absolute; left: 0; color: #0b6b50; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
button {
  background: #0b6b50;
  color: white;
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
button:focus-visible, a:focus-visible { outline: 3px solid #0b6b50; outline-offset: 2px; }
.neg { color: #9d2c2c; }
@media (max-width: 720px) {
  .top, .session, .cols, .split { display: block; }
  .session form { margin-top: 8px; }
}
`;
