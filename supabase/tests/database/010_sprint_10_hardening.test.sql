begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Intenta ejecutar la carga con RLS débil. Si falla, el test de volumen podría
-- dar números rápidos mientras expone filas de otro local.
select is(
  (
    select count(*)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'zones', 'checkout_quotes', 'payments', 'orders', 'tickets'
      )
      and class.relrowsecurity
      and class.relforcerowsecurity
  ),
  5::bigint,
  'critical loaded tables enable and force RLS'
);

insert into auth.users (id, email)
values
  ('a2000010-0000-4000-8000-000000000001', 'tenant-a-s10@test.local'),
  ('a2000010-0000-4000-8000-000000000002', 'tenant-b-s10@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    'a1000010-0000-4000-8000-000000000001',
    'Tenant A Sprint 10 SpA',
    'Tenant A Sprint 10',
    'tenant-a-sprint-10',
    'active'
  ),
  (
    'a1000010-0000-4000-8000-000000000002',
    'Tenant B Sprint 10 SpA',
    'Tenant B Sprint 10',
    'tenant-b-sprint-10',
    'active'
  );

insert into public.venues (id, tenant_id, code, name, onboarding_status)
values
  (
    'a3000010-0000-4000-8000-000000000001',
    'a1000010-0000-4000-8000-000000000001',
    'venue-a-s10',
    'Venue A Sprint 10',
    'ready'
  ),
  (
    'a3000010-0000-4000-8000-000000000002',
    'a1000010-0000-4000-8000-000000000002',
    'venue-b-s10',
    'Venue B Sprint 10',
    'ready'
  );

insert into public.zones (tenant_id, venue_id, code, name)
select
  'a1000010-0000-4000-8000-000000000001'::uuid,
  'a3000010-0000-4000-8000-000000000001'::uuid,
  'tenant-a-loaded-' || series,
  'Tenant A loaded zone ' || series
from generate_series(1, 96) series
union all
select
  'a1000010-0000-4000-8000-000000000002'::uuid,
  'a3000010-0000-4000-8000-000000000002'::uuid,
  'tenant-b-loaded-' || series,
  'Tenant B loaded zone ' || series
from generate_series(1, 96) series;

insert into public.tenant_memberships (tenant_id, user_id, role_code, status)
values
  (
    'a1000010-0000-4000-8000-000000000001',
    'a2000010-0000-4000-8000-000000000001',
    'owner',
    'active'
  ),
  (
    'a1000010-0000-4000-8000-000000000002',
    'a2000010-0000-4000-8000-000000000002',
    'owner',
    'active'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a2000010-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', 'a1000010-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta mezclar 192 filas bajo carga. Si falla, un panel podría incluir las
-- 96 zonas del tenant vecino en una respuesta aparentemente válida.
select is(
  (select count(*) from public.zones),
  96::bigint,
  'tenant A sees its 96 loaded rows only'
);

select is(
  (
    select count(*)
    from public.zones
    where tenant_id = 'a1000010-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'tenant A sees zero loaded rows from tenant B'
);

-- Intenta modificar en masa el otro tenant. Si falla, RLS sería sólo un filtro
-- de lectura y no una frontera de escritura.
select results_eq(
  $$
    with changed as (
      update public.zones
      set name = 'cross-tenant bulk update'
      where tenant_id = 'a1000010-0000-4000-8000-000000000002'
      returning 1
    )
    select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'bulk cross-tenant update changes zero rows'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a2000010-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

-- Intenta abrir la frontera al perder el claim durante una ráfaga. Si falla,
-- una request incompleta podría heredar datos en vez de cerrarse.
select is(
  (select count(*) from public.zones),
  0::bigint,
  'loaded request without tenant claim fails closed'
);

reset role;
select * from finish();
rollback;
