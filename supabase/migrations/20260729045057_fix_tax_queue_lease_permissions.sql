create or replace function public.worker_read_tax_messages(
  p_visibility_timeout_seconds integer default 60,
  p_limit integer default 20
)
returns table (
  message_id bigint,
  read_count integer,
  enqueued_at timestamptz,
  visible_at timestamptz,
  message jsonb
)
language sql
volatile
security definer
set search_path = ''
as $$
  select
    queued.msg_id,
    queued.read_ct,
    queued.enqueued_at,
    queued.vt,
    queued.message
  from pgmq.read(
    'tax_documents',
    p_visibility_timeout_seconds,
    p_limit
  ) queued;
$$;

revoke execute on function public.worker_read_tax_messages(integer, integer)
from public, anon, authenticated;
grant execute on function public.worker_read_tax_messages(integer, integer)
to service_role;

comment on function public.worker_read_tax_messages(integer, integer) is
  'Security-definer lease limited to the DTE queue; callers never receive pgmq privileges.';
