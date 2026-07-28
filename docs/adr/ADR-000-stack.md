# ADR-000 — Stack y arquitectura base de Tablio

- **Estado:** Aprobado con condiciones incorporadas
- **Fecha:** 2026-07-27
- **Aprobación:** fundador, 2026-07-27
- **Alcance:** Sprint 0 — Fundación
- **Decisiones congeladas respetadas:** Supabase, Vercel, prepago individual, Modelo A,
  PostgreSQL compartido con `tenant_id` y RLS, confirmación de pago server-side,
  CheckoutQuote inmutable, idempotencia y durabilidad sin colas en memoria.

## Contexto

Tablio operará en la ruta de la plata de bares de alto flujo. El sistema debe seguir siendo
correcto cuando un mensaje se repita, un worker muera a mitad de una operación, un KDS se
desconecte o dos tenants actúen al mismo tiempo. La arquitectura debe privilegiar integridad,
aislamiento y capacidad de recuperación por sobre conveniencia de corto plazo.

Este ADR propone el stack antes de escribir código. No decide la pasarela de pago ni el
proveedor DTE, y no implementa pantallas de producto.

## Decisión resumida

| Área | Elección |
|---|---|
| Lenguaje | TypeScript estricto para web, API, contratos y workers; SQL para esquema e invariantes |
| Framework | Next.js con App Router sobre Node.js 24.x |
| Repositorio | Monorepo liviano con `pnpm` workspaces; una aplicación web desplegable y paquetes modulares |
| Hosting web | Un proyecto Vercel para la aplicación Next.js |
| Datos y autenticación | Supabase Postgres, Auth, Storage y Realtime |
| Acceso a datos | Migraciones SQL, funciones RPC para transacciones críticas y tipos generados por Supabase; sin ORM |
| UI | Tailwind CSS, Radix Primitives y componentes propios basados en shadcn/ui |
| Pruebas | Vitest, pgTAP sobre Supabase local y Playwright |
| Trabajo asíncrono | Outbox transaccional + Supabase Queues (`pgmq`) + Supabase Cron + Edge Functions |
| Aislamiento | `tenant_id` obligatorio, RLS por membresía/sesión, contexto validado en cada request |
| Entrega al KDS | Realtime para aviso rápido, outbox/Queues para efectos durables y consulta a PostgreSQL para recuperación |

## 1. Framework y lenguaje

### Decisión

Usar **Next.js App Router con TypeScript en modo estricto**, ejecutado en Node.js 24.x y
desplegado en Vercel.

- Las páginas, layouts y Route Handlers viven en la misma aplicación.
- Los Route Handlers forman una capa BFF (*backend for frontend*: backend adaptado a las
  necesidades de esta web), pero la lógica de negocio no vive dentro del framework.
- La lógica de dominio será TypeScript puro, sin importar módulos de Next.js, Supabase ni UI.
- Las operaciones financieras o que cambian varios registros se ejecutarán mediante funciones
  PostgreSQL/RPC transaccionales; no se simularán transacciones desde varias llamadas HTTP.
- Los tipos de la base se generarán desde el esquema de Supabase y se validará en CI que no
  queden desactualizados.
- No se incorpora un ORM. RLS, funciones, constraints, colas y migraciones son capacidades
  centrales de PostgreSQL que deben permanecer explícitas y revisables en SQL.

### Adaptador abstracto de pasarela

Sprint 0 dejará definido un puerto `PaymentGateway` dentro de `packages/application`, sin
implementar todavía una pasarela concreta. El contrato cubrirá, como mínimo, creación de
intento, consulta/confirmación server-side, reversa, reembolso y consulta de liquidación.

Cada proveedor traducirá sus respuestas y webhooks a contratos internos versionados. La capa de
dominio nunca conocerá SDKs, códigos ni formatos de Webpay o Mercado Pago. Una suite contractual
común deberá poder ejecutarse contra cualquier adaptador; ADR-001 escogerá la pasarela primaria
con evidencia del spike real.

### PWA

La superficie del comensal será una PWA que funciona desde el navegador sin exigir
instalación. Tendrá manifest y service worker, pero el caché se limitará al shell visual y
activos estáticos.

**Nunca** se almacenarán para envío posterior operaciones de checkout, confirmación de pago,
creación de pedido o reembolso. Sin conexión verificable, esas operaciones se detienen y
muestran un estado claro. El modo PWA no altera la regla de que nada se produce sin
confirmación server-side.

### Por qué

- Next.js tiene soporte directo en Vercel, Route Handlers y guía oficial para PWA.
- TypeScript permite compartir contratos entre web, dominio y workers.
- Mantener el dominio fuera de Next.js reduce el acoplamiento y permite probar reglas de plata
  sin levantar un servidor web.
- SQL explícito facilita auditar RLS, constraints e idempotencia, que son parte del producto y
  no detalles de persistencia.

## 2. Estructura del repositorio

### Decisión

Usar un **monorepo modular con una sola aplicación desplegable al inicio**. `pnpm` workspaces
gestionará dependencias y scripts; no se agregará un orquestador de builds hasta que tiempos de
CI medidos lo justifiquen.

```text
/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (customer)/       # PWA del comensal
│       │   ├── (operations)/     # garzón, KDS, caja/admin y dueño
│       │   ├── (platform)/       # superadmin Tablio
│       │   └── api/              # BFF, webhooks e ingresos síncronos
│       └── public/
├── packages/
│   ├── domain/                   # entidades, estados e invariantes puras
│   ├── application/              # casos de uso y puertos
│   ├── contracts/                # esquemas de eventos y API versionados
│   ├── database/                 # clientes Supabase, tipos generados y repositorios
│   ├── ui/                       # diseño compartido y componentes accesibles
│   └── config/                   # TypeScript, ESLint y configuración común
├── supabase/
│   ├── migrations/
│   ├── tests/database/           # pgTAP, incluido aislamiento entre tenants
│   ├── seed.sql
│   └── functions/                # consumidores asíncronos y tareas programadas
├── tests/
│   ├── integration/
│   └── e2e/
├── brief/
└── docs/
```

Las superficies comparten despliegue, pero no permisos. Los límites se sostienen en la capa de
aplicación y, de forma no eludible, en RLS. Cada rol tendrá layout, navegación y autorización
propios.

Se separarán en proyectos Vercel distintos solo si mediciones reales muestran una necesidad de
escalado, aislamiento de despliegue o dominios independientes. Vercel permite varios proyectos
desde un mismo monorepo, por lo que esta evolución no exige reescribir el dominio.

### Alternativas consideradas

#### Una aplicación sin paquetes internos

Menos estructura inicial, pero facilita que reglas de negocio, acceso a datos y UI se mezclen.
Se descarta porque las rutas de plata y los seis roles necesitan límites verificables.

#### Varias aplicaciones y varios proyectos Vercel desde el día uno

Entrega aislamiento de despliegue más fuerte, pero duplica configuración, previews y
coordinación de versiones antes de tener evidencia de que sea necesario. Se difiere; la
estructura propuesta permite extraer una superficie después.

#### Microservicios

Se descartan en esta etapa. Añaden fallas de red y consistencia distribuida exactamente donde
Tablio necesita transacciones fuertes. El diseño será un monolito modular con workers
asíncronos durables.

## 3. UI y estrategia de estilos

### Decisión

Usar:

- **Tailwind CSS** para estilos utilitarios compilados sin runtime.
- **Radix Primitives** para comportamiento accesible de controles complejos.
- **shadcn/ui como código inicial, no como caja negra:** los componentes seleccionados se
  copian al paquete `ui`, pasan a ser propiedad del repositorio y se adaptan al sistema visual
  de Tablio.
- Variables CSS como tokens de color, contraste, espaciado, tipografía, radios y estados.

El diseño tendrá al menos dos densidades:

1. **Comensal:** móvil, tacto, baja luz, lectura inmediata y controles grandes.
2. **Operación:** alta densidad, estados muy visibles, teclado/tacto y funcionamiento bajo
   presión.

Accesibilidad mínima: navegación por teclado, foco visible, contraste WCAG AA, etiquetas
semánticas, estados no comunicados solo por color y pruebas automáticas de los flujos críticos.

No se construye ninguna pantalla en Sprint 0.

### Alternativas consideradas

- **CSS Modules solamente:** máximo control y cero dependencia, pero aumenta trabajo repetido
  en seis superficies.
- **Biblioteca visual cerrada:** acelera prototipos, pero dificulta branding, densidad especial
  para KDS y correcciones de accesibilidad.
- **Tailwind sin primitivas accesibles:** insuficiente para diálogos, menús, foco y navegación
  por teclado robustos.

## 4. Estrategia de testing

La puerta de CI ejecutará, en este orden:

1. Formato, lint y TypeScript estricto.
2. Tests unitarios con **Vitest**.
3. Supabase local desde migraciones limpias.
4. Tests de base con **pgTAP**.
5. Tests de integración TypeScript contra Supabase local.
6. Build de producción.
7. Tests end-to-end críticos con **Playwright**.

### Unitarios

Cubren funciones puras: máquinas de estado, cálculo de totales, expiración de
`CheckoutQuote`, permisos, validación de eventos y generación de claves de idempotencia.
No sustituyen pruebas de base.

### Base de datos e integración

pgTAP prueba:

- tablas, claves foráneas y constraints;
- RLS activo y forzado donde corresponda;
- políticas `USING` y `WITH CHECK`;
- claves únicas compuestas con `tenant_id`;
- que tenant A no pueda leer, insertar, modificar ni borrar datos de tenant B;
- que vistas y funciones no creen un camino para saltarse RLS.

Una segunda prueba de integración usa clientes Supabase autenticados como usuarios reales de
tenant A y B. Esto prueba el recorrido por la API, no solo SQL aislado.

El test de aislamiento será una condición obligatoria de CI. Además se incluirá una prueba de
control que aplique deliberadamente una política insegura en una base efímera y demuestre que
la suite falla. Esa mutación nunca se aplica al proyecto remoto.

### Rutas de plata

Cada adaptador de pago deberá cumplir una misma suite contractual. Antes de aprobar una ruta se
probarán, como mínimo:

- confirmación válida, inválida, repetida, tardía y fuera de orden;
- firma inválida y monto/moneda/comercio que no calzan;
- ocho entregas del mismo evento sin duplicar pedido, comanda, boleta ni reembolso;
- caída entre el commit de negocio y el procesamiento del mensaje;
- caída después del efecto y antes de reconocer el mensaje;
- reintentos, backoff, dead-letter y replay;
- asociación obligatoria a CheckoutQuote inmutable;
- aislamiento entre credenciales y transacciones de dos tenants.

Mocks sirven para tests unitarios, pero la aprobación de una pasarela exige además pruebas
contra su sandbox y una venta/reversa controlada cuando corresponda al onboarding.

### End-to-end

Playwright cubre recorridos de navegador por rol y conserva trazas al fallar. Los escenarios de
plata verifican el resultado en la base y en la cola; no se aprueban mirando solo una pantalla.

## 5. Entrega rápida, durabilidad y recuperación

La presentación de pedidos en KDS separa explícitamente tres caminos. Ninguno sustituye a los
otros:

```text
Confirmación server-side confirmada en PostgreSQL
            ├── (a) aviso rápido por Realtime ────────────────→ KDS conectado
            ├── (b) outbox → Queues → consumidores durables ─→ efectos obligatorios
            └── (c) consulta de estado durable ──────────────→ KDS que inicia o reconecta
```

### 5.1 Camino rápido: confirmación → KDS por Realtime

La misma transacción que establece el pedido como `CONFIRMED` crea exactamente una vez el
pedido y sus comandas por estación, registra el outbox y produce un aviso mínimo para un canal
Realtime privado de tenant y estación. Si no se pueden persistir las comandas, la transacción
completa hace rollback y no se anuncia el pedido.

El aviso contiene identificadores, no el pedido como fuente de verdad. Al recibirlo, el KDS
consulta bajo RLS el pedido y sus comandas ya persistidas.

**Objetivo SLO inicial, todavía no verificado:** con el KDS conectado y saludable, el 95% de
los pedidos debe estar visible en la estación correcta en **2 segundos o menos**, medidos desde
el commit de `CONFIRMED` en PostgreSQL hasta el render confirmado en el KDS. El tiempo que la
pasarela tarda en confirmar queda fuera de esta medición. Este objetivo permanece marcado como
**hipótesis no verificada** hasta que exista instrumentación end-to-end que registre p50, p95 y
p99 por tenant/estación bajo carga representativa.

Este camino **no espera** al relay, al intervalo de Cron ni al drenado de Supabase Queues. Un
fallo de Realtime no revierte ni pierde el pedido: únicamente retrasa el aviso visual hasta que
actúe la recuperación.

### 5.2 Camino durable: outbox → Queues → consumidores

Todo efecto posterior que no se puede perder nace de `outbox_events`: creación del trabajo de
spool de impresión, emisión tributaria, conciliación, notificaciones y demás integraciones o
proyecciones críticas. La cola garantiza que el trabajo quede pendiente aunque un consumidor o
una integración estén caídos.

La creación del pedido y sus comandas **no** pertenece a este drenado: ocurre dentro de la
transacción de confirmación descrita en 5.1, precisamente para que el KDS no dependa del
intervalo de la cola.

### Decisión

Implementar esta canalización:

```text
Transacción de negocio
  └── cambio de estado + outbox_events inmutable
          ↓ relay PostgreSQL programado
     Supabase Queues (pgmq, tabla logged)
          ↓ lectura con visibility timeout
     Supabase Edge Function consumidora
          ↓
     efecto idempotente + recibo de consumo
          ↓
     archive en éxito / reintento / dead-letter
```

#### 5.2.1 Escritura atómica

Toda operación crítica será una función transaccional que:

1. valida el estado anterior y la idempotencia;
2. persiste el cambio de negocio;
3. inserta un evento inmutable en `outbox_events`;
4. confirma ambos cambios en el mismo commit PostgreSQL.

Si uno falla, todo hace rollback. El frontend no publica eventos críticos directamente.

#### 5.2.2 Relay

Supabase Cron (`pg_cron`) ejecuta una función PostgreSQL de relay a intervalo corto. La función
reclama lotes con `FOR UPDATE SKIP LOCKED`, envía cada referencia a una **Supabase Queue básica
y durable** mediante `pgmq.send`, y registra la publicación dentro de la misma transacción.

El mensaje transporta como mínimo `event_id`, `tenant_id`, `event_type`, `schema_version` y
`occurred_at`. El cuerpo de verdad permanece en `outbox_events`; esto permite auditar y
reproducir sin depender del payload de transporte.

#### 5.2.3 Consumo

Supabase Cron invoca una Edge Function autenticada para drenar lotes. El consumidor:

- usa lectura con visibility timeout, nunca `pop`, para no borrar antes de procesar;
- valida versión y esquema del evento;
- registra `UNIQUE (consumer_name, event_id)` antes o junto al efecto local;
- archiva el mensaje solo después del éxito;
- en error deja que vuelva a ser visible con backoff;
- después del máximo de intentos lo mueve a una dead-letter queue y crea una alerta operativa;
- permite replay auditado, conservando la causa y al operador.

Supabase Queues evita perder el mensaje, pero **no convierte todo el sistema en exactamente una
vez**. Un worker puede morir después del efecto y antes del archive. Por eso la semántica de
Tablio será **entrega al menos una vez + efectos idempotentes**.

#### 5.2.4 Política de reintentos, backoff y dead-letter

La política por defecto es explícita y versionada:

| Intento fallido | Próxima espera máxima |
|---|---:|
| 1 | 5 segundos |
| 2 | 15 segundos |
| 3 | 45 segundos |
| 4 | 2 minutos |
| 5 | 5 minutos |
| 6 | 15 minutos |
| 7 | 30 minutos |
| 8 | 60 minutos |

- Se usa backoff exponencial con *full jitter*: cada espera real se sortea entre cero y el
  máximo de la tabla para evitar que todos los workers reintenten juntos.
- Timeouts, errores de red, límites temporales y respuestas `5xx` son reintentables.
- Payload inválido, versión desconocida, permiso imposible o configuración ausente pasan
  directamente a revisión/DLQ porque repetir sin corregir no ayuda.
- Cada intento queda en `outbox_deliveries` con consumidor, evento, tenant, número de intento,
  timestamps y código de error sanitizado.
- Después del octavo fallo reintentable, el mensaje se mueve a una cola
  `dead_letter_<consumer>` y genera alerta. No se borra el evento original.
- El replay requiere causa corregida, actor, motivo y timestamp. Reutiliza el mismo `event_id`
  para que la idempotencia siga vigente.
- Un consumidor puede definir una política más estricta solo si queda documentada y probada;
  nunca puede tener reintentos infinitos silenciosos.

#### 5.2.5 Garantía de consumidores idempotentes

Cada consumidor implementa las cuatro defensas:

1. `processed_events` posee `UNIQUE (consumer_name, event_id)`.
2. Para efectos dentro de PostgreSQL, el recibo de consumo y el efecto se escriben en la misma
   transacción. Si el recibo ya existe, se responde éxito sin repetir el efecto.
3. Cada efecto de negocio tiene además su constraint natural: por ejemplo, una comanda por
   pedido/estación y un `provider_transaction_id` único por comercio.
4. Para un proveedor externo se envía una clave estable derivada de
   `consumer_name:event_id:operation`. Si el worker cae después de llamar al proveedor pero
   antes de guardar el recibo, el reintento consulta el estado remoto o reutiliza esa clave
   antes de intentar un nuevo efecto.

La suite de contrato mata deliberadamente al consumidor antes y después del efecto, y entrega
el mismo evento ocho veces. El resultado aceptable es un solo efecto comercial y un historial
completo de intentos.

#### 5.2.6 Por qué Edge Functions y no Vercel Functions

Edge Functions permanecen en el plano de datos de Supabase y Cron puede despertarlas para
consumir Queues/RPC sin hacer depender el trabajo durable del despliegue web en Vercel.
El costo es un segundo runtime Deno; se limita dejando workers delgados y contratos TypeScript
neutrales al runtime, y se reevalúa si esa duplicidad supera el beneficio operativo.

#### 5.2.7 Tenant y seguridad de la cola

- Cada evento y recibo incluye `tenant_id`.
- Las colas no se exponen a clientes web.
- Solo funciones/roles de worker pueden leerlas.
- El worker resuelve el tenant desde el evento persistido, establece contexto y vuelve a
  validar que todas las filas afectadas pertenezcan al mismo tenant.
- Métricas, reintentos y dead-letter se segmentan por tenant sin mezclar payloads.

### 5.3 Camino de recuperación: consulta al reconectar

Al iniciar, recuperar conexión o detectar un hueco de secuencia, el KDS descarta cualquier
suposición basada solo en mensajes y consulta PostgreSQL bajo RLS por todas las comandas no
terminales de sus estaciones. La respuesta incluye una marca monotónica/versionada que permite
reconciliar el estado local.

Después de reconstruir el tablero, el KDS vuelve a suscribirse al canal privado y repite una
consulta corta para cerrar la carrera entre snapshot y suscripción. Estados desconocidos,
mensajes duplicados o fuera de orden se resuelven comparando la versión durable.

### 5.4 Realtime no es la cola ni la fuente de verdad

Realtime se usa para avisar a pantallas que un estado durable cambió. Si una conexión pierde un
mensaje, la pantalla vuelve a consultar la fuente de verdad. Nunca se usa Realtime, memoria de
proceso ni una conexión websocket como transporte único de un pedido confirmado.

### Alternativas consideradas

#### Tabla outbox consumida directamente con polling

Es viable y tiene menos componentes, pero obliga a construir visibilidad temporal, archive,
reintentos, monitoreo y manejo de consumidores sobre una tabla propia. Se conserva
`outbox_events`, pero se usa `pgmq` como transporte especializado.

#### `pg_cron` llamando una Edge Function por cada evento

Reduce el relay, pero acopla cada evento a una llamada HTTP y no deja un buffer durable
especializado entre productor y consumidor. Cron sí se usa para despertar procesos por lotes,
no como cola.

#### Solo Edge Functions o Database Webhooks

Una invocación directa puede fallar y no reemplaza por sí sola el contrato durable de
visibilidad, reintento y dead-letter. Se usan Edge Functions como consumidores, detrás de la
cola.

#### Cola externa (SQS, QStash u otra)

Ofrece capacidades maduras, pero introduce otro proveedor, credenciales, costo y una frontera
de red que no comparte la transacción PostgreSQL. Se reconsiderará con evidencia de volumen,
latencia o límites de Supabase Queues.

#### Cola en memoria o Realtime

Descartada. Pierde mensajes ante reinicios o desconexiones y contradice una decisión congelada.

## 6. Contexto de tenant por request

### Identidad y fuente de verdad

- `tenant_id UUID NOT NULL` existe en toda tabla de negocio.
- `tenant_memberships` relaciona usuarios, tenants, roles y estado.
- La membresía en PostgreSQL es la fuente de verdad.
- Un Custom Access Token Hook agrega al JWT un único claim `tenant_id` activo, obtenido desde
  `private.user_tenant_context` solo si la membresía sigue vigente.
- El claim selecciona el tenant de la request, pero no concede acceso por sí solo: RLS exige
  que coincida con la fila y que la membresía siga activa.
- Cada índice y constraint de negocio incorpora `tenant_id` cuando la unicidad pertenece al
  local.

### Requests de personal

1. El usuario inicia sesión con Supabase Auth.
2. Para cambiar de tenant llama una RPC que verifica membresía, actualiza
   `private.user_tenant_context` y obliga a refrescar el token.
3. El Custom Access Token Hook emite el JWT con el `tenant_id` activo.
4. Next.js crea un cliente Supabase de usuario con publishable key + ese JWT/cookie; nunca
   sustituye su `Authorization` por una llave privilegiada.
5. RLS compara cada fila con `private.current_tenant_id()` y vuelve a comprobar membresía y
   permiso.
6. Las RPC críticas llaman `private.require_tenant_context()`, que obtiene el mismo claim,
   valida membresía y fija `set_config('app.current_tenant_id', ..., true)` solo durante esa
   transacción.
7. `USING` controla filas existentes y `WITH CHECK` impide insertar o mover una fila a otro
   tenant.

Si el JWT no existe, el claim falta, no es UUID, la membresía está suspendida o la ruta contiene
otro tenant, la request termina en `401/403`. Las políticas devuelven falso y la RPC levanta
`insufficient_privilege`: **nunca se elige “todos los tenants” como valor por defecto**.

### Requests del comensal

El comensal no necesita crear una cuenta visible. El dispositivo obtiene una sesión anónima y,
tras validar QR/código de presencia, una sesión de mesa corta y revocable. RLS permite solo las
filas mínimas asociadas a esa sesión, tenant y mesa. El QR por sí solo no entrega acceso general
al tenant.

### Webhooks, cron y workers

Las rutas privilegiadas no aceptan un `tenant_id` declarado libremente:

- un webhook deriva el tenant desde la cuenta de comercio validada y la configuración segura;
- un worker lo deriva del evento persistido;
- una función interna establece contexto transaccional y valida nuevamente el alcance.

La clave con privilegios amplios no se usa en requests normales de tenant. Las funciones
`SECURITY DEFINER`, si son necesarias, vivirán fuera de esquemas expuestos, fijarán
`search_path`, validarán permisos explícitamente y tendrán grants mínimos.

### Política de `service_role`

`service_role`/secret key omite RLS por diseño. Su uso queda limitado a:

1. consumidores de Supabase Queues y jobs programados que procesan eventos ya persistidos;
2. tareas administrativas de infraestructura que no atienden requests de usuario.

Las migraciones se ejecutan con MCP/conexión administrativa de PostgreSQL, no desde una ruta de
la aplicación. Un webhook futuro no recibe privilegio amplio automáticamente: deberá llamar
una RPC mínima y quedar aprobado/testeado en el ADR de pagos.

Controles obligatorios:

- la variable `SUPABASE_SERVICE_ROLE_KEY`/secret equivalente no existe en el proyecto Vercel
  que sirve `apps/web`;
- la fábrica de cliente privilegiado vive solo bajo `supabase/functions/` o un paquete
  `database/admin` importable únicamente por workers;
- ESLint y un test de arquitectura fallan si `apps/web` o una ruta de usuario importa esa
  fábrica o referencia la variable;
- rutas de usuario construyen siempre el cliente desde su JWT;
- jobs derivan `tenant_id` del evento/outbox, fijan contexto transaccional y filtran cada
  consulta explícitamente por ese tenant;
- constraints y foreign keys compuestas siguen protegiendo referencias cruzadas incluso
  cuando RLS no aplica al worker.

Para código privilegiado, `set_config` es defensa adicional y trazabilidad, no una afirmación
falsa de que RLS sigue activo. La seguridad primaria del worker es: superficie separada, RPCs
mínimas, tenant derivado de datos confiables, filtros explícitos, constraints y tests.

### Storage y Realtime

- Storage usa buckets privados y rutas `tenant_id/recurso/...`, con políticas sobre
  `storage.objects`.
- Realtime usa canales privados con tópicos `tenant:<id>:<recurso>`.
- La autorización del canal comprueba membresía o sesión vigente mediante RLS.
- Los eventos llevan identificadores mínimos; los datos se vuelven a leer bajo RLS.

## 7. Consecuencias

### Positivas

- Una sola base transaccional sostiene estado, outbox y cola.
- Los límites de tenant se aplican en PostgreSQL aunque falle una comprobación de UI.
- La lógica crítica se prueba sin depender del framework.
- La aplicación puede crecer por módulos y extraer superficies sin iniciar con
  microservicios.
- Los eventos quedan auditables y reproducibles.
- No se agrega un proveedor externo de colas en la fundación.

### Costos y riesgos

- Operar outbox, relay, queue, workers y dead-letter exige métricas y runbooks desde temprano.
- Next.js y Edge Functions implican dos entornos de ejecución TypeScript; los contratos
  compartidos deben ser neutrales al runtime.
- RLS con joins de membresía requiere índices y pruebas de rendimiento.
- Una sola aplicación Vercel comparte ciclo de despliegue entre superficies.
- La entrega es al menos una vez; cada consumidor debe demostrar idempotencia.
- Será necesario cambiar la configuración actual del proyecto Vercel desde Vite/raíz a
  Next.js con `apps/web` como Root Directory cuando se implemente la estructura.

## 8. Condiciones para reconsiderar

Reabrir este ADR si aparece evidencia de:

- límites de throughput o latencia de `pgmq` bajo la capacidad calculada del producto;
- necesidad contractual de aislar un tenant en infraestructura dedicada;
- ciclos de despliegue independientes que reduzcan incidentes;
- incompatibilidad comprobada entre un proveedor crítico y el runtime elegido;
- complejidad operativa de Edge Functions mayor que una cola/worker externo;
- cambio aprobado a una decisión congelada.

Toda reapertura debe incluir mediciones, impacto y plan de migración.

## 9. Evidencia y documentación primaria consultada

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js PWA](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Vercel: monorepos](https://vercel.com/docs/monorepos)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Queues](https://supabase.com/docs/guides/queues)
- [Supabase: PGMQ](https://supabase.com/docs/guides/queues/pgmq)
- [Supabase: Cron](https://supabase.com/docs/guides/cron)
- [Supabase: pruebas de base y RLS](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase: autorización Realtime](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase: tipos TypeScript generados](https://supabase.com/docs/guides/api/rest/generating-types)
- [Vitest](https://vitest.dev/guide/)
- [Playwright](https://playwright.dev/docs/intro)
- [Radix Primitives y accesibilidad](https://www.radix-ui.com/primitives/docs/overview/accessibility)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs/installation/framework-guides)

## Aprobación

El fundador aprobó este ADR el 2026-07-27 con cuatro condiciones ya incorporadas: separación de
los tres caminos del KDS y SLO p95; política de reintentos/DLQ e idempotencia; justificación de
Edge Functions; y confirmación del adaptador abstracto de pasarela. La conectividad de
impresoras queda registrada como decisión abierta de Sprint 4 en `docs/OPEN_ISSUES.md`.
