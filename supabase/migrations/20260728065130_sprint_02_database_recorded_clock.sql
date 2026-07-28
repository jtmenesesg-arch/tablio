-- Ingestion order is measured by PostgreSQL, never by a caller-controlled
-- provider clock. Provider occurred_at remains preserved as evidence.
create or replace function private.advance_payment_intent(
  p_tenant_id uuid,
  p_payment_intent_id uuid,
  p_target_state text,
  p_source_event_id text,
  p_occurred_at timestamptz,
  p_recorded_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state text;
  database_recorded_at timestamptz := clock_timestamp();
begin
  select event.state into current_state
  from public.payment_intent_events event
  where event.tenant_id = p_tenant_id
    and event.payment_intent_id = p_payment_intent_id
  order by event.recorded_at desc, event.id desc
  limit 1;

  if current_state in ('approved', 'rejected', 'expired', 'cancelled') then
    return current_state;
  end if;

  if current_state = 'created' then
    insert into public.payment_intent_events (
      tenant_id, payment_intent_id, state, source, source_event_id,
      occurred_at, recorded_at, metadata
    )
    values (
      p_tenant_id, p_payment_intent_id, 'redirected', 'provider',
      p_source_event_id, p_occurred_at,
      database_recorded_at - interval '2 microseconds',
      p_metadata || '{"synthetic":true}'::jsonb
    )
    on conflict do nothing;
    current_state := 'redirected';
  end if;

  if current_state = 'redirected'
    and p_target_state in ('processing', 'approved') then
    insert into public.payment_intent_events (
      tenant_id, payment_intent_id, state, source, source_event_id,
      occurred_at, recorded_at, metadata
    )
    values (
      p_tenant_id, p_payment_intent_id, 'processing', 'provider',
      p_source_event_id, p_occurred_at,
      database_recorded_at - interval '1 microsecond',
      p_metadata || '{"synthetic":true}'::jsonb
    )
    on conflict do nothing;
    current_state := 'processing';
  end if;

  if p_target_state <> current_state then
    insert into public.payment_intent_events (
      tenant_id, payment_intent_id, state, source, source_event_id,
      occurred_at, recorded_at, metadata
    )
    values (
      p_tenant_id, p_payment_intent_id, p_target_state, 'provider',
      p_source_event_id, p_occurred_at, database_recorded_at, p_metadata
    )
    on conflict do nothing;
    current_state := p_target_state;
  end if;

  return current_state;
end;
$$;

revoke execute on function private.advance_payment_intent(
  uuid, uuid, text, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function private.advance_payment_intent(
  uuid, uuid, text, text, timestamptz, timestamptz, jsonb
) to service_role;
