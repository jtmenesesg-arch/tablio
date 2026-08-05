# Accesos para demostrar Tablio

**Lee esto primero: hoy siguen existiendo DOS cosas separadas, no una.** No están conectadas
entre sí todavía. Lo que cambió desde la última vez: la **PWA del comensal ya llega a un total
real y congelado** (OI-034 Incremento 4) — puedes armar un carrito real, tocar "Preparar pago" y
ver el checkout con el subtotal, impuesto, propina y total ya calculados y guardados en la base,
igual que se vería el día del pago real. Lo que **todavía no existe** es confirmar ese pago: la
pantalla lo dice explícitamente ("Pago todavía no disponible") en vez de ofrecer un botón que no
hace nada real. Sin pago no hay pedido, así que nada de esto llega al KDS todavía — eso sigue
siendo sólo el demo simulado (sección 2). El resto de las pantallas (Dueño, Mesas, Caja, KDS,
Garzón, Superadmin, Onboarding, Crédito) siguen sin conectar — ver OI-033.

Ver `docs/BUILD_LOG.md` (entradas de OI-034) para el detalle técnico de qué se conectó y cómo se
verificó cada incremento.

## URL pública — para abrir desde el celular sin levantar nada

**`https://tabliocl.vercel.app`**. Es el mismo código, desplegado a producción (`vercel deploy
--prod`, no es automático al hacer push — hay que acordarse de desplegar). Todos los accesos de
este documento funcionan ahí igual que en local; donde cambia algo se indica.

## 1. Piloto real — "Bar La Virgen"

### Cómo entrar (panel del dueño)

| Qué | Valor |
| --- | --- |
| URL | `/login` (local) o `https://tabliocl.vercel.app/login` |
| Correo | `jtmenesesg@gmail.com` |
| Contraseña | `So7nTcLhI8445RKq` (temporal — no hay pantalla para cambiarla todavía, ver OI-032) |
| Qué pasa al entrar | Te lleva a `/dueno-real`, un panel mínimo que sólo demuestra que el login funciona. Va a mostrar $0 en ventas — eso es correcto, porque todavía no hay pedidos ni pagos reales (sección "Qué falta" más abajo) |

**Importante sobre el menú lateral de esa pantalla:** los botones "Resumen", "Mesas" y "Caja" del
menú lateral hoy **todavía apuntan al demo simulado antiguo** (no a los datos reales de Bar La
Virgen) — es un cabo suelto conocido, no algo que rompiste tú (ver OI-032). "Equipo",
"Configurar", "Reportes" y "Soporte" sí llevan a pantallas reales.

### Cómo entrar (PWA del comensal, carta real)

| Qué | Valor |
| --- | --- |
| URL | `/mesa/e6Q9x3aDlJMqQBGwpgg6teAZVn7e7sn826lBrX8ItLc` (local) o el mismo path en `https://tabliocl.vercel.app` |
| Código de presencia | **8447** (Mesa 1, Terraza) |
| Qué vas a ver | La carta real de Bar La Virgen — 20 productos, 6 categorías, con el Negroni marcado "Agotado" (sin botón de agregar) y Corona/Heineken con stock limitado mostrados normales. Es la misma pantalla, mismo diseño, que la del demo — la diferencia es que esto lee la base real. |
| Qué SÍ puedes hacer ahora | Agregar productos al carrito de verdad (persiste al recargar, cada persona tiene el suyo) y tocar "Preparar pago": la pantalla de checkout muestra el total real, ya congelado en la base — cambiar el precio de un producto o marcarlo agotado después de este paso no altera ese total, y nadie puede modificarlo directo en la base (hay un candado que lo impide). El agotado y el stock limitado se validan en el servidor, no sólo en el botón. |
| Qué NO vas a poder hacer todavía | Confirmar el pago — la pantalla de checkout lo dice explícitamente ("Pago todavía no disponible") en vez de fingir que funciona (OI-034 Incremento 5, en curso). Sin pago no hay pedido, así que tampoco hay nada que ver en el KDS todavía. **Ojo con esto:** si dejas pasar el tiempo (el mínimo son 5 minutos) sin pagar, tu cotización vence y hoy tu carrito de esa sesión queda bloqueado — no vas a poder agregar nada más ahí, ni la pantalla te avisa por qué (registrado como OI-037, pendiente de una decisión antes de que el pago sea autoservicio real). Para seguir probando, escanea de nuevo en una pestaña nueva o borra las cookies del sitio. |

Sin login: cualquiera con este QR/código entra como comensal anónimo, igual que pasará en el
piloto real. No hace falta la cuenta del dueño para probar esta parte.

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
ingresa para confirmar que está físicamente ahí). Todas están listas para el mismo uso que la
Mesa 1 de arriba — Mesa 1 es sólo la que queda documentada como muestra.

**Carta (6 categorías, 20 productos):** Cervezas, Cócteles, Vinos, Para picar, Sándwiches, Sin
alcohol — con precios reales de mercado chileno, descripciones y alérgenos. Dos productos con
stock limitado (Cerveza Corona, 24 unidades; Cerveza Heineken, 4 unidades) y uno marcado agotado
a propósito (Negroni). **Verificado con navegador real (Playwright) contra la PWA real:** el
Negroni aparece atenuado, con la etiqueta "Agotado", sin botón de agregar, y el click no abre su
detalle; Corona y Heineken aparecen normales y se pueden agregar al detalle.

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
disponibles otra vez.

### Soporte — real, dominio nuevo

Desde `/soporte` puedes escribirle un ticket a Tablio (asunto, categoría, mensaje), ver el hilo,
responder y marcar un ticket como resuelto o cerrado. Es un dominio construido desde cero para
esto — no reutiliza nada de las comandas de cocina. **Hay un ticket real que quedó ahí de la
verificación de esta pantalla** ("No puedo revelar el QR de una mesa", ya marcado como
Resuelto) — no se pudo borrar porque el sistema, a propósito, no permite borrar tickets (igual
que con el personal, sólo se pueden cambiar de estado). Es real pero es residuo de la
verificación, no algo que tengas que revisar.

### Reportes — real, pero en $0 (y eso es correcto)

Desde `/reportes` puedes ver ventas, pedidos, ticket promedio, ventas prepago vs. crédito de
mesa, pérdida por crédito del mes y ventas por hora, para el rango de fechas que elijas (Hoy,
últimos 7 días, últimos 30 días, o fechas a mano). Todo eso viene de la misma función que ya usa
`/dueno-real`. **Vas a ver todo en $0** — la pantalla te lo explica con un aviso: es porque
todavía ningún pedido real se registra en la base (los pedidos siguen haciéndose en el demo
simulado). No es que el reporte esté roto; es que no hay ventas reales que reportar todavía.

## 2. Demo simulado — sin login, datos de ejemplo

Son las pantallas ya migradas visualmente (las 9 originales, incluida la PWA del comensal), pero
corriendo sobre datos de ejemplo en memoria, no sobre `Bar La Virgen` ni sobre la base real.
Visualmente son la versión final; los datos y las acciones (agregar al carrito, pagar, comandar)
son simuladas. Esta es la parte del producto que sí deja completar el flujo de punta a punta hoy
— pedido, pago, KDS — aunque no toque la base de datos.

Todas las URLs de abajo se acceden directo, sin credenciales (excepto donde se indica un PIN).
Funcionan igual en local y en `https://tabliocl.vercel.app`.

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
| PWA del comensal (demo) | `/mesa/demo-mesa-8` | Código de mesa: **4826** |

La página de inicio (`/`) tiene enlaces directos a todas estas.

## Qué falta para que ambas cosas sean una sola

Lo que sigue, según OI-033 y OI-034 en `docs/OPEN_ISSUES.md`, es terminar de conectar la toma de
pedidos y pagos real — Incremento 2 conectó la carta de sólo lectura, Incremento 3 el carrito,
Incremento 4 el total congelado; falta el pago confirmado server-side con una vista mínima y
provisional de KDS (Incremento 5), con el mismo estándar de verificación contra la base real que
ya se usó en los anteriores. Después de eso queda el resto de pantallas que siguen sobre *stores*
en memoria (Dueño, Mesas, Caja, KDS completo, Garzón, Superadmin, Onboarding, Crédito).
