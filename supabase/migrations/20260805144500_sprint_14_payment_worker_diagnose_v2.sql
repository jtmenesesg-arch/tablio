-- Ayuda TEMPORAL de diagnóstico, continuación de la anterior: 3s no
-- alcanzaba para que pg_net resolviera la respuesta async. Se sube a 8s en
-- una migración nueva, nunca editando la anterior ya aplicada.
create or replace function public.__oi034_i5_diagnose_payment_worker()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  request_id bigint;
  response_row record;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'payments.manage') then
    raise exception 'payments.manage permission is required' using errcode = '42501';
  end if;

  request_id := private.invoke_simulated_payment_provider();

  perform pg_sleep(8);

  select status_code, content, error_msg
  into response_row
  from net._http_response
  where id = request_id;

  return jsonb_build_object(
    'request_id', request_id,
    'status_code', response_row.status_code,
    'content', response_row.content,
    'error_msg', response_row.error_msg
  );
end;
$$;
