import { formatCents } from './forecast.js';

// Two charts, each on its own scale: the cash balance is ~100x the monthly spend,
// so sharing one axis would flatten every spending bar to a hairline.

export const BALANCE_COLOR = '#0b6b50';
// Categorical slots, assigned in fixed order by first appearance of each expense group.
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER_COLOR = '#9a9488';
const GRID = '#ece6da';
const AXIS_INK = '#6b655a';
const SURFACE = '#fffdf9';

const PLOT = { width: 960, height: 340, right: 20, top: 30, bottom: 40 };

export function chartAxis(centsValues) {
  let min = 0n;
  let max = 0n;
  for (const value of centsValues) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === 0n && max === 0n) {
    return finishAxis(0n, 100n, 25n);
  }
  min = withHeadroom(min);
  max = withHeadroom(max);
  const span = (max > min ? max : min + 1n) - min;
  const rough = (span + 3n) / 4n;
  const step = niceStepCents(rough < 1n ? 1n : rough);
  const niceMin = min < 0n ? floorTo(min, step) : 0n;
  const niceMax = max > 0n ? ceilTo(max, step) : 0n;
  return finishAxis(niceMin, niceMax, step);
}

// Shared frame: y axis ticks + grid and an x slot per column.
function frame(axis, count) {
  const longest = axis.tickCents.reduce((best, tick) => Math.max(best, shortMoney(tick).length), 3);
  const padLeft = Math.round(26 + longest * 8);
  const plotWidth = PLOT.width - padLeft - PLOT.right;
  const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;
  const span = Number(axis.maxCents - axis.minCents) || 1;
  const yOf = (cents) => PLOT.top + plotHeight * (1 - Number(cents - axis.minCents) / span);
  const slot = plotWidth / Math.max(count, 1);
  const grid = axis.tickCents.map((tick) => {
    const y = round1(yOf(tick));
    const stroke = tick === 0n ? '#cfc6b6' : GRID;
    return `<line x1="${padLeft}" y1="${y}" x2="${PLOT.width - PLOT.right}" y2="${y}" stroke="${stroke}" stroke-width="1"></line>
    <text x="${padLeft - 10}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="${AXIS_INK}" font-size="13">${esc(shortMoney(tick))}</text>`;
  }).join('\n    ');
  return { padLeft, plotWidth, plotHeight, yOf, slot, grid };
}

function svgOpen(label, count, minPer) {
  const minWidth = Math.max(560, count * minPer + 120);
  return `<svg class="chart-svg" viewBox="0 0 ${PLOT.width} ${PLOT.height}" role="img" aria-label="${esc(label)}" style="min-width:${minWidth}px">
    <text x="12" y="16" fill="${AXIS_INK}" font-size="12">บาท</text>`;
}

function xLabel(x, text) {
  return `<text x="${round1(x)}" y="${PLOT.height - 12}" text-anchor="middle" fill="#3f3a32" font-size="13">${esc(text)}</text>`;
}

// Hover/focus target. The tooltip text lives in data-tip; aria-label carries the same words.
function hit(x, y, w, h, tip) {
  return `<rect class="hit" x="${round1(x)}" y="${round1(y)}" width="${round1(w)}" height="${round1(Math.max(h, 1))}" fill="transparent" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}"></rect>`;
}

// rows: [{ label, closingCents }]; the opening balance is drawn as the first point.
export function renderBalanceChart(rows, openingCents) {
  const points = [{ label: 'ยกมา', cents: openingCents, opening: true }]
    .concat((Array.isArray(rows) ? rows : []).map((row) => ({ label: row.label, cents: row.closingCents })));
  const axis = chartAxis(points.map((point) => point.cents));
  const f = frame(axis, points.length);
  const xs = points.map((_, index) => f.padLeft + f.slot * index + f.slot / 2);
  const ys = points.map((point) => f.yOf(point.cents));
  const zeroY = f.yOf(axis.minCents < 0n ? 0n : axis.minCents);
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${round1(x)} ${round1(ys[i])}`).join(' ');
  const area = `${line} L${round1(xs.at(-1))} ${round1(zeroY)} L${round1(xs[0])} ${round1(zeroY)} Z`;
  const last = points.length - 1;
  const marks = points.map((point, i) => {
    const tip = point.opening
      ? `ทุนยกมา: ${formatCents(point.cents)} บาท`
      : `${point.label} · เงินทุนคงเหลือ: ${formatCents(point.cents)} บาท`;
    const r = i === last || i === 0 ? 5 : 4;
    const label = i === last || i === 0
      ? `<text x="${round1(xs[i])}" y="${round1(ys[i] - 14)}" text-anchor="${i === 0 ? 'start' : 'end'}" fill="#1d1b16" font-size="13" font-weight="700">${esc(shortMoney(point.cents))}</text>`
      : '';
    return `<circle cx="${round1(xs[i])}" cy="${round1(ys[i])}" r="${r}" fill="${point.cents < 0n ? '#a12b2b' : BALANCE_COLOR}" stroke="${SURFACE}" stroke-width="2"></circle>
      ${label}
      ${xLabel(xs[i], point.label)}
      ${hit(xs[i] - f.slot / 2, PLOT.top, f.slot, f.plotHeight, tip)}`;
  }).join('\n    ');
  const label = `กราฟเส้นเงินทุนคงเหลือสิ้นเดือน ${points.length - 1} เดือน เริ่มจากทุนยกมา`;
  return `${svgOpen(label, points.length, 64)}
    <defs><linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BALANCE_COLOR}" stop-opacity=".18"></stop><stop offset="1" stop-color="${BALANCE_COLOR}" stop-opacity="0"></stop></linearGradient></defs>
    ${f.grid}
    <path d="${area}" fill="url(#balance-fill)"></path>
    <path d="${line}" fill="none" stroke="${BALANCE_COLOR}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
    ${marks}
  </svg>`;
}

// Colors for expense groups in first-appearance order; past eight, groups fold into "อื่น ๆ".
export function groupPalette(groups) {
  const map = new Map();
  groups.forEach((group, index) => {
    map.set(group.key, index < SERIES_COLORS.length ? SERIES_COLORS[index] : OTHER_COLOR);
  });
  return map;
}

// rows: [{ label, segments: [{ key, label, cents }] }], stacked bottom-up in group order.
export function renderSpendChart(rows, groups) {
  const columns = Array.isArray(rows) ? rows : [];
  const colors = groupPalette(groups);
  const totals = columns.map((row) => row.segments.reduce((sum, segment) => sum + segment.cents, 0n));
  const axis = chartAxis(totals.length ? totals : [0n]);
  const f = frame(axis, columns.length);
  const barWidth = Math.min(46, Math.max(16, f.slot * 0.5));
  const zeroY = f.yOf(0n);
  const order = new Map(groups.map((group, index) => [group.key, index]));
  const bars = columns.map((row, index) => {
    const center = f.padLeft + f.slot * index + f.slot / 2;
    const x = center - barWidth / 2;
    const segments = row.segments
      .filter((segment) => segment.cents > 0n)
      .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
    let base = 0n;
    const shapes = segments.map((segment, segIndex) => {
      const yBottom = f.yOf(base);
      base += segment.cents;
      const yTop = f.yOf(base);
      const isTop = segIndex === segments.length - 1;
      const gap = segIndex > 0 ? 2 : 0;
      const height = Math.max(yBottom - yTop - gap, 1.5);
      const top = yBottom - gap - height;
      return `<path d="${barPath(x, top, barWidth, height, isTop ? 4 : 0)}" fill="${colors.get(segment.key) || OTHER_COLOR}"></path>`;
    }).join('');
    const total = totals[index];
    const tipParts = segments.map((segment) => `${segment.label} ${formatCents(segment.cents)}`);
    const tip = `${row.label} · รายจ่ายรวม ${formatCents(total)} บาท${tipParts.length ? ` — ${tipParts.join(' · ')}` : ''}`;
    const totalLabel = total > 0n
      ? `<text x="${round1(center)}" y="${round1(f.yOf(total) - 8)}" text-anchor="middle" fill="#3f3a32" font-size="12" font-weight="700">${esc(shortMoney(total))}</text>`
      : '';
    return `<g>${shapes}${totalLabel}${xLabel(center, row.label)}${hit(center - f.slot / 2, PLOT.top, f.slot, zeroY - PLOT.top, tip)}</g>`;
  }).join('\n    ');
  const label = `กราฟแท่งซ้อนรายจ่ายประมาณการรายเดือน ${columns.length} เดือน แยกตามรายการ`;
  return `${svgOpen(label, columns.length, 70)}
    ${f.grid}
    ${bars}
  </svg>`;
}

function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  const X = round1(x);
  const Y = round1(y);
  const W = round1(w);
  const H = round1(h);
  if (!rr) return `M${X} ${Y}h${W}v${H}h${-W}Z`;
  return `M${X} ${round1(y + h)}V${round1(y + rr)}Q${X} ${Y} ${round1(x + rr)} ${Y}H${round1(x + w - rr)}Q${round1(x + w)} ${Y} ${round1(x + w)} ${round1(y + rr)}V${round1(y + h)}Z`;
}

// Axis and label text: whole baht with thousands separators, or "k" past 100,000.
export function shortMoney(cents) {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const baht = abs / 100n;
  let text;
  if (baht >= 1000000n) text = `${trimDecimal(Number(abs) / 100000000)}M`;
  else if (baht >= 100000n) text = `${trimDecimal(Number(abs) / 100000)}k`;
  else text = formatCents(baht * 100n).replace(/\.00$/, '');
  if (abs % 100n !== 0n && baht < 100000n) text = formatCents(abs);
  return negative ? `-${text}` : text;
}

function trimDecimal(value) {
  return (Math.round(value * 10) / 10).toString();
}

function withHeadroom(value) {
  if (value === 0n) return 0n;
  const magnitude = value < 0n ? -value : value;
  let extra = (magnitude * 8n + 99n) / 100n;
  if (extra < 1n) extra = 1n;
  return value < 0n ? value - extra : value + extra;
}

function niceStepCents(rough) {
  if (rough <= 1n) return 1n;
  const digits = rough.toString().length;
  const pow = 10n ** BigInt(digits - 1);
  const errTimes10 = (rough * 10n) / pow;
  let niceTimes10 = 100n;
  if (errTimes10 <= 10n) niceTimes10 = 10n;
  else if (errTimes10 <= 20n) niceTimes10 = 20n;
  else if (errTimes10 <= 25n) niceTimes10 = 25n;
  else if (errTimes10 <= 50n) niceTimes10 = 50n;
  return (niceTimes10 * pow) / 10n || 1n;
}

function ceilTo(value, step) {
  if (value >= 0n) return ((value + step - 1n) / step) * step;
  return (value / step) * step;
}

function floorTo(value, step) {
  if (value >= 0n) return (value / step) * step;
  return -ceilTo(-value, step);
}

function finishAxis(min, max, step) {
  const ticks = [];
  const safeStep = step > 0n ? step : 1n;
  for (let value = min; value < max && ticks.length < 12; value += safeStep) ticks.push(value);
  ticks.push(max);
  return { minCents: ticks[0], maxCents: ticks[ticks.length - 1], tickCents: ticks };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
