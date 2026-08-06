-- OI-034 / OI-038: KDS completo, real. El backend (tablas, transition_ticket
-- con concurrencia optimista, kds_heartbeat/disconnect, record_kds_visible,
-- set_product_availability, Realtime en dos capas) ya existe completo desde
-- Sprint 4 — nunca conectado a ninguna pantalla real. Esta es la única
-- pieza que faltaba: un bootstrap que arme, en un solo viaje, los tickets
-- activos con sus ítems, las estaciones y los umbrales de tiempo — para
-- reemplazar la vista provisional de owner_kds_tickets_minimal
-- (OI-038, deliberadamente mínima, registrada para ser reemplazada acá).
create or replace function public.kds_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  settings_row public.tenant_kds_settings%rowtype;
  tickets_json jsonb;
  stations_json jsonb;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'orders.read') then
    raise exception 'orders.read permission is required' using errcode = '42501';
  end if;

  select * into settings_row
  from public.tenant_kds_settings
  where tenant_id = selected_tenant_id;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', s.id, 'name', s.name) order by s.name
  ), '[]'::jsonb)
  into stations_json
  from public.stations s
  where s.tenant_id = selected_tenant_id and s.active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'orderId', t.order_id,
    'orderNumber', o.order_number,
    'tableName', tab.display_name,
    'alias', o.diner_alias,
    'displayName', o.diner_display_name,
    'stationId', t.station_id,
    'stationName', s.name,
    'state', t.current_state,
    'version', t.state_version,
    'confirmedAt', o.confirmed_at,
    'acknowledgedAt', t.acknowledged_at,
    'inPreparationAt', t.in_preparation_at,
    'readyAt', t.ready_at,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'productName', oi.product_name,
        'variantName', oi.variant_name,
        'quantity', oi.quantity,
        'isLoyaltyReward', oi.is_loyalty_reward,
        'note', (
          select entry ->> 'value'
          from jsonb_array_elements(oi.selected_modifiers) entry
          where entry ->> 'type' = 'customer_note'
          limit 1
        )
      ) order by oi.product_name), '[]'::jsonb)
      from public.ticket_items ti
      join public.order_items oi
        on oi.tenant_id = ti.tenant_id and oi.id = ti.order_item_id
      where ti.tenant_id = selected_tenant_id and ti.ticket_id = t.id
    )
  ) order by t.queued_at), '[]'::jsonb)
  into tickets_json
  from public.tickets t
  join public.orders o on o.tenant_id = t.tenant_id and o.id = t.order_id
  join public.stations s on s.tenant_id = t.tenant_id and s.id = t.station_id
  join public.tables tab on tab.tenant_id = o.tenant_id and tab.id = o.table_id
  where t.tenant_id = selected_tenant_id
    and t.current_state <> 'completed';

  return jsonb_build_object(
    'tickets', tickets_json,
    'stations', stations_json,
    'settings', jsonb_build_object(
      'warningAfterSeconds', coalesce(settings_row.warning_after_seconds, 75),
      'reconciliationIntervalSeconds', coalesce(settings_row.reconciliation_interval_seconds, 45),
      'amberAfterSeconds', coalesce(settings_row.amber_after_seconds, 480),
      'criticalAfterSeconds', coalesce(settings_row.critical_after_seconds, 900)
    )
  );
end;
$$;

revoke execute on function public.kds_bootstrap() from public, anon;
grant execute on function public.kds_bootstrap() to authenticated;
