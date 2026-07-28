begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- Intenta cerrar el sprint sin las tablas durables. Si falla, la pantalla o
-- la impresora dependerían de memoria transitoria.
select has_table('public', 'tenant_kds_settings', 'KDS settings exist');
select has_table('public', 'kds_clients', 'persistent KDS clients exist');
select has_table(
  'public',
  'kds_delivery_metrics',
  'KDS delivery metrics exist'
);
select has_table('public', 'printer_endpoints', 'printer endpoints exist');
select has_table('public', 'print_jobs', 'persistent print jobs exist');
select has_table('public', 'print_attempts', 'print attempts exist');

-- Intenta dejar una carrera sin versión. Si falla, dos pantallas podrían
-- sobrescribirse sin detectar el conflicto.
select has_column('public', 'tickets', 'state_version', 'tickets are versioned');
select has_function(
  'public',
  'transition_ticket',
  array['uuid', 'text', 'integer', 'text'],
  'ticket transition RPC exists'
);

-- Intenta mezclar tiempo muerto con latencia real. Si falla, no se podría
-- separar una tablet apagada de una entrega lenta.
select has_column(
  'public',
  'kds_delivery_metrics',
  'kds_connected_at_confirmation',
  'metric captures connection at confirmation'
);
select has_column(
  'public',
  'kds_delivery_metrics',
  'first_visible_at',
  'metric captures first visible time'
);
select has_column(
  'public',
  'kds_delivery_metrics',
  'latency_ms',
  'metric stores server-clock latency'
);
select has_view(
  'public',
  'kds_latency_summary',
  'latency summary exposes p50 p95 p99 and absent screens'
);

-- Intenta hacer configuraciones operativas rígidas. Si falla, los umbrales o
-- el sondeo quedarían hardcodeados para todos los locales.
select col_default_is(
  'public',
  'tenant_kds_settings',
  'reconciliation_interval_seconds',
  '45',
  'safety reconciliation defaults to 45 seconds'
);
select col_default_is(
  'public',
  'tenant_kds_settings',
  'warning_after_seconds',
  '75',
  'stale-screen warning defaults to 75 seconds'
);
select col_default_is(
  'public',
  'tenant_kds_settings',
  'presence_timeout_seconds',
  '30',
  'presence timeout defaults to 30 seconds'
);

-- Intenta exponer operaciones privilegiadas al cliente anónimo. Si falla, un
-- tercero podría mover comandas o cambiar disponibilidad.
select ok(
  not has_function_privilege(
    'anon',
    'public.transition_ticket(uuid,text,integer,text)',
    'EXECUTE'
  ),
  'anon cannot transition tickets'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_product_availability(uuid,boolean,text)',
    'EXECUTE'
  ),
  'anon cannot mark products sold out'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.materialize_print_jobs(uuid,uuid)',
    'EXECUTE'
  ),
  'user routes cannot materialize print jobs'
);
select ok(
  has_function_privilege(
    'service_role',
    'private.materialize_print_jobs(uuid,uuid)',
    'EXECUTE'
  ),
  'durable worker can materialize print jobs'
);
select ok(
  not has_table_privilege('authenticated', 'public.tickets', 'UPDATE'),
  'authenticated users cannot bypass the versioned ticket RPC'
);

-- Intenta dejar tablas nuevas fuera de RLS. Si falla, una comanda o métrica
-- podría cruzar entre bares.
select is(
  (
    select count(*)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'tenant_kds_settings', 'kds_clients', 'kds_delivery_metrics',
        'printer_endpoints', 'print_jobs', 'print_attempts'
      )
      and class.relrowsecurity
      and class.relforcerowsecurity
  ),
  6::bigint,
  'all Sprint 4 public tables enable and force RLS'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'kds_receive_private_topics'
  ),
  'private KDS Realtime topics have an authorization policy'
);

insert into auth.users (id, email)
values
  ('d2000000-0000-4000-8000-000000000001', 'kds-a@test.local'),
  ('d2000000-0000-4000-8000-000000000002', 'kds-b@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'KDS A SpA', 'KDS A', 'kds-a-test', 'active'
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'KDS B SpA', 'KDS B', 'kds-b-test', 'active'
  );

insert into public.venues (id, tenant_id, code, name)
values
  (
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001', 'main', 'Local A'
  ),
  (
    'd3000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002', 'main', 'Local B'
  );

insert into public.stations (
  id, tenant_id, venue_id, code, name, station_type
)
values
  (
    'd6000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'bar', 'Barra A', 'bar'
  ),
  (
    'd6000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000002',
    'bar', 'Barra B', 'bar'
  );

insert into public.tenant_memberships (tenant_id, user_id, role_code, status)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'kds', 'active'
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002',
    'kds', 'active'
  );

insert into public.tenant_kds_settings (tenant_id)
values
  ('d1000000-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000002');

insert into public.kds_clients (
  id, tenant_id, venue_id, station_id, auth_user_id
)
values
  (
    'dd000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    'dd000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000002',
    'd6000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'd2000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', 'd1000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta mostrar una pantalla del tenant B. Si falla, la barra A podría ver
-- pedidos, presencia o métricas operativas de otro comercio.
select is(
  (select count(*) from public.tenant_kds_settings),
  1::bigint,
  'KDS tenant A sees only its own settings'
);
select is(
  (select count(*) from public.kds_clients),
  1::bigint,
  'KDS tenant A sees only its own connected clients'
);
select is(
  (
    select count(*) from public.kds_clients
    where tenant_id <> 'd1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'KDS tenant A cannot read tenant B client rows'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'd2000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

-- Intenta abrir datos sin tenant_id. Si falla, una request incompleta quedaría
-- abierta y el aislamiento sería decorativo.
select is(
  (select count(*) from public.kds_clients),
  0::bigint,
  'KDS request without tenant claim fails closed'
);

reset role;

select * from finish();
rollback;
