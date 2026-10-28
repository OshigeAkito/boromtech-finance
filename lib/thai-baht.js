const WORDS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];

function belowMillion(value, hasHigher) {
  const scales = [100000n, 10000n, 1000n, 100n, 10n, 1n];
  const labels = ['แสน', 'หมื่น', 'พัน', 'ร้อย', '', ''];
  let remain = value;
  let out = '';
  for (let index = 0; index < scales.length; index += 1) {
    const digit = remain / scales[index];
    remain %= scales[index];
    if (digit === 0n) continue;
    if (scales[index] === 10n) {
      if (digit === 1n) out += 'สิบ';
      else if (digit === 2n) out += 'ยี่สิบ';
      else out += `${WORDS[Number(digit)]}สิบ`;
    } else if (scales[index] === 1n) {
      const ed = digit === 1n && (hasHigher || value >= 10n);
      out += ed ? 'เอ็ด' : WORDS[Number(digit)];
    } else {
      out += `${WORDS[Number(digit)]}${labels[index]}`;
    }
  }
  return out;
}

export function convertInteger(value) {
  if (value === 0n) return 'ศูนย์';
  const groups = [];
  let rest = value;
  while (rest > 0n) {
    groups.push(rest % 1000000n);
    rest /= 1000000n;
  }
  let out = '';
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0n) continue;
    const hasHigher = groups.slice(index + 1).some((part) => part > 0n);
    out += belowMillion(group, hasHigher);
    if (index > 0) out += 'ล้าน'.repeat(index);
  }
  return out;
}

export function bahtText(cents) {
  if (typeof cents !== 'bigint' || cents < 0n) {
    throw new Error('baht amount must be a non-negative integer number of satang');
  }
  const baht = cents / 100n;
  const satang = cents % 100n;
  if (baht === 0n && satang === 0n) return 'ศูนย์บาทถ้วน';
  if (satang === 0n) return `${convertInteger(baht)}บาทถ้วน`;
  if (baht === 0n) return `${convertInteger(satang)}สตางค์`;
  return `${convertInteger(baht)}บาท${convertInteger(satang)}สตางค์`;
}
