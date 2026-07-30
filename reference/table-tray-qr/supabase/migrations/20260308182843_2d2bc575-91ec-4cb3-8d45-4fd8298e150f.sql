
-- Allow platform admins to delete tenants and cascade related data
-- Add DELETE policies for tables that reference tenant_id

CREATE POLICY "superadmin_delete_restaurants" ON public.restaurants
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_branches" ON public.branches
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_menus" ON public.menus
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_categories" ON public.categories
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_menu_items" ON public.menu_items
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_tables" ON public.tables
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_staff_users" ON public.staff_users
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_tenant_members" ON public.tenant_members
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_orders" ON public.orders
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_order_items" ON public.order_items
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_table_sessions" ON public.table_sessions
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_bill_requests" ON public.bill_requests
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_waiter_calls" ON public.waiter_calls
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_staff_invitations" ON public.staff_invitations
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_modifier_groups" ON public.modifier_groups
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_modifiers" ON public.modifiers
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_audit_logs" ON public.audit_logs
  FOR DELETE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_delete_tenant_feature_flags" ON public.tenant_feature_flags
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- Allow platform admins to delete tenants
CREATE POLICY "superadmin_delete_tenants" ON public.tenants
  FOR DELETE TO authenticated
  USING (is_platform_admin());
