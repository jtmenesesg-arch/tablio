-- Sprint 0: configurable multi-tenant foundation with fail-closed RLS.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

create table public.roles (
  code text primary key,
  display_name text not null check (btrim(display_name) <> ''),
  scope text not null check (scope in ('tenant', 'platform')),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.permissions (
  code text primary key,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_code text not null references public.roles (code) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_code, permission_code)
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (btrim(legal_name) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'onboarding'
    check (status in ('onboarding', 'active', 'suspended', 'closed')),
  plan_code text,
  venue_type text not null default 'hospitality' check (btrim(venue_type) <> ''),
  timezone text not null default 'America/Santiago' check (btrim(timezone) <> ''),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'ready', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  address jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  timezone text not null default 'America/Santiago' check (btrim(timezone) <> ''),
  service_modes text[] not null default '{}'::text[],
  active boolean not null default true,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'ready', 'blocked')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  zone_type text not null default 'general' check (btrim(zone_type) <> ''),
  capacity integer check (capacity is null or capacity >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  plan_countable boolean not null default true,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, venue_id, code),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  zone_id uuid not null,
  table_number text not null check (btrim(table_number) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  capacity integer check (capacity is null or capacity > 0),
  service_mode text check (service_mode is null or btrim(service_mode) <> ''),
  qr_token_hash bytea not null unique check (octet_length(qr_token_hash) >= 32),
  qr_version integer not null default 1 check (qr_version > 0),
  qr_active boolean not null default true,
  presence_mode text not null default 'optional'
    check (presence_mode in ('disabled', 'optional', 'required')),
  presence_code_hash bytea
    check (presence_code_hash is null or octet_length(presence_code_hash) >= 32),
  presence_code_expires_at timestamptz,
  active boolean not null default true,
  plan_countable boolean not null default true,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, table_number),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete restrict
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  station_type text not null check (btrim(station_type) <> ''),
  routing_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(routing_config) = 'object'),
  active boolean not null default true,
  plan_countable boolean not null default true,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, venue_id, code),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  auth_user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (btrim(display_name) <> ''),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'inactive')),
  employee_pin_hash text not null check (length(employee_pin_hash) >= 20),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_pin_hash)
);

create unique index employees_tenant_auth_user_uidx
  on public.employees (tenant_id, auth_user_id)
  where auth_user_id is not null;

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id uuid,
  role_code text not null references public.roles (code) on delete restrict,
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete set null (employee_id)
);

create table public.employee_roles (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null,
  role_code text not null references public.roles (code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (tenant_id, employee_id, role_code),
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete cascade
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  actor_type text not null check (actor_type in ('user', 'employee', 'worker', 'platform')),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_employee_id uuid,
  action text not null check (btrim(action) <> ''),
  target_type text not null check (btrim(target_type) <> ''),
  target_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete set null (actor_employee_id)
);

create table private.user_tenant_context (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index venues_tenant_idx on public.venues (tenant_id);
create index zones_tenant_venue_idx on public.zones (tenant_id, venue_id);
create index tables_tenant_zone_idx on public.tables (tenant_id, zone_id);
create index stations_tenant_venue_idx on public.stations (tenant_id, venue_id);
create index employees_tenant_idx on public.employees (tenant_id);
create index tenant_memberships_user_idx
  on public.tenant_memberships (user_id, tenant_id)
  where status = 'active';
create index audit_log_tenant_occurred_idx
  on public.audit_log (tenant_id, occurred_at desc);

insert into public.roles (code, display_name, scope, description)
values
  ('diner', 'Comensal', 'tenant', 'Persona que consulta, pide y paga lo suyo.'),
  ('waiter', 'Garzón', 'tenant', 'Personal de atención y entrega, sin escritura financiera.'),
  ('kds', 'KDS', 'tenant', 'Identidad operativa de una pantalla de producción.'),
  ('cashier_admin', 'Cajero/Admin', 'tenant', 'Operación, configuración y control del turno.'),
  ('owner', 'Dueño', 'tenant', 'Administración completa de su tenant.'),
  ('superadmin', 'Superadmin', 'platform', 'Administración de plataforma con auditoría.')
on conflict (code) do update
set display_name = excluded.display_name,
    scope = excluded.scope,
    description = excluded.description;

insert into public.permissions (code, description)
values
  ('tenant.read', 'Leer identidad y configuración general del tenant.'),
  ('tenant.manage', 'Modificar identidad y configuración general del tenant.'),
  ('configuration.read', 'Leer venues, zonas, mesas y estaciones.'),
  ('configuration.manage', 'Crear y modificar venues, zonas, mesas y estaciones.'),
  ('staff.read', 'Leer personal y roles del tenant.'),
  ('staff.manage', 'Crear y modificar personal y roles del tenant.'),
  ('memberships.read', 'Leer membresías autenticadas del tenant.'),
  ('memberships.manage', 'Crear, suspender o revocar membresías.'),
  ('audit.read', 'Leer auditoría del tenant.'),
  ('assets.read', 'Leer archivos privados del tenant.'),
  ('assets.manage', 'Crear, modificar y borrar archivos privados del tenant.')
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('waiter', 'tenant.read'),
  ('waiter', 'configuration.read'),
  ('kds', 'tenant.read'),
  ('kds', 'configuration.read'),
  ('cashier_admin', 'tenant.read'),
  ('cashier_admin', 'configuration.read'),
  ('cashier_admin', 'configuration.manage'),
  ('cashier_admin', 'staff.read'),
  ('cashier_admin', 'staff.manage'),
  ('cashier_admin', 'memberships.read'),
  ('cashier_admin', 'audit.read'),
  ('cashier_admin', 'assets.read'),
  ('cashier_admin', 'assets.manage'),
  ('owner', 'tenant.read'),
  ('owner', 'tenant.manage'),
  ('owner', 'configuration.read'),
  ('owner', 'configuration.manage'),
  ('owner', 'staff.read'),
  ('owner', 'staff.manage'),
  ('owner', 'memberships.read'),
  ('owner', 'memberships.manage'),
  ('owner', 'audit.read'),
  ('owner', 'assets.read'),
  ('owner', 'assets.manage'),
  ('superadmin', 'tenant.read'),
  ('superadmin', 'tenant.manage'),
  ('superadmin', 'configuration.read'),
  ('superadmin', 'configuration.manage'),
  ('superadmin', 'staff.read'),
  ('superadmin', 'staff.manage'),
  ('superadmin', 'memberships.read'),
  ('superadmin', 'memberships.manage'),
  ('superadmin', 'audit.read'),
  ('superadmin', 'assets.read'),
  ('superadmin', 'assets.manage')
on conflict do nothing;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function private.set_updated_at();

create trigger venues_set_updated_at
before update on public.venues
for each row execute function private.set_updated_at();

create trigger zones_set_updated_at
before update on public.zones
for each row execute function private.set_updated_at();

create trigger tables_set_updated_at
before update on public.tables
for each row execute function private.set_updated_at();

create trigger stations_set_updated_at
before update on public.stations
for each row execute function private.set_updated_at();

create trigger employees_set_updated_at
before update on public.employees
for each row execute function private.set_updated_at();

create trigger tenant_memberships_set_updated_at
before update on public.tenant_memberships
for each row execute function private.set_updated_at();

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '55000';
end;
$$;

create trigger audit_log_prevent_mutation
before update or delete on public.audit_log
for each row execute function private.prevent_audit_mutation();

create or replace function private.current_tenant_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  raw_tenant_id text;
begin
  raw_tenant_id := auth.jwt() ->> 'tenant_id';

  if raw_tenant_id is null or btrim(raw_tenant_id) = '' then
    return null;
  end if;

  return raw_tenant_id::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.has_active_membership(p_tenant_id uuid)
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
      from public.tenant_memberships membership
      where membership.tenant_id = p_tenant_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    );
$$;

create or replace function private.has_permission(
  p_tenant_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_active_membership(p_tenant_id)
    and exists (
      select 1
      from public.tenant_memberships membership
      join public.role_permissions granted_permission
        on granted_permission.role_code = membership.role_code
      where membership.tenant_id = p_tenant_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
        and granted_permission.permission_code = p_permission_code
    );
$$;

create or replace function private.require_tenant_context()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
begin
  selected_tenant_id := private.current_tenant_id();

  if selected_tenant_id is null
     or not private.has_active_membership(selected_tenant_id) then
    raise exception 'active tenant context is required'
      using errcode = '42501';
  end if;

  perform set_config(
    'app.current_tenant_id',
    selected_tenant_id::text,
    true
  );

  return selected_tenant_id;
end;
$$;

create or replace function public.set_active_tenant(p_tenant_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid;
begin
  requesting_user_id := auth.uid();

  if requesting_user_id is null then
    raise exception 'authentication is required'
      using errcode = '42501';
  end if;

  if p_tenant_id is null or not exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = requesting_user_id
      and membership.status = 'active'
  ) then
    raise exception 'active tenant membership is required'
      using errcode = '42501';
  end if;

  insert into private.user_tenant_context (user_id, tenant_id, updated_at)
  values (requesting_user_id, p_tenant_id, now())
  on conflict (user_id) do update
  set tenant_id = excluded.tenant_id,
      updated_at = excluded.updated_at;
end;
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
    claims := claims - 'tenant_id';
  else
    claims := jsonb_set(
      claims,
      '{tenant_id}',
      to_jsonb(selected_tenant_id::text),
      true
    );
  end if;

  return jsonb_set(event, '{claims}', claims, true);
exception
  when invalid_text_representation then
    return jsonb_set(
      event,
      '{claims}',
      coalesce(event -> 'claims', '{}'::jsonb) - 'tenant_id',
      true
    );
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_tenant_id() to authenticated;
grant execute on function private.has_active_membership(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.require_tenant_context() to authenticated;

revoke execute on function public.set_active_tenant(uuid) from public, anon;
grant execute on function public.set_active_tenant(uuid) to authenticated;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;

alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.tenants enable row level security;
alter table public.tenants force row level security;
alter table public.venues enable row level security;
alter table public.venues force row level security;
alter table public.zones enable row level security;
alter table public.zones force row level security;
alter table public.tables enable row level security;
alter table public.tables force row level security;
alter table public.stations enable row level security;
alter table public.stations force row level security;
alter table public.employees enable row level security;
alter table public.employees force row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_memberships force row level security;
alter table public.employee_roles enable row level security;
alter table public.employee_roles force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

create policy roles_select_authenticated
on public.roles
for select
to authenticated
using (
  (select private.has_active_membership(private.current_tenant_id()))
);

create policy permissions_select_authenticated
on public.permissions
for select
to authenticated
using (
  (select private.has_active_membership(private.current_tenant_id()))
);

create policy role_permissions_select_authenticated
on public.role_permissions
for select
to authenticated
using (
  (select private.has_active_membership(private.current_tenant_id()))
);

create policy tenants_select_own_tenant
on public.tenants
for select
to authenticated
using ((select private.has_active_membership(id)));

create policy tenants_update_with_permission
on public.tenants
for update
to authenticated
using ((select private.has_permission(id, 'tenant.manage')))
with check ((select private.has_permission(id, 'tenant.manage')));

create policy venues_select_own_tenant
on public.venues
for select
to authenticated
using ((select private.has_active_membership(tenant_id)));

create policy venues_insert_with_permission
on public.venues
for insert
to authenticated
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy venues_update_with_permission
on public.venues
for update
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')))
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy venues_delete_with_permission
on public.venues
for delete
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy zones_select_own_tenant
on public.zones
for select
to authenticated
using ((select private.has_active_membership(tenant_id)));

create policy zones_insert_with_permission
on public.zones
for insert
to authenticated
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy zones_update_with_permission
on public.zones
for update
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')))
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy zones_delete_with_permission
on public.zones
for delete
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy tables_select_own_tenant
on public.tables
for select
to authenticated
using ((select private.has_active_membership(tenant_id)));

create policy tables_insert_with_permission
on public.tables
for insert
to authenticated
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy tables_update_with_permission
on public.tables
for update
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')))
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy tables_delete_with_permission
on public.tables
for delete
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy stations_select_own_tenant
on public.stations
for select
to authenticated
using ((select private.has_active_membership(tenant_id)));

create policy stations_insert_with_permission
on public.stations
for insert
to authenticated
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy stations_update_with_permission
on public.stations
for update
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')))
with check ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy stations_delete_with_permission
on public.stations
for delete
to authenticated
using ((select private.has_permission(tenant_id, 'configuration.manage')));

create policy employees_select_own_tenant
on public.employees
for select
to authenticated
using (
  (select private.has_permission(tenant_id, 'staff.read'))
  or (
    auth_user_id = (select auth.uid())
    and (select private.has_active_membership(tenant_id))
  )
);

create policy employees_insert_with_permission
on public.employees
for insert
to authenticated
with check ((select private.has_permission(tenant_id, 'staff.manage')));

create policy employees_update_with_permission
on public.employees
for update
to authenticated
using ((select private.has_permission(tenant_id, 'staff.manage')))
with check ((select private.has_permission(tenant_id, 'staff.manage')));

create policy employees_delete_with_permission
on public.employees
for delete
to authenticated
using ((select private.has_permission(tenant_id, 'staff.manage')));

create policy memberships_select_own_tenant
on public.tenant_memberships
for select
to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select private.has_active_membership(tenant_id))
  )
  or (select private.has_permission(tenant_id, 'memberships.read'))
);

create policy memberships_insert_with_permission
on public.tenant_memberships
for insert
to authenticated
with check ((select private.has_permission(tenant_id, 'memberships.manage')));

create policy memberships_update_with_permission
on public.tenant_memberships
for update
to authenticated
using ((select private.has_permission(tenant_id, 'memberships.manage')))
with check ((select private.has_permission(tenant_id, 'memberships.manage')));

create policy memberships_delete_with_permission
on public.tenant_memberships
for delete
to authenticated
using ((select private.has_permission(tenant_id, 'memberships.manage')));

create policy employee_roles_select_own_tenant
on public.employee_roles
for select
to authenticated
using ((select private.has_active_membership(tenant_id)));

create policy employee_roles_insert_with_permission
on public.employee_roles
for insert
to authenticated
with check ((select private.has_permission(tenant_id, 'staff.manage')));

create policy employee_roles_update_with_permission
on public.employee_roles
for update
to authenticated
using ((select private.has_permission(tenant_id, 'staff.manage')))
with check ((select private.has_permission(tenant_id, 'staff.manage')));

create policy employee_roles_delete_with_permission
on public.employee_roles
for delete
to authenticated
using ((select private.has_permission(tenant_id, 'staff.manage')));

create policy audit_log_select_with_permission
on public.audit_log
for select
to authenticated
using ((select private.has_permission(tenant_id, 'audit.read')));

revoke all on table public.roles from anon, authenticated;
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;
revoke all on table public.tenants from anon, authenticated;
revoke all on table public.venues from anon, authenticated;
revoke all on table public.zones from anon, authenticated;
revoke all on table public.tables from anon, authenticated;
revoke all on table public.stations from anon, authenticated;
revoke all on table public.employees from anon, authenticated;
revoke all on table public.tenant_memberships from anon, authenticated;
revoke all on table public.employee_roles from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;

grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;
grant select, update on table public.tenants to authenticated;
grant select, insert, update, delete on table public.venues to authenticated;
grant select, insert, update, delete on table public.zones to authenticated;
grant select, insert, update, delete on table public.tables to authenticated;
grant select, insert, update, delete on table public.stations to authenticated;
grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.tenant_memberships to authenticated;
grant select, insert, update, delete on table public.employee_roles to authenticated;
grant select on table public.audit_log to authenticated;

create or replace view public.tenant_size_metrics
with (security_invoker = true)
as
select
  tenant.id as tenant_id,
  (
    select count(*)
    from public.venues venue
    where venue.tenant_id = tenant.id
      and venue.active
  ) as active_venues,
  (
    select count(*)
    from public.zones zone
    where zone.tenant_id = tenant.id
      and zone.active
      and zone.plan_countable
  ) as active_zones,
  (
    select count(*)
    from public.tables service_table
    where service_table.tenant_id = tenant.id
      and service_table.active
      and service_table.plan_countable
  ) as active_tables,
  (
    select count(*)
    from public.stations station
    where station.tenant_id = tenant.id
      and station.active
      and station.plan_countable
  ) as active_stations
from public.tenants tenant;

revoke all on table public.tenant_size_metrics from anon, authenticated;
grant select on table public.tenant_size_metrics to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('tenant-assets', 'tenant-assets', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy tenant_assets_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] = private.current_tenant_id()::text
  and private.has_permission(private.current_tenant_id(), 'assets.read')
);

create policy tenant_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] = private.current_tenant_id()::text
  and private.has_permission(private.current_tenant_id(), 'assets.manage')
);

create policy tenant_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] = private.current_tenant_id()::text
  and private.has_permission(private.current_tenant_id(), 'assets.manage')
)
with check (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] = private.current_tenant_id()::text
  and private.has_permission(private.current_tenant_id(), 'assets.manage')
);

create policy tenant_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tenant-assets'
  and (storage.foldername(name))[1] = private.current_tenant_id()::text
  and private.has_permission(private.current_tenant_id(), 'assets.manage')
);

comment on schema private is
  'Non-exposed helpers and tenant context. Never add to PostgREST exposed schemas.';
comment on function private.current_tenant_id() is
  'Fail-closed active tenant UUID extracted from the signed JWT claim.';
comment on function private.require_tenant_context() is
  'Validates active membership and sets app.current_tenant_id transaction-locally.';
comment on function public.custom_access_token_hook(jsonb) is
  'Supabase Auth hook that adds one validated active tenant_id to issued JWTs.';
comment on view public.tenant_size_metrics is
  'RLS-aware counts used by onboarding and future size-based plan classification.';
