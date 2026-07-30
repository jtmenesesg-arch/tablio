create index stored_value_topup_quotes_account_fk_idx
on public.stored_value_topup_quotes
  (tenant_id, stored_value_account_id);
