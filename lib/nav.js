import { csrfField, esc } from './html.js';
import { normalizeLang, tr } from './i18n.js';

const LINKS = [
  ['/', 'dashboard', { en: 'Dashboard', th: 'แดชบอร์ด' }],
  ['/income', 'income', { en: 'Income', th: 'รายรับ' }],
  ['/actual', 'expenses', { en: 'Expenses', th: 'รายจ่าย' }],
  ['/capital', 'capital', { en: 'Capital', th: 'เงินทุน' }],
];

// Expenses has two views: what was actually paid, and the planned (forecast) amounts.
const EXPENSE_VIEWS = [
  ['/actual', 'actual', { en: 'Actual', th: 'จ่ายจริง' }],
  ['/forecast', 'planned', { en: 'Planned', th: 'ประมาณการ' }],
];

export function renderNav(active, lang = 'en') {
  const code = normalizeLang(lang);
  const links = LINKS.map(([href, key, label]) => {
    const current = key === active ? ' aria-current="page"' : '';
    return `<a href="${href}"${current}>${esc(label[code])}</a>`;
  }).join('');
  return `<nav class="nav" aria-label="${tr(code)('Main menu', 'เมนูหลัก')}"><div class="nav-inner">${links}</div></nav>`;
}

export function expenseTabs(active, lang = 'en') {
  const code = normalizeLang(lang);
  const links = EXPENSE_VIEWS.map(([href, key, label]) => {
    const current = key === active ? ' aria-current="page"' : '';
    return `<a href="${href}"${current}>${esc(label[code])}</a>`;
  }).join('');
  return `<nav class="subtabs" aria-label="${tr(code)('Expense views', 'มุมมองรายจ่าย')}">${links}</nav>`;
}

// EN | TH switch; `path` is the page to come back to after switching.
export function langSwitch(lang = 'en', path = '/') {
  const code = normalizeLang(lang);
  const next = encodeURIComponent(path || '/');
  const link = (target, label, name) => {
    const current = target === code ? ' aria-current="true"' : '';
    return `<a href="/lang/${target}?next=${next}" hreflang="${target}" lang="${target}" title="${name}"${current}>${label}</a>`;
  };
  return `<nav class="lang-switch" aria-label="Language / ภาษา">${link('en', 'EN', 'English')}${link('th', 'TH', 'ภาษาไทย')}</nav>`;
}

export function logoutForm(csrf, lang = 'en') {
  return `<form method="post" action="/auth/logout" class="logout">${csrfField(csrf)}<button class="ghost small" type="submit">${tr(lang)('Sign out', 'ออกจากระบบ')}</button></form>`;
}

// Brand bar shared by every signed-in page: brand, who is signed in, language, sign-out, then the tabs.
export function renderShell({ active, email, name, csrf, lang = 'en', path = '/' }) {
  const L = tr(lang);
  const initial = (String(name || email || '?').trim()[0] || '?').toUpperCase();
  const who = name ? `${name} · ${email}` : email;
  return `<a class="skip" href="#main">${L('Skip to content', 'ข้ามไปที่เนื้อหา')}</a>
  <header class="appbar">
    <div class="appbar-inner">
      <a class="brand" href="/office" aria-label="${L('BoromTech office home', 'BoromTech หน้าหลักสำนักงาน')}">
        <span class="brand-text"><strong>BoromTech<sup>™</sup></strong><span>${L('Finance', 'การเงิน')}</span></span>
      </a>
      <div class="session">
        <span class="avatar" aria-hidden="true">${esc(initial)}</span>
        <p class="who">${L('Signed in as', 'เข้าสู่ระบบด้วย')} <strong>${esc(who)}</strong></p>
        <div class="session-tools">
          ${langSwitch(lang, path)}
          ${logoutForm(csrf, lang)}
        </div>
      </div>
    </div>
    ${renderNav(active, lang)}
  </header>`;
}
