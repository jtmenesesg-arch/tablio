# Modelo de datos

- **Estado:** fundación multi-tenant, núcleo financiero, operación, tributación, onboarding,
  billing SaaS, crédito de mesa y panel del dueño versionados, aplicados y endurecidos en
  Sprint 10
- **Migración base:** `20260727223243_foundation_multi_tenant.sql`
- **Verificación remota verde:** `20260727224600_verify_tenant_isolation.sql`
- **Hardening:** `20260728035137_harden_auth_and_advisor_findings.sql` y
  `20260728035253_explicit_private_context_deny_policy.sql`
- **Suite repetible:** `supabase/tests/database/001_tenant_isolation.test.sql`
- **Núcleo financiero:** `20260728064954_sprint_02_financial_core.sql` y migraciones de
  hardening `20260728065005`, `20260728065130`, `20260728065508`, `20260728070001`
- **Suite financiera:** `supabase/tests/database/002_financial_core.test.sql` (`1..33` verde)
- **PWA comensal:** `20260728212726_sprint_03_diner_pwa.sql` y
  `20260728212851_sprint_03_advisor_fixes.sql`
- **Suite PWA:** `supabase/tests/database/003_diner_pwa.test.sql` (`1..17`)
- **Panel del garzón:** `20260728225129_sprint_05_waiter_operations.sql`, corrección de
  funciones `20260729024401_sprint_05_runtime_fixes.sql` y hardening de Advisors
  `20260729030817_sprint_05_advisor_fixes.sql`
- **Suite del garzón:** `supabase/tests/database/005_waiter_operations.test.sql` (`1..31`
  verde en el proyecto remoto, ejecutada dentro de una transacción con rollback)
- **Tributación:** `20260729041026_sprint_07_tax_documents.sql` y hardening de índices
  `20260729042449_sprint_07_advisor_fixes.sql`, más corrección de carrera
  `20260729043100_sprint_07_runtime_fixes.sql` y cola/consumidor
  `20260729043804_sprint_07_tax_queue_consumer.sql`
- **Suite tributaria:** `supabase/tests/database/007_tax_documents.test.sql` (`1..43` verde
  en el proyecto remoto, ejecutada dentro de una transacción con rollback)
- **Onboarding y SaaS:** migraciones `20260729163957`, `20260729164321`,
  `20260729164723`, `20260729165547` y `20260729165625`
- **Suite Sprint 8:** `supabase/tests/database/008_onboarding_billing_superadmin.test.sql`
  (`1..51` verde en el proyecto remoto, con rollback)
- **Crédito y dueño:** migraciones `20260729172848` a `20260729175502`
- **Suite Sprint 9:** `supabase/tests/database/009_table_credit_owner.test.sql`
  (`1..51` verde en el proyecto remoto, con rollback)
- **Hardening Sprint 10:** `supabase/tests/database/010_sprint_10_hardening.test.sql`
  (`1..5` verde con 96 filas por tenant); suites 001–010: 316/316.

Sprint 10 no agregó ni alteró tablas. Verificó el modelo aplicado mediante el control negativo
RLS rojo → rollback → verde, una prueba masiva de aislamiento/fail-closed y carga/caos sobre
los flujos existentes. La policy insegura temporal nunca se confirmó en la base.

## Convenciones obligatorias

- UUID como identificador público no predecible.
- `tenant_id UUID NOT NULL` en toda tabla de negocio.
- `created_at` y `updated_at` en UTC; eventos/auditoría son append-only.
- Claves foráneas compuestas por `tenant_id` cuando unen datos de negocio.
- RLS habilitado y políticas explícitas `USING` + `WITH CHECK`.
- Contexto de tenant ausente o inválido falla cerrado.
- Borrado lógico cuando eliminar afectaría trazabilidad financiera u operativa.
- Configuración flexible con columnas tipadas para invariantes y JSONB solo para extensiones
  que no deban consultarse como regla central.

## Esqueleto multi-tenant de Sprint 0

### `tenants`

Local/empresa cliente y frontera principal de aislamiento.

Campos iniciales: `id`, `legal_name`, `display_name`, `slug`, `status`, `plan_code`,
`venue_type`, `timezone`, `currency`, `settings`, `onboarding_status`, timestamps.

Reglas: `slug` único; estado y tipo validados; ninguna credencial de pasarela en texto plano.

### `venues`

Sede física perteneciente a un tenant. Aunque el primer cliente tenga una sede, separar venue
permite dueño multi-local.

Campos: `id`, `tenant_id`, `code`, `name`, `address`, `timezone`, `service_modes`,
`active`, `onboarding_status`, `settings`, timestamps.

### `zones`

Zona configurable de un venue: terraza, salón, barra u otra.

Campos: `id`, `tenant_id`, `venue_id`, `name`, `code`, `zone_type`, `capacity`, `sort_order`,
`active`, `plan_countable`, `settings`, timestamps.

Regla aplicada: `UNIQUE (tenant_id, venue_id, code)`.

### `tables`

Punto físico operable, sin significado de cuenta financiera.

Campos: `id`, `tenant_id`, `venue_id`, `zone_id`, `table_number`, `display_name`, `capacity`,
`service_mode`, `qr_token_hash`, `qr_version`, `qr_active`, `presence_mode`,
`presence_code_hash`, `presence_code_expires_at`, `active`, `plan_countable`, `settings`,
timestamps.

Reglas:

- `UNIQUE (tenant_id, table_number)`.
- QR aleatorio, versionado y revocable; se guarda hash, no token reutilizable en claro.
- El código corto pertenece a una sesión/rotación, no es contraseña permanente.

### `stations`

Destino configurable de producción: barra, cocina, café u otro.

Campos: `id`, `tenant_id`, `venue_id`, `name`, `code`, `station_type`, `routing_config`,
`active`, `plan_countable`, `settings`, timestamps.

Regla aplicada: `UNIQUE (tenant_id, venue_id, code)`.

### `employees`

Persona que trabaja para el tenant.

Campos: `id`, `tenant_id`, `auth_user_id` opcional, `display_name`, `status`,
`employee_pin_hash`, `settings`, timestamps.

Regla congelada: `UNIQUE (tenant_id, employee_pin_hash)`. Nunca se guarda el PIN en claro.

### `roles`, `permissions`, `role_permissions`, `employee_roles`

Modelo RBAC para los seis perfiles del brief:

1. comensal;
2. garzón;
3. KDS;
4. cajero/admin;
5. dueño;
6. superadmin.

Los permisos son acciones concretas; los roles agrupan permisos. `employee_roles` siempre
incluye `tenant_id` salvo el rol de plataforma, que usa un camino separado y auditado.

### `tenant_memberships`

Fuente de verdad para relacionar una identidad autenticada con tenants y permisos vigentes.

Campos: `tenant_id`, `user_id`, `employee_id` opcional, `role_code`, `status`, timestamps.

Regla aplicada: `PRIMARY KEY (tenant_id, user_id)`.

### `private.user_tenant_context`

Selecciona un único tenant activo por usuario autenticado. Vive en esquema privado y no se
expone por PostgREST.

Campos: `user_id`, `tenant_id`, `updated_at`.

Una RPC `set_active_tenant(p_tenant_id)` solo actualiza la fila si `auth.uid()` posee membresía
activa. Luego el cliente refresca la sesión.

### Custom Access Token Hook

Antes de emitir/refrescar un JWT, `custom_access_token_hook(event)` consulta
`private.user_tenant_context` y la membresía vigente:

- si ambas coinciden, agrega `tenant_id` a los claims;
- si no existe contexto o la membresía está inactiva, elimina el claim;
- nunca acepta `tenant_id` desde `user_metadata` o un header del navegador.

RLS usa el claim como selección activa y la tabla de membresías como autorización actual.

### `audit_log`

Registro append-only de acciones sensibles.

Campos: `id`, `tenant_id`, `actor_type`, `actor_user_id`, `actor_employee_id`, `action`,
`target_type`, `target_id`, `reason`, `before_data`, `after_data`, `request_id`, `occurred_at`.

No se permite update/delete desde roles normales. Reembolso, anulación, cambio de precio,
cierre, reapertura e impersonación siempre producen entrada.

## Núcleo financiero implementado en Sprint 2

### Catálogo e inventario

- `products` y `product_variants` guardan precio CLP entero, impuesto, estación y activación.
- `products.track_stock` decide si se controla por unidades; vale `false` por defecto.
- `inventory_levels` separa `on_hand_quantity` y `reserved_quantity`.
- `tenant_checkout_settings.quote_ttl_seconds` vale 600 por defecto y admite 300–1200.

### Sesión, carrito y quote

- `table_sessions`: `ACTIVE → PAUSED → CLOSED | EXPIRED`.
- `carts`: uno por dispositivo/persona; `OPEN → CHECKOUT_STARTED → EXPIRED |
CONVERTED_TO_ORDER`.
- `cart_items`: selección mutable previa al checkout.
- `checkout_quotes` y `checkout_quote_items`: snapshot inmutable de tenant, mesa, persona,
  ítems, variantes, estaciones, precios, descuentos, impuesto, propina, total y expiración.
- `inventory_reservations`: sólo existe para snapshots con stock controlado. No tiene TTL:
  utiliza exclusivamente `checkout_quotes.expires_at`.

El quote inicial vive 10 minutos. Rechazo, cancelación o abandono libera al instante; el
barrido sólo atiende expiración silenciosa. Ver ADR-002.

### Evidencia de pago y pedido

- `payment_intents` más `payment_intent_events`: intento y máquina de estados append-only.
- `payments`: identidad estable; su estado se deriva en `payment_current_status`.
- `provider_payment_events`: evidencia inmutable, incluso si es duplicada, tardía o inválida.
- `orders`/`order_items`: sólo una función transaccional privilegiada puede crearlos tras una
  aprobación firmada y consultada server-side.
- `order_state_events`: historia separada del estado operativo actual.
- `tickets`/`ticket_items`/`ticket_state_events`: una comanda por estación, creada en la misma
  transacción del pedido.

Una restricción/trigger impide insertar un pedido confirmado sin evento aprobado,
`signature_verified = true`, `server_verified = true`, quote, monto y moneda coincidentes.

### Reembolsos y conciliación

- `refunds`: total/parcial e idempotente por tenant.
- `chargebacks`, `settlements`, `provider_fees`.
- `reconciliation_exceptions`: diferencia idempotente y accionable.
- `cashier_attention_queue`: vista RLS de excepciones abiertas. Un pago aprobado después del
  vencimiento aparece crítico con “requiere decisión: reembolsar o producir manualmente”.

### Durabilidad

- `outbox_messages` se escribe junto con el pedido.
- `processed_events` da lease y deduplicación a cada consumidor.
- `outbox_delivery_attempts` conserva intentos y replays.
- `durable_effect_receipts` conserva el efecto externo idempotente.
- PGMQ contiene `financial_effects` y `financial_effects_dlq`.

El reintento usa la tabla aprobada de ADR-000 (5 s, 15 s, 45 s, 2 min, 5 min, 15 min, 30 min,
60 min) con full jitter, ocho intentos por defecto y DLQ. Un replay exige razón y produce
`audit_log`.

## Boleta electrónica implementada en Sprint 7

- `tenant_tax_settings`: modo, emisor, proveedor y umbrales de alerta/salud por tenant.
- `private.tax_provider_credentials`: sólo referencia un secreto cifrado en Supabase Vault;
  no expone credenciales a rutas de usuario.
- `tax_sale_records`: congela por venta el modo, medio de pago, respaldo esperado y monto.
- `tax_documents`: obligación idempotente de boleta o nota de crédito, folio, URL/timbre,
  estado, error y reintentos.
- `tax_document_attempts`: historial append-only para auditoría y salud reciente.
- PGMQ `tax_documents` y `tax_documents_dlq`: cola y bandeja de fallos dedicadas, sin competir
  con impresión/KDS.
- `cashier_tax_provider_health`: vista `security_invoker` con volumen, antigüedad y tasa de
  fallos.
- `cashier_reconciliation_trace`: ahora une Tablio, pasarela/liquidación y documento
  tributario.

Una venta tiene como máximo una boleta DTE y cada reembolso una nota de crédito mediante
índices únicos. El reembolso monetario no llama al proveedor DTE: escribe una obligación de
outbox separada. Si falta la boleta original, la nota queda pendiente y visible sin revertir
la devolución del cliente.

Las cuatro tablas públicas nuevas tienen `tenant_id`, RLS habilitado y forzado. `authenticated`
sólo lee con `tax.read`; no puede insertar ni marcar documentos emitidos. Preparar y registrar
resultados pertenece a consumidores `service_role`. El reintento manual usa una RPC estrecha
con `tax.retry`, motivo y `audit_log`.

`supabase/functions/tax-document-consumer` está desplegada con verificación JWT. `pg_cron`
la invoca cada minuto mediante `pg_net`, combinando el JWT público del proyecto con un segundo
secreto aleatorio cifrado en Vault. La función valida ese secreto y usa `service_role` sólo
internamente. Encola outbox pendiente, toma mensajes con visibility timeout, reclama
`ProcessedEvent`, prepara la obligación, invoca el adaptador simulado y registra resultado
antes del ACK. Las fallas usan el backoff común, DLQ dedicada y replay auditado.

`private.tax_worker_runtime` guarda exclusivamente referencias a Vault, nunca claves en
texto plano. Ni usuarios autenticados ni `service_role` pueden leer la tabla directamente;
el worker sólo dispone de un RPC estrecho que responde si el segundo factor coincide.

## PWA del comensal implementada en Sprint 3

### Catálogo configurable

- `menu_categories`: categorías por tenant y venue, ordenables, activables y preparadas para
  traducciones ES/EN.
- `products` incorpora categoría, imagen, texto alternativo, alérgenos, traducciones y
  disponibilidad operativa. No se fija una carta de bar en el esquema.
- `cart_items.customer_note` limita la nota libre a 140 caracteres y la congela dentro de
  `checkout_quote_items.selected_modifiers`.

### Sesión anónima por dispositivo

`diner_device_sessions` enlaza un teléfono con una sesión de mesa después de validar QR y
código de presencia. Guarda hash SHA-256 del token, no el token en claro.

- vencimiento por inactividad: 4 horas por defecto;
- máximo absoluto: 12 horas por defecto;
- el vencimiento de inactividad se renueva sin superar el máximo;
- cerrar/expirar la sesión de mesa invalida la sesión de dispositivo;
- alias único entre sesiones activas de la misma mesa;
- nombre o apodo opcional, máximo 60 caracteres.

`tenant_diner_settings` permite configurar idioma y sugerencias de propina; conserva los
valores aprobados 4 h/12 h como defaults.

`carts.diner_device_session_id` hace explícito que dos teléfonos de una misma mesa no comparten
carrito.

### Identidad congelada y entrega

Al crear el quote, un trigger copia `diner_device_session_id`, alias y nombre opcional. Al
confirmar, otro trigger copia esa identidad al pedido. `orders.order_number` entrega el número
humano que acompaña al alias/nombre hacia KDS y garzón.

La identidad del quote/pedido no cambia aunque la sesión edite el nombre después.

### Acciones y pago con garzón

- `service_action_types`: acciones configurables por venue, icono, orden y cooldown.
- `diner_service_requests`: solicitud deduplicada y estados notificado, visto, completado o
  cancelado.

- `diner_waiter_payment_requests`: aviso separado para pagar con el garzón.

La última tabla no contiene `order_id` ni `ticket_id`. Insertarla no ejecuta la transacción de
confirmación: no existe pedido ni comanda hasta comprobar el pago.

### Acceso y Realtime

Las seis tablas nuevas tienen `tenant_id`, RLS habilitado y forzado. `anon` no recibe acceso
directo a hashes de sesión, quotes, pagos, pedidos o comandas. El personal autenticado usa los
permisos `catalog.*` y `orders.*`; las operaciones del dispositivo pasan por una frontera
server-side estrecha.

Categorías, disponibilidad y solicitudes están publicadas para avisos Realtime. El diseño de
producción usa Broadcast privado y vuelve a consultar PostgreSQL al recibir un aviso o
reconectar. Ver ADR-003.

## KDS, métricas e impresión implementados en Sprint 4

### Configuración y presencia operativa

- `tenant_kds_settings`: umbrales verde/ámbar/crítico, sonidos, reconciliación de respaldo,
  advertencia de pantalla desactualizada y timeout de presencia. Los defaults son 45 s, 75 s y
  30 s respectivamente, pero cada tenant puede cambiarlos.
- `kds_clients`: heartbeat durable por tenant, local y estación. Una estación nula representa
  la vista “Todas”.

Al confirmar el pago, el trigger de la comanda consulta `kds_clients` con el timeout del tenant
y congela en `kds_delivery_metrics.kds_connected_at_confirmation` si había al menos una
pantalla viva para la estación. Una tablet encendida después no convierte espera operativa en
latencia del sistema.

### Comandas y concurrencia

`tickets.state_version` aumenta con cada transición. `transition_ticket` recibe estado
esperado y versión esperada: una de dos pantallas concurrentes gana; la segunda recibe
conflicto, recarga PostgreSQL y no sobrescribe trabajo. Las transiciones siguen:

```text
QUEUED → ACKNOWLEDGED → IN_PREPARATION → READY → COMPLETED
```

READY crea, con idempotencia, los avisos durables para garzón y comensal. Las comandas de un
mismo pedido mantienen filas y versiones independientes.

### Latencia confirmación → primera visibilidad

`kds_delivery_metrics` guarda reloj de confirmación, presencia en ese instante y primera
visibilidad confirmada por el KDS. La RPC usa reloj de PostgreSQL para evitar diferencias de
hora entre tablet y servidor. `kds_latency_summary` calcula p50/p95/p99 sólo con
`kds_connected_at_confirmation = true` y presenta por separado:

- muestras conectadas aún no visibles;
- confirmaciones sin KDS conectado;
- muestras conectadas ya visibles.

La prueba de laboratorio de Sprint 4 obtuvo p50 64 ms, p95 103 ms y p99 105 ms en 12 muestras
conectadas, más 1 caso sin KDS conectado excluido.

### Agotados

`set_product_availability` cambia disponibilidad bajo RLS, registra actor/motivo en auditoría
y emite invalidación. Una reserva de quote ya existente conserva prioridad; nuevas personas
no pueden agregar el producto agotado.

### Spool persistente

- `printer_endpoints`: impresora lógica y configuración por estación.
- `print_jobs`: trabajo durable, idempotencia, estado, reintentos, DLQ y vínculo de reimpresión.
- `print_attempts`: cada intento y resultado.

`private.materialize_print_jobs` sólo es ejecutable por `service_role` y convierte el outbox
de impresión en spool idempotente. `PrinterPort` mantiene el transporte físico reemplazable;
el adaptador actual es un stub. Elegir agente local, servicio administrado o impresora cloud
sigue abierto en OI-005.

## Tablas todavía previstas

| Dominio          | Entidades principales                              |
| ---------------- | -------------------------------------------------- |
| Sesión/presencia | `presence_code_rotations`, historial de revocación |
| Catálogo         | `modifiers`, historiales de precio                 |
| Propina          | `tips`, `tip_allocations`                          |
| Tributación      | `tax_documents`, `tax_document_attempts`           |

## Defensa contra referencias cruzadas

Además de RLS, cada tabla padre expone una clave única `(tenant_id, id)` y las relaciones de
negocio usan foreign keys compuestas:

```sql
foreign key (tenant_id, zone_id)
  references zones (tenant_id, id)
```

Así PostgreSQL rechaza una mesa del tenant A enlazada accidentalmente a una zona del tenant B,
incluso desde código privilegiado.

## Política RLS

| Identidad            | Lectura/escritura permitida                                              |
| -------------------- | ------------------------------------------------------------------------ |
| Comensal anónimo     | Solo datos mínimos asociados a su sesión de mesa validada                |
| Personal autenticado | Filas de tenants con membresía activa y permiso explícito                |
| KDS                  | Comandas/estado de sus estaciones; sin permisos financieros de escritura |
| Dueño/admin          | Alcance de su tenant según permisos; nunca otro tenant                   |
| Superadmin           | Camino separado, motivo obligatorio e impersonación auditada             |
| Worker               | Funciones mínimas; tenant derivado del evento persistido                 |

Las requests normales usan el JWT del usuario para mantener RLS activo. La clave privilegiada
no se usa como atajo para operaciones de tenant.

### Propagación concreta y fail-closed

```text
set_active_tenant(validado)
       ↓ refresh JWT
JWT { sub, role=authenticated, tenant_id }
       ↓ cliente Supabase de usuario
RLS: fila.tenant_id = JWT.tenant_id
     AND membership(JWT.sub, JWT.tenant_id) = ACTIVE
```

`private.current_tenant_id()` convierte el claim a UUID de forma segura y retorna `NULL` si
falta o es inválido. Todas las políticas requieren una comparación positiva; `NULL` nunca
abre acceso.

Las operaciones transaccionales llaman `private.require_tenant_context()`. Esta función vuelve
a validar identidad/membresía y ejecuta:

```sql
select set_config('app.current_tenant_id', tenant_id::text, true);
```

El tercer argumento `true` limita el valor a la transacción. No se comparte contexto entre
requests ni conexiones del pool.

### Uso de `service_role`

La secret/service key ignora RLS y por eso no está disponible en `apps/web` ni en Vercel. Solo
workers/jobs separados pueden usarla para consumir colas o ejecutar tareas administrativas.

Un worker:

1. recibe `event_id`, no un tenant libre enviado por cliente;
2. carga el evento/outbox y deriva su `tenant_id`;
3. fija contexto transaccional;
4. llama una RPC mínima o filtra explícitamente todas las operaciones por tenant;
5. depende además de constraints/FKs compuestas e idempotencia.

El pipeline de CI tendrá una prueba de arquitectura que rechaza referencias a
`SUPABASE_SERVICE_ROLE_KEY` o al cliente admin desde rutas de usuario. Las migraciones se
aplican con MCP/conexión administrativa, no con la llave dentro de la aplicación.

## Configuración, onboarding y pricing

`zones`, `tables` y `stations` son colecciones configurables por tenant:

- un tenant puede tener cero o muchas zonas/mesas/estaciones;
- `zone_type`, `station_type`, modos y routing no son enums exclusivos de bar;
- nombres, orden, capacidad, estado y configuración se capturan en onboarding;
- activar/desactivar conserva historial;
- una vista `tenant_size_metrics` cuenta venues, zonas, mesas y estaciones activas.

Estos conteos alimentan clasificación de plan y onboarding. La arquitectura no decide aún los
cortes comerciales; solo garantiza datos confiables para decidirlos.

## Realtime

Los canales son privados y siguen `tenant:<tenant_id>:<recurso>`. El mensaje solo avisa un
cambio; el cliente vuelve a consultar datos bajo RLS. Al reconectar, KDS consulta todas sus
comandas no terminales y reconcilia por versión.

## Storage

Buckets privados y rutas:

```text
<tenant_id>/<tipo-de-recurso>/<identificador>/<archivo>
```

Las políticas de `storage.objects` validan membresía/sesión y el primer segmento de la ruta.

## Verificación obligatoria

- Dos tenants con datos propios.
- Tenant A no ve filas de B.
- Tenant A no actualiza, elimina ni inserta referencias hacia B.
- Constraints compuestos rechazan relaciones cruzadas.
- Una vista o función no puede omitir RLS.
- Superadmin queda auditado.
- La suite de control falla al introducir deliberadamente una política insegura en una base
  efímera.

### Protocolo de control negativo

1. Ejecutar la suite normal con RLS/políticas: debe quedar verde.
2. En una transacción o base efímera, eliminar deliberadamente la policy de lectura de
   `zones`.
3. Crear una policy insegura `USING (true)` para `authenticated`.
4. Ejecutar la misma aserción de tenant A contra datos de B: debe quedar roja.
5. Hacer rollback/restaurar la policy segura.
6. Ejecutar la suite completa otra vez: debe quedar verde.

Se guarda evidencia del error esperado y del resultado restaurado. Si la prueba no se pone roja
con la policy insegura, se considera inválida aunque la ejecución normal sea verde.

### Evidencia de esta entrega

La migración remota de verificación creó dos tenants temporales y comprobó dentro de la base:

- Tenant A vio exactamente una zona, un punto de servicio y una estación propios.
- Tenant A no pudo actualizar una zona de Tenant B.
- Tenant A no pudo insertar una zona para Tenant B.
- Sin `tenant_id` en el JWT, la lectura retornó cero filas y
  `private.require_tenant_context()` rechazó la operación con `42501`.
- La foreign key compuesta rechazó una referencia de Tenant A hacia un venue de Tenant B.
- Los datos temporales fueron eliminados y la migración quedó registrada.

`supabase db lint --linked --schema public,private --level warning --fail-on error` terminó con
`No schema errors found`.

La demostración roja todavía **no está ejecutada**. El archivo
`supabase/tests/negative/tenant_isolation_broken.test.sql` cambia la policy solamente dentro de
una transacción que termina en rollback y reutiliza la misma aserción verde. Se ejecutará en un
ambiente de staging aislado, a más tardar antes del piloto. No se debilitó RLS en el proyecto
actual para obtener esa evidencia.

## Estado de configuración

El Custom Access Token Hook remoto está activo como función PostgreSQL
`public.custom_access_token_hook`. Se verificó el recorrido real con Supabase Auth:

1. un usuario confirmado inició sesión por `/auth/v1/token`;
2. antes de elegir tenant, su JWT no contenía `tenant_id` y RLS devolvió cero zonas;
3. `set_active_tenant` validó la membresía y respondió `204`;
4. un nuevo login emitió un JWT con el `tenant_id` elegido;
5. ese JWT vio una sola zona, la de su tenant, aunque existía una zona de otro tenant;
6. otro usuario sin membresía obtuvo un JWT sin `tenant_id`, leyó cero filas y su insert fue
   rechazado con `403`.

Los logs de Auth registraron `Hook ran successfully` para los tres tokens emitidos. Las dos
cuentas, sus contraseñas, sesiones de prueba y todos los fixtures se eliminaron al terminar.

Los Security Advisors quedaron sin hallazgos. Los hallazgos iniciales sobre funciones
`SECURITY DEFINER` expuestas se corrigieron moviendo la operación privilegiada a `private`,
validando `auth.uid()` y membresía, restringiendo grants y dejando una RPC pública
`SECURITY INVOKER`. `private.user_tenant_context` tiene RLS forzado y una policy de denegación
explícita para clientes.

## Operación del garzón implementada en Sprint 5

### Identidad y turno

- `employee_pin_attempts` es append-only y limita PIN por identidad y hash del dispositivo.
  Un PIN inválido devuelve resultado sin excepción para conservar el intento.
- `employee_sessions` vincula `auth.uid()` con empleado, tenant y venue. Tiene 1 hora de
  inactividad por defecto, máximo absoluto de 12 horas, versión y cierre manual.
- El Custom Access Token Hook agrega `employee_session_id` y `employee_id` sólo desde una
  sesión activa. Sin tenant o sesión válida, RLS falla cerrado.
- `employee_zone_assignments` conserva cobertura histórica. Una zona se transfiere con sus
  mesas y tareas mediante una RPC auditada.

### Cola durable

- `waiter_tasks` materializa exactamente una tarea por comanda READY, llamado deduplicado o
  solicitud de pago con garzón. Cada fuente tiene índice único.
- `waiter_task_queue` es `security_invoker`: aplica RLS, marca zonas sin cobertura y calcula
  prioridad efectiva.
- Prioridades base: entrega 100, problema 80, pago con garzón 70 y servicio 50.
- A los 12 minutos cualquier tarea toma prioridad 1000 y queda crítica, sin importar su clase.
- Una zona sin cobertura es visible inmediatamente a todos. `waiter_admin_alerts` y el outbox
  escalan a administración tras 2 minutos por defecto.
- Toda resolución usa `state_version`. Entregar exige que la comanda siga READY y la mueve a
  COMPLETED; una segunda escritura pierde por versión.

### Mesas, grupos, traspasos y cierre

- `table_session_groups` y sus miembros agrupan sesiones sólo para visualización. No poseen
  carrito, quote, pago, pedido ni comanda.
- `waiter_table_assignments` conserva dueño e historia. Traspasar mesa o zona mueve pendientes.
- Incidencias, grupos, descartes y traspasos escriben `audit_log`.
- `waiter_shift_close_snapshots` congela el desglose pendiente. Cerrar no bloquea ni borra:
  libera cobertura y deja las tareas visibles como “sin asignar”.

## Caja, cierre y conciliación implementados en Sprint 6

### Turnos y atribución temporal

- `cashier_shifts` delimita un turno por tenant y local; sólo puede existir uno abierto por
  local. Usa versión para impedir dos cierres concurrentes.
- `payment_shift_attributions` conserva `provider_approved_at` y `provider_received_at`. La
  hora de aprobación se busca en intervalos semiabiertos `[opened_at, closed_at)`.
- Si la aprobación pertenece a un turno ya cerrado, queda como revisión post-cierre ligada a
  ese turno. Si no pertenece a ninguno, queda `unassigned` y abre una excepción crítica; nunca
  se asigna al turno más cercano.

### Reembolsos y propinas

- `cashier_refund_actions` enlaza pago, reembolso, turno original, turno operativo, usuario,
  motivo e idempotencia.
- Con turno original abierto, el componente proporcional reduce la propina distribuible.
- Con turno original cerrado, `cashier_post_close_adjustments` registra el mismo componente a
  cargo del local. El cierre histórico y el dinero ya distribuido al trabajador no cambian.
- `cashier_closure_adjustments` incluye cada ajuste pendiente una sola vez en el siguiente
  cierre.

### Snapshot y trazabilidad

- `cashier_shift_closures` congela venta bruta, reembolsos, contracargos, comisión, abono
  esperado, arqueo, propinas, pedidos, ticket promedio y justificación de excepciones.
- Sus resúmenes por medio de pago y garzón son inmutables. Triggers rechazan `UPDATE` y
  `DELETE`; hechos posteriores son nuevas atribuciones, excepciones o ajustes append-only.
- `settlement_payment_entries` aporta bruto, devoluciones, contracargos, comisión, neto, abono
  y referencia por pago. `cashier_reconciliation_trace` lo compara con quote/pedido y deja la
  columna tributaria explícitamente `pending_sprint_7`.

### Excepciones y producción manual

- `cashier_exception_queue` expone lenguaje simple, monto, mesa/persona, ambas horas y opciones
  autorizadas. Los cambios de estado usan versión y quedan en `cashier_exception_events`.
- Una aprobación con quote expirado no produce automáticamente. La producción manual está
  disponible 20 minutos por defecto; revalida sesión y stock y crea pedido, ítems, comandas y
  outbox en una transacción. Después sólo quedan reembolso o escalamiento.

Todas las tablas nuevas llevan `tenant_id`, RLS habilitado y forzado. Las vistas usan
`security_invoker`; el navegador no puede actualizar pagos, pedidos, cierres ni excepciones de
forma directa.

## Onboarding, planes y billing implementados en Sprint 8

### Progreso e importación

- `onboarding_runs` representa un proceso retomable por tenant/local.
- `onboarding_step_states` conserva estado y datos parciales de cada paso.
- `menu_imports` y `menu_import_items` separan extracción, revisión y publicación. Un trigger
  impide publicar mientras falte confirmar cualquier nombre o precio.
- `tenant_gateway_connections` guarda sólo estado/metadatos de la pasarela del bar;
  `private.tenant_gateway_credentials` conserva referencias a secretos Vault.
- `onboarding_test_runs` registra venta y reembolso de prueba sin tratarlos como ventas reales.

### Planes

- `saas_plan_definitions` versiona cortes, límites generosos y precios CLP.
- `tenant_plan_assignments` conserva cada recomendación/cambio, métricas que la originaron,
  vigencia y motivo.
- La recomendación usa mesas: Inicial `≤12`, Flujo `13–30`, Alto flujo `31–60` y
  Personalizado `>60`.
- Zonas/estaciones sólo elevan un nivel cuando ambas exceden los límites generosos del plan
  por mesas.
- Un cambio entra en `current_period_end`; nunca reescribe el período vigente ni cobra
  retroactivamente.

### Suscripción separada de las ventas

- `saas_billing_accounts` representa la cuenta con la que el bar paga a Tablio, no la cuenta
  que recibe pagos de comensales.
- `private.saas_billing_credentials` referencia secretos Vault separados.
- `saas_subscriptions`, `saas_invoices` y `saas_charge_attempts` modelan setup, mensualidad,
  estado de cuenta, idempotencia y reintentos.
- `saas_notifications` guarda avisos previos, fallos, gracia y suspensión programada.
- `subscription_status_events` es append-only y audita cada transición.

El job horario genera aviso cinco días antes, factura e intento idempotente. Los fallos
programan 24/72/120 horas y avanzan por `past_due`, `grace` y `admin_restricted`; no suspenden
de inmediato. `suspension_scheduled` exige fecha futura auditada y la suspensión efectiva sólo
bloquea pedidos nuevos.

### Plataforma

- `platform_memberships` separa superadministradores de cualquier rol de local.
- `tenant_feature_flags` activa capacidades por tenant sin relajar RLS.
- `impersonation_sessions` exige motivo y duplica evidencia en `audit_log` del tenant.
- RPCs de superadmin comprueban membresía de plataforma dentro de la transacción.
- `diner_ordering_availability` devuelve únicamente disponibilidad y texto neutro; no expone
  plan, deuda, factura ni estado comercial.

## Crédito de mesa y panel del dueño implementados en Sprint 9

### Autorización y exposición

- `tenant_table_credit_settings` define habilitación, techo por mesa/local, vencimiento y TTL
  del código. No existe fila habilitada automáticamente para un tenant nuevo.
- `table_credit_accounts` enlaza local, mesa y sesión activa; congela límite, autor, motivo,
  vencimiento y saldos calculables. Un índice parcial impide dos cuentas vivas por sesión.
- `orders.financial_mode` separa `prepaid` de `table_credit`. El primer modo exige `payment_id`;
  el segundo lo prohíbe y exige `table_credit_account_id`.
- La cuenta y configuración se bloquean al autorizar. El pedido, ítems, comandas, consumo de
  reservas, ledger y outbox se confirman en una transacción.

### Evidencia y cobro

- `table_credit_order_links` aporta idempotencia entre quote, cuenta y pedido.
- `table_credit_ledger_entries` es append-only y distingue cargo, pago digital aprobado,
  pago presencial y `write_off`.
- `table_credit_losses` conserva monto, turno, actor, motivo y hora. Un trigger materializa al
  cerrar ventas operacionales, cargos/cobros de crédito, exposición final y fuga en
  `cashier_closure_credit_loss_summaries`.
- `table_credit_verification_challenges` guarda hash, vencimiento y consumo del código; nunca
  persiste el código en claro.
- Cada pago parcial encola un comprobante en el spool. La misma idempotency key devuelve el
  efecto original.

### Coexistencia y lectura

`table_credit_operational_summary` usa `security_invoker` y entrega por sesión el total
prepagado y el saldo de crédito en campos distintos. Un pedido pagado por app no toca el
ledger. Caja y garzón muestran ambas cifras sin compensarlas.

### Historia del dueño

- `owner_dashboard_summary` calcula en servidor ventas, pedidos, ticket, propinas,
  excepciones, pérdidas y serie horaria para un local autorizado o el consolidado.
- `owner_monthly_credit_loss` agrupa fuga por mes y local para mostrar costo acumulado y
  tendencia.
- El frontend sólo transforma estas cifras en relato mediante reglas deterministas; no
  recalcula dinero.

Todas las tablas Sprint 9 tienen RLS habilitado y forzado. Roles API sólo reciben `SELECT`;
las escrituras pasan por fachadas públicas `SECURITY INVOKER` que llaman implementaciones
permisadas en `private`. Advisors confirmó que Sprint 9 no agregó warnings de seguridad.

## Identidad recurrente y fidelización implementadas en Sprint 11

### Identidad y recuperación

- `diner_profiles` es un seudónimo por tenant; nunca contiene teléfono, correo ni nombre real.
- `private.diner_profile_contacts` conserva hash de búsqueda, valor cifrado y máscara.
- `private.diner_identity_credentials` modela credenciales reemplazables; perder una no
  elimina el perfil.
- `private.diner_recovery_challenges` guarda hashes, intentos, expiración y consumo.
- `diner_consent_events` y `diner_identity_events` son append-only. Separan consentimiento de
  identificación, contacto y recuperación tras token perdido.
- `diner_device_sessions.diner_profile_id` sólo se vincula después de confirmación enmascarada.
  Revocar anonimiza y desconecta sesiones/credenciales sin borrar evidencia financiera.

### Sellos y premios

- `tenant_loyalty_programs` está desactivado por defecto y configura compra mínima, visitas,
  límite diario, premio, horario, vigencia y dormancia.
- `loyalty_visits` acepta sólo pagos server-side confirmados y deduplica por pago/pedido.
- `loyalty_ledger_entries` es la fuente del saldo. Ajustes de caja exigen actor y motivo.
- `loyalty_reward_redemptions` reserva una sola vez y enlaza carrito, quote, pedido e ítem.
- Quote y pedido congelan perfil, valor de lista y costo conocido. Ítems premio exigen precio,
  impuesto y total `$0`, además de la redención.
- `products.unit_cost_clp` es opcional. Nulo significa “costo desconocido”; los reportes no
  calculan margen.
- Reembolsos generan ajustes idempotentes; el total restaura el premio y el parcial sólo
  revierte la visita cuando el neto deja de cumplir el mínimo.

### Métricas

`owner_loyalty_metrics` cuenta recurrencia, frecuencia, canjes, valor de lista, costo conocido,
dormancia y recuperación tras token perdido. `cashier_loyalty_reward_summary` explica ingreso
cero, referencia y costo por premio. Ambas vistas son `security_invoker`.

## Momento del pago implementado en Sprint 12

- `tenant_checkout_engagement_settings` configura cuatro capacidades apagadas por defecto.
- `checkout_upsell_rules` permite producto, categoría, horario, margen conocido o lista
  manual. `checkout_upsell_events` separa exposición, aceptación, descarte, quote y pago.
- `promotion_campaigns`, `promotion_versions` y `promotion_activation_events` mantienen precio
  versionado y auditoría. Quote/ítems/pedido copian versión y descuento.
- `drink_invitations` conserva pagador, mesa destino, venta, producto, reserva, vigencia,
  reclamo y reembolso. `drink_invitation_events` es append-only.
- `tip_allocations` congela equipo o trabajador, sesión, medio y monto. El cierre del turno del
  trabajador no modifica esta fila.
- `tip_allocation_refund_adjustments` enlaza la política de ADR-005: un reembolso abierto
  reduce lo distribuible y uno post-cierre queda como costo del local.
- `owner_checkout_engagement_metrics` y `cashier_tip_allocation_summary` son vistas
  `security_invoker`.

Todas las tablas nuevas tienen `tenant_id`, claves compuestas, RLS habilitado/forzado y grants
de lectura según permiso. Las escrituras operativas permanecen en funciones internas.

## Saldo prepagado implementado en Sprint 13

### Cuenta, lotes y ledger

- `tenant_stored_value_settings` nace apagada y bloqueada para producción. Configura bono,
  orden de consumo, vigencias, aviso, tope individual ($40.000 por defecto), tope total
  opcional y umbral de superadmin.
- `stored_value_accounts` enlaza una identidad recuperable con un tenant. Un perfil no puede
  tener dos cuentas en el mismo bar.
- `stored_value_lots` conserva cada origen como `loaded_money` o `bonus`; es inmutable.
- `stored_value_ledger_entries` acredita o debita recarga, consumo, devolución, expiración y
  ajuste. Su suma es el saldo; no existe balance mutable.
- `stored_value_expiry_notifications` demuestra qué aviso se generó antes de una expiración.

### Quotes, pagos y pedidos

- `stored_value_topup_quotes` tipa un `CheckoutQuote` como recarga y congela dinero, bono,
  política y expiración.
- `stored_value_quote_allocations` reserva lotes al quote con bono-primero y FEFO. Rechazo,
  abandono o expiración liberan; un pedido confirmado consume exactamente esa asignación.
- `stored_value_topup_receipts` exige `payment_id` y `provider_payment_event_id`; una
  restricción única impide acreditar dos veces.
- `orders.stored_value_applied_clp`, `external_payment_clp` y
  `stored_value_policy_version` copian la mezcla. El total comercial no cambia.
- `stored_value_topup_refunds` enlaza una recarga intacta con un `Refund`; los débitos del
  ledger eliminan tanto dinero como bono sin borrar evidencia.
- `stored_value_manual_adjustments` enlaza el movimiento con trabajador y motivo.

### Conciliación y plataforma

- El cierre agrega `stored_value_topups_cash_in_clp`,
  `stored_value_consumed_revenue_clp`, `stored_value_expired_clp` y
  `stored_value_liability_clp`.
- `stored_value_account_balances` y `tenant_stored_value_liabilities` derivan pasivos desde
  el ledger. `owner_stored_value_metrics` separa las tres historias financieras.
- `superadmin_stored_value_liabilities()` cruza tenants sólo tras comprobar membresía de
  plataforma. `superadmin_set_stored_value_alert_threshold` exige motivo y audita.
- `tenants_block_delete_with_stored_value` impide borrar un tenant si la suma del ledger sigue
  positiva.

Todas las tablas de Sprint 13 tienen RLS habilitado y forzado. Los usuarios autenticados sólo
leen el tenant de su claim; las escrituras financieras pasan por funciones internas.
