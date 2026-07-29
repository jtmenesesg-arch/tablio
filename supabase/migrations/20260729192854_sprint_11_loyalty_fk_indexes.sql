-- Cover every Sprint 11 foreign key used by deletes, joins and audit lookups.
create index diner_recovery_profile_fk_idx
  on private.diner_recovery_challenges (tenant_id, diner_profile_id);
create index diner_consent_actor_fk_idx
  on public.diner_consent_events (tenant_id, actor_employee_id);
create index diner_identity_device_fk_idx
  on public.diner_identity_events (tenant_id, diner_device_session_id);
create index diner_identity_profile_fk_idx
  on public.diner_identity_events (tenant_id, diner_profile_id);
create index loyalty_assisted_employee_fk_idx
  on public.loyalty_assisted_adjustments (tenant_id, employee_id);
create index loyalty_assisted_session_fk_idx
  on public.loyalty_assisted_adjustments (tenant_id, employee_session_id);
create index loyalty_dormant_profile_fk_idx
  on public.loyalty_dormant_segment_entries (tenant_id, diner_profile_id);
create index loyalty_ledger_actor_fk_idx
  on public.loyalty_ledger_entries (tenant_id, actor_employee_id);
create index loyalty_ledger_visit_fk_idx
  on public.loyalty_ledger_entries (tenant_id, loyalty_visit_id);
create index loyalty_ledger_reward_fk_idx
  on public.loyalty_ledger_entries (tenant_id, reward_redemption_id);
create index loyalty_refund_visit_fk_idx
  on public.loyalty_refund_adjustments (tenant_id, loyalty_visit_id);
create index loyalty_refund_reward_fk_idx
  on public.loyalty_refund_adjustments (tenant_id, reward_redemption_id);
create index loyalty_redemption_cart_fk_idx
  on public.loyalty_reward_redemptions (tenant_id, cart_id);
create index loyalty_redemption_quote_fk_idx
  on public.loyalty_reward_redemptions (tenant_id, checkout_quote_id);
create index loyalty_redemption_order_fk_idx
  on public.loyalty_reward_redemptions (tenant_id, order_id);
create index loyalty_redemption_product_fk_idx
  on public.loyalty_reward_redemptions (tenant_id, product_id);
