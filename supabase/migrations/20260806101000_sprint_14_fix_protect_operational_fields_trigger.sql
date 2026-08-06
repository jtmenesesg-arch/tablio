-- Bug real encontrado reconectando el KDS (OI-034/OI-038, 2026-08-06): la
-- primera vez que algo llamó a transition_ticket contra la base real en
-- toda la historia del proyecto (Sprint 4 nunca se conectó a ninguna
-- pantalla), falló con 42703 "record new has no field checkout_quote_id".
--
-- private.protect_operational_financial_fields() es una función de
-- trigger compartida por `orders` y `tickets`, escrita como un solo
-- `if A and (...) elsif B and (...)`. NEW/OLD son de tipo `record`
-- (genérico, distinto según la tabla que dispara el trigger) — PL/pgSQL
-- resuelve las referencias a campos de un `record` al preparar la
-- expresión, no sólo al evaluarla, así que el cortocircuito del `and` no
-- evita el error: preparar `new.checkout_quote_id is distinct from
-- old.checkout_quote_id` falla igual aunque `tg_table_name = 'orders'` sea
-- falso, porque ese firing es sobre `tickets`, que no tiene esa columna.
--
-- Arreglo: separar en dos sentencias `if` anidadas en vez de una
-- condición combinada. Un `if` interno sólo se prepara/ejecuta cuando
-- Postgres realmente entra a esa rama — así la expresión con columnas de
-- `orders` nunca se prepara durante un firing sobre `tickets`, y
-- viceversa. La lógica de negocio (qué campos son inmutables en cada
-- tabla) no cambia ni un carácter.
create or replace function private.protect_operational_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'orders' then
    if new.tenant_id is distinct from old.tenant_id
      or new.checkout_quote_id is distinct from old.checkout_quote_id
      or new.payment_id is distinct from old.payment_id
      or new.table_session_id is distinct from old.table_session_id
      or new.table_id is distinct from old.table_id
      or new.subtotal_clp is distinct from old.subtotal_clp
      or new.discount_clp is distinct from old.discount_clp
      or new.tax_clp is distinct from old.tax_clp
      or new.tip_clp is distinct from old.tip_clp
      or new.total_clp is distinct from old.total_clp
      or new.currency is distinct from old.currency
      or new.confirmed_at is distinct from old.confirmed_at
      or new.created_at is distinct from old.created_at
    then
      raise exception 'order financial fields are immutable'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'tickets' then
    if new.tenant_id is distinct from old.tenant_id
      or new.order_id is distinct from old.order_id
      or new.station_id is distinct from old.station_id
      or new.queued_at is distinct from old.queued_at
      or new.created_at is distinct from old.created_at
    then
      raise exception 'ticket routing fields are immutable'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;
