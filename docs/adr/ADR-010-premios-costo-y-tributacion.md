# ADR-010 — Premio a precio cero, costo opcional y tratamiento tributario pendiente

- **Estado:** aceptado técnicamente; matriz tributaria propuesta, no verificada.
- **Fecha:** 2026-07-29.

## Decisión

El premio se agrega sólo en servidor como un ítem inmutable de `CheckoutQuote` con:

- precio, descuento, impuesto y total de línea en cero;
- `is_loyalty_reward = true`;
- redención e idempotency key;
- precio de lista congelado como valor de referencia;
- costo unitario congelado sólo cuando el dueño lo informó.

`products.unit_cost_clp` es opcional. Si es nulo, los reportes muestran únicamente valor de
referencia y dicen “sin costo informado”; no calculan margen ni llaman costo al precio.

La redención reserva el premio una vez, respeta stock y caduca con el quote. Pago confirmado,
pedido, ítem, comanda y ledger consumen los sellos de forma idempotente. El KDS muestra
`PREMIO · $0`. Un reembolso total restaura el premio; uno parcial sólo revierte la visita si
el neto deja de cumplir la compra mínima.

## Conciliación

El cierre separa ingreso real `$0`, valor de lista congelado y costo conocido (o
`sin costo informado`). Nunca descuenta el valor de lista de la venta ni inventa margen.

## Hipótesis tributaria no verificada

La representación correcta de una bonificación gratuita en boleta/DTE, su base imponible y la
nota de crédito asociada deben ser aprobadas por asesor tributario chileno y proveedor DTE.
Hasta entonces el simulador conserva la línea y la marca, pero no afirma que el formato sea
válido para operar con dinero real. Es bloqueante antes del piloto.
