-- Supabase grants broad table privileges to API roles by default. Sprint 9
-- writes must only happen through permission-checked server functions.

revoke insert, update, delete, truncate, references, trigger on table
  public.tenant_table_credit_settings,
  public.table_credit_accounts,
  public.table_credit_order_links,
  public.table_credit_ledger_entries,
  public.table_credit_losses,
  public.table_credit_verification_challenges,
  public.cashier_closure_credit_loss_summaries
from anon, authenticated;
