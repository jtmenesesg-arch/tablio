
-- Backoffice invitations for sellers
CREATE TABLE public.backoffice_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  role text NOT NULL DEFAULT 'vendedor',
  zone text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by_member_id uuid REFERENCES public.backoffice_members(id)
);

ALTER TABLE public.backoffice_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backoffice_invitations_superadmin_all" ON public.backoffice_invitations
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "backoffice_invitations_public_read" ON public.backoffice_invitations
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "backoffice_invitations_public_update" ON public.backoffice_invitations
  FOR UPDATE TO anon, authenticated
  USING (true);

-- Seller goals/metas
CREATE TABLE public.seller_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.backoffice_members(id) ON DELETE CASCADE,
  period text NOT NULL,
  visits_goal integer DEFAULT 0,
  demos_goal integer DEFAULT 0,
  pilots_goal integer DEFAULT 0,
  closes_goal integer DEFAULT 0,
  commission_per_close integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.seller_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_goals_superadmin_all" ON public.seller_goals
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "seller_goals_own_read" ON public.seller_goals
  FOR SELECT TO authenticated
  USING (seller_id IN (
    SELECT id FROM public.backoffice_members WHERE user_id = auth.uid()
  ));

-- Add seller insert+update policies for their own leads
CREATE POLICY "leads_seller_update_own" ON public.leads
  FOR UPDATE TO authenticated
  USING (assigned_seller_id IN (
    SELECT id FROM public.backoffice_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "leads_seller_insert" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (assigned_seller_id IN (
    SELECT id FROM public.backoffice_members WHERE user_id = auth.uid()
  ) OR is_platform_admin());

-- Allow sellers to insert activities for their leads
CREATE POLICY "lead_activities_seller_insert" ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (lead_id IN (
    SELECT id FROM public.leads WHERE assigned_seller_id IN (
      SELECT id FROM public.backoffice_members WHERE user_id = auth.uid()
    )
  ) OR is_platform_admin());
