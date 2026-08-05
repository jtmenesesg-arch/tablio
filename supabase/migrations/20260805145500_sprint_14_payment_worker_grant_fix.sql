-- Fix: public.worker_claim_pending_payment_intents es security invoker —
-- el rol que llama (service_role, desde el Edge Function) necesita permiso
-- también sobre la función private.* que llama por dentro (la semántica de
-- invoker se propaga un nivel), no sólo sobre el wrapper público. Se me
-- había olvidado ese grant — encontrado diagnosticando por qué el worker
-- nunca confirmaba el pago (permission denied for function
-- claim_pending_payment_intents).
grant execute on function private.claim_pending_payment_intents(integer)
  to service_role;
