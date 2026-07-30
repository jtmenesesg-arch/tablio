
CREATE TABLE public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'waiter',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_invitations_public_read" ON public.staff_invitations
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "staff_invitations_public_update" ON public.staff_invitations
  FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "staff_invitations_staff_manage" ON public.staff_invitations
  FOR ALL TO authenticated USING (tenant_id = get_tenant_id());
