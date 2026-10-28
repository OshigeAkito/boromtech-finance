-- BoromTech finance.
-- Run this whole file in the Supabase SQL editor.
-- Row Level Security is enabled on every table and no access policies are added,
-- so the anon and authenticated API roles cannot read or write.
-- The Node server uses the service role key and never sends it to the browser.
-- Receipt files live in a private Storage bucket named receipts.

create schema if not exists finance_private;
revoke all on schema finance_private from public;

create function finance_private.assert_money(raw text) returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value numeric;
begin
  if raw is null or raw !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then
    raise exception 'invalid money';
  end if;
  value := raw::numeric;
  if value < 0 or value <> round(value, 2) then
    raise exception 'invalid money';
  end if;
  return value;
end;
$$;

create function finance_private.assert_positive_money(raw text) returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value numeric;
begin
  value := finance_private.assert_money(raw);
  if value <= 0 then
    raise exception 'invalid money';
  end if;
  return value;
end;
$$;

create function finance_private.assert_rate(raw text) returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value numeric;
begin
  if raw is null or raw !~ '^[0-9]{1,6}(\.[0-9]{1,8})?$' then
    raise exception 'invalid rate';
  end if;
  value := raw::numeric;
  if value <= 0 or value <> round(value, 8) then
    raise exception 'invalid rate';
  end if;
  return value;
end;
$$;

create function finance_private.assert_share(raw text) returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value numeric;
begin
  if raw is null or raw !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then
    raise exception 'invalid share';
  end if;
  value := raw::numeric;
  if value < 0 or value > 100 or value <> round(value, 2) then
    raise exception 'invalid share';
  end if;
  return value;
end;
$$;

create function finance_private.need_text(raw text, min_len integer, max_len integer) returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text := btrim(coalesce(raw, ''));
begin
  if char_length(value) < min_len or char_length(value) > max_len or value ~ '[[:cntrl:]]' then
    raise exception 'invalid text';
  end if;
  return value;
end;
$$;

create function finance_private.need_code(raw text) returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text := upper(btrim(coalesce(raw, '')));
begin
  if value !~ '^[A-Z]{3,8}$' then
    raise exception 'invalid code';
  end if;
  return value;
end;
$$;

create function finance_private.need_date(raw text) returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if raw is null or raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid date';
  end if;
  return raw::date;
exception
  when others then
    raise exception 'invalid date';
end;
$$;

create function finance_private.flag(raw text) returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if raw is null or raw = 'false' then
    return false;
  elsif raw = 'true' then
    return true;
  end if;
  raise exception 'invalid flag';
end;
$$;

create function finance_private.need_email(raw text) returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text := lower(btrim(coalesce(raw, '')));
begin
  if char_length(value) > 320 or value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid user';
  end if;
  return value;
end;
$$;

create function finance_private.next_document_no(counter_name text, prefix text) returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  n integer;
begin
  update public.document_counters
    set last_value = last_value + 1
    where name = counter_name
    returning last_value into n;
  if n is null or n > 999999 then
    raise exception 'unknown counter';
  end if;
  return prefix || lpad(n::text, 4, '0');
end;
$$;

create table public.settings (
  id smallint primary key default 1 check (id = 1),
  company text not null check (char_length(company) between 1 and 200),
  currency text not null check (currency ~ '^[A-Z]{3,8}$'),
  registered_capital numeric(14, 2) not null check (registered_capital >= 0),
  opening_amount numeric(14, 2) not null check (opening_amount >= 0),
  opening_share_percent numeric(5, 2) not null check (opening_share_percent >= 0 and opening_share_percent <= 100),
  opening_assumed boolean not null default false,
  opening_label text not null default '' check (char_length(opening_label) <= 200),
  opening_timing text not null default '' check (char_length(opening_timing) <= 200),
  fx_base text not null check (fx_base ~ '^[A-Z]{3,8}$'),
  fx_quote text not null check (fx_quote ~ '^[A-Z]{3,8}$'),
  fx_rate numeric(16, 8) not null check (fx_rate > 0),
  fx_source text not null check (char_length(fx_source) between 1 and 300),
  fx_updated_on date not null,
  fx_updated_display text not null check (char_length(fx_updated_display) between 1 and 120),
  balance_formula text not null check (char_length(balance_formula) between 1 and 1000),
  document_prefix text not null default 'EXP' check (document_prefix ~ '^[A-Z]{2,6}$'),
  updated_at timestamptz not null default now()
);

create table public.months (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),
  label text not null check (char_length(label) between 1 and 40),
  label_full text not null check (char_length(label_full) between 1 and 80),
  revenue numeric(14, 2) not null check (revenue >= 0),
  sort_order integer not null check (sort_order > 0 and sort_order <= 120)
);

create table public.forecast_items (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.months (id) on delete cascade,
  group_key text not null check (char_length(group_key) <= 80),
  group_name text not null check (char_length(group_name) <= 200),
  name text not null check (char_length(name) <= 300),
  amount numeric(14, 2) not null check (amount >= 0),
  assumed boolean not null default false,
  note text not null default '' check (char_length(note) <= 2000),
  sort_order integer not null check (sort_order > 0 and sort_order <= 400)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('assumption', 'not_yet_included')),
  body text not null check (char_length(body) between 1 and 1000),
  sort_order integer not null check (sort_order > 0 and sort_order <= 80)
);

create table public.document_counters (
  name text primary key,
  last_value integer not null check (last_value >= 0 and last_value <= 999999)
);

insert into public.document_counters (name, last_value) values
  ('actual_expense', 0);

create table public.actual_expenses (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique check (document_no ~ '^[A-Z]{2,6}-[0-9]{4,6}$'),
  spent_on date not null,
  item_name text not null check (char_length(item_name) between 1 and 200),
  category text not null check (category in ('domain', 'fee', 'software', 'other')),
  category_other text not null default '' check (char_length(category_other) <= 80),
  vendor text not null check (char_length(vendor) between 1 and 200),
  period_none boolean not null,
  period_text text not null default '' check (char_length(period_text) <= 40),
  period_from date,
  period_to date,
  amount numeric(14, 2) not null check (amount > 0),
  amount_text text generated always as (amount::text) stored,
  vat_mode text not null check (vat_mode in ('included', 'excluded', 'foreign')),
  foreign_currency text not null default '' check (foreign_currency = '' or foreign_currency ~ '^[A-Z]{3,8}$'),
  foreign_amount numeric(14, 2),
  foreign_amount_text text generated always as (case when foreign_amount is null then '' else foreign_amount::text end) stored,
  foreign_rate numeric(16, 8),
  foreign_rate_text text generated always as (case when foreign_rate is null then '' else foreign_rate::text end) stored,
  payer text not null check (char_length(payer) between 1 and 120),
  payment_methods text[] not null,
  payment_other text not null default '' check (char_length(payment_other) <= 80),
  receipt_no text not null check (char_length(receipt_no) between 1 and 80),
  receipt_name text not null check (receipt_name in ('company', 'promoter', 'other')),
  receipt_name_other text not null default '' check (char_length(receipt_name_other) <= 120),
  transfer_rights boolean not null,
  transfer_asset text not null default '' check (char_length(transfer_asset) <= 200),
  note text not null default '' check (char_length(note) <= 2000),
  created_by text not null check (char_length(created_by) between 3 and 320),
  created_at timestamptz not null default now(),
  constraint actual_category_other check (
    (category <> 'other' and category_other = '')
    or (category = 'other' and char_length(category_other) >= 1)
  ),
  constraint actual_period check (
    (period_none and period_from is null and period_to is null)
    or (
      not period_none
      and period_from is not null
      and period_to is not null
      and period_to >= period_from
      and char_length(period_text) >= 1
    )
  ),
  constraint actual_foreign check (
    (
      vat_mode <> 'foreign'
      and foreign_currency = ''
      and foreign_amount is null
      and foreign_rate is null
    )
    or (
      vat_mode = 'foreign'
      and foreign_currency ~ '^[A-Z]{3,8}$'
      and foreign_amount > 0
      and foreign_rate > 0
    )
  ),
  constraint actual_payment check (
    payment_methods <@ array['card', 'transfer', 'paypal', 'cash', 'other']::text[]
    and cardinality(payment_methods) >= 1
    and (
      ('other' = any (payment_methods) and char_length(payment_other) >= 1)
      or (not ('other' = any (payment_methods)) and payment_other = '')
    )
  ),
  constraint actual_receipt_name check (
    (receipt_name <> 'other' and receipt_name_other = '')
    or (receipt_name = 'other' and char_length(receipt_name_other) >= 1)
  ),
  constraint actual_transfer check (
    (not transfer_rights and transfer_asset = '')
    or (transfer_rights and char_length(transfer_asset) >= 1)
  )
);

create table public.actual_expense_files (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.actual_expenses (id) on delete cascade,
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  original_name text not null check (char_length(original_name) between 1 and 80),
  evidence_kind text not null check (evidence_kind in ('receipt', 'payment_proof', 'screenshot', 'assignment')),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  created_at timestamptz not null default now()
);

create index months_sort_idx on public.months (sort_order, key);
create index forecast_items_month_idx on public.forecast_items (month_id, sort_order);
create index notes_kind_idx on public.notes (kind, sort_order);
create index actual_expenses_spent_idx on public.actual_expenses (spent_on);
create index actual_expense_files_expense_idx on public.actual_expense_files (expense_id);

alter table public.settings enable row level security;
alter table public.months enable row level security;
alter table public.forecast_items enable row level security;
alter table public.notes enable row level security;
alter table public.document_counters enable row level security;
alter table public.actual_expenses enable row level security;
alter table public.actual_expense_files enable row level security;

alter table public.settings force row level security;
alter table public.months force row level security;
alter table public.forecast_items force row level security;
alter table public.notes force row level security;
alter table public.document_counters force row level security;
alter table public.actual_expenses force row level security;
alter table public.actual_expense_files force row level security;

create function finance_private.touch_settings() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_touch
before update on public.settings
for each row execute procedure finance_private.touch_settings();

create function finance_private.need_prefix(raw text) returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text := upper(btrim(coalesce(raw, '')));
begin
  if value = '' then
    return 'EXP';
  end if;
  if value !~ '^[A-Z]{2,6}$' then
    raise exception 'invalid prefix';
  end if;
  return value;
end;
$$;

create function finance_private.apply_settings(payload jsonb) returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid settings';
  end if;
  insert into public.settings (
    id, company, currency, registered_capital, opening_amount, opening_share_percent,
    opening_assumed, opening_label, opening_timing,
    fx_base, fx_quote, fx_rate, fx_source,     fx_updated_on, fx_updated_display,
    balance_formula, document_prefix
  ) values (
    1,
    finance_private.need_text(payload->>'company', 1, 200),
    finance_private.need_code(payload->>'currency'),
    finance_private.assert_money(payload->>'registeredCapital'),
    finance_private.assert_money(payload#>>'{openingCapital,amount}'),
    finance_private.assert_share(payload#>>'{openingCapital,sharePercent}'),
    finance_private.flag(payload#>>'{openingCapital,assumed}'),
    finance_private.need_text(payload#>>'{openingCapital,label}', 0, 200),
    finance_private.need_text(payload#>>'{openingCapital,timing}', 0, 200),
    finance_private.need_code(payload#>>'{fx,base}'),
    finance_private.need_code(payload#>>'{fx,quote}'),
    finance_private.assert_rate(payload#>>'{fx,rate}'),
    finance_private.need_text(payload#>>'{fx,source}', 1, 300),
    finance_private.need_date(payload#>>'{fx,updatedAt}'),
    finance_private.need_text(payload#>>'{fx,updatedDisplay}', 1, 120),
    finance_private.need_text(payload->>'balanceFormula', 1, 1000),
    case
      when payload ? 'documentPrefix' then finance_private.need_prefix(payload->>'documentPrefix')
      else 'EXP'
    end
  )
  on conflict (id) do update set
    company = excluded.company,
    currency = excluded.currency,
    registered_capital = excluded.registered_capital,
    opening_amount = excluded.opening_amount,
    opening_share_percent = excluded.opening_share_percent,
    opening_assumed = excluded.opening_assumed,
    opening_label = excluded.opening_label,
    opening_timing = excluded.opening_timing,
    fx_base = excluded.fx_base,
    fx_quote = excluded.fx_quote,
    fx_rate = excluded.fx_rate,
    fx_source = excluded.fx_source,
    fx_updated_on = excluded.fx_updated_on,
    fx_updated_display = excluded.fx_updated_display,
    balance_formula = excluded.balance_formula,
    document_prefix = case
      when payload ? 'documentPrefix' then excluded.document_prefix
      else public.settings.document_prefix
    end;
end;
$$;

create function finance_private.replace_note_list(note_kind text, items jsonb) returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  note_row text;
  note_body text;
  note_ord integer := 0;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 80 then
    raise exception 'invalid notes';
  end if;
  delete from public.notes where kind = note_kind;
  for note_row in select value from jsonb_array_elements_text(items)
  loop
    note_body := btrim(note_row);
    if note_body = '' then
      continue;
    end if;
    if char_length(note_body) > 1000 or note_body ~ '[[:cntrl:]]' then
      raise exception 'invalid note';
    end if;
    note_ord := note_ord + 1;
    insert into public.notes (kind, body, sort_order) values (note_kind, note_body, note_ord);
  end loop;
end;
$$;

create function public.save_settings(payload jsonb) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform finance_private.apply_settings(payload);
  perform finance_private.replace_note_list('assumption', coalesce(payload->'assumptions', '[]'::jsonb));
  perform finance_private.replace_note_list('not_yet_included', coalesce(payload->'notYetIncluded', '[]'::jsonb));
end;
$$;

create function public.replace_forecast(payload jsonb) returns void
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
        month_id, group_key, group_name, name, amount, assumed, note, sort_order
      ) values (
        new_month_id,
        finance_private.need_text(item_row.value->>'group', 0, 80),
        finance_private.need_text(item_row.value->>'groupName', 0, 200),
        finance_private.need_text(item_row.value->>'name', 0, 300),
        finance_private.assert_money(item_row.value->>'amount'),
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

create function public.load_forecast() returns jsonb
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

create function public.create_actual_expense(payload jsonb) returns jsonb
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
    finance_private.need_text(payload->>'note', 0, 2000),
    finance_private.need_email(payload->>'createdBy')
  )
  returning id, document_no into new_id, doc;
  return jsonb_build_object('id', new_id, 'documentNo', doc);
end;
$$;

revoke all on all functions in schema finance_private from public;

do $$
declare
  tbl text;
  fn text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all functions in schema finance_private from anon, authenticated;
  end if;
  foreach tbl in array array[
    'settings', 'months', 'forecast_items', 'notes', 'document_counters',
    'actual_expenses', 'actual_expense_files'
  ]
  loop
    execute format('revoke all on table public.%I from public', tbl);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon, authenticated', tbl);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant select, insert, update, delete on table public.%I to service_role', tbl);
    end if;
  end loop;
  foreach fn in array array[
    'public.load_forecast()',
    'public.save_settings(jsonb)',
    'public.replace_forecast(jsonb)',
    'public.create_actual_expense(jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end $$;

-- Private bucket. If this step cannot run, create bucket "receipts" in Storage
-- and leave it private. Do not add Storage access policies.
do $bucket$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'receipts',
    'receipts',
    false,
    5242880,
    array['application/pdf', 'image/jpeg', 'image/png']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception
  when others then
    raise notice 'Could not create the receipts bucket. Create a private bucket named receipts in Storage.';
end
$bucket$;
