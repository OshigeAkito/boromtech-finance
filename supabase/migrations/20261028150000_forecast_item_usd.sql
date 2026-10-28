-- Optional US-dollar amount per planned expense, shown next to the baht figure.
-- The baht amount stays the one that counts in every total; usd is reference only.
-- Run this once in the Supabase SQL Editor after the init migration.

alter table public.forecast_items
  add column if not exists usd numeric(14, 2) check (usd is null or usd >= 0);

-- Same as the init versions, plus usd. Replacing a function keeps its grants
-- (execute for service_role only), so no grant changes are needed.
create or replace function public.replace_forecast(payload jsonb) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  month_row record;
  item_row record;
  new_month_id uuid;
  month_key text;
begin
  if payload is null or jsonb_typeof(payload->'months') <> 'array'
    or jsonb_array_length(payload->'months') < 1
    or jsonb_array_length(payload->'months') > 120 then
    raise exception 'invalid months';
  end if;
  delete from public.forecast_items;
  delete from public.months;
  delete from public.notes;
  perform finance_private.apply_settings(payload);
  for month_row in
    select t.value, t.ord
    from jsonb_array_elements(payload->'months') with ordinality as t(value, ord)
  loop
    month_key := btrim(coalesce(month_row.value->>'key', ''));
    if month_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' then
      raise exception 'invalid month';
    end if;
    if jsonb_typeof(month_row.value->'items') <> 'array'
      or jsonb_array_length(month_row.value->'items') > 400 then
      raise exception 'invalid items';
    end if;
    insert into public.months (key, label, label_full, revenue, sort_order)
    values (
      month_key,
      finance_private.need_text(month_row.value->>'label', 1, 40),
      finance_private.need_text(month_row.value->>'labelFull', 1, 80),
      finance_private.assert_money(month_row.value->>'revenue'),
      month_row.ord::integer
    )
    returning id into new_month_id;
    for item_row in
      select t.value, t.ord
      from jsonb_array_elements(month_row.value->'items') with ordinality as t(value, ord)
    loop
      insert into public.forecast_items (
        month_id, group_key, group_name, name, amount, usd, assumed, note, sort_order
      ) values (
        new_month_id,
        finance_private.need_text(item_row.value->>'group', 0, 80),
        finance_private.need_text(item_row.value->>'groupName', 0, 200),
        finance_private.need_text(item_row.value->>'name', 0, 300),
        finance_private.assert_money(item_row.value->>'amount'),
        case
          when item_row.value->>'usd' is null or item_row.value->>'usd' = '' then null
          else finance_private.assert_money(item_row.value->>'usd')
        end,
        finance_private.flag(item_row.value->>'assumed'),
        finance_private.need_text(item_row.value->>'note', 0, 2000),
        item_row.ord::integer
      );
    end loop;
  end loop;
  perform finance_private.replace_note_list('assumption', coalesce(payload->'assumptions', '[]'::jsonb));
  perform finance_private.replace_note_list('not_yet_included', coalesce(payload->'notYetIncluded', '[]'::jsonb));
end;
$$;

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
                'note', i.note
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
