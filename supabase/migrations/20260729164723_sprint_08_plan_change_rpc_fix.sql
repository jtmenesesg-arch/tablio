alter function public.propose_tenant_plan_change(text) security definer;

revoke execute on function public.propose_tenant_plan_change(text)
from public, anon;
grant execute on function public.propose_tenant_plan_change(text)
to authenticated;

comment on function public.propose_tenant_plan_change(text) is
  'Narrow audited write: derives tenant from JWT and schedules the recommendation at period end.';
