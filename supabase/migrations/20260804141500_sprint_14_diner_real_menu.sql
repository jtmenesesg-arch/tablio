-- OI-034 Incremento 2: carta real de solo lectura para el comensal.
--
-- products/product_variants/menu_categories están cerradas a `anon` (RLS
-- sin políticas para ese rol, además `catalog.read` exige una membresía de
-- tenant que un comensal anónimo nunca tiene). Se resuelve con una RPC
-- `security definer` de sólo lectura, alcanzable únicamente después de
-- validar una sesión real (`require_diner_device_session`) — nunca antes.
--
-- "Disponible" combina available_for_order (el interruptor manual de
-- agotado/disponible que ya usa Configuración) con el stock real cuando el
-- producto controla inventario: si on_hand - reserved <= 0, se muestra
-- agotado aunque nadie lo haya marcado a mano todavía.

create or replace function private.diner_menu(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  categories_json jsonb;
  products_json jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order, c.name
  ), '[]'::jsonb)
  into categories_json
  from public.menu_categories c
  where c.tenant_id = p_tenant_id and c.active;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'categoryId', p.menu_category_id,
      'name', p.name,
      'description', coalesce(p.description, ''),
      'priceClp', p.unit_price_clp,
      'imageAlt', coalesce(nullif(btrim(p.image_alt), ''), p.name),
      'imagePath', p.image_path,
      'allergens', coalesce(p.allergens, '{}'::text[]),
      'available', p.available_for_order and (
        not p.track_stock
        or coalesce(inv.on_hand_quantity - inv.reserved_quantity, 1) > 0
      ),
      'trackStock', p.track_stock,
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'name', v.name, 'priceDeltaClp', v.price_delta_clp
        ) order by v.name)
        from public.product_variants v
        where v.tenant_id = p_tenant_id and v.product_id = p.id and v.active
      ), '[]'::jsonb)
    ) order by p.name
  ), '[]'::jsonb)
  into products_json
  from public.products p
  left join public.inventory_levels inv
    on inv.tenant_id = p.tenant_id and inv.product_id = p.id
  where p.tenant_id = p_tenant_id and p.active;

  return jsonb_build_object('categories', categories_json, 'products', products_json);
end;
$$;

revoke execute on function private.diner_menu(uuid) from public, anon, authenticated;

-- private.diner_menu confía ciegamente en el tenant_id que le pasan — por
-- diseño (es sólo la consulta), NUNCA se expone directo a anon, porque
-- cualquiera podría pedir la carta de cualquier tenant sin sesión. Esta es
-- la única puerta pública: valida la sesión primero y usa el tenant_id que
-- esa validación devuelve, nunca uno que mande el llamador.
create or replace function private.diner_bootstrap_menu(p_session_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_row record;
  menu jsonb;
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  menu := private.diner_menu(session_row.tenant_id);

  return menu || jsonb_build_object(
    'sessionId', session_row.session_id,
    'alias', session_row.alias,
    'displayName', session_row.display_name
  );
end;
$$;

create or replace function public.diner_bootstrap_menu(p_session_token text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.diner_bootstrap_menu(p_session_token);
$$;

revoke execute on function public.diner_bootstrap_menu(text) from public;
grant execute on function public.diner_bootstrap_menu(text) to anon, authenticated;

revoke execute on function private.diner_bootstrap_menu(text)
  from public, anon, authenticated;
grant execute on function private.diner_bootstrap_menu(text) to anon, authenticated;
