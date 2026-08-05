-- OI-034 Incremento 5: pago confirmado server-side, para un comensal real.
--
-- Pieza crítica del fundador: la confirmación NUNCA puede originarse en el
-- navegador, ni siquiera con proveedor simulado. Este archivo sólo agrega
-- la mitad que SÍ puede originarse ahí — crear la intención de pago (pedir
-- un número de referencia al proveedor, no una aprobación) — que es
-- exactamente lo que hace cualquier integración real (ej. Transbank
-- devuelve un token/URL de inmediato; la aprobación llega después, aparte).
-- La confirmación en sí vive en migraciones separadas (worker + webhook),
-- nunca en una ruta que el comensal pueda disparar directo.
--
-- private.create_checkout_quote/create_payment_intent/confirm_provider_
-- payment_event (Sprint 2, parcheadas en Sprint 13) no se tocan acá.

-- Falta una pieza de infraestructura que nunca se construyó: no existe
-- ninguna forma de conectar un merchant_account a un tenant todavía (nadie
-- construyó "conectar pasarela" en Configuración). Sin esto,
-- create_payment_intent no puede funcionar para ningún tenant real. RPC
-- mínima, sólo para el dueño, mismo patrón que el resto de Configuración.
create or replace function public.create_merchant_account(
  p_provider text,
  p_provider_merchant_id text,
  p_environment text default 'demo'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  new_id uuid;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'payments.manage') then
    raise exception 'payments.manage permission is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_provider, '')), '') is null
    or nullif(btrim(coalesce(p_provider_merchant_id, '')), '') is null then
    raise exception 'provider and provider_merchant_id are required' using errcode = '22023';
  end if;

  insert into public.merchant_accounts (tenant_id, provider, provider_merchant_id, environment)
  values (selected_tenant_id, p_provider, p_provider_merchant_id, coalesce(p_environment, 'demo'))
  returning id into new_id;

  insert into public.audit_log (tenant_id, actor_type, action, target_type, target_id, after_data)
  values (
    selected_tenant_id, 'employee', 'merchant_account.created', 'merchant_account', new_id,
    jsonb_build_object('provider', p_provider, 'environment', coalesce(p_environment, 'demo'))
  );

  return jsonb_build_object('id', new_id);
end;
$$;

revoke execute on function public.create_merchant_account(text, text, text) from public;
grant execute on function public.create_merchant_account(text, text, text) to authenticated;

-- Marca cuándo el "proveedor" (worker simulado, Edge Function aparte) ya
-- fue notificado de un intent, para no reenviarlo dos veces si el cron
-- corre antes de que el webhook de vuelta complete el ciclo.
alter table public.payment_intents
  add column provider_notified_at timestamptz;

-- private.diner_payment_view: estado del pago/pedido del comensal, sólo
-- lectura. Nunca decide nada — sólo refleja lo que ya quedó confirmado (o
-- no) por el camino real del webhook.
create or replace function private.diner_payment_view(
  p_tenant_id uuid,
  p_cart_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  intent_row record;
  order_row record;
  order_number integer;
  tickets_json jsonb;
  payload jsonb := '{}'::jsonb;
begin
  select pi.id, pi.checkout_quote_id, pi.created_at
  into intent_row
  from public.payment_intents pi
  join public.checkout_quotes q
    on q.tenant_id = pi.tenant_id and q.id = pi.checkout_quote_id
  where pi.tenant_id = p_tenant_id and q.cart_id = p_cart_id
  order by pi.created_at desc
  limit 1;

  if intent_row.id is null then
    return payload;
  end if;

  select o.id, o.total_clp, o.current_state, o.confirmed_at, o.table_session_id
  into order_row
  from public.orders o
  join public.payments p
    on p.tenant_id = o.tenant_id and p.id = o.payment_id
  where o.tenant_id = p_tenant_id and p.payment_intent_id = intent_row.id;

  if order_row.id is null then
    -- Todavía no llega la confirmación real por el camino del webhook.
    return jsonb_build_object('payment', jsonb_build_object(
      'id', intent_row.id, 'status', 'pending'
    ));
  end if;

  select count(*) into order_number
  from public.orders o2
  where o2.tenant_id = p_tenant_id
    and o2.table_session_id = order_row.table_session_id
    and o2.created_at <= (
      select created_at from public.orders where tenant_id = p_tenant_id and id = order_row.id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'stationName', s.name,
    'status', t.current_state,
    'itemNames', (
      select coalesce(array_agg(oi.product_name order by oi.product_name), '{}'::text[])
      from public.ticket_items ti
      join public.order_items oi
        on oi.tenant_id = ti.tenant_id and oi.id = ti.order_item_id
      where ti.tenant_id = p_tenant_id and ti.ticket_id = t.id
    )
  )), '[]'::jsonb)
  into tickets_json
  from public.tickets t
  join public.stations s on s.tenant_id = t.tenant_id and s.id = t.station_id
  where t.tenant_id = p_tenant_id and t.order_id = order_row.id;

  payload := jsonb_build_object(
    'payment', jsonb_build_object('id', intent_row.id, 'status', 'confirmed'),
    'order', jsonb_build_object(
      'id', order_row.id,
      'number', order_number,
      'totalClp', order_row.total_clp,
      'state', order_row.current_state,
      'confirmedAt', order_row.confirmed_at,
      'tickets', tickets_json
    )
  );
  return payload;
end;
$$;

revoke execute on function private.diner_payment_view(uuid, uuid)
  from public, anon, authenticated;

-- diner_bootstrap_payload adjunta el estado del pago/pedido del comensal.
create or replace function private.diner_bootstrap_payload(
  p_tenant_id uuid,
  p_table_session_id uuid,
  p_table_id uuid,
  p_session_id uuid,
  p_alias text,
  p_display_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  menu jsonb;
  venue_row record;
  tip_suggestions integer[];
  cart_json jsonb;
  own_cart_id uuid;
  current_quote_id uuid;
  quote_json jsonb;
  reopen_notice jsonb;
  payment_json jsonb;
  payload jsonb;
begin
  menu := private.diner_menu(p_tenant_id);

  select t.id as table_id, t.display_name as table_name,
         v.id as venue_id, v.name as venue_name
  into venue_row
  from public.tables t
  join public.venues v on v.tenant_id = t.tenant_id and v.id = t.venue_id
  where t.tenant_id = p_tenant_id and t.id = p_table_id;

  select settings.tip_suggestions into tip_suggestions
  from public.tenant_diner_settings settings
  where settings.tenant_id = p_tenant_id;

  cart_json := private.diner_cart_view(p_tenant_id, p_table_session_id, p_session_id);

  select c.id into own_cart_id
  from public.carts c
  where c.tenant_id = p_tenant_id
    and c.table_session_id = p_table_session_id
    and c.diner_device_session_id = p_session_id;

  if own_cart_id is not null then
    select q.id into current_quote_id
    from public.checkout_quotes q
    where q.tenant_id = p_tenant_id and q.cart_id = own_cart_id
    order by q.created_at desc
    limit 1;

    reopen_notice := private.diner_cart_reopen_notice(p_tenant_id, own_cart_id);
    payment_json := private.diner_payment_view(p_tenant_id, own_cart_id);
  end if;

  payload := menu || jsonb_build_object(
    'sessionId', p_session_id,
    'alias', p_alias,
    'displayName', p_display_name,
    'venueId', venue_row.venue_id,
    'venueName', venue_row.venue_name,
    'tableId', venue_row.table_id,
    'tableName', venue_row.table_name,
    'tipSuggestions', coalesce(to_jsonb(tip_suggestions), to_jsonb(array[0, 10, 12])),
    'cart', cart_json
  );

  if current_quote_id is not null then
    quote_json := private.diner_quote_view(p_tenant_id, current_quote_id);
    if quote_json ->> 'status' = 'active' then
      payload := payload || jsonb_build_object('quote', quote_json);
    end if;
  end if;

  if reopen_notice is not null then
    payload := payload || jsonb_build_object('cartReopenedNotice', reopen_notice);
  end if;

  if payment_json is not null and payment_json <> '{}'::jsonb then
    payload := payload || payment_json;
  end if;

  return payload;
end;
$$;

-- private.diner_start_payment: crea la intención de pago (referencia del
-- proveedor + reserva de monto), nunca la confirma. La aprobación llega
-- después, por separado, vía el webhook real (ver migraciones del worker).
create or replace function private.diner_start_payment(
  p_session_token text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_row record;
  own_cart_id uuid;
  active_quote record;
  merchant_row record;
  new_intent_id uuid;
  provider_ref text;
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  select c.id into own_cart_id
  from public.carts c
  where c.tenant_id = session_row.tenant_id
    and c.table_session_id = session_row.table_session_id
    and c.diner_device_session_id = session_row.session_id;

  if own_cart_id is null then
    return jsonb_build_object('ok', false, 'code', 'quote_missing');
  end if;

  select q.* into active_quote
  from public.checkout_quotes q
  where q.tenant_id = session_row.tenant_id and q.cart_id = own_cart_id
  order by q.created_at desc
  limit 1;

  if active_quote.id is null or active_quote.expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'quote_missing');
  end if;

  select * into merchant_row
  from public.merchant_accounts
  where tenant_id = session_row.tenant_id and active
  order by created_at
  limit 1;

  if merchant_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'merchant_not_configured');
  end if;

  -- Referencia de intento asignada localmente (no confirma nada, sólo
  -- identifica el intento — como el token que devuelve Transbank al
  -- iniciar una transacción, antes de cualquier aprobación).
  provider_ref := encode(extensions.gen_random_bytes(16), 'hex');

  begin
    new_intent_id := private.create_payment_intent(
      session_row.tenant_id, active_quote.id, merchant_row.id,
      provider_ref, p_idempotency_key
    );
  exception
    when sqlstate '55000' then
      return jsonb_build_object('ok', false, 'code', 'quote_missing');
    when sqlstate '22023' then
      return jsonb_build_object('ok', false, 'code', 'stock_not_reserved');
  end;

  return jsonb_build_object('ok', true) || private.diner_bootstrap_payload(
    session_row.tenant_id, session_row.table_session_id, session_row.table_id,
    session_row.session_id, session_row.alias, session_row.display_name
  );
end;
$$;

revoke execute on function private.diner_start_payment(text, text)
  from public, anon, authenticated;
grant execute on function private.diner_start_payment(text, text)
  to anon, authenticated;

create or replace function public.diner_start_payment(
  p_session_token text,
  p_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.diner_start_payment(p_session_token, p_idempotency_key);
$$;

revoke execute on function public.diner_start_payment(text, text) from public;
grant execute on function public.diner_start_payment(text, text) to anon, authenticated;
