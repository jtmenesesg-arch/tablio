begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (id, email)
values ('b2000000-0000-4000-8000-000000000001', 'sprint2@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values (
  'b1000000-0000-4000-8000-000000000001',
  'Sprint 2 Test SpA', 'Sprint 2 Test', 'sprint-2-test', 'active'
);

insert into public.venues (id, tenant_id, code, name)
values (
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001', 'test', 'Test'
);

insert into public.zones (id, tenant_id, venue_id, code, name)
values (
  'b4000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001', 'main', 'Main'
);

insert into public.tables (
  id, tenant_id, venue_id, zone_id, table_number, display_name, qr_token_hash
)
values (
  'b5000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  '1', 'Mesa 1', decode(repeat('b1', 32), 'hex')
);

insert into public.stations (
  id, tenant_id, venue_id, code, name, station_type
)
values
  (
    'b6000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'bar', 'Bar', 'bar'
  ),
  (
    'b6000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'kitchen', 'Cocina', 'kitchen'
  );

insert into public.products (
  id, tenant_id, venue_id, default_station_id, name,
  unit_price_clp, tax_rate_bps, track_stock
)
values
  (
    'b7000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000001',
    'Botella limitada', 1000, 1900, true
  ),
  (
    'b7000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000002',
    'Plato sin seguimiento', 2000, 1900, false
  ),
  (
    'b7000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000001',
    'Última botella', 1500, 1900, true
  );

insert into public.inventory_levels (
  id, tenant_id, venue_id, product_id, on_hand_quantity
)
values
  (
    'b8000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000001', 100
  ),
  (
    'b8000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000003', 1
  );

insert into public.table_sessions (id, tenant_id, table_id)
values (
  'b9000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001'
);

insert into public.merchant_accounts (
  id, tenant_id, provider, provider_merchant_id
)
values (
  'ba000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'simulated', 'merchant-sprint2'
);

insert into public.tenant_memberships (tenant_id, user_id, role_code, status)
values (
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'owner', 'active'
);

create or replace function private.s2_test_scenario(
  p_suffix text,
  p_started_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart_id uuid := gen_random_uuid();
  quote_id uuid;
  intent_id uuid;
  payment_id uuid;
begin
  insert into public.carts (
    id, tenant_id, table_session_id, device_reference_hash
  )
  values (
    cart_id,
    'b1000000-0000-4000-8000-000000000001',
    'b9000000-0000-4000-8000-000000000001',
    extensions.digest(convert_to(p_suffix, 'UTF8'), 'sha256')
  );

  insert into public.cart_items (
    tenant_id, cart_id, product_id, quantity
  )
  values
    (
      'b1000000-0000-4000-8000-000000000001',
      cart_id, 'b7000000-0000-4000-8000-000000000001', 1
    ),
    (
      'b1000000-0000-4000-8000-000000000001',
      cart_id, 'b7000000-0000-4000-8000-000000000002', 1
    );

  quote_id := private.create_checkout_quote(
    'b1000000-0000-4000-8000-000000000001',
    cart_id, 0, 'quote-' || p_suffix, p_started_at
  );
  intent_id := private.create_payment_intent(
    'b1000000-0000-4000-8000-000000000001',
    quote_id, 'ba000000-0000-4000-8000-000000000001',
    'payment-' || p_suffix, 'intent-' || p_suffix,
    p_started_at
  );
  select payment.id into payment_id
  from public.payments payment
  where payment.payment_intent_id = intent_id;

  return jsonb_build_object(
    'cart_id', cart_id,
    'quote_id', quote_id,
    'intent_id', intent_id,
    'payment_id', payment_id,
    'provider_payment_id', 'payment-' || p_suffix
  );
end;
$$;

create or replace function private.s2_test_deliver(
  p_scenario jsonb,
  p_event_id text,
  p_status text,
  p_received_at timestamptz default clock_timestamp(),
  p_amount_delta bigint default 0,
  p_merchant_id text default 'merchant-sprint2'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_record public.checkout_quotes%rowtype;
begin
  select quote.* into quote_record
  from public.checkout_quotes quote
  where quote.id = (p_scenario ->> 'quote_id')::uuid;

  return private.confirm_provider_payment_event(
    'b1000000-0000-4000-8000-000000000001',
    'simulated', p_event_id, p_scenario ->> 'provider_payment_id',
    'payment.updated', p_status, quote_record.total_clp + p_amount_delta,
    quote_record.currency, p_merchant_id, quote_record.id,
    true, true, p_received_at, p_received_at,
    jsonb_build_object('test_event_id', p_event_id)
  );
end;
$$;

create temporary table s2_scenarios (
  name text primary key,
  data jsonb not null
);

insert into s2_scenarios values
  ('duplicate', private.s2_test_scenario('duplicate'));

-- Intenta reservar un ítem sin seguimiento; si falla, el menú común bloquearía inventario innecesariamente.
select is(
  (
    select count(*)
    from public.inventory_reservations reservation
    where reservation.checkout_quote_id =
      (select (data ->> 'quote_id')::uuid from s2_scenarios
       where name = 'duplicate')
  ),
  1::bigint,
  'only stock-tracked quote items are reserved'
);

-- Intenta separar el reloj de reserva; si falla, quote y stock podrían vencer en momentos distintos.
select is(
  (
    select extract(epoch from quote.expires_at - quote.created_at)::integer
    from public.checkout_quotes quote
    where quote.id =
      (select (data ->> 'quote_id')::uuid from s2_scenarios
       where name = 'duplicate')
  ),
  600,
  'quote and reservation share the ten-minute quote clock'
);

select private.s2_test_deliver(
  data, 'event-duplicate', 'approved'
)
from s2_scenarios where name = 'duplicate';

select private.s2_test_deliver(
  data, 'event-duplicate', 'approved'
)
from s2_scenarios, generate_series(1, 9)
where name = 'duplicate';

-- Intenta grabar diez veces el mismo webhook; si falla, el historial financiero se duplicaría.
select is(
  (select count(*) from public.provider_payment_events
   where provider_event_id = 'event-duplicate'),
  1::bigint,
  'duplicate provider event is stored once'
);

-- Intenta crear diez pedidos por un cobro; si falla, cocina produciría diez veces.
select is(
  (
    select count(*) from public.orders
    where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'duplicate')
  ),
  1::bigint,
  'duplicate provider event creates one order'
);

-- Intenta perder el ruteo por estación; si falla, barra o cocina no recibirían su comanda.
select is(
  (
    select count(*) from public.tickets ticket
    join public.orders order_record
      on order_record.tenant_id = ticket.tenant_id
     and order_record.id = ticket.order_id
    where order_record.payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'duplicate')
  ),
  2::bigint,
  'one order creates one ticket per station'
);

-- Intenta confirmar sin efectos durables; si falla, impresión o conciliación podrían perderse.
select is(
  (
    select count(*) from public.outbox_messages message
    join public.orders order_record on order_record.id = message.aggregate_id
    where order_record.payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'duplicate')
  ),
  4::bigint,
  'order and four durable effects are committed together'
);

select private.s2_test_deliver(
  data, 'event-old-pending', 'pending', clock_timestamp() + interval '1 second'
)
from s2_scenarios where name = 'duplicate';

-- Intenta degradar un aprobado con un pendiente tardío; si falla, un pedido válido desaparecería.
select is(
  (
    select status from public.payment_current_status
    where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'duplicate')
  ),
  'approved',
  'late pending event does not downgrade an approved payment'
);

insert into s2_scenarios values (
  'expired',
  private.s2_test_scenario('expired', clock_timestamp() - interval '11 minutes')
);
select private.s2_test_deliver(data, 'event-expired', 'approved')
from s2_scenarios where name = 'expired';

-- Intenta producir tras vencer el quote; si falla, se vendería stock que ya fue liberado.
select is(
  (
    select count(*) from public.orders
    where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'expired')
  ),
  0::bigint,
  'approved payment after quote expiry creates no order'
);

-- Intenta enterrar el cobro tardío; si falla, el cajero no sabría que hay un cliente esperando.
select ok(
  exists (
    select 1 from public.reconciliation_exceptions exception
    where exception.payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'expired')
      and exception.exception_type = 'approved_after_quote_expired'
      and exception.priority = 'critical'
      and exception.requires_immediate_action
      and exception.visible_to_cashier
      and exception.decision_required =
        'requiere decisión: reembolsar o producir manualmente'
  ),
  'late approval is an immediate cashier decision'
);

select private.confirm_provider_payment_event(
  'b1000000-0000-4000-8000-000000000001',
  'simulated', 'event-orphan', 'payment-orphan', 'payment.updated',
  'approved', 1000, 'CLP', 'merchant-sprint2', null,
  true, true, clock_timestamp(), clock_timestamp(), '{}'::jsonb
);

-- Intenta producir un pago sin quote; si falla, existiría un pedido sin precio congelado.
select ok(
  not exists (
    select 1 from public.orders order_record
    join public.payments payment on payment.id = order_record.payment_id
    where payment.provider_payment_id = 'payment-orphan'
  )
  and exists (
    select 1 from public.reconciliation_exceptions
    where exception_type = 'provider_payment_without_quote'
      and deduplication_key = 'simulated:payment-orphan'
  ),
  'provider payment without quote becomes an exception'
);

insert into s2_scenarios values
  ('amount', private.s2_test_scenario('amount'));
select private.s2_test_deliver(
  data, 'event-amount', 'approved', clock_timestamp(), 1
)
from s2_scenarios where name = 'amount';

-- Intenta aceptar un monto distinto; si falla, el pedido y el cobro no cuadrarían.
select ok(
  not exists (
    select 1 from public.orders where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'amount')
  )
  and exists (
    select 1 from public.reconciliation_exceptions
    where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'amount')
      and exception_type = 'amount_or_currency_mismatch'
  ),
  'amount mismatch is rejected with an exception'
);

insert into s2_scenarios values
  ('merchant', private.s2_test_scenario('merchant'));
select private.s2_test_deliver(
  data, 'event-merchant', 'approved', clock_timestamp(), 0, 'wrong-merchant'
)
from s2_scenarios where name = 'merchant';

-- Intenta acreditar otro comercio; si falla, un tenant podría producir con dinero ajeno.
select ok(
  not exists (
    select 1 from public.orders where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'merchant')
  )
  and exists (
    select 1 from public.reconciliation_exceptions
    where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'merchant')
      and exception_type = 'merchant_or_tenant_mismatch'
  ),
  'merchant mismatch is rejected with an exception'
);

insert into s2_scenarios values
  ('pending', private.s2_test_scenario('pending'));
select private.s2_test_deliver(data, 'event-pending', 'pending')
from s2_scenarios where name = 'pending';

-- Intenta confirmar con PENDING; si falla, un pago aún incierto llegaría a cocina.
select is(
  (
    select count(*) from public.orders where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'pending')
  ),
  0::bigint,
  'pending provider status never confirms an order'
);

insert into s2_scenarios values
  ('browser', private.s2_test_scenario('browser'));
select private.record_browser_return(
  'b1000000-0000-4000-8000-000000000001',
  (data ->> 'intent_id')::uuid, 'browser-return'
)
from s2_scenarios where name = 'browser';

-- Intenta confirmar desde el retorno web; si falla, el frontend podría fabricar ventas.
select is(
  (
    select count(*) from public.orders where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'browser')
  ),
  0::bigint,
  'browser return never confirms an order'
);

insert into s2_scenarios values
  ('rejected', private.s2_test_scenario('rejected'));
select private.s2_test_deliver(data, 'event-rejected', 'rejected')
from s2_scenarios where name = 'rejected';

-- Intenta retener stock tras rechazo; si falla, una botella quedaría bloqueada hasta vencer.
select ok(
  not exists (
    select 1 from public.inventory_reservations
    where checkout_quote_id =
      (select (data ->> 'quote_id')::uuid from s2_scenarios
       where name = 'rejected')
      and released_at is null
  ),
  'rejected payment releases stock immediately'
);

insert into s2_scenarios values
  ('cancelled', private.s2_test_scenario('cancelled'));
select private.s2_test_deliver(data, 'event-cancelled', 'cancelled')
from s2_scenarios where name = 'cancelled';

-- Intenta retener stock tras cancelación; si falla, un checkout cerrado bloquearía inventario.
select ok(
  not exists (
    select 1 from public.inventory_reservations
    where checkout_quote_id =
      (select (data ->> 'quote_id')::uuid from s2_scenarios
       where name = 'cancelled')
      and released_at is null
  ),
  'cancelled payment releases stock immediately'
);

insert into s2_scenarios values
  ('abandoned', private.s2_test_scenario('abandoned'));
select private.release_checkout(
  'b1000000-0000-4000-8000-000000000001',
  (data ->> 'quote_id')::uuid, 'checkout_abandoned'
)
from s2_scenarios where name = 'abandoned';

-- Intenta retener stock tras abandono; si falla, carritos olvidados agotarían productos.
select ok(
  not exists (
    select 1 from public.inventory_reservations
    where checkout_quote_id =
      (select (data ->> 'quote_id')::uuid from s2_scenarios
       where name = 'abandoned')
      and released_at is null
  ),
  'abandoned checkout releases stock immediately'
);

select private.record_refund(
  'b1000000-0000-4000-8000-000000000001',
  (data ->> 'payment_id')::uuid, 'provider-refund-1',
  'refund-idempotent', 1000, 'completed', 'partial test'
)
from s2_scenarios where name = 'duplicate';
select private.record_refund(
  'b1000000-0000-4000-8000-000000000001',
  (data ->> 'payment_id')::uuid, 'provider-refund-1',
  'refund-idempotent', 1000, 'completed', 'partial test'
)
from s2_scenarios where name = 'duplicate';

-- Intenta duplicar un reembolso repetido; si falla, se devolvería dinero dos veces.
select is(
  (select count(*) from public.refunds
   where idempotency_key = 'refund-idempotent'),
  1::bigint,
  'repeated refund idempotency key creates one refund'
);

-- Intenta perder el estado parcial; si falla, conciliación mostraría un pago totalmente vigente.
select is(
  (
    select status from public.payment_current_status
    where payment_id =
      (select (data ->> 'payment_id')::uuid from s2_scenarios
       where name = 'duplicate')
  ),
  'partially_refunded',
  'partial refund is derived from immutable history'
);

select private.record_settlement(
  'b1000000-0000-4000-8000-000000000001',
  'simulated', 'settlement-different', 10000, 1000, 0, 500,
  8500, 8400, current_date, 'deposit-test', '{}'::jsonb
);
select private.record_settlement(
  'b1000000-0000-4000-8000-000000000001',
  'simulated', 'settlement-different', 10000, 1000, 0, 500,
  8500, 8400, current_date, 'deposit-test', '{}'::jsonb
);

-- Intenta duplicar una diferencia de abono; si falla, el cierre se llenaría de alertas repetidas.
select is(
  (
    select count(*) from public.reconciliation_exceptions
    where exception_type = 'settlement_difference'
      and deduplication_key = 'simulated:settlement-different'
  ),
  1::bigint,
  'settlement difference creates one idempotent exception'
);

-- Intenta insertar un pedido sin aprobado verificable; si falla, el esquema permitiría pedidos falsos.
select throws_ok(
  $$
    insert into public.orders (
      tenant_id, checkout_quote_id, payment_id, table_session_id, table_id,
      subtotal_clp, discount_clp, tax_clp, tip_clp, total_clp,
      confirmed_at
    )
    select
      quote.tenant_id, quote.id, payment.id,
      quote.table_session_id, quote.table_id,
      quote.subtotal_clp, quote.discount_clp, quote.tax_clp,
      quote.tip_clp, quote.total_clp, clock_timestamp()
    from public.checkout_quotes quote
    join public.payments payment
      on payment.tenant_id = quote.tenant_id
     and payment.checkout_quote_id = quote.id
    where quote.id = (
      select (data ->> 'quote_id')::uuid
      from s2_scenarios where name = 'pending'
    )
  $$,
  '23514',
  'confirmed order requires a server-verified approved payment',
  'schema rejects an order without approved payment'
);

-- Intenta cambiar un quote cobrado; si falla, el precio histórico podría reescribirse.
select throws_ok(
  $$
    update public.checkout_quotes
    set tip_clp = tip_clp + 1
    where id = (
      select (data ->> 'quote_id')::uuid
      from s2_scenarios where name = 'duplicate'
    )
  $$,
  '55000',
  'checkout_quotes is append-only or immutable',
  'checkout quote is immutable'
);

insert into public.carts (
  id, tenant_id, table_session_id, device_reference_hash
)
values
  (
    'bb000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b9000000-0000-4000-8000-000000000001',
    decode(repeat('c1', 32), 'hex')
  ),
  (
    'bb000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'b9000000-0000-4000-8000-000000000001',
    decode(repeat('c2', 32), 'hex')
  );
insert into public.cart_items (tenant_id, cart_id, product_id, quantity)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'bb000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000003', 1
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'bb000000-0000-4000-8000-000000000002',
    'b7000000-0000-4000-8000-000000000003', 1
  );
select private.create_checkout_quote(
  'b1000000-0000-4000-8000-000000000001',
  'bb000000-0000-4000-8000-000000000001', 0,
  'last-unit-first', clock_timestamp()
);

-- Intenta vender la última unidad a dos personas; si falla, ambas serían cobrables.
select throws_ok(
  $$
    select private.create_checkout_quote(
      'b1000000-0000-4000-8000-000000000001',
      'bb000000-0000-4000-8000-000000000002', 0,
      'last-unit-second', clock_timestamp()
    )
  $$,
  'P0001',
  'insufficient stock for product b7000000-0000-4000-8000-000000000003',
  'second quote cannot reserve the same last unit'
);

-- Intenta usar tablas temporales/no durables; si falla, un reinicio borraría pedidos confirmados.
select is(
  (
    select relpersistence from pg_class
    where oid = 'public.orders'::regclass
  ),
  'p',
  'orders use permanent durable storage'
);

-- Intenta usar un outbox no durable; si falla, un reinicio perdería efectos comerciales.
select is(
  (
    select relpersistence from pg_class
    where oid = 'public.outbox_messages'::regclass
  ),
  'p',
  'outbox uses permanent durable storage'
);

-- Intenta guardar CLP decimal; si falla, aparecerían redondeos inconsistentes.
select is(
  (
    select format_type(attribute.atttypid, attribute.atttypmod)
    from pg_attribute attribute
    where attribute.attrelid = 'public.checkout_quotes'::regclass
      and attribute.attname = 'total_clp'
  ),
  'bigint',
  'CLP totals are stored as integers'
);

select private.enqueue_pending_outbox(100, clock_timestamp());

-- Intenta perder mensajes antes del consumidor; si falla, el outbox no llegaría a la cola durable.
select ok(
  exists (
    select 1 from public.outbox_messages
    where status = 'queued' and queue_message_id is not null
  ),
  'outbox drain enqueues durable queue messages'
);

insert into public.processed_events (
  tenant_id, consumer_name, event_id, status,
  lock_token, locked_until, started_at, completed_at
)
values (
  'b1000000-0000-4000-8000-000000000001',
  'test-consumer', 'same-event', 'completed',
  gen_random_uuid(), clock_timestamp(), clock_timestamp(), clock_timestamp()
);

-- Intenta reprocesar un evento completado; si falla, el consumidor repetiría impresión o boleta.
select is(
  private.claim_processed_event(
    'b1000000-0000-4000-8000-000000000001',
    'test-consumer', 'same-event'
  ),
  null::uuid,
  'completed consumer event cannot be claimed again'
);

-- Intenta cambiar silenciosamente el backoff aprobado; si falla, reintentos y DLQ no seguirían ADR-000.
select is(
  (
    select array_agg(private.outbox_retry_ceiling_seconds(attempt)
      order by attempt)
    from generate_series(1, 8) attempt
  ),
  array[5, 15, 45, 120, 300, 900, 1800, 3600],
  'retry ceilings match the approved full-jitter policy'
);

-- Intenta dejar RLS apagado; si falla, cualquier JWT podría cruzar tenants.
select is(
  (
    select count(*)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'checkout_quotes', 'payments', 'orders', 'tickets',
        'reconciliation_exceptions', 'outbox_messages'
      )
      and class.relrowsecurity and class.relforcerowsecurity
  ),
  6::bigint,
  'financial tables enable and force RLS'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'b2000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', 'b1000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta leer fuera del tenant por el camino JWT; si falla, RLS expondría dinero ajeno.
select is(
  (
    select count(*) from public.orders
    where tenant_id <> 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'JWT tenant context cannot read another tenant financial row'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'b2000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

-- Intenta leer sin tenant_id; si falla, una request incompleta quedaría abierta.
select is(
  (select count(*) from public.orders),
  0::bigint,
  'JWT without tenant_id fails closed'
);

reset role;

-- Intenta exponer RPCs de worker a usuarios; si falla, service_role sería alcanzable desde una ruta común.
select ok(
  not has_function_privilege(
    'authenticated',
    'public.worker_enqueue_pending_outbox(integer)',
    'EXECUTE'
  ),
  'worker RPC is not executable by authenticated users'
);

select * from finish();
rollback;
