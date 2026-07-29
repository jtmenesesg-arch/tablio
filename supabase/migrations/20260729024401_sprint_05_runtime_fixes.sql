-- Sprint 5 runtime fixes found by remote plpgsql_check.

-- PostgreSQL resolves CURRENT_TIME as a SQL keyword inside embedded statements,
-- even though PL/pgSQL accepted it as a variable declaration. Preserve the
-- already-reviewed function bodies and rename that local clock mechanically.
do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'private.start_waiter_shift(uuid,uuid,text,bytea)'::regprocedure
  )
  into function_definition;
  execute replace(function_definition, 'current_time', 'v_now');

  select pg_get_functiondef(
    'private.resolve_waiter_task(uuid,integer,text,text)'::regprocedure
  )
  into function_definition;
  execute replace(function_definition, 'current_time', 'v_now');
end;
$migration$;

-- The Auth Hook checks session expiry. A function that reads the wall clock is
-- correctly VOLATILE; marking it STABLE made its declared contract false.
alter function public.custom_access_token_hook(jsonb) volatile;

-- Keep the selected record name distinct from the joined table alias so
-- plpgsql_check and PostgreSQL can resolve both deterministically.
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
  selected_table record;
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
    table_row.venue_id,
    table_row.zone_id
  into selected_table
  from public.table_sessions table_session
  join public.tables table_row
    on table_row.tenant_id = table_session.tenant_id
   and table_row.id = table_session.table_id
  where table_session.tenant_id = session_record.tenant_id
    and table_session.id = p_table_session_id
    and table_session.state in ('active', 'paused');

  if selected_table.zone_id is null
     or nullif(btrim(p_reason), '') is null
     or not private.waiter_can_access_zone(
       selected_table.tenant_id,
       selected_table.venue_id,
       selected_table.zone_id,
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
