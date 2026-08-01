# Sistema de diseño de Tablio

Estado: **piloto validado en Dueño y Mesas, extendido a Caja, KDS, Garzón, Superadmin, Onboarding
y Crédito**. Sólo falta la PWA del comensal. Las demás pantallas conservan temporalmente sus
estilos anteriores hasta que se migren una por una.

## Fuentes de verdad

1. `/brand/tablio_branding.html` define identidad, color, tipografía, voz y componentes.
2. `/reference/table-tray-qr/` aporta únicamente arquitectura visual: nombres de tokens,
   shell, navegación y convenciones de componentes.
3. ADR-000 define el stack: Tailwind CSS, Radix Primitives y componentes propios basados en
   shadcn/ui.

No se copiaron rutas, datos ni lógica de la aplicación de referencia.

## Tokens semánticos

Los componentes no escriben colores literales. Usan `bg-card`, `text-muted-foreground`,
`border-border`, `bg-primary` y equivalentes. Los valores HSL viven en
`apps/web/app/globals.css`.

| Token                 | Origen visual              | Uso                                                       |
| --------------------- | -------------------------- | --------------------------------------------------------- |
| `--background`        | cálido `#F8F7F3`           | fondo principal                                           |
| `--foreground`        | negro `#111110`            | texto principal                                           |
| `--card`, `--popover` | blanco `#FEFEFE`           | superficies opacas                                        |
| `--primary`           | naranja oscuro `#B83E10`   | botón primario                                            |
| `--primary-hover`     | naranja profundo `#8F2F0B` | hover aprobado, más oscuro y sin alterar el naranja marca |
| `--brand`, `--ring`   | naranja `#E8531D`          | marca, foco y elementos activos                           |
| `--accent`            | naranja claro `#FEF0E8`    | activo de navegación y foco suave                         |
| `--muted`             | gris claro `#F0EFE9`       | fondo secundario                                          |
| `--muted-foreground`  | gris `#3D3D3A`             | texto secundario                                          |
| `--placeholder`       | gris `#6B6B66`             | placeholder; nunca `#BEBDB8`                              |
| `--border`, `--input` | gris `#BEBDB8`             | bordes; nunca texto                                       |
| `--success`           | verde `#1A6B45`            | éxito                                                     |
| `--destructive`       | rojo `#C0280F`             | error                                                     |
| `--warning`           | ámbar `#B87C10`            | aviso                                                     |
| `--sidebar-*`         | mismos tokens anteriores   | shell operacional                                         |
| `--touch-min`         | decisión aprobada          | `3.5rem` / 56 px                                          |

El botón primario blanco sobre `#B83E10` mide **5,58:1** y pasa WCAG AA. Su hover blanco
sobre `#8F2F0B` mide **8,07:1**. El naranja marca `#E8531D` no se usa como fondo de texto
blanco porque esa combinación mide 3,66:1.

## Tipografía y movimiento

- Única familia de producto: Plus Jakarta Sans.
- Se sirve un WOFF2 variable latino local con pesos 200–800. No se consulta Google Fonts en
  producción.
- Escala: Display 64 px, H1 36/48 px, H2 24 px, H3 18 px, Body 16 px, Small 13 px y Label
  11 px. Son puntos de la escala exacta del brand book.
- Instrument Serif queda reservada a marketing y no existe en componentes de producto.
- Movimiento: 120 ms para respuesta, 180 ms para estado y 240 ms para modal. Sólo opacidad,
  color y transform; `prefers-reduced-motion` elimina transiciones no esenciales.

## Espaciado y radios

Tailwind sólo expone al sistema piloto los pasos 4, 8, 12, 16, 24, 32, 48 y 64 px. Las
dimensiones estructurales reciben nombres propios (`sidebar`, `chart`, `touch`) y no se
disfrazan como espaciado.

- Botón normal: `12 × 24 px`, radio 10 px.
- Botón pequeño: `8 × 16 px`, radio 7 px.
- Input: `12 × 16 px`, radio 10 px.
- Superficies: radios 4, 8, 12, 16 y 24 px; píldora sólo cuando corresponde.
- La indicación `py-2.5` de la referencia equivale a 10 px y contradice la escala oficial.
  Como el brand book es la fuente de verdad, la navegación usa 8 px verticales más una
  altura táctil mínima de 56 px.

## Shell operacional

- Escritorio: sidebar fijo de 224 px, logo y local arriba, navegación central y salida abajo.
- Móvil: la misma navegación se presenta en una barra inferior fija.
- Contenido: 16 px de padding móvil y 24 px en escritorio.
- Banner superior opaco para modo demo o impersonación.
- Logo: `tablio` en minúscula y punto naranja. El punto es marca gráfica; el nombre accesible
  completo es “tablio”.
- KDS queda fuera del shell porque es una pantalla completa montada en la barra.

## Componentes internos disponibles

- `Button`, con Radix Slot para `asChild`.
- `Input`.
- `Select` y `Textarea`.
- `Card`.
- `Badge` / chip.
- `Alert`.
- `Dialog`, sobre Radix, siempre opaco y con foco/teclado resueltos.
- `Skeleton`.
- Iconos internos livianos con `currentColor`.

Todo componente nuevo debe usar tokens semánticos. Si falta un color, se agrega un token
derivado del brand book; no se escribe un literal dentro del componente.

## `cn()` fusiona clases en conflicto — causa raíz cerrada (2026-08-01)

Durante Sprint 14 aparecieron tres bugs reales de la misma causa: `cn()` (`apps/web/lib/cn.ts`)
era sólo `clsx` — concatenaba texto, no resolvía nada. Cuando una clase base de un componente y
una clase de quien lo usa caían en la misma propiedad CSS (`border-transparent` de la base de
`Button` contra `border-border` de su variant `outline`; `text-card-foreground` de la base de
`Card` contra `text-background` que le pasaba Crédito para invertir el tema; `text-[#fefefe]`
fijo de `kdsButton` contra el `text-[#111110]` condicional del tab activo en KDS), ganaba la
regla que Tailwind generó después en el CSS — no la que aparecía después en el JSX. Los tres
casos produjeron texto o bordes invisibles, y ninguno lo detectaron los tests: sólo aparecieron
mirando capturas de pantalla.

**Arreglado en la raíz, no en cada sitio donde apareció:** `cn()` ahora pasa el resultado de
`clsx` por `tailwind-merge` (`twMerge`), que sí entiende qué clases pertenecen al mismo grupo
(color de fondo, color de texto, color de borde, radio, tamaño de fuente, espaciado…) y se queda
sólo con la última — así que la composición siempre se comporta como se lee en el JSX, sin
depender del orden en que Tailwind generó el CSS.

Como el sistema de tokens de Tablio vive fuera de la paleta por defecto de Tailwind (son
variables `--color-*`/`--text-*`/`--radius-*`/`--spacing-*` definidas en `@theme inline` dentro
de `globals.css`), `tailwind-merge` no puede adivinar solo qué nombres personalizados comparten
propiedad — hay que decírselo. `lib/cn.ts` registra cada lista de tokens vía
`extendTailwindMerge({ extend: { theme: { color, text, radius, spacing } } })`, calcada de esas
mismas variables. **Si se agrega o renombra un token semántico en `globals.css`, hay que
reflejarlo en `lib/cn.ts` o `tailwind-merge` dejará de reconocer los conflictos de ese token
(vuelve al comportamiento silencioso de antes, no falla ruidosamente).**

Verificado que las tres composiciones que ya habían fallado ahora se resuelven solas (sin
depender de que cada componente evite el conflicto a mano):

```
cn("border border-transparent", "border-border")                          → "border border-border"
cn("text-card-foreground", "text-background")                              → "text-background"
cn("text-h2", "text-background")                                           → "text-h2 text-background"   (sin conflicto: tamaño vs color)
cn("text-h1 tracking-tight text-foreground lg:text-h1-lg")                 → intacto (breakpoints distintos no conflictúan)
```

Los arreglos puntuales que ya se habían hecho a mano en `button.tsx` (cada variant con su propio
color de borde) y `credit-demo.tsx` (`text-background` explícito en cada elemento) se dejaron
como están — son redundantes con lo que `twMerge` ya resolvería solo, pero siguen siendo
correctos y más explícitos, así que no hacía falta deshacerlos. Lo que sí cambia hacia adelante:
un componente nuevo con este mismo patrón (base + variant en la misma propiedad) ya no puede
producir este bug, sin que nadie tenga que acordarse de la regla caso por caso.

Regresión ejecutada tras el cambio (afecta a `cn()` global, la usa cada componente del
sistema): `typecheck`/`lint`/`build` verdes, Vitest 144/144, Playwright 44/46 (mismo patrón
preexistente de siempre, sin regresiones nuevas), auditoría de contraste/táctil/foco re-corrida
en las 8 pantallas migradas (Dueño, Mesas, Caja, KDS, Garzón, Superadmin, Onboarding, Crédito) —
las 8 en cero fallos, y revisión visual dirigida a los tres puntos que ya habían fallado antes
(bordes en Mesas, texto de la tarjeta oscura en Crédito) confirma que se ven igual de bien que
antes del cambio.

## Modo oscuro: decisión pendiente, no inventada

No se agregó un tema oscuro global en este incremento. El brand book autoriza fondo claro o
negro puro, pero no define las equivalencias semánticas completas de `card`, `muted`,
`accent`, estados y bordes en oscuro. El KDS actual conserva su tratamiento propio hasta su
migración. Antes de migrar KDS o garzón se debe aprobar esa matriz; no se dedujo en silencio.

## Patrones de página

- Encabezado: H1, contexto con datos reales y acción principal a la derecha.
- Entidades como Mesas: grilla de tarjetas, estado semántico, dato principal grande y tarjeta
  punteada para agregar.
- Flujos: kanban con contadores; maestros: lista y detalle; analítica: período, métricas y
  gráficos; listados operativos: tabla con estados y acciones.
- Estados técnicos nunca se imprimen tal cual. `ui-statuses.ts` es el diccionario único.
- Montos, fechas, duraciones y tiempos relativos usan `lib/format.ts`.
- Tokens, UUID y secretos no aparecen fuera del superadmin.
- Todo vacío explica por qué está vacío y qué acción sigue.

El badge de aviso conserva el fondo ámbar oficial, pero usa texto negro: ámbar sobre el fondo
suave medía 3,13:1 y fallaba AA. No se inventó un nuevo amarillo.

## Caja (2026-08-01)

`/caja` es la primera pantalla con pestañas (Mesas, Excepciones, Conciliación, Sellos, Saldo,
Cierre) migrada al sistema. Patrones nuevos que quedan como precedente para el resto:

- Las pestañas son `Button` en fila horizontal con scroll propio en móvil (`variant="primary"`
  activa, `variant="outline"` inactiva). No existe todavía un componente `Tabs` dedicado; si una
  tercera pantalla necesita pestañas, ese es el momento de extraerlo.
- Los diccionarios de estado específicos de Caja (mesa en vivo, prioridad y estado de excepción,
  conciliación, documento tributario, salud del proveedor DTE, cuenta de crédito, cuenta de
  saldo) viven en `lib/ui-statuses.ts` junto a los de Mesas.
- `lib/format.ts` ganó `formatTime` (hora corta) para reutilizar en cualquier pantalla operativa
  que necesite mostrar una hora sin fecha.
- Los enlaces de acción dentro de una tabla densa (`Ver documento`, `Reintentar`) usan
  `Button asChild size="small" variant="ghost"` en vez de un `<a>`/`<button>` suelto: así heredan
  automáticamente el contraste y el mínimo táctil de 56 px sin declarar estilos nuevos. Un `<a>`
  suelto con solo `underline` falló ambos controles en la auditoría.
- Las interacciones que ya usaban `window.prompt()` para pedir monto/motivo (reembolso, escalar,
  reintentar boleta, cerrar turno) **se mantuvieron intactas**. Las pruebas E2E de Caja escuchan
  el diálogo nativo del navegador (`page.on("dialog")`); reemplazarlas por un `Dialog` propio es
  un cambio de interacción, no una migración visual, y debe hacerse aparte con sus pruebas
  actualizadas a propósito.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde en las 6 pestañas, escritorio y
  móvil (`docs/evidence/SPRINT-14-CASHIER*-A11Y.json`). El script de auditoría
  (`tests/visual/sprint-14-owner-a11y.ts`) ganó `TABLIO_A11Y_CLICK_ROLE_NAME` para poder auditar
  pantallas con pestañas, más un `Tab`/`Shift+Tab` después del clic: sin ese paso, el clic previo
  cambia la modalidad de foco del navegador a "mouse" y el chequeo de foco reporta fallos falsos
  en cada elemento interactivo de la vista.

## KDS (2026-08-01) — la excepción deliberada del sistema

`/kds` es la única pantalla que **no** usa `AppShell` ni el fondo claro. Es una pantalla completa
montada en la barra, para leer a dos metros con las manos ocupadas o mojadas, así que sigue reglas
propias documentadas aquí para no perderlas en la próxima migración:

- Sin sidebar, sin navegación compartida, sin superficies traslúcidas ni `backdrop-filter`. Fondo
  siempre sólido.
- Los colores de acento (naranja de marca, verde de éxito, ámbar de aviso, rojo crítico) son los
  **mismos tokens de marca** que usa el resto del producto (`bg-brand`, `bg-success`,
  `bg-warning`, `bg-destructive`) — no son inventados. Lo único bespoke son las superficies
  estructurales oscuras (fondo de página, barra superior, tarjetas de resumen), como valores
  Tailwind arbitrarios (`bg-[#111110]`, etc.), porque OI-026 todavía no aprueba una matriz
  semántica oscura completa; inventar una aquí habría sido decidir esa matriz por la puerta de
  atrás.
- La comanda (`TicketCard`) es la excepción dentro de la excepción: es un "papel" claro que reusa
  `bg-background`/`text-foreground`/`Badge` como el resto del producto, porque una comanda impresa
  siempre se lee como papel claro sobre un mostrador oscuro, incluso en una pantalla de cocina.
- Objetivos táctiles explícitamente más grandes que el mínimo de 56 px (64–72 px) para manos
  ocupadas; motion respeta `prefers-reduced-motion` igual que el resto del sistema.
- El indicador de conexión y "Actualizado hace…" son permanentes en la barra superior; una barra
  de alerta roja separada aparece si la última sincronización supera el umbral configurado, para
  que nunca se confunda "no hay pedidos" con "la pantalla se colgó".
- **Lección para las próximas pantallas (causa raíz ya cerrada):** una clase base con un color
  de texto (`kdsButton` con `text-[#fefefe]`) combinada con una clase condicional que agrega OTRO
  color de texto (`text-[#111110]`) era frágil porque `cn()` era sólo `clsx`, sin fusión — ambas
  clases coexistían y el orden de generación de Tailwind (no el orden en el JSX) decidía cuál
  ganaba. Se encontró así el tab de estación activo renderizando texto invisible; el mismo patrón
  reapareció después en `Button` y en `Card`/Crédito. **`cn()` ahora fusiona clases en conflicto
  con `tailwind-merge`** — ver "`cn()` fusiona clases en conflicto" más arriba para el arreglo de
  fondo y por qué ya no puede volver a pasar sola. El ternario completo que sigue usando este
  archivo (en vez de base fija + añadido condicional) sigue siendo la forma más clara de escribir
  la intención, pero ya no es la única red de seguridad.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde en vacío y con comandas activas,
  escritorio y móvil (`docs/evidence/SPRINT-14-KDS-A11Y.json` y
  `docs/evidence/SPRINT-14-KDS-tickets-A11Y.json`). El script de contraste funciona igual sobre
  fondo oscuro: calcula la razón real, no asume tema claro.

## Garzón (2026-08-01) — mismo patrón que KDS, para el mismo bar oscuro

`/garzon` sigue el patrón acotado de KDS documentado arriba (ver también OI-026): sin `AppShell`
—es una PWA de un solo propósito para el teléfono del garzón, no un panel de escritorio—, fondo
sólido oscuro, tokens de acento compartidos, superficies estructurales con valores arbitrarios.
Contexto de diseño explícito del fundador: celular, una mano, en movimiento, bar ruidoso y
oscuro — se lee de un vistazo o no sirve.

- **Prioridad visual a las entregas listas:** una tarjeta de tarea recibe un borde izquierdo
  grueso de color según urgencia (`border-l-destructive` crítica, `border-l-warning` atrasada,
  `border-l-success` para una entrega lista sin atraso, `border-l-border` el resto) y las
  entregas listas suman una insignia `✓ ENTREGA LISTA` en verde. La urgencia real (crítica o
  atrasada) sigue ganando sobre el tipo de tarea, porque una entrega vieja importa más que una
  nueva.
- **Indicador de conexión** con el mismo patrón de KDS: insignia con punto + "En línea" /
  "Reconectando" / "PUEDE ESTAR DESACTUALIZADO" + "Actualizado hace…", siempre visible en la
  barra superior, más una franja roja de ancho completo cuando la última sincronización supera
  el umbral — para que nunca se confunda "no hay tareas" con "la app se colgó".
- Las tarjetas de tarea y de mesa reusan `bg-background`/`Badge` (tokens claros), igual que la
  comanda de KDS: se leen como una ficha de papel sobre el mostrador oscuro.
- Los cinco flujos que pedían motivo por `window.prompt()` (descartar solicitud, traspasar zona,
  reportar incidencia, separar mesas, transferir mesa) pasaron a un diálogo propio con
  `Textarea`, igual que el resto del sistema — ninguno estaba enganchado a un test que escuchara
  el diálogo nativo del navegador, a diferencia de Caja.
- **Dos bugs reales encontrados y corregidos antes de reportar** (ninguno llegó a producción):
  1. Una tarjeta de mesa con texto blanco sobre fondo blanco: un `<button>` interno no declaraba
     `bg-*`. Este proyecto no carga el preflight de Tailwind (`globals.css` importa sólo
     `tailwindcss/utilities.css`), así que un botón nativo sin fondo explícito muestra el fondo
     gris por defecto del navegador en vez de heredar transparencia. **Regla nueva:** todo
     `<button>` de este código necesita un `bg-*` explícito (aunque sea `bg-transparent`), nunca
     asumir que hereda "sin fondo".
  2. Las casillas "agrupar" quedaban en 13×13 px nativos: usaban `size-5`, y `spacing-5` no
     existe en la escala aprobada (`4, 8, 12, 16, 24, 32, 48, 64`), así que la clase no generaba
     nada y el navegador conservaba su tamaño por defecto. Se cambió a `size-touch` (56 px):
     además de corregir la auditoría, es la decisión correcta para el contexto de una mano.
- El script de auditoría (`tests/visual/sprint-14-owner-a11y.ts`) ganó soporte de
  `TABLIO_A11Y_STORAGE_STATE` para auditar pantallas con sesión (útil para Garzón y para
  cualquier pantalla futura detrás de login), y una espera de 250 ms tras el clic de pestaña:
  sin ella, la auditoría podía medir el color de un botón a mitad de su transición CSS de
  120 ms y reportar un falso fallo de contraste en el tab recién activado.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde en login, selección de zona,
  tareas (vacío y con una entrega lista + un llamado), mesas (con crédito) y turno, escritorio y
  móvil (`docs/evidence/SPRINT-14-WAITER-*-A11Y.json`).

## Superadmin (2026-08-01)

`/superadmin` vuelve al sistema claro estándar (no es KDS/Garzón): es la oficina de soporte de
Tablio, de uso diurno, no el mostrador de un bar. No usa `AppShell` porque su navegación no es
la de un tenant — no tiene sentido un sidebar que enlace a `/dueno`, `/caja`, etc. para alguien
que administra muchos locales — pero reusa exactamente los mismos tokens, `Card`, `Badge`,
`Button`, `Dialog`, `Select` que el resto.

- Patrón maestro-detalle: lista de tenants a la izquierda (`role="row"` por fila, como pedía el
  test ya existente), detalle a la derecha con estado vacío explícito cuando no hay selección.
- Se agregó `subscriptionStatusDictionary` a `lib/ui-statuses.ts` con las mismas ocho etiquetas
  que ya existían (Prueba, Al día, Cobro fallido, En gracia, Administración restringida,
  Suspensión agendada, Suspendido, Cancelado), ahora con tono semántico en vez de una clase CSS
  por estado.
- Se promovió `ReasonDialog` (nacido en Garzón) a `components/ui/reason-dialog.tsx`: ya es la
  segunda pantalla que lo necesita (motivo de baja de un tenant). Ahora usa el `Button`
  compartido en vez de los botones oscuros propios de Garzón.
- **"Entrar como soporte" se dejó intencionalmente en `window.prompt()`**, a diferencia de los
  otros tres flujos de esta misma pantalla (alta de tenant, umbral de alerta, baja de tenant) que
  sí pasaron a diálogo propio: el test E2E de impersonación escucha el diálogo nativo del
  navegador (`page.once("dialog", …)`), igual que el cierre de turno y el reintento de boleta en
  Caja. Mismo criterio en las tres pantallas: sólo se modernizan las interacciones que ningún
  test engancha al diálogo nativo.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde con la lista sin selección y con
  un tenant seleccionado (feature flags, cobranza simulada, exposición de saldo), escritorio y
  móvil (`docs/evidence/SPRINT-14-SUPERADMIN-A11Y.json` y
  `docs/evidence/SPRINT-14-SUPERADMIN-detail-A11Y.json`).

## Onboarding (2026-08-01)

`/onboarding` vuelve a `AppShell` — a diferencia de Superadmin, esta pantalla **sí** es
tenant-scoped (prepara ESTE local) y ya estaba enlazada desde la navegación compartida como
"Configurar". Se agregó la clave `"configure"` a `OwnerNavigationKey`.

- El asistente de 9 pasos (`stepNav`, antes una clase CSS) pasó a una fila de botones con
  scroll horizontal propio (`data-testid="onboarding-step-nav"`), igual que las pestañas de
  Caja: número o `✓` + nombre del paso, estado activo/completo por color.
- Cada campo usa el mismo patrón `FieldLabel` con `htmlFor`/`id` que ya usa Mesas, en vez de
  `<label>` envolviendo el input sin asociación explícita.
- Es el primer componente con reglas de negocio reales que sobreviven a una migración de 9
  pasos casi sin tocarlas: sólo cambiaron clases y componentes, ninguna mutación ni validación.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde en el paso 1 (Local) y en el
  paso 3 con carta importada y en revisión (botón "Publicar" deshabilitado), escritorio y móvil
  (`docs/evidence/SPRINT-14-ONBOARDING-A11Y.json`,
  `docs/evidence/SPRINT-14-ONBOARDING-menu-A11Y.json`).

## Crédito (2026-08-01)

`/credito` vuelve al tema claro estándar con `AppShell` (comparte sección de navegación con Caja).
Tres columnas: operación de caja, "pantalla del cliente" (tarjeta oscura invertida, la única en
el producto — ver abajo) y validación del garzón.

- **La misma lección de KDS (arriba), pero esta vez en un componente compartido, no en una
  pantalla aislada — la tercera vez que aparecía fue la que hizo cerrar la causa raíz.**
  Revisando las capturas aparecieron dos bugs reales del mismo origen — `cn()` era `clsx` sin
  fusión, una base que fija un color de texto/borde ganaba sobre la clase que quien lo usa le
  pasa para pisarlo:
  - `components/ui/button.tsx`: la base de `cva` fijaba `border-transparent`; el variant
    `outline` nunca lograba mostrar su `border-border`. Afectaba a **todas** las pantallas ya
    migradas que usan `variant="outline"` (confirmado también en Mesas, no es nuevo de Crédito).
    Corregido en la raíz: cada variant declara su propio color de borde, ninguno depende de pisar
    la base.
  - `credit-demo.tsx` le pasaba `text-background` a un `Card` (cuya base fija
    `text-card-foreground`) para invertir el tema de la "pantalla del cliente". No ganaba: el
    estado de pago, el monto y — el más grave — **los 6 dígitos del código de verificación que el
    cliente lee en voz alta al garzón** se renderizaban negro sobre negro, invisibles. Corregido
    dándole `text-background` explícito a cada elemento de texto directamente, no al contenedor.
    Detalle completo y verificación en `BUILD_LOG.md`.
  - Estos dos bugs fueron la evidencia que llevó a arreglar la causa raíz el mismo día: `cn()`
    ahora fusiona clases en conflicto con `tailwind-merge` (ver la sección dedicada más arriba),
    así que esta clase de bug ya no depende de que cada componente nuevo recuerde la regla.
- El script de auditoría (`tests/visual/sprint-14-owner-a11y.ts`) tenía un falso positivo propio:
  no sabía leer colores `oklab()` (los que produce Chromium para textos con modificador de
  opacidad, ej. `text-background/70`, porque el `color-mix()` detrás no siempre vuelve a sRGB sin
  pérdida). Ahora convierte `oklab()` a sRGB con las matrices estándar antes de calcular
  contraste, así que pantallas futuras con opacidad en el texto no van a disparar esta alarma.
- Auditoría de contraste/táctil/foco/gradientes/desborde en `/credito`, escritorio y móvil, con
  crédito abierto y con código de verificación generado: **0 fallos** tras los dos arreglos
  (`docs/evidence/SPRINT-14-CREDIT-A11Y.json`).

## Límite de la migración

`/dueno`, `/dueno/mesas`, `/caja`, `/kds`, `/garzon`, `/superadmin`, `/onboarding` y `/credito` ya
están en el sistema de diseño (KDS y Garzón con su tratamiento propio documentado arriba). Las
tarjetas de impresión son un asset de la pantalla de Mesas, no otro panel migrado. Los colores
literales del CSS histórico siguen presentes en el resto de las pantallas para no alterarlas sin
validación. Sólo falta la PWA del comensal, que queda para el final con revisión aparte. El
siguiente incremento después de eso debe construir las pantallas nuevas de Tarea 4, no superponer
una tercera familia de estilos.
