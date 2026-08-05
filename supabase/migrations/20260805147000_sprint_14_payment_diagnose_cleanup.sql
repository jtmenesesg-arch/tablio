-- OI-034 Incremento 5: limpieza de las ayudas TEMPORALES de diagnóstico
-- usadas para encontrar el grant faltante en
-- private.claim_pending_payment_intents. Confirmado el fix contra la base
-- real (ver docs/BUILD_LOG.md), se eliminan.
drop function if exists public.__oi034_i5_diagnose_payment_worker();
drop function if exists public.__oi034_i5_trigger_payment_worker();
drop function if exists public.__oi034_i5_read_net_response(bigint);
