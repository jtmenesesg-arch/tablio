
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_tenant_insert" ON public.support_tickets
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "support_tickets_tenant_read" ON public.support_tickets
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY "support_tickets_superadmin_all" ON public.support_tickets
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
