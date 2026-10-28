import crypto from 'node:crypto';
import { prepareForecastImport } from './import-forecast.js';
import { isUuid } from './ids.js';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function blank() {
  return {
    settings: null,
    months: [],
    notes: [],
    actuals: [],
    counters: { actual_expense: 0 },
  };
}

function nextNo(state, counter, prefix) {
  state.counters[counter] += 1;
  return `${prefix}${String(state.counters[counter]).padStart(4, '0')}`;
}

function applyPayload(state, payload) {
  state.settings = {
    company: payload.company,
    currency: payload.currency,
    registeredCapital: payload.registeredCapital,
    openingAmount: payload.openingCapital.amount,
    openingShare: payload.openingCapital.sharePercent,
    openingAssumed: payload.openingCapital.assumed === true,
    openingLabel: payload.openingCapital.label,
    openingTiming: payload.openingCapital.timing,
    fxBase: payload.fx.base,
    fxQuote: payload.fx.quote,
    fxRate: payload.fx.rate,
    fxSource: payload.fx.source,
    fxUpdatedAt: payload.fx.updatedAt,
    fxUpdatedDisplay: payload.fx.updatedDisplay,
    balanceFormula: payload.balanceFormula,
    documentPrefix: payload.documentPrefix || state.settings?.documentPrefix || 'EXP',
  };
  state.months = payload.months.map((month, index) => ({
    id: crypto.randomUUID(),
    key: month.key,
    label: month.label,
    labelFull: month.labelFull,
    revenue: month.revenue,
    sortOrder: index + 1,
    items: month.items.map((item, itemIndex) => ({
      id: crypto.randomUUID(),
      group: item.group,
      groupName: item.groupName,
      name: item.name,
      amount: item.amount,
      usd: item.usd || null,
      assumed: item.assumed === true,
      note: item.note || '',
      sortOrder: itemIndex + 1,
    })),
  }));
  state.notes = [];
  for (const [kind, items] of [['assumption', payload.assumptions], ['not_yet_included', payload.notYetIncluded]]) {
    items.forEach((body, index) => {
      state.notes.push({ id: crypto.randomUUID(), kind, body, sortOrder: index + 1 });
    });
  }
}

function viewForecast(state) {
  if (!state.settings) return null;
  const settings = state.settings;
  const shareText = settings.openingShare;
  return {
    company: settings.company,
    currency: settings.currency,
    registeredCapital: settings.registeredCapital,
    openingCapital: {
      amount: settings.openingAmount,
      sharePercent: Number(shareText),
      shareText,
      assumed: settings.openingAssumed,
      label: settings.openingLabel,
      timing: settings.openingTiming,
    },
    fx: {
      base: settings.fxBase,
      quote: settings.fxQuote,
      rate: settings.fxRate,
      source: settings.fxSource,
      updatedAt: settings.fxUpdatedAt,
      updatedDisplay: settings.fxUpdatedDisplay,
    },
    balanceFormula: settings.balanceFormula,
    documentPrefix: settings.documentPrefix || 'EXP',
    months: state.months.map((month) => ({
      id: month.id,
      key: month.key,
      label: month.label,
      labelFull: month.labelFull,
      revenue: month.revenue,
      items: month.items.map((item) => ({
        id: item.id,
        group: item.group,
        groupName: item.groupName,
        name: item.name,
        amount: item.amount,
        usd: item.usd || null,
        assumed: item.assumed,
        note: item.note,
      })),
    })),
    assumptions: state.notes.filter((note) => note.kind === 'assumption').sort((a, b) => a.sortOrder - b.sortOrder).map((note) => note.body),
    notYetIncluded: state.notes.filter((note) => note.kind === 'not_yet_included').sort((a, b) => a.sortOrder - b.sortOrder).map((note) => note.body),
  };
}

function viewActual(expense) {
  return {
    id: expense.id,
    documentNo: expense.documentNo,
    spentOn: expense.spentOn,
    itemName: expense.itemName,
    category: expense.category,
    categoryOther: expense.categoryOther,
    vendor: expense.vendor,
    periodNone: expense.periodNone,
    periodText: expense.periodText,
    periodFrom: expense.periodFrom,
    periodTo: expense.periodTo,
    amount: expense.amount,
    vatMode: expense.vatMode,
    foreignCurrency: expense.foreignCurrency,
    foreignAmount: expense.foreignAmount,
    foreignRate: expense.foreignRate,
    payer: expense.payer,
    paymentMethods: [...expense.paymentMethods],
    paymentOther: expense.paymentOther,
    receiptNo: expense.receiptNo,
    receiptName: expense.receiptName,
    receiptNameOther: expense.receiptNameOther,
    transferRights: expense.transferRights,
    transferAsset: expense.transferAsset,
    note: expense.note,
    files: expense.files.map((file) => ({
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      byteSize: file.bytes.length,
      kind: file.kind,
    })),
  };
}

function copyExpense(expense, input) {
  expense.spentOn = input.spentOn;
  expense.itemName = input.itemName;
  expense.category = input.category;
  expense.categoryOther = input.categoryOther || '';
  expense.vendor = input.vendor;
  expense.periodNone = input.periodNone === true;
  expense.periodText = input.periodText || '';
  expense.periodFrom = input.periodFrom;
  expense.periodTo = input.periodTo;
  expense.amount = input.amount;
  expense.vatMode = input.vatMode;
  expense.foreignCurrency = input.foreignCurrency || '';
  expense.foreignAmount = input.foreignAmount;
  expense.foreignRate = input.foreignRate;
  expense.payer = input.payer;
  expense.paymentMethods = [...input.paymentMethods];
  expense.paymentOther = input.paymentOther || '';
  expense.receiptNo = input.receiptNo;
  expense.receiptName = input.receiptName;
  expense.receiptNameOther = input.receiptNameOther || '';
  expense.transferRights = input.transferRights === true;
  expense.transferAsset = input.transferAsset || '';
  expense.note = input.note || '';
}

function requireMonth(state, id) {
  if (!isUuid(id)) throw fail('NOT_FOUND');
  const month = state.months.find((item) => item.id === id);
  if (!month) throw fail('NOT_FOUND');
  return month;
}

export function createMemoryStore(seed) {
  const state = blank();
  if (seed) {
    const prepared = prepareForecastImport(seed);
    if (!prepared.ok) throw fail('INVALID');
    applyPayload(state, prepared.value);
  }
  return {
    configured: true,
    async loadForecast() {
      return viewForecast(state);
    },
    async saveSettings(payload) {
      const previousMonths = state.months;
      applyPayload(state, {
        ...payload,
        months: [],
        assumptions: payload.assumptions,
        notYetIncluded: payload.notYetIncluded,
      });
      state.months = previousMonths;
    },
    async replaceForecast(payload) {
      applyPayload(state, payload);
    },
    async createMonth(input) {
      if (state.months.some((month) => month.key === input.key)) throw fail('CONFLICT');
      const month = {
        id: crypto.randomUUID(),
        key: input.key,
        label: input.label,
        labelFull: input.labelFull,
        revenue: input.revenue,
        sortOrder: state.months.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
        items: [],
      };
      state.months.push(month);
      return { id: month.id };
    },
    async updateMonth(id, input) {
      const month = requireMonth(state, id);
      if (state.months.some((item) => item.id !== id && item.key === input.key)) throw fail('CONFLICT');
      month.key = input.key;
      month.label = input.label;
      month.labelFull = input.labelFull;
      month.revenue = input.revenue;
    },
    async deleteMonth(id) {
      const month = requireMonth(state, id);
      state.months = state.months.filter((item) => item !== month);
    },
    async createItem(input) {
      const month = requireMonth(state, input.monthId);
      const item = {
        id: crypto.randomUUID(),
        group: input.group,
        groupName: input.groupName,
        name: input.name,
        amount: input.amount,
        usd: input.usd || null,
        assumed: input.assumed === true,
        note: input.note || '',
        sortOrder: month.items.reduce((max, entry) => Math.max(max, entry.sortOrder), 0) + 1,
      };
      month.items.push(item);
      return { id: item.id };
    },
    async updateItem(id, input) {
      if (!isUuid(id)) throw fail('NOT_FOUND');
      const month = requireMonth(state, input.monthId);
      let current = null;
      let from = null;
      for (const candidate of state.months) {
        const found = candidate.items.find((item) => item.id === id);
        if (found) {
          current = found;
          from = candidate;
          break;
        }
      }
      if (!current) throw fail('NOT_FOUND');
      if (from !== month) {
        from.items = from.items.filter((item) => item !== current);
        month.items.push(current);
      }
      current.group = input.group;
      current.groupName = input.groupName;
      current.name = input.name;
      current.amount = input.amount;
      current.usd = input.usd || null;
      current.assumed = input.assumed === true;
      current.note = input.note || '';
    },
    async deleteItem(id) {
      if (!isUuid(id)) throw fail('NOT_FOUND');
      for (const month of state.months) {
        const index = month.items.findIndex((item) => item.id === id);
        if (index >= 0) {
          month.items.splice(index, 1);
          return;
        }
      }
      throw fail('NOT_FOUND');
    },
    async listActual() {
      return state.actuals.map(viewActual);
    },
    async getActual(id) {
      if (!isUuid(id)) return null;
      const expense = state.actuals.find((item) => item.id === id);
      return expense ? viewActual(expense) : null;
    },
    async createActual(input, files) {
      const prefix = state.settings?.documentPrefix || 'EXP';
      const expense = {
        id: crypto.randomUUID(),
        documentNo: nextNo(state, 'actual_expense', `${prefix}-`),
        createdBy: input.createdBy,
        files: (files || []).map((file) => ({
          id: crypto.randomUUID(),
          filename: file.filename,
          contentType: file.contentType,
          kind: file.kind,
          bytes: Buffer.from(file.bytes),
        })),
      };
      copyExpense(expense, input);
      state.actuals.push(expense);
      return { id: expense.id, documentNo: expense.documentNo };
    },
    async updateActual(id, input) {
      if (!isUuid(id)) throw fail('NOT_FOUND');
      const expense = state.actuals.find((item) => item.id === id);
      if (!expense) throw fail('NOT_FOUND');
      copyExpense(expense, input);
    },
    async deleteActual(id) {
      if (!isUuid(id)) throw fail('NOT_FOUND');
      const index = state.actuals.findIndex((item) => item.id === id);
      if (index < 0) throw fail('NOT_FOUND');
      state.actuals.splice(index, 1);
    },
    async readReceipt(expenseId, fileId) {
      if (!isUuid(expenseId) || !isUuid(fileId)) return null;
      const expense = state.actuals.find((item) => item.id === expenseId);
      const file = expense?.files.find((item) => item.id === fileId);
      if (!file) return null;
      return {
        bytes: Buffer.from(file.bytes),
        contentType: file.contentType,
        filename: file.filename,
      };
    },
  };
}
