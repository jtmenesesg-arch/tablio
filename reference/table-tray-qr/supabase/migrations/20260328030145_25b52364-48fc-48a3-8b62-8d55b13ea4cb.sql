
-- Fix RLS recursion on backoffice_members: replace self-referencing policy with security definer function

-- Create helper function to check backoffice role without recursion
CREATE OR REPLACE FUNCTION public.has_backoffice_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.backoffice_members
    WHERE user_id = _user_id
      AND role = _role
      AND is_active = true
  )
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "backoffice_members_jefe_read_v2" ON public.backoffice_members;

-- Recreate without recursion using security definer function
CREATE POLICY "backoffice_members_jefe_read"
ON public.backoffice_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_backoffice_role(auth.uid(), 'jefe_ventas')
);

-- Also ensure jefe_ventas can manage seller_goals
DROP POLICY IF EXISTS "seller_goals_jefe_manage" ON public.seller_goals;
CREATE POLICY "seller_goals_jefe_manage"
ON public.seller_goals
FOR ALL
TO authenticated
USING (public.has_backoffice_role(auth.uid(), 'jefe_ventas'))
WITH CHECK (public.has_backoffice_role(auth.uid(), 'jefe_ventas'));
