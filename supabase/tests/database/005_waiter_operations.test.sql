begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- Intenta cerrar el sprint sin estado durable. Si falla, un reinicio podría
-- borrar turnos, cobertura, grupos o tareas pendientes.
select has_table('public', 'tenant_waiter_settings', 'waiter settings exist');
select has_table('public', 'employee_sessions', 'employee sessions exist');
select has_table(
  'public',
  'employee_zone_assignments',
  'waiter zone assignments exist'
);
select has_table('public', 'waiter_tasks', 'durable waiter tasks exist');
select has_table(
  'public',
  'table_session_groups',
  'operational table groups exist'
);
select has_table(
  'public',
  'table_session_group_members',
  'group membership exists'
);
select has_table(
  'public',
  'waiter_admin_alerts',
  'durable orphan-task alerts exist'
);
select has_table(
  'public',
  'waiter_shift_close_snapshots',
  'shift-close snapshots exist'
);

-- Intenta dejar prioridades o sesiones rígidas. Si falla, cada tenant no
-- podría adaptar el panel a su operación real.
select col_default_is(
  'public',
  'tenant_waiter_settings',
  'absolute_critical_after_seconds',
  '720',
  'absolute starvation ceiling defaults to 12 minutes'
);
select col_default_is(
  'public',
  'tenant_waiter_settings',
  'orphan_admin_alert_after_seconds',
  '120',
  'orphan admin alert defaults to 2 minutes'
);
select col_default_is(
  'public',
  'tenant_waiter_settings',
  'reconciliation_interval_seconds',
  '45',
  'database safety reconciliation defaults to 45 seconds'
);
select col_default_is(
  'public',
  'tenant_waiter_settings',
  'pin_max_attempts',
  '5',
  'PIN lock defaults to five failed attempts'
);

-- Intenta aceptar escrituras concurrentes o mezclar un grupo con finanzas. Si
-- falla, dos garzones podrían resolver dos veces o unir cuentas por accidente.
select has_column(
  'public',
  'waiter_tasks',
  'state_version',
  'waiter tasks use optimistic concurrency'
);
select has_column(
  'public',
  'table_session_groups',
  'state_version',
  'table groups use optimistic concurrency'
);
select hasnt_column(
  'public',
  'table_session_groups',
  'payment_id',
  'table groups never own payments'
);
select hasnt_column(
  'public',
  'table_session_groups',
  'order_id',
  'table groups never own orders'
);
select has_view(
  'public',
  'waiter_task_queue',
  'RLS-aware prioritized waiter queue exists'
);

-- Intenta exponer mutaciones sensibles o bypass directo. Si falla, un cliente
-- podría confirmar efectos fuera de los RPC versionados.
select ok(
  not has_function_privilege(
    'anon',
    'public.resolve_waiter_task(uuid,integer,text,text)',
    'EXECUTE'
  ),
  'anon cannot resolve waiter tasks'
);
select ok(
  not has_table_privilege('authenticated', 'public.waiter_tasks', 'UPDATE'),
  'authenticated users cannot bypass the versioned task RPC'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.employee_pin_attempts',
    'SELECT'
  ),
  'PIN attempt details are not exposed to user routes'
);
select has_function(
  'public',
  'close_waiter_shift',
  array['integer'],
  'audited shift close RPC exists'
);
select has_function(
  'public',
  'report_waiter_table_incident',
  array['uuid', 'text'],
  'audited table incident RPC exists'
);
select has_function(
  'public',
  'transfer_waiter_zone',
  array['uuid', 'uuid', 'text'],
  'audited zone transfer RPC exists'
);

-- Intenta dejar una tabla nueva sin RLS forzado. Si falla, el aislamiento de
-- tenant dependería de que cada consulta recuerde agregar un filtro.
select is(
  (
    select count(*)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'tenant_waiter_settings', 'employee_pin_attempts',
        'employee_sessions', 'employee_zone_assignments',
        'table_session_groups', 'table_session_group_members',
        'waiter_table_assignments', 'waiter_tasks',
        'waiter_admin_alerts', 'waiter_shift_close_snapshots'
      )
      and class.relrowsecurity
      and class.relforcerowsecurity
  ),
  10::bigint,
  'all Sprint 5 public tables enable and force RLS'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'waiter_receive_private_topics'
  ),
  'private waiter Realtime topics have authorization'
);

insert into auth.users (id, email)
values
  ('e2000000-0000-4000-8000-000000000001', 'waiter-a@test.local'),
  ('e2000000-0000-4000-8000-000000000002', 'waiter-b@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'Waiter A SpA', 'Waiter A', 'waiter-a-test', 'active'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'Waiter B SpA', 'Waiter B', 'waiter-b-test', 'active'
  );

insert into public.venues (id, tenant_id, code, name)
values
  (
    'e3000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'main', 'Local A'
  ),
  (
    'e3000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002', 'main', 'Local B'
  );

insert into public.zones (id, tenant_id, venue_id, code, name)
values
  (
    'e4000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'terrace', 'Terraza A'
  ),
  (
    'e4000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'terrace', 'Terraza B'
  );

insert into public.employees (
  id, tenant_id, display_name, employee_pin_hash
)
values
  (
    'e5000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Camila A', extensions.crypt('2468', extensions.gen_salt('bf'))
  ),
  (
    'e5000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'Camila B', extensions.crypt('2468', extensions.gen_salt('bf'))
  );

insert into public.employee_roles (tenant_id, employee_id, role_code)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'waiter'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'e5000000-0000-4000-8000-000000000002', 'waiter'
  );

insert into public.tenant_memberships (
  tenant_id, user_id, employee_id, role_code, status
)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'waiter', 'active'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    'e5000000-0000-4000-8000-000000000002', 'waiter', 'active'
  );

insert into public.tenant_waiter_settings (tenant_id)
values
  ('e1000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000002');

insert into public.employee_sessions (
  id, tenant_id, venue_id, employee_id, auth_user_id,
  idle_expires_at, absolute_expires_at
)
values
  (
    'e6000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    clock_timestamp() + interval '1 hour',
    clock_timestamp() + interval '12 hours'
  ),
  (
    'e6000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'e5000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    clock_timestamp() + interval '1 hour',
    clock_timestamp() + interval '12 hours'
  );

insert into public.employee_zone_assignments (
  tenant_id, employee_session_id, zone_id
)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'e6000000-0000-4000-8000-000000000002',
    'e4000000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'e2000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', 'e1000000-0000-4000-8000-000000000001',
    'employee_id', 'e5000000-0000-4000-8000-000000000001',
    'employee_session_id', 'e6000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta cruzar tenant o zona por el camino real de claims. Si falla, un
-- garzón podría ver trabajo de otro bar o sector.
select is(
  (select count(*) from public.tenant_waiter_settings),
  1::bigint,
  'waiter sees only own tenant settings'
);
select ok(
  private.waiter_can_access_zone(
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    null
  ),
  'waiter can access an assigned zone'
);
select ok(
  not private.waiter_can_access_zone(
    'e1000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000002',
    'e4000000-0000-4000-8000-000000000002',
    null
  ),
  'waiter cannot access another tenant zone'
);
select is(
  (
    select count(*) from public.employee_sessions
    where tenant_id <> 'e1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'waiter cannot read another tenant employee session'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'e2000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

-- Intenta abrir el panel con un JWT incompleto. Si falla, la ausencia de
-- tenant o sesión de empleado podría abrir datos en vez de fallar cerrado.
select is(
  (select count(*) from public.tenant_waiter_settings),
  0::bigint,
  'waiter request without tenant claim fails closed'
);
select ok(
  not private.waiter_can_access_zone(
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    null
  ),
  'waiter request without employee session claim fails closed'
);

reset role;

select * from finish();
rollback;
