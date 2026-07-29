create or replace function public.worker_validate_tax_cron_secret(
  p_candidate text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.validate_tax_worker_secret(p_candidate);
$$;

revoke execute on function public.worker_validate_tax_cron_secret(text)
from public, anon, authenticated;
grant execute on function public.worker_validate_tax_cron_secret(text)
to service_role;

comment on function public.worker_validate_tax_cron_secret(text) is
  'Narrow service-role wrapper: validates the cron second factor without exposing Vault.';
