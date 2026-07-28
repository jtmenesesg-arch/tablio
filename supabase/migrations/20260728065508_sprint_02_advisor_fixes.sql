-- Worker-only tables intentionally have no user route. Explicit deny policies
-- make that fail-closed posture visible to both humans and the advisor.
create policy deny_user_access
on public.processed_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_user_access
on public.outbox_messages
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_user_access
on public.outbox_delivery_attempts
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_user_access
on public.durable_effect_receipts
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

-- Cover every Sprint 2 composite foreign key reported by the advisor.
create index cart_items_tenant_product_fk_idx
  on public.cart_items (tenant_id, product_id);
create index cart_items_tenant_variant_fk_idx
  on public.cart_items (tenant_id, variant_id)
  where variant_id is not null;
create index checkout_quote_items_tenant_product_fk_idx
  on public.checkout_quote_items (tenant_id, product_id);
create index checkout_quote_items_tenant_source_cart_item_fk_idx
  on public.checkout_quote_items (tenant_id, source_cart_item_id);
create index checkout_quote_items_tenant_station_fk_idx
  on public.checkout_quote_items (tenant_id, station_id);
create index checkout_quote_items_tenant_variant_fk_idx
  on public.checkout_quote_items (tenant_id, variant_id)
  where variant_id is not null;
create index checkout_quotes_tenant_table_fk_idx
  on public.checkout_quotes (tenant_id, table_id);
create index checkout_quotes_tenant_session_fk_idx
  on public.checkout_quotes (tenant_id, table_session_id);
create index durable_effect_receipts_tenant_outbox_fk_idx
  on public.durable_effect_receipts (tenant_id, outbox_message_id);
create index order_items_tenant_quote_item_fk_idx
  on public.order_items (tenant_id, checkout_quote_item_id);
create index order_items_tenant_product_fk_idx
  on public.order_items (tenant_id, product_id);
create index order_items_tenant_station_fk_idx
  on public.order_items (tenant_id, station_id);
create index order_items_tenant_variant_fk_idx
  on public.order_items (tenant_id, variant_id)
  where variant_id is not null;
create index order_state_events_tenant_order_fk_idx
  on public.order_state_events (tenant_id, order_id);
create index orders_tenant_table_fk_idx
  on public.orders (tenant_id, table_id);
create index orders_tenant_session_fk_idx
  on public.orders (tenant_id, table_session_id);
create index payment_intents_tenant_merchant_fk_idx
  on public.payment_intents (tenant_id, merchant_account_id);
create index products_tenant_default_station_fk_idx
  on public.products (tenant_id, default_station_id);
create index provider_fees_tenant_settlement_fk_idx
  on public.provider_fees (tenant_id, settlement_id);
create index reconciliation_exceptions_tenant_payment_fk_idx
  on public.reconciliation_exceptions (tenant_id, payment_id)
  where payment_id is not null;
create index reconciliation_exceptions_tenant_event_fk_idx
  on public.reconciliation_exceptions (tenant_id, provider_payment_event_id)
  where provider_payment_event_id is not null;
create index reconciliation_exceptions_tenant_settlement_fk_idx
  on public.reconciliation_exceptions (tenant_id, settlement_id)
  where settlement_id is not null;
create index ticket_state_events_tenant_ticket_fk_idx
  on public.ticket_state_events (tenant_id, ticket_id);
