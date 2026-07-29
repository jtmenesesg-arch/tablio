-- Sprint 9: table credit as an explicit exception and a server-calculated owner story.

insert into public.permissions (code, description)
values
  ('table_credit.read', 'Read explicitly enabled table-credit exposure.'),
  ('table_credit.open', 'Open a table-credit account with limits and reason.'),
  ('table_credit.order', 'Send an unpaid order only to an already-authorized credit account.'),
  ('table_credit.settle', 'Allocate verified or in-person payments to table credit.'),
  ('table_credit.close_loss', 'Close outstanding credit as an audited venue loss.'),
  ('table_credit.configure', 'Configure table-credit limits and expiry.'),
  ('owner_dashboard.read', 'Read server-calculated owner metrics for the active tenant.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('cashier_admin', 'table_credit.read'),
  ('cashier_admin', 'table_credit.open'),
  ('cashier_admin', 'table_credit.order'),
  ('cashier_admin', 'table_credit.settle'),
  ('cashier_admin', 'table_credit.close_loss'),
  ('cashier_admin', 'table_credit.configure'),
  ('cashier_admin', 'owner_dashboard.read'),
  ('owner', 'table_credit.read'),
  ('owner', 'table_credit.open'),
  ('owner', 'table_credit.order'),
  ('owner', 'table_credit.settle'),
  ('owner', 'table_credit.close_loss'),
  ('owner', 'table_credit.configure'),
  ('owner', 'owner_dashboard.read'),
  ('superadmin', 'table_credit.read'),
  ('superadmin', 'table_credit.open'),
  ('superadmin', 'table_credit.order'),
  ('superadmin', 'table_credit.settle'),
  ('superadmin', 'table_credit.close_loss'),
  ('superadmin', 'table_credit.configure'),
  ('superadmin', 'owner_dashboard.read')
on conflict do nothing;

create table public.tenant_table_credit_settings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  venue_id uuid not null,
  enabled boolean not null default false,
  max_per_table_clp bigint not null default 60000
    check (max_per_table_clp > 0),
  max_venue_exposure_clp bigint not null default 180000
    check (max_venue_exposure_clp >= max_per_table_clp),
  expires_after_minutes integer not null default 180
    check (expires_after_minutes between 30 and 720),
  verification_ttl_seconds integer not null default 60
    check (verification_ttl_seconds between 30 and 300),
  updated_by_user_id uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, venue_id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete cascade
);

create table public.table_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  table_id uuid not null,
  table_session_id uuid not null,
  status text not null default 'open'
    check (
      status in (
        'open',
        'bill_requested',
        'expired',
        'settled',
        'closed_with_loss',
        'cancelled'
      )
    ),
  customer_label text,
  open_reason text not null check (btrim(open_reason) <> ''),
  opened_by_user_id uuid references auth.users (id) on delete restrict,
  opened_by_employee_id uuid,
  opened_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  bill_requested_at timestamptz,
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users (id) on delete restrict,
  close_reason text,
  max_table_clp bigint not null check (max_table_clp > 0),
  charged_clp bigint not null default 0 check (charged_clp >= 0),
  paid_clp bigint not null default 0 check (paid_clp >= 0),
  written_off_clp bigint not null default 0 check (written_off_clp >= 0),
  outstanding_clp bigint not null default 0 check (outstanding_clp >= 0),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_id)
    references public.tables (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, opened_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (expires_at > opened_at),
  check (outstanding_clp = charged_clp - paid_clp - written_off_clp),
  check (
    (status in ('open', 'bill_requested', 'expired') and closed_at is null)
    or (
      status in ('settled', 'closed_with_loss', 'cancelled')
      and closed_at is not null
      and closed_at >= opened_at
    )
  ),
  check (
    (status = 'settled' and outstanding_clp = 0)
    or status <> 'settled'
  )
);

create unique index table_credit_one_live_per_session_idx
on public.table_credit_accounts (tenant_id, table_session_id)
where status in ('open', 'bill_requested', 'expired');

create index table_credit_accounts_venue_exposure_idx
on public.table_credit_accounts (tenant_id, venue_id, status, outstanding_clp);

alter table public.orders
  alter column payment_id drop not null,
  add column financial_mode text not null default 'prepaid'
    check (financial_mode in ('prepaid', 'table_credit')),
  add column table_credit_account_id uuid,
  add foreign key (tenant_id, table_credit_account_id)
    references public.table_credit_accounts (tenant_id, id) on delete restrict,
  add check (
    (financial_mode = 'prepaid'
      and payment_id is not null
      and table_credit_account_id is null)
    or
    (financial_mode = 'table_credit'
      and payment_id is null
      and table_credit_account_id is not null)
  );

create index orders_table_credit_account_fk_idx
on public.orders (tenant_id, table_credit_account_id);

create table public.table_credit_order_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  account_id uuid not null,
  order_id uuid not null,
  checkout_quote_id uuid not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  amount_clp bigint not null check (amount_clp > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, account_id, order_id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, account_id)
    references public.table_credit_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict
);

create table public.table_credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  account_id uuid not null,
  order_id uuid,
  payment_id uuid,
  entry_type text not null
    check (
      entry_type in (
        'charge',
        'digital_payment',
        'in_person_payment',
        'write_off'
      )
    ),
  amount_clp bigint not null check (amount_clp > 0),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  description text not null check (btrim(description) <> ''),
  actor_user_id uuid references auth.users (id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, account_id)
    references public.table_credit_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  check (
    (entry_type = 'charge' and order_id is not null and payment_id is null)
    or (entry_type = 'digital_payment' and payment_id is not null and order_id is null)
    or (entry_type in ('in_person_payment', 'write_off')
      and payment_id is null and order_id is null)
  )
);

create index table_credit_ledger_account_idx
on public.table_credit_ledger_entries (tenant_id, account_id, occurred_at);
create index table_credit_ledger_order_fk_idx
on public.table_credit_ledger_entries (tenant_id, order_id);
create index table_credit_ledger_payment_fk_idx
on public.table_credit_ledger_entries (tenant_id, payment_id);

create table public.table_credit_losses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  account_id uuid not null,
  cashier_shift_id uuid,
  amount_clp bigint not null check (amount_clp > 0),
  reason text not null check (btrim(reason) <> ''),
  closed_by_user_id uuid not null references auth.users (id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, account_id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, account_id)
    references public.table_credit_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict
);

create index table_credit_losses_month_idx
on public.table_credit_losses (tenant_id, venue_id, occurred_at);
create index table_credit_losses_shift_fk_idx
on public.table_credit_losses (tenant_id, cashier_shift_id);

create table public.table_credit_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  account_id uuid not null,
  code_hash bytea not null check (octet_length(code_hash) = 32),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  consumed_by_user_id uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, account_id)
    references public.table_credit_accounts (tenant_id, id) on delete restrict,
  check (expires_at > created_at),
  check (
    (consumed_at is null and consumed_by_user_id is null)
    or (consumed_at is not null and consumed_by_user_id is not null)
  )
);

create unique index table_credit_one_active_challenge_idx
on public.table_credit_verification_challenges (tenant_id, account_id)
where consumed_at is null;

create table public.cashier_closure_credit_loss_summaries (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  closure_id uuid not null,
  credit_loss_clp bigint not null check (credit_loss_clp >= 0),
  loss_count integer not null check (loss_count >= 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, closure_id),
  foreign key (tenant_id, closure_id)
    references public.cashier_shift_closures (tenant_id, id) on delete restrict
);

create or replace function private.immutable_table_credit_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'table-credit evidence is append-only' using errcode = '55000';
end;
$$;

create trigger table_credit_ledger_immutable
before update or delete on public.table_credit_ledger_entries
for each row execute function private.immutable_table_credit_evidence();

create trigger table_credit_losses_immutable
before update or delete on public.table_credit_losses
for each row execute function private.immutable_table_credit_evidence();

create trigger cashier_credit_loss_summary_immutable
before update or delete on public.cashier_closure_credit_loss_summaries
for each row execute function private.immutable_table_credit_evidence();

create or replace function private.validate_confirmed_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_state <> 'confirmed' then
    return new;
  end if;

  if new.financial_mode = 'prepaid' then
    if not exists (
      select 1
      from public.provider_payment_events event
      join public.payments payment
        on payment.tenant_id = event.tenant_id
       and payment.id = event.payment_id
      where event.tenant_id = new.tenant_id
        and payment.id = new.payment_id
        and payment.checkout_quote_id = new.checkout_quote_id
        and event.checkout_quote_id = new.checkout_quote_id
        and event.normalized_status = 'approved'
        and event.signature_verified
        and event.server_verified
        and event.amount_clp = payment.amount_clp
        and event.currency = payment.currency
    ) then
      raise exception 'confirmed prepaid order requires a server-verified approved payment'
        using errcode = '23514';
    end if;
  elsif new.financial_mode = 'table_credit' then
    if not exists (
      select 1
      from public.table_credit_accounts account
      join public.checkout_quotes quote
        on quote.tenant_id = account.tenant_id
       and quote.id = new.checkout_quote_id
      where account.tenant_id = new.tenant_id
        and account.id = new.table_credit_account_id
        and account.table_session_id = new.table_session_id
        and account.table_id = new.table_id
        and account.status = 'open'
        and account.expires_at > clock_timestamp()
        and quote.table_session_id = account.table_session_id
        and quote.table_id = account.table_id
    ) then
      raise exception 'confirmed credit order requires a live authorized table-credit account'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.table_credit_enabled(p_venue_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select settings.enabled
    from public.tenant_table_credit_settings settings
    where settings.tenant_id = private.current_tenant_id()
      and settings.venue_id = p_venue_id
  ), false);
$$;

create or replace function public.configure_table_credit(
  p_venue_id uuid,
  p_enabled boolean,
  p_max_per_table_clp bigint,
  p_max_venue_exposure_clp bigint,
  p_expires_after_minutes integer,
  p_reason text
)
returns public.tenant_table_credit_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  result public.tenant_table_credit_settings%rowtype;
begin
  if not private.has_permission(tenant, 'table_credit.configure') then
    raise exception 'table-credit configuration permission required'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'configuration reason is required' using errcode = '22023';
  end if;
  if p_max_per_table_clp <= 0
    or p_max_venue_exposure_clp < p_max_per_table_clp
    or p_expires_after_minutes not between 30 and 720 then
    raise exception 'invalid table-credit limits' using errcode = '22023';
  end if;

  insert into public.tenant_table_credit_settings (
    tenant_id, venue_id, enabled, max_per_table_clp,
    max_venue_exposure_clp, expires_after_minutes,
    updated_by_user_id, updated_at
  )
  values (
    tenant, p_venue_id, p_enabled, p_max_per_table_clp,
    p_max_venue_exposure_clp, p_expires_after_minutes,
    auth.uid(), clock_timestamp()
  )
  on conflict (tenant_id, venue_id) do update
  set enabled = excluded.enabled,
      max_per_table_clp = excluded.max_per_table_clp,
      max_venue_exposure_clp = excluded.max_venue_exposure_clp,
      expires_after_minutes = excluded.expires_after_minutes,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = excluded.updated_at
  returning * into result;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data
  )
  values (
    tenant, 'user', auth.uid(), 'table_credit.configuration_changed',
    'venue', p_venue_id, btrim(p_reason),
    jsonb_build_object(
      'enabled', p_enabled,
      'max_per_table_clp', p_max_per_table_clp,
      'max_venue_exposure_clp', p_max_venue_exposure_clp,
      'expires_after_minutes', p_expires_after_minutes
    )
  );
  return result;
end;
$$;

create or replace function public.open_table_credit(
  p_venue_id uuid,
  p_table_id uuid,
  p_table_session_id uuid,
  p_reason text,
  p_customer_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  settings public.tenant_table_credit_settings%rowtype;
  account_id uuid;
begin
  if not private.has_permission(tenant, 'table_credit.open') then
    raise exception 'table-credit open permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'open reason is required' using errcode = '22023';
  end if;

  select configured.* into settings
  from public.tenant_table_credit_settings configured
  where configured.tenant_id = tenant
    and configured.venue_id = p_venue_id
  for update;

  if not found or not settings.enabled then
    raise exception 'table credit is disabled' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.table_sessions session
    join public.tables venue_table
      on venue_table.tenant_id = session.tenant_id
     and venue_table.id = session.table_id
    where session.tenant_id = tenant
      and session.id = p_table_session_id
      and session.table_id = p_table_id
      and session.state = 'active'
      and venue_table.venue_id = p_venue_id
  ) then
    raise exception 'active table session does not match venue/table'
      using errcode = '23514';
  end if;

  insert into public.table_credit_accounts (
    tenant_id, venue_id, table_id, table_session_id,
    customer_label, open_reason, opened_by_user_id,
    expires_at, max_table_clp
  )
  values (
    tenant, p_venue_id, p_table_id, p_table_session_id,
    nullif(btrim(p_customer_label), ''), btrim(p_reason), auth.uid(),
    clock_timestamp() + make_interval(mins => settings.expires_after_minutes),
    settings.max_per_table_clp
  )
  returning id into account_id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data
  )
  values (
    tenant, 'user', auth.uid(), 'table_credit.opened',
    'table_credit_account', account_id, btrim(p_reason),
    jsonb_build_object('table_id', p_table_id, 'customer_label', p_customer_label)
  );
  return account_id;
end;
$$;

create or replace function public.create_table_credit_order(
  p_account_id uuid,
  p_checkout_quote_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  account public.table_credit_accounts%rowtype;
  settings public.tenant_table_credit_settings%rowtype;
  quote public.checkout_quotes%rowtype;
  venue_exposure bigint;
  existing_order_id uuid;
  order_id uuid := gen_random_uuid();
  stock_level record;
  happened_at timestamptz := clock_timestamp();
begin
  if not private.has_permission(tenant, 'table_credit.order') then
    raise exception 'table-credit order permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select link.order_id into existing_order_id
  from public.table_credit_order_links link
  where link.tenant_id = tenant
    and link.idempotency_key = p_idempotency_key;
  if existing_order_id is not null then return existing_order_id; end if;

  select candidate.* into account
  from public.table_credit_accounts candidate
  where candidate.tenant_id = tenant and candidate.id = p_account_id
  for update;
  if not found or account.status <> 'open' then
    raise exception 'table-credit account is not open' using errcode = '55000';
  end if;
  if account.expires_at <= happened_at then
    update public.table_credit_accounts
    set status = 'expired', version = version + 1, updated_at = happened_at
    where tenant_id = tenant and id = account.id;
    raise exception 'table-credit account expired' using errcode = '55000';
  end if;

  select configured.* into settings
  from public.tenant_table_credit_settings configured
  where configured.tenant_id = tenant
    and configured.venue_id = account.venue_id
  for update;
  if not found or not settings.enabled then
    raise exception 'table credit is disabled' using errcode = '55000';
  end if;

  select candidate.* into quote
  from public.checkout_quotes candidate
  where candidate.tenant_id = tenant and candidate.id = p_checkout_quote_id
  for update;
  if not found
    or quote.expires_at <= happened_at
    or quote.table_session_id <> account.table_session_id
    or quote.table_id <> account.table_id then
    raise exception 'live quote does not match table-credit account'
      using errcode = '23514';
  end if;
  if quote.currency <> 'CLP' or quote.total_clp <= 0 then
    raise exception 'credit order requires positive CLP quote' using errcode = '23514';
  end if;

  select coalesce(sum(open_account.outstanding_clp), 0)
    into venue_exposure
  from public.table_credit_accounts open_account
  where open_account.tenant_id = tenant
    and open_account.venue_id = account.venue_id
    and open_account.status in ('open', 'bill_requested', 'expired');

  if account.outstanding_clp + quote.total_clp > account.max_table_clp then
    raise exception 'table credit limit reached' using errcode = '23514';
  end if;
  if venue_exposure + quote.total_clp > settings.max_venue_exposure_clp then
    raise exception 'venue credit exposure limit reached' using errcode = '23514';
  end if;

  insert into public.orders (
    id, tenant_id, checkout_quote_id, payment_id, table_credit_account_id,
    financial_mode, table_session_id, table_id, current_state,
    subtotal_clp, discount_clp, tax_clp, tip_clp, total_clp,
    currency, confirmed_at, created_at, updated_at
  )
  values (
    order_id, tenant, quote.id, null, account.id,
    'table_credit', quote.table_session_id, quote.table_id, 'confirmed',
    quote.subtotal_clp, quote.discount_clp, quote.tax_clp,
    quote.tip_clp, quote.total_clp, quote.currency,
    happened_at, happened_at, happened_at
  );

  insert into public.table_credit_order_links (
    tenant_id, account_id, order_id, checkout_quote_id,
    idempotency_key, amount_clp, created_at
  )
  values (
    tenant, account.id, order_id, quote.id,
    btrim(p_idempotency_key), quote.total_clp, happened_at
  );

  insert into public.table_credit_ledger_entries (
    tenant_id, account_id, order_id, entry_type, amount_clp,
    idempotency_key, description, actor_user_id, occurred_at
  )
  values (
    tenant, account.id, order_id, 'charge', quote.total_clp,
    'credit-charge:' || order_id::text,
    'Pedido a crédito enviado a producción', auth.uid(), happened_at
  );

  update public.table_credit_accounts
  set charged_clp = charged_clp + quote.total_clp,
      outstanding_clp = outstanding_clp + quote.total_clp,
      version = version + 1,
      updated_at = happened_at
  where tenant_id = tenant and id = account.id;

  insert into public.order_state_events (
    tenant_id, order_id, state, source, occurred_at, metadata
  )
  values (
    tenant, order_id, 'confirmed', 'employee', happened_at,
    jsonb_build_object(
      'financial_mode', 'table_credit',
      'table_credit_account_id', account.id
    )
  );

  insert into public.order_items (
    tenant_id, order_id, checkout_quote_item_id, product_id, variant_id,
    station_id, product_name, variant_name, selected_modifiers, quantity,
    unit_price_clp, unit_discount_clp, unit_tax_clp, line_total_clp, created_at
  )
  select
    tenant, order_id, item.id, item.product_id, item.variant_id,
    item.station_id, item.product_name, item.variant_name,
    item.selected_modifiers, item.quantity, item.unit_price_clp,
    item.unit_discount_clp, item.unit_tax_clp, item.line_total_clp, happened_at
  from public.checkout_quote_items item
  where item.tenant_id = tenant and item.checkout_quote_id = quote.id;

  insert into public.tickets (
    tenant_id, order_id, station_id, current_state,
    queued_at, created_at, updated_at
  )
  select tenant, order_id, item.station_id, 'queued',
    happened_at, happened_at, happened_at
  from public.checkout_quote_items item
  where item.tenant_id = tenant and item.checkout_quote_id = quote.id
  group by item.station_id;

  insert into public.ticket_state_events (
    tenant_id, ticket_id, state, source, occurred_at, metadata
  )
  select tenant, ticket.id, 'queued', 'system', happened_at,
    jsonb_build_object('financial_mode', 'table_credit')
  from public.tickets ticket
  where ticket.tenant_id = tenant and ticket.order_id = order_id;

  insert into public.ticket_items (
    tenant_id, ticket_id, order_item_id, created_at
  )
  select tenant, ticket.id, order_item.id, happened_at
  from public.order_items order_item
  join public.tickets ticket
    on ticket.tenant_id = order_item.tenant_id
   and ticket.order_id = order_item.order_id
   and ticket.station_id = order_item.station_id
  where order_item.tenant_id = tenant and order_item.order_id = order_id;

  for stock_level in
    select level.id, level.product_id
    from public.inventory_levels level
    where level.tenant_id = tenant
      and exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.tenant_id = level.tenant_id
          and reservation.inventory_level_id = level.id
          and reservation.checkout_quote_id = quote.id
          and reservation.released_at is null
          and reservation.consumed_at is null
      )
    order by level.product_id, level.id
    for update
  loop null; end loop;

  with quantities as (
    select reservation.inventory_level_id,
      sum(reservation.quantity)::bigint quantity
    from public.inventory_reservations reservation
    where reservation.tenant_id = tenant
      and reservation.checkout_quote_id = quote.id
      and reservation.released_at is null
      and reservation.consumed_at is null
    group by reservation.inventory_level_id
  )
  update public.inventory_levels level
  set on_hand_quantity = level.on_hand_quantity - quantities.quantity,
      reserved_quantity = level.reserved_quantity - quantities.quantity
  from quantities
  where level.tenant_id = tenant
    and level.id = quantities.inventory_level_id;

  update public.inventory_reservations
  set consumed_at = happened_at
  where tenant_id = tenant
    and checkout_quote_id = quote.id
    and released_at is null
    and consumed_at is null;

  update public.carts
  set state = 'converted_to_order', updated_at = happened_at
  where tenant_id = tenant and id = quote.cart_id;

  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic,
    deduplication_key, payload, available_at, created_at
  )
  values
    (
      tenant, 'order', order_id, 'kds.order_confirmed_backup',
      'order:' || order_id::text || ':kds',
      jsonb_build_object('order_id', order_id, 'financial_mode', 'table_credit'),
      happened_at, happened_at
    ),
    (
      tenant, 'order', order_id, 'print.order_confirmed',
      'order:' || order_id::text || ':print',
      jsonb_build_object('order_id', order_id, 'financial_mode', 'table_credit'),
      happened_at, happened_at
    ),
    (
      tenant, 'order', order_id, 'tax_document.order_confirmed',
      'order:' || order_id::text || ':tax-document',
      jsonb_build_object('order_id', order_id, 'financial_mode', 'table_credit'),
      happened_at, happened_at
    ),
    (
      tenant, 'table_credit_account', account.id, 'table_credit.exposure_changed',
      'credit-account:' || account.id::text || ':order:' || order_id::text,
      jsonb_build_object(
        'account_id', account.id,
        'order_id', order_id,
        'outstanding_clp', account.outstanding_clp + quote.total_clp
      ),
      happened_at, happened_at
    );

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data, occurred_at
  )
  values (
    tenant, 'user', auth.uid(), 'table_credit.order_created',
    'order', order_id, 'Pedido autorizado contra crédito abierto',
    jsonb_build_object(
      'account_id', account.id,
      'quote_id', quote.id,
      'amount_clp', quote.total_clp
    ),
    happened_at
  );
  return order_id;
end;
$$;

create or replace function public.record_table_credit_payment(
  p_account_id uuid,
  p_amount_clp bigint,
  p_method text,
  p_idempotency_key text,
  p_payment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  account public.table_credit_accounts%rowtype;
  entry_id uuid;
  happened_at timestamptz := clock_timestamp();
begin
  if not private.has_permission(tenant, 'table_credit.settle') then
    raise exception 'table-credit settlement permission required' using errcode = '42501';
  end if;
  select entry.id into entry_id
  from public.table_credit_ledger_entries entry
  where entry.tenant_id = tenant
    and entry.idempotency_key = p_idempotency_key;
  if entry_id is not null then return entry_id; end if;

  select candidate.* into account
  from public.table_credit_accounts candidate
  where candidate.tenant_id = tenant and candidate.id = p_account_id
  for update;
  if not found or account.status not in ('open', 'bill_requested', 'expired') then
    raise exception 'table-credit account cannot receive payment' using errcode = '55000';
  end if;
  if p_amount_clp <= 0 or p_amount_clp > account.outstanding_clp then
    raise exception 'payment exceeds outstanding table credit' using errcode = '23514';
  end if;
  if p_method not in ('digital', 'in_person') then
    raise exception 'unsupported table-credit payment method' using errcode = '22023';
  end if;
  if p_method = 'digital' and not exists (
    select 1
    from public.provider_payment_events event
    join public.payments payment
      on payment.tenant_id = event.tenant_id and payment.id = event.payment_id
    where event.tenant_id = tenant
      and event.payment_id = p_payment_id
      and event.normalized_status = 'approved'
      and event.signature_verified
      and event.server_verified
      and event.amount_clp = p_amount_clp
      and payment.amount_clp = p_amount_clp
  ) then
    raise exception 'digital credit payment requires server-verified approval'
      using errcode = '23514';
  end if;
  if p_method = 'in_person' and p_payment_id is not null then
    raise exception 'in-person credit payment cannot reference provider payment'
      using errcode = '23514';
  end if;

  insert into public.table_credit_ledger_entries (
    tenant_id, account_id, payment_id, entry_type, amount_clp,
    idempotency_key, description, actor_user_id, occurred_at
  )
  values (
    tenant, account.id, p_payment_id,
    case when p_method = 'digital' then 'digital_payment' else 'in_person_payment' end,
    p_amount_clp, btrim(p_idempotency_key),
    case when p_method = 'digital'
      then 'Pago digital confirmado server-side'
      else 'Pago presencial registrado por caja' end,
    auth.uid(), happened_at
  )
  returning id into entry_id;

  update public.table_credit_accounts
  set paid_clp = paid_clp + p_amount_clp,
      outstanding_clp = outstanding_clp - p_amount_clp,
      status = case
        when outstanding_clp = p_amount_clp then 'settled'
        else status end,
      closed_at = case
        when outstanding_clp = p_amount_clp then happened_at
        else closed_at end,
      closed_by_user_id = case
        when outstanding_clp = p_amount_clp then auth.uid()
        else closed_by_user_id end,
      close_reason = case
        when outstanding_clp = p_amount_clp then 'Saldo pagado completamente'
        else close_reason end,
      version = version + 1,
      updated_at = happened_at
  where tenant_id = tenant and id = account.id;

  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic,
    deduplication_key, payload, available_at, created_at
  )
  values (
    tenant, 'table_credit_account', account.id,
    'print.table_credit_payment_receipt',
    'credit-payment-receipt:' || entry_id::text,
    jsonb_build_object(
      'account_id', account.id,
      'ledger_entry_id', entry_id,
      'amount_clp', p_amount_clp,
      'method', p_method
    ),
    happened_at, happened_at
  );
  return entry_id;
end;
$$;

create or replace function public.request_table_credit_bill(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
begin
  if not private.has_permission(tenant, 'table_credit.read') then
    raise exception 'table-credit read permission required' using errcode = '42501';
  end if;
  update public.table_credit_accounts
  set status = 'bill_requested',
      bill_requested_at = clock_timestamp(),
      version = version + 1,
      updated_at = clock_timestamp()
  where tenant_id = tenant and id = p_account_id and status = 'open';
  if not found then
    raise exception 'open table-credit account not found' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.close_table_credit_with_loss(
  p_account_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  account public.table_credit_accounts%rowtype;
  shift_id uuid;
  loss_id uuid;
  happened_at timestamptz := clock_timestamp();
begin
  if not private.has_permission(tenant, 'table_credit.close_loss') then
    raise exception 'table-credit loss permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'loss reason is required' using errcode = '22023';
  end if;

  select candidate.* into account
  from public.table_credit_accounts candidate
  where candidate.tenant_id = tenant and candidate.id = p_account_id
  for update;
  if not found
    or account.status not in ('open', 'bill_requested', 'expired')
    or account.outstanding_clp <= 0 then
    raise exception 'outstanding table credit not found' using errcode = '55000';
  end if;

  select shift.id into shift_id
  from public.cashier_shifts shift
  where shift.tenant_id = tenant
    and shift.venue_id = account.venue_id
    and shift.status = 'open'
  order by shift.opened_at desc limit 1;

  insert into public.table_credit_ledger_entries (
    tenant_id, account_id, entry_type, amount_clp,
    idempotency_key, description, actor_user_id, occurred_at
  )
  values (
    tenant, account.id, 'write_off', account.outstanding_clp,
    'credit-loss:' || account.id::text,
    'Fuga asumida por el local: ' || btrim(p_reason),
    auth.uid(), happened_at
  );

  insert into public.table_credit_losses (
    tenant_id, venue_id, account_id, cashier_shift_id,
    amount_clp, reason, closed_by_user_id, occurred_at
  )
  values (
    tenant, account.venue_id, account.id, shift_id,
    account.outstanding_clp, btrim(p_reason), auth.uid(), happened_at
  )
  returning id into loss_id;

  update public.table_credit_accounts
  set written_off_clp = written_off_clp + outstanding_clp,
      outstanding_clp = 0,
      status = 'closed_with_loss',
      closed_at = happened_at,
      closed_by_user_id = auth.uid(),
      close_reason = btrim(p_reason),
      version = version + 1,
      updated_at = happened_at
  where tenant_id = tenant and id = account.id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data, occurred_at
  )
  values (
    tenant, 'user', auth.uid(), 'table_credit.closed_with_loss',
    'table_credit_account', account.id, btrim(p_reason),
    jsonb_build_object(
      'loss_id', loss_id,
      'amount_clp', account.outstanding_clp,
      'cashier_shift_id', shift_id
    ),
    happened_at
  );
  return loss_id;
end;
$$;

create or replace function private.materialize_credit_loss_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cashier_closure_credit_loss_summaries (
    tenant_id, closure_id, credit_loss_clp, loss_count
  )
  select
    new.tenant_id,
    new.id,
    coalesce(sum(loss.amount_clp), 0),
    count(loss.id)::integer
  from public.table_credit_losses loss
  where loss.tenant_id = new.tenant_id
    and loss.cashier_shift_id = new.cashier_shift_id;
  return new;
end;
$$;

create trigger cashier_closure_add_credit_loss
after insert on public.cashier_shift_closures
for each row execute function private.materialize_credit_loss_closure();

create or replace function public.issue_table_credit_verification(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  settings public.tenant_table_credit_settings%rowtype;
  account public.table_credit_accounts%rowtype;
  challenge_id uuid;
  code text;
  deadline timestamptz;
begin
  if not private.has_permission(tenant, 'table_credit.read') then
    raise exception 'table-credit read permission required' using errcode = '42501';
  end if;
  select candidate.* into account
  from public.table_credit_accounts candidate
  where candidate.tenant_id = tenant and candidate.id = p_account_id
  for update;
  if not found or account.status <> 'settled' or account.outstanding_clp <> 0 then
    raise exception 'verification requires settled table credit' using errcode = '55000';
  end if;
  select configured.* into settings
  from public.tenant_table_credit_settings configured
  where configured.tenant_id = tenant and configured.venue_id = account.venue_id;

  delete from public.table_credit_verification_challenges challenge
  where challenge.tenant_id = tenant
    and challenge.account_id = account.id
    and challenge.consumed_at is null;

  code := lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
  deadline := clock_timestamp()
    + make_interval(secs => coalesce(settings.verification_ttl_seconds, 60));
  insert into public.table_credit_verification_challenges (
    tenant_id, account_id, code_hash, expires_at, created_by_user_id
  )
  values (
    tenant, account.id,
    extensions.digest(convert_to(code, 'UTF8'), 'sha256'),
    deadline, auth.uid()
  )
  returning id into challenge_id;
  return jsonb_build_object(
    'challenge_id', challenge_id,
    'code', code,
    'expires_at', deadline
  );
end;
$$;

create or replace function public.validate_table_credit_verification(
  p_account_id uuid,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  challenge_id uuid;
begin
  if not private.has_permission(tenant, 'table_credit.read') then
    raise exception 'table-credit read permission required' using errcode = '42501';
  end if;
  update public.table_credit_verification_challenges challenge
  set consumed_at = clock_timestamp(),
      consumed_by_user_id = auth.uid()
  where challenge.tenant_id = tenant
    and challenge.account_id = p_account_id
    and challenge.consumed_at is null
    and challenge.expires_at > clock_timestamp()
    and challenge.code_hash =
      extensions.digest(convert_to(p_code, 'UTF8'), 'sha256')
  returning challenge.id into challenge_id;
  return challenge_id is not null;
end;
$$;

create or replace view public.table_credit_operational_summary
with (security_invoker = true)
as
select
  account.tenant_id,
  account.venue_id,
  account.id account_id,
  account.table_id,
  account.table_session_id,
  account.status,
  account.customer_label,
  account.opened_at,
  account.expires_at,
  account.bill_requested_at,
  account.charged_clp,
  account.paid_clp,
  account.outstanding_clp,
  coalesce((
    select sum(order_record.total_clp)
    from public.orders order_record
    where order_record.tenant_id = account.tenant_id
      and order_record.table_session_id = account.table_session_id
      and order_record.financial_mode = 'prepaid'
  ), 0)::bigint prepaid_by_app_clp,
  account.outstanding_clp >= account.max_table_clp at_table_limit,
  account.status = 'expired' or account.expires_at <= clock_timestamp() overdue
from public.table_credit_accounts account;

create or replace view public.owner_monthly_credit_loss
with (security_invoker = true)
as
select
  loss.tenant_id,
  loss.venue_id,
  date_trunc('month', loss.occurred_at) as loss_month,
  sum(loss.amount_clp)::bigint loss_clp,
  count(*)::integer loss_count
from public.table_credit_losses loss
group by loss.tenant_id, loss.venue_id, date_trunc('month', loss.occurred_at);

create or replace function public.owner_dashboard_summary(
  p_venue_id uuid default null,
  p_from timestamptz default date_trunc('day', clock_timestamp()),
  p_to timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  result jsonb;
begin
  if not private.has_permission(tenant, 'owner_dashboard.read') then
    raise exception 'owner dashboard permission required' using errcode = '42501';
  end if;
  if p_from >= p_to then
    raise exception 'invalid owner dashboard period' using errcode = '22023';
  end if;
  if p_venue_id is not null and not exists (
    select 1 from public.venues venue
    where venue.tenant_id = tenant and venue.id = p_venue_id
  ) then
    raise exception 'venue does not belong to active tenant' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'tenant_id', tenant,
    'venue_id', p_venue_id,
    'from', p_from,
    'to', p_to,
    'sales_clp', coalesce(sum(order_record.total_clp), 0),
    'order_count', count(order_record.id),
    'average_ticket_clp', case
      when count(order_record.id) = 0 then 0
      else floor(coalesce(sum(order_record.total_clp), 0) / count(order_record.id))
    end,
    'prepaid_sales_clp', coalesce(sum(order_record.total_clp)
      filter (where order_record.financial_mode = 'prepaid'), 0),
    'credit_sales_clp', coalesce(sum(order_record.total_clp)
      filter (where order_record.financial_mode = 'table_credit'), 0),
    'monthly_credit_loss_clp', coalesce((
      select sum(loss.amount_clp)
      from public.table_credit_losses loss
      where loss.tenant_id = tenant
        and (p_venue_id is null or loss.venue_id = p_venue_id)
        and loss.occurred_at >= date_trunc('month', p_to)
        and loss.occurred_at < date_trunc('month', p_to) + interval '1 month'
    ), 0),
    'unresolved_exceptions', (
      select count(*)
      from public.reconciliation_exceptions exception_record
      where exception_record.tenant_id = tenant
        and exception_record.status in ('open', 'in_review', 'escalated')
    ),
    'history_starts_at', (
      select min(candidate.created_at)
      from public.orders candidate
      where candidate.tenant_id = tenant
    ),
    'hourly_sales', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hour',
          hourly.hour_bucket,
          'sales_clp',
          hourly.sales_clp
        )
        order by hourly.hour_bucket
      )
      from (
        select date_trunc('hour', candidate.confirmed_at) as hour_bucket,
          sum(candidate.total_clp)::bigint sales_clp
        from public.orders candidate
        join public.tables venue_table
          on venue_table.tenant_id = candidate.tenant_id
         and venue_table.id = candidate.table_id
        where candidate.tenant_id = tenant
          and (p_venue_id is null or venue_table.venue_id = p_venue_id)
          and candidate.confirmed_at >= p_from
          and candidate.confirmed_at < p_to
        group by date_trunc('hour', candidate.confirmed_at)
      ) hourly
    ), '[]'::jsonb)
  ) into result
  from public.orders order_record
  join public.tables venue_table
    on venue_table.tenant_id = order_record.tenant_id
   and venue_table.id = order_record.table_id
  where order_record.tenant_id = tenant
    and (p_venue_id is null or venue_table.venue_id = p_venue_id)
    and order_record.confirmed_at >= p_from
    and order_record.confirmed_at < p_to;
  return result;
end;
$$;

alter table public.tenant_table_credit_settings enable row level security;
alter table public.tenant_table_credit_settings force row level security;
alter table public.table_credit_accounts enable row level security;
alter table public.table_credit_accounts force row level security;
alter table public.table_credit_order_links enable row level security;
alter table public.table_credit_order_links force row level security;
alter table public.table_credit_ledger_entries enable row level security;
alter table public.table_credit_ledger_entries force row level security;
alter table public.table_credit_losses enable row level security;
alter table public.table_credit_losses force row level security;
alter table public.table_credit_verification_challenges enable row level security;
alter table public.table_credit_verification_challenges force row level security;
alter table public.cashier_closure_credit_loss_summaries enable row level security;
alter table public.cashier_closure_credit_loss_summaries force row level security;

create policy table_credit_settings_select
on public.tenant_table_credit_settings for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'table_credit.read'))
);

create policy table_credit_accounts_select
on public.table_credit_accounts for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'table_credit.read'))
);

create policy table_credit_order_links_select
on public.table_credit_order_links for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'table_credit.read'))
);

create policy table_credit_ledger_select
on public.table_credit_ledger_entries for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'table_credit.read'))
);

create policy table_credit_losses_select
on public.table_credit_losses for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (
    (select private.has_permission(tenant_id, 'table_credit.read'))
    or (select private.has_permission(tenant_id, 'owner_dashboard.read'))
  )
);

create policy table_credit_challenges_select
on public.table_credit_verification_challenges for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'table_credit.read'))
);

create policy cashier_credit_loss_summary_select
on public.cashier_closure_credit_loss_summaries for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (
    (select private.has_permission(tenant_id, 'cashier.read'))
    or (select private.has_permission(tenant_id, 'owner_dashboard.read'))
  )
);

grant select on table
  public.tenant_table_credit_settings,
  public.table_credit_accounts,
  public.table_credit_order_links,
  public.table_credit_ledger_entries,
  public.table_credit_losses,
  public.table_credit_verification_challenges,
  public.cashier_closure_credit_loss_summaries
to authenticated;

grant select on
  public.table_credit_operational_summary,
  public.owner_monthly_credit_loss
to authenticated;

revoke execute on function
  public.configure_table_credit(uuid,boolean,bigint,bigint,integer,text),
  public.open_table_credit(uuid,uuid,uuid,text,text),
  public.create_table_credit_order(uuid,uuid,text),
  public.record_table_credit_payment(uuid,bigint,text,text,uuid),
  public.request_table_credit_bill(uuid),
  public.close_table_credit_with_loss(uuid,text),
  public.issue_table_credit_verification(uuid),
  public.validate_table_credit_verification(uuid,text),
  public.owner_dashboard_summary(uuid,timestamptz,timestamptz)
from public, anon;

grant execute on function
  public.configure_table_credit(uuid,boolean,bigint,bigint,integer,text),
  public.open_table_credit(uuid,uuid,uuid,text,text),
  public.create_table_credit_order(uuid,uuid,text),
  public.record_table_credit_payment(uuid,bigint,text,text,uuid),
  public.request_table_credit_bill(uuid),
  public.close_table_credit_with_loss(uuid,text),
  public.issue_table_credit_verification(uuid),
  public.validate_table_credit_verification(uuid,text),
  public.owner_dashboard_summary(uuid,timestamptz,timestamptz)
to authenticated;

grant execute on function public.table_credit_enabled(uuid)
to authenticated;

comment on table public.table_credit_accounts is
  'Explicit exception only. Prepaid remains the default; this account tracks only unpaid production.';
comment on column public.orders.financial_mode is
  'prepaid requires verified provider approval; table_credit requires a live explicitly authorized account.';
comment on view public.table_credit_operational_summary is
  'Keeps prepaid app payments and outstanding table credit visibly separate for the same table.';
comment on function public.owner_dashboard_summary(uuid,timestamptz,timestamptz) is
  'All owner figures are aggregated server-side after tenant/RLS validation.';
