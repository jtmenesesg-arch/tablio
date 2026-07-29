-- Sprint 5 advisor fixes.
-- PIN attempts are intentionally private: user-facing roles have an explicit
-- deny-all policy and can only reach the security-definer authentication RPC.

create policy employee_pin_attempts_deny_user_routes
on public.employee_pin_attempts
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

-- Cover every Sprint 5 foreign key reported by Supabase's performance advisor.
-- Some operational indexes are partial or lead with different columns, so they
-- cannot support referential checks for these exact keys.

create index if not exists
  diner_waiter_payment_requests_discarded_employee_fk_idx
on public.diner_waiter_payment_requests (
  tenant_id,
  discarded_by_employee_id
);

create index if not exists employee_pin_attempts_auth_user_fk_idx
on public.employee_pin_attempts (auth_user_id);

create index if not exists employee_pin_attempts_employee_fk_idx
on public.employee_pin_attempts (tenant_id, employee_id);

create index if not exists employee_sessions_employee_fk_idx
on public.employee_sessions (tenant_id, employee_id);

create index if not exists table_session_groups_creator_fk_idx
on public.table_session_groups (tenant_id, created_by_employee_id);

create index if not exists table_session_groups_separator_fk_idx
on public.table_session_groups (tenant_id, separated_by_employee_id);

create index if not exists table_session_groups_venue_fk_idx
on public.table_session_groups (tenant_id, venue_id);

create index if not exists waiter_admin_alerts_venue_fk_idx
on public.waiter_admin_alerts (tenant_id, venue_id);

create index if not exists waiter_shift_close_employee_fk_idx
on public.waiter_shift_close_snapshots (tenant_id, employee_id);

create index if not exists waiter_shift_close_session_fk_idx
on public.waiter_shift_close_snapshots (
  tenant_id,
  employee_session_id
);

create index if not exists waiter_table_assignments_assigner_fk_idx
on public.waiter_table_assignments (
  tenant_id,
  assigned_by_employee_id
);

create index if not exists waiter_tasks_assigned_employee_fk_idx
on public.waiter_tasks (tenant_id, assigned_employee_id);

create index if not exists waiter_tasks_completed_employee_fk_idx
on public.waiter_tasks (tenant_id, completed_by_employee_id);

create index if not exists waiter_tasks_table_session_fk_idx
on public.waiter_tasks (tenant_id, table_session_id);

create index if not exists waiter_tasks_zone_fk_idx
on public.waiter_tasks (tenant_id, zone_id);
