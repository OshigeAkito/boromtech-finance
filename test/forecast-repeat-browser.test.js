import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import fs from 'node:fs';
import { createMemoryStore } from '../lib/memory-store.js';
import { createApp } from '../server.js';
import { baseEnv, createFakeOidc, signIn, withServer } from './helpers.js';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'forecast.example.json'), 'utf8'));

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

function waitFor(client, method, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(method, handler);
      reject(new Error(`timed out waiting for ${method}`));
    }, ms);
    function handler(params) {
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
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
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
  return { chrome, port };
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

test('a hidden end month does not block saving a one-off planned expense', {
  skip: chromePath ? false : 'Chrome is not installed',
  timeout: 60_000,
}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bt-forecast-'));
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
      client.on('Runtime.consoleAPICalled', (params) => {
        logs.push((params.args || []).map((arg) => arg.value || arg.description || '').join(' '));
      });
      await client.send('Page.enable');
      await client.send('Runtime.enable');
      await client.send('Network.enable');
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
      const loaded = waitFor(client, 'Page.loadEventFired', 15000);
      await client.send('Page.navigate', { url: `${base}/forecast/items/new` });
      await loaded;
      const before = await evaluate(client, `(() => {
        const form = document.querySelector('form[action="/forecast/items"]');
        const end = form && form.querySelector('[name="endKey"]');
        const once = form && form.querySelector('[name="frequency"][value="once"]');
        return {
          path: location.pathname,
          hasForm: Boolean(form),
          onceChecked: once ? once.checked : null,
          endRequired: end ? end.required : null,
          endDisabled: end ? end.disabled : null,
        };
      })()`);
      assert.equal(before.path, '/forecast/items/new');
      assert.equal(before.hasForm, true);
      assert.equal(before.onceChecked, true);
      assert.equal(before.endRequired, false);
      assert.equal(before.endDisabled, true);
      await evaluate(client, `(() => {
        const form = document.querySelector('form[action="/forecast/items"]');
        const fields = {
          monthKey: '2026-06',
          value: '15.50',
          name: 'Synthetic planned row',
        };
        for (const [name, value] of Object.entries(fields)) {
          const input = form.querySelector('[name="' + name + '"]');
          if (!input) throw new Error('missing ' + name);
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      try {
        await evaluate(client, `document.querySelector('form[action="/forecast/items"] button[type="submit"]').click()`);
      } catch {
        // The click navigates away, which can end the page script.
      }
      const deadline = Date.now() + 10000;
      let landed = null;
      while (Date.now() < deadline) {
        try {
          landed = await evaluate(client, `({ path: location.pathname, search: location.search, text: document.body.innerText.slice(0, 2500) })`);
          if (landed.path === '/forecast' && /saved=1/.test(landed.search)) break;
        } catch {
          // The page can be mid-navigation.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(/not focusable/i.test(logs.join('\n')), false, logs.join('\n'));
      assert.equal(landed.path, '/forecast', landed.text);
      assert.match(landed.search, /saved=1/);
      assert.match(landed.text, /June 2026/);
      assert.match(landed.text, /4 months/);
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
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  if (failure) throw failure;
});
