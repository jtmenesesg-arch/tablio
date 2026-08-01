# CLAUDE.md — Guía rápida para Claude Code en Tablio

> **La fuente de reglas es [`AGENTS.md`](AGENTS.md).** Léelo completo al inicio de cada sesión;
> es la ley del proyecto y contiene el detalle de cada punto resumido aquí. Este archivo no
> repite ese contenido, solo lo indexa para orientarte rápido.

## Qué es Tablio

Tablio convierte cada mesa de un bar en un punto de venta. Cada persona escanea el QR de su
mesa, arma su propio carrito y **paga lo suyo** desde el celular. El bar solo produce pedidos
**ya pagados**.

```
persona → carrito → CheckoutQuote inmutable → confirmación de pago server-side
        → pedido → comandas por estación
```

La mesa es contexto físico/operativo, **no** una cuenta financiera compartida. Beachhead: bares
de alto flujo (viernes 23:30, ruido, apuro). Ver el detalle completo en
[`brief/TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md`](brief/TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md)
y las decisiones posteriores en
[`brief/TABLIO_BACKLOG_Y_DECISIONES_POST_FREEZE.md`](brief/TABLIO_BACKLOG_Y_DECISIONES_POST_FREEZE.md).

## Decisiones congeladas (no se cambian por tu cuenta)

Prepago individual como modo principal · Modelo A (cada bar es comercio directo, Tablio nunca
custodia fondos) · multi-tenant con PostgreSQL + `tenant_id` + RLS · nada se produce sin
confirmación de pago server-side (salvo crédito de mesa permisado) · CheckoutQuote inmutable ·
idempotencia real · conciliación hasta el abono · durabilidad sin colas en memoria · producto
completo (no MVP) · pricing por tamaño del local, sin fee por transacción.

Detalle completo, incluido cómo proponer un cambio, en `AGENTS.md` §2 y en
[`docs/DECISION_RECORD.md`](docs/DECISION_RECORD.md).

## Estándar de rutas de plata

Todo lo que toque pagos, pedidos, boletas, reembolsos o datos de tenant exige: confirmación
server-side verificable (nunca el frontend), CheckoutQuote inmutable, idempotencia real con
`UNIQUE (payment_provider, merchant_account_id, provider_transaction_id)`, aislamiento
multi-tenant probado con RLS + test de control negativo (rojo → restaurar → verde), durabilidad
(outbox, colas, DLQ, spool de impresión — nunca en memoria), `service_role` fuera de rutas de
usuario, y auditoría obligatoria en reembolso/anulación/cambio de precio/cierre/reapertura/
impersonación. Detalle completo en `AGENTS.md` §4.

## Loop de ingeniería (obligatorio)

Un incremento a la vez: cargar contexto → declarar el plan en 2-3 líneas → construir → **verificar
tú mismo, ejecutando** (nunca "debería funcionar") → documentar en los docs vivos → reportar en
español simple → esperar feedback. Si un error persiste tras dos intentos, detente y reporta en
vez de seguir probando a ciegas. Un sprint no cierra sin criterios de aceptación ejecutados,
docs/ADRs actualizados, tests verdes en CI y un `SPRINT-XX-SUMMARY.md`. Detalle completo,
incluido el formato para pedir una decisión al fundador, en `AGENTS.md` §5.

## Documentos vivos que mantienes

```
/docs/BUILD_LOG.md       ← bitácora: qué cambió, por qué, cómo se verificó
/docs/GLOSSARY.md        ← términos técnicos en español simple
/docs/DOMAIN_MAP.md      ← dominios y relaciones
/docs/DATA_MODEL.md      ← tablas, relaciones, claves, RLS
/docs/DECISION_RECORD.md ← cambios a decisiones congeladas (solo con aprobación)
/docs/BACKLOG.md         ← ideas parqueadas fuera del sprint actual
/docs/OPEN_ISSUES.md     ← asuntos abiertos: qué falta, qué bloquea qué
/docs/adr/ADR-XXX-*.md   ← una decisión técnica por archivo
/docs/sprints/SPRINT-XX-SUMMARY.md
/README.md               ← cómo levantar y correr el proyecto, para un no-dev
```

Actualizarlos es parte de la definición de "terminado", no un extra. Antes de tocar un área,
relee sus docs vivos — nunca edites algo cuyo estado actual no acabas de verificar.

## Stack (dado, no se discute)

Supabase (Postgres + Auth + Realtime + Storage, vía **MCP de Supabase**) y Vercel (hosting, vía
**CLI de Vercel**). Framework, estructura y librerías las decide el CTO en ADR — ver
[`docs/adr/ADR-000-stack.md`](docs/adr/ADR-000-stack.md): Next.js App Router + TypeScript
estricto, monorepo `pnpm`, Tailwind + Radix + componentes propios, Vitest + pgTAP + Playwright,
outbox transaccional + Supabase Queues para todo efecto durable.

## Sistema de diseño

`/brand/tablio_branding.html` es la fuente de verdad visual. El sistema de tokens semánticos y
el estado de la migración pantalla por pantalla están en
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — léelo antes de tocar cualquier pantalla.

## Dónde más mirar

- [`docs/OPEN_ISSUES.md`](docs/OPEN_ISSUES.md) — qué está bloqueado y por qué.
- [`docs/REAL_MONEY_BLOCKERS.md`](docs/REAL_MONEY_BLOCKERS.md) — todo lo que falta antes de
  operar con dinero real.
- [`docs/PILOT_PLAYBOOK.md`](docs/PILOT_PLAYBOOK.md) — cómo se instala y opera un piloto.
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md) — jerga técnica explicada en una línea.
