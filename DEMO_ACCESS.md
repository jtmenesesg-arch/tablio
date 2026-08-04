# Accesos para demostrar Tablio

**Lee esto primero: hoy siguen existiendo DOS cosas separadas, no una.** No están conectadas
entre sí todavía. Lo que cambió desde la última vez: **el local piloto "Bar La Virgen" ya no
está vacío** — tiene zonas, mesas con QR real, estaciones, carta completa y personal cargados en
la base de datos real. Pero la mayoría de las pantallas de la app **todavía no leen esos datos
reales** — siguen mostrando el demo simulado de siempre. Hoy las pantallas **Equipo**,
**Configuración del local**, **Soporte** y **Reportes** muestran el dato real — con eso, la
Tarea 4 está completa. El resto se irá conectando pantalla por pantalla en lo que sigue (la app
del comensal, y después las 8 pantallas que siguen en el demo simulado — ver OI-033).

Ver `docs/BUILD_LOG.md` (entrada "Tarea 4" y siguientes) para el mapa completo de qué falta por
conectar.

## 1. Piloto real — "Bar La Virgen"

### Cómo entrar

| Qué | Valor |
| --- | --- |
| URL | `/login` |
| Correo | `jtmenesesg@gmail.com` |
| Contraseña | `So7nTcLhI8445RKq` (temporal — no hay pantalla para cambiarla todavía, ver OI-032) |
| Qué pasa al entrar | Te lleva a `/dueno-real`, un panel mínimo que sólo demuestra que el login funciona. Va a mostrar $0 en ventas — eso es correcto, porque los pedidos y pagos todavía se generan en el demo simulado, no aquí (ver sección 3) |

**Importante sobre el menú lateral de esa pantalla:** los botones "Resumen", "Mesas" y "Caja" del
menú lateral hoy **todavía apuntan al demo simulado antiguo** (no a los datos reales de Bar La
Virgen) — es un cabo suelto conocido, no algo que rompiste tú (ver OI-032). "Equipo",
"Configurar", "Reportes" y "Soporte" sí llevan a pantallas reales.

### Qué tiene cargado Bar La Virgen hoy, en la base real

**Zonas (3):**

| Zona |
| --- |
| Terraza |
| Salón |
| Barra |

**Estaciones (2):** Barra, Cocina.

**Mesas (18):** repartidas 8 en Terraza (mesas 1 a 8), 6 en Salón (mesas 9 a 14) y 4 en Barra
(mesas 15 a 18). Cada una se creó con el flujo real de la aplicación, que le generó su propio
código QR y su propio código de presencia (el código de 4 dígitos que la persona en la mesa
ingresa para confirmar que está físicamente ahí).

Para probar, esta es la mesa de muestra:

| Mesa | Zona | Código de presencia | Token QR (para pruebas técnicas) |
| --- | --- | --- | --- |
| Mesa 1 | Terraza | **8447** | `e6Q9x3aDlJMqQBGwpgg6teAZVn7e7sn826lBrX8ItLc` |

**Ojo con esto:** este código y este QR son 100% reales — los generó el mismo mecanismo que
usará el producto final. Pero **todavía no hay ninguna pantalla que los lea** — la app del
comensal (donde alguien escanearía este QR para pedir) ya tiene el diseño final (se migró
visualmente hoy, ver más abajo), pero sigue leyendo del demo simulado, no de la base real
(sección 2, mesa `demo-mesa-8`, código `4826`). Vas a poder probar *este* código real recién
cuando se conecte la PWA a la base real (todavía pendiente, es trabajo de datos, no de diseño).
Por ahora, esta tabla es para que quede documentado que el dato existe y es correcto, no para que
lo pruebes hoy.

**Carta (6 categorías, 20 productos):** Cervezas, Cócteles, Vinos, Para picar, Sándwiches, Sin
alcohol — con precios reales de mercado chileno, descripciones y alérgenos. Dos productos con
stock limitado (Cerveza Corona, 24 unidades; Cerveza Heineken, 4 unidades) y uno marcado agotado
a propósito (Negroni), para que cuando construyamos Configuración puedas ver esos tres estados
funcionando.

**Personal (además del dueño):**

| Nombre | Rol | PIN |
| --- | --- | --- |
| Camila Torres | Garzón | **9911** |
| Matías Rojas | Garzón | **4471** |
| Fernanda Soto | Garzón | **5820** |
| Valentina Reyes | Cajero/Admin | **7702** |

(Hay una quinta persona, Ignacio Muñoz, que quedó suspendida a propósito al ajustar la dotación a
los 3 garzones pedidos — no la vas a ver activa, es intencional, no un error.)

**Dónde ver esto en la app:** desde `/equipo` (después de iniciar sesión) puedes ver el personal
real y su estado. Desde `/configuracion` puedes ver y agregar zonas, estaciones, mesas (con su
QR y código de presencia reales) y la carta completa, incluido marcar productos agotados o
disponibles otra vez. Es la misma información que se cargó al poblar el piloto — ahora también
se puede ver y ampliar desde la app, no sólo desde la base de datos.

### Soporte — real, dominio nuevo

Desde `/soporte` puedes escribirle un ticket a Tablio (asunto, categoría, mensaje), ver el hilo,
responder y marcar un ticket como resuelto o cerrado. Es un dominio construido desde cero para
esto — no reutiliza nada de las comandas de cocina. **Hay un ticket real que quedó ahí de la
verificación de esta pantalla** ("No puedo revelar el QR de una mesa", ya marcado como
Resuelto) — no se pudo borrar porque el sistema, a propósito, no permite borrar tickets (igual
que con el personal, sólo se pueden cambiar de estado), y no había forma de forzarlo sin usar una
credencial que no estaba a mano en ese momento. Es real pero es residuo de la verificación, no
algo que tengas que revisar.

### Reportes — real, pero en $0 (y eso es correcto)

Desde `/reportes` puedes ver ventas, pedidos, ticket promedio, ventas prepago vs. crédito de
mesa, pérdida por crédito del mes y ventas por hora, para el rango de fechas que elijas (Hoy,
últimos 7 días, últimos 30 días, o fechas a mano). Todo eso viene de la misma función que ya usa
`/dueno-real`. **Vas a ver todo en $0** — la pantalla te lo explica con un aviso: es porque
todavía ningún pedido real se registra en la base (los pedidos siguen haciéndose en el demo
simulado). No es que el reporte esté roto; es que no hay ventas reales que reportar todavía.

## 2. Demo simulado — sin login, datos de ejemplo

Son las pantallas ya migradas visualmente (las 9 originales, incluida la PWA del comensal desde
hoy), pero corriendo sobre datos de ejemplo en memoria, no sobre `Bar La Virgen` ni sobre la base
real. Visualmente son la versión final; los datos que muestran no lo son.

Todas las URLs de abajo se acceden directo, sin credenciales (excepto donde se indica un PIN).

| Pantalla | URL | Acceso |
| --- | --- | --- |
| Panel del dueño | `/dueno` | Directo, sin login |
| Mesas del dueño | `/dueno/mesas` | Directo, sin login |
| Caja | `/caja` | Directo, sin login |
| KDS (cocina/barra) | `/kds` | Directo, sin login |
| Garzón | `/garzon` | PIN de ejemplo: **2468** (Camila) o **1357** (Diego), después elige zona (**Terraza** o **Barra**) |
| Superadmin | `/superadmin` | Directo, sin login |
| Onboarding | `/onboarding` | Directo, sin login |
| Crédito de mesa | `/credito` | Directo, sin login |
| PWA del comensal | `/mesa/demo-mesa-8` | Código de mesa: **4826** |

La página de inicio (`/`) tiene enlaces directos a todas estas.

## Qué falta para que ambas cosas sean una sola

La Tarea 4 (Equipo, Configuración, Soporte, Reportes) y la Tarea 3 (migración visual de la PWA
del comensal) están completas. Las 13 pantallas de producto tienen ya el diseño final. Lo que
sigue, según OI-033 y OI-034 en `docs/OPEN_ISSUES.md`, es puramente de datos: conectar a la base
real las 9 pantallas que siguen sobre *stores* en memoria (Dueño, Mesas, Caja, KDS, Garzón,
Superadmin, Onboarding, Crédito y la PWA) — la más grande de todas es la toma de pedidos y pagos,
que necesita construirse desde cero del lado del servidor (hoy no existe ninguna forma segura
para que el teléfono de un comensal cree un pedido real).
