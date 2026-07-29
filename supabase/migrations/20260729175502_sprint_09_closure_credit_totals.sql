-- Freeze operational sales and credit movement beside the payment-based
-- cashier closure so owner figures can be reconciled for the same interval.

alter table public.cashier_closure_credit_loss_summaries
  add column prepaid_sales_clp bigint not null default 0
    check (prepaid_sales_clp >= 0),
  add column credit_charged_clp bigint not null default 0
    check (credit_charged_clp >= 0),
  add column operational_sales_clp bigint not null default 0,
  add column credit_collected_clp bigint not null default 0
    check (credit_collected_clp >= 0),
  add column ending_open_exposure_clp bigint not null default 0
    check (ending_open_exposure_clp >= 0),
  add column credit_order_count integer not null default 0
    check (credit_order_count >= 0),
  add check (
    operational_sales_clp = prepaid_sales_clp + credit_charged_clp
  );

create or replace function private.materialize_credit_loss_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift_opened_at timestamptz;
begin
  select shift.opened_at
  into shift_opened_at
  from public.cashier_shifts shift
  where shift.tenant_id = new.tenant_id
    and shift.id = new.cashier_shift_id;

  insert into public.cashier_closure_credit_loss_summaries (
    tenant_id,
    closure_id,
    prepaid_sales_clp,
    credit_charged_clp,
    operational_sales_clp,
    credit_collected_clp,
    credit_loss_clp,
    ending_open_exposure_clp,
    credit_order_count,
    loss_count
  )
  values (
    new.tenant_id,
    new.id,
    coalesce((
      select sum(order_record.total_clp)
      from public.orders order_record
      join public.tables venue_table
        on venue_table.tenant_id = order_record.tenant_id
       and venue_table.id = order_record.table_id
      where order_record.tenant_id = new.tenant_id
        and venue_table.venue_id = new.venue_id
        and order_record.financial_mode = 'prepaid'
        and order_record.confirmed_at >= shift_opened_at
        and order_record.confirmed_at < new.closed_at
    ), 0),
    coalesce((
      select sum(entry.amount_clp)
      from public.table_credit_ledger_entries entry
      join public.table_credit_accounts account
        on account.tenant_id = entry.tenant_id
       and account.id = entry.account_id
      where entry.tenant_id = new.tenant_id
        and account.venue_id = new.venue_id
        and entry.entry_type = 'charge'
        and entry.occurred_at >= shift_opened_at
        and entry.occurred_at < new.closed_at
    ), 0),
    coalesce((
      select sum(order_record.total_clp)
      from public.orders order_record
      join public.tables venue_table
        on venue_table.tenant_id = order_record.tenant_id
       and venue_table.id = order_record.table_id
      where order_record.tenant_id = new.tenant_id
        and venue_table.venue_id = new.venue_id
        and order_record.confirmed_at >= shift_opened_at
        and order_record.confirmed_at < new.closed_at
    ), 0),
    coalesce((
      select sum(entry.amount_clp)
      from public.table_credit_ledger_entries entry
      join public.table_credit_accounts account
        on account.tenant_id = entry.tenant_id
       and account.id = entry.account_id
      where entry.tenant_id = new.tenant_id
        and account.venue_id = new.venue_id
        and entry.entry_type in ('digital_payment', 'in_person_payment')
        and entry.occurred_at >= shift_opened_at
        and entry.occurred_at < new.closed_at
    ), 0),
    coalesce((
      select sum(loss.amount_clp)
      from public.table_credit_losses loss
      where loss.tenant_id = new.tenant_id
        and loss.cashier_shift_id = new.cashier_shift_id
    ), 0),
    coalesce((
      select sum(account.outstanding_clp)
      from public.table_credit_accounts account
      where account.tenant_id = new.tenant_id
        and account.venue_id = new.venue_id
        and account.opened_at < new.closed_at
        and (
          account.closed_at is null
          or account.closed_at >= new.closed_at
        )
    ), 0),
    (
      select count(*)::integer
      from public.table_credit_ledger_entries entry
      join public.table_credit_accounts account
        on account.tenant_id = entry.tenant_id
       and account.id = entry.account_id
      where entry.tenant_id = new.tenant_id
        and account.venue_id = new.venue_id
        and entry.entry_type = 'charge'
        and entry.occurred_at >= shift_opened_at
        and entry.occurred_at < new.closed_at
    ),
    (
      select count(*)::integer
      from public.table_credit_losses loss
      where loss.tenant_id = new.tenant_id
        and loss.cashier_shift_id = new.cashier_shift_id
    )
  );
  return new;
end;
$$;
