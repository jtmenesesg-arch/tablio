-- Fix a latent Sprint 4 trigger defect discovered by the table-credit integration.
-- The trigger had an unrelated product-availability broadcast copied into the
-- ticket path, referencing variables that do not exist in this function.

create or replace function private.broadcast_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
  payload jsonb;
  payment_confirmed_at timestamptz;
  client_connected boolean;
  presence_timeout integer;
  ticket_venue_id uuid;
begin
  select station.venue_id
  into ticket_venue_id
  from public.stations station
  where station.tenant_id = new.tenant_id
    and station.id = new.station_id;

  if tg_op = 'INSERT' then
    select order_record.confirmed_at
    into payment_confirmed_at
    from public.orders order_record
    where order_record.tenant_id = new.tenant_id
      and order_record.id = new.order_id;

    select coalesce(settings.presence_timeout_seconds, 30)
    into presence_timeout
    from public.tenant_kds_settings settings
    where settings.tenant_id = new.tenant_id;
    presence_timeout := coalesce(presence_timeout, 30);

    select exists (
      select 1
      from public.kds_clients client
      where client.tenant_id = new.tenant_id
        and client.venue_id = ticket_venue_id
        and (client.station_id is null or client.station_id = new.station_id)
        and client.connected_at <= payment_confirmed_at
        and client.disconnected_at is null
        and client.last_heartbeat_at >=
          payment_confirmed_at - make_interval(secs => presence_timeout)
    )
    into client_connected;

    insert into public.kds_delivery_metrics (
      tenant_id,
      ticket_id,
      station_id,
      payment_confirmed_at,
      kds_connected_at_confirmation
    )
    values (
      new.tenant_id,
      new.id,
      new.station_id,
      payment_confirmed_at,
      client_connected
    )
    on conflict (tenant_id, ticket_id) do nothing;

    event_name := 'ticket_created';
  else
    event_name := 'ticket_updated';

    if old.current_state <> 'ready' and new.current_state = 'ready' then
      insert into public.outbox_messages (
        tenant_id,
        aggregate_type,
        aggregate_id,
        topic,
        deduplication_key,
        payload,
        available_at,
        created_at
      )
      values
        (
          new.tenant_id,
          'ticket',
          new.id,
          'waiter.ticket_ready',
          'ticket:' || new.id::text || ':waiter-ready',
          jsonb_build_object(
            'ticket_id', new.id,
            'order_id', new.order_id,
            'station_id', new.station_id
          ),
          clock_timestamp(),
          clock_timestamp()
        ),
        (
          new.tenant_id,
          'ticket',
          new.id,
          'diner.ticket_ready',
          'ticket:' || new.id::text || ':diner-ready',
          jsonb_build_object(
            'ticket_id', new.id,
            'order_id', new.order_id,
            'station_id', new.station_id
          ),
          clock_timestamp(),
          clock_timestamp()
        )
      on conflict (tenant_id, deduplication_key) do nothing;
    end if;
  end if;

  payload := jsonb_build_object(
    'ticket_id', new.id,
    'order_id', new.order_id,
    'station_id', new.station_id,
    'state', new.current_state,
    'version', new.state_version,
    'committed_at', clock_timestamp()
  );

  perform realtime.send(
    payload,
    event_name,
    'kds:' || new.tenant_id::text || ':' || new.station_id::text,
    true
  );
  perform realtime.send(
    payload,
    event_name,
    'kds:' || new.tenant_id::text || ':all',
    true
  );

  return null;
end;
$$;
