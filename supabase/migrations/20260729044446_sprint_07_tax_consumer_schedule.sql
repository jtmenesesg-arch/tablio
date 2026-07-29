create table private.tax_worker_runtime (
  singleton boolean primary key default true check (singleton),
  project_url text not null check (project_url ~ '^https://'),
  anon_key_secret_id uuid not null references vault.secrets (id) on delete restrict,
  cron_secret_id uuid not null references vault.secrets (id) on delete restrict,
  cron_job_id bigint,
  configured_at timestamptz not null default now()
);

alter table private.tax_worker_runtime enable row level security;
alter table private.tax_worker_runtime force row level security;
create policy tax_worker_runtime_deny
on private.tax_worker_runtime
as restrictive for all to public
using (false) with check (false);

create or replace function private.validate_tax_worker_secret(
  p_candidate text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from private.tax_worker_runtime runtime
      join vault.decrypted_secrets secret
        on secret.id = runtime.cron_secret_id
      where runtime.singleton
        and secret.decrypted_secret = p_candidate
        and nullif(p_candidate, '') is not null
    ),
    false
  );
$$;

create function public.worker_validate_tax_cron_secret(p_candidate text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.validate_tax_worker_secret(p_candidate);
$$;

create or replace function private.invoke_tax_document_consumer()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  runtime private.tax_worker_runtime%rowtype;
  anon_key text;
  cron_secret text;
  request_id bigint;
begin
  select * into runtime
  from private.tax_worker_runtime
  where singleton;
  if not found then
    raise exception 'tax worker runtime is not configured'
      using errcode = '55000';
  end if;

  select decrypted_secret into anon_key
  from vault.decrypted_secrets
  where id = runtime.anon_key_secret_id;
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where id = runtime.cron_secret_id;

  select net.http_post(
    url => runtime.project_url || '/functions/v1/tax-document-consumer',
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

create or replace function private.configure_tax_worker_schedule(
  p_project_url text,
  p_anon_key text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  anon_secret_id uuid;
  cron_secret_id uuid;
  job_id bigint;
begin
  if p_project_url !~ '^https://'
    or nullif(btrim(p_anon_key), '') is null then
    raise exception 'valid project URL and anon key are required'
      using errcode = '22023';
  end if;

  select vault.create_secret(
    p_anon_key,
    'tablio_tax_worker_anon_' || floor(extract(epoch from clock_timestamp()))::bigint,
    'JWT publishable key used only by pg_cron to pass the Edge gateway'
  ) into anon_secret_id;
  select vault.create_secret(
    encode(extensions.gen_random_bytes(32), 'hex'),
    'tablio_tax_worker_cron_' || floor(extract(epoch from clock_timestamp()))::bigint,
    'Random second factor validated by the DTE Edge worker'
  ) into cron_secret_id;

  perform cron.unschedule(existing.jobid)
  from cron.job existing
  where existing.jobname = 'tablio-tax-document-consumer';

  select cron.schedule(
    'tablio-tax-document-consumer',
    '* * * * *',
    'select private.invoke_tax_document_consumer();'
  ) into job_id;

  insert into private.tax_worker_runtime (
    singleton, project_url, anon_key_secret_id,
    cron_secret_id, cron_job_id, configured_at
  )
  values (
    true, rtrim(p_project_url, '/'), anon_secret_id,
    cron_secret_id, job_id, clock_timestamp()
  )
  on conflict (singleton) do update
  set project_url = excluded.project_url,
      anon_key_secret_id = excluded.anon_key_secret_id,
      cron_secret_id = excluded.cron_secret_id,
      cron_job_id = excluded.cron_job_id,
      configured_at = excluded.configured_at;

  return job_id;
end;
$$;

revoke all on table private.tax_worker_runtime
from public, anon, authenticated, service_role;

revoke execute on function
  private.validate_tax_worker_secret(text),
  private.invoke_tax_document_consumer(),
  private.configure_tax_worker_schedule(text,text)
from public, anon, authenticated, service_role;

revoke execute on function public.worker_validate_tax_cron_secret(text)
from public, anon, authenticated;
grant execute on function public.worker_validate_tax_cron_secret(text)
to service_role;

comment on function private.invoke_tax_document_consumer() is
  'Cron-only invocation. Credentials stay encrypted in Vault and never enter user routes.';
