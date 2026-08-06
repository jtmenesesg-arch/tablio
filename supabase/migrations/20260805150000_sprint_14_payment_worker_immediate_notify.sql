-- OI-034: la espera de hasta 60s (el mínimo de pg_cron) es un problema de
-- demo, no de arquitectura — pedido explícito del fundador de acortarla sin
-- tocar el camino del webhook ni la verificación de firma, que quedan
-- exactamente iguales.
--
-- Arreglo: un trigger AFTER INSERT en payment_intents dispara
-- private.invoke_simulated_payment_provider() (la misma función que ya usa
-- pg_cron, sin duplicar nada) apenas se crea la intención de pago — en vez
-- de esperar el próximo tick del minuto. net.http_post es asíncrono
-- (encola el request y sigue, no bloquea la transacción del comensal), así
-- que diner_start_payment sigue devolviendo "pending" de inmediato, igual
-- que antes — el comensal no espera nada distinto, sólo el proveedor
-- simulado reacciona más rápido.
--
-- El cron de 1 minuto NO se quita — queda como red de respaldo real: si el
-- trigger falla en avisar (o si el Edge Function estaba caído en ese
-- instante), el barrido periódico igual reclama el intento pendiente.
-- Es exactamente el patrón "intento inmediato + barrido de respaldo" que
-- ya usan sistemas de colas reales — no un atajo, una segunda capa.
--
-- Nada de esto cambia qué firma el webhook ni cómo se verifica esa firma
-- en apps/web/app/api/payments/webhook — sólo qué tan rápido se avisa al
-- "proveedor" de que hay algo pendiente.
create or replace function private.notify_payment_intent_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_simulated_payment_provider();
  return new;
exception
  when others then
    -- Nunca debe romper la creación de la intención de pago del comensal
    -- por un fallo al avisar al proveedor simulado — el barrido de
    -- pg_cron sigue cubriendo ese caso hasta 60s después.
    return new;
end;
$$;

create trigger payment_intents_notify_provider
after insert on public.payment_intents
for each row
execute function private.notify_payment_intent_created();
