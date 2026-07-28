# ADR-003 — Estado, sesión y Realtime de la PWA del comensal

- **Estado:** ACEPTADO
- **Fecha:** 2026-07-28
- **Alcance:** Sprint 3

## Contexto

La PWA debe recuperar mesa, carrito, pago y pedido después de una recarga o cambio de red, sin
convertir el teléfono en fuente de verdad. El comensal no crea una cuenta: valida un QR y un
código corto de presencia. A la vez, la disponibilidad y las comandas deben sentirse vivas en
un teléfono de gama baja.

El frontend no puede recibir una capacidad para aprobar pagos, alterar precios ni consultar
tablas completas con una credencial privilegiada.

## Decisión

### 1. Sesión de dispositivo

Después de validar QR y código, el servidor crea una `diner_device_session` y entrega un token
opaco en cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción. En PostgreSQL sólo se
guarda su hash.

- Expira tras **4 horas de inactividad**.
- Tiene un máximo absoluto de **12 horas**.
- Nunca sobrevive al cierre o expiración de la sesión de mesa.
- Cada request válida renueva sólo el vencimiento por inactividad, sin mover el máximo.
- Si vence, el teléfono vuelve a validar el código; no recupera una sesión ajena por conocer
  un alias.

### 2. Estado del cliente

PostgreSQL manda. El cliente conserva únicamente navegación, formulario y selección visual
efímera. Mesa, carrito, quote, intento, pedido, comandas, acciones y disponibilidad vuelven a
consultarse al servidor en arranque, recarga, `online`, retorno de segundo plano y reconexión.

El service worker cachea tipografías e iconos del shell. Nunca cachea `/api`, páginas de mesa,
checkout, pago, quote ni pedido.

### 3. Realtime

En producción se usarán canales privados de Supabase Realtime Broadcast con topics
`tenant:<tenant_id>:table-session:<id>`. La autorización se deriva de la sesión de dispositivo
validada y no de datos enviados libremente por el navegador. El mensaje es una invalidación:
el cliente vuelve a consultar el estado; no acepta el payload como verdad.

Supabase documenta Broadcast como la opción recomendada para escalabilidad y seguridad; los
Postgres Changes directos autorizan cada cambio por suscriptor y pueden crear un cuello de
botella. Fuentes actuales:

- <https://supabase.com/docs/guides/realtime/subscribing-to-database-changes>
- <https://supabase.com/docs/guides/realtime/authorization>
- <https://supabase.com/docs/guides/realtime/benchmarks>

La demo de Sprint 3 no usa credenciales ni datos remotos: simula el aviso con recuperación
periódica (0,8 s durante confirmación/estado y 2,5 s para carta). Es además el fallback ante
reconexión. La instrumentación del p95 y la prueba de carga del canal privado quedan antes del
piloto.

### 4. Pago

La interfaz sólo envía `payment.start` con un `quote_id` e idempotencia. El adaptador simulado
server-side crea el intento, firma el webhook, consulta el estado y genera el pedido. Una
acción inventada como `payment.confirm` se rechaza. La pantalla sólo muestra el estado que
regresa de la lectura posterior.

### 5. “Pagar con el garzón”

Es una notificación independiente en `diner_waiter_payment_requests`. No posee `order_id` ni
`ticket_id`, no cambia el carrito a convertido y no llama la transacción de confirmación. La
pantalla dice explícitamente que está pendiente de pago y que nada fue enviado a la barra.

## Alternativas descartadas

### Guardar el pedido completo en `localStorage`

Rechazada: permitiría manipular precios, perder estado entre dispositivos y confundir datos
locales con confirmación financiera.

### Exponer tablas directamente a `anon`

Rechazada: ampliaría demasiado el acceso y expondría hashes de sesión. `anon` no tiene grants
directos sobre sesiones, quotes, pagos, pedidos ni comandas.

### Usar Postgres Changes directos como canal principal

Rechazada para producción por la autorización por suscriptor y su escalamiento. Broadcast
privado conserva el aviso rápido; la consulta posterior conserva la verdad durable.

## Consecuencias

- Una recarga no duplica intentos y recupera el estado del servidor.
- Dos cookies de dispositivo producen dos carritos distintos dentro de la misma mesa.
- La PWA sigue útil si pierde un aviso Realtime.
- Se necesita emitir/renovar autorización de canal desde la sesión opaca antes del piloto.
- El p95 visible se debe medir end-to-end; la demo no lo declara verificado.
