-- Office Portal: who paid a planned expense, and whether a row is an advance (ทดรองจ่าย).
-- Additive only. Existing rows keep payer '', created_by '', advance false.
-- Does not insert data. Does not add RLS policies. Browser roles stay locked out;
-- the Node server (service role) filters founders, directors, employees, and Experts.
-- Run this whole file once in the Supabase SQL editor, after the earlier migrations.
-- Do not run it from the app.

alter table public.forecast_items
  add column if not exists payer text not null default '' check (char_length(payer) <= 120),
  add column if not exists created_by text not null default '' check (char_length(created_by) <= 320),
  add column if not exists advance boolean not null default false;

alter table public.actual_expenses
  add column if not exists advance boolean not null default false;

-- Same as the USD migration's load_forecast, plus payer / advance / createdBy.
-- Replacing a function keeps its grants (execute for service_role only).
create or replace function public.load_forecast() returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'company', s.company,
    'currency', s.currency,
    'registeredCapital', s.registered_capital::text,
    'openingCapital', jsonb_build_object(
      'amount', s.opening_amount::text,
      'sharePercent', s.opening_share_percent::text,
      'assumed', s.opening_assumed,
      'label', s.opening_label,
      'timing', s.opening_timing
    ),
    'fx', jsonb_build_object(
      'base', s.fx_base,
      'quote', s.fx_quote,
      'rate', s.fx_rate::text,
      'source', s.fx_source,
      'updatedAt', to_char(s.fx_updated_on, 'YYYY-MM-DD'),
      'updatedDisplay', s.fx_updated_display
    ),
    'balanceFormula', s.balance_formula,
    'documentPrefix', s.document_prefix,
    'months', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'key', m.key,
          'label', m.label,
          'labelFull', m.label_full,
          'revenue', m.revenue::text,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'group', i.group_key,
                'groupName', i.group_name,
                'name', i.name,
                'amount', i.amount::text,
                'usd', i.usd::text,
                'assumed', i.assumed,
                'note', i.note,
                'payer', coalesce(i.payer, ''),
                'advance', coalesce(i.advance, false),
                'createdBy', coalesce(i.created_by, '')
              )
              order by i.sort_order, i.id
            )
            from public.forecast_items i
            where i.month_id = m.id
          ), '[]'::jsonb)
        )
        order by m.sort_order, m.key
      )
      from public.months m
    ), '[]'::jsonb),
    'assumptions', coalesce((
      select jsonb_agg(n.body order by n.sort_order, n.id)
      from public.notes n
      where n.kind = 'assumption'
    ), '[]'::jsonb),
    'notYetIncluded', coalesce((
      select jsonb_agg(n.body order by n.sort_order, n.id)
      from public.notes n
      where n.kind = 'not_yet_included'
    ), '[]'::jsonb)
  )
  into result
  from public.settings s
  where s.id = 1;
  return result;
end;
$$;

-- Same as init, plus optional advance. Missing advance stays false so older callers still work.
create or replace function public.create_actual_expense(payload jsonb) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  new_id uuid;
  doc text;
  prefix text;
  methods text[];
  period_none boolean;
  vat_mode text;
  is_advance boolean;
begin
  if payload is null or jsonb_typeof(payload->'paymentMethods') <> 'array' then
    raise exception 'invalid payment';
  end if;
  select coalesce(array_agg(value), '{}'::text[])
    into methods
  from jsonb_array_elements_text(payload->'paymentMethods');
  prefix := coalesce((select document_prefix from public.settings where id = 1), 'EXP');
  period_none := finance_private.flag(payload->>'periodNone');
  vat_mode := payload->>'vatMode';
  if vat_mode not in ('included', 'excluded', 'foreign') then
    raise exception 'invalid vat';
  end if;
  if payload ? 'advance' then
    is_advance := finance_private.flag(payload->>'advance');
  else
    is_advance := false;
  end if;
  insert into public.actual_expenses (
    document_no, spent_on, item_name, category, category_other, vendor,
    period_none, period_text, period_from, period_to,
    amount, vat_mode, foreign_currency, foreign_amount, foreign_rate,
    payer, payment_methods, payment_other, receipt_no, receipt_name, receipt_name_other,
    transfer_rights, transfer_asset, note, created_by, advance
  ) values (
    finance_private.next_document_no('actual_expense', prefix || '-'),
    finance_private.need_date(payload->>'spentOn'),
    finance_private.need_text(payload->>'itemName', 1, 200),
    finance_private.need_text(payload->>'category', 1, 20),
    finance_private.need_text(payload->>'categoryOther', 0, 80),
    finance_private.need_text(payload->>'vendor', 1, 200),
    period_none,
    finance_private.need_text(payload->>'periodText', 0, 40),
    case when period_none then null else finance_private.need_date(payload->>'periodFrom') end,
    case when period_none then null else finance_private.need_date(payload->>'periodTo') end,
    finance_private.assert_positive_money(payload->>'amount'),
    vat_mode,
    finance_private.need_text(payload->>'foreignCurrency', 0, 8),
    case
      when vat_mode = 'foreign' then finance_private.assert_positive_money(payload->>'foreignAmount')
      else null
    end,
    case
      when vat_mode = 'foreign' then finance_private.assert_rate(payload->>'foreignRate')
      else null
    end,
    finance_private.need_text(payload->>'payer', 1, 120),
    methods,
    finance_private.need_text(payload->>'paymentOther', 0, 80),
    finance_private.need_text(payload->>'receiptNo', 1, 80),
    finance_private.need_text(payload->>'receiptName', 1, 20),
    finance_private.need_text(payload->>'receiptNameOther', 0, 120),
    finance_private.flag(payload->>'transferRights'),
    finance_private.need_text(payload->>'transferAsset', 0, 200),
    finance_private.need_text(payload->>'note', 0, 2000),
    finance_private.need_email(payload->>'createdBy'),
    is_advance
  )
  returning id, document_no into new_id, doc;
  return jsonb_build_object('id', new_id, 'documentNo', doc);
end;
$$;
