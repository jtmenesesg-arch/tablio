begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, private, pg_catalog;

select plan(32);

select has_table('public', 'tenant_presence_settings', 'tenant presence settings are durable');
select has_table('public', 'zone_presence_overrides', 'zone overrides are durable');
select has_table('public', 'presence_code_rotations', 'presence rotations are durable');
select has_table('private', 'table_qr_vault_secrets', 'QR tokens use private Vault references');
select has_table('private', 'presence_code_vault_secrets', 'presence codes use private Vault references');
select has_table('private', 'presence_verification_attempts', 'failed attempts are durable and private');

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relname in (
        'tenant_presence_settings', 'zone_presence_overrides',
        'presence_code_rotations', 'table_qr_vault_secrets',
        'presence_code_vault_secrets', 'presence_verification_attempts'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  6::bigint,
  'all new tenant and secret tables force RLS'
);
select ok(
  not has_table_privilege('authenticated', 'private.table_qr_vault_secrets', 'SELECT'),
  'tenant users cannot read QR Vault references directly'
);
select ok(
  not has_table_privilege('authenticated', 'private.presence_code_vault_secrets', 'SELECT'),
  'tenant users cannot read presence Vault references directly'
);
select ok(
  not has_table_privilege('authenticated', 'private.presence_verification_attempts', 'SELECT'),
  'tenant users cannot inspect device fingerprints'
);
select is(
  (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'create_table_with_assets', 'create_tables_with_assets',
        'reveal_table_qr_token', 'reveal_table_presence_code',
        'rotate_table_qr', 'revoke_table_qr',
        'rotate_table_presence_code', 'configure_tenant_presence',
        'configure_zone_presence', 'clear_zone_presence_override',
        'verify_table_presence'
      )
      and not procedure.prosecdef
  ),
  11::bigint,
  'all public table and presence RPCs are SECURITY INVOKER facades'
);

insert into auth.users (id, email)
values
  ('f4000000-0000-4000-8000-000000000001', 'owner-a-s14@test.local'),
  ('f4000000-0000-4000-8000-000000000002', 'owner-b-s14@test.local');

insert into public.tenants (
  id, legal_name, display_name, slug, status, onboarding_status
)
values
  (
    'f4100000-0000-4000-8000-000000000001',
    'Bar A Sprint 14 SpA', 'Bar A Sprint 14', 'bar-a-sprint-14', 'active', 'ready'
  ),
  (
    'f4100000-0000-4000-8000-000000000002',
    'Bar B Sprint 14 SpA', 'Bar B Sprint 14', 'bar-b-sprint-14', 'active', 'ready'
  );

insert into public.venues (id, tenant_id, code, name, timezone, onboarding_status)
values
  (
    'f4200000-0000-4000-8000-000000000001',
    'f4100000-0000-4000-8000-000000000001',
    'principal-a-s14', 'Principal A', 'America/Santiago', 'ready'
  ),
  (
    'f4200000-0000-4000-8000-000000000002',
    'f4100000-0000-4000-8000-000000000002',
    'principal-b-s14', 'Principal B', 'America/Santiago', 'ready'
  );

insert into public.zones (id, tenant_id, venue_id, code, name)
values
  (
    'f4300000-0000-4000-8000-000000000001',
    'f4100000-0000-4000-8000-000000000001',
    'f4200000-0000-4000-8000-000000000001',
    'salon-a-s14', 'Salón'
  ),
  (
    'f4300000-0000-4000-8000-000000000002',
    'f4100000-0000-4000-8000-000000000002',
    'f4200000-0000-4000-8000-000000000002',
    'salon-b-s14', 'Salón'
  );

insert into public.tenant_memberships (tenant_id, user_id, role_code, status)
values
  (
    'f4100000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001', 'owner', 'active'
  ),
  (
    'f4100000-0000-4000-8000-000000000002',
    'f4000000-0000-4000-8000-000000000002', 'owner', 'active'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f4000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', 'f4100000-0000-4000-8000-000000000001'
  )::text,
  true
);

create temporary table s14_created as
select * from public.create_table_with_assets(
  'f4200000-0000-4000-8000-000000000001',
  'f4300000-0000-4000-8000-000000000001',
  '8', 'Mesa 8', 4
);

create temporary table s14_assets as
select
  public.reveal_table_qr_token(
    (select table_id from s14_created), 'Preparar tarjeta de prueba'
  ) as qr_token,
  public.reveal_table_presence_code(
    (select table_id from s14_created), 'Preparar código de prueba'
  ) as presence_code;

select ok(
  (select length(qr_token) >= 40 and presence_code ~ '^\d{4}$' from s14_assets),
  'creating a table provisions audited printable assets without returning them in the create RPC'
);
select ok(
  (
    select table_record.presence_assets_managed
      and table_record.presence_required
      and table_record.presence_delivery_level = 'printed_with_qr'
      and table_record.qr_active
    from public.tables table_record
    join s14_created created on created.table_id = table_record.id
  ),
  'new tables default to required code printed with QR'
);
select isnt(
  (select encode(table_record.qr_token_hash, 'hex') from public.tables table_record join s14_created created on created.table_id = table_record.id),
  (select qr_token from s14_assets),
  'the public table never stores the QR token in plaintext'
);
grant select on s14_created to service_role;
reset role;
set local role service_role;
select is(
  (
    select count(*)
    from private.table_qr_vault_secrets reference
    join s14_created created on created.table_id = reference.table_id
    where reference.active
  ),
  1::bigint,
  'the active QR has exactly one Vault reference'
);
set local role authenticated;
select is(
  (
    select count(*)
    from public.presence_code_rotations rotation
    join s14_created created on created.table_id = rotation.table_id
    where rotation.state = 'active'
  ),
  1::bigint,
  'the table has exactly one active presence rotation'
);
select is(
  public.reveal_table_qr_token(
    (select table_id from s14_created), 'Reimpresión de tarjeta dañada'
  ),
  (select qr_token from s14_assets),
  'an authorised audited reveal recovers the same QR token'
);
select ok(
  exists (
    select 1 from public.audit_log audit
    where audit.action = 'table.qr_revealed'
      and audit.target_id = (select table_id from s14_created)
  ),
  'revealing a QR is audited'
);

create temporary table s14_qr_before as
select table_record.qr_token_hash, table_record.qr_version
from public.tables table_record
join s14_created created on created.table_id = table_record.id;

select lives_ok(
  $$select public.configure_tenant_presence(true, 'separate', 'daily', 3, 10, 300, 900)$$,
  'tenant presence policy can change independently'
);
select ok(
  (
    select table_record.qr_token_hash = before.qr_token_hash
      and table_record.qr_version = before.qr_version
      and table_record.presence_delivery_level = 'separate'
    from public.tables table_record
    cross join s14_qr_before before
    join s14_created created on created.table_id = table_record.id
  ),
  'changing tenant presence level does not invalidate or rotate QR'
);
select lives_ok(
  $$select public.configure_zone_presence(
    'f4300000-0000-4000-8000-000000000001', true, 'rotating', 'daily'
  )$$,
  'a zone can override the tenant presence delivery level'
);
select ok(
  (
    select table_record.qr_token_hash = before.qr_token_hash
      and table_record.qr_version = before.qr_version
      and table_record.presence_delivery_level = 'rotating'
    from public.tables table_record
    cross join s14_qr_before before
    join s14_created created on created.table_id = table_record.id
  ),
  'changing a zone override also leaves QR intact'
);

create temporary table s14_current_code as
select public.reveal_table_presence_code(
  (select table_id from s14_created),
  'Mostrar código vigente al equipo'
) as presence_code;

select is(
  (public.verify_table_presence(
    (select qr_token from s14_assets),
    (select presence_code from s14_current_code),
    'device-fingerprint-0001'
  )->>'verified')::boolean,
  true,
  'the real QR and code verify server-side'
);
select is(
  public.verify_table_presence(
    (select qr_token from s14_assets), '9999', 'device-fingerprint-0002'
  )->>'code',
  'invalid_code',
  'a wrong code returns a generic error'
);
select is(
  public.verify_table_presence(
    (select qr_token from s14_assets), '9999', 'device-fingerprint-0002'
  )->>'code',
  'invalid_code',
  'a second wrong code is recorded but not yet blocked'
);
select is(
  public.verify_table_presence(
    (select qr_token from s14_assets), '9999', 'device-fingerprint-0002'
  )->>'code',
  'temporarily_blocked',
  'the configured third failure blocks that device'
);
select is(
  public.verify_table_presence(
    (select qr_token from s14_assets),
    (select presence_code from s14_current_code),
    'device-fingerprint-0002'
  )->>'code',
  'temporarily_blocked',
  'a blocked device cannot bypass the wait with the correct code'
);

create temporary table s14_bulk as
select * from public.create_tables_with_assets(
  'f4200000-0000-4000-8000-000000000001',
  'f4300000-0000-4000-8000-000000000001',
  20, 12, 'Terraza', 4
);
select is((select count(*) from s14_bulk), 12::bigint, 'bulk creation creates all twelve tables');
select is(
  (
    select count(distinct encode(table_record.qr_token_hash, 'hex'))
    from public.tables table_record
    join s14_bulk created on created.table_id = table_record.id
  ),
  12::bigint,
  'every bulk-created table receives a distinct active QR hash'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f4000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'tenant_id', 'f4100000-0000-4000-8000-000000000002'
  )::text,
  true
);
select is(
  (select count(*) from public.tables where id = (select table_id from s14_created)),
  0::bigint,
  'another tenant cannot see the created table'
);
select throws_ok(
  format(
    'select public.reveal_table_qr_token(%L::uuid, %L)',
    (select table_id from s14_created), 'Intento cruzado desde otro tenant'
  ),
  'P0001',
  'active QR is not available',
  'another tenant cannot reveal the QR token'
);

select set_config('request.jwt.claims', '{}'::jsonb::text, true);
select throws_ok(
  $$select * from public.create_table_with_assets(
    'f4200000-0000-4000-8000-000000000001',
    'f4300000-0000-4000-8000-000000000001',
    '99', 'Mesa 99', 4
  )$$,
  '42501',
  'active tenant context is required',
  'missing tenant context fails closed'
);

reset role;
select * from finish();
rollback;
