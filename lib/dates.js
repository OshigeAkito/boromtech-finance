const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export function todayBangkok(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

export function thaiDateParts(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return null;
  const month = THAI_MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return {
    day: String(Number(match[3])),
    month,
    year: String(Number(match[1]) + 543),
  };
}

export function thaiDate(iso) {
  const parts = thaiDateParts(iso);
  if (!parts) return '';
  return `${parts.day} ${parts.month} ${parts.year}`;
}
