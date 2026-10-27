import { formatCents } from './forecast.js';

export const CHART_SERIES = [
  { key: 'capital', label: 'เงินทุนคงเหลือ', color: '#E8710A' },
  { key: 'revenue', label: 'รายได้', color: '#1E8E3E' },
  { key: 'cashOut', label: 'รายจ่าย', color: '#D93025' },
];

const PLOT = { width: 960, height: 400, right: 18, top: 36, bottom: 42 };

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

export function renderMonthlyChart(rows) {
  const points = Array.isArray(rows) ? rows : [];
  const values = [];
  for (const row of points) {
    for (const series of CHART_SERIES) values.push(seriesCents(row, series.key));
  }
  const axis = chartAxis(values.length ? values : [0n]);
  const longest = axis.tickCents.reduce((best, tick) => {
    const text = formatCents(tick);
    return text.length > best ? text.length : best;
  }, 4);
  const padLeft = Math.max(118, Math.round(28 + longest * 7.6));
  const plotWidth = PLOT.width - padLeft - PLOT.right;
  const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;
  const span = Number(axis.maxCents - axis.minCents) || 1;
  const yOf = (cents) => PLOT.top + plotHeight * (1 - Number(cents - axis.minCents) / span);
  const zeroY = yOf(0n);
  const count = Math.max(points.length, 1);
  const slot = plotWidth / count;
  const barWidth = Math.min(26, Math.max(8, slot * 0.2));
  const innerGap = Math.max(4, barWidth * 0.22);
  const cluster = barWidth * CHART_SERIES.length + innerGap * (CHART_SERIES.length - 1);

  const grid = axis.tickCents.map((tick) => {
    const y = round1(yOf(tick));
    return `<line x1="${padLeft}" y1="${y}" x2="${PLOT.width - PLOT.right}" y2="${y}" stroke="#e6dfd2" stroke-width="1"></line>
    <text x="${padLeft - 10}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#5e584e" font-size="12">${esc(formatCents(tick))}</text>`;
  }).join('\n    ');

  const groups = points.map((row, index) => {
    const center = padLeft + slot * index + slot / 2;
    const start = center - cluster / 2;
    const bars = CHART_SERIES.map((series, seriesIndex) => {
      const cents = seriesCents(row, series.key);
      const valueY = yOf(cents);
      const top = Math.min(zeroY, valueY);
      const height = Math.abs(zeroY - valueY);
      const x = round1(start + seriesIndex * (barWidth + innerGap));
      const visible = cents === 0n ? 0 : Math.max(round1(height), 1);
      const visibleY = cents < 0n ? round1(zeroY) : round1(zeroY - visible);
      const hit = Math.max(visible, 8);
      const hitY = cents < 0n ? round1(zeroY) : round1(zeroY - hit);
      const tip = `${row.label} · ${series.label}: ${formatCents(cents)} บาท`;
      return `<g role="img" aria-label="${esc(tip)}">
        <title>${esc(tip)}</title>
        <rect x="${x}" y="${visibleY}" width="${round1(barWidth)}" height="${visible}" rx="2" fill="${series.color}"></rect>
        <rect x="${x}" y="${hitY}" width="${round1(barWidth)}" height="${round1(hit)}" fill="transparent"></rect>
      </g>`;
    }).join('\n      ');
    const labelY = PLOT.height - 16;
    return `<g>${bars}
      <text x="${round1(center)}" y="${labelY}" text-anchor="middle" fill="#1d1b16" font-size="13">${esc(row.label)}</text>
    </g>`;
  }).join('\n    ');

  const label = `แผนภูมิแท่ง ${points.length} เดือน เปรียบเทียบเงินทุนคงเหลือ รายได้ และรายจ่าย`;
  return `<svg class="chart-svg" viewBox="0 0 ${PLOT.width} ${PLOT.height}" role="img" aria-label="${esc(label)}" style="min-width:${Math.max(640, points.length * 92 + padLeft)}px">
    <title>${esc(label)}</title>
    <text x="${padLeft - 10}" y="16" text-anchor="end" fill="#5e584e" font-size="12">บาท</text>
    ${grid}
    ${groups}
  </svg>`;
}

function seriesCents(row, key) {
  if (key === 'capital') return row.capitalCents;
  if (key === 'revenue') return row.revenueCents;
  return row.cashOutCents;
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
