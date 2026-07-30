
-- Fix tenants: allow platform admins to manage tenants
DROP POLICY IF EXISTS "superadmin_tenants_all" ON public.tenants;
CREATE POLICY "superadmin_tenants_all" ON public.tenants
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Fix tenant_members: remove recursive policy and use security definer function
DROP POLICY IF EXISTS "tenant_members_tenant_read" ON public.tenant_members;

-- Create a security definer function to check tenant membership
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid()
    AND tenant_id = _tenant_id
  )
$$;

-- Recreate tenant_members_tenant_read without recursion
CREATE POLICY "tenant_members_tenant_read" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));

-- Fix feature_flags superadmin policy
DROP POLICY IF EXISTS "feature_flags_superadmin_manage" ON public.feature_flags;
CREATE POLICY "feature_flags_superadmin_manage" ON public.feature_flags
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Fix tenant_feature_flags superadmin policy
DROP POLICY IF EXISTS "tenant_ff_superadmin_manage" ON public.tenant_feature_flags;
CREATE POLICY "tenant_ff_superadmin_manage" ON public.tenant_feature_flags
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Also fix superadmin_tenants_all for tenant_members
DROP POLICY IF EXISTS "tenant_members_superadmin_all" ON public.tenant_members;
CREATE POLICY "tenant_members_superadmin_all" ON public.tenant_members
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
