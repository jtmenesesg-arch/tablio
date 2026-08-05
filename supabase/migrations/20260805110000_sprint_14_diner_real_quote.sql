-- OI-034 Incremento 4: CheckoutQuote real e inmutable para el comensal.
--
-- private.create_checkout_quote ya existe completa desde Sprint 2 (congela
-- precio/cantidad/impuesto/propina/total, reserva stock con locks fila por
-- fila, idempotencia real por (tenant_id, idempotency_key), TTL desde
-- tenant_checkout_settings, trigger checkout_quotes_immutable/
-- checkout_quote_items_immutable ya vigente) — nunca se modifica acá. Este
-- incremento sólo agrega el wrapper que un comensal real puede llamar: el
-- cart_id NUNCA viene del cliente, siempre se resuelve desde la sesión ya
-- validada (mismo motivo que en el carrito — nadie puede cotizar sobre el
-- carrito de otro porque nadie más puede nombrar ese carrito).

-- private.diner_quote_view: sólo lectura de columnas ya congeladas en
-- checkout_quotes — nunca vuelve a leer products/product_variants, así que
-- un cambio de precio posterior no puede filtrarse acá por diseño de la
-- consulta, no sólo por el trigger de inmutabilidad de la tabla.
create or replace function private.diner_quote_view(p_tenant_id uuid, p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'subtotalClp', q.subtotal_clp,
    'discountClp', q.discount_clp,
    'promotionDiscountClp', q.promotion_discount_clp,
    'upsellIncrementalClp', q.upsell_incremental_clp,
    'taxClp', q.tax_clp,
    'tipClp', q.tip_clp,
    'totalClp', q.total_clp,
    'storedValueAppliedClp', 0,
    'externalPaymentDueClp', q.total_clp,
    'tipRecipient', jsonb_build_object('type', 'team', 'label', 'Equipo'),
    'expiresAt', q.expires_at,
    'status', case when q.expires_at <= clock_timestamp() then 'expired' else 'active' end
  )
  from public.checkout_quotes q
  where q.tenant_id = p_tenant_id and q.id = p_quote_id;
$$;

revoke execute on function private.diner_quote_view(uuid, uuid)
  from public, anon, authenticated;

-- diner_bootstrap_payload ahora también adjunta el quote vigente del
-- comensal, si tiene uno activo (no expirado) para su propio carrito. Un
-- quote expirado se omite del bootstrap a propósito — mismo comportamiento
-- que ya tenía el store demo (session?.quote?.status === "active" ?
-- session.quote : undefined) — para que la pantalla nunca ofrezca pagar
-- algo que ya no es válido.
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

  return payload;
end;
$$;

-- private.diner_create_checkout_quote: única puerta real por la que un
-- comensal cotiza. Resuelve su propio carrito desde la sesión ya validada
-- (nunca recibe cart_id del cliente) y delega en create_checkout_quote sin
-- tocarla. Los rechazos esperados de esa función (carrito vacío/cerrado,
-- ítem cruzado de venue, stock insuficiente) se capturan y se devuelven
-- como {ok:false, code} — igual que enter_table y el carrito — en vez de
-- dejar escapar la excepción como un 500 genérico.
create or replace function private.diner_create_checkout_quote(
  p_session_token text,
  p_tip_clp bigint,
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
  quote_id uuid;
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  if p_tip_clp is null or p_tip_clp < 0 then
    raise exception 'invalid tip' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  select c.id into own_cart_id
  from public.carts c
  where c.tenant_id = session_row.tenant_id
    and c.table_session_id = session_row.table_session_id
    and c.diner_device_session_id = session_row.session_id;

  if own_cart_id is null then
    return jsonb_build_object('ok', false, 'code', 'cart_empty');
  end if;

  begin
    quote_id := private.create_checkout_quote(
      session_row.tenant_id, own_cart_id, p_tip_clp, p_idempotency_key
    );
  exception
    when sqlstate '22023' then
      return jsonb_build_object('ok', false, 'code', 'cart_empty');
    when sqlstate '55000' then
      return jsonb_build_object('ok', false, 'code', 'cart_not_open');
    when sqlstate '23514' then
      return jsonb_build_object('ok', false, 'code', 'cart_unavailable');
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
  end;

  return jsonb_build_object('ok', true) || private.diner_bootstrap_payload(
    session_row.tenant_id, session_row.table_session_id, session_row.table_id,
    session_row.session_id, session_row.alias, session_row.display_name
  );
end;
$$;

revoke execute on function private.diner_create_checkout_quote(text, bigint, text)
  from public, anon, authenticated;
grant execute on function private.diner_create_checkout_quote(text, bigint, text)
  to anon, authenticated;

create or replace function public.diner_create_checkout_quote(
  p_session_token text,
  p_tip_clp bigint,
  p_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.diner_create_checkout_quote(p_session_token, p_tip_clp, p_idempotency_key);
$$;

revoke execute on function public.diner_create_checkout_quote(text, bigint, text) from public;
grant execute on function public.diner_create_checkout_quote(text, bigint, text)
  to anon, authenticated;

-- ── Ayudas TEMPORALES de verificación (OI-034 Incremento 4, 2026-08-05) ──
-- Prueban, contra la base real, dos cosas que ningún camino de la app
-- ejerce hoy: (a) que el trigger de inmutabilidad rechaza un UPDATE incluso
-- viniendo de una función con privilegios de dueño (no sólo que RLS
-- bloquea a `authenticated`, que ya se sabía); (b) que el precio congelado
-- en checkout_quote_items no cambia si el precio del producto cambia
-- después, para lo cual hace falta poder cambiar el precio y no existe
-- todavía ningún `update_product` en la app. Se eliminan en la migración
-- siguiente apenas se confirma el resultado — no quedan en el esquema.
create or replace function private.__oi034_i4_verify_quote_immutable(
  p_tenant_id uuid,
  p_quote_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.checkout_quotes
  set tip_clp = tip_clp + 1
  where tenant_id = p_tenant_id and id = p_quote_id;
  return false; -- si llega acá, NO se bloqueó — falla la verificación
exception
  when others then
    return true; -- el trigger lo rechazó
end;
$$;

revoke execute on function private.__oi034_i4_verify_quote_immutable(uuid, uuid)
  from public, anon;
grant execute on function private.__oi034_i4_verify_quote_immutable(uuid, uuid)
  to authenticated;

create or replace function private.__oi034_i4_set_product_price(
  p_tenant_id uuid,
  p_product_id uuid,
  p_new_price_clp bigint
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_price bigint;
begin
  select unit_price_clp into old_price
  from public.products
  where tenant_id = p_tenant_id and id = p_product_id;

  update public.products
  set unit_price_clp = p_new_price_clp
  where tenant_id = p_tenant_id and id = p_product_id;

  return old_price;
end;
$$;

revoke execute on function private.__oi034_i4_set_product_price(uuid, uuid, bigint)
  from public, anon;
grant execute on function private.__oi034_i4_set_product_price(uuid, uuid, bigint)
  to authenticated;
