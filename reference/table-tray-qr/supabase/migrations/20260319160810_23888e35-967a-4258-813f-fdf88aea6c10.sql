-- Allow public UPDATE on orders for status transitions (waiter flow uses sessionStorage, not Supabase Auth)
CREATE POLICY "orders_public_update_status"
ON public.orders
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Allow public UPDATE on table_sessions (for closing sessions from waiter flow)
CREATE POLICY "table_sessions_public_update"
ON public.table_sessions
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);