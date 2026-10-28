// Sample Office Portal home content. Every figure is an example.
// No real financial figures, people, buildings, or email addresses.

export const NOTIFICATION_COUNT = 3;

export const NAV_ITEMS = [
  { href: '/office', id: 'home', icon: 'home', label: 'หน้าหลัก', current: true },
  { href: '#announcements', id: 'announcements', icon: 'megaphone', label: 'ประกาศ' },
  { href: '#tasks', id: 'tasks', icon: 'tasks', label: 'งานของฉัน' },
  { href: '#today', id: 'today', icon: 'calendar', label: 'ปฏิทิน' },
  { href: '#leave', id: 'leave', icon: 'plane-nav', label: 'ลา' },
  { href: '#advances', id: 'finance', icon: 'banknote', label: 'การเงิน' },
  { href: '#team', id: 'team', icon: 'users-nav', label: 'ทีมและ Expert' },
  { href: '#documents', id: 'documents', icon: 'file-nav', label: 'เอกสาร' },
];

export const QUICK_ACTIONS = [
  { href: '/office/expenses/new', icon: 'receipt', label: 'ทดรองจ่าย', style: 'primary' },
  { href: '#advances', icon: 'wallet', label: 'เบิกค่าใช้จ่าย', style: 'secondary' },
  { href: '#leave', icon: 'plane', label: 'ขอลา', style: 'secondary' },
  { href: '#today', icon: 'door', label: 'จองห้องประชุม', style: 'secondary' },
  { href: '#documents', icon: 'file', label: 'คู่มือพนักงาน', style: 'secondary' },
  { href: '#team', icon: 'users', label: 'หาเพื่อนร่วมทีม', style: 'secondary' },
];

export const ANNOUNCEMENTS = [
  {
    title: 'ประชุมรวมทีมประจำเดือน',
    meta: 'ศุกร์นี้ 16:00 น. · ออนไลน์และที่ออฟฟิศ',
    accent: 'brand',
    action: { type: 'button', label: 'รับทราบ' },
  },
  {
    title: 'อัปเดตนโยบายการลา ปี 2027',
    meta: 'โพสต์โดยฝ่ายบุคคล · 2 ชม. ที่แล้ว',
    accent: 'muted',
    action: { type: 'badge', label: 'รับทราบแล้ว' },
  },
  {
    title: 'ต้อนรับ Expert ใหม่ 3 ท่าน ทีม Backend',
    meta: 'โพสต์โดยทีมบริหาร · เมื่อวาน',
    accent: 'muted',
    action: { type: 'badge', label: 'รับทราบแล้ว' },
  },
];

export const TASKS = [
  { title: 'รีวิว UI หน้าเว็บไซต์ UAT', meta: 'โปรเจกต์ตัวอย่าง A · ทีม UX', due: 'วันนี้' },
  { title: 'เตรียมเดโมแอปให้ลูกค้า', meta: 'โปรเจกต์ตัวอย่าง B · ลูกค้าตัวอย่าง', due: 'พรุ่งนี้' },
  { title: 'อัปเดตเอกสาร API', meta: 'โปรเจกต์ตัวอย่าง A · Backend', due: '31 ต.ค.' },
];

export const EVENTS = [
  { time: '10:00', title: 'Daily Stand-up', meta: '15 นาที · ออนไลน์' },
  { time: '14:00', title: 'รีวิวสปรินต์', meta: '60 นาที · ห้องประชุม A' },
  { time: '16:30', title: 'คุยกับลูกค้า (ออนไลน์)', meta: '45 นาที · ลูกค้าตัวอย่าง' },
];

export const LEAVE = {
  title: 'ลาพักร้อน 2–3 พ.ย.',
  remaining: 'คงเหลือ 8 วัน',
  steps: [
    { label: 'ส่งคำขอแล้ว', meta: '27 ต.ค.', state: 'done' },
    { label: 'หัวหน้าทีมอนุมัติ', meta: 'เรียบร้อย', state: 'done' },
    { label: 'ฝ่ายบุคคลยืนยัน', meta: 'รออนุมัติ', state: 'pending' },
  ],
};

export const MEMBERS = [
  { initial: 'A', name: 'พนักงาน A (ตัวอย่าง)', role: 'Frontend Developer', type: 'employee' },
  { initial: 'B', name: 'พนักงาน B (ตัวอย่าง)', role: 'QA Engineer', type: 'employee' },
  { initial: 'E', name: 'Expert A (ตัวอย่าง)', role: 'Backend', type: 'expert' },
  { initial: 'C', name: 'พนักงาน C (ตัวอย่าง)', role: 'Project Manager', type: 'employee' },
];

export const SCOPE_NOTE = {
  company: '',
  'own-claims': 'พนักงานเห็นเฉพาะใบเบิกของตนเอง รายการด้านล่างเป็นตัวอย่างเกณฑ์อนุมัติ ไม่ใช่ข้อมูลของผู้อื่น',
  'own-payment-status': 'Expert เห็นเฉพาะสถานะการจ่ายของตนเอง รายการด้านล่างเป็นตัวอย่างเกณฑ์อนุมัติ ไม่ใช่ข้อมูลของผู้อื่น',
  none: 'ไม่มีสิทธิ์ดูตัวเลขการเงินของบริษัท',
};
