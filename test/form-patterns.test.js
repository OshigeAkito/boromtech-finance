import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { findPlan } from '../lib/planned-plans.js';
import { actualFormPage, capitalPage, incomePage, itemFormPage } from '../lib/manage-pages.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));
// Give the example rows ids, the way a loaded forecast has them.
let next = 0;
const forecast = {
  ...example,
  months: example.months.map((month) => ({
    ...month,
    id: `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
    items: month.items.map((item) => ({ ...item, id: `00000000-0000-4000-9000-${String(++next).padStart(12, '0')}`, usd: item.usd || null })),
  })),
};

function decode(text) {
  return text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Every <input> with a pattern, as the browser sees it: name -> RegExp.
// Browsers compile pattern with the v flag and anchor it to the whole value.
function patterns(html) {
  const found = new Map();
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const pattern = /\spattern="([^"]*)"/.exec(tag);
    if (!pattern) continue;
    const name = /\sname="([^"]*)"/.exec(tag)[1];
    found.set(name, new RegExp(`^(?:${decode(pattern[1])})$`, 'v'));
  }
  return found;
}

const SAMPLES = {
  money: { ok: ['0', '7', '20000', '20000.5', '20000.50', '999999999999.99'], bad: ['', 'abc', '20,000', '1.234', '-5', '01'] },
  positive: { ok: ['0.01', '7', '20000', '20000.50'], bad: ['0', '0.00', 'abc', '1.234', '-5'] },
  rate: { ok: ['33.78705', '1', '0.5', '30.00'], bad: ['0', 'abc', '1.123456789', '-1'] },
};
const KIND = {
  value: 'money',
  amount: 'money',
  registeredCapital: 'money',
  openingAmount: 'money',
  revenue: 'money',
  foreignAmount: 'positive',
  foreignRate: 'rate',
  fxRate: 'rate',
};
// An actual expense was paid, so its amount must be more than 0.
const PAGE_KIND = { 'actual.amount': 'positive' };

function pages(lang) {
  const session = { lang, email: 'investor@example.com', name: 'Example', path: '/' };
  const plan = findPlan(forecast, forecast.months[0].items[0].id);
  return {
    capital: capitalPage({ session, forecast, csrf: 'token' }),
    income: incomePage({ session, forecast, csrf: 'token' }),
    newPlanned: itemFormPage({ session, forecast, csrf: 'token' }),
    editPlan: itemFormPage({ session, forecast, csrf: 'token', plan }),
    editRow: itemFormPage({ session, forecast, csrf: 'token', item: { ...forecast.months[0].items[0], monthId: forecast.months[0].id } }),
    actual: actualFormPage({ session, csrf: 'token', prefix: 'EXP' }),
  };
}

test('every number field pattern accepts real numbers in the browser', () => {
  for (const lang of ['en', 'th']) {
    for (const [page, html] of Object.entries(pages(lang))) {
      for (const [name, re] of patterns(html)) {
        const kind = PAGE_KIND[`${page}.${name}`] || KIND[name];
        if (!kind) continue;
        for (const sample of SAMPLES[kind].ok) assert.ok(re.test(sample), `${lang} ${page} ${name} should accept "${sample}" (${re})`);
        for (const sample of SAMPLES[kind].bad) assert.equal(re.test(sample), false, `${lang} ${page} ${name} should reject "${sample}" (${re})`);
      }
    }
  }
});

test('the planned forms have a number check on the amount', () => {
  for (const lang of ['en', 'th']) {
    const all = pages(lang);
    for (const page of ['newPlanned', 'editPlan', 'editRow']) {
      assert.ok(patterns(all[page]).has('value'), `${lang} ${page} has no pattern on value`);
    }
  }
});

test('start and end month sit side by side as direct grid items', () => {
  for (const lang of ['en', 'th']) {
    const all = pages(lang);
    for (const page of ['newPlanned', 'editPlan']) {
      const html = all[page];
      assert.match(
        html,
        /<div class="grid two">\s*<label class="field month-field" for="f-monthKey"[^>]*>[\s\S]*?<\/label>\s*<label class="field month-field reveal-off" for="f-endKey"/,
        `${lang} ${page}`,
      );
      assert.match(html, /data-month-picker=""/);
      assert.match(html, /<script src="\/app-assets\/manage\.js" defer><\/script>/);
    }
  }
});
