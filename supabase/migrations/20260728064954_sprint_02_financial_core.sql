-- Sprint 2: durable financial core, selective stock reservation and atomic order creation.

create extension if not exists pgmq;

do $$
begin
  if not exists (
    select 1 from pgmq.list_queues() queue
    where queue.queue_name = 'financial_effects'
  ) then
    perform pgmq.create('financial_effects');
  end if;

  if not exists (
    select 1 from pgmq.list_queues() queue
    where queue.queue_name = 'financial_effects_dlq'
  ) then
    perform pgmq.create('financial_effects_dlq');
  end if;
end;
$$;

create table public.tenant_checkout_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  quote_ttl_seconds integer not null default 600
    check (quote_ttl_seconds between 300 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  default_station_id uuid not null,
  sku text,
  name text not null check (btrim(name) <> ''),
  description text,
  unit_price_clp bigint not null check (unit_price_clp >= 0),
  tax_rate_bps integer not null default 1900
    check (tax_rate_bps between 0 and 10000),
  track_stock boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, default_station_id)
    references public.stations (tenant_id, id) on delete restrict
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  product_id uuid not null,
  name text not null check (btrim(name) <> ''),
  sku text,
  price_delta_clp bigint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict
);

create table public.inventory_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  product_id uuid not null,
  on_hand_quantity bigint not null default 0 check (on_hand_quantity >= 0),
  reserved_quantity bigint not null default 0
    check (
      reserved_quantity >= 0
      and reserved_quantity <= on_hand_quantity
    ),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, venue_id, product_id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict
);

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_id uuid not null,
  state text not null default 'active'
    check (state in ('active', 'paused', 'closed', 'expired')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, table_id)
    references public.tables (tenant_id, id) on delete restrict,
  check (closed_at is null or closed_at >= opened_at),
  check (expires_at is null or expires_at > opened_at)
);

create unique index table_sessions_one_live_per_table_idx
  on public.table_sessions (tenant_id, table_id)
  where state in ('active', 'paused');

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_session_id uuid not null,
  device_reference_hash bytea not null
    check (octet_length(device_reference_hash) >= 32),
  person_reference text,
  state text not null default 'open'
    check (
      state in (
        'open',
        'checkout_started',
        'expired',
        'converted_to_order'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, table_session_id, device_reference_hash),
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  cart_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  quantity integer not null check (quantity > 0),
  selected_modifiers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(selected_modifiers) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, cart_id)
    references public.carts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict,
  foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete restrict
);

create table public.checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  cart_id uuid not null,
  table_session_id uuid not null,
  table_id uuid not null,
  device_reference_hash bytea not null
    check (octet_length(device_reference_hash) >= 32),
  person_reference text,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  currency text not null default 'CLP' check (currency = 'CLP'),
  subtotal_clp bigint not null check (subtotal_clp >= 0),
  discount_clp bigint not null default 0 check (discount_clp >= 0),
  tax_clp bigint not null default 0 check (tax_clp >= 0),
  tip_clp bigint not null default 0 check (tip_clp >= 0),
  total_clp bigint not null check (total_clp >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, cart_id)
    references public.carts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_id)
    references public.tables (tenant_id, id) on delete restrict,
  check (expires_at > created_at),
  check (total_clp = subtotal_clp - discount_clp + tax_clp + tip_clp),
  check (discount_clp <= subtotal_clp)
);

create table public.checkout_quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  checkout_quote_id uuid not null,
  source_cart_item_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  station_id uuid not null,
  product_name text not null check (btrim(product_name) <> ''),
  variant_name text,
  selected_modifiers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(selected_modifiers) = 'array'),
  quantity integer not null check (quantity > 0),
  unit_price_clp bigint not null check (unit_price_clp >= 0),
  unit_discount_clp bigint not null default 0
    check (unit_discount_clp >= 0),
  unit_tax_clp bigint not null default 0 check (unit_tax_clp >= 0),
  line_subtotal_clp bigint not null check (line_subtotal_clp >= 0),
  line_discount_clp bigint not null default 0
    check (line_discount_clp >= 0),
  line_tax_clp bigint not null default 0 check (line_tax_clp >= 0),
  line_total_clp bigint not null check (line_total_clp >= 0),
  stock_tracked boolean not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, checkout_quote_id, source_cart_item_id),
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_cart_item_id)
    references public.cart_items (tenant_id, id) on delete restrict,
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict,
  foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete restrict,
  foreign key (tenant_id, station_id)
    references public.stations (tenant_id, id) on delete restrict,
  check (
    line_subtotal_clp = unit_price_clp * quantity
    and line_discount_clp = unit_discount_clp * quantity
    and line_tax_clp = unit_tax_clp * quantity
    and line_total_clp =
      line_subtotal_clp - line_discount_clp + line_tax_clp
  )
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  checkout_quote_id uuid not null,
  checkout_quote_item_id uuid not null,
  inventory_level_id uuid not null,
  quantity integer not null check (quantity > 0),
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  release_reason text,
  unique (tenant_id, id),
  unique (tenant_id, checkout_quote_item_id),
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_item_id)
    references public.checkout_quote_items (tenant_id, id) on delete restrict,
  foreign key (tenant_id, inventory_level_id)
    references public.inventory_levels (tenant_id, id) on delete restrict,
  check (not (released_at is not null and consumed_at is not null)),
  check (
    (released_at is null and release_reason is null)
    or (released_at is not null and btrim(release_reason) <> '')
  )
);

create table public.merchant_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  provider text not null check (btrim(provider) <> ''),
  provider_merchant_id text not null check (btrim(provider_merchant_id) <> ''),
  environment text not null default 'demo'
    check (environment in ('demo', 'test', 'production')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (provider, provider_merchant_id)
);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  checkout_quote_id uuid not null,
  merchant_account_id uuid not null,
  provider text not null check (btrim(provider) <> ''),
  provider_payment_id text not null check (btrim(provider_payment_id) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  amount_clp bigint not null check (amount_clp >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (provider, provider_payment_id),
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, merchant_account_id)
    references public.merchant_accounts (tenant_id, id) on delete restrict
);

create table public.payment_intent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_intent_id uuid not null,
  state text not null
    check (
      state in (
        'created',
        'redirected',
        'processing',
        'approved',
        'rejected',
        'expired',
        'cancelled'
      )
    ),
  source text not null
    check (source in ('system', 'browser', 'provider', 'recovery')),
  source_event_id text,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (tenant_id, id),
  unique nulls not distinct (
    tenant_id,
    payment_intent_id,
    source,
    source_event_id,
    state
  ),
  foreign key (tenant_id, payment_intent_id)
    references public.payment_intents (tenant_id, id) on delete restrict
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_intent_id uuid not null,
  checkout_quote_id uuid not null,
  provider text not null check (btrim(provider) <> ''),
  provider_payment_id text not null check (btrim(provider_payment_id) <> ''),
  amount_clp bigint not null check (amount_clp >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, payment_intent_id),
  unique (provider, provider_payment_id),
  foreign key (tenant_id, payment_intent_id)
    references public.payment_intents (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict
);

create table public.provider_payment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_id uuid,
  checkout_quote_id uuid,
  provider text not null check (btrim(provider) <> ''),
  provider_event_id text not null check (btrim(provider_event_id) <> ''),
  provider_payment_id text not null check (btrim(provider_payment_id) <> ''),
  event_kind text not null check (btrim(event_kind) <> ''),
  normalized_status text not null
    check (
      normalized_status in (
        'pending',
        'approved',
        'rejected',
        'cancelled',
        'refunded',
        'chargeback'
      )
    ),
  amount_clp bigint check (amount_clp is null or amount_clp >= 0),
  currency text check (currency is null or currency = 'CLP'),
  provider_merchant_id text not null
    check (btrim(provider_merchant_id) <> ''),
  signature_verified boolean not null,
  server_verified boolean not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  unique (tenant_id, id),
  unique (provider, provider_event_id),
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  checkout_quote_id uuid not null,
  payment_id uuid not null,
  table_session_id uuid not null,
  table_id uuid not null,
  current_state text not null default 'confirmed'
    check (
      current_state in (
        'awaiting_payment',
        'confirmed',
        'accepted',
        'in_preparation',
        'ready',
        'delivered',
        'cancelled'
      )
    ),
  subtotal_clp bigint not null check (subtotal_clp >= 0),
  discount_clp bigint not null check (discount_clp >= 0),
  tax_clp bigint not null check (tax_clp >= 0),
  tip_clp bigint not null check (tip_clp >= 0),
  total_clp bigint not null check (total_clp >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, checkout_quote_id),
  unique (tenant_id, payment_id),
  foreign key (tenant_id, checkout_quote_id)
    references public.checkout_quotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_id)
    references public.tables (tenant_id, id) on delete restrict,
  check (
    total_clp = subtotal_clp - discount_clp + tax_clp + tip_clp
    and discount_clp <= subtotal_clp
  )
);

create table public.order_state_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  order_id uuid not null,
  state text not null
    check (
      state in (
        'awaiting_payment',
        'confirmed',
        'accepted',
        'in_preparation',
        'ready',
        'delivered',
        'cancelled'
      )
    ),
  source text not null check (source in ('system', 'employee', 'worker')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  order_id uuid not null,
  checkout_quote_item_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  station_id uuid not null,
  product_name text not null,
  variant_name text,
  selected_modifiers jsonb not null,
  quantity integer not null check (quantity > 0),
  unit_price_clp bigint not null check (unit_price_clp >= 0),
  unit_discount_clp bigint not null check (unit_discount_clp >= 0),
  unit_tax_clp bigint not null check (unit_tax_clp >= 0),
  line_total_clp bigint not null check (line_total_clp >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, order_id, checkout_quote_item_id),
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, checkout_quote_item_id)
    references public.checkout_quote_items (tenant_id, id) on delete restrict,
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict,
  foreign key (tenant_id, variant_id)
    references public.product_variants (tenant_id, id) on delete restrict,
  foreign key (tenant_id, station_id)
    references public.stations (tenant_id, id) on delete restrict
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  order_id uuid not null,
  station_id uuid not null,
  current_state text not null default 'queued'
    check (
      current_state in (
        'queued',
        'acknowledged',
        'in_preparation',
        'ready',
        'completed'
      )
    ),
  queued_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, order_id, station_id),
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, station_id)
    references public.stations (tenant_id, id) on delete restrict
);

create table public.ticket_state_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  ticket_id uuid not null,
  state text not null
    check (
      state in (
        'queued',
        'acknowledged',
        'in_preparation',
        'ready',
        'completed'
      )
    ),
  source text not null check (source in ('system', 'employee', 'worker')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (tenant_id, id),
  foreign key (tenant_id, ticket_id)
    references public.tickets (tenant_id, id) on delete restrict
);

create table public.ticket_items (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  ticket_id uuid not null,
  order_item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, ticket_id, order_item_id),
  foreign key (tenant_id, ticket_id)
    references public.tickets (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_item_id)
    references public.order_items (tenant_id, id) on delete restrict
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_id uuid not null,
  provider_refund_id text,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  amount_clp bigint not null check (amount_clp > 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  status text not null
    check (status in ('pending', 'completed', 'rejected')),
  reason text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (provider_refund_id),
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict
);

create table public.chargebacks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_id uuid not null,
  provider_chargeback_id text not null check (btrim(provider_chargeback_id) <> ''),
  amount_clp bigint not null check (amount_clp > 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  status text not null
    check (status in ('open', 'won', 'lost', 'reversed')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (provider_chargeback_id),
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  provider text not null check (btrim(provider) <> ''),
  provider_settlement_id text not null
    check (btrim(provider_settlement_id) <> ''),
  gross_clp bigint not null,
  refunds_clp bigint not null default 0 check (refunds_clp >= 0),
  chargebacks_clp bigint not null default 0 check (chargebacks_clp >= 0),
  provider_fees_clp bigint not null default 0
    check (provider_fees_clp >= 0),
  reported_net_clp bigint not null,
  deposited_clp bigint not null,
  currency text not null default 'CLP' check (currency = 'CLP'),
  settlement_date date not null,
  deposit_reference text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (provider, provider_settlement_id)
);

create table public.provider_fees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  settlement_id uuid not null,
  payment_id uuid,
  fee_type text not null check (btrim(fee_type) <> ''),
  amount_clp bigint not null check (amount_clp >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, settlement_id)
    references public.settlements (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict
);

create table public.reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  payment_id uuid,
  provider_payment_event_id uuid,
  settlement_id uuid,
  exception_type text not null check (btrim(exception_type) <> ''),
  deduplication_key text not null check (btrim(deduplication_key) <> ''),
  priority text not null default 'high'
    check (priority in ('normal', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  requires_immediate_action boolean not null default false,
  visible_to_cashier boolean not null default true,
  decision_required text,
  resolution_options text[] not null default '{}'::text[],
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, exception_type, deduplication_key),
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, provider_payment_event_id)
    references public.provider_payment_events (tenant_id, id) on delete restrict,
  foreign key (tenant_id, settlement_id)
    references public.settlements (tenant_id, id) on delete restrict
);

create table public.processed_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  consumer_name text not null check (btrim(consumer_name) <> ''),
  event_id text not null check (btrim(event_id) <> ''),
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  lock_token uuid not null default gen_random_uuid(),
  locked_until timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb,
  unique (tenant_id, id),
  unique (tenant_id, consumer_name, event_id),
  check (
    (status = 'processing' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create table public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  aggregate_type text not null check (btrim(aggregate_type) <> ''),
  aggregate_id uuid not null,
  topic text not null check (btrim(topic) <> ''),
  deduplication_key text not null check (btrim(deduplication_key) <> ''),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'processing', 'completed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  queue_message_id bigint,
  locked_by text,
  locked_until timestamptz,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, deduplication_key)
);

create table public.outbox_delivery_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  outbox_message_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  worker_name text not null check (btrim(worker_name) <> ''),
  outcome text not null check (outcome in ('started', 'completed', 'failed', 'dead_lettered', 'replayed')),
  error_message text,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, outbox_message_id, attempt_number, outcome),
  foreign key (tenant_id, outbox_message_id)
    references public.outbox_messages (tenant_id, id) on delete restrict
);

create table public.durable_effect_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  outbox_message_id uuid not null,
  effect_type text not null
    check (
      effect_type in (
        'kds_backup',
        'print_placeholder',
        'tax_document_placeholder',
        'reconciliation'
      )
    ),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, outbox_message_id)
    references public.outbox_messages (tenant_id, id) on delete restrict
);

create index products_tenant_venue_idx
  on public.products (tenant_id, venue_id, active);
create unique index products_sku_unique_idx
  on public.products (tenant_id, venue_id, sku)
  where sku is not null;
create index product_variants_tenant_product_idx
  on public.product_variants (tenant_id, product_id, active);
create unique index product_variants_sku_unique_idx
  on public.product_variants (tenant_id, product_id, sku)
  where sku is not null;
create index inventory_levels_tenant_product_idx
  on public.inventory_levels (tenant_id, product_id);
create index table_sessions_tenant_table_idx
  on public.table_sessions (tenant_id, table_id);
create index carts_tenant_session_idx
  on public.carts (tenant_id, table_session_id);
create index cart_items_tenant_cart_idx
  on public.cart_items (tenant_id, cart_id);
create index checkout_quotes_tenant_cart_idx
  on public.checkout_quotes (tenant_id, cart_id, created_at desc);
create index checkout_quotes_expiry_idx
  on public.checkout_quotes (expires_at);
create index checkout_quote_items_quote_station_idx
  on public.checkout_quote_items (tenant_id, checkout_quote_id, station_id);
create index inventory_reservations_active_quote_idx
  on public.inventory_reservations (tenant_id, checkout_quote_id)
  where released_at is null and consumed_at is null;
create index inventory_reservations_level_idx
  on public.inventory_reservations (tenant_id, inventory_level_id);
create index merchant_accounts_tenant_idx
  on public.merchant_accounts (tenant_id, active);
create index payment_intents_quote_idx
  on public.payment_intents (tenant_id, checkout_quote_id);
create index payment_intent_events_current_idx
  on public.payment_intent_events (tenant_id, payment_intent_id, recorded_at desc);
create index payments_quote_idx
  on public.payments (tenant_id, checkout_quote_id);
create index provider_payment_events_payment_idx
  on public.provider_payment_events (tenant_id, payment_id, received_at);
create index provider_payment_events_quote_idx
  on public.provider_payment_events (tenant_id, checkout_quote_id)
  where checkout_quote_id is not null;
create index orders_tenant_state_idx
  on public.orders (tenant_id, current_state, confirmed_at desc);
create index order_items_order_station_idx
  on public.order_items (tenant_id, order_id, station_id);
create index tickets_station_state_idx
  on public.tickets (tenant_id, station_id, current_state, queued_at);
create index ticket_items_order_item_idx
  on public.ticket_items (tenant_id, order_item_id);
create index refunds_payment_idx
  on public.refunds (tenant_id, payment_id, occurred_at);
create index chargebacks_payment_idx
  on public.chargebacks (tenant_id, payment_id, occurred_at);
create index provider_fees_payment_idx
  on public.provider_fees (tenant_id, payment_id)
  where payment_id is not null;
create index reconciliation_exceptions_cashier_idx
  on public.reconciliation_exceptions (tenant_id, status, priority, created_at desc)
  where visible_to_cashier;
create index processed_events_lease_idx
  on public.processed_events (status, locked_until)
  where status = 'processing';
create index outbox_ready_idx
  on public.outbox_messages (status, available_at, created_at)
  where status in ('pending', 'queued');
create index outbox_tenant_topic_idx
  on public.outbox_messages (tenant_id, topic, created_at desc);
create index outbox_delivery_attempts_message_idx
  on public.outbox_delivery_attempts (tenant_id, outbox_message_id, occurred_at);

-- Mutable records keep timestamps consistent. Financial evidence and snapshots
-- are append-only or immutable at the database boundary.
create trigger tenant_checkout_settings_set_updated_at
before update on public.tenant_checkout_settings
for each row execute function private.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function private.set_updated_at();

create trigger inventory_levels_set_updated_at
before update on public.inventory_levels
for each row execute function private.set_updated_at();

create trigger table_sessions_set_updated_at
before update on public.table_sessions
for each row execute function private.set_updated_at();

create trigger carts_set_updated_at
before update on public.carts
for each row execute function private.set_updated_at();

create trigger cart_items_set_updated_at
before update on public.cart_items
for each row execute function private.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function private.set_updated_at();

create trigger outbox_messages_set_updated_at
before update on public.outbox_messages
for each row execute function private.set_updated_at();

create or replace function private.prevent_financial_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception '% is append-only or immutable', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger checkout_quotes_immutable
before update or delete on public.checkout_quotes
for each row execute function private.prevent_financial_evidence_mutation();

create trigger checkout_quote_items_immutable
before update or delete on public.checkout_quote_items
for each row execute function private.prevent_financial_evidence_mutation();

create trigger provider_payment_events_append_only
before update or delete on public.provider_payment_events
for each row execute function private.prevent_financial_evidence_mutation();

create trigger payment_intent_events_append_only
before update or delete on public.payment_intent_events
for each row execute function private.prevent_financial_evidence_mutation();

create trigger order_state_events_append_only
before update or delete on public.order_state_events
for each row execute function private.prevent_financial_evidence_mutation();

create trigger ticket_state_events_append_only
before update or delete on public.ticket_state_events
for each row execute function private.prevent_financial_evidence_mutation();

create or replace function private.validate_table_session_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = old.state then
    return new;
  end if;

  if not (
    (old.state = 'active' and new.state in ('paused', 'closed', 'expired'))
    or (old.state = 'paused' and new.state in ('active', 'closed', 'expired'))
  ) then
    raise exception 'invalid table session transition: % -> %', old.state, new.state
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger table_sessions_validate_transition
before update of state on public.table_sessions
for each row execute function private.validate_table_session_transition();

create or replace function private.validate_cart_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = old.state then
    return new;
  end if;

  if not (
    (old.state = 'open' and new.state in ('checkout_started', 'expired'))
    or (old.state = 'checkout_started'
      and new.state in ('open', 'expired', 'converted_to_order'))
  ) then
    raise exception 'invalid cart transition: % -> %', old.state, new.state
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger carts_validate_transition
before update of state on public.carts
for each row execute function private.validate_cart_transition();

create or replace function private.validate_operational_state_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_state = old.current_state then
    return new;
  end if;

  if tg_table_name = 'orders' and not (
    (old.current_state = 'confirmed'
      and new.current_state in ('accepted', 'cancelled'))
    or (old.current_state = 'accepted'
      and new.current_state in ('in_preparation', 'cancelled'))
    or (old.current_state = 'in_preparation'
      and new.current_state in ('ready', 'cancelled'))
    or (old.current_state = 'ready'
      and new.current_state in ('delivered', 'cancelled'))
  ) then
    raise exception 'invalid order transition: % -> %',
      old.current_state, new.current_state using errcode = '23514';
  elsif tg_table_name = 'tickets' and not (
    (old.current_state = 'queued' and new.current_state = 'acknowledged')
    or (old.current_state = 'acknowledged'
      and new.current_state = 'in_preparation')
    or (old.current_state = 'in_preparation'
      and new.current_state = 'ready')
    or (old.current_state = 'ready' and new.current_state = 'completed')
  ) then
    raise exception 'invalid ticket transition: % -> %',
      old.current_state, new.current_state using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger orders_validate_transition
before update of current_state on public.orders
for each row execute function private.validate_operational_state_transition();

create trigger tickets_validate_transition
before update of current_state on public.tickets
for each row execute function private.validate_operational_state_transition();

create or replace function private.protect_operational_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'orders' and (
    new.tenant_id is distinct from old.tenant_id
    or new.checkout_quote_id is distinct from old.checkout_quote_id
    or new.payment_id is distinct from old.payment_id
    or new.table_session_id is distinct from old.table_session_id
    or new.table_id is distinct from old.table_id
    or new.subtotal_clp is distinct from old.subtotal_clp
    or new.discount_clp is distinct from old.discount_clp
    or new.tax_clp is distinct from old.tax_clp
    or new.tip_clp is distinct from old.tip_clp
    or new.total_clp is distinct from old.total_clp
    or new.currency is distinct from old.currency
    or new.confirmed_at is distinct from old.confirmed_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'order financial fields are immutable'
      using errcode = '55000';
  elsif tg_table_name = 'tickets' and (
    new.tenant_id is distinct from old.tenant_id
    or new.order_id is distinct from old.order_id
    or new.station_id is distinct from old.station_id
    or new.queued_at is distinct from old.queued_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'ticket routing fields are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger orders_protect_financial_fields
before update on public.orders
for each row execute function private.protect_operational_financial_fields();

create trigger tickets_protect_routing_fields
before update on public.tickets
for each row execute function private.protect_operational_financial_fields();

create or replace function private.append_operational_state_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_state = old.current_state then
    return new;
  end if;

  if tg_table_name = 'orders' then
    insert into public.order_state_events (
      tenant_id, order_id, state, source, occurred_at
    )
    values (
      new.tenant_id, new.id, new.current_state, 'employee', clock_timestamp()
    );
  else
    insert into public.ticket_state_events (
      tenant_id, ticket_id, state, source, occurred_at
    )
    values (
      new.tenant_id, new.id, new.current_state, 'employee', clock_timestamp()
    );
  end if;

  return new;
end;
$$;

create trigger orders_append_state_event
after update of current_state on public.orders
for each row execute function private.append_operational_state_event();

create trigger tickets_append_state_event
after update of current_state on public.tickets
for each row execute function private.append_operational_state_event();

create or replace function private.validate_payment_intent_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_state text;
begin
  select event.state
    into previous_state
  from public.payment_intent_events event
  where event.tenant_id = new.tenant_id
    and event.payment_intent_id = new.payment_intent_id
  order by event.recorded_at desc, event.id desc
  limit 1;

  if previous_state is null and new.state <> 'created' then
    raise exception 'payment intent must start in created'
      using errcode = '23514';
  elsif previous_state is not null and not (
    (previous_state = 'created' and new.state = 'redirected')
    or (previous_state = 'redirected'
      and new.state in ('processing', 'rejected', 'expired', 'cancelled'))
    or (previous_state = 'processing'
      and new.state in ('approved', 'rejected', 'expired', 'cancelled'))
  ) then
    raise exception 'invalid payment intent transition: % -> %',
      previous_state, new.state using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payment_intent_events_validate_transition
before insert on public.payment_intent_events
for each row execute function private.validate_payment_intent_event();

create or replace function private.validate_confirmed_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_state <> 'confirmed' or not exists (
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
    raise exception 'confirmed order requires a server-verified approved payment'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger orders_require_approved_payment
before insert on public.orders
for each row execute function private.validate_confirmed_order();

create or replace function private.release_quote_stock(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_reason text,
  p_released_at timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_level record;
  released_count integer;
begin
  if p_tenant_id is null
    or p_checkout_quote_id is null
    or nullif(btrim(p_reason), '') is null then
    raise exception 'tenant, quote and release reason are required'
      using errcode = '22023';
  end if;

  -- Every stock path locks inventory rows in product/id order.
  for locked_level in
    select level.id
    from public.inventory_levels level
    where level.tenant_id = p_tenant_id
      and exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.tenant_id = level.tenant_id
          and reservation.inventory_level_id = level.id
          and reservation.checkout_quote_id = p_checkout_quote_id
          and reservation.released_at is null
          and reservation.consumed_at is null
      )
    order by level.product_id, level.id
    for update
  loop
    null;
  end loop;

  with quantities as (
    select reservation.inventory_level_id, sum(reservation.quantity)::bigint quantity
    from public.inventory_reservations reservation
    where reservation.tenant_id = p_tenant_id
      and reservation.checkout_quote_id = p_checkout_quote_id
      and reservation.released_at is null
      and reservation.consumed_at is null
    group by reservation.inventory_level_id
  )
  update public.inventory_levels level
  set reserved_quantity = level.reserved_quantity - quantities.quantity
  from quantities
  where level.tenant_id = p_tenant_id
    and level.id = quantities.inventory_level_id;

  update public.inventory_reservations reservation
  set released_at = p_released_at,
      release_reason = p_reason
  where reservation.tenant_id = p_tenant_id
    and reservation.checkout_quote_id = p_checkout_quote_id
    and reservation.released_at is null
    and reservation.consumed_at is null;

  get diagnostics released_count = row_count;
  return released_count;
end;
$$;

create or replace function private.release_expired_quote_stock(
  p_tenant_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_quote record;
  total_released integer := 0;
begin
  for expired_quote in
    select quote.id, quote.cart_id
    from public.checkout_quotes quote
    where quote.tenant_id = p_tenant_id
      and quote.expires_at <= p_now
      and exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.tenant_id = quote.tenant_id
          and reservation.checkout_quote_id = quote.id
          and reservation.released_at is null
          and reservation.consumed_at is null
      )
    order by quote.expires_at, quote.id
  loop
    total_released := total_released + private.release_quote_stock(
      p_tenant_id,
      expired_quote.id,
      'quote_expired',
      p_now
    );

    update public.carts
    set state = 'expired'
    where tenant_id = p_tenant_id
      and id = expired_quote.cart_id
      and state = 'checkout_started';
  end loop;

  return total_released;
end;
$$;

create or replace function private.create_checkout_quote(
  p_tenant_id uuid,
  p_cart_id uuid,
  p_tip_clp bigint,
  p_idempotency_key text,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_cart public.carts%rowtype;
  current_session public.table_sessions%rowtype;
  existing_quote_id uuid;
  created_quote_id uuid := gen_random_uuid();
  ttl_seconds integer;
  computed_subtotal bigint;
  computed_tax bigint;
  computed_total bigint;
  stock_item record;
  inventory public.inventory_levels%rowtype;
begin
  if p_tenant_id is null
    or p_cart_id is null
    or p_tip_clp < 0
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'invalid quote parameters' using errcode = '22023';
  end if;

  select quote.id into existing_quote_id
  from public.checkout_quotes quote
  where quote.tenant_id = p_tenant_id
    and quote.idempotency_key = p_idempotency_key;

  if existing_quote_id is not null then
    return existing_quote_id;
  end if;

  perform private.release_expired_quote_stock(p_tenant_id, p_now);

  select cart.* into current_cart
  from public.carts cart
  where cart.tenant_id = p_tenant_id and cart.id = p_cart_id
  for update;

  if not found or current_cart.state <> 'open' then
    raise exception 'cart is missing or not open' using errcode = '55000';
  end if;

  select session.* into current_session
  from public.table_sessions session
  where session.tenant_id = p_tenant_id
    and session.id = current_cart.table_session_id
  for share;

  if not found or current_session.state <> 'active'
    or (current_session.expires_at is not null
      and current_session.expires_at <= p_now) then
    raise exception 'table session is not active' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.cart_items item
    where item.tenant_id = p_tenant_id and item.cart_id = p_cart_id
  ) then
    raise exception 'cart is empty' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.cart_items item
    join public.products product
      on product.tenant_id = item.tenant_id and product.id = item.product_id
    left join public.product_variants variant
      on variant.tenant_id = item.tenant_id and variant.id = item.variant_id
    where item.tenant_id = p_tenant_id
      and item.cart_id = p_cart_id
      and (
        not product.active
        or product.venue_id <> (
          select venue.id
          from public.tables table_record
          join public.zones zone
            on zone.tenant_id = table_record.tenant_id
           and zone.id = table_record.zone_id
          join public.venues venue
            on venue.tenant_id = zone.tenant_id and venue.id = zone.venue_id
          where table_record.tenant_id = p_tenant_id
            and table_record.id = current_session.table_id
        )
        or (item.variant_id is not null
          and (variant.id is null
            or not variant.active
            or variant.product_id <> item.product_id))
      )
  ) then
    raise exception 'cart contains unavailable or cross-venue items'
      using errcode = '23514';
  end if;

  select
    sum((product.unit_price_clp + coalesce(variant.price_delta_clp, 0))
      * item.quantity)::bigint,
    sum(round(
      (product.unit_price_clp + coalesce(variant.price_delta_clp, 0))
      * product.tax_rate_bps::numeric / 10000
    )::bigint * item.quantity)::bigint
  into computed_subtotal, computed_tax
  from public.cart_items item
  join public.products product
    on product.tenant_id = item.tenant_id and product.id = item.product_id
  left join public.product_variants variant
    on variant.tenant_id = item.tenant_id and variant.id = item.variant_id
  where item.tenant_id = p_tenant_id and item.cart_id = p_cart_id;

  computed_total := computed_subtotal + computed_tax + p_tip_clp;

  select coalesce(settings.quote_ttl_seconds, 600)
    into ttl_seconds
  from (select p_tenant_id tenant_id) requested
  left join public.tenant_checkout_settings settings
    on settings.tenant_id = requested.tenant_id;

  insert into public.checkout_quotes (
    id, tenant_id, cart_id, table_session_id, table_id,
    device_reference_hash, person_reference, idempotency_key,
    subtotal_clp, discount_clp, tax_clp, tip_clp, total_clp,
    expires_at, created_at
  )
  values (
    created_quote_id, p_tenant_id, p_cart_id,
    current_cart.table_session_id, current_session.table_id,
    current_cart.device_reference_hash, current_cart.person_reference,
    p_idempotency_key, computed_subtotal, 0, computed_tax, p_tip_clp,
    computed_total, p_now + make_interval(secs => ttl_seconds), p_now
  );

  insert into public.checkout_quote_items (
    tenant_id, checkout_quote_id, source_cart_item_id,
    product_id, variant_id, station_id, product_name, variant_name,
    selected_modifiers, quantity, unit_price_clp, unit_discount_clp,
    unit_tax_clp, line_subtotal_clp, line_discount_clp, line_tax_clp,
    line_total_clp, stock_tracked, created_at
  )
  select
    p_tenant_id, created_quote_id, item.id,
    product.id, variant.id, product.default_station_id,
    product.name, variant.name, item.selected_modifiers, item.quantity,
    product.unit_price_clp + coalesce(variant.price_delta_clp, 0), 0,
    round(
      (product.unit_price_clp + coalesce(variant.price_delta_clp, 0))
      * product.tax_rate_bps::numeric / 10000
    )::bigint,
    (product.unit_price_clp + coalesce(variant.price_delta_clp, 0))
      * item.quantity,
    0,
    round(
      (product.unit_price_clp + coalesce(variant.price_delta_clp, 0))
      * product.tax_rate_bps::numeric / 10000
    )::bigint * item.quantity,
    (
      product.unit_price_clp + coalesce(variant.price_delta_clp, 0)
      + round(
        (product.unit_price_clp + coalesce(variant.price_delta_clp, 0))
        * product.tax_rate_bps::numeric / 10000
      )::bigint
    ) * item.quantity,
    product.track_stock,
    p_now
  from public.cart_items item
  join public.products product
    on product.tenant_id = item.tenant_id and product.id = item.product_id
  left join public.product_variants variant
    on variant.tenant_id = item.tenant_id and variant.id = item.variant_id
  where item.tenant_id = p_tenant_id and item.cart_id = p_cart_id;

  for stock_item in
    select quote_item.*, product.venue_id
    from public.checkout_quote_items quote_item
    join public.products product
      on product.tenant_id = quote_item.tenant_id
     and product.id = quote_item.product_id
    where quote_item.tenant_id = p_tenant_id
      and quote_item.checkout_quote_id = created_quote_id
      and quote_item.stock_tracked
    order by quote_item.product_id, quote_item.id
  loop
    select level.* into inventory
    from public.inventory_levels level
    where level.tenant_id = p_tenant_id
      and level.venue_id = stock_item.venue_id
      and level.product_id = stock_item.product_id
    for update;

    if not found
      or inventory.on_hand_quantity - inventory.reserved_quantity
        < stock_item.quantity then
      raise exception 'insufficient stock for product %', stock_item.product_id
        using errcode = 'P0001';
    end if;

    update public.inventory_levels
    set reserved_quantity = reserved_quantity + stock_item.quantity
    where tenant_id = p_tenant_id and id = inventory.id;

    insert into public.inventory_reservations (
      tenant_id, checkout_quote_id, checkout_quote_item_id,
      inventory_level_id, quantity, reserved_at
    )
    values (
      p_tenant_id, created_quote_id, stock_item.id,
      inventory.id, stock_item.quantity, p_now
    );
  end loop;

  update public.carts
  set state = 'checkout_started'
  where tenant_id = p_tenant_id and id = p_cart_id;

  insert into public.audit_log (
    tenant_id, actor_type, action, target_type, target_id, after_data
  )
  values (
    p_tenant_id, 'platform', 'checkout.quote_created',
    'checkout_quote', created_quote_id,
    jsonb_build_object(
      'expires_at', p_now + make_interval(secs => ttl_seconds),
      'ttl_seconds', ttl_seconds,
      'selective_stock_reservation', true
    )
  );

  return created_quote_id;
end;
$$;

create or replace function private.create_payment_intent(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_merchant_account_id uuid,
  p_provider_payment_id text,
  p_idempotency_key text,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_record public.checkout_quotes%rowtype;
  merchant_record public.merchant_accounts%rowtype;
  intent_id uuid;
begin
  select intent.id into intent_id
  from public.payment_intents intent
  where intent.tenant_id = p_tenant_id
    and intent.idempotency_key = p_idempotency_key;

  if intent_id is not null then
    return intent_id;
  end if;

  select quote.* into quote_record
  from public.checkout_quotes quote
  where quote.tenant_id = p_tenant_id and quote.id = p_checkout_quote_id
  for share;

  if not found or quote_record.expires_at <= p_now then
    raise exception 'quote is missing or expired' using errcode = '55000';
  end if;

  select merchant.* into merchant_record
  from public.merchant_accounts merchant
  where merchant.tenant_id = p_tenant_id
    and merchant.id = p_merchant_account_id
    and merchant.active
  for share;

  if not found then
    raise exception 'merchant account is missing or inactive'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.checkout_quote_items quote_item
    where quote_item.tenant_id = p_tenant_id
      and quote_item.checkout_quote_id = p_checkout_quote_id
      and quote_item.stock_tracked
      and not exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.tenant_id = quote_item.tenant_id
          and reservation.checkout_quote_item_id = quote_item.id
          and reservation.released_at is null
          and reservation.consumed_at is null
      )
  ) then
    raise exception 'stock reservation is no longer active'
      using errcode = '55000';
  end if;

  intent_id := gen_random_uuid();

  insert into public.payment_intents (
    id, tenant_id, checkout_quote_id, merchant_account_id,
    provider, provider_payment_id, idempotency_key,
    amount_clp, currency, created_at
  )
  values (
    intent_id, p_tenant_id, p_checkout_quote_id, p_merchant_account_id,
    merchant_record.provider, p_provider_payment_id, p_idempotency_key,
    quote_record.total_clp, quote_record.currency, p_now
  );

  insert into public.payments (
    tenant_id, payment_intent_id, checkout_quote_id, provider,
    provider_payment_id, amount_clp, currency, created_at
  )
  values (
    p_tenant_id, intent_id, p_checkout_quote_id, merchant_record.provider,
    p_provider_payment_id, quote_record.total_clp, quote_record.currency, p_now
  );

  insert into public.payment_intent_events (
    tenant_id, payment_intent_id, state, source, occurred_at, recorded_at
  )
  values (
    p_tenant_id, intent_id, 'created', 'system', p_now, p_now
  );

  return intent_id;
end;
$$;

create or replace function private.advance_payment_intent(
  p_tenant_id uuid,
  p_payment_intent_id uuid,
  p_target_state text,
  p_source_event_id text,
  p_occurred_at timestamptz,
  p_recorded_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state text;
  database_recorded_at timestamptz := clock_timestamp();
begin
  select event.state into current_state
  from public.payment_intent_events event
  where event.tenant_id = p_tenant_id
    and event.payment_intent_id = p_payment_intent_id
  order by event.recorded_at desc, event.id desc
  limit 1;

  if current_state in ('approved', 'rejected', 'expired', 'cancelled') then
    return current_state;
  end if;

  if current_state = 'created' then
    insert into public.payment_intent_events (
      tenant_id, payment_intent_id, state, source, source_event_id,
      occurred_at, recorded_at, metadata
    )
    values (
      p_tenant_id, p_payment_intent_id, 'redirected', 'provider',
      p_source_event_id, p_occurred_at,
      database_recorded_at - interval '2 microseconds',
      p_metadata || '{"synthetic":true}'::jsonb
    )
    on conflict do nothing;
    current_state := 'redirected';
  end if;

  if current_state = 'redirected'
    and p_target_state in ('processing', 'approved') then
    insert into public.payment_intent_events (
      tenant_id, payment_intent_id, state, source, source_event_id,
      occurred_at, recorded_at, metadata
    )
    values (
      p_tenant_id, p_payment_intent_id, 'processing', 'provider',
      p_source_event_id, p_occurred_at,
      database_recorded_at - interval '1 microsecond',
      p_metadata || '{"synthetic":true}'::jsonb
    )
    on conflict do nothing;
    current_state := 'processing';
  end if;

  if p_target_state <> current_state then
    insert into public.payment_intent_events (
      tenant_id, payment_intent_id, state, source, source_event_id,
      occurred_at, recorded_at, metadata
    )
    values (
      p_tenant_id, p_payment_intent_id, p_target_state, 'provider',
      p_source_event_id, p_occurred_at, database_recorded_at, p_metadata
    )
    on conflict do nothing;
    current_state := p_target_state;
  end if;

  return current_state;
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

create or replace function private.record_browser_return(
  p_tenant_id uuid,
  p_payment_intent_id uuid,
  p_provider_reference text,
  p_now timestamptz default clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state text;
begin
  select event.state into current_state
  from public.payment_intent_events event
  where event.tenant_id = p_tenant_id
    and event.payment_intent_id = p_payment_intent_id
  order by event.recorded_at desc, event.id desc
  limit 1;

  if current_state = 'created' then
    insert into public.payment_intent_events (
      tenant_id, payment_intent_id, state, source, source_event_id,
      occurred_at, recorded_at, metadata
    )
    values (
      p_tenant_id, p_payment_intent_id, 'redirected', 'browser',
      p_provider_reference, p_now, p_now,
      '{"commercial_confirmation":false}'::jsonb
    )
    on conflict do nothing;
    current_state := 'redirected';
  end if;

  return current_state;
end;
$$;

create or replace function private.add_reconciliation_exception(
  p_tenant_id uuid,
  p_payment_id uuid,
  p_provider_payment_event_id uuid,
  p_settlement_id uuid,
  p_exception_type text,
  p_deduplication_key text,
  p_priority text,
  p_requires_immediate_action boolean,
  p_visible_to_cashier boolean,
  p_decision_required text,
  p_resolution_options text[],
  p_details jsonb,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  exception_id uuid;
begin
  insert into public.reconciliation_exceptions (
    tenant_id, payment_id, provider_payment_event_id, settlement_id,
    exception_type, deduplication_key, priority,
    requires_immediate_action, visible_to_cashier, decision_required,
    resolution_options, details, created_at
  )
  values (
    p_tenant_id, p_payment_id, p_provider_payment_event_id, p_settlement_id,
    p_exception_type, p_deduplication_key, p_priority,
    p_requires_immediate_action, p_visible_to_cashier, p_decision_required,
    coalesce(p_resolution_options, '{}'::text[]),
    coalesce(p_details, '{}'::jsonb), p_now
  )
  on conflict (tenant_id, exception_type, deduplication_key)
  do update set details = public.reconciliation_exceptions.details
  returning id into exception_id;

  if p_requires_immediate_action and p_visible_to_cashier then
    insert into public.outbox_messages (
      tenant_id, aggregate_type, aggregate_id, topic,
      deduplication_key, payload, available_at, created_at
    )
    values (
      p_tenant_id, 'reconciliation_exception', exception_id,
      'cashier.reconciliation_attention_required',
      'cashier-exception:' || exception_id::text,
      jsonb_build_object(
        'exception_id', exception_id,
        'priority', p_priority,
        'message', p_decision_required,
        'resolution_options', coalesce(p_resolution_options, '{}'::text[])
      ),
      p_now, p_now
    )
    on conflict (tenant_id, deduplication_key) do nothing;
  end if;

  return exception_id;
end;
$$;

create or replace function private.confirm_provider_payment_event(
  p_tenant_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_event_kind text,
  p_normalized_status text,
  p_amount_clp bigint,
  p_currency text,
  p_provider_merchant_id text,
  p_checkout_quote_id uuid,
  p_signature_verified boolean,
  p_server_verified boolean,
  p_occurred_at timestamptz,
  p_received_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  intent_record public.payment_intents%rowtype;
  quote_record public.checkout_quotes%rowtype;
  merchant_record public.merchant_accounts%rowtype;
  inserted_provider_event_id uuid;
  existing_event public.provider_payment_events%rowtype;
  created_order_id uuid;
  exception_id uuid;
  mismatch_type text;
  mismatch_details jsonb := '{}'::jsonb;
  stock_level record;
begin
  if p_tenant_id is null
    or nullif(btrim(p_provider), '') is null
    or nullif(btrim(p_provider_event_id), '') is null
    or nullif(btrim(p_provider_payment_id), '') is null
    or p_received_at is null
    or p_occurred_at is null then
    raise exception 'invalid provider event parameters' using errcode = '22023';
  end if;

  select payment.* into payment_record
  from public.payments payment
  where payment.provider = p_provider
    and payment.provider_payment_id = p_provider_payment_id;

  if found then
    select intent.* into intent_record
    from public.payment_intents intent
    where intent.tenant_id = payment_record.tenant_id
      and intent.id = payment_record.payment_intent_id;

    select quote.* into quote_record
    from public.checkout_quotes quote
    where quote.tenant_id = payment_record.tenant_id
      and quote.id = payment_record.checkout_quote_id;

    select merchant.* into merchant_record
    from public.merchant_accounts merchant
    where merchant.tenant_id = intent_record.tenant_id
      and merchant.id = intent_record.merchant_account_id;
  end if;

  insert into public.provider_payment_events (
    tenant_id, payment_id, checkout_quote_id, provider,
    provider_event_id, provider_payment_id, event_kind, normalized_status,
    amount_clp, currency, provider_merchant_id,
    signature_verified, server_verified, occurred_at, received_at,
    payload, payload_hash
  )
  values (
    p_tenant_id,
    case when payment_record.id is not null
      and payment_record.tenant_id = p_tenant_id
      then payment_record.id end,
    case
      when payment_record.id is not null
        and payment_record.tenant_id = p_tenant_id
        and (p_checkout_quote_id is null
          or p_checkout_quote_id = payment_record.checkout_quote_id)
        then payment_record.checkout_quote_id
      else p_checkout_quote_id
    end,
    p_provider, p_provider_event_id, p_provider_payment_id,
    p_event_kind, p_normalized_status, p_amount_clp, p_currency,
    p_provider_merchant_id, p_signature_verified, p_server_verified,
    p_occurred_at, p_received_at, coalesce(p_payload, '{}'::jsonb),
    extensions.digest(
      convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'UTF8'),
      'sha256'
    )
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into inserted_provider_event_id;

  if inserted_provider_event_id is null then
    select event.* into existing_event
    from public.provider_payment_events event
    where event.provider = p_provider
      and event.provider_event_id = p_provider_event_id;

    if existing_event.tenant_id <> p_tenant_id then
      raise exception 'provider event already belongs to another tenant'
        using errcode = '23505';
    end if;

    select existing_order.id into created_order_id
    from public.orders existing_order
    where existing_order.tenant_id = p_tenant_id
      and existing_order.payment_id = existing_event.payment_id;

    return jsonb_build_object(
      'outcome', 'duplicate_ignored',
      'provider_event_id', existing_event.id,
      'order_id', created_order_id
    );
  end if;

  if payment_record.id is null
    or payment_record.tenant_id <> p_tenant_id
    or quote_record.id is null then
    exception_id := private.add_reconciliation_exception(
      p_tenant_id, null, inserted_provider_event_id, null,
      'provider_payment_without_quote',
      p_provider || ':' || p_provider_payment_id,
      'critical', true, true,
      'requiere decisión: investigar y reembolsar o asociar manualmente',
      array['refund', 'associate_manually'],
      jsonb_build_object(
        'provider', p_provider,
        'provider_payment_id', p_provider_payment_id
      ),
      p_received_at
    );

    return jsonb_build_object(
      'outcome', 'reconciliation_exception',
      'exception_id', exception_id,
      'reason', 'provider_payment_without_quote'
    );
  end if;

  if p_normalized_status = 'pending' then
    perform private.advance_payment_intent(
      p_tenant_id, intent_record.id, 'processing', p_provider_event_id,
      p_occurred_at, p_received_at,
      jsonb_build_object('provider_event_id', inserted_provider_event_id)
    );
    return jsonb_build_object(
      'outcome', 'pending_no_commercial_effect',
      'provider_event_id', inserted_provider_event_id
    );
  end if;

  if p_normalized_status in ('rejected', 'cancelled') then
    if exists (
      select 1 from public.orders existing_order
      where existing_order.tenant_id = p_tenant_id
        and existing_order.payment_id = payment_record.id
    ) then
      return jsonb_build_object(
        'outcome', 'late_event_recorded_no_state_regression',
        'provider_event_id', inserted_provider_event_id
      );
    end if;

    perform private.advance_payment_intent(
      p_tenant_id, intent_record.id, p_normalized_status,
      p_provider_event_id, p_occurred_at, p_received_at,
      jsonb_build_object('provider_event_id', inserted_provider_event_id)
    );
    perform private.release_checkout(
      p_tenant_id, quote_record.id,
      'payment_' || p_normalized_status, p_received_at
    );
    return jsonb_build_object(
      'outcome', p_normalized_status || '_stock_released',
      'provider_event_id', inserted_provider_event_id
    );
  end if;

  if p_normalized_status <> 'approved' then
    return jsonb_build_object(
      'outcome', 'event_recorded_no_order',
      'provider_event_id', inserted_provider_event_id
    );
  end if;

  -- Provider truth is recorded even if commercial validation rejects production.
  perform private.advance_payment_intent(
    p_tenant_id, intent_record.id, 'approved', p_provider_event_id,
    p_occurred_at, p_received_at,
    jsonb_build_object('provider_event_id', inserted_provider_event_id)
  );

  select existing_order.id into created_order_id
  from public.orders existing_order
  where existing_order.tenant_id = p_tenant_id
    and existing_order.payment_id = payment_record.id;

  if created_order_id is not null then
    return jsonb_build_object(
      'outcome', 'already_confirmed',
      'provider_event_id', inserted_provider_event_id,
      'order_id', created_order_id
    );
  end if;

  if not p_signature_verified or not p_server_verified then
    mismatch_type := 'unverified_provider_confirmation';
    mismatch_details := jsonb_build_object(
      'signature_verified', p_signature_verified,
      'server_verified', p_server_verified
    );
  elsif p_checkout_quote_id is not null
    and p_checkout_quote_id <> quote_record.id then
    mismatch_type := 'quote_mismatch';
    mismatch_details := jsonb_build_object(
      'expected_quote_id', quote_record.id,
      'received_quote_id', p_checkout_quote_id
    );
  elsif p_amount_clp is distinct from quote_record.total_clp
    or p_currency is distinct from quote_record.currency then
    mismatch_type := 'amount_or_currency_mismatch';
    mismatch_details := jsonb_build_object(
      'expected_amount_clp', quote_record.total_clp,
      'received_amount_clp', p_amount_clp,
      'expected_currency', quote_record.currency,
      'received_currency', p_currency
    );
  elsif merchant_record.provider <> p_provider
    or merchant_record.provider_merchant_id <> p_provider_merchant_id
    or merchant_record.tenant_id <> p_tenant_id then
    mismatch_type := 'merchant_or_tenant_mismatch';
    mismatch_details := jsonb_build_object(
      'expected_merchant_id', merchant_record.provider_merchant_id,
      'received_merchant_id', p_provider_merchant_id,
      'expected_tenant_id', merchant_record.tenant_id,
      'received_tenant_id', p_tenant_id
    );
  end if;

  if mismatch_type is not null then
    perform private.release_checkout(
      p_tenant_id, quote_record.id, mismatch_type, p_received_at
    );
    exception_id := private.add_reconciliation_exception(
      p_tenant_id, payment_record.id, inserted_provider_event_id, null,
      mismatch_type, p_provider || ':' || p_provider_event_id,
      'critical', true, true,
      'requiere decisión: revisar el pago antes de producir',
      array['refund', 'investigate'],
      mismatch_details,
      p_received_at
    );
    return jsonb_build_object(
      'outcome', 'rejected_with_exception',
      'reason', mismatch_type,
      'exception_id', exception_id
    );
  end if;

  if quote_record.expires_at <= p_received_at then
    perform private.release_checkout(
      p_tenant_id, quote_record.id, 'approved_after_quote_expired',
      p_received_at
    );
    exception_id := private.add_reconciliation_exception(
      p_tenant_id, payment_record.id, inserted_provider_event_id, null,
      'approved_after_quote_expired',
      p_provider || ':' || p_provider_payment_id,
      'critical', true, true,
      'requiere decisión: reembolsar o producir manualmente',
      array['refund', 'produce_manually'],
      jsonb_build_object(
        'quote_id', quote_record.id,
        'quote_expires_at', quote_record.expires_at,
        'payment_received_at', p_received_at,
        'customer_waiting_at_table', true
      ),
      p_received_at
    );
    return jsonb_build_object(
      'outcome', 'late_approval_no_order',
      'exception_id', exception_id
    );
  end if;

  if exists (
    select 1
    from public.checkout_quote_items quote_item
    where quote_item.tenant_id = p_tenant_id
      and quote_item.checkout_quote_id = quote_record.id
      and quote_item.stock_tracked
      and not exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.tenant_id = quote_item.tenant_id
          and reservation.checkout_quote_item_id = quote_item.id
          and reservation.released_at is null
          and reservation.consumed_at is null
      )
  ) then
    exception_id := private.add_reconciliation_exception(
      p_tenant_id, payment_record.id, inserted_provider_event_id, null,
      'approved_without_active_stock_reservation',
      p_provider || ':' || p_provider_payment_id,
      'critical', true, true,
      'requiere decisión: reembolsar o producir manualmente',
      array['refund', 'produce_manually'],
      jsonb_build_object('quote_id', quote_record.id),
      p_received_at
    );
    return jsonb_build_object(
      'outcome', 'stock_reservation_missing_no_order',
      'exception_id', exception_id
    );
  end if;

  created_order_id := gen_random_uuid();
  insert into public.orders (
    id, tenant_id, checkout_quote_id, payment_id,
    table_session_id, table_id, current_state,
    subtotal_clp, discount_clp, tax_clp, tip_clp, total_clp,
    currency, confirmed_at, created_at, updated_at
  )
  values (
    created_order_id, p_tenant_id, quote_record.id, payment_record.id,
    quote_record.table_session_id, quote_record.table_id, 'confirmed',
    quote_record.subtotal_clp, quote_record.discount_clp,
    quote_record.tax_clp, quote_record.tip_clp, quote_record.total_clp,
    quote_record.currency, p_received_at, p_received_at, p_received_at
  );

  insert into public.order_state_events (
    tenant_id, order_id, state, source, occurred_at, metadata
  )
  values
    (
      p_tenant_id, created_order_id, 'awaiting_payment', 'system',
      intent_record.created_at,
      jsonb_build_object('payment_intent_id', intent_record.id)
    ),
    (
      p_tenant_id, created_order_id, 'confirmed', 'worker',
      p_received_at,
      jsonb_build_object('provider_event_id', inserted_provider_event_id)
    );

  insert into public.order_items (
    tenant_id, order_id, checkout_quote_item_id, product_id, variant_id,
    station_id, product_name, variant_name, selected_modifiers, quantity,
    unit_price_clp, unit_discount_clp, unit_tax_clp, line_total_clp,
    created_at
  )
  select
    p_tenant_id, created_order_id, quote_item.id, quote_item.product_id,
    quote_item.variant_id, quote_item.station_id, quote_item.product_name,
    quote_item.variant_name, quote_item.selected_modifiers,
    quote_item.quantity, quote_item.unit_price_clp,
    quote_item.unit_discount_clp, quote_item.unit_tax_clp,
    quote_item.line_total_clp, p_received_at
  from public.checkout_quote_items quote_item
  where quote_item.tenant_id = p_tenant_id
    and quote_item.checkout_quote_id = quote_record.id;

  insert into public.tickets (
    tenant_id, order_id, station_id, current_state,
    queued_at, created_at, updated_at
  )
  select
    p_tenant_id, created_order_id, quote_item.station_id, 'queued',
    p_received_at, p_received_at, p_received_at
  from public.checkout_quote_items quote_item
  where quote_item.tenant_id = p_tenant_id
    and quote_item.checkout_quote_id = quote_record.id
  group by quote_item.station_id;

  insert into public.ticket_state_events (
    tenant_id, ticket_id, state, source, occurred_at
  )
  select p_tenant_id, ticket.id, 'queued', 'system', p_received_at
  from public.tickets ticket
  where ticket.tenant_id = p_tenant_id
    and ticket.order_id = created_order_id;

  insert into public.ticket_items (
    tenant_id, ticket_id, order_item_id, created_at
  )
  select p_tenant_id, ticket.id, order_item.id, p_received_at
  from public.order_items order_item
  join public.tickets ticket
    on ticket.tenant_id = order_item.tenant_id
   and ticket.order_id = order_item.order_id
   and ticket.station_id = order_item.station_id
  where order_item.tenant_id = p_tenant_id
    and order_item.order_id = created_order_id;

  for stock_level in
    select level.id, level.product_id
    from public.inventory_levels level
    where level.tenant_id = p_tenant_id
      and exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.tenant_id = level.tenant_id
          and reservation.inventory_level_id = level.id
          and reservation.checkout_quote_id = quote_record.id
          and reservation.released_at is null
          and reservation.consumed_at is null
      )
    order by level.product_id, level.id
    for update
  loop
    null;
  end loop;

  with quantities as (
    select reservation.inventory_level_id,
      sum(reservation.quantity)::bigint quantity
    from public.inventory_reservations reservation
    where reservation.tenant_id = p_tenant_id
      and reservation.checkout_quote_id = quote_record.id
      and reservation.released_at is null
      and reservation.consumed_at is null
    group by reservation.inventory_level_id
  )
  update public.inventory_levels level
  set on_hand_quantity = level.on_hand_quantity - quantities.quantity,
      reserved_quantity = level.reserved_quantity - quantities.quantity
  from quantities
  where level.tenant_id = p_tenant_id
    and level.id = quantities.inventory_level_id;

  update public.inventory_reservations
  set consumed_at = p_received_at
  where tenant_id = p_tenant_id
    and checkout_quote_id = quote_record.id
    and released_at is null
    and consumed_at is null;

  update public.carts
  set state = 'converted_to_order'
  where tenant_id = p_tenant_id
    and id = quote_record.cart_id
    and state = 'checkout_started';

  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic,
    deduplication_key, payload, available_at, created_at
  )
  values
    (
      p_tenant_id, 'order', created_order_id, 'kds.order_confirmed_backup',
      'order:' || created_order_id::text || ':kds',
      jsonb_build_object('order_id', created_order_id),
      p_received_at, p_received_at
    ),
    (
      p_tenant_id, 'order', created_order_id, 'print.order_confirmed',
      'order:' || created_order_id::text || ':print',
      jsonb_build_object('order_id', created_order_id),
      p_received_at, p_received_at
    ),
    (
      p_tenant_id, 'order', created_order_id,
      'tax_document.order_confirmed',
      'order:' || created_order_id::text || ':tax-document',
      jsonb_build_object('order_id', created_order_id, 'placeholder', true),
      p_received_at, p_received_at
    ),
    (
      p_tenant_id, 'order', created_order_id,
      'reconciliation.payment_confirmed',
      'order:' || created_order_id::text || ':reconciliation',
      jsonb_build_object(
        'order_id', created_order_id,
        'payment_id', payment_record.id,
        'provider_event_id', inserted_provider_event_id
      ),
      p_received_at, p_received_at
    );

  insert into public.audit_log (
    tenant_id, actor_type, action, target_type, target_id, after_data,
    occurred_at
  )
  values (
    p_tenant_id, 'worker', 'payment.confirmed_order_created',
    'order', created_order_id,
    jsonb_build_object(
      'payment_id', payment_record.id,
      'quote_id', quote_record.id,
      'provider_event_id', inserted_provider_event_id
    ),
    p_received_at
  );

  return jsonb_build_object(
    'outcome', 'order_confirmed',
    'provider_event_id', inserted_provider_event_id,
    'order_id', created_order_id
  );
end;
$$;

create or replace function private.record_refund(
  p_tenant_id uuid,
  p_payment_id uuid,
  p_provider_refund_id text,
  p_idempotency_key text,
  p_amount_clp bigint,
  p_status text,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  refund_id uuid;
  already_refunded bigint;
begin
  select refund.id into refund_id
  from public.refunds refund
  where refund.tenant_id = p_tenant_id
    and refund.idempotency_key = p_idempotency_key;

  if refund_id is not null then
    return refund_id;
  end if;

  select payment.* into payment_record
  from public.payments payment
  where payment.tenant_id = p_tenant_id and payment.id = p_payment_id
  for share;

  if not found or not exists (
    select 1
    from public.provider_payment_events event
    where event.tenant_id = p_tenant_id
      and event.payment_id = p_payment_id
      and event.normalized_status = 'approved'
      and event.signature_verified
      and event.server_verified
  ) then
    raise exception 'refund requires an approved payment'
      using errcode = '55000';
  end if;

  select coalesce(sum(refund.amount_clp), 0)
    into already_refunded
  from public.refunds refund
  where refund.tenant_id = p_tenant_id
    and refund.payment_id = p_payment_id
    and refund.status in ('pending', 'completed');

  if p_amount_clp <= 0
    or already_refunded + p_amount_clp > payment_record.amount_clp then
    raise exception 'refund exceeds remaining approved amount'
      using errcode = '23514';
  end if;

  insert into public.refunds (
    tenant_id, payment_id, provider_refund_id, idempotency_key,
    amount_clp, currency, status, reason, occurred_at, created_at
  )
  values (
    p_tenant_id, p_payment_id, p_provider_refund_id, p_idempotency_key,
    p_amount_clp, payment_record.currency, p_status, p_reason, p_now, p_now
  )
  returning id into refund_id;

  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic,
    deduplication_key, payload, available_at, created_at
  )
  values (
    p_tenant_id, 'refund', refund_id, 'reconciliation.refund_recorded',
    'refund:' || refund_id::text || ':reconciliation',
    jsonb_build_object(
      'refund_id', refund_id,
      'payment_id', p_payment_id,
      'amount_clp', p_amount_clp,
      'status', p_status
    ),
    p_now, p_now
  );

  return refund_id;
end;
$$;

create or replace function private.record_chargeback(
  p_tenant_id uuid,
  p_payment_id uuid,
  p_provider_chargeback_id text,
  p_amount_clp bigint,
  p_status text,
  p_occurred_at timestamptz,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  chargeback_id uuid;
begin
  insert into public.chargebacks (
    tenant_id, payment_id, provider_chargeback_id, amount_clp,
    status, occurred_at, created_at
  )
  values (
    p_tenant_id, p_payment_id, p_provider_chargeback_id, p_amount_clp,
    p_status, p_occurred_at, p_now
  )
  on conflict (provider_chargeback_id)
  do update set provider_chargeback_id = excluded.provider_chargeback_id
  returning id into chargeback_id;

  return chargeback_id;
end;
$$;

create or replace function private.record_settlement(
  p_tenant_id uuid,
  p_provider text,
  p_provider_settlement_id text,
  p_gross_clp bigint,
  p_refunds_clp bigint,
  p_chargebacks_clp bigint,
  p_provider_fees_clp bigint,
  p_reported_net_clp bigint,
  p_deposited_clp bigint,
  p_settlement_date date,
  p_deposit_reference text,
  p_payload jsonb,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement_id uuid;
  expected_net bigint;
  exception_id uuid;
begin
  select settlement.id into settlement_id
  from public.settlements settlement
  where settlement.provider = p_provider
    and settlement.provider_settlement_id = p_provider_settlement_id;

  if settlement_id is null then
    insert into public.settlements (
      tenant_id, provider, provider_settlement_id, gross_clp,
      refunds_clp, chargebacks_clp, provider_fees_clp,
      reported_net_clp, deposited_clp, settlement_date,
      deposit_reference, payload, created_at
    )
    values (
      p_tenant_id, p_provider, p_provider_settlement_id, p_gross_clp,
      p_refunds_clp, p_chargebacks_clp, p_provider_fees_clp,
      p_reported_net_clp, p_deposited_clp, p_settlement_date,
      p_deposit_reference, coalesce(p_payload, '{}'::jsonb), p_now
    )
    returning id into settlement_id;
  end if;

  expected_net :=
    p_gross_clp - p_refunds_clp - p_chargebacks_clp - p_provider_fees_clp;

  if p_reported_net_clp <> expected_net
    or p_deposited_clp <> p_reported_net_clp then
    exception_id := private.add_reconciliation_exception(
      p_tenant_id, null, null, settlement_id,
      'settlement_difference', p_provider || ':' || p_provider_settlement_id,
      'high', false, true,
      'revisar diferencia de liquidación',
      array['investigate', 'accept_adjustment'],
      jsonb_build_object(
        'expected_net_clp', expected_net,
        'reported_net_clp', p_reported_net_clp,
        'deposited_clp', p_deposited_clp
      ),
      p_now
    );
  end if;

  return jsonb_build_object(
    'settlement_id', settlement_id,
    'exception_id', exception_id,
    'matches', exception_id is null
  );
end;
$$;

create or replace function private.claim_processed_event(
  p_tenant_id uuid,
  p_consumer_name text,
  p_event_id text,
  p_lease_seconds integer default 60,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_token uuid;
begin
  if p_lease_seconds not between 10 and 900 then
    raise exception 'invalid event lease' using errcode = '22023';
  end if;

  insert into public.processed_events (
    tenant_id, consumer_name, event_id, status,
    lock_token, locked_until, started_at
  )
  values (
    p_tenant_id, p_consumer_name, p_event_id, 'processing',
    gen_random_uuid(), p_now + make_interval(secs => p_lease_seconds), p_now
  )
  on conflict (tenant_id, consumer_name, event_id)
  do update set
    lock_token = gen_random_uuid(),
    locked_until = excluded.locked_until,
    started_at = excluded.started_at
  where public.processed_events.status = 'processing'
    and public.processed_events.locked_until <= p_now
  returning lock_token into claimed_token;

  return claimed_token;
end;
$$;

create or replace function private.complete_processed_event(
  p_tenant_id uuid,
  p_consumer_name text,
  p_event_id text,
  p_lock_token uuid,
  p_result jsonb,
  p_now timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.processed_events
  set status = 'completed',
      completed_at = p_now,
      result = coalesce(p_result, '{}'::jsonb)
  where tenant_id = p_tenant_id
    and consumer_name = p_consumer_name
    and event_id = p_event_id
    and status = 'processing'
    and lock_token = p_lock_token;

  return found;
end;
$$;

create or replace function private.enqueue_pending_outbox(
  p_limit integer default 100,
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_record public.outbox_messages%rowtype;
  queue_id bigint;
  enqueued integer := 0;
begin
  if p_limit not between 1 and 500 then
    raise exception 'invalid outbox batch size' using errcode = '22023';
  end if;

  for message_record in
    select message.*
    from public.outbox_messages message
    where message.status = 'pending'
      and message.available_at <= p_now
    order by message.created_at, message.id
    limit p_limit
    for update skip locked
  loop
    select pgmq.send(
      queue_name => 'financial_effects',
      msg => jsonb_build_object(
        'outbox_message_id', message_record.id,
        'tenant_id', message_record.tenant_id,
        'topic', message_record.topic,
        'deduplication_key', message_record.deduplication_key,
        'payload', message_record.payload
      )
    ) into queue_id;

    update public.outbox_messages
    set status = 'queued', queue_message_id = queue_id
    where tenant_id = message_record.tenant_id and id = message_record.id;
    enqueued := enqueued + 1;
  end loop;

  return enqueued;
end;
$$;

create or replace function private.complete_outbox_message(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text,
  p_now timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_attempt integer;
begin
  select message.attempt_count + 1 into next_attempt
  from public.outbox_messages message
  where message.tenant_id = p_tenant_id
    and message.id = p_outbox_message_id
    and message.status in ('queued', 'processing')
  for update;

  if next_attempt is null then
    return false;
  end if;

  insert into public.outbox_delivery_attempts (
    tenant_id, outbox_message_id, attempt_number,
    worker_name, outcome, occurred_at
  )
  values (
    p_tenant_id, p_outbox_message_id, next_attempt,
    p_worker_name, 'completed', p_now
  )
  on conflict do nothing;

  update public.outbox_messages
  set status = 'completed',
      attempt_count = next_attempt,
      completed_at = p_now,
      locked_by = null,
      locked_until = null
  where tenant_id = p_tenant_id and id = p_outbox_message_id;

  perform pgmq.archive('financial_effects', p_queue_message_id);
  return true;
end;
$$;

create or replace function private.outbox_retry_ceiling_seconds(
  p_attempt integer
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_attempt
    when 1 then 5
    when 2 then 15
    when 3 then 45
    when 4 then 120
    when 5 then 300
    when 6 then 900
    when 7 then 1800
    else 3600
  end;
$$;

create or replace function private.fail_outbox_message(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text,
  p_error text,
  p_now timestamptz default clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_record public.outbox_messages%rowtype;
  next_attempt integer;
  backoff_seconds integer;
begin
  select message.* into message_record
  from public.outbox_messages message
  where message.tenant_id = p_tenant_id
    and message.id = p_outbox_message_id
  for update;

  if not found or message_record.status = 'completed' then
    return 'ignored';
  end if;

  next_attempt := message_record.attempt_count + 1;
  perform pgmq.archive('financial_effects', p_queue_message_id);

  if next_attempt >= message_record.max_attempts then
    perform pgmq.send(
      queue_name => 'financial_effects_dlq',
      msg => jsonb_build_object(
        'outbox_message_id', message_record.id,
        'tenant_id', message_record.tenant_id,
        'topic', message_record.topic,
        'payload', message_record.payload,
        'attempt_count', next_attempt,
        'last_error', p_error
      )
    );

    update public.outbox_messages
    set status = 'dead_letter',
        attempt_count = next_attempt,
        dead_lettered_at = p_now,
        last_error = left(p_error, 4000),
        locked_by = null,
        locked_until = null
    where tenant_id = p_tenant_id and id = p_outbox_message_id;

    insert into public.outbox_delivery_attempts (
      tenant_id, outbox_message_id, attempt_number,
      worker_name, outcome, error_message, occurred_at
    )
    values (
      p_tenant_id, p_outbox_message_id, next_attempt,
      p_worker_name, 'dead_lettered', left(p_error, 4000), p_now
    );
    return 'dead_letter';
  end if;

  backoff_seconds := floor(
    random() * (
      private.outbox_retry_ceiling_seconds(next_attempt) + 1
    )
  )::integer;

  update public.outbox_messages
  set status = 'pending',
      attempt_count = next_attempt,
      available_at = p_now + make_interval(secs => backoff_seconds),
      queue_message_id = null,
      last_error = left(p_error, 4000),
      locked_by = null,
      locked_until = null
  where tenant_id = p_tenant_id and id = p_outbox_message_id;

  insert into public.outbox_delivery_attempts (
    tenant_id, outbox_message_id, attempt_number,
    worker_name, outcome, error_message, occurred_at
  )
  values (
    p_tenant_id, p_outbox_message_id, next_attempt,
    p_worker_name, 'failed', left(p_error, 4000), p_now
  );
  return 'retry_scheduled';
end;
$$;

create or replace function private.replay_dead_letter(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_attempt integer;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'replay reason is required' using errcode = '22023';
  end if;

  select message.attempt_count into previous_attempt
  from public.outbox_messages message
  where message.tenant_id = p_tenant_id
    and message.id = p_outbox_message_id
    and message.status = 'dead_letter'
  for update;

  if previous_attempt is null then
    return false;
  end if;

  update public.outbox_messages
  set status = 'pending',
      attempt_count = 0,
      available_at = p_now,
      queue_message_id = null,
      dead_lettered_at = null,
      last_error = null
  where tenant_id = p_tenant_id and id = p_outbox_message_id;

  insert into public.outbox_delivery_attempts (
    tenant_id, outbox_message_id, attempt_number,
    worker_name, outcome, error_message, occurred_at
  )
  values (
    p_tenant_id, p_outbox_message_id, previous_attempt + 1,
    'manual-replay', 'replayed', p_reason, p_now
  );

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action,
    target_type, target_id, reason, before_data, after_data, occurred_at
  )
  values (
    p_tenant_id,
    case when p_actor_user_id is null then 'worker' else 'user' end,
    p_actor_user_id,
    'outbox.dead_letter_replayed', 'outbox_message',
    p_outbox_message_id, p_reason,
    jsonb_build_object('status', 'dead_letter', 'attempt_count', previous_attempt),
    jsonb_build_object('status', 'pending', 'attempt_count', 0),
    p_now
  );

  return true;
end;
$$;

create or replace view public.payment_intent_current_state
with (security_invoker = true)
as
select distinct on (intent.tenant_id, intent.id)
  intent.tenant_id,
  intent.id as payment_intent_id,
  event.state,
  event.occurred_at,
  event.recorded_at
from public.payment_intents intent
join public.payment_intent_events event
  on event.tenant_id = intent.tenant_id
 and event.payment_intent_id = intent.id
order by intent.tenant_id, intent.id, event.recorded_at desc, event.id desc;

create or replace view public.payment_current_status
with (security_invoker = true)
as
select
  payment.tenant_id,
  payment.id as payment_id,
  payment.payment_intent_id,
  payment.checkout_quote_id,
  case
    when exists (
      select 1 from public.chargebacks chargeback
      where chargeback.tenant_id = payment.tenant_id
        and chargeback.payment_id = payment.id
        and chargeback.status in ('open', 'lost')
    ) then 'chargeback'
    when coalesce((
      select sum(refund.amount_clp)
      from public.refunds refund
      where refund.tenant_id = payment.tenant_id
        and refund.payment_id = payment.id
        and refund.status = 'completed'
    ), 0) >= payment.amount_clp then 'refunded'
    when coalesce((
      select sum(refund.amount_clp)
      from public.refunds refund
      where refund.tenant_id = payment.tenant_id
        and refund.payment_id = payment.id
        and refund.status = 'completed'
    ), 0) > 0 then 'partially_refunded'
    when exists (
      select 1 from public.provider_payment_events event
      where event.tenant_id = payment.tenant_id
        and event.payment_id = payment.id
        and event.normalized_status = 'approved'
        and event.signature_verified
        and event.server_verified
    ) then 'approved'
    when exists (
      select 1 from public.provider_payment_events event
      where event.tenant_id = payment.tenant_id
        and event.payment_id = payment.id
        and event.normalized_status = 'rejected'
    ) then 'rejected'
    when exists (
      select 1 from public.provider_payment_events event
      where event.tenant_id = payment.tenant_id
        and event.payment_id = payment.id
        and event.normalized_status = 'cancelled'
    ) then 'cancelled'
    else 'pending'
  end as status,
  payment.amount_clp,
  payment.currency
from public.payments payment;

create or replace view public.cashier_attention_queue
with (security_invoker = true)
as
select
  exception.tenant_id,
  exception.id,
  exception.payment_id,
  exception.exception_type,
  exception.priority,
  exception.status,
  exception.decision_required,
  exception.resolution_options,
  exception.details,
  exception.created_at
from public.reconciliation_exceptions exception
where exception.visible_to_cashier
  and exception.status in ('open', 'acknowledged')
order by
  case exception.priority
    when 'critical' then 1
    when 'high' then 2
    else 3
  end,
  exception.created_at;

insert into public.permissions (code, description)
values
  ('catalog.read', 'Leer catálogo e inventario del tenant.'),
  ('catalog.manage', 'Administrar catálogo e inventario del tenant.'),
  ('orders.read', 'Leer sesiones, pedidos y comandas del tenant.'),
  ('orders.manage', 'Cambiar estados operativos de pedidos y comandas.'),
  ('payments.read', 'Leer pagos, reembolsos y liquidaciones del tenant.'),
  ('payments.manage', 'Operar reembolsos y decisiones financieras.'),
  ('reconciliation.read', 'Leer excepciones y conciliación del tenant.'),
  ('reconciliation.manage', 'Resolver excepciones y replays auditados.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('diner', 'catalog.read'),
  ('waiter', 'catalog.read'),
  ('waiter', 'orders.read'),
  ('waiter', 'orders.manage'),
  ('kds', 'catalog.read'),
  ('kds', 'orders.read'),
  ('kds', 'orders.manage'),
  ('cashier_admin', 'catalog.read'),
  ('cashier_admin', 'catalog.manage'),
  ('cashier_admin', 'orders.read'),
  ('cashier_admin', 'orders.manage'),
  ('cashier_admin', 'payments.read'),
  ('cashier_admin', 'payments.manage'),
  ('cashier_admin', 'reconciliation.read'),
  ('cashier_admin', 'reconciliation.manage'),
  ('owner', 'catalog.read'),
  ('owner', 'catalog.manage'),
  ('owner', 'orders.read'),
  ('owner', 'orders.manage'),
  ('owner', 'payments.read'),
  ('owner', 'payments.manage'),
  ('owner', 'reconciliation.read'),
  ('owner', 'reconciliation.manage'),
  ('superadmin', 'catalog.read'),
  ('superadmin', 'catalog.manage'),
  ('superadmin', 'orders.read'),
  ('superadmin', 'orders.manage'),
  ('superadmin', 'payments.read'),
  ('superadmin', 'payments.manage'),
  ('superadmin', 'reconciliation.read'),
  ('superadmin', 'reconciliation.manage')
on conflict do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_checkout_settings', 'products', 'product_variants',
    'inventory_levels', 'table_sessions', 'carts', 'cart_items',
    'checkout_quotes', 'checkout_quote_items', 'inventory_reservations',
    'merchant_accounts', 'payment_intents', 'payment_intent_events',
    'payments', 'provider_payment_events', 'orders', 'order_state_events',
    'order_items', 'tickets', 'ticket_state_events', 'ticket_items',
    'refunds', 'chargebacks', 'settlements', 'provider_fees',
    'reconciliation_exceptions', 'processed_events', 'outbox_messages',
    'outbox_delivery_attempts', 'durable_effect_receipts'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_checkout_settings', 'products', 'product_variants',
    'inventory_levels'
  ]
  loop
    execute format(
      'create policy tenant_catalog_select on public.%I for select to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''catalog.read''))
      )',
      table_name
    );
    execute format(
      'create policy tenant_catalog_insert on public.%I for insert to authenticated with check (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''catalog.manage''))
      )',
      table_name
    );
    execute format(
      'create policy tenant_catalog_update on public.%I for update to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''catalog.manage''))
      ) with check (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''catalog.manage''))
      )',
      table_name
    );
    execute format(
      'create policy tenant_catalog_delete on public.%I for delete to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''catalog.manage''))
      )',
      table_name
    );
  end loop;

  foreach table_name in array array[
    'table_sessions', 'carts', 'cart_items', 'checkout_quotes',
    'checkout_quote_items', 'inventory_reservations', 'orders',
    'order_state_events', 'order_items', 'tickets',
    'ticket_state_events', 'ticket_items'
  ]
  loop
    execute format(
      'create policy tenant_orders_select on public.%I for select to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''orders.read''))
      )',
      table_name
    );
  end loop;

  foreach table_name in array array['orders', 'tickets']
  loop
    execute format(
      'create policy tenant_orders_update on public.%I for update to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''orders.manage''))
      ) with check (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''orders.manage''))
      )',
      table_name
    );
  end loop;

  foreach table_name in array array[
    'merchant_accounts', 'payment_intents', 'payment_intent_events',
    'payments', 'provider_payment_events', 'refunds', 'chargebacks',
    'settlements', 'provider_fees'
  ]
  loop
    execute format(
      'create policy tenant_payments_select on public.%I for select to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''payments.read''))
      )',
      table_name
    );
  end loop;

  execute
    'create policy tenant_reconciliation_select
      on public.reconciliation_exceptions for select to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''reconciliation.read''))
      )';
  execute
    'create policy tenant_reconciliation_update
      on public.reconciliation_exceptions for update to authenticated using (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''reconciliation.manage''))
      ) with check (
        tenant_id = (select private.current_tenant_id())
        and (select private.has_permission(tenant_id, ''reconciliation.manage''))
      )';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_checkout_settings', 'products', 'product_variants',
    'inventory_levels', 'table_sessions', 'carts', 'cart_items',
    'checkout_quotes', 'checkout_quote_items', 'inventory_reservations',
    'merchant_accounts', 'payment_intents', 'payment_intent_events',
    'payments', 'provider_payment_events', 'orders', 'order_state_events',
    'order_items', 'tickets', 'ticket_state_events', 'ticket_items',
    'refunds', 'chargebacks', 'settlements', 'provider_fees',
    'reconciliation_exceptions', 'processed_events', 'outbox_messages',
    'outbox_delivery_attempts', 'durable_effect_receipts'
  ]
  loop
    execute format(
      'revoke all on table public.%I from anon, authenticated, service_role',
      table_name
    );
    execute format(
      'grant all on table public.%I to service_role',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete
  on table public.tenant_checkout_settings, public.products,
    public.product_variants, public.inventory_levels
  to authenticated;

grant select
  on table public.table_sessions, public.carts, public.cart_items,
    public.checkout_quotes, public.checkout_quote_items,
    public.inventory_reservations, public.orders,
    public.order_state_events, public.order_items, public.tickets,
    public.ticket_state_events, public.ticket_items,
    public.merchant_accounts, public.payment_intents,
    public.payment_intent_events, public.payments,
    public.provider_payment_events, public.refunds, public.chargebacks,
    public.settlements, public.provider_fees,
    public.reconciliation_exceptions
  to authenticated;

grant update on table public.orders, public.tickets,
  public.reconciliation_exceptions to authenticated;

revoke all on table public.payment_intent_current_state,
  public.payment_current_status, public.cashier_attention_queue
  from anon, authenticated, service_role;
grant select on table public.payment_intent_current_state,
  public.payment_current_status, public.cashier_attention_queue
  to authenticated, service_role;

grant usage, select on all sequences in schema public to service_role;

revoke execute on all functions in schema private
  from public, anon, authenticated;
grant execute on function private.current_tenant_id() to authenticated;
grant execute on function private.has_active_membership(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.require_tenant_context() to authenticated;
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reconciliation_exceptions'
  ) then
    alter publication supabase_realtime
      add table public.reconciliation_exceptions;
  end if;
end;
$$;
