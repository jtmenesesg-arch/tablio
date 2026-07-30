-- Add existing staff_users to tenant_members if not already there
INSERT INTO public.tenant_members (user_id, tenant_id, branch_id, role, is_active)
SELECT su.auth_user_id, su.tenant_id, su.branch_id, su.role, true
FROM public.staff_users su
WHERE su.auth_user_id IS NOT NULL
  AND su.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = su.auth_user_id
      AND tm.tenant_id = su.tenant_id
  );