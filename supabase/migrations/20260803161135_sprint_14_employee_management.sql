-- Tarea 4 (Equipo): the owner needs to create staff and reset PINs from the
-- app. `employees.employee_pin_hash` must never be computed client-side —
-- only Postgres ever sees the raw PIN, hashed here with the same
-- extensions.crypt()/bcrypt scheme sprint_05's PIN verification already
-- relies on. Listing/activating/suspending staff needs no new RPC: RLS
-- already allows it directly (employees_select_own_tenant on 'staff.read',
-- employees_update_with_permission on 'staff.manage').

create or replace function private.create_employee(
  p_display_name text,
  p_pin text,
  p_role_codes text[],
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  employee_id uuid;
  role_code text;
begin
  if not private.has_permission(tenant, 'staff.manage') then
    raise exception 'staff management permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_display_name), '') is null then
    raise exception 'display name is required' using errcode = '22023';
  end if;
  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'pin must be 4 to 8 digits' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if p_role_codes is null or array_length(p_role_codes, 1) is null then
    raise exception 'at least one role is required' using errcode = '22023';
  end if;

  insert into public.employees (tenant_id, display_name, status, employee_pin_hash)
  values (
    tenant,
    btrim(p_display_name),
    'active',
    extensions.crypt(p_pin, extensions.gen_salt('bf'))
  )
  returning id into employee_id;

  foreach role_code in array p_role_codes loop
    insert into public.employee_roles (tenant_id, employee_id, role_code)
    values (tenant, employee_id, role_code);
  end loop;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data
  )
  values (
    tenant, 'user', auth.uid(), 'staff.created', 'employee',
    employee_id, btrim(p_reason),
    jsonb_build_object('display_name', btrim(p_display_name), 'role_codes', p_role_codes)
  );

  return employee_id;
end;
$$;

create or replace function public.create_employee(
  p_display_name text,
  p_pin text,
  p_role_codes text[],
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_employee(p_display_name, p_pin, p_role_codes, p_reason);
$$;

revoke execute on function public.create_employee(text, text, text[], text) from public, anon;
grant execute on function public.create_employee(text, text, text[], text) to authenticated;
revoke execute on function private.create_employee(text, text, text[], text) from public, anon, authenticated;
grant execute on function private.create_employee(text, text, text[], text) to authenticated;

create or replace function private.set_employee_pin(
  p_employee_id uuid,
  p_pin text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  updated_id uuid;
begin
  if not private.has_permission(tenant, 'staff.manage') then
    raise exception 'staff management permission required' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'pin must be 4 to 8 digits' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  update public.employees
  set employee_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      updated_at = clock_timestamp()
  where tenant_id = tenant and id = p_employee_id
  returning id into updated_id;

  if updated_id is null then
    raise exception 'employee not found' using errcode = '22023';
  end if;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason
  )
  values (
    tenant, 'user', auth.uid(), 'staff.pin_reset', 'employee',
    p_employee_id, btrim(p_reason)
  );
end;
$$;

create or replace function public.set_employee_pin(
  p_employee_id uuid,
  p_pin text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_employee_pin(p_employee_id, p_pin, p_reason);
$$;

revoke execute on function public.set_employee_pin(uuid, text, text) from public, anon;
grant execute on function public.set_employee_pin(uuid, text, text) to authenticated;
revoke execute on function private.set_employee_pin(uuid, text, text) from public, anon, authenticated;
grant execute on function private.set_employee_pin(uuid, text, text) to authenticated;
