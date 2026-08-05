-- Fix: las tres ayudas TEMPORALES de verificación del Incremento 4 se
-- crearon sólo en el esquema private, sin wrapper en public — PostgREST
-- (y por lo tanto supabase-js .rpc()) sólo expone el esquema public, así
-- que las tres eran inalcanzables por completo. Se agregan los wrappers
-- (security invoker) acá; se eliminan junto con las funciones private en
-- cuanto se confirme el resultado de la verificación, igual que estaba
-- planeado desde el principio.
create or replace function public.__oi034_i4_verify_quote_immutable(
  p_tenant_id uuid,
  p_quote_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.__oi034_i4_verify_quote_immutable(p_tenant_id, p_quote_id);
$$;

revoke execute on function public.__oi034_i4_verify_quote_immutable(uuid, uuid) from public, anon;
grant execute on function public.__oi034_i4_verify_quote_immutable(uuid, uuid) to authenticated;

create or replace function public.__oi034_i4_set_product_price(
  p_tenant_id uuid,
  p_product_id uuid,
  p_new_price_clp bigint
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.__oi034_i4_set_product_price(p_tenant_id, p_product_id, p_new_price_clp);
$$;

revoke execute on function public.__oi034_i4_set_product_price(uuid, uuid, bigint) from public, anon;
grant execute on function public.__oi034_i4_set_product_price(uuid, uuid, bigint) to authenticated;

create or replace function public.__oi034_i4_set_quote_ttl(
  p_tenant_id uuid,
  p_seconds integer
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.__oi034_i4_set_quote_ttl(p_tenant_id, p_seconds);
$$;

revoke execute on function public.__oi034_i4_set_quote_ttl(uuid, integer) from public, anon;
grant execute on function public.__oi034_i4_set_quote_ttl(uuid, integer) to authenticated;
