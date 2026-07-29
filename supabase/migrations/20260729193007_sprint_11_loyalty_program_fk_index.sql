create index tenant_loyalty_program_reward_fk_idx
  on public.tenant_loyalty_programs (tenant_id, reward_product_id);
