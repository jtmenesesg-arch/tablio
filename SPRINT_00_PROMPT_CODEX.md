# SPRINT 0 — Fundación · Prompt para Codex

> Pega este contenido completo en Codex como primera tarea del proyecto.
> Antes de pegarlo, sube al repo: `AGENTS.md` (raíz),
> `/brief/TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md` y
> `/brief/TABLIO_BACKLOG_Y_DECISIONES_POST_FREEZE.md`.

---

## CONTEXTO

Eres el ingeniero implementador de **Tablio**. Antes de hacer nada, lee completos:

1. `AGENTS.md` en la raíz del repositorio (tus reglas de operación).
2. `/brief/TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md` (la constitución del producto).
3. `/brief/TABLIO_BACKLOG_Y_DECISIONES_POST_FREEZE.md` (decisiones posteriores y backlog).

Tablio convierte cada mesa de un bar en un punto de venta: cada persona escanea el QR de su
mesa, arma su pedido y paga lo suyo; el bar solo produce pedidos ya pagados.

**Construimos el producto completo, no un MVP.** El orden de construcción sigue la
criticidad: primero la verdad financiera y el aislamiento de datos, después la operación.

Este es el **Sprint 0: Fundación**. No se construyen pantallas de producto todavía.

---

## OBJETIVO

Dejar el proyecto en un estado donde cualquier sprint posterior pueda construirse sobre una
base correcta: repositorio ordenado, documentación viva, stack justificado, Supabase y Vercel
operativos, y el esqueleto multi-tenant con Row Level Security **probado**.

Al final de este sprint debe ser imposible que un tenant vea datos de otro, y debe estar
demostrado con un test automático.

---

## TAREAS

### 1. Propuesta de stack (ADR-000) — ENTREGAR PRIMERO Y ESPERAR APROBACIÓN

Antes de escribir código de producto, entrega una propuesta breve y justificada de:

- Framework y lenguaje (compatible con Vercel).
- Estructura del proyecto (monorepo o app única; cómo se organizan las apps del comensal,
  los paneles operativos y el backend).
- Librería de UI y estrategia de estilos.
- Estrategia de testing (unit, integración, y cómo se probarán las rutas de plata).
- **Cómo implementarás la cola durable + transactional outbox sobre Supabase.** Esta es la
  decisión más delicada del stack: explica alternativas (tablas de outbox con polling,
  `pg_cron`, Edge Functions, colas externas) y por qué eliges una.
- Cómo se maneja el contexto de tenant por request.

**Restricciones que la propuesta debe cumplir:** Supabase como base de datos (Postgres +
RLS), Vercel como hosting, realtime aislado por tenant, PWA sin instalación para el comensal,
confirmación de pago server-side, durabilidad sin dependencias en memoria.

Escribe esto como `/docs/adr/ADR-000-stack.md` y **detente ahí hasta recibir aprobación.**

---

### 2. Estructura del repositorio y documentos vivos

Una vez aprobado el stack, crea la estructura completa:

```
/AGENTS.md
/README.md
/brief/            (los 2 documentos ya subidos)
/docs/
  BUILD_LOG.md
  GLOSSARY.md
  DOMAIN_MAP.md
  DATA_MODEL.md
  DECISION_RECORD.md
  BACKLOG.md
  OPEN_ISSUES.md
  /adr/
  /sprints/
  /review/
```

- `README.md` debe explicar, **para alguien que no programa**, cómo levantar el proyecto,
  cómo correr los tests y cómo desplegar.
- `BACKLOG.md` debe poblarse con las ideas de la sección 2 del documento post-freeze
  (fidelización, upsell en checkout, happy hour dinámico, giftcard, propina por garzón,
  cafeterías como vertical futuro). **Ninguna se construye ahora.**
- `OPEN_ISSUES.md` debe listar las decisiones abiertas conocidas: pasarela primaria (ADR-001),
  proveedor DTE, cortes de los planes por tamaño, UX de conexión de pasarela.

---

### 3. Proyecto Supabase y esquema base multi-tenant

Usando el **MCP de Supabase**, crea las migraciones del esqueleto. El modelo debe reflejar
el `DOMAIN_MAP` del brief. Como mínimo en este sprint:

- `tenants` — el local (bar). Con datos de identidad, estado, plan y configuración.
- `venues` / `zones` — zonas del local (terraza, salón, barra).
- `tables` — mesas, con su identificador de QR **no predecible** y su **código corto de
  presencia**. `UNIQUE (tenant_id, table_number)`.
- `stations` — estaciones de producción (barra, cocina). Necesario para las comandas.
- `employees` — personal con rol y PIN hasheado. `UNIQUE (tenant_id, employee_pin_hash)`.
- `roles` / permisos — los 6 roles del brief: comensal, garzón, KDS, cajero/admin, dueño,
  superadmin.
- `audit_log` — registro de acciones sensibles (quién, cuándo, qué, por qué).

**Requisitos obligatorios:**
- `tenant_id` en toda tabla de negocio.
- **Row Level Security activo** en todas las tablas sensibles, con políticas escritas.
- Claves únicas **compuestas con `tenant_id`**.
- Contexto de tenant establecido por request.
- Storage segmentado por tenant.

**Importante para el futuro:** el modelo de `zones`, `tables` y `stations` es lo que después
determinará el **plan de precios por tamaño del local** y alimentará el onboarding guiado
(Sprint 8). Diséñalo pensando en que esos datos se recolectan en el onboarding y se consultan
para clasificar al cliente en un plan.

**No hardcodees supuestos de bar.** El catálogo, las estaciones y los modos deben ser
configurables por tenant, para que entrar a otro vertical (ej. cafeterías) sea configuración
y no reescritura.

Ejecuta también los **advisors de seguridad de Supabase** y corrige lo que reporten.

---

### 4. Test automático de aislamiento entre tenants

Escribe un test que:
- Cree dos tenants con datos propios.
- Intente, desde el contexto del tenant A, leer y modificar datos del tenant B.
- **Falle el build si alguna de esas operaciones tiene éxito.**

Este test es la garantía viva de la decisión congelada de multi-tenant. Debe correr en CI.

---

### 5. Despliegue en Vercel y CI

- Proyecto conectado y desplegando (usa el CLI de Vercel).
- Variables de entorno configuradas correctamente; **ningún secreto en el repo**.
- CI que corra linter y tests en cada push, incluyendo el test de aislamiento.
- Documenta en `README.md` cómo desplegar y cómo configurar las variables.

---

## RESTRICCIONES

- No construyas pantallas de producto (carta, checkout, KDS) en este sprint.
- No implementes lógica de pagos todavía: la pasarela se decide en el Sprint 1 con evidencia.
  Solo deja el **adaptador abstracto** preparado para que no quedemos casados con un proveedor.
- **No implementes fee por transacción, `application_fee` ni split de pagos.** El pricing es
  por tamaño del local y Tablio nunca toca el dinero de las ventas.
- No inventes: si algo depende de probar una pasarela real, márcalo como hipótesis en
  `OPEN_ISSUES.md`.

---

## CRITERIOS DE ACEPTACIÓN

1. `ADR-000` escrito, con el stack justificado contra las restricciones.
2. Estructura de repo y todos los documentos vivos creados y poblados.
3. Migraciones aplicadas en Supabase con `tenant_id` y **RLS activo** en tablas sensibles.
4. Claves únicas compuestas con `tenant_id` implementadas.
5. **El test de aislamiento entre tenants pasa y falla correctamente cuando se rompe RLS.**
6. Advisors de seguridad de Supabase revisados y sin hallazgos críticos.
7. Proyecto desplegando en Vercel, con CI corriendo tests.
8. `README.md` entendible por alguien que no programa.
9. `BUILD_LOG.md` actualizado con lo hecho y por qué.
10. `SPRINT-00-SUMMARY.md` escrito para un no-desarrollador.

---

## DEFINICIÓN DE TERMINADO

- El proyecto corre localmente y en Vercel, con pasos copiables documentados.
- Todos los documentos vivos están actualizados.
- Los tests pasan en CI, incluido el de aislamiento.
- Existe `/docs/sprints/SPRINT-00-SUMMARY.md` con: qué se construyó (en negocio y en técnico),
  cómo verlo funcionar, qué se probó, qué se decidió y qué queda abierto.

---

## PRIMER PASO AHORA

Lee `AGENTS.md` y los dos documentos de `/brief/`. Después entrega **únicamente** la propuesta
de stack (`ADR-000`) y espera aprobación antes de escribir código de producto.
