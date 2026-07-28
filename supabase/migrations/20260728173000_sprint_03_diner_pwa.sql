-- Sprint 3: anonymous diner device sessions, configurable menu and service actions.
-- The Data API remains closed to anon; user routes use narrow server operations.

create table public.tenant_diner_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  device_idle_ttl_seconds integer not null default 14400
    check (device_idle_ttl_seconds between 3600 and 28800),
  device_absolute_ttl_seconds integer not null default 43200
    check (
      device_absolute_ttl_seconds between 14400 and 86400
      and device_absolute_ttl_seconds > device_idle_ttl_seconds
    ),
  default_locale text not null default 'es'
    check (default_locale in ('es', 'en')),
  tip_suggestions integer[] not null default array[0, 10, 12]
    check (
      cardinality(tip_suggestions) between 1 and 5
      and 0 = any(tip_suggestions)
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.tenant_diner_settings.device_idle_ttl_seconds is
  'Default 4 hours. Every valid request extends idle expiry, never beyond absolute expiry.';
comment on column public.tenant_diner_settings.device_absolute_ttl_seconds is
  'Default 12 hours. A device session also ends immediately when the table session closes.';

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, venue_id, code),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict
);

alter table public.products
  add column menu_category_id uuid,
  add column image_path text,
  add column image_alt text,
  add column allergens text[] not null default '{}'::text[],
  add column translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object'),
  add column available_for_order boolean not null default true,
  add foreign key (tenant_id, menu_category_id)
    references public.menu_categories (tenant_id, id) on delete restrict;

alter table public.cart_items
  add column customer_note text
    check (
      customer_note is null
      or (
        btrim(customer_note) <> ''
        and length(customer_note) <= 140
      )
    );

create table public.diner_device_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_session_id uuid not null,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  alias text not null check (btrim(alias) <> ''),
  display_name text
    check (
      display_name is null
      or (
        btrim(display_name) <> ''
        and length(display_name) <= 60
      )
    ),
  locale text not null default 'es' check (locale in ('es', 'en')),
  state text not null default 'active'
    check (state in ('active', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  check (last_seen_at >= created_at),
  check (idle_expires_at > last_seen_at),
  check (absolute_expires_at > created_at),
  check (idle_expires_at <= absolute_expires_at),
  check (
    (state = 'revoked' and revoked_at is not null)
    or (state <> 'revoked')
  )
);

create unique index diner_device_sessions_live_alias_idx
  on public.diner_device_sessions (tenant_id, table_session_id, alias)
  where state = 'active';
create index diner_device_sessions_table_session_fk_idx
  on public.diner_device_sessions (tenant_id, table_session_id);
create index diner_device_sessions_expiry_idx
  on public.diner_device_sessions (idle_expires_at, absolute_expires_at)
  where state = 'active';

alter table public.carts
  add column diner_device_session_id uuid,
  add foreign key (tenant_id, diner_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict;

create index carts_tenant_diner_device_session_fk_idx
  on public.carts (tenant_id, diner_device_session_id)
  where diner_device_session_id is not null;

alter table public.checkout_quotes
  add column diner_device_session_id uuid,
  add column diner_alias text,
  add column diner_display_name text,
  add foreign key (tenant_id, diner_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict,
  add check (diner_alias is null or btrim(diner_alias) <> ''),
  add check (
    diner_display_name is null
    or (
      btrim(diner_display_name) <> ''
      and length(diner_display_name) <= 60
    )
  );

create index checkout_quotes_tenant_diner_device_session_fk_idx
  on public.checkout_quotes (tenant_id, diner_device_session_id)
  where diner_device_session_id is not null;

alter table public.orders
  add column order_number bigint generated by default as identity,
  add column diner_alias text,
  add column diner_display_name text,
  add unique (tenant_id, order_number),
  add check (diner_alias is null or btrim(diner_alias) <> ''),
  add check (
    diner_display_name is null
    or (
      btrim(diner_display_name) <> ''
      and length(diner_display_name) <= 60
    )
  );

create table public.service_action_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  code text not null check (btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  description text,
  icon text not null default 'hand'
    check (icon in ('hand', 'water', 'cutlery', 'warning')),
  cooldown_seconds integer not null default 90
    check (cooldown_seconds between 15 and 3600),
  translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, venue_id, code),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict
);

create table public.diner_service_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_device_session_id uuid not null,
  table_session_id uuid not null,
  service_action_type_id uuid not null,
  status text not null default 'notified'
    check (status in ('notified', 'acknowledged', 'completed', 'cancelled')),
  deduplication_key text not null check (btrim(deduplication_key) <> ''),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, deduplication_key),
  foreign key (tenant_id, diner_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, service_action_type_id)
    references public.service_action_types (tenant_id, id) on delete restrict
);

create index diner_service_requests_device_session_fk_idx
  on public.diner_service_requests (tenant_id, diner_device_session_id);
create index diner_service_requests_table_session_fk_idx
  on public.diner_service_requests (tenant_id, table_session_id);
create index diner_service_requests_action_type_fk_idx
  on public.diner_service_requests (tenant_id, service_action_type_id);
create index diner_service_requests_active_table_idx
  on public.diner_service_requests (tenant_id, table_session_id, requested_at desc)
  where status in ('notified', 'acknowledged');

create table public.diner_waiter_payment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_device_session_id uuid not null,
  table_session_id uuid not null,
  cart_id uuid not null,
  status text not null default 'notified'
    check (status in ('notified', 'acknowledged', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, diner_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, cart_id)
    references public.carts (tenant_id, id) on delete restrict
);

comment on table public.diner_waiter_payment_requests is
  'A notification only. Creating this row never creates an Order or Ticket; production starts only after a verifiable payment confirmation.';

create unique index diner_waiter_payment_requests_one_active_cart_idx
  on public.diner_waiter_payment_requests (tenant_id, cart_id)
  where status in ('notified', 'acknowledged');
create index diner_waiter_payment_requests_device_session_fk_idx
  on public.diner_waiter_payment_requests (tenant_id, diner_device_session_id);
create index diner_waiter_payment_requests_table_session_fk_idx
  on public.diner_waiter_payment_requests (tenant_id, table_session_id);

create or replace function private.enforce_diner_device_session_lifetime()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  idle_seconds integer := 14400;
  absolute_seconds integer := 43200;
begin
  select
    settings.device_idle_ttl_seconds,
    settings.device_absolute_ttl_seconds
  into idle_seconds, absolute_seconds
  from public.tenant_diner_settings settings
  where settings.tenant_id = new.tenant_id;

  idle_seconds := coalesce(idle_seconds, 14400);
  absolute_seconds := coalesce(absolute_seconds, 43200);

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, clock_timestamp());
    new.last_seen_at := coalesce(new.last_seen_at, new.created_at);
    new.absolute_expires_at :=
      new.created_at + make_interval(secs => absolute_seconds);
  elsif new.created_at <> old.created_at
    or new.absolute_expires_at <> old.absolute_expires_at then
    raise exception 'device session absolute lifetime is immutable'
      using errcode = '23514';
  end if;

  if new.state = 'active' then
    new.idle_expires_at := least(
      new.last_seen_at + make_interval(secs => idle_seconds),
      new.absolute_expires_at
    );
  end if;
  return new;
end;
$$;

create trigger diner_device_sessions_enforce_lifetime
before insert or update on public.diner_device_sessions
for each row execute function private.enforce_diner_device_session_lifetime();

create or replace function private.snapshot_diner_identity_on_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select
    cart.diner_device_session_id,
    device.alias,
    device.display_name
  into
    new.diner_device_session_id,
    new.diner_alias,
    new.diner_display_name
  from public.carts cart
  left join public.diner_device_sessions device
    on device.tenant_id = cart.tenant_id
   and device.id = cart.diner_device_session_id
  where cart.tenant_id = new.tenant_id
    and cart.id = new.cart_id;
  return new;
end;
$$;

create trigger checkout_quotes_snapshot_diner_identity
before insert on public.checkout_quotes
for each row execute function private.snapshot_diner_identity_on_quote();

create or replace function private.snapshot_cart_item_note()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  note_value text;
begin
  select item.customer_note into note_value
  from public.cart_items item
  where item.tenant_id = new.tenant_id
    and item.id = new.source_cart_item_id;

  if note_value is not null then
    new.selected_modifiers := coalesce(new.selected_modifiers, '[]'::jsonb)
      || jsonb_build_array(
        jsonb_build_object('type', 'customer_note', 'value', note_value)
      );
  end if;
  return new;
end;
$$;

create trigger checkout_quote_items_snapshot_note
before insert on public.checkout_quote_items
for each row execute function private.snapshot_cart_item_note();

create or replace function private.snapshot_diner_identity_on_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select quote.diner_alias, quote.diner_display_name
  into new.diner_alias, new.diner_display_name
  from public.checkout_quotes quote
  where quote.tenant_id = new.tenant_id
    and quote.id = new.checkout_quote_id;
  return new;
end;
$$;

create trigger orders_snapshot_diner_identity
before insert on public.orders
for each row execute function private.snapshot_diner_identity_on_order();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_diner_settings',
    'menu_categories',
    'diner_device_sessions',
    'service_action_types',
    'diner_service_requests',
    'diner_waiter_payment_requests'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from anon, authenticated, service_role',
      table_name
    );
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

create policy tenant_diner_settings_select
on public.tenant_diner_settings for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.read'))
);
create policy tenant_diner_settings_manage
on public.tenant_diner_settings for all to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

create policy menu_categories_select
on public.menu_categories for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.read'))
);
create policy menu_categories_manage
on public.menu_categories for all to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

create policy service_action_types_select
on public.service_action_types for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.read'))
);
create policy service_action_types_manage
on public.service_action_types for all to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

create policy diner_service_requests_select
on public.diner_service_requests for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.read'))
);
create policy diner_service_requests_update
on public.diner_service_requests for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.manage'))
);

create policy diner_waiter_payment_requests_select
on public.diner_waiter_payment_requests for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.read'))
);
create policy diner_waiter_payment_requests_update
on public.diner_waiter_payment_requests for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.manage'))
);

create policy deny_direct_diner_device_session_access
on public.diner_device_sessions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

grant select, insert, update, delete
  on table public.tenant_diner_settings, public.menu_categories,
    public.service_action_types
  to authenticated;
grant select, update
  on table public.diner_service_requests,
    public.diner_waiter_payment_requests
  to authenticated;

revoke all on table public.products, public.cart_items,
  public.checkout_quotes, public.orders
  from anon;

grant usage, select on all sequences in schema public to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'menu_categories',
    'products',
    'inventory_levels',
    'diner_service_requests',
    'diner_waiter_payment_requests'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables published
      where published.pubname = 'supabase_realtime'
        and published.schemaname = 'public'
        and published.tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;
