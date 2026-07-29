-- Sprint 11: tenant-scoped recurring diner identity and loyalty.
-- Contact data and recovery credentials live in private; public tables expose
-- only operational aliases, consent evidence and financial loyalty facts.

alter table public.products
  add column unit_cost_clp bigint
    check (unit_cost_clp is null or unit_cost_clp >= 0);

create table public.tenant_loyalty_programs (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  enabled boolean not null default false,
  visits_required integer not null default 5
    check (visits_required between 2 and 50),
  reward_product_id uuid,
  visit_minimum_clp bigint not null default 5000
    check (visit_minimum_clp >= 0),
  max_visits_per_day integer not null default 1
    check (max_visits_per_day between 1 and 10),
  max_stamps_per_payment integer not null default 1
    check (max_stamps_per_payment between 1 and 5),
  stamp_validity_days integer
    check (stamp_validity_days is null or stamp_validity_days between 1 and 1825),
  eligible_weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  eligible_start_time time not null default '00:00',
  eligible_end_time time not null default '23:59:59',
  dormant_after_days integer not null default 45
    check (dormant_after_days between 7 and 730),
  commercial_hypothesis boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, reward_product_id)
    references public.products (tenant_id, id) on delete restrict,
  check (
    (not enabled)
    or reward_product_id is not null
  ),
  check (
    cardinality(eligible_weekdays) between 1 and 7
    and eligible_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

create table public.diner_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  program_alias text not null
    check (btrim(program_alias) <> '' and length(program_alias) <= 40),
  status text not null default 'active'
    check (status in ('active', 'anonymized')),
  identification_consented_at timestamptz not null,
  identification_revoked_at timestamptz,
  contact_consented_at timestamptz,
  contact_revoked_at timestamptz,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, program_alias),
  check (
    (status = 'active' and anonymized_at is null)
    or (status = 'anonymized' and anonymized_at is not null)
  ),
  check (
    identification_revoked_at is null
    or identification_revoked_at >= identification_consented_at
  ),
  check (
    contact_revoked_at is null
    or (
      contact_consented_at is not null
      and contact_revoked_at >= contact_consented_at
    )
  )
);

create table private.diner_profile_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  channel text not null check (channel in ('email', 'phone')),
  lookup_hash bytea not null check (octet_length(lookup_hash) = 32),
  encrypted_value bytea not null check (octet_length(encrypted_value) >= 16),
  masked_value text not null
    check (btrim(masked_value) <> '' and length(masked_value) <= 120),
  verified_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, channel, lookup_hash),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict
);

create table private.diner_identity_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  credential_hash bytea not null check (octet_length(credential_hash) = 32),
  state text not null default 'active'
    check (state in ('active', 'revoked', 'lost')),
  issued_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  loss_reported_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, credential_hash),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict
);

create table private.diner_recovery_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid,
  channel text not null check (channel in ('email', 'phone')),
  contact_lookup_hash bytea not null
    check (octet_length(contact_lookup_hash) = 32),
  code_hash bytea not null check (octet_length(code_hash) = 32),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  check (expires_at > created_at)
);

create table public.diner_consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  consent_type text not null check (consent_type in ('identification', 'contact')),
  action text not null check (action in ('granted', 'revoked')),
  policy_version text not null check (btrim(policy_version) <> ''),
  clear_text_snapshot text not null check (btrim(clear_text_snapshot) <> ''),
  actor_type text not null check (actor_type in ('diner', 'employee', 'system')),
  actor_employee_id uuid,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    (actor_type = 'employee' and actor_employee_id is not null)
    or (actor_type <> 'employee' and actor_employee_id is null)
  )
);

create table public.diner_identity_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  diner_device_session_id uuid,
  event_type text not null check (
    event_type in (
      'enrolled',
      'device_recognized',
      'token_missing_recovered_self',
      'token_missing_recovered_assisted',
      'credential_revoked',
      'profile_anonymized'
    )
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, diner_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict
);

alter table public.diner_device_sessions
  add column diner_profile_id uuid,
  add foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict;

create table public.loyalty_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  payment_id uuid not null,
  order_id uuid not null,
  eligible_amount_clp bigint not null check (eligible_amount_clp >= 0),
  stamp_count integer not null check (stamp_count > 0),
  state text not null default 'counted'
    check (state in ('counted', 'reversed')),
  eligibility_reason text not null check (btrim(eligibility_reason) <> ''),
  occurred_at timestamptz not null,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, payment_id),
  unique (tenant_id, order_id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict
);

create table public.loyalty_reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  product_id uuid not null,
  cart_id uuid not null,
  checkout_quote_id uuid,
  checkout_quote_item_id uuid,
  order_id uuid,
  order_item_id uuid,
  state text not null default 'reserved'
    check (state in ('reserved', 'redeemed', 'restored', 'cancelled')),
  stamp_cost integer not null check (stamp_cost > 0),
  reference_unit_price_clp bigint not null
    check (reference_unit_price_clp >= 0),
  unit_cost_snapshot_clp bigint
    check (unit_cost_snapshot_clp is null or unit_cost_snapshot_clp >= 0),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  reserved_at timestamptz not null default now(),
  redeemed_at timestamptz,
  restored_at timestamptz,
  cancelled_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, checkout_quote_item_id),
  unique (tenant_id, order_item_id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict,
  foreign key (tenant_id, cart_id)
    references public.carts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_item_id)
    references public.checkout_quote_items (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_item_id)
    references public.order_items (tenant_id, id) on delete restrict
);

alter table public.cart_items
  add column loyalty_reward_redemption_id uuid,
  add foreign key (tenant_id, loyalty_reward_redemption_id)
    references public.loyalty_reward_redemptions (tenant_id, id)
    on delete restrict;

alter table public.checkout_quotes
  add column diner_profile_id uuid,
  add column loyalty_reward_reference_clp bigint not null default 0
    check (loyalty_reward_reference_clp >= 0),
  add column loyalty_reward_known_cost_clp bigint
    check (
      loyalty_reward_known_cost_clp is null
      or loyalty_reward_known_cost_clp >= 0
    ),
  add foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict;

alter table public.checkout_quote_items
  add column is_loyalty_reward boolean not null default false,
  add column loyalty_reward_redemption_id uuid,
  add column reference_unit_price_clp bigint
    check (reference_unit_price_clp is null or reference_unit_price_clp >= 0),
  add column unit_cost_snapshot_clp bigint
    check (unit_cost_snapshot_clp is null or unit_cost_snapshot_clp >= 0),
  add foreign key (tenant_id, loyalty_reward_redemption_id)
    references public.loyalty_reward_redemptions (tenant_id, id)
    on delete restrict,
  add check (
    (
      not is_loyalty_reward
      and loyalty_reward_redemption_id is null
      and reference_unit_price_clp is null
      and unit_cost_snapshot_clp is null
    )
    or (
      is_loyalty_reward
      and loyalty_reward_redemption_id is not null
      and reference_unit_price_clp is not null
      and unit_price_clp = 0
      and unit_discount_clp = 0
      and unit_tax_clp = 0
      and line_total_clp = 0
    )
  );

alter table public.orders
  add column diner_profile_id uuid,
  add column loyalty_reward_reference_clp bigint not null default 0
    check (loyalty_reward_reference_clp >= 0),
  add column loyalty_reward_known_cost_clp bigint
    check (
      loyalty_reward_known_cost_clp is null
      or loyalty_reward_known_cost_clp >= 0
    ),
  add foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict;

alter table public.order_items
  add column is_loyalty_reward boolean not null default false,
  add column loyalty_reward_redemption_id uuid,
  add column reference_unit_price_clp bigint
    check (reference_unit_price_clp is null or reference_unit_price_clp >= 0),
  add column unit_cost_snapshot_clp bigint
    check (unit_cost_snapshot_clp is null or unit_cost_snapshot_clp >= 0),
  add foreign key (tenant_id, loyalty_reward_redemption_id)
    references public.loyalty_reward_redemptions (tenant_id, id)
    on delete restrict,
  add check (
    (
      not is_loyalty_reward
      and loyalty_reward_redemption_id is null
      and reference_unit_price_clp is null
      and unit_cost_snapshot_clp is null
    )
    or (
      is_loyalty_reward
      and loyalty_reward_redemption_id is not null
      and reference_unit_price_clp is not null
      and unit_price_clp = 0
      and unit_discount_clp = 0
      and unit_tax_clp = 0
      and line_total_clp = 0
    )
  );

create table public.loyalty_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  loyalty_visit_id uuid,
  reward_redemption_id uuid,
  entry_type text not null check (
    entry_type in (
      'stamp_earned',
      'stamp_reversed',
      'reward_redeemed',
      'reward_restored',
      'assisted_adjustment',
      'expired'
    )
  ),
  stamp_delta integer not null check (stamp_delta <> 0),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  actor_type text not null check (actor_type in ('system', 'employee')),
  actor_employee_id uuid,
  reason text,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, loyalty_visit_id)
    references public.loyalty_visits (tenant_id, id) on delete restrict,
  foreign key (tenant_id, reward_redemption_id)
    references public.loyalty_reward_redemptions (tenant_id, id)
    on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    (actor_type = 'employee' and actor_employee_id is not null)
    or (actor_type = 'system' and actor_employee_id is null)
  ),
  check (
    entry_type <> 'assisted_adjustment'
    or (actor_employee_id is not null and btrim(reason) <> '')
  )
);

create table public.loyalty_assisted_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  employee_id uuid not null,
  employee_session_id uuid,
  ledger_entry_id uuid not null,
  stamp_delta integer not null check (stamp_delta <> 0),
  reason text not null check (btrim(reason) <> ''),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, ledger_entry_id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_session_id)
    references public.employee_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, ledger_entry_id)
    references public.loyalty_ledger_entries (tenant_id, id)
    on delete restrict
);

create table public.loyalty_refund_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  refund_id uuid not null,
  loyalty_visit_id uuid,
  reward_redemption_id uuid,
  action text not null check (action in ('visit_reversed', 'reward_restored')),
  stamp_delta integer not null check (stamp_delta <> 0),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, refund_id, action, loyalty_visit_id, reward_redemption_id),
  foreign key (tenant_id, refund_id)
    references public.refunds (tenant_id, id) on delete restrict,
  foreign key (tenant_id, loyalty_visit_id)
    references public.loyalty_visits (tenant_id, id) on delete restrict,
  foreign key (tenant_id, reward_redemption_id)
    references public.loyalty_reward_redemptions (tenant_id, id)
    on delete restrict
);

create table public.loyalty_dormant_segment_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_profile_id uuid not null,
  segment_run_id uuid not null,
  inactive_since timestamptz not null,
  contact_allowed boolean not null,
  recorded_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, segment_run_id, diner_profile_id),
  foreign key (tenant_id, diner_profile_id)
    references public.diner_profiles (tenant_id, id) on delete restrict
);

alter table public.cashier_shift_closures
  add column loyalty_reward_reference_clp bigint not null default 0
    check (loyalty_reward_reference_clp >= 0),
  add column loyalty_reward_known_cost_clp bigint
    check (
      loyalty_reward_known_cost_clp is null
      or loyalty_reward_known_cost_clp >= 0
    );

create index diner_profiles_tenant_status_idx
  on public.diner_profiles (tenant_id, status, last_visit_at desc);
create index diner_profile_contacts_profile_idx
  on private.diner_profile_contacts (tenant_id, diner_profile_id);
create index diner_identity_credentials_profile_idx
  on private.diner_identity_credentials (tenant_id, diner_profile_id, state);
create index diner_recovery_challenges_lookup_idx
  on private.diner_recovery_challenges (
    tenant_id, channel, contact_lookup_hash, expires_at desc
  );
create index diner_consent_events_profile_idx
  on public.diner_consent_events (tenant_id, diner_profile_id, occurred_at desc);
create index diner_identity_events_metric_idx
  on public.diner_identity_events (tenant_id, event_type, occurred_at desc);
create index diner_device_sessions_profile_idx
  on public.diner_device_sessions (tenant_id, diner_profile_id)
  where diner_profile_id is not null;
create index loyalty_visits_profile_idx
  on public.loyalty_visits (tenant_id, diner_profile_id, occurred_at desc);
create index loyalty_redemptions_profile_idx
  on public.loyalty_reward_redemptions (
    tenant_id, diner_profile_id, state, reserved_at desc
  );
create index cart_items_reward_idx
  on public.cart_items (tenant_id, loyalty_reward_redemption_id)
  where loyalty_reward_redemption_id is not null;
create index checkout_quotes_profile_idx
  on public.checkout_quotes (tenant_id, diner_profile_id, created_at desc)
  where diner_profile_id is not null;
create index checkout_quote_items_reward_idx
  on public.checkout_quote_items (
    tenant_id, loyalty_reward_redemption_id
  ) where is_loyalty_reward;
create index orders_profile_idx
  on public.orders (tenant_id, diner_profile_id, confirmed_at desc)
  where diner_profile_id is not null;
create index order_items_reward_idx
  on public.order_items (tenant_id, loyalty_reward_redemption_id)
  where is_loyalty_reward;
create index loyalty_ledger_profile_idx
  on public.loyalty_ledger_entries (
    tenant_id, diner_profile_id, occurred_at, id
  );
create index loyalty_assisted_profile_idx
  on public.loyalty_assisted_adjustments (
    tenant_id, diner_profile_id, occurred_at desc
  );
create index loyalty_refund_refund_idx
  on public.loyalty_refund_adjustments (tenant_id, refund_id);
create index loyalty_dormant_run_idx
  on public.loyalty_dormant_segment_entries (
    tenant_id, segment_run_id, recorded_at
  );

insert into public.permissions (code, description)
values
  ('loyalty.read', 'Leer identidad seudónima, sellos y métricas del tenant.'),
  ('loyalty.manage', 'Configurar fidelización y ejecutar ajustes auditados.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('cashier_admin', 'loyalty.read'),
  ('cashier_admin', 'loyalty.manage'),
  ('owner', 'loyalty.read'),
  ('owner', 'loyalty.manage'),
  ('superadmin', 'loyalty.read'),
  ('superadmin', 'loyalty.manage'),
  ('waiter', 'loyalty.read'),
  ('kds', 'loyalty.read')
on conflict do nothing;

create or replace function private.prevent_loyalty_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'loyalty evidence is append-only' using errcode = '55000';
end;
$$;

create or replace function private.loyalty_balance(
  p_tenant_id uuid,
  p_diner_profile_id uuid
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum(entry.stamp_delta), 0)::integer
  from public.loyalty_ledger_entries entry
  where entry.tenant_id = p_tenant_id
    and entry.diner_profile_id = p_diner_profile_id;
$$;

create or replace function private.prepare_loyalty_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id uuid;
  reward_subtotal bigint;
  reward_tax bigint;
  reward_reference bigint;
  reward_known_cost bigint;
  reward_count integer;
begin
  select device.diner_profile_id
    into profile_id
  from public.carts cart
  left join public.diner_device_sessions device
    on device.tenant_id = cart.tenant_id
   and device.id = cart.diner_device_session_id
  where cart.tenant_id = new.tenant_id
    and cart.id = new.cart_id;

  new.diner_profile_id := profile_id;

  select
    coalesce(sum(product.unit_price_clp * item.quantity), 0)::bigint,
    coalesce(sum(
      round(product.unit_price_clp * product.tax_rate_bps::numeric / 10000)
      * item.quantity
    ), 0)::bigint,
    coalesce(sum(
      (
        product.unit_price_clp
        + round(product.unit_price_clp * product.tax_rate_bps::numeric / 10000)
      ) * item.quantity
    ), 0)::bigint,
    case
      when bool_and(product.unit_cost_clp is not null)
        then sum(product.unit_cost_clp * item.quantity)::bigint
      else null
    end,
    count(*)::integer
  into
    reward_subtotal,
    reward_tax,
    reward_reference,
    reward_known_cost,
    reward_count
  from public.cart_items item
  join public.loyalty_reward_redemptions redemption
    on redemption.tenant_id = item.tenant_id
   and redemption.id = item.loyalty_reward_redemption_id
   and redemption.cart_id = item.cart_id
   and redemption.product_id = item.product_id
   and redemption.state = 'reserved'
  join public.products product
    on product.tenant_id = item.tenant_id
   and product.id = item.product_id
  where item.tenant_id = new.tenant_id
    and item.cart_id = new.cart_id;

  if reward_count > 0 and profile_id is null then
    raise exception 'loyalty reward requires a consented diner profile'
      using errcode = '23514';
  end if;

  if reward_count > 1 then
    raise exception 'only one loyalty reward is allowed per checkout'
      using errcode = '23514';
  end if;

  if reward_count > 0 then
    if new.subtotal_clp <= reward_subtotal then
      raise exception 'loyalty reward must accompany a paid item'
        using errcode = '23514';
    end if;
    new.subtotal_clp := new.subtotal_clp - reward_subtotal;
    new.tax_clp := new.tax_clp - reward_tax;
    new.total_clp :=
      new.subtotal_clp - new.discount_clp + new.tax_clp + new.tip_clp;
    new.loyalty_reward_reference_clp := reward_reference;
    new.loyalty_reward_known_cost_clp := reward_known_cost;
  end if;
  return new;
end;
$$;

create or replace function private.snapshot_loyalty_quote_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  redemption public.loyalty_reward_redemptions%rowtype;
begin
  select reward.* into redemption
  from public.cart_items item
  join public.loyalty_reward_redemptions reward
    on reward.tenant_id = item.tenant_id
   and reward.id = item.loyalty_reward_redemption_id
  where item.tenant_id = new.tenant_id
    and item.id = new.source_cart_item_id
    and reward.state = 'reserved';

  if redemption.id is null then
    return new;
  end if;

  if redemption.product_id <> new.product_id or new.quantity <> 1 then
    raise exception 'loyalty reward item changed before quote'
      using errcode = '23514';
  end if;

  new.is_loyalty_reward := true;
  new.loyalty_reward_redemption_id := redemption.id;
  new.reference_unit_price_clp := redemption.reference_unit_price_clp;
  new.unit_cost_snapshot_clp := redemption.unit_cost_snapshot_clp;
  new.unit_price_clp := 0;
  new.unit_discount_clp := 0;
  new.unit_tax_clp := 0;
  new.line_subtotal_clp := 0;
  new.line_discount_clp := 0;
  new.line_tax_clp := 0;
  new.line_total_clp := 0;
  return new;
end;
$$;

create or replace function private.link_loyalty_quote_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_loyalty_reward then
    update public.loyalty_reward_redemptions
    set checkout_quote_id = new.checkout_quote_id,
        checkout_quote_item_id = new.id
    where tenant_id = new.tenant_id
      and id = new.loyalty_reward_redemption_id
      and state = 'reserved'
      and checkout_quote_id is null;
    if not found then
      raise exception 'loyalty reward is already linked or unavailable'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.snapshot_loyalty_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select
    quote.diner_profile_id,
    quote.loyalty_reward_reference_clp,
    quote.loyalty_reward_known_cost_clp
  into
    new.diner_profile_id,
    new.loyalty_reward_reference_clp,
    new.loyalty_reward_known_cost_clp
  from public.checkout_quotes quote
  where quote.tenant_id = new.tenant_id
    and quote.id = new.checkout_quote_id;
  return new;
end;
$$;

create or replace function private.snapshot_loyalty_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select
    quote_item.is_loyalty_reward,
    quote_item.loyalty_reward_redemption_id,
    quote_item.reference_unit_price_clp,
    quote_item.unit_cost_snapshot_clp
  into
    new.is_loyalty_reward,
    new.loyalty_reward_redemption_id,
    new.reference_unit_price_clp,
    new.unit_cost_snapshot_clp
  from public.checkout_quote_items quote_item
  where quote_item.tenant_id = new.tenant_id
    and quote_item.id = new.checkout_quote_item_id;
  return new;
end;
$$;

create or replace function private.redeem_loyalty_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  redemption public.loyalty_reward_redemptions%rowtype;
begin
  if not new.is_loyalty_reward then
    return new;
  end if;

  update public.loyalty_reward_redemptions
  set state = 'redeemed',
      order_id = new.order_id,
      order_item_id = new.id,
      redeemed_at = clock_timestamp()
  where tenant_id = new.tenant_id
    and id = new.loyalty_reward_redemption_id
    and state = 'reserved'
  returning * into redemption;

  if redemption.id is null then
    raise exception 'loyalty reward could not be redeemed'
      using errcode = '23514';
  end if;

  insert into public.loyalty_ledger_entries (
    tenant_id, diner_profile_id, reward_redemption_id,
    entry_type, stamp_delta, idempotency_key, actor_type, reason
  )
  values (
    new.tenant_id, redemption.diner_profile_id, redemption.id,
    'reward_redeemed', -redemption.stamp_cost,
    'reward:' || redemption.id::text || ':redeemed',
    'system', 'Canje confirmado dentro del pedido pagado.'
  )
  on conflict (tenant_id, idempotency_key) do nothing;

  insert into public.audit_log (
    tenant_id, actor_type, action, target_type, target_id, after_data
  )
  values (
    new.tenant_id, 'worker', 'loyalty.reward_redeemed',
    'loyalty_reward_redemption', redemption.id,
    jsonb_build_object(
      'order_id', new.order_id,
      'order_item_id', new.id,
      'reference_value_clp', redemption.reference_unit_price_clp,
      'known_cost_clp', redemption.unit_cost_snapshot_clp
    )
  );
  return new;
end;
$$;

create or replace function private.record_loyalty_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  program public.tenant_loyalty_programs%rowtype;
  profile public.diner_profiles%rowtype;
  tenant_timezone text;
  local_moment timestamp;
  local_day date;
  local_weekday smallint;
  local_time time;
  day_count integer;
  eligible_amount bigint;
  visit_id uuid;
  stamps integer;
begin
  if new.financial_mode <> 'prepaid'
    or new.payment_id is null
    or new.diner_profile_id is null then
    return new;
  end if;

  select * into program
  from public.tenant_loyalty_programs
  where tenant_id = new.tenant_id
    and enabled
  for share;
  if not found then return new; end if;

  select * into profile
  from public.diner_profiles
  where tenant_id = new.tenant_id
    and id = new.diner_profile_id
    and status = 'active'
    and identification_revoked_at is null
  for update;
  if not found then return new; end if;

  select timezone into tenant_timezone
  from public.tenants
  where id = new.tenant_id;
  local_moment := new.confirmed_at at time zone tenant_timezone;
  local_day := local_moment::date;
  local_weekday := extract(dow from local_moment)::smallint;
  local_time := local_moment::time;
  eligible_amount := new.total_clp - new.tip_clp;

  if eligible_amount < program.visit_minimum_clp
    or not (local_weekday = any(program.eligible_weekdays))
    or (
      program.eligible_start_time <= program.eligible_end_time
      and not (
        local_time >= program.eligible_start_time
        and local_time <= program.eligible_end_time
      )
    )
    or (
      program.eligible_start_time > program.eligible_end_time
      and not (
        local_time >= program.eligible_start_time
        or local_time <= program.eligible_end_time
      )
    ) then
    return new;
  end if;

  select count(*)::integer into day_count
  from public.loyalty_visits visit
  where visit.tenant_id = new.tenant_id
    and visit.diner_profile_id = new.diner_profile_id
    and visit.state = 'counted'
    and (visit.occurred_at at time zone tenant_timezone)::date = local_day;

  if day_count >= program.max_visits_per_day then return new; end if;
  stamps := least(1, program.max_stamps_per_payment);

  insert into public.loyalty_visits (
    tenant_id, diner_profile_id, payment_id, order_id,
    eligible_amount_clp, stamp_count, eligibility_reason, occurred_at
  )
  values (
    new.tenant_id, new.diner_profile_id, new.payment_id, new.id,
    eligible_amount, stamps, 'Pago confirmado y elegible.', new.confirmed_at
  )
  on conflict (tenant_id, payment_id) do nothing
  returning id into visit_id;

  if visit_id is null then return new; end if;

  insert into public.loyalty_ledger_entries (
    tenant_id, diner_profile_id, loyalty_visit_id,
    entry_type, stamp_delta, idempotency_key, actor_type, reason, occurred_at
  )
  values (
    new.tenant_id, new.diner_profile_id, visit_id,
    'stamp_earned', stamps, 'visit:' || visit_id::text || ':earned',
    'system', 'Visita contada por pago confirmado.', new.confirmed_at
  );

  update public.diner_profiles
  set first_visit_at = coalesce(first_visit_at, new.confirmed_at),
      last_visit_at = greatest(coalesce(last_visit_at, new.confirmed_at), new.confirmed_at),
      updated_at = clock_timestamp()
  where tenant_id = new.tenant_id and id = new.diner_profile_id;
  return new;
end;
$$;

create or replace function private.add_loyalty_reward_to_cart(
  p_tenant_id uuid,
  p_cart_id uuid,
  p_idempotency_key text,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart_record public.carts%rowtype;
  profile_id uuid;
  program public.tenant_loyalty_programs%rowtype;
  product public.products%rowtype;
  redemption_id uuid;
  existing_id uuid;
begin
  select id into existing_id
  from public.loyalty_reward_redemptions
  where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  select cart.* into cart_record
  from public.carts cart
  where cart.tenant_id = p_tenant_id and cart.id = p_cart_id
  for update;
  if not found or cart_record.state <> 'open' then
    raise exception 'reward requires an open cart' using errcode = '55000';
  end if;

  select device.diner_profile_id into profile_id
  from public.diner_device_sessions device
  where device.tenant_id = p_tenant_id
    and device.id = cart_record.diner_device_session_id
    and device.state = 'active';
  if profile_id is null then
    raise exception 'reward requires a recognized diner'
      using errcode = '42501';
  end if;

  select * into program
  from public.tenant_loyalty_programs
  where tenant_id = p_tenant_id and enabled
  for share;
  if not found then
    raise exception 'loyalty program is disabled' using errcode = '55000';
  end if;

  if private.loyalty_balance(p_tenant_id, profile_id)
    < program.visits_required then
    raise exception 'reward is not available' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.loyalty_reward_redemptions redemption
    where redemption.tenant_id = p_tenant_id
      and redemption.diner_profile_id = profile_id
      and redemption.state = 'reserved'
  ) then
    raise exception 'another loyalty reward is already reserved'
      using errcode = '23514';
  end if;

  select * into product
  from public.products
  where tenant_id = p_tenant_id
    and id = program.reward_product_id
    and active
    and available_for_order
  for share;
  if not found then
    raise exception 'reward product is unavailable' using errcode = '55000';
  end if;

  redemption_id := gen_random_uuid();
  insert into public.loyalty_reward_redemptions (
    id, tenant_id, diner_profile_id, product_id, cart_id,
    stamp_cost, reference_unit_price_clp, unit_cost_snapshot_clp,
    idempotency_key, reserved_at
  )
  values (
    redemption_id, p_tenant_id, profile_id, product.id, p_cart_id,
    program.visits_required,
    product.unit_price_clp
      + round(product.unit_price_clp * product.tax_rate_bps::numeric / 10000),
    product.unit_cost_clp,
    p_idempotency_key, p_now
  );

  insert into public.cart_items (
    tenant_id, cart_id, product_id, quantity,
    selected_modifiers, loyalty_reward_redemption_id,
    created_at, updated_at
  )
  values (
    p_tenant_id, p_cart_id, product.id, 1,
    '[{"type":"loyalty_reward","label":"Premio fidelización"}]'::jsonb,
    redemption_id, p_now, p_now
  );

  insert into public.audit_log (
    tenant_id, actor_type, action, target_type, target_id, after_data
  )
  values (
    p_tenant_id, 'platform', 'loyalty.reward_reserved',
    'loyalty_reward_redemption', redemption_id,
    jsonb_build_object(
      'cart_id', p_cart_id,
      'product_id', product.id,
      'reference_value_clp',
      product.unit_price_clp
        + round(product.unit_price_clp * product.tax_rate_bps::numeric / 10000),
      'known_cost_clp', product.unit_cost_clp
    )
  );
  return redemption_id;
end;
$$;

create or replace function private.release_loyalty_reward_with_cart()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.state = 'checkout_started'
    and new.state in ('open', 'expired') then
    update public.loyalty_reward_redemptions redemption
    set state = 'cancelled', cancelled_at = clock_timestamp()
    where redemption.tenant_id = new.tenant_id
      and redemption.cart_id = new.id
      and redemption.state = 'reserved';
  end if;
  return new;
end;
$$;

create or replace function private.adjust_loyalty_after_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  visit public.loyalty_visits%rowtype;
  program public.tenant_loyalty_programs%rowtype;
  refunded_total bigint;
  redemption public.loyalty_reward_redemptions%rowtype;
begin
  if new.status <> 'completed' then return new; end if;

  select orders.* into order_record
  from public.orders orders
  where orders.tenant_id = new.tenant_id
    and orders.payment_id = new.payment_id;
  if not found then return new; end if;

  select coalesce(sum(refund.amount_clp), 0)::bigint
    into refunded_total
  from public.refunds refund
  where refund.tenant_id = new.tenant_id
    and refund.payment_id = new.payment_id
    and refund.status = 'completed';

  select * into program
  from public.tenant_loyalty_programs
  where tenant_id = new.tenant_id;

  select * into visit
  from public.loyalty_visits
  where tenant_id = new.tenant_id
    and order_id = order_record.id
    and state = 'counted'
  for update;

  if visit.id is not null
    and order_record.total_clp - order_record.tip_clp - refunded_total
      < coalesce(program.visit_minimum_clp, 0) then
    update public.loyalty_visits
    set state = 'reversed', reversed_at = new.occurred_at
    where tenant_id = new.tenant_id and id = visit.id;

    insert into public.loyalty_ledger_entries (
      tenant_id, diner_profile_id, loyalty_visit_id,
      entry_type, stamp_delta, idempotency_key, actor_type, reason, occurred_at
    )
    values (
      new.tenant_id, visit.diner_profile_id, visit.id,
      'stamp_reversed', -visit.stamp_count,
      'visit:' || visit.id::text || ':refund-reversed',
      'system', 'El monto neto reembolsado dejó la visita bajo el mínimo.',
      new.occurred_at
    )
    on conflict (tenant_id, idempotency_key) do nothing;

    insert into public.loyalty_refund_adjustments (
      tenant_id, refund_id, loyalty_visit_id,
      action, stamp_delta, occurred_at
    )
    values (
      new.tenant_id, new.id, visit.id,
      'visit_reversed', -visit.stamp_count, new.occurred_at
    )
    on conflict do nothing;
  end if;

  if refunded_total >= order_record.total_clp then
    for redemption in
      select reward.*
      from public.loyalty_reward_redemptions reward
      where reward.tenant_id = new.tenant_id
        and reward.order_id = order_record.id
        and reward.state = 'redeemed'
      order by reward.id
      for update
    loop
      update public.loyalty_reward_redemptions
      set state = 'restored', restored_at = new.occurred_at
      where tenant_id = new.tenant_id and id = redemption.id;

      insert into public.loyalty_ledger_entries (
        tenant_id, diner_profile_id, reward_redemption_id,
        entry_type, stamp_delta, idempotency_key, actor_type, reason, occurred_at
      )
      values (
        new.tenant_id, redemption.diner_profile_id, redemption.id,
        'reward_restored', redemption.stamp_cost,
        'reward:' || redemption.id::text || ':refund-restored',
        'system', 'El pedido completo fue reembolsado.', new.occurred_at
      )
      on conflict (tenant_id, idempotency_key) do nothing;

      insert into public.loyalty_refund_adjustments (
        tenant_id, refund_id, reward_redemption_id,
        action, stamp_delta, occurred_at
      )
      values (
        new.tenant_id, new.id, redemption.id,
        'reward_restored', redemption.stamp_cost, new.occurred_at
      )
      on conflict do nothing;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function private.snapshot_loyalty_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reference_total bigint;
  known_cost_total bigint;
  unknown_cost_count integer;
begin
  select
    coalesce(sum(order_item.reference_unit_price_clp * order_item.quantity), 0),
    coalesce(sum(order_item.unit_cost_snapshot_clp * order_item.quantity), 0),
    count(*) filter (where order_item.unit_cost_snapshot_clp is null)
  into reference_total, known_cost_total, unknown_cost_count
  from public.payment_shift_attributions attribution
  join public.orders orders
    on orders.tenant_id = attribution.tenant_id
   and orders.payment_id = attribution.payment_id
  join public.order_items order_item
    on order_item.tenant_id = orders.tenant_id
   and order_item.order_id = orders.id
   and order_item.is_loyalty_reward
  where attribution.tenant_id = new.tenant_id
    and attribution.cashier_shift_id = new.cashier_shift_id;

  new.loyalty_reward_reference_clp := reference_total;
  new.loyalty_reward_known_cost_clp :=
    case when unknown_cost_count > 0 then null else known_cost_total end;
  return new;
end;
$$;

create or replace function private.anonymize_diner_profile(
  p_tenant_id uuid,
  p_diner_profile_id uuid,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'anonymization reason is required' using errcode = '22023';
  end if;

  update public.diner_profiles
  set status = 'anonymized',
      program_alias = 'Perfil eliminado ' || left(p_diner_profile_id::text, 8),
      identification_revoked_at = p_now,
      contact_revoked_at = case
        when contact_consented_at is not null then p_now
        else contact_revoked_at
      end,
      anonymized_at = p_now,
      updated_at = p_now
  where tenant_id = p_tenant_id
    and id = p_diner_profile_id
    and status = 'active';
  if not found then
    raise exception 'active diner profile not found' using errcode = 'P0002';
  end if;

  delete from private.diner_profile_contacts
  where tenant_id = p_tenant_id and diner_profile_id = p_diner_profile_id;

  update private.diner_identity_credentials
  set state = 'revoked', revoked_at = p_now
  where tenant_id = p_tenant_id
    and diner_profile_id = p_diner_profile_id
    and state = 'active';

  update public.diner_device_sessions
  set diner_profile_id = null
  where tenant_id = p_tenant_id
    and diner_profile_id = p_diner_profile_id;

  insert into public.diner_consent_events (
    tenant_id, diner_profile_id, consent_type, action,
    policy_version, clear_text_snapshot, actor_type, occurred_at
  )
  values
    (
      p_tenant_id, p_diner_profile_id, 'identification', 'revoked',
      '2026-07-s11', 'Solicitó dejar de ser reconocido y anonimizar sus datos.',
      'diner', p_now
    ),
    (
      p_tenant_id, p_diner_profile_id, 'contact', 'revoked',
      '2026-07-s11', 'Solicitó eliminar sus datos de contacto.',
      'diner', p_now
    );

  insert into public.diner_identity_events (
    tenant_id, diner_profile_id, event_type, metadata, occurred_at
  )
  values (
    p_tenant_id, p_diner_profile_id, 'profile_anonymized',
    jsonb_build_object('reason', p_reason), p_now
  );

  insert into public.audit_log (
    tenant_id, actor_type, action, target_type, target_id, reason, occurred_at
  )
  values (
    p_tenant_id, 'platform', 'diner_identity.anonymized',
    'diner_profile', p_diner_profile_id, p_reason, p_now
  );
end;
$$;

create or replace function private.assisted_loyalty_adjustment(
  p_tenant_id uuid,
  p_diner_profile_id uuid,
  p_employee_id uuid,
  p_employee_session_id uuid,
  p_stamp_delta integer,
  p_reason text,
  p_idempotency_key text,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ledger_id uuid;
  adjustment_id uuid;
begin
  if p_stamp_delta = 0
    or nullif(btrim(p_reason), '') is null
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'delta, reason and idempotency key are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.diner_profiles profile
    where profile.tenant_id = p_tenant_id
      and profile.id = p_diner_profile_id
      and profile.status = 'active'
  ) or not exists (
    select 1 from public.employees employee
    where employee.tenant_id = p_tenant_id
      and employee.id = p_employee_id
      and employee.status = 'active'
  ) then
    raise exception 'profile or employee unavailable' using errcode = 'P0002';
  end if;

  if p_employee_session_id is not null and not exists (
    select 1 from public.employee_sessions session
    where session.tenant_id = p_tenant_id
      and session.id = p_employee_session_id
      and session.employee_id = p_employee_id
      and session.state = 'active'
  ) then
    raise exception 'employee session is not active' using errcode = '42501';
  end if;

  insert into public.loyalty_ledger_entries (
    tenant_id, diner_profile_id, entry_type, stamp_delta,
    idempotency_key, actor_type, actor_employee_id, reason, occurred_at
  )
  values (
    p_tenant_id, p_diner_profile_id, 'assisted_adjustment', p_stamp_delta,
    p_idempotency_key, 'employee', p_employee_id, p_reason, p_now
  )
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into ledger_id;

  if ledger_id is null then
    select id into ledger_id
    from public.loyalty_ledger_entries
    where tenant_id = p_tenant_id
      and idempotency_key = p_idempotency_key;
    select id into adjustment_id
    from public.loyalty_assisted_adjustments
    where tenant_id = p_tenant_id and ledger_entry_id = ledger_id;
    return adjustment_id;
  end if;

  insert into public.loyalty_assisted_adjustments (
    tenant_id, diner_profile_id, employee_id, employee_session_id,
    ledger_entry_id, stamp_delta, reason, occurred_at
  )
  values (
    p_tenant_id, p_diner_profile_id, p_employee_id, p_employee_session_id,
    ledger_id, p_stamp_delta, p_reason, p_now
  )
  returning id into adjustment_id;

  insert into public.diner_identity_events (
    tenant_id, diner_profile_id, event_type,
    metadata, occurred_at
  )
  values (
    p_tenant_id, p_diner_profile_id, 'token_missing_recovered_assisted',
    jsonb_build_object(
      'employee_id', p_employee_id,
      'adjustment_id', adjustment_id
    ),
    p_now
  );

  insert into public.audit_log (
    tenant_id, actor_type, actor_employee_id,
    action, target_type, target_id, reason, after_data, occurred_at
  )
  values (
    p_tenant_id, 'employee', p_employee_id,
    'loyalty.assisted_adjustment', 'diner_profile', p_diner_profile_id,
    p_reason, jsonb_build_object('stamp_delta', p_stamp_delta), p_now
  );
  return adjustment_id;
end;
$$;

create or replace function private.materialize_dormant_loyalty_segment(
  p_tenant_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid := gen_random_uuid();
  dormant_days integer;
begin
  select program.dormant_after_days into dormant_days
  from public.tenant_loyalty_programs program
  where program.tenant_id = p_tenant_id;
  if dormant_days is null then
    raise exception 'loyalty program is not configured' using errcode = 'P0002';
  end if;

  insert into public.loyalty_dormant_segment_entries (
    tenant_id, diner_profile_id, segment_run_id,
    inactive_since, contact_allowed, recorded_at
  )
  select
    profile.tenant_id, profile.id, run_id,
    profile.last_visit_at,
    profile.contact_consented_at is not null
      and profile.contact_revoked_at is null,
    p_now
  from public.diner_profiles profile
  where profile.tenant_id = p_tenant_id
    and profile.status = 'active'
    and profile.last_visit_at < p_now - make_interval(days => dormant_days);
  return run_id;
end;
$$;

create trigger diner_consent_events_immutable
before update or delete on public.diner_consent_events
for each row execute function private.prevent_loyalty_evidence_mutation();
create trigger diner_identity_events_immutable
before update or delete on public.diner_identity_events
for each row execute function private.prevent_loyalty_evidence_mutation();
create trigger loyalty_ledger_entries_immutable
before update or delete on public.loyalty_ledger_entries
for each row execute function private.prevent_loyalty_evidence_mutation();
create trigger loyalty_assisted_adjustments_immutable
before update or delete on public.loyalty_assisted_adjustments
for each row execute function private.prevent_loyalty_evidence_mutation();
create trigger loyalty_refund_adjustments_immutable
before update or delete on public.loyalty_refund_adjustments
for each row execute function private.prevent_loyalty_evidence_mutation();

create trigger checkout_quotes_prepare_loyalty
before insert on public.checkout_quotes
for each row execute function private.prepare_loyalty_quote();
create trigger checkout_quote_items_loyalty_snapshot
before insert on public.checkout_quote_items
for each row execute function private.snapshot_loyalty_quote_item();
create trigger checkout_quote_items_loyalty_link
after insert on public.checkout_quote_items
for each row execute function private.link_loyalty_quote_item();
create trigger orders_loyalty_snapshot
before insert on public.orders
for each row execute function private.snapshot_loyalty_order();
create trigger orders_loyalty_visit
after insert on public.orders
for each row execute function private.record_loyalty_visit();
create trigger order_items_loyalty_snapshot
before insert on public.order_items
for each row execute function private.snapshot_loyalty_order_item();
create trigger order_items_loyalty_redeem
after insert on public.order_items
for each row execute function private.redeem_loyalty_order_item();
create trigger carts_release_loyalty_reward
after update of state on public.carts
for each row execute function private.release_loyalty_reward_with_cart();
create trigger refunds_adjust_loyalty
after insert on public.refunds
for each row execute function private.adjust_loyalty_after_refund();
create trigger cashier_shift_closures_loyalty_snapshot
before insert on public.cashier_shift_closures
for each row execute function private.snapshot_loyalty_closure();

create view public.owner_loyalty_metrics
with (security_invoker = true)
as
select
  program.tenant_id,
  count(profile.id)::integer as enrolled_diners,
  count(profile.id) filter (
    where coalesce(visits.visit_count, 0) >= 2
  )::integer as recurring_diners,
  coalesce(avg(visits.average_days_between_visits) filter (
    where visits.average_days_between_visits is not null
  ), 0)::numeric(8,2) as average_return_days,
  coalesce(rewards.reward_count, 0)::integer as rewards_delivered,
  coalesce(rewards.reference_value_clp, 0)::bigint
    as reward_reference_value_clp,
  rewards.known_cost_clp,
  count(profile.id) filter (
    where profile.last_visit_at
      < clock_timestamp() - make_interval(days => program.dormant_after_days)
  )::integer as dormant_diners,
  coalesce(identity.recognized_count, 0)::integer as recognized_sessions,
  coalesce(identity.lost_count, 0)::integer as lost_identity_recoveries,
  case
    when coalesce(identity.recognized_count, 0)
      + coalesce(identity.lost_count, 0) = 0 then 0
    else round(
      identity.lost_count::numeric * 100
      / (identity.recognized_count + identity.lost_count),
      2
    )
  end as identity_loss_rate_percent
from public.tenant_loyalty_programs program
left join public.diner_profiles profile
  on profile.tenant_id = program.tenant_id
 and profile.status = 'active'
left join lateral (
  select
    count(*)::integer as visit_count,
    case when count(*) < 2 then null else
      extract(epoch from (
        max(visit.occurred_at) - min(visit.occurred_at)
      )) / 86400 / (count(*) - 1)
    end as average_days_between_visits
  from public.loyalty_visits visit
  where visit.tenant_id = profile.tenant_id
    and visit.diner_profile_id = profile.id
    and visit.state = 'counted'
) visits on true
left join lateral (
  select
    count(*)::integer as reward_count,
    coalesce(sum(redemption.reference_unit_price_clp), 0)::bigint
      as reference_value_clp,
    case
      when count(*) filter (
        where redemption.unit_cost_snapshot_clp is null
      ) > 0 then null
      else coalesce(sum(redemption.unit_cost_snapshot_clp), 0)::bigint
    end as known_cost_clp
  from public.loyalty_reward_redemptions redemption
  where redemption.tenant_id = program.tenant_id
    and redemption.state = 'redeemed'
) rewards on true
left join lateral (
  select
    count(*) filter (
      where event.event_type = 'device_recognized'
    )::integer as recognized_count,
    count(*) filter (
      where event.event_type in (
        'token_missing_recovered_self',
        'token_missing_recovered_assisted'
      )
    )::integer as lost_count
  from public.diner_identity_events event
  where event.tenant_id = program.tenant_id
) identity on true
group by
  program.tenant_id,
  program.dormant_after_days,
  rewards.reward_count,
  rewards.reference_value_clp,
  rewards.known_cost_clp,
  identity.recognized_count,
  identity.lost_count;

create view public.cashier_loyalty_reward_summary
with (security_invoker = true)
as
select
  attribution.tenant_id,
  attribution.cashier_shift_id,
  count(order_item.id)::integer as reward_item_count,
  coalesce(sum(
    order_item.reference_unit_price_clp * order_item.quantity
  ), 0)::bigint as reward_reference_value_clp,
  case
    when count(*) filter (
      where order_item.unit_cost_snapshot_clp is null
    ) > 0 then null
    else coalesce(sum(
      order_item.unit_cost_snapshot_clp * order_item.quantity
    ), 0)::bigint
  end as reward_known_cost_clp
from public.payment_shift_attributions attribution
join public.orders orders
  on orders.tenant_id = attribution.tenant_id
 and orders.payment_id = attribution.payment_id
join public.order_items order_item
  on order_item.tenant_id = orders.tenant_id
 and order_item.order_id = orders.id
 and order_item.is_loyalty_reward
group by attribution.tenant_id, attribution.cashier_shift_id;

alter table public.tenant_loyalty_programs enable row level security;
alter table public.tenant_loyalty_programs force row level security;
alter table public.diner_profiles enable row level security;
alter table public.diner_profiles force row level security;
alter table private.diner_profile_contacts enable row level security;
alter table private.diner_profile_contacts force row level security;
alter table private.diner_identity_credentials enable row level security;
alter table private.diner_identity_credentials force row level security;
alter table private.diner_recovery_challenges enable row level security;
alter table private.diner_recovery_challenges force row level security;
alter table public.diner_consent_events enable row level security;
alter table public.diner_consent_events force row level security;
alter table public.diner_identity_events enable row level security;
alter table public.diner_identity_events force row level security;
alter table public.loyalty_visits enable row level security;
alter table public.loyalty_visits force row level security;
alter table public.loyalty_reward_redemptions enable row level security;
alter table public.loyalty_reward_redemptions force row level security;
alter table public.loyalty_ledger_entries enable row level security;
alter table public.loyalty_ledger_entries force row level security;
alter table public.loyalty_assisted_adjustments enable row level security;
alter table public.loyalty_assisted_adjustments force row level security;
alter table public.loyalty_refund_adjustments enable row level security;
alter table public.loyalty_refund_adjustments force row level security;
alter table public.loyalty_dormant_segment_entries enable row level security;
alter table public.loyalty_dormant_segment_entries force row level security;

create policy loyalty_programs_select
on public.tenant_loyalty_programs for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy loyalty_programs_insert
on public.tenant_loyalty_programs for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.manage'))
);
create policy loyalty_programs_update
on public.tenant_loyalty_programs for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.manage'))
);

create policy diner_profiles_staff_select
on public.diner_profiles for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy diner_consent_events_staff_select
on public.diner_consent_events for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy diner_identity_events_staff_select
on public.diner_identity_events for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy loyalty_visits_staff_select
on public.loyalty_visits for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy loyalty_redemptions_staff_select
on public.loyalty_reward_redemptions for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy loyalty_ledger_staff_select
on public.loyalty_ledger_entries for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy loyalty_assisted_staff_select
on public.loyalty_assisted_adjustments for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy loyalty_refund_staff_select
on public.loyalty_refund_adjustments for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);
create policy loyalty_dormant_staff_select
on public.loyalty_dormant_segment_entries for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'loyalty.read'))
);

revoke all on
  public.tenant_loyalty_programs,
  public.diner_profiles,
  public.diner_consent_events,
  public.diner_identity_events,
  public.loyalty_visits,
  public.loyalty_reward_redemptions,
  public.loyalty_ledger_entries,
  public.loyalty_assisted_adjustments,
  public.loyalty_refund_adjustments,
  public.loyalty_dormant_segment_entries
from public, anon, authenticated;

grant select on
  public.tenant_loyalty_programs,
  public.diner_profiles,
  public.diner_consent_events,
  public.diner_identity_events,
  public.loyalty_visits,
  public.loyalty_reward_redemptions,
  public.loyalty_ledger_entries,
  public.loyalty_assisted_adjustments,
  public.loyalty_refund_adjustments,
  public.loyalty_dormant_segment_entries,
  public.owner_loyalty_metrics,
  public.cashier_loyalty_reward_summary
to authenticated;
grant insert, update on public.tenant_loyalty_programs to authenticated;

revoke all on
  private.diner_profile_contacts,
  private.diner_identity_credentials,
  private.diner_recovery_challenges
from public, anon, authenticated;

revoke execute on function
  private.loyalty_balance(uuid,uuid),
  private.add_loyalty_reward_to_cart(uuid,uuid,text,timestamptz),
  private.anonymize_diner_profile(uuid,uuid,text,timestamptz),
  private.assisted_loyalty_adjustment(
    uuid,uuid,uuid,uuid,integer,text,text,timestamptz
  ),
  private.materialize_dormant_loyalty_segment(uuid,timestamptz)
from public, anon, authenticated;

comment on column public.products.unit_cost_clp is
  'Optional owner-entered product cost. Null means reports show only reference value and never invent margin.';
comment on column public.checkout_quote_items.is_loyalty_reward is
  'Immutable server-calculated zero-price reward marker.';
comment on column public.checkout_quote_items.reference_unit_price_clp is
  'List value at quote creation; not revenue and not an assumed accounting cost.';
comment on view public.owner_loyalty_metrics is
  'Narrative loyalty metrics including recoveries after a missing device credential.';
