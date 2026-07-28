# Tablio

Tablio convierte cada mesa de un bar en un punto de venta: cada persona escanea el QR de su
mesa, arma su pedido y paga lo suyo. El local recibe únicamente pedidos confirmados y pagados,
listos para producir.

## Estado actual

El proyecto cerró **Sprint 0 — Fundación**. El stack fue aprobado en
[`docs/adr/ADR-000-stack.md`](docs/adr/ADR-000-stack.md) y la estructura documental está
creada. El esquema multi-tenant, RLS y el Custom Access Token Hook están aplicados y
verificados en el proyecto Supabase actual; la aplicación ejecutable comienza en Sprint 1.

Esto significa que hoy se puede revisar la arquitectura, las migraciones y los tests de base,
pero aún no hay pantallas ni despliegue web funcional que probar.

## Principios que no se cambian sin aprobación

- Cada persona paga su propio pedido antes de que el local lo produzca.
- Tablio no recibe, retiene ni reparte el dinero de las ventas del bar.
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
apps/              aplicaciones web (se crea en el próximo incremento técnico)
packages/          dominio y componentes compartidos (pendiente)
supabase/          migraciones, configuración y tests de aislamiento
tests/             integración y recorridos completos (pendiente)
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

Estos serán los comandos oficiales una vez creado el esqueleto ejecutable en Sprint 1:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Luego se abrirá la dirección local que imprima `pnpm dev`.

**Estado hoy:** `supabase/config.toml` y las migraciones ya existen. `pnpm dev` sigue pendiente
porque aún no existen `package.json` ni `pnpm-lock.yaml`. Las limitaciones están registradas en
[`docs/OPEN_ISSUES.md`](docs/OPEN_ISSUES.md).

## Cómo correr las verificaciones

La puerta completa acordada para CI será:

```bash
pnpm lint
pnpm typecheck
pnpm test
supabase test db
pnpm build
pnpm test:e2e
```

El test de base debe demostrar que tenant A no puede leer ni modificar datos de tenant B. Una
entrega no se considera terminada si alguna verificación falla.

La verificación remota verde y el recorrido real Auth → JWT → RLS ya pasaron. La suite pgTAP y
su control negativo están versionados; el ciclo rojo → verde se ejecutará en staging aislado,
a más tardar antes del piloto.

## Cómo desplegar

El repositorio local ya está vinculado al proyecto Vercel `tablio`, pero todavía no se
despliega porque no existe aplicación.

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
