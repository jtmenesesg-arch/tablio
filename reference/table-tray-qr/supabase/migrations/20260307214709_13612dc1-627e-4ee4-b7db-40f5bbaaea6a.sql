
-- 1. PLANS
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  max_tables int NOT NULL DEFAULT 10,
  features jsonb NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. TENANTS
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  rut text,
  email text NOT NULL,
  phone text,
  plan_id uuid REFERENCES public.plans(id),
  plan_status text DEFAULT 'trial',
  trial_ends_at timestamptz DEFAULT (now() + interval '30 days'),
  logo_url text,
  primary_color text DEFAULT '#E8531D',
  secondary_color text DEFAULT '#1A1A2E',
  cover_image_url text,
  welcome_message text,
  timezone text DEFAULT 'America/Santiago',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. RESTAURANTS
CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 4. BRANCHES
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text DEFAULT 'Santiago',
  phone text,
  is_open boolean DEFAULT true,
  opening_hours jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 5. MENUS
CREATE TABLE public.menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Menú Principal',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 6. CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_id uuid NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text DEFAULT '🍽',
  description text,
  sort_order int DEFAULT 0,
  is_visible boolean DEFAULT true,
  available_from time,
  available_until time,
  available_days int[] DEFAULT '{0,1,2,3,4,5,6}',
  created_at timestamptz DEFAULT now()
);

-- 7. MENU ITEMS
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description_short text,
  description_long text,
  price int NOT NULL,
  cost_price int,
  image_url text,
  image_is_real boolean DEFAULT false,
  prep_time_minutes int,
  status text DEFAULT 'available',
  labels text[] DEFAULT '{}',
  allergens text[] DEFAULT '{}',
  sort_order int DEFAULT 0,
  total_orders int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 8. MODIFIER GROUPS
CREATE TABLE public.modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  required boolean DEFAULT false,
  min_selections int DEFAULT 0,
  max_selections int DEFAULT 1,
  sort_order int DEFAULT 0
);

-- 9. MODIFIERS
CREATE TABLE public.modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  extra_price int DEFAULT 0,
  is_available boolean DEFAULT true,
  sort_order int DEFAULT 0
);

-- 10. TABLES
CREATE TABLE public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  number int NOT NULL,
  name text,
  zone text DEFAULT 'interior',
  capacity int DEFAULT 4,
  qr_token text UNIQUE NOT NULL,
  status text DEFAULT 'free',
  position_x float DEFAULT 0,
  position_y float DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 11. TABLE SESSIONS
CREATE TABLE public.table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.tables(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  total_amount int DEFAULT 0,
  tip_amount int DEFAULT 0,
  is_active boolean DEFAULT true
);

-- 12. ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.table_sessions(id),
  table_id uuid NOT NULL REFERENCES public.tables(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  order_number int NOT NULL,
  status text DEFAULT 'confirmed',
  source text DEFAULT 'customer_qr',
  total_amount int NOT NULL,
  notes text,
  cancelled_reason text,
  confirmed_at timestamptz DEFAULT now(),
  kitchen_accepted_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 13. ORDER ITEMS
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id),
  menu_item_name text NOT NULL,
  unit_price int NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  subtotal int NOT NULL,
  selected_modifiers jsonb DEFAULT '[]',
  item_notes text,
  created_at timestamptz DEFAULT now()
);

-- 14. BILL REQUESTS
CREATE TABLE public.bill_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.table_sessions(id),
  table_id uuid NOT NULL REFERENCES public.tables(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  total_amount int NOT NULL,
  tip_amount int DEFAULT 0,
  tip_percentage int DEFAULT 0,
  status text DEFAULT 'pending',
  requested_at timestamptz DEFAULT now(),
  attended_at timestamptz
);

-- 15. WAITER CALLS
CREATE TABLE public.waiter_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.tables(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  session_id uuid REFERENCES public.table_sessions(id),
  reason text DEFAULT 'help',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- 16. STAFF USERS
CREATE TABLE public.staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  auth_user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  role text NOT NULL,
  pin text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 17. FEATURE FLAGS
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  description text,
  default_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tenant_feature_flags (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_key text NOT NULL REFERENCES public.feature_flags(key),
  is_enabled boolean DEFAULT false,
  PRIMARY KEY (tenant_id, flag_key)
);

-- 18. AUDIT LOGS
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTION: get tenant_id from JWT
-- ============================================
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid
$$;

-- ============================================
-- HELPER FUNCTION: check staff role
-- ============================================
CREATE OR REPLACE FUNCTION public.has_staff_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_users
    WHERE auth_user_id = _user_id
      AND role = _role
      AND is_active = true
  )
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

-- PLANS: readable by everyone
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT USING (true);

-- TENANTS: public read (for slug lookup), staff can manage their own
CREATE POLICY "tenants_public_read" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "tenants_staff_update" ON public.tenants FOR UPDATE USING (id = public.get_tenant_id());
CREATE POLICY "superadmin_tenants_all" ON public.tenants FOR ALL USING ((auth.jwt() ->> 'role') = 'superadmin');

-- RESTAURANTS: tenant isolation for staff, public read
CREATE POLICY "restaurants_public_read" ON public.restaurants FOR SELECT USING (true);
CREATE POLICY "restaurants_staff_manage" ON public.restaurants FOR ALL USING (tenant_id = public.get_tenant_id());

-- BRANCHES: public read, staff manage
CREATE POLICY "branches_public_read" ON public.branches FOR SELECT USING (true);
CREATE POLICY "branches_staff_manage" ON public.branches FOR ALL USING (tenant_id = public.get_tenant_id());

-- MENUS: public read, staff manage
CREATE POLICY "menus_public_read" ON public.menus FOR SELECT USING (true);
CREATE POLICY "menus_staff_manage" ON public.menus FOR ALL USING (tenant_id = public.get_tenant_id());

-- CATEGORIES: public read, staff manage
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_staff_manage" ON public.categories FOR ALL USING (tenant_id = public.get_tenant_id());

-- MENU ITEMS: public read, staff manage
CREATE POLICY "menu_items_public_read" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "menu_items_staff_manage" ON public.menu_items FOR ALL USING (tenant_id = public.get_tenant_id());

-- MODIFIER GROUPS: public read, staff manage
CREATE POLICY "modifier_groups_public_read" ON public.modifier_groups FOR SELECT USING (true);
CREATE POLICY "modifier_groups_staff_manage" ON public.modifier_groups FOR ALL USING (tenant_id = public.get_tenant_id());

-- MODIFIERS: public read, staff manage
CREATE POLICY "modifiers_public_read" ON public.modifiers FOR SELECT USING (true);
CREATE POLICY "modifiers_staff_manage" ON public.modifiers FOR ALL USING (tenant_id = public.get_tenant_id());

-- TABLES: public read (QR validation), staff manage
CREATE POLICY "tables_public_read" ON public.tables FOR SELECT USING (true);
CREATE POLICY "tables_staff_manage" ON public.tables FOR ALL USING (tenant_id = public.get_tenant_id());

-- TABLE SESSIONS: anyone can insert (customer creates on first order), staff manage
CREATE POLICY "table_sessions_public_insert" ON public.table_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "table_sessions_public_read" ON public.table_sessions FOR SELECT USING (true);
CREATE POLICY "table_sessions_staff_manage" ON public.table_sessions FOR ALL USING (tenant_id = public.get_tenant_id());

-- ORDERS: anyone can insert and read, staff manage
CREATE POLICY "orders_public_insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_public_read" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders_staff_manage" ON public.orders FOR ALL USING (tenant_id = public.get_tenant_id());

-- ORDER ITEMS: anyone can insert and read, staff manage
CREATE POLICY "order_items_public_insert" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_public_read" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "order_items_staff_manage" ON public.order_items FOR ALL USING (tenant_id = public.get_tenant_id());

-- BILL REQUESTS: anyone can insert and read, staff manage
CREATE POLICY "bill_requests_public_insert" ON public.bill_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "bill_requests_public_read" ON public.bill_requests FOR SELECT USING (true);
CREATE POLICY "bill_requests_staff_manage" ON public.bill_requests FOR ALL USING (tenant_id = public.get_tenant_id());

-- WAITER CALLS: anyone can insert and read, staff manage
CREATE POLICY "waiter_calls_public_insert" ON public.waiter_calls FOR INSERT WITH CHECK (true);
CREATE POLICY "waiter_calls_public_read" ON public.waiter_calls FOR SELECT USING (true);
CREATE POLICY "waiter_calls_staff_manage" ON public.waiter_calls FOR ALL USING (tenant_id = public.get_tenant_id());

-- STAFF USERS: only staff of same tenant
CREATE POLICY "staff_users_tenant_read" ON public.staff_users FOR SELECT USING (tenant_id = public.get_tenant_id());
CREATE POLICY "staff_users_tenant_manage" ON public.staff_users FOR ALL USING (tenant_id = public.get_tenant_id());

-- FEATURE FLAGS: public read
CREATE POLICY "feature_flags_public_read" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "feature_flags_superadmin_manage" ON public.feature_flags FOR ALL USING ((auth.jwt() ->> 'role') = 'superadmin');

-- TENANT FEATURE FLAGS: tenant read, superadmin manage
CREATE POLICY "tenant_ff_tenant_read" ON public.tenant_feature_flags FOR SELECT USING (tenant_id = public.get_tenant_id());
CREATE POLICY "tenant_ff_superadmin_manage" ON public.tenant_feature_flags FOR ALL USING ((auth.jwt() ->> 'role') = 'superadmin');

-- AUDIT LOGS: tenant read only
CREATE POLICY "audit_logs_tenant_read" ON public.audit_logs FOR SELECT USING (tenant_id = public.get_tenant_id());
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- REALTIME: enable for KDS and tracking
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiter_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bill_requests;
