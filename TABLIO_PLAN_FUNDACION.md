# Tablio — Plan de construcción (CTO)

Documento de gobierno. Explica cómo trabajamos, qué se construye en qué orden,
qué documentos vivos existen y cómo se mantienen actualizados.

---

## 1. Cómo trabajamos

**Flujo de cada sprint:**
1. Yo (CTO) te entrego **un prompt .md** con el sprint completo.
2. Tú lo pegas en **Codex**.
3. Codex lee `AGENTS.md` + el brief congelado + los docs del repo, y ejecuta.
4. Codex entrega código + docs actualizados + un `SPRINT-XX-SUMMARY.md`.
5. Tú me traes ese summary + `BUILD_LOG.md` + ADRs nuevos.
6. Reviso, corrijo, y te entrego el siguiente prompt.

**Un sprint a la vez.** No se avanza al siguiente sin revisar el anterior.

**Regla de oro del repo:** `AGENTS.md` vive en la raíz y Codex lo lee SIEMPRE.
Ahí están las reglas innegociables. Si Codex se desvía, se le apunta a ese archivo.

---

## 2. Stack: lo dado y lo que decide Codex

**Dado (no se discute):**
- **Supabase** — base de datos Postgres + Auth + Realtime + Storage. Encaja con la
  decisión congelada de PostgreSQL + `tenant_id` + Row Level Security.
- **Vercel** — hosting y despliegue.
- Codex debe usar el **MCP de Supabase** para migraciones, consultas y advisors,
  y el **CLI de Vercel** para deploys.

**Lo que decide Codex y justifica en ADR-000:**
- Framework (Next.js u otro compatible con Vercel), lenguaje, estructura de monorepo
  o app única, librería de UI, estrategia de testing, y **cómo implementa la cola
  durable + transactional outbox sobre Supabase** (esto último es la decisión técnica
  más delicada del stack).

---

## 3. Roadmap de sprints

Orden por **criticidad**, como manda el brief: primero la verdad financiera,
después la operación alrededor.

| Sprint | Nombre | Qué entrega |
|---|---|---|
| **S0** | **Fundación** | Repo, docs vivos, stack justificado, Supabase + Vercel operativos, esqueleto multi-tenant con RLS y test de aislamiento |
| **S1** | Spike de pasarelas | Evidencia real Mercado Pago vs Webpay → **ADR-001**. Incluye probar el "conectar con un botón" (OAuth) |
| **S2** | Núcleo financiero | CheckoutQuote inmutable, PaymentIntent, eventos de proveedor inmutables, confirmación server-side, creación transaccional del pedido, outbox, idempotencia |
| **S3** | Comensal (PWA) | Escaneo + código de presencia → carta → carrito → propina → pago → estado en vivo → repetir ronda |
| **S4** | KDS y durabilidad | Comandas por estación, temporizadores, 86, cola durable, spool de impresión, recuperación tras caídas |
| **S5** | Garzón y mesas | PIN, zonas, cola de tareas, panel de sesiones de mesa, **unir mesas** |
| **S6** | Caja y conciliación | Cierre de turno, conciliación hasta el abono, excepciones, reembolsos auditados |
| **S7** | Boleta DTE | Integración con proveedor autorizado, matriz tributaria por tenant |
| **S8** | **Onboarding y cobro** | Onboarding guiado del dueño, conexión de pasarela con botón, planes por tamaño, superadmin, billing y morosidad |
| **S9** | Excepciones y multi-local | Crédito de mesa permisado, dueño multi-local, feature flags |
| **S10** | Endurecimiento y piloto | Carga calculada, caos testing, criterios de lanzamiento, piloto controlado |

**Nota:** el modelo de datos de mesas/zonas/estaciones se define en S0-S2 porque el
onboarding (S8) y el **pricing por tamaño** dependen de él.

---

## 4. Documentos vivos del repo

Codex los mantiene actualizados en cada sprint. Si un cambio no se refleja en los docs,
el sprint no está terminado.

```
/AGENTS.md                    ← reglas innegociables. Codex lo lee siempre.
/README.md                    ← cómo levantar y correr el proyecto (para no-dev)
/docs/
  BUILD_LOG.md                ← bitácora: fecha, qué cambió, por qué (lenguaje simple)
  GLOSSARY.md                 ← cada término técnico en una línea, en español
  DOMAIN_MAP.md               ← dominios y cómo se relacionan
  DATA_MODEL.md               ← tablas, relaciones, claves, RLS, explicado
  DECISION_RECORD.md          ← cambios a decisiones congeladas (requieren aprobación)
  BACKLOG.md                  ← ideas parqueadas (no desvían el sprint actual)
  OPEN_ISSUES.md              ← asuntos abiertos: qué falta, qué evidencia, qué bloquea
  /adr/ADR-XXX-*.md           ← una decisión técnica por archivo
  /sprints/SPRINT-XX-SPEC.md  ← qué se planeó
  /sprints/SPRINT-XX-SUMMARY.md ← qué se entregó
  /review/REVIEW-PACKET-XX.md ← paquete para revisión externa (al cerrar sprints clave)
/brief/
  TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md   ← la constitución (no se edita)
  TABLIO_BACKLOG_Y_DECISIONES_POST_FREEZE.md     ← lo posterior al congelamiento
```

**Cómo se actualizan:** al final de cada sprint, Codex actualiza `BUILD_LOG.md`,
`DATA_MODEL.md`, `GLOSSARY.md`, `OPEN_ISSUES.md` y crea los ADRs que correspondan.
No es opcional: es parte de la definición de terminado.

---

## 5. Definición de terminado (todo sprint)

1. El código corre y se puede ver funcionando (con pasos copiables).
2. Los docs vivos están actualizados.
3. Los ADRs de las decisiones tomadas están escritos.
4. Los tests de las rutas críticas pasan.
5. Existe `SPRINT-XX-SUMMARY.md` entendible por un no-desarrollador.

**Adicional para sprints que tocan plata (S1, S2, S6, S7, S8):**
6. Ninguna prueba deja abierta la posibilidad de producir sin pago confirmado,
   duplicar efectos comerciales, o cruzar datos entre tenants.

---

## 6. Decisiones ya tomadas (no se rediscuten)

| # | Decisión | Estado |
|---|---|---|
| — | Prepago individual como producto principal | 🔒 Congelada |
| — | Beachhead: bares de alto flujo | 🔒 Congelada |
| — | Modelo A: el bar es comercio directo, Tablio no custodia fondos | 🔒 Congelada |
| — | Multi-tenant: Postgres + `tenant_id` + RLS | 🔒 Congelada |
| — | Nada se produce sin confirmación server-side | 🔒 Congelada |
| — | CheckoutQuote inmutable | 🔒 Congelada |
| — | Idempotencia: cero efectos duplicados | 🔒 Congelada |
| — | Conciliación hasta el abono | 🔒 Congelada |
| — | Colas durables, nunca en memoria | 🔒 Congelada |
| — | Producto completo, no MVP | 🔒 Congelada |
| **NEW** | **Base de datos: Supabase** | ✅ Decidida |
| **NEW** | **Hosting: Vercel** | ✅ Decidida |
| **NEW** | **Pricing: por tamaño del local (mesas/zonas/estaciones). SIN fee por transacción.** | ✅ Decidida |

**Consecuencia importante del pricing sin fee:** no se usa `application_fee` ni split de
pagos. Tablio nunca toca el dinero de las ventas. Modelo A queda puro y se evita el
riesgo de figurar como facilitador de pagos.

---

## 7. Decisiones abiertas

| # | Decisión | Bloquea | Se resuelve en |
|---|---|---|---|
| ADR-000 | Framework y estructura del repo | S0 | S0 (Codex propone) |
| ADR-001 | **Pasarela primaria** | S2 en adelante | S1 (spike con evidencia) |
| ADR-002 | Implementación de cola durable + outbox sobre Supabase | S2 | S0/S2 |
| ADR-003 | UX de conexión de pasarela por el dueño (OAuth vs credenciales) | S8 | S1 |
| ADR-004 | Proveedor DTE | S7 | Antes del primer pago real |
| ADR-005 | Cortes exactos de los planes por tamaño | S8 | Con datos de las llamadas |

**Hipótesis fuerte para S1:** Mercado Pago tiene OAuth para plataformas — el dueño
conecta su cuenta con un clic y los fondos van a su cuenta. Transbank/Webpay
normalmente requiere contrato y código de comercio gestionado, sin OAuth. Si el
onboarding ágil es requisito, esto inclina ADR-001 hacia Mercado Pago. **Debe
confirmarse con evidencia en el spike, no asumirse.** La arquitectura debe abstraer
la pasarela detrás de un adaptador para no quedar casada con ninguna.
