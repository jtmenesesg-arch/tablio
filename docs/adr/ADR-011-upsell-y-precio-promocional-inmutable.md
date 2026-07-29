# ADR-011 — Upsell determinista y precio promocional inmutable

- **Estado:** aceptado e implementado con pagos simulados.
- **Fecha:** 2026-07-29.

## Contexto

Tablio puede sugerir una compra adicional y activar happy hour, pero ninguna de esas funciones
puede cobrar sin una acción explícita ni reescribir un `CheckoutQuote` en curso. Caja, DTE y
conciliación deben explicar el precio exacto que originó el pago.

## Decisión

1. Las cuatro capacidades de Sprint 12 nacen desactivadas por tenant.
2. El upsell permite reglas explícitas por producto, categoría, horario, margen conocido o
   lista manual. Se ordenan por prioridad e identificador; nunca se genera contenido.
3. Una regla de margen sólo participa cuando el dueño informó `unit_cost_clp`. Costo
   desconocido nunca se estima.
4. Se filtran productos agotados, ya presentes y reglas deshabilitadas. Se muestran como
   máximo dos sugerencias en un bloque descartable, sin modal, preselección ni paso obligatorio.
5. Exposición, aceptación, descarte, quote y pago son eventos distintos. Sólo el ítem aceptado
   y pagado suma ingreso incremental.
6. Cada activación de promoción crea una versión inmutable. Al crear el quote, el servidor
   congela versión, precio de lista y descuento por línea. Realtime actualiza carta/carrito,
   nunca un quote existente.
7. Al expirar el quote, el siguiente usa las promociones vigentes en ese nuevo instante.

## Alternativas consideradas

- Recalcular el quote al iniciar el pago: rechazada; cambiaría el precio que la persona aceptó.
- Sugerencias generadas: rechazadas; no son explicables ni auditables.
- Ordenar sólo por margen: rechazado; penaliza productos sin costo informado y puede molestar.

## Consecuencias

- Cierre y panel del dueño separan venta bruta, descuento promocional e ingreso de upsell.
- El DTE simulado usa el precio final congelado y conserva la etiqueta promocional.
- La representación tributaria real de descuentos, 2x1 e invitaciones sigue bajo OI-024.
