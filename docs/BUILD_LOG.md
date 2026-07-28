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
