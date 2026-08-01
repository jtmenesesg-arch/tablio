# Sistema de diseño de Tablio

Estado: **piloto validado en Dueño y extendido a Mesas para revisión**. Las demás pantallas
conservan temporalmente sus estilos anteriores hasta que el fundador apruebe esta dirección.

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

## Límite de la migración

Sólo `/dueno` y `/dueno/mesas` usan el nuevo shell y la biblioteca interna. Las tarjetas de
impresión son un asset de esa pantalla, no otro panel migrado. Los colores literales del CSS
histórico siguen presentes para no alterar el resto sin validación. El siguiente incremento
debe migrarlas una por una y eliminar sus reglas antiguas, no superponer una tercera familia.
