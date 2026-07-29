begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

-- Intenta cerrar el sprint sin persistencia durable; si falla, una caída
-- podría borrar la obligación tributaria o su historial.
select has_table('public', 'tenant_tax_settings', 'tenant tax settings exist');
select has_table('public', 'tax_sale_records', 'tax sale records exist');
select has_table('public', 'tax_documents', 'tax documents exist');
select has_table('public', 'tax_document_attempts', 'tax attempts exist');
select has_table('private', 'tax_provider_credentials', 'vault references exist');

-- Intenta guardar credenciales en una tabla pública; si falla, una ruta de
-- usuario podría leer la llave del proveedor DTE.
select ok(
  not has_table_privilege('authenticated', 'private.tax_provider_credentials', 'SELECT'),
  'authenticated cannot read DTE credential references'
);
select has_column(
  'private', 'tax_provider_credentials', 'vault_secret_id',
  'credentials point to Supabase Vault'
);

-- Intenta emitir dos respaldos por el mismo hecho; si falla, una entrega
-- repetida podría duplicar boleta o nota de crédito.
select has_index(
  'public', 'tax_documents', 'tax_documents_one_receipt_per_sale_idx',
  'one receipt per sale is enforced'
);
select has_index(
  'public', 'tax_documents', 'tax_documents_one_credit_note_per_refund_idx',
  'one credit note per refund is enforced'
);
select ok(
  exists (
    select 1 from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.tax_documents'::regclass
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid) like '%idempotency_key%'
  ),
  'provider idempotency key is unique per tenant'
);

-- Intenta dejar una tabla tributaria fuera de RLS; si falla, un local podría
-- ver boletas, folios o errores de otro local.
select is(
  (
    select count(*) from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'tenant_tax_settings', 'tax_sale_records',
        'tax_documents', 'tax_document_attempts'
      )
      and class.relrowsecurity and class.relforcerowsecurity
  ),
  4::bigint,
  'all public tax tables enable and force RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.tax_documents', 'INSERT'),
  'authenticated cannot forge a tax document'
);
select ok(
  not has_table_privilege('authenticated', 'public.tax_documents', 'UPDATE'),
  'authenticated cannot mark a receipt issued'
);
select ok(
  not has_table_privilege('anon', 'public.tax_documents', 'SELECT'),
  'anonymous diner cannot scan tenant tax records'
);

-- Intenta ocultar una caída hasta el cierre; si falla, caja no sabría que se
-- acumulan boletas o que el proveedor tiene una tasa alta de fallos.
select has_view(
  'public', 'cashier_tax_provider_health',
  'cashier provider health view exists'
);
select ok(
  coalesce(
    (
      select 'security_invoker=true' = any(class.reloptions)
      from pg_class class
      where class.oid = 'public.cashier_tax_provider_health'::regclass
    ),
    false
  ),
  'provider health view invokes caller RLS'
);
select has_column(
  'public', 'tenant_tax_settings', 'pending_alert_count',
  'pending volume alert is configurable'
);
select has_column(
  'public', 'tenant_tax_settings', 'pending_alert_age_seconds',
  'pending age alert is configurable'
);
select col_default_is(
  'public', 'tenant_tax_settings', 'pending_alert_count', '10',
  'default alert begins above ten pending documents'
);
select col_default_is(
  'public', 'tenant_tax_settings', 'pending_alert_age_seconds', '900',
  'default age alert begins at fifteen minutes'
);

-- Intenta bloquear la devolución del dinero por una nota de crédito; si
-- falla, el reembolso no tendría su mensaje durable independiente.
select has_trigger(
  'public', 'refunds', 'refunds_enqueue_tax_credit_note',
  'refund creates a separate durable tax obligation'
);
select has_function(
  'private', 'prepare_tax_credit_note', array['uuid'],
  'credit note preparation is a worker operation'
);
select ok(
  not has_function_privilege(
    'authenticated', 'private.prepare_tax_credit_note(uuid)', 'EXECUTE'
  ),
  'user routes cannot run the service-role tax consumer'
);
select has_function(
  'private',
  'add_reconciliation_exception',
  array[
    'uuid', 'uuid', 'uuid', 'text', 'text', 'text',
    'boolean', 'text', 'text[]', 'jsonb'
  ],
  'Sprint 7 exception helper supplies settlement and cashier visibility'
);

-- Intenta reintentar sin permiso o sin auditoría; si falla, caja podría
-- duplicar documentos sin dejar quién y por qué.
select has_function(
  'public', 'retry_tax_document', array['uuid', 'text'],
  'cashier has a narrow audited retry RPC'
);
select ok(
  not has_function_privilege(
    'anon', 'public.retry_tax_document(uuid,text)', 'EXECUTE'
  ),
  'anonymous users cannot retry DTE emission'
);

-- Intenta dejar la tercera columna como placeholder; si falla, conciliación
-- no podría explicar venta, pasarela y respaldo tributario juntos.
select has_column(
  'public', 'cashier_reconciliation_trace', 'tax_document_id',
  'reconciliation includes the tax document'
);

-- Intenta dejar el adaptador sin un camino durable ejecutable. Si falla, la
-- boleta existiría sólo en la demo visual y un reinicio perdería el trabajo.
select has_table('pgmq', 'q_tax_documents', 'dedicated DTE queue exists');
select has_table('pgmq', 'q_tax_documents_dlq', 'dedicated DTE DLQ exists');
select has_function(
  'public',
  'worker_read_tax_messages',
  array['integer', 'integer'],
  'DTE worker can lease queue messages'
);
select has_function(
  'public',
  'worker_prepare_tax_order',
  array['uuid'],
  'DTE worker can prepare the sale obligation'
);
select has_function(
  'public',
  'worker_record_tax_result',
  array[
    'uuid', 'text', 'text', 'text', 'text',
    'text', 'text', 'text', 'integer'
  ],
  'DTE worker records provider outcome durably'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.worker_read_tax_messages(integer,integer)',
    'EXECUTE'
  ),
  'user routes cannot consume the DTE queue'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.worker_read_tax_messages(integer,integer)',
    'EXECUTE'
  ),
  'only the trusted service worker can consume the DTE queue'
);

-- Intenta dejar el consumidor como un proceso manual; si falla, las boletas
-- podrían quedar pendientes hasta que alguien recuerde ejecutar el worker.
select has_table(
  'private', 'tax_worker_runtime',
  'cron runtime stores only Vault references'
);
select ok(
  exists (select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron is installed for automatic DTE consumption'
);
select ok(
  exists (select 1 from pg_extension where extname = 'pg_net'),
  'pg_net is installed for authenticated Edge invocation'
);
select has_function(
  'private', 'invoke_tax_document_consumer', array[]::text[],
  'database can invoke the DTE Edge worker'
);
select has_function(
  'private', 'configure_tax_worker_schedule', array['text', 'text'],
  'DTE cron can be configured without storing plaintext keys'
);
select has_function(
  'public', 'worker_validate_tax_cron_secret', array['text'],
  'Edge worker has a narrow second-factor validator'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.worker_validate_tax_cron_secret(text)',
    'EXECUTE'
  ),
  'user routes cannot validate or probe the cron secret'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.worker_validate_tax_cron_secret(text)',
    'EXECUTE'
  ),
  'only the trusted worker can validate the cron secret'
);
select ok(
  not has_table_privilege(
    'service_role', 'private.tax_worker_runtime', 'SELECT'
  ),
  'even service role cannot read the stored Vault references directly'
);

select * from finish();
rollback;
