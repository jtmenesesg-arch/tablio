begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- Intenta cerrar el sprint sin evidencia durable. Si falla, un reinicio
-- podría borrar el turno, la atribución o el cierre financiero.
select has_table('public', 'tenant_cashier_settings', 'cashier settings exist');
select has_table('public', 'cashier_shifts', 'cashier shifts exist');
select has_table(
  'public',
  'payment_shift_attributions',
  'provider-time shift attribution exists'
);
select has_table(
  'public',
  'cashier_shift_closures',
  'immutable close snapshot exists'
);
select has_table(
  'public',
  'cashier_closure_payment_method_summaries',
  'payment-method close summary exists'
);
select has_table(
  'public',
  'cashier_closure_tip_summaries',
  'worker tip close summary exists'
);
select has_table(
  'public',
  'cashier_post_close_adjustments',
  'post-close venue adjustments exist'
);
select has_table(
  'public',
  'cashier_refund_actions',
  'audited refund actions exist'
);
select has_table(
  'public',
  'cashier_exception_events',
  'append-only exception history exists'
);
select has_table(
  'public',
  'cashier_manual_productions',
  'manual production evidence exists'
);
select has_table(
  'public',
  'settlement_payment_entries',
  'payment-level settlement evidence exists'
);

-- Intenta cambiar silenciosamente la política acordada. Si falla, la ventana
-- de producción o el intervalo de respaldo podrían quedar implícitos.
select col_default_is(
  'public',
  'tenant_cashier_settings',
  'manual_production_window_seconds',
  '1200',
  'manual production defaults to twenty minutes'
);
select col_default_is(
  'public',
  'tenant_cashier_settings',
  'reconciliation_interval_seconds',
  '45',
  'safety reconciliation defaults to forty-five seconds'
);
select has_column(
  'public',
  'payment_shift_attributions',
  'provider_approved_at',
  'provider approval timestamp is retained'
);
select has_column(
  'public',
  'payment_shift_attributions',
  'provider_received_at',
  'server receipt timestamp is retained'
);
select has_column(
  'public',
  'reconciliation_exceptions',
  'manual_production_deadline_at',
  'late approval carries an explicit deadline'
);
select has_column(
  'public',
  'cashier_refund_actions',
  'local_tip_adjustment_clp',
  'closed-shift tip component is explicit'
);
select has_column(
  'public',
  'cashier_refund_actions',
  'tip_refunded_from_open_shift_clp',
  'open-shift tip component is explicit'
);

-- Intenta permitir que las sumas de cierre dejen de explicar el abono. Si
-- falla, la pantalla y el snapshot podrían aceptar matemáticas distintas.
select ok(
  exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid =
      'public.cashier_shift_closures'::regclass
      and constraint_record.contype = 'c'
      and pg_get_constraintdef(constraint_record.oid)
        like '%expected_payout_clp%gross_sales_clp%'
  ),
  'closure enforces gross minus deductions equals expected payout'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid =
      'public.cashier_refund_actions'::regclass
      and constraint_record.contype = 'c'
      and pg_get_constraintdef(constraint_record.oid)
        like '%closed_shift_local_absorbs%'
  ),
  'refund action enforces mutually exclusive tip policies'
);
select has_trigger(
  'public',
  'cashier_shift_closures',
  'cashier_shift_closures_immutable',
  'closure snapshot cannot be edited or deleted'
);
select has_trigger(
  'public',
  'cashier_post_close_adjustments',
  'cashier_post_close_adjustments_immutable',
  'venue tip adjustment cannot be edited or deleted'
);
select has_trigger(
  'public',
  'payment_shift_attributions',
  'payment_shift_attributions_immutable',
  'provider-time attribution cannot be rewritten'
);

-- Intenta saltarse los RPC auditados. Si falla, el navegador podría editar
-- evidencia financiera o un visitante anónimo podría reembolsar.
select ok(
  not has_table_privilege(
    'authenticated',
    'public.reconciliation_exceptions',
    'UPDATE'
  ),
  'authenticated cannot update exceptions directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.request_cashier_refund(uuid,bigint,text,text)',
    'EXECUTE'
  ),
  'anon cannot request refunds'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.close_cashier_shift(uuid,integer,bigint,text)',
    'EXECUTE'
  ),
  'anon cannot close shifts'
);
select has_function(
  'public',
  'produce_manual_order_for_exception',
  array['uuid', 'integer', 'text'],
  'manual production uses a versioned audited RPC'
);
select has_view(
  'public',
  'cashier_live_tables',
  'cashier live table view exists'
);
select has_view(
  'public',
  'cashier_exception_queue',
  'cashier actionable exception queue exists'
);
select has_view(
  'public',
  'cashier_reconciliation_trace',
  'three-way reconciliation trace exists'
);
select ok(
  coalesce(
    (
      select 'security_invoker=true' = any(class.reloptions)
      from pg_class class
      where class.oid = 'public.cashier_reconciliation_trace'::regclass
    ),
    false
  ),
  'reconciliation view invokes the caller RLS context'
);

-- Intenta dejar una tabla nueva sin RLS forzado. Si falla, el aislamiento
-- dependería de recordar filtros manuales en cada consulta.
select is(
  (
    select count(*)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'tenant_cashier_settings', 'cashier_shifts',
        'payment_shift_attributions', 'cashier_shift_closures',
        'cashier_closure_payment_method_summaries',
        'cashier_closure_tip_summaries',
        'cashier_post_close_adjustments',
        'cashier_closure_adjustments',
        'cashier_refund_actions', 'cashier_exception_events',
        'cashier_manual_productions', 'settlement_payment_entries'
      )
      and class.relrowsecurity
      and class.relforcerowsecurity
  ),
  12::bigint,
  'all Sprint 6 tables enable and force RLS'
);

insert into auth.users (id, email)
values
  ('f2000000-0000-4000-8000-000000000001', 'cashier-a@test.local'),
  ('f2000000-0000-4000-8000-000000000002', 'cashier-b@test.local'),
  ('f2000000-0000-4000-8000-000000000003', 'waiter-only@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'Cashier A SpA', 'Cashier A', 'cashier-a-test', 'active'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'Cashier B SpA', 'Cashier B', 'cashier-b-test', 'active'
  );

insert into public.venues (id, tenant_id, code, name)
values
  (
    'f3000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001', 'main', 'Local Caja A'
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002', 'main', 'Local Caja B'
  );

insert into public.employees (
  id, tenant_id, display_name, employee_pin_hash
)
values
  (
    'f5000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001', 'Valentina A',
    extensions.crypt('2468', extensions.gen_salt('bf'))
  ),
  (
    'f5000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002', 'Valentina B',
    extensions.crypt('2468', extensions.gen_salt('bf'))
  ),
  (
    'f5000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001', 'Sólo Garzón',
    extensions.crypt('2468', extensions.gen_salt('bf'))
  );

insert into public.employee_roles (tenant_id, employee_id, role_code)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001', 'cashier_admin'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000002', 'cashier_admin'
  ),
  (
    'f1000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000003', 'waiter'
  );

insert into public.tenant_memberships (
  tenant_id, user_id, employee_id, role_code, status
)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001', 'cashier_admin', 'active'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f2000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000002', 'cashier_admin', 'active'
  ),
  (
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000003',
    'f5000000-0000-4000-8000-000000000003', 'waiter', 'active'
  );

insert into public.tenant_cashier_settings (tenant_id)
values
  ('f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002');

insert into public.cashier_shifts (
  id, tenant_id, venue_id, opened_by_employee_id, opened_at
)
values
  (
    'f6000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001',
    clock_timestamp() - interval '2 hours'
  ),
  (
    'f6000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002',
    'f3000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000002',
    clock_timestamp() - interval '2 hours'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f2000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', 'f1000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta cruzar un local usando el camino real del claim. Si falla, un
-- cajero podría leer turnos o ajustes financieros de otro tenant.
select is(
  (select count(*) from public.tenant_cashier_settings),
  1::bigint,
  'cashier sees only own tenant settings'
);
select is(
  (select count(*) from public.cashier_shifts),
  1::bigint,
  'cashier sees only own tenant shifts'
);
select ok(
  private.has_permission(
    'f1000000-0000-4000-8000-000000000001',
    'payments.refund'
  ),
  'cashier role has explicit refund permission'
);
select ok(
  private.has_permission(
    'f1000000-0000-4000-8000-000000000001',
    'cashier.close'
  ),
  'cashier role has explicit shift close permission'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f2000000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'tenant_id', 'f1000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta reembolsar con un rol operativo sin permiso. Si falla, cualquier
-- garzón podría iniciar una devolución de dinero.
select is(
  (select count(*) from public.cashier_shifts),
  0::bigint,
  'waiter without cashier.read sees no cashier shifts'
);
select ok(
  not private.has_permission(
    'f1000000-0000-4000-8000-000000000001',
    'payments.refund'
  ),
  'waiter does not inherit refund permission'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f2000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

-- Intenta abrir la caja con un JWT incompleto. Si falla, la ausencia de
-- tenant podría abrir datos financieros en vez de fallar cerrado.
select is(
  (select count(*) from public.tenant_cashier_settings),
  0::bigint,
  'request without tenant claim fails closed'
);
select is(
  (select count(*) from public.cashier_shifts),
  0::bigint,
  'shift query without tenant claim fails closed'
);

reset role;

select * from finish();
rollback;
