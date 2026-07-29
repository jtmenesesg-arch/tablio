create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create index tax_worker_runtime_anon_key_secret_id_idx
on private.tax_worker_runtime (anon_key_secret_id);

create index tax_worker_runtime_cron_secret_id_idx
on private.tax_worker_runtime (cron_secret_id);

comment on extension pg_cron is
  'Runs the durable DTE worker every minute without a permanently running server.';
comment on extension pg_net is
  'Invokes the authenticated DTE Edge Function asynchronously from pg_cron.';
