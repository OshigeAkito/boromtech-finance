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

// One spelling per month: a Buddhist-era key becomes 2026-01, so 2569-01 cannot sit beside it
// as a second January. Keys that are not months are returned unchanged.
export function canonicalMonthKey(key) {
  const parts = monthKeyParts(key);
  if (!parts) return key;
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`;
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

const REPEAT_STEP = { monthly: 1, quarterly: 3, yearly: 12 };

// Move a YYYY-MM key by whole months. Years stored in the Buddhist era are normalized first.
export function shiftMonthKey(key, offset) {
  const parts = monthKeyParts(key);
  if (!parts || !Number.isInteger(offset)) return null;
  const index = parts.year * 12 + (parts.month - 1) + offset;
  if (index < 0) return null;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const next = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  return monthKeyLabels(next) ? next : null;
}

// One key per occurrence, starting at startKey. The last month must fall inside
// 36 months beginning with the start month (offsets 0 through 35).
export function repeatMonthKeys(startKey, frequency, count) {
  const step = REPEAT_STEP[frequency];
  if (!step || !Number.isInteger(count) || count < 1 || count > 36) return null;
  const keys = [];
  for (let i = 0; i < count; i += 1) {
    const offset = i * step;
    if (offset >= 36) return null;
    const next = shiftMonthKey(startKey, offset);
    if (!next) return null;
    keys.push(next);
  }
  return keys;
}

// Calendar months run in date order so a month added later still sits in the cash walk.
// A key that is not a month stays after the calendar months, in its saved order.
export function orderForecastMonths(months) {
  return (Array.isArray(months) ? months : [])
    .map((month, index) => ({ month, index }))
    .sort((a, b) => {
      const left = monthKeyParts(a.month?.key);
      const right = monthKeyParts(b.month?.key);
      if (left && right) {
        if (left.year !== right.year) return left.year - right.year;
        if (left.month !== right.month) return left.month - right.month;
        return a.index - b.index;
      }
      if (left) return -1;
      if (right) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.month);
}
