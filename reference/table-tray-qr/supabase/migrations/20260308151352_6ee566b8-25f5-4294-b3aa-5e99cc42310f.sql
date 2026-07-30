
-- Create tenant_members table
CREATE TABLE public.tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  role TEXT NOT NULL DEFAULT 'owner',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- Users can read their own memberships
CREATE POLICY "tenant_members_own_read" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can read memberships for their tenant (for team pages)
CREATE POLICY "tenant_members_tenant_read" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

-- Superadmin full access
CREATE POLICY "tenant_members_superadmin_all" ON public.tenant_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow anon/public to insert (for signup flow from superadmin)
CREATE POLICY "tenant_members_public_insert" ON public.tenant_members
  FOR INSERT
  WITH CHECK (true);

-- Add public read policy for staff_users (for PIN login without auth)
CREATE POLICY "staff_users_public_read" ON public.staff_users
  FOR SELECT
  USING (true);
