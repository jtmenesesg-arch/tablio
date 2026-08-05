-- OI-037: decisión explícita del fundador (2026-08-05) — un CheckoutQuote
-- vencido NO debe dejar al comensal sin poder pedir por el resto de su
-- sesión de dispositivo (hasta 12h). En un bar es normal distraerse, que lo
-- llamen, cerrar la pantalla un rato. El carrito vuelve a 'open' con sus
-- ítems intactos en vez de quedar en 'expired' (terminal).
--
-- Antes de este cambio, `release_expired_quote_stock` (Sprint 2) ponía el
-- carrito directo en 'expired' — el único camino real que producía ese
-- estado hoy (confirmado: el caso 'quote_expired' dentro de
-- `release_checkout` nunca se alcanza, ningún llamador le pasa esa razón
-- literal — se simplifica también acá, ya doblemente muerto).
--
-- El quote vencido en sí NO se toca: sigue inmutable, como quedó. Sólo
-- cambia a qué estado vuelve el carrito que lo originó.

create or replace function private.release_expired_quote_stock(
  p_tenant_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_quote record;
  total_released integer := 0;
begin
  for expired_quote in
    select quote.id, quote.cart_id
    from public.checkout_quotes quote
    where quote.tenant_id = p_tenant_id
      and quote.expires_at <= p_now
      and exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.tenant_id = quote.tenant_id
          and reservation.checkout_quote_id = quote.id
          and reservation.released_at is null
          and reservation.consumed_at is null
      )
    order by quote.expires_at, quote.id
  loop
    total_released := total_released + private.release_quote_stock(
      p_tenant_id,
      expired_quote.id,
      'quote_expired',
      p_now
    );

    -- El carrito vuelve a 'open' (OI-037) — sus cart_items nunca se tocaron,
    -- así que el pedido sigue armado tal como estaba.
    update public.carts
    set state = 'open'
    where tenant_id = p_tenant_id
      and id = expired_quote.cart_id
      and state = 'checkout_started';
  end loop;

  return total_released;
end;
$$;

create or replace function private.release_checkout(
  p_tenant_id uuid,
  p_checkout_quote_id uuid,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
begin
  released := private.release_quote_stock(
    p_tenant_id, p_checkout_quote_id, p_reason, p_now
  );
  perform private.release_stored_value_quote(
    p_tenant_id, p_checkout_quote_id, p_now
  );
  update public.carts cart
  set state = 'open'
  from public.checkout_quotes quote
  where quote.tenant_id = p_tenant_id
    and quote.id = p_checkout_quote_id
    and cart.tenant_id = quote.tenant_id
    and cart.id = quote.cart_id
    and cart.state = 'checkout_started';
  return released;
end;
$$;

-- private.diner_cart_reopen_notice: si el carrito abierto de este comensal
-- tiene un quote vencido como su intento más reciente, arma el aviso claro
-- que pidió el fundador — y compara línea por línea contra los valores
-- congelados de ESE quote vencido (nunca contra otro) para nombrar qué
-- cambió. El quote vencido sólo se lee, nunca se modifica.
create or replace function private.diner_cart_reopen_notice(
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
  last_quote public.checkout_quotes%rowtype;
  unavailable_names text[];
  changed_names text[];
begin
  select * into last_quote
  from public.checkout_quotes
  where tenant_id = p_tenant_id and cart_id = p_cart_id
  order by created_at desc
  limit 1;

  if last_quote.id is null or last_quote.expires_at > clock_timestamp() then
    return null;
  end if;

  select coalesce(array_agg(distinct p.name), '{}'::text[])
  into unavailable_names
  from public.cart_items ci
  join public.products p on p.tenant_id = ci.tenant_id and p.id = ci.product_id
  left join public.inventory_levels inv
    on inv.tenant_id = p.tenant_id and inv.product_id = p.id
  where ci.tenant_id = p_tenant_id and ci.cart_id = p_cart_id
    and not (
      p.available_for_order
      and (not p.track_stock or coalesce(inv.on_hand_quantity - inv.reserved_quantity, 1) > 0)
    );

  select coalesce(array_agg(distinct p.name), '{}'::text[])
  into changed_names
  from public.cart_items ci
  join public.products p on p.tenant_id = ci.tenant_id and p.id = ci.product_id
  left join public.product_variants v on v.tenant_id = ci.tenant_id and v.id = ci.variant_id
  join public.checkout_quote_items qi
    on qi.tenant_id = ci.tenant_id
   and qi.checkout_quote_id = last_quote.id
   and qi.source_cart_item_id = ci.id
  where ci.tenant_id = p_tenant_id and ci.cart_id = p_cart_id
    and qi.unit_price_clp <> (p.unit_price_clp + coalesce(v.price_delta_clp, 0));

  return jsonb_build_object(
    'message', 'Se venció el tiempo para pagar. Tu pedido sigue acá, revísalo y vuelve a pagar.',
    'unavailableProductNames', to_jsonb(unavailable_names),
    'priceChangedProductNames', to_jsonb(changed_names)
  );
end;
$$;

revoke execute on function private.diner_cart_reopen_notice(uuid, uuid)
  from public, anon, authenticated;

-- diner_bootstrap_payload adjunta el aviso cuando corresponde. El quote
-- vencido en sí sigue sin adjuntarse (status ya no es "active"), así que la
-- pantalla nunca ofrece pagar el total viejo — el nuevo se crea recién
-- cuando el comensal vuelve a pedirlo, con los valores vigentes en ese
-- momento.
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

  return payload;
end;
$$;
