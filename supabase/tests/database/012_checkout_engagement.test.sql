begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select has_table('public', 'tenant_checkout_engagement_settings',
  'Existe configuración del momento de pago por tenant.');
select has_table('public', 'checkout_upsell_rules',
  'Las reglas deterministas de upsell son persistentes.');
select has_table('public', 'checkout_upsell_events',
  'La atribución de upsell queda como evidencia.');
select has_table('public', 'promotion_campaigns',
  'Happy hour tiene una campaña configurable.');
select has_table('public', 'promotion_versions',
  'Cada regla de precio tiene una versión inmutable.');
select has_table('public', 'promotion_activation_events',
  'Activar o desactivar una promoción queda auditado.');
select has_table('public', 'drink_invitations',
  'Una invitación pagada tiene estado durable.');
select has_table('public', 'drink_invitation_events',
  'El historial de la invitación es append-only.');
select has_table('public', 'tip_allocations',
  'La propina conserva su destinatario y turno.');
select has_table('public', 'tip_allocation_refund_adjustments',
  'El reembolso conserva la política del turno para el trabajador elegido.');
select is(
  (
    select count(*)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'tenant_checkout_engagement_settings',
        'checkout_upsell_rules',
        'checkout_upsell_events',
        'promotion_campaigns',
        'promotion_versions',
        'promotion_activation_events',
        'drink_invitations',
        'drink_invitation_events',
        'tip_allocations'
      )
      and class.relrowsecurity
      and class.relforcerowsecurity
  ),
  9::bigint,
  'Todas las tablas nuevas activan y fuerzan RLS.'
);

select col_default_is('public', 'tenant_checkout_engagement_settings',
  'upsell_enabled', 'false', 'Upsell nace apagado.');
select col_default_is('public', 'tenant_checkout_engagement_settings',
  'invitations_enabled', 'false', 'Invitaciones nacen apagadas.');
select col_default_is('public', 'tenant_checkout_engagement_settings',
  'promotions_enabled', 'false', 'Happy hour nace apagado.');
select col_default_is('public', 'tenant_checkout_engagement_settings',
  'waiter_tip_enabled', 'false', 'Propina por garzón nace apagada.');
select col_default_is('public', 'tenant_checkout_engagement_settings',
  'invitation_claim_ttl_minutes', '60',
  'La invitación espera 60 minutos por defecto.');

select has_column('public', 'checkout_quotes', 'promotion_discount_clp',
  'El quote congela el descuento promocional.');
select has_column('public', 'checkout_quotes', 'upsell_incremental_clp',
  'El quote congela el ingreso atribuible al upsell.');
select has_column('public', 'checkout_quotes', 'tip_recipient_employee_id',
  'El quote congela al trabajador elegido.');
select has_column('public', 'checkout_quotes', 'tip_recipient_employee_session_id',
  'El quote congela también su turno.');
select has_column('public', 'checkout_quote_items', 'promotion_version_id',
  'Cada línea sabe qué versión fijó su precio.');
select has_column('public', 'checkout_quote_items', 'is_upsell',
  'Cada línea distingue un upsell aceptado.');
select has_column('public', 'checkout_quote_items', 'invitation_target_table_session_id',
  'La mesa de entrega está congelada en la línea.');
select has_column('public', 'orders', 'promotion_discount_clp',
  'El pedido conserva el descuento del quote.');
select has_column('public', 'orders', 'tip_recipient_employee_id',
  'El pedido conserva el trabajador sin reasignarlo.');
select has_column('public', 'drink_invitations', 'source_order_item_id',
  'La invitación apunta al ítem financiero que la pagó.');
select has_column('public', 'cashier_shift_closures', 'promotion_discount_clp',
  'El cierre separa los descuentos promocionales.');
select has_column('public', 'cashier_shift_closures', 'upsell_sales_clp',
  'El cierre separa el ingreso de upsell.');

select has_function('private', 'cancel_drink_invitation',
  array['uuid','uuid','uuid','timestamp with time zone'],
  'El pagador puede cancelar una invitación sin reclamar.');
select has_function('private', 'claim_drink_invitation',
  array['uuid','uuid','uuid','timestamp with time zone'],
  'Reclamar valida la mesa destino en servidor.');
select has_view('public', 'owner_checkout_engagement_metrics',
  'El dueño ve aceptación e ingreso atribuible.');
select has_view('public', 'cashier_tip_allocation_summary',
  'Caja informa propina por trabajador, turno y medio.');
select has_trigger(
  'public', 'cashier_refund_actions',
  'cashier_refund_actions_capture_tip_recipient',
  'El reembolso se enlaza al trabajador congelado.'
);
select has_trigger(
  'public', 'tip_allocation_refund_adjustments',
  'tip_allocation_refund_adjustments_immutable',
  'La política laboral aplicada queda como evidencia inmutable.'
);

select has_trigger(
  'public', 'promotion_versions', 'promotion_versions_immutable',
  'Una versión promocional no puede reescribirse.'
);
select has_trigger(
  'public', 'checkout_quote_items',
  'checkout_quote_items_validate_invitation_target',
  'Una mesa cerrada o ajena no puede recibir la invitación.'
);
select has_trigger(
  'public', 'drink_invitations',
  'drink_invitations_enforce_limit',
  'El límite antiabuso se aplica aunque el cliente intente saltarse la interfaz.'
);
select has_function(
  'private', 'expire_due_drink_invitations',
  array['integer','timestamp with time zone'],
  'El vencimiento durable inicia el reembolso sin producir una comanda.'
);

select * from finish();
rollback;
