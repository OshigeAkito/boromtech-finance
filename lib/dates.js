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

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function englishDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const month = MONTHS_SHORT[Number(match[2]) - 1];
  if (!month) return '';
  return `${Number(match[3])} ${month} ${match[1]}`;
}

// Month keys look like 2026-01 (or a Buddhist-era 2569-01). Anything else has no English label.
export function monthKeyParts(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key || '');
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  let year = Number(match[1]);
  if (year > 2400) year -= 543;
  return { year, month };
}

export function monthKeyLabels(key) {
  const parts = monthKeyParts(key);
  if (!parts) return null;
  return {
    label: `${MONTHS_SHORT[parts.month - 1]} ${parts.year}`,
    labelFull: `${MONTHS_LONG[parts.month - 1]} ${parts.year}`,
  };
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

// Label for a forecast month in the page language; falls back to the stored label for non-standard keys.
export function monthName(month, { full = false, lang = 'en' } = {}) {
  const parts = monthKeyParts(month?.key);
  if (parts && lang === 'th') {
    // Thai uses the Buddhist year: มกราคม 2569, short ม.ค. 69.
    const year = parts.year + 543;
    return full ? `${THAI_MONTHS[parts.month - 1]} ${year}` : `${THAI_MONTHS_SHORT[parts.month - 1]} ${String(year).slice(-2)}`;
  }
  const labels = monthKeyLabels(month?.key);
  if (labels) return full ? labels.labelFull : labels.label;
  return (full ? month?.labelFull || month?.label : month?.label || month?.labelFull) || month?.key || '';
}

export function formatDate(iso, lang = 'en') {
  return lang === 'th' ? thaiDate(iso) : englishDate(iso);
}
