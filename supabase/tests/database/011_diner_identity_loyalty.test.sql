begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

-- Intenta dejar identidad, recuperación o evidencia sólo en memoria. Si
-- falla, un reinicio podría borrar sellos o impedir que el cliente vuelva.
select has_table('public', 'tenant_loyalty_programs', 'program config is durable');
select has_table('public', 'diner_profiles', 'tenant diner profiles are durable');
select has_table('private', 'diner_profile_contacts', 'contacts stay private');
select has_table('private', 'diner_identity_credentials', 'credentials stay private');
select has_table('private', 'diner_recovery_challenges', 'recovery is durable');
select has_table('public', 'diner_consent_events', 'consent evidence is durable');
select has_table('public', 'diner_identity_events', 'identity loss is measurable');
select has_table('public', 'loyalty_visits', 'eligible visits are durable');
select has_table('public', 'loyalty_reward_redemptions', 'redemptions are durable');
select has_table('public', 'loyalty_ledger_entries', 'stamp ledger is durable');
select has_table('public', 'loyalty_assisted_adjustments', 'cashier help is audited');
select has_table('public', 'loyalty_refund_adjustments', 'refund effects are durable');
select has_table('public', 'loyalty_dormant_segment_entries', 'dormant segment is durable');

-- Intenta inventar margen o perder el rastro del premio. Si falla, caja no
-- podría explicar por qué un ítem quedó a precio cero.
select has_column('public', 'products', 'unit_cost_clp', 'product cost is optional');
select has_column(
  'public', 'checkout_quote_items', 'is_loyalty_reward',
  'quote freezes the reward marker'
);
select has_column(
  'public', 'checkout_quote_items', 'reference_unit_price_clp',
  'quote freezes list value separately from revenue'
);
select has_column(
  'public', 'order_items', 'is_loyalty_reward',
  'order copies the reward marker'
);
select has_column(
  'public', 'order_items', 'reference_unit_price_clp',
  'order keeps reward reference value'
);
select has_column(
  'public', 'checkout_quotes', 'diner_profile_id',
  'quote can point to the consenting tenant profile'
);
select has_column(
  'public', 'orders', 'diner_profile_id',
  'confirmed order preserves profile attribution'
);
select col_default_is(
  'public', 'tenant_loyalty_programs', 'enabled', 'false',
  'new tenant loyalty is disabled by default'
);

-- Intenta hacer que un filtro de aplicación sea la única frontera. Si falla,
-- una ruta olvidada podría leer perfiles o sellos de otro local.
select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relname in (
        'tenant_loyalty_programs',
        'diner_profiles',
        'diner_profile_contacts',
        'diner_identity_credentials',
        'diner_recovery_challenges',
        'diner_consent_events',
        'diner_identity_events',
        'loyalty_visits',
        'loyalty_reward_redemptions',
        'loyalty_ledger_entries',
        'loyalty_assisted_adjustments',
        'loyalty_refund_adjustments',
        'loyalty_dormant_segment_entries'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  13::bigint,
  'all Sprint 11 tenant tables enable and force RLS'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.diner_profile_contacts', 'SELECT'
  ),
  'browser cannot read recovery contacts'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.diner_identity_credentials', 'SELECT'
  ),
  'browser cannot read identity credentials'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.loyalty_ledger_entries', 'INSERT'
  ),
  'browser cannot grant itself stamps'
);

-- Intenta agregar métricas que eludan RLS o permitir reescribir evidencia. Si
-- falla, el panel podría mezclar locales o ocultar cambios de consentimiento.
select has_view(
  'public', 'owner_loyalty_metrics',
  'owner receives server-calculated loyalty metrics'
);
select has_view(
  'public', 'cashier_loyalty_reward_summary',
  'cashier receives reward reconciliation'
);
select ok(
  coalesce(
    (
      select 'security_invoker=true' = any(relation.reloptions)
      from pg_class relation
      where relation.oid = 'public.owner_loyalty_metrics'::regclass
    ),
    false
  ),
  'owner loyalty view keeps caller RLS'
);
select has_trigger(
  'public', 'diner_consent_events', 'diner_consent_events_immutable',
  'consent evidence is append-only'
);
select has_function(
  'private',
  'anonymize_diner_profile',
  array['uuid', 'uuid', 'text', 'timestamp with time zone'],
  'revocation has a durable anonymization path'
);

select * from finish();

rollback;
