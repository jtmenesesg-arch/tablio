create table public.platform_memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role_code text not null references public.roles (code) on delete restrict
    check (role_code = 'superadmin'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  venue_id uuid,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'ready', 'blocked')),
  current_step text not null default 'venue'
    check (current_step in (
      'venue', 'size', 'menu', 'tax', 'gateway',
      'staff', 'qr', 'verification', 'production'
    )),
  progress_percent integer not null default 0
    check (progress_percent between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict
);

create table public.onboarding_step_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  onboarding_run_id uuid not null,
  step_code text not null check (step_code in (
    'venue', 'size', 'menu', 'tax', 'gateway',
    'staff', 'qr', 'verification', 'production'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  completed_by_user_id uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, onboarding_run_id, step_code),
  foreign key (tenant_id, onboarding_run_id)
    references public.onboarding_runs (tenant_id, id) on delete cascade
);

create table public.menu_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  onboarding_run_id uuid not null,
  source_type text not null check (source_type in ('text', 'link', 'pdf', 'image')),
  source_label text not null check (btrim(source_label) <> ''),
  storage_object_path text,
  source_url text,
  status text not null default 'extracting'
    check (status in ('extracting', 'extracted', 'reviewed', 'published', 'failed')),
  extraction_provider text not null default 'simulated'
    check (btrim(extraction_provider) <> ''),
  error_message text,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, onboarding_run_id)
    references public.onboarding_runs (tenant_id, id) on delete cascade
);

create table public.menu_import_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  menu_import_id uuid not null,
  source_line integer,
  proposed_category text not null default 'Sin categoría',
  proposed_name text not null check (btrim(proposed_name) <> ''),
  proposed_description text not null default '',
  proposed_price_clp bigint not null check (proposed_price_clp >= 0),
  proposed_image_path text,
  human_confirmed boolean not null default false,
  published_product_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, menu_import_id)
    references public.menu_imports (tenant_id, id) on delete cascade,
  foreign key (tenant_id, published_product_id)
    references public.products (tenant_id, id) on delete restrict
);

create table public.tenant_gateway_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_code text not null check (btrim(provider_code) <> ''),
  connection_mode text not null check (connection_mode in ('oauth', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'verified', 'disconnected', 'error')),
  provider_merchant_id text,
  merchant_display_name text,
  connected_by_user_id uuid references auth.users (id) on delete set null,
  connected_at timestamptz,
  verified_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, provider_code)
);

create table private.tenant_gateway_credentials (
  tenant_id uuid not null,
  gateway_connection_id uuid not null,
  vault_secret_id uuid not null references vault.secrets (id) on delete restrict,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  primary key (tenant_id, gateway_connection_id),
  foreign key (tenant_id, gateway_connection_id)
    references public.tenant_gateway_connections (tenant_id, id) on delete cascade
);

create table public.onboarding_test_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  onboarding_run_id uuid not null,
  gateway_connection_id uuid not null,
  test_sale_status text not null default 'pending'
    check (test_sale_status in ('pending', 'passed', 'failed')),
  test_refund_status text not null default 'pending'
    check (test_refund_status in ('pending', 'passed', 'failed')),
  test_payment_reference text,
  is_test boolean not null default true check (is_test),
  completed_at timestamptz,
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, onboarding_run_id),
  foreign key (tenant_id, onboarding_run_id)
    references public.onboarding_runs (tenant_id, id) on delete cascade,
  foreign key (tenant_id, gateway_connection_id)
    references public.tenant_gateway_connections (tenant_id, id) on delete restrict
);

create table public.saas_plan_definitions (
  code text primary key check (code in ('starter', 'flow', 'high_flow', 'custom')),
  display_name text not null,
  monthly_clp bigint check (monthly_clp is null or monthly_clp >= 0),
  setup_clp bigint check (setup_clp is null or setup_clp >= 0),
  max_tables integer check (max_tables is null or max_tables > 0),
  generous_zone_limit integer check (
    generous_zone_limit is null or generous_zone_limit > 0
  ),
  generous_station_limit integer check (
    generous_station_limit is null or generous_station_limit > 0
  ),
  commercial_hypothesis boolean not null default true,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.saas_plan_definitions (
  code, display_name, monthly_clp, setup_clp, max_tables,
  generous_zone_limit, generous_station_limit, sort_order
)
values
  ('starter', 'Inicial', 99000, 199000, 12, 4, 4, 1),
  ('flow', 'Flujo', 169000, 249000, 30, 8, 6, 2),
  ('high_flow', 'Alto flujo', 239000, 299000, 60, 12, 10, 3),
  ('custom', 'Personalizado', null, null, null, null, null, 4);

create table public.tenant_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plan_code text not null references public.saas_plan_definitions (code) on delete restrict,
  status text not null check (status in ('proposed', 'scheduled', 'active', 'ended')),
  table_count integer not null check (table_count >= 0),
  zone_count integer not null check (zone_count >= 0),
  station_count integer not null check (station_count >= 0),
  reason text not null check (btrim(reason) <> ''),
  effective_at timestamptz not null,
  ended_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create unique index tenant_plan_one_active_idx
on public.tenant_plan_assignments (tenant_id)
where status = 'active';

create unique index tenant_plan_one_pending_idx
on public.tenant_plan_assignments (tenant_id)
where status in ('proposed', 'scheduled');

create table public.saas_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_code text not null default 'simulated',
  provider_customer_id text not null,
  payment_method_label text not null,
  status text not null default 'ready'
    check (status in ('ready', 'requires_action', 'disconnected')),
  connected_by_user_id uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, provider_code, provider_customer_id)
);

create table private.saas_billing_credentials (
  tenant_id uuid not null,
  billing_account_id uuid not null,
  vault_secret_id uuid not null references vault.secrets (id) on delete restrict,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  primary key (tenant_id, billing_account_id),
  foreign key (tenant_id, billing_account_id)
    references public.saas_billing_accounts (tenant_id, id) on delete cascade
);

create table public.saas_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  billing_account_id uuid,
  plan_code text not null references public.saas_plan_definitions (code) on delete restrict,
  status text not null default 'trialing'
    check (status in (
      'trialing', 'active', 'past_due', 'grace', 'admin_restricted',
      'suspension_scheduled', 'suspended', 'cancelled'
    )),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  next_charge_at timestamptz,
  grace_ends_at timestamptz,
  suspension_effective_at timestamptz,
  notice_days_before_charge integer not null default 5
    check (notice_days_before_charge between 3 and 30),
  grace_days integer not null default 10 check (grace_days between 7 and 30),
  retry_delays_hours integer[] not null default array[24,72,120],
  suspension_notice_hours integer not null default 48
    check (suspension_notice_hours between 24 and 336),
  low_traffic_timezone text not null default 'America/Santiago',
  low_traffic_weekday integer not null default 1
    check (low_traffic_weekday between 0 and 6),
  low_traffic_hour integer not null default 12
    check (low_traffic_hour between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id),
  check (current_period_end > current_period_start),
  foreign key (tenant_id, billing_account_id)
    references public.saas_billing_accounts (tenant_id, id) on delete restrict
);

create table public.saas_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid,
  invoice_number text not null,
  kind text not null check (kind in ('setup', 'subscription')),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  subtotal_clp bigint not null check (subtotal_clp >= 0),
  tax_clp bigint not null default 0 check (tax_clp >= 0),
  total_clp bigint not null check (total_clp = subtotal_clp + tax_clp),
  due_at timestamptz not null,
  paid_at timestamptz,
  statement_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, invoice_number),
  foreign key (tenant_id, subscription_id)
    references public.saas_subscriptions (tenant_id, id) on delete restrict
);

create table public.saas_charge_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null,
  billing_account_id uuid not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  provider_charge_id text,
  failure_code text,
  failure_message text,
  next_retry_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, invoice_id, attempt_number),
  foreign key (tenant_id, invoice_id)
    references public.saas_invoices (tenant_id, id) on delete restrict,
  foreign key (tenant_id, billing_account_id)
    references public.saas_billing_accounts (tenant_id, id) on delete restrict
);

create table public.saas_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid not null,
  kind text not null check (kind in (
    'charge_notice', 'charge_failed', 'retry_scheduled',
    'grace_notice', 'admin_restriction_notice', 'suspension_notice'
  )),
  channel text not null check (channel in ('email', 'in_app', 'written_notice')),
  recipient text not null,
  message text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, subscription_id)
    references public.saas_subscriptions (tenant_id, id) on delete cascade
);

create table public.subscription_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid not null,
  from_status text,
  to_status text not null,
  reason text not null check (btrim(reason) <> ''),
  actor_user_id uuid references auth.users (id) on delete set null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, subscription_id)
    references public.saas_subscriptions (tenant_id, id) on delete cascade
);

create table public.tenant_feature_flags (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  flag_code text not null check (btrim(flag_code) <> ''),
  enabled boolean not null,
  source text not null default 'plan' check (source in ('plan', 'override')),
  updated_by_user_id uuid references auth.users (id) on delete set null,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, flag_code)
);

create table public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  platform_user_id uuid not null references auth.users (id) on delete restrict,
  reason text not null check (length(btrim(reason)) >= 8),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (ended_at is null or ended_at >= started_at)
);

create index onboarding_steps_run_idx
on public.onboarding_step_states (tenant_id, onboarding_run_id, status);
create index menu_imports_run_idx
on public.menu_imports (tenant_id, onboarding_run_id, created_at desc);
create index menu_import_items_import_idx
on public.menu_import_items (tenant_id, menu_import_id);
create index tenant_gateway_credentials_vault_idx
on private.tenant_gateway_credentials (vault_secret_id);
create index onboarding_tests_gateway_idx
on public.onboarding_test_runs (tenant_id, gateway_connection_id);
create index tenant_plan_history_idx
on public.tenant_plan_assignments (tenant_id, effective_at desc);
create index saas_billing_credentials_vault_idx
on private.saas_billing_credentials (vault_secret_id);
create index saas_invoices_subscription_idx
on public.saas_invoices (tenant_id, subscription_id, due_at desc);
create index saas_charge_attempts_invoice_idx
on public.saas_charge_attempts (tenant_id, invoice_id, occurred_at desc);
create index saas_charge_attempts_retry_idx
on public.saas_charge_attempts (next_retry_at)
where status = 'failed' and next_retry_at is not null;
create index saas_notifications_pending_idx
on public.saas_notifications (scheduled_at)
where sent_at is null;
create index subscription_events_subscription_idx
on public.subscription_status_events (tenant_id, subscription_id, effective_at);
create index impersonation_platform_user_idx
on public.impersonation_sessions (platform_user_id, started_at desc);

create trigger platform_memberships_set_updated_at
before update on public.platform_memberships
for each row execute function private.set_updated_at();
create trigger onboarding_runs_set_updated_at
before update on public.onboarding_runs
for each row execute function private.set_updated_at();
create trigger onboarding_steps_set_updated_at
before update on public.onboarding_step_states
for each row execute function private.set_updated_at();
create trigger menu_imports_set_updated_at
before update on public.menu_imports
for each row execute function private.set_updated_at();
create trigger menu_import_items_set_updated_at
before update on public.menu_import_items
for each row execute function private.set_updated_at();
create trigger tenant_gateway_connections_set_updated_at
before update on public.tenant_gateway_connections
for each row execute function private.set_updated_at();
create trigger saas_plans_set_updated_at
before update on public.saas_plan_definitions
for each row execute function private.set_updated_at();
create trigger saas_billing_accounts_set_updated_at
before update on public.saas_billing_accounts
for each row execute function private.set_updated_at();
create trigger saas_subscriptions_set_updated_at
before update on public.saas_subscriptions
for each row execute function private.set_updated_at();
create trigger saas_invoices_set_updated_at
before update on public.saas_invoices
for each row execute function private.set_updated_at();

create or replace function private.is_platform_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_memberships membership
    where membership.user_id = auth.uid()
      and membership.role_code = 'superadmin'
      and membership.status = 'active'
  );
$$;

create or replace function public.recommend_saas_plan(
  p_table_count integer,
  p_zone_count integer,
  p_station_count integer
)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  base_code text;
  zone_limit integer;
  station_limit integer;
begin
  if p_table_count < 0 or p_zone_count < 0 or p_station_count < 0 then
    raise exception 'size metrics cannot be negative' using errcode = '22023';
  end if;

  if p_table_count <= 12 then base_code := 'starter';
  elsif p_table_count <= 30 then base_code := 'flow';
  elsif p_table_count <= 60 then base_code := 'high_flow';
  else return 'custom';
  end if;

  select plan.generous_zone_limit, plan.generous_station_limit
  into zone_limit, station_limit
  from public.saas_plan_definitions plan
  where plan.code = base_code;

  if p_zone_count > zone_limit and p_station_count > station_limit then
    return case base_code
      when 'starter' then 'flow'
      when 'flow' then 'high_flow'
      else 'custom'
    end;
  end if;
  return base_code;
end;
$$;

create or replace function private.subscription_status_for_tenant(
  p_tenant_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select subscription.status
      from public.saas_subscriptions subscription
      where subscription.tenant_id = p_tenant_id
    ),
    'trialing'
  );
$$;

create or replace function private.tenant_admin_writes_allowed(
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.subscription_status_for_tenant(p_tenant_id)
    not in ('admin_restricted', 'suspension_scheduled', 'suspended', 'cancelled');
$$;

create or replace function private.tenant_ordering_allowed(
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.subscription_status_for_tenant(p_tenant_id)
    not in ('suspended', 'cancelled');
$$;

create or replace function private.enforce_new_quote_commercial_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.tenant_ordering_allowed(new.tenant_id) then
    raise exception 'ordering is unavailable for this tenant'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger checkout_quotes_commercial_gate
before insert on public.checkout_quotes
for each row execute function private.enforce_new_quote_commercial_gate();

create or replace function public.diner_ordering_availability(
  p_table_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  allowed boolean;
begin
  select service_point.tenant_id
  into selected_tenant_id
  from public.tables service_point
  where service_point.id = p_table_id
    and service_point.active
    and service_point.qr_active;
  if selected_tenant_id is null then
    return jsonb_build_object(
      'ordering_available', false,
      'message', 'Este local no está recibiendo pedidos por aquí en este momento. Consulta al equipo del local.'
    );
  end if;
  allowed := private.tenant_ordering_allowed(selected_tenant_id);
  return case when allowed then
    jsonb_build_object('ordering_available', true)
  else
    jsonb_build_object(
      'ordering_available', false,
      'message', 'Este local no está recibiendo pedidos por aquí en este momento. Consulta al equipo del local.'
    )
  end;
end;
$$;

create or replace function public.owner_commercial_capabilities()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  status text;
begin
  selected_tenant_id := private.require_tenant_context();
  status := private.subscription_status_for_tenant(selected_tenant_id);
  return jsonb_build_object(
    'reports_available', status not in (
      'admin_restricted', 'suspension_scheduled', 'suspended', 'cancelled'
    ),
    'catalog_edit_available', private.tenant_admin_writes_allowed(selected_tenant_id),
    'new_qr_available', private.tenant_admin_writes_allowed(selected_tenant_id),
    'ordering_available', private.tenant_ordering_allowed(selected_tenant_id)
  );
end;
$$;

create or replace function public.propose_tenant_plan_change(
  p_reason text
)
returns public.tenant_plan_assignments
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  size_record record;
  subscription public.saas_subscriptions%rowtype;
  recommended_code text;
  assignment public.tenant_plan_assignments%rowtype;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'billing.read') then
    raise exception 'billing permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'plan change reason is required' using errcode = '22023';
  end if;

  select metrics.active_tables, metrics.active_zones, metrics.active_stations
  into size_record
  from public.tenant_size_metrics metrics
  where metrics.tenant_id = selected_tenant_id;
  select * into subscription
  from public.saas_subscriptions item
  where item.tenant_id = selected_tenant_id;
  if not found then
    raise exception 'subscription not found' using errcode = 'P0002';
  end if;

  recommended_code := public.recommend_saas_plan(
    coalesce(size_record.active_tables, 0)::integer,
    coalesce(size_record.active_zones, 0)::integer,
    coalesce(size_record.active_stations, 0)::integer
  );
  if recommended_code = subscription.plan_code then
    raise exception 'current plan already matches venue size' using errcode = '22023';
  end if;

  insert into public.tenant_plan_assignments (
    tenant_id, plan_code, status, table_count, zone_count,
    station_count, reason, effective_at, created_by_user_id
  )
  values (
    selected_tenant_id, recommended_code, 'proposed',
    coalesce(size_record.active_tables, 0),
    coalesce(size_record.active_zones, 0),
    coalesce(size_record.active_stations, 0),
    btrim(p_reason), subscription.current_period_end, auth.uid()
  )
  returning * into assignment;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data
  )
  values (
    selected_tenant_id, 'user', auth.uid(), 'billing.plan_change_proposed',
    'tenant_plan_assignment', assignment.id, btrim(p_reason),
    jsonb_build_object(
      'plan_code', recommended_code,
      'effective_at', assignment.effective_at,
      'no_retroactive_charge', true
    )
  );
  return assignment;
end;
$$;

create or replace function public.superadmin_tenant_overview()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_status text,
  plan_code text,
  subscription_status text,
  gateway_connected boolean,
  last_activity_at timestamptz,
  table_count bigint
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
    coalesce(subscription.plan_code, tenant.plan_code, 'starter'),
    coalesce(subscription.status, 'trialing'),
    exists (
      select 1 from public.tenant_gateway_connections connection
      where connection.tenant_id = tenant.id
        and connection.status = 'verified'
    ),
    greatest(
      tenant.updated_at,
      coalesce(subscription.updated_at, tenant.updated_at)
    ),
    coalesce(metrics.active_tables, 0)
  from public.tenants tenant
  left join public.saas_subscriptions subscription
    on subscription.tenant_id = tenant.id
  left join public.tenant_size_metrics metrics
    on metrics.tenant_id = tenant.id
  order by tenant.created_at desc;
end;
$$;

create or replace function public.start_tenant_impersonation(
  p_tenant_id uuid,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  impersonation_id uuid;
begin
  if not private.is_platform_superadmin() then
    raise exception 'platform superadmin required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'specific impersonation reason is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;

  insert into public.impersonation_sessions (
    tenant_id, platform_user_id, reason
  )
  values (p_tenant_id, auth.uid(), btrim(p_reason))
  returning id into impersonation_id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data
  )
  values (
    p_tenant_id, 'platform', auth.uid(), 'platform.impersonation_started',
    'tenant', p_tenant_id, btrim(p_reason),
    jsonb_build_object('impersonation_session_id', impersonation_id)
  );
  return impersonation_id;
end;
$$;

create or replace function public.superadmin_set_subscription_status(
  p_tenant_id uuid,
  p_status text,
  p_reason text,
  p_suspension_effective_at timestamptz default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  subscription public.saas_subscriptions%rowtype;
  previous_status text;
begin
  if not private.is_platform_superadmin() then
    raise exception 'platform superadmin required' using errcode = '42501';
  end if;
  if p_status not in (
    'trialing', 'active', 'past_due', 'grace', 'admin_restricted',
    'suspension_scheduled', 'suspended', 'cancelled'
  ) or nullif(btrim(p_reason), '') is null then
    raise exception 'valid status and reason are required' using errcode = '22023';
  end if;

  select * into subscription
  from public.saas_subscriptions item
  where item.tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception 'subscription not found' using errcode = 'P0002';
  end if;
  previous_status := subscription.status;

  if p_status = 'suspension_scheduled' and (
    p_suspension_effective_at is null
    or p_suspension_effective_at <
      clock_timestamp() + make_interval(hours => subscription.suspension_notice_hours)
  ) then
    raise exception 'suspension requires the configured written notice'
      using errcode = '22023';
  end if;
  if p_status = 'suspended' and (
    subscription.status <> 'suspension_scheduled'
    or subscription.suspension_effective_at is null
    or subscription.suspension_effective_at > clock_timestamp()
  ) then
    raise exception 'suspension must be scheduled and due'
      using errcode = '22023';
  end if;

  update public.saas_subscriptions
  set status = p_status,
      suspension_effective_at = case
        when p_status = 'suspension_scheduled' then p_suspension_effective_at
        when p_status in ('active', 'cancelled') then null
        else suspension_effective_at
      end
  where tenant_id = p_tenant_id;

  insert into public.subscription_status_events (
    tenant_id, subscription_id, from_status, to_status,
    reason, actor_user_id, effective_at
  )
  values (
    p_tenant_id, subscription.id, previous_status, p_status,
    btrim(p_reason), auth.uid(),
    coalesce(p_suspension_effective_at, clock_timestamp())
  );
  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, before_data, after_data
  )
  values (
    p_tenant_id, 'platform', auth.uid(), 'billing.subscription_status_changed',
    'saas_subscription', subscription.id, btrim(p_reason),
    jsonb_build_object('status', previous_status),
    jsonb_build_object(
      'status', p_status,
      'suspension_effective_at', p_suspension_effective_at
    )
  );
  return p_status;
end;
$$;

create or replace function private.prevent_unreviewed_menu_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (
    old.status <> 'reviewed'
    or old.reviewed_at is null
    or old.reviewed_by_user_id is null
    or exists (
      select 1
      from public.menu_import_items item
      where item.tenant_id = new.tenant_id
        and item.menu_import_id = new.id
        and not item.human_confirmed
    )
  ) then
    raise exception 'human review is required before menu publication'
      using errcode = '55000';
  end if;
  if new.status = 'published' then new.published_at := clock_timestamp(); end if;
  return new;
end;
$$;

create trigger menu_imports_require_human_review
before update of status on public.menu_imports
for each row execute function private.prevent_unreviewed_menu_publish();

insert into public.permissions (code, description)
values
  ('onboarding.read', 'Leer el avance del onboarding del tenant.'),
  ('onboarding.manage', 'Completar y corregir el onboarding del tenant.'),
  ('billing.read', 'Leer plan, facturas y estado comercial del propio tenant.'),
  ('gateway.configure', 'Conectar y verificar la cuenta de pagos del bar.'),
  ('platform.tenants', 'Administrar tenants desde el plano de Tablio.'),
  ('platform.billing', 'Administrar la cobranza SaaS entre tenants.'),
  ('platform.support', 'Iniciar soporte con impersonación auditada.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('owner', 'onboarding.read'),
  ('owner', 'onboarding.manage'),
  ('owner', 'billing.read'),
  ('owner', 'gateway.configure'),
  ('cashier_admin', 'onboarding.read'),
  ('cashier_admin', 'billing.read'),
  ('superadmin', 'onboarding.read'),
  ('superadmin', 'onboarding.manage'),
  ('superadmin', 'billing.read'),
  ('superadmin', 'gateway.configure'),
  ('superadmin', 'platform.tenants'),
  ('superadmin', 'platform.billing'),
  ('superadmin', 'platform.support')
on conflict do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'platform_memberships', 'onboarding_runs', 'onboarding_step_states',
    'menu_imports', 'menu_import_items', 'tenant_gateway_connections',
    'onboarding_test_runs', 'saas_plan_definitions',
    'tenant_plan_assignments', 'saas_billing_accounts',
    'saas_subscriptions', 'saas_invoices', 'saas_charge_attempts',
    'saas_notifications', 'subscription_status_events',
    'tenant_feature_flags', 'impersonation_sessions'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

alter table private.tenant_gateway_credentials enable row level security;
alter table private.tenant_gateway_credentials force row level security;
alter table private.saas_billing_credentials enable row level security;
alter table private.saas_billing_credentials force row level security;

create policy platform_membership_self_select
on public.platform_memberships for select to authenticated
using (user_id = auth.uid());

create policy plans_authenticated_select
on public.saas_plan_definitions for select to authenticated
using (active);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'onboarding_runs', 'onboarding_step_states', 'menu_imports',
    'menu_import_items', 'onboarding_test_runs'
  ]
  loop
    execute format(
      'create policy tenant_onboarding_select on public.%I
       for select to authenticated using (
         tenant_id = (select private.current_tenant_id())
         and (select private.has_permission(tenant_id, ''onboarding.read''))
       )',
      table_name
    );
    execute format(
      'create policy tenant_onboarding_insert on public.%I
       for insert to authenticated with check (
         tenant_id = (select private.current_tenant_id())
         and (select private.has_permission(tenant_id, ''onboarding.manage''))
       )',
      table_name
    );
    execute format(
      'create policy tenant_onboarding_update on public.%I
       for update to authenticated using (
         tenant_id = (select private.current_tenant_id())
         and (select private.has_permission(tenant_id, ''onboarding.manage''))
       ) with check (
         tenant_id = (select private.current_tenant_id())
         and (select private.has_permission(tenant_id, ''onboarding.manage''))
       )',
      table_name
    );
  end loop;
end;
$$;

create policy tenant_gateway_select
on public.tenant_gateway_connections for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (
    (select private.has_permission(tenant_id, 'gateway.configure'))
    or (select private.has_permission(tenant_id, 'onboarding.read'))
  )
);
create policy tenant_gateway_insert
on public.tenant_gateway_connections for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'gateway.configure'))
);
create policy tenant_gateway_update
on public.tenant_gateway_connections for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'gateway.configure'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'gateway.configure'))
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_plan_assignments', 'saas_billing_accounts',
    'saas_subscriptions', 'saas_invoices', 'saas_charge_attempts',
    'saas_notifications', 'subscription_status_events',
    'tenant_feature_flags'
  ]
  loop
    execute format(
      'create policy tenant_billing_select on public.%I
       for select to authenticated using (
         tenant_id = (select private.current_tenant_id())
         and (select private.has_permission(tenant_id, ''billing.read''))
       )',
      table_name
    );
  end loop;
end;
$$;

create policy impersonation_deny_direct
on public.impersonation_sessions as restrictive for all to authenticated
using (false) with check (false);
create policy tenant_gateway_credentials_deny
on private.tenant_gateway_credentials as restrictive for all to public
using (false) with check (false);
create policy saas_billing_credentials_deny
on private.saas_billing_credentials as restrictive for all to public
using (false) with check (false);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'product_variants', 'menu_categories', 'tables'
  ]
  loop
    execute format(
      'create policy commercial_admin_insert_gate on public.%I
       as restrictive for insert to authenticated
       with check (private.tenant_admin_writes_allowed(tenant_id))',
      table_name
    );
    execute format(
      'create policy commercial_admin_update_gate on public.%I
       as restrictive for update to authenticated
       using (private.tenant_admin_writes_allowed(tenant_id))
       with check (private.tenant_admin_writes_allowed(tenant_id))',
      table_name
    );
    execute format(
      'create policy commercial_admin_delete_gate on public.%I
       as restrictive for delete to authenticated
       using (private.tenant_admin_writes_allowed(tenant_id))',
      table_name
    );
  end loop;
end;
$$;

revoke all on table
  private.tenant_gateway_credentials,
  private.saas_billing_credentials
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table
  private.tenant_gateway_credentials,
  private.saas_billing_credentials
to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'platform_memberships', 'onboarding_runs', 'onboarding_step_states',
    'menu_imports', 'menu_import_items', 'tenant_gateway_connections',
    'onboarding_test_runs', 'saas_plan_definitions',
    'tenant_plan_assignments', 'saas_billing_accounts',
    'saas_subscriptions', 'saas_invoices', 'saas_charge_attempts',
    'saas_notifications', 'subscription_status_events',
    'tenant_feature_flags', 'impersonation_sessions'
  ]
  loop
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

grant select on table
  public.platform_memberships,
  public.saas_plan_definitions,
  public.onboarding_runs,
  public.onboarding_step_states,
  public.menu_imports,
  public.menu_import_items,
  public.tenant_gateway_connections,
  public.onboarding_test_runs,
  public.tenant_plan_assignments,
  public.saas_billing_accounts,
  public.saas_subscriptions,
  public.saas_invoices,
  public.saas_charge_attempts,
  public.saas_notifications,
  public.subscription_status_events,
  public.tenant_feature_flags
to authenticated;

grant insert, update on table
  public.onboarding_runs,
  public.onboarding_step_states,
  public.menu_imports,
  public.menu_import_items,
  public.tenant_gateway_connections,
  public.onboarding_test_runs
to authenticated;

grant execute on function
  public.recommend_saas_plan(integer,integer,integer),
  public.diner_ordering_availability(uuid)
to anon, authenticated;
grant execute on function
  public.owner_commercial_capabilities(),
  public.propose_tenant_plan_change(text),
  public.superadmin_tenant_overview(),
  public.start_tenant_impersonation(uuid,text),
  public.superadmin_set_subscription_status(uuid,text,text,timestamptz)
to authenticated;

revoke execute on function
  private.is_platform_superadmin(),
  private.subscription_status_for_tenant(uuid),
  private.tenant_admin_writes_allowed(uuid),
  private.tenant_ordering_allowed(uuid)
from public, anon, authenticated;

comment on table public.saas_subscriptions is
  'Tablio billing only. It never represents or receives diner-to-bar sale funds.';
comment on function public.diner_ordering_availability(uuid) is
  'Minimal neutral contract: never exposes debt, plan, subscription state or billing text.';
comment on table public.menu_imports is
  'Imported menus remain drafts until every price receives explicit human confirmation.';
comment on table public.impersonation_sessions is
  'Platform support access requires a specific reason and also appends tenant audit_log.';
