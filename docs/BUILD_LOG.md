# Bitácora de construcción

Registro simple de qué cambió, por qué y cómo se verificó.

## 2026-07-27 — Conexiones de infraestructura

### Qué cambió

- Se clonó el repositorio `jtmenesesg-arch/tablio` y se verificó `main`.
- Se configuró el MCP de Supabase para el proyecto `xmwewmukoxdeuilmkahr`.
- Vercel CLI quedó autenticado y el repositorio local se vinculó con
  `felipe's projects/tablio`.
- Vercel creó credenciales locales OIDC en `.env.local`.

### Por qué

Supabase y Vercel son decisiones congeladas del stack. Era necesario comprobar acceso antes de
iniciar Sprint 0.

### Verificación

- Git quedó sincronizado con `origin/main`.
- El MCP de Supabase quedó habilitado.
- Vercel reconoció el proyecto `prj_dwxiSJ1moNfAhEP7d2hbqJLHash0`.
- `.env.local` y `.vercel/` están ignorados por Git; no se guardaron secretos.

## 2026-07-27 — ADR-000 aprobado

### Qué cambió

Se escribió y aprobó `docs/adr/ADR-000-stack.md`. La decisión define:

- Next.js + TypeScript estricto;
- monorepo modular con una aplicación Vercel;
- Supabase/PostgreSQL como fuente de verdad;
- RLS por tenant;
- pruebas con Vitest, pgTAP y Playwright;
- tres caminos para KDS: Realtime rápido, procesamiento durable y recuperación por consulta;
- pedido y comandas creados atómicamente antes del aviso al KDS;
- outbox, Supabase Queues, reintentos, DLQ y consumidores idempotentes;
- un adaptador abstracto de pasarela antes de elegir proveedor.

### Por qué

Los siguientes sprints necesitan una base verificable que no pierda pedidos ni mezcle datos de
locales distintos.

### Verificación

Se comprobó que el ADR contiene framework, estructura, UI, testing, tenant, PWA, Realtime,
durabilidad, SLO p95, reintentos, DLQ, idempotencia y alternativas consideradas.

## 2026-07-27 — Estructura documental

### Qué cambió

- Los briefs se ubicaron en `/brief/`.
- Se crearon README, mapa de dominios, modelo de datos, glosario, backlog, asuntos abiertos,
  Decision Record y carpetas de revisión/sprints.
- Se registró la conectividad de impresora térmica como decisión pendiente de Sprint 4.

### Por qué

La documentación viva es parte de la definición de terminado y evita que decisiones críticas
aparezcan tarde o se cambien en silencio.

### Verificación

Se revisaron enlaces internos, archivos obligatorios y correspondencia con los documentos
congelados. No se creó aplicación, migración ni pantalla en este incremento.

## 2026-07-27 — Fundación multi-tenant aplicada

### Qué cambió

- Se agregó a `AGENTS.md` la regla aprobada: Realtime avisa, PostgreSQL manda y la cola
  garantiza efectos; el KDS no espera el polling de la cola.
- El SLO KDS p95 ≤ 2 s quedó declarado como objetivo no verificado hasta tener instrumentación
  end-to-end.
- Se documentaron el uso restringido de `service_role`, la propagación del tenant por JWT,
  el comportamiento fail-closed y el protocolo rojo/restauración/verde.
- Se inicializó Supabase CLI y se vinculó el proyecto `xmwewmukoxdeuilmkahr`.
- Se aplicó `20260727223243_foundation_multi_tenant.sql` con tenants, venues, zonas, puntos de
  servicio, estaciones, personal, membresías, RBAC, auditoría, contexto privado, funciones,
  RLS forzado, Storage privado y métricas de tamaño.
- Se aplicó `20260727224600_verify_tenant_isolation.sql`, una verificación remota que crea dos
  tenants temporales, comprueba aislamiento y elimina los datos de prueba.
- Se versionaron la suite pgTAP normal y el control negativo transaccional.

### Por qué

La aplicación no puede avanzar sobre un aislamiento decorativo. La base debe hacer cumplir
tenant, permisos y referencias cruzadas incluso si una ruta de aplicación contiene un error.
Zonas, mesas/puntos y estaciones son datos configurables porque alimentarán onboarding y
pricing por tamaño.

### Verificación

- Las migraciones aparecen en el historial remoto.
- El control verde remoto comprobó lectura aislada, bloqueo de update/insert cruzado,
  fail-closed sin claim y foreign key compuesta.
- El lint remoto de `public` y `private` terminó sin errores.
- El control rojo no se ejecutó en el proyecto actual: queda programado para staging aislado a
  más tardar antes del piloto.

## 2026-07-28 — Auth real, hardening y cierre de Sprint 0

### Qué cambió

- Se activó exclusivamente el Custom Access Token Hook remoto
  `public.custom_access_token_hook`.
- Se aplicó `20260728035137_harden_auth_and_advisor_findings.sql`: se cerraron grants amplios
  sobre funciones privilegiadas, se movió la operación interna de selección de tenant a
  `private`, se dejó una RPC pública `SECURITY INVOKER` y se agregaron índices de claves
  foráneas.
- Se aplicó `20260728035253_explicit_private_context_deny_policy.sql`: el contexto privado
  quedó con RLS forzado y denegación explícita para `anon` y `authenticated`.
- Se corrigieron dos defectos del test pgTAP: el fixture de mesa de tenant B ahora incluye
  `zone_id`, y las aserciones DML usan CTEs válidos con `results_eq`.
- Se canceló el ambiente Docker/local. No se creó un segundo proyecto Supabase remoto.

### Por qué

El aislamiento no estaba verificado punta a punta mientras el claim solo se simulaba en SQL.
La emisión real de Auth debía demostrar que el hook añade el tenant correcto y que su ausencia
falla cerrada. Los Advisors también revelaron funciones privilegiadas con permisos demasiado
amplios y claves foráneas sin índices de soporte.

### Verificación ejecutada

- Login real sin contexto: JWT sin `tenant_id`, lectura `200` con 0 filas.
- RPC `set_active_tenant`: `204` después de validar membresía.
- Nuevo login: JWT con el tenant esperado; lectura `200` y una sola zona propia.
- Usuario real sin tenant: JWT sin claim, lectura `200` con 0 filas e insert rechazado `403`.
- Logs Auth: `Hook ran successfully` y token `200` en las tres emisiones.
- Cleanup: 0 usuarios, 0 tenants y 0 zonas temporales restantes.
- Security Advisors finales: 0 hallazgos.
- Performance Advisors: cinco avisos informativos `unused_index`, registrados como OI-008.
- El objetivo KDS p95 ≤ 2 s sigue declarado como no verificado hasta instrumentarlo.

## 2026-07-28 — Sprint 1, spike documental y pasarela simulada

### Qué cambió

- Se documentaron Mercado Pago y Transbank sólo desde fuentes oficiales en
  `ADR-001-payment-gateway-spike.md`; todas las capacidades quedaron rotuladas como hipótesis
  no verificadas y el ADR quedó PROPUESTO, NO DECIDIDO.
- Se separaron explícitamente venta del bar y suscripción SaaS de Tablio.
- Se creó el puerto neutral `PaymentGateway` con conexión por comercio, intento, firma,
  confirmación/consulta server-side, reembolso, medio guardado y liquidación.
- Se implementó un adaptador simulado con HMAC, aislamiento por comercio, idempotencia,
  duplicados, rechazos, eventos tardíos/fuera de orden, reembolsos y datos de conciliación.
- Se creó `/demo/payments`, una pantalla visible como modo demo que no recibe ni mueve plata.
- Se inicializó el workspace pnpm y la aplicación Next.js sin implementar checkout real.

### Por qué

No existen cuentas ni credenciales y el proveedor real se integrará al final. El núcleo debe
poder avanzar y demostrarse sin convertir hipótesis documentales en decisiones ni acoplar la
lógica de negocio a una pasarela.

### Verificación

- Suite Vitest: ocho entregas idénticas producen un evento y un outbox; firma alterada o
  expirada falla; evento antiguo no degrada estado; se prueban rechazo, tardanza, refunds
  múltiples, comercio de medios guardados y campos de conciliación.
- TypeScript estricto, lint, formato y build de producción se ejecutan como puerta del
  incremento.
- `pnpm audit --prod` detectó versiones transitivas vulnerables de `sharp` y `postcss`; se
  fijaron `sharp@0.35.3` y `postcss@8.5.23`, se repitió el build y el audit terminó con cero
  vulnerabilidades conocidas.
- No se crearon cuentas, credenciales, cobros, clientes ni cambios remotos en Supabase.

## 2026-07-28 — Sprint 2, núcleo financiero

### Qué cambió

- Se aplicó el esquema financiero con quotes inmutables, evidencia append-only, estados
  separados, pedidos, comandas, stock selectivo, reembolsos, conciliación y auditoría.
- ADR-002 aprobó reserva al crear quote sólo para productos con `track_stock`, un único reloj
  de 10 minutos y liberación inmediata en rechazo/cancelación/abandono.
- La confirmación server-side crea pedido, ítems, una comanda por estación, consumo de reserva
  y cuatro mensajes de outbox en una sola transacción.
- Una aprobación posterior al vencimiento no produce y crea una excepción crítica inmediata
  para el cajero: “requiere decisión: reembolsar o producir manualmente”.
- Se instalaron colas PGMQ `financial_effects` y `financial_effects_dlq`; los reintentos usan
  backoff exponencial con jitter, máximo configurable, DLQ y replay auditado.
- `ProcessedEvent` y el consumidor TypeScript entregan idempotencia; cada adaptador externo
  recibe además la clave durable para cubrir un crash entre efecto y ACK.
- Se agregaron RPCs de worker ejecutables sólo por `service_role`. No existe acceso desde
  `anon` o `authenticated`.

### Por qué

Ésta es la cadena que impide cobrar sin producir, producir sin cobrar o duplicar un efecto:
persona → carrito → quote inmutable → aprobación verificable → pedido → comandas.

### Verificación

- pgTAP remoto: `1..33`, 33 controles en verde con comentario de riesgo en español.
- Duplicado entregado diez veces: un evento, un pedido, dos comandas y cuatro outbox.
- Prueba de persistencia en transacciones independientes: después de cerrar la conexión de
  confirmación seguían presentes 1 pedido, 2 comandas, 4 outbox y 1 evidencia del proveedor.
- Los datos sintéticos se eliminaron al terminar (`synthetic_tenants_remaining = 0`).
- Security Advisors finales: cero hallazgos.
- Performance Advisors: cero claves foráneas sin índice; sólo `unused_index` informativos
  esperables antes de tener tráfico, registrados en OI-008.
- Quality gate: 18 Vitest verdes, TypeScript estricto, ESLint, Prettier y build Next.js
  exitosos; `pnpm audit --prod` terminó sin vulnerabilidades conocidas.
- Las migraciones remotas son `sprint_02_financial_core`, `sprint_02_worker_rpcs`,
  `sprint_02_database_recorded_clock`, `sprint_02_advisor_fixes` y
  `sprint_02_retry_policy_alignment`.

## 2026-07-28 — Sprint 3, PWA del comensal

### Qué cambió

- Se construyó `/mesa/demo-mesa-8`: código de presencia, carta, detalle, variantes, notas,
  alérgenos, carrito por dispositivo, nombre opcional, propina, quote, pago simulado,
  confirmación, comandas independientes, otra ronda y acciones de mesa.
- La interfaz usa la marca aprobada, Plus Jakarta Sans local, fondos sólidos sin gradientes y
  limita glass a navegación/modal. Totales, botón de pago y resultados financieros siempre
  son opacos.
- El diccionario de alias usa animales u objetos no bebibles más colores. Una prueba compara
  todas sus palabras contra vocabulario típico de productos/categorías de bar.
- La sesión demo usa cookie `HttpOnly`, 4 horas de inactividad y 12 horas absolutas.
- `payment.start` llama el adaptador simulado en servidor. El webhook HMAC se verifica y la
  consulta server-side termina el pago; una acción inventada `payment.confirm` devuelve 400.
- “Pagar con el garzón” muestra que sigue impago y no crea pedido ni comandas.
- Se aplicaron las migraciones remotas `sprint_03_diner_pwa` y
  `sprint_03_advisor_fixes`: catálogo, sesiones, identidad congelada, acciones, solicitudes,
  RLS, índices y publicaciones Realtime.
- ADR-003 fijó recuperación desde servidor y Broadcast privado para producción.
- Las cuatro fotos demo de Unsplash y Plus Jakarta Sans se sirven localmente; sus créditos
  están en `docs/ASSET_SOURCES.md`.

### Por qué

La experiencia debe sobrevivir una noche de bar real sin confiar en el navegador para precios,
pagos o identidad de entrega. El alias por sí solo no basta en una mesa grande, pero pedir una
cuenta sería fricción innecesaria. Realtime acelera; la consulta recupera.

### Verificación

- Playwright en Pixel 5: 6 de 6 recorridos verdes, incluyendo dos contextos de navegador
  independientes, recarga, agotado, falsificación financiera y pago con garzón.
- Vitest: 27 controles verdes, incluidos diccionario de alias y ratios de contraste.
- pgTAP Sprint 3: 17 controles versionados; la ejecución remota comprobó el último control
  `ok 17` y no dejó fixtures por usar transacción con rollback.
- TypeScript estricto, ESLint, Prettier y build Next.js exitosos.
- `pnpm audit --prod`: cero vulnerabilidades conocidas.
- Security Advisors: 0 hallazgos.
- Performance Advisors: se corrigió la FK de categoría sin índice y las policies SELECT
  solapadas. Permanecen sólo índices sin uso, esperables sin tráfico y registrados en OI-008.

## 2026-07-28 — Sprint 4, KDS, comandas y durabilidad

### Qué cambió

- Se construyó `/kds` como pantalla horizontal, opaca y de alto contraste, con estaciones
  configurables, temporizadores, sello Pagado, botones grandes y estados independientes.
- El camino inmediato invalida por estación y vuelve a consultar la fuente durable. Al abrir o
  reconectar se recuperan todas las comandas no terminales y cada 45 segundos corre una
  reconciliación de respaldo aunque el canal parezca sano.
- La pantalla muestra permanentemente conexión y “actualizado hace X”; después de 75 segundos
  sin sincronizar aparece una advertencia roja grande que impide confundir una caída con una
  barra tranquila.
- Cada KDS mantiene heartbeat. La confirmación congela si había pantalla viva y la métrica
  excluye de percentiles el tiempo sin observador, presentándolo en un contador separado.
- Las transiciones usan estado y versión esperados. Dos pantallas no pueden sobrescribirse:
  una gana y la otra debe recargar.
- READY escribe avisos durables para garzón y comensal. Agotado/repuesto actualiza la carta de
  inmediato y deja auditoría.
- Se aplicaron tablas RLS para configuración, presencia, métricas, endpoints, spool e intentos
  de impresión. `PrinterPort` y el worker dejan el transporte físico como adaptador stub.
- Se corrigió la documentación del código de presencia a 4 dígitos.

### Por qué

Realtime debe acelerar sin transformarse en fuente de verdad. La consulta periódica cubre un
websocket medio muerto; el heartbeat permite medir el sistema y no cuánto tiempo estuvo
apagada una tablet. El spool debe sobrevivir aunque todavía no se haya elegido cómo alcanzar
la impresora del local.

### Verificación

- Playwright completo: 11/11 recorridos verdes, incluidos pago real del adaptador simulado a
  Barra/Cocina, reconexión, agotado inmediato, indicador y métrica segmentada.
- Medición de laboratorio con KDS conectado: 12 muestras, p50 64 ms, p95 103 ms, p99 105 ms.
  Hubo 1 confirmación sin KDS conectado y quedó fuera de los percentiles.
- Vitest: 37 controles verdes, incluidos reinicio, duplicado, concurrencia, spool y reimpresión.
- La migración remota `verify_sprint_04_kds` comprobó tablas, RPCs, privilegios mínimos, seis
  tablas con RLS forzado y policies privadas de Realtime, sin crear datos.
- La suite pgTAP de 26 controles quedó versionada. La CLI de Supabase intenta iniciar Docker
  incluso con `--linked`; como Docker fue cancelado, la verificación remota ejecutable se hizo
  mediante la migración anterior.
- TypeScript estricto, ESLint, Prettier y build de producción verdes.
- Security Advisors finales: cero hallazgos. Performance Advisors: sólo `unused_index`
  informativos esperables antes de tráfico, cubiertos por OI-008.

## 2026-07-28 — Sprint 5, panel del garzón

### Qué cambió

- Se construyó `/garzon`: PIN, zonas, cola, mesas, grupos, traspaso de mesa/zona, incidencias y
  cierre de turno.
- SSE avisa, la consulta recupera y cada 45 segundos reconcilia. Conexión y última
  sincronización son permanentes; 75 segundos sin éxito muestran alerta opaca.
- READY crea una entrega pagada; completar exige estado y versión vigentes. Llamados y pagos
  con garzón se materializan idempotentemente.
- Pago con garzón es NO PAGADO, no crea Order/Ticket y expira a 30 minutos.
- La cola tiene techo crítico a 12 minutos. Zonas huérfanas son visibles para todos y escalan
  a administración a 2 minutos.
- Cerrar muestra desglose, conserva snapshot, libera cobertura y no borra tareas.
- ADR-004 congeló el grupo de mesas estrictamente operativo.

### Verificación

- Vitest: 46 controles verdes.
- Playwright: 15/15 recorridos verdes entre PWA, KDS y garzón.
- KDS en la corrida final: p50 86 ms, p95 134 ms, p99 149 ms, 1 caso sin pantalla.
- TypeScript, ESLint y build Next.js verdes.
- Se aplicaron remotamente `sprint_05_waiter_operations`, `sprint_05_runtime_fixes` y
  `sprint_05_advisor_fixes`; el historial local y remoto quedó alineado.
- pgTAP Sprint 5: 31/31 controles verdes en el proyecto remoto, dentro de una transacción con
  rollback. Incluye tenant cruzado y fail-closed sin `tenant_id` ni sesión de empleado.
- El lint remoto terminó sin errores de Sprint 5. Sólo informa tres `warning extra` heredados
  de funciones del Sprint 2.
- Security Advisors: cero hallazgos. Se agregó una policy explícita de denegación a
  `employee_pin_attempts`.
- Performance Advisors: cero claves foráneas sin índice; sólo `unused_index` informativos sin
  tráfico real, cubiertos por OI-008.

## 2026-07-28 — Sprint 6, caja, cierre y conciliación

### Qué cambió

- Se construyó `/caja` con sesiones de mesa, grupos, métricas de turno, conexión permanente,
  excepciones financieras, reembolsos, conciliación sintética, cierre y CSV.
- Se materializaron turnos de caja, atribución por hora del proveedor, snapshots inmutables,
  desgloses por medio/garzón, historial de excepciones y settlements por pago.
- Una confirmación conserva siempre aprobación y recepción. Si su hora no cae en ningún turno,
  queda sin turno en una bandeja crítica; si pertenece a uno cerrado, se liga al original para
  revisión post-cierre.
- La producción manual por aprobación tardía dura 20 minutos configurables. Dentro de la
  ventana revalida mesa y stock y crea pedido/comandas/outbox atómicamente; fuera se
  deshabilita.
- ADR-005 separó la propina devuelta con turno abierto de la ya distribuida. La primera reduce
  el turno; la segunda crea un ajuste a cargo del local en el siguiente cierre.
- El cierre exige justificación si quedan excepciones y congela todos los totales calculados
  en PostgreSQL. Triggers impiden editar o eliminar su evidencia.

### Por qué

La promesa “el cierre explica cada peso” necesita rastrear dinero y decisiones sin tratar una
mesa prepaga como deuda, sin esconder cobros tardíos y sin reescribir una fotografía financiera
después de distribuir propinas.

### Verificación

- Vitest: 60/60 controles verdes, 14 específicos del dominio de caja.
- Playwright de caja: 4/4 recorridos; 19 recorridos completos al sumar PWA, KDS y garzón.
- pgTAP remoto: 40/40 en verde dentro de una transacción con rollback, incluidos RLS, permisos
  y fail-closed.
- Se aplicaron `sprint_06_cashier_closure_reconciliation`, `sprint_06_advisor_fixes`,
  `sprint_06_runtime_fix` y `sprint_06_permission_fix` al proyecto Supabase enlazado. El fix
  final exige `cashier.close` en las RPC públicas de apertura y cierre.
- Security Advisors: cero hallazgos. Performance Advisors: cero claves foráneas de Sprint 6
  sin índice; permanecen sólo índices sin uso informativos por falta de carga real.
- El lint remoto quedó sin hallazgos de Sprint 6 y conserva tres `warning extra` heredados de
  Sprint 2.

## 2026-07-29 — Sprint 7 · Boleta electrónica

- Se definió `TaxDocumentProvider` y un adaptador DTE simulado con éxito, falla, demora,
  duplicados, consulta, representación, nota de crédito y reintento.
- Se aplicaron ocho migraciones al Supabase actual: configuración/emisor por tenant,
  referencias a Vault, venta/documento/intentos, RLS, outbox de reembolso, RPC de reintento,
  índices, corrección de la carrera entre reembolso y boleta original, cola DTE/DLQ dedicada
  y ejecución automática con `pg_cron` + `pg_net`.
- Se desplegó `tax-document-consumer` en Supabase Edge Functions. El cron usa un JWT válido
  más un secreto aleatorio cifrado en Vault; la función usa `service_role` sólo internamente,
  reclama mensajes idempotentes y aplica ACK, backoff o DLQ. Dos llamadas reales consecutivas
  —una automática— respondieron HTTP 200.
- La devolución de dinero quedó desacoplada del documento tributario: una nota pendiente crea
  una alerta sin retener la plata del cliente.
- Caja alerta sobre más de 10 pendientes o 15 minutos de antigüedad y muestra salud
  funcionando/degradado/caído desde la tasa de fallos reciente.
- La PWA muestra “emitiendo” después del pago y luego permite ver/descargar la representación
  demo; correo opcional queda registrado por el simulador.
- Verificación: 67 Vitest, TypeScript, lint y build verdes; 43/43 pgTAP de Sprint 7 y 19/19
  del aislamiento multi-tenant remotos; los 21 E2E verdes. La suite de garzón requirió una
  repetición aislada tras un botón transitoriamente deshabilitado y pasó 4/4. Security
  Advisors sin hallazgos. Los Advisors de rendimiento quedaron sólo con `unused_index`,
  esperable sin tráfico real.

## 2026-07-29 — Sprint 8 · Onboarding, superadmin y cobro SaaS

### Qué cambió

- Se construyó `/onboarding` con nueve pasos retomables: local, tamaño, carta con revisión
  humana, tributación, conexión simulada de la cuenta del bar, personal, QRs/códigos de
  presencia, venta/reembolso de prueba y habilitación.
- Se creó el puerto `SaasBillingProvider` y un adaptador simulado separado de
  `PaymentGateway`; cubre conexión, setup, mensualidad, idempotencia, fallo y reintento.
- ADR-007 fijó las mesas como dimensión principal: Inicial ≤12, Flujo 13–30, Alto flujo
  31–60 y Personalizado >60. Zonas/estaciones sólo elevan un nivel si ambas superan límites
  generosos. Precios y cortes siguen siendo hipótesis comerciales.
- Se construyó `/superadmin` con métricas, tenants, plan/estado/proveedores, feature flags,
  cobros y soporte con impersonación obligatoriamente motivada.
- Se separó estado comercial de acceso operativo. Morosidad y restricción administrativa
  mantienen ventas; la suspensión sólo bloquea pedidos nuevos después de aviso/agendamiento.
  La PWA recibe exclusivamente disponibilidad y mensaje neutro.
- Se aplicaron cinco migraciones: progreso, importación, conexiones/secretos Vault, planes,
  suscripciones, facturas, intentos, avisos, cron horario, auditoría, feature flags,
  superadmin, índices y hardening RLS/grants.

### Por qué

Tablio necesitaba poder instalar y administrar un local sin mezclar el dinero del bar con la
mensualidad del SaaS. La escala de planes debe discriminar dentro del beachhead real y una
falla de cobro no puede interrumpir un viernes por la noche ni revelar deuda al comensal.

### Verificación

- 79/79 Vitest; 26/26 Playwright; TypeScript, ESLint, Prettier y build verdes.
- pgTAP Sprint 8: 51/51; aislamiento multi-tenant: 19/19, ambos en el proyecto remoto con
  rollback.
- Performance Advisors: se agregaron los 14 índices de claves foráneas faltantes y se corrigió
  el `auth.uid()` por fila; quedan sólo `unused_index` sin tráfico real.
- Security Advisors: se revocaron grants anónimos accidentales. Se registraron en OI-019 seis
  warnings intencionales de RPCs `SECURITY DEFINER`, con acceso mínimo y validación interna.
- Migraciones locales alineadas con el historial remoto: `20260729163957`,
  `20260729164321`, `20260729164723`, `20260729165547` y `20260729165625`.

## 2026-07-29 — Sprint 9 · Crédito de mesa y panel del dueño

### Qué cambió

- Se modeló crédito de mesa desactivado por defecto, con permisos, motivo, límites por mesa y
  local, vencimiento, ledger append-only, pagos parciales, fuga y código vivo de un uso.
- `orders.financial_mode` preserva el prepago y permite producir sin pago sólo contra una
  cuenta de crédito viva. Pedido, comandas, reservas y outbox se crean atómicamente.
- Caja y garzón presentan prepago y deuda por separado: una venta QR no altera el saldo del
  crédito de la misma mesa.
- El spool recibe comprobantes de cada pago parcial. La fuga entra al cierre del turno y al
  costo mensual acumulado del panel del dueño.
- `/dueno` cuenta una historia con titular, tres focos, un gráfico horario, productos,
  operación, locales, excepciones y fuga. Un tenant nuevo conserva datos actuales y explica
  cuándo aparecerá la primera comparación.
- ADR-008 congeló el crédito como excepción subordinada al prepago.

### Correcciones encontradas durante la prueba real

- La creación de una comanda reveló un bloque ajeno dentro del trigger KDS de Sprint 4, que
  referenciaba variables inexistentes. Se reemplazó el trigger y se verificó nuevamente tanto
  el flujo prepago como el crédito.
- Se explicitó la resolución de una variable PL/pgSQL ambigua en la creación del pedido.
- Se revocaron privilegios de escritura que Supabase concede por defecto a roles API.
- Las implementaciones privilegiadas de ocho RPC de crédito se movieron a `private`, dejando
  fachadas públicas `SECURITY INVOKER`.
- Performance Advisors detectó once claves foráneas Sprint 9 sin índice; todas recibieron
  índice de cobertura.

### Verificación

- Vitest: 94/94; incluye reglas de crédito, relato y aislamiento del store demo.
- pgTAP remoto: 51/51 dentro de una transacción con rollback; las ventas del dueño cuadran con
  el snapshot operacional del cierre para el mismo intervalo.
- Playwright: 30/30 en la regresión completa; 4/4 específicos para coexistencia, pago/código,
  fuga mensual y tenant nuevo.
- TypeScript, ESLint, Prettier y build Next.js verdes.
- Security Advisors: Sprint 9 no agregó warnings; permanecen exactamente los seis OI-019,
  explicados en lenguaje simple.
- Performance Advisors: cero claves foráneas Sprint 9 sin índice; los `unused_index` siguen
  bajo OI-008 hasta disponer de tráfico representativo.

## 2026-07-29 — Sprint 10 · Endurecimiento y preparación del piloto

### Qué cambió

- Se agregó un harness reproducible de carga que recorre rutas HTTP reales: entrada PWA,
  dispositivo, carrito, quote, pago simulado, confirmación server-side, pedido, comanda,
  visibilidad KDS, fanout a KDS/garzones, reconexión y spool.
- Se modelaron dos perfiles: capacidad sostenida de 2.880 pedidos/h y “última ronda”, con
  96 de 240 personas comprando dentro de cinco minutos.
- Se agregó una suite de caos para KDS caído, reinicio, proveedor lento y eventos fuera de
  orden, impresora caída, DTE caído, reembolso parcial y cierre concurrente.
- Se agregó una suite E2E de red offline/online, QR inválido y opacidad de superficies
  financieras, además de una medición móvil en build productivo.
- Se cerró el control negativo multi-tenant: policy deliberadamente insegura, test rojo,
  rollback, policy restaurada y suites verdes.
- Se escribieron el playbook de piloto, reporte de carga/caos, explicación simple de OI-019,
  lista de bloqueantes reales y resumen final.

### Resultados medidos

- Carga sostenida: 240/240 flujos sin error; confirmación → KDS p50 33 ms, p95 70 ms,
  p99 88 ms. Se crearon exactamente 240 comandas y 240 trabajos de impresión.
- Última ronda: 96/96 flujos sin error; confirmación → KDS p50 26 ms, p95 55 ms,
  p99 70 ms. Se crearon exactamente 96 comandas y 96 trabajos de impresión.
- Pico de entrada: 240 escaneos simultáneos p50 2.383 s, p95 4.318 s, p99 4.322 s; queda
  bajo OI-020 para repetir en hosting y dispositivos reales.
- PWA productiva con CPU 4× y red 1,6 Mbps/150 ms: utilizable p50 2.008 s, p95 2.055 s,
  p99 2.059 s; 241 KB transferidos.
- Caos: 5/5 escenarios verdes. E2E de hardening: 3/3 verdes.
- pgTAP remoto: 316/316 entre las suites 001–010. Security Advisors: exactamente los seis
  warnings intencionales OI-019; no aparecieron warnings nuevos.

### Decisión de salida

El producto queda apto para demo y candidato a piloto controlado después de cerrar los
bloqueantes marcados. No queda autorizado para operar dinero real: pasarela, DTE, asesorías,
impresión física, despliegue/observabilidad y validaciones de infraestructura siguen abiertos.

## 2026-07-29 — Sprint 11 · Identidad recurrente y fidelización

### Qué cambió

- Se agregó identidad seudónima por tenant sin modificar el pedido anónimo. El opt-in aparece
  después del primer pago y exige consentimientos separados para identificación y recuperación.
- Teléfono/correo verificado es la continuidad principal. Un token perdido se reemplaza sin
  perder sellos; el dispositivo compartido sólo muestra `Perfil •NNN`.
- Caja puede restituir sellos con motivo obligatorio y actor auditado. El dueño ve la tasa de
  recuperaciones por credencial perdida.
- Programa, visitas, ledger, canjes, reembolsos y segmento dormido son configurables por tenant,
  idempotentes, con RLS forzado y evidencia append-only.
- “Tu de siempre” usa historial real y disponibilidad. El premio es un ítem server-side a `$0`,
  conserva stock y aparece marcado en PWA/KDS.
- Se agregó costo de producto opcional. Sin costo, conciliación informa sólo valor de lista y
  jamás inventa margen.

### Correcciones encontradas al probar

- La segunda ronda todavía recibía en el bootstrap el quote ya pagado de la ronda anterior.
  Se dejó de publicar quotes/pagos terminales; un nuevo carrito siempre crea un quote nuevo.
- Advisors detectó 17 claves foráneas nuevas sin índice; se agregaron índices de cobertura.
- Los tres avisos `RLS enabled no policy` de tablas privadas se conservaron deliberadamente:
  cero policies/grants impide acceso API y está explicado en OI-023.

### Verificación

- Vitest: 115/115.
- Playwright: 36/36 en la regresión completa; 3/3 específicos incluyen pérdida total de
  cookies y canje/KDS.
- pgTAP Sprint 11: 30/30 en el proyecto remoto con rollback.
- TypeScript, ESLint y revisión visual de PWA, caja y dueño verdes.
- Security Advisors: ningún warning nuevo; tres `INFO` intencionales de tablas `private`.
- Performance Advisors: cero claves foráneas Sprint 11 sin índice.
