# Sistema de diseño de Tablio

Estado: **piloto validado en Dueño y Mesas, extendido a Caja y KDS**. Las demás pantallas
conservan temporalmente sus estilos anteriores hasta que se migren una por una.

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
- **Lección para las próximas pantallas:** una clase base con un color de texto (`kdsButton` con
  `text-[#fefefe]`) combinada con una clase condicional que agrega OTRO color de texto
  (`text-[#111110]`) es frágil sin `tailwind-merge` — `cn()` en este proyecto es sólo `clsx`, así
  que ambas clases coexisten y el orden de generación de Tailwind (no el orden en el JSX) decide
  cuál gana. Se encontró así el tab de estación activo renderizando texto invisible. La regla:
  cuando una variante cambia un color que la base ya fija, usar un ternario que reemplace la
  cadena completa (como hace `cva` en los componentes compartidos), nunca una base fija más un
  añadido condicional del mismo tipo de utilidad.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde en vacío y con comandas activas,
  escritorio y móvil (`docs/evidence/SPRINT-14-KDS-A11Y.json` y
  `docs/evidence/SPRINT-14-KDS-tickets-A11Y.json`). El script de contraste funciona igual sobre
  fondo oscuro: calcula la razón real, no asume tema claro.

## Límite de la migración

`/dueno`, `/dueno/mesas`, `/caja` y `/kds` ya están en el sistema de diseño (KDS con su
tratamiento propio documentado arriba). Las tarjetas de impresión son un asset de la pantalla de
Mesas, no otro panel migrado. Los colores literales del CSS histórico siguen presentes en el
resto de las pantallas para no alterarlas sin validación. El siguiente incremento debe migrarlas
una por una y eliminar sus reglas antiguas, no superponer una tercera familia.
