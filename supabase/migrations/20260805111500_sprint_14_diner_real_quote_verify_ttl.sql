-- Ayuda TEMPORAL de verificación (OI-034 Incremento 4, 2026-08-05), misma
-- familia que las de la migración anterior: no existe ninguna RPC ni
-- política que permita fijar tenant_checkout_settings.quote_ttl_seconds
-- desde la app todavía (nadie construyó esa pantalla), y hace falta para
-- observar una expiración real de un CheckoutQuote contra la base real en
-- vez de inferirla del código. Se elimina junto con las otras dos apenas se
-- confirma el resultado.
create or replace function private.__oi034_i4_set_quote_ttl(
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

revoke execute on function private.__oi034_i4_set_quote_ttl(uuid, integer)
  from public, anon;
grant execute on function private.__oi034_i4_set_quote_ttl(uuid, integer)
  to authenticated;
