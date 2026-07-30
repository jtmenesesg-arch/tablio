-- Keep platform RPCs callable by authenticated superadmins without exposing
-- SECURITY DEFINER functions from the public API schema.

create or replace function private.platform_stored_value_liabilities()
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
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.platform_stored_value_liabilities();
$$;

create or replace function private.platform_set_stored_value_alert_threshold(
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
    jsonb_build_object('threshold_clp', p_threshold_clp, 'changed_by_platform', true)
  );
end;
$$;

create or replace function public.superadmin_set_stored_value_alert_threshold(
  p_tenant_id uuid,
  p_threshold_clp bigint,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.platform_set_stored_value_alert_threshold(
    p_tenant_id, p_threshold_clp, p_reason
  );
$$;

revoke all on function
  private.platform_stored_value_liabilities(),
  private.platform_set_stored_value_alert_threshold(uuid,bigint,text)
from public, anon, authenticated;
grant execute on function
  private.platform_stored_value_liabilities(),
  private.platform_set_stored_value_alert_threshold(uuid,bigint,text)
to authenticated;

revoke all on function
  public.superadmin_stored_value_liabilities(),
  public.superadmin_set_stored_value_alert_threshold(uuid,bigint,text)
from public, anon, authenticated;
grant execute on function
  public.superadmin_stored_value_liabilities(),
  public.superadmin_set_stored_value_alert_threshold(uuid,bigint,text)
to authenticated;
