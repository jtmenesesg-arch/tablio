# ADR-002 — Reserva selectiva de stock al crear el quote

- **Estado:** APROBADO
- **Fecha:** 2026-07-28
- **Sprint:** 2
- **Aprobación:** usuario/product owner

## Contexto

En un bar lleno no es aceptable cobrar un producto que ya no existe. Reservar todo el menú
tampoco es correcto: cerveza de barril y muchos tragos no se administran unidad por unidad,
mientras que botellas específicas, platos del día y productos limitados sí.

El punto irreversible es el pago. La disponibilidad debe resolverse antes de crear el intento,
sin mantener stock bloqueado indefinidamente por checkouts abandonados.

## Decisión

1. `products.track_stock` es configurable por producto y vale `false` por defecto.
2. Al crear un `CheckoutQuote`, una única transacción bloquea los `inventory_levels` afectados
   en orden de `product_id`, verifica disponibilidad y reserva sólo los ítems cuyo snapshot
   tiene `stock_tracked = true`.
3. La reserva no tiene TTL propio. Está activa exactamente mientras
   `checkout_quotes.expires_at` no haya vencido. La tabla `inventory_reservations` no contiene
   una segunda columna de expiración.
4. El TTL inicial del quote es **10 minutos**. Cada tenant puede configurarlo entre 5 y 20
   minutos mediante `tenant_checkout_settings.quote_ttl_seconds`.
5. Rechazo, cancelación o abandono explícito liberan la reserva inmediatamente. El barrido de
   vencidos sólo cubre abandono silencioso.
6. Una aprobación recibida después de `expires_at` no crea pedido ni comandas. Registra una
   `ReconciliationException` crítica, visible inmediatamente en la cola del cajero, con el
   texto **“requiere decisión: reembolsar o producir manualmente”** y ambas opciones.

## Justificación del TTL

Apple Pay suele terminar en segundos, pero una persona que debe escribir tarjeta, corregir un
dato o esperar conectividad necesita varios minutos. Diez minutos cubre ese pagador lento sin
retener durante demasiado tiempo una última botella por un carrito abandonado. El rango
5–20 permite ajustar la operación con evidencia sin cambiar código.

## Concurrencia

Todos los caminos de reserva, liberación y consumo bloquean inventario en el mismo orden. La
primera transacción que reserva la última unidad incrementa `reserved_quantity`; la segunda
ve disponibilidad cero y falla antes de crear un quote cobrable. Pedido, consumo de reserva,
comandas y outbox se confirman juntos.

## Alternativas descartadas

- **Descontar al confirmar el pago:** puede cobrar algo agotado durante el checkout.
- **Reservar al agregar al carrito:** bloquea stock demasiado pronto y favorece carritos
  abandonados.
- **Reservar todos los productos:** agrega contención sin representar la operación real.
- **TTL separado para reserva:** crea dos relojes y estados imposibles de razonar.
- **Producir automáticamente un pago tardío:** el stock ya pudo venderse a otra persona.

## Consecuencias

- El catálogo debe explicar claramente qué productos controlan unidades.
- Cambiar `track_stock` afecta quotes nuevos; cada quote conserva su snapshot.
- La excepción tardía es un incidente operativo inmediato, no sólo un dato de cierre.
- Producir manualmente o reembolsar será una acción auditada del cajero en un incremento
  posterior; Sprint 2 entrega la excepción y la cola visible.

## Evidencia

`supabase/tests/database/002_financial_core.test.sql` verifica reserva selectiva, reloj único,
liberación inmediata, aprobación tardía, última unidad concurrente y atomicidad. La ejecución
remota del Sprint 2 terminó `1..33`, sin fallas.
