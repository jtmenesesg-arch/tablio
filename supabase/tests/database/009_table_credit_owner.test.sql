begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

-- Intenta dejar el crédito sólo en memoria. Si falla, una caída podría borrar
-- saldo, pagos o fuga mientras el bar todavía tiene exposición.
select has_table(
  'public', 'tenant_table_credit_settings',
  'table-credit settings are durable'
);
select has_table(
  'public', 'table_credit_accounts',
  'table-credit accounts are durable'
);
select has_table(
  'public', 'table_credit_ledger_entries',
  'table-credit ledger is durable'
);
select has_table(
  'public', 'table_credit_losses',
  'credit losses are durable evidence'
);
select has_table(
  'public', 'table_credit_verification_challenges',
  'live verification challenges are durable'
);
select has_table(
  'public', 'cashier_closure_credit_loss_summaries',
  'shift close receives an explicit credit-loss summary'
);

-- Intenta volver crédito y prepago indistinguibles. Si falla, un pedido
-- impago podría parecer pagado o contaminar los cobros de la app.
select has_column(
  'public', 'orders', 'financial_mode',
  'every order declares prepaid or table-credit mode'
);
select has_column(
  'public', 'orders', 'table_credit_account_id',
  'credit orders point to the authorized account'
);
select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'financial_mode'
  ),
  '''prepaid''::text',
  'prepaid remains the default order mode'
);
select col_default_is(
  'public',
  'tenant_table_credit_settings',
  'enabled',
  'false',
  'table credit is disabled by default'
);
select has_view(
  'public',
  'table_credit_operational_summary',
  'cashier and waiter share a server-calculated mixed-mode summary'
);
select has_function(
  'public',
  'owner_dashboard_summary',
  array['uuid', 'timestamp with time zone', 'timestamp with time zone'],
  'owner dashboard figures come from a server function'
);

-- Intenta dejar una tabla financiera sin RLS forzado. Si falla, un filtro
-- olvidado en una ruta podría mostrar crédito de otro local.
select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'tenant_table_credit_settings',
        'table_credit_accounts',
        'table_credit_order_links',
        'table_credit_ledger_entries',
        'table_credit_losses',
        'table_credit_verification_challenges',
        'cashier_closure_credit_loss_summaries'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  7::bigint,
  'all Sprint 9 tenant tables enable and force RLS'
);
select ok(
  coalesce(
    (
      select 'security_invoker=true' = any(relation.reloptions)
      from pg_class relation
      where relation.oid =
        'public.table_credit_operational_summary'::regclass
    ),
    false
  ),
  'mixed-mode operational view keeps caller RLS'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.table_credit_ledger_entries', 'INSERT'
  ),
  'browser cannot append ledger entries directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.open_table_credit(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot open credit'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.close_table_credit_with_loss(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot write off a balance'
);
select has_trigger(
  'public',
  'table_credit_ledger_entries',
  'table_credit_ledger_immutable',
  'ledger evidence cannot be rewritten'
);

insert into auth.users (id, email)
values
  ('92000000-0000-4000-8000-000000000001', 'owner-a-s9@test.local'),
  ('92000000-0000-4000-8000-000000000002', 'waiter-a-s9@test.local'),
  ('92000000-0000-4000-8000-000000000003', 'owner-b-s9@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'Tenant A Sprint 9 SpA', 'Tenant A Sprint 9', 'tenant-a-sprint-9', 'active'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'Tenant B Sprint 9 SpA', 'Tenant B Sprint 9', 'tenant-b-sprint-9', 'active'
  );

insert into public.venues (id, tenant_id, code, name, onboarding_status)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'venue-a-s9', 'Venue A Sprint 9', 'ready'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'venue-b-s9', 'Venue B Sprint 9', 'ready'
  );

insert into public.zones (id, tenant_id, venue_id, code, name)
values
  (
    '94000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    'zone-a-s9', 'Zona A'
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000002',
    'zone-b-s9', 'Zona B'
  );

insert into public.tables (
  id, tenant_id, venue_id, zone_id, table_number,
  display_name, qr_token_hash
)
values
  (
    '95000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    'A-1', 'Mesa A1', decode(repeat('91', 32), 'hex')
  ),
  (
    '95000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    'A-2', 'Mesa A2', decode(repeat('93', 32), 'hex')
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000002',
    '94000000-0000-4000-8000-000000000002',
    'B-1', 'Mesa B1', decode(repeat('92', 32), 'hex')
  );

insert into public.stations (
  id, tenant_id, venue_id, code, name, station_type
)
values
  (
    '96000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    'station-a-s9', 'Barra A', 'bar'
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000002',
    'station-b-s9', 'Barra B', 'bar'
  );

insert into public.employees (
  id, tenant_id, display_name, status, employee_pin_hash
)
values (
  '97000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Caja A', 'active', extensions.digest(convert_to('s9-pin', 'UTF8'), 'sha256')
);

insert into public.table_sessions (id, tenant_id, table_id)
values
  (
    '98000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001'
  ),
  (
    '98000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000003'
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000002'
  );

insert into public.products (
  id, tenant_id, venue_id, default_station_id,
  name, unit_price_clp, tax_rate_bps, track_stock
)
values
  (
    '9b000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    'Producto A', 10000, 1900, false
  ),
  (
    '9b000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000002',
    '96000000-0000-4000-8000-000000000002',
    'Producto B', 10000, 1900, false
  );

insert into public.merchant_accounts (
  id, tenant_id, provider, provider_merchant_id
)
values (
  '9a000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'simulated', 'merchant-s9-a'
);

insert into public.tenant_memberships (
  tenant_id, user_id, role_code, status
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'owner', 'active'
  ),
  (
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    'waiter', 'active'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000003',
    'owner', 'active'
  );

insert into public.cashier_shifts (
  id, tenant_id, venue_id, opened_by_employee_id
)
values (
  '9c000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001'
);

create or replace function private.s9_make_quote(p_suffix text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart_id uuid := gen_random_uuid();
  quote_id uuid;
begin
  insert into public.carts (
    id, tenant_id, table_session_id, device_reference_hash
  )
  values (
    cart_id,
    '91000000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    extensions.digest(convert_to('s9-' || p_suffix, 'UTF8'), 'sha256')
  );
  insert into public.cart_items (tenant_id, cart_id, product_id, quantity)
  values (
    '91000000-0000-4000-8000-000000000001',
    cart_id, '9b000000-0000-4000-8000-000000000001', 1
  );
  quote_id := private.create_checkout_quote(
    '91000000-0000-4000-8000-000000000001',
    cart_id, 0, 's9-quote-' || p_suffix, clock_timestamp()
  );
  return quote_id;
end;
$$;

create temporary table s9_state (
  key text primary key,
  value text not null
);
grant select, insert, update on s9_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta activar crédito automáticamente para un tenant nuevo. Si falla,
-- el producto habría reintroducido riesgo sin una decisión consciente.
select is(
  public.table_credit_enabled(
    '93000000-0000-4000-8000-000000000001'
  ),
  false,
  'new tenant has table credit disabled'
);

-- Intenta abrir crédito como garzón sin permiso explícito. Si falla, una
-- persona operativa podría asumir riesgo financiero sin autorización.
select throws_ok(
  $$
    select public.open_table_credit(
      '93000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      'Intento no autorizado',
      null
    )
  $$,
  '42501',
  'table-credit open permission required',
  'waiter without explicit permission cannot open credit'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000001'
  )::text,
  true
);

do $$
begin
  perform public.configure_table_credit(
    '93000000-0000-4000-8000-000000000001',
    true, 11900, 11900, 180,
    'Política de crédito aprobada para la prueba'
  );
end;
$$;

-- Intenta ignorar la decisión del dueño. Si falla, la configuración podría
-- decir una cosa y la transacción aplicar otra.
select is(
  public.table_credit_enabled(
    '93000000-0000-4000-8000-000000000001'
  ),
  true,
  'explicit configuration enables credit'
);

insert into s9_state (key, value)
select 'account', public.open_table_credit(
  '93000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  'Cliente frecuente autorizado',
  'Reserva Soto'
)::text;

-- Intenta abrir la misma mesa dos veces. Si falla, la exposición se podría
-- duplicar en cuentas paralelas invisibles entre sí.
select throws_ok(
  $$
    select public.open_table_credit(
      '93000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      'Segunda apertura',
      null
    )
  $$,
  '23505',
  null,
  'one session cannot have two live credit accounts'
);

reset role;
insert into s9_state (key, value)
values
  ('credit_quote', private.s9_make_quote('credit-1')::text),
  ('credit_quote_2', private.s9_make_quote('credit-2')::text);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000001'
  )::text,
  true
);

insert into s9_state (key, value)
select 'credit_order', public.create_table_credit_order(
  (select value::uuid from s9_state where key = 'account'),
  (select value::uuid from s9_state where key = 'credit_quote'),
  'credit-order-idempotency-1'
)::text;

-- Intenta exigir pago al modo excepción ya autorizado. Si falla, el crédito
-- no podría cumplir su única función.
select ok(
  exists (
    select 1
    from public.orders order_record
    where order_record.id =
      (select value::uuid from s9_state where key = 'credit_order')
      and order_record.financial_mode = 'table_credit'
      and order_record.payment_id is null
      and order_record.current_state = 'confirmed'
  ),
  'authorized credit order reaches confirmed without provider payment'
);

-- Intenta crear producción parcial. Si falla, un pedido a crédito podría
-- quedar cobrado como saldo pero sin comanda.
select is(
  (
    select count(*)
    from public.tickets
    where order_id =
      (select value::uuid from s9_state where key = 'credit_order')
  ),
  1::bigint,
  'credit order creates its station ticket atomically'
);
reset role;
select is(
  (
    select count(*)
    from public.outbox_messages
    where aggregate_id =
      (select value::uuid from s9_state where key = 'credit_order')
  ),
  3::bigint,
  'credit order commits KDS print and tax durable effects'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta abrir otra mesa cuando el local ya llegó al techo. Si falla, el
-- límite dejaría entrar nuevas excepciones aunque ya no queda exposición.
select throws_ok(
  $$
    select public.open_table_credit(
      '93000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000003',
      '98000000-0000-4000-8000-000000000003',
      'Nueva mesa sobre el límite',
      null
    )
  $$,
  '23514',
  'venue credit exposure limit reached',
  'venue ceiling blocks opening another table credit'
);

-- Intenta repetir un envío después de una caída. Si falla, la mesa pagaría
-- dos veces el mismo pedido y cocina recibiría un duplicado.
select is(
  public.create_table_credit_order(
    (select value::uuid from s9_state where key = 'account'),
    (select value::uuid from s9_state where key = 'credit_quote'),
    'credit-order-idempotency-1'
  ),
  (select value::uuid from s9_state where key = 'credit_order'),
  'repeated idempotency key returns the original credit order'
);
select is(
  (
    select count(*)
    from public.table_credit_ledger_entries
    where account_id =
      (select value::uuid from s9_state where key = 'account')
      and entry_type = 'charge'
  ),
  1::bigint,
  'duplicate delivery creates one credit charge'
);

-- Intenta superar el límite en medio del servicio. Si falla, pedidos ya
-- aceptados se honran, pero no entra una nueva ronda que exceda exposición.
select throws_ok(
  format(
    'select public.create_table_credit_order(%L::uuid,%L::uuid,%L)',
    (select value from s9_state where key = 'account'),
    (select value from s9_state where key = 'credit_quote_2'),
    'credit-order-over-limit'
  ),
  '23514',
  'table credit limit reached',
  'new credit order is blocked at the table exposure limit'
);
select is(
  (
    select count(*)
    from public.orders
    where table_credit_account_id =
      (select value::uuid from s9_state where key = 'account')
  ),
  1::bigint,
  'already accepted credit order remains after limit rejection'
);

-- Intenta mezclar un pago parcial con ventas de la app. Si falla, pagar una
-- parte podría alterar pedidos prepagados de personas de la misma mesa.
insert into s9_state (key, value)
select 'partial_entry', public.record_table_credit_payment(
  (select value::uuid from s9_state where key = 'account'),
  5000, 'in_person', 'credit-partial-1', null
)::text;
select is(
  (
    select outstanding_clp
    from public.table_credit_accounts
    where id = (select value::uuid from s9_state where key = 'account')
  ),
  6900::bigint,
  'partial payment leaves the exact remaining credit balance'
);
select is(
  public.record_table_credit_payment(
    (select value::uuid from s9_state where key = 'account'),
    5000, 'in_person', 'credit-partial-1', null
  ),
  (select value::uuid from s9_state where key = 'partial_entry'),
  'repeated partial payment is idempotent'
);
reset role;
select ok(
  exists (
    select 1
    from public.outbox_messages
    where deduplication_key =
      'credit-payment-receipt:' ||
      (select value from s9_state where key = 'partial_entry')
  ),
  'partial payment queues a durable printable receipt'
);

insert into s9_state (key, value)
values ('prepaid_quote', private.s9_make_quote('prepaid')::text);

do $$
declare
  quote public.checkout_quotes%rowtype;
  intent_id uuid;
begin
  select * into quote
  from public.checkout_quotes
  where id = (select value::uuid from s9_state where key = 'prepaid_quote');
  intent_id := private.create_payment_intent(
    '91000000-0000-4000-8000-000000000001',
    quote.id,
    '9a000000-0000-4000-8000-000000000001',
    's9-prepaid-provider-payment',
    's9-prepaid-intent',
    clock_timestamp()
  );
  perform private.confirm_provider_payment_event(
    '91000000-0000-4000-8000-000000000001',
    'simulated', 's9-prepaid-event', 's9-prepaid-provider-payment',
    'payment.updated', 'approved', quote.total_clp, 'CLP',
    'merchant-s9-a', quote.id, true, true,
    clock_timestamp(), clock_timestamp(), '{}'::jsonb
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta sumar el prepago al saldo del crédito. Si falla, caja y garzón no
-- podrían decir con claridad cuánto ya entró y cuánto sigue expuesto.
select ok(
  (
    select prepaid_by_app_clp > 0 and outstanding_clp = 6900
    from public.table_credit_operational_summary
    where account_id = (select value::uuid from s9_state where key = 'account')
  ),
  'same table shows prepaid app money and credit balance separately'
);

insert into s9_state (key, value)
select 'loss', public.close_table_credit_with_loss(
  (select value::uuid from s9_state where key = 'account'),
  'La mesa se retiró sin completar el pago'
)::text;

-- Intenta esconder una fuga como si fuera un pago. Si falla, el cierre
-- mostrará una cobranza inexistente.
select ok(
  exists (
    select 1
    from public.table_credit_losses loss
    join public.table_credit_accounts account
      on account.tenant_id = loss.tenant_id
     and account.id = loss.account_id
    where loss.id = (select value::uuid from s9_state where key = 'loss')
      and loss.amount_clp = 6900
      and account.status = 'closed_with_loss'
      and account.paid_clp = 5000
      and account.written_off_clp = 6900
      and account.outstanding_clp = 0
  ),
  'manual loss is separate from collected payments'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'table_credit.closed_with_loss'
      and target_id = (select value::uuid from s9_state where key = 'account')
      and reason = 'La mesa se retiró sin completar el pago'
  ),
  'manual loss keeps actor reason and audit evidence'
);

reset role;
insert into public.cashier_shift_closures (
  id, tenant_id, cashier_shift_id, venue_id,
  gross_sales_clp, refunds_clp, chargebacks_clp,
  provider_fees_clp, expected_payout_clp,
  digital_processed_clp, cash_declared_clp,
  tip_earned_clp, tip_refunded_open_shift_clp,
  local_tip_adjustments_clp, order_count, average_ticket_clp,
  open_exception_count, closed_by_employee_id, closed_at
)
values (
  '9d000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  11900, 0, 0, 0, 11900, 11900, 0,
  0, 0, 0, 1, 11900, 0,
  '97000000-0000-4000-8000-000000000001',
  clock_timestamp()
);

-- Intenta cerrar el turno sin la fuga. Si falla, la pérdida quedaría sólo
-- en una pantalla operativa y no en la fotografía financiera.
select ok(
  (
    select credit_loss_clp = 6900
      and prepaid_sales_clp = 11900
      and credit_charged_clp = 11900
      and operational_sales_clp = 23800
      and credit_collected_clp = 5000
      and ending_open_exposure_clp = 0
      and credit_order_count = 1
    from public.cashier_closure_credit_loss_summaries
    where closure_id = '9d000000-0000-4000-8000-000000000001'
  ),
  'shift closure freezes credit sales collections exposure and loss'
);

-- Intenta reescribir la fuga después del cierre. Si falla, el dueño podría
-- ver una tendencia distinta a la evidencia original.
select throws_ok(
  $$
    update public.table_credit_losses
    set amount_clp = 1
    where id = (select value::uuid from s9_state where key = 'loss')
  $$,
  '55000',
  'table-credit evidence is append-only',
  'credit loss cannot be edited'
);

-- Crea una segunda cuenta para probar el comprobante vivo una vez saldada.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000001'
  )::text,
  true
);

-- Intenta contar distinto en cierre y panel. Si falla, el dueño podría ver
-- una venta diferente según la pantalla usada para el mismo intervalo.
select is(
  (
    public.owner_dashboard_summary(
      '93000000-0000-4000-8000-000000000001',
      (
        select opened_at from public.cashier_shifts
        where id = '9c000000-0000-4000-8000-000000000001'
      ),
      (
        select closed_at from public.cashier_shift_closures
        where id = '9d000000-0000-4000-8000-000000000001'
      )
    ) ->> 'sales_clp'
  )::bigint,
  (
    select operational_sales_clp
    from public.cashier_closure_credit_loss_summaries
    where closure_id = '9d000000-0000-4000-8000-000000000001'
  ),
  'owner sales equal the frozen shift closure for the same interval'
);

insert into s9_state (key, value)
select 'settled_account', public.open_table_credit(
  '93000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  'Verificación de pago',
  null
)::text;

reset role;
insert into s9_state (key, value)
values ('settled_quote', private.s9_make_quote('settled')::text);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000001'
  )::text,
  true
);
insert into s9_state (key, value)
select 'settled_order', public.create_table_credit_order(
  (select value::uuid from s9_state where key = 'settled_account'),
  (select value::uuid from s9_state where key = 'settled_quote'),
  'credit-order-settled'
)::text;
do $$
declare
  account public.table_credit_accounts%rowtype;
begin
  select * into account from public.table_credit_accounts
  where id = (select value::uuid from s9_state where key = 'settled_account');
  perform public.record_table_credit_payment(
    account.id, account.outstanding_clp,
    'in_person', 'credit-settle-full', null
  );
end;
$$;
insert into s9_state (key, value)
select 'challenge', public.issue_table_credit_verification(
  (select value::uuid from s9_state where key = 'settled_account')
)::text;

-- Intenta validar un screenshot o número inventado. Si falla, una imagen
-- estática podría hacerse pasar por pago vigente.
select is(
  public.validate_table_credit_verification(
    (select value::uuid from s9_state where key = 'settled_account'),
    '000000'
  ),
  false,
  'invented verification code is rejected by server'
);
select is(
  public.validate_table_credit_verification(
    (select value::uuid from s9_state where key = 'settled_account'),
    (select (value::jsonb ->> 'code') from s9_state where key = 'challenge')
  ),
  true,
  'live code is validated against server state'
);
select is(
  public.validate_table_credit_verification(
    (select value::uuid from s9_state where key = 'settled_account'),
    (select (value::jsonb ->> 'code') from s9_state where key = 'challenge')
  ),
  false,
  'used verification code cannot validate a screenshot twice'
);

-- Intenta calcular el panel en el navegador. Si falla, la historia podría
-- manipular cifras o sumar datos que RLS no autorizó.
select is(
  (
    public.owner_dashboard_summary(
      null,
      clock_timestamp() - interval '1 day',
      clock_timestamp() + interval '1 day'
    ) ->> 'sales_clp'
  )::bigint,
  (
    select sum(total_clp)::bigint
    from public.orders
    where tenant_id = '91000000-0000-4000-8000-000000000001'
  ),
  'owner dashboard sales equal server order truth'
);
select is(
  (
    public.owner_dashboard_summary(
      null,
      clock_timestamp() - interval '1 day',
      clock_timestamp() + interval '1 day'
    ) ->> 'monthly_credit_loss_clp'
  )::bigint,
  6900::bigint,
  'owner dashboard exposes accumulated monthly credit loss'
);
select ok(
  (
    public.owner_dashboard_summary(
      null,
      clock_timestamp() - interval '1 day',
      clock_timestamp() + interval '1 day'
    ) -> 'hourly_sales'
  ) <> '[]'::jsonb,
  'owner dashboard returns a server-calculated hourly series'
);

-- Intenta consultar un local de otro tenant desde la vista consolidada. Si
-- falla, multi-local rompería la frontera principal de aislamiento.
select throws_ok(
  $$
    select public.owner_dashboard_summary(
      '93000000-0000-4000-8000-000000000002',
      clock_timestamp() - interval '1 day',
      clock_timestamp() + interval '1 day'
    )
  $$,
  '42501',
  'venue does not belong to active tenant',
  'owner cannot request another tenant venue'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'tenant_id', '91000000-0000-4000-8000-000000000002'
  )::text,
  true
);

select is(
  (select count(*) from public.table_credit_accounts),
  0::bigint,
  'tenant B sees no credit accounts from tenant A'
);
select is(
  (
    public.owner_dashboard_summary(
      null,
      clock_timestamp() - interval '1 day',
      clock_timestamp() + interval '1 day'
    ) ->> 'sales_clp'
  )::bigint,
  0::bigint,
  'new tenant owner summary starts with zero foreign sales'
);
select is(
  public.table_credit_enabled(
    '93000000-0000-4000-8000-000000000002'
  ),
  false,
  'second new tenant also defaults to prepaid only'
);

-- Intenta abrir la frontera cuando falta tenant en el JWT. Si falla, una
-- request incompleta podría leer exposición financiera.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '92000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*) from public.table_credit_accounts),
  0::bigint,
  'missing tenant claim fails closed for credit accounts'
);

reset role;

-- Intenta crear un pedido confirmado impago sin crédito autorizado. Si
-- falla, el modo excepción habría debilitado el prepago globalmente.
select throws_ok(
  format(
    $sql$
      insert into public.orders (
        tenant_id, checkout_quote_id, payment_id,
        table_credit_account_id, financial_mode,
        table_session_id, table_id, current_state,
        subtotal_clp, discount_clp, tax_clp, tip_clp,
        total_clp, currency, confirmed_at
      )
      values (
        %L::uuid, %L::uuid, null, gen_random_uuid(), 'table_credit',
        %L::uuid, %L::uuid, 'confirmed',
        10000, 0, 1900, 0, 11900, 'CLP', clock_timestamp()
      )
    $sql$,
    '91000000-0000-4000-8000-000000000001',
    (select value from s9_state where key = 'credit_quote_2'),
    '98000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001'
  ),
  '23514',
  'confirmed credit order requires a live authorized table-credit account',
  'unpaid order without authorized credit account is rejected'
);

select * from finish();
rollback;
