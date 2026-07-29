-- The function reads request-local JWT configuration through
-- require_tenant_context(), so PostgreSQL must not cache it as STABLE.
alter function private.require_cashier_permission(text) volatile;
