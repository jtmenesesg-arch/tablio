-- Cover every Sprint 6 foreign key reported by Supabase Performance Advisor.
create index cashier_closure_tips_employee_fk_idx
on public.cashier_closure_tip_summaries (tenant_id, employee_id);

create index cashier_exception_events_actor_user_fk_idx
on public.cashier_exception_events (actor_user_id);

create index cashier_exception_events_actor_employee_fk_idx
on public.cashier_exception_events (tenant_id, actor_employee_id);

create index cashier_manual_productions_actor_employee_fk_idx
on public.cashier_manual_productions (tenant_id, actor_employee_id);

create index cashier_manual_productions_payment_fk_idx
on public.cashier_manual_productions (tenant_id, payment_id);

create index cashier_post_close_adjustments_source_shift_fk_idx
on public.cashier_post_close_adjustments (
  tenant_id,
  source_cashier_shift_id
);

create index cashier_post_close_adjustments_payment_fk_idx
on public.cashier_post_close_adjustments (tenant_id, source_payment_id);

create index cashier_refund_actions_payment_fk_idx
on public.cashier_refund_actions (tenant_id, payment_id);

create index cashier_refund_actions_requester_fk_idx
on public.cashier_refund_actions (tenant_id, requested_by_employee_id);

create index cashier_refund_actions_source_shift_fk_idx
on public.cashier_refund_actions (tenant_id, source_cashier_shift_id);

create index cashier_refund_actions_venue_fk_idx
on public.cashier_refund_actions (tenant_id, venue_id);

create index cashier_shift_closures_closer_fk_idx
on public.cashier_shift_closures (tenant_id, closed_by_employee_id);

create index cashier_shift_closures_venue_fk_idx
on public.cashier_shift_closures (tenant_id, venue_id);

create index cashier_shifts_closer_fk_idx
on public.cashier_shifts (tenant_id, closed_by_employee_id);

create index cashier_shifts_opener_fk_idx
on public.cashier_shifts (tenant_id, opened_by_employee_id);

create index payment_shift_attributions_venue_fk_idx
on public.payment_shift_attributions (tenant_id, venue_id);

create index reconciliation_exceptions_cashier_shift_fk_idx
on public.reconciliation_exceptions (tenant_id, cashier_shift_id);

create index reconciliation_exceptions_resolver_fk_idx
on public.reconciliation_exceptions (tenant_id, resolved_by_employee_id);
