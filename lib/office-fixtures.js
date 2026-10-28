// Sample Office Portal home content. Every figure is an example.
// No real financial figures, people, buildings, or email addresses.

export const EXAMPLE_TAG = 'ตัวอย่าง';

export const GREETING = 'สวัสดีตอนเช้า คุณ (ชื่อผู้ใช้)';
export const GREETING_META = 'วันพุธที่ 28 ต.ค. · มี 3 งานและ 3 นัดหมายวันนี้';
export const NOTIFICATION_COUNT = 3;
export const AWAITING_APPROVAL_COUNT = 0;

export const SAMPLE_USER = {
  initial: 'U',
  name: 'ชื่อผู้ใช้ (ตัวอย่าง)',
  role: 'บทบาท (ตัวอย่าง)',
};

export const SAMPLE_DIRECTORS = ['กรรมการ X', 'กรรมการ Y'];

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
  { href: '#advances', icon: 'receipt', label: 'ทดรองจ่าย', style: 'primary' },
  { href: '#advances', icon: 'wallet', label: 'เบิกค่าใช้จ่าย', style: 'secondary' },
  { href: '#leave', icon: 'plane', label: 'ขอลา', style: 'secondary' },
  { href: '#today', icon: 'door', label: 'จองห้องประชุม', style: 'secondary' },
  { href: '#documents', icon: 'file', label: 'คู่มือพนักงาน', style: 'secondary' },
  { href: '#team', icon: 'users', label: 'หาเพื่อนร่วมทีม', style: 'secondary' },
];

export const CASHFLOW = {
  title: 'สรุปกระแสเงินสด',
  visibility: 'เห็นเฉพาะผู้บริหาร (ผู้ก่อการ · กรรมการ)',
  period: 'ไตรมาสตัวอย่าง (ต.ค.–ธ.ค.) · ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง',
  listTitle: 'รายการรายจ่ายล่าสุด (ตัวอย่าง)',
  figures: [
    { label: 'รายรับ', baht: 1_250_000, tone: 'actual', badge: 'ยอดจริง', note: 'รับเข้าแล้วในไตรมาส' },
    { label: 'รายจ่ายยอดจริง', baht: 860_000, tone: 'actual', badge: 'ยอดจริง', note: 'รวมทดรองจ่ายแล้ว' },
    { label: 'รายจ่ายยอดคาดการณ์', baht: 320_000, tone: 'forecast', badge: 'ยอดคาดการณ์', note: 'ถึงสิ้นไตรมาส' },
    { label: 'ยอดคงเหลือ', baht: 390_000, tone: 'actual', badge: 'ยอดจริง', note: 'รายรับ − จ่ายจริง' },
  ],
  expenses: [
    { label: 'ค่าใช้จ่ายตัวอย่าง 1 · ทดรองจ่ายโดยผู้ก่อการ A', month: 'ต.ค.', baht: 8_500, tone: 'actual', badge: 'ยอดจริง' },
    { label: 'ค่าใช้จ่ายตัวอย่าง 2 · ทดรองจ่ายโดยผู้ก่อการ B', month: 'พ.ย.', baht: 24_000, tone: 'actual', badge: 'ยอดจริง' },
    { label: 'ค่าใช้จ่ายตัวอย่าง 3', month: 'ม.ค.', baht: 120_000, tone: 'forecast', badge: 'ยอดคาดการณ์' },
    { label: 'ค่าใช้จ่ายตัวอย่าง 4', month: 'ก.พ.', baht: 95_000, tone: 'forecast', badge: 'ยอดคาดการณ์' },
  ],
};

// amountBaht classifies the approval rule. displayAmount is the masked sample
// shown on the card (the design does not print a real-looking total here).
export const ADVANCE_EXAMPLES = [
  { title: 'ตัวอย่าง 1', amountBaht: 10_000, payer: 'ผู้ก่อการ A', displayAmount: '฿0,000' },
  { title: 'ตัวอย่าง 2', amountBaht: 10_001, payer: 'ผู้ก่อการ B', displayAmount: '฿00,000' },
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
