import { csrfField, esc } from './html.js';

const LINKS = [
  ['/', 'dashboard', 'แดชบอร์ด'],
  ['/settings', 'settings', 'ตั้งค่า'],
  ['/forecast', 'forecast', 'ประมาณการ'],
  ['/actual', 'actual', 'รายจ่ายจริง'],
  ['/reimburse', 'reimburse', 'ทดรองจ่าย'],
];

export function renderNav(active) {
  const links = LINKS.map(([href, key, label]) => {
    const current = key === active ? ' aria-current="page"' : '';
    return `<a href="${href}"${current}>${esc(label)}</a>`;
  }).join('');
  return `<nav class="nav" aria-label="เมนูหลัก">${links}</nav>`;
}

export function logoutForm(csrf) {
  return `<form method="post" action="/auth/logout">${csrfField(csrf)}<button class="primary" type="submit">ออกจากระบบ</button></form>`;
}
