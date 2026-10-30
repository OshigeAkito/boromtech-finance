-- Notes are textareas, so a line break is normal. need_text rejects every control character,
-- which made a new actual expense or a repeating planned expense fail when its note had two lines.
-- need_note allows line breaks and still rejects every other control character.
-- Run this once in the Supabase SQL Editor after the earlier migrations. It is safe to run again.

create or replace function finance_private.need_note(raw text, max_len integer) returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text := btrim(replace(replace(coalesce(raw, ''), E'\r\n', E'\n'), E'\r', E'\n'));
begin
  if char_length(value) > max_len or replace(value, E'\n', '') ~ '[[:cntrl:]]' then
    raise exception 'invalid text';
  end if;
  return value;
end;
$$;

revoke all on function finance_private.need_note(text, integer) from public;

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
  insert into public.actual_expenses (
    document_no, spent_on, item_name, category, category_other, vendor,
    period_none, period_text, period_from, period_to,
    amount, vat_mode, foreign_currency, foreign_amount, foreign_rate,
    payer, payment_methods, payment_other, receipt_no, receipt_name, receipt_name_other,
    transfer_rights, transfer_asset, note, created_by
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
    finance_private.need_note(payload->>'note', 2000),
    finance_private.need_email(payload->>'createdBy')
  )
  returning id, document_no into new_id, doc;
  return jsonb_build_object('id', new_id, 'documentNo', doc);
end;
$$;

create or replace function public.create_planned_series(payload jsonb) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  month_row record;
  found_id uuid;
  next_month_sort integer;
  next_item_sort integer;
  month_key text;
  item jsonb;
  n integer;
begin
  if payload is null or jsonb_typeof(payload->'months') <> 'array' then
    raise exception 'invalid months';
  end if;
  n := jsonb_array_length(payload->'months');
  if n < 1 or n > 36 then
    raise exception 'invalid months';
  end if;
  item := payload->'item';
  if item is null or jsonb_typeof(item) <> 'object' then
    raise exception 'invalid item';
  end if;

  for month_row in
    select t.value
    from jsonb_array_elements(payload->'months') as t(value)
  loop
    month_key := btrim(coalesce(month_row.value->>'key', ''));
    if month_key !~ '^[0-9]{4}-[0-9]{2}$' then
      raise exception 'invalid month';
    end if;

    select id into found_id from public.months where key = month_key;
    if found_id is null then
      select coalesce(max(sort_order), 0) + 1 into next_month_sort from public.months;
      if next_month_sort > 120 then
        raise exception 'too many months';
      end if;
      insert into public.months (key, label, label_full, revenue, sort_order)
      values (
        month_key,
        finance_private.need_text(month_row.value->>'label', 1, 40),
        finance_private.need_text(month_row.value->>'labelFull', 1, 80),
        0,
        next_month_sort
      )
      returning id into found_id;
    end if;

    select coalesce(max(sort_order), 0) + 1 into next_item_sort
      from public.forecast_items
      where forecast_items.month_id = found_id;
    if next_item_sort > 400 then
      raise exception 'too many items';
    end if;

    insert into public.forecast_items (
      month_id, group_key, group_name, name, amount, usd, assumed, note, sort_order
    ) values (
      found_id,
      finance_private.need_text(item->>'group', 1, 80),
      finance_private.need_text(item->>'groupName', 1, 200),
      finance_private.need_text(item->>'name', 1, 300),
      finance_private.assert_money(item->>'amount'),
      case
        when item->>'usd' is null or btrim(item->>'usd') = '' then null
        else finance_private.assert_money(item->>'usd')
      end,
      finance_private.flag(coalesce(item->>'assumed', 'false')),
      finance_private.need_note(item->>'note', 2000),
      next_item_sort
    );
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function finance_private.need_note(text, integer) from anon, authenticated;
    revoke all on function public.create_actual_expense(jsonb) from anon, authenticated;
    revoke all on function public.create_planned_series(jsonb) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_actual_expense(jsonb) to service_role;
    grant execute on function public.create_planned_series(jsonb) to service_role;
  end if;
end $$;
