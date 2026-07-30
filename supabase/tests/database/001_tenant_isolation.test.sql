begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select has_table('public', 'tenants', 'tenants exists');
select has_table('public', 'zones', 'zones exists');
select has_table('public', 'tables', 'tables exists');
select has_table('public', 'stations', 'stations exists');

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.zones'::regclass
  ),
  true,
  'RLS is enabled on zones'
);

select is(
  (
    select relforcerowsecurity
    from pg_class
    where oid = 'public.zones'::regclass
  ),
  true,
  'RLS is forced on zones'
);

insert into auth.users (id, email)
values
  ('20000000-0000-4000-8000-000000000001', 'tenant-a@test.local'),
  ('20000000-0000-4000-8000-000000000002', 'tenant-b@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Tenant A SpA',
    'Tenant A',
    'tenant-a-test',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Tenant B SpA',
    'Tenant B',
    'tenant-b-test',
    'active'
  );

insert into public.venues (id, tenant_id, code, name, onboarding_status)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'venue-a',
    'Venue A',
    'ready'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'venue-b',
    'Venue B',
    'ready'
  );

insert into public.zones (id, tenant_id, venue_id, code, name)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'zone-a',
    'Zone A'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'zone-b',
    'Zone B'
  );

insert into public.tables (
  id,
  tenant_id,
  venue_id,
  zone_id,
  table_number,
  display_name,
  qr_token_hash
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'A-1',
    'Service point A',
    decode(repeat('11', 32), 'hex')
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    'B-1',
    'Service point B',
    decode(repeat('22', 32), 'hex')
  );

insert into public.stations (
  id,
  tenant_id,
  venue_id,
  code,
  name,
  station_type
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'station-a',
    'Station A',
    'configurable-a'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'station-b',
    'Station B',
    'configurable-b'
  );

insert into public.tenant_memberships (tenant_id, user_id, role_code, status)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'owner',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'owner',
    'active'
  );

insert into public.tenant_stored_value_settings (tenant_id)
values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '20000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '10000000-0000-4000-8000-000000000001'
  )::text,
  true
);

select is(
  (select count(*) from public.zones),
  1::bigint,
  'tenant A sees exactly its own zone'
);

select is(
  (select count(*) from public.tables),
  1::bigint,
  'tenant A sees exactly its own service point'
);

select is(
  (select count(*) from public.stations),
  1::bigint,
  'tenant A sees exactly its own station'
);

select is(
  (select count(*) from public.tenant_stored_value_settings),
  1::bigint,
  'el saldo de Tenant A no existe para Tenant B'
);

select results_eq(
  $$
    with changed as (
      update public.zones
      set name = 'cross-tenant update must not happen'
      where id = '40000000-0000-4000-8000-000000000002'
      returning 1
    )
    select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'tenant A cannot update tenant B zone'
);

select results_eq(
  $$
    with removed as (
      delete from public.zones
      where id = '40000000-0000-4000-8000-000000000002'
      returning 1
    )
    select count(*) from removed
  $$,
  $$ values (0::bigint) $$,
  'tenant A cannot delete tenant B zone'
);

select throws_ok(
  $$
    insert into public.zones (
      tenant_id,
      venue_id,
      code,
      name
    )
    values (
      '10000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      'cross-tenant-insert',
      'must fail'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "zones"',
  'tenant A cannot insert data for tenant B'
);

select is(
  (
    select tenant_id
    from public.tenant_size_metrics
  ),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'pricing metrics view is tenant-scoped'
);

select is(
  (select private.require_tenant_context()),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'valid JWT establishes transaction tenant context'
);

select is(
  current_setting('app.current_tenant_id', true),
  '10000000-0000-4000-8000-000000000001',
  'transaction-local tenant setting matches the validated claim'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '20000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  (select count(*) from public.zones),
  0::bigint,
  'missing tenant claim fails closed'
);

select is(
  (select count(*) from public.tenant_stored_value_settings),
  0::bigint,
  'saldo falla cerrado cuando el JWT no trae tenant'
);

select throws_ok(
  $$ select private.require_tenant_context() $$,
  '42501',
  'active tenant context is required',
  'critical RPC rejects missing tenant context'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '20000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', 'not-a-uuid'
  )::text,
  true
);

select is(
  (select count(*) from public.zones),
  0::bigint,
  'invalid tenant claim fails closed'
);

reset role;

select throws_ok(
  $$
    insert into public.zones (
      tenant_id,
      venue_id,
      code,
      name
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'cross-reference',
      'must fail'
    )
  $$,
  '23503',
  null,
  'composite foreign key rejects a cross-tenant venue'
);

select * from finish();
rollback;
