import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createSupabaseStore, normalizeSupabaseUrl } from '../lib/supabase-store.js';

const origin = 'https://example.supabase.co';
const key = 'service-role-key-for-tests-only';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body == null ? '' : JSON.stringify(body);
    },
    async arrayBuffer() {
      return Buffer.from(body || '');
    },
  };
}

test('supabase urls must be https origins', () => {
  assert.equal(normalizeSupabaseUrl('https://example.supabase.co/'), 'https://example.supabase.co');
  assert.equal(normalizeSupabaseUrl('http://example.supabase.co'), null);
  assert.equal(normalizeSupabaseUrl('https://user:secret@example.supabase.co'), null);
  assert.equal(normalizeSupabaseUrl('https://example.supabase.co/rest/v1'), null);
  assert.equal(createSupabaseStore({}).configured, false);
});

test('reads use text amounts and receipt downloads use a short-lived signed url', async () => {
  const calls = [];
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/rest/v1/rpc/load_forecast')) {
      return jsonResponse({
        company: 'บริษัท ตัวอย่าง จำกัด',
        currency: 'THB',
        registeredCapital: '1000.00',
        openingCapital: {
          amount: '100.00',
          sharePercent: '40.00',
          assumed: false,
          label: '',
          timing: '',
        },
        fx: {
          base: 'USD',
          quote: 'THB',
          rate: '33.78705000',
          source: 'แหล่งตัวอย่าง',
          updatedAt: '2026-01-01',
          updatedDisplay: '1 มกราคม 2026',
        },
        balanceFormula: 'สูตรตัวอย่าง',
        months: [],
        assumptions: [],
        notYetIncluded: [],
      });
    }
    if (url.includes('/rest/v1/rpc/create_actual_expense')) {
      return jsonResponse({ id: '11111111-1111-4111-8111-111111111111', documentNo: 'EXP-0001' });
    }
    if (url.includes('/storage/v1/object/receipts/11111111-1111-4111-8111-111111111111/')) {
      return jsonResponse({ Key: 'ok' });
    }
    if (url.includes('/rest/v1/actual_expense_files?')) {
      return jsonResponse([{
        storage_path: '22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333',
        content_type: 'image/png',
        original_name: 'ใบเสร็จ.png',
      }]);
    }
    if (url.includes('/rest/v1/actual_expense_files')) {
      return jsonResponse(null, 201);
    }
    if (url === `${origin}/storage/v1/object/sign/receipts/path?token=short-lived`) {
      assert.equal(options.headers?.authorization, undefined);
      assert.equal(options.headers?.apikey, undefined);
      return {
        ok: true,
        status: 200,
        async text() { return ''; },
        async arrayBuffer() { return png; },
      };
    }
    if (url.includes('/storage/v1/object/sign/') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      assert.equal(body.expiresIn, 120);
      return jsonResponse({ signedURL: '/object/sign/receipts/path?token=short-lived' });
    }
    if (url.includes('evil.example')) {
      throw new Error('should not fetch an outside signed url');
    }
    throw new Error(`unexpected ${url}`);
  };
  const store = createSupabaseStore({ url: origin, serviceRoleKey: key, fetch: fetchImpl });
  const forecast = await store.loadForecast();
  assert.equal(forecast.fx.rate, '33.78705');
  assert.equal(forecast.registeredCapital, '1000.00');
  assert.equal(forecast.openingCapital.shareText, '40.00');

  const created = await store.createActual({
    spentOn: '2026-04-01',
    itemName: 'รายการตัวอย่าง',
    category: 'หมวดตัวอย่าง',
    amount: '10.00',
    payer: 'ผู้จ่ายตัวอย่าง',
    paymentMethod: 'เงินสด',
    note: '',
    createdBy: 'investor@example.com',
  }, [{ filename: 'a.png', contentType: 'image/png', bytes: png }]);
  assert.equal(created.documentNo, 'EXP-0001');
  const upload = calls.find((call) => call.url.includes('/storage/v1/object/receipts/'));
  assert.match(upload.url, /\/receipts\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i);
  assert.equal(upload.options.headers.authorization, `Bearer ${key}`);

  const file = await store.readReceipt(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  );
  assert.equal(file.contentType, 'image/png');
  assert.equal(Buffer.compare(file.bytes, png), 0);

  const evilFetch = async (url, options = {}) => {
    if (url.includes('/storage/v1/object/sign/')) {
      return jsonResponse({ signedURL: 'https://evil.example/steal' });
    }
    if (String(url).includes('evil.example')) throw new Error('fetched outside host');
    return jsonResponse([{
      storage_path: '22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333',
      content_type: 'image/png',
      original_name: 'a.png',
    }]);
  };
  const evilStore = createSupabaseStore({ url: origin, serviceRoleKey: key, fetch: evilFetch });
  await assert.rejects(
    () => evilStore.readReceipt('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
    (error) => error.code === 'STORE',
  );
});

test('repeating expenses use one rpc, and actual totals read past the first 500', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes('/rpc/create_planned_series')) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.payload.months.map((month) => month.key), ['2026-02', '2026-05', '2026-08']);
      assert.equal(body.payload.item.amount, '10.00');
      return jsonResponse(null);
    }
    if (String(url).includes('/rest/v1/actual_expenses')) {
      const offset = Number(new URL(url).searchParams.get('offset') || '0');
      const row = (index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        document_no: `EXP-${String(index).padStart(4, '0')}`,
        spent_on: '2026-01-15',
        item_name: 'Synthetic row',
        amount_text: '1.00',
        actual_expense_files: [],
      });
      if (offset === 0) return jsonResponse(Array.from({ length: 500 }, (_, index) => row(index)));
      if (offset === 500) return jsonResponse([row(500)]);
      return jsonResponse([]);
    }
    throw new Error(`unexpected ${url}`);
  };
  const store = createSupabaseStore({ url: origin, serviceRoleKey: key, fetch: fetchImpl });
  await store.createPlannedSeries({
    monthKeys: ['2026-02', '2026-05', '2026-08'],
    group: 'tools',
    groupName: 'Tools',
    name: 'Synthetic quarterly row',
    amount: '10.00',
    usd: null,
    assumed: false,
    note: '',
  });
  assert.equal(calls.filter((url) => url.includes('/rpc/create_planned_series')).length, 1);
  const expenses = await store.listActual();
  assert.equal(expenses.length, 501);
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  assert.equal(total, 501);
  const sql = fs.readFileSync(path.join(import.meta.dirname, '..', 'supabase', 'migrations', '20261029120000_create_planned_series.sql'), 'utf8');
  assert.match(sql, /create or replace function public\.create_planned_series\(payload jsonb\)/);
  assert.match(sql, /grant execute on function public\.create_planned_series\(jsonb\) to service_role/);
  assert.equal(/create table/i.test(sql), false);
});
