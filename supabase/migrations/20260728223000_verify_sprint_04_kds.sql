-- Verificación remota de Sprint 4 sin Docker. Esta migración falla y revierte
-- completa si estructura, privilegios o policies no cumplen. No crea usuarios
-- ni datos de negocio. El fail-closed dinámico vive en la suite pgTAP.

do $$
declare
  forced_rls_count integer;
begin
  if to_regclass('public.tenant_kds_settings') is null
    or to_regclass('public.kds_clients') is null
    or to_regclass('public.kds_delivery_metrics') is null
    or to_regclass('public.printer_endpoints') is null
    or to_regclass('public.print_jobs') is null
    or to_regclass('public.print_attempts') is null
    or to_regclass('public.kds_latency_summary') is null then
    raise exception 'Sprint 4 durable schema is incomplete';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tickets'
      and column_name = 'state_version'
  ) then
    raise exception 'Ticket optimistic version is missing';
  end if;

  if to_regprocedure('public.transition_ticket(uuid,text,integer,text)') is null
    or to_regprocedure('public.set_product_availability(uuid,boolean,text)') is null
    or to_regprocedure('private.materialize_print_jobs(uuid,uuid)') is null then
    raise exception 'Sprint 4 RPC contract is incomplete';
  end if;

  if has_function_privilege(
    'anon',
    'public.transition_ticket(uuid,text,integer,text)',
    'EXECUTE'
  ) then
    raise exception 'anon can transition tickets';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.materialize_print_jobs(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can materialize print jobs';
  end if;

  if not has_function_privilege(
    'service_role',
    'private.materialize_print_jobs(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot materialize print jobs';
  end if;

  if has_table_privilege('authenticated', 'public.tickets', 'UPDATE') then
    raise exception 'authenticated can bypass versioned ticket transition';
  end if;

  select count(*)
  into forced_rls_count
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname in (
      'tenant_kds_settings',
      'kds_clients',
      'kds_delivery_metrics',
      'printer_endpoints',
      'print_jobs',
      'print_attempts'
    )
    and class.relrowsecurity
    and class.relforcerowsecurity;

  if forced_rls_count <> 6 then
    raise exception 'Expected 6 Sprint 4 tables with forced RLS, got %',
      forced_rls_count;
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'tenant_kds_settings',
        'kds_clients',
        'kds_delivery_metrics',
        'printer_endpoints',
        'print_jobs',
        'print_attempts'
      )
      and cmd = 'SELECT'
      and qual like '%current_tenant_id%'
      and qual like '%has_permission%'
  ) <> 6 then
    raise exception 'Every Sprint 4 table must use authorized tenant RLS';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'kds_receive_private_topics'
  ) then
    raise exception 'Private KDS Realtime receive policy is missing';
  end if;
end;
$$;
