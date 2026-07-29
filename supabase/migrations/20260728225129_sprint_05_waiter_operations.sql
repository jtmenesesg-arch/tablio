-- Sprint 5: waiter shifts, zone-scoped durable tasks, table-session groups,
-- transfers, PIN throttling and private Realtime invalidations.

create table public.tenant_waiter_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  pin_max_attempts integer not null default 5
    check (pin_max_attempts between 3 and 10),
  pin_attempt_window_seconds integer not null default 600
    check (pin_attempt_window_seconds between 60 and 3600),
  pin_lock_seconds integer not null default 900
    check (pin_lock_seconds between 60 and 7200),
  session_idle_seconds integer not null default 3600
    check (session_idle_seconds between 900 and 14400),
  session_absolute_seconds integer not null default 43200
    check (session_absolute_seconds between 14400 and 64800),
  reconciliation_interval_seconds integer not null default 45
    check (reconciliation_interval_seconds between 30 and 60),
  warning_after_seconds integer not null default 75
    check (warning_after_seconds between 30 and 300),
  amber_after_seconds integer not null default 180
    check (amber_after_seconds between 60 and 1800),
  critical_after_seconds integer not null default 480
    check (critical_after_seconds between 120 and 3600),
  absolute_critical_after_seconds integer not null default 720
    check (absolute_critical_after_seconds between 300 and 3600),
  orphan_admin_alert_after_seconds integer not null default 120
    check (orphan_admin_alert_after_seconds between 30 and 900),
  waiter_payment_request_ttl_seconds integer not null default 1800
    check (waiter_payment_request_ttl_seconds between 300 and 7200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (session_absolute_seconds > session_idle_seconds),
  check (critical_after_seconds > amber_after_seconds),
  check (absolute_critical_after_seconds >= critical_after_seconds)
);

comment on column public.tenant_waiter_settings.absolute_critical_after_seconds
is 'Default 12 minutes. Every unresolved task becomes critical and moves above normal class priority.';

comment on column public.tenant_waiter_settings.orphan_admin_alert_after_seconds
is 'Default 2 minutes. Unassigned-zone tasks are immediately visible to every active waiter and create a delayed durable admin alert.';

create table public.employee_pin_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  employee_id uuid,
  client_fingerprint_hash bytea not null
    check (octet_length(client_fingerprint_hash) = 32),
  successful boolean not null,
  failure_reason text,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (successful or nullif(btrim(failure_reason), '') is not null)
);

create index employee_pin_attempts_throttle_idx
  on public.employee_pin_attempts (
    tenant_id, venue_id, client_fingerprint_hash, occurred_at desc
  )
  where not successful;

create index employee_pin_attempts_auth_user_idx
  on public.employee_pin_attempts (
    tenant_id, auth_user_id, occurred_at desc
  )
  where not successful;

create table public.employee_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  employee_id uuid not null,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  state text not null default 'active'
    check (state in ('active', 'closed', 'expired', 'revoked')),
  state_version integer not null default 0 check (state_version >= 0),
  started_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (last_seen_at >= started_at),
  check (idle_expires_at > last_seen_at),
  check (absolute_expires_at > started_at),
  check (idle_expires_at <= absolute_expires_at),
  check (
    (state = 'active' and closed_at is null)
    or (state <> 'active' and closed_at is not null)
  )
);

create unique index employee_sessions_one_active_auth_user_idx
  on public.employee_sessions (auth_user_id)
  where state = 'active';

create index employee_sessions_active_employee_idx
  on public.employee_sessions (
    tenant_id, venue_id, employee_id, last_seen_at desc
  )
  where state = 'active';

create table public.employee_zone_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  employee_session_id uuid not null,
  zone_id uuid not null,
  assigned_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  released_reason text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, employee_session_id)
    references public.employee_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete restrict,
  check (released_at is null or released_at >= assigned_at)
);

create unique index employee_zone_assignments_live_idx
  on public.employee_zone_assignments (
    tenant_id, employee_session_id, zone_id
  )
  where released_at is null;

create index employee_zone_assignments_zone_live_idx
  on public.employee_zone_assignments (tenant_id, zone_id)
  where released_at is null;

create table public.table_session_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  label text not null check (btrim(label) <> ''),
  state text not null default 'active'
    check (state in ('active', 'separated')),
  state_version integer not null default 0 check (state_version >= 0),
  created_by_employee_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  separated_by_employee_id uuid,
  separated_at timestamptz,
  separation_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, created_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  foreign key (tenant_id, separated_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    (state = 'active' and separated_at is null)
    or (
      state = 'separated'
      and separated_at is not null
      and separated_by_employee_id is not null
      and nullif(btrim(separation_reason), '') is not null
    )
  )
);

comment on table public.table_session_groups is
  'Operational grouping only. It never owns a cart, quote, payment, order or ticket.';

create table public.table_session_group_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_session_group_id uuid not null,
  table_session_id uuid not null,
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,
  left_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, table_session_group_id)
    references public.table_session_groups (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  check (left_at is null or left_at >= joined_at)
);

create unique index table_session_group_members_one_live_group_idx
  on public.table_session_group_members (tenant_id, table_session_id)
  where left_at is null;

create index table_session_group_members_group_live_idx
  on public.table_session_group_members (tenant_id, table_session_group_id)
  where left_at is null;

create table public.waiter_table_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_session_id uuid not null,
  employee_id uuid not null,
  assigned_by_employee_id uuid not null,
  assigned_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  foreign key (tenant_id, assigned_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (released_at is null or released_at >= assigned_at)
);

create unique index waiter_table_assignments_one_live_idx
  on public.waiter_table_assignments (tenant_id, table_session_id)
  where released_at is null;

create index waiter_table_assignments_employee_live_idx
  on public.waiter_table_assignments (tenant_id, employee_id)
  where released_at is null;

alter table public.diner_service_requests
  add column state_version integer not null default 0
    check (state_version >= 0);

alter table public.diner_waiter_payment_requests
  add column state_version integer not null default 0
    check (state_version >= 0),
  add column expires_at timestamptz,
  add column cart_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(cart_snapshot) = 'array'),
  add column discarded_at timestamptz,
  add column discarded_by_employee_id uuid,
  add column discard_reason text,
  add foreign key (tenant_id, discarded_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  add check (
    discarded_at is null
    or (
      discarded_by_employee_id is not null
      and nullif(btrim(discard_reason), '') is not null
    )
  );

create table public.waiter_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  zone_id uuid not null,
  table_session_id uuid not null,
  task_type text not null
    check (
      task_type in (
        'delivery_ready',
        'service_request',
        'waiter_payment_request'
      )
    ),
  source_ticket_id uuid,
  source_service_request_id uuid,
  source_waiter_payment_request_id uuid,
  assigned_employee_id uuid,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'completed',
        'dismissed',
        'expired'
      )
    ),
  state_version integer not null default 0 check (state_version >= 0),
  base_priority integer not null check (base_priority between 10 and 100),
  title text not null check (btrim(title) <> ''),
  detail text not null check (btrim(detail) <> ''),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  requested_at timestamptz not null,
  completed_at timestamptz,
  completed_by_employee_id uuid,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_session_id)
    references public.table_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_ticket_id)
    references public.tickets (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_service_request_id)
    references public.diner_service_requests (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_waiter_payment_request_id)
    references public.diner_waiter_payment_requests (tenant_id, id) on delete restrict,
  foreign key (tenant_id, assigned_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  foreign key (tenant_id, completed_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    num_nonnulls(
      source_ticket_id,
      source_service_request_id,
      source_waiter_payment_request_id
    ) = 1
  ),
  check (
    (status = 'pending' and completed_at is null)
    or (
      status <> 'pending'
      and completed_at is not null
      and nullif(btrim(resolution), '') is not null
    )
  )
);

create unique index waiter_tasks_ticket_uidx
  on public.waiter_tasks (tenant_id, source_ticket_id)
  where source_ticket_id is not null;

create unique index waiter_tasks_service_request_uidx
  on public.waiter_tasks (tenant_id, source_service_request_id)
  where source_service_request_id is not null;

create unique index waiter_tasks_payment_request_uidx
  on public.waiter_tasks (tenant_id, source_waiter_payment_request_id)
  where source_waiter_payment_request_id is not null;

create index waiter_tasks_pending_zone_idx
  on public.waiter_tasks (
    tenant_id, venue_id, zone_id, requested_at
  )
  where status = 'pending';

create table public.waiter_admin_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  waiter_task_id uuid not null,
  alert_type text not null default 'orphan_task'
    check (alert_type = 'orphan_task'),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'resolved')),
  escalate_at timestamptz not null,
  opened_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, waiter_task_id, alert_type),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, waiter_task_id)
    references public.waiter_tasks (tenant_id, id) on delete restrict,
  check (
    (status = 'scheduled' and opened_at is null and resolved_at is null)
    or (status = 'open' and opened_at is not null and resolved_at is null)
    or (
      status = 'resolved'
      and resolved_at is not null
      and nullif(btrim(resolution), '') is not null
    )
  )
);

create table public.waiter_shift_close_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  employee_session_id uuid not null,
  employee_id uuid not null,
  pending_total integer not null check (pending_total >= 0),
  pending_by_type jsonb not null
    check (jsonb_typeof(pending_by_type) = 'object'),
  acknowledged_by_employee boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, employee_session_id)
    references public.employee_sessions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

create or replace function private.current_employee_session_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  raw_session_id text;
begin
  raw_session_id := auth.jwt() ->> 'employee_session_id';
  if raw_session_id is null or btrim(raw_session_id) = '' then
    return null;
  end if;
  return raw_session_id::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.has_active_employee_session(
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_tenant_id is not null
    and p_tenant_id = private.current_tenant_id()
    and auth.uid() is not null
    and exists (
      select 1
      from public.employee_sessions session
      join public.employee_roles role
        on role.tenant_id = session.tenant_id
       and role.employee_id = session.employee_id
       and role.role_code = 'waiter'
      where session.tenant_id = p_tenant_id
        and session.id = private.current_employee_session_id()
        and session.auth_user_id = auth.uid()
        and session.state = 'active'
        and session.idle_expires_at > clock_timestamp()
        and session.absolute_expires_at > clock_timestamp()
    );
$$;

create or replace function private.waiter_can_access_zone(
  p_tenant_id uuid,
  p_venue_id uuid,
  p_zone_id uuid,
  p_assigned_employee_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_session as (
    select session.id, session.employee_id
    from public.employee_sessions session
    where session.tenant_id = p_tenant_id
      and session.id = private.current_employee_session_id()
      and session.auth_user_id = auth.uid()
      and session.venue_id = p_venue_id
      and session.state = 'active'
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
  ),
  zone_coverage as (
    select assignment.employee_session_id
    from public.employee_zone_assignments assignment
    join public.employee_sessions active_session
      on active_session.tenant_id = assignment.tenant_id
     and active_session.id = assignment.employee_session_id
     and active_session.state = 'active'
     and active_session.idle_expires_at > clock_timestamp()
     and active_session.absolute_expires_at > clock_timestamp()
    where assignment.tenant_id = p_tenant_id
      and assignment.zone_id = p_zone_id
      and assignment.released_at is null
  )
  select private.has_active_employee_session(p_tenant_id)
    and exists (select 1 from current_session)
    and (
      (
        p_assigned_employee_id is null
        and exists (
        select 1
        from current_session
        join public.employee_zone_assignments own
          on own.tenant_id = p_tenant_id
         and own.employee_session_id = current_session.id
         and own.zone_id = p_zone_id
         and own.released_at is null
        )
      )
      or exists (
        select 1
        from current_session
        where current_session.employee_id = p_assigned_employee_id
      )
      or not exists (select 1 from zone_coverage)
    );
$$;

create or replace function private.waiter_topic_authorized(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_sessions session
    where session.tenant_id = private.current_tenant_id()
      and session.id = private.current_employee_session_id()
      and session.auth_user_id = auth.uid()
      and session.state = 'active'
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
      and p_topic = format(
        'tenant:%s:waiter:%s',
        session.tenant_id,
        session.venue_id
      )
  );
$$;

create or replace function private.waiter_zone_has_coverage(
  p_tenant_id uuid,
  p_zone_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_zone_assignments assignment
    join public.employee_sessions session
      on session.tenant_id = assignment.tenant_id
     and session.id = assignment.employee_session_id
    where assignment.tenant_id = p_tenant_id
      and assignment.zone_id = p_zone_id
      and assignment.released_at is null
      and session.state = 'active'
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
  );
$$;

create or replace function private.schedule_orphan_waiter_alert(
  p_task public.waiter_tasks
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alert_delay integer := 120;
  created_alert_id uuid;
  escalation_time timestamptz;
begin
  if p_task.status <> 'pending'
    or private.waiter_zone_has_coverage(p_task.tenant_id, p_task.zone_id) then
    return;
  end if;

  select settings.orphan_admin_alert_after_seconds
  into alert_delay
  from public.tenant_waiter_settings settings
  where settings.tenant_id = p_task.tenant_id;

  escalation_time :=
    clock_timestamp() + make_interval(secs => coalesce(alert_delay, 120));

  insert into public.waiter_admin_alerts (
    tenant_id,
    venue_id,
    waiter_task_id,
    escalate_at
  )
  values (
    p_task.tenant_id,
    p_task.venue_id,
    p_task.id,
    escalation_time
  )
  on conflict (tenant_id, waiter_task_id, alert_type)
  do update
  set status = 'scheduled',
      escalate_at = excluded.escalate_at,
      opened_at = null,
      resolved_at = null,
      resolution = null
  returning id into created_alert_id;

  insert into public.outbox_messages (
    tenant_id,
    aggregate_type,
    aggregate_id,
    topic,
    deduplication_key,
    payload,
    available_at
  )
  values (
    p_task.tenant_id,
    'waiter_admin_alert',
    created_alert_id,
    'waiter.admin.orphan_task',
    format('waiter-orphan-alert:%s', p_task.id),
    jsonb_build_object(
      'alert_id', created_alert_id,
      'task_id', p_task.id,
      'venue_id', p_task.venue_id,
      'zone_id', p_task.zone_id
    ),
    escalation_time
  )
  on conflict (tenant_id, deduplication_key)
  do update
  set status = 'pending',
      available_at = excluded.available_at,
      payload = excluded.payload,
      updated_at = clock_timestamp();
end;
$$;

create or replace function private.resolve_orphan_waiter_alert(
  p_tenant_id uuid,
  p_task_id uuid,
  p_resolution text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.waiter_admin_alerts alert
  set status = 'resolved',
      resolved_at = clock_timestamp(),
      resolution = p_resolution
  where alert.tenant_id = p_tenant_id
    and alert.waiter_task_id = p_task_id
    and alert.status <> 'resolved';

  update public.outbox_messages message
  set status = 'completed',
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where message.tenant_id = p_tenant_id
    and message.deduplication_key =
      format('waiter-orphan-alert:%s', p_task_id)
    and message.status = 'pending';
end;
$$;

create or replace function private.broadcast_waiter_task_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'entity_id', new.id,
      'action', tg_op,
      'version', new.state_version
    ),
    'waiter.task.changed',
    format('tenant:%s:waiter:%s', new.tenant_id, new.venue_id),
    true
  );
  return null;
end;
$$;

create or replace function private.snapshot_waiter_payment_request()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ttl_seconds integer := 1800;
begin
  select settings.waiter_payment_request_ttl_seconds
  into ttl_seconds
  from public.tenant_waiter_settings settings
  where settings.tenant_id = new.tenant_id;

  new.expires_at :=
    coalesce(
      new.expires_at,
      new.requested_at + make_interval(secs => coalesce(ttl_seconds, 1800))
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', product.id,
        'name', product.name,
        'quantity', item.quantity,
        'note', item.customer_note
      )
      order by item.created_at
    ),
    '[]'::jsonb
  )
  into new.cart_snapshot
  from public.cart_items item
  join public.products product
    on product.tenant_id = item.tenant_id
   and product.id = item.product_id
  where item.tenant_id = new.tenant_id
    and item.cart_id = new.cart_id;

  return new;
end;
$$;

create trigger diner_waiter_payment_requests_snapshot
before insert on public.diner_waiter_payment_requests
for each row execute function private.snapshot_waiter_payment_request();

create or replace function private.materialize_waiter_task_from_ticket()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_task public.waiter_tasks%rowtype;
begin
  if new.current_state = 'ready'
    and (tg_op = 'INSERT' or old.current_state <> 'ready') then
    insert into public.waiter_tasks (
      tenant_id,
      venue_id,
      zone_id,
      table_session_id,
      task_type,
      source_ticket_id,
      assigned_employee_id,
      base_priority,
      title,
      detail,
      payload,
      requested_at
    )
    select
      new.tenant_id,
      venue.id,
      table_record.zone_id,
      orders.table_session_id,
      'delivery_ready',
      new.id,
      assignment.employee_id,
      100,
      format(
        '%s · %s · Pedido %s · LISTO',
        table_record.display_name,
        coalesce(orders.diner_display_name, orders.diner_alias, 'Comensal'),
        orders.order_number
      ),
      format(
        '%s · %s',
        station.name,
        coalesce(
          string_agg(
            format('%sx %s', item.quantity, item.product_name),
            ' · '
            order by item.product_name
          ),
          'Comanda lista'
        )
      ),
      jsonb_build_object(
        'order_id', orders.id,
        'order_number', orders.order_number,
        'table_name', table_record.display_name,
        'alias', orders.diner_alias,
        'display_name', orders.diner_display_name,
        'amount_clp', orders.total_clp,
        'station_name', station.name,
        'paid', true,
        'items', coalesce(
          jsonb_agg(
            jsonb_build_object(
              'name', item.product_name,
              'quantity', item.quantity,
              'note', item.selected_modifiers ->> 'customer_note'
            )
            order by item.product_name
          ) filter (where item.id is not null),
          '[]'::jsonb
        )
      ),
      coalesce(new.ready_at, clock_timestamp())
    from public.orders orders
    join public.tables table_record
      on table_record.tenant_id = orders.tenant_id
     and table_record.id = orders.table_id
    join public.zones zone
      on zone.tenant_id = table_record.tenant_id
     and zone.id = table_record.zone_id
    join public.venues venue
      on venue.tenant_id = zone.tenant_id
     and venue.id = zone.venue_id
    join public.stations station
      on station.tenant_id = new.tenant_id
     and station.id = new.station_id
    left join public.ticket_items ticket_item
      on ticket_item.tenant_id = new.tenant_id
     and ticket_item.ticket_id = new.id
    left join public.order_items item
      on item.tenant_id = ticket_item.tenant_id
     and item.id = ticket_item.order_item_id
    left join public.waiter_table_assignments assignment
      on assignment.tenant_id = orders.tenant_id
     and assignment.table_session_id = orders.table_session_id
     and assignment.released_at is null
    where orders.tenant_id = new.tenant_id
      and orders.id = new.order_id
    group by
      venue.id,
      table_record.zone_id,
      table_record.display_name,
      orders.table_session_id,
      orders.id,
      orders.diner_display_name,
      orders.diner_alias,
      orders.order_number,
      orders.total_clp,
      station.name,
      assignment.employee_id
    on conflict (tenant_id, source_ticket_id) where source_ticket_id is not null
    do nothing
    returning * into created_task;

    if created_task.id is not null then
      perform private.schedule_orphan_waiter_alert(created_task);
    end if;
  elsif new.current_state = 'completed'
    and (tg_op = 'INSERT' or old.current_state <> 'completed') then
    update public.waiter_tasks task
    set status = 'completed',
        completed_at = coalesce(new.completed_at, clock_timestamp()),
        resolution = coalesce(task.resolution, 'Entregada desde KDS'),
        state_version = task.state_version + 1
    where task.tenant_id = new.tenant_id
      and task.source_ticket_id = new.id
      and task.status = 'pending';
  end if;
  return null;
end;
$$;

create trigger tickets_materialize_waiter_task
after insert or update of current_state on public.tickets
for each row execute function private.materialize_waiter_task_from_ticket();

create or replace function private.materialize_waiter_task_from_service()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_task public.waiter_tasks%rowtype;
  base integer;
begin
  if new.status = 'notified'
    and (tg_op = 'INSERT' or old.status <> 'notified') then
    select case action.code
      when 'problem' then 80
      else 50
    end
    into base
    from public.service_action_types action
    where action.tenant_id = new.tenant_id
      and action.id = new.service_action_type_id;

    insert into public.waiter_tasks (
      tenant_id,
      venue_id,
      zone_id,
      table_session_id,
      task_type,
      source_service_request_id,
      assigned_employee_id,
      base_priority,
      title,
      detail,
      payload,
      requested_at
    )
    select
      new.tenant_id,
      venue.id,
      table_record.zone_id,
      new.table_session_id,
      'service_request',
      new.id,
      assignment.employee_id,
      coalesce(base, 50),
      format('%s · %s', table_record.display_name, action.label),
      coalesce(action.description, 'Solicitud del comensal'),
      jsonb_build_object(
        'table_name', table_record.display_name,
        'action_code', action.code,
        'action_label', action.label,
        'alias', device.alias,
        'display_name', device.display_name
      ),
      new.requested_at
    from public.table_sessions table_session
    join public.tables table_record
      on table_record.tenant_id = table_session.tenant_id
     and table_record.id = table_session.table_id
    join public.zones zone
      on zone.tenant_id = table_record.tenant_id
     and zone.id = table_record.zone_id
    join public.venues venue
      on venue.tenant_id = zone.tenant_id
     and venue.id = zone.venue_id
    join public.service_action_types action
      on action.tenant_id = new.tenant_id
     and action.id = new.service_action_type_id
    join public.diner_device_sessions device
      on device.tenant_id = new.tenant_id
     and device.id = new.diner_device_session_id
    left join public.waiter_table_assignments assignment
      on assignment.tenant_id = new.tenant_id
     and assignment.table_session_id = new.table_session_id
     and assignment.released_at is null
    where table_session.tenant_id = new.tenant_id
      and table_session.id = new.table_session_id
    on conflict (tenant_id, source_service_request_id)
      where source_service_request_id is not null
    do nothing
    returning * into created_task;

    if created_task.id is not null then
      perform private.schedule_orphan_waiter_alert(created_task);
    end if;
  elsif new.status in ('completed', 'cancelled') then
    update public.waiter_tasks task
    set status = case
          when new.status = 'completed' then 'completed'
          else 'dismissed'
        end,
        completed_at = coalesce(new.completed_at, clock_timestamp()),
        resolution = coalesce(
          task.resolution,
          case
            when new.status = 'completed' then 'Atendida desde otra vista'
            else 'Cancelada desde otra vista'
          end
        ),
        state_version = task.state_version + 1
    where task.tenant_id = new.tenant_id
      and task.source_service_request_id = new.id
      and task.status = 'pending';
  end if;
  return null;
end;
$$;

create trigger diner_service_requests_materialize_waiter_task
after insert or update of status on public.diner_service_requests
for each row execute function private.materialize_waiter_task_from_service();

create or replace function private.materialize_waiter_task_from_payment()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_task public.waiter_tasks%rowtype;
begin
  if new.status = 'notified'
    and (tg_op = 'INSERT' or old.status <> 'notified') then
    insert into public.waiter_tasks (
      tenant_id,
      venue_id,
      zone_id,
      table_session_id,
      task_type,
      source_waiter_payment_request_id,
      assigned_employee_id,
      base_priority,
      title,
      detail,
      payload,
      requested_at
    )
    select
      new.tenant_id,
      venue.id,
      table_record.zone_id,
      new.table_session_id,
      'waiter_payment_request',
      new.id,
      assignment.employee_id,
      70,
      format(
        '%s · %s · PAGO PENDIENTE',
        table_record.display_name,
        coalesce(device.display_name, device.alias)
      ),
      'NO PAGADO · nada fue enviado a la barra',
      jsonb_build_object(
        'table_name', table_record.display_name,
        'alias', device.alias,
        'display_name', device.display_name,
        'cart_items', new.cart_snapshot,
        'paid', false,
        'expires_at', new.expires_at
      ),
      new.requested_at
    from public.table_sessions table_session
    join public.tables table_record
      on table_record.tenant_id = table_session.tenant_id
     and table_record.id = table_session.table_id
    join public.zones zone
      on zone.tenant_id = table_record.tenant_id
     and zone.id = table_record.zone_id
    join public.venues venue
      on venue.tenant_id = zone.tenant_id
     and venue.id = zone.venue_id
    join public.diner_device_sessions device
      on device.tenant_id = new.tenant_id
     and device.id = new.diner_device_session_id
    left join public.waiter_table_assignments assignment
      on assignment.tenant_id = new.tenant_id
     and assignment.table_session_id = new.table_session_id
     and assignment.released_at is null
    where table_session.tenant_id = new.tenant_id
      and table_session.id = new.table_session_id
    on conflict (tenant_id, source_waiter_payment_request_id)
      where source_waiter_payment_request_id is not null
    do nothing
    returning * into created_task;

    if created_task.id is not null then
      perform private.schedule_orphan_waiter_alert(created_task);
    end if;
  elsif new.status in ('completed', 'cancelled') then
    update public.waiter_tasks task
    set status = case
          when new.status = 'completed' then 'completed'
          else 'dismissed'
        end,
        completed_at = coalesce(
          new.completed_at,
          new.discarded_at,
          clock_timestamp()
        ),
        resolution = coalesce(
          task.resolution,
          case
            when new.status = 'completed' then 'Atendida'
            else 'Descartada'
          end
        ),
        state_version = task.state_version + 1
    where task.tenant_id = new.tenant_id
      and task.source_waiter_payment_request_id = new.id
      and task.status = 'pending';
  end if;
  return null;
end;
$$;

create trigger diner_waiter_payment_requests_materialize_waiter_task
after insert or update of status on public.diner_waiter_payment_requests
for each row execute function private.materialize_waiter_task_from_payment();

create trigger waiter_tasks_broadcast_change
after insert or update on public.waiter_tasks
for each row execute function private.broadcast_waiter_task_change();

create view public.waiter_task_queue
with (security_invoker = true)
as
select
  task.*,
  zone.name as zone_name,
  table_record.display_name as table_name,
  group_record.id as table_session_group_id,
  group_record.label as group_label,
  not private.waiter_zone_has_coverage(task.tenant_id, task.zone_id)
    as unassigned_zone,
  clock_timestamp() >=
    task.requested_at
      + make_interval(
          secs => coalesce(settings.absolute_critical_after_seconds, 720)
        )
    as absolute_critical,
  case
    when clock_timestamp() >=
      task.requested_at
        + make_interval(
            secs => coalesce(settings.absolute_critical_after_seconds, 720)
          )
      then 1000
    else task.base_priority
  end as effective_priority
from public.waiter_tasks task
join public.zones zone
  on zone.tenant_id = task.tenant_id
 and zone.id = task.zone_id
join public.table_sessions table_session
  on table_session.tenant_id = task.tenant_id
 and table_session.id = task.table_session_id
join public.tables table_record
  on table_record.tenant_id = table_session.tenant_id
 and table_record.id = table_session.table_id
left join public.tenant_waiter_settings settings
  on settings.tenant_id = task.tenant_id
left join public.table_session_group_members group_member
  on group_member.tenant_id = task.tenant_id
 and group_member.table_session_id = task.table_session_id
 and group_member.left_at is null
left join public.table_session_groups group_record
  on group_record.tenant_id = group_member.tenant_id
 and group_record.id = group_member.table_session_group_id
 and group_record.state = 'active'
where task.status = 'pending';

comment on view public.waiter_task_queue is
  'RLS-aware queue. Absolute-critical tasks sort first; uncovered zones remain visible to all active waiters.';

create or replace function private.start_waiter_shift(
  p_tenant_id uuid,
  p_venue_id uuid,
  p_pin text,
  p_client_fingerprint_hash bytea
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  settings_record public.tenant_waiter_settings%rowtype;
  employee_record public.employees%rowtype;
  recent_failures integer;
  created_session public.employee_sessions%rowtype;
  current_time timestamptz := clock_timestamp();
begin
  if requesting_user is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if octet_length(p_client_fingerprint_hash) <> 32 then
    raise exception 'invalid client fingerprint' using errcode = '22023';
  end if;

  select *
  into settings_record
  from public.tenant_waiter_settings settings
  where settings.tenant_id = p_tenant_id;

  select count(*)
  into recent_failures
  from public.employee_pin_attempts attempt
  where attempt.tenant_id = p_tenant_id
    and attempt.venue_id = p_venue_id
    and not attempt.successful
    and (
      attempt.auth_user_id = requesting_user
      or attempt.client_fingerprint_hash = p_client_fingerprint_hash
    )
    and attempt.occurred_at >=
      current_time
        - make_interval(
            secs => coalesce(
              settings_record.pin_attempt_window_seconds,
              600
            )
          );

  if recent_failures >= coalesce(settings_record.pin_max_attempts, 5) then
    insert into public.employee_pin_attempts (
      tenant_id,
      venue_id,
      auth_user_id,
      client_fingerprint_hash,
      successful,
      failure_reason
    )
    values (
      p_tenant_id,
      p_venue_id,
      requesting_user,
      p_client_fingerprint_hash,
      false,
      'locked'
    );
    -- Return instead of raising: an exception would roll back the append-only
    -- attempt and make throttling ineffective.
    return jsonb_build_object(
      'outcome', 'locked',
      'retry_after_seconds', coalesce(settings_record.pin_lock_seconds, 900)
    );
  end if;

  select employee.*
  into employee_record
  from public.employees employee
  join public.employee_roles role
    on role.tenant_id = employee.tenant_id
   and role.employee_id = employee.id
   and role.role_code = 'waiter'
  where employee.tenant_id = p_tenant_id
    and employee.status = 'active'
    and extensions.crypt(p_pin, employee.employee_pin_hash)
      = employee.employee_pin_hash
  limit 1;

  if employee_record.id is null then
    insert into public.employee_pin_attempts (
      tenant_id,
      venue_id,
      auth_user_id,
      client_fingerprint_hash,
      successful,
      failure_reason
    )
    values (
      p_tenant_id,
      p_venue_id,
      requesting_user,
      p_client_fingerprint_hash,
      false,
      'invalid_pin'
    );
    -- Return instead of raising so the failed attempt survives this transaction.
    return jsonb_build_object('outcome', 'invalid_pin');
  end if;

  update public.employee_sessions session
  set state = 'closed',
      state_version = session.state_version + 1,
      closed_at = current_time,
      close_reason = 'Replaced by a new PIN login'
  where session.auth_user_id = requesting_user
    and session.state = 'active';

  insert into public.employee_sessions (
    tenant_id,
    venue_id,
    employee_id,
    auth_user_id,
    started_at,
    last_seen_at,
    idle_expires_at,
    absolute_expires_at
  )
  values (
    p_tenant_id,
    p_venue_id,
    employee_record.id,
    requesting_user,
    current_time,
    current_time,
    current_time
      + make_interval(
          secs => coalesce(settings_record.session_idle_seconds, 3600)
        ),
    current_time
      + make_interval(
          secs => coalesce(settings_record.session_absolute_seconds, 43200)
        )
  )
  returning * into created_session;

  insert into public.employee_pin_attempts (
    tenant_id,
    venue_id,
    auth_user_id,
    employee_id,
    client_fingerprint_hash,
    successful
  )
  values (
    p_tenant_id,
    p_venue_id,
    requesting_user,
    employee_record.id,
    p_client_fingerprint_hash,
    true
  );

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    after_data
  )
  values (
    p_tenant_id,
    'employee',
    requesting_user,
    employee_record.id,
    'waiter.shift_started',
    'employee_session',
    created_session.id,
    'PIN verified',
    jsonb_build_object('venue_id', p_venue_id)
  );

  return jsonb_build_object(
    'outcome', 'authenticated',
    'session_id', created_session.id,
    'employee_id', employee_record.id,
    'display_name', employee_record.display_name,
    'refresh_token_required', true
  );
end;
$$;

create or replace function private.set_waiter_zones(p_zone_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.employee_sessions%rowtype;
  selected_zone_id uuid;
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
    and session.state = 'active'
    and session.idle_expires_at > clock_timestamp()
    and session.absolute_expires_at > clock_timestamp()
  for update;

  if session_record.id is null then
    raise exception 'active waiter session is required'
      using errcode = '42501';
  end if;

  if cardinality(coalesce(p_zone_ids, '{}'::uuid[])) < 1 then
    raise exception 'select at least one zone' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_zone_ids) requested(id)
    left join public.zones zone
      on zone.tenant_id = session_record.tenant_id
     and zone.venue_id = session_record.venue_id
     and zone.id = requested.id
     and zone.active
    where zone.id is null
  ) then
    raise exception 'zone does not belong to the active venue'
      using errcode = '42501';
  end if;

  update public.employee_zone_assignments assignment
  set released_at = clock_timestamp(),
      released_reason = 'Zone selection changed'
  where assignment.tenant_id = session_record.tenant_id
    and assignment.employee_session_id = session_record.id
    and assignment.released_at is null
    and not (assignment.zone_id = any(p_zone_ids));

  foreach selected_zone_id in array p_zone_ids
  loop
    insert into public.employee_zone_assignments (
      tenant_id,
      employee_session_id,
      zone_id
    )
    values (
      session_record.tenant_id,
      session_record.id,
      selected_zone_id
    )
    on conflict (
      tenant_id,
      employee_session_id,
      zone_id
    ) where released_at is null
    do nothing;

    update public.waiter_admin_alerts alert
    set status = 'resolved',
        resolved_at = clock_timestamp(),
        resolution = 'Zone covered by active waiter'
    from public.waiter_tasks task
    where task.tenant_id = session_record.tenant_id
      and task.zone_id = selected_zone_id
      and task.status = 'pending'
      and alert.tenant_id = task.tenant_id
      and alert.waiter_task_id = task.id
      and alert.status <> 'resolved';
  end loop;

  update public.employee_sessions session
  set last_seen_at = clock_timestamp(),
      idle_expires_at = least(
        clock_timestamp()
          + make_interval(
              secs => coalesce(
                (
                  select settings.session_idle_seconds
                  from public.tenant_waiter_settings settings
                  where settings.tenant_id = session_record.tenant_id
                ),
                3600
              )
            ),
        session.absolute_expires_at
      )
  where session.id = session_record.id;

  return jsonb_build_object(
    'session_id', session_record.id,
    'zone_ids', p_zone_ids
  );
end;
$$;

create or replace function private.resolve_waiter_task(
  p_task_id uuid,
  p_expected_version integer,
  p_resolution text,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  task_record public.waiter_tasks%rowtype;
  session_record public.employee_sessions%rowtype;
  ticket_record public.tickets%rowtype;
  current_time timestamptz := clock_timestamp();
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
    and session.state = 'active'
    and session.idle_expires_at > current_time
    and session.absolute_expires_at > current_time;

  select *
  into task_record
  from public.waiter_tasks task
  where task.tenant_id = session_record.tenant_id
    and task.id = p_task_id
  for update;

  if session_record.id is null
    or task_record.id is null
    or not private.waiter_can_access_zone(
      task_record.tenant_id,
      task_record.venue_id,
      task_record.zone_id,
      task_record.assigned_employee_id
    ) then
    raise exception 'task is outside the waiter scope'
      using errcode = '42501';
  end if;
  if task_record.status <> 'pending'
    or task_record.state_version <> p_expected_version then
    raise exception 'stale waiter task version'
      using errcode = '40001';
  end if;
  if p_resolution not in ('completed', 'dismissed') then
    raise exception 'invalid task resolution' using errcode = '22023';
  end if;
  if p_resolution = 'dismissed'
    and task_record.task_type <> 'waiter_payment_request' then
    raise exception 'only payment-with-waiter requests can be dismissed'
      using errcode = '42501';
  end if;
  if p_resolution = 'dismissed'
    and nullif(btrim(p_reason), '') is null then
    raise exception 'dismissal reason is required'
      using errcode = '22023';
  end if;

  if task_record.task_type = 'delivery_ready' then
    select *
    into ticket_record
    from public.tickets ticket
    where ticket.tenant_id = task_record.tenant_id
      and ticket.id = task_record.source_ticket_id
    for update;

    if ticket_record.current_state <> 'ready' then
      raise exception 'delivery ticket is no longer ready'
        using errcode = '40001';
    end if;

    update public.tickets
    set current_state = 'completed',
        state_version = state_version + 1,
        completed_at = current_time
    where tenant_id = ticket_record.tenant_id
      and id = ticket_record.id;
  elsif task_record.task_type = 'service_request' then
    update public.diner_service_requests
    set status = 'completed',
        state_version = state_version + 1,
        completed_at = current_time
    where tenant_id = task_record.tenant_id
      and id = task_record.source_service_request_id
      and status in ('notified', 'acknowledged');
  elsif p_resolution = 'completed' then
    update public.diner_waiter_payment_requests
    set status = 'completed',
        state_version = state_version + 1,
        completed_at = current_time
    where tenant_id = task_record.tenant_id
      and id = task_record.source_waiter_payment_request_id
      and status in ('notified', 'acknowledged');
  else
    update public.diner_waiter_payment_requests
    set status = 'cancelled',
        state_version = state_version + 1,
        discarded_at = current_time,
        discarded_by_employee_id = session_record.employee_id,
        discard_reason = btrim(p_reason)
    where tenant_id = task_record.tenant_id
      and id = task_record.source_waiter_payment_request_id
      and status in ('notified', 'acknowledged');
  end if;

  update public.waiter_tasks task
  set status = p_resolution,
      state_version = task.state_version + 1,
      completed_at = current_time,
      completed_by_employee_id = session_record.employee_id,
      resolution = case
        when p_resolution = 'completed' then 'Atendida'
        else format('Descartada: %s', btrim(p_reason))
      end
  where task.tenant_id = task_record.tenant_id
    and task.id = task_record.id
    and task.status = 'pending'
  returning * into task_record;

  perform private.resolve_orphan_waiter_alert(
    task_record.tenant_id,
    task_record.id,
    'Task resolved'
  );

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data
  )
  values (
    task_record.tenant_id,
    'employee',
    auth.uid(),
    session_record.employee_id,
    case
      when p_resolution = 'completed' then 'waiter.task_completed'
      else 'waiter.payment_request_dismissed'
    end,
    'waiter_task',
    task_record.id,
    coalesce(nullif(btrim(p_reason), ''), 'Operational completion'),
    jsonb_build_object('version', p_expected_version),
    jsonb_build_object(
      'version', task_record.state_version,
      'status', task_record.status
    )
  );

  return jsonb_build_object(
    'task_id', task_record.id,
    'status', task_record.status,
    'version', task_record.state_version
  );
end;
$$;

create or replace function private.create_table_session_group(
  p_table_session_ids uuid[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.employee_sessions%rowtype;
  new_group_id uuid;
  table_labels text;
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
    and session.state = 'active';

  if session_record.id is null
    or cardinality(coalesce(p_table_session_ids, '{}'::uuid[])) < 2 then
    raise exception 'active waiter and at least two tables are required'
      using errcode = '22023';
  end if;

  if (
    select count(distinct table_session.id)
    from unnest(p_table_session_ids) requested(id)
    join public.table_sessions table_session
      on table_session.tenant_id = session_record.tenant_id
     and table_session.id = requested.id
     and table_session.state = 'active'
    join public.tables table_record
      on table_record.tenant_id = table_session.tenant_id
     and table_record.id = table_session.table_id
     and table_record.venue_id = session_record.venue_id
  ) <> cardinality(p_table_session_ids) then
    raise exception 'all tables must be active in the same venue'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.table_session_group_members member
    where member.tenant_id = session_record.tenant_id
      and member.table_session_id = any(p_table_session_ids)
      and member.left_at is null
  ) then
    raise exception 'a table already belongs to an active group'
      using errcode = '23505';
  end if;

  select string_agg(
    table_record.table_number,
    '-' order by table_record.table_number
  )
  into table_labels
  from public.table_sessions table_session
  join public.tables table_record
    on table_record.tenant_id = table_session.tenant_id
   and table_record.id = table_session.table_id
  where table_session.tenant_id = session_record.tenant_id
    and table_session.id = any(p_table_session_ids);

  insert into public.table_session_groups (
    tenant_id,
    venue_id,
    label,
    created_by_employee_id
  )
  values (
    session_record.tenant_id,
    session_record.venue_id,
    format('Mesas %s', table_labels),
    session_record.employee_id
  )
  returning id into new_group_id;

  insert into public.table_session_group_members (
    tenant_id,
    table_session_group_id,
    table_session_id
  )
  select session_record.tenant_id, new_group_id, requested.id
  from unnest(p_table_session_ids) requested(id);

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    after_data
  )
  values (
    session_record.tenant_id,
    'employee',
    auth.uid(),
    session_record.employee_id,
    'table_group.created',
    'table_session_group',
    new_group_id,
    'Tables joined for operational visibility',
    jsonb_build_object('table_session_ids', p_table_session_ids)
  );

  return new_group_id;
end;
$$;

create or replace function private.separate_table_session_group(
  p_group_id uuid,
  p_expected_version integer,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.employee_sessions%rowtype;
  group_record public.table_session_groups%rowtype;
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
    and session.state = 'active';

  select *
  into group_record
  from public.table_session_groups group_table
  where group_table.tenant_id = session_record.tenant_id
    and group_table.id = p_group_id
  for update;

  if group_record.id is null
    or group_record.venue_id <> session_record.venue_id then
    raise exception 'group is outside the active venue'
      using errcode = '42501';
  end if;
  if group_record.state <> 'active'
    or group_record.state_version <> p_expected_version then
    raise exception 'stale table group version'
      using errcode = '40001';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'separation reason is required' using errcode = '22023';
  end if;

  update public.table_session_group_members member
  set left_at = clock_timestamp(),
      left_reason = btrim(p_reason)
  where member.tenant_id = group_record.tenant_id
    and member.table_session_group_id = group_record.id
    and member.left_at is null;

  update public.table_session_groups group_table
  set state = 'separated',
      state_version = group_table.state_version + 1,
      separated_by_employee_id = session_record.employee_id,
      separated_at = clock_timestamp(),
      separation_reason = btrim(p_reason)
  where group_table.tenant_id = group_record.tenant_id
    and group_table.id = group_record.id;

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason
  )
  values (
    group_record.tenant_id,
    'employee',
    auth.uid(),
    session_record.employee_id,
    'table_group.separated',
    'table_session_group',
    group_record.id,
    btrim(p_reason)
  );
end;
$$;

create or replace function private.transfer_waiter_table(
  p_table_session_id uuid,
  p_target_employee_id uuid,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.employee_sessions%rowtype;
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
    and session.state = 'active';

  if session_record.id is null
    or nullif(btrim(p_reason), '') is null
    or not exists (
      select 1
      from public.table_sessions table_session
      join public.tables table_record
        on table_record.tenant_id = table_session.tenant_id
       and table_record.id = table_session.table_id
      where table_session.tenant_id = session_record.tenant_id
        and table_session.id = p_table_session_id
        and table_session.state = 'active'
        and table_record.venue_id = session_record.venue_id
    )
    or not exists (
      select 1
      from public.employee_sessions target_session
      join public.employee_roles role
        on role.tenant_id = target_session.tenant_id
       and role.employee_id = target_session.employee_id
       and role.role_code = 'waiter'
      where target_session.tenant_id = session_record.tenant_id
        and target_session.venue_id = session_record.venue_id
        and target_session.employee_id = p_target_employee_id
        and target_session.state = 'active'
    ) then
    raise exception 'valid active table and target waiter are required'
      using errcode = '42501';
  end if;

  update public.waiter_table_assignments assignment
  set released_at = clock_timestamp(),
      release_reason = format('Transferred: %s', btrim(p_reason))
  where assignment.tenant_id = session_record.tenant_id
    and assignment.table_session_id = p_table_session_id
    and assignment.released_at is null;

  insert into public.waiter_table_assignments (
    tenant_id,
    table_session_id,
    employee_id,
    assigned_by_employee_id
  )
  values (
    session_record.tenant_id,
    p_table_session_id,
    p_target_employee_id,
    session_record.employee_id
  );

  update public.waiter_tasks task
  set assigned_employee_id = p_target_employee_id,
      state_version = task.state_version + 1
  where task.tenant_id = session_record.tenant_id
    and task.table_session_id = p_table_session_id
    and task.status = 'pending';

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    after_data
  )
  values (
    session_record.tenant_id,
    'employee',
    auth.uid(),
    session_record.employee_id,
    'waiter.table_transferred',
    'table_session',
    p_table_session_id,
    btrim(p_reason),
    jsonb_build_object('target_employee_id', p_target_employee_id)
  );
end;
$$;

create or replace function private.close_waiter_shift(
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.employee_sessions%rowtype;
  counts jsonb;
  total_count integer;
  pending_task public.waiter_tasks%rowtype;
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
  for update;

  if session_record.id is null
    or session_record.state <> 'active'
    or session_record.state_version <> p_expected_version then
    raise exception 'stale employee session version'
      using errcode = '40001';
  end if;

  select
    count(*)::integer,
    jsonb_build_object(
      'delivery_ready',
        count(*) filter (where task.task_type = 'delivery_ready'),
      'service_request',
        count(*) filter (where task.task_type = 'service_request'),
      'waiter_payment_request',
        count(*) filter (where task.task_type = 'waiter_payment_request')
    )
  into total_count, counts
  from public.waiter_tasks task
  where task.tenant_id = session_record.tenant_id
    and task.venue_id = session_record.venue_id
    and task.status = 'pending'
    and (
      task.assigned_employee_id = session_record.employee_id
      or exists (
        select 1
        from public.employee_zone_assignments assignment
        where assignment.tenant_id = task.tenant_id
          and assignment.employee_session_id = session_record.id
          and assignment.zone_id = task.zone_id
          and assignment.released_at is null
      )
    );

  insert into public.waiter_shift_close_snapshots (
    tenant_id,
    employee_session_id,
    employee_id,
    pending_total,
    pending_by_type,
    acknowledged_by_employee
  )
  values (
    session_record.tenant_id,
    session_record.id,
    session_record.employee_id,
    total_count,
    counts,
    true
  );

  update public.employee_zone_assignments assignment
  set released_at = clock_timestamp(),
      released_reason = 'Employee closed shift'
  where assignment.tenant_id = session_record.tenant_id
    and assignment.employee_session_id = session_record.id
    and assignment.released_at is null;

  update public.waiter_table_assignments assignment
  set released_at = clock_timestamp(),
      release_reason = 'Assigned employee closed shift'
  where assignment.tenant_id = session_record.tenant_id
    and assignment.employee_id = session_record.employee_id
    and assignment.released_at is null;

  update public.waiter_tasks task
  set assigned_employee_id = null,
      state_version = task.state_version + 1
  where task.tenant_id = session_record.tenant_id
    and task.assigned_employee_id = session_record.employee_id
    and task.status = 'pending';

  update public.employee_sessions session
  set state = 'closed',
      state_version = session.state_version + 1,
      closed_at = clock_timestamp(),
      close_reason = format(
        'Closed consciously with %s pending task(s)',
        total_count
      )
  where session.tenant_id = session_record.tenant_id
    and session.id = session_record.id;

  for pending_task in
    select task.*
    from public.waiter_tasks task
    where task.tenant_id = session_record.tenant_id
      and task.venue_id = session_record.venue_id
      and task.status = 'pending'
      and not private.waiter_zone_has_coverage(
        task.tenant_id,
        task.zone_id
      )
  loop
    perform private.schedule_orphan_waiter_alert(pending_task);
  end loop;

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    before_data
  )
  values (
    session_record.tenant_id,
    'employee',
    auth.uid(),
    session_record.employee_id,
    'waiter.shift_closed_with_pending_snapshot',
    'employee_session',
    session_record.id,
    'Employee confirmed shift closure after seeing pending counts',
    jsonb_build_object(
      'pending_total', total_count,
      'pending_by_type', counts
    )
  );

  return jsonb_build_object(
    'closed', true,
    'pending_total', total_count,
    'pending_by_type', counts
  );
end;
$$;

create or replace function private.transfer_waiter_zone(
  p_zone_id uuid,
  p_target_employee_id uuid,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.employee_sessions%rowtype;
  target_session public.employee_sessions%rowtype;
  moved_table_session_id uuid;
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
    and session.state = 'active'
    and session.idle_expires_at > clock_timestamp()
    and session.absolute_expires_at > clock_timestamp();

  select *
  into target_session
  from public.employee_sessions session
  where session.tenant_id = session_record.tenant_id
    and session.venue_id = session_record.venue_id
    and session.employee_id = p_target_employee_id
    and session.employee_id <> session_record.employee_id
    and session.state = 'active'
    and session.idle_expires_at > clock_timestamp()
    and session.absolute_expires_at > clock_timestamp();

  if target_session.id is null
     or nullif(btrim(p_reason), '') is null
     or not exists (
       select 1
       from public.employee_zone_assignments assignment
       where assignment.tenant_id = session_record.tenant_id
         and assignment.employee_session_id = session_record.id
         and assignment.zone_id = p_zone_id
         and assignment.released_at is null
     )
  then
    raise exception 'valid own zone, target waiter and reason are required'
      using errcode = '22023';
  end if;

  update public.employee_zone_assignments assignment
  set released_at = clock_timestamp(),
      released_reason = btrim(p_reason)
  where assignment.tenant_id = session_record.tenant_id
    and assignment.employee_session_id = session_record.id
    and assignment.zone_id = p_zone_id
    and assignment.released_at is null;

  insert into public.employee_zone_assignments (
    tenant_id,
    employee_session_id,
    zone_id
  )
  select
    session_record.tenant_id,
    target_session.id,
    p_zone_id
  where not exists (
    select 1
    from public.employee_zone_assignments assignment
    where assignment.tenant_id = session_record.tenant_id
      and assignment.employee_session_id = target_session.id
      and assignment.zone_id = p_zone_id
      and assignment.released_at is null
  );

  for moved_table_session_id in
    select assignment.table_session_id
    from public.waiter_table_assignments assignment
    join public.table_sessions table_session
      on table_session.tenant_id = assignment.tenant_id
     and table_session.id = assignment.table_session_id
    join public.tables table_record
      on table_record.tenant_id = table_session.tenant_id
     and table_record.id = table_session.table_id
    where assignment.tenant_id = session_record.tenant_id
      and assignment.employee_id = session_record.employee_id
      and assignment.released_at is null
      and table_record.zone_id = p_zone_id
  loop
    update public.waiter_table_assignments assignment
    set released_at = clock_timestamp(),
        release_reason = btrim(p_reason)
    where assignment.tenant_id = session_record.tenant_id
      and assignment.table_session_id = moved_table_session_id
      and assignment.released_at is null;

    insert into public.waiter_table_assignments (
      tenant_id,
      table_session_id,
      employee_id,
      assigned_by_employee_id
    )
    values (
      session_record.tenant_id,
      moved_table_session_id,
      target_session.employee_id,
      session_record.employee_id
    );
  end loop;

  update public.waiter_tasks task
  set assigned_employee_id = target_session.employee_id,
      state_version = task.state_version + 1,
      updated_at = clock_timestamp()
  where task.tenant_id = session_record.tenant_id
    and task.venue_id = session_record.venue_id
    and task.zone_id = p_zone_id
    and task.assigned_employee_id = session_record.employee_id
    and task.status = 'pending';

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    after_data
  )
  values (
    session_record.tenant_id,
    'employee',
    auth.uid(),
    session_record.employee_id,
    'waiter.zone_transferred',
    'zone',
    p_zone_id,
    btrim(p_reason),
    jsonb_build_object('target_employee_id', target_session.employee_id)
  );
end;
$$;

create or replace function private.report_waiter_table_incident(
  p_table_session_id uuid,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.employee_sessions%rowtype;
  table_record record;
begin
  select *
  into session_record
  from public.employee_sessions session
  where session.id = private.current_employee_session_id()
    and session.auth_user_id = auth.uid()
    and session.state = 'active'
    and session.idle_expires_at > clock_timestamp()
    and session.absolute_expires_at > clock_timestamp();

  select
    table_session.tenant_id,
    table_record.venue_id,
    table_record.zone_id
  into table_record
  from public.table_sessions table_session
  join public.tables table_record
    on table_record.tenant_id = table_session.tenant_id
   and table_record.id = table_session.table_id
  where table_session.tenant_id = session_record.tenant_id
    and table_session.id = p_table_session_id
    and table_session.state in ('active', 'paused');

  if table_record.zone_id is null
     or nullif(btrim(p_reason), '') is null
     or not private.waiter_can_access_zone(
       table_record.tenant_id,
       table_record.venue_id,
       table_record.zone_id,
       session_record.employee_id
     )
  then
    raise exception 'table is outside the waiter scope or reason is missing'
      using errcode = '42501';
  end if;

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason
  )
  values (
    session_record.tenant_id,
    'employee',
    auth.uid(),
    session_record.employee_id,
    'waiter.table_incident_reported',
    'table_session',
    p_table_session_id,
    btrim(p_reason)
  );
end;
$$;

create function public.start_waiter_shift(
  p_tenant_id uuid,
  p_venue_id uuid,
  p_pin text,
  p_client_fingerprint_hash bytea
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.start_waiter_shift(
    p_tenant_id,
    p_venue_id,
    p_pin,
    p_client_fingerprint_hash
  );
$$;

create function public.set_waiter_zones(p_zone_ids uuid[])
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.set_waiter_zones(p_zone_ids);
$$;

create function public.resolve_waiter_task(
  p_task_id uuid,
  p_expected_version integer,
  p_resolution text,
  p_reason text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.resolve_waiter_task(
    p_task_id,
    p_expected_version,
    p_resolution,
    p_reason
  );
$$;

create function public.create_table_session_group(
  p_table_session_ids uuid[]
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_table_session_group(p_table_session_ids);
$$;

create function public.separate_table_session_group(
  p_group_id uuid,
  p_expected_version integer,
  p_reason text
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.separate_table_session_group(
    p_group_id,
    p_expected_version,
    p_reason
  );
$$;

create function public.transfer_waiter_table(
  p_table_session_id uuid,
  p_target_employee_id uuid,
  p_reason text
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transfer_waiter_table(
    p_table_session_id,
    p_target_employee_id,
    p_reason
  );
$$;

create function public.report_waiter_table_incident(
  p_table_session_id uuid,
  p_reason text
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.report_waiter_table_incident(
    p_table_session_id,
    p_reason
  );
$$;

create function public.transfer_waiter_zone(
  p_zone_id uuid,
  p_target_employee_id uuid,
  p_reason text
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transfer_waiter_zone(
    p_zone_id,
    p_target_employee_id,
    p_reason
  );
$$;

create function public.close_waiter_shift(p_expected_version integer)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.close_waiter_shift(p_expected_version);
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  selected_tenant_id uuid;
  selected_employee_session_id uuid;
  selected_employee_id uuid;
  event_user_id uuid;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  event_user_id := (event ->> 'user_id')::uuid;

  select context.tenant_id
  into selected_tenant_id
  from private.user_tenant_context context
  join public.tenant_memberships membership
    on membership.user_id = context.user_id
   and membership.tenant_id = context.tenant_id
   and membership.status = 'active'
  where context.user_id = event_user_id;

  if selected_tenant_id is null then
    select session.tenant_id, session.id, session.employee_id
    into
      selected_tenant_id,
      selected_employee_session_id,
      selected_employee_id
    from public.employee_sessions session
    where session.auth_user_id = event_user_id
      and session.state = 'active'
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
    order by session.started_at desc
    limit 1;
  end if;

  claims :=
    claims
      - 'tenant_id'
      - 'employee_session_id'
      - 'employee_id';

  if selected_tenant_id is not null then
    claims := jsonb_set(
      claims,
      '{tenant_id}',
      to_jsonb(selected_tenant_id::text),
      true
    );
  end if;
  if selected_employee_session_id is not null then
    claims := jsonb_set(
      claims,
      '{employee_session_id}',
      to_jsonb(selected_employee_session_id::text),
      true
    );
    claims := jsonb_set(
      claims,
      '{employee_id}',
      to_jsonb(selected_employee_id::text),
      true
    );
  end if;

  return jsonb_set(event, '{claims}', claims, true);
exception
  when invalid_text_representation then
    return jsonb_set(
      event,
      '{claims}',
      coalesce(event -> 'claims', '{}'::jsonb)
        - 'tenant_id'
        - 'employee_session_id'
        - 'employee_id',
      true
    );
end;
$$;

insert into public.permissions (code, description)
values
  ('waiter.tasks.read', 'Read waiter tasks in assigned or uncovered zones.'),
  ('waiter.tasks.resolve', 'Complete delivery and service tasks.'),
  ('waiter.tables.manage', 'Group, separate and transfer active tables.'),
  ('waiter.shift.manage', 'Start, configure and close own waiter shift.')
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('waiter', 'waiter.tasks.read'),
  ('waiter', 'waiter.tasks.resolve'),
  ('waiter', 'waiter.tables.manage'),
  ('waiter', 'waiter.shift.manage'),
  ('cashier_admin', 'waiter.tasks.read'),
  ('cashier_admin', 'waiter.tables.manage'),
  ('owner', 'waiter.tasks.read'),
  ('owner', 'waiter.tables.manage')
on conflict do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_waiter_settings',
    'employee_pin_attempts',
    'employee_sessions',
    'employee_zone_assignments',
    'table_session_groups',
    'table_session_group_members',
    'waiter_table_assignments',
    'waiter_tasks',
    'waiter_admin_alerts',
    'waiter_shift_close_snapshots'
  ]
  loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'alter table public.%I force row level security',
      table_name
    );
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

create policy tenant_waiter_settings_read
on public.tenant_waiter_settings for select to authenticated
using (
  (select private.has_active_employee_session(tenant_id))
  or (select private.has_permission(tenant_id, 'configuration.read'))
);

create policy employee_sessions_own_read
on public.employee_sessions for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and auth_user_id = (select auth.uid())
  and id = (select private.current_employee_session_id())
);

create policy employee_zone_assignments_own_read
on public.employee_zone_assignments for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and employee_session_id = (select private.current_employee_session_id())
);

create policy table_session_groups_waiter_read
on public.table_session_groups for select to authenticated
using (
  (select private.has_active_employee_session(tenant_id))
  or (select private.has_permission(tenant_id, 'orders.read'))
);

create policy table_session_group_members_waiter_read
on public.table_session_group_members for select to authenticated
using (
  (select private.has_active_employee_session(tenant_id))
  or (select private.has_permission(tenant_id, 'orders.read'))
);

create policy waiter_table_assignments_waiter_read
on public.waiter_table_assignments for select to authenticated
using (
  (select private.has_active_employee_session(tenant_id))
  or (select private.has_permission(tenant_id, 'orders.read'))
);

create policy waiter_tasks_scoped_read
on public.waiter_tasks for select to authenticated
using (
  (select private.waiter_can_access_zone(
    tenant_id,
    venue_id,
    zone_id,
    assigned_employee_id
  ))
  or (select private.has_permission(tenant_id, 'orders.read'))
);

create policy waiter_admin_alerts_admin_read
on public.waiter_admin_alerts for select to authenticated
using ((select private.has_permission(tenant_id, 'orders.manage')));

create policy waiter_shift_close_snapshots_own_read
on public.waiter_shift_close_snapshots for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (
    employee_session_id = (select private.current_employee_session_id())
    or (select private.has_permission(tenant_id, 'orders.manage'))
  )
);

create policy waiter_receive_private_topics
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select private.waiter_topic_authorized(realtime.topic()))
);

grant select on table
  public.tenant_waiter_settings,
  public.employee_sessions,
  public.employee_zone_assignments,
  public.table_session_groups,
  public.table_session_group_members,
  public.waiter_table_assignments,
  public.waiter_tasks,
  public.waiter_shift_close_snapshots
to authenticated;

revoke all on table public.waiter_task_queue
  from public, anon, authenticated, service_role;
grant select on table public.waiter_task_queue
  to authenticated, service_role;

revoke all on table
  public.employee_pin_attempts,
  public.waiter_admin_alerts
from anon, authenticated;

grant select on table public.waiter_admin_alerts to authenticated;

grant usage on schema private to authenticated;
grant execute on function
  private.current_employee_session_id(),
  private.has_active_employee_session(uuid),
  private.waiter_can_access_zone(uuid, uuid, uuid, uuid),
  private.waiter_topic_authorized(text)
to authenticated;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'private.start_waiter_shift(uuid,uuid,text,bytea)',
    'private.set_waiter_zones(uuid[])',
    'private.resolve_waiter_task(uuid,integer,text,text)',
    'private.create_table_session_group(uuid[])',
    'private.separate_table_session_group(uuid,integer,text)',
    'private.transfer_waiter_table(uuid,uuid,text)',
    'private.transfer_waiter_zone(uuid,uuid,text)',
    'private.report_waiter_table_incident(uuid,text)',
    'private.close_waiter_shift(integer)'
  ]
  loop
    execute format(
      'revoke execute on function %s from public, anon, service_role',
      signature
    );
    execute format(
      'grant execute on function %s to authenticated',
      signature
    );
  end loop;

  foreach signature in array array[
    'public.start_waiter_shift(uuid,uuid,text,bytea)',
    'public.set_waiter_zones(uuid[])',
    'public.resolve_waiter_task(uuid,integer,text,text)',
    'public.create_table_session_group(uuid[])',
    'public.separate_table_session_group(uuid,integer,text)',
    'public.transfer_waiter_table(uuid,uuid,text)',
    'public.transfer_waiter_zone(uuid,uuid,text)',
    'public.report_waiter_table_incident(uuid,text)',
    'public.close_waiter_shift(integer)'
  ]
  loop
    execute format(
      'revoke execute on function %s from public, anon, service_role',
      signature
    );
    execute format(
      'grant execute on function %s to authenticated',
      signature
    );
  end loop;
end;
$$;

revoke execute on function private.waiter_zone_has_coverage(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.schedule_orphan_waiter_alert(
  public.waiter_tasks
) from public, anon, authenticated;
revoke execute on function private.resolve_orphan_waiter_alert(
  uuid, uuid, text
) from public, anon, authenticated;
revoke execute on function private.broadcast_waiter_task_change()
  from public, anon, authenticated;
revoke execute on function private.snapshot_waiter_payment_request()
  from public, anon, authenticated;
revoke execute on function private.materialize_waiter_task_from_ticket()
  from public, anon, authenticated;
revoke execute on function private.materialize_waiter_task_from_service()
  from public, anon, authenticated;
revoke execute on function private.materialize_waiter_task_from_payment()
  from public, anon, authenticated;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated, service_role;

create trigger tenant_waiter_settings_set_updated_at
before update on public.tenant_waiter_settings
for each row execute function private.set_updated_at();

create trigger employee_sessions_set_updated_at
before update on public.employee_sessions
for each row execute function private.set_updated_at();

create trigger waiter_tasks_set_updated_at
before update on public.waiter_tasks
for each row execute function private.set_updated_at();

create trigger employee_pin_attempts_append_only
before update or delete on public.employee_pin_attempts
for each row execute function private.prevent_financial_evidence_mutation();

create trigger waiter_shift_close_snapshots_append_only
before update or delete on public.waiter_shift_close_snapshots
for each row execute function private.prevent_financial_evidence_mutation();

comment on function private.start_waiter_shift(uuid, uuid, text, bytea) is
  'Validates a hashed employee PIN with throttling. Requires auth.uid and never grants payment capabilities.';

comment on function private.resolve_waiter_task(uuid, integer, text, text) is
  'Versioned operational completion. A waiter can only deliver READY tickets or attend/dismiss service tasks.';
