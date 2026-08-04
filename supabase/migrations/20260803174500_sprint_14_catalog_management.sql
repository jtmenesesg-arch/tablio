-- Tarea 4 (Configuración del local, carta): the owner needs to create menu
-- categories and products from the app. Direct inserts as `authenticated`
-- into products/product_variants/menu_categories/tables are blocked by
-- design: those four tables carry a restrictive `commercial_admin_*_gate`
-- policy (20260729163957_sprint_08_onboarding_billing_superadmin.sql:1057-1078)
-- that calls `private.tenant_admin_writes_allowed()`, a function explicitly
-- revoked from `authenticated` (same migration, line ~1154) so it can only
-- ever be reached through a security-definer RPC running as the function
-- owner — the same reason `create_table_with_assets` exists instead of a
-- plain `.from('tables').insert(...)`. This adds the missing RPCs for
-- categories and products, mirroring that pattern.

create or replace function private.create_menu_category(
  p_venue_id uuid,
  p_code text,
  p_name text,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  category_id uuid;
begin
  if not private.has_permission(tenant, 'catalog.manage') then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_code), '') is null or nullif(btrim(p_name), '') is null then
    raise exception 'category code and name are required' using errcode = '22023';
  end if;

  insert into public.menu_categories (tenant_id, venue_id, code, name, sort_order)
  values (tenant, p_venue_id, btrim(p_code), btrim(p_name), coalesce(p_sort_order, 0))
  returning id into category_id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data
  )
  values (
    tenant, 'user', auth.uid(), 'catalog.menu_category_created', 'menu_category',
    category_id, 'Creación de categoría de carta',
    jsonb_build_object('code', btrim(p_code), 'name', btrim(p_name))
  );

  return category_id;
end;
$$;

create or replace function public.create_menu_category(
  p_venue_id uuid,
  p_code text,
  p_name text,
  p_sort_order integer default 0
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_menu_category(p_venue_id, p_code, p_name, p_sort_order);
$$;

revoke execute on function public.create_menu_category(uuid, text, text, integer) from public, anon;
grant execute on function public.create_menu_category(uuid, text, text, integer) to authenticated;
revoke execute on function private.create_menu_category(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function private.create_menu_category(uuid, text, text, integer) to authenticated;

create or replace function private.create_product(
  p_venue_id uuid,
  p_menu_category_id uuid,
  p_default_station_id uuid,
  p_name text,
  p_description text,
  p_unit_price_clp bigint,
  p_allergens text[] default '{}',
  p_track_stock boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := private.require_tenant_context();
  product_id uuid;
begin
  if not private.has_permission(tenant, 'catalog.manage') then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'product name is required' using errcode = '22023';
  end if;
  if p_unit_price_clp is null or p_unit_price_clp < 0 then
    raise exception 'unit price must be zero or greater' using errcode = '22023';
  end if;

  insert into public.products (
    tenant_id, venue_id, menu_category_id, default_station_id,
    name, description, unit_price_clp, allergens, track_stock
  )
  values (
    tenant, p_venue_id, p_menu_category_id, p_default_station_id,
    btrim(p_name), p_description, p_unit_price_clp,
    coalesce(p_allergens, '{}'), coalesce(p_track_stock, false)
  )
  returning id into product_id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type,
    target_id, reason, after_data
  )
  values (
    tenant, 'user', auth.uid(), 'catalog.product_created', 'product',
    product_id, 'Creación de producto de carta',
    jsonb_build_object('name', btrim(p_name), 'unit_price_clp', p_unit_price_clp)
  );

  return product_id;
end;
$$;

create or replace function public.create_product(
  p_venue_id uuid,
  p_menu_category_id uuid,
  p_default_station_id uuid,
  p_name text,
  p_description text,
  p_unit_price_clp bigint,
  p_allergens text[] default '{}',
  p_track_stock boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_product(
    p_venue_id, p_menu_category_id, p_default_station_id,
    p_name, p_description, p_unit_price_clp, p_allergens, p_track_stock
  );
$$;

revoke execute on function public.create_product(uuid, uuid, uuid, text, text, bigint, text[], boolean) from public, anon;
grant execute on function public.create_product(uuid, uuid, uuid, text, text, bigint, text[], boolean) to authenticated;
revoke execute on function private.create_product(uuid, uuid, uuid, text, text, bigint, text[], boolean) from public, anon, authenticated;
grant execute on function private.create_product(uuid, uuid, uuid, text, text, bigint, text[], boolean) to authenticated;
