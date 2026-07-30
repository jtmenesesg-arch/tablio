-- Fix orders insert policy: only allow if table has an active session
DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
CREATE POLICY "orders_public_insert" ON public.orders
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.table_sessions ts
      WHERE ts.table_id = orders.table_id
        AND ts.is_active = true
    )
  );

-- Fix order_items insert policy: only allow if the order exists and belongs to an active session
DROP POLICY IF EXISTS "order_items_public_insert" ON public.order_items;
CREATE POLICY "order_items_public_insert" ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.table_sessions ts ON ts.table_id = o.table_id
      WHERE o.id = order_items.order_id
        AND ts.is_active = true
    )
  );

-- Fix bill_requests insert policy: only allow if table has an active session
DROP POLICY IF EXISTS "bill_requests_public_insert" ON public.bill_requests;
CREATE POLICY "bill_requests_public_insert" ON public.bill_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.table_sessions ts
      WHERE ts.table_id = bill_requests.table_id
        AND ts.is_active = true
    )
  );