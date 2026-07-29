-- Final Sprint 12 policy wiring: tip refunds, invitation limits and expiry.

create table public.tip_allocation_refund_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  cashier_refund_action_id uuid not null,
  tip_allocation_id uuid not null,
  employee_id uuid,
  shift_policy text not null
    check (shift_policy in ('open_shift_reduces_tip', 'closed_shift_local_absorbs')),
  worker_tip_reduction_clp bigint not null default 0
    check (worker_tip_reduction_clp >= 0),
  local_absorbed_clp bigint not null default 0
    check (local_absorbed_clp >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, cashier_refund_action_id),
  foreign key (tenant_id, cashier_refund_action_id)
    references public.cashier_refund_actions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, tip_allocation_id)
    references public.tip_allocations (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees (tenant_id, id) on delete restrict,
  check (
    (shift_policy = 'open_shift_reduces_tip' and local_absorbed_clp = 0)
    or (
      shift_policy = 'closed_shift_local_absorbs'
      and worker_tip_reduction_clp = 0
    )
  )
);

create or replace function private.capture_tip_allocation_refund_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocation public.tip_allocations%rowtype;
begin
  select *
  into allocation
  from public.tip_allocations
  where tenant_id = new.tenant_id
    and payment_id = new.payment_id;
  if allocation.id is null or new.proportional_tip_component_clp = 0 then
    return new;
  end if;
  insert into public.tip_allocation_refund_adjustments (
    tenant_id,
    cashier_refund_action_id,
    tip_allocation_id,
    employee_id,
    shift_policy,
    worker_tip_reduction_clp,
    local_absorbed_clp
  ) values (
    new.tenant_id,
    new.id,
    allocation.id,
    allocation.employee_id,
    new.shift_policy,
    new.tip_refunded_from_open_shift_clp,
    new.local_tip_adjustment_clp
  );
  return new;
end;
$$;

create trigger cashier_refund_actions_capture_tip_recipient
after insert on public.cashier_refund_actions
for each row execute function private.capture_tip_allocation_refund_policy();

create trigger tip_allocation_refund_adjustments_immutable
before update or delete on public.tip_allocation_refund_adjustments
for each row execute function private.prevent_financial_evidence_mutation();

create index tip_refund_adjustment_allocation_fk_idx
  on public.tip_allocation_refund_adjustments (tenant_id, tip_allocation_id);
create index tip_refund_adjustment_employee_fk_idx
  on public.tip_allocation_refund_adjustments (tenant_id, employee_id)
  where employee_id is not null;

alter table public.tip_allocation_refund_adjustments enable row level security;
alter table public.tip_allocation_refund_adjustments force row level security;
create policy tip_allocation_refund_adjustments_select
on public.tip_allocation_refund_adjustments for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (
    (select private.has_permission(tenant_id, 'cashier.read'))
    or (select private.has_permission(tenant_id, 'owner_dashboard.read'))
  )
);
revoke all on public.tip_allocation_refund_adjustments
from public, anon, authenticated;
grant select on public.tip_allocation_refund_adjustments to authenticated;

drop view public.cashier_tip_allocation_summary;
create view public.cashier_tip_allocation_summary
with (security_invoker = true)
as
with adjustment_totals as (
  select
    adjustment.tenant_id,
    adjustment.tip_allocation_id,
    sum(adjustment.worker_tip_reduction_clp)::bigint
      as worker_tip_reduction_clp,
    sum(adjustment.local_absorbed_clp)::bigint
      as local_absorbed_clp
  from public.tip_allocation_refund_adjustments adjustment
  group by adjustment.tenant_id, adjustment.tip_allocation_id
)
select
  allocation.tenant_id,
  allocation.cashier_shift_id,
  allocation.recipient_type,
  allocation.employee_id,
  coalesce(allocation.employee_label_snapshot, 'Equipo') as recipient_label,
  allocation.payment_method,
  count(*)::integer as payment_count,
  sum(allocation.amount_clp)::bigint as earned_tip_clp,
  coalesce(sum(adjustment.worker_tip_reduction_clp), 0)::bigint
    as refunded_while_open_clp,
  (
    sum(allocation.amount_clp)
    - coalesce(sum(adjustment.worker_tip_reduction_clp), 0)
  )::bigint as distributable_tip_clp,
  coalesce(sum(adjustment.local_absorbed_clp), 0)::bigint
    as local_absorbed_post_close_clp
from public.tip_allocations allocation
left join adjustment_totals adjustment
  on adjustment.tenant_id = allocation.tenant_id
 and adjustment.tip_allocation_id = allocation.id
group by
  allocation.tenant_id,
  allocation.cashier_shift_id,
  allocation.recipient_type,
  allocation.employee_id,
  allocation.employee_label_snapshot,
  allocation.payment_method;

grant select on public.cashier_tip_allocation_summary to authenticated;

comment on table public.tip_allocation_refund_adjustments is
  'Open-shift refunds reduce the frozen worker tip; post-close refunds remain a local cost and never claw back worker money.';

create or replace function private.enforce_drink_invitation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_settings public.tenant_checkout_engagement_settings%rowtype;
  invitation_count integer;
begin
  select *
  into invitation_settings
  from public.tenant_checkout_engagement_settings settings
  where settings.tenant_id = new.tenant_id;

  if invitation_settings.tenant_id is null
    or not invitation_settings.invitations_enabled then
    raise exception 'drink invitations are disabled for this tenant'
      using errcode = '55000';
  end if;

  select coalesce(sum(invitation.quantity), 0)
  into invitation_count
  from public.drink_invitations invitation
  where invitation.tenant_id = new.tenant_id
    and invitation.payer_device_session_id = new.payer_device_session_id;

  if invitation_count + new.quantity
    > invitation_settings.max_invitations_per_device_session then
    raise exception 'drink invitation limit reached for this device session'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger drink_invitations_enforce_limit
before insert on public.drink_invitations
for each row execute function private.enforce_drink_invitation_limit();

create or replace function private.expire_due_drink_invitations(
  requested_limit integer default 100,
  requested_at timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation record;
  expired_count integer := 0;
begin
  if requested_limit < 1 or requested_limit > 1000 then
    raise exception 'requested_limit must be between 1 and 1000'
      using errcode = '22023';
  end if;

  for invitation in
    select due.tenant_id, due.id, due.payment_id, due.amount_clp
    from public.drink_invitations due
    where due.state = 'pending_claim'
      and due.expires_at <= requested_at
    order by due.expires_at, due.id
    for update skip locked
    limit requested_limit
  loop
    update public.drink_invitations
    set state = 'refund_pending',
        expired_at = requested_at,
        updated_at = requested_at
    where tenant_id = invitation.tenant_id
      and id = invitation.id
      and state = 'pending_claim';

    if found then
      insert into public.drink_invitation_events (
        tenant_id, invitation_id, event_type, actor_type,
        idempotency_key, occurred_at
      ) values (
        invitation.tenant_id, invitation.id, 'expired', 'system',
        'invitation:' || invitation.id || ':expired', requested_at
      ) on conflict (tenant_id, idempotency_key) do nothing;

      insert into public.outbox_messages (
        tenant_id, aggregate_type, aggregate_id, topic,
        deduplication_key, payload
      ) values (
        invitation.tenant_id, 'drink_invitation', invitation.id,
        'refund.requested', 'invitation:' || invitation.id || ':refund',
        jsonb_build_object(
          'payment_id', invitation.payment_id,
          'amount_clp', invitation.amount_clp,
          'currency', 'CLP',
          'reason', 'unclaimed_invitation_expired'
        )
      ) on conflict (tenant_id, deduplication_key) do nothing;

      expired_count := expired_count + 1;
    end if;
  end loop;
  return expired_count;
end;
$$;

revoke all on function private.expire_due_drink_invitations(integer, timestamptz)
from public, anon, authenticated;

comment on function private.expire_due_drink_invitations(integer, timestamptz) is
  'Durable worker entrypoint: expires due unclaimed invitations and queues an idempotent refund without producing a ticket.';
