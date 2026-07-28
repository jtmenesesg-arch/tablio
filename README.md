# Tablio

Tablio convierte cada mesa de un bar en un punto de venta: cada persona escanea el QR de su
mesa, arma su pedido y paga lo suyo. El local recibe únicamente pedidos confirmados y pagados,
listos para producir.

## Estado actual

El proyecto cerró **Sprint 3 — PWA del comensal**. La persona ya puede entrar por QR/código,
ver la carta, mantener su carrito propio, dejar propina, pagar con el adaptador simulado y
seguir comandas independientes por estación. El esquema remoto conserva carrito, quote
inmutable, confirmación server-side, pedido, stock, outbox, RLS y ahora sesiones anónimas,
catálogo visible y acciones de mesa. No hay pasarela real.

[`ADR-001`](docs/adr/ADR-001-payment-gateway-spike.md) está **PROPUESTO, NO DECIDIDO**.
Mercado Pago y Transbank se investigaron documentalmente y todo hallazgo permanece como
hipótesis hasta probarlo con cuentas reales antes del piloto.

## Principios que no se cambian sin aprobación

- Cada persona paga su propio pedido antes de que el local lo produzca.
- Tablio no recibe, retiene ni reparte el dinero de las ventas del bar.
- La mensualidad que el bar paga a Tablio es un flujo separado, planificado para Sprint 8.
- Todos los datos de negocio llevan `tenant_id` y están protegidos con Row Level Security.
- El frontend nunca confirma un pago.
- Los mensajes repetidos no pueden crear efectos comerciales repetidos.
- El trabajo crítico se guarda en PostgreSQL/colas durables, nunca solo en memoria.

La fuente completa de estas reglas es [`AGENTS.md`](AGENTS.md) y el
[brief congelado](brief/TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md).

## Estructura

```text
AGENTS.md          reglas de operación de Codex
brief/             constitución del producto y decisiones posteriores
docs/              documentación viva, ADRs, revisiones y resúmenes de sprint
apps/web/          PWA Next.js y laboratorio visual de pagos
packages/          puerto de aplicación y adaptador de pagos simulado
supabase/          migraciones, configuración y tests financieros/aislamiento
tests/             recorridos completos Playwright
```

## Herramientas acordadas

- Node.js 24.x
- pnpm
- Next.js + TypeScript
- Supabase CLI enlazado al proyecto actual
- Vercel CLI para previews y producción

No instales versiones globales a ciegas. Cuando se inicialice el proyecto, las versiones
quedarán fijadas en el repositorio y el lockfile.

## Cómo levantar el proyecto

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Luego abre `http://localhost:3000/mesa/demo-mesa-8` y usa el código `4826`. La franja debe decir
“MODO DEMO · NO MUEVE DINERO REAL”.

El laboratorio financiero separado sigue en `http://localhost:3000/demo/payments`.

## Cómo correr las verificaciones

La puerta completa acordada para CI será:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
```

En incrementos que cambien PostgreSQL se agrega `supabase test db`. Sprint 3 suma 17 controles
pgTAP y 6 recorridos E2E en un perfil Pixel 5.

La verificación remota verde y el recorrido real Auth → JWT → RLS ya pasaron. La suite pgTAP y
su control negativo están versionados; el ciclo rojo → verde se ejecutará en staging aislado,
a más tardar antes del piloto.

## PWA demo

La PWA permite recorrer mesa → carta → carrito → quote → pago → pedido → comandas. Cada
dispositivo tiene cookie y carrito propios. La sesión se recupera al recargar y la pantalla
consulta nuevamente el estado al reconectar.

“Pagar con el garzón” sólo crea un aviso visual y operativo: la pantalla declara que no está
pagado y que nada fue enviado a la barra.

## Laboratorio de pagos

La demo permite ejecutar aprobado, rechazado, webhook duplicado, evento tardío/fuera de orden
y reembolso total/parcial. El backend verifica una firma simulada y consulta el estado
server-side antes de registrar evento + outbox.

Es un laboratorio en memoria y nunca debe conectarse a datos reales.

## Cómo desplegar

El repositorio local está vinculado al proyecto Vercel `tablio`. Antes del primer despliegue se
debe verificar que Root Directory apunte a `apps/web`; Sprint 1 no publica producción.

Cuando `apps/web` esté creado y la configuración de Vercel apunte a ese directorio:

```bash
vercel
vercel --prod
```

- `vercel` crea una versión de prueba.
- `vercel --prod` publica en producción.

Las variables se configuran en Supabase/Vercel o en `.env.local`. Los archivos `.env*` y
`.vercel/` están ignorados por Git. Nunca se pega una clave en código, documentación, commits
o logs.

## Documentación principal

- [`docs/DOMAIN_MAP.md`](docs/DOMAIN_MAP.md): dominios y relaciones.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md): modelo de datos y reglas RLS.
- [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md): qué cambió y por qué.
- [`docs/OPEN_ISSUES.md`](docs/OPEN_ISSUES.md): decisiones pendientes.
- [`docs/BACKLOG.md`](docs/BACKLOG.md): ideas estacionadas fuera del sprint.
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md): términos técnicos en español simple.

## Seguridad

Si encuentras una credencial en el repositorio, no la uses ni la copies: revócala y repórtala.
No publiques detalles de vulnerabilidades o datos de clientes en un issue público.
