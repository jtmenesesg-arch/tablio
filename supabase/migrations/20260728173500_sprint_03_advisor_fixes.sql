-- Sprint 3 advisor follow-up: cover the new FK and avoid overlapping SELECT policies.

create index products_tenant_menu_category_fk_idx
  on public.products (tenant_id, menu_category_id)
  where menu_category_id is not null;

drop policy tenant_diner_settings_manage
  on public.tenant_diner_settings;
create policy tenant_diner_settings_insert
on public.tenant_diner_settings for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy tenant_diner_settings_update
on public.tenant_diner_settings for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy tenant_diner_settings_delete
on public.tenant_diner_settings for delete to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

drop policy menu_categories_manage on public.menu_categories;
create policy menu_categories_insert
on public.menu_categories for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy menu_categories_update
on public.menu_categories for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy menu_categories_delete
on public.menu_categories for delete to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

drop policy service_action_types_manage on public.service_action_types;
create policy service_action_types_insert
on public.service_action_types for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy service_action_types_update
on public.service_action_types for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy service_action_types_delete
on public.service_action_types for delete to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

