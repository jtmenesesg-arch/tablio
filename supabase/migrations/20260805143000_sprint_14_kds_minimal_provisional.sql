-- OI-034 Incremento 5: vista mínima del KDS — PROVISIONAL a propósito
-- (condición explícita del fundador al aprobar el desglose del tramo). Es
-- un puente para demostrar que el pedido pagado de verdad llega a
-- comandas reales, no la reconexión real del KDS (que necesita su propio
-- incremento: estados, realtime, agrupación por estación como columnas,
-- todo lo que ya tiene /kds sobre el store demo). Registrado también en
-- docs/OPEN_ISSUES.md como deuda a reemplazar.
create or replace function public.owner_kds_tickets_minimal()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  tickets_json jsonb;
begin
  selected_tenant_id := private.require_tenant_context();
  if not private.has_permission(selected_tenant_id, 'orders.read') then
    raise exception 'orders.read permission is required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'stationName', s.name,
    'status', t.current_state,
    'queuedAt', t.queued_at,
    'tableName', tab.display_name,
    'itemNames', (
      select coalesce(array_agg(oi.product_name order by oi.product_name), '{}'::text[])
      from public.ticket_items ti
      join public.order_items oi
        on oi.tenant_id = ti.tenant_id and oi.id = ti.order_item_id
      where ti.tenant_id = selected_tenant_id and ti.ticket_id = t.id
    )
  ) order by t.queued_at), '[]'::jsonb)
  into tickets_json
  from public.tickets t
  join public.stations s on s.tenant_id = t.tenant_id and s.id = t.station_id
  join public.orders o on o.tenant_id = t.tenant_id and o.id = t.order_id
  join public.tables tab on tab.tenant_id = o.tenant_id and tab.id = o.table_id
  where t.tenant_id = selected_tenant_id
    and t.current_state <> 'completed'
    and t.queued_at >= clock_timestamp() - interval '12 hours';

  return jsonb_build_object('tickets', tickets_json);
end;
$$;

revoke execute on function public.owner_kds_tickets_minimal() from public, anon;
grant execute on function public.owner_kds_tickets_minimal() to authenticated;
