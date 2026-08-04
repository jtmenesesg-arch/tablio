-- OI-034 Incremento 3: carrito real del comensal.
--
-- carts/cart_items ya existían completos desde Sprint 2 (estado, triggers de
-- transición, FK a diner_device_sessions agregada en Sprint 3) pero ninguna
-- RPC los tocaba nunca desde un cliente: RLS deja a `authenticated` sólo
-- SELECT y a `anon` nada en absoluto (ver Sprint 2), así que hoy sólo
-- funciones `security definer` pueden escribir ahí. Se sigue el mismo molde
-- que Incrementos 1 y 2: `require_diner_device_session` revalida la sesión
-- en cada RPC de mutación (sin p_table_id — igual que diner_bootstrap_menu,
-- porque el cliente nunca reclama una mesa distinta a la de su propia
-- sesión; ese cruce sólo tenía sentido para enter_table, que sí valida un
-- QR recién escaneado).
--
-- Decisión de diseño: carts.device_reference_hash (mecanismo de Sprint 2,
-- previo a diner_device_sessions) se sigue poblando, pero derivado
-- determinísticamente de diner_device_session_id (sha256 de su UUID) en vez
-- de un fingerprint de dispositivo aparte. Así el UNIQUE existente
-- (tenant_id, table_session_id, device_reference_hash) sigue dando
-- exactamente un carrito por sesión de comensal por sesión de mesa, sin
-- migrar columnas ni relajar el constraint.
--
-- Fuera de alcance a propósito: invitación a otra mesa, premio de fidelidad
-- y upsell en el carrito (existen columnas/RPCs parciales de sprints
-- anteriores para algunos de estos, pero apuntan a otro mecanismo de
-- identidad y no se conectan aquí). El carrito real de este incremento es
-- sólo producto + variante + cantidad + nota — lo mínimo para que exista un
-- pedido de verdad en el Incremento 4.

-- private.diner_cart_view: sólo lectura, nunca crea nada. Si el comensal
-- todavía no agregó nada, no hay fila en `carts` y se devuelve un carrito
-- vacío — cargar la carta no debe crear carritos huérfanos.
create or replace function private.diner_cart_view(
  p_tenant_id uuid,
  p_table_session_id uuid,
  p_diner_device_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_cart_id uuid;
  lines_json jsonb;
  subtotal bigint;
begin
  select id into found_cart_id
  from public.carts
  where tenant_id = p_tenant_id
    and table_session_id = p_table_session_id
    and diner_device_session_id = p_diner_device_session_id;

  if found_cart_id is null then
    return jsonb_build_object('id', 'real-cart-pending', 'lines', '[]'::jsonb, 'subtotalClp', 0);
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', ci.id,
      'productId', ci.product_id,
      'productName', p.name,
      'variantId', ci.variant_id,
      'variantName', v.name,
      'quantity', ci.quantity,
      'note', ci.customer_note,
      'unitPriceClp', p.unit_price_clp + coalesce(v.price_delta_clp, 0),
      'lineTotalClp', ci.quantity * (p.unit_price_clp + coalesce(v.price_delta_clp, 0))
    ) order by ci.created_at), '[]'::jsonb),
    coalesce(sum(ci.quantity * (p.unit_price_clp + coalesce(v.price_delta_clp, 0))), 0)
  into lines_json, subtotal
  from public.cart_items ci
  join public.products p on p.tenant_id = ci.tenant_id and p.id = ci.product_id
  left join public.product_variants v on v.tenant_id = ci.tenant_id and v.id = ci.variant_id
  where ci.tenant_id = p_tenant_id and ci.cart_id = found_cart_id;

  return jsonb_build_object('id', found_cart_id, 'lines', lines_json, 'subtotalClp', subtotal);
end;
$$;

revoke execute on function private.diner_cart_view(uuid, uuid, uuid)
  from public, anon, authenticated;

-- private.diner_bootstrap_payload: compone lo que ya armaba
-- diner_bootstrap_menu (carta + venue + sesión + propinas) más el carrito
-- real — un solo lugar para el shape completo que espera el cliente,
-- reusado por el bootstrap de sólo lectura y por cada RPC de mutación del
-- carrito, para que cada una devuelva el estado fresco en la misma ida y
-- vuelta (mismo patrón que ya usaba diner_bootstrap_menu).
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

  return menu || jsonb_build_object(
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
end;
$$;

revoke execute on function private.diner_bootstrap_payload(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

-- diner_bootstrap_menu ahora delega en el helper de arriba en vez de armar
-- su propio jsonb — mismo comportamiento de antes más el carrito real
-- (antes siempre vacío en el cliente; ahora refleja lo que el comensal ya
-- había agregado, incluso después de recargar la página).
create or replace function private.diner_bootstrap_menu(p_session_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_row record;
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  return private.diner_bootstrap_payload(
    session_row.tenant_id, session_row.table_session_id, session_row.table_id,
    session_row.session_id, session_row.alias, session_row.display_name
  );
end;
$$;

-- private.diner_cart_add_item: agrega o fusiona una línea. Rechazo de
-- negocio esperado (producto agotado, sin stock, checkout ya empezado) se
-- devuelve como {ok:false, code} en vez de lanzar excepción — mismo patrón
-- que enter_table (Incremento 1), para no repetir el bug de esa vez
-- (raise exception deshace también los inserts hechos antes en la misma
-- transacción).
create or replace function private.diner_cart_add_item(
  p_session_token text,
  p_product_id uuid,
  p_quantity integer,
  p_variant_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_row record;
  product_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  clean_note text;
  found_cart_id uuid;
  found_cart_state text;
  existing_line public.cart_items%rowtype;
  target_quantity integer;
  available_qty integer;
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  if p_quantity is null or p_quantity < 1 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;

  clean_note := nullif(btrim(coalesce(p_note, '')), '');
  if clean_note is not null and length(clean_note) > 140 then
    clean_note := left(clean_note, 140);
  end if;

  select * into product_row
  from public.products
  where tenant_id = session_row.tenant_id and id = p_product_id and active;

  if product_row.id is null or not product_row.available_for_order then
    return jsonb_build_object('ok', false, 'code', 'product_unavailable');
  end if;

  if p_variant_id is not null then
    select * into variant_row
    from public.product_variants
    where tenant_id = session_row.tenant_id and id = p_variant_id
      and product_id = p_product_id and active;
    if variant_row.id is null then
      return jsonb_build_object('ok', false, 'code', 'product_unavailable');
    end if;
  end if;

  insert into public.carts as c (
    tenant_id, table_session_id, device_reference_hash, diner_device_session_id, state
  ) values (
    session_row.tenant_id, session_row.table_session_id,
    extensions.digest(session_row.session_id::text, 'sha256'),
    session_row.session_id, 'open'
  )
  on conflict (tenant_id, table_session_id, device_reference_hash)
  do update set updated_at = clock_timestamp()
  returning c.id, c.state into found_cart_id, found_cart_state;

  if found_cart_state <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'cart_not_open');
  end if;

  select * into existing_line
  from public.cart_items
  where tenant_id = session_row.tenant_id
    and cart_id = found_cart_id
    and product_id = p_product_id
    and variant_id is not distinct from p_variant_id
    and customer_note is not distinct from clean_note
  for update;

  target_quantity := coalesce(existing_line.quantity, 0) + p_quantity;

  if product_row.track_stock then
    select coalesce(inv.on_hand_quantity - inv.reserved_quantity, 0) into available_qty
    from public.inventory_levels inv
    where inv.tenant_id = session_row.tenant_id and inv.product_id = product_row.id;
    if target_quantity > coalesce(available_qty, 0) then
      return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
    end if;
  end if;

  if existing_line.id is not null then
    update public.cart_items set quantity = target_quantity
    where tenant_id = session_row.tenant_id and id = existing_line.id;
  else
    insert into public.cart_items (tenant_id, cart_id, product_id, variant_id, quantity, customer_note)
    values (session_row.tenant_id, found_cart_id, p_product_id, p_variant_id, p_quantity, clean_note);
  end if;

  return jsonb_build_object('ok', true) || private.diner_bootstrap_payload(
    session_row.tenant_id, session_row.table_session_id, session_row.table_id,
    session_row.session_id, session_row.alias, session_row.display_name
  );
end;
$$;

revoke execute on function private.diner_cart_add_item(text, uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function private.diner_cart_add_item(text, uuid, integer, uuid, text)
  to anon, authenticated;

create or replace function public.diner_cart_add_item(
  p_session_token text,
  p_product_id uuid,
  p_quantity integer,
  p_variant_id uuid default null,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.diner_cart_add_item(p_session_token, p_product_id, p_quantity, p_variant_id, p_note);
$$;

revoke execute on function public.diner_cart_add_item(text, uuid, integer, uuid, text) from public;
grant execute on function public.diner_cart_add_item(text, uuid, integer, uuid, text) to anon, authenticated;

-- private.diner_cart_update_item: cambia cantidad; 0 elimina la línea
-- (mismo comportamiento que el store demo). El join a carts confirma que la
-- línea pertenece al carrito DE ESTA sesión de comensal, no sólo al mismo
-- tenant/mesa — es la garantía de "cada persona paga lo suyo" a nivel de
-- función, no sólo de UI.
create or replace function private.diner_cart_update_item(
  p_session_token text,
  p_line_id uuid,
  p_quantity integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_row record;
  line_row record;
  product_row public.products%rowtype;
  available_qty integer;
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  if p_quantity is null or p_quantity < 0 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;

  select ci.id, ci.product_id, c.state as cart_state
  into line_row
  from public.cart_items ci
  join public.carts c on c.tenant_id = ci.tenant_id and c.id = ci.cart_id
  where ci.tenant_id = session_row.tenant_id
    and ci.id = p_line_id
    and c.diner_device_session_id = session_row.session_id
  for update of ci;

  if line_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'line_not_found');
  end if;
  if line_row.cart_state <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'cart_not_open');
  end if;

  if p_quantity = 0 then
    delete from public.cart_items
    where tenant_id = session_row.tenant_id and id = p_line_id;
  else
    select * into product_row
    from public.products
    where tenant_id = session_row.tenant_id and id = line_row.product_id and active;

    if product_row.id is null or not product_row.available_for_order then
      return jsonb_build_object('ok', false, 'code', 'product_unavailable');
    end if;

    if product_row.track_stock then
      select coalesce(inv.on_hand_quantity - inv.reserved_quantity, 0) into available_qty
      from public.inventory_levels inv
      where inv.tenant_id = session_row.tenant_id and inv.product_id = product_row.id;
      if p_quantity > coalesce(available_qty, 0) then
        return jsonb_build_object('ok', false, 'code', 'insufficient_stock');
      end if;
    end if;

    update public.cart_items set quantity = p_quantity
    where tenant_id = session_row.tenant_id and id = p_line_id;
  end if;

  return jsonb_build_object('ok', true) || private.diner_bootstrap_payload(
    session_row.tenant_id, session_row.table_session_id, session_row.table_id,
    session_row.session_id, session_row.alias, session_row.display_name
  );
end;
$$;

revoke execute on function private.diner_cart_update_item(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function private.diner_cart_update_item(text, uuid, integer)
  to anon, authenticated;

create or replace function public.diner_cart_update_item(
  p_session_token text,
  p_line_id uuid,
  p_quantity integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.diner_cart_update_item(p_session_token, p_line_id, p_quantity);
$$;

revoke execute on function public.diner_cart_update_item(text, uuid, integer) from public;
grant execute on function public.diner_cart_update_item(text, uuid, integer) to anon, authenticated;

-- private.diner_cart_remove_item: idempotente a propósito (si la línea ya
-- no está, no es un error) — mismo comportamiento que el store demo.
create or replace function private.diner_cart_remove_item(
  p_session_token text,
  p_line_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_row record;
  found_state text;
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  select c.state into found_state
  from public.cart_items ci
  join public.carts c on c.tenant_id = ci.tenant_id and c.id = ci.cart_id
  where ci.tenant_id = session_row.tenant_id
    and ci.id = p_line_id
    and c.diner_device_session_id = session_row.session_id;

  if found_state is not null and found_state <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'cart_not_open');
  end if;

  delete from public.cart_items ci
  using public.carts c
  where c.tenant_id = ci.tenant_id and c.id = ci.cart_id
    and ci.tenant_id = session_row.tenant_id
    and ci.id = p_line_id
    and c.diner_device_session_id = session_row.session_id;

  return jsonb_build_object('ok', true) || private.diner_bootstrap_payload(
    session_row.tenant_id, session_row.table_session_id, session_row.table_id,
    session_row.session_id, session_row.alias, session_row.display_name
  );
end;
$$;

revoke execute on function private.diner_cart_remove_item(text, uuid)
  from public, anon, authenticated;
grant execute on function private.diner_cart_remove_item(text, uuid)
  to anon, authenticated;

create or replace function public.diner_cart_remove_item(
  p_session_token text,
  p_line_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.diner_cart_remove_item(p_session_token, p_line_id);
$$;

revoke execute on function public.diner_cart_remove_item(text, uuid) from public;
grant execute on function public.diner_cart_remove_item(text, uuid) to anon, authenticated;
