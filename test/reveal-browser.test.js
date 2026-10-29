import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMemoryStore } from '../lib/memory-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, signIn, withServer } from './helpers.js';
import fs from 'node:fs';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));
const PDF = '%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

function chromeBin() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      accessSync(bin, constants.X_OK);
      return bin;
    } catch {
      // try the next install path
    }
  }
  return '';
}

const chromePath = chromeBin();

function cdp(ws) {
  let next = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}`));
      else resolve(msg.result || {});
      return;
    }
    if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params || {});
    }
  });
  return {
    send(method, params = {}) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
    off(method, fn) {
      const list = listeners.get(method) || [];
      const index = list.indexOf(fn);
      if (index !== -1) list.splice(index, 1);
    },
  };
}

function waitFor(client, method, ms, predicate = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(method, handler);
      reject(new Error(`timed out waiting for ${method}`));
    }, ms);
    function handler(params) {
      if (predicate && !predicate(params)) return;
      clearTimeout(timer);
      client.off(method, handler);
      resolve(params);
    }
    client.on(method, handler);
  });
}

async function launchChrome(dir) {
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--disable-extensions',
    '--remote-allow-origins=*',
    `--user-data-dir=${dir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });
  const portFile = path.join(dir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  let port = '';
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) break;
    try {
      port = (await fs.promises.readFile(portFile, 'utf8')).split('\n')[0].trim();
      if (port) break;
    } catch {
      // Chrome creates the file once the port is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!port) {
    chrome.kill('SIGKILL');
    throw new Error(`Chrome did not open a debugging port\n${stderr}`);
  }
  return { chrome, port, stderr: () => stderr };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(details.exception?.description || details.text || 'page script failed');
  }
  return result.result?.value;
}

test('headless Chrome can save /actual/new for baht and foreign expenses', {
  skip: chromePath ? false : 'Chrome is not installed',
  timeout: 90_000,
}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bt-chrome-'));
  const pdfPath = path.join(dir, 'receipt.pdf');
  await writeFile(pdfPath, PDF);
  const app = createApp({
    env: baseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-should-not-leak',
    }),
    oidc: createFakeOidc(),
    store: createMemoryStore(example),
  });
  let chrome;
  let ws;
  let failure;
  try {
    await withServer(app, async (base) => {
      const signed = await signIn(base, 'allowed');
      const launched = await launchChrome(dir);
      chrome = launched.chrome;
      const list = await (await fetch(`http://127.0.0.1:${launched.port}/json/list`)).json();
      const page = list.find((item) => item.type === 'page');
      assert.ok(page?.webSocketDebuggerUrl, 'Chrome did not expose a page target');
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await once(ws, 'open');
      const client = cdp(ws);
      const logs = [];
      client.on('Log.entryAdded', (params) => logs.push(params.entry?.text || ''));
      client.on('Runtime.consoleAPICalled', (params) => {
        logs.push((params.args || []).map((arg) => arg.value || arg.description || '').join(' '));
      });
      await client.send('Page.enable');
      await client.send('Runtime.enable');
      await client.send('Log.enable');
      await client.send('Network.enable');
      await client.send('DOM.enable');
      for (const part of signed.jar.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        await client.send('Network.setCookie', {
          name: part.slice(0, idx).trim(),
          value: part.slice(idx + 1).trim(),
          url: base,
          path: '/',
        });
      }

      async function goto(pathname) {
        const loaded = waitFor(client, 'Page.loadEventFired', 15000);
        await client.send('Page.navigate', { url: `${base}${pathname}` });
        await loaded;
      }

      async function pageFacts() {
        return evaluate(client, `(() => {
          const form = document.querySelector('form[action="/actual"]');
          const read = (name) => {
            const el = form && form.querySelector('[name="' + name + '"]');
            return el ? { required: el.required, disabled: el.disabled, valueMissing: el.validity.valueMissing } : null;
          };
          return {
            path: location.pathname,
            search: location.search,
            title: document.title,
            text: document.body ? document.body.innerText.slice(0, 500) : '',
            periodFrom: read('periodFrom'),
            periodTo: read('periodTo'),
            foreignCurrency: read('foreignCurrency'),
            foreignAmount: read('foreignAmount'),
            foreignRate: read('foreignRate'),
          };
        })()`);
      }

      async function fill(fields) {
        await evaluate(client, `(() => {
          const fields = ${JSON.stringify(fields)};
          const form = document.querySelector('form[action="/actual"]');
          if (!form) throw new Error('expense form missing at ' + location.pathname);
          for (const [name, value] of Object.entries(fields)) {
            const nodes = [...form.querySelectorAll('[name="' + name + '"]')];
            if (!nodes.length) throw new Error('missing ' + name);
            if (nodes[0].type === 'radio') {
              const picked = nodes.find((item) => item.value === value);
              if (!picked) throw new Error('missing ' + name + '=' + value);
              picked.checked = true;
              picked.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (nodes[0].type === 'checkbox') {
              nodes[0].checked = Boolean(value);
              nodes[0].dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              nodes[0].focus();
              nodes[0].value = value;
              nodes[0].dispatchEvent(new Event('input', { bubbles: true }));
              nodes[0].dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        })()`);
      }

      async function attachReceipt() {
        const { root } = await client.send('DOM.getDocument', { depth: -1 });
        const { nodeId } = await client.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: 'form[action="/actual"] input[name="receiptFile"]',
        });
        assert.ok(nodeId, 'receipt file input missing');
        await client.send('DOM.setFileInputFiles', { nodeId, files: [pdfPath] });
      }

      async function save() {
        const before = logs.length;
        await evaluate(client, `document.querySelector('form[action="/actual"] button[type="submit"]').click()`);
        const deadline = Date.now() + 10000;
        let facts = null;
        let lastError = '';
        while (Date.now() < deadline) {
          try {
            facts = await pageFacts();
            if (/^\/actual\/[0-9a-f-]{36}$/.test(facts.path)) break;
          } catch (error) {
            lastError = error.message;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const consoleText = logs.slice(before).join('\n');
        assert.equal(/not focusable/i.test(consoleText), false, consoleText);
        if (!facts || !/^\/actual\/[0-9a-f-]{36}$/.test(facts.path)) {
          throw new Error(`submit did not open the saved expense (${facts?.path})\n${facts?.text || ''}\n${lastError}\n${consoleText}`);
        }
        return facts;
      }

      const common = {
        spentOn: '2026-04-15',
        amount: '100.00',
        itemName: 'Synthetic office supply',
        vendor: 'Example Vendor',
        category: 'software',
        payer: 'Example Payer',
        payCash: true,
        receiptName: 'company',
        transferRights: 'no',
      };

      await goto('/actual/new');
      let facts = await pageFacts();
      assert.equal(facts.path, '/actual/new', facts.text);
      for (const name of ['periodFrom', 'periodTo', 'foreignCurrency', 'foreignAmount', 'foreignRate']) {
        assert.equal(facts[name].required, false, name);
        assert.equal(facts[name].disabled, true, name);
      }

      // Visible service dates are still required. An empty pair must not submit.
      await fill({ ...common, receiptNo: 'INV-SYN-BLOCK', vatMode: 'excluded', periodNone: false });
      facts = await pageFacts();
      assert.equal(facts.periodFrom.required, true);
      assert.equal(facts.periodFrom.disabled, false);
      assert.equal(facts.foreignRate.required, false);
      assert.equal(facts.foreignRate.disabled, true);
      await evaluate(client, `document.querySelector('form[action="/actual"] button[type="submit"]').click()`);
      await new Promise((resolve) => setTimeout(resolve, 400));
      facts = await pageFacts();
      assert.equal(facts.path, '/actual/new');
      assert.equal(facts.periodFrom.valueMissing, true);
      assert.equal(logs.some((line) => /not focusable/i.test(line)), false, logs.join('\n'));

      await attachReceipt();
      await fill({
        periodFrom: '2026-10-23',
        periodTo: '2026-11-23',
        receiptNo: 'INV-SYN-PERIOD',
      });
      facts = await save();
      assert.match(facts.path, /^\/actual\/[0-9a-f-]{36}$/);
      assert.match(facts.search, /saved=1/);
      assert.match(facts.text, /Saved/);
      assert.equal(await evaluate(client, `document.querySelector('[name="periodFrom"]').value`), '2026-10-23');
      assert.equal(await evaluate(client, `document.querySelector('[name="periodTo"]').value`), '2026-11-23');

      // Default "No service period" plus THB must submit. These fields are hidden.
      await goto('/actual/new');
      await fill({
        ...common,
        receiptNo: 'INV-SYN-NONE',
        vatMode: 'excluded',
        periodNone: true,
      });
      facts = await pageFacts();
      assert.equal(facts.periodFrom.disabled, true);
      assert.equal(facts.foreignCurrency.disabled, true);
      await attachReceipt();
      facts = await save();
      assert.match(facts.path, /^\/actual\/[0-9a-f-]{36}$/);
      assert.match(facts.text, /Saved/);

      // Foreign USD is required only once that section is open, and then it saves.
      await goto('/actual/new');
      await fill({
        ...common,
        receiptNo: 'INV-SYN-FX',
        vatMode: 'foreign',
        periodNone: true,
      });
      facts = await pageFacts();
      assert.equal(facts.foreignCurrency.required, true);
      assert.equal(facts.foreignAmount.required, true);
      assert.equal(facts.foreignRate.required, true);
      assert.equal(facts.foreignRate.disabled, false);
      assert.equal(facts.periodFrom.disabled, true);
      await evaluate(client, `document.querySelector('form[action="/actual"] button[type="submit"]').click()`);
      await new Promise((resolve) => setTimeout(resolve, 400));
      facts = await pageFacts();
      assert.equal(facts.path, '/actual/new');
      assert.equal(facts.foreignCurrency.valueMissing, true);
      assert.equal(logs.some((line) => /not focusable/i.test(line)), false, logs.join('\n'));

      await fill({
        foreignCurrency: 'USD',
        foreignAmount: '12.50',
        foreignRate: '33.50',
      });
      await attachReceipt();
      facts = await save();
      assert.match(facts.path, /^\/actual\/[0-9a-f-]{36}$/);
      assert.match(facts.text, /Saved/);
      assert.equal(await evaluate(client, `document.querySelector('[name="foreignCurrency"]').value`), 'USD');
      assert.equal(await evaluate(client, `document.querySelector('[name="foreignAmount"]').value`), '12.50');
      assert.equal(await evaluate(client, `document.querySelector('[name="foreignRate"]').value`), '33.50');
    });
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    } catch {
      // The socket may already be closed.
    }
    if (chrome && chrome.exitCode === null) {
      try {
        process.kill(-chrome.pid, 'SIGKILL');
      } catch {
        chrome.kill('SIGKILL');
      }
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
  if (failure) throw failure;
});
