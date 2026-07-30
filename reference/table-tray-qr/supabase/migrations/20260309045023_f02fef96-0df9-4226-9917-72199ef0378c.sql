
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tenant_id FROM public.tenant_members
  WHERE user_id = auth.uid()
  AND is_active = true
  LIMIT 1
$$;
