create policy user_tenant_context_deny_clients
on private.user_tenant_context
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

comment on policy user_tenant_context_deny_clients
on private.user_tenant_context is
  'Explicit fail-closed policy: browser-facing roles never access tenant context directly.';
