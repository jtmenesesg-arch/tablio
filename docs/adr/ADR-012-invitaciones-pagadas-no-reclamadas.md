# ADR-012 — Invitaciones pagadas y no reclamadas

- **Estado:** aceptado e implementado con pasarela simulada.
- **Fecha:** 2026-07-29.

## Contexto

Una persona puede pagar un producto para otra mesa o para otro dispositivo de su mesa. Producir
antes de que alguien lo reclame arriesga una entrega sin receptor; retener indefinidamente el
dinero tampoco es aceptable.

## Decisión

1. Tras confirmación server-side, la invitación queda `pending_claim`: está pagada y mantiene
   la reserva selectiva, pero todavía no crea comanda.
2. El plazo es configurable por tenant entre 45 y 90 minutos; el valor predeterminado es 60.
   Termina antes si cierra la sesión de la mesa destino.
3. Diez minutos antes, por defecto, PWA muestra aviso al invitado y al pagador. No se
   implementan SMS, correo ni otras comunicaciones en este sprint.
4. Reclamar exige un dispositivo distinto al pagador, presente en la sesión de mesa destino.
   En ese instante se consume stock y se crea la comanda pagada para esa mesa.
5. Mientras siga `pending_claim`, el pagador puede cancelar. El reembolso parcial viaja por
   la pasarela con idempotencia, libera stock y deja evidencia durable.
6. Si vence o cierra la mesa, el sistema inicia el mismo reembolso. Un reclamo y una
   cancelación concurrentes bloquean la fila; sólo una transición gana.
7. La pantalla del invitado muestra el alias operativo del pagador, nunca su nombre completo.
8. El tenant configura un máximo de unidades invitadas por sesión de dispositivo (tres por
   defecto en la demo). El servidor suma lo ya invitado y el carrito actual; la interfaz no es
   la barrera de seguridad.

## Alternativas consideradas

- Producir al pagar: rechazada; no hay receptor confirmado.
- Reembolso automático a los 15 minutos: rechazado por ser demasiado agresivo en un bar.
- Esperar hasta el cierre sin cancelación: rechazado; retiene dinero sin necesidad.

## Consecuencias

- El KDS muestra siempre la mesa de entrega, no la mesa que pagó.
- Una invitación no reclamada es visible y cancelable; nunca queda como pedido silencioso.
- La nota de crédito y formato tributario del reembolso real requieren validación en OI-024.
