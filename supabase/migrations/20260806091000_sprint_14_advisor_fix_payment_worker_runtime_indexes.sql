-- Fix encontrado corriendo los performance advisors sobre el tramo de
-- OI-034: private.payment_worker_runtime tiene tres foreign keys hacia
-- vault.secrets sin índice cubriente. La tabla es un singleton (una sola
-- fila posible, primary key en la columna booleana), así que el impacto
-- real es ~cero — pero su hermana tax_worker_runtime (mismo patrón,
-- Sprint 7) ya tiene estos índices, así que se agregan por consistencia
-- con lo ya establecido. Sin cambio de comportamiento.
create index payment_worker_runtime_anon_key_secret_id_idx
on private.payment_worker_runtime (anon_key_secret_id);

create index payment_worker_runtime_cron_secret_id_idx
on private.payment_worker_runtime (cron_secret_id);

create index payment_worker_runtime_webhook_secret_id_idx
on private.payment_worker_runtime (webhook_secret_id);
