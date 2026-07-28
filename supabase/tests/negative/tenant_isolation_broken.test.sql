begin;

create extension if not exists pgtap with schema extensions;

select plan(1);

insert into auth.users (id, email)
values
  ('20000000-0000-4000-8000-000000000001', 'tenant-a-negative@test.local'),
  ('20000000-0000-4000-8000-000000000002', 'tenant-b-negative@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Tenant A Negative SpA',
    'Tenant A Negative',
    'tenant-a-negative',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Tenant B Negative SpA',
    'Tenant B Negative',
    'tenant-b-negative',
    'active'
  );

insert into public.venues (id, tenant_id, code, name)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'venue-a-negative',
    'Venue A Negative'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'venue-b-negative',
    'Venue B Negative'
  );

insert into public.zones (id, tenant_id, venue_id, code, name)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'zone-a-negative',
    'Zone A Negative'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'zone-b-negative',
    'Zone B Negative'
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

drop policy zones_select_own_tenant on public.zones;

create policy zones_select_insecure_negative_control
on public.zones
for select
to authenticated
using (true);

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

-- This is intentionally the same assertion as the green suite.
-- It must report "not ok" because the unsafe policy exposes both zones.
select is(
  (select count(*) from public.zones),
  1::bigint,
  'tenant A sees exactly its own zone'
);

select * from finish();
rollback;
