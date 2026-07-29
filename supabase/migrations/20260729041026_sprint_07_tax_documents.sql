-- Sprint 7: orchestration of Chilean tax documents through a replaceable provider.
-- No external provider call occurs inside a payment/refund transaction.

create table public.tenant_tax_settings (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  tax_document_mode text not null default 'hybrid_by_payment_method'
    check (
      tax_document_mode in (
        'electronic_payment_voucher',
        'dte_for_all_sales',
        'hybrid_by_payment_method'
      )
    ),
  provider_code text not null default 'simulated' check (btrim(provider_code) <> ''),
  provider_account_id text not null default 'simulated' check (btrim(provider_account_id) <> ''),
  issuer_rut text not null check (btrim(issuer_rut) <> ''),
  issuer_legal_name text not null check (btrim(issuer_legal_name) <> ''),
  issuer_business_activity text not null check (btrim(issuer_business_activity) <> ''),
  issuer_address text not null check (btrim(issuer_address) <> ''),
  issuer_commune text not null check (btrim(issuer_commune) <> ''),
  issuer_branch_code text,
  email_delivery_enabled boolean not null default true,
  pending_alert_count integer not null default 10
    check (pending_alert_count between 1 and 10000),
  pending_alert_age_seconds integer not null default 900
    check (pending_alert_age_seconds between 60 and 86400),
  health_window_seconds integer not null default 300
    check (health_window_seconds between 60 and 3600),
  health_min_attempts integer not null default 3
    check (health_min_attempts between 1 and 1000),
  degraded_failure_rate numeric(5,4) not null default 0.2000
    check (degraded_failure_rate between 0 and 1),
  down_failure_rate numeric(5,4) not null default 0.6000
    check (down_failure_rate between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (down_failure_rate > degraded_failure_rate)
);

create table private.tax_provider_credentials (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  provider_code text not null check (btrim(provider_code) <> ''),
  vault_secret_id uuid not null references vault.secrets (id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  primary key (tenant_id, provider_code)
);

alter table private.tax_provider_credentials enable row level security;
alter table private.tax_provider_credentials force row level security;
create policy tax_provider_credentials_deny
on private.tax_provider_credentials
as restrictive for all to public
using (false) with check (false);

create table public.tax_sale_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  order_id uuid not null,
  payment_id uuid not null,
  mode_snapshot text not null,
  payment_method_snapshot text not null,
  expected_backing text not null
    check (expected_backing in ('electronic_payment_voucher', 'electronic_receipt', 'review')),
  status text not null
    check (status in ('pending', 'satisfied', 'failed', 'needs_review')),
  amount_clp bigint not null check (amount_clp >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  created_at timestamptz not null default now(),
  satisfied_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, order_id),
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict
);

create table public.tax_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  tax_sale_record_id uuid not null,
  order_id uuid not null,
  refund_id uuid,
  original_tax_document_id uuid,
  provider_code text not null,
  provider_account_id text not null,
  kind text not null check (kind in ('electronic_receipt', 'credit_note')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'waiting_for_original', 'issued', 'failed')),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  amount_clp bigint not null check (amount_clp > 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  provider_document_id text,
  folio text,
  representation_url text,
  stamp text,
  customer_email text,
  email_delivery_status text not null default 'not_requested'
    check (email_delivery_status in ('not_requested', 'pending', 'sent', 'failed')),
  error_code text,
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique nulls not distinct (tenant_id, provider_code, provider_document_id),
  foreign key (tenant_id, tax_sale_record_id)
    references public.tax_sale_records (tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders (tenant_id, id) on delete restrict,
  foreign key (tenant_id, refund_id)
    references public.refunds (tenant_id, id) on delete restrict,
  foreign key (tenant_id, original_tax_document_id)
    references public.tax_documents (tenant_id, id) on delete restrict,
  check (
    (kind = 'electronic_receipt' and refund_id is null and original_tax_document_id is null)
    or
    (kind = 'credit_note' and refund_id is not null and original_tax_document_id is not null)
  ),
  check (
    (status = 'issued' and provider_document_id is not null and folio is not null and issued_at is not null)
    or status <> 'issued'
  )
);

create unique index tax_documents_one_receipt_per_sale_idx
  on public.tax_documents (tenant_id, tax_sale_record_id)
  where kind = 'electronic_receipt';
create unique index tax_documents_one_credit_note_per_refund_idx
  on public.tax_documents (tenant_id, refund_id)
  where kind = 'credit_note';
create index tax_documents_pending_health_idx
  on public.tax_documents (tenant_id, created_at)
  where status in ('queued', 'processing', 'waiting_for_original', 'failed');

create table public.tax_document_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  tax_document_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('started', 'issued', 'failed', 'duplicate_response', 'retry_requested')),
  provider_request_id text,
  error_code text,
  error_message text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, tax_document_id, attempt_number, outcome),
  foreign key (tenant_id, tax_document_id)
    references public.tax_documents (tenant_id, id) on delete restrict
);

create index tax_document_attempts_health_idx
  on public.tax_document_attempts (tenant_id, occurred_at desc, outcome);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_tax_settings',
    'tax_sale_records',
    'tax_documents',
    'tax_document_attempts'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        tenant_id = private.current_tenant_id()
        and private.has_active_membership(tenant_id)
        and private.has_permission(tenant_id, ''tax.read'')
      )',
      table_name || '_tenant_select',
      table_name
    );
  end loop;
end;
$$;

create or replace function private.prepare_tax_document_for_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  settings public.tenant_tax_settings%rowtype;
  payment_method text;
  expected text;
  sale_id uuid;
  document_id uuid;
begin
  select * into order_record from public.orders where id = p_order_id;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;

  select * into settings
  from public.tenant_tax_settings
  where tenant_id = order_record.tenant_id;
  if not found then raise exception 'tenant tax settings missing' using errcode = '55000'; end if;

  select coalesce(event.payload ->> 'payment_method_class', 'unknown')
  into payment_method
  from public.provider_payment_events event
  where event.tenant_id = order_record.tenant_id
    and event.payment_id = order_record.payment_id
    and event.normalized_status = 'approved'
    and event.signature_verified and event.server_verified
  order by event.received_at desc
  limit 1;
  payment_method := coalesce(payment_method, 'unknown');

  expected := case
    when settings.tax_document_mode = 'dte_for_all_sales' then 'electronic_receipt'
    when payment_method in ('card', 'electronic_wallet') then 'electronic_payment_voucher'
    when payment_method in ('cash', 'bank_transfer') then 'electronic_receipt'
    else 'review'
  end;

  insert into public.tax_sale_records (
    tenant_id, order_id, payment_id, mode_snapshot, payment_method_snapshot,
    expected_backing, status, amount_clp, currency, satisfied_at
  )
  values (
    order_record.tenant_id, order_record.id, order_record.payment_id,
    settings.tax_document_mode, payment_method, expected,
    case when expected = 'electronic_payment_voucher' then 'satisfied'
         when expected = 'review' then 'needs_review' else 'pending' end,
    order_record.total_clp, order_record.currency,
    case when expected = 'electronic_payment_voucher' then clock_timestamp() end
  )
  on conflict (tenant_id, order_id) do update
    set order_id = excluded.order_id
  returning id into sale_id;

  if expected = 'electronic_receipt' then
    insert into public.tax_documents (
      tenant_id, tax_sale_record_id, order_id, provider_code,
      provider_account_id, kind, status, idempotency_key, amount_clp, currency
    )
    values (
      order_record.tenant_id, sale_id, order_record.id, settings.provider_code,
      settings.provider_account_id, 'electronic_receipt', 'queued',
      'order:' || order_record.id::text || ':electronic-receipt',
      order_record.total_clp, order_record.currency
    )
    on conflict (tenant_id, idempotency_key) do update
      set idempotency_key = excluded.idempotency_key
    returning id into document_id;
  elsif expected = 'review' then
    perform private.add_reconciliation_exception(
      order_record.tenant_id,
      order_record.payment_id,
      null,
      'tax_payment_method_requires_review',
      'order:' || order_record.id::text || ':tax-method-review',
      'critical',
      true,
      'Definir respaldo tributario sin duplicar voucher y boleta',
      array['emitir_boleta', 'confirmar_voucher', 'escalar'],
      jsonb_build_object('order_id', order_record.id, 'payment_method', payment_method)
    );
  end if;

  return jsonb_build_object(
    'sale_record_id', sale_id,
    'tax_document_id', document_id,
    'expected_backing', expected
  );
end;
$$;

create or replace function private.prepare_tax_credit_note(p_refund_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  refund_record public.refunds%rowtype;
  sale public.tax_sale_records%rowtype;
  original public.tax_documents%rowtype;
  settings public.tenant_tax_settings%rowtype;
  document_id uuid;
begin
  select * into refund_record from public.refunds where id = p_refund_id;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if refund_record.status <> 'completed' then
    return jsonb_build_object('status', 'money_refund_not_completed');
  end if;

  select sale_record.* into sale
  from public.tax_sale_records sale_record
  where sale_record.tenant_id = refund_record.tenant_id
    and sale_record.payment_id = refund_record.payment_id;
  if not found or sale.expected_backing = 'electronic_payment_voucher' then
    return jsonb_build_object('status', 'provider_voucher_requires_external_correction');
  end if;

  select * into original
  from public.tax_documents document
  where document.tenant_id = refund_record.tenant_id
    and document.tax_sale_record_id = sale.id
    and document.kind = 'electronic_receipt';
  select * into settings from public.tenant_tax_settings where tenant_id = refund_record.tenant_id;

  insert into public.tax_documents (
    tenant_id, tax_sale_record_id, order_id, refund_id, original_tax_document_id,
    provider_code, provider_account_id, kind, status, idempotency_key,
    amount_clp, currency
  )
  values (
    refund_record.tenant_id, sale.id, sale.order_id, refund_record.id, original.id,
    settings.provider_code, settings.provider_account_id, 'credit_note',
    case when original.status = 'issued' then 'queued' else 'waiting_for_original' end,
    'refund:' || refund_record.id::text || ':credit-note',
    refund_record.amount_clp, refund_record.currency
  )
  on conflict (tenant_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into document_id;

  if original.status <> 'issued' then
    perform private.add_reconciliation_exception(
      refund_record.tenant_id,
      refund_record.payment_id,
      null,
      'tax_credit_note_pending',
      'refund:' || refund_record.id::text || ':credit-note-pending',
      'critical',
      true,
      'Reembolso monetario completado; nota de crédito pendiente',
      array['reintentar_boleta_original', 'escalar'],
      jsonb_build_object(
        'refund_id', refund_record.id,
        'tax_document_id', document_id,
        'money_refund_status', refund_record.status
      )
    );
  end if;

  return jsonb_build_object(
    'status', case when original.status = 'issued' then 'queued' else 'waiting_for_original' end,
    'tax_document_id', document_id,
    'money_refund_status', refund_record.status
  );
end;
$$;

create or replace function private.record_tax_document_result(
  p_tax_document_id uuid,
  p_outcome text,
  p_provider_document_id text default null,
  p_folio text default null,
  p_representation_url text default null,
  p_stamp text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  document public.tax_documents%rowtype;
  attempt integer;
begin
  select * into document from public.tax_documents where id = p_tax_document_id for update;
  if not found then raise exception 'tax document not found' using errcode = 'P0002'; end if;
  if document.status = 'issued' then
    return jsonb_build_object('tax_document_id', document.id, 'idempotent_replay', true);
  end if;
  attempt := document.retry_count + 1;

  if p_outcome = 'issued' then
    update public.tax_documents
    set status = 'issued', provider_document_id = p_provider_document_id,
        folio = p_folio, representation_url = p_representation_url, stamp = p_stamp,
        retry_count = attempt, issued_at = clock_timestamp(), updated_at = clock_timestamp(),
        error_code = null, error_message = null, next_retry_at = null
    where id = document.id;
    update public.tax_sale_records
    set status = 'satisfied', satisfied_at = clock_timestamp()
    where id = document.tax_sale_record_id and document.kind = 'electronic_receipt';
    update public.tax_documents
    set status = 'queued', updated_at = clock_timestamp()
    where tenant_id = document.tenant_id
      and original_tax_document_id = document.id
      and status = 'waiting_for_original';
    update public.reconciliation_exceptions
    set status = 'resolved', resolved_at = clock_timestamp()
    where tenant_id = document.tenant_id
      and deduplication_key in (
        'order:' || document.order_id::text || ':tax-document-failed',
        'refund:' || coalesce(document.refund_id::text, '') || ':credit-note-pending'
      )
      and status <> 'resolved';
  elsif p_outcome = 'failed' then
    update public.tax_documents
    set status = 'failed', retry_count = attempt,
        error_code = p_error_code, error_message = p_error_message,
        next_retry_at = clock_timestamp() + make_interval(secs => least(3600, 5 * (2 ^ least(attempt, 8))::integer)),
        updated_at = clock_timestamp()
    where id = document.id;
    perform private.add_reconciliation_exception(
      document.tenant_id,
      (select payment_id from public.tax_sale_records where id = document.tax_sale_record_id),
      null,
      case when document.kind = 'credit_note' then 'tax_credit_note_failed' else 'tax_document_failed' end,
      case when document.kind = 'credit_note'
        then 'refund:' || document.refund_id::text || ':credit-note-failed'
        else 'order:' || document.order_id::text || ':tax-document-failed' end,
      'critical', true,
      case when document.kind = 'credit_note'
        then 'Dinero devuelto; obligación de nota de crédito pendiente'
        else 'Boleta fallida; la venta y el pedido siguen confirmados' end,
      array['reintentar', 'escalar'],
      jsonb_build_object('tax_document_id', document.id, 'error', p_error_message)
    );
  else
    raise exception 'invalid tax document outcome' using errcode = '22023';
  end if;

  insert into public.tax_document_attempts (
    tenant_id, tax_document_id, attempt_number, outcome,
    error_code, error_message, duration_ms
  )
  values (
    document.tenant_id, document.id, attempt, p_outcome,
    p_error_code, p_error_message, p_duration_ms
  );
  return jsonb_build_object('tax_document_id', document.id, 'status', p_outcome, 'idempotent_replay', false);
end;
$$;

create or replace function private.enqueue_tax_credit_note_on_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic, deduplication_key, payload
  )
  values (
    new.tenant_id, 'refund', new.id, 'tax_document.refund_requested',
    'refund:' || new.id::text || ':tax-document',
    jsonb_build_object('refund_id', new.id, 'money_refund_independent', true)
  )
  on conflict (tenant_id, deduplication_key) do nothing;
  return new;
end;
$$;

create trigger refunds_enqueue_tax_credit_note
after insert on public.refunds
for each row execute function private.enqueue_tax_credit_note_on_refund();

create or replace function private.retry_tax_document(
  p_tax_document_id uuid,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  tenant uuid;
  document public.tax_documents%rowtype;
begin
  tenant := private.require_tenant_context();
  if not private.has_permission(tenant, 'tax.retry') then
    raise exception 'tax.retry permission required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'retry reason is required' using errcode = '22023';
  end if;
  select * into document
  from public.tax_documents
  where tenant_id = tenant and id = p_tax_document_id
  for update;
  if not found then raise exception 'tax document not found' using errcode = 'P0002'; end if;
  if document.status = 'issued' then return document.id; end if;
  update public.tax_documents
  set status = case when status = 'waiting_for_original' then status else 'queued' end,
      next_retry_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = document.id;
  insert into public.tax_document_attempts (
    tenant_id, tax_document_id, attempt_number, outcome, error_message
  )
  values (
    tenant, document.id, document.retry_count + 1, 'retry_requested', btrim(p_reason)
  )
  on conflict do nothing;
  insert into public.outbox_messages (
    tenant_id, aggregate_type, aggregate_id, topic, deduplication_key, payload
  )
  values (
    tenant, 'tax_document', document.id, 'tax_document.retry',
    'tax-document:' || document.id::text || ':retry:' || (document.retry_count + 1)::text,
    jsonb_build_object('tax_document_id', document.id, 'reason', btrim(p_reason))
  )
  on conflict (tenant_id, deduplication_key) do nothing;
  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id, reason
  )
  values (
    tenant, 'user', auth.uid(), 'tax_document.retry_requested',
    'tax_document', document.id, btrim(p_reason)
  );
  return document.id;
end;
$$;

create function public.retry_tax_document(p_tax_document_id uuid, p_reason text)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.retry_tax_document(p_tax_document_id, p_reason);
$$;

create or replace view public.cashier_tax_provider_health
with (security_invoker = true)
as
select
  settings.tenant_id,
  count(document.id) filter (
    where document.status in ('queued', 'processing', 'waiting_for_original', 'failed')
  )::integer as pending_count,
  min(document.created_at) filter (
    where document.status in ('queued', 'processing', 'waiting_for_original', 'failed')
  ) as oldest_pending_at,
  settings.pending_alert_count,
  settings.pending_alert_age_seconds,
  (
    count(document.id) filter (
      where document.status in ('queued', 'processing', 'waiting_for_original', 'failed')
    ) > settings.pending_alert_count
    or min(document.created_at) filter (
      where document.status in ('queued', 'processing', 'waiting_for_original', 'failed')
    ) < clock_timestamp() - make_interval(secs => settings.pending_alert_age_seconds)
  ) as requires_attention,
  coalesce(attempts.attempt_count, 0)::integer as recent_attempt_count,
  coalesce(attempts.failure_rate, 0)::numeric(5,4) as recent_failure_rate,
  case
    when coalesce(attempts.attempt_count, 0) < settings.health_min_attempts then 'unknown'
    when attempts.failure_rate >= settings.down_failure_rate then 'down'
    when attempts.failure_rate >= settings.degraded_failure_rate then 'degraded'
    else 'working'
  end as provider_status
from public.tenant_tax_settings settings
left join public.tax_documents document
  on document.tenant_id = settings.tenant_id
left join lateral (
  select
    count(*)::integer as attempt_count,
    count(*) filter (where attempt.outcome = 'failed')::numeric
      / nullif(count(*), 0) as failure_rate
  from public.tax_document_attempts attempt
  where attempt.tenant_id = settings.tenant_id
    and attempt.occurred_at >= clock_timestamp()
      - make_interval(secs => settings.health_window_seconds)
) attempts on true
group by
  settings.tenant_id, settings.pending_alert_count,
  settings.pending_alert_age_seconds, settings.health_min_attempts,
  settings.down_failure_rate, settings.degraded_failure_rate,
  attempts.attempt_count, attempts.failure_rate;

drop view public.cashier_reconciliation_trace;

create view public.cashier_reconciliation_trace
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
        <> settlement_entry.gross_clp - settlement_entry.refunds_clp
          - settlement_entry.chargebacks_clp - settlement_entry.provider_fee_clp
      or settlement_entry.deposited_clp <> settlement_entry.net_clp then 'difference'
    else 'matched'
  end as provider_reconciliation_status,
  coalesce(document.status, sale.status, 'pending') as tax_document_status,
  sale.expected_backing as tax_expected_backing,
  document.id as tax_document_id,
  document.folio as tax_folio,
  document.amount_clp as tax_document_amount_clp,
  document.representation_url as tax_representation_url,
  attribution.provider_approved_at,
  attribution.provider_received_at
from public.payments payment
join public.checkout_quotes quote
  on quote.tenant_id = payment.tenant_id and quote.id = payment.checkout_quote_id
left join public.orders orders
  on orders.tenant_id = payment.tenant_id and orders.payment_id = payment.id
left join public.payment_shift_attributions attribution
  on attribution.tenant_id = payment.tenant_id and attribution.payment_id = payment.id
left join public.settlement_payment_entries settlement_entry
  on settlement_entry.tenant_id = payment.tenant_id and settlement_entry.payment_id = payment.id
left join public.tax_sale_records sale
  on sale.tenant_id = payment.tenant_id and sale.payment_id = payment.id
left join public.tax_documents document
  on document.tenant_id = sale.tenant_id
 and document.tax_sale_record_id = sale.id
 and document.kind = 'electronic_receipt'
left join lateral (
  select coalesce(sum(refund.amount_clp), 0)::bigint refunded_clp
  from public.refunds refund
  where refund.tenant_id = payment.tenant_id
    and refund.payment_id = payment.id and refund.status = 'completed'
) refund_totals on true;

insert into public.permissions (code, description)
values
  ('tax.read', 'Leer respaldo tributario y estado del proveedor DTE.'),
  ('tax.retry', 'Reintentar una emisión tributaria con motivo auditado.'),
  ('tax.configure', 'Configurar emisor y proveedor DTE del local.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('cashier_admin', 'tax.read'), ('cashier_admin', 'tax.retry'),
  ('owner', 'tax.read'), ('owner', 'tax.retry'), ('owner', 'tax.configure'),
  ('superadmin', 'tax.read'), ('superadmin', 'tax.retry'), ('superadmin', 'tax.configure')
on conflict do nothing;

revoke all on table
  public.tenant_tax_settings, public.tax_sale_records,
  public.tax_documents, public.tax_document_attempts
from public, anon, authenticated;
grant select on table
  public.tenant_tax_settings, public.tax_sale_records,
  public.tax_documents, public.tax_document_attempts
to authenticated, service_role;

revoke all on table private.tax_provider_credentials from public, anon, authenticated;
grant select, insert, update, delete on table private.tax_provider_credentials to service_role;

revoke all on table public.cashier_tax_provider_health, public.cashier_reconciliation_trace
from public, anon, authenticated, service_role;
grant select on table public.cashier_tax_provider_health, public.cashier_reconciliation_trace
to authenticated, service_role;

revoke execute on function public.retry_tax_document(uuid, text)
from public, anon, service_role;
grant execute on function public.retry_tax_document(uuid, text) to authenticated;
grant execute on function private.retry_tax_document(uuid, text) to authenticated;

revoke execute on function
  private.prepare_tax_document_for_order(uuid),
  private.prepare_tax_credit_note(uuid),
  private.record_tax_document_result(uuid,text,text,text,text,text,text,text,integer)
from public, anon, authenticated;
grant execute on function
  private.prepare_tax_document_for_order(uuid),
  private.prepare_tax_credit_note(uuid),
  private.record_tax_document_result(uuid,text,text,text,text,text,text,text,integer)
to service_role;

revoke execute on function private.enqueue_tax_credit_note_on_refund()
from public, anon, authenticated, service_role;

comment on table public.tax_documents is
  'One idempotent provider obligation per sale/refund. Refund money never waits for this document.';
comment on table private.tax_provider_credentials is
  'Only a Vault secret reference; plaintext credentials are never stored here or exposed to user routes.';
comment on view public.cashier_tax_provider_health is
  'Live DTE alert from configurable pending volume/age and recent provider failure rate.';
