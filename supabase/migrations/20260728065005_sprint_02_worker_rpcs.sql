-- Data API entry points for trusted jobs and queue consumers only. User-serving
-- routes never receive service_role and therefore cannot execute these RPCs.
create or replace function public.worker_confirm_provider_payment_event(
  p_tenant_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_event_kind text,
  p_normalized_status text,
  p_amount_clp bigint,
  p_currency text,
  p_provider_merchant_id text,
  p_checkout_quote_id uuid,
  p_signature_verified boolean,
  p_server_verified boolean,
  p_occurred_at timestamptz,
  p_received_at timestamptz,
  p_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_provider_payment_event(
    p_tenant_id, p_provider, p_provider_event_id, p_provider_payment_id,
    p_event_kind, p_normalized_status, p_amount_clp, p_currency,
    p_provider_merchant_id, p_checkout_quote_id, p_signature_verified,
    p_server_verified, p_occurred_at, p_received_at, p_payload
  );
$$;

create or replace function public.worker_enqueue_pending_outbox(
  p_limit integer default 100
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.enqueue_pending_outbox(p_limit, clock_timestamp());
$$;

create or replace function public.worker_complete_outbox_message(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.complete_outbox_message(
    p_tenant_id, p_outbox_message_id, p_queue_message_id,
    p_worker_name, clock_timestamp()
  );
$$;

create or replace function public.worker_fail_outbox_message(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text,
  p_error text
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.fail_outbox_message(
    p_tenant_id, p_outbox_message_id, p_queue_message_id,
    p_worker_name, p_error, clock_timestamp()
  );
$$;

revoke execute on function public.worker_confirm_provider_payment_event(
  uuid, text, text, text, text, text, bigint, text, text, uuid,
  boolean, boolean, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.worker_confirm_provider_payment_event(
  uuid, text, text, text, text, text, bigint, text, text, uuid,
  boolean, boolean, timestamptz, timestamptz, jsonb
) to service_role;

revoke execute on function public.worker_enqueue_pending_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.worker_enqueue_pending_outbox(integer)
  to service_role;

revoke execute on function public.worker_complete_outbox_message(
  uuid, uuid, bigint, text
) from public, anon, authenticated;
grant execute on function public.worker_complete_outbox_message(
  uuid, uuid, bigint, text
) to service_role;

revoke execute on function public.worker_fail_outbox_message(
  uuid, uuid, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.worker_fail_outbox_message(
  uuid, uuid, bigint, text, text
) to service_role;
