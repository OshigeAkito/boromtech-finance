-- Create every month and planned row for one repeating expense in a single call.
-- A raised exception rolls the whole function back, so a failed series leaves no partial months.
-- Run this once in the Supabase SQL Editor after the earlier migrations, including the usd column.
-- Do not run it from the app. service_role is the only role that may call it.

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
      finance_private.need_text(coalesce(item->>'note', ''), 0, 2000),
      next_item_sort
    );
  end loop;
end;
$$;

revoke all on function public.create_planned_series(jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.create_planned_series(jsonb) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_planned_series(jsonb) to service_role;
  end if;
end $$;
