
-- Backoffice members (vendedores, jefes, etc.)
CREATE TABLE public.backoffice_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'vendedor',
  zone text,
  phone text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_access_at timestamptz,
  avatar_url text
);

ALTER TABLE public.backoffice_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backoffice_members_superadmin_all" ON public.backoffice_members
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "backoffice_members_own_read" ON public.backoffice_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Leads table
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL,
  owner_name text,
  phone text,
  email text,
  address text,
  zone text,
  stage text NOT NULL DEFAULT 'contactado',
  source text DEFAULT 'terreno',
  assigned_seller_id uuid REFERENCES public.backoffice_members(id),
  temperature text DEFAULT 'tibio',
  notes text,
  next_action text,
  next_action_date date,
  demo_date timestamptz,
  pilot_start_date date,
  pilot_end_date date,
  monthly_value integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  converted_tenant_id uuid REFERENCES public.tenants(id),
  lost_reason text
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_superadmin_all" ON public.leads
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "leads_seller_read_own" ON public.leads
  FOR SELECT TO authenticated
  USING (assigned_seller_id IN (
    SELECT id FROM public.backoffice_members WHERE user_id = auth.uid()
  ));

-- Lead activities
CREATE TABLE public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid,
  type text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_activities_superadmin_all" ON public.lead_activities
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "lead_activities_seller_read" ON public.lead_activities
  FOR SELECT TO authenticated
  USING (lead_id IN (
    SELECT id FROM public.leads WHERE assigned_seller_id IN (
      SELECT id FROM public.backoffice_members WHERE user_id = auth.uid()
    )
  ));
