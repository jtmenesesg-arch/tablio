-- Cover Sprint 9 foreign keys reported by Supabase Performance Advisors.

create index table_credit_settings_updater_fk_idx
on public.tenant_table_credit_settings (updated_by_user_id);
create index table_credit_accounts_opened_user_fk_idx
on public.table_credit_accounts (opened_by_user_id);
create index table_credit_accounts_closed_user_fk_idx
on public.table_credit_accounts (closed_by_user_id);
create index table_credit_accounts_employee_fk_idx
on public.table_credit_accounts (tenant_id, opened_by_employee_id);
create index table_credit_accounts_table_fk_idx
on public.table_credit_accounts (tenant_id, table_id);
create index table_credit_links_order_fk_idx
on public.table_credit_order_links (tenant_id, order_id);
create index table_credit_links_quote_fk_idx
on public.table_credit_order_links (tenant_id, checkout_quote_id);
create index table_credit_ledger_actor_fk_idx
on public.table_credit_ledger_entries (actor_user_id);
create index table_credit_losses_closed_user_fk_idx
on public.table_credit_losses (closed_by_user_id);
create index table_credit_challenges_created_user_fk_idx
on public.table_credit_verification_challenges (created_by_user_id);
create index table_credit_challenges_consumed_user_fk_idx
on public.table_credit_verification_challenges (consumed_by_user_id);
