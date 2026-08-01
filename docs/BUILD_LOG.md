# Bitácora de construcción

Registro simple de qué cambió, por qué y cómo se verificó.

## 2026-08-01 — OI-030 corregido y cerrado; OI-031 registrado; verificación programada agregada

### Diagnóstico primero (sin arreglar), como pidió el fundador

Investigando a fondo las 3 sospechas de OI-030 (con acceso de solo lectura a producción), 2
resultaron ser falsas alarmas por comparar contra el contenido *original* de una migración vieja
en vez del estado *actual* de producción:

- El timestamp "cuándo se recibió un pago": el parámetro que cambiaba de valor
  (`p_received_at`/`clock_timestamp()`) no se usa en ningún lugar de la función que lo recibe
  (`advance_payment_intent`) — verificado leyendo su cuerpo completo. Cero efecto.
- El backoff de reintentos del outbox: producción ya tiene, en vivo, exactamente la misma
  fórmula de "jitter completo" que describe el repositorio — una migración posterior
  (`sprint_02_retry_policy_alignment.sql`) ya la había alineado. La comparación original miraba
  una versión intermedia superada.
- `#variable_conflict use_variable`: esta sí era real, pero al revés de lo reportado — producción
  lo tiene correctamente en `create_table_credit_order` (arreglo histórico real y necesario, esa
  función usa `order_id` como variable y como columna real en varias tablas) y correctamente NO
  lo tiene en `configure_table_credit` (sin colisión de nombres ahí). El archivo local tenía el
  pragma en la función equivocada.

### Arreglo aplicado (aprobado explícitamente antes de tocar nada)

Se movió `#variable_conflict use_variable` de `configure_table_credit` a
`create_table_credit_order` en `20260729172848_sprint_09_table_credit_owner.sql`, verificado
byte a byte contra las definiciones reales en producción. Cero cambios contra producción — sólo
el archivo local. CI de reproducibilidad verde después del arreglo:
`https://github.com/jtmenesesg-arch/tablio/actions/runs/30709380710`.

### OI-031: el hueco estructural detrás de todo esto

El mismo diagnóstico confirmó algo más importante que los bugs puntuales: **ninguna suite de
pruebas del repositorio valida jamás el comportamiento real de este proyecto Supabase.** Vitest
prueba TypeScript puro sin base de datos; pgTAP corre, según el propio ADR-000, "sobre Supabase
local"; Playwright levanta un servidor que usa *stores* en memoria, no Supabase. Es exactamente
la razón por la que OI-027 y OI-030 pudieron divergir de producción durante días sin que nada lo
detectara. Registrado como **OI-031**, bloqueante antes del piloto, con dos opciones de cierre
evaluadas (proyecto de staging con pgTAP real vs. verificación periódica de esquema) — detalle
completo, pros/contras y costo en `docs/OPEN_ISSUES.md`.

### Mínimo inmediato agregado

Nuevo workflow `.github/workflows/schema-drift-check.yml`: reconstruye el esquema desde cero
(mismo patrón que `schema-reproducibility.yml`) y lo compara, objeto por objeto, contra
producción real vía conexión de sólo lectura. Corre diario (`schedule`) y bajo demanda
(`workflow_dispatch`); **falla el job si algo diverge**, en vez de esperar a que alguien lo note
por casualidad. Pendiente: agregar el secreto `SCHEMA_DRIFT_PROD_DB_URL` al repositorio — el
workflow falla explícitamente con un mensaje claro si no está configurado, no falla en silencio.
El CI de reproducibilidad de esquema (`schema-reproducibility.yml`) ya corría en cada push que
toca `supabase/migrations/**` desde que se creó; no necesitó cambios.

### Verificación

- Estilos computados en vivo (conexión de solo lectura) confirmando que `configure_table_credit`
  y `create_table_credit_order` ahora coinciden exactamente con producción.
- CI `schema-reproducibility` en verde tras el arreglo.
- Confirmado leyendo código (no asumido): `playwright.config.ts` (`webServer.command: "pnpm
  dev:e2e"`), `vitest.config.ts` (sólo incluye `*.test.ts`) y
  `packages/application/src/financial/financial-core.test.ts` (sin conexión a BD) para las
  afirmaciones de OI-031.
- Confirmado que las tablas de negocio reales (`orders`, `payment_intent_events`,
  `table_credit_accounts`, etc.) tienen cero filas — ningún dato existente pudo verse afectado
  por ninguna de las divergencias encontradas en OI-027/OI-030.

## 2026-08-01 — OI-027 cerrado: reconciliación del historial de migraciones + OI-030 nuevo

### Qué cambió

- Con acceso directo de solo lectura a la base real (pooler de Postgres, no el MCP — quedó mal
  configurado toda la sesión), se diagnosticó OI-027 comparando el SQL realmente aplicado
  (`supabase_migrations.schema_migrations.statements`) contra los archivos de
  `supabase/migrations/`. Detalle completo, con los comandos exactos usados, en
  `docs/evidence/OI-027-DIAGNOSIS-AND-FIX-2026-08-01.md`.
- Aplicado `supabase migration repair` para 13 versiones de Sprint 11-13 (solo metadatos,
  verificado que no toca tablas ni funciones) y revertido
  `supabase/migrations/20260729174339_sprint_09_credit_open_limit.sql` al contenido exacto que ya
  corría en producción (una barra invertida de más rompía el patrón de reemplazo).
- Respaldo completo de la tabla de control, tomado antes de tocar nada, en
  `docs/evidence/OI-027-SCHEMA-MIGRATIONS-BACKUP-2026-08-01.json`.
- Nueva regla en `AGENTS.md` §5.2 y entrada en `docs/DECISION_RECORD.md`: ninguna migración ya
  aplicada a un ambiente real se renombra/reordena/edita sin sincronizar
  `supabase migration repair` en el mismo momento.

### Verificación

- `supabase migration list`: local y remoto coinciden en las 58 versiones, sin excepciones.
- CI `schema-reproducibility` en verde por primera vez:
  `https://github.com/jtmenesesg-arch/tablio/actions/runs/30694845820`.
- Verificación adicional (no sólo CI verde): se corrió el mismo script de manifiesto de esquema
  del CI (`scripts/schema-manifest.sql`) contra producción y se comparó fila por fila contra el
  artefacto del CI. Encontró 3 diferencias de contenido real no relacionadas con este arreglo —
  registradas aparte como **OI-030** (núcleo financiero de Sprint 2 y dos funciones de crédito de
  mesa con lógica distinta entre repositorio y producción). No se tocaron; quedan para diagnóstico
  y decisión del fundador antes de cualquier piloto con pagos reales.

### Límite deliberado

Este incremento sólo cerró OI-027. OI-030 es nuevo, más serio (toca confirmación de pagos y
reintentos del outbox) y explícitamente no se intentó resolver en la misma sesión.

## 2026-08-01 — Sprint 14 · causa raíz: `cn()` fusiona clases + auditoría detecta texto invisible

Pedido explícito del fundador tras el incremento anterior: van tres bugs del mismo origen
(Button, Card/Crédito, KDS), los tres invisibles para los tests, los tres encontrados sólo
mirando capturas. "Esta clase de bug no puede seguir apareciendo pantalla por pantalla." Dos
cambios de fondo, no más parches puntuales.

### 1. `cn()` ahora fusiona clases en conflicto (`tailwind-merge`)

- Se reescribió `apps/web/lib/cn.ts`: `cn()` pasaba antes por `clsx` solo (concatenaba, nunca
  resolvía). Ahora hace `twMerge(clsx(inputs))`. Dato curioso al revisar: `tailwind-merge`
  (v3.6.0) ya estaba en `apps/web/package.json` desde el primer commit del sistema de diseño —
  nunca se usó, `lib/cn.ts` se escribió con `clsx` solo desde el principio. No hubo que agregar
  una dependencia nueva, sólo conectar la que ya estaba.
- Como los tokens semánticos de Tablio no son la paleta por defecto de Tailwind (viven en
  `--color-*`/`--text-*`/`--radius-*`/`--spacing-*` dentro de `@theme inline` en `globals.css`),
  `tailwind-merge` no puede inferirlos solo. `lib/cn.ts` los registra explícitamente vía
  `extendTailwindMerge({ extend: { theme: { color, text, radius, spacing } } })`, calcada de esas
  mismas variables — **si se agrega o renombra un token en `globals.css` hay que reflejarlo
  aquí**, o vuelve el comportamiento silencioso de antes para ese token.
- Verificado con casos aislados (no sólo confiando en la suite) que las tres composiciones que ya
  habían fallado ahora se resuelven solas: `border border-transparent` + `border-border` →
  `border-border` gana; `text-card-foreground` + `text-background` → `text-background` gana;
  `text-h2` + `text-background` coexisten sin falso conflicto (tamaño vs color son grupos
  distintos); `text-h1` + `lg:text-h1-lg` (patrón responsive usado en casi todos los headers) no
  se pisan entre sí porque tienen breakpoints distintos.
- Detalle completo y ejemplos en `docs/DESIGN_SYSTEM.md` → "`cn()` fusiona clases en conflicto —
  causa raíz cerrada".

### 2. La auditoría ahora rompe el build ante texto prácticamente invisible

- `tests/visual/sprint-14-owner-a11y.ts`: antes sólo existía una lista `textFailures` con el
  incumplimiento de AA (ratio bajo el mínimo 3:1/4.5:1 según tamaño). Un texto negro sobre negro
  (ratio 1) SÍ caía en esa lista, pero mezclado con cualquier incumplimiento menor de AA — nada
  lo marcaba como lo que realmente era: invisible, no "un poco bajo de contraste".
- Se agregó una categoría separada, `invisibleTextFailures`, con un umbral propio y mucho más
  estricto (ratio < 1.5, casi el mismo color) que ya no depende del tamaño de fuente ni de si el
  texto es "grande". Si aparece algo ahí, el script imprime una advertencia explícita por stderr
  además de romper `passed`/el exit code.
- De paso se separó `unparseableTextColors`: un color que el script no supo interpretar (formato
  CSS que `parseRgb` no cubre) ya no cuenta silenciosamente como 0 fallos — aparece marcado aparte
  para que alguien lo revise, en vez de esconderse como un pase falso.
- Verificado con una página mínima aislada (no la app real) que un texto negro sobre fondo negro
  cae en `invisibleTextFailures` con exit code 1 y el warning correcto, y que un texto blanco
  sobre negro en la misma página no dispara nada.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright completo: 44 pasan, 1 falla en el patrón preexistente ya documentado (OI-028), 1 se
  salta en cascada — mismo patrón de siempre, sin regresiones. Este cambio toca `cn()`, que usa
  cada componente del sistema, así que era el que más riesgo de regresión tenía de todo el
  sprint.
- Auditoría de contraste/táctil/foco/gradientes/desborde + el nuevo chequeo de texto invisible,
  re-corrida en las 8 pantallas migradas (Dueño, Mesas, Caja, KDS, Garzón, Superadmin, Onboarding,
  Crédito): las 8 en cero fallos, incluidas las tres ubicaciones que ya habían fallado antes
  (verificado además visualmente con estilos computados: bordes en Mesas, texto de la tarjeta
  oscura en Crédito — sin cambios respecto a como se veían ya corregidas).

## 2026-08-01 — Sprint 14 · migración visual de Crédito + dos bugs reales encontrados al revisar

### Qué cambió

- `/credito` (`apps/web/app/credito/credit-demo.tsx`) se reescribió completo sobre el sistema de
  diseño claro estándar, con `AppShell` (`ownerNavigation("cashier")`, comparte sección con
  Caja). Estructura: insignia de riesgo, 3 `MetricCard` de exposición, tarjeta de cuenta con
  saldo, grilla de 3 columnas (Operación de caja / Pantalla del cliente / Validación del garzón)
  e historial. `.creditLiveCode`/`.creditError` pasaron a `data-testid`.
- Se corrigió un error de lint por comillas rectas sin escapar (`&ldquo;`/`&rdquo;`).

### Dos bugs reales encontrados al revisar las capturas (no cosméticos, no de esta pantalla sola)

Al mirar las capturas de "Pantalla del cliente" (la tarjeta oscura que ve el comensal) para
verificar visualmente, aparecieron dos bugs de contraste invisible — el mismo patrón de raíz que
ya afectó a KDS y Garzón esta semana (`cn()` es `clsx` puro, sin `tailwind-merge`: cuando un
componente base declara un color y el que lo usa intenta pisarlo con otra clase de color, no hay
fusión — gana el orden en que Tailwind generó el CSS, no el orden en el JSX), pero esta vez en
componentes compartidos usados por TODAS las pantallas ya migradas, no en una pantalla aislada:

1. **Botón `variant="outline"` sin borde visible en todo el sistema.** `components/ui/button.tsx`
   declaraba `border border-transparent` en la base de `cva` y el variant `outline` intentaba
   pisarlo con `border-border`; el transparente ganaba siempre. Se confirmó que esto ya estaba
   presente en Mesas ("Crear varias") desde el primer incremento del sprint — no es nuevo de
   Crédito, solo se hizo evidente ahí porque hay tres botones outline seguidos. **Corregido en la
   raíz**: se sacó `border-transparent` de la base y cada variant (`primary`, `secondary`,
   `outline`, `ghost`, `destructive`) ahora declara su propio color de borde sin conflicto.
   Verificado con estilos computados antes/después en Crédito y en Mesas; visualmente sin cambio
   para los variants sólidos (su borde ahora coincide exactamente con su propio fondo, que es como
   se veían antes) y con borde gris correcto en `outline`.
2. **Texto invisible en la tarjeta oscura de Crédito — bug real, no cosmético.** `Card` declara
   `text-card-foreground` (casi negro) en su base; `credit-demo.tsx` le pasaba `text-background`
   (casi blanco) a la `Card` para invertir el tema, pero por el mismo motivo del punto anterior no
   ganaba. Efecto medido con estilos computados: el estado "PAGADO/NO PAGADO", el monto en pesos
   y — el más serio — **los 6 dígitos del código de verificación que el cliente lee en voz alta al
   garzón** se renderizaban en `rgb(17,17,16)` sobre un fondo `rgb(17,17,16)`: negro sobre negro,
   ilegible. **Corregido** agregando `text-background` explícito en esos tres elementos
   directamente (no en el contenedor), siguiendo la misma lección ya documentada: nunca confiar en
   pisar el color de un ancestro/base, darle su propio valor explícito al elemento que lo necesita.
   Es el único lugar del código que usa este patrón de tarjeta invertida, así que el arreglo queda
   acotado a Crédito.

Ninguno de los dos bugs lo detectó la auditoría automática de contraste sin ayuda: el bug del
borde no toca contraste de texto (no lo audita); el bug de la tarjeta sí lo hizo aparecer como
falla real (`ratio: 1`) en el primer corrido del script sobre `/credito`, y esa falla fue la pista
que llevó a investigar y encontrarlo — confirma que la revisión visual manual sigue siendo
necesaria además del script.

### Tercer hallazgo: falso positivo en el propio script de auditoría

Con el bug de la tarjeta ya corregido, quedaban dos fallas de contraste (`ratio: 0`) en textos con
opacidad (`text-background/70`). Investigado con estilos computados: Chromium reporta el color de
estos textos como `oklab(...)`, no `rgb(...)`, porque el `color-mix()` detrás del modificador
`/70` de Tailwind no siempre puede volver a sRGB sin pérdida — y el regex de `parseRgb()` en
`tests/visual/sprint-14-owner-a11y.ts` sólo entendía `rgb()`/`rgba()`. Confirmado visualmente que
el texto se ve bien (gris claro legible sobre fondo oscuro); era un defecto del script, no de la
pantalla. **Corregido en el script**: `parseRgb()` ahora también convierte `oklab()` a sRGB con
las matrices estándar de Ottosson, así que futuras pantallas con modificadores de opacidad no van
a generar esta misma falsa alarma.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes (corridos otra vez después del fix de
  `button.tsx`, no solo antes).
- `pnpm test` (Vitest): 144/144.
- Playwright completo: 44 pasan, 1 falla en el patrón preexistente ya documentado (esta corrida
  tocó OI-028, la cifra de fuga mensual; en otras corridas de la sesión tocó OI-029 en su lugar —
  ambos ya registrados, ninguno nuevo), 1 se salta en cascada de `credit-owner.spec.ts` — sin
  regresiones.
- Auditoría de contraste/táctil/foco/gradientes/desborde en `/credito`, escritorio y móvil, con
  crédito abierto y con código de verificación generado: **0 fallos** después de los dos arreglos
  (`docs/evidence/SPRINT-14-CREDIT-A11Y.json`).
- Regresión dirigida del fix de `button.tsx` (afecta a todas las pantallas migradas que usan
  `variant="outline"`): auditoría re-corrida en `/dueno`, `/caja`, `/superadmin`, `/onboarding` —
  las cuatro en 0 fallos, sin cambios respecto a lo ya reportado. KDS y Garzón no usan el
  componente `Button` compartido (tienen sus propias clases oscuras), así que el fix no los toca;
  no se re-auditaron por esa razón, no por omisión.

### Límite deliberado

Con esto quedan migradas Caja, KDS, Garzón, Superadmin, Onboarding y Crédito. Sólo falta la PWA
del comensal, que se deja para el final con revisión aparte (decisión del fundador).

## 2026-08-01 — Sprint 14 · migración visual de Onboarding

### Qué cambió

- `/onboarding` (`apps/web/app/onboarding/owner-onboarding.tsx`) se reescribió completo sobre el
  sistema de diseño. A diferencia de Superadmin, sí usa `AppShell`: es la preparación de ESTE
  local y ya estaba enlazada desde la navegación compartida como "Configurar". Se agregó la
  clave `"configure"` a `OwnerNavigationKey`.
- El asistente de 9 pasos pasó de una clase CSS (`.stepNav`) a una fila de botones con scroll
  horizontal propio, `data-testid="onboarding-step-nav"` para que el test la siga encontrando.
- Todos los campos de los 9 pasos (local, tamaño, carta, tributación, pasarela, personal, QRs,
  prueba, producción) se restilaron con `Input`/`Select`/`Textarea`/`Button`/`Card`/`Alert`
  compartidos, asociando cada etiqueta a su campo con `htmlFor`/`id`. Ninguna mutación, ninguna
  validación ni el orden de los pasos cambió.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright `tests/e2e/platform.spec.ts`: 5/5 — recorre el asistente completo de punta a punta
  (los 9 pasos, incluida la publicación de carta con revisión humana obligatoria) más los tests
  de Superadmin que comparten archivo.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde en el paso 1 (Local) y en el
  paso 3 con carta importada, botón "Publicar" deshabilitado incluido, escritorio y móvil — **0
  fallos** (`docs/evidence/SPRINT-14-ONBOARDING-A11Y.json`,
  `docs/evidence/SPRINT-14-ONBOARDING-menu-A11Y.json`).
- Suite completa de Playwright corrida después del incremento.

### Límite deliberado

Sólo se migraron Caja, KDS, Garzón, Superadmin y Onboarding hasta ahora. Crédito sigue en la
cola; la PWA del comensal queda para el final y con revisión aparte.

## 2026-08-01 — Sprint 14 · migración visual de Superadmin

### Qué cambió

- `/superadmin` (`apps/web/app/superadmin/superadmin-dashboard.tsx`) se reescribió completo
  sobre el sistema de diseño claro estándar (no el patrón oscuro de KDS/Garzón: es la oficina de
  soporte de Tablio, no el mostrador de un bar). Sin `AppShell`, porque su navegación no es la de
  un tenant. Patrón maestro-detalle: lista de locales a la izquierda, detalle a la derecha.
- Se agregó `subscriptionStatusDictionary` a `lib/ui-statuses.ts` con las mismas ocho etiquetas
  que ya existían, ahora con tono semántico (`Badge`) en vez de una clase CSS por estado.
- Se promovió el `ReasonDialog` que nació en Garzón a `components/ui/reason-dialog.tsx`
  (segunda pantalla que lo necesita: motivo de baja de un tenant), ahora sobre el `Button`
  compartido.
- Alta de tenant y umbral de alerta pasaron de `window.prompt()` a diálogos propios con `Input`.
  **"Entrar como soporte" se dejó intacto en `window.prompt()`** a propósito: el test de
  impersonación escucha el diálogo nativo del navegador, igual que dos flujos de Caja.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright `tests/e2e/platform.spec.ts`: 5/5 (incluye onboarding y superadmin, comparten
  archivo; la parte de onboarding no se tocó en este incremento y sigue verde).
- Auditoría de contraste/táctil/foco/gradientes/desborde en escritorio y móvil: lista sin
  selección y con un tenant seleccionado (feature flags, cobranza, exposición de saldo) — **0
  fallos** en las 4 combinaciones (`docs/evidence/SPRINT-14-SUPERADMIN-A11Y.json`,
  `docs/evidence/SPRINT-14-SUPERADMIN-detail-A11Y.json`).
- Suite completa de Playwright corrida después del incremento.

### Límite deliberado

Sólo se migraron Caja, KDS, Garzón y Superadmin hasta ahora. Onboarding y Crédito siguen en la
cola; la PWA del comensal queda para el final y con revisión aparte.

## 2026-08-01 — Sprint 14 · migración visual de Garzón

### Qué cambió

- `/garzon` (`apps/web/app/garzon/waiter-panel.tsx`) se reescribió completo sobre el sistema de
  diseño, siguiendo el mismo patrón acotado que KDS (sin `AppShell`, fondo sólido oscuro, tokens
  de acento compartidos — ver `DESIGN_SYSTEM.md` y OI-026): es una PWA de un solo propósito para
  el teléfono del garzón en un bar oscuro y ruidoso, no un panel de escritorio.
- Prioridad visual explícita a las entregas listas: borde izquierdo de color por urgencia real
  (crítica/atrasada siguen ganando) y una insignia verde "✓ ENTREGA LISTA" para una entrega sin
  atraso, además de las banderas ya existentes (crítica, atrasada, sin asignar, pagado).
- Indicador de conexión permanente igual que KDS: insignia + "Actualizado hace…" en la barra
  superior, más una franja roja de ancho completo si la última sincronización se atrasa.
- Los cinco flujos que pedían motivo por `window.prompt()` (descartar solicitud, traspasar zona,
  incidencia, separar mesas, transferir mesa) pasaron a un diálogo propio con `Textarea`. Ninguno
  estaba enganchado a una prueba que escuchara el diálogo nativo del navegador (a diferencia de
  Caja, donde sí y por eso ahí se dejaron intactos).
- Se centralizó `formatRelativeTime`/`formatClp` de `lib/format.ts` en vez de los helpers locales
  duplicados.

### Dos bugs reales encontrados y corregidos antes de reportar

1. **Tarjeta de mesa ilegible (texto blanco sobre fondo blanco).** Un `<button>` interno no tenía
   `bg-*` explícito. Este proyecto no carga el preflight de Tailwind
   (`globals.css` sólo importa `tailwindcss/utilities.css`), así que un botón nativo sin fondo
   declarado muestra el gris por defecto del navegador en vez de heredar transparencia — nunca
   antes había pasado porque todos los botones anteriores (Caja, KDS, el propio `Button`
   compartido) siempre declaran su fondo. Regla nueva documentada: todo `<button>` de este
   código necesita `bg-*` explícito, aunque sea `bg-transparent`.
2. **Casillas "agrupar" de 13×13 px.** Usaban `size-5`; `spacing-5` no existe en la escala
   aprobada (`4, 8, 12, 16, 24, 32, 48, 64`), así que la clase no generaba nada y el navegador
   conservaba el tamaño nativo del checkbox. Se cambió a `size-touch` (56 px) — además de
   corregir la auditoría, es lo correcto para "una mano, en movimiento".

Ambos se encontraron en captura de pantalla antes de reportar, no en producción ni por un
usuario.

### El script de auditoría necesitó dos mejoras propias

- Ganó `TABLIO_A11Y_STORAGE_STATE` para auditar pantallas con sesión iniciada (Garzón requiere
  login por PIN; el script no tenía forma de reutilizar una sesión).
- Ganó una espera de 250 ms tras el clic de cambio de pestaña: sin ella, el chequeo de contraste
  a veces medía el color de un botón a mitad de su transición CSS de 120 ms
  (`duration-[var(--motion-feedback)]`) y reportaba un fallo de contraste falso e intermitente en
  el tab recién activado o en "Tareas". Se confirmó reproduciendo 3 veces sin la espera (siempre
  fallaba igual) y 3 veces con la espera (siempre pasaba) antes de aceptar la causa.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright `tests/e2e/waiter.spec.ts`: 4/4.
- Auditoría de contraste/táctil/foco/gradientes/desborde en escritorio y móvil: login, selección
  de zona, tareas (vacío y con una entrega lista + un llamado), mesas (con crédito) y turno — **0
  fallos** en las 10 combinaciones (`docs/evidence/SPRINT-14-WAITER-*-A11Y.json`).
- Suite completa de Playwright (todas las pantallas) corrida después del incremento.
- `tests/e2e/credit-owner.spec.ts › caja y garzón separan...` volvió a fallar de forma
  intermitente al correr junto a otras suites (mismo patrón que OI-029) y pasó limpio en
  aislamiento repetido; no es una regresión de este incremento.

### Límite deliberado

Sólo se migraron Caja, KDS y Garzón hasta ahora. Superadmin, Onboarding y Crédito siguen en la
cola; la PWA del comensal queda para el final y con revisión aparte.

## 2026-08-01 — Sprint 14 · migración visual de KDS

### Qué cambió

- `/kds` (`apps/web/app/kds/kds-screen.tsx`) se reescribió sobre tokens del sistema de diseño,
  pero **no** usa `AppShell`: es la excepción documentada en `DESIGN_SYSTEM.md` — pantalla
  completa sin sidebar, fondo sólido oscuro, cero superficies traslúcidas, tipografía grande y
  botones de 64–72 px para manos ocupadas o mojadas.
- Los colores de acento (naranja, verde, ámbar, rojo) pasaron a los tokens de marca compartidos
  (`bg-brand`, `bg-success`, `bg-warning`, `bg-destructive`); las superficies oscuras
  estructurales quedan con valores Tailwind arbitrarios porque OI-026 todavía no aprueba una
  matriz semántica oscura completa.
- La comanda (`TicketCard`) reusa `bg-background`/`text-foreground`/`Badge`, igual que el resto
  del producto: es un "papel" claro sobre el mostrador oscuro.
- El indicador de conexión y "Actualizado hace…" quedan siempre visibles en la barra superior; la
  alerta de pantalla desactualizada y la de Realtime desconectado (con recuperación por consulta)
  se mantuvieron con su lógica original, sólo restilizadas.
- Se centralizó `Actualizado {…}` con `formatRelativeTime` de `lib/format.ts` en vez del helper
  `agoLabel` duplicado.

### Bug encontrado durante la migración (no en producción, en el propio incremento)

Al restilizar el tab de estación activa, el texto quedó invisible: la clase base `kdsButton`
fijaba `text-[#fefefe]` y la variante activa agregaba `text-[#111110]` **sin reemplazarla**. Como
`cn()` en este proyecto es sólo `clsx` (sin `tailwind-merge`), ambas clases de texto coexistieron
y el orden de generación de Tailwind — no el orden del JSX — decidió cuál ganaba, dejando texto
blanco sobre fondo blanco. Se corrigió separando el color de texto de la base y usando un
ternario que reemplaza la cadena completa, como ya hacen los componentes compartidos con `cva`.
Encontrado en captura de pantalla antes de reportar, no por un usuario. Se documentó como
lección en `DESIGN_SYSTEM.md` para no repetirlo en Garzón/Superadmin/Onboarding/Crédito/PWA.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- Playwright `tests/e2e/kds.spec.ts`: 5/5, incluida la medición de latencia
  (`KDS_LATENCY {"connectedSampleCount":12,"noKdsConnectedCount":1,"p50Ms":80,"p95Ms":133,"p99Ms":151}`,
  dentro del objetivo p95 ≤ 2 s). Se actualizó el selector `.kdsTicket` → `getByTestId("kds-ticket")`
  en el test, porque apuntaba a una clase CSS que dejó de existir.
- Auditoría de contraste/táctil/foco/gradientes/desborde en escritorio y móvil, vacío y con
  comandas activas de ambas estaciones: **0 fallos** en las 4 combinaciones
  (`docs/evidence/SPRINT-14-KDS-A11Y.json`, `docs/evidence/SPRINT-14-KDS-tickets-A11Y.json`). El
  cálculo de contraste funciona igual sobre fondo oscuro.
- Suite completa de Playwright (todas las pantallas) corrida después del incremento para
  descartar regresiones cruzadas.

### Límite deliberado

Sólo se migraron Caja y KDS hasta ahora. Garzón, Superadmin, Onboarding, Crédito y la PWA del
comensal siguen con sus estilos anteriores; continúan en ese orden.

## 2026-08-01 — Sprint 14 · migración visual de Caja

### Qué cambió

- `/caja` (`apps/web/app/caja/cashier-dashboard.tsx`) se reescribió completo sobre el sistema de
  diseño: `AppShell` compartido con Dueño/Mesas, tokens semánticos, componentes `Card`/`Badge`/
  `Alert`/`Button`/`Dialog` en vez del CSS manual anterior (`cashierShell`, `cashierTableCard`,
  etc., que quedan sin uso en `globals.css` hasta la limpieza final del sprint).
- Se agregaron los diccionarios de estado que faltaban en `lib/ui-statuses.ts` (mesa en vivo de
  caja, prioridad/estado de excepción, conciliación, documento tributario, salud del proveedor
  DTE, cuenta de crédito, cuenta de saldo prepagado) para que ningún estado crudo tipo
  `frozen_for_recovery` llegue a pantalla.
- `lib/format.ts` ganó `formatTime`. Los montos, duraciones y horas de Caja usan las utilidades
  centralizadas en vez de `Intl.NumberFormat`/`toLocaleString` repetidos en el componente.
- La navegación compartida (`components/operational/owner-navigation.ts`) ahora acepta `"cashier"`
  como sección activa.
- Se corrigió un error de ortografía heredado: el plural de "excepción" se armaba como
  "excepciónes" (mantenía la tilde). Ahora dice "excepciones".
- Se preservaron **sin cambios** todas las interacciones que ya usaban `window.prompt()`
  (reembolso, escalar excepción, reintentar boleta, cerrar turno, ajustar saldo, restituir
  sello): las pruebas E2E de Caja escuchan el diálogo nativo del navegador, así que cambiarlas a
  un `Dialog` propio habría sido un cambio de interacción disfrazado de reestilo.

### Auditoría de accesibilidad ampliada

`/dueno` y `/dueno/mesas` no tienen pestañas, así que la auditoría existente
(`tests/visual/sprint-14-owner-a11y.ts`) sólo auditaba la carga inicial. Caja sí tiene seis vistas
por pestaña, así que el script ganó `TABLIO_A11Y_CLICK_ROLE_NAME` para hacer clic antes de auditar.
Un primer intento reportó ~15-23 fallos de foco por pestaña que resultaron ser un falso positivo
del propio script: el clic previo cambia la modalidad de foco del navegador a "mouse" y
`element.focus()` programático deja de calzar con `:focus-visible`. Se corrigió agregando
`Tab`/`Shift+Tab` después del clic, antes de auditar. Con esa corrección, el único hallazgo real
fue un enlace "Ver documento" suelto (`<a>` con solo `underline`) que no llegaba a 56 px de alto
ni al contraste AA; se resolvió envolviéndolo en `Button asChild size="small" variant="ghost"`.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Auditoría de contraste/táctil/foco/gradientes/desborde en las 6 pestañas × 2 viewports
  (escritorio 1440×900, móvil 390×844): **0 fallos** en las 12 combinaciones.
  `docs/evidence/SPRINT-14-CASHIER-A11Y.json` (vista Mesas) y
  `docs/evidence/SPRINT-14-CASHIER-{exceptions,reconciliation,loyalty,stored_value,close}-A11Y.json`.
- Capturas de pantalla en `docs/evidence/sprint-14/after-cashier-{desktop,mobile}[-viewport].png`.
- Playwright: `tests/e2e/cashier.spec.ts` (6/6), `tests/e2e/checkout-engagement.spec.ts` (5/5),
  y `tests/e2e/table-management.spec.ts`/`owner-dashboard.spec.ts` (sin regresión, confirman que
  extender `owner-navigation.ts` no rompió las pantallas ya migradas). De
  `tests/e2e/credit-owner.spec.ts` se actualizó un selector (`.cashierCloseWarning` →
  `getByTestId("cashier-shift-credit-loss")`) porque apuntaba a una clase CSS que dejó de existir.
- **Dos fallos preexistentes encontrados en `tests/e2e/credit-owner.spec.ts`, no causados por este
  incremento** — se reprodujeron de forma idéntica contra el código sin tocar (`git stash`) antes
  de tocar nada:
  1. `caja y garzón separan prepago y crédito en la misma mesa`: el login del garzón
     (`/garzon`, botón "Empezar turno") queda deshabilitado y el test expira. Es intermitente:
     falló al correr junto a otras suites y pasó al correrlo solo, en ambas versiones del código.
     Registrado como OI-029.
  2. `una fuga alimenta el costo mensual y su tendencia para el dueño`: espera `$54.500` en
     `owner-leakage` y encuentra `$18.500`. Falla de forma determinística y aislada, también en
     ambas versiones del código. No es cosmético: es un cálculo de plata mal hecho en el panel
     del dueño. Registrado como OI-028, bloqueante antes del piloto.
  Ninguno de los dos toca código de Caja; ambos quedan fuera del alcance de este incremento por
  la regla de las dos vueltas de `AGENTS.md` §5.3. No se investigaron más a fondo porque no son
  parte de la migración visual encargada; quedan para revisión aparte.

### Límite deliberado

Sólo se migró Caja. KDS, Garzón, Superadmin, Onboarding, Crédito y la PWA del comensal siguen con
sus estilos anteriores; continúan en ese orden en los siguientes incrementos del sprint.

## 2026-07-31 — Reproducibilidad de esquema y saneo previo a OI-027

### Qué cambió

Se encontraron cuatro commits ya escritos en el repositorio local (2026-07-31, 23:08–23:23) que
nunca se documentaron en esta bitácora ni se subieron a `origin/main`. Corresponden a trabajo
preparatorio para cerrar OI-027 (el historial de migraciones remoto no coincide exactamente con
los archivos locales de Sprints 11–13):

- `ci(database): verify schema rebuilds from zero` agrega
  `.github/workflows/schema-reproducibility.yml` y `scripts/schema-manifest.sql`. La acción de
  CI levanta un stack Supabase aislado en el runner, aplica exclusivamente las migraciones del
  repositorio con `supabase db reset`, y exporta un manifiesto determinista (tablas, columnas,
  constraints, índices, vistas y funciones de los esquemas `public`/`private`) con su hash
  SHA-256 como evidencia descargable. Se dispara ante cualquier cambio a migraciones o al propio
  workflow.
- `fix(database): make clean rebuild tolerate platform helper` corrige
  `20260728035137_harden_auth_and_advisor_findings.sql`: revocar permisos de
  `public.rls_auto_enable()` fallaba en un stack limpio porque esa función sólo existe en
  proyectos ya hospedados por Supabase, no en una base nueva. Ahora la revocación se ejecuta
  sólo si la función existe.
- `fix(database): make credit migration rebuildable` mueve la corrección de ambigüedad de
  variable de `create_table_credit_order` (`#variable_conflict use_variable`) directamente a la
  migración canónica de Sprint 9
  (`20260729172848_sprint_09_table_credit_owner.sql`), en vez de dejar que dependiera de un
  parche posterior. También endureció ese parche histórico
  (`20260729173752_sprint_09_credit_order_variable_fix.sql`) para que detecte si el arreglo ya
  está presente antes de reintentarlo.
- `fix(database): make historical credit repair idempotent` convierte ese mismo parche histórico
  en un no-op explícito: como la corrección ya vive en la migración canónica, el parche ya no
  necesita tocar la función en tiempo de despliegue. El comentario deja constancia de que
  producción ya recibió el arreglo equivalente por otra vía y que ese archivo no debe reescribir
  producción de nuevo.

### Por qué

Estos cuatro cambios sólo tocan **archivos de migración en el repositorio**, nunca la base de
datos remota. El objetivo es que si alguien aplica las migraciones del repositorio desde cero
(un ambiente nuevo, un runner de CI, un fork), el resultado compile sin error y termine en el
mismo esquema que ya existe en producción — sin necesidad de tocar el proyecto Supabase actual.

### Verificación

- Revisión manual de las cuatro diffs, confirmando que ninguna ejecuta una migración nueva
  contra el proyecto remoto; sólo reescriben el contenido de migraciones que, o bien no se han
  aplicado nunca fuera de este repositorio (el workflow de CI), o cuyo efecto equivalente ya
  está presente en producción por la vía histórica descrita en el propio commit.
- `supabase migration list --linked` contra el proyecto `tablio` (`xmwewmukoxdeuilmkahr`)
  muestra el historial local y remoto sincronizado para las migraciones existentes hasta este
  punto.
- **No se pudo ejecutar `supabase db reset` en este equipo** porque no hay Docker instalado ni
  corriendo; por lo tanto, la promesa central de estos commits (que el esquema se reconstruye
  desde cero sin errores) no se verificó localmente antes de este incremento.
- No se ha cerrado OI-027 con este trabajo: sólo cubre que los archivos locales reconstruyen un
  esquema equivalente desde cero. La reconciliación del historial de migraciones ya aplicado en
  el proyecto remoto (`supabase_migrations.schema_migrations`) sigue pendiente y se aborda por
  separado.

### Corrección — el workflow de CI ya se había ejecutado y falló 4/4 veces

Al revisar el historial de Actions con `gh run list` se descubrió que estos cuatro commits **ya
habían sido subidos y probados individualmente antes de esta sesión** (`gh api
repos/.../events` muestra los cuatro `PushEvent` a `refs/heads/main` entre 2026-07-31 23:11 y
23:23, cada uno seguido de una corrida del workflow "Schema reproducibility"). Las cuatro
corridas terminaron en `failure`, incluida la del último commit
(`fix(database): make historical credit repair idempotent`). En algún momento posterior
`origin/main` fue retrocedido para quitar esos commits, sin dejar registro — así fue como esta
sesión los encontró de nuevo como "4 commits locales sin subir".

Esto corrige la afirmación anterior: **la reconstrucción desde cero seguía fallando** cuando se
escribió este párrafo por primera vez; no estaba pendiente de una primera verificación, sino que
ya tenía evidencia roja no leída. El log de la corrida más reciente
(`https://github.com/jtmenesesg-arch/tablio/actions/runs/30681883530`) muestra el error real:

```
ERROR: open_table_credit definition was not recognized (SQLSTATE P0001)
```

en la migración `20260729174339_sprint_09_credit_open_limit.sql`, que parchea el cuerpo de
`open_table_credit` buscando un fragmento de texto literal dentro de la salida de
`pg_get_functiondef()`. **Hipótesis de causa, sin verificar todavía contra producción:** el texto
buscado usa `E'...\\n'` (barra invertida escapada seguida de "n"), que en sintaxis de cadena de
escape de PostgreSQL representa los dos caracteres literales `\` y `n` — **no** un salto de
línea real. `pg_get_functiondef()` devuelve saltos de línea reales, así que ese patrón no
debería poder calzar nunca, en ningún entorno. Si esa lectura es correcta, esta migración nunca
ejecutó su reemplazo tal como está escrita hoy en el repositorio, y lo que corre en producción
llegó a su forma actual por otra vía (coherente con el diagnóstico general de OI-027: hotfixes
aplicados directo contra el proyecto remoto que no quedaron reflejados fielmente en los archivos
locales). Se encontraron sólo otros dos usos de `pg_get_functiondef` en el repositorio
(`20260729024401_sprint_05_runtime_fixes.sql`, que sí pasa la reconstrucción desde cero, y
`20260729230000_sprint_13_stored_value.sql`, todavía no alcanzada por el rebuild porque éste se
detiene en el primer error). No se tocó ninguna de las tres porque diagnosticar y corregir el
historial de migraciones es exactamente el alcance de OI-027, que se aborda por separado con
acceso de solo lectura al proyecto remoto para no reconciliar a ciegas.

## 2026-07-30 — Sprint 14 · sistema visual y panel Dueño piloto

### Qué cambió

- Se detectó y registró la desviación de ADR-000: Tailwind, Radix y componentes propios
  basados en shadcn/ui estaban aprobados, pero nunca se instalaron.
- Se agregó al cierre de sprint la verificación obligatoria de cada ADR usado contra la
  implementación real.
- Se incorporaron Tailwind 4, Radix Slot y la base mínima de componentes internos.
- El brand book oficial quedó versionado en `/brand`; la aplicación de referencia quedó en
  `/reference` y su `.env` está excluido.
- Se creó el sistema HSL semántico, escala de tipografía/espaciado, objetivos táctiles de
  56 px y Plus Jakarta Sans variable autohospedada.
- Se construyó el shell reutilizable de 224 px con navegación móvil y se migró únicamente
  `/dueno`, como pantalla de validación.
- Se documentó la matriz oscura como decisión pendiente; no se inventaron tokens.

### Verificación

- Panel Dueño: 9/9 E2E relevantes verdes, incluyendo tenant nuevo, fuga mensual y métricas del
  checkout.
- Accesibilidad calculada en escritorio y móvil: cero fallos de contraste WCAG AA, tacto,
  foco, gradientes o desborde horizontal.
- Rendimiento CPU 4× + 4G lenta: utilizable p95 2.162 s frente a 2.106 s (+2,7%);
  transferencia p50 207 KB frente a 201 KB (+3,1%). La puerta del 5% se cumple.
- TypeScript, ESLint y build Next.js verdes.

### Límite deliberado

No se migró ninguna otra pantalla. Caja, garzón, onboarding, superadmin, crédito, PWA y KDS
esperan validación del fundador sobre este piloto antes de cambiar.

## 2026-07-30 — Demo pública en Vercel

### Qué cambió

- Se corrigió el proyecto Vercel `tablio`: framework Next.js, Root Directory `apps/web`,
  paquetes compartidos incluidos y Node.js 24.
- Se publicó la demo en `https://tabliocl.vercel.app` sin protección SSO para que abra desde
  cualquier celular.
- Se configuró `TABLIO_PAYMENT_GATEWAY=simulated` y rutas temporales escribibles para los
  snapshots demo de KDS, garzón y caja. No se subieron llaves de Supabase ni credenciales
  financieras.
- La PWA, KDS, garzón, caja y dueño muestran modo demo. Una guarda server-side impide iniciar
  esta aplicación con una pasarela distinta del adaptador simulado.
- Se retiró la integración Git antigua de otro repositorio `tablio`. Vercel no autorizó
  conectar `jtmenesesg-arch/tablio`; por ahora la publicación se hace explícitamente por CLI.

### Verificación

- Build local y build remoto Vercel verdes con Next.js 16.2.12.
- TypeScript, ESLint, Prettier y 141/141 tests Vitest verdes.
- Las cinco rutas públicas respondieron HTTP 200 sin login Vercel.
- Se recorrió por Internet código de mesa `4826` → carrito → quote `$4.500` → pago simulado
  → confirmación server-side → un pedido → una comanda recuperada por KDS.
- El laboratorio remoto devolvió `x-tablio-demo-mode: true`,
  `MODO DEMO — NO MUEVE DINERO REAL`, un evento de proveedor simulado y un outbox.

### Límite conocido

Los snapshots de interfaz usan `/tmp` y pueden reiniciarse cuando Vercel recicla una instancia
o al desplegar. Es aceptable para esta demostración sin dinero; no reemplaza PostgreSQL ni la
durabilidad exigida para un piloto.

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

## 2026-07-29 — Sprint 12 · Momento del pago

### Qué cambió

- Upsell determinista, máximo dos sugerencias, descartable y sin productos agotados.
- Happy hour versionado; el quote congela precio y descuento aunque cambie la promoción.
- Invitaciones pagadas esperan reclamo hasta 60 minutos por defecto, avisan antes de vencer y
  pueden cancelarse con reembolso mientras no exista producción.
- Otra persona de la misma mesa puede reclamar; el dispositivo pagador no puede auto-reclamar.
- Propina congela trabajador y turno. Caja/dueño informan por medio de pago sin mover dinero.
- ADR-011 y ADR-012 fijan reglas, concurrencia y trazabilidad.

### Verificación

- Vitest 125/125, TypeScript, ESLint y build verdes.
- Playwright Sprint 12: 5/5, incluido el reclamo desde otro dispositivo de la misma mesa.
- pgTAP Sprint 12: 38/38 remoto; aislamiento existente: 19/19.
- Las seis migraciones quedaron aplicadas en Supabase, incluida la política final de
  reembolsos de propina, límite antiabuso y vencimiento durable de invitaciones.
- Advisors ejecutados después de migrar: ningún hallazgo nuevo de seguridad ni clave foránea
  sin índice atribuible a Sprint 12. Se mantienen OI-008, OI-019 y OI-023.

## 2026-07-29 — Sprint 13 · Saldo prepagado

### Qué cambió

- Se agregó saldo por perfil y tenant con ledger append-only y lotes separados de dinero/bono.
- La recarga usa quote, pago simulado y confirmación server-side idempotente; nunca crea pedido.
- El quote congela asignaciones y política. El intento externo cobra sólo la diferencia.
- Se eligió bono primero + FEFO y se agregaron vigencias/avisos separados.
- El tope individual es $40.000 por defecto; el local puede fijar un tope total.
- Caja consulta, ajusta con motivo y devuelve recargas intactas. Dueño y cierre separan entrada
  por recarga, ingreso por consumo y pasivo acumulado.
- Superadmin ve el pasivo por tenant, configura alerta y no puede cerrar un tenant con saldo.
- Revocar identidad congela la cuenta con referencia de recuperación.

### Seguridad y verificación

- Diez tablas nuevas tienen RLS habilitado y forzado; el test principal prueba que el saldo de
  Tenant A no existe para Tenant B y que falta de claim falla cerrado.
- El RPC multi-tenant de superadmin valida membresía de plataforma y no depende de
  `service_role` en una ruta de usuario.
- Vitest 140/140 cubre confirmación, duplicados, tope, pago mixto, devolución y borrado de
  identidad. Playwright 42/42 recorrió la regresión completa más recarga, alerta, mezcla y
  límite.
- pgTAP remoto: 48/48 Sprint 13 y 21/21 aislamiento/fail-closed. TypeScript, ESLint y build
  verdes.
- Security Advisors no agregó hallazgos. Performance Advisors confirmó cero claves foráneas
  Sprint 13 sin índice; `unused_index` sigue bajo OI-008 hasta tener tráfico representativo.

## 2026-07-31 — Sprint 14 · Reconciliación de mesas, QR y presencia

### Migración segura

- Se separó `presence_required` de `presence_delivery_level`, con política por tenant y
  excepción opcional por zona.
- Mesas nuevas nacen con código obligatorio y `PRINTED_WITH_QR`. El QR, su hash, el código,
  la rotación y la auditoría se crean en una sola transacción; la creación masiva también es
  atómica.
- QR y código recuperables viven cifrados en Vault. No se guarda SVG, PNG ni PDF; `qrcode`
  renderiza el SVG en servidor cuando una persona autorizada ve o imprime la tarjeta.
- La fachada de creación no devuelve secretos. Revelar exige permiso, motivo y auditoría.
  Las fachadas públicas usan `SECURITY INVOKER`; el trabajo privilegiado vive en `private`.
- La verificación registra fallos, serializa intentos por mesa y aplica límites por dispositivo
  y por mesa antes de devolver una respuesta genérica.

### Checkpoint visual aprobado para revisión

- El shell compartido mantiene sidebar de 224 px en escritorio y navegación inferior en móvil.
- El panel Dueño conserva la pantalla piloto y comparte navegación, formatos y estados con la
  nueva pantalla de Mesas.
- Mesas incluye resumen útil, tarjetas, alta individual, alta masiva, ver/regenerar/revocar QR
  con advertencias y tarjeta imprimible bajo demanda. Nunca muestra tokens ni UUID internos.
- Sólo se migraron Dueño y Mesas. El resto de las pantallas permanece intacto hasta recibir la
  validación visual solicitada.

### Verificación local

- Vitest específico: 3/3; Playwright Mesas: 4/4.
- TypeScript y ESLint: verdes.
- Auditoría propia en Dueño y Mesas, escritorio y móvil: cero fallos de contraste AA, objetivos
  táctiles de 56 px, foco visible, gradientes o desborde horizontal.
- Suite completa: 144/144 Vitest, 4/4 Playwright Mesas, TypeScript, ESLint, Prettier y build
  Next.js verdes.

### Verificación remota — 1 de agosto de 2026

- Se aplicaron al proyecto `xmwewmukoxdeuilmkahr` las migraciones `20260731213000`,
  `20260731213200` y `20260731213300`.
- pgTAP ejecutó 32/32 pruebas dentro de una migración temporal que terminó deliberadamente en
  error después de `finish()`: el sentinel `TABLIO_PGTAP_OK_32` confirmó el verde y obligó el
  rollback completo de fixtures y del propio artefacto de verificación.
- Security Advisor quedó con los nueve hallazgos históricos: seis `WARN` de OI-019 y tres
  `INFO` de OI-023. Ninguno pertenece a las tablas o RPCs de Sprint 14.
- Performance Advisor detectó inicialmente tres claves foráneas de auditoría sin índice. La
  migración `20260731213300` agregó la cobertura y la segunda ejecución confirmó cero
  `unindexed_foreign_keys`.
- Los índices recién creados aparecen como `unused_index`, informativo y esperado sin tráfico;
  se conservan porque cubren claves foráneas y su evaluación con carga real sigue OI-008.
- Se detectó divergencia histórica de timestamps y hotfixes entre migraciones locales y
  remotas de Sprints 11–13. La aplicación segura usó una copia temporal del historial remoto y
  el trabajo de reconciliación quedó registrado en OI-027.
