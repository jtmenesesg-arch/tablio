-- Fix: diner_payment_view calculaba el número de pedido a mano
-- (count(*) sobre table_session_id) sin saber que orders.order_number ya
-- existe como identity real por tenant (Sprint 3) — encontrado verificando
-- el Incremento 5 contra la base real (order_number: 42 en el pedido de
-- prueba). Se simplifica a leer la columna real.
create or replace function private.diner_payment_view(
  p_tenant_id uuid,
  p_cart_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  intent_row record;
  order_row record;
  tickets_json jsonb;
  payload jsonb := '{}'::jsonb;
begin
  select pi.id, pi.checkout_quote_id, pi.created_at
  into intent_row
  from public.payment_intents pi
  join public.checkout_quotes q
    on q.tenant_id = pi.tenant_id and q.id = pi.checkout_quote_id
  where pi.tenant_id = p_tenant_id and q.cart_id = p_cart_id
  order by pi.created_at desc
  limit 1;

  if intent_row.id is null then
    return payload;
  end if;

  select o.id, o.order_number, o.total_clp, o.current_state, o.confirmed_at
  into order_row
  from public.orders o
  join public.payments p
    on p.tenant_id = o.tenant_id and p.id = o.payment_id
  where o.tenant_id = p_tenant_id and p.payment_intent_id = intent_row.id;

  if order_row.id is null then
    return jsonb_build_object('payment', jsonb_build_object(
      'id', intent_row.id, 'status', 'pending'
    ));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'stationName', s.name,
    'status', t.current_state,
    'itemNames', (
      select coalesce(array_agg(oi.product_name order by oi.product_name), '{}'::text[])
      from public.ticket_items ti
      join public.order_items oi
        on oi.tenant_id = ti.tenant_id and oi.id = ti.order_item_id
      where ti.tenant_id = p_tenant_id and ti.ticket_id = t.id
    )
  )), '[]'::jsonb)
  into tickets_json
  from public.tickets t
  join public.stations s on s.tenant_id = t.tenant_id and s.id = t.station_id
  where t.tenant_id = p_tenant_id and t.order_id = order_row.id;

  payload := jsonb_build_object(
    'payment', jsonb_build_object('id', intent_row.id, 'status', 'confirmed'),
    'order', jsonb_build_object(
      'id', order_row.id,
      'number', order_row.order_number,
      'totalClp', order_row.total_clp,
      'state', order_row.current_state,
      'confirmedAt', order_row.confirmed_at,
      'tickets', tickets_json
    )
  );
  return payload;
end;
$$;
