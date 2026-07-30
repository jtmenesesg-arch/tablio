create or replace function private.restore_stored_value_for_order(
  p_tenant_id uuid,
  p_order_id uuid,
  p_refund_id uuid,
  p_stored_value_amount_clp bigint,
  p_idempotency_key text,
  p_now timestamptz default clock_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_entry record;
  remaining bigint;
  restorable bigint;
  restored bigint := 0;
begin
  if p_stored_value_amount_clp < 0
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'valid stored-value refund required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.orders orders
    join public.refunds refund
      on refund.tenant_id = orders.tenant_id
     and refund.payment_id = orders.payment_id
    where orders.tenant_id = p_tenant_id
      and orders.id = p_order_id
      and refund.id = p_refund_id
      and refund.status = 'completed'
  ) then
    raise exception 'completed refund does not belong to order'
      using errcode = '55000';
  end if;
  remaining := p_stored_value_amount_clp;
  for source_entry in
    select
      consumed.*,
      greatest(
        0,
        -consumed.amount_clp - coalesce((
          select sum(restored_entry.amount_clp)
          from public.stored_value_ledger_entries restored_entry
          where restored_entry.tenant_id = consumed.tenant_id
            and restored_entry.order_id = consumed.order_id
            and restored_entry.stored_value_lot_id = consumed.stored_value_lot_id
            and restored_entry.entry_type = 'order_refund'
        ), 0)
      )::bigint as still_restorable_clp
    from public.stored_value_ledger_entries consumed
    where consumed.tenant_id = p_tenant_id
      and consumed.order_id = p_order_id
      and consumed.entry_type = 'order_consumption'
    order by consumed.occurred_at, consumed.id
    for update
  loop
    exit when remaining = 0;
    restorable := least(remaining, source_entry.still_restorable_clp);
    if restorable > 0 then
      insert into public.stored_value_ledger_entries (
        tenant_id, stored_value_account_id, stored_value_lot_id, bucket,
        entry_type, amount_clp, idempotency_key, checkout_quote_id,
        order_id, payment_id, refund_id, occurred_at,
        reason
      )
      values (
        p_tenant_id, source_entry.stored_value_account_id,
        source_entry.stored_value_lot_id, source_entry.bucket,
        'order_refund', restorable,
        p_idempotency_key || ':' || source_entry.stored_value_lot_id::text,
        source_entry.checkout_quote_id, p_order_id, source_entry.payment_id,
        p_refund_id, p_now,
        'Devuelto al mismo componente y lote usado por el pedido.'
      )
      on conflict (tenant_id, idempotency_key) do nothing;
      remaining := remaining - restorable;
      restored := restored + restorable;
    end if;
  end loop;
  if remaining > 0 then
    raise exception 'stored-value refund exceeds consumed balance'
      using errcode = '55000';
  end if;
  return restored;
end;
$$;

create or replace function private.apply_stored_value_topup_refund(
  p_tenant_id uuid,
  p_topup_receipt_id uuid,
  p_refund_id uuid,
  p_actor_employee_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_now timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.stored_value_topup_receipts%rowtype;
  source_entry record;
  result_id uuid;
  lot_balance bigint;
begin
  if nullif(btrim(p_reason), '') is null
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'reason and idempotency key are required'
      using errcode = '22023';
  end if;
  select * into receipt
  from public.stored_value_topup_receipts
  where tenant_id = p_tenant_id and id = p_topup_receipt_id
  for share;
  if not found or not exists (
    select 1 from public.refunds refund
    where refund.tenant_id = p_tenant_id
      and refund.id = p_refund_id
      and refund.payment_id = receipt.payment_id
      and refund.status = 'completed'
      and refund.amount_clp = receipt.loaded_money_clp
  ) then
    raise exception 'completed money refund does not match top-up'
      using errcode = '55000';
  end if;
  select existing.id into result_id
  from public.stored_value_topup_refunds existing
  where existing.tenant_id = p_tenant_id
    and existing.topup_receipt_id = p_topup_receipt_id;
  if result_id is not null then
    return result_id;
  end if;
  for source_entry in
    select entry.*
    from public.stored_value_ledger_entries entry
    join public.stored_value_lots lot
      on lot.tenant_id = entry.tenant_id
     and lot.id = entry.stored_value_lot_id
    where entry.tenant_id = p_tenant_id
      and lot.source_topup_quote_id = receipt.stored_value_topup_quote_id
      and entry.entry_type in ('topup_loaded_money', 'topup_bonus')
    order by entry.bucket, entry.id
  loop
    select coalesce(sum(entry.amount_clp), 0)::bigint into lot_balance
    from public.stored_value_ledger_entries entry
    where entry.tenant_id = p_tenant_id
      and entry.stored_value_lot_id = source_entry.stored_value_lot_id;
    if lot_balance <> source_entry.amount_clp then
      raise exception 'top-up has already been consumed'
        using errcode = '55000';
    end if;
    insert into public.stored_value_ledger_entries (
      tenant_id, stored_value_account_id, stored_value_lot_id, bucket,
      entry_type, amount_clp, idempotency_key, checkout_quote_id,
      payment_id, refund_id, actor_employee_id, reason, occurred_at
    )
    values (
      p_tenant_id, source_entry.stored_value_account_id,
      source_entry.stored_value_lot_id, source_entry.bucket,
      'topup_refund', -source_entry.amount_clp,
      p_idempotency_key || ':' || source_entry.stored_value_lot_id::text,
      source_entry.checkout_quote_id, receipt.payment_id, p_refund_id,
      p_actor_employee_id, btrim(p_reason), p_now
    );
  end loop;
  result_id := gen_random_uuid();
  insert into public.stored_value_topup_refunds (
    id, tenant_id, topup_receipt_id, refund_id,
    actor_employee_id, reason, created_at
  )
  values (
    result_id, p_tenant_id, p_topup_receipt_id, p_refund_id,
    p_actor_employee_id, btrim(p_reason), p_now
  );
  return result_id;
end;
$$;

create or replace function private.snapshot_stored_value_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift_record public.cashier_shifts%rowtype;
begin
  select * into shift_record
  from public.cashier_shifts
  where tenant_id = new.tenant_id and id = new.cashier_shift_id;
  select
    coalesce(sum(entry.amount_clp)
      filter (where entry.entry_type = 'topup_loaded_money'), 0)::bigint,
    coalesce(-sum(entry.amount_clp)
      filter (where entry.entry_type = 'order_consumption'), 0)::bigint,
    coalesce(-sum(entry.amount_clp)
      filter (where entry.entry_type = 'expiry'), 0)::bigint
  into
    new.stored_value_topups_cash_in_clp,
    new.stored_value_consumed_revenue_clp,
    new.stored_value_expired_clp
  from public.stored_value_ledger_entries entry
  where entry.tenant_id = new.tenant_id
    and entry.occurred_at >= shift_record.opened_at
    and entry.occurred_at <= new.closed_at;
  select coalesce(sum(entry.amount_clp), 0)::bigint
  into new.stored_value_liability_clp
  from public.stored_value_ledger_entries entry
  where entry.tenant_id = new.tenant_id
    and entry.occurred_at <= new.closed_at;
  return new;
end;
$$;

create trigger cashier_shift_closures_stored_value_snapshot
before insert on public.cashier_shift_closures
for each row execute function private.snapshot_stored_value_closure();

revoke all on function
  private.restore_stored_value_for_order(uuid,uuid,uuid,bigint,text,timestamptz),
  private.apply_stored_value_topup_refund(uuid,uuid,uuid,uuid,text,text,timestamptz)
from public, anon, authenticated;
