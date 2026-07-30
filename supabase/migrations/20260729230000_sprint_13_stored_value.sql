-- Sprint 13: saldo prepagado / giftcard del bar.
-- Tablio orquesta el libro; el dinero cargado pertenece al comercio del bar.
-- La función nace apagada y bloqueada para producción hasta revisión legal.

insert into public.permissions (code, description)
values
  ('stored_value.read', 'Leer saldos, movimientos y pasivo del tenant.'),
  ('stored_value.manage', 'Configurar, ajustar y devolver saldo con auditoría.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('cashier_admin', 'stored_value.read'),
  ('cashier_admin', 'stored_value.manage'),
  ('owner', 'stored_value.read'),
  ('owner', 'stored_value.manage'),
  ('superadmin', 'stored_value.read'),
  ('superadmin', 'stored_value.manage')
on conflict do nothing;

create table public.tenant_stored_value_settings (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  enabled boolean not null default false,
  production_validated boolean not null default false,
  max_consumer_balance_clp bigint not null default 40000
    check (max_consumer_balance_clp between 1000 and 1000000),
  max_venue_liability_clp bigint
    check (max_venue_liability_clp is null or max_venue_liability_clp >= 0),
  superadmin_alert_threshold_clp bigint not null default 500000
    check (superadmin_alert_threshold_clp >= 0),
  bonus_bps integer not null default 0 check (bonus_bps between 0 and 10000),
  consumption_order text not null default 'bonus_first_fefo'
    check (
      consumption_order in (
        'bonus_first_fefo',
        'loaded_money_first_fefo'
      )
    ),
  loaded_money_validity_days integer
    check (
      loaded_money_validity_days is null
      or loaded_money_validity_days between 1 and 3650
    ),
  bonus_validity_days integer
    check (
      bonus_validity_days is null
      or bonus_validity_days between 1 and 3650
    ),
  expiry_warning_days integer not null default 7
    check (expiry_warning_days between 1 and 90),
  policy_version integer not null default 1 check (policy_version > 0),
  legal_tax_hypothesis boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (not production_validated or enabled)
);

create trigger tenant_stored_value_settings_set_updated_at
before update on public.tenant_stored_value_settings
for each row execute function private.set_updated_at();

create table public.stored_value_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'frozen_for_recovery', 'wind_down', 'closed')),
  consented_at timestamptz not null,
  consent_policy_version text not null check (btrim(consent_policy_version) <> ''),
  recovery_reference_hash bytea,
  frozen_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, diner_profile_id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  check (
    recovery_reference_hash is null
    or octet_length(recovery_reference_hash) = 32
  )
);

create trigger stored_value_accounts_set_updated_at
before update on public.stored_value_accounts
for each row execute function private.set_updated_at();

create table public.stored_value_topup_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  checkout_quote_id uuid not null,
  stored_value_account_id uuid not null,
  loaded_money_clp bigint not null check (loaded_money_clp > 0),
  bonus_clp bigint not null default 0 check (bonus_clp >= 0),
  policy_version integer not null check (policy_version > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, checkout_quote_id),
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, stored_value_account_id)
    references public.stored_value_accounts (tenant_id, id) on delete restrict,
  check (expires_at > created_at)
);

create table public.stored_value_lots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  stored_value_account_id uuid not null,
  bucket text not null check (bucket in ('loaded_money', 'bonus')),
  original_clp bigint not null check (original_clp > 0),
  source_topup_quote_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, stored_value_account_id)
    references public.stored_value_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_topup_quote_id)
    references public.stored_value_topup_quotes (tenant_id, id) on delete restrict
);

create table public.stored_value_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  stored_value_account_id uuid not null,
  stored_value_lot_id uuid not null,
  bucket text not null check (bucket in ('loaded_money', 'bonus')),
  entry_type text not null
    check (
      entry_type in (
        'topup_loaded_money',
        'topup_bonus',
        'order_consumption',
        'order_refund',
        'topup_refund',
        'expiry',
        'manual_adjustment'
      )
    ),
  amount_clp bigint not null check (amount_clp <> 0),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  checkout_quote_id uuid,
  order_id uuid,
  payment_id uuid,
  refund_id uuid,
  actor_employee_id uuid,
  reason text,
  occurred_at timestamptz not null default clock_timestamp(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, stored_value_account_id)
    references public.stored_value_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, stored_value_lot_id)
    references public.stored_value_lots (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, refund_id)
    references public.refunds (tenant_id, id) on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    entry_type <> 'manual_adjustment'
    or (actor_employee_id is not null and nullif(btrim(reason), '') is not null)
  )
);

create table public.stored_value_quote_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  checkout_quote_id uuid not null,
  stored_value_account_id uuid not null,
  stored_value_lot_id uuid not null,
  bucket text not null check (bucket in ('loaded_money', 'bonus')),
  amount_clp bigint not null check (amount_clp > 0),
  policy_version integer not null check (policy_version > 0),
  reserved_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  consumed_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, checkout_quote_id, stored_value_lot_id),
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, stored_value_account_id)
    references public.stored_value_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, stored_value_lot_id)
    references public.stored_value_lots (tenant_id, id) on delete restrict,
  check (released_at is null or consumed_at is null)
);

create table public.stored_value_topup_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  stored_value_topup_quote_id uuid not null,
  stored_value_account_id uuid not null,
  payment_id uuid not null,
  provider_payment_event_id uuid not null,
  loaded_money_clp bigint not null check (loaded_money_clp > 0),
  bonus_clp bigint not null default 0 check (bonus_clp >= 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, stored_value_topup_quote_id),
  unique (tenant_id, payment_id),
  foreign key (tenant_id, stored_value_topup_quote_id)
    references public.stored_value_topup_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, stored_value_account_id)
    references public.stored_value_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, provider_payment_event_id)
    references public.provider_payment_events (tenant_id, id) on delete restrict
);

create table public.stored_value_topup_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  topup_receipt_id uuid not null,
  refund_id uuid not null,
  actor_employee_id uuid not null,
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, topup_receipt_id),
  unique (tenant_id, refund_id),
  foreign key (tenant_id, topup_receipt_id)
    references public.stored_value_topup_receipts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, refund_id)
    references public.refunds (tenant_id, id) on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

create table public.stored_value_manual_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  stored_value_account_id uuid not null,
  ledger_entry_id uuid not null,
  actor_employee_id uuid not null,
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, ledger_entry_id),
  foreign key (tenant_id, stored_value_account_id)
    references public.stored_value_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, ledger_entry_id)
    references public.stored_value_ledger_entries (tenant_id, id) on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

create table public.stored_value_expiry_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  stored_value_account_id uuid not null,
  stored_value_lot_id uuid not null,
  warning_days integer not null check (warning_days between 1 and 90),
  sent_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, stored_value_lot_id, warning_days),
  foreign key (tenant_id, stored_value_account_id)
    references public.stored_value_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, stored_value_lot_id)
    references public.stored_value_lots (tenant_id, id) on delete restrict
);

alter table public.orders
  add column stored_value_applied_clp bigint not null default 0
    check (stored_value_applied_clp >= 0),
  add column external_payment_clp bigint not null default 0
    check (external_payment_clp >= 0),
  add column stored_value_policy_version integer
    check (stored_value_policy_version is null or stored_value_policy_version > 0);

alter table public.cashier_shift_closures
  add column stored_value_topups_cash_in_clp bigint not null default 0
    check (stored_value_topups_cash_in_clp >= 0),
  add column stored_value_consumed_revenue_clp bigint not null default 0
    check (stored_value_consumed_revenue_clp >= 0),
  add column stored_value_expired_clp bigint not null default 0
    check (stored_value_expired_clp >= 0),
  add column stored_value_liability_clp bigint not null default 0
    check (stored_value_liability_clp >= 0);

create index stored_value_accounts_profile_fk_idx
  on public.stored_value_accounts (tenant_id, diner_profile_id);
create index stored_value_lots_account_fk_idx
  on public.stored_value_lots (tenant_id, stored_value_account_id, expires_at);
create index stored_value_lots_topup_fk_idx
  on public.stored_value_lots (tenant_id, source_topup_quote_id);
create index stored_value_ledger_account_idx
  on public.stored_value_ledger_entries
  (tenant_id, stored_value_account_id, occurred_at desc);
create index stored_value_ledger_lot_fk_idx
  on public.stored_value_ledger_entries (tenant_id, stored_value_lot_id);
create index stored_value_ledger_quote_fk_idx
  on public.stored_value_ledger_entries (tenant_id, checkout_quote_id);
create index stored_value_ledger_order_fk_idx
  on public.stored_value_ledger_entries (tenant_id, order_id);
create index stored_value_ledger_payment_fk_idx
  on public.stored_value_ledger_entries (tenant_id, payment_id);
create index stored_value_ledger_refund_fk_idx
  on public.stored_value_ledger_entries (tenant_id, refund_id);
create index stored_value_ledger_actor_fk_idx
  on public.stored_value_ledger_entries (tenant_id, actor_employee_id);
create index stored_value_allocations_quote_idx
  on public.stored_value_quote_allocations (tenant_id, checkout_quote_id);
create index stored_value_allocations_account_fk_idx
  on public.stored_value_quote_allocations
  (tenant_id, stored_value_account_id);
create index stored_value_allocations_lot_fk_idx
  on public.stored_value_quote_allocations (tenant_id, stored_value_lot_id);
create index stored_value_receipts_account_fk_idx
  on public.stored_value_topup_receipts (tenant_id, stored_value_account_id);
create index stored_value_receipts_event_fk_idx
  on public.stored_value_topup_receipts
  (tenant_id, provider_payment_event_id);
create index stored_value_refunds_actor_fk_idx
  on public.stored_value_topup_refunds (tenant_id, actor_employee_id);
create index stored_value_adjustments_account_fk_idx
  on public.stored_value_manual_adjustments
  (tenant_id, stored_value_account_id);
create index stored_value_adjustments_actor_fk_idx
  on public.stored_value_manual_adjustments (tenant_id, actor_employee_id);
create index stored_value_expiry_account_fk_idx
  on public.stored_value_expiry_notifications
  (tenant_id, stored_value_account_id);
create index stored_value_expiry_lot_fk_idx
  on public.stored_value_expiry_notifications
  (tenant_id, stored_value_lot_id);

create or replace function private.prevent_stored_value_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stored-value evidence is append-only' using errcode = '55000';
end;
$$;

create trigger stored_value_topup_quotes_immutable
before update or delete on public.stored_value_topup_quotes
for each row execute function private.prevent_stored_value_evidence_mutation();
create trigger stored_value_lots_immutable
before update or delete on public.stored_value_lots
for each row execute function private.prevent_stored_value_evidence_mutation();
create trigger stored_value_ledger_entries_immutable
before update or delete on public.stored_value_ledger_entries
for each row execute function private.prevent_stored_value_evidence_mutation();
create trigger stored_value_topup_receipts_immutable
before update or delete on public.stored_value_topup_receipts
for each row execute function private.prevent_stored_value_evidence_mutation();
create trigger stored_value_topup_refunds_immutable
before update or delete on public.stored_value_topup_refunds
for each row execute function private.prevent_stored_value_evidence_mutation();
create trigger stored_value_manual_adjustments_immutable
before update or delete on public.stored_value_manual_adjustments
for each row execute function private.prevent_stored_value_evidence_mutation();
create trigger stored_value_expiry_notifications_immutable
before update or delete on public.stored_value_expiry_notifications
for each row execute function private.prevent_stored_value_evidence_mutation();

create or replace function private.stored_value_account_balance(
  p_tenant_id uuid,
  p_stored_value_account_id uuid,
  p_bucket text default null
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(entry.amount_clp), 0)::bigint
  from public.stored_value_ledger_entries entry
  where entry.tenant_id = p_tenant_id
    and entry.stored_value_account_id = p_stored_value_account_id
    and (p_bucket is null or entry.bucket = p_bucket);
$$;

create or replace view public.stored_value_account_balances
with (security_invoker = true)
as
select
  account.tenant_id,
  account.id as stored_value_account_id,
  account.diner_profile_id,
  account.status,
  coalesce(sum(entry.amount_clp)
    filter (where entry.bucket = 'loaded_money'), 0)::bigint
    as loaded_money_clp,
  coalesce(sum(entry.amount_clp)
    filter (where entry.bucket = 'bonus'), 0)::bigint as bonus_clp,
  coalesce(sum(entry.amount_clp), 0)::bigint as balance_clp,
  max(entry.occurred_at) as last_movement_at
from public.stored_value_accounts account
left join public.stored_value_ledger_entries entry
  on entry.tenant_id = account.tenant_id
 and entry.stored_value_account_id = account.id
group by account.tenant_id, account.id;

create or replace view public.tenant_stored_value_liabilities
with (security_invoker = true)
as
select
  settings.tenant_id,
  coalesce(sum(balance.loaded_money_clp), 0)::bigint
    as loaded_money_liability_clp,
  coalesce(sum(balance.bonus_clp), 0)::bigint as bonus_liability_clp,
  coalesce(sum(balance.balance_clp), 0)::bigint as total_liability_clp,
  settings.max_venue_liability_clp,
  settings.superadmin_alert_threshold_clp,
  coalesce(sum(balance.balance_clp), 0)
    >= settings.superadmin_alert_threshold_clp as superadmin_alert
from public.tenant_stored_value_settings settings
left join public.stored_value_account_balances balance
  on balance.tenant_id = settings.tenant_id
group by
  settings.tenant_id,
  settings.max_venue_liability_clp,
  settings.superadmin_alert_threshold_clp;

create or replace view public.owner_stored_value_metrics
with (security_invoker = true)
as
select
  entry.tenant_id,
  sum(entry.amount_clp)
    filter (where entry.entry_type = 'topup_loaded_money')::bigint
    as topups_cash_in_clp,
  -sum(entry.amount_clp)
    filter (where entry.entry_type = 'order_consumption')::bigint
    as consumed_revenue_clp,
  -sum(entry.amount_clp)
    filter (where entry.entry_type = 'expiry')::bigint as expired_clp
from public.stored_value_ledger_entries entry
group by entry.tenant_id;

create or replace function public.superadmin_stored_value_liabilities()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_status text,
  loaded_money_liability_clp bigint,
  bonus_liability_clp bigint,
  total_liability_clp bigint,
  alert_threshold_clp bigint,
  alert boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_superadmin() then
    raise exception 'platform superadmin required' using errcode = '42501';
  end if;
  return query
  select
    tenant.id,
    tenant.display_name,
    tenant.status,
    liability.loaded_money_liability_clp,
    liability.bonus_liability_clp,
    liability.total_liability_clp,
    liability.superadmin_alert_threshold_clp,
    liability.superadmin_alert
  from public.tenants tenant
  join public.tenant_stored_value_liabilities liability
    on liability.tenant_id = tenant.id
  order by liability.total_liability_clp desc, tenant.display_name;
end;
$$;

create or replace function private.external_payment_due(
  p_tenant_id uuid,
  p_checkout_quote_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    0,
    quote.total_clp - coalesce(sum(allocation.amount_clp), 0)
  )::bigint
  from public.checkout_quotes quote
  left join public.stored_value_quote_allocations allocation
    on allocation.tenant_id = quote.tenant_id
   and allocation.checkout_quote_id = quote.id
   and allocation.released_at is null
  where quote.tenant_id = p_tenant_id
    and quote.id = p_checkout_quote_id
  group by quote.total_clp;
$$;

create or replace function private.reserve_stored_value_for_quote(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_stored_value_account_id uuid,
  p_requested_clp bigint,
  p_now timestamptz default clock_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_record public.tenant_stored_value_settings%rowtype;
  account_record public.stored_value_accounts%rowtype;
  quote_record public.checkout_quotes%rowtype;
  lot_record record;
  remaining bigint;
  available bigint;
  applied bigint := 0;
begin
  if p_requested_clp < 0 then
    raise exception 'requested stored value must be non-negative'
      using errcode = '22023';
  end if;
  select * into settings_record
  from public.tenant_stored_value_settings
  where tenant_id = p_tenant_id and enabled
  for share;
  if not found then
    raise exception 'stored value is disabled' using errcode = '55000';
  end if;
  select * into account_record
  from public.stored_value_accounts
  where tenant_id = p_tenant_id
    and id = p_stored_value_account_id
    and status in ('active', 'wind_down')
  for update;
  if not found then
    raise exception 'stored value account unavailable' using errcode = '55000';
  end if;
  select * into quote_record
  from public.checkout_quotes
  where tenant_id = p_tenant_id and id = p_checkout_quote_id
  for share;
  if not found or quote_record.expires_at <= p_now then
    raise exception 'quote is missing or expired' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.stored_value_quote_allocations allocation
    where allocation.tenant_id = p_tenant_id
      and allocation.checkout_quote_id = p_checkout_quote_id
  ) then
    select coalesce(sum(amount_clp), 0)::bigint into applied
    from public.stored_value_quote_allocations
    where tenant_id = p_tenant_id
      and checkout_quote_id = p_checkout_quote_id
      and released_at is null;
    return applied;
  end if;
  remaining := least(p_requested_clp, quote_record.total_clp);
  for lot_record in
    select
      lot.id,
      lot.bucket,
      greatest(
        0,
        coalesce(sum(entry.amount_clp), 0)
        - coalesce((
          select sum(reserved.amount_clp)
          from public.stored_value_quote_allocations reserved
          join public.checkout_quotes reserved_quote
            on reserved_quote.tenant_id = reserved.tenant_id
           and reserved_quote.id = reserved.checkout_quote_id
          where reserved.tenant_id = lot.tenant_id
            and reserved.stored_value_lot_id = lot.id
            and reserved.released_at is null
            and reserved.consumed_at is null
            and reserved_quote.expires_at > p_now
        ), 0)
      )::bigint as available_clp,
      lot.expires_at
    from public.stored_value_lots lot
    left join public.stored_value_ledger_entries entry
      on entry.tenant_id = lot.tenant_id
     and entry.stored_value_lot_id = lot.id
    where lot.tenant_id = p_tenant_id
      and lot.stored_value_account_id = p_stored_value_account_id
      and (lot.expires_at is null or lot.expires_at > p_now)
    group by lot.tenant_id, lot.id
    order by
      case
        when settings_record.consumption_order = 'bonus_first_fefo'
          and lot.bucket = 'bonus' then 0
        when settings_record.consumption_order = 'loaded_money_first_fefo'
          and lot.bucket = 'loaded_money' then 0
        else 1
      end,
      lot.expires_at asc nulls last,
      lot.created_at,
      lot.id
  loop
    exit when remaining = 0;
    available := least(remaining, lot_record.available_clp);
    if available > 0 then
      insert into public.stored_value_quote_allocations (
        tenant_id, checkout_quote_id, stored_value_account_id,
        stored_value_lot_id, bucket, amount_clp, policy_version, reserved_at
      )
      values (
        p_tenant_id, p_checkout_quote_id, p_stored_value_account_id,
        lot_record.id, lot_record.bucket, available,
        settings_record.policy_version, p_now
      );
      remaining := remaining - available;
      applied := applied + available;
    end if;
  end loop;
  if applied < least(p_requested_clp, quote_record.total_clp) then
    raise exception 'insufficient stored value' using errcode = '55000';
  end if;
  return applied;
end;
$$;

create or replace function private.release_stored_value_quote(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.stored_value_quote_allocations
  set released_at = p_now
  where tenant_id = p_tenant_id
    and checkout_quote_id = p_checkout_quote_id
    and released_at is null
    and consumed_at is null;
$$;

create or replace function private.snapshot_and_consume_stored_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocation_record record;
begin
  select
    coalesce(sum(allocation.amount_clp), 0)::bigint,
    max(allocation.policy_version)
  into new.stored_value_applied_clp, new.stored_value_policy_version
  from public.stored_value_quote_allocations allocation
  where allocation.tenant_id = new.tenant_id
    and allocation.checkout_quote_id = new.checkout_quote_id
    and allocation.released_at is null;
  new.external_payment_clp :=
    new.total_clp - new.stored_value_applied_clp;
  return new;
end;
$$;

create trigger orders_snapshot_stored_value
before insert on public.orders
for each row execute function private.snapshot_and_consume_stored_value();

create or replace function private.consume_stored_value_after_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocation_record record;
begin
  for allocation_record in
    select allocation.*
    from public.stored_value_quote_allocations allocation
    where allocation.tenant_id = new.tenant_id
      and allocation.checkout_quote_id = new.checkout_quote_id
      and allocation.released_at is null
      and allocation.consumed_at is null
    for update
  loop
    insert into public.stored_value_ledger_entries (
      tenant_id, stored_value_account_id, stored_value_lot_id, bucket,
      entry_type, amount_clp, idempotency_key, checkout_quote_id,
      order_id, payment_id, occurred_at
    )
    values (
      new.tenant_id, allocation_record.stored_value_account_id,
      allocation_record.stored_value_lot_id, allocation_record.bucket,
      'order_consumption', -allocation_record.amount_clp,
      'stored-value:consume:' || new.checkout_quote_id::text || ':'
        || allocation_record.stored_value_lot_id::text,
      new.checkout_quote_id, new.id, new.payment_id, new.confirmed_at
    )
    on conflict (tenant_id, idempotency_key) do nothing;
    update public.stored_value_quote_allocations
    set consumed_at = new.confirmed_at
    where tenant_id = new.tenant_id and id = allocation_record.id;
  end loop;
  return new;
end;
$$;

create trigger orders_consume_stored_value
after insert on public.orders
for each row execute function private.consume_stored_value_after_order();

create or replace function private.confirm_stored_value_topup(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_payment_id uuid,
  p_provider_payment_event_id uuid,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  topup public.stored_value_topup_quotes%rowtype;
  settings_record public.tenant_stored_value_settings%rowtype;
  account_balance bigint;
  venue_liability bigint;
  money_lot_id uuid;
  bonus_lot_id uuid;
  receipt_id uuid;
  exception_id uuid;
begin
  select * into topup
  from public.stored_value_topup_quotes
  where tenant_id = p_tenant_id and checkout_quote_id = p_checkout_quote_id
  for update;
  if not found then
    raise exception 'stored value top-up quote missing' using errcode = '55000';
  end if;
  if topup.expires_at <= p_received_at then
    exception_id := private.add_reconciliation_exception(
      p_tenant_id, p_payment_id, p_provider_payment_event_id, null,
      'stored_value_topup_approved_after_expiry',
      'stored-value-topup-expired:' || p_checkout_quote_id::text,
      'critical', true, true,
      'requiere decisión: reembolsar la recarga aprobada fuera de plazo',
      array['refund', 'investigate'],
      jsonb_build_object('topup_quote_expires_at', topup.expires_at),
      p_received_at
    );
    return jsonb_build_object(
      'outcome', 'topup_reconciliation_exception',
      'exception_id', exception_id
    );
  end if;
  select * into settings_record
  from public.tenant_stored_value_settings
  where tenant_id = p_tenant_id
  for share;
  select private.stored_value_account_balance(
    p_tenant_id, topup.stored_value_account_id
  ) into account_balance;
  select coalesce(sum(entry.amount_clp), 0)::bigint into venue_liability
  from public.stored_value_ledger_entries entry
  where entry.tenant_id = p_tenant_id;
  if not settings_record.enabled
    or not settings_record.production_validated
    or account_balance + topup.loaded_money_clp + topup.bonus_clp
      > settings_record.max_consumer_balance_clp
    or (
      settings_record.max_venue_liability_clp is not null
      and venue_liability + topup.loaded_money_clp + topup.bonus_clp
        > settings_record.max_venue_liability_clp
    ) then
    exception_id := private.add_reconciliation_exception(
      p_tenant_id, p_payment_id, p_provider_payment_event_id, null,
      'stored_value_topup_requires_review',
      'stored-value-topup:' || p_checkout_quote_id::text,
      'critical', true, true,
      'requiere decisión: reembolsar la recarga o aprobar manualmente',
      array['refund', 'investigate'],
      jsonb_build_object(
        'production_validated', settings_record.production_validated,
        'consumer_balance_clp', account_balance,
        'venue_liability_clp', venue_liability
      ),
      p_received_at
    );
    return jsonb_build_object(
      'outcome', 'topup_reconciliation_exception',
      'exception_id', exception_id
    );
  end if;
  select receipt.id into receipt_id
  from public.stored_value_topup_receipts receipt
  where receipt.tenant_id = p_tenant_id
    and receipt.stored_value_topup_quote_id = topup.id;
  if receipt_id is not null then
    return jsonb_build_object(
      'outcome', 'duplicate_topup_ignored',
      'receipt_id', receipt_id
    );
  end if;
  money_lot_id := gen_random_uuid();
  insert into public.stored_value_lots (
    id, tenant_id, stored_value_account_id, bucket, original_clp,
    source_topup_quote_id, expires_at, created_at
  )
  values (
    money_lot_id, p_tenant_id, topup.stored_value_account_id,
    'loaded_money', topup.loaded_money_clp, topup.id,
    case when settings_record.loaded_money_validity_days is null then null
      else p_received_at
        + make_interval(days => settings_record.loaded_money_validity_days)
    end,
    p_received_at
  );
  insert into public.stored_value_ledger_entries (
    tenant_id, stored_value_account_id, stored_value_lot_id, bucket,
    entry_type, amount_clp, idempotency_key, checkout_quote_id,
    payment_id, occurred_at
  )
  values (
    p_tenant_id, topup.stored_value_account_id, money_lot_id, 'loaded_money',
    'topup_loaded_money', topup.loaded_money_clp,
    'stored-value:topup:' || topup.id::text || ':money',
    p_checkout_quote_id, p_payment_id, p_received_at
  );
  if topup.bonus_clp > 0 then
    bonus_lot_id := gen_random_uuid();
    insert into public.stored_value_lots (
      id, tenant_id, stored_value_account_id, bucket, original_clp,
      source_topup_quote_id, expires_at, created_at
    )
    values (
      bonus_lot_id, p_tenant_id, topup.stored_value_account_id,
      'bonus', topup.bonus_clp, topup.id,
      case when settings_record.bonus_validity_days is null then null
        else p_received_at
          + make_interval(days => settings_record.bonus_validity_days)
      end,
      p_received_at
    );
    insert into public.stored_value_ledger_entries (
      tenant_id, stored_value_account_id, stored_value_lot_id, bucket,
      entry_type, amount_clp, idempotency_key, checkout_quote_id,
      payment_id, occurred_at
    )
    values (
      p_tenant_id, topup.stored_value_account_id, bonus_lot_id, 'bonus',
      'topup_bonus', topup.bonus_clp,
      'stored-value:topup:' || topup.id::text || ':bonus',
      p_checkout_quote_id, p_payment_id, p_received_at
    );
  end if;
  receipt_id := gen_random_uuid();
  insert into public.stored_value_topup_receipts (
    id, tenant_id, stored_value_topup_quote_id, stored_value_account_id,
    payment_id, provider_payment_event_id, loaded_money_clp, bonus_clp,
    created_at
  )
  values (
    receipt_id, p_tenant_id, topup.id, topup.stored_value_account_id,
    p_payment_id, p_provider_payment_event_id, topup.loaded_money_clp,
    topup.bonus_clp, p_received_at
  );
  return jsonb_build_object(
    'outcome', 'stored_value_topup_confirmed',
    'receipt_id', receipt_id
  );
end;
$$;

create or replace function private.release_checkout(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
begin
  released := private.release_quote_stock(
    p_tenant_id, p_checkout_quote_id, p_reason, p_now
  );
  perform private.release_stored_value_quote(
    p_tenant_id, p_checkout_quote_id, p_now
  );
  update public.carts cart
  set state = case
    when p_reason = 'quote_expired' then 'expired'
    else 'open'
  end
  from public.checkout_quotes quote
  where quote.tenant_id = p_tenant_id
    and quote.id = p_checkout_quote_id
    and cart.tenant_id = quote.tenant_id
    and cart.id = quote.cart_id
    and cart.state = 'checkout_started';
  return released;
end;
$$;

create or replace function public.superadmin_set_stored_value_alert_threshold(
  p_tenant_id uuid,
  p_threshold_clp bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_superadmin() then
    raise exception 'platform superadmin required' using errcode = '42501';
  end if;
  if p_threshold_clp < 0 or nullif(btrim(p_reason), '') is null then
    raise exception 'valid threshold and reason required' using errcode = '22023';
  end if;
  update public.tenant_stored_value_settings
  set superadmin_alert_threshold_clp = p_threshold_clp
  where tenant_id = p_tenant_id;
  if not found then
    raise exception 'stored value settings missing' using errcode = 'P0002';
  end if;
  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id,
    reason, after_data
  )
  values (
    p_tenant_id, 'platform', auth.uid(),
    'stored_value.superadmin_threshold_changed',
    'tenant_stored_value_settings', p_tenant_id,
    btrim(p_reason),
    jsonb_build_object(
      'threshold_clp', p_threshold_clp,
      'changed_by_platform', true
    )
  );
end;
$$;

-- Adapt the existing financial core without weakening its server-side checks:
-- ordinary orders compare the provider amount with the external remainder;
-- top-up quotes credit the ledger and never create an Order or tickets.
do $$
declare
  function_definition text;
begin
  function_definition := pg_get_functiondef(
    'private.create_payment_intent(uuid,uuid,uuid,text,text,timestamptz)'
      ::regprocedure
  );
  function_definition := replace(
    function_definition,
    'quote_record.total_clp, quote_record.currency, p_now',
    'private.external_payment_due(p_tenant_id, p_checkout_quote_id), quote_record.currency, p_now'
  );
  execute function_definition;

  function_definition := pg_get_functiondef(
    'private.confirm_provider_payment_event(uuid,text,text,text,text,text,bigint,text,text,uuid,boolean,boolean,timestamptz,timestamptz,jsonb)'
      ::regprocedure
  );
  function_definition := replace(
    function_definition,
    'p_amount_clp is distinct from quote_record.total_clp',
    'p_amount_clp is distinct from private.external_payment_due(p_tenant_id, quote_record.id)'
  );
  function_definition := replace(
    function_definition,
    '''expected_amount_clp'', quote_record.total_clp',
    '''expected_amount_clp'', private.external_payment_due(p_tenant_id, quote_record.id)'
  );
  function_definition := replace(
    function_definition,
    '  if quote_record.expires_at <= p_received_at then',
    $branch$
  if exists (
    select 1 from public.stored_value_topup_quotes topup
    where topup.tenant_id = p_tenant_id
      and topup.checkout_quote_id = quote_record.id
  ) then
    return private.confirm_stored_value_topup(
      p_tenant_id, quote_record.id, payment_record.id,
      inserted_provider_event_id, p_received_at
    );
  end if;

  if quote_record.expires_at <= p_received_at then$branch$
  );
  execute function_definition;
end;
$$;

create or replace function private.prevent_tenant_delete_with_stored_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  outstanding bigint;
begin
  select coalesce(sum(entry.amount_clp), 0)::bigint into outstanding
  from public.stored_value_ledger_entries entry
  where entry.tenant_id = old.id;
  if outstanding > 0 then
    raise exception
      'tenant has outstanding stored-value liability: % CLP', outstanding
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create trigger tenants_block_delete_with_stored_value
before delete on public.tenants
for each row execute function private.prevent_tenant_delete_with_stored_value();

alter table public.tenant_stored_value_settings enable row level security;
alter table public.tenant_stored_value_settings force row level security;
alter table public.stored_value_accounts enable row level security;
alter table public.stored_value_accounts force row level security;
alter table public.stored_value_topup_quotes enable row level security;
alter table public.stored_value_topup_quotes force row level security;
alter table public.stored_value_lots enable row level security;
alter table public.stored_value_lots force row level security;
alter table public.stored_value_ledger_entries enable row level security;
alter table public.stored_value_ledger_entries force row level security;
alter table public.stored_value_quote_allocations enable row level security;
alter table public.stored_value_quote_allocations force row level security;
alter table public.stored_value_topup_receipts enable row level security;
alter table public.stored_value_topup_receipts force row level security;
alter table public.stored_value_topup_refunds enable row level security;
alter table public.stored_value_topup_refunds force row level security;
alter table public.stored_value_manual_adjustments enable row level security;
alter table public.stored_value_manual_adjustments force row level security;
alter table public.stored_value_expiry_notifications enable row level security;
alter table public.stored_value_expiry_notifications force row level security;

create policy stored_value_settings_staff_select
on public.tenant_stored_value_settings for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_settings_staff_insert
on public.tenant_stored_value_settings for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.manage'))
);
create policy stored_value_settings_staff_update
on public.tenant_stored_value_settings for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.manage'))
);

create policy stored_value_accounts_staff_select
on public.stored_value_accounts for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_topup_quotes_staff_select
on public.stored_value_topup_quotes for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_lots_staff_select
on public.stored_value_lots for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_ledger_staff_select
on public.stored_value_ledger_entries for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_allocations_staff_select
on public.stored_value_quote_allocations for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_receipts_staff_select
on public.stored_value_topup_receipts for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_refunds_staff_select
on public.stored_value_topup_refunds for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_adjustments_staff_select
on public.stored_value_manual_adjustments for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);
create policy stored_value_expiry_staff_select
on public.stored_value_expiry_notifications for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'stored_value.read'))
);

revoke all on
  public.tenant_stored_value_settings,
  public.stored_value_accounts,
  public.stored_value_topup_quotes,
  public.stored_value_lots,
  public.stored_value_ledger_entries,
  public.stored_value_quote_allocations,
  public.stored_value_topup_receipts,
  public.stored_value_topup_refunds,
  public.stored_value_manual_adjustments,
  public.stored_value_expiry_notifications
from public, anon, authenticated;

grant select on
  public.tenant_stored_value_settings,
  public.stored_value_accounts,
  public.stored_value_topup_quotes,
  public.stored_value_lots,
  public.stored_value_ledger_entries,
  public.stored_value_quote_allocations,
  public.stored_value_topup_receipts,
  public.stored_value_topup_refunds,
  public.stored_value_manual_adjustments,
  public.stored_value_expiry_notifications,
  public.stored_value_account_balances,
  public.tenant_stored_value_liabilities,
  public.owner_stored_value_metrics
to authenticated;

revoke all on function public.superadmin_stored_value_liabilities()
from public, anon, authenticated;
grant execute on function public.superadmin_stored_value_liabilities()
to authenticated;
revoke all on function
  public.superadmin_set_stored_value_alert_threshold(uuid,bigint,text)
from public, anon, authenticated;
grant execute on function
  public.superadmin_set_stored_value_alert_threshold(uuid,bigint,text)
to authenticated;

revoke all on function
  private.stored_value_account_balance(uuid,uuid,text),
  private.external_payment_due(uuid,uuid),
  private.reserve_stored_value_for_quote(uuid,uuid,uuid,bigint,timestamptz),
  private.release_stored_value_quote(uuid,uuid,timestamptz),
  private.confirm_stored_value_topup(uuid,uuid,uuid,uuid,timestamptz)
from public, anon, authenticated;

comment on table public.tenant_stored_value_settings is
  'Saldo por tenant. Default individual 40.000 CLP; apagado y bloqueado para producción.';
comment on table public.stored_value_ledger_entries is
  'Libro append-only: dinero cargado y bono nunca se mezclan.';
comment on view public.tenant_stored_value_liabilities is
  'Pasivo del bar con dinero/bono separados; no representa caja disponible.';
