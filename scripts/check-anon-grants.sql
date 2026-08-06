-- Verificación automática de permisos (AGENTS.md §4). Corre contra un
-- esquema recién reconstruido desde las migraciones (sin ejecutar ninguna
-- RPC de runtime), así que sólo refleja lo que las migraciones realmente
-- otorgan/revocan — no depende de acordarse de correr los security
-- advisors a mano. Motivo: OI-031 — create_merchant_account quedó
-- alcanzable por `anon` pese a un `revoke ... from public` explícito,
-- porque este proyecto otorga EXECUTE a `anon`/`authenticated`
-- automáticamente a toda función nueva del esquema public, y revocar de
-- `public` no alcanza a revocar ese grant directo.
--
-- Alcance deliberado: sólo el esquema `public`. PostgREST (la única forma
-- en que el navegador llega a una función) sólo expone `public` — llamar
-- una función `private.*` por nombre vía `.rpc()` falla con "Could not
-- find the function public.X", confirmado en vivo contra el proyecto real
-- durante OI-034. Los grants sobre `private.*` a `anon`/`authenticated`
-- son parte del patrón establecido (un wrapper `security invoker` en
-- public necesita que su rol tenga permiso también sobre la función
-- private.* que llama por dentro — así funcionan enter_table,
-- diner_cart_add_item, etc.) y no son alcanzables por ningún cliente real
-- de todos modos — revisarlos no aporta señal, sólo ruido.

with

-- 1) Ninguna función public.worker_* debe ser alcanzable por anon ni por
--    authenticated — son sólo para el worker con service_role (webhooks,
--    consumidores de cola).
worker_leaks as (
  select routine_schema, routine_name, grantee,
    'función worker_* (sólo service_role) alcanzable por un rol de cliente' as violation
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name like 'worker\_%'
    and grantee in ('anon', 'authenticated')
    and privilege_type = 'EXECUTE'
),

-- 2) Toda función public.* alcanzable por anon debe estar en una de las
--    dos listas de abajo. Si algo nuevo aparece sin estar en ninguna, o es
--    un olvido (agregar el revoke en la misma migración) o es intencional
--    (agregarlo a la lista correspondiente, con una razón).
--
--    a) Rutas del comensal — nunca tiene sesión de Supabase Auth, así que
--       necesitan `anon` a propósito. OI-034, Incrementos 1-5.
diner_facing as (
  select unnest(array[
    'enter_table',
    'verify_table_presence',
    'diner_ordering_availability',
    'diner_bootstrap_menu',
    'diner_cart_add_item',
    'diner_cart_update_item',
    'diner_cart_remove_item',
    'diner_create_checkout_quote',
    'diner_start_payment'
  ]) as routine_name
),
--    b) Pre-existentes de sprints anteriores a OI-034, revisadas el
--       2026-08-06 al construir esta verificación — ninguna es
--       `security definer`, así que corren con los privilegios de quien
--       llama (invoker), no con privilegios elevados; cada una o falla
--       cerrado sin contexto de tenant (`owner_commercial_capabilities`
--       vía `require_tenant_context()`) o no depende de ningún tenant
--       (`recommend_saas_plan`, cálculo puro para la calculadora de plan
--       en el onboarding, antes de que exista sesión) o devuelve un
--       default seguro sin tenant (`table_credit_enabled`, `coalesce(...,
--       false)`). No se tocan como parte de este tramo — quedan
--       documentadas acá para que el chequeo no las marque cada vez.
pre_existing_reviewed as (
  select unnest(array[
    'owner_commercial_capabilities',
    'recommend_saas_plan',
    'table_credit_enabled'
  ]) as routine_name
),
unexpected_anon_public as (
  select rp.routine_schema, rp.routine_name, rp.grantee,
    'función public.* alcanzable por anon sin estar en ninguna lista revisada' as violation
  from information_schema.routine_privileges rp
  left join diner_facing df on df.routine_name = rp.routine_name
  left join pre_existing_reviewed pe on pe.routine_name = rp.routine_name
  where rp.routine_schema = 'public'
    and rp.grantee = 'anon'
    and rp.privilege_type = 'EXECUTE'
    and df.routine_name is null
    and pe.routine_name is null
)

select * from worker_leaks
union all
select * from unexpected_anon_public
order by routine_schema, routine_name;
