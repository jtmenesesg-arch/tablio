-- Sprint 6: cashier desk, immutable shift close and reconciliation.
-- Monetary amounts are integer CLP. User-facing routes use the caller JWT;
-- privileged functions repeat tenant/permission checks before every mutation.

create table public.tenant_cashier_settings (
  tenant_id uuid primary key
    references public.tenants (id) on delete cascade,
  manual_production_window_seconds integer not null default 1200
    check (manual_production_window_seconds between 300 and 3600),
  cash_tracking_enabled boolean not null default false,
  reconciliation_interval_seconds integer not null default 45
    check (reconciliation_interval_seconds between 30 and 300),
  updated_at timestamptz not null default clock_timestamp()
);

comment on column public.tenant_cashier_settings.manual_production_window_seconds
is 'Default 20 minutes from provider approval. After this deadline manual production is disabled.';

create table public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  status text not null default 'open'
    check (status in ('open', 'closed')),
  state_version integer not null default 0 check (state_version >= 0),
  opened_by_employee_id uuid not null,
  opened_at timestamptz not null default clock_timestamp(),
  closed_by_employee_id uuid,
  closed_at timestamptz,
  close_override_reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, opened_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  foreign key (tenant_id, closed_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    (status = 'open' and closed_at is null and closed_by_employee_id is null)
    or (
      status = 'closed'
      and closed_at is not null
      and closed_by_employee_id is not null
      and closed_at >= opened_at
    )
  )
);

create unique index cashier_shifts_one_open_per_venue_idx
on public.cashier_shifts (tenant_id, venue_id)
where status = 'open';

create index cashier_shifts_venue_time_idx
on public.cashier_shifts (tenant_id, venue_id, opened_at, closed_at);

create table public.payment_shift_attributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  payment_id uuid not null,
  cashier_shift_id uuid,
  attribution_status text not null
    check (
      attribution_status in (
        'assigned',
        'post_close_review',
        'unassigned'
      )
    ),
  provider_approved_at timestamptz not null,
  provider_received_at timestamptz not null,
  attribution_reason text not null check (btrim(attribution_reason) <> ''),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, payment_id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict,
  check (
    (attribution_status = 'unassigned' and cashier_shift_id is null)
    or (
      attribution_status in ('assigned', 'post_close_review')
      and cashier_shift_id is not null
    )
  )
);

create table public.cashier_shift_closures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  cashier_shift_id uuid not null,
  venue_id uuid not null,
  gross_sales_clp bigint not null check (gross_sales_clp >= 0),
  refunds_clp bigint not null check (refunds_clp >= 0),
  chargebacks_clp bigint not null check (chargebacks_clp >= 0),
  provider_fees_clp bigint not null check (provider_fees_clp >= 0),
  expected_payout_clp bigint not null,
  digital_processed_clp bigint not null check (digital_processed_clp >= 0),
  cash_declared_clp bigint not null check (cash_declared_clp >= 0),
  tip_earned_clp bigint not null check (tip_earned_clp >= 0),
  tip_refunded_open_shift_clp bigint not null
    check (tip_refunded_open_shift_clp >= 0),
  local_tip_adjustments_clp bigint not null
    check (local_tip_adjustments_clp >= 0),
  order_count integer not null check (order_count >= 0),
  average_ticket_clp bigint not null check (average_ticket_clp >= 0),
  open_exception_count integer not null check (open_exception_count >= 0),
  exception_override_reason text,
  closed_by_employee_id uuid not null,
  closed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, cashier_shift_id),
  foreign key (tenant_id, cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, closed_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    expected_payout_clp =
      gross_sales_clp - refunds_clp - chargebacks_clp - provider_fees_clp
  ),
  check (
    open_exception_count = 0
    or nullif(btrim(exception_override_reason), '') is not null
  )
);

create table public.cashier_closure_payment_method_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  closure_id uuid not null,
  payment_method text not null check (btrim(payment_method) <> ''),
  gross_clp bigint not null check (gross_clp >= 0),
  refunds_clp bigint not null check (refunds_clp >= 0),
  provider_fees_clp bigint not null check (provider_fees_clp >= 0),
  expected_payout_clp bigint not null,
  transaction_count integer not null check (transaction_count >= 0),
  unique (tenant_id, id),
  unique (tenant_id, closure_id, payment_method),
  foreign key (tenant_id, closure_id)
    references public.cashier_shift_closures (tenant_id, id) on delete restrict
);

create table public.cashier_closure_tip_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  closure_id uuid not null,
  employee_id uuid,
  employee_label text not null check (btrim(employee_label) <> ''),
  earned_clp bigint not null check (earned_clp >= 0),
  refunded_while_open_clp bigint not null
    check (refunded_while_open_clp >= 0),
  distributable_clp bigint not null check (distributable_clp >= 0),
  unique (tenant_id, id),
  unique nulls not distinct (tenant_id, closure_id, employee_id),
  foreign key (tenant_id, closure_id)
    references public.cashier_shift_closures (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (distributable_clp = earned_clp - refunded_while_open_clp)
);

create table public.cashier_post_close_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  source_cashier_shift_id uuid not null,
  source_payment_id uuid not null,
  source_refund_id uuid not null,
  adjustment_type text not null
    check (adjustment_type = 'local_absorbs_distributed_tip_refund'),
  amount_clp bigint not null check (amount_clp > 0),
  explanation text not null check (btrim(explanation) <> ''),
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, source_refund_id, adjustment_type),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_refund_id)
    references public.refunds (tenant_id, id) on delete restrict
);

create table public.cashier_closure_adjustments (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  closure_id uuid not null,
  adjustment_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, closure_id, adjustment_id),
  unique (tenant_id, adjustment_id),
  foreign key (tenant_id, closure_id)
    references public.cashier_shift_closures (tenant_id, id) on delete restrict,
  foreign key (tenant_id, adjustment_id)
    references public.cashier_post_close_adjustments (tenant_id, id)
    on delete restrict
);

create table public.cashier_refund_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  venue_id uuid not null,
  refund_id uuid not null,
  payment_id uuid not null,
  source_cashier_shift_id uuid,
  operation_cashier_shift_id uuid,
  requested_by_employee_id uuid not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  reason text not null check (btrim(reason) <> ''),
  amount_clp bigint not null check (amount_clp > 0),
  proportional_tip_component_clp bigint not null
    check (proportional_tip_component_clp >= 0),
  tip_refunded_from_open_shift_clp bigint not null
    check (tip_refunded_from_open_shift_clp >= 0),
  local_tip_adjustment_clp bigint not null
    check (local_tip_adjustment_clp >= 0),
  shift_policy text not null
    check (shift_policy in ('open_shift_reduces_tip', 'closed_shift_local_absorbs')),
  requested_at timestamptz not null,
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, refund_id),
  foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  foreign key (tenant_id, refund_id)
    references public.refunds (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, source_cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, operation_cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, requested_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    proportional_tip_component_clp =
      tip_refunded_from_open_shift_clp + local_tip_adjustment_clp
  ),
  check (
    (shift_policy = 'open_shift_reduces_tip'
      and local_tip_adjustment_clp = 0)
    or (shift_policy = 'closed_shift_local_absorbs'
      and tip_refunded_from_open_shift_clp = 0)
  )
);

create table public.cashier_exception_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  reconciliation_exception_id uuid not null,
  from_status text,
  to_status text not null
    check (to_status in ('open', 'in_review', 'resolved', 'escalated')),
  action text not null check (btrim(action) <> ''),
  reason text,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  actor_employee_id uuid not null,
  occurred_at timestamptz not null,
  unique (tenant_id, id),
  foreign key (tenant_id, reconciliation_exception_id)
    references public.reconciliation_exceptions (tenant_id, id)
    on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

create table public.cashier_manual_productions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  reconciliation_exception_id uuid not null,
  payment_id uuid not null,
  order_id uuid not null,
  actor_employee_id uuid not null,
  reason text not null check (btrim(reason) <> ''),
  provider_approved_at timestamptz not null,
  produced_at timestamptz not null,
  unique (tenant_id, id),
  unique (tenant_id, reconciliation_exception_id),
  unique (tenant_id, order_id),
  foreign key (tenant_id, reconciliation_exception_id)
    references public.reconciliation_exceptions (tenant_id, id)
    on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, actor_employee_id)
    references public.employees (tenant_id, id) on delete restrict
);

create table public.settlement_payment_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  settlement_id uuid not null,
  payment_id uuid not null,
  provider_entry_id text not null check (btrim(provider_entry_id) <> ''),
  gross_clp bigint not null,
  refunds_clp bigint not null default 0 check (refunds_clp >= 0),
  chargebacks_clp bigint not null default 0 check (chargebacks_clp >= 0),
  provider_fee_clp bigint not null default 0 check (provider_fee_clp >= 0),
  net_clp bigint not null,
  deposited_clp bigint not null,
  deposit_reference text,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  unique (tenant_id, id),
  unique (tenant_id, provider_entry_id),
  unique (tenant_id, settlement_id, payment_id),
  foreign key (tenant_id, settlement_id)
    references public.settlements (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  check (
    net_clp = gross_clp - refunds_clp - chargebacks_clp - provider_fee_clp
  )
);

alter table public.reconciliation_exceptions
  drop constraint if exists reconciliation_exceptions_status_check;

update public.reconciliation_exceptions
set status = case
  when status = 'acknowledged' then 'in_review'
  when status = 'dismissed' then 'resolved'
  else status
end;

alter table public.reconciliation_exceptions
  add column venue_id uuid,
  add column cashier_shift_id uuid,
  add column provider_approved_at timestamptz,
  add column provider_received_at timestamptz,
  add column manual_production_deadline_at timestamptz,
  add column state_version integer not null default 0
    check (state_version >= 0),
  add column resolution_action text,
  add column resolution_reason text,
  add column resolved_by_employee_id uuid,
  add column escalated_at timestamptz,
  add constraint reconciliation_exceptions_status_check
    check (status in ('open', 'in_review', 'resolved', 'escalated')),
  add foreign key (tenant_id, venue_id)
    references public.venues (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, cashier_shift_id)
    references public.cashier_shifts (tenant_id, id) on delete restrict,
  add foreign key (tenant_id, resolved_by_employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  add check (
    (status <> 'resolved')
    or (
      resolved_at is not null
      and resolved_by_employee_id is not null
      and nullif(btrim(resolution_action), '') is not null
      and nullif(btrim(resolution_reason), '') is not null
    )
  );

create index payment_shift_attributions_shift_idx
on public.payment_shift_attributions (
  tenant_id,
  cashier_shift_id,
  provider_approved_at
)
where cashier_shift_id is not null;

create index cashier_refund_actions_operation_shift_idx
on public.cashier_refund_actions (
  tenant_id,
  operation_cashier_shift_id,
  requested_at
)
where operation_cashier_shift_id is not null;

create index cashier_post_close_adjustments_venue_time_idx
on public.cashier_post_close_adjustments (tenant_id, venue_id, occurred_at);

create index cashier_exception_events_exception_idx
on public.cashier_exception_events (
  tenant_id,
  reconciliation_exception_id,
  occurred_at
);

create index settlement_payment_entries_payment_idx
on public.settlement_payment_entries (tenant_id, payment_id);

create index reconciliation_exceptions_venue_queue_idx
on public.reconciliation_exceptions (
  tenant_id,
  venue_id,
  status,
  priority,
  created_at
)
where visible_to_cashier;

create or replace function private.current_cashier_employee_id(
  p_tenant_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.employee_id
  from public.tenant_memberships membership
  where membership.tenant_id = p_tenant_id
    and membership.user_id = auth.uid()
    and membership.status = 'active'
    and membership.employee_id is not null
  limit 1;
$$;

create or replace function private.require_cashier_permission(
  p_permission text
)
returns table (tenant_id uuid, employee_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  selected_employee_id uuid;
begin
  selected_tenant_id := private.require_tenant_context();
  selected_employee_id :=
    private.current_cashier_employee_id(selected_tenant_id);

  if selected_employee_id is null
    or not private.has_permission(selected_tenant_id, p_permission) then
    raise exception 'cashier permission denied'
      using errcode = '42501';
  end if;

  return query select selected_tenant_id, selected_employee_id;
end;
$$;

create or replace function private.enrich_cashier_exception()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record record;
  attribution_record record;
  production_window integer := 1200;
begin
  if new.provider_payment_event_id is not null then
    select
      event.occurred_at,
      event.received_at,
      quote.table_id,
      table_record.venue_id
    into event_record
    from public.provider_payment_events event
    left join public.checkout_quotes quote
      on quote.tenant_id = event.tenant_id
     and quote.id = event.checkout_quote_id
    left join public.tables table_record
      on table_record.tenant_id = quote.tenant_id
     and table_record.id = quote.table_id
    where event.tenant_id = new.tenant_id
      and event.id = new.provider_payment_event_id;

    new.provider_approved_at :=
      coalesce(new.provider_approved_at, event_record.occurred_at);
    new.provider_received_at :=
      coalesce(new.provider_received_at, event_record.received_at);
    new.venue_id := coalesce(new.venue_id, event_record.venue_id);
  end if;

  if new.payment_id is not null then
    select attribution.cashier_shift_id, attribution.venue_id,
      attribution.provider_approved_at, attribution.provider_received_at
    into attribution_record
    from public.payment_shift_attributions attribution
    where attribution.tenant_id = new.tenant_id
      and attribution.payment_id = new.payment_id;

    new.cashier_shift_id :=
      coalesce(new.cashier_shift_id, attribution_record.cashier_shift_id);
    new.venue_id := coalesce(new.venue_id, attribution_record.venue_id);
    new.provider_approved_at := coalesce(
      new.provider_approved_at,
      attribution_record.provider_approved_at
    );
    new.provider_received_at := coalesce(
      new.provider_received_at,
      attribution_record.provider_received_at
    );
  end if;

  if new.exception_type in (
    'approved_after_quote_expired',
    'approved_without_active_stock_reservation'
  ) and new.provider_approved_at is not null then
    select settings.manual_production_window_seconds
    into production_window
    from public.tenant_cashier_settings settings
    where settings.tenant_id = new.tenant_id;

    new.manual_production_deadline_at :=
      new.provider_approved_at
      + make_interval(secs => coalesce(production_window, 1200));
  end if;

  return new;
end;
$$;

create trigger reconciliation_exceptions_enrich_cashier_context
before insert or update of payment_id, provider_payment_event_id
on public.reconciliation_exceptions
for each row execute function private.enrich_cashier_exception();

create or replace function private.attribute_approved_payment_to_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  venue_record uuid;
  shift_record public.cashier_shifts%rowtype;
  attribution_state text;
  attribution_reason text;
  exception_id uuid;
begin
  if new.normalized_status <> 'approved'
    or not new.signature_verified
    or not new.server_verified
    or new.payment_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.payment_shift_attributions attribution
    where attribution.tenant_id = new.tenant_id
      and attribution.payment_id = new.payment_id
  ) then
    return new;
  end if;

  select table_record.venue_id
  into venue_record
  from public.checkout_quotes quote
  join public.tables table_record
    on table_record.tenant_id = quote.tenant_id
   and table_record.id = quote.table_id
  where quote.tenant_id = new.tenant_id
    and quote.id = new.checkout_quote_id;

  if venue_record is null then
    return new;
  end if;

  select shift.*
  into shift_record
  from public.cashier_shifts shift
  where shift.tenant_id = new.tenant_id
    and shift.venue_id = venue_record
    and shift.opened_at <= new.occurred_at
    and (
      shift.closed_at is null
      or new.occurred_at < shift.closed_at
    )
  order by shift.opened_at desc
  limit 1;

  if shift_record.id is null then
    attribution_state := 'unassigned';
    attribution_reason :=
      'provider approval time is outside every cashier shift';
  elsif shift_record.status = 'closed' then
    attribution_state := 'post_close_review';
    attribution_reason :=
      'approval belongs to a shift that was already closed when received';
  else
    attribution_state := 'assigned';
    attribution_reason := 'provider approval time is inside the open shift';
  end if;

  insert into public.payment_shift_attributions (
    tenant_id,
    venue_id,
    payment_id,
    cashier_shift_id,
    attribution_status,
    provider_approved_at,
    provider_received_at,
    attribution_reason
  )
  values (
    new.tenant_id,
    venue_record,
    new.payment_id,
    shift_record.id,
    attribution_state,
    new.occurred_at,
    new.received_at,
    attribution_reason
  )
  on conflict (tenant_id, payment_id) do nothing;

  if attribution_state = 'unassigned' then
    exception_id := private.add_reconciliation_exception(
      new.tenant_id,
      new.payment_id,
      new.id,
      null,
      'confirmation_without_cashier_shift',
      new.provider || ':' || new.provider_payment_id,
      'critical',
      true,
      true,
      'confirmación sin turno asignado: revisar ambas horas',
      array['refund', 'investigate', 'escalate'],
      jsonb_build_object(
        'provider_approved_at', new.occurred_at,
        'provider_received_at', new.received_at,
        'attribution', 'unassigned'
      ),
      new.received_at
    );
  elsif attribution_state = 'post_close_review' then
    exception_id := private.add_reconciliation_exception(
      new.tenant_id,
      new.payment_id,
      new.id,
      null,
      'confirmation_after_shift_close',
      new.provider || ':' || new.provider_payment_id,
      'critical',
      true,
      true,
      'confirmación recibida después del cierre: revisar el turno original',
      array['refund', 'investigate', 'escalate'],
      jsonb_build_object(
        'cashier_shift_id', shift_record.id,
        'provider_approved_at', new.occurred_at,
        'provider_received_at', new.received_at
      ),
      new.received_at
    );
  end if;

  return new;
end;
$$;

create trigger provider_payment_events_attribute_cashier_shift
after insert on public.provider_payment_events
for each row execute function private.attribute_approved_payment_to_shift();

create trigger cashier_shift_closures_immutable
before update or delete on public.cashier_shift_closures
for each row execute function private.prevent_financial_evidence_mutation();

create trigger cashier_closure_payment_methods_immutable
before update or delete on public.cashier_closure_payment_method_summaries
for each row execute function private.prevent_financial_evidence_mutation();

create trigger cashier_closure_tips_immutable
before update or delete on public.cashier_closure_tip_summaries
for each row execute function private.prevent_financial_evidence_mutation();

create trigger payment_shift_attributions_immutable
before update or delete on public.payment_shift_attributions
for each row execute function private.prevent_financial_evidence_mutation();

create trigger cashier_post_close_adjustments_immutable
before update or delete on public.cashier_post_close_adjustments
for each row execute function private.prevent_financial_evidence_mutation();

create trigger cashier_closure_adjustments_immutable
before update or delete on public.cashier_closure_adjustments
for each row execute function private.prevent_financial_evidence_mutation();

create trigger cashier_refund_actions_immutable
before update or delete on public.cashier_refund_actions
for each row execute function private.prevent_financial_evidence_mutation();

create trigger cashier_exception_events_immutable
before update or delete on public.cashier_exception_events
for each row execute function private.prevent_financial_evidence_mutation();

create trigger cashier_manual_productions_immutable
before update or delete on public.cashier_manual_productions
for each row execute function private.prevent_financial_evidence_mutation();

create trigger settlement_payment_entries_immutable
before update or delete on public.settlement_payment_entries
for each row execute function private.prevent_financial_evidence_mutation();

create trigger tenant_cashier_settings_set_updated_at
before update on public.tenant_cashier_settings
for each row execute function private.set_updated_at();

create or replace function private.open_cashier_shift(
  p_venue_id uuid,
  p_opened_at timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cashier record;
  shift_id uuid;
begin
  select * into cashier
  from private.require_cashier_permission('reconciliation.manage');

  if not exists (
    select 1
    from public.venues venue
    where venue.tenant_id = cashier.tenant_id
      and venue.id = p_venue_id
  ) then
    raise exception 'cashier venue is outside the active tenant'
      using errcode = '42501';
  end if;

  insert into public.cashier_shifts (
    tenant_id,
    venue_id,
    opened_by_employee_id,
    opened_at
  )
  values (
    cashier.tenant_id,
    p_venue_id,
    cashier.employee_id,
    p_opened_at
  )
  returning id into shift_id;

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    occurred_at
  )
  values (
    cashier.tenant_id,
    'employee',
    auth.uid(),
    cashier.employee_id,
    'cashier.shift_opened',
    'cashier_shift',
    shift_id,
    'inicio de turno de caja',
    p_opened_at
  );

  return shift_id;
end;
$$;

create or replace function private.request_cashier_refund(
  p_payment_id uuid,
  p_amount_clp bigint,
  p_idempotency_key text,
  p_reason text,
  p_requested_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cashier record;
  payment_record public.payments%rowtype;
  quote_record public.checkout_quotes%rowtype;
  attribution_record public.payment_shift_attributions%rowtype;
  source_shift public.cashier_shifts%rowtype;
  operation_shift public.cashier_shifts%rowtype;
  existing_action public.cashier_refund_actions%rowtype;
  already_refunded bigint;
  previous_tip_refunded bigint;
  cumulative_tip_refunded bigint;
  tip_component bigint;
  tip_from_open bigint;
  local_tip_adjustment bigint;
  policy text;
  venue_record uuid;
  refund_id uuid;
  action_id uuid;
begin
  select * into cashier
  from private.require_cashier_permission('payments.refund');

  if nullif(btrim(p_idempotency_key), '') is null
    or nullif(btrim(p_reason), '') is null then
    raise exception 'refund idempotency key and reason are required'
      using errcode = '22023';
  end if;

  select action.* into existing_action
  from public.cashier_refund_actions action
  where action.tenant_id = cashier.tenant_id
    and action.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'refund_id', existing_action.refund_id,
      'action_id', existing_action.id,
      'idempotent_replay', true,
      'tip_policy', existing_action.shift_policy,
      'tip_component_clp', existing_action.proportional_tip_component_clp
    );
  end if;

  select payment.* into payment_record
  from public.payments payment
  where payment.tenant_id = cashier.tenant_id
    and payment.id = p_payment_id
  for update;

  if not found or not exists (
    select 1
    from public.provider_payment_events event
    where event.tenant_id = cashier.tenant_id
      and event.payment_id = p_payment_id
      and event.normalized_status = 'approved'
      and event.signature_verified
      and event.server_verified
  ) then
    raise exception 'refund requires a server-verified approved payment'
      using errcode = '55000';
  end if;

  select quote.* into quote_record
  from public.checkout_quotes quote
  where quote.tenant_id = cashier.tenant_id
    and quote.id = payment_record.checkout_quote_id;

  select table_record.venue_id
  into venue_record
  from public.tables table_record
  where table_record.tenant_id = cashier.tenant_id
    and table_record.id = quote_record.table_id;

  select attribution.* into attribution_record
  from public.payment_shift_attributions attribution
  where attribution.tenant_id = cashier.tenant_id
    and attribution.payment_id = payment_record.id;

  if attribution_record.cashier_shift_id is not null then
    select shift.* into source_shift
    from public.cashier_shifts shift
    where shift.tenant_id = cashier.tenant_id
      and shift.id = attribution_record.cashier_shift_id;
  end if;

  select shift.* into operation_shift
  from public.cashier_shifts shift
  where shift.tenant_id = cashier.tenant_id
    and shift.venue_id = venue_record
    and shift.status = 'open'
  for update;

  if operation_shift.id is null then
    raise exception 'refund requires an open cashier shift'
      using errcode = '55000';
  end if;

  select coalesce(sum(refund.amount_clp), 0)
  into already_refunded
  from public.refunds refund
  where refund.tenant_id = cashier.tenant_id
    and refund.payment_id = payment_record.id
    and refund.status in ('pending', 'completed');

  if p_amount_clp <= 0
    or already_refunded + p_amount_clp > payment_record.amount_clp then
    raise exception 'refund exceeds remaining approved amount'
      using errcode = '23514';
  end if;

  previous_tip_refunded := (
    quote_record.tip_clp * already_refunded / payment_record.amount_clp
  );
  cumulative_tip_refunded := (
    quote_record.tip_clp * (already_refunded + p_amount_clp)
      / payment_record.amount_clp
  );
  tip_component := cumulative_tip_refunded - previous_tip_refunded;

  if source_shift.id is not null and source_shift.status = 'closed' then
    policy := 'closed_shift_local_absorbs';
    tip_from_open := 0;
    local_tip_adjustment := tip_component;
  else
    policy := 'open_shift_reduces_tip';
    tip_from_open := tip_component;
    local_tip_adjustment := 0;
  end if;

  refund_id := gen_random_uuid();
  insert into public.refunds (
    id,
    tenant_id,
    payment_id,
    idempotency_key,
    amount_clp,
    currency,
    status,
    reason,
    occurred_at,
    created_at
  )
  values (
    refund_id,
    cashier.tenant_id,
    payment_record.id,
    p_idempotency_key,
    p_amount_clp,
    payment_record.currency,
    'pending',
    btrim(p_reason),
    p_requested_at,
    p_requested_at
  );

  insert into public.cashier_refund_actions (
    tenant_id,
    venue_id,
    refund_id,
    payment_id,
    source_cashier_shift_id,
    operation_cashier_shift_id,
    requested_by_employee_id,
    idempotency_key,
    reason,
    amount_clp,
    proportional_tip_component_clp,
    tip_refunded_from_open_shift_clp,
    local_tip_adjustment_clp,
    shift_policy,
    requested_at
  )
  values (
    cashier.tenant_id,
    venue_record,
    refund_id,
    payment_record.id,
    source_shift.id,
    operation_shift.id,
    cashier.employee_id,
    p_idempotency_key,
    btrim(p_reason),
    p_amount_clp,
    tip_component,
    tip_from_open,
    local_tip_adjustment,
    policy,
    p_requested_at
  )
  returning id into action_id;

  if local_tip_adjustment > 0 then
    insert into public.cashier_post_close_adjustments (
      tenant_id,
      venue_id,
      source_cashier_shift_id,
      source_payment_id,
      source_refund_id,
      adjustment_type,
      amount_clp,
      explanation,
      occurred_at
    )
    values (
      cashier.tenant_id,
      venue_record,
      source_shift.id,
      payment_record.id,
      refund_id,
      'local_absorbs_distributed_tip_refund',
      local_tip_adjustment,
      'La propina ya fue distribuida; el local absorbe este componente del reembolso.',
      p_requested_at
    );
  end if;

  insert into public.outbox_messages (
    tenant_id,
    aggregate_type,
    aggregate_id,
    topic,
    deduplication_key,
    payload,
    available_at,
    created_at
  )
  values (
    cashier.tenant_id,
    'refund',
    refund_id,
    'payments.refund_requested',
    'cashier-refund:' || p_idempotency_key,
    jsonb_build_object(
      'refund_id', refund_id,
      'payment_id', payment_record.id,
      'amount_clp', p_amount_clp,
      'reason', btrim(p_reason),
      'requested_by_employee_id', cashier.employee_id
    ),
    p_requested_at,
    p_requested_at
  );

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    after_data,
    occurred_at
  )
  values (
    cashier.tenant_id,
    'employee',
    auth.uid(),
    cashier.employee_id,
    'cashier.refund_requested',
    'refund',
    refund_id,
    btrim(p_reason),
    jsonb_build_object(
      'amount_clp', p_amount_clp,
      'tip_component_clp', tip_component,
      'tip_policy', policy,
      'source_shift_id', source_shift.id,
      'operation_shift_id', operation_shift.id
    ),
    p_requested_at
  );

  return jsonb_build_object(
    'refund_id', refund_id,
    'action_id', action_id,
    'idempotent_replay', false,
    'tip_policy', policy,
    'tip_component_clp', tip_component,
    'local_tip_adjustment_clp', local_tip_adjustment
  );
end;
$$;

create or replace function private.finalize_cashier_refund(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_provider_refund_id text,
  p_status text,
  p_occurred_at timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  refund_id uuid;
begin
  if p_status not in ('completed', 'rejected') then
    raise exception 'invalid final refund status' using errcode = '22023';
  end if;

  update public.refunds refund
  set provider_refund_id = p_provider_refund_id,
      status = p_status,
      occurred_at = p_occurred_at
  where refund.tenant_id = p_tenant_id
    and refund.idempotency_key = p_idempotency_key
    and refund.status = 'pending'
  returning refund.id into refund_id;

  if refund_id is null then
    select refund.id into refund_id
    from public.refunds refund
    where refund.tenant_id = p_tenant_id
      and refund.idempotency_key = p_idempotency_key
      and refund.status = p_status;
  end if;

  if refund_id is null then
    raise exception 'pending refund not found' using errcode = 'P0002';
  end if;

  return refund_id;
end;
$$;

create or replace function private.transition_cashier_exception(
  p_exception_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cashier record;
  exception_record public.reconciliation_exceptions%rowtype;
  target_status text;
begin
  select * into cashier
  from private.require_cashier_permission('reconciliation.manage');

  select exception.* into exception_record
  from public.reconciliation_exceptions exception
  where exception.tenant_id = cashier.tenant_id
    and exception.id = p_exception_id
  for update;

  if not found then
    raise exception 'reconciliation exception not found'
      using errcode = 'P0002';
  end if;

  if exception_record.state_version <> p_expected_version then
    raise exception 'reconciliation exception version conflict'
      using errcode = '40001';
  end if;

  if p_action = 'start_review' then
    target_status := 'in_review';
  elsif p_action = 'escalate' then
    target_status := 'escalated';
  elsif p_action = 'resolve_refund' then
    if not exists (
      select 1
      from public.cashier_refund_actions action
      join public.refunds refund
        on refund.tenant_id = action.tenant_id
       and refund.id = action.refund_id
      where action.tenant_id = cashier.tenant_id
        and action.payment_id = exception_record.payment_id
        and refund.status = 'completed'
    ) then
      raise exception 'completed refund evidence is required'
        using errcode = '55000';
    end if;
    target_status := 'resolved';
  elsif p_action = 'resolve_investigated' then
    target_status := 'resolved';
  else
    raise exception 'unsupported cashier exception action'
      using errcode = '22023';
  end if;

  if target_status in ('resolved', 'escalated')
    and nullif(btrim(p_reason), '') is null then
    raise exception 'resolution or escalation reason is required'
      using errcode = '22023';
  end if;

  update public.reconciliation_exceptions exception
  set status = target_status,
      state_version = state_version + 1,
      acknowledged_at = case
        when target_status = 'in_review' then p_now
        else acknowledged_at
      end,
      resolved_at = case
        when target_status = 'resolved' then p_now
        else null
      end,
      resolution_action = case
        when target_status = 'resolved' then p_action
        else null
      end,
      resolution_reason = case
        when target_status = 'resolved' then btrim(p_reason)
        else null
      end,
      resolved_by_employee_id = case
        when target_status = 'resolved' then cashier.employee_id
        else null
      end,
      escalated_at = case
        when target_status = 'escalated' then p_now
        else escalated_at
      end
  where exception.tenant_id = cashier.tenant_id
    and exception.id = p_exception_id;

  insert into public.cashier_exception_events (
    tenant_id,
    reconciliation_exception_id,
    from_status,
    to_status,
    action,
    reason,
    actor_user_id,
    actor_employee_id,
    occurred_at
  )
  values (
    cashier.tenant_id,
    exception_record.id,
    exception_record.status,
    target_status,
    p_action,
    nullif(btrim(p_reason), ''),
    auth.uid(),
    cashier.employee_id,
    p_now
  );

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data,
    occurred_at
  )
  values (
    cashier.tenant_id,
    'employee',
    auth.uid(),
    cashier.employee_id,
    'cashier.exception_' || p_action,
    'reconciliation_exception',
    exception_record.id,
    coalesce(nullif(btrim(p_reason), ''), 'inicio de revisión'),
    jsonb_build_object(
      'status', exception_record.status,
      'version', exception_record.state_version
    ),
    jsonb_build_object(
      'status', target_status,
      'version', exception_record.state_version + 1
    ),
    p_now
  );

  return jsonb_build_object(
    'exception_id', exception_record.id,
    'status', target_status,
    'state_version', exception_record.state_version + 1
  );
end;
$$;

create or replace function private.produce_manual_order_for_exception(
  p_exception_id uuid,
  p_expected_version integer,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cashier record;
  exception_record public.reconciliation_exceptions%rowtype;
  payment_record public.payments%rowtype;
  quote_record public.checkout_quotes%rowtype;
  provider_event public.provider_payment_events%rowtype;
  existing_order_id uuid;
  created_order_id uuid;
  stock_item record;
  inventory_record public.inventory_levels%rowtype;
begin
  select * into cashier
  from private.require_cashier_permission('reconciliation.manage');

  if nullif(btrim(p_reason), '') is null then
    raise exception 'manual production reason is required'
      using errcode = '22023';
  end if;

  select exception.* into exception_record
  from public.reconciliation_exceptions exception
  where exception.tenant_id = cashier.tenant_id
    and exception.id = p_exception_id
  for update;

  if not found then
    raise exception 'reconciliation exception not found'
      using errcode = 'P0002';
  end if;

  if exception_record.state_version <> p_expected_version then
    raise exception 'reconciliation exception version conflict'
      using errcode = '40001';
  end if;

  if exception_record.status = 'resolved'
    or exception_record.exception_type not in (
      'approved_after_quote_expired',
      'approved_without_active_stock_reservation'
    ) then
    raise exception 'exception cannot create a manual order'
      using errcode = '55000';
  end if;

  if exception_record.manual_production_deadline_at is null
    or p_now > exception_record.manual_production_deadline_at then
    raise exception 'manual production window expired; refund or escalate'
      using errcode = '55000';
  end if;

  select payment.* into payment_record
  from public.payments payment
  where payment.tenant_id = cashier.tenant_id
    and payment.id = exception_record.payment_id
  for share;

  select quote.* into quote_record
  from public.checkout_quotes quote
  where quote.tenant_id = cashier.tenant_id
    and quote.id = payment_record.checkout_quote_id;

  select event.* into provider_event
  from public.provider_payment_events event
  where event.tenant_id = cashier.tenant_id
    and event.payment_id = payment_record.id
    and event.normalized_status = 'approved'
    and event.signature_verified
    and event.server_verified
    and event.amount_clp = payment_record.amount_clp
    and event.currency = payment_record.currency
  order by event.received_at, event.id
  limit 1;

  if provider_event.id is null then
    raise exception 'approved provider evidence is missing'
      using errcode = '55000';
  end if;

  select orders.id into existing_order_id
  from public.orders orders
  where orders.tenant_id = cashier.tenant_id
    and orders.payment_id = payment_record.id;

  if existing_order_id is not null then
    return jsonb_build_object(
      'order_id', existing_order_id,
      'idempotent_replay', true
    );
  end if;

  if not exists (
    select 1
    from public.table_sessions session
    where session.tenant_id = cashier.tenant_id
      and session.id = quote_record.table_session_id
      and session.state = 'active'
      and (
        session.expires_at is null
        or session.expires_at > p_now
      )
  ) then
    raise exception 'customer table session is no longer active'
      using errcode = '55000';
  end if;

  for stock_item in
    select
      quote_item.product_id,
      sum(quote_item.quantity)::bigint as quantity,
      product.venue_id
    from public.checkout_quote_items quote_item
    join public.products product
      on product.tenant_id = quote_item.tenant_id
     and product.id = quote_item.product_id
    where quote_item.tenant_id = cashier.tenant_id
      and quote_item.checkout_quote_id = quote_record.id
      and quote_item.stock_tracked
    group by quote_item.product_id, product.venue_id
    order by quote_item.product_id
  loop
    select level.* into inventory_record
    from public.inventory_levels level
    where level.tenant_id = cashier.tenant_id
      and level.venue_id = stock_item.venue_id
      and level.product_id = stock_item.product_id
    for update;

    if not found
      or inventory_record.on_hand_quantity
        - inventory_record.reserved_quantity < stock_item.quantity then
      raise exception 'stock is no longer available for manual production'
        using errcode = 'P0001';
    end if;

    update public.inventory_levels level
    set on_hand_quantity = on_hand_quantity - stock_item.quantity
    where level.tenant_id = cashier.tenant_id
      and level.id = inventory_record.id;
  end loop;

  created_order_id := gen_random_uuid();
  insert into public.orders (
    id,
    tenant_id,
    checkout_quote_id,
    payment_id,
    table_session_id,
    table_id,
    current_state,
    subtotal_clp,
    discount_clp,
    tax_clp,
    tip_clp,
    total_clp,
    currency,
    confirmed_at,
    created_at,
    updated_at
  )
  values (
    created_order_id,
    cashier.tenant_id,
    quote_record.id,
    payment_record.id,
    quote_record.table_session_id,
    quote_record.table_id,
    'confirmed',
    quote_record.subtotal_clp,
    quote_record.discount_clp,
    quote_record.tax_clp,
    quote_record.tip_clp,
    quote_record.total_clp,
    quote_record.currency,
    p_now,
    p_now,
    p_now
  );

  insert into public.order_state_events (
    tenant_id,
    order_id,
    state,
    source,
    occurred_at,
    metadata
  )
  values (
    cashier.tenant_id,
    created_order_id,
    'confirmed',
    'employee',
    p_now,
    jsonb_build_object(
      'manual_exception_resolution', true,
      'exception_id', exception_record.id,
      'provider_approved_at', provider_event.occurred_at
    )
  );

  insert into public.order_items (
    tenant_id,
    order_id,
    checkout_quote_item_id,
    product_id,
    variant_id,
    station_id,
    product_name,
    variant_name,
    selected_modifiers,
    quantity,
    unit_price_clp,
    unit_discount_clp,
    unit_tax_clp,
    line_total_clp,
    created_at
  )
  select
    cashier.tenant_id,
    created_order_id,
    quote_item.id,
    quote_item.product_id,
    quote_item.variant_id,
    quote_item.station_id,
    quote_item.product_name,
    quote_item.variant_name,
    quote_item.selected_modifiers,
    quote_item.quantity,
    quote_item.unit_price_clp,
    quote_item.unit_discount_clp,
    quote_item.unit_tax_clp,
    quote_item.line_total_clp,
    p_now
  from public.checkout_quote_items quote_item
  where quote_item.tenant_id = cashier.tenant_id
    and quote_item.checkout_quote_id = quote_record.id;

  insert into public.tickets (
    tenant_id,
    order_id,
    station_id,
    current_state,
    queued_at,
    created_at,
    updated_at
  )
  select
    cashier.tenant_id,
    created_order_id,
    quote_item.station_id,
    'queued',
    p_now,
    p_now,
    p_now
  from public.checkout_quote_items quote_item
  where quote_item.tenant_id = cashier.tenant_id
    and quote_item.checkout_quote_id = quote_record.id
  group by quote_item.station_id;

  insert into public.ticket_state_events (
    tenant_id,
    ticket_id,
    state,
    source,
    occurred_at,
    metadata
  )
  select
    cashier.tenant_id,
    ticket.id,
    'queued',
    'employee',
    p_now,
    jsonb_build_object(
      'manual_exception_resolution', true,
      'exception_id', exception_record.id
    )
  from public.tickets ticket
  where ticket.tenant_id = cashier.tenant_id
    and ticket.order_id = created_order_id;

  insert into public.ticket_items (
    tenant_id,
    ticket_id,
    order_item_id,
    created_at
  )
  select
    cashier.tenant_id,
    ticket.id,
    order_item.id,
    p_now
  from public.order_items order_item
  join public.tickets ticket
    on ticket.tenant_id = order_item.tenant_id
   and ticket.order_id = order_item.order_id
   and ticket.station_id = order_item.station_id
  where order_item.tenant_id = cashier.tenant_id
    and order_item.order_id = created_order_id;

  update public.carts cart
  set state = 'converted_to_order'
  where cart.tenant_id = cashier.tenant_id
    and cart.id = quote_record.cart_id
    and cart.state = 'checkout_started';

  insert into public.outbox_messages (
    tenant_id,
    aggregate_type,
    aggregate_id,
    topic,
    deduplication_key,
    payload,
    available_at,
    created_at
  )
  values
    (
      cashier.tenant_id,
      'order',
      created_order_id,
      'kds.order_confirmed_backup',
      'order:' || created_order_id::text || ':kds',
      jsonb_build_object(
        'order_id', created_order_id,
        'manual_exception_resolution', true
      ),
      p_now,
      p_now
    ),
    (
      cashier.tenant_id,
      'order',
      created_order_id,
      'print.order_confirmed',
      'order:' || created_order_id::text || ':print',
      jsonb_build_object('order_id', created_order_id),
      p_now,
      p_now
    ),
    (
      cashier.tenant_id,
      'order',
      created_order_id,
      'tax_document.order_confirmed',
      'order:' || created_order_id::text || ':tax-document',
      jsonb_build_object('order_id', created_order_id, 'placeholder', true),
      p_now,
      p_now
    ),
    (
      cashier.tenant_id,
      'order',
      created_order_id,
      'reconciliation.payment_confirmed',
      'order:' || created_order_id::text || ':reconciliation',
      jsonb_build_object(
        'order_id', created_order_id,
        'payment_id', payment_record.id,
        'provider_event_id', provider_event.id
      ),
      p_now,
      p_now
    );

  insert into public.cashier_manual_productions (
    tenant_id,
    reconciliation_exception_id,
    payment_id,
    order_id,
    actor_employee_id,
    reason,
    provider_approved_at,
    produced_at
  )
  values (
    cashier.tenant_id,
    exception_record.id,
    payment_record.id,
    created_order_id,
    cashier.employee_id,
    btrim(p_reason),
    provider_event.occurred_at,
    p_now
  );

  update public.reconciliation_exceptions exception
  set status = 'resolved',
      state_version = state_version + 1,
      resolved_at = p_now,
      resolution_action = 'produce_manually',
      resolution_reason = btrim(p_reason),
      resolved_by_employee_id = cashier.employee_id
  where exception.tenant_id = cashier.tenant_id
    and exception.id = exception_record.id;

  insert into public.cashier_exception_events (
    tenant_id,
    reconciliation_exception_id,
    from_status,
    to_status,
    action,
    reason,
    actor_user_id,
    actor_employee_id,
    occurred_at
  )
  values (
    cashier.tenant_id,
    exception_record.id,
    exception_record.status,
    'resolved',
    'produce_manually',
    btrim(p_reason),
    auth.uid(),
    cashier.employee_id,
    p_now
  );

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    after_data,
    occurred_at
  )
  values (
    cashier.tenant_id,
    'employee',
    auth.uid(),
    cashier.employee_id,
    'cashier.late_approval_produced_manually',
    'order',
    created_order_id,
    btrim(p_reason),
    jsonb_build_object(
      'exception_id', exception_record.id,
      'payment_id', payment_record.id,
      'provider_approved_at', provider_event.occurred_at
    ),
    p_now
  );

  return jsonb_build_object(
    'order_id', created_order_id,
    'exception_id', exception_record.id,
    'idempotent_replay', false
  );
end;
$$;

create or replace function private.close_cashier_shift(
  p_cashier_shift_id uuid,
  p_expected_version integer,
  p_cash_declared_clp bigint,
  p_exception_override_reason text default null,
  p_closed_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cashier record;
  shift_record public.cashier_shifts%rowtype;
  closure_id uuid;
  gross_sales bigint;
  refund_total bigint;
  chargeback_total bigint;
  fee_total bigint;
  expected_payout bigint;
  digital_total bigint;
  tip_earned bigint;
  tip_refunded_open bigint;
  local_tip_adjustments bigint;
  order_total integer;
  average_ticket bigint;
  unresolved_count integer;
begin
  select * into cashier
  from private.require_cashier_permission('reconciliation.manage');

  if p_cash_declared_clp < 0 then
    raise exception 'cash declaration cannot be negative'
      using errcode = '22023';
  end if;

  select shift.* into shift_record
  from public.cashier_shifts shift
  where shift.tenant_id = cashier.tenant_id
    and shift.id = p_cashier_shift_id
  for update;

  if not found or shift_record.status <> 'open' then
    raise exception 'cashier shift is not open' using errcode = '55000';
  end if;

  if shift_record.state_version <> p_expected_version then
    raise exception 'cashier shift version conflict'
      using errcode = '40001';
  end if;

  select count(*)::integer
  into unresolved_count
  from public.reconciliation_exceptions exception
  where exception.tenant_id = cashier.tenant_id
    and exception.venue_id = shift_record.venue_id
    and exception.status in ('open', 'in_review', 'escalated');

  if unresolved_count > 0
    and nullif(btrim(p_exception_override_reason), '') is null then
    raise exception 'open exceptions require an audited close justification'
      using errcode = '55000';
  end if;

  select
    coalesce(sum(payment.amount_clp), 0),
    count(distinct orders.id)::integer,
    coalesce(sum(quote.tip_clp), 0)
  into gross_sales, order_total, tip_earned
  from public.payment_shift_attributions attribution
  join public.payments payment
    on payment.tenant_id = attribution.tenant_id
   and payment.id = attribution.payment_id
  left join public.orders orders
    on orders.tenant_id = payment.tenant_id
   and orders.payment_id = payment.id
  join public.checkout_quotes quote
    on quote.tenant_id = payment.tenant_id
   and quote.id = payment.checkout_quote_id
  where attribution.tenant_id = cashier.tenant_id
    and attribution.cashier_shift_id = shift_record.id;

  select coalesce(sum(action.amount_clp), 0)
  into refund_total
  from public.cashier_refund_actions action
  join public.refunds refund
    on refund.tenant_id = action.tenant_id
   and refund.id = action.refund_id
  where action.tenant_id = cashier.tenant_id
    and action.operation_cashier_shift_id = shift_record.id
    and refund.status = 'completed';

  select coalesce(sum(chargeback.amount_clp), 0)
  into chargeback_total
  from public.chargebacks chargeback
  where chargeback.tenant_id = cashier.tenant_id
    and chargeback.occurred_at >= shift_record.opened_at
    and chargeback.occurred_at < p_closed_at
    and chargeback.status in ('open', 'lost');

  select coalesce(sum(fee.amount_clp), 0)
  into fee_total
  from public.provider_fees fee
  join public.payment_shift_attributions attribution
    on attribution.tenant_id = fee.tenant_id
   and attribution.payment_id = fee.payment_id
  where fee.tenant_id = cashier.tenant_id
    and attribution.cashier_shift_id = shift_record.id;

  select coalesce(sum(action.tip_refunded_from_open_shift_clp), 0)
  into tip_refunded_open
  from public.cashier_refund_actions action
  join public.refunds refund
    on refund.tenant_id = action.tenant_id
   and refund.id = action.refund_id
  where action.tenant_id = cashier.tenant_id
    and action.source_cashier_shift_id = shift_record.id
    and action.shift_policy = 'open_shift_reduces_tip'
    and refund.status = 'completed';

  select coalesce(sum(adjustment.amount_clp), 0)
  into local_tip_adjustments
  from public.cashier_post_close_adjustments adjustment
  where adjustment.tenant_id = cashier.tenant_id
    and adjustment.venue_id = shift_record.venue_id
    and adjustment.occurred_at < p_closed_at
    and not exists (
      select 1
      from public.cashier_closure_adjustments consumed
      where consumed.tenant_id = adjustment.tenant_id
        and consumed.adjustment_id = adjustment.id
    );

  digital_total := gross_sales;
  expected_payout :=
    gross_sales - refund_total - chargeback_total - fee_total;
  average_ticket := case
    when order_total = 0 then 0
    else gross_sales / order_total
  end;

  insert into public.cashier_shift_closures (
    tenant_id,
    cashier_shift_id,
    venue_id,
    gross_sales_clp,
    refunds_clp,
    chargebacks_clp,
    provider_fees_clp,
    expected_payout_clp,
    digital_processed_clp,
    cash_declared_clp,
    tip_earned_clp,
    tip_refunded_open_shift_clp,
    local_tip_adjustments_clp,
    order_count,
    average_ticket_clp,
    open_exception_count,
    exception_override_reason,
    closed_by_employee_id,
    closed_at
  )
  values (
    cashier.tenant_id,
    shift_record.id,
    shift_record.venue_id,
    gross_sales,
    refund_total,
    chargeback_total,
    fee_total,
    expected_payout,
    digital_total,
    p_cash_declared_clp,
    tip_earned,
    tip_refunded_open,
    local_tip_adjustments,
    order_total,
    average_ticket,
    unresolved_count,
    nullif(btrim(p_exception_override_reason), ''),
    cashier.employee_id,
    p_closed_at
  )
  returning id into closure_id;

  insert into public.cashier_closure_payment_method_summaries (
    tenant_id,
    closure_id,
    payment_method,
    gross_clp,
    refunds_clp,
    provider_fees_clp,
    expected_payout_clp,
    transaction_count
  )
  select
    cashier.tenant_id,
    closure_id,
    payment.provider,
    sum(payment.amount_clp)::bigint,
    coalesce((
      select sum(action.amount_clp)
      from public.cashier_refund_actions action
      join public.refunds refund
        on refund.tenant_id = action.tenant_id
       and refund.id = action.refund_id
      join public.payments refunded_payment
        on refunded_payment.tenant_id = action.tenant_id
       and refunded_payment.id = action.payment_id
      where action.tenant_id = cashier.tenant_id
        and action.operation_cashier_shift_id = shift_record.id
        and refunded_payment.provider = payment.provider
        and refund.status = 'completed'
    ), 0)::bigint,
    coalesce((
      select sum(fee.amount_clp)
      from public.provider_fees fee
      join public.payments fee_payment
        on fee_payment.tenant_id = fee.tenant_id
       and fee_payment.id = fee.payment_id
      join public.payment_shift_attributions fee_attribution
        on fee_attribution.tenant_id = fee_payment.tenant_id
       and fee_attribution.payment_id = fee_payment.id
      where fee.tenant_id = cashier.tenant_id
        and fee_attribution.cashier_shift_id = shift_record.id
        and fee_payment.provider = payment.provider
    ), 0)::bigint,
    (
      sum(payment.amount_clp)
      - coalesce((
        select sum(action.amount_clp)
        from public.cashier_refund_actions action
        join public.refunds refund
          on refund.tenant_id = action.tenant_id
         and refund.id = action.refund_id
        join public.payments refunded_payment
          on refunded_payment.tenant_id = action.tenant_id
         and refunded_payment.id = action.payment_id
        where action.tenant_id = cashier.tenant_id
          and action.operation_cashier_shift_id = shift_record.id
          and refunded_payment.provider = payment.provider
          and refund.status = 'completed'
      ), 0)
      - coalesce((
        select sum(fee.amount_clp)
        from public.provider_fees fee
        join public.payments fee_payment
          on fee_payment.tenant_id = fee.tenant_id
         and fee_payment.id = fee.payment_id
        join public.payment_shift_attributions fee_attribution
          on fee_attribution.tenant_id = fee_payment.tenant_id
         and fee_attribution.payment_id = fee_payment.id
        where fee.tenant_id = cashier.tenant_id
          and fee_attribution.cashier_shift_id = shift_record.id
          and fee_payment.provider = payment.provider
      ), 0)
    )::bigint,
    count(*)::integer
  from public.payment_shift_attributions attribution
  join public.payments payment
    on payment.tenant_id = attribution.tenant_id
   and payment.id = attribution.payment_id
  where attribution.tenant_id = cashier.tenant_id
    and attribution.cashier_shift_id = shift_record.id
  group by payment.provider;

  with payment_tips as (
    select
      assignment.employee_id,
      coalesce(employee.display_name, 'Sin asignar') employee_label,
      sum(quote.tip_clp)::bigint earned_clp
    from public.payment_shift_attributions attribution
    join public.payments payment
      on payment.tenant_id = attribution.tenant_id
     and payment.id = attribution.payment_id
    join public.checkout_quotes quote
      on quote.tenant_id = payment.tenant_id
     and quote.id = payment.checkout_quote_id
    left join public.orders orders
      on orders.tenant_id = payment.tenant_id
     and orders.payment_id = payment.id
    left join lateral (
      select waiter.employee_id
      from public.waiter_table_assignments waiter
      where waiter.tenant_id = payment.tenant_id
        and waiter.table_session_id = quote.table_session_id
        and waiter.assigned_at <= coalesce(
          orders.confirmed_at,
          attribution.provider_approved_at
        )
        and (
          waiter.released_at is null
          or waiter.released_at > coalesce(
            orders.confirmed_at,
            attribution.provider_approved_at
          )
        )
      order by waiter.assigned_at desc
      limit 1
    ) assignment on true
    left join public.employees employee
      on employee.tenant_id = payment.tenant_id
     and employee.id = assignment.employee_id
    where attribution.tenant_id = cashier.tenant_id
      and attribution.cashier_shift_id = shift_record.id
    group by assignment.employee_id, employee.display_name
  ),
  refunded_tips as (
    select
      assignment.employee_id,
      sum(action.tip_refunded_from_open_shift_clp)::bigint refunded_clp
    from public.cashier_refund_actions action
    join public.refunds refund
      on refund.tenant_id = action.tenant_id
     and refund.id = action.refund_id
    join public.payments payment
      on payment.tenant_id = action.tenant_id
     and payment.id = action.payment_id
    join public.checkout_quotes quote
      on quote.tenant_id = payment.tenant_id
     and quote.id = payment.checkout_quote_id
    left join public.orders orders
      on orders.tenant_id = payment.tenant_id
     and orders.payment_id = payment.id
    left join lateral (
      select waiter.employee_id
      from public.waiter_table_assignments waiter
      where waiter.tenant_id = payment.tenant_id
        and waiter.table_session_id = quote.table_session_id
        and waiter.assigned_at <= coalesce(
          orders.confirmed_at,
          action.requested_at
        )
      order by waiter.assigned_at desc
      limit 1
    ) assignment on true
    where action.tenant_id = cashier.tenant_id
      and action.source_cashier_shift_id = shift_record.id
      and action.shift_policy = 'open_shift_reduces_tip'
      and refund.status = 'completed'
    group by assignment.employee_id
  ),
  keys as (
    select employee_id from payment_tips
    union
    select employee_id from refunded_tips
  )
  insert into public.cashier_closure_tip_summaries (
    tenant_id,
    closure_id,
    employee_id,
    employee_label,
    earned_clp,
    refunded_while_open_clp,
    distributable_clp
  )
  select
    cashier.tenant_id,
    closure_id,
    keys.employee_id,
    coalesce(payment_tips.employee_label, 'Sin asignar'),
    coalesce(payment_tips.earned_clp, 0),
    coalesce(refunded_tips.refunded_clp, 0),
    coalesce(payment_tips.earned_clp, 0)
      - coalesce(refunded_tips.refunded_clp, 0)
  from keys
  left join payment_tips
    on payment_tips.employee_id is not distinct from keys.employee_id
  left join refunded_tips
    on refunded_tips.employee_id is not distinct from keys.employee_id;

  insert into public.cashier_closure_adjustments (
    tenant_id,
    closure_id,
    adjustment_id
  )
  select cashier.tenant_id, closure_id, adjustment.id
  from public.cashier_post_close_adjustments adjustment
  where adjustment.tenant_id = cashier.tenant_id
    and adjustment.venue_id = shift_record.venue_id
    and adjustment.occurred_at < p_closed_at
    and not exists (
      select 1
      from public.cashier_closure_adjustments consumed
      where consumed.tenant_id = adjustment.tenant_id
        and consumed.adjustment_id = adjustment.id
    );

  update public.cashier_shifts shift
  set status = 'closed',
      state_version = state_version + 1,
      closed_by_employee_id = cashier.employee_id,
      closed_at = p_closed_at,
      close_override_reason =
        nullif(btrim(p_exception_override_reason), '')
  where shift.tenant_id = cashier.tenant_id
    and shift.id = shift_record.id;

  insert into public.audit_log (
    tenant_id,
    actor_type,
    actor_user_id,
    actor_employee_id,
    action,
    target_type,
    target_id,
    reason,
    after_data,
    occurred_at
  )
  values (
    cashier.tenant_id,
    'employee',
    auth.uid(),
    cashier.employee_id,
    case
      when unresolved_count > 0
        then 'cashier.shift_closed_with_open_exceptions'
      else 'cashier.shift_closed'
    end,
    'cashier_shift_closure',
    closure_id,
    coalesce(
      nullif(btrim(p_exception_override_reason), ''),
      'cierre regular sin excepciones abiertas'
    ),
    jsonb_build_object(
      'gross_sales_clp', gross_sales,
      'refunds_clp', refund_total,
      'chargebacks_clp', chargeback_total,
      'provider_fees_clp', fee_total,
      'expected_payout_clp', expected_payout,
      'open_exception_count', unresolved_count,
      'local_tip_adjustments_clp', local_tip_adjustments
    ),
    p_closed_at
  );

  return jsonb_build_object(
    'closure_id', closure_id,
    'cashier_shift_id', shift_record.id,
    'gross_sales_clp', gross_sales,
    'refunds_clp', refund_total,
    'chargebacks_clp', chargeback_total,
    'provider_fees_clp', fee_total,
    'expected_payout_clp', expected_payout,
    'open_exception_count', unresolved_count,
    'local_tip_adjustments_clp', local_tip_adjustments
  );
end;
$$;

create or replace view public.cashier_live_tables
with (security_invoker = true)
as
select
  table_record.tenant_id,
  table_record.venue_id,
  table_record.id as table_id,
  table_record.table_number,
  table_record.display_name as table_name,
  current_session.id as table_session_id,
  current_session.state as session_state,
  active_group.id as group_id,
  active_group.label as group_label,
  coalesce(device_totals.person_count, 0)::integer as person_count,
  coalesce(order_totals.order_count, 0)::integer as order_count,
  coalesce(order_totals.processed_clp, 0)::bigint as processed_clp,
  coalesce(ticket_totals.new_count, 0)::integer as new_order_count,
  coalesce(ticket_totals.preparing_count, 0)::integer as preparing_count,
  coalesce(ticket_totals.ready_count, 0)::integer as ready_count,
  coalesce(attention_totals.attention_count, 0)::integer as attention_count,
  waiter.employee_id as waiter_employee_id,
  waiter.display_name as waiter_name,
  greatest(
    current_session.opened_at,
    order_totals.last_order_at,
    attention_totals.last_attention_at
  ) as last_activity_at,
  case
    when current_session.id is null then 'free'
    when current_session.state = 'closed' then 'closed'
    when coalesce(attention_totals.attention_count, 0) > 0
      then 'requires_attention'
    when coalesce(ticket_totals.ready_count, 0) > 0
      then 'requires_delivery'
    when coalesce(ticket_totals.new_count, 0) > 0
      then 'new_orders'
    when coalesce(ticket_totals.preparing_count, 0) > 0
      then 'preparing'
    when greatest(
      current_session.opened_at,
      order_totals.last_order_at,
      attention_totals.last_attention_at
    ) < clock_timestamp() - interval '30 minutes'
      then 'inactive'
    else 'active'
  end as display_state
from public.tables table_record
left join lateral (
  select session.*
  from public.table_sessions session
  where session.tenant_id = table_record.tenant_id
    and session.table_id = table_record.id
  order by
    case when session.state in ('active', 'paused') then 0 else 1 end,
    session.opened_at desc
  limit 1
) current_session on true
left join lateral (
  select count(*)::integer person_count
  from public.diner_device_sessions device
  where device.tenant_id = current_session.tenant_id
    and device.table_session_id = current_session.id
    and device.state = 'active'
) device_totals on true
left join lateral (
  select
    count(*)::integer order_count,
    coalesce(sum(orders.total_clp), 0)::bigint processed_clp,
    max(orders.confirmed_at) last_order_at
  from public.orders orders
  where orders.tenant_id = current_session.tenant_id
    and orders.table_session_id = current_session.id
) order_totals on true
left join lateral (
  select
    count(*) filter (where ticket.current_state = 'queued')::integer
      as new_count,
    count(*) filter (
      where ticket.current_state in ('acknowledged', 'in_preparation')
    )::integer as preparing_count,
    count(*) filter (where ticket.current_state = 'ready')::integer
      as ready_count
  from public.orders orders
  join public.tickets ticket
    on ticket.tenant_id = orders.tenant_id
   and ticket.order_id = orders.id
  where orders.tenant_id = current_session.tenant_id
    and orders.table_session_id = current_session.id
) ticket_totals on true
left join lateral (
  select
    count(*)::integer attention_count,
    max(task.requested_at) last_attention_at
  from public.waiter_tasks task
  where task.tenant_id = current_session.tenant_id
    and task.table_session_id = current_session.id
    and task.status = 'pending'
    and task.task_type in ('service_request', 'waiter_payment_request')
) attention_totals on true
left join lateral (
  select
    assignment.employee_id,
    employee.display_name
  from public.waiter_table_assignments assignment
  join public.employees employee
    on employee.tenant_id = assignment.tenant_id
   and employee.id = assignment.employee_id
  where assignment.tenant_id = current_session.tenant_id
    and assignment.table_session_id = current_session.id
    and assignment.released_at is null
  order by assignment.assigned_at desc
  limit 1
) waiter on true
left join lateral (
  select group_record.id, group_record.label
  from public.table_session_group_members member
  join public.table_session_groups group_record
    on group_record.tenant_id = member.tenant_id
   and group_record.id = member.table_session_group_id
  where member.tenant_id = current_session.tenant_id
    and member.table_session_id = current_session.id
    and member.left_at is null
    and group_record.state = 'active'
  limit 1
) active_group on true
where table_record.active;

create or replace view public.cashier_live_shift_summary
with (security_invoker = true)
as
select
  shift.tenant_id,
  shift.id as cashier_shift_id,
  shift.venue_id,
  shift.opened_at,
  shift.state_version,
  coalesce(financial.gross_sales_clp, 0)::bigint as gross_sales_clp,
  coalesce(financial.order_count, 0)::integer as order_count,
  case
    when coalesce(financial.order_count, 0) = 0 then 0
    else (
      financial.gross_sales_clp / financial.order_count
    )::bigint
  end as average_ticket_clp,
  coalesce(financial.tip_earned_clp, 0)::bigint as tip_earned_clp,
  coalesce(refund_totals.refunds_clp, 0)::bigint as refunds_clp,
  coalesce(refund_totals.tip_refunded_open_clp, 0)::bigint
    as tip_refunded_open_clp,
  coalesce(refund_totals.local_tip_adjustments_clp, 0)::bigint
    as local_tip_adjustments_clp,
  coalesce(exception_totals.open_exception_count, 0)::integer
    as open_exception_count
from public.cashier_shifts shift
left join lateral (
  select
    coalesce(sum(payment.amount_clp), 0)::bigint gross_sales_clp,
    count(distinct orders.id)::integer order_count,
    coalesce(sum(quote.tip_clp), 0)::bigint tip_earned_clp
  from public.payment_shift_attributions attribution
  join public.payments payment
    on payment.tenant_id = attribution.tenant_id
   and payment.id = attribution.payment_id
  join public.checkout_quotes quote
    on quote.tenant_id = payment.tenant_id
   and quote.id = payment.checkout_quote_id
  left join public.orders orders
    on orders.tenant_id = payment.tenant_id
   and orders.payment_id = payment.id
  where attribution.tenant_id = shift.tenant_id
    and attribution.cashier_shift_id = shift.id
) financial on true
left join lateral (
  select
    coalesce(sum(action.amount_clp) filter (
      where refund.status = 'completed'
    ), 0)::bigint refunds_clp,
    coalesce(sum(action.tip_refunded_from_open_shift_clp) filter (
      where refund.status = 'completed'
    ), 0)::bigint tip_refunded_open_clp,
    coalesce(sum(action.local_tip_adjustment_clp) filter (
      where refund.status = 'completed'
    ), 0)::bigint local_tip_adjustments_clp
  from public.cashier_refund_actions action
  join public.refunds refund
    on refund.tenant_id = action.tenant_id
   and refund.id = action.refund_id
  where action.tenant_id = shift.tenant_id
    and action.operation_cashier_shift_id = shift.id
) refund_totals on true
left join lateral (
  select count(*)::integer open_exception_count
  from public.reconciliation_exceptions exception
  where exception.tenant_id = shift.tenant_id
    and exception.venue_id = shift.venue_id
    and exception.status in ('open', 'in_review', 'escalated')
) exception_totals on true
where shift.status = 'open';

create or replace view public.cashier_exception_queue
with (security_invoker = true)
as
select
  exception.tenant_id,
  exception.venue_id,
  exception.cashier_shift_id,
  exception.id,
  exception.payment_id,
  exception.exception_type,
  exception.priority,
  exception.status,
  exception.state_version,
  exception.requires_immediate_action,
  exception.decision_required,
  exception.resolution_options,
  payment.amount_clp,
  payment.currency,
  table_record.table_number,
  quote.diner_alias,
  quote.diner_display_name,
  exception.provider_approved_at,
  exception.provider_received_at,
  exception.manual_production_deadline_at,
  case
    when exception.manual_production_deadline_at is null then false
    else clock_timestamp() <= exception.manual_production_deadline_at
  end as manual_production_available,
  case
    when exception.provider_approved_at is null then null
    else greatest(
      0,
      extract(
        epoch from clock_timestamp() - exception.provider_approved_at
      )::integer
    )
  end as seconds_since_provider_approval,
  case exception.exception_type
    when 'payment_approved_without_order'
      then 'El pago fue aprobado, pero no existe un pedido.'
    when 'approved_after_quote_expired'
      then 'El pago llegó después de vencer la reserva del pedido.'
    when 'amount_or_currency_mismatch'
      then 'El monto o la moneda no coincide con el pedido congelado.'
    when 'merchant_or_tenant_mismatch'
      then 'El comercio o local del pago no coincide.'
    when 'tax_document_failed'
      then 'La boleta no pudo emitirse.'
    when 'refund_not_reflected'
      then 'El proveedor todavía no refleja el reembolso.'
    when 'settlement_difference'
      then 'El abono no coincide con lo esperado.'
    when 'confirmation_after_shift_close'
      then 'La confirmación llegó después de cerrar su turno.'
    when 'confirmation_without_cashier_shift'
      then 'La hora del proveedor no pertenece a ningún turno.'
    else 'Existe una diferencia que requiere revisión.'
  end as simple_message,
  exception.details,
  exception.created_at
from public.reconciliation_exceptions exception
left join public.payments payment
  on payment.tenant_id = exception.tenant_id
 and payment.id = exception.payment_id
left join public.checkout_quotes quote
  on quote.tenant_id = payment.tenant_id
 and quote.id = payment.checkout_quote_id
left join public.tables table_record
  on table_record.tenant_id = quote.tenant_id
 and table_record.id = quote.table_id
where exception.visible_to_cashier
  and exception.status in ('open', 'in_review', 'escalated')
order by
  case exception.priority
    when 'critical' then 1
    when 'high' then 2
    else 3
  end,
  exception.created_at;

create or replace view public.cashier_reconciliation_trace
with (security_invoker = true)
as
select
  payment.tenant_id,
  attribution.venue_id,
  attribution.cashier_shift_id,
  payment.id as payment_id,
  payment.provider,
  payment.provider_payment_id,
  orders.id as order_id,
  orders.order_number,
  quote.total_clp as tablio_sale_clp,
  quote.tip_clp,
  coalesce(refund_totals.refunded_clp, 0)::bigint as refunded_clp,
  settlement_entry.settlement_id,
  settlement_entry.gross_clp as provider_gross_clp,
  settlement_entry.provider_fee_clp,
  settlement_entry.net_clp as provider_net_clp,
  settlement_entry.deposited_clp,
  settlement_entry.deposit_reference,
  case
    when settlement_entry.id is null then 'pending'
    when settlement_entry.gross_clp <> quote.total_clp
      or settlement_entry.net_clp
        <> settlement_entry.gross_clp
          - settlement_entry.refunds_clp
          - settlement_entry.chargebacks_clp
          - settlement_entry.provider_fee_clp
      or settlement_entry.deposited_clp <> settlement_entry.net_clp
      then 'difference'
    else 'matched'
  end as provider_reconciliation_status,
  'pending_sprint_7'::text as tax_document_status,
  attribution.provider_approved_at,
  attribution.provider_received_at
from public.payments payment
join public.checkout_quotes quote
  on quote.tenant_id = payment.tenant_id
 and quote.id = payment.checkout_quote_id
left join public.orders orders
  on orders.tenant_id = payment.tenant_id
 and orders.payment_id = payment.id
left join public.payment_shift_attributions attribution
  on attribution.tenant_id = payment.tenant_id
 and attribution.payment_id = payment.id
left join public.settlement_payment_entries settlement_entry
  on settlement_entry.tenant_id = payment.tenant_id
 and settlement_entry.payment_id = payment.id
left join lateral (
  select coalesce(sum(refund.amount_clp), 0)::bigint refunded_clp
  from public.refunds refund
  where refund.tenant_id = payment.tenant_id
    and refund.payment_id = payment.id
    and refund.status = 'completed'
) refund_totals on true;

insert into public.permissions (code, description)
values
  ('cashier.read', 'Leer el panel de mesas, turnos y cierres del local.'),
  ('cashier.close', 'Abrir y cerrar turnos de caja con auditoría.'),
  ('payments.refund', 'Solicitar reembolsos auditados al proveedor.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('cashier_admin', 'cashier.read'),
  ('cashier_admin', 'cashier.close'),
  ('cashier_admin', 'payments.refund'),
  ('owner', 'cashier.read'),
  ('owner', 'cashier.close'),
  ('owner', 'payments.refund'),
  ('superadmin', 'cashier.read'),
  ('superadmin', 'cashier.close'),
  ('superadmin', 'payments.refund')
on conflict do nothing;

create function public.open_cashier_shift(p_venue_id uuid)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.open_cashier_shift(p_venue_id);
$$;

create function public.request_cashier_refund(
  p_payment_id uuid,
  p_amount_clp bigint,
  p_idempotency_key text,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_cashier_refund(
    p_payment_id,
    p_amount_clp,
    p_idempotency_key,
    p_reason
  );
$$;

create function public.transition_cashier_exception(
  p_exception_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transition_cashier_exception(
    p_exception_id,
    p_expected_version,
    p_action,
    p_reason
  );
$$;

create function public.produce_manual_order_for_exception(
  p_exception_id uuid,
  p_expected_version integer,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.produce_manual_order_for_exception(
    p_exception_id,
    p_expected_version,
    p_reason
  );
$$;

create function public.close_cashier_shift(
  p_cashier_shift_id uuid,
  p_expected_version integer,
  p_cash_declared_clp bigint,
  p_exception_override_reason text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.close_cashier_shift(
    p_cashier_shift_id,
    p_expected_version,
    p_cash_declared_clp,
    p_exception_override_reason
  );
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_cashier_settings',
    'cashier_shifts',
    'payment_shift_attributions',
    'cashier_shift_closures',
    'cashier_closure_payment_method_summaries',
    'cashier_closure_tip_summaries',
    'cashier_post_close_adjustments',
    'cashier_closure_adjustments',
    'cashier_refund_actions',
    'cashier_exception_events',
    'cashier_manual_productions',
    'settlement_payment_entries'
  ]
  loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'alter table public.%I force row level security',
      table_name
    );
  end loop;
end;
$$;

create policy tenant_cashier_settings_select
on public.tenant_cashier_settings
for select
to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'cashier.read'))
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cashier_shifts',
    'payment_shift_attributions',
    'cashier_shift_closures',
    'cashier_closure_payment_method_summaries',
    'cashier_closure_tip_summaries',
    'cashier_post_close_adjustments',
    'cashier_closure_adjustments',
    'cashier_refund_actions',
    'cashier_exception_events',
    'cashier_manual_productions',
    'settlement_payment_entries'
  ]
  loop
    execute format(
      'create policy tenant_cashier_select on public.%I
       for select to authenticated using (
         tenant_id = (select private.current_tenant_id())
         and (select private.has_permission(tenant_id, ''cashier.read''))
       )',
      table_name
    );
  end loop;
end;
$$;

revoke update on table public.reconciliation_exceptions
from authenticated;

grant select on table
  public.tenant_cashier_settings,
  public.cashier_shifts,
  public.payment_shift_attributions,
  public.cashier_shift_closures,
  public.cashier_closure_payment_method_summaries,
  public.cashier_closure_tip_summaries,
  public.cashier_post_close_adjustments,
  public.cashier_closure_adjustments,
  public.cashier_refund_actions,
  public.cashier_exception_events,
  public.cashier_manual_productions,
  public.settlement_payment_entries
to authenticated;

revoke all on table
  public.cashier_live_tables,
  public.cashier_live_shift_summary,
  public.cashier_exception_queue,
  public.cashier_reconciliation_trace
from public, anon, authenticated, service_role;

grant select on table
  public.cashier_live_tables,
  public.cashier_live_shift_summary,
  public.cashier_exception_queue,
  public.cashier_reconciliation_trace
to authenticated, service_role;

grant usage on schema private to authenticated;
grant execute on function
  private.current_cashier_employee_id(uuid),
  private.require_cashier_permission(text),
  private.open_cashier_shift(uuid, timestamptz),
  private.request_cashier_refund(
    uuid, bigint, text, text, timestamptz
  ),
  private.transition_cashier_exception(
    uuid, integer, text, text, timestamptz
  ),
  private.produce_manual_order_for_exception(
    uuid, integer, text, timestamptz
  ),
  private.close_cashier_shift(
    uuid, integer, bigint, text, timestamptz
  )
to authenticated;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.open_cashier_shift(uuid)',
    'public.request_cashier_refund(uuid,bigint,text,text)',
    'public.transition_cashier_exception(uuid,integer,text,text)',
    'public.produce_manual_order_for_exception(uuid,integer,text)',
    'public.close_cashier_shift(uuid,integer,bigint,text)'
  ]
  loop
    execute format(
      'revoke execute on function %s from public, anon, service_role',
      signature
    );
    execute format(
      'grant execute on function %s to authenticated',
      signature
    );
  end loop;
end;
$$;

revoke execute on function private.finalize_cashier_refund(
  uuid, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function private.finalize_cashier_refund(
  uuid, text, text, text, timestamptz
) to service_role;

comment on table public.cashier_shift_closures is
  'Immutable financial snapshot. Later confirmations and refunds are append-only adjustments.';

comment on table public.cashier_post_close_adjustments is
  'A refund after tip distribution never claws money back from the worker; the venue absorbs the recorded tip component.';

comment on view public.cashier_reconciliation_trace is
  'Tablio order/payment versus provider settlement. Tax document stays pending until Sprint 7.';
