begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

select has_table('public', 'tenant_stored_value_settings',
  'Existe configuración de saldo por tenant.');
select has_table('public', 'stored_value_accounts',
  'Cada identidad tiene una cuenta separada por tenant.');
select has_table('public', 'stored_value_topup_quotes',
  'La recarga conserva su CheckoutQuote inmutable.');
select has_table('public', 'stored_value_lots',
  'Dinero y bono viven en lotes separados.');
select has_table('public', 'stored_value_ledger_entries',
  'Existe un libro financiero append-only.');
select has_table('public', 'stored_value_quote_allocations',
  'El quote congela la política y los lotes usados.');
select has_table('public', 'stored_value_topup_receipts',
  'Una confirmación server-side deja comprobante.');
select has_table('public', 'stored_value_topup_refunds',
  'La devolución de recarga no consumida queda auditada.');
select has_table('public', 'stored_value_manual_adjustments',
  'Caja puede ajustar sólo con evidencia separada.');
select has_table('public', 'stored_value_expiry_notifications',
  'Los avisos de vencimiento son durables.');

select col_default_is(
  'public', 'tenant_stored_value_settings', 'enabled', 'false',
  'La función nace apagada.'
);
select col_default_is(
  'public', 'tenant_stored_value_settings', 'production_validated', 'false',
  'Producción nace bloqueada.'
);
select col_default_is(
  'public', 'tenant_stored_value_settings', 'max_consumer_balance_clp',
  '40000', 'El tope conservador por persona es 40.000 CLP.'
);
select col_default_is(
  'public', 'tenant_stored_value_settings', 'consumption_order',
  'bonus_first_fefo',
  'El bono se consume primero y cada componente usa FEFO.'
);
select col_default_is(
  'public', 'tenant_stored_value_settings', 'expiry_warning_days',
  '7', 'Se avisa antes de vencer.'
);
select col_default_is(
  'public', 'tenant_stored_value_settings', 'legal_tax_hypothesis',
  'true', 'La regla legal queda marcada como hipótesis.'
);
select has_column(
  'public', 'tenant_stored_value_settings', 'max_venue_liability_clp',
  'El dueño puede limitar el pasivo total.'
);
select has_column(
  'public', 'tenant_stored_value_settings', 'superadmin_alert_threshold_clp',
  'Tablio configura un umbral de alerta de pasivo.'
);
select has_column(
  'public', 'orders', 'stored_value_applied_clp',
  'El pedido congela cuánto saldo consumió.'
);
select has_column(
  'public', 'orders', 'external_payment_clp',
  'El pedido separa el pago externo.'
);
select has_column(
  'public', 'orders', 'stored_value_policy_version',
  'El pedido conserva la versión de política.'
);
select has_column(
  'public', 'cashier_shift_closures', 'stored_value_topups_cash_in_clp',
  'El cierre separa recargas como entrada de caja.'
);
select has_column(
  'public', 'cashier_shift_closures', 'stored_value_consumed_revenue_clp',
  'El cierre separa saldo consumido como venta.'
);
select has_column(
  'public', 'cashier_shift_closures', 'stored_value_liability_clp',
  'El cierre muestra el pasivo pendiente.'
);

select has_view('public', 'stored_value_account_balances',
  'El saldo se deriva del ledger y no de un campo mutable.');
select has_view('public', 'tenant_stored_value_liabilities',
  'El pasivo total del local es visible.');
select has_view('public', 'owner_stored_value_metrics',
  'El dueño ve recargas, consumo y expiraciones por separado.');
select has_function(
  'public', 'superadmin_stored_value_liabilities', array[]::text[],
  'Superadmin obtiene pasivo por tenant mediante RPC autenticado.'
);
select has_function(
  'public', 'superadmin_set_stored_value_alert_threshold',
  array['uuid','bigint','text'],
  'Superadmin configura el umbral con motivo.'
);
select has_function(
  'private', 'reserve_stored_value_for_quote',
  array['uuid','uuid','uuid','bigint','timestamp with time zone'],
  'La reserva de saldo ocurre en servidor.'
);
select has_function(
  'private', 'external_payment_due', array['uuid','uuid'],
  'La pasarela cobra sólo la diferencia congelada.'
);
select has_function(
  'private', 'confirm_stored_value_topup',
  array['uuid','uuid','uuid','uuid','timestamp with time zone'],
  'Sólo la confirmación server-side acredita una recarga.'
);
select has_function(
  'private', 'restore_stored_value_for_order',
  array['uuid','uuid','uuid','bigint','text','timestamp with time zone'],
  'El reembolso de pedido restaura el componente original.'
);
select has_function(
  'private', 'apply_stored_value_topup_refund',
  array['uuid','uuid','uuid','uuid','text','text','timestamp with time zone'],
  'Una recarga intacta puede devolverse sin borrar el ledger.'
);

select has_trigger(
  'public', 'stored_value_ledger_entries',
  'stored_value_ledger_entries_immutable',
  'El ledger no permite reescribir ni borrar movimientos.'
);
select has_trigger(
  'public', 'stored_value_lots', 'stored_value_lots_immutable',
  'Los lotes de origen son evidencia inmutable.'
);
select has_trigger(
  'public', 'orders', 'orders_snapshot_stored_value',
  'El pedido copia la mezcla antes de insertarse.'
);
select has_trigger(
  'public', 'orders', 'orders_consume_stored_value',
  'Confirmar el pedido consume el ledger una sola vez.'
);
select has_trigger(
  'public', 'tenants', 'tenants_block_delete_with_stored_value',
  'No se elimina un tenant con plata de clientes pendiente.'
);
select has_trigger(
  'public', 'cashier_shift_closures',
  'cashier_shift_closures_stored_value_snapshot',
  'El cierre congela recargas, consumo y pasivo en columnas separadas.'
);

select is(
  (
    select count(*)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'tenant_stored_value_settings',
        'stored_value_accounts',
        'stored_value_topup_quotes',
        'stored_value_lots',
        'stored_value_ledger_entries',
        'stored_value_quote_allocations',
        'stored_value_topup_receipts',
        'stored_value_topup_refunds',
        'stored_value_manual_adjustments',
        'stored_value_expiry_notifications'
      )
      and class.relrowsecurity
      and class.relforcerowsecurity
  ),
  10::bigint,
  'Todas las tablas nuevas activan y fuerzan RLS.'
);
select policies_are(
  'public', 'stored_value_ledger_entries',
  array['stored_value_ledger_staff_select'],
  'El ledger sólo expone lectura tenant-scoped.'
);
select policies_are(
  'public', 'stored_value_accounts',
  array['stored_value_accounts_staff_select'],
  'Las cuentas sólo exponen lectura tenant-scoped.'
);
select policies_are(
  'public', 'tenant_stored_value_settings',
  array[
    'stored_value_settings_staff_insert',
    'stored_value_settings_staff_select',
    'stored_value_settings_staff_update'
  ],
  'Sólo roles autorizados administran la configuración.'
);

select col_is_fk(
  'public', 'stored_value_accounts',
  array['tenant_id','diner_profile_id']::name[],
  'La cuenta pertenece a una identidad recuperable.'
);
select col_is_fk(
  'public', 'stored_value_ledger_entries',
  array['tenant_id','stored_value_lot_id']::name[],
  'Cada movimiento conserva el lote exacto.'
);
select col_is_fk(
  'public', 'stored_value_topup_receipts',
  array['tenant_id','provider_payment_event_id']::name[],
  'La recarga apunta a evidencia firmada del proveedor.'
);
select col_is_fk(
  'public', 'stored_value_topup_refunds',
  array['tenant_id','refund_id']::name[],
  'La devolución apunta al reembolso financiero real.'
);

select finish();
rollback;
