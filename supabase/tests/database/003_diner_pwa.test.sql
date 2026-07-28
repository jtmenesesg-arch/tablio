begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_table('public', 'menu_categories', 'menu categories exist');
select has_table('public', 'diner_device_sessions', 'device sessions exist');
select has_table('public', 'service_action_types', 'service actions exist');
select has_table('public', 'diner_service_requests', 'service requests exist');
select has_table(
  'public',
  'diner_waiter_payment_requests',
  'waiter payment requests exist'
);

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.diner_device_sessions'::regclass
  ),
  true,
  'RLS is enabled on device sessions'
);
select is(
  (
    select relforcerowsecurity
    from pg_class
    where oid = 'public.diner_device_sessions'::regclass
  ),
  true,
  'RLS is forced on device sessions'
);

select has_column(
  'public',
  'products',
  'menu_category_id',
  'products can use tenant categories'
);
select has_column(
  'public',
  'products',
  'allergens',
  'products expose allergens'
);
select has_column(
  'public',
  'orders',
  'order_number',
  'orders have a human order number'
);
select has_column(
  'public',
  'checkout_quotes',
  'diner_alias',
  'quotes freeze the diner alias'
);
select hasnt_column(
  'public',
  'diner_waiter_payment_requests',
  'order_id',
  'waiter payment request does not create an order'
);
select hasnt_column(
  'public',
  'diner_waiter_payment_requests',
  'ticket_id',
  'waiter payment request does not create a ticket'
);
select ok(
  not has_table_privilege('anon', 'public.diner_device_sessions', 'select'),
  'anon cannot read device session token hashes'
);
select ok(
  not has_table_privilege('anon', 'public.orders', 'insert'),
  'anon cannot create orders'
);

insert into public.tenants (id, legal_name, display_name, slug, status)
values (
  'c1000000-0000-4000-8000-000000000001',
  'Sprint 3 Test SpA',
  'Sprint 3 Test',
  'sprint-3-test',
  'active'
);
insert into public.venues (id, tenant_id, code, name)
values (
  'c3000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'test',
  'Test'
);
insert into public.zones (id, tenant_id, venue_id, code, name)
values (
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'main',
  'Main'
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
values (
  'c5000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  '8',
  'Mesa 8',
  decode(repeat('c5', 32), 'hex')
);
insert into public.table_sessions (id, tenant_id, table_id)
values (
  'c9000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001'
);
insert into public.tenant_diner_settings (tenant_id)
values ('c1000000-0000-4000-8000-000000000001');
insert into public.diner_device_sessions (
  id,
  tenant_id,
  table_session_id,
  token_hash,
  alias,
  idle_expires_at,
  absolute_expires_at
)
values (
  'ca000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c9000000-0000-4000-8000-000000000001',
  decode(repeat('ca', 32), 'hex'),
  'Zorro Azul',
  clock_timestamp() + interval '1 minute',
  clock_timestamp() + interval '1 minute'
);

select is(
  (
    select extract(epoch from (idle_expires_at - last_seen_at))::integer
    from public.diner_device_sessions
    where id = 'ca000000-0000-4000-8000-000000000001'
  ),
  14400,
  'default inactivity expiry is exactly 4 hours'
);
select is(
  (
    select extract(epoch from (absolute_expires_at - created_at))::integer
    from public.diner_device_sessions
    where id = 'ca000000-0000-4000-8000-000000000001'
  ),
  43200,
  'default absolute expiry is exactly 12 hours'
);

select * from finish();

rollback;

