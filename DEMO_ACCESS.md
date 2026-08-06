# Accesos para demostrar Tablio

**Lee esto primero: el camino del comensal ya es real de punta a punta.** Escaneas una mesa real
de "Bar La Virgen", pides, pagas, y el pedido nace de verdad en la base y llega a una comanda
real (OI-034 Incremento 5, 2026-08-05) — es la primera vez que esto es cierto. La confirmación del
pago **nunca la decide tu teléfono**: llega por un webhook real, firmado, verificado en el
servidor — el mismo camino que usaría una pasarela de verdad. Confirma en un par de segundos
(el simulador avisa al servidor apenas tocas "Pagar", no espera a nada). **El KDS ya es real
también** (2026-08-06) — el pedido que pagaste llega a `/kds-real` de verdad, se puede tomar,
empezar, marcar lista y entregar, y se sincroniza solo. Lo que sigue sin conectar es Dueño,
Mesas, Caja y Garzón (siguen sobre el demo simulado, sección 2).

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
| Qué SÍ puedes hacer ahora | El flujo completo: agregar productos al carrito de verdad, "Preparar pago" (total real y congelado), "Pagar" (pasarela simulada — no hay una real conectada todavía, ver más abajo) y ver la pantalla de "Estamos confirmando tu pago" cambiar sola, sin recargar ni hacer nada, a "Pago confirmado" con tu número de pedido real. El agotado y el stock limitado se validan en el servidor, el precio congelado no se puede alterar después (hay un candado real que lo impide), y la confirmación llega por un webhook firmado — nunca la aprueba tu navegador. |
| Cuánto tarda en confirmar | Un par de segundos — el "proveedor" simulado se avisa apenas se crea el intento de pago, no espera a un trabajo programado. Sigue habiendo un barrido de respaldo cada 1 minuto por si ese aviso inmediato falla, pero en el camino normal no lo notas. |
| Qué NO vas a poder hacer todavía | Ver el pedido avanzar de estado (aceptado → preparando → listo) — eso necesita el KDS real, todavía no conectado (OI-038). Tampoco hay boleta electrónica real todavía; la pantalla de confirmación lo dice ("Comprobante pendiente"). |
| Si dejas pasar el tiempo sin pagar | Tu cotización vence (el mínimo son 5 minutos) — pero tu carrito **vuelve solo, con todo lo que tenías**, no hay que armarlo de nuevo. La pantalla te avisa: "Se venció el tiempo para pagar. Tu pedido sigue acá, revísalo y vuelve a pagar." — y si algo cambió de precio o se agotó mientras tanto, te dice exactamente qué (OI-037, corregido 2026-08-05). |

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

### KDS real — ya completo, no sólo una vista de comprobación (OI-038 cerrado)

| Qué | Valor |
| --- | --- |
| URL | `/kds-real` (local) o `https://tabliocl.vercel.app/kds-real`, después de iniciar sesión |
| Qué vas a ver | Las comandas reales que produce cada pago real, con pestañas por estación (Barra/Cocina), temporizador que cambia de color según cuánto lleva esperando, y botones reales: "Tomar comanda" → "Empezar" → "Marcar lista" → "Entregada". Se sincroniza sola apenas algo cambia (Supabase Realtime), con un respaldo cada 45s por si acaso. |
| Qué todavía no tiene | Reimprimir, marcar un producto agotado desde esta misma pantalla (ya se puede hacer real desde `/configuracion`), y el indicador de presencia/latencia que sí tiene el KDS demo — quedan para después, las RPC reales ya existen. |

### Cómo se ve el pago por dentro (para quien quiera mirar, no hace falta para probar)

El comensal nunca aprueba su propio pago. Cuando toca "Pagar", el servidor sólo crea una
**intención** de pago (una referencia, no una aprobación). Un trabajo separado —hoy hace de
"proveedor simulado", más adelante será la pasarela real— decide el resultado y llama de vuelta
al servidor por un webhook firmado con una clave secreta compartida; el servidor verifica esa
firma antes de confirmar nada. Es el mismo camino que usaría Transbank, Flow o cualquier pasarela
real — cuando se conecte una, sólo cambia quién firma el webhook, no cómo se recibe ni se
verifica.

## 2. Demo simulado — sin login, datos de ejemplo

Son las pantallas ya migradas visualmente (las 9 originales, incluida la PWA del comensal), pero
corriendo sobre datos de ejemplo en memoria, no sobre `Bar La Virgen` ni sobre la base real.
Visualmente son la versión final; los datos y las acciones son simuladas. Sigue siendo la única
forma de ver hoy Dueño, Mesas, Caja y Garzón — el camino del comensal y el KDS ya no la
necesitan (sección 1).

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

El camino del comensal (OI-034, Incrementos 1 a 5) está completo: sesión, carta, carrito, quote
inmutable y pago confirmado server-side, todos reales. El KDS también (2026-08-06, OI-038
cerrado). Lo que sigue, en el orden que pediste: Caja, Garzón, y al final Dueño/Mesas — siguen
sobre *stores* en memoria. Tampoco hay pasarela de pago real conectada (el "proveedor" sigue
siendo simulado) ni boleta electrónica automática — ambos quedan fuera de este tramo.
