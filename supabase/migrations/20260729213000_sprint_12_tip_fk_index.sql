create index tip_allocations_employee_fk_idx
  on public.tip_allocations (tenant_id, employee_id)
  where employee_id is not null;
