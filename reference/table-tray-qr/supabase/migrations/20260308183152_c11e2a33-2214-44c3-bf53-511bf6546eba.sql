
-- Allow platform admins to INSERT into restaurants, branches, menus, categories, menu_items, tables, staff_users, table_sessions
CREATE POLICY "superadmin_insert_restaurants" ON public.restaurants
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "superadmin_insert_branches" ON public.branches
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "superadmin_insert_menus" ON public.menus
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "superadmin_insert_categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "superadmin_insert_menu_items" ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "superadmin_insert_tables" ON public.tables
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "superadmin_insert_staff_users" ON public.staff_users
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "superadmin_insert_table_sessions" ON public.table_sessions
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

-- Also allow UPDATE for superadmins on key tables
CREATE POLICY "superadmin_update_restaurants" ON public.restaurants
  FOR UPDATE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_update_branches" ON public.branches
  FOR UPDATE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "superadmin_update_menus" ON public.menus
  FOR UPDATE TO authenticated
  USING (is_platform_admin());
