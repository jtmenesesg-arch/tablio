-- Keep privileged implementations outside the PostgREST API schema. Public
-- RPCs are SECURITY INVOKER façades; private implementations still validate
-- tenant context and explicit permissions before writing.

alter function public.configure_table_credit(
  uuid, boolean, bigint, bigint, integer, text
) set schema private;
alter function public.open_table_credit(
  uuid, uuid, uuid, text, text
) set schema private;
alter function public.create_table_credit_order(
  uuid, uuid, text
) set schema private;
alter function public.record_table_credit_payment(
  uuid, bigint, text, text, uuid
) set schema private;
alter function public.request_table_credit_bill(uuid) set schema private;
alter function public.close_table_credit_with_loss(uuid, text) set schema private;
alter function public.issue_table_credit_verification(uuid) set schema private;
alter function public.validate_table_credit_verification(uuid, text)
  set schema private;

create function public.configure_table_credit(
  p_venue_id uuid,
  p_enabled boolean,
  p_max_per_table_clp bigint,
  p_max_venue_exposure_clp bigint,
  p_expires_after_minutes integer,
  p_reason text
)
returns public.tenant_table_credit_settings
language sql
security invoker
set search_path = ''
as $$
  select private.configure_table_credit(
    p_venue_id,
    p_enabled,
    p_max_per_table_clp,
    p_max_venue_exposure_clp,
    p_expires_after_minutes,
    p_reason
  );
$$;

create function public.open_table_credit(
  p_venue_id uuid,
  p_table_id uuid,
  p_table_session_id uuid,
  p_reason text,
  p_customer_label text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.open_table_credit(
    p_venue_id,
    p_table_id,
    p_table_session_id,
    p_reason,
    p_customer_label
  );
$$;

create function public.create_table_credit_order(
  p_account_id uuid,
  p_checkout_quote_id uuid,
  p_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_table_credit_order(
    p_account_id,
    p_checkout_quote_id,
    p_idempotency_key
  );
$$;

create function public.record_table_credit_payment(
  p_account_id uuid,
  p_amount_clp bigint,
  p_method text,
  p_idempotency_key text,
  p_payment_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_table_credit_payment(
    p_account_id,
    p_amount_clp,
    p_method,
    p_idempotency_key,
    p_payment_id
  );
$$;

create function public.request_table_credit_bill(p_account_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.request_table_credit_bill(p_account_id);
$$;

create function public.close_table_credit_with_loss(
  p_account_id uuid,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.close_table_credit_with_loss(p_account_id, p_reason);
$$;

create function public.issue_table_credit_verification(p_account_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.issue_table_credit_verification(p_account_id);
$$;

create function public.validate_table_credit_verification(
  p_account_id uuid,
  p_code text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.validate_table_credit_verification(p_account_id, p_code);
$$;

revoke all on function
  public.configure_table_credit(uuid,boolean,bigint,bigint,integer,text),
  public.open_table_credit(uuid,uuid,uuid,text,text),
  public.create_table_credit_order(uuid,uuid,text),
  public.record_table_credit_payment(uuid,bigint,text,text,uuid),
  public.request_table_credit_bill(uuid),
  public.close_table_credit_with_loss(uuid,text),
  public.issue_table_credit_verification(uuid),
  public.validate_table_credit_verification(uuid,text)
from public, anon;

grant usage on schema private to authenticated;
grant execute on function
  private.configure_table_credit(uuid,boolean,bigint,bigint,integer,text),
  private.open_table_credit(uuid,uuid,uuid,text,text),
  private.create_table_credit_order(uuid,uuid,text),
  private.record_table_credit_payment(uuid,bigint,text,text,uuid),
  private.request_table_credit_bill(uuid),
  private.close_table_credit_with_loss(uuid,text),
  private.issue_table_credit_verification(uuid),
  private.validate_table_credit_verification(uuid,text),
  public.configure_table_credit(uuid,boolean,bigint,bigint,integer,text),
  public.open_table_credit(uuid,uuid,uuid,text,text),
  public.create_table_credit_order(uuid,uuid,text),
  public.record_table_credit_payment(uuid,bigint,text,text,uuid),
  public.request_table_credit_bill(uuid),
  public.close_table_credit_with_loss(uuid,text),
  public.issue_table_credit_verification(uuid),
  public.validate_table_credit_verification(uuid,text)
to authenticated;
