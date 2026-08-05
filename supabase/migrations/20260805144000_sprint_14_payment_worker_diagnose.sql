-- Ayuda TEMPORAL de diagnóstico (Incremento 5, 2026-08-05): el cron no
-- estaba entregando el webhook dentro de la ventana esperada. Se agrega
-- para invocar el disparo manualmente como dueño y leer el resultado real
-- de pg_net, ya que cron.job_run_details/net._http_response no son
-- consultables directo por authenticated. Se elimina apenas se diagnostica.
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

  perform pg_sleep(3);

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

revoke execute on function public.__oi034_i5_diagnose_payment_worker() from public, anon;
grant execute on function public.__oi034_i5_diagnose_payment_worker() to authenticated;
