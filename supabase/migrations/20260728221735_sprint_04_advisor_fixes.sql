-- Sprint 4 advisor follow-up:
-- - keep privileged implementations out of the exposed public schema;
-- - expose SECURITY INVOKER wrappers only;
-- - cover every new foreign key used by deletes and operational joins.

alter function public.kds_heartbeat(uuid, uuid, uuid, text)
  set schema private;
alter function private.kds_heartbeat(uuid, uuid, uuid, text)
  rename to kds_heartbeat_impl;

alter function public.kds_disconnect(uuid)
  set schema private;
alter function private.kds_disconnect(uuid)
  rename to kds_disconnect_impl;

alter function public.transition_ticket(uuid, text, integer, text)
  set schema private;
alter function private.transition_ticket(uuid, text, integer, text)
  rename to transition_ticket_impl;

alter function public.record_kds_visible(uuid, uuid, text)
  set schema private;
alter function private.record_kds_visible(uuid, uuid, text)
  rename to record_kds_visible_impl;

alter function public.set_product_availability(uuid, boolean, text)
  set schema private;
alter function private.set_product_availability(uuid, boolean, text)
  rename to set_product_availability_impl;

alter function public.request_ticket_reprint(uuid, text)
  set schema private;
alter function private.request_ticket_reprint(uuid, text)
  rename to request_ticket_reprint_impl;

create function public.kds_heartbeat(
  p_client_id uuid,
  p_venue_id uuid,
  p_station_id uuid default null,
  p_user_agent text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.kds_heartbeat_impl(
    p_client_id, p_venue_id, p_station_id, p_user_agent
  );
$$;

create function public.kds_disconnect(p_client_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.kds_disconnect_impl(p_client_id);
$$;

create function public.transition_ticket(
  p_ticket_id uuid,
  p_expected_state text,
  p_expected_version integer,
  p_target_state text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transition_ticket_impl(
    p_ticket_id, p_expected_state, p_expected_version, p_target_state
  );
$$;

create function public.record_kds_visible(
  p_ticket_id uuid,
  p_client_id uuid,
  p_delivery_source text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_kds_visible_impl(
    p_ticket_id, p_client_id, p_delivery_source
  );
$$;

create function public.set_product_availability(
  p_product_id uuid,
  p_available boolean,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.set_product_availability_impl(
    p_product_id, p_available, p_reason
  );
$$;

create function public.request_ticket_reprint(
  p_print_job_id uuid,
  p_reason text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_ticket_reprint_impl(p_print_job_id, p_reason);
$$;

grant usage on schema private to authenticated;

revoke execute on function private.kds_heartbeat_impl(
  uuid, uuid, uuid, text
) from public, anon;
grant execute on function private.kds_heartbeat_impl(
  uuid, uuid, uuid, text
) to authenticated;

revoke execute on function private.kds_disconnect_impl(uuid)
  from public, anon;
grant execute on function private.kds_disconnect_impl(uuid)
  to authenticated;

revoke execute on function private.transition_ticket_impl(
  uuid, text, integer, text
) from public, anon;
grant execute on function private.transition_ticket_impl(
  uuid, text, integer, text
) to authenticated;

revoke execute on function private.record_kds_visible_impl(uuid, uuid, text)
  from public, anon;
grant execute on function private.record_kds_visible_impl(uuid, uuid, text)
  to authenticated;

revoke execute on function private.set_product_availability_impl(
  uuid, boolean, text
) from public, anon;
grant execute on function private.set_product_availability_impl(
  uuid, boolean, text
) to authenticated;

revoke execute on function private.request_ticket_reprint_impl(uuid, text)
  from public, anon;
grant execute on function private.request_ticket_reprint_impl(uuid, text)
  to authenticated;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.kds_heartbeat(uuid,uuid,uuid,text)',
    'public.kds_disconnect(uuid)',
    'public.transition_ticket(uuid,text,integer,text)',
    'public.record_kds_visible(uuid,uuid,text)',
    'public.set_product_availability(uuid,boolean,text)',
    'public.request_ticket_reprint(uuid,text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;

create index kds_clients_auth_user_fk_idx
  on public.kds_clients (auth_user_id);
create index kds_clients_tenant_station_fk_idx
  on public.kds_clients (tenant_id, station_id)
  where station_id is not null;
create index kds_delivery_metrics_client_fk_idx
  on public.kds_delivery_metrics (tenant_id, first_visible_client_id)
  where first_visible_client_id is not null;
create index print_jobs_requested_by_user_fk_idx
  on public.print_jobs (requested_by_user_id)
  where requested_by_user_id is not null;
create index print_jobs_tenant_endpoint_fk_idx
  on public.print_jobs (tenant_id, printer_endpoint_id)
  where printer_endpoint_id is not null;
create index print_jobs_tenant_reprint_fk_idx
  on public.print_jobs (tenant_id, reprint_of_job_id)
  where reprint_of_job_id is not null;
create index print_jobs_tenant_ticket_fk_idx
  on public.print_jobs (tenant_id, ticket_id);
create index printer_endpoints_tenant_station_fk_idx
  on public.printer_endpoints (tenant_id, station_id)
  where station_id is not null;
