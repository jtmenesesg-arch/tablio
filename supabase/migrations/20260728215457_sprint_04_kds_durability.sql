-- Sprint 4: KDS presence, measured delivery, operational transitions,
-- sold-out control, durable print spool and private Realtime notifications.

create table public.tenant_kds_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  warning_after_seconds integer not null default 75
    check (warning_after_seconds between 30 and 300),
  reconciliation_interval_seconds integer not null default 45
    check (reconciliation_interval_seconds between 30 and 60),
  presence_timeout_seconds integer not null default 30
    check (presence_timeout_seconds between 15 and 90),
  amber_after_seconds integer not null default 480
    check (amber_after_seconds between 60 and 3600),
  critical_after_seconds integer not null default 900
    check (critical_after_seconds between 120 and 7200),
  new_ticket_sound_enabled boolean not null default true,
  critical_sound_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (critical_after_seconds > amber_after_seconds)
);

comment on table public.tenant_kds_settings is
  'Tenant-configurable KDS thresholds. The 45 second query is a safety net; Realtime remains the fast path.';

alter table public.tickets
  add column state_version integer not null default 0
    check (state_version >= 0),
  add column in_preparation_at timestamptz,
  add column ready_at timestamptz;

create table public.kds_clients (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  station_id uuid,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  connected_at timestamptz not null default clock_timestamp(),
  last_heartbeat_at timestamptz not null default clock_timestamp(),
  disconnected_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, station_id)
    references public.stations (tenant_id, id) on delete restrict,
  check (last_heartbeat_at >= connected_at),
  check (
    disconnected_at is null
    or disconnected_at >= connected_at
  )
);

comment on column public.kds_clients.station_id is
  'NULL means the client is viewing all stations in the venue.';

create index kds_clients_active_station_idx
  on public.kds_clients (
    tenant_id, venue_id, station_id, last_heartbeat_at desc
  )
  where disconnected_at is null;

create table public.kds_delivery_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  ticket_id uuid not null,
  station_id uuid not null,
  payment_confirmed_at timestamptz not null,
  kds_connected_at_confirmation boolean not null,
  first_visible_at timestamptz,
  first_visible_client_id uuid,
  delivery_source text
    check (
      delivery_source is null
      or delivery_source in ('realtime', 'initial_query', 'reconnect', 'safety_poll')
    ),
  latency_ms bigint generated always as (
    case
      when first_visible_at is null then null
      else greatest(
        0,
        floor(
          extract(epoch from (first_visible_at - payment_confirmed_at)) * 1000
        )::bigint
      )
    end
  ) stored,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, ticket_id),
  foreign key (tenant_id, ticket_id)
    references public.tickets (tenant_id, id) on delete restrict,
  foreign key (tenant_id, station_id)
    references public.stations (tenant_id, id) on delete restrict,
  foreign key (tenant_id, first_visible_client_id)
    references public.kds_clients (tenant_id, id) on delete restrict,
  check (
    (first_visible_at is null and first_visible_client_id is null)
    or (first_visible_at is not null and first_visible_client_id is not null)
  )
);

create index kds_delivery_metrics_latency_idx
  on public.kds_delivery_metrics (
    tenant_id, station_id, payment_confirmed_at desc, latency_ms
  )
  where kds_connected_at_confirmation and first_visible_at is not null;

create table public.printer_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  station_id uuid,
  name text not null check (btrim(name) <> ''),
  adapter_type text not null default 'stub'
    check (adapter_type in ('stub', 'local_agent', 'managed_service', 'cloud_printer')),
  endpoint_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(endpoint_config) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, station_id)
    references public.stations (tenant_id, id) on delete restrict
);

create unique index printer_endpoints_active_station_idx
  on public.printer_endpoints (tenant_id, venue_id, station_id)
  where active;

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  outbox_message_id uuid not null,
  ticket_id uuid not null,
  printer_endpoint_id uuid,
  reprint_of_job_id uuid,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'printed', 'failed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  printed_at timestamptz,
  last_error text,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  reprint_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, outbox_message_id)
    references public.outbox_messages (tenant_id, id) on delete restrict,
  foreign key (tenant_id, ticket_id)
    references public.tickets (tenant_id, id) on delete restrict,
  foreign key (tenant_id, printer_endpoint_id)
    references public.printer_endpoints (tenant_id, id) on delete restrict,
  foreign key (tenant_id, reprint_of_job_id)
    references public.print_jobs (tenant_id, id) on delete restrict,
  check (
    (reprint_of_job_id is null and reprint_reason is null)
    or (
      reprint_of_job_id is not null
      and nullif(btrim(reprint_reason), '') is not null
    )
  )
);

create unique index print_jobs_initial_outbox_ticket_idx
  on public.print_jobs (tenant_id, outbox_message_id, ticket_id)
  where reprint_of_job_id is null;

create index print_jobs_ready_idx
  on public.print_jobs (status, available_at, created_at)
  where status in ('pending', 'failed');

create table public.print_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  print_job_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  adapter_type text not null check (btrim(adapter_type) <> ''),
  outcome text not null
    check (outcome in ('started', 'printed', 'failed', 'dead_lettered', 'replayed')),
  error_message text,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, print_job_id, attempt_number, outcome),
  foreign key (tenant_id, print_job_id)
    references public.print_jobs (tenant_id, id) on delete restrict
);

create index print_attempts_job_idx
  on public.print_attempts (tenant_id, print_job_id, occurred_at);

create trigger tenant_kds_settings_set_updated_at
before update on public.tenant_kds_settings
for each row execute function private.set_updated_at();

create trigger kds_clients_set_updated_at
before update on public.kds_clients
for each row execute function private.set_updated_at();

create trigger printer_endpoints_set_updated_at
before update on public.printer_endpoints
for each row execute function private.set_updated_at();

create trigger print_jobs_set_updated_at
before update on public.print_jobs
for each row execute function private.set_updated_at();

insert into public.permissions (code, description)
values
  (
    'catalog.availability.manage',
    'Marcar productos agotados o disponibles sin editar precios ni contenido.'
  ),
  ('printing.read', 'Leer el spool y sus intentos de impresión.'),
  ('printing.manage', 'Configurar impresoras, reimprimir y operar el spool.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('kds', 'catalog.availability.manage'),
  ('kds', 'printing.read'),
  ('cashier_admin', 'catalog.availability.manage'),
  ('cashier_admin', 'printing.read'),
  ('cashier_admin', 'printing.manage'),
  ('owner', 'catalog.availability.manage'),
  ('owner', 'printing.read'),
  ('owner', 'printing.manage'),
  ('superadmin', 'catalog.availability.manage'),
  ('superadmin', 'printing.read'),
  ('superadmin', 'printing.manage')
on conflict do nothing;

create or replace function private.kds_topic_authorized(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  topic_tenant_id uuid;
  topic_station text;
begin
  if p_topic is null
    or p_topic !~ '^kds:[0-9a-f-]{36}:(all|[0-9a-f-]{36})$' then
    return false;
  end if;

  begin
    topic_tenant_id := split_part(p_topic, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if topic_tenant_id <> private.current_tenant_id()
    or not private.has_permission(topic_tenant_id, 'orders.read') then
    return false;
  end if;

  topic_station := split_part(p_topic, ':', 3);
  return topic_station = 'all'
    or exists (
      select 1
      from public.stations station
      where station.tenant_id = topic_tenant_id
        and station.id = topic_station::uuid
        and station.active
    );
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function private.broadcast_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
  payload jsonb;
  payment_confirmed_at timestamptz;
  client_connected boolean;
  presence_timeout integer;
  ticket_venue_id uuid;
begin
  select station.venue_id
  into ticket_venue_id
  from public.stations station
  where station.tenant_id = new.tenant_id
    and station.id = new.station_id;

  if tg_op = 'INSERT' then
    select order_record.confirmed_at
    into payment_confirmed_at
    from public.orders order_record
    where order_record.tenant_id = new.tenant_id
      and order_record.id = new.order_id;

    select coalesce(settings.presence_timeout_seconds, 30)
    into presence_timeout
    from public.tenant_kds_settings settings
    where settings.tenant_id = new.tenant_id;
    presence_timeout := coalesce(presence_timeout, 30);

    select exists (
      select 1
      from public.kds_clients client
      where client.tenant_id = new.tenant_id
        and client.venue_id = ticket_venue_id
        and (client.station_id is null or client.station_id = new.station_id)
        and client.connected_at <= payment_confirmed_at
        and client.disconnected_at is null
        and client.last_heartbeat_at >=
          payment_confirmed_at - make_interval(secs => presence_timeout)
    )
    into client_connected;

    insert into public.kds_delivery_metrics (
      tenant_id, ticket_id, station_id, payment_confirmed_at,
      kds_connected_at_confirmation
    )
    values (
      new.tenant_id, new.id, new.station_id, payment_confirmed_at,
      client_connected
    )
    on conflict (tenant_id, ticket_id) do nothing;

    event_name := 'ticket_created';
  else
    event_name := 'ticket_updated';

    if old.current_state <> 'ready' and new.current_state = 'ready' then
      insert into public.outbox_messages (
        tenant_id, aggregate_type, aggregate_id, topic,
        deduplication_key, payload, available_at, created_at
      )
      values
        (
          new.tenant_id, 'ticket', new.id, 'waiter.ticket_ready',
          'ticket:' || new.id::text || ':waiter-ready',
          jsonb_build_object(
            'ticket_id', new.id,
            'order_id', new.order_id,
            'station_id', new.station_id
          ),
          clock_timestamp(), clock_timestamp()
        ),
        (
          new.tenant_id, 'ticket', new.id, 'diner.ticket_ready',
          'ticket:' || new.id::text || ':diner-ready',
          jsonb_build_object(
            'ticket_id', new.id,
            'order_id', new.order_id,
            'station_id', new.station_id
          ),
          clock_timestamp(), clock_timestamp()
        )
      on conflict (tenant_id, deduplication_key) do nothing;
    end if;
  end if;

  payload := jsonb_build_object(
    'ticket_id', new.id,
    'order_id', new.order_id,
    'station_id', new.station_id,
    'state', new.current_state,
    'version', new.state_version,
    'committed_at', clock_timestamp()
  );

  perform realtime.send(
    payload,
    event_name,
    'kds:' || new.tenant_id::text || ':' || new.station_id::text,
    true
  );
  perform realtime.send(
    jsonb_build_object(
      'product_id', p_product_id,
      'available', p_available,
      'changed_at', clock_timestamp()
    ),
    'product_availability_changed',
    'menu:' || selected_tenant_id::text || ':' ||
      product_record.venue_id::text,
    true
  );
  perform realtime.send(
    payload,
    event_name,
    'kds:' || new.tenant_id::text || ':all',
    true
  );
  return null;
end;
$$;

create trigger tickets_broadcast_insert
after insert on public.tickets
for each row execute function private.broadcast_ticket_change();

create trigger tickets_broadcast_update
after update of current_state, state_version on public.tickets
for each row
when (
  old.current_state is distinct from new.current_state
  or old.state_version is distinct from new.state_version
)
execute function private.broadcast_ticket_change();

create or replace function public.kds_heartbeat(
  p_client_id uuid,
  p_venue_id uuid,
  p_station_id uuid default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  heartbeat_at timestamptz := clock_timestamp();
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'orders.read') then
    raise exception 'orders.read permission is required' using errcode = '42501';
  end if;

  if p_client_id is null or not exists (
    select 1
    from public.venues venue
    where venue.tenant_id = selected_tenant_id
      and venue.id = p_venue_id
      and venue.active
  ) then
    raise exception 'active venue and client id are required'
      using errcode = '22023';
  end if;

  if p_station_id is not null and not exists (
    select 1
    from public.stations station
    where station.tenant_id = selected_tenant_id
      and station.venue_id = p_venue_id
      and station.id = p_station_id
      and station.active
  ) then
    raise exception 'station does not belong to the active tenant and venue'
      using errcode = '42501';
  end if;

  insert into public.kds_clients (
    id, tenant_id, venue_id, station_id, auth_user_id,
    connected_at, last_heartbeat_at, disconnected_at, user_agent
  )
  values (
    p_client_id, selected_tenant_id, p_venue_id, p_station_id, auth.uid(),
    heartbeat_at, heartbeat_at, null, left(p_user_agent, 500)
  )
  on conflict (id) do update
  set station_id = excluded.station_id,
      last_heartbeat_at = excluded.last_heartbeat_at,
      disconnected_at = null,
      user_agent = excluded.user_agent
  where kds_clients.tenant_id = selected_tenant_id
    and kds_clients.auth_user_id = auth.uid();

  if not found then
    raise exception 'client belongs to another user or tenant'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'client_id', p_client_id,
    'server_time', heartbeat_at,
    'station_id', p_station_id
  );
end;
$$;

create or replace function public.kds_disconnect(p_client_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
begin
  selected_tenant_id := private.require_tenant_context();
  update public.kds_clients
  set disconnected_at = clock_timestamp()
  where tenant_id = selected_tenant_id
    and id = p_client_id
    and auth_user_id = auth.uid();
end;
$$;

create or replace function public.transition_ticket(
  p_ticket_id uuid,
  p_expected_state text,
  p_expected_version integer,
  p_target_state text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  ticket_record public.tickets%rowtype;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'orders.manage') then
    raise exception 'orders.manage permission is required' using errcode = '42501';
  end if;

  select *
  into ticket_record
  from public.tickets ticket
  where ticket.tenant_id = selected_tenant_id
    and ticket.id = p_ticket_id
  for update;

  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  if ticket_record.current_state = p_target_state then
    return jsonb_build_object(
      'outcome', 'already_applied',
      'ticket_id', ticket_record.id,
      'state', ticket_record.current_state,
      'version', ticket_record.state_version
    );
  end if;

  if ticket_record.current_state <> p_expected_state
    or ticket_record.state_version <> p_expected_version then
    raise exception 'stale ticket state: expected % v%, found % v%',
      p_expected_state, p_expected_version,
      ticket_record.current_state, ticket_record.state_version
      using errcode = '40001';
  end if;

  update public.tickets
  set current_state = p_target_state,
      state_version = state_version + 1,
      acknowledged_at = case
        when p_target_state = 'acknowledged' then clock_timestamp()
        else acknowledged_at
      end,
      in_preparation_at = case
        when p_target_state = 'in_preparation' then clock_timestamp()
        else in_preparation_at
      end,
      ready_at = case
        when p_target_state = 'ready' then clock_timestamp()
        else ready_at
      end,
      completed_at = case
        when p_target_state = 'completed' then clock_timestamp()
        else completed_at
      end
  where tenant_id = selected_tenant_id
    and id = p_ticket_id
  returning * into ticket_record;

  return jsonb_build_object(
    'outcome', 'transitioned',
    'ticket_id', ticket_record.id,
    'state', ticket_record.current_state,
    'version', ticket_record.state_version
  );
end;
$$;

create or replace function public.record_kds_visible(
  p_ticket_id uuid,
  p_client_id uuid,
  p_delivery_source text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  visible_at timestamptz := clock_timestamp();
  metric_record public.kds_delivery_metrics%rowtype;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'orders.read') then
    raise exception 'orders.read permission is required' using errcode = '42501';
  end if;
  if p_delivery_source not in (
    'realtime', 'initial_query', 'reconnect', 'safety_poll'
  ) then
    raise exception 'invalid delivery source' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.kds_clients client
    where client.tenant_id = selected_tenant_id
      and client.id = p_client_id
      and client.auth_user_id = auth.uid()
  ) then
    raise exception 'KDS client does not belong to the active user'
      using errcode = '42501';
  end if;

  update public.kds_delivery_metrics metric
  set first_visible_at = visible_at,
      first_visible_client_id = p_client_id,
      delivery_source = p_delivery_source
  where metric.tenant_id = selected_tenant_id
    and metric.ticket_id = p_ticket_id
    and metric.first_visible_at is null
  returning * into metric_record;

  if not found then
    select *
    into metric_record
    from public.kds_delivery_metrics metric
    where metric.tenant_id = selected_tenant_id
      and metric.ticket_id = p_ticket_id;
  end if;

  if metric_record.id is null then
    raise exception 'delivery metric not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ticket_id', metric_record.ticket_id,
    'connected_at_confirmation',
      metric_record.kds_connected_at_confirmation,
    'latency_ms', metric_record.latency_ms,
    'delivery_source', metric_record.delivery_source
  );
end;
$$;

create or replace function public.set_product_availability(
  p_product_id uuid,
  p_available boolean,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  product_record public.products%rowtype;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(
    selected_tenant_id, 'catalog.availability.manage'
  ) then
    raise exception 'catalog.availability.manage permission is required'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'availability change reason is required'
      using errcode = '22023';
  end if;

  select *
  into product_record
  from public.products product
  where product.tenant_id = selected_tenant_id
    and product.id = p_product_id
  for update;

  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if product_record.available_for_order = p_available then
    return jsonb_build_object(
      'outcome', 'already_applied',
      'product_id', product_record.id,
      'available', p_available
    );
  end if;

  update public.products
  set available_for_order = p_available
  where tenant_id = selected_tenant_id and id = p_product_id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id,
    reason, before_data, after_data, occurred_at
  )
  values (
    selected_tenant_id, 'user', auth.uid(),
    case when p_available
      then 'catalog.product_restocked'
      else 'catalog.product_sold_out'
    end,
    'product', p_product_id, p_reason,
    jsonb_build_object(
      'available_for_order', product_record.available_for_order
    ),
    jsonb_build_object('available_for_order', p_available),
    clock_timestamp()
  );

  perform realtime.send(
    jsonb_build_object(
      'product_id', p_product_id,
      'available', p_available,
      'changed_at', clock_timestamp()
    ),
    'product_availability_changed',
    'kds:' || selected_tenant_id::text || ':all',
    true
  );

  return jsonb_build_object(
    'outcome', 'updated',
    'product_id', p_product_id,
    'available', p_available
  );
end;
$$;

create or replace function private.materialize_print_jobs(
  p_tenant_id uuid,
  p_outbox_message_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  message_record public.outbox_messages%rowtype;
  inserted_count integer;
begin
  select *
  into message_record
  from public.outbox_messages message
  where message.tenant_id = p_tenant_id
    and message.id = p_outbox_message_id
  for update;

  if not found or message_record.topic <> 'print.order_confirmed' then
    raise exception 'print outbox message not found' using errcode = 'P0002';
  end if;

  insert into public.print_jobs (
    tenant_id, outbox_message_id, ticket_id, printer_endpoint_id,
    idempotency_key, payload, available_at
  )
  select
    p_tenant_id,
    message_record.id,
    ticket.id,
    endpoint.id,
    'ticket:' || ticket.id::text || ':initial-print',
    jsonb_build_object(
      'ticket_id', ticket.id,
      'order_id', ticket.order_id,
      'station_id', ticket.station_id,
      'state', ticket.current_state,
      'adapter', coalesce(endpoint.adapter_type, 'stub')
    ),
    clock_timestamp()
  from public.tickets ticket
  left join lateral (
    select candidate.id, candidate.adapter_type
    from public.printer_endpoints candidate
    join public.stations station
      on station.tenant_id = candidate.tenant_id
     and station.venue_id = candidate.venue_id
     and station.id = ticket.station_id
    where candidate.tenant_id = ticket.tenant_id
      and candidate.active
      and (
        candidate.station_id = ticket.station_id
        or candidate.station_id is null
      )
    order by (candidate.station_id = ticket.station_id) desc
    limit 1
  ) endpoint on true
  where ticket.tenant_id = p_tenant_id
    and ticket.order_id = message_record.aggregate_id
  on conflict (tenant_id, outbox_message_id, ticket_id)
    where reprint_of_job_id is null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.request_ticket_reprint(
  p_print_job_id uuid,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  source_job public.print_jobs%rowtype;
  reprint_job_id uuid := gen_random_uuid();
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'printing.manage') then
    raise exception 'printing.manage permission is required'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'reprint reason is required' using errcode = '22023';
  end if;

  select *
  into source_job
  from public.print_jobs job
  where job.tenant_id = selected_tenant_id
    and job.id = p_print_job_id
  for update;
  if not found then
    raise exception 'print job not found' using errcode = 'P0002';
  end if;

  insert into public.print_jobs (
    id, tenant_id, outbox_message_id, ticket_id, printer_endpoint_id,
    reprint_of_job_id, idempotency_key, payload, requested_by_user_id,
    reprint_reason
  )
  values (
    reprint_job_id, selected_tenant_id, source_job.outbox_message_id,
    source_job.ticket_id, source_job.printer_endpoint_id,
    source_job.id,
    'print-job:' || source_job.id::text || ':reprint:' || reprint_job_id::text,
    source_job.payload, auth.uid(), p_reason
  );

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id,
    reason, after_data, occurred_at
  )
  values (
    selected_tenant_id, 'user', auth.uid(), 'print.reprint_requested',
    'print_job', reprint_job_id, p_reason,
    jsonb_build_object(
      'source_print_job_id', source_job.id,
      'ticket_id', source_job.ticket_id
    ),
    clock_timestamp()
  );
  return reprint_job_id;
end;
$$;

create view public.kds_latency_summary
with (security_invoker = true)
as
select
  tenant_id,
  station_id,
  count(*) filter (
    where kds_connected_at_confirmation and first_visible_at is not null
  ) as connected_sample_count,
  count(*) filter (
    where not kds_connected_at_confirmation
  ) as no_kds_connected_count,
  count(*) filter (
    where kds_connected_at_confirmation and first_visible_at is null
  ) as connected_not_yet_visible_count,
  round(
    percentile_cont(0.50) within group (order by latency_ms)
      filter (
        where kds_connected_at_confirmation and first_visible_at is not null
      )
  )::bigint as p50_ms,
  round(
    percentile_cont(0.95) within group (order by latency_ms)
      filter (
        where kds_connected_at_confirmation and first_visible_at is not null
      )
  )::bigint as p95_ms,
  round(
    percentile_cont(0.99) within group (order by latency_ms)
      filter (
        where kds_connected_at_confirmation and first_visible_at is not null
      )
  )::bigint as p99_ms
from public.kds_delivery_metrics
group by tenant_id, station_id;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_kds_settings', 'kds_clients', 'kds_delivery_metrics',
    'printer_endpoints', 'print_jobs', 'print_attempts'
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

create policy tenant_kds_settings_select
on public.tenant_kds_settings for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.read'))
);

create policy tenant_kds_settings_insert
on public.tenant_kds_settings for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
);

create policy tenant_kds_settings_update
on public.tenant_kds_settings for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
);

create policy tenant_kds_settings_delete
on public.tenant_kds_settings for delete to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
);

create policy tenant_kds_clients_select
on public.kds_clients for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.read'))
);

create policy tenant_kds_metrics_select
on public.kds_delivery_metrics for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'orders.read'))
);

create policy tenant_printer_endpoints_select
on public.printer_endpoints for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.read'))
);

create policy tenant_printer_endpoints_insert
on public.printer_endpoints for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'printing.manage'))
);

create policy tenant_printer_endpoints_update
on public.printer_endpoints for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'printing.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'printing.manage'))
);

create policy tenant_printer_endpoints_delete
on public.printer_endpoints for delete to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'printing.manage'))
);

create policy tenant_print_jobs_select
on public.print_jobs for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'printing.read'))
);

create policy tenant_print_attempts_select
on public.print_attempts for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'printing.read'))
);

grant select on table public.tenant_kds_settings, public.kds_clients,
  public.kds_delivery_metrics, public.printer_endpoints, public.print_jobs,
  public.print_attempts to authenticated;
grant insert, update, delete on table public.tenant_kds_settings,
  public.printer_endpoints to authenticated;
revoke update on table public.tickets from authenticated;

revoke all on table public.kds_latency_summary
  from public, anon, authenticated, service_role;
grant select on table public.kds_latency_summary
  to authenticated, service_role;

revoke execute on function private.kds_topic_authorized(text)
  from public, anon;
grant execute on function private.kds_topic_authorized(text)
  to authenticated;

revoke execute on function public.kds_heartbeat(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.kds_heartbeat(uuid, uuid, uuid, text)
  to authenticated;
revoke execute on function public.kds_disconnect(uuid)
  from public, anon;
grant execute on function public.kds_disconnect(uuid)
  to authenticated;
revoke execute on function public.transition_ticket(uuid, text, integer, text)
  from public, anon;
grant execute on function public.transition_ticket(uuid, text, integer, text)
  to authenticated;
revoke execute on function public.record_kds_visible(uuid, uuid, text)
  from public, anon;
grant execute on function public.record_kds_visible(uuid, uuid, text)
  to authenticated;
revoke execute on function public.set_product_availability(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_product_availability(uuid, boolean, text)
  to authenticated;
revoke execute on function public.request_ticket_reprint(uuid, text)
  from public, anon;
grant execute on function public.request_ticket_reprint(uuid, text)
  to authenticated;

revoke execute on function private.broadcast_ticket_change()
  from public, anon, authenticated;
revoke execute on function private.materialize_print_jobs(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.materialize_print_jobs(uuid, uuid)
  to service_role;

drop policy if exists kds_receive_private_topics on realtime.messages;
create policy kds_receive_private_topics
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.kds_topic_authorized((select realtime.topic()))
);

drop policy if exists kds_track_private_presence on realtime.messages;
create policy kds_track_private_presence
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'presence'
  and private.kds_topic_authorized((select realtime.topic()))
);

create index tickets_pending_station_idx
  on public.tickets (tenant_id, station_id, current_state, queued_at)
  where current_state <> 'completed';
