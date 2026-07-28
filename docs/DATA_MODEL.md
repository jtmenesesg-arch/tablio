# Modelo de datos

- **Estado:** fundación multi-tenant y núcleo financiero de Sprint 2 aplicados
- **Migración base:** `20260727223243_foundation_multi_tenant.sql`
- **Verificación remota verde:** `20260727224600_verify_tenant_isolation.sql`
- **Hardening:** `20260728035137_harden_auth_and_advisor_findings.sql` y
  `20260728035253_explicit_private_context_deny_policy.sql`
- **Suite repetible:** `supabase/tests/database/001_tenant_isolation.test.sql`
- **Núcleo financiero:** `20260728064954_sprint_02_financial_core.sql` y migraciones de
  hardening `20260728065005`, `20260728065130`, `20260728065508`, `20260728070001`
- **Suite financiera:** `supabase/tests/database/002_financial_core.test.sql` (`1..33` verde)

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

## Tablas todavía previstas

| Dominio          | Entidades principales                               |
| ---------------- | --------------------------------------------------- |
| Sesión/presencia | `table_session_members`, `presence_codes`           |
| Catálogo         | `categories`, `modifiers`, historiales de precio    |
| Propina          | `tips`, `tip_allocations`                           |
| Tributación      | `tax_documents`, `tax_document_attempts`            |
| Impresión        | `print_jobs`, `printer_endpoints`, `print_attempts` |

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
