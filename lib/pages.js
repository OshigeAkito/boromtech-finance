import {
  ASSUMPTION_MARK,
  EXAMPLE_BANNER,
  formatCents,
  noteLabel,
  parseMoneyCents,
  projectMonths,
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
  const currency = forecast.currency;
  const months = projectMonths(forecast);
  const ending = months.length ? months[months.length - 1].closingCents : parseMoneyCents(forecast.openingCapital.amount);
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
      ${kpi('ทุนจดทะเบียน', parseMoneyCents(forecast.registeredCapital), currency)}
      ${kpi('ทุนยกมา', parseMoneyCents(forecast.openingCapital.amount), currency, forecast.openingCapital.assumed)}
      ${kpi('ยอดสิ้นงวด', ending, currency)}
      ${kpiText('สกุลเงิน', forecast.currency)}
    </section>
    <section class="panel">
      <h2>ทุนยกมา</h2>
      <p class="formula">${esc(forecast.openingCapital.label)} ${forecast.openingCapital.assumed ? assumptionTag() : ''}</p>
      <p class="muted">${esc(forecast.openingCapital.timing)} · สัดส่วน ${esc(String(forecast.openingCapital.sharePercent))}%</p>
    </section>
    <section class="panel">
      <h2>สูตรยอดคงเหลือ</h2>
      <p class="formula">${esc(forecast.balanceFormula)}</p>
      <p class="muted">ยอดสิ้นเดือน = ยอดก่อนหน้า + รายรับ − ผลรวมรายการ โดยเริ่มจากทุนยกมา ทุนจดทะเบียนไม่ได้บวกเข้ายอดนี้</p>
    </section>
    <section class="panel">
      <h2>อัตราแลกเปลี่ยน</h2>
      ${renderFx(forecast.fx)}
    </section>
    <section class="panel">
      <h2>รายเดือน</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เดือน</th>
              <th>ยกมา</th>
              <th>รายรับ</th>
              <th>รายการ</th>
              <th>คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            ${months.map((row) => `<tr>
              <td>${esc(monthTitle(row.month))}</td>
              <td>${money(row.openingCents, currency)}</td>
              <td>${money(row.revenueCents, currency)}</td>
              <td>${money(row.spentCents, currency)}</td>
              <td class="${row.closingCents < 0n ? 'neg' : ''}">${money(row.closingCents, currency)}</td>
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
  const groups = row.groups.length
    ? row.groups.map((group) => `<section class="group">
        <h4>${esc(group.groupName)}</h4>
        <ul class="lines">${group.items.map((item) => `<li>
          <span>${esc(item.name)} ${item.assumed ? assumptionTag() : ''}</span>
          <span>${money(parseMoneyCents(item.amount), currency)}</span>
        </li>`).join('')}</ul>
      </section>`).join('')
    : '<p class="muted">ไม่มีรายการ</p>';
  return `<article class="month">
    <h3>${esc(monthTitle(row.month))}</h3>
    <p>รายรับ ${money(row.revenueCents, currency)}</p>
    ${groups}
  </article>`;
}

function renderNotes(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p class="muted">ไม่มีรายการ</p>';
  return `<ul class="notes">${items.map((item) => `<li>${esc(noteLabel(item))}</li>`).join('')}</ul>`;
}

function renderFx(fx) {
  return `<dl class="fx">
    <div><dt>คู่สกุล</dt><dd>1 ${esc(fx.base)} = ${esc(fx.rate)} ${esc(fx.quote)}</dd></div>
    <div><dt>ที่มา</dt><dd>${esc(fx.source)}</dd></div>
    <div><dt>อัปเดต</dt><dd>${esc(fx.updatedDisplay)}</dd></div>
  </dl>`;
}

function monthTitle(month) {
  if (month.labelFull && month.label) return `${month.labelFull} (${month.label})`;
  return month.labelFull || month.label || month.key || '';
}

function assumptionTag() {
  return `<span class="assumption">${ASSUMPTION_MARK}</span>`;
}

function kpi(label, cents, currency, assumed = false) {
  return `<article><p>${esc(label)}</p><strong class="${cents < 0n ? 'neg' : ''}">${money(cents, currency)} ${assumed ? assumptionTag() : ''}</strong></article>`;
}

function kpiText(label, value) {
  return `<article><p>${esc(label)}</p><strong>${esc(value)}</strong></article>`;
}

function money(cents, currency) {
  return esc(`${formatCents(cents)} ${currency}`);
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
.group { margin-top: 14px; }
.group h4 { margin: 0 0 4px; color: #0b6b50; }
.assumption {
  color: #6d4e00;
  background: #fff4cc;
  border-radius: 999px;
  padding: 0 8px;
  font-size: .85em;
  font-weight: 800;
  white-space: nowrap;
}
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
