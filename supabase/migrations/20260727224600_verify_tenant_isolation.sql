-- Remote-safe verification of the same isolation invariants covered by pgTAP.
-- Test rows are removed before this migration completes.

begin;

-- Make the verification rerunnable if an earlier harness attempt stopped before
-- cleanup. These fixed UUIDs and slugs are reserved exclusively for this test.
delete from public.tables
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.stations
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.zones
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.venues
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.tenant_memberships
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.tenants
where id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from auth.users
where id in (
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002'
);

insert into auth.users (id, email)
values
  ('21000000-0000-4000-8000-000000000001', 'tenant-a-green-run@test.local'),
  ('21000000-0000-4000-8000-000000000002', 'tenant-b-green-run@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    '11000000-0000-4000-8000-000000000001',
    'Tenant A Green Run SpA',
    'Tenant A Green Run',
    'tenant-a-green-run',
    'active'
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    'Tenant B Green Run SpA',
    'Tenant B Green Run',
    'tenant-b-green-run',
    'active'
  );

insert into public.venues (id, tenant_id, code, name, onboarding_status)
values
  (
    '31000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'venue-a-green-run',
    'Venue A Green Run',
    'ready'
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    'venue-b-green-run',
    'Venue B Green Run',
    'ready'
  );

insert into public.zones (id, tenant_id, venue_id, code, name)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'zone-a-green-run',
    'Zone A Green Run'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    'zone-b-green-run',
    'Zone B Green Run'
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
    '51000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'GREEN-A-1',
    'Configurable point A',
    decode(repeat('33', 32), 'hex')
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000002',
    'GREEN-B-1',
    'Configurable point B',
    decode(repeat('44', 32), 'hex')
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
    '61000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'station-a-green-run',
    'Station A Green Run',
    'custom-type-a'
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    'station-b-green-run',
    'Station B Green Run',
    'custom-type-b'
  );

insert into public.tenant_memberships (tenant_id, user_id, role_code, status)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'owner',
    'active'
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    'owner',
    'active'
  );

do $$
begin
  begin
    insert into public.zones (tenant_id, venue_id, code, name)
    values (
      '11000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      'cross-reference-green-run',
      'must fail'
    );
    raise exception 'COMPOSITE FK FAILED: cross-tenant venue was accepted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '21000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '11000000-0000-4000-8000-000000000001'
  )::text,
  true
);

do $$
declare
  visible_count bigint;
  affected_count bigint;
begin
  select count(*) into visible_count from public.zones;
  if visible_count <> 1 then
    raise exception 'RLS GREEN FAILED: tenant A sees % zones', visible_count;
  end if;

  select count(*) into visible_count from public.tables;
  if visible_count <> 1 then
    raise exception 'RLS GREEN FAILED: tenant A sees % service points', visible_count;
  end if;

  select count(*) into visible_count from public.stations;
  if visible_count <> 1 then
    raise exception 'RLS GREEN FAILED: tenant A sees % stations', visible_count;
  end if;

  with changed as (
    update public.zones
    set name = 'must not change'
    where id = '41000000-0000-4000-8000-000000000002'
    returning 1
  )
  select count(*) into affected_count from changed;

  if affected_count <> 0 then
    raise exception 'RLS GREEN FAILED: tenant A updated tenant B';
  end if;

  begin
    insert into public.zones (tenant_id, venue_id, code, name)
    values (
      '11000000-0000-4000-8000-000000000002',
      '31000000-0000-4000-8000-000000000002',
      'cross-tenant-green-run',
      'must fail'
    );
    raise exception 'RLS GREEN FAILED: tenant A inserted into tenant B';
  exception
    when insufficient_privilege then
      null;
  end;

  if private.require_tenant_context()
     <> '11000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'RLS GREEN FAILED: tenant context mismatch';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '21000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  visible_count bigint;
begin
  select count(*) into visible_count from public.zones;
  if visible_count <> 0 then
    raise exception 'FAIL-CLOSED FAILED: missing tenant claim sees % zones', visible_count;
  end if;

  begin
    perform private.require_tenant_context();
    raise exception 'FAIL-CLOSED FAILED: missing tenant context was accepted';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

commit;

begin;
delete from public.tables
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.stations
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.zones
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.venues
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.tenant_memberships
where tenant_id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from public.tenants
where id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002'
);

delete from auth.users
where id in (
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002'
);

commit;
