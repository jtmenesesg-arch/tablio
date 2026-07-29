select pgmq.create('tax_documents');
select pgmq.create('tax_documents_dlq');

create or replace function private.enqueue_pending_outbox(
  p_limit integer default 100,
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_record public.outbox_messages%rowtype;
  queue_id bigint;
  queue_name text;
  enqueued integer := 0;
begin
  if p_limit not between 1 and 500 then
    raise exception 'invalid outbox batch size' using errcode = '22023';
  end if;

  for message_record in
    select message.*
    from public.outbox_messages message
    where message.status = 'pending'
      and message.available_at <= p_now
    order by message.created_at, message.id
    limit p_limit
    for update skip locked
  loop
    queue_name := case
      when message_record.topic like 'tax_document.%' then 'tax_documents'
      else 'financial_effects'
    end;
    select pgmq.send(
      queue_name => queue_name,
      msg => jsonb_build_object(
        'outbox_message_id', message_record.id,
        'tenant_id', message_record.tenant_id,
        'topic', message_record.topic,
        'deduplication_key', message_record.deduplication_key,
        'payload', message_record.payload
      )
    ) into queue_id;

    update public.outbox_messages
    set status = 'queued', queue_message_id = queue_id
    where tenant_id = message_record.tenant_id and id = message_record.id;
    enqueued := enqueued + 1;
  end loop;
  return enqueued;
end;
$$;

create or replace function private.complete_tax_outbox_message(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text,
  p_now timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_attempt integer;
begin
  select message.attempt_count + 1 into next_attempt
  from public.outbox_messages message
  where message.tenant_id = p_tenant_id
    and message.id = p_outbox_message_id
    and message.topic like 'tax_document.%'
    and message.status in ('queued', 'processing')
  for update;
  if next_attempt is null then return false; end if;

  insert into public.outbox_delivery_attempts (
    tenant_id, outbox_message_id, attempt_number,
    worker_name, outcome, occurred_at
  )
  values (
    p_tenant_id, p_outbox_message_id, next_attempt,
    p_worker_name, 'completed', p_now
  )
  on conflict do nothing;

  update public.outbox_messages
  set status = 'completed', attempt_count = next_attempt,
      completed_at = p_now, locked_by = null, locked_until = null
  where tenant_id = p_tenant_id and id = p_outbox_message_id;

  perform pgmq.archive('tax_documents', p_queue_message_id);
  return true;
end;
$$;

create or replace function private.fail_tax_outbox_message(
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
    and message.topic like 'tax_document.%'
  for update;

  if not found or message_record.status = 'completed' then return 'ignored'; end if;
  next_attempt := message_record.attempt_count + 1;
  perform pgmq.archive('tax_documents', p_queue_message_id);

  if next_attempt >= message_record.max_attempts then
    perform pgmq.send(
      queue_name => 'tax_documents_dlq',
      msg => jsonb_build_object(
        'outbox_message_id', message_record.id,
        'tenant_id', message_record.tenant_id,
        'topic', message_record.topic,
        'payload', message_record.payload,
        'attempt_count', next_attempt,
        'last_error', left(p_error, 4000)
      )
    );
    update public.outbox_messages
    set status = 'dead_letter', attempt_count = next_attempt,
        dead_lettered_at = p_now, last_error = left(p_error, 4000),
        locked_by = null, locked_until = null
    where tenant_id = p_tenant_id and id = p_outbox_message_id;
    insert into public.outbox_delivery_attempts (
      tenant_id, outbox_message_id, attempt_number,
      worker_name, outcome, error_message, occurred_at
    )
    values (
      p_tenant_id, p_outbox_message_id, next_attempt, p_worker_name,
      'dead_lettered', left(p_error, 4000), p_now
    )
    on conflict do nothing;
    return 'dead_letter';
  end if;

  backoff_seconds := floor(
    random() * (private.outbox_retry_ceiling_seconds(next_attempt) + 1)
  )::integer;
  update public.outbox_messages
  set status = 'pending', attempt_count = next_attempt,
      available_at = p_now + make_interval(secs => backoff_seconds),
      queue_message_id = null, last_error = left(p_error, 4000),
      locked_by = null, locked_until = null
  where tenant_id = p_tenant_id and id = p_outbox_message_id;
  insert into public.outbox_delivery_attempts (
    tenant_id, outbox_message_id, attempt_number,
    worker_name, outcome, error_message, occurred_at
  )
  values (
    p_tenant_id, p_outbox_message_id, next_attempt,
    p_worker_name, 'failed', left(p_error, 4000), p_now
  )
  on conflict do nothing;
  return 'retry_scheduled';
end;
$$;

create function public.worker_read_tax_messages(
  p_visibility_timeout_seconds integer default 60,
  p_limit integer default 20
)
returns table (
  message_id bigint,
  read_count integer,
  enqueued_at timestamptz,
  visible_at timestamptz,
  message jsonb
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select
    queued.msg_id,
    queued.read_ct,
    queued.enqueued_at,
    queued.vt,
    queued.message
  from pgmq.read(
    'tax_documents',
    p_visibility_timeout_seconds,
    p_limit
  ) queued;
$$;

create function public.worker_claim_tax_event(
  p_tenant_id uuid,
  p_event_id text,
  p_lease_seconds integer default 120
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_processed_event(
    p_tenant_id, 'tax-document-consumer', p_event_id,
    p_lease_seconds, clock_timestamp()
  );
$$;

create function public.worker_complete_tax_event(
  p_tenant_id uuid,
  p_event_id text,
  p_lock_token uuid,
  p_result jsonb
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.complete_processed_event(
    p_tenant_id, 'tax-document-consumer', p_event_id,
    p_lock_token, p_result, clock_timestamp()
  );
$$;

create function public.worker_prepare_tax_order(p_order_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.prepare_tax_document_for_order(p_order_id);
$$;

create function public.worker_prepare_tax_refund(p_refund_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.prepare_tax_credit_note(p_refund_id);
$$;

create function public.worker_record_tax_result(
  p_tax_document_id uuid,
  p_outcome text,
  p_provider_document_id text default null,
  p_folio text default null,
  p_representation_url text default null,
  p_stamp text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_duration_ms integer default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_tax_document_result(
    p_tax_document_id, p_outcome, p_provider_document_id, p_folio,
    p_representation_url, p_stamp, p_error_code, p_error_message,
    p_duration_ms
  );
$$;

create function public.worker_complete_tax_outbox(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.complete_tax_outbox_message(
    p_tenant_id, p_outbox_message_id, p_queue_message_id,
    p_worker_name, clock_timestamp()
  );
$$;

create function public.worker_fail_tax_outbox(
  p_tenant_id uuid,
  p_outbox_message_id uuid,
  p_queue_message_id bigint,
  p_worker_name text,
  p_error text
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.fail_tax_outbox_message(
    p_tenant_id, p_outbox_message_id, p_queue_message_id,
    p_worker_name, p_error, clock_timestamp()
  );
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.worker_read_tax_messages(integer,integer)',
    'public.worker_claim_tax_event(uuid,text,integer)',
    'public.worker_complete_tax_event(uuid,text,uuid,jsonb)',
    'public.worker_prepare_tax_order(uuid)',
    'public.worker_prepare_tax_refund(uuid)',
    'public.worker_record_tax_result(uuid,text,text,text,text,text,text,text,integer)',
    'public.worker_complete_tax_outbox(uuid,uuid,bigint,text)',
    'public.worker_fail_tax_outbox(uuid,uuid,bigint,text,text)'
  ]
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      signature
    );
    execute format(
      'grant execute on function %s to service_role',
      signature
    );
  end loop;
end;
$$;

revoke execute on function
  private.complete_tax_outbox_message(uuid,uuid,bigint,text,timestamptz),
  private.fail_tax_outbox_message(uuid,uuid,bigint,text,text,timestamptz)
from public, anon, authenticated;

comment on function public.worker_read_tax_messages(integer, integer) is
  'Trusted service-role entry point for the dedicated DTE queue.';
