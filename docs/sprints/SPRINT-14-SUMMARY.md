# Sprint 14 — Sistema de diseño y pulido visual

## Resultado

Las 13 pantallas de producto de Tablio (Dueño, Mesas, Caja, KDS, Garzón, Superadmin, Onboarding,
Crédito, PWA del comensal, Equipo, Configuración del local, Soporte, Reportes) tienen su diseño
final. Las primeras 9 se migraron desde su CSS histórico; las últimas 4 (Tarea 4) se construyeron
directamente sobre el sistema, así que nunca tuvieron un "antes" que migrar. Sprint 14 también
incluyó, como trabajo relacionado pero documentado aparte, la autenticación real del dueño
(`ADR-015`) y el diagnóstico/cierre de OI-027/OI-030/OI-031 (drift de esquema y verificación
programada) — este resumen se concentra en el sistema de diseño, que es lo que cierra hoy.

## Qué se migró

| Pantalla | Patrón | Nota |
| --- | --- | --- |
| Dueño | Estándar claro, `AppShell` | Piloto del sistema; aquí se midió rendimiento y se estableció la puerta del 5% |
| Mesas | Estándar claro, `AppShell` | Grilla de tarjetas, tarjeta punteada para agregar |
| Caja | Estándar claro, `AppShell` | Primera pantalla con pestañas (patrón reutilizado después) |
| KDS | Excepción oscura deliberada | Sin `AppShell`, fondo sólido, se lee a 2 metros con las manos ocupadas |
| Garzón | Excepción oscura, mismo patrón que KDS | PWA de un propósito para el teléfono del garzón |
| Superadmin | Estándar claro, sin `AppShell` | Navegación de plataforma, no de tenant |
| Onboarding | Estándar claro, `AppShell` | Asistente de 9 pasos, reglas de negocio intactas |
| Crédito | Estándar claro, `AppShell` | Única tarjeta invertida del producto (pantalla del cliente) |
| PWA del comensal | Estándar claro, sin `AppShell` | La más grande: 9 pantallas internas en un componente |
| Equipo, Configuración, Soporte, Reportes | Estándar claro, `AppShell` | Nacieron ya sobre el sistema — Tarea 4, no migración |

## Bugs reales encontrados y corregidos (no simulados, no hipotéticos)

Todos se encontraron mirando capturas de pantalla o por fallas de prueba automática — ninguno
por inspección de código en abstracto.

1. **Texto invisible por `cn()` sin fusión de clases** (causa raíz, cerrada 2026-08-01): `cn()`
   era sólo `clsx`, así que cuando una clase base y una clase de override caían en la misma
   propiedad CSS, ganaba el orden de generación de Tailwind, no el orden del JSX. Apareció tres
   veces independientes (`Button` variant `outline` sin borde, `Card` invertida de Crédito con
   el código de verificación en negro sobre negro, tab activo de KDS con texto invisible) antes
   de arreglarse en la raíz con `tailwind-merge`.
2. **`<button>` sin `bg-*` explícito muestra el botón por defecto del navegador** (este proyecto
   no carga el preflight de Tailwind): apareció primero en Garzón (una tarjeta de mesa con texto
   blanco sobre blanco), y de nuevo en la PWA del comensal (el botón "Ahora no" de una sugerencia
   de upsell, casi invisible sobre la tarjeta negra de checkout). Se auditaron los 14 `<button>`
   nativos de la PWA uno por uno; 6 no tenían fondo explícito.
3. **Botones primarios deshabilitados dentro de tarjetas oscuras, ilegibles** (PWA del comensal):
   el `disabled:opacity-50` genérico, combinado con un fondo ya oscuro, dejaba el botón en un
   marrón apagado casi ilegible. Corregido con un tratamiento específico para ese caso en los 7
   sitios donde aplica.
4. **Escala de espaciado restringida ignorada en silencio**: este proyecto sólo genera CSS para
   los pasos 4, 8, 12, 16, 24, 32, 48 y 64 px de la escala (clases `p-1` a `p-16`, no `p-24` ni
   más). Escribir el número de Tailwind "de fábrica" (`p-5`, `pb-24`, `w-64`) no genera ningún
   error — simplemente no genera CSS, y el elemento se queda sin ese estilo. Se encontró once
   veces en la PWA del comensal (una de ellas tapaba el botón de pago del checkout detrás del
   menú inferior fijo — la encontraron las pruebas E2E, no la vista) y, al auditar el resto del
   código por la misma causa antes de cerrar el sprint, **28 veces más** repartidas en Equipo,
   Configuración, Soporte, Reportes, Garzón, KDS, Onboarding y el componente compartido
   `Textarea` (afectaba su alto mínimo en cualquier pantalla que lo usara). Todas corregidas al
   valor de la escala más cercano o a un valor entre corchetes cuando ninguno de la escala
   alcanzaba, verificadas visualmente después de corregir.
5. **Ícono de "Volver" apuntando a la derecha** (PWA del comensal): heredado del componente
   original, donde el mismo ícono servía para avanzar y retroceder. Corregido sólo en el uso de
   retroceso.
6. **Indicador de desarrollo de Next.js tapando el menú inferior fijo**: la insignia "N" de
   `bottom-left` (posición por defecto) se superponía con el botón "Carta" de la PWA y bloqueaba
   los clics en las pruebas E2E. Reposicionado a `top-left`, la única esquina que ningún test usa.

## Conteo final (auditoría verificada hoy contra el código, no contra un inventario histórico)

No se encontró en el repositorio ningún registro del inventario inicial de colores/tamaños/
radios/espaciados fuera de escala — se buscó en `docs/`, `docs/evidence/` y todo el historial de
commits de Sprint 14 sin resultado. En vez de inventar una comparación contra un número que no se
pudo verificar, se corrió una auditoría real contra el estado actual del código:

| Categoría | Encontrado | Dónde |
| --- | --- | --- |
| Colores literales fuera del sistema de tokens | 127 usos | 100% en KDS y Garzón — las dos excepciones oscuras ya documentadas (sin matriz semántica oscura aprobada aún, OI-026) |
| Tamaños tipográficos arbitrarios | 9 usos | 100% en KDS y Garzón, misma excepción documentada |
| Radios arbitrarios fuera de los tokens de superficie/botón/input | 0 usos | — |
| Espaciados fuera de la escala aprobada (bug silencioso, no visual) | 0 usos, tras corregir 39 (11 en la PWA + 28 encontrados al auditar el resto) | — |

Cero pantallas del producto usan un color o tamaño literal fuera de las dos excepciones oscuras
ya aprobadas y documentadas en `docs/DESIGN_SYSTEM.md`. Cero clases de espaciado quedan sin
generar CSS.

## Rendimiento — puerta del 5%

Medido una vez, con metodología reproducible, sobre la pantalla piloto (`/dueno`): Chrome,
viewport 360×740, CPU 4×, red 4G lenta (1,6 Mbps, 150 ms de latencia), caché desactivada, siete
muestras por estado. Las demás pantallas reutilizan los mismos componentes base, por lo que no
se repitió la medición completa pantalla por pantalla.

| Métrica (p95) | Antes | Después | Cambio | Bajo la puerta del 5% |
| --- | --- | --- | --- | --- |
| Tiempo utilizable | 2.106 ms | 2.162 ms | +2,7% | Sí |
| `load` | 1.498 ms | 1.519 ms | +1,4% | Sí |
| Transferencia | 202.637 B | 208.881 B | +3,1% | Sí |

El primer contenido visible subió 76 ms (+9,8%, por encima de la puerta) — se registró sin
ocultarlo; no dispara rollback porque el panel completo se vuelve utilizable dentro del
presupuesto igual. Detalle completo en `docs/evidence/SPRINT-14-OWNER-PERFORMANCE.md`.

## Auditoría de accesibilidad

Automatizada (contraste WCAG AA, texto invisible, objetivo táctil 56×56 px, foco visible,
gradientes, desborde horizontal) para 8 de las 9 pantallas originales, guardada en
`docs/evidence/SPRINT-14-*-A11Y.json`: **0 fallos** en todas. La PWA del comensal se auditó igual
para su pantalla de entrada (`SPRINT-14-DINER-PWA-entry-A11Y.json`, 0 fallos, escritorio y
móvil) — la herramienta automática no soporta pantallas con formulario previo (carta, checkout,
pago, estado), así que esos estados se cubrieron con revisión manual por captura, instrucción
explícita del fundador dado el antecedente del código de verificación invisible en Crédito. Esa
revisión manual fue la que encontró los bugs 2, 3 y 5 de la lista de arriba.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test` (149/149) en verde después de cada corrección.
Playwright: 45/46 — la única falla (`credit-owner.spec.ts`, "una fuga alimenta el costo
mensual...") es una prueba sensible a la fecha real del sistema, sin relación con este sprint
(confirmado corriéndola contra el código sin los cambios de este sprint: falla igual). Registrada
como OI-035, no bloqueante.

## Qué NO se hizo (fuera de alcance de este sprint)

- Ninguna de las 13 pantallas está conectada a datos reales todavía, salvo Equipo, Configuración,
  Soporte y Reportes (que sí lo nacieron real, por decisión explícita del fundador durante Tarea
  4). Las otras 9 siguen sobre *stores* en memoria — ver OI-033 y OI-034.
- No se aprobó una matriz semántica de tema oscuro — KDS y Garzón siguen con valores arbitrarios
  documentados como excepción, no como patrón a copiar.
- No se construyó un componente `Tabs` dedicado — las pantallas con pestañas (Caja, PWA, entre
  otras) siguen usando el patrón de fila de botones con scroll horizontal.
