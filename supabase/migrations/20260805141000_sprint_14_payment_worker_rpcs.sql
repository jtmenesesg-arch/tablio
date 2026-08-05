-- OI-034 Incremento 5: RPCs de servicio para el worker que hace de
-- "proveedor de pago simulado" — una Edge Function separada, disparada por
-- pg_cron (nunca por el navegador del comensal), que decide el resultado y
-- llama al webhook real de vuelta. Mismo patrón que tax-document-consumer
-- (Sprint 7): RPCs `service_role`-only, reclamo atómico para no procesar
-- dos veces si el cron se solapa.

create or replace function private.claim_pending_payment_intents(p_limit integer default 20)
returns table(
  intent_id uuid,
  tenant_id uuid,
  provider_payment_id text,
  amount_clp bigint,
  currency text,
  checkout_quote_id uuid,
  provider_merchant_id text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  update public.payment_intents pi
  set provider_notified_at = clock_timestamp()
  from public.merchant_accounts merchant
  where pi.tenant_id = merchant.tenant_id
    and pi.merchant_account_id = merchant.id
    and pi.provider_notified_at is null
    and pi.id in (
      select id from public.payment_intents
      where provider_notified_at is null
      order by created_at
      limit p_limit
      for update skip locked
    )
  returning
    pi.id, pi.tenant_id, pi.provider_payment_id, pi.amount_clp, pi.currency,
    pi.checkout_quote_id, merchant.provider_merchant_id;
end;
$$;

revoke execute on function private.claim_pending_payment_intents(integer)
  from public, anon, authenticated;

create or replace function public.worker_claim_pending_payment_intents(p_limit integer default 20)
returns table(
  intent_id uuid,
  tenant_id uuid,
  provider_payment_id text,
  amount_clp bigint,
  currency text,
  checkout_quote_id uuid,
  provider_merchant_id text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_pending_payment_intents(p_limit);
$$;

revoke execute on function public.worker_claim_pending_payment_intents(integer)
  from public, anon, authenticated;
grant execute on function public.worker_claim_pending_payment_intents(integer)
  to service_role;
