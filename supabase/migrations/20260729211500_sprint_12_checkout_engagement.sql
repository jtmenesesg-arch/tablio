-- Sprint 12: deterministic checkout upsell, invitations, promotions and
-- waiter-attributed tips. Every capability is disabled by default.

create table public.tenant_checkout_engagement_settings (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  upsell_enabled boolean not null default false,
  max_upsell_suggestions integer not null default 1
    check (max_upsell_suggestions between 1 and 2),
  invitations_enabled boolean not null default false,
  invitation_claim_ttl_minutes integer not null default 60
    check (invitation_claim_ttl_minutes between 45 and 90),
  invitation_warning_minutes integer not null default 10
    check (invitation_warning_minutes between 5 and 30),
  max_invitations_per_device_session integer not null default 3
    check (max_invitations_per_device_session between 1 and 20),
  promotions_enabled boolean not null default false,
  waiter_tip_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (invitation_warning_minutes < invitation_claim_ttl_minutes)
);

create table public.checkout_upsell_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  rule_type text not null
    check (rule_type in ('product', 'category', 'schedule', 'margin', 'manual')),
  source_product_id uuid,
  source_category_id uuid,
  suggestion_product_id uuid not null,
  active_weekdays smallint[] not null
    default array[0,1,2,3,4,5,6]::smallint[],
  starts_at time,
  ends_at time,
  minimum_margin_clp bigint
    check (minimum_margin_clp is null or minimum_margin_clp >= 0),
  priority integer not null default 100 check (priority between 0 and 10000),
  enabled boolean not null default false,
  created_by_employee_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_product_id)
    references public.products (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_category_id)
    references public.menu_categories (tenant_id, id) on delete restrict,
  foreign key (tenant_id, suggestion_product_id)
    references public.products (tenant_id, id) on delete restrict,
  foreign key (tenant_id, created_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (cardinality(active_weekdays) between 1 and 7),
  check (
    (rule_type = 'product' and source_product_id is not null)
    or (rule_type = 'category' and source_category_id is not null)
    or (
      rule_type = 'schedule'
      and starts_at is not null
      and ends_at is not null
    )
    or (rule_type = 'margin' and minimum_margin_clp is not null)
    or rule_type = 'manual'
  )
);

create table public.checkout_upsell_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  diner_device_session_id uuid not null,
  cart_id uuid not null,
  checkout_quote_id uuid,
  order_id uuid,
  upsell_rule_id uuid not null,
  suggested_product_id uuid not null,
  event_type text not null
    check (event_type in ('exposed', 'accepted', 'dismissed', 'quoted', 'paid')),
  incremental_revenue_clp bigint not null default 0
    check (incremental_revenue_clp >= 0),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, diner_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, cart_id)
    references public.carts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, upsell_rule_id)
    references public.checkout_upsell_rules (tenant_id, id) on delete restrict,
  foreign key (tenant_id, suggested_product_id)
    references public.products (tenant_id, id) on delete restrict,
  check (
    (event_type = 'paid' and order_id is not null and incremental_revenue_clp > 0)
    or (event_type <> 'paid' and incremental_revenue_clp = 0)
  )
);

create table public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  name text not null check (btrim(name) <> '' and length(name) <= 100),
  enabled boolean not null default false,
  created_by_employee_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, created_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

create table public.promotion_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  promotion_id uuid not null,
  version integer not null check (version > 0),
  promotion_type text not null
    check (promotion_type in ('two_for_one', 'percentage', 'special_price')),
  product_ids uuid[] not null default '{}'::uuid[],
  category_ids uuid[] not null default '{}'::uuid[],
  percentage_bps integer
    check (percentage_bps is null or percentage_bps between 1 and 10000),
  special_price_clp bigint
    check (special_price_clp is null or special_price_clp >= 0),
  active_weekdays smallint[] not null
    default array[0,1,2,3,4,5,6]::smallint[],
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  activation_mode text not null check (activation_mode in ('scheduled', 'manual')),
  created_by_employee_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, promotion_id, version),
  foreign key (tenant_id, promotion_id)
    references public.promotion_campaigns (tenant_id, id) on delete restrict,
  foreign key (tenant_id, created_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (ends_at > starts_at),
  check (cardinality(product_ids) + cardinality(category_ids) > 0),
  check (
    (promotion_type = 'percentage' and percentage_bps is not null)
    or (promotion_type = 'special_price' and special_price_clp is not null)
    or promotion_type = 'two_for_one'
  )
);

create table public.promotion_activation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  promotion_id uuid not null,
  promotion_version_id uuid not null,
  event_type text not null check (event_type in ('activated', 'deactivated', 'expired')),
  actor_type text not null check (actor_type in ('employee', 'system')),
  actor_employee_id uuid,
  reason text not null check (btrim(reason) <> ''),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, promotion_id)
    references public.promotion_campaigns (tenant_id, id) on delete restrict,
  foreign key (tenant_id, promotion_version_id)
    references public.promotion_versions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    (actor_type = 'employee' and actor_employee_id is not null)
    or (actor_type = 'system' and actor_employee_id is null)
  )
);

alter table public.checkout_quotes
  add column promotion_discount_clp bigint not null default 0
    check (promotion_discount_clp >= 0),
  add column upsell_incremental_clp bigint not null default 0
    check (upsell_incremental_clp >= 0),
  add column tip_recipient_type text not null default 'team'
    check (tip_recipient_type in ('team', 'employee')),
  add column tip_recipient_employee_id uuid,
  add column tip_recipient_employee_session_id uuid,
  add foreign key (tenant_id, tip_recipient_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, tip_recipient_employee_session_id)
    references public.employee_sessions (tenant_id, id) on delete restrict,
  add check (promotion_discount_clp <= discount_clp),
  add check (
    (
      tip_recipient_type = 'team'
      and tip_recipient_employee_id is null
      and tip_recipient_employee_session_id is null
    )
    or (
      tip_recipient_type = 'employee'
      and tip_recipient_employee_id is not null
      and tip_recipient_employee_session_id is not null
    )
  );

alter table public.checkout_quote_items
  add column is_upsell boolean not null default false,
  add column upsell_rule_id uuid,
  add column promotion_id uuid,
  add column promotion_version_id uuid,
  add column invitation_target_table_session_id uuid,
  add foreign key (tenant_id, upsell_rule_id)
    references public.checkout_upsell_rules (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, promotion_id)
    references public.promotion_campaigns (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, promotion_version_id)
    references public.promotion_versions (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, invitation_target_table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  add check (
    (is_upsell and upsell_rule_id is not null)
    or (not is_upsell and upsell_rule_id is null)
  ),
  add check (
    (promotion_id is null and promotion_version_id is null)
    or (promotion_id is not null and promotion_version_id is not null)
  );

alter table public.orders
  add column promotion_discount_clp bigint not null default 0
    check (promotion_discount_clp >= 0),
  add column upsell_incremental_clp bigint not null default 0
    check (upsell_incremental_clp >= 0),
  add column tip_recipient_type text not null default 'team'
    check (tip_recipient_type in ('team', 'employee')),
  add column tip_recipient_employee_id uuid,
  add column tip_recipient_employee_session_id uuid,
  add foreign key (tenant_id, tip_recipient_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, tip_recipient_employee_session_id)
    references public.employee_sessions (tenant_id, id) on delete restrict,
  add check (promotion_discount_clp <= discount_clp),
  add check (
    (
      tip_recipient_type = 'team'
      and tip_recipient_employee_id is null
      and tip_recipient_employee_session_id is null
    )
    or (
      tip_recipient_type = 'employee'
      and tip_recipient_employee_id is not null
      and tip_recipient_employee_session_id is not null
    )
  );

alter table public.order_items
  add column is_upsell boolean not null default false,
  add column upsell_rule_id uuid,
  add column promotion_id uuid,
  add column promotion_version_id uuid,
  add foreign key (tenant_id, upsell_rule_id)
    references public.checkout_upsell_rules (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, promotion_id)
    references public.promotion_campaigns (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, promotion_version_id)
    references public.promotion_versions (tenant_id, id) on delete restrict;

create table public.drink_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payer_device_session_id uuid not null,
  payer_table_session_id uuid not null,
  destination_table_session_id uuid not null,
  destination_table_id uuid not null,
  payment_id uuid not null,
  source_order_id uuid not null,
  source_order_item_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  station_id uuid not null,
  inviter_alias text not null check (btrim(inviter_alias) <> ''),
  product_name_snapshot text not null check (btrim(product_name_snapshot) <> ''),
  quantity integer not null check (quantity > 0),
  amount_clp bigint not null check (amount_clp > 0),
  state text not null default 'pending_claim'
    check (state in ('pending_claim', 'claimed', 'refund_pending', 'refunded', 'expired')),
  claimed_by_device_session_id uuid,
  refund_id uuid,
  expires_at timestamptz not null,
  warning_at timestamptz not null,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, source_order_item_id),
  foreign key (tenant_id, payer_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payer_table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, destination_table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, destination_table_id)
    references public.tables (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_order_item_id)
    references public.order_items (tenant_id, id) on delete restrict,
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict,
  foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete restrict,
  foreign key (tenant_id, station_id)
    references public.stations (tenant_id, id) on delete restrict,
  foreign key (tenant_id, claimed_by_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, refund_id)
    references public.refunds (tenant_id, id) on delete restrict,
  check (
    claimed_by_device_session_id is null
    or claimed_by_device_session_id <> payer_device_session_id
  ),
  check (warning_at < expires_at),
  check (
    (state = 'pending_claim' and claimed_at is null and refund_id is null)
    or (state = 'claimed' and claimed_at is not null and claimed_by_device_session_id is not null)
    or state in ('refund_pending', 'refunded', 'expired')
  )
);

create table public.drink_invitation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  invitation_id uuid not null,
  event_type text not null check (
    event_type in (
      'created', 'warning_sent_invitee', 'warning_sent_payer',
      'claimed', 'cancelled_by_payer', 'expired', 'refund_requested', 'refunded'
    )
  ),
  actor_type text not null check (actor_type in ('diner', 'system', 'worker')),
  actor_device_session_id uuid,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, invitation_id)
    references public.drink_invitations (tenant_id, id) on delete restrict,
  foreign key (tenant_id, actor_device_session_id)
    references public.diner_device_sessions (tenant_id, id) on delete restrict
);

create table public.tip_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_id uuid not null,
  order_id uuid not null,
  cashier_shift_id uuid,
  recipient_type text not null check (recipient_type in ('team', 'employee')),
  employee_id uuid,
  employee_session_id uuid,
  employee_label_snapshot text,
  payment_method text not null check (btrim(payment_method) <> ''),
  amount_clp bigint not null check (amount_clp >= 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, payment_id),
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_session_id)
    references public.employee_sessions (tenant_id, id) on delete restrict,
  check (
    (
      recipient_type = 'team'
      and employee_id is null
      and employee_session_id is null
      and employee_label_snapshot is null
    )
    or (
      recipient_type = 'employee'
      and employee_id is not null
      and employee_session_id is not null
      and nullif(btrim(employee_label_snapshot), '') is not null
    )
  )
);

alter table public.cashier_shift_closures
  add column promotion_discount_clp bigint not null default 0
    check (promotion_discount_clp >= 0),
  add column upsell_sales_clp bigint not null default 0
    check (upsell_sales_clp >= 0);

create or replace function private.validate_quote_tip_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_zone_id uuid;
begin
  if new.tip_recipient_type = 'team' then
    return new;
  end if;

  select table_record.zone_id
  into quote_zone_id
  from public.tables table_record
  where table_record.tenant_id = new.tenant_id
    and table_record.id = new.table_id;

  if not exists (
    select 1
    from public.employee_sessions employee_session
    join public.employee_zone_assignments assignment
      on assignment.tenant_id = employee_session.tenant_id
     and assignment.employee_session_id = employee_session.id
     and assignment.released_at is null
    where employee_session.tenant_id = new.tenant_id
      and employee_session.id = new.tip_recipient_employee_session_id
      and employee_session.employee_id = new.tip_recipient_employee_id
      and employee_session.state = 'active'
      and employee_session.absolute_expires_at > clock_timestamp()
      and assignment.zone_id = quote_zone_id
  ) then
    raise exception 'tip recipient is not active in the table zone'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger checkout_quotes_validate_tip_recipient
before insert on public.checkout_quotes
for each row execute function private.validate_quote_tip_recipient();

create or replace function private.cancel_drink_invitation(
  requested_tenant_id uuid,
  requested_invitation_id uuid,
  actor_device_session_id uuid,
  requested_at timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.drink_invitations%rowtype;
  outbox_id uuid;
begin
  select *
  into invitation
  from public.drink_invitations
  where tenant_id = requested_tenant_id
    and id = requested_invitation_id
  for update;

  if invitation.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if invitation.payer_device_session_id <> actor_device_session_id then
    raise exception 'only the payer can cancel this invitation' using errcode = '42501';
  end if;
  if invitation.state <> 'pending_claim' then
    raise exception 'only an unclaimed invitation can be cancelled' using errcode = '55000';
  end if;

  update public.drink_invitations
  set state = 'refund_pending',
      cancelled_at = requested_at,
      updated_at = requested_at
  where tenant_id = requested_tenant_id and id = requested_invitation_id;

  insert into public.drink_invitation_events (
    tenant_id, invitation_id, event_type, actor_type,
    actor_device_session_id, idempotency_key, occurred_at
  ) values (
    requested_tenant_id, requested_invitation_id, 'cancelled_by_payer', 'diner',
    actor_device_session_id, 'invitation:' || requested_invitation_id || ':cancelled',
    requested_at
  );

  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic, deduplication_key, payload
  ) values (
    requested_tenant_id, 'drink_invitation', requested_invitation_id,
    'refund.requested', 'invitation:' || requested_invitation_id || ':refund',
    jsonb_build_object(
      'payment_id', invitation.payment_id,
      'amount_clp', invitation.amount_clp,
      'currency', 'CLP',
      'reason', 'unclaimed_invitation_cancelled_by_payer'
    )
  )
  returning id into outbox_id;
  return outbox_id;
end;
$$;

create or replace function private.claim_drink_invitation(
  requested_tenant_id uuid,
  requested_invitation_id uuid,
  actor_device_session_id uuid,
  requested_at timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.drink_invitations%rowtype;
  outbox_id uuid;
begin
  select *
  into invitation
  from public.drink_invitations
  where tenant_id = requested_tenant_id
    and id = requested_invitation_id
  for update;
  if invitation.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if invitation.state <> 'pending_claim' or invitation.expires_at <= requested_at then
    raise exception 'invitation is no longer claimable' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.diner_device_sessions device
    where device.tenant_id = requested_tenant_id
      and device.id = actor_device_session_id
      and device.table_session_id = invitation.destination_table_session_id
  ) then
    raise exception 'invitation can only be claimed from the destination table'
      using errcode = '42501';
  end if;

  update public.drink_invitations
  set state = 'claimed',
      claimed_by_device_session_id = actor_device_session_id,
      claimed_at = requested_at,
      updated_at = requested_at
  where tenant_id = requested_tenant_id and id = requested_invitation_id;

  insert into public.drink_invitation_events (
    tenant_id, invitation_id, event_type, actor_type,
    actor_device_session_id, idempotency_key, occurred_at
  ) values (
    requested_tenant_id, requested_invitation_id, 'claimed', 'diner',
    actor_device_session_id, 'invitation:' || requested_invitation_id || ':claimed',
    requested_at
  );

  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic, deduplication_key, payload
  ) values (
    requested_tenant_id, 'drink_invitation', requested_invitation_id,
    'invitation.claimed', 'invitation:' || requested_invitation_id || ':produce',
    jsonb_build_object(
      'destination_table_session_id', invitation.destination_table_session_id,
      'destination_table_id', invitation.destination_table_id,
      'station_id', invitation.station_id,
      'product_id', invitation.product_id,
      'quantity', invitation.quantity,
      'paid', true
    )
  )
  returning id into outbox_id;
  return outbox_id;
end;
$$;

create or replace function private.expire_invitations_for_closed_table()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation record;
begin
  if new.state not in ('closed', 'expired') or old.state = new.state then
    return new;
  end if;
  for invitation in
    update public.drink_invitations
    set state = 'refund_pending',
        expired_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where tenant_id = new.tenant_id
      and destination_table_session_id = new.id
      and state = 'pending_claim'
    returning *
  loop
    insert into public.drink_invitation_events (
      tenant_id, invitation_id, event_type, actor_type,
      idempotency_key, occurred_at
    ) values (
      invitation.tenant_id, invitation.id, 'expired', 'system',
      'invitation:' || invitation.id || ':table-closed',
      clock_timestamp()
    ) on conflict (tenant_id, idempotency_key) do nothing;
    insert into public.outbox_messages (
      tenant_id, aggregate_type, aggregate_id, topic, deduplication_key, payload
    ) values (
      invitation.tenant_id, 'drink_invitation', invitation.id,
      'refund.requested', 'invitation:' || invitation.id || ':refund',
      jsonb_build_object(
        'payment_id', invitation.payment_id,
        'amount_clp', invitation.amount_clp,
        'currency', 'CLP',
        'reason', 'destination_table_closed_before_claim'
      )
    ) on conflict (tenant_id, deduplication_key) do nothing;
  end loop;
  return new;
end;
$$;

create trigger table_sessions_expire_invitations
after update of state on public.table_sessions
for each row execute function private.expire_invitations_for_closed_table();

create trigger checkout_upsell_events_immutable
before update or delete on public.checkout_upsell_events
for each row execute function private.prevent_financial_evidence_mutation();
create trigger promotion_versions_immutable
before update or delete on public.promotion_versions
for each row execute function private.prevent_financial_evidence_mutation();
create trigger promotion_activation_events_immutable
before update or delete on public.promotion_activation_events
for each row execute function private.prevent_financial_evidence_mutation();
create trigger drink_invitation_events_immutable
before update or delete on public.drink_invitation_events
for each row execute function private.prevent_financial_evidence_mutation();
create trigger tip_allocations_immutable
before update or delete on public.tip_allocations
for each row execute function private.prevent_financial_evidence_mutation();

create index checkout_upsell_rules_active_idx
  on public.checkout_upsell_rules (tenant_id, venue_id, priority, id)
  where enabled;
create index checkout_upsell_events_metric_idx
  on public.checkout_upsell_events (tenant_id, occurred_at, event_type);
create index promotion_campaigns_venue_idx
  on public.promotion_campaigns (tenant_id, venue_id, enabled);
create index promotion_versions_window_idx
  on public.promotion_versions (tenant_id, promotion_id, starts_at, ends_at);
create index promotion_activation_events_promotion_idx
  on public.promotion_activation_events (tenant_id, promotion_id, occurred_at desc);
create index drink_invitations_destination_pending_idx
  on public.drink_invitations (
    tenant_id, destination_table_session_id, expires_at
  ) where state = 'pending_claim';
create index drink_invitations_payer_pending_idx
  on public.drink_invitations (
    tenant_id, payer_device_session_id, expires_at
  ) where state = 'pending_claim';
create index drink_invitation_events_invitation_idx
  on public.drink_invitation_events (tenant_id, invitation_id, occurred_at);
create index tip_allocations_shift_employee_idx
  on public.tip_allocations (
    tenant_id, cashier_shift_id, employee_id, payment_method
  );

create view public.owner_checkout_engagement_metrics
with (security_invoker = true)
as
select
  tenant.tenant_id,
  count(*) filter (where event.event_type = 'exposed')::integer as upsell_exposures,
  count(*) filter (where event.event_type = 'accepted')::integer as upsell_acceptances,
  case
    when count(*) filter (where event.event_type = 'exposed') = 0 then 0
    else round(
      100.0 * count(*) filter (where event.event_type = 'accepted')
      / count(*) filter (where event.event_type = 'exposed'),
      2
    )
  end as upsell_acceptance_rate_percent,
  coalesce(sum(event.incremental_revenue_clp)
    filter (where event.event_type = 'paid'), 0)::bigint as upsell_incremental_revenue_clp,
  coalesce((
    select sum(orders.promotion_discount_clp)
    from public.orders orders
    where orders.tenant_id = tenant.tenant_id
  ), 0)::bigint as promotion_discount_clp
from (
  select tenant_id from public.tenant_checkout_engagement_settings
) tenant
left join public.checkout_upsell_events event
  on event.tenant_id = tenant.tenant_id
group by tenant.tenant_id;

create view public.cashier_tip_allocation_summary
with (security_invoker = true)
as
select
  allocation.tenant_id,
  allocation.cashier_shift_id,
  allocation.recipient_type,
  allocation.employee_id,
  coalesce(allocation.employee_label_snapshot, 'Equipo') as recipient_label,
  allocation.payment_method,
  count(*)::integer as payment_count,
  sum(allocation.amount_clp)::bigint as tip_clp
from public.tip_allocations allocation
group by
  allocation.tenant_id,
  allocation.cashier_shift_id,
  allocation.recipient_type,
  allocation.employee_id,
  allocation.employee_label_snapshot,
  allocation.payment_method;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_checkout_engagement_settings',
    'checkout_upsell_rules',
    'checkout_upsell_events',
    'promotion_campaigns',
    'promotion_versions',
    'promotion_activation_events',
    'drink_invitations',
    'drink_invitation_events',
    'tip_allocations'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

create policy checkout_engagement_settings_select
on public.tenant_checkout_engagement_settings for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.read'))
);
create policy checkout_engagement_settings_manage
on public.tenant_checkout_engagement_settings for all to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
);

create policy checkout_upsell_rules_select
on public.checkout_upsell_rules for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.read'))
);
create policy checkout_upsell_rules_manage
on public.checkout_upsell_rules for all to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

create policy promotion_campaigns_select
on public.promotion_campaigns for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.read'))
);
create policy promotion_campaigns_manage
on public.promotion_campaigns for all to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy promotion_versions_select
on public.promotion_versions for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.read'))
);
create policy promotion_activation_events_select
on public.promotion_activation_events for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'audit.read'))
);

create policy checkout_upsell_events_owner_select
on public.checkout_upsell_events for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'owner_dashboard.read'))
);
create policy drink_invitations_staff_select
on public.drink_invitations for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.read'))
);
create policy drink_invitation_events_staff_select
on public.drink_invitation_events for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.read'))
);
create policy tip_allocations_staff_select
on public.tip_allocations for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (
    (select private.has_permission(tenant_id, 'cashier.read'))
    or (select private.has_permission(tenant_id, 'owner_dashboard.read'))
  )
);

revoke all on
  public.tenant_checkout_engagement_settings,
  public.checkout_upsell_rules,
  public.checkout_upsell_events,
  public.promotion_campaigns,
  public.promotion_versions,
  public.promotion_activation_events,
  public.drink_invitations,
  public.drink_invitation_events,
  public.tip_allocations
from public, anon, authenticated;

grant select on
  public.tenant_checkout_engagement_settings,
  public.checkout_upsell_rules,
  public.checkout_upsell_events,
  public.promotion_campaigns,
  public.promotion_versions,
  public.promotion_activation_events,
  public.drink_invitations,
  public.drink_invitation_events,
  public.tip_allocations,
  public.owner_checkout_engagement_metrics,
  public.cashier_tip_allocation_summary
to authenticated;
grant insert, update on
  public.tenant_checkout_engagement_settings,
  public.checkout_upsell_rules,
  public.promotion_campaigns
to authenticated;

revoke execute on function
  private.cancel_drink_invitation(uuid,uuid,uuid,timestamptz),
  private.claim_drink_invitation(uuid,uuid,uuid,timestamptz)
from public, anon, authenticated;

comment on table public.tenant_checkout_engagement_settings is
  'All Sprint 12 capabilities are tenant-configurable and disabled by default.';
comment on column public.checkout_quotes.promotion_discount_clp is
  'Immutable promotion discount frozen when the server creates the quote.';
comment on column public.checkout_quotes.tip_recipient_employee_session_id is
  'Worker shift snapshot; closing the shift never silently reassigns the tip.';
comment on table public.drink_invitations is
  'Paid invitation hold. No production ticket exists until the destination table claims it.';
comment on view public.owner_checkout_engagement_metrics is
  'Deterministic upsell acceptance, attributable revenue and promotion discount.';
