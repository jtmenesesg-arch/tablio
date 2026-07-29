-- Sprint 8: close exposed default function grants and cover every new foreign key.

revoke execute on function public.diner_ordering_availability(uuid)
from public;
grant execute on function public.diner_ordering_availability(uuid)
to anon, authenticated;

revoke execute on function public.start_tenant_impersonation(uuid, text)
from public, anon;
grant execute on function public.start_tenant_impersonation(uuid, text)
to authenticated;

revoke execute on function public.superadmin_set_subscription_status(
  uuid,
  text,
  text,
  timestamptz
)
from public, anon;
grant execute on function public.superadmin_set_subscription_status(
  uuid,
  text,
  text,
  timestamptz
)
to authenticated;

revoke execute on function public.superadmin_tenant_overview()
from public, anon;
grant execute on function public.superadmin_tenant_overview()
to authenticated;

create index menu_import_items_published_product_fk_idx
  on public.menu_import_items (tenant_id, published_product_id);
create index menu_imports_reviewer_fk_idx
  on public.menu_imports (reviewed_by_user_id);
create index onboarding_runs_venue_fk_idx
  on public.onboarding_runs (tenant_id, venue_id);
create index onboarding_steps_completed_by_fk_idx
  on public.onboarding_step_states (completed_by_user_id);
create index platform_memberships_role_fk_idx
  on public.platform_memberships (role_code);
create index saas_billing_accounts_connected_by_fk_idx
  on public.saas_billing_accounts (connected_by_user_id);
create index saas_charge_attempts_billing_account_fk_idx
  on public.saas_charge_attempts (tenant_id, billing_account_id);
create index saas_subscriptions_plan_fk_idx
  on public.saas_subscriptions (plan_code);
create index saas_subscriptions_billing_account_fk_idx
  on public.saas_subscriptions (tenant_id, billing_account_id);
create index subscription_events_actor_fk_idx
  on public.subscription_status_events (actor_user_id);
create index tenant_feature_flags_updated_by_fk_idx
  on public.tenant_feature_flags (updated_by_user_id);
create index tenant_gateway_connections_connected_by_fk_idx
  on public.tenant_gateway_connections (connected_by_user_id);
create index tenant_plan_assignments_created_by_fk_idx
  on public.tenant_plan_assignments (created_by_user_id);
create index tenant_plan_assignments_plan_fk_idx
  on public.tenant_plan_assignments (plan_code);
