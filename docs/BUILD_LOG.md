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
