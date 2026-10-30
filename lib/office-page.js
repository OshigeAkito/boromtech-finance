import { csrfField, esc } from './html.js';
import {
  advanceLimitLabel,
  approvalRuleLines,
  buildAdvanceSteps,
  canSeeCashflowSummary,
  formatGroupedBaht,
  visibleFinanceScope,
} from './office-access.js';
import {
  ADVANCE_EXAMPLES,
  ANNOUNCEMENTS,
  AWAITING_APPROVAL_COUNT,
  CASHFLOW,
  EVENTS,
  EXAMPLE_TAG,
  GREETING,
  GREETING_META,
  LEAVE,
  MEMBERS,
  NAV_ITEMS,
  NOTIFICATION_COUNT,
  QUICK_ACTIONS,
  SAMPLE_DIRECTORS,
  SAMPLE_USER,
  SCOPE_NOTE,
  TASKS,
} from './office-fixtures.js';

const DOWNLOAD_NOTE = 'ยังไม่มีไฟล์แบบฟอร์มเปล่า ใบทดรองจ่ายพิมพ์จากรายจ่ายจริงที่บันทึกแล้ว';

function icon(name, size) {
  return `<img class="icon" src="/office-assets/icons/${name}.svg" width="${size}" height="${size}" alt="">`;
}

function badge(label, tone) {
  return `<span class="badge badge-${tone} bt-caption-tag">${esc(label)}</span>`;
}

function money(baht) {
  return `฿${formatGroupedBaht(baht)}`;
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

function cardHead(title, showExample) {
  return `<div class="card-head">
    <h2 class="bt-h2-th">${esc(title)}</h2>
    ${showExample ? badge(EXAMPLE_TAG, 'example') : ''}
  </div>`;
}

// `finance` holds real figures from buildOfficeFinance; without it the card shows the sample set.
function cashflowCard(finance) {
  const example = !finance;
  const data = finance || {
    period: CASHFLOW.period,
    figures: CASHFLOW.figures.map((figure) => ({ ...figure, amount: money(figure.baht) })),
    expenses: CASHFLOW.expenses.map((row) => ({ ...row, amount: money(row.baht) })),
  };
  const exampleTag = example ? badge(EXAMPLE_TAG, 'example') : '';
  const figures = data.figures.map((figure) => {
    const dashed = figure.tone === 'forecast' ? ' figure-forecast' : '';
    return `<article class="figure${dashed}">
      <p class="bt-body-small-strong figure-label">${esc(figure.label)}</p>
      <p class="bt-number-large">${esc(figure.amount)}</p>
      <div class="tags">${badge(figure.badge, figure.tone)}${exampleTag}</div>
      <p class="bt-body-small note">${esc(figure.note)}</p>
    </article>`;
  }).join('');
  const expenses = data.expenses.map((row) => {
    const label = row.href
      ? `<a class="expense-link" href="${esc(row.href)}">${esc(row.label)}</a>`
      : esc(row.label);
    return `<li class="expense">
      <p class="bt-body expense-label">${label}</p>
      <p class="bt-body-small expense-month">${esc(row.month)}</p>
      <p class="bt-number-medium expense-amount">${esc(row.amount)}</p>
      ${exampleTag}
      ${badge(row.badge, row.tone)}
    </li>`;
  }).join('');
  const listTitle = example ? CASHFLOW.listTitle : 'รายการรายจ่ายล่าสุด';
  return `<section class="card card-cashflow" id="cashflow" aria-labelledby="cashflow-title" data-example="${example}">
    <div class="card-head">
      <h2 class="bt-h2-th" id="cashflow-title">${esc(CASHFLOW.title)}</h2>
      ${example ? exampleTag : '<a class="card-link bt-body-small-strong" href="/">ดูแดชบอร์ดการเงิน</a>'}
    </div>
    <div class="visibility">
      ${badge(CASHFLOW.visibility, 'neutral')}
      <p class="bt-body-small">${esc(data.period)}</p>
    </div>
    <div class="figures">${figures}</div>
    <div class="expense-list">
      <h3 class="bt-body-small-strong expense-heading">${esc(listTitle)}</h3>
      ${expenses ? `<ul>${expenses}</ul>` : '<p class="bt-body-small note">ยังไม่มีรายการ</p>'}
    </div>
  </section>`;
}

function cashflowHidden() {
  return `<section class="card card-cashflow-hidden" aria-labelledby="cashflow-hidden-title">
    <h2 class="bt-h2-th" id="cashflow-hidden-title">${esc(CASHFLOW.title)}</h2>
    ${badge(CASHFLOW.visibility, 'neutral')}
    <p class="bt-body-small">ตัวเลขตัวอย่างชุดนี้ไม่แสดงสำหรับบทบาทนี้</p>
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
    ${cardHead('ประกาศ', false).replace('bt-h2-th"', 'bt-h2-th" id="announcements-title"')}
    ${rows}
  </section>`;
}

function advanceCard(scope) {
  const rules = approvalRuleLines().map((line) => `<li class="bt-body-small">${esc(line)}</li>`).join('');
  const note = SCOPE_NOTE[scope] || '';
  const examples = ADVANCE_EXAMPLES.map((example) => {
    const built = buildAdvanceSteps({
      amount: example.amountBaht,
      payer: example.payer,
      directors: SAMPLE_DIRECTORS,
    });
    return `<article class="advance" data-amount="${example.amountBaht}" data-approver-count="${built.count}">
      <div class="advance-head">
        <div>
          <div class="advance-title">
            <p class="bt-body-strong">${esc(example.title)}</p>
            ${badge(advanceLimitLabel(example.amountBaht), 'neutral')}
          </div>
          <p class="bt-body-small">ผู้ก่อการที่ทดรองจ่าย: ${esc(example.payer)}</p>
        </div>
        <p class="bt-number-medium">${esc(example.displayAmount)}</p>
      </div>
      ${stepper(built.steps)}
      <button class="btn btn-secondary btn-sm" type="button" disabled title="${esc(DOWNLOAD_NOTE)}">
        ${icon('download', 16)}
        <span class="bt-caption-tag">${esc('ดาวน์โหลดแบบฟอร์มทดรองจ่าย (PDF)')}</span>
      </button>
    </article>`;
  }).join('<hr class="divider">');
  return `<section class="card card-finance" id="advances" aria-labelledby="advances-title">
    <div class="finance-body">
      <div class="card-head">
        <h2 class="bt-h2-th" id="advances-title">การเงินของฉัน · ทดรองจ่าย</h2>
        ${badge(EXAMPLE_TAG, 'example')}
      </div>
      ${note ? `<p class="bt-body-small scope-note">${esc(note)}</p>` : ''}
      <div class="rules">
        <p class="bt-body-small-strong">เกณฑ์อนุมัติทดรองจ่าย · กรรมการผู้มีอำนาจลงนาม 2 คน</p>
        <ul>${rules}</ul>
      </div>
      ${examples}
    </div>
    <a class="awaiting" href="#advances">
      <span class="bt-body-strong">รอคุณอนุมัติ · ${AWAITING_APPROVAL_COUNT} รายการ</span>
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
    ${cardHead('งานของฉัน', false).replace('bt-h2-th"', 'bt-h2-th" id="tasks-title"')}
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
    ${cardHead('วันนี้', false).replace('bt-h2-th"', 'bt-h2-th" id="today-title"')}
    <ul class="stack-list grow">${rows}</ul>
    <a class="more" href="#today"><span class="bt-body-small-strong">ดูปฏิทินทั้งหมด</span>${icon('chevron', 16)}</a>
  </section>`;
}

function leaveCard() {
  return `<section class="card card-fill" id="leave" aria-labelledby="leave-title">
    ${cardHead('สถานะใบลา', false).replace('bt-h2-th"', 'bt-h2-th" id="leave-title"')}
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
    ${cardHead('ทีมและ Expert', false).replace('bt-h2-th"', 'bt-h2-th" id="team-title"')}
    <div class="members">${cards}</div>
  </section>`;
}

function quickActions(live) {
  const buttons = QUICK_ACTIONS.map((action) => {
    // With real data, the advance button opens the actual-expense form.
    const href = live && action.label === 'ทดรองจ่าย' ? '/actual/new' : action.href;
    const primary = action.style === 'primary';
    const labelClass = primary ? 'bt-label-button-strong' : 'bt-label-button';
    return `<a class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" href="${esc(href)}">${icon(action.icon, 18)}<span class="${labelClass}">${esc(action.label)}</span></a>`;
  }).join('');
  return `<div class="quick">${buttons}${badge(live ? 'ปุ่มอื่นนอกจากทดรองจ่าย = ตัวอย่าง' : 'ปุ่มการเงิน = ตัวอย่าง', 'example')}</div>`;
}

const ROLE_LABELS = {
  founder: 'ผู้ก่อการ',
  director: 'กรรมการ',
  employee: 'พนักงาน',
  expert: 'Expert',
};

// The signed-in person, or the sample card when the page is rendered without one.
function whoIsShown(user, role) {
  const name = String(user?.name || '').trim() || String(user?.email || '').trim();
  if (!name) return { ...SAMPLE_USER, greeting: GREETING };
  return {
    initial: name[0].toUpperCase(),
    name,
    role: ROLE_LABELS[role] || '',
    greeting: `สวัสดี คุณ${name}`,
  };
}

// Sections that open a working page. The rest jump to sample cards on this page.
const LIVE_NAV = new Set(['home', 'finance']);

function sidebar(who, csrf) {
  const links = NAV_ITEMS.map((item) => {
    const current = item.current ? ' aria-current="page"' : '';
    // การเงิน opens the finance dashboard; the other sections are still samples on this page.
    const href = item.id === 'finance' ? '/' : item.href;
    if (LIVE_NAV.has(item.id)) {
      return `<a class="nav-item nav-item-live" href="${esc(href)}"${current}>${icon(item.icon, 20)}<span>${esc(item.label)}</span></a>`;
    }
    return `<a class="nav-item nav-item-sample" href="${esc(href)}"${current}>${icon(item.icon, 20)}<span>${esc(item.label)}</span><span class="nav-tag bt-caption-tag">ตัวอย่าง</span></a>`;
  }).join('');
  return `<aside class="sidebar">
    <a class="brand" href="/office">
      <span class="logo-mark bt-label-logo">B</span>
      <span class="bt-h1-latin">BoromTech</span>
    </a>
    <nav class="side-nav" aria-label="เมนูหลัก">${links}</nav>
    <div class="side-spacer"></div>
    <div class="user-card">
      <span class="user-avatar bt-label-initial" aria-hidden="true">${esc(who.initial)}</span>
      <div class="user-meta">
        <p class="bt-body-strong user-name">${esc(who.name)}</p>
        ${who.role ? `<p class="bt-body-small user-role">${esc(who.role)}</p>` : ''}
      </div>
    </div>
    <form class="sign-out" method="post" action="/auth/logout">${csrfField(csrf)}<button class="btn btn-sm sign-out-btn" type="submit">ออกจากระบบ</button></form>
  </aside>`;
}

export function officeHomePage({ role, csrf = '', finance = null, user = null }) {
  const scope = visibleFinanceScope(role);
  const who = whoIsShown(user, role);
  const cashflow = canSeeCashflowSummary(role) ? cashflowCard(finance) : cashflowHidden();
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>หน้าหลัก · BoromTech</title>
  <link rel="stylesheet" href="/office-assets/office.css">
</head>
<body class="office" data-role="${esc(role)}" data-finance-scope="${esc(scope)}" data-example="true">
  <a class="skip" href="#main">ข้ามไปที่เนื้อหา</a>
  <div class="portal">
    ${sidebar(who, csrf)}
    <div class="main">
      <div class="stack" id="main">
        <header class="header">
          <div class="greeting">
            <h1 class="bt-display-th">${esc(who.greeting)}</h1>
            <p class="bt-body greeting-meta">${esc(GREETING_META)}</p>
          </div>
          <div class="tools">
            <form class="search" role="search">
              ${icon('search', 16)}
              <input type="search" readonly placeholder="ค้นหา คน เอกสาร ประกาศ…" aria-label="ค้นหา คน เอกสาร ประกาศ (ตัวอย่าง)">
            </form>
            <button class="bell" type="button" aria-label="การแจ้งเตือนตัวอย่าง ${NOTIFICATION_COUNT} รายการ">
              ${icon('bell', 22)}
              <span class="bell-count bt-caption-count">${NOTIFICATION_COUNT}</span>
            </button>
          </div>
        </header>
        ${quickActions(Boolean(finance))}
        <div class="row-finance">
          <div class="col-main">
            ${cashflow}
            ${announcementsCard()}
          </div>
          ${advanceCard(scope)}
        </div>
        <div class="row-mid">
          ${tasksCard()}
          ${todayCard()}
          ${leaveCard()}
        </div>
        ${teamCard()}
        <h2 id="documents" class="visually-hidden">เอกสาร (ตัวอย่าง)</h2>
      </div>
    </div>
  </div>
</body>
</html>`;
}
