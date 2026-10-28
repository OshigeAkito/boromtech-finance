import { csrfField, esc } from './html.js';

const LINKS = [
  ['/', 'dashboard', 'แดชบอร์ด'],
  ['/forecast', 'forecast', 'ประมาณการ'],
  ['/actual', 'actual', 'รายจ่ายจริง'],
  ['/reimburse', 'reimburse', 'ทดรองจ่าย'],
  ['/settings', 'settings', 'ตั้งค่า'],
];

export function renderNav(active) {
  const links = LINKS.map(([href, key, label]) => {
    const current = key === active ? ' aria-current="page"' : '';
    return `<a href="${href}"${current}>${esc(label)}</a>`;
  }).join('');
  return `<nav class="nav" aria-label="เมนูหลัก"><div class="nav-inner">${links}</div></nav>`;
}

export function logoutForm(csrf) {
  return `<form method="post" action="/auth/logout" class="logout">${csrfField(csrf)}<button class="ghost small" type="submit">ออกจากระบบ</button></form>`;
}

// Brand bar shared by every signed-in page: brand, who is signed in, sign-out, then the tabs.
export function renderShell({ active, email, name, csrf }) {
  const initial = (String(name || email || '?').trim()[0] || '?').toUpperCase();
  const who = name ? `${name} · ${email}` : email;
  return `<a class="skip" href="#main">ข้ามไปที่เนื้อหา</a>
  <header class="appbar">
    <div class="appbar-inner">
      <a class="brand" href="/" aria-label="BoromTech หน้าแดชบอร์ด">
        <span class="brand-mark" aria-hidden="true">B</span>
        <span class="brand-text"><strong>BoromTech</strong><span>Finance</span></span>
      </a>
      <div class="session">
        <span class="avatar" aria-hidden="true">${esc(initial)}</span>
        <p class="who">เข้าสู่ระบบด้วย <strong>${esc(who)}</strong></p>
        ${logoutForm(csrf)}
      </div>
    </div>
    ${renderNav(active)}
  </header>`;
}
