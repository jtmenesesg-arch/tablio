-- Sprint 12 advisor fixes: cover every new foreign key and avoid overlapping
-- permissive SELECT policies.

create index checkout_quote_items_invitation_target_fk_idx
  on public.checkout_quote_items (tenant_id, invitation_target_table_session_id)
  where invitation_target_table_session_id is not null;
create index checkout_quote_items_promotion_fk_idx
  on public.checkout_quote_items (tenant_id, promotion_id)
  where promotion_id is not null;
create index checkout_quote_items_promotion_version_fk_idx
  on public.checkout_quote_items (tenant_id, promotion_version_id)
  where promotion_version_id is not null;
create index checkout_quote_items_upsell_rule_fk_idx
  on public.checkout_quote_items (tenant_id, upsell_rule_id)
  where upsell_rule_id is not null;
create index checkout_quotes_tip_employee_fk_idx
  on public.checkout_quotes (tenant_id, tip_recipient_employee_id)
  where tip_recipient_employee_id is not null;
create index checkout_quotes_tip_session_fk_idx
  on public.checkout_quotes (tenant_id, tip_recipient_employee_session_id)
  where tip_recipient_employee_session_id is not null;

create index checkout_upsell_events_device_fk_idx
  on public.checkout_upsell_events (tenant_id, diner_device_session_id);
create index checkout_upsell_events_cart_fk_idx
  on public.checkout_upsell_events (tenant_id, cart_id);
create index checkout_upsell_events_quote_fk_idx
  on public.checkout_upsell_events (tenant_id, checkout_quote_id)
  where checkout_quote_id is not null;
create index checkout_upsell_events_order_fk_idx
  on public.checkout_upsell_events (tenant_id, order_id)
  where order_id is not null;
create index checkout_upsell_events_rule_fk_idx
  on public.checkout_upsell_events (tenant_id, upsell_rule_id);
create index checkout_upsell_events_product_fk_idx
  on public.checkout_upsell_events (tenant_id, suggested_product_id);

create index checkout_upsell_rules_venue_fk_idx
  on public.checkout_upsell_rules (tenant_id, venue_id);
create index checkout_upsell_rules_source_product_fk_idx
  on public.checkout_upsell_rules (tenant_id, source_product_id)
  where source_product_id is not null;
create index checkout_upsell_rules_source_category_fk_idx
  on public.checkout_upsell_rules (tenant_id, source_category_id)
  where source_category_id is not null;
create index checkout_upsell_rules_suggestion_fk_idx
  on public.checkout_upsell_rules (tenant_id, suggestion_product_id);
create index checkout_upsell_rules_creator_fk_idx
  on public.checkout_upsell_rules (tenant_id, created_by_employee_id);

create index promotion_campaigns_venue_fk_idx
  on public.promotion_campaigns (tenant_id, venue_id);
create index promotion_campaigns_creator_fk_idx
  on public.promotion_campaigns (tenant_id, created_by_employee_id);
create index promotion_versions_creator_fk_idx
  on public.promotion_versions (tenant_id, created_by_employee_id);
create index promotion_activation_version_fk_idx
  on public.promotion_activation_events (tenant_id, promotion_version_id);
create index promotion_activation_actor_fk_idx
  on public.promotion_activation_events (tenant_id, actor_employee_id)
  where actor_employee_id is not null;

create index orders_tip_employee_fk_idx
  on public.orders (tenant_id, tip_recipient_employee_id)
  where tip_recipient_employee_id is not null;
create index orders_tip_session_fk_idx
  on public.orders (tenant_id, tip_recipient_employee_session_id)
  where tip_recipient_employee_session_id is not null;
create index order_items_upsell_rule_fk_idx
  on public.order_items (tenant_id, upsell_rule_id)
  where upsell_rule_id is not null;
create index order_items_promotion_fk_idx
  on public.order_items (tenant_id, promotion_id)
  where promotion_id is not null;
create index order_items_promotion_version_fk_idx
  on public.order_items (tenant_id, promotion_version_id)
  where promotion_version_id is not null;

create index drink_invitations_payer_device_fk_idx
  on public.drink_invitations (tenant_id, payer_device_session_id);
create index drink_invitations_payer_table_session_fk_idx
  on public.drink_invitations (tenant_id, payer_table_session_id);
create index drink_invitations_destination_session_fk_idx
  on public.drink_invitations (tenant_id, destination_table_session_id);
create index drink_invitations_destination_table_fk_idx
  on public.drink_invitations (tenant_id, destination_table_id);
create index drink_invitations_payment_fk_idx
  on public.drink_invitations (tenant_id, payment_id);
create index drink_invitations_source_order_fk_idx
  on public.drink_invitations (tenant_id, source_order_id);
create index drink_invitations_product_fk_idx
  on public.drink_invitations (tenant_id, product_id);
create index drink_invitations_variant_fk_idx
  on public.drink_invitations (tenant_id, variant_id)
  where variant_id is not null;
create index drink_invitations_station_fk_idx
  on public.drink_invitations (tenant_id, station_id);
create index drink_invitations_claimed_device_fk_idx
  on public.drink_invitations (tenant_id, claimed_by_device_session_id)
  where claimed_by_device_session_id is not null;
create index drink_invitations_refund_fk_idx
  on public.drink_invitations (tenant_id, refund_id)
  where refund_id is not null;
create index drink_invitation_events_actor_device_fk_idx
  on public.drink_invitation_events (tenant_id, actor_device_session_id)
  where actor_device_session_id is not null;

create index tip_allocations_order_fk_idx
  on public.tip_allocations (tenant_id, order_id);
create index tip_allocations_employee_session_fk_idx
  on public.tip_allocations (tenant_id, employee_session_id)
  where employee_session_id is not null;

drop policy checkout_engagement_settings_manage
  on public.tenant_checkout_engagement_settings;
create policy checkout_engagement_settings_insert
on public.tenant_checkout_engagement_settings for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
);
create policy checkout_engagement_settings_update
on public.tenant_checkout_engagement_settings for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.manage'))
);

drop policy checkout_upsell_rules_manage on public.checkout_upsell_rules;
create policy checkout_upsell_rules_insert
on public.checkout_upsell_rules for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy checkout_upsell_rules_update
on public.checkout_upsell_rules for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);

drop policy promotion_campaigns_manage on public.promotion_campaigns;
create policy promotion_campaigns_insert
on public.promotion_campaigns for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
create policy promotion_campaigns_update
on public.promotion_campaigns for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'catalog.manage'))
);
