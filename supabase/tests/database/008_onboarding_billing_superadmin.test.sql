begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

-- Intenta construir el negocio sólo en la interfaz. Si falla, un reinicio
-- perdería onboarding, cobros, planes o auditoría de soporte.
select has_table('public', 'onboarding_runs', 'onboarding progress is durable');
select has_table('public', 'menu_imports', 'menu imports are durable drafts');
select has_table(
  'public', 'tenant_gateway_connections',
  'bar gateway connection metadata is durable'
);
select has_table(
  'private', 'tenant_gateway_credentials',
  'bar gateway secrets use private Vault references'
);
select has_table(
  'public', 'saas_plan_definitions',
  'commercial plan definitions exist'
);
select has_table(
  'public', 'saas_subscriptions',
  'Tablio subscriptions are separate records'
);
select has_table('public', 'saas_invoices', 'SaaS invoices exist');
select has_table(
  'public', 'saas_charge_attempts',
  'SaaS charge attempts are idempotent history'
);
select has_table(
  'public', 'platform_memberships',
  'platform superadmins are separate from tenant roles'
);
select has_table(
  'public', 'impersonation_sessions',
  'support impersonation is durable'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'onboarding_runs', 'onboarding_step_states',
        'menu_imports', 'menu_import_items',
        'tenant_gateway_connections', 'onboarding_test_runs',
        'tenant_plan_assignments', 'saas_billing_accounts',
        'saas_subscriptions', 'saas_invoices', 'saas_charge_attempts',
        'saas_notifications', 'subscription_status_events',
        'tenant_feature_flags', 'impersonation_sessions'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  15::bigint,
  'all tenant commercial tables enable and force RLS'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.tenant_gateway_credentials', 'SELECT'
  ),
  'tenant users cannot read bar gateway credential references'
);

-- Intenta cobrar por layout o dejar todos los bares en un mismo tramo. Si
-- falla, un patio adicional podría castigar injustamente a un bar chico.
select is(
  public.recommend_saas_plan(12, 3, 3),
  'starter',
  'up to twelve tables is Starter'
);
select is(
  public.recommend_saas_plan(13, 2, 2),
  'flow',
  'thirteen tables enters Flow'
);
select is(
  public.recommend_saas_plan(31, 3, 3),
  'high_flow',
  'thirty-one tables enters High Flow'
);
select is(
  public.recommend_saas_plan(61, 4, 4),
  'custom',
  'more than sixty tables is custom'
);
select is(
  public.recommend_saas_plan(10, 5, 3),
  'starter',
  'zones alone do not raise a small bar'
);
select is(
  public.recommend_saas_plan(10, 5, 5),
  'flow',
  'only clear excess in zones and stations raises the plan'
);
select is(
  (select count(*) from public.saas_plan_definitions where commercial_hypothesis),
  4::bigint,
  'all prices and cuts remain commercial hypotheses'
);

select has_function(
  'public', 'diner_ordering_availability', array['uuid'],
  'diner has a minimal ordering availability contract'
);
select has_function(
  'public', 'superadmin_tenant_overview', array[]::text[],
  'superadmin has a separate cross-tenant overview'
);
select has_function(
  'public', 'start_tenant_impersonation', array['uuid', 'text'],
  'support impersonation has a narrow audited RPC'
);
select has_function(
  'public', 'superadmin_set_subscription_status',
  array['uuid', 'text', 'text', 'timestamp with time zone'],
  'commercial transitions use a dedicated RPC'
);
select has_function(
  'private', 'run_simulated_saas_billing_cycle',
  array['timestamp with time zone'],
  'recurring simulated billing has a durable scheduler'
);
select ok(
  exists (
    select 1 from cron.job
    where jobname = 'tablio-saas-billing-cycle' and active
  ),
  'the recurring SaaS billing cycle is scheduled'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'commercial_admin_update_gate'
      and permissive = 'RESTRICTIVE'
  ),
  'administrative degradation gates catalog writes'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.checkout_quotes'::regclass
      and tgname = 'checkout_quotes_commercial_gate'
      and not tgisinternal
  ),
  'new quotes have a database commercial gate'
);

insert into auth.users (id, email)
values
  ('82000000-0000-4000-8000-000000000001', 'owner-a-s8@test.local'),
  ('82000000-0000-4000-8000-000000000002', 'owner-b-s8@test.local'),
  ('82000000-0000-4000-8000-000000000003', 'platform-s8@test.local');

insert into public.tenants (
  id, legal_name, display_name, slug, status, plan_code, onboarding_status
)
values
  (
    '81000000-0000-4000-8000-000000000001',
    'Bar A Sprint 8 SpA', 'Bar A Sprint 8', 'bar-a-sprint-8',
    'active', 'starter', 'ready'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'Bar B Sprint 8 SpA', 'Bar B Sprint 8', 'bar-b-sprint-8',
    'active', 'starter', 'ready'
  );

insert into public.venues (
  id, tenant_id, code, name, onboarding_status
)
values
  (
    '83000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'venue-a-s8', 'Venue A Sprint 8', 'ready'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    'venue-b-s8', 'Venue B Sprint 8', 'ready'
  );

insert into public.zones (id, tenant_id, venue_id, code, name)
values
  (
    '84000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    'zone-a-s8', 'Zona A'
  ),
  (
    '84000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000002',
    'zone-b-s8', 'Zona B'
  );

insert into public.tables (
  id, tenant_id, venue_id, zone_id, table_number,
  display_name, qr_token_hash, presence_mode
)
select
  (
    '86000000-0000-4000-8000-' || lpad(sequence::text, 12, '0')
  )::uuid,
  '81000000-0000-4000-8000-000000000001'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid,
  '84000000-0000-4000-8000-000000000001'::uuid,
  'A-' || sequence,
  'Mesa A-' || sequence,
  extensions.digest('sprint-8-table-a-' || sequence, 'sha256'),
  'required'
from generate_series(1, 13) sequence;

insert into public.tables (
  id, tenant_id, venue_id, zone_id, table_number,
  display_name, qr_token_hash, presence_mode
)
values (
  '86000000-0000-4000-8000-000000000099',
  '81000000-0000-4000-8000-000000000002',
  '83000000-0000-4000-8000-000000000002',
  '84000000-0000-4000-8000-000000000002',
  'B-1', 'Mesa B-1', extensions.digest('sprint-8-table-b-1', 'sha256'),
  'required'
);

insert into public.stations (id, tenant_id, venue_id, code, name, station_type)
values
  (
    '85000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    'bar-a-s8', 'Barra A', 'bar'
  ),
  (
    '85000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000002',
    'bar-b-s8', 'Barra B', 'bar'
  );

insert into public.tenant_memberships (tenant_id, user_id, role_code, status)
values
  (
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'owner', 'active'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002',
    'owner', 'active'
  );

insert into public.platform_memberships (user_id, role_code, status)
values (
  '82000000-0000-4000-8000-000000000003',
  'superadmin', 'active'
);

insert into public.onboarding_runs (
  id, tenant_id, venue_id, status, current_step, progress_percent
)
values (
  '87000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'in_progress', 'menu', 22
);

insert into public.menu_imports (
  id, tenant_id, onboarding_run_id, source_type,
  source_label, status, extraction_provider
)
values (
  '88000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  'pdf', 'carta-demo.pdf', 'extracted', 'simulated'
);

insert into public.menu_import_items (
  id, tenant_id, menu_import_id, source_line,
  proposed_category, proposed_name, proposed_price_clp
)
values (
  '89000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  1, 'Cervezas', 'Lager demo', 4500
);

-- Intenta publicar el precio extraído sin que una persona lo confirme. Si
-- falla, una lectura de $6.900 como $900 podría llegar a producción.
select throws_ok(
  $$
    update public.menu_imports
    set status = 'published'
    where id = '88000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'human review is required before menu publication',
  'unreviewed menu cannot be published'
);

update public.menu_import_items
set human_confirmed = true
where id = '89000000-0000-4000-8000-000000000001';
update public.menu_imports
set status = 'reviewed',
    reviewed_by_user_id = '82000000-0000-4000-8000-000000000001',
    reviewed_at = clock_timestamp()
where id = '88000000-0000-4000-8000-000000000001';
update public.menu_imports
set status = 'published'
where id = '88000000-0000-4000-8000-000000000001';

select is(
  (
    select status from public.menu_imports
    where id = '88000000-0000-4000-8000-000000000001'
  ),
  'published',
  'human-reviewed menu can be published'
);

insert into public.saas_billing_accounts (
  id, tenant_id, provider_code, provider_customer_id,
  payment_method_label, status, simulation_behavior
)
values
  (
    '8a000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'simulated', 'customer-a-s8', 'Tarjeta demo A', 'ready', 'fail_once'
  ),
  (
    '8a000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    'simulated', 'customer-b-s8', 'Tarjeta demo B', 'ready', 'success'
  );

insert into public.saas_subscriptions (
  id, tenant_id, billing_account_id, plan_code, status,
  current_period_start, current_period_end, next_charge_at
)
values
  (
    '8b000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '8a000000-0000-4000-8000-000000000001',
    'starter', 'admin_restricted',
    '2026-07-01 00:00:00+00', '2026-08-01 00:00:00+00',
    '2026-08-01 00:00:00+00'
  ),
  (
    '8b000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    '8a000000-0000-4000-8000-000000000002',
    'starter', 'suspended',
    '2026-07-01 00:00:00+00', '2026-08-01 00:00:00+00',
    '2026-08-01 00:00:00+00'
  );

-- Intenta convertir la restricción administrativa en un corte operativo. Si
-- falla, una deuda bloquearía pedidos antes del último escalón.
select ok(
  private.tenant_ordering_allowed(
    '81000000-0000-4000-8000-000000000001'
  ),
  'admin-restricted tenant still accepts and produces orders'
);
select ok(
  not private.tenant_ordering_allowed(
    '81000000-0000-4000-8000-000000000002'
  ),
  'suspended tenant rejects new ordering'
);
select ok(
  (
    public.diner_ordering_availability(
      '86000000-0000-4000-8000-000000000099'
    ) ->> 'ordering_available'
  )::boolean = false
  and public.diner_ordering_availability(
    '86000000-0000-4000-8000-000000000099'
  )::text !~* '(deuda|moros|cobro|suscrip|plan)',
  'diner sees only a neutral unavailable message'
);

-- Intenta usar el panel global desde un rol del local. Si falla, un dueño
-- podría leer datos comerciales de todos los tenants.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '82000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '81000000-0000-4000-8000-000000000001'
  )::text,
  true
);
select throws_ok(
  $$ select count(*) from public.superadmin_tenant_overview() $$,
  '42501',
  'platform superadmin required',
  'tenant owner cannot use cross-tenant overview'
);
select is(
  (select count(*) from public.saas_subscriptions),
  1::bigint,
  'tenant owner sees only its own subscription'
);
select is(
  (
    select count(*) from public.saas_subscriptions
    where tenant_id = '81000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'tenant owner cannot see another subscription'
);
select is(
  (public.propose_tenant_plan_change('Se agregaron mesas')::record).plan_code,
  'flow',
  'thirteen tables propose Flow'
);
select is(
  (
    select effective_at
    from public.tenant_plan_assignments
    where tenant_id = '81000000-0000-4000-8000-000000000001'
      and status = 'proposed'
  ),
  '2026-08-01 00:00:00+00'::timestamptz,
  'plan change starts only at the next billing cycle'
);
select is(
  (
    select plan_code from public.saas_subscriptions
    where tenant_id = '81000000-0000-4000-8000-000000000001'
  ),
  'starter',
  'current plan remains unchanged before the effective date'
);
select is(
  (
    select count(*) from public.impersonation_sessions
  ),
  0::bigint,
  'tenant roles cannot read platform impersonation history'
);
reset role;

-- Intenta impersonar sin motivo o sin ser superadmin. Si falla, soporte
-- podría entrar silenciosamente al negocio de un cliente.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '82000000-0000-4000-8000-000000000003',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*) from public.superadmin_tenant_overview()),
  2::bigint,
  'platform superadmin can see tenants across RLS only through the RPC'
);
select throws_ok(
  $$
    select public.start_tenant_impersonation(
      '81000000-0000-4000-8000-000000000001',
      'ayuda'
    )
  $$,
  '22023',
  'specific impersonation reason is required',
  'short impersonation reason is rejected'
);
select ok(
  public.start_tenant_impersonation(
    '81000000-0000-4000-8000-000000000001',
    'Revisar configuración de pasarela reportada por el dueño'
  ) is not null,
  'valid impersonation is recorded'
);
reset role;
select is(
  (
    select count(*) from public.audit_log
    where tenant_id = '81000000-0000-4000-8000-000000000001'
      and action = 'platform.impersonation_started'
  ),
  1::bigint,
  'impersonation appends tenant audit with reason'
);

-- Intenta suspender por el primer rechazo. Si falla, una tarjeta vencida
-- podría cortar el servicio sin reintentos ni gracia.
update public.saas_subscriptions
set status = 'active'
where tenant_id = '81000000-0000-4000-8000-000000000001';

insert into public.saas_invoices (
  id, tenant_id, subscription_id, invoice_number, kind, status,
  subtotal_clp, tax_clp, total_clp, due_at
)
values (
  '8c000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  'SAAS-S8-001', 'subscription', 'open',
  99000, 0, 99000, clock_timestamp()
);

insert into public.saas_charge_attempts (
  id, tenant_id, invoice_id, billing_account_id, idempotency_key,
  attempt_number, status, failure_code, occurred_at
)
values (
  '8d000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  's8-failed-charge', 1, 'failed', 'demo_card_declined',
  '2026-07-29 12:00:00+00'
);

select is(
  (
    select status from public.saas_subscriptions
    where tenant_id = '81000000-0000-4000-8000-000000000001'
  ),
  'past_due',
  'first failed charge moves only to past due'
);
select ok(
  exists (
    select 1 from public.saas_notifications
    where tenant_id = '81000000-0000-4000-8000-000000000001'
      and kind = 'retry_scheduled'
  ),
  'failed charge schedules retry and notice'
);
select ok(
  private.tenant_ordering_allowed(
    '81000000-0000-4000-8000-000000000001'
  ),
  'failed charge does not suspend ordering'
);

insert into public.saas_charge_attempts (
  id, tenant_id, invoice_id, billing_account_id, idempotency_key,
  attempt_number, status, provider_charge_id, occurred_at
)
values (
  '8d000000-0000-4000-8000-000000000002',
  '81000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  's8-successful-retry', 2, 'succeeded', 'sim-saas-success',
  '2026-07-30 12:00:00+00'
);

select is(
  (
    select status from public.saas_subscriptions
    where tenant_id = '81000000-0000-4000-8000-000000000001'
  ),
  'active',
  'successful retry restores active status'
);
select is(
  (
    select status from public.saas_invoices
    where id = '8c000000-0000-4000-8000-000000000001'
  ),
  'paid',
  'successful retry pays exactly the SaaS invoice'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.run_simulated_saas_billing_cycle(timestamp with time zone)',
    'EXECUTE'
  ),
  'user routes cannot execute the billing scheduler'
);
select ok(
  has_table_privilege(
    'service_role', 'private.saas_billing_credentials', 'SELECT'
  ),
  'only service workers can read SaaS billing credential references'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.saas_billing_credentials', 'SELECT'
  ),
  'tenant users cannot read SaaS billing credential references'
);

select * from finish();
rollback;
