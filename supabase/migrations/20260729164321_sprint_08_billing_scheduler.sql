alter table public.saas_billing_accounts
add column simulation_behavior text not null default 'success'
  check (simulation_behavior in ('success', 'fail_once', 'always_fail'));

alter table public.saas_subscriptions
add column negotiated_monthly_clp bigint
  check (negotiated_monthly_clp is null or negotiated_monthly_clp >= 0),
add constraint saas_subscriptions_retry_schedule_not_empty
  check (cardinality(retry_delays_hours) > 0);

create unique index saas_notifications_dedup_idx
on public.saas_notifications (
  tenant_id, subscription_id, kind, channel, scheduled_at
);

create or replace function private.record_subscription_transition(
  p_tenant_id uuid,
  p_subscription_id uuid,
  p_from_status text,
  p_to_status text,
  p_reason text,
  p_effective_at timestamptz default clock_timestamp()
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_from_status = p_to_status then return; end if;
  insert into public.subscription_status_events (
    tenant_id, subscription_id, from_status, to_status,
    reason, actor_user_id, effective_at
  )
  values (
    p_tenant_id, p_subscription_id, p_from_status, p_to_status,
    p_reason, null, p_effective_at
  );
  insert into public.audit_log (
    tenant_id, actor_type, action, target_type,
    target_id, reason, before_data, after_data
  )
  values (
    p_tenant_id, 'worker', 'billing.subscription_status_changed',
    'saas_subscription', p_subscription_id, p_reason,
    jsonb_build_object('status', p_from_status),
    jsonb_build_object('status', p_to_status)
  );
end;
$$;

create or replace function private.process_saas_charge_attempt()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  invoice public.saas_invoices%rowtype;
  subscription public.saas_subscriptions%rowtype;
  next_status text;
  retry_delay integer;
begin
  select * into invoice
  from public.saas_invoices item
  where item.tenant_id = new.tenant_id and item.id = new.invoice_id;
  select * into subscription
  from public.saas_subscriptions item
  where item.tenant_id = new.tenant_id
    and item.id = invoice.subscription_id
  for update;

  if new.status = 'succeeded' then
    update public.saas_invoices
    set status = 'paid', paid_at = new.occurred_at
    where tenant_id = new.tenant_id and id = new.invoice_id;
    update public.saas_subscriptions
    set status = 'active',
        current_period_start = case
          when invoice.kind = 'subscription' then current_period_end
          else current_period_start
        end,
        current_period_end = case
          when invoice.kind = 'subscription' then current_period_end + interval '1 month'
          else current_period_end
        end,
        next_charge_at = case
          when invoice.kind = 'subscription' then current_period_end + interval '1 month'
          else next_charge_at
        end,
        grace_ends_at = null
    where tenant_id = new.tenant_id and id = subscription.id;
    perform private.record_subscription_transition(
      new.tenant_id, subscription.id, subscription.status, 'active',
      'Cobro SaaS confirmado por el proveedor simulado.', new.occurred_at
    );
    return new;
  end if;

  if new.status = 'failed' then
    retry_delay := subscription.retry_delays_hours[
      least(new.attempt_number, cardinality(subscription.retry_delays_hours))
    ];
    update public.saas_charge_attempts
    set next_retry_at = new.occurred_at + make_interval(hours => retry_delay)
    where tenant_id = new.tenant_id and id = new.id;

    next_status := case
      when new.attempt_number >= cardinality(subscription.retry_delays_hours)
        then 'grace'
      else 'past_due'
    end;
    update public.saas_subscriptions
    set status = next_status,
        grace_ends_at = case when next_status = 'grace'
          then new.occurred_at + make_interval(days => subscription.grace_days)
          else grace_ends_at
        end
    where tenant_id = new.tenant_id and id = subscription.id
      and status not in (
        'admin_restricted', 'suspension_scheduled', 'suspended', 'cancelled'
      );
    perform private.record_subscription_transition(
      new.tenant_id, subscription.id, subscription.status, next_status,
      'Cobro SaaS fallido; el bar continúa operando.', new.occurred_at
    );

    insert into public.saas_notifications (
      tenant_id, subscription_id, kind, channel,
      recipient, message, scheduled_at
    )
    values (
      new.tenant_id, subscription.id, 'charge_failed', 'in_app',
      'tenant_owner', 'El cobro de Tablio falló. El bar sigue operando.',
      new.occurred_at
    )
    on conflict do nothing;
    insert into public.saas_notifications (
      tenant_id, subscription_id, kind, channel,
      recipient, message, scheduled_at
    )
    values (
      new.tenant_id, subscription.id,
      case when next_status = 'grace' then 'grace_notice'
        else 'retry_scheduled' end,
      'in_app', 'tenant_owner',
      case when next_status = 'grace'
        then 'Comenzó el período de gracia; el bar sigue vendiendo.'
        else 'Programamos un reintento automático del cobro.' end,
      new.occurred_at + make_interval(hours => retry_delay)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger saas_charge_attempts_apply_result
after insert on public.saas_charge_attempts
for each row execute function private.process_saas_charge_attempt();

create or replace function private.run_simulated_saas_billing_cycle(
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  subscription public.saas_subscriptions%rowtype;
  billing_account public.saas_billing_accounts%rowtype;
  invoice public.saas_invoices%rowtype;
  previous_attempt public.saas_charge_attempts%rowtype;
  attempt_number integer;
  outcome text;
  processed integer := 0;
begin
  insert into public.saas_notifications (
    tenant_id, subscription_id, kind, channel,
    recipient, message, scheduled_at
  )
  select
    candidate.tenant_id, candidate.id, 'charge_notice', 'in_app',
    'tenant_owner', 'Tu mensualidad de Tablio se cobrará próximamente.',
    candidate.next_charge_at
      - make_interval(days => candidate.notice_days_before_charge)
  from public.saas_subscriptions candidate
  where candidate.status in ('trialing', 'active')
    and candidate.next_charge_at is not null
    and candidate.next_charge_at
      - make_interval(days => candidate.notice_days_before_charge) <= p_now
  on conflict do nothing;

  for subscription in
    select item.*
    from public.saas_subscriptions item
    where item.status in ('trialing', 'active', 'past_due', 'grace')
      and (
        item.next_charge_at <= p_now
        or exists (
          select 1
          from public.saas_invoices candidate_invoice
          join public.saas_charge_attempts attempt
            on attempt.tenant_id = candidate_invoice.tenant_id
           and attempt.invoice_id = candidate_invoice.id
          where candidate_invoice.tenant_id = item.tenant_id
            and candidate_invoice.subscription_id = item.id
            and candidate_invoice.status = 'open'
            and attempt.status = 'failed'
            and attempt.next_retry_at <= p_now
        )
      )
    order by item.next_charge_at
    for update skip locked
  loop
    select * into billing_account
    from public.saas_billing_accounts account
    where account.tenant_id = subscription.tenant_id
      and account.id = subscription.billing_account_id
      and account.status = 'ready';
    if not found or billing_account.provider_code <> 'simulated' then continue; end if;

    select * into invoice
    from public.saas_invoices candidate
    where candidate.tenant_id = subscription.tenant_id
      and candidate.subscription_id = subscription.id
      and candidate.kind = 'subscription'
      and candidate.status = 'open'
    order by candidate.created_at desc
    limit 1;
    if not found then
      insert into public.saas_invoices (
        tenant_id, subscription_id, invoice_number, kind, status,
        subtotal_clp, tax_clp, total_clp, due_at
      )
      select
        subscription.tenant_id, subscription.id,
        'SAAS-' || left(subscription.tenant_id::text, 8) || '-'
          || to_char(subscription.current_period_end, 'YYYYMMDD'),
        'subscription', 'open',
        coalesce(subscription.negotiated_monthly_clp, plan.monthly_clp),
        0,
        coalesce(subscription.negotiated_monthly_clp, plan.monthly_clp),
        subscription.next_charge_at
      from public.saas_plan_definitions plan
      where plan.code = subscription.plan_code
        and coalesce(subscription.negotiated_monthly_clp, plan.monthly_clp)
          is not null
      returning * into invoice;
      if not found then continue; end if;
    end if;

    select * into previous_attempt
    from public.saas_charge_attempts attempt
    where attempt.tenant_id = subscription.tenant_id
      and attempt.invoice_id = invoice.id
    order by attempt.attempt_number desc
    limit 1;
    attempt_number := coalesce(previous_attempt.attempt_number, 0) + 1;
    outcome := case
      when billing_account.simulation_behavior = 'always_fail' then 'failed'
      when billing_account.simulation_behavior = 'fail_once'
        and attempt_number = 1 then 'failed'
      else 'succeeded'
    end;

    insert into public.saas_charge_attempts (
      tenant_id, invoice_id, billing_account_id, idempotency_key,
      attempt_number, status, provider_charge_id,
      failure_code, failure_message, occurred_at
    )
    values (
      subscription.tenant_id, invoice.id, billing_account.id,
      'saas:' || invoice.id::text || ':attempt:' || attempt_number,
      attempt_number, outcome,
      case when outcome = 'succeeded'
        then 'sim-saas:' || invoice.id::text else null end,
      case when outcome = 'failed' then 'demo_card_declined' else null end,
      case when outcome = 'failed'
        then 'Cobro rechazado por el simulador.' else null end,
      p_now
    )
    on conflict (tenant_id, idempotency_key) do nothing;
    processed := processed + 1;
  end loop;

  for subscription in
    select item.*
    from public.saas_subscriptions item
    where item.status = 'grace'
      and item.grace_ends_at <= p_now
    for update skip locked
  loop
    update public.saas_subscriptions
    set status = 'admin_restricted'
    where tenant_id = subscription.tenant_id and id = subscription.id;
    perform private.record_subscription_transition(
      subscription.tenant_id, subscription.id, 'grace', 'admin_restricted',
      'Terminó la gracia; pedidos y producción continúan.', p_now
    );
    insert into public.saas_notifications (
      tenant_id, subscription_id, kind, channel,
      recipient, message, scheduled_at
    )
    values (
      subscription.tenant_id, subscription.id,
      'admin_restriction_notice', 'written_notice', 'tenant_owner',
      'Se restringieron funciones administrativas. El bar sigue vendiendo.',
      p_now
    )
    on conflict do nothing;
  end loop;
  return processed;
end;
$$;

do $$
begin
  perform cron.unschedule(job.jobid)
  from cron.job job
  where job.jobname = 'tablio-saas-billing-cycle';
end;
$$;

select cron.schedule(
  'tablio-saas-billing-cycle',
  '0 * * * *',
  'select private.run_simulated_saas_billing_cycle();'
);

revoke execute on function
  private.record_subscription_transition(uuid,uuid,text,text,text,timestamptz),
  private.run_simulated_saas_billing_cycle(timestamptz)
from public, anon, authenticated, service_role;

comment on function private.run_simulated_saas_billing_cycle(timestamptz) is
  'Hourly durable SaaS billing simulation. Failures create notices/retries and never immediate suspension.';
