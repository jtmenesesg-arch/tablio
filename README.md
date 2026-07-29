# Tablio

Tablio convierte cada mesa de un bar en un punto de venta: cada persona escanea el QR de su
mesa, arma su pedido y paga lo suyo. El local recibe únicamente pedidos confirmados y pagados,
listos para producir.

## Estado actual

El proyecto completó **Sprint 10 — endurecimiento y preparación del piloto**. El flujo pedido
pagado → producción → entrega → cierre → respaldo tributario simulado pasó aislamiento
negativo, carga, caos, recuperación, rendimiento móvil y accesibilidad operativa. Queda apto
para demo y como candidato a piloto controlado después de cerrar sus bloqueantes; todavía no
está autorizado para operar dinero real.

[`ADR-001`](docs/adr/ADR-001-payment-gateway-spike.md) está **PROPUESTO, NO DECIDIDO**.
Mercado Pago y Transbank se investigaron documentalmente y todo hallazgo permanece como
hipótesis hasta probarlo con cuentas reales antes del piloto.

## Principios que no se cambian sin aprobación

- Cada persona paga su propio pedido antes de producir. La única excepción es crédito de mesa
  explícitamente habilitado, permisado y visible como deuda.
- Tablio no recibe, retiene ni reparte el dinero de las ventas del bar.
- La mensualidad que el bar paga a Tablio es un flujo separado de toda venta del bar.
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

Luego abre estas direcciones:

- Onboarding del dueño: `http://localhost:3000/onboarding`.
- Superadmin: `http://localhost:3000/superadmin`.
- PWA: `http://localhost:3000/mesa/demo-mesa-8`, código `4826`.
- KDS: `http://localhost:3000/kds`; elige Barra, Cocina o Todas.
- Garzón: `http://localhost:3000/garzon`; PIN demo `2468`.
- Caja: `http://localhost:3000/caja`.
- Crédito de mesa: `http://localhost:3000/credito`.
- Panel del dueño: `http://localhost:3000/dueno`.

La PWA debe decir “MODO DEMO · NO MUEVE DINERO REAL” y el KDS debe mostrar permanentemente su
conexión y la hora de la última sincronización.

El laboratorio financiero separado sigue en `http://localhost:3000/demo/payments`.

## Cómo correr las verificaciones

La puerta completa acordada para CI será:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
pnpm load:sprint10
pnpm perf:sprint10
```

En incrementos que cambien PostgreSQL se agrega `supabase test db`. Las suites 001–010 suman
316 controles pgTAP verdes.

La verificación remota y el recorrido real Auth → JWT → RLS pasaron. El control negativo
reemplazó una policy por otra deliberadamente insegura dentro de una transacción: el test quedó
rojo, se hizo rollback y las suites volvieron a verde.

Los resultados y límites están en
[`LOAD_AND_CHAOS_REPORT.md`](docs/LOAD_AND_CHAOS_REPORT.md); la instalación y contingencias,
en [`PILOT_PLAYBOOK.md`](docs/PILOT_PLAYBOOK.md); y lo que falta para usar dinero real, en
[`REAL_MONEY_BLOCKERS.md`](docs/REAL_MONEY_BLOCKERS.md).

## PWA demo

La PWA permite recorrer mesa → carta → carrito → quote → pago → pedido → comandas. Cada
dispositivo tiene cookie y carrito propios. La sesión se recupera al recargar y la pantalla
consulta nuevamente el estado al reconectar.

“Pagar con el garzón” sólo crea un aviso visual y operativo: la pantalla declara que no está
pagado y que nada fue enviado a la barra.

## KDS demo

El KDS recibe sólo comandas pagadas, filtra estaciones configurables, muestra temporizadores y
permite avanzar cada comanda con control de versión. Marcar un producto agotado actualiza la
carta de inmediato; el sondeo de 45 segundos queda sólo como red de seguridad.

La demo persiste comandas y spool en `.tablio-demo/` para probar reinicios sin una base local.
Producción usa las tablas PostgreSQL/RLS ya aplicadas, Broadcast privado como aviso y consulta
durable como recuperación. El envío físico a una impresora sigue detrás de `PrinterPort`.

## Panel del garzón

El panel usa PIN hasheado, zonas configurables y una cola persistente. Realtime avisa y la
consulta periódica recupera. Una tarea de 12 minutos se vuelve crítica; una zona sin cobertura
queda visible para todos y escala a administración. Cerrar turno muestra pendientes, deja
snapshot auditado y nunca borra el trabajo.

## Crédito de mesa y panel del dueño

El crédito está apagado por defecto y se presenta siempre como excepción con riesgo. Límites,
vencimiento, pagos parciales, código vivo y fuga quedan auditados. Prepago y crédito pueden
coexistir en una mesa, pero sus cifras nunca se compensan.

El panel del dueño usa cifras calculadas en servidor y reglas deterministas para contar qué
pasó, qué requiere atención y qué conviene revisar. También muestra el costo mensual del
crédito. Un tenant nuevo ve datos actuales y una fecha estimada para sus primeras
comparaciones.

## Panel de caja

`/caja` muestra sesiones y montos procesados —no deuda de mesa—, métricas del turno,
excepciones críticas, conciliación sintética y cierre. Reembolsar exige permiso y motivo. El
cierre es inmutable y exportable; una aprobación tardía conserva hora de proveedor y recepción.

La producción manual de un pago aprobado tras vencer el quote dura 20 minutos configurables.
Una devolución posterior al cierre no descuenta propina al trabajador: crea un ajuste a cargo
del local según ADR-005. Todo está marcado como modo demo y no mueve dinero real.

## Boleta electrónica demo

La confirmación del pedido no espera la boleta. La PWA muestra “emitiendo” y luego permite
abrir la representación demo. Caja completa la tercera columna de conciliación, alerta cuando
hay más de 10 documentos pendientes o alguno supera 15 minutos y muestra el proveedor DTE
funcionando, degradado o caído.

El reembolso monetario tampoco espera una nota de crédito: la devolución se completa y la
obligación tributaria pendiente queda crítica y reintentable. El puerto
`TaxDocumentProvider` y el adaptador simulado no reemplazan la validación con proveedor real y
asesor tributario exigida antes del piloto.

En Supabase, el outbox tributario va a una cola y DLQ propias. La Edge Function
`tax-document-consumer` está desplegada y se ejecuta cada minuto con `pg_cron`. La llamada
automática combina un JWT público válido con un segundo secreto aleatorio guardado en Vault;
la función usa `service_role` sólo internamente. Ninguna ruta de la PWA o caja puede consumir
esa cola.

## Laboratorio de pagos

La demo permite ejecutar aprobado, rechazado, webhook duplicado, evento tardío/fuera de orden
y reembolso total/parcial. El backend verifica una firma simulada y consulta el estado
server-side antes de registrar evento + outbox.

Es un laboratorio en memoria y nunca debe conectarse a datos reales.

## Onboarding y superadmin demo

`/onboarding` guarda progreso parcial y recorre configuración, importación/revisión de carta,
tributación, cuenta simulada del bar, personal, QRs, pruebas y producción. PDF, imagen y link
usan extracción simulada; la prohibición de publicar sin revisión humana sí está aplicada.

`/superadmin` muestra tenants y métricas, permite simular cobro/reintento, feature flags e
impersonación con motivo. Los planes se basan principalmente en mesas: hasta 12, 30, 60 y
personalizado. Precios y cortes son hipótesis comerciales.

El adaptador de cobro SaaS no mueve dinero. Es distinto del adaptador con que cada bar recibe
pagos de sus comensales.

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
