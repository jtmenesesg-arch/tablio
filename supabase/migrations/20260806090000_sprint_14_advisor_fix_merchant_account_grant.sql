-- Fix encontrado corriendo los security advisors sobre todo el tramo de
-- OI-034 (2026-08-06, primera corrida posible tras reconectar el MCP a la
-- cuenta correcta — ver OI-031): create_merchant_account quedaba
-- alcanzable por `anon` a nivel de grant. No era explotable — la función
-- exige require_tenant_context()/payments.manage por dentro, así que un
-- anónimo siempre recibía "active tenant context is required" — pero no
-- es mínimo privilegio: nadie anónimo debería poder ni intentar llamarla.
--
-- Causa raíz, la misma en las demás funciones de este tramo que SÍ
-- quedaron bien: este proyecto tiene una regla de privilegios por defecto
-- (`alter default privileges ... grant execute on functions to anon,
-- authenticated`) que le da EXECUTE a `anon` automáticamente a toda
-- función nueva en el esquema public. `revoke ... from public` no la
-- toca — hace falta revocar de `anon` explícitamente, como ya se hizo bien
-- en configure_payment_worker_schedule y owner_kds_tickets_minimal del
-- mismo tramo. Acá se me olvidó.
revoke execute on function public.create_merchant_account(text, text, text)
  from anon;
