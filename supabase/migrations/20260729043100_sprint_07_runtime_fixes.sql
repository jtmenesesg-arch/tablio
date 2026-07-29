-- The Sprint 2 helper includes settlement_id and visible_to_cashier. This
-- narrow overload keeps every Sprint 7 exception visible and supplies the
-- omitted settlement slot explicitly.
create function private.add_reconciliation_exception(
  p_tenant_id uuid,
  p_payment_id uuid,
  p_provider_payment_event_id uuid,
  p_exception_type text,
  p_deduplication_key text,
  p_priority text,
  p_requires_immediate_action boolean,
  p_decision_required text,
  p_resolution_options text[],
  p_details jsonb
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select private.add_reconciliation_exception(
    p_tenant_id,
    p_payment_id,
    p_provider_payment_event_id,
    null::uuid,
    p_exception_type,
    p_deduplication_key,
    p_priority,
    p_requires_immediate_action,
    true,
    p_decision_required,
    p_resolution_options,
    p_details,
    clock_timestamp()
  );
$$;

-- A refund can race the original receipt worker. Prepare that sale first,
-- then keep the credit note waiting without blocking the money refund.
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

  if not found then
    perform private.prepare_tax_document_for_order(
      (
        select orders.id
        from public.orders orders
        where orders.tenant_id = refund_record.tenant_id
          and orders.payment_id = refund_record.payment_id
      )
    );
    select sale_record.* into sale
    from public.tax_sale_records sale_record
    where sale_record.tenant_id = refund_record.tenant_id
      and sale_record.payment_id = refund_record.payment_id;
  end if;

  if not found or sale.expected_backing = 'electronic_payment_voucher' then
    return jsonb_build_object(
      'status',
      'provider_voucher_requires_external_correction'
    );
  end if;

  select * into original
  from public.tax_documents document
  where document.tenant_id = refund_record.tenant_id
    and document.tax_sale_record_id = sale.id
    and document.kind = 'electronic_receipt';

  if not found then
    perform private.prepare_tax_document_for_order(sale.order_id);
    select * into original
    from public.tax_documents document
    where document.tenant_id = refund_record.tenant_id
      and document.tax_sale_record_id = sale.id
      and document.kind = 'electronic_receipt';
  end if;

  if not found then
    perform private.add_reconciliation_exception(
      refund_record.tenant_id,
      refund_record.payment_id,
      null,
      'tax_credit_note_pending',
      'refund:' || refund_record.id::text || ':credit-note-pending',
      'critical',
      true,
      'Dinero devuelto; falta preparar el documento tributario original',
      array['reintentar_boleta_original', 'escalar'],
      jsonb_build_object(
        'refund_id', refund_record.id,
        'money_refund_status', refund_record.status
      )
    );
    return jsonb_build_object(
      'status', 'waiting_for_original',
      'money_refund_status', refund_record.status
    );
  end if;

  select * into settings
  from public.tenant_tax_settings
  where tenant_id = refund_record.tenant_id;

  insert into public.tax_documents (
    tenant_id, tax_sale_record_id, order_id, refund_id,
    original_tax_document_id, provider_code, provider_account_id,
    kind, status, idempotency_key, amount_clp, currency
  )
  values (
    refund_record.tenant_id, sale.id, sale.order_id, refund_record.id,
    original.id, settings.provider_code, settings.provider_account_id,
    'credit_note',
    case when original.status = 'issued' then 'queued'
      else 'waiting_for_original' end,
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
    'status',
    case when original.status = 'issued' then 'queued'
      else 'waiting_for_original' end,
    'tax_document_id', document_id,
    'money_refund_status', refund_record.status
  );
end;
$$;

revoke execute on function private.add_reconciliation_exception(
  uuid, uuid, uuid, text, text, text, boolean, text, text[], jsonb
) from public, anon, authenticated, service_role;

revoke execute on function private.prepare_tax_credit_note(uuid)
from public, anon, authenticated;
grant execute on function private.prepare_tax_credit_note(uuid) to service_role;
