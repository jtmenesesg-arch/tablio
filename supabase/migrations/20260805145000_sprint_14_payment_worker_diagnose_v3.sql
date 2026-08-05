-- Ayuda TEMPORAL de diagnóstico, v3: el pg_sleep dentro de la RPC chocaba
-- con el statement_timeout de PostgREST. Se separa en dos llamadas: una
-- dispara y devuelve el request_id al toque, la otra lee la respuesta
-- después, desde el cliente, sin sleep dentro de Postgres.
create or replace function public.__oi034_i5_trigger_payment_worker()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'payments.manage') then
    raise exception 'payments.manage permission is required' using errcode = '42501';
  end if;
  return private.invoke_simulated_payment_provider();
end;
$$;

revoke execute on function public.__oi034_i5_trigger_payment_worker() from public, anon;
grant execute on function public.__oi034_i5_trigger_payment_worker() to authenticated;

create or replace function public.__oi034_i5_read_net_response(p_request_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  response_row record;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'payments.manage') then
    raise exception 'payments.manage permission is required' using errcode = '42501';
  end if;

  select status_code, content, error_msg
  into response_row
  from net._http_response
  where id = p_request_id;

  return jsonb_build_object(
    'status_code', response_row.status_code,
    'content', response_row.content,
    'error_msg', response_row.error_msg
  );
end;
$$;

revoke execute on function public.__oi034_i5_read_net_response(bigint) from public, anon;
grant execute on function public.__oi034_i5_read_net_response(bigint) to authenticated;
