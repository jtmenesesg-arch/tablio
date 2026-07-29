-- Opening and closing a financial shift requires the dedicated cashier.close
-- permission in addition to the internal reconciliation capability.
create or replace function public.open_cashier_shift(p_venue_id uuid)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform 1
  from private.require_cashier_permission('cashier.close');

  return private.open_cashier_shift(p_venue_id);
end;
$$;

create or replace function public.close_cashier_shift(
  p_cashier_shift_id uuid,
  p_expected_version integer,
  p_cash_declared_clp bigint,
  p_exception_override_reason text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform 1
  from private.require_cashier_permission('cashier.close');

  return private.close_cashier_shift(
    p_cashier_shift_id,
    p_expected_version,
    p_cash_declared_clp,
    p_exception_override_reason
  );
end;
$$;
