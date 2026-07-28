-- Align the executable retry policy with the approved ADR-000.
create or replace function private.outbox_retry_ceiling_seconds(
  p_attempt integer
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_attempt
    when 1 then 5
    when 2 then 15
    when 3 then 45
    when 4 then 120
    when 5 then 300
    when 6 then 900
    when 7 then 1800
    else 3600
  end;
$$;

create or replace function private.fail_outbox_message(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text,
  p_error text,
  p_now timestamptz default clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_record public.outbox_messages%rowtype;
  next_attempt integer;
  backoff_seconds integer;
begin
  select message.* into message_record
  from public.outbox_messages message
  where message.tenant_id = p_tenant_id
    and message.id = p_outbox_message_id
  for update;

  if not found or message_record.status = 'completed' then
    return 'ignored';
  end if;

  next_attempt := message_record.attempt_count + 1;
  perform pgmq.archive('financial_effects', p_queue_message_id);

  if next_attempt >= message_record.max_attempts then
    perform pgmq.send(
      queue_name => 'financial_effects_dlq',
      msg => jsonb_build_object(
        'outbox_message_id', message_record.id,
        'tenant_id', message_record.tenant_id,
        'topic', message_record.topic,
        'payload', message_record.payload,
        'attempt_count', next_attempt,
        'last_error', p_error
      )
    );

    update public.outbox_messages
    set status = 'dead_letter',
        attempt_count = next_attempt,
        dead_lettered_at = p_now,
        last_error = left(p_error, 4000),
        locked_by = null,
        locked_until = null
    where tenant_id = p_tenant_id and id = p_outbox_message_id;

    insert into public.outbox_delivery_attempts (
      tenant_id, outbox_message_id, attempt_number,
      worker_name, outcome, error_message, occurred_at
    )
    values (
      p_tenant_id, p_outbox_message_id, next_attempt,
      p_worker_name, 'dead_lettered', left(p_error, 4000), p_now
    );
    return 'dead_letter';
  end if;

  -- Full jitter: wait is uniformly selected from zero to the ADR ceiling.
  backoff_seconds := floor(
    random() * (
      private.outbox_retry_ceiling_seconds(next_attempt) + 1
    )
  )::integer;

  update public.outbox_messages
  set status = 'pending',
      attempt_count = next_attempt,
      available_at = p_now + make_interval(secs => backoff_seconds),
      queue_message_id = null,
      last_error = left(p_error, 4000),
      locked_by = null,
      locked_until = null
  where tenant_id = p_tenant_id and id = p_outbox_message_id;

  insert into public.outbox_delivery_attempts (
    tenant_id, outbox_message_id, attempt_number,
    worker_name, outcome, error_message, occurred_at
  )
  values (
    p_tenant_id, p_outbox_message_id, next_attempt,
    p_worker_name, 'failed', left(p_error, 4000), p_now
  );
  return 'retry_scheduled';
end;
$$;

revoke execute on function private.outbox_retry_ceiling_seconds(integer)
  from public, anon, authenticated;
grant execute on function private.outbox_retry_ceiling_seconds(integer)
  to service_role;

revoke execute on function private.fail_outbox_message(
  uuid, uuid, bigint, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function private.fail_outbox_message(
  uuid, uuid, bigint, text, text, timestamptz
) to service_role;
