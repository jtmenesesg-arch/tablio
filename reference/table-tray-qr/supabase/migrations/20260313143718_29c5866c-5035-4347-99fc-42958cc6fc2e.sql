CREATE POLICY "tables_public_update_status"
ON public.tables
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);