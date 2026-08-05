-- Ayudas TEMPORALES de verificación (OI-037, 2026-08-05) — mismas que se
-- usaron y eliminaron en el Incremento 4, recreadas para probar el arreglo
-- de esta misma sesión contra una expiración real. Se eliminan de nuevo en
-- la migración siguiente apenas se confirma el resultado.
create or replace function private.__oi037_set_quote_ttl(
  p_tenant_id uuid,
  p_seconds integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_seconds integer;
begin
  select quote_ttl_seconds into old_seconds
  from public.tenant_checkout_settings
  where tenant_id = p_tenant_id;

  insert into public.tenant_checkout_settings (tenant_id, quote_ttl_seconds)
  values (p_tenant_id, p_seconds)
  on conflict (tenant_id) do update set quote_ttl_seconds = p_seconds, updated_at = clock_timestamp();

  return old_seconds;
end;
$$;

revoke execute on function private.__oi037_set_quote_ttl(uuid, integer) from public, anon;
grant execute on function private.__oi037_set_quote_ttl(uuid, integer) to authenticated;

create or replace function public.__oi037_set_quote_ttl(
  p_tenant_id uuid,
  p_seconds integer
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.__oi037_set_quote_ttl(p_tenant_id, p_seconds);
$$;

revoke execute on function public.__oi037_set_quote_ttl(uuid, integer) from public, anon;
grant execute on function public.__oi037_set_quote_ttl(uuid, integer) to authenticated;

create or replace function private.__oi037_set_product_price(
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

revoke execute on function private.__oi037_set_product_price(uuid, uuid, bigint) from public, anon;
grant execute on function private.__oi037_set_product_price(uuid, uuid, bigint) to authenticated;

create or replace function public.__oi037_set_product_price(
  p_tenant_id uuid,
  p_product_id uuid,
  p_new_price_clp bigint
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.__oi037_set_product_price(p_tenant_id, p_product_id, p_new_price_clp);
$$;

revoke execute on function public.__oi037_set_product_price(uuid, uuid, bigint) from public, anon;
grant execute on function public.__oi037_set_product_price(uuid, uuid, bigint) to authenticated;
