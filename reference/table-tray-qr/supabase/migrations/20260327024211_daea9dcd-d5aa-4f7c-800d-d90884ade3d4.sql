-- Allow jefe_ventas to read all backoffice members
CREATE POLICY "backoffice_members_jefe_read" ON public.backoffice_members
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
);

-- Allow jefe_ventas to update backoffice members (activate/deactivate)
CREATE POLICY "backoffice_members_jefe_update" ON public.backoffice_members
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
);

-- Allow jefe_ventas to manage invitations
CREATE POLICY "backoffice_invitations_jefe_manage" ON public.backoffice_invitations
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
);

-- Allow jefe_ventas to read all leads
CREATE POLICY "leads_jefe_read" ON public.leads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
);

-- Allow jefe_ventas to manage leads
CREATE POLICY "leads_jefe_manage" ON public.leads
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
);

-- Allow jefe_ventas to read lead activities
CREATE POLICY "lead_activities_jefe_read" ON public.lead_activities
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
);

-- Allow jefe_ventas to insert lead activities
CREATE POLICY "lead_activities_jefe_insert" ON public.lead_activities
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.backoffice_members bm
    WHERE bm.user_id = auth.uid() AND bm.role = 'jefe_ventas' AND bm.is_active = true
  )
);