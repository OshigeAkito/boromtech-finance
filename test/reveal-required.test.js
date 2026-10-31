import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { actualDetailPage, actualFormPage, capitalPage, incomePage, plannedPage, itemFormPage } from '../lib/manage-pages.js';
import { createMemoryStore } from '../lib/memory-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, signIn, withServer } from './helpers.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));
const session = { lang: 'en', email: 'investor@example.com', name: 'Example Investor', path: '/actual/new' };
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function parseAttrs(tag) {
  const attrs = {};
  const body = tag.replace(/^<\/?[A-Za-z][\w:-]*/, '').replace(/\/?>$/, '');
  const re = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = re.exec(body))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function parseHtml(html) {
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<\/?([A-Za-z][\w:-]*)[^>]*>/g;
  let match;
  while ((match = re.exec(source))) {
    const tag = match[0];
    const name = match[1].toLowerCase();
    if (tag.startsWith('</')) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = { name, attrs: parseAttrs(tag), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(name) && !tag.endsWith('/>')) stack.push(node);
  }
  return root;
}

function classSet(node) {
  return new Set(String(node.attrs?.class || '').split(/\s+/).filter(Boolean));
}

function walk(node, fn) {
  for (const child of node.children || []) {
    if (child.name === 'fieldset') continue;
    fn(child);
    walk(child, fn);
  }
}

function fieldsetFlags(fieldset) {
  let triggerOn = false;
  let hideOn = false;
  walk(fieldset, (el) => {
    if (el.name !== 'input') return;
    const classes = classSet(el);
    const checked = Object.hasOwn(el.attrs, 'checked');
    if (classes.has('reveal-trigger') && checked) triggerOn = true;
    if (classes.has('reveal-hide') && checked) hideOn = true;
  });
  return { triggerOn, hideOn };
}

// Names of required controls that sit in a .reveal / .reveal-off container
// which the same CSS rules would hide for this HTML.
export function hiddenRequiredControls(html) {
  const found = [];
  function scan(node, ctx) {
    let next = ctx;
    if (node.name === 'fieldset') {
      const flags = fieldsetFlags(node);
      next = { triggerOn: flags.triggerOn, hideOn: flags.hideOn, hidden: ctx.hidden };
    }
    const classes = classSet(node);
    let hidden = ctx.hidden;
    if (classes.has('reveal-off')) hidden = hidden || next.hideOn;
    else if (classes.has('reveal')) hidden = hidden || !next.triggerOn;
    const control = node.name === 'input' || node.name === 'select' || node.name === 'textarea';
    if (hidden && control && Object.hasOwn(node.attrs, 'required')) {
      found.push(node.attrs.name || node.name);
    }
    const childCtx = { triggerOn: next.triggerOn, hideOn: next.hideOn, hidden };
    for (const child of node.children || []) scan(child, childCtx);
  }
  scan(parseHtml(html), { triggerOn: false, hideOn: false, hidden: false });
  return found;
}

function inputTag(html, name) {
  const tag = html.match(new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`));
  assert.ok(tag, `missing input ${name}`);
  return tag[0];
}

function assertNotStaticallyRequired(html, name) {
  const tag = inputTag(html, name);
  assert.equal(/\srequired(?:[\s=\/]|>)/.test(tag), false, `${name} must not ship with a required attribute`);
  assert.equal(/\sdisabled(?:[\s=\/]|>)/.test(tag), false, `${name} must stay enabled in the HTML so a revealed value still posts with JavaScript off`);
  assert.match(tag, /data-reveal-required(?:=""|\s|>|\/)/, `${name} should be required once its section is shown`);
  assert.match(html, new RegExp(`for="f-${name}"><span>[^<]*<abbr class="req"`));
}

const CONDITIONAL = ['periodFrom', 'periodTo', 'foreignCurrency', 'foreignAmount', 'foreignRate'];

test('the scanner flags required controls inside a hidden reveal section', () => {
  const hidden = `<fieldset>
    <input type="checkbox" name="periodNone" class="reveal-hide" checked>
    <div class="grid reveal-off"><input name="periodFrom" type="date" required></div>
  </fieldset>
  <fieldset>
    <input type="radio" name="vatMode" value="excluded" checked>
    <input type="radio" name="vatMode" value="foreign" class="reveal-trigger">
    <div class="grid reveal"><input name="foreignRate" required></div>
  </fieldset>`;
  assert.deepEqual(hiddenRequiredControls(hidden).sort(), ['foreignRate', 'periodFrom']);

  const open = `<fieldset>
    <input type="radio" name="vatMode" value="foreign" class="reveal-trigger" checked>
    <div class="grid reveal"><input name="foreignRate" required></div>
  </fieldset>
  <fieldset>
    <input type="checkbox" name="periodNone" class="reveal-hide">
    <div class="grid reveal-off"><input name="periodFrom" type="date" required></div>
  </fieldset>`;
  assert.deepEqual(hiddenRequiredControls(open), []);
});

test('expense forms do not put required on fields hidden by .reveal or .reveal-off', () => {
  const pages = [
    actualFormPage({ session, csrf: 'token' }),
    actualFormPage({
      session,
      csrf: 'token',
      values: { vatMode: 'foreign', periodNone: false, foreignCurrency: 'USD', foreignAmount: '12.50', foreignRate: '33.50' },
    }),
    actualDetailPage({
      session,
      csrf: 'token',
      expense: {
        id: '00000000-0000-4000-8000-000000000001',
        documentNo: 'EXP-0001',
        itemName: 'Synthetic office supply',
        amount: '10.00',
        spentOn: '2026-04-15',
        vendor: 'Example Vendor',
        payer: 'Example Payer',
        files: [],
        periodNone: true,
        vatMode: 'excluded',
      },
    }),
  ];
  for (const html of pages) {
    assert.deepEqual(hiddenRequiredControls(html), [], html.slice(html.indexOf('<form'), html.indexOf('<form') + 80));
    for (const name of CONDITIONAL) assertNotStaticallyRequired(html, name);
    assert.match(html, /<script src="\/app-assets\/manage\.js" defer><\/script>/);
    const optional = inputTag(html, 'categoryOther');
    assert.equal(/\srequired(?:[\s=\/]|>)/.test(optional), false);
    assert.equal(optional.includes('data-reveal-required'), false);
    assert.match(html, /for="f-categoryOther"[\s\S]*?\(optional\)/);
  }
});

test('capital, income, forecast, and office pages have no hidden required reveal fields', async () => {
  const app = createApp({
    env: baseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-should-not-leak',
    }),
    oidc: createFakeOidc(),
    store: createMemoryStore(example),
  });
  await withServer(app, async (base) => {
    const result = await signIn(base, 'allowed');
    const paths = ['/actual/new', '/capital', '/income', '/forecast', '/forecast/items/new', '/office', '/office/expenses'];
    for (const pathname of paths) {
      const response = await fetch(`${base}${pathname}`, { headers: { cookie: result.jar } });
      const html = await response.text();
      assert.deepEqual(hiddenRequiredControls(html), [], pathname);
    }
    const fresh = await (await fetch(`${base}/actual/new`, { headers: { cookie: result.jar } })).text();
    for (const name of CONDITIONAL) assertNotStaticallyRequired(fresh, name);
    assert.equal(fresh.includes('name="periodNone"'), true);
    assert.match(fresh, /name="periodNone"[^>]*\bchecked\b/);
    const script = await fetch(`${base}/app-assets/manage.js`, { headers: { cookie: result.jar } });
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    const source = await script.text();
    assert.equal(source.toLowerCase().includes('supabase'), false);
  });
});

test('rendered capital, income, and forecast markup has no reveal containers', () => {
  const forecast = example;
  const pages = [
    capitalPage({ session, forecast, csrf: 'token' }),
    incomePage({ session, forecast, csrf: 'token' }),
    plannedPage({ session, forecast, csrf: 'token' }),
    itemFormPage({ session, forecast, csrf: 'token', item: { id: '00000000-0000-4000-8000-000000000001', monthId: '00000000-0000-4000-8000-000000000002', group: 'tools', groupName: 'Tools', name: 'One row', amount: '1.00', assumed: false, note: '' } }),
  ];
  for (const html of pages) {
    assert.equal(html.includes('class="reveal"') || html.includes('reveal-off'), false);
    assert.deepEqual(hiddenRequiredControls(html), []);
    assert.equal(html.includes('/app-assets/manage.js'), false);
  }
});

test('the add-planned-expense end month is required only while a repeat is picked', () => {
  const html = itemFormPage({ session, forecast: example, csrf: 'token' });
  assert.match(html, /<label class="field month-field reveal-off" for="f-endKey"/);
  assert.deepEqual(hiddenRequiredControls(html), []);
  assert.match(html, /<script src="\/app-assets\/manage\.js" defer><\/script>/);
  const end = html.match(/<input\b[^>]*\bname="endKey"[^>]*>/);
  assert.ok(end);
  assert.equal(/\srequired(?:[\s=\/]|>)/.test(end[0]), false);
  assert.match(end[0], /data-reveal-required/);
  const tags = [...html.matchAll(/<input\b[^>]*\bname="frequency"[^>]*>/g)].map((match) => match[0]);
  assert.equal(tags.length, 4);
  for (const tag of tags) assert.equal(/\srequired(?:[\s=\/]|>)/.test(tag), false);
  const open = itemFormPage({
    session,
    forecast: example,
    csrf: 'token',
    values: { frequency: 'quarterly', monthKey: '2026-01', endKey: '', value: '10.00', currency: 'THB', name: 'Row' },
  });
  assert.match(open, /name="frequency" value="quarterly" checked/);
  assert.deepEqual(hiddenRequiredControls(open), []);
});
