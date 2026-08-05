-- OI-034 Incremento 5: agenda del worker que hace de "proveedor de pago
-- simulado" — mismo patrón que tax-document-consumer (Sprint 7):
-- pg_cron invoca una Edge Function cada minuto, con un secreto propio
-- guardado en Vault, nunca en una ruta que el comensal pueda alcanzar.
--
-- Desviación deliberada del patrón de tax-document-consumer, documentada:
-- allá `configure_tax_worker_schedule` queda revocada hasta de
-- `service_role` (sólo el dueño de la base, vía SQL editor, puede
-- activarla). Acá se deja alcanzable por `authenticated` con el permiso
-- `payments.manage` — el mismo que ya exige `create_merchant_account` —
-- porque además de configurar el cron necesito que la función DEVUELVA el
-- secreto HMAC recién generado, una sola vez, para configurarlo también en
-- Vercel (el receptor del webhook corre fuera de Supabase, no puede leer
-- Vault). No hay forma de obtener ese valor de vuelta sin poder invocar la
-- función como el dueño del tenant.

create table private.payment_worker_runtime (
  singleton boolean primary key default true check (singleton),
  project_url text not null check (project_url ~ '^https://'),
  webhook_url text not null check (webhook_url ~ '^https://'),
  anon_key_secret_id uuid not null references vault.secrets (id) on delete restrict,
  cron_secret_id uuid not null references vault.secrets (id) on delete restrict,
  webhook_secret_id uuid not null references vault.secrets (id) on delete restrict,
  cron_job_id bigint,
  configured_at timestamptz not null default now()
);

alter table private.payment_worker_runtime enable row level security;
alter table private.payment_worker_runtime force row level security;
create policy payment_worker_runtime_deny
on private.payment_worker_runtime
as restrictive for all to public
using (false) with check (false);

create or replace function private.validate_payment_worker_secret(p_candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from private.payment_worker_runtime runtime
      join vault.decrypted_secrets secret
        on secret.id = runtime.cron_secret_id
      where runtime.singleton
        and secret.decrypted_secret = p_candidate
        and nullif(p_candidate, '') is not null
    ),
    false
  );
$$;

create function public.worker_validate_payment_cron_secret(p_candidate text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.validate_payment_worker_secret(p_candidate);
$$;

revoke execute on function public.worker_validate_payment_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.worker_validate_payment_cron_secret(text)
  to service_role;

-- El Edge Function necesita saber A DÓNDE postear (webhook_url) y CON QUÉ
-- firmar (webhook_secret) — nunca al revés: el webhook receptor (Next.js)
-- nunca lee esto, tiene su propia copia como variable de entorno.
create or replace function public.worker_get_payment_worker_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'webhookUrl', runtime.webhook_url,
    'webhookSecret', webhook_secret.decrypted_secret
  )
  from private.payment_worker_runtime runtime
  join vault.decrypted_secrets webhook_secret
    on webhook_secret.id = runtime.webhook_secret_id
  where runtime.singleton;
$$;

revoke execute on function public.worker_get_payment_worker_config()
  from public, anon, authenticated;
grant execute on function public.worker_get_payment_worker_config()
  to service_role;

create or replace function private.invoke_simulated_payment_provider()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  runtime private.payment_worker_runtime%rowtype;
  anon_key text;
  cron_secret text;
  request_id bigint;
begin
  select * into runtime from private.payment_worker_runtime where singleton;
  if not found then
    raise exception 'payment worker runtime is not configured' using errcode = '55000';
  end if;

  select decrypted_secret into anon_key
  from vault.decrypted_secrets where id = runtime.anon_key_secret_id;
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets where id = runtime.cron_secret_id;

  select net.http_post(
    url => runtime.project_url || '/functions/v1/simulated-payment-provider',
    headers => jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || anon_key,
      'x-tablio-cron-secret', cron_secret
    ),
    body => '{}'::jsonb,
    timeout_milliseconds => 30000
  ) into request_id;
  return request_id;
end;
$$;

revoke execute on function private.invoke_simulated_payment_provider()
  from public, anon, authenticated;

create or replace function public.configure_payment_worker_schedule(
  p_project_url text,
  p_anon_key text,
  p_webhook_url text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  anon_secret_id uuid;
  cron_secret_id uuid;
  webhook_secret_id uuid;
  webhook_secret_value text;
  job_id bigint;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'payments.manage') then
    raise exception 'payments.manage permission is required' using errcode = '42501';
  end if;

  if p_project_url !~ '^https://'
    or p_webhook_url !~ '^https://'
    or nullif(btrim(p_anon_key), '') is null then
    raise exception 'valid project URL, webhook URL and anon key are required'
      using errcode = '22023';
  end if;

  webhook_secret_value := encode(extensions.gen_random_bytes(32), 'hex');

  select vault.create_secret(
    p_anon_key,
    'tablio_payment_worker_anon_' || floor(extract(epoch from clock_timestamp()))::bigint,
    'JWT publishable key used only by pg_cron to pass the Edge gateway'
  ) into anon_secret_id;
  select vault.create_secret(
    encode(extensions.gen_random_bytes(32), 'hex'),
    'tablio_payment_worker_cron_' || floor(extract(epoch from clock_timestamp()))::bigint,
    'Random second factor validated by the simulated payment provider worker'
  ) into cron_secret_id;
  select vault.create_secret(
    webhook_secret_value,
    'tablio_payment_webhook_' || floor(extract(epoch from clock_timestamp()))::bigint,
    'HMAC secret shared with the payment webhook receiver — same value must be set as PAYMENT_WEBHOOK_SECRET in the Next.js deployment'
  ) into webhook_secret_id;

  perform cron.unschedule(existing.jobid)
  from cron.job existing
  where existing.jobname = 'tablio-simulated-payment-provider';

  select cron.schedule(
    'tablio-simulated-payment-provider',
    '* * * * *',
    'select private.invoke_simulated_payment_provider();'
  ) into job_id;

  insert into private.payment_worker_runtime (
    singleton, project_url, webhook_url, anon_key_secret_id,
    cron_secret_id, webhook_secret_id, cron_job_id, configured_at
  )
  values (
    true, rtrim(p_project_url, '/'), rtrim(p_webhook_url, '/'), anon_secret_id,
    cron_secret_id, webhook_secret_id, job_id, clock_timestamp()
  )
  on conflict (singleton) do update
  set project_url = excluded.project_url,
      webhook_url = excluded.webhook_url,
      anon_key_secret_id = excluded.anon_key_secret_id,
      cron_secret_id = excluded.cron_secret_id,
      webhook_secret_id = excluded.webhook_secret_id,
      cron_job_id = excluded.cron_job_id,
      configured_at = excluded.configured_at;

  -- El valor plano se devuelve UNA vez, al configurar — igual que
  -- cualquier credencial emitida (API key mostrada una sola vez). Después
  -- sólo vive cifrado en Vault, leído sólo por
  -- worker_get_payment_worker_config (service_role).
  return jsonb_build_object('job_id', job_id, 'webhook_secret', webhook_secret_value);
end;
$$;

revoke execute on function public.configure_payment_worker_schedule(text, text, text)
  from public, anon;
grant execute on function public.configure_payment_worker_schedule(text, text, text)
  to authenticated;

comment on function private.invoke_simulated_payment_provider() is
  'Cron-only invocation. Credentials stay encrypted in Vault and never enter user routes.';
