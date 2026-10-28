import { thaiDate, todayBangkok } from './dates.js';
import { csrfField, esc } from './html.js';
import { approvalRuleLines, visibleFinanceScope } from './office-access.js';
import {
  ANNOUNCEMENTS,
  EVENTS,
  LEAVE,
  MEMBERS,
  NAV_ITEMS,
  NOTIFICATION_COUNT,
  QUICK_ACTIONS,
  SCOPE_NOTE,
  TASKS,
} from './office-fixtures.js';

const ROLE_LABEL = {
  founder: 'ผู้ก่อการ',
  director: 'กรรมการ',
  employee: 'พนักงาน',
  expert: 'Expert',
};

const DOWNLOAD_NOTE = 'ใบทดรองจ่ายพิมพ์จากรายจ่ายจริงที่บันทึกแล้ว';

function icon(name, size) {
  return `<img class="icon" src="/office-assets/icons/${name}.svg" width="${size}" height="${size}" alt="">`;
}

function badge(label, tone) {
  return `<span class="badge badge-${tone} bt-caption-tag">${esc(label)}</span>`;
}

function stepper(steps) {
  const items = steps.map((row) => {
    const mark = row.state === 'done'
      ? icon('check', 14)
      : row.state === 'pending'
        ? icon('clock', 14)
        : '';
    const labelClass = row.state === 'upcoming' ? 'bt-body' : 'bt-body-medium';
    const meta = row.meta ? `<span class="bt-body-small">${esc(row.meta)}</span>` : '';
    return `<li class="step step-${row.state}">
      <span class="step-mark" aria-hidden="true">${mark}</span>
      <span class="step-text"><span class="${labelClass}">${esc(row.label)}</span>${meta}</span>
    </li>`;
  }).join('');
  return `<ol class="stepper">${items}</ol>`;
}

function cardHead(title, id) {
  const idAttr = id ? ` id="${esc(id)}"` : '';
  return `<div class="card-head"><h2 class="bt-h2-th"${idAttr}>${esc(title)}</h2></div>`;
}

function cashflowCard(ledger) {
  if (ledger.empty) {
    return `<section class="card card-cashflow" id="cashflow" aria-labelledby="cashflow-title" data-ledger="empty">
      <div class="card-head"><h2 class="bt-h2-th" id="cashflow-title">สรุปกระแสเงินสด</h2></div>
      ${badge('เห็นเฉพาะผู้บริหาร (ผู้ก่อการ · กรรมการ)', 'neutral')}
      <p class="bt-body">ยังไม่มีรายรับหรือรายจ่ายที่บันทึก</p>
      <p class="bt-body-small">ตัวเลขจะมาจากข้อมูลที่บันทึกในระบบ ไม่ใช่ตัวเลขตัวอย่าง</p>
      <p><a class="btn btn-primary" href="/office/expenses/new"><span class="bt-label-button-strong">บันทึกรายจ่าย</span></a></p>
    </section>`;
  }
  const figures = [
    ['รายรับ', ledger.income, 'actual', 'ยอดจริง', 'รวมรายรับที่บันทึก'],
    ['รายจ่ายยอดจริง', ledger.actual, 'actual', 'ยอดจริง', 'รวมรายจ่ายจริง'],
    ['รายจ่ายยอดคาดการณ์', ledger.forecast, 'forecast', 'ยอดคาดการณ์', 'รวมรายจ่ายคาดการณ์'],
    ['ยอดคงเหลือ', ledger.balance, 'actual', 'ยอดจริง', 'รายรับ − จ่ายจริง'],
  ].map(([label, amount, tone, badgeLabel, note]) => `<article class="figure${tone === 'forecast' ? ' figure-forecast' : ''}">
      <p class="bt-body-small-strong figure-label">${esc(label)}</p>
      <p class="bt-number-large">${esc(amount)}</p>
      <div class="tags">${badge(badgeLabel, tone)}</div>
      <p class="bt-body-small note">${esc(note)}</p>
    </article>`).join('');
  const expenses = ledger.recent.length
    ? ledger.recent.map((row) => `<li class="expense">
      <p class="bt-body expense-label">${esc(row.label)}</p>
      <p class="bt-body-small expense-month">${esc(row.month)}</p>
      <p class="bt-number-medium expense-amount">${esc(row.amount)}</p>
      ${badge(row.badge, row.tone)}
    </li>`).join('')
    : '<li class="bt-body-small">ยังไม่มีรายจ่าย</li>';
  return `<section class="card card-cashflow" id="cashflow" aria-labelledby="cashflow-title" data-ledger="live">
    <div class="card-head"><h2 class="bt-h2-th" id="cashflow-title">สรุปกระแสเงินสด</h2></div>
    <div class="visibility">
      ${badge('เห็นเฉพาะผู้บริหาร (ผู้ก่อการ · กรรมการ)', 'neutral')}
      <p class="bt-body-small">ยอดจากข้อมูลที่บันทึกในระบบ</p>
    </div>
    <div class="figures">${figures}</div>
    <div class="expense-list">
      <h3 class="bt-body-small-strong expense-heading">รายการรายจ่ายล่าสุด</h3>
      <ul>${expenses}</ul>
    </div>
  </section>`;
}

function cashflowHidden() {
  return `<section class="card card-cashflow-hidden" aria-labelledby="cashflow-hidden-title">
    <h2 class="bt-h2-th" id="cashflow-hidden-title">สรุปกระแสเงินสด</h2>
    ${badge('เห็นเฉพาะผู้บริหาร (ผู้ก่อการ · กรรมการ)', 'neutral')}
    <p class="bt-body-small">ผู้ก่อการและกรรมการเท่านั้นที่เห็นยอดของบริษัท</p>
  </section>`;
}

function announcementsCard() {
  const rows = ANNOUNCEMENTS.map((item) => {
    const action = item.action.type === 'button'
      ? `<button class="btn btn-primary btn-sm" type="button"><span class="bt-body-small-strong">${esc(item.action.label)}</span></button>`
      : badge(item.action.label, 'neutral');
    return `<article class="announce">
      <span class="accent accent-${item.accent}" aria-hidden="true"></span>
      <div class="announce-text">
        <p class="bt-body-strong">${esc(item.title)}</p>
        <p class="bt-body-small">${esc(item.meta)}</p>
      </div>
      ${action}
    </article>`;
  }).join('');
  return `<section class="card card-announcements" id="announcements" aria-labelledby="announcements-title">
    ${cardHead('ประกาศ', 'announcements-title')}
    ${rows}
  </section>`;
}

function downloadControl(row) {
  if (row.downloadHref) {
    return `<a class="btn btn-secondary btn-sm" href="${esc(row.downloadHref)}">${icon('download', 16)}<span class="bt-caption-tag">ดาวน์โหลดแบบฟอร์มทดรองจ่าย (PDF)</span></a>`;
  }
  return `<button class="btn btn-secondary btn-sm" type="button" disabled title="${esc(DOWNLOAD_NOTE)}">${icon('download', 16)}<span class="bt-caption-tag">ดาวน์โหลดแบบฟอร์มทดรองจ่าย (PDF)</span></button>`;
}

function advanceCard(scope, ledger) {
  const rules = approvalRuleLines().map((line) => `<li class="bt-body-small">${esc(line)}</li>`).join('');
  const note = SCOPE_NOTE[scope] || '';
  const rows = ledger.advances.map((row) => `<article class="advance" data-amount="${esc(String(row.amountBaht))}" data-approver-count="${esc(String(row.approverCount))}">
      <div class="advance-head">
        <div>
          <div class="advance-title">
            <p class="bt-body-strong">${esc(row.label)}</p>
            ${badge(row.limitLabel, 'neutral')}
          </div>
          <p class="bt-body-small">ผู้จ่าย: ${esc(row.payer || '–')}</p>
        </div>
        <p class="bt-number-medium">${esc(row.amount)}</p>
      </div>
      ${stepper(row.steps)}
      ${downloadControl(row)}
    </article>`).join('<hr class="divider">');
  const empty = ledger.advances.length
    ? rows
    : '<p class="bt-body-small">ยังไม่มีรายการทดรองจ่าย</p>';
  return `<section class="card card-finance" id="advances" aria-labelledby="advances-title">
    <div class="finance-body">
      <div class="card-head"><h2 class="bt-h2-th" id="advances-title">การเงินของฉัน · ทดรองจ่าย</h2></div>
      ${note ? `<p class="bt-body-small scope-note">${esc(note)}</p>` : ''}
      <div class="rules">
        <p class="bt-body-small-strong">เกณฑ์อนุมัติทดรองจ่าย · กรรมการผู้มีอำนาจลงนาม 2 คน</p>
        <ul>${rules}</ul>
      </div>
      ${empty}
    </div>
    <a class="awaiting" href="#advances">
      <span class="bt-body-strong">รอคุณอนุมัติ · ${ledger.awaiting} รายการ</span>
      ${icon('chevron', 16)}
    </a>
  </section>`;
}

function tasksCard() {
  const rows = TASKS.map((task) => `<li class="task">
      <span class="checkbox" aria-hidden="true"></span>
      <div class="task-text">
        <p class="bt-body">${esc(task.title)}</p>
        <p class="bt-body-small">${esc(task.meta)}</p>
      </div>
      <p class="bt-body-small task-due">${esc(task.due)}</p>
    </li>`).join('');
  return `<section class="card card-fill" id="tasks" aria-labelledby="tasks-title">
    ${cardHead('งานของฉัน', 'tasks-title')}
    <ul class="stack-list grow">${rows}</ul>
    <a class="more" href="#tasks"><span class="bt-body-small-strong">ดูงานทั้งหมด</span>${icon('chevron', 16)}</a>
  </section>`;
}

function todayCard() {
  const rows = EVENTS.map((event) => `<li class="event">
      <span class="event-bar" aria-hidden="true"></span>
      <p class="bt-number-small event-time">${esc(event.time)}</p>
      <div>
        <p class="bt-body">${esc(event.title)}</p>
        <p class="bt-body-small">${esc(event.meta)}</p>
      </div>
    </li>`).join('');
  return `<section class="card card-fill" id="today" aria-labelledby="today-title">
    ${cardHead('วันนี้', 'today-title')}
    <ul class="stack-list grow">${rows}</ul>
    <a class="more" href="#today"><span class="bt-body-small-strong">ดูปฏิทินทั้งหมด</span>${icon('chevron', 16)}</a>
  </section>`;
}

function leaveCard() {
  return `<section class="card card-fill" id="leave" aria-labelledby="leave-title">
    ${cardHead('สถานะใบลา', 'leave-title')}
    <p class="bt-h3-th">${esc(LEAVE.title)}</p>
    ${stepper(LEAVE.steps)}
    <p class="bt-caption-tag remain">${esc(LEAVE.remaining)}</p>
  </section>`;
}

function teamCard() {
  const cards = MEMBERS.map((member) => {
    const expert = member.type === 'expert';
    return `<article class="member">
      <span class="avatar ${expert ? 'avatar-expert' : 'avatar-employee'}" aria-hidden="true"><span class="bt-label-initial">${esc(member.initial)}</span></span>
      <div class="member-text">
        <p class="bt-body-strong">${esc(member.name)}</p>
        <p class="bt-body-small">${esc(member.role)}</p>
      </div>
      ${expert ? badge('Expert', 'brand') : badge('พนักงาน', 'neutral')}
    </article>`;
  }).join('');
  return `<section class="card" id="team" aria-labelledby="team-title">
    ${cardHead('ทีมและ Expert', 'team-title')}
    <div class="members">${cards}</div>
  </section>`;
}

function quickActions() {
  const buttons = QUICK_ACTIONS.map((action) => {
    const primary = action.style === 'primary';
    const labelClass = primary ? 'bt-label-button-strong' : 'bt-label-button';
    return `<a class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" href="${esc(action.href)}">${icon(action.icon, 18)}<span class="${labelClass}">${esc(action.label)}</span></a>`;
  }).join('');
  return `<div class="quick">${buttons}</div>`;
}

function sidebar(role, name) {
  const links = NAV_ITEMS.map((item) => {
    const current = item.current ? ' aria-current="page"' : '';
    return `<a class="nav-item" href="${esc(item.href)}"${current}>${icon(item.icon, 20)}<span>${esc(item.label)}</span></a>`;
  }).join('');
  const who = String(name || '').trim() || 'ผู้ใช้';
  const initial = who[0] || 'U';
  return `<aside class="sidebar">
    <a class="brand" href="/office">
      <span class="logo-mark bt-label-logo">B</span>
      <span class="bt-h1-latin">BoromTech</span>
    </a>
    <nav class="side-nav" aria-label="เมนูหลัก">${links}</nav>
    <div class="side-spacer"></div>
    <div class="user-card">
      <span class="user-avatar bt-label-initial" aria-hidden="true">${esc(initial)}</span>
      <div>
        <p class="bt-body-strong user-name">${esc(who)}</p>
        <p class="bt-body-small user-role">${esc(ROLE_LABEL[role] || role)}</p>
      </div>
    </div>
  </aside>`;
}

function shell({ role, csrf, name, ledgerState, body }) {
  const scope = visibleFinanceScope(role);
  const today = thaiDate(todayBangkok());
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>หน้าหลัก · BoromTech</title>
  <link rel="stylesheet" href="/office-assets/office.css">
</head>
<body class="office" data-role="${esc(role)}" data-finance-scope="${esc(scope)}" data-ledger="${esc(ledgerState)}">
  <a class="skip" href="#main">ข้ามไปที่เนื้อหา</a>
  <form class="sign-out" method="post" action="/auth/logout">${csrfField(csrf)}<button type="submit">ออกจากระบบ</button></form>
  <div class="portal">
    ${sidebar(role, name)}
    <div class="main">
      <div class="stack" id="main">
        <header class="header">
          <div class="greeting">
            <h1 class="bt-display-th">${esc(`สวัสดีตอนเช้า คุณ ${String(name || '').trim() || '(ชื่อผู้ใช้)'}`)}</h1>
            <p class="bt-body greeting-meta">${esc(today)}</p>
          </div>
          <div class="tools">
            <form class="search" role="search">
              ${icon('search', 16)}
              <input type="search" readonly placeholder="ค้นหา คน เอกสาร ประกาศ…" aria-label="ค้นหา">
            </form>
            <button class="bell" type="button" aria-label="การแจ้งเตือน ${NOTIFICATION_COUNT} รายการ">
              ${icon('bell', 22)}
              <span class="bell-count bt-caption-count">${NOTIFICATION_COUNT}</span>
            </button>
          </div>
        </header>
        ${body}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function officeHomePage({ role, csrf = '', ledger, name = '', saved = false }) {
  const scope = visibleFinanceScope(role);
  const cashflow = ledger.showCashflow ? cashflowCard(ledger) : cashflowHidden();
  const savedNote = saved ? '<p class="bt-body saved-note" role="status">บันทึกแล้ว</p>' : '';
  return shell({
    role,
    csrf,
    name,
    ledgerState: ledger.showCashflow ? (ledger.empty ? 'empty' : 'live') : 'hidden',
    body: `${savedNote}
        ${quickActions()}
        <div class="row-finance">
          <div class="col-main">
            ${cashflow}
            ${announcementsCard()}
          </div>
          ${advanceCard(scope, ledger)}
        </div>
        <div class="row-mid">
          ${tasksCard()}
          ${todayCard()}
          ${leaveCard()}
        </div>
        ${teamCard()}
        <h2 id="documents" class="visually-hidden">เอกสาร</h2>`,
  });
}

function field(name, label, value, { type = 'text', required = false } = {}) {
  return `<label class="field"><span class="bt-body-small-strong">${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}"${required ? ' required' : ''}></label>`;
}

export function officeExpenseFormPage({ role, csrf = '', name = '', months = [], errors = [], values = {} }) {
  const value = (key) => (values && values[key] != null ? String(values[key]) : '');
  const messages = errors.map((error) => `<li>${esc(error.message || error)}</li>`).join('');
  const monthOptions = months.map((month) => {
    const selected = month.id === value('monthId') ? ' selected' : '';
    return `<option value="${esc(month.id)}"${selected}>${esc(month.label || month.key)}</option>`;
  }).join('');
  const kind = value('kind') || 'actual';
  return shell({
    role,
    csrf,
    name,
    ledgerState: 'form',
    body: `<section class="card expense-form" aria-labelledby="expense-form-title">
      <h2 class="bt-h2-th" id="expense-form-title">บันทึกรายจ่าย</h2>
      <p class="bt-body-small">รายจ่ายจริงบันทึกลงรายการจ่ายจริง รายจ่ายคาดการณ์บันทึกลงประมาณการ ทดรองจ่ายต้องระบุผู้จ่าย</p>
      ${messages ? `<div class="form-error" role="alert"><ul>${messages}</ul></div>` : ''}
      <form method="post" action="/office/expenses">
        ${csrfField(csrf)}
        <fieldset class="kind-row">
          <legend class="bt-body-small-strong">ประเภท</legend>
          <label><input type="radio" name="kind" value="actual"${kind !== 'forecast' ? ' checked' : ''}> รายจ่ายจริง</label>
          <label><input type="radio" name="kind" value="forecast"${kind === 'forecast' ? ' checked' : ''}> รายจ่ายคาดการณ์</label>
        </fieldset>
        <label class="check-row"><input type="checkbox" name="advance" value="on"${value('advance') ? ' checked' : ''}> ทดรองจ่าย</label>
        <div class="form-grid">
          ${field('itemName', 'รายการ', value('itemName'), { required: true })}
          ${field('amount', 'จำนวนเงิน (บาท)', value('amount'), { required: true })}
          ${field('spentOn', 'วันที่', value('spentOn'), { type: 'date', required: true })}
          ${field('payer', 'ผู้จ่าย / ผู้ทดรองจ่าย', value('payer'))}
          ${field('vendor', 'ผู้รับเงิน (รายจ่ายจริง)', value('vendor'))}
          ${field('receiptNo', 'เลขที่ใบเสร็จ (รายจ่ายจริง)', value('receiptNo'))}
        </div>
        <label class="field"><span class="bt-body-small-strong">เดือน (รายจ่ายคาดการณ์)</span>
          <select name="monthId">
            <option value="">เลือกเดือน</option>
            ${monthOptions}
          </select>
        </label>
        <label class="field"><span class="bt-body-small-strong">หมายเหตุ</span><input name="note" value="${esc(value('note'))}"></label>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit"><span class="bt-label-button-strong">บันทึก</span></button>
          <a class="btn btn-secondary" href="/office"><span class="bt-label-button">ยกเลิก</span></a>
        </div>
      </form>
    </section>`,
  });
}
