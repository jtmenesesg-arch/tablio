-- Harden privileged functions reported by Supabase Security Advisor.

alter table private.user_tenant_context enable row level security;
alter table private.user_tenant_context force row level security;

-- Older hosted projects could contain this platform helper while a clean local
-- Supabase stack does not. Hardening must be reproducible in both cases.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() '
      || 'from public, anon, authenticated, service_role';
  end if;
end;
$$;

create or replace function private.set_active_tenant(p_tenant_id uuid)
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

revoke execute on function private.set_active_tenant(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.set_active_tenant(uuid) to authenticated;

create or replace function public.set_active_tenant(p_tenant_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.set_active_tenant(p_tenant_id);
$$;

revoke execute on function public.set_active_tenant(uuid)
  from public, anon, service_role;
grant execute on function public.set_active_tenant(uuid) to authenticated;

-- Cover foreign keys reported by Supabase Performance Advisor.

create index if not exists user_tenant_context_tenant_idx
  on private.user_tenant_context (tenant_id);

create index if not exists audit_log_actor_user_idx
  on public.audit_log (actor_user_id)
  where actor_user_id is not null;

create index if not exists audit_log_actor_employee_idx
  on public.audit_log (tenant_id, actor_employee_id)
  where actor_employee_id is not null;

create index if not exists employee_roles_role_code_idx
  on public.employee_roles (role_code);

create index if not exists employees_auth_user_idx
  on public.employees (auth_user_id)
  where auth_user_id is not null;

create index if not exists role_permissions_permission_code_idx
  on public.role_permissions (permission_code);

create index if not exists tables_tenant_venue_idx
  on public.tables (tenant_id, venue_id);

create index if not exists tenant_memberships_role_code_idx
  on public.tenant_memberships (role_code);

create index if not exists tenant_memberships_employee_idx
  on public.tenant_memberships (tenant_id, employee_id)
  where employee_id is not null;

comment on function private.set_active_tenant(uuid) is
  'Privileged implementation: validates auth.uid and active membership before changing tenant context.';

comment on function public.set_active_tenant(uuid) is
  'Authenticated SECURITY INVOKER RPC delegating to a private validated implementation.';
