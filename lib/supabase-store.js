import crypto from 'node:crypto';
import { monthKeyLabels, orderForecastMonths } from './dates.js';
import { canonicalMoney, canonicalRate, canonicalShare } from './forecast.js';
import { MAX_FILE_BYTES } from './files.js';
import { isUuid } from './ids.js';

const BUCKET = 'receipts';
const SIGN_SECONDS = 120;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function normalizeSupabaseUrl(value) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
  return parsed.origin;
}

function presentAmount(value) {
  const canonical = canonicalMoney(String(value ?? '').trim());
  if (!canonical) throw fail('STORE');
  return canonical;
}

export function presentForecast(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const shareText = canonicalShare(String(raw.openingCapital?.sharePercent ?? '').trim());
  // A missing global rate must not take the dashboard down. The site no longer
  // displays that rate; per-expense rates are separate.
  const rawFx = raw.fx && typeof raw.fx === 'object' ? raw.fx : {};
  const rate = canonicalRate(String(rawFx.rate ?? '').trim()) || '';
  if (!shareText) throw fail('STORE');
  return {
    company: raw.company,
    currency: raw.currency,
    registeredCapital: presentAmount(raw.registeredCapital),
    openingCapital: {
      amount: presentAmount(raw.openingCapital.amount),
      sharePercent: Number(shareText),
      shareText,
      assumed: raw.openingCapital.assumed === true,
      label: raw.openingCapital.label || '',
      timing: raw.openingCapital.timing || '',
    },
    fx: {
      base: rawFx.base || '',
      quote: rawFx.quote || '',
      rate,
      source: rawFx.source || '',
      updatedAt: rawFx.updatedAt || '',
      updatedDisplay: rawFx.updatedDisplay || '',
    },
    balanceFormula: raw.balanceFormula,
    months: orderForecastMonths((Array.isArray(raw.months) ? raw.months : []).map((month) => ({
      id: String(month.id),
      key: month.key,
      label: month.label,
      labelFull: month.labelFull,
      revenue: presentAmount(month.revenue),
      items: (Array.isArray(month.items) ? month.items : []).map((item) => ({
        id: String(item.id),
        group: item.group || '',
        groupName: item.groupName || '',
        name: item.name || '',
        amount: presentAmount(item.amount),
        usd: item.usd == null || item.usd === '' ? null : presentAmount(item.usd),
        assumed: item.assumed === true,
        note: item.note || '',
      })),
    }))),
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions : [],
    notYetIncluded: Array.isArray(raw.notYetIncluded) ? raw.notYetIncluded : [],
    documentPrefix: /^[A-Z]{2,6}$/.test(raw.documentPrefix) ? raw.documentPrefix : 'EXP',
  };
}

const ACTUAL_COLUMNS = [
  'id', 'document_no', 'spent_on', 'item_name', 'category', 'category_other', 'vendor',
  'period_none', 'period_text', 'period_from', 'period_to', 'amount_text', 'vat_mode',
  'foreign_currency', 'foreign_amount_text', 'foreign_rate_text', 'payer', 'payment_methods',
  'payment_other', 'receipt_no', 'receipt_name', 'receipt_name_other', 'transfer_rights',
  'transfer_asset', 'note',
  'actual_expense_files(id,original_name,content_type,byte_size,evidence_kind,created_at)',
].join(',');

function expensePayload(input) {
  return {
    spentOn: input.spentOn,
    itemName: input.itemName,
    category: input.category,
    categoryOther: input.categoryOther || '',
    vendor: input.vendor,
    periodNone: input.periodNone === true,
    periodText: input.periodText || '',
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    amount: input.amount,
    vatMode: input.vatMode,
    foreignCurrency: input.foreignCurrency || '',
    foreignAmount: input.foreignAmount,
    foreignRate: input.foreignRate,
    payer: input.payer,
    paymentMethods: input.paymentMethods,
    paymentOther: input.paymentOther || '',
    receiptNo: input.receiptNo,
    receiptName: input.receiptName,
    receiptNameOther: input.receiptNameOther || '',
    transferRights: input.transferRights === true,
    transferAsset: input.transferAsset || '',
    note: input.note || '',
  };
}

function expenseColumns(input) {
  return {
    spent_on: input.spentOn,
    item_name: input.itemName,
    category: input.category,
    category_other: input.categoryOther || '',
    vendor: input.vendor,
    period_none: input.periodNone === true,
    period_text: input.periodText || '',
    period_from: input.periodFrom,
    period_to: input.periodTo,
    amount: input.amount,
    vat_mode: input.vatMode,
    foreign_currency: input.foreignCurrency || '',
    foreign_amount: input.foreignAmount,
    foreign_rate: input.foreignRate,
    payer: input.payer,
    payment_methods: input.paymentMethods,
    payment_other: input.paymentOther || '',
    receipt_no: input.receiptNo,
    receipt_name: input.receiptName,
    receipt_name_other: input.receiptNameOther || '',
    transfer_rights: input.transferRights === true,
    transfer_asset: input.transferAsset || '',
    note: input.note || '',
  };
}

function mapActual(row) {
  const files = Array.isArray(row.actual_expense_files) ? row.actual_expense_files : [];
  return {
    id: row.id,
    documentNo: row.document_no,
    spentOn: row.spent_on,
    itemName: row.item_name,
    category: row.category,
    categoryOther: row.category_other || '',
    vendor: row.vendor,
    periodNone: row.period_none === true,
    periodText: row.period_text || '',
    periodFrom: row.period_from,
    periodTo: row.period_to,
    amount: presentAmount(row.amount_text),
    vatMode: row.vat_mode,
    foreignCurrency: row.foreign_currency || '',
    foreignAmount: row.foreign_amount_text ? presentAmount(row.foreign_amount_text) : null,
    foreignRate: row.foreign_rate_text ? canonicalRate(String(row.foreign_rate_text).trim()) : null,
    payer: row.payer,
    paymentMethods: Array.isArray(row.payment_methods) ? row.payment_methods : [],
    paymentOther: row.payment_other || '',
    receiptNo: row.receipt_no,
    receiptName: row.receipt_name,
    receiptNameOther: row.receipt_name_other || '',
    transferRights: row.transfer_rights === true,
    transferAsset: row.transfer_asset || '',
    note: row.note || '',
    files: files
      .map((file) => ({
        id: file.id,
        filename: file.original_name,
        contentType: file.content_type,
        byteSize: file.byte_size,
        kind: file.evidence_kind,
        createdAt: file.created_at || '',
      }))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
      .map(({ createdAt, ...file }) => file),
  };
}

function requireUuid(value) {
  if (!isUuid(value)) throw fail('NOT_FOUND');
  return value;
}

export function createSupabaseStore({ url, serviceRoleKey, fetch: fetchImpl = globalThis.fetch } = {}) {
  const origin = normalizeSupabaseUrl(url);
  const key = typeof serviceRoleKey === 'string' ? serviceRoleKey.trim() : '';
  if (!origin || key.length < 20) return { configured: false };

  async function request(path, { method = 'GET', body, headers = {}, json = true } = {}) {
    const response = await fetchImpl(`${origin}${path}`, {
      method,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: 'application/json',
        ...headers,
        ...(body === undefined || !json ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : (json ? JSON.stringify(body) : body),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const text = json ? await response.text() : '';
    if (!response.ok) {
      throw fail(response.status === 409 ? 'CONFLICT' : 'STORE');
    }
    if (!json) return response;
    if (!text) return null;
    return JSON.parse(text);
  }

  async function rpc(name, payload) {
    return request(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: { payload },
    });
  }

  async function nextSort(table, filter) {
    const query = filter ? `${filter}&` : '';
    const rows = await request(`/rest/v1/${table}?${query}select=sort_order&order=sort_order.desc&limit=1`);
    const current = Array.isArray(rows) && rows[0] ? Number(rows[0].sort_order) : 0;
    return Number.isInteger(current) ? current + 1 : 1;
  }

  async function uploadObject(storagePath, file) {
    const response = await fetchImpl(`${origin}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': file.contentType,
        'cache-control': 'no-store',
      },
      body: file.bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw fail('STORE');
  }

  async function removeObjects(paths) {
    if (!paths.length) return;
    await request(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: paths });
  }

  async function signedReadUrl(storagePath) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(storagePath)) throw fail('STORE');
    const signed = await request(`/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
      method: 'POST',
      body: { expiresIn: SIGN_SECONDS },
    });
    const tokenPath = signed && (signed.signedURL || signed.signedUrl);
    if (typeof tokenPath !== 'string') throw fail('STORE');
    const target = tokenPath.startsWith('/')
      ? new URL(`/storage/v1${tokenPath}`, origin)
      : new URL(tokenPath);
    if (target.origin !== origin || !target.pathname.startsWith('/storage/v1/object/sign/')) throw fail('STORE');
    return target.href;
  }

  return {
    configured: true,
    async loadForecast() {
      const raw = await request('/rest/v1/rpc/load_forecast', { method: 'POST', body: {} });
      return presentForecast(raw);
    },
    async saveSettings(payload) {
      await rpc('save_settings', payload);
    },
    async replaceForecast(payload) {
      await rpc('replace_forecast', payload);
    },
    async createMonth(input) {
      const sortOrder = await nextSort('months', '');
      const rows = await request('/rest/v1/months', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: {
          key: input.key,
          label: input.label,
          label_full: input.labelFull,
          revenue: input.revenue,
          sort_order: sortOrder,
        },
      });
      return { id: rows[0].id };
    },
    async updateMonth(id, input) {
      const rows = await request(`/rest/v1/months?id=eq.${requireUuid(id)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: {
          key: input.key,
          label: input.label,
          label_full: input.labelFull,
          revenue: input.revenue,
        },
      });
      if (!Array.isArray(rows) || rows.length === 0) throw fail('NOT_FOUND');
    },
    async deleteMonth(id) {
      const rows = await request(`/rest/v1/months?id=eq.${requireUuid(id)}`, {
        method: 'DELETE',
        headers: { prefer: 'return=representation' },
      });
      if (!Array.isArray(rows) || rows.length === 0) throw fail('NOT_FOUND');
    },
    async createItem(input) {
      requireUuid(input.monthId);
      const months = await request(`/rest/v1/months?id=eq.${input.monthId}&select=id`);
      if (!Array.isArray(months) || months.length === 0) throw fail('NOT_FOUND');
      const sortOrder = await nextSort('forecast_items', `month_id=eq.${input.monthId}`);
      const rows = await request('/rest/v1/forecast_items', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: {
          month_id: input.monthId,
          group_key: input.group,
          group_name: input.groupName,
          name: input.name,
          amount: input.amount,
          usd: input.usd || null,
          assumed: input.assumed === true,
          note: input.note || '',
          sort_order: sortOrder,
        },
      });
      return { id: rows[0].id };
    },
    async updateItem(id, input) {
      requireUuid(input.monthId);
      const rows = await request(`/rest/v1/forecast_items?id=eq.${requireUuid(id)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: {
          month_id: input.monthId,
          group_key: input.group,
          group_name: input.groupName,
          name: input.name,
          amount: input.amount,
          usd: input.usd || null,
          assumed: input.assumed === true,
          note: input.note || '',
        },
      });
      if (!Array.isArray(rows) || rows.length === 0) throw fail('NOT_FOUND');
    },
    async deleteItem(id) {
      const rows = await request(`/rest/v1/forecast_items?id=eq.${requireUuid(id)}`, {
        method: 'DELETE',
        headers: { prefer: 'return=representation' },
      });
      if (!Array.isArray(rows) || rows.length === 0) throw fail('NOT_FOUND');
    },
    async createPlannedSeries(value) {
      const months = (value.monthKeys || []).map((key) => {
        const labels = monthKeyLabels(key);
        if (!labels) throw fail('STORE');
        return { key, label: labels.label, labelFull: labels.labelFull };
      });
      await rpc('create_planned_series', {
        months,
        item: {
          group: value.group,
          groupName: value.groupName,
          name: value.name,
          amount: value.amount,
          usd: value.usd || null,
          assumed: value.assumed === true,
          note: value.note || '',
        },
      });
    },
    async listActual() {
      const pageSize = 500;
      const all = [];
      for (let offset = 0; offset < pageSize * 40; offset += pageSize) {
        const rows = await request(`/rest/v1/actual_expenses?select=${ACTUAL_COLUMNS}&order=document_no.asc&limit=${pageSize}&offset=${offset}`);
        const batch = Array.isArray(rows) ? rows : [];
        all.push(...batch.map(mapActual));
        if (batch.length < pageSize) break;
      }
      return all;
    },
    async getActual(id) {
      if (!isUuid(id)) return null;
      const rows = await request(`/rest/v1/actual_expenses?id=eq.${id}&select=${ACTUAL_COLUMNS}`);
      return Array.isArray(rows) && rows[0] ? mapActual(rows[0]) : null;
    },
    async createActual(input, files) {
      const created = await rpc('create_actual_expense', {
        ...expensePayload(input),
        createdBy: input.createdBy,
      });
      if (!created || !isUuid(created.id) || typeof created.documentNo !== 'string') throw fail('STORE');
      const uploaded = [];
      try {
        for (const file of files || []) {
          const fileId = crypto.randomUUID();
          const storagePath = `${created.id}/${fileId}`;
          await uploadObject(storagePath, file);
          uploaded.push(storagePath);
          await request('/rest/v1/actual_expense_files', {
            method: 'POST',
            headers: { prefer: 'return=minimal' },
            body: {
              id: fileId,
              expense_id: created.id,
              storage_path: storagePath,
              original_name: file.filename,
              evidence_kind: file.kind,
              content_type: file.contentType,
              byte_size: file.bytes.length,
            },
          });
        }
      } catch (error) {
        await removeObjects(uploaded).catch(() => {});
        await request(`/rest/v1/actual_expenses?id=eq.${created.id}`, { method: 'DELETE' }).catch(() => {});
        throw error;
      }
      return { id: created.id, documentNo: created.documentNo };
    },
    async updateActual(id, input) {
      const rows = await request(`/rest/v1/actual_expenses?id=eq.${requireUuid(id)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: expenseColumns(input),
      });
      if (!Array.isArray(rows) || rows.length === 0) throw fail('NOT_FOUND');
    },
    async deleteActual(id) {
      requireUuid(id);
      const files = await request(`/rest/v1/actual_expense_files?expense_id=eq.${id}&select=storage_path`);
      const paths = (files || []).map((file) => file.storage_path).filter((item) => typeof item === 'string');
      if (paths.length) await removeObjects(paths);
      const rows = await request(`/rest/v1/actual_expenses?id=eq.${id}`, {
        method: 'DELETE',
        headers: { prefer: 'return=representation' },
      });
      if (!Array.isArray(rows) || rows.length === 0) throw fail('NOT_FOUND');
    },
    async readReceipt(expenseId, fileId) {
      if (!isUuid(expenseId) || !isUuid(fileId)) return null;
      const rows = await request(`/rest/v1/actual_expense_files?id=eq.${fileId}&expense_id=eq.${expenseId}&select=storage_path,content_type,original_name`);
      const file = Array.isArray(rows) ? rows[0] : null;
      if (!file) return null;
      const href = await signedReadUrl(file.storage_path);
      const response = await fetchImpl(href, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw fail('STORE');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) throw fail('STORE');
      return { bytes, contentType: file.content_type, filename: file.original_name };
    },
  };
}
